"""Recover qualitative evidence from an already-paid response; never call OpenAI or write DB.

From backend: python -m scripts.review_sensory_log LOG.txt --output data/review.html
Public source documents are fetched once per URL. JSON output accompanies the HTML.
"""

import argparse
import json
import re
from datetime import UTC, datetime
from html import escape
from pathlib import Path
from uuid import uuid4

from pydantic import ValidationError

from app.schemas.sensory_agent import SensoryResearchResult
from app.schemas.sensory_refinement import SensoryRefinementOutput
from app.services.score_sources import read_public_document
from app.services.sensory_agent import public_source_url
from app.services.sensory_completion import SensoryEvidenceVerifier, exact_evidence
from app.services.sensory_documents import prefetch_source_documents
from app.services.sensory_relevance import describes_trait

LABELS = {
    "body": "Corpo",
    "acidity": "Acidità",
    "tannin": "Tannini",
    "sweetness": "Dolcezza",
    "aromatic_intensity": "Intensità aromatica",
    "fruit": "Frutto",
    "wood": "Legno",
    "spice": "Spezie",
    "minerality": "Mineralità",
}


def parse_log(text: str) -> SensoryRefinementOutput:
    if len(text) > 1_000_000:
        raise ValueError("Log troppo grande")
    decoder = json.JSONDecoder()
    starts = [0, *[match.start() for match in re.finditer(r'\{\s*"name"\s*:', text)][:20]]
    for start in starts:
        try:
            data, _ = decoder.raw_decode(text[start:].lstrip())
            return SensoryRefinementOutput.model_validate(data)
        except (ValueError, ValidationError):
            continue
    raise ValueError("Nessuna risposta sensoriale valida trovata nel log")


def review(output: SensoryRefinementOutput, *, reader=read_public_document) -> dict:
    proofs = [output.identity_evidence]
    for _, trait in output.dimensions:
        if trait:
            proofs.extend(trait.evidence)
    sources = {url: {} for proof in proofs if (url := public_source_url(proof.source_url))}
    cache = {}
    prefetch_source_documents(output.model_dump(), sources, cache, reader)
    result = SensoryResearchResult(
        wine_id=uuid4(),
        name=output.name,
        producer=output.producer,
        vintage=output.vintage,
        status="incomplete",
        prompt_version="12",
    )
    verifier = SensoryEvidenceVerifier(sources, result, document_cache=cache)
    identity_verified = exact_evidence(
        output.identity_evidence, output.vintage
    ) and verifier.verified(output.identity_evidence)
    traits = {}
    for key, trait in output.dimensions:
        observations = []
        for proof in trait.evidence if trait else []:
            verified = verifier.verified(proof) and exact_evidence(proof, output.vintage)
            relevant = describes_trait(key, proof.excerpt)
            status = "verified" if identity_verified and verified and relevant else "unverified"
            if verified and not relevant:
                status = "not_relevant"
            observations.append(
                {
                    "status": status,
                    "excerpt": proof.excerpt,
                    "url": public_source_url(proof.source_url),
                    "publisher": proof.publisher,
                }
            )
        traits[key] = observations
    # Keep observations independently; never reuse the model's number or rationale
    # when one of its premises is unavailable. This is not a numeric proposal.
    return {
        "name": output.name,
        "producer": output.producer,
        "vintage": output.vintage,
        "checked_at": datetime.now(UTC).isoformat(),
        "identity_verified": identity_verified,
        "scope": "qualitative_only",
        "traits": traits,
        "sources": {
            url: {"status": doc.status, "http_status": doc.http_status}
            for url, doc in cache.items()
        },
    }


def render_html(report: dict) -> str:
    title = escape(f"{report['producer']} · {report['name']} · {report['vintage']}")
    rows = []
    for key, observations in report["traits"].items():
        fragments = []
        for item in observations:
            status = {
                "verified": "Citazione verificata",
                "unverified": "Non verificata",
                "not_relevant": "Non pertinente alla caratteristica",
            }[item["status"]]
            link = (
                f'<a href="{escape(item["url"], quote=True)}" rel="noopener noreferrer">'
                f"{escape(item['publisher'])}</a>"
                if item["url"]
                else "URL non utilizzabile"
            )
            fragments.append(
                f"<p><strong>{status}</strong></p><blockquote>{escape(item['excerpt'])}</blockquote>{link}"
            )
        content = "".join(fragments) or "Nessuna citazione nel risultato fornito."
        rows.append(f"<section><h2>{LABELS[key]}</h2>{content}</section>")
    sources = "".join(
        f"<li>{escape(url)}: {escape(item['status'])} (HTTP {item['http_status']})</li>"
        for url, item in report["sources"].items()
    )
    return f"""<!doctype html><html lang="it"><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Recupero evidenze — {title}</title><style>
body{{font:16px/1.55 system-ui;max-width:850px;margin:32px auto;padding:0 20px;
color:#163c32;background:#fafbf8}}
section{{padding:12px 20px;margin:14px 0;border:1px solid #a5b9ae;
border-radius:12px;background:white}}
h2{{font-size:1.15rem}}a,li{{overflow-wrap:anywhere}}
blockquote{{margin:10px 0;padding-left:15px;border-left:3px solid #a5b9ae}}
</style><h1>{title}</h1><p>Recupero delle descrizioni dal log già pagato.
Nessuna chiamata OpenAI e nessuna modifica al profilo del vino.</p>
<p>Identità e annata verificate: {"sì" if report["identity_verified"] else "no"}.
La verifica riguarda il testo e la sua attribuzione, non l'intensità numerica
o l'accuratezza della degustazione.</p>
<p>Le fonti sono state rilette il {escape(report["checked_at"])}.
I loro stati possono differire da quelli osservati dal server durante la ricerca originale.
Gli URL provengono dal log; questo rapporto non ricostruisce i metadati interni del fornitore.</p>
{"".join(rows)}<h2>Esito delle fonti</h2><ul>{sources}</ul></html>"""


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("log", type=Path)
    parser.add_argument("--output", required=True, type=Path)
    args = parser.parse_args()
    try:
        output = parse_log(args.log.read_text(encoding="utf-8-sig"))
    except ValueError:
        parser.error("Il file non contiene una risposta sensoriale riconosciuta")
    report = review(output)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(render_html(report), encoding="utf-8")
    args.output.with_suffix(".json").write_text(
        json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    print(
        json.dumps(
            {
                "verified_traits": [
                    key
                    for key, items in report["traits"].items()
                    if any(item["status"] == "verified" for item in items)
                ],
                "report": str(args.output),
            },
            ensure_ascii=True,
        )
    )


if __name__ == "__main__":
    main()
