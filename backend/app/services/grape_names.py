"""Grape names as shown to the user, without notes the AI sometimes appends."""

from __future__ import annotations

import re

_BRACKETED = re.compile(r"\s*[\(\[][^\)\]]*[\)\]]")


def clean_grape_name(value: object) -> str:
    """Return the grape name alone.

    Research results occasionally put remarks inside the name, such as
    "Cabernet Franc (percentuali non disponibili dalla fonte consultata)" or an
    empty "Pinot Nero ()". Bracketed text is dropped, as it never names a grape.
    """
    text = _BRACKETED.sub("", str(value or ""))
    return " ".join(text.split()).strip(" -–,;:")


def clean_grape_entries(grapes: object) -> list[dict]:
    """Keep well-formed grape entries with a cleaned, non-empty name."""
    cleaned: list[dict] = []
    for item in grapes if isinstance(grapes, list) else []:
        if not isinstance(item, dict):
            continue
        name = clean_grape_name(item.get("name"))
        if name:
            cleaned.append({**item, "name": name})
    return cleaned
