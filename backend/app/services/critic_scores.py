"""Reject explicitly speculative critic attributions without rewriting legacy data."""

import re
import unicodedata
from collections.abc import Sequence


def normalized_evidence(text: str) -> str:
    plain = "".join(
        c for c in unicodedata.normalize("NFKD", text.casefold()) if not unicodedata.combining(c)
    )
    return " ".join(re.findall(r"\w+", plain))


def score_matches_page(score: dict, text: str, *, name: str, producer: str, vintage: str) -> bool:
    quote = normalized_evidence(str(score.get("evidence_quote") or ""))
    if not quote or len(quote) > 1000 or quote not in normalized_evidence(text):
        return False
    for identity in (name, producer, vintage, str(score.get("critic") or "")):
        normalized = normalized_evidence(identity)
        if not normalized or not re.search(r"\b" + re.escape(normalized) + r"\b", quote):
            return False
    value = re.match(
        r"\s*(\d+(?:[.,]\d+)?(?:\s*[-–]\s*\d+(?:[.,]\d+)?)?)", str(score.get("score") or "")
    )
    return bool(
        value and re.search(r"\b" + re.escape(normalized_evidence(value[1])) + r"\b", quote)
    )


def score_has_weak_evidence(score: dict) -> bool:
    note = f"{score.get('note') or ''} {score.get('evidence_quote') or ''}".casefold()
    value = str(score.get("score") or "").casefold().strip()
    return (
        not re.search(r"\d", value)
        or bool(re.match(r"n\s*[/\.\-]?\s*d\b", value))
        or score.get("verification_status") == "unverified"
        or any(
            phrase in note
            for phrase in (
                "stima prudente",
                "ipotesi",
                "possibile fascia",
                "non ho riscontro",
                "non trovo conferma",
                "evidenza debole",
                "senza riscontro",
                "potrebbe rientrare",
                "hypothetical",
                "speculative",
                "weak evidence",
                "no direct evidence",
                "no specific confirmation",
                "estimated score",
                "range ipotetico",
                "stima molto incerta",
                "non ho una pubblicazione",
                "non ho evidenza",
                "non ho riscontrato",
                "non risultano dati certi",
                "evidenza diretta debole",
                "scarsa evidenza",
                "da verificare",
                "non legata a una scheda verificata",
                "range plausibile",
                "probabile pubblicazione futura",
                "unconfirmed",
                "to be verified",
                "not rated",
                "not reviewed",
                "no rating",
                "non recensito",
                "non valutato",
            )
        )
    )


def scores_for_display(scores: list[dict]) -> list[dict]:
    return [
        {**score, "verification_status": "unverified"}
        if score_has_weak_evidence(score)
        else dict(score)
        for score in scores
    ]


def supported_ai_scores(scores: list, sources: Sequence[dict]) -> list[dict]:
    urls = {str(source.get("url") or "").strip().rstrip("/") for source in sources}
    result = []
    for score in scores:
        if not isinstance(score, dict) or score_has_weak_evidence(score):
            continue
        numeric = re.fullmatch(
            r"\s*(\d+(?:[.,]\d+)?)(?:\s*[-–]\s*(\d+(?:[.,]\d+)?))?\s*(?:/\s*(20|100))?\s*(?:points?|punti|pt)?\s*",
            str(score.get("score") or ""),
            re.IGNORECASE,
        )
        if not numeric:
            continue
        low = float(numeric[1].replace(",", "."))
        high = float((numeric[2] or numeric[1]).replace(",", "."))
        if not 0 < low <= high <= int(numeric[3] or "100"):
            continue
        url = str(score.get("source_url") or "").strip()
        if (
            score.get("exact_wine_and_vintage") is not True
            or not url.startswith(("https://", "http://"))
            or url.rstrip("/") not in urls
        ):
            continue
        if not str(score.get("critic") or "").strip() or not str(score.get("score") or "").strip():
            continue
        result.append(
            {
                "critic": str(score["critic"])[:120],
                "score": str(score["score"])[:40],
                "note": str(score.get("note") or "")[:800],
                "source_url": url,
                "evidence_quote": str(score.get("evidence_quote") or "")[:1000],
            }
        )
    return result[:8]
