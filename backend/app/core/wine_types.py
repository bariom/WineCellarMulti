import re

CANONICAL_WINE_TYPES = ("Red", "White", "Rose", "Sparkling", "Sweet", "Fortified", "Other")


def normalize_wine_type(value: str | None) -> str:
    cleaned = (value or "").strip()
    if not cleaned:
        return ""
    normalized = cleaned.lower()
    if normalized in {"red", "rosso"} or "vino rosso" in normalized:
        return "Red"
    if normalized in {"white", "bianco"} or "vino bianco" in normalized:
        return "White"
    if normalized in {"rose", "ros\u00e9", "rosato"}:
        return "Rose"
    if normalized in {"sparkling", "spumante", "champagne"}:
        return "Sparkling"
    if normalized in {"sweet", "dolce"}:
        return "Sweet"
    if normalized in {"fortified", "fortificato"}:
        return "Fortified"
    if normalized in {"other", "altro"}:
        return "Other"
    return next((item for item in CANONICAL_WINE_TYPES if item.lower() == normalized), cleaned)


def normalize_verified_vintage(value: str | None) -> str:
    """Accept only an explicit vintage year or the standard non-vintage markers."""
    cleaned = (value or "").strip().upper()
    return cleaned if re.fullmatch(r"(?:19|20)\d{2}|NV|MV", cleaned) else ""
