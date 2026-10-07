"""Bound a verbatim quotation to an identified wine section, not just a page."""

import re

from app.schemas.sensory_agent import SourceEvidence
from app.services.shared_wine_data import normalize_identity_part as norm

_EDITION = re.compile(
    r"\b(?:ed(?:ition|izione)?\.?\s*(\d{2,3})|(\d{2,3})\s*(?:eme|e|th)?\s*edition)\b"
)
_NOISE = {"di", "de", "del", "della", "du", "la", "le", "il", "the", "ed", "edition", "eme"}
_YEAR = r"(?:19|20)\d{2}"
_MONTH = (
    r"(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|"
    r"aug(?:ust)?|sep(?:tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)"
)
_DRINKING_DATE = re.compile(
    rf"\bdrink(?:ing window| from| between)?\s+{_YEAR}(?:\s+(?:to\s+|until\s+)?{_YEAR})?\b"
)
_REVIEW_DATE = re.compile(
    rf"\b(?:com|org|net|reviewed|published|review date)\s+{_MONTH}\s+(?:\d{{1,2}}\s+)?{_YEAR}\b"
)
_MATURITY_DATE = re.compile(
    rf"\bmaturity(?:\s+(?:ready|youthful|mature|not)){{0,3}}\s+{_YEAR}(?:\s+{_YEAR})?\b"
)
_DRINKING_ADVICE = re.compile(
    rf"\b(?:not to touch until after|drink after|drink until|best from|best after)\s+{_YEAR}\b"
)
_CALENDAR_DATE = re.compile(rf"\b\d{{1,2}}(?:st|nd|rd|th)?\s+{_MONTH}\s+{_YEAR}\b")


def edition_number(name: str) -> str:
    match = _EDITION.search(norm(name))
    return (match.group(1) or match.group(2)) if match else ""


def source_identity_text(value: str, name: str, producer: str) -> str:
    """Repair whitespace inside known identity words, never spelling or missing words."""
    text = norm(value)
    for word in set(re.findall(r"[a-z]+", norm(name) + " " + norm(producer))):
        if len(word) >= 4:
            text = re.sub(r"\b" + r"\s*".join(word) + r"\b", word, text)
    return text


def identifies_wine(excerpt: str, name: str, producer: str) -> bool:
    text = norm(excerpt)
    edition = edition_number(name)
    clean_name = _EDITION.sub(" ", norm(name))
    required = set(re.findall(r"[a-z0-9]+", clean_name + " " + norm(producer))) - _NOISE
    words = set(re.findall(r"[a-z0-9]+", text))
    return bool(required) and required <= words and (not edition or edition_number(text) == edition)


def attributable(
    evidence: SourceEvidence,
    page: str,
    name: str,
    producer: str,
    *,
    allow_review_dates: bool = False,
) -> bool:
    """Require a real identity heading near the quote and reject intervening vintages.

    This is a conservative applicability check, not proof of the author's accuracy.
    Edition-specific NV descriptions are style evidence, never a base-year vintage.
    """
    heading = evidence.attribution_excerpt
    if not heading or "..." in heading or "\u2026" in heading:
        return False
    if allow_review_dates:
        heading = source_identity_text(heading, name, producer)
    if (
        not heading
        or "..." in heading
        or "…" in heading
        or not identifies_wine(heading, name, producer)
    ):
        return False
    normalize = (
        (lambda value: source_identity_text(value, name, producer)) if allow_review_dates else norm
    )
    text, witness, quote = normalize(page), normalize(heading), normalize(evidence.excerpt)
    if not quote or "..." in evidence.excerpt or "…" in evidence.excerpt:
        return False
    edition = edition_number(name)
    if evidence.scope == "exact_vintage":
        # An edition's base harvest is not the vintage of the finished NV wine.
        if edition and evidence.vintage.isdigit():
            return False
        if evidence.vintage.isdigit() and evidence.vintage not in re.findall(r"\b\d{4}\b", witness):
            return False
        if not evidence.vintage.isdigit() and norm(evidence.vintage) not in {
            "nv",
            "mv",
            "non vintage",
            "non millesimato",
        }:
            return False
        if (
            not evidence.vintage.isdigit()
            and not edition
            and not re.search(r"\b(?:nv|mv|non vintage|non millesimato)\b", witness)
        ):
            return False
    for match in re.finditer(re.escape(witness), text):
        start = match.start()
        position = text.find(quote, start)
        if position < 0 or position - match.end() > 3000:
            continue
        section = text[start : position + len(quote)]
        if evidence.scope == "exact_vintage" and evidence.vintage.isdigit():
            if allow_review_dates:
                # Only explicitly labelled drinking/review dates can be excluded.
                # Bare years and other wine headings still block attribution.
                section = _DRINKING_DATE.sub(" ", section)
                section = _REVIEW_DATE.sub(" ", section)
                section = _MATURITY_DATE.sub(" ", section)
                section = _DRINKING_ADVICE.sub(" ", section)
                section = _CALENDAR_DATE.sub(" ", section)
            years = set(re.findall(r"\b(?:19|20)\d{2}\b", section))
            if years - {evidence.vintage}:
                continue
        if edition:
            editions = {m.group(1) or m.group(2) for m in _EDITION.finditer(section)}
            if editions - {edition}:
                continue
        return True
    return False
