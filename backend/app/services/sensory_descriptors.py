"""Reproducible heuristic anchors for already verified sensory quotations.

These numbers are an editorial scale, not measurements or calibrated probabilities.
The caller must verify quotations and wine/vintage applicability before calling.
No network access, old profiles, grape stereotypes or production-method inference.
"""

import re
import unicodedata
from dataclasses import dataclass
from statistics import median

from app.schemas.sensory_agent import SourceEvidence


@dataclass(frozen=True)
class Estimate:
    value: float | None
    lower: float
    upper: float
    evidence: list[SourceEvidence]
    conflicting: bool = False


_NOUNS = {
    "body": r"body|bodied|corpo|corps|korper|bouche|palato|mouth|palate",
    "acidity": r"acidity|acidita|acidite|saure|syra|freschezza|fraicheur",
    "tannin": r"tannins?|tanins?|tannic|tannini|tannico|tanniques?|gerbstoffe",
    "sweetness": r"sweetness|dolcezza|douceur|susse",
    "aromatic_intensity": (
        r"aromas?|aromi|aromatic profile|profumi|profumo|nose|naso|nez|bouquet|duft|doft"
    ),
    "fruit": r"fruit|frutto|frutta|fruits|fruttato|fruity|fruite|frucht|frukt",
    "wood": r"oak|wood|legno|bois|holz|eiche|vanilla|vaniglia|vanille|tostatura",
    "spice": r"spice|spices|spiced|spezie|speziatura|spicy|speziato|epices|epice|wurze|kryddor",
    "minerality": (
        r"minerality|mineralita|mineralite|mineralitat|salinity|salinita|sapidita|mineral|mineralic"
    ),
}
_LEVELS = (
    (
        0.9,
        r"very high|very intense|molto intens[oaie]|molto elevat[oaie]|tres intense|sehr intensiv",
    ),
    (
        0.25,
        r"low|light|lightly|slight|subtle|delicate|discreet|restrained|bass[oaie]|liev[ei]|legger[oaie]|"
        r"delicat[oaie]|tenu[ei]|faible|leger[es]*|discret[es]*|niedrig[ea]*|dezent[ea]*",
    ),
    (
        0.5,
        r"medium|moderate|moderately intense|moderate[ds]?|medi[oaie]|moderat[oaie]|"
        r"moyen[nes]*|modere[es]*|mittel|massig",
    ),
    (
        0.75,
        r"high|intense|intens[oaie]|pronounced|strong|powerful|elevat[oaie]|"
        r"spiccat[oaie]|marcat[oaie]|decis[oaie]|puissant[es]*|eleve[es]*|prononce[es]*|"
        r"ausgepragt[ea]*|kraftig[ea]*|hoch|hoh[ea]*",
    ),
)
# Only a copula may intervene. Prepositions such as "with"/"con" introduce a
# different observation: "full-bodied with delicate fruit" must not lower body.
_LINK = r"(?:\s+(?:is|are|e|sono|est|sont|ist|sind))?\s+"
_NEGATION = re.compile(r"\b(?:not|no|non|without|sans|pas|nicht|kein\w*|senza|absent\w*)\b")


def _text(value: str) -> str:
    return "".join(
        char
        for char in unicodedata.normalize("NFKD", value.lower())
        if not unicodedata.combining(char)
    ).replace("-", " ")


