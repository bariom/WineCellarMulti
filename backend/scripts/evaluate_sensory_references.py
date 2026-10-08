"""Offline comparison of type fallback and documentary review; never uses live DB/AI.

Run from backend: python -m scripts.evaluate_sensory_references --output data/reference-report
"""

import argparse
import hashlib
import html
import json
from collections import Counter
from pathlib import Path
from types import SimpleNamespace

from sqlalchemy import create_engine, select
from sqlalchemy.orm import Session

from app.db.base import Base
from app.models import SharedWineIdentity, WineSensoryProfile
from app.services.sensory_references import BUNDLE, import_references, preview_references
from app.services.sensory_review_workflow import POLICY, proposal
from app.services.taste_profiles import infer_sensory_profile

TYPES = {
    "ridge-monte-bello-2022": "Red",
    "zind-roche-calcaire-2022": "White",
    "esporao-reserva-red-2022": "Red",
    "cloudy-bay-sauvignon-2024": "White",
    "klein-vin-de-constance-2020": "Sweet",
    "bibi-graetz-testamatta-2018": "Red",
    "loimer-gruner-veltliner-2024": "White",
    "bollinger-grande-annee-2015": "Sparkling",
    "ott-chateau-selle-rose-2023": "Rose",
    "disznoko-aszu-five-2017": "Sweet",
    "ridge-estate-chardonnay-2022": "White",
    "catena-malbec-2022": "Red",
    "musar-rose-2017": "Rose",
    "roederer-cristal-2016": "Sparkling",
    "sigalas-santorini-2022": "White",
}
LIMITATION = (
    "Confronto controllato con il fallback per tipologia, senza baseline di vitigno, "
    "denominazione o regione e senza profili del server. Le correzioni sono editoriali, "
    "non miglioramenti di accuratezza dimostrati. Nessun panel con intensità comparabili: "
    "accuratezza non misurabile. Collegare una descrizione non valida il numero conservato."
)


def evaluate():
    engine = create_engine("sqlite://")
    try:
        Base.metadata.create_all(engine)
        with Session(engine) as db:
            preview = preview_references(db)
            ids = {r.dossier.id for r in preview.rows}
            if ids != set(TYPES):
                raise ValueError("Aggiornare le tipologie del campione di valutazione")
            import_references(db, preview.revision, sorted(ids), "offline-evaluation")
            rows = []
            for row in preview.rows:
                dossier = row.dossier
                identity = db.scalar(
                    select(SharedWineIdentity).where(
                        SharedWineIdentity.name == dossier.name,
                        SharedWineIdentity.producer == dossier.producer,
                        SharedWineIdentity.vintage == dossier.vintage,
                    )
                )
                wine = SimpleNamespace(type=TYPES[dossier.id], grapes=[], appellation="", region="")
                dimensions, source, confidence = infer_sensory_profile(db, wine)
                db.add(
                    WineSensoryProfile(
                        identity_id=identity.id,
                        dimensions=dimensions,
                        source=source,
                        confidence=confidence,
                        validated=False,
                    )
                )
                db.flush()
                review = proposal(db, identity.id)
                rows.append(
                    {
                        "id": dossier.id,
                        "wine": f"{dossier.producer} · {dossier.name} · {dossier.vintage}",
                        "country": dossier.country,
                        "type": TYPES[dossier.id],
                        "reference_kind": "documentary_only",
                        "calibration_eligible": False,
                        "source_url": str(dossier.source_url),
                        "traits": [
                            {
                                "dimension": c.trait.dimension,
                                "before": c.trait.current_value,
                                "proposed": c.proposed_value,
                                "action": c.action,
                                "evidence_status": c.trait.status,
                                "advice": c.advice,
                            }
                            for c in review.choices
                        ],
                    }
                )
            actions = Counter(t["action"] for r in rows for t in r["traits"])
            evidence = Counter(t["evidence_status"] for r in rows for t in r["traits"])
            return {
                "policy": POLICY,
                "bundle_sha256": hashlib.sha256(BUNDLE.read_bytes()).hexdigest(),
                "baseline": "type_fallback_only",
                "limitation": LIMITATION,
                "summary": {
                    "wines": len(rows),
                    "countries": len({r["country"] for r in rows}),
                    "styles": len({r["type"] for r in rows}),
                    "traits": sum(actions.values()),
                    "actions": dict(actions),
                    "evidence": dict(evidence),
                    "calibration_references": 0,
                    "accuracy": None,
                },
                "rows": rows,
            }
    finally:
        engine.dispose()


def render(report):
    escape = html.escape
    sections = []
    for row in report["rows"]:
        cells = "".join(
            "<tr>"
            + "".join(
                f"<td>{escape(str(t[k]))}</td>"
                for k in ("dimension", "before", "proposed", "action", "evidence_status")
            )
            + "</tr>"
            for t in row["traits"]
        )
        sections.append(
            f"<h2>{escape(row['wine'])}</h2>"
            f'<p><a href="{escape(row["source_url"], quote=True)}">Fonte documentale</a></p>'
            f"<table><tr><th>Tratto</th><th>Fallback</th><th>Proposta</th><th>Azione</th><th>Prova</th></tr>{cells}</table>"
        )
    return (
        '<!doctype html><html lang="it"><meta charset="utf-8">'
        '<meta name="viewport" content="width=device-width,initial-scale=1">'
        "<title>Confronto dei riferimenti sensoriali</title>"
        "<style>body{font:16px system-ui;max-width:950px;margin:auto;padding:20px}"
        "table{border-collapse:collapse;width:100%;font-size:14px}"
        "td,th{border:1px solid #aaa;padding:6px;text-align:left}"
        "th{background:#eee}td{overflow-wrap:anywhere}h2{margin-top:40px}</style>"
        "<h1>Confronto documentale dei profili</h1>"
        f"<p>{escape(report['limitation'])}</p>"
        "<p>retain = conserva e collega la descrizione; adjust = proposta editoriale; "
        "blocked = nessuna applicazione. None = nessuna proposta.</p>"
        f"<pre>{escape(json.dumps(report['summary'], ensure_ascii=False, indent=2))}</pre>"
        + "".join(sections)
        + "</html>"
    )


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, default=Path("data/reference-report"))
    args = parser.parse_args()
    report = evaluate()
    args.output.mkdir(parents=True, exist_ok=True)
    (args.output / "report.json").write_text(
        json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    (args.output / "report.html").write_text(render(report), encoding="utf-8")
    print(json.dumps(report["summary"], ensure_ascii=False))


if __name__ == "__main__":
    main()