def _anchors(dimension: str, text: str, *, strict: bool = False) -> set[float]:
    if dimension == "body" and evolving_palate(text):
        return set()  # Different phases of the same sip cannot define one fixed body anchor.
    noun = _NOUNS[dimension]
    result: set[float] = set()
    if (
        dimension == "aromatic_intensity"
        and not _NEGATION.search(text)
        and re.search(
            r"\bintensement aromatique\b|\bintense et elegant,? le bouquet\b|"
            r"\bpotent aromatic dialogue\b",
            text,
        )
    ):
        result.add(0.75)
    # This tightly bounded phrase retains an explicit mouth/body attribution across
    # commas. Do not generally bridge commas: "tannins, powerful aromas" describes
    # the aromas, not tannin intensity. Structure alone is not a body anchor.
    if dimension == "body":
        for sentence in re.split(r"[.;!?\n]", text):
            if not _NEGATION.search(sentence) and re.search(
                r"\b(?:mouth|palate)(?:\s+is)?\s+structured\s*,?\s+broad\s+and\s+powerful\b",
                sentence,
            ):
                result.add(0.75)
            if not _NEGATION.search(sentence) and re.search(
                r"\bample(?:\s*,\s*(?:gras|genereux))*\s*,?\s+le palais\b", sentence
            ):
                result.add(0.75)
    for clause in re.split(r"[.;,:!?\n]|\b(?:but|ma|mais|aber)\b", text):
        if _NEGATION.search(clause):
            continue
        if dimension == "sweetness" and re.search(
            r"grape|uva|uve|raisin|appass|drying|zuccher|sugar|sucre|residu", clause
        ):
            continue
        remaining = clause
        for value, adjective in _LEVELS:
            pattern = rf"\b(?:(?:{adjective}){_LINK}(?:{noun})|(?:{noun}){_LINK}(?:{adjective}))\b"
            if re.search(pattern, remaining):
                result.add(value)
                # Avoid counting 'very intense aromas' again as just 'intense aromas'.
                remaining = re.sub(pattern, " ", remaining)
        if dimension == "body":
            for value, pattern in (
                (0.25, r"\blight bodied\b|\bcorpo legger[oa]\b"),
                (0.5, r"\bmedium bodied\b|\bmittelschwer\w*\b"),
                (
                    0.75,
                    r"\bfull bodied\b|\b(?:corpo|corps) (?:pieno|plein|ample)\b|"
                    r"\b(?:broad|full) (?:palate|mouth|body)\b|"
                    r"\b(?:palato|bouche) (?:ampio|ample)\b",
                ),
            ):
                if re.search(pattern, remaining):
                    result.add(value)
            if strict and re.search(r"\bcorpos[oa]\b", remaining):
                result.add(0.75)
        if dimension == "acidity" and re.search(
            r"\b(?:acidity|acidita|acidite) (?:lively|vibrant|vivace|vive|fresca)\b|"
            r"\b(?:lively|vibrant|vivace|vive|fresh|crisp|mouthwatering) "
            r"(?:acidity|acidita|acidite)\b",
            remaining,
        ):
            result.add(0.75)
        if (
            strict
            and dimension == "acidity"
            and re.search(r"\bacidity\s+(?:which\s+is\s+|is\s+)?(?:quite\s+)?fresh\b", remaining)
        ):
            result.add(0.75)
        if (
            dimension == "tannin"
            and re.search(r"\bfirm\s+tannins?\b|\btannins?\s+(?:are\s+)?firm\b", remaining)
            and not strict
        ):
            result.add(0.75)
        if strict and dimension == "tannin" and re.search(r"\bfull\s+tannins?\b", remaining):
            result.add(0.75)
        if dimension == "minerality" and re.search(
            r"\bvery\s+saline\s+(?:finish|palate)\b", remaining
        ):
            result.add(0.9)
        if (
            dimension == "sweetness"
            and not re.search(
                r"\b(?:frutta|fruits?|frutos?)\s+(?:secc\w*|secs?|seches?|secos?)\b", remaining
            )
            and re.search(
                r"\b(?:dry|secco|secca|sec|seche|trocken)\b(?!\s+(?:fruit|fruits|grapes))",
                remaining,
            )
        ):
            result.add(0.05)
    return result


def evolving_palate(text: str) -> bool:
    return bool(
        re.search(
            r"\b(?:mouth|palate|palato)\b.*\b(?:then|poi)\b.*\b(?:leaner|tougher|snello)\b",
            _text(text),
        )
    )


def compatible_observations(
    dimension: str, evidence: list[SourceEvidence], *, strict: bool = False
) -> bool:
    """Recognize specific false conflicts, without discarding unknown disagreements."""
    combined = descriptor_estimate(dimension, evidence, strict=strict)
    if combined is not None and combined.conflicting:
        return False
    if dimension == "body" and any(evolving_palate(e.excerpt) for e in evidence):
        return True
    if dimension != "tannin" or combined is None:
        return False
    unquantified = [
        e for e in evidence if descriptor_estimate(dimension, [e], strict=strict) is None
    ]
    texture = r"velvet|silky|integrat|morb|vellut|setos|soft|mature|ripe"
    if strict:
        texture += r"|firm"
    return bool(unquantified) and all(
        re.search(r"tannin|\btanins?\b", _text(e.excerpt)) and re.search(texture, _text(e.excerpt))
        for e in unquantified
    )


def descriptor_estimate(
    dimension: str, evidence: list[SourceEvidence], *, strict: bool = False
) -> Estimate | None:
    """Map explicit adjacent descriptions to broad, uncalibrated intensity ranges.

    Duplicate quotes cannot increase weight. Opposing descriptions are returned as
    a conflict without a central value, so the caller cannot silently average them.
    """
    if dimension not in _NOUNS:
        return None
    values: list[float] = []
    accepted: list[SourceEvidence] = []
    seen: set[str] = set()
    for item in evidence:
        text = _text(item.excerpt)
        if text in seen:
            continue
        seen.add(text)
        anchors = _anchors(dimension, text, strict=strict)
        if anchors:
            values.extend(sorted(anchors))
            accepted.append(item)
    if not values:
        return None
    conflicting = max(values) - min(values) > 0.2 + 1e-9
    return Estimate(
        value=None if conflicting else round(median(values), 2),
        lower=round(max(0.0, min(values) - 0.15), 2),
        upper=round(min(1.0, max(values) + 0.15), 2),
        evidence=accepted,
        conflicting=conflicting,
    )
