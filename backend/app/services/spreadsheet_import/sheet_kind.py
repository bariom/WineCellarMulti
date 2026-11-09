"""Propose what a table is: cellar, wishlist, tasting diary, movements or summary.

The recognised columns decide first (a target price means a wishlist, a date with
a score means a tasting diary); the sheet name and title break ties. Each kind
accepts a set of fields, and a field that makes no sense for the kind moves to
its nearest equivalent (in a cellar, "Per quando" is a tag, not an occasion).
"""

from __future__ import annotations

from app.services.spreadsheet_import.tables import normalize_label

KINDS = ("inventory", "wishlist", "tasting", "movements", "summary", "ignore")

COMMON_WINE_FIELDS = (
    "name",
    "producer",
    "vintage",
    "type",
    "format",
    "region",
    "country",
    "appellation",
    "grapes",
)
FIELDS_BY_KIND: dict[str, tuple[str, ...]] = {
    "inventory": (
        *COMMON_WINE_FIELDS,
        "quantity",
        "cases",
        "case_size",
        "loose",
        "consumed_count",
        "price",
        "current_value",
        "currency",
        "merchant",
        "order_date",
        "drink_from",
        "drink_to",
        "drink_window",
        "location",
        "bin",
        "owners",
        "notes",
        "tags",
        "ignore",
    ),
    "wishlist": (
        *COMMON_WINE_FIELDS,
        "quantity",
        "target_price",
        "currency",
        "merchant",
        "priority",
        "notes",
        "tags",
        "ignore",
    ),
    "tasting": (
        "event_date",
        *COMMON_WINE_FIELDS,
        "quantity",
        "score",
        "rating_words",
        "occasion",
        "pairing",
        "companions",
        "buy_again",
        "notes",
        "ignore",
    ),
    "movements": (
        "event_date",
        *COMMON_WINE_FIELDS,
        "movement_kind",
        "quantity_in",
        "quantity_out",
        "quantity",
        "owners",
        "occasion",
        "location",
        "notes",
        "ignore",
    ),
    "summary": ("ignore",),
    "ignore": ("ignore",),
}

# Where a field goes when the kind has no place for it.
REMAP_BY_KIND: dict[str, dict[str, str]] = {
    "inventory": {
        "event_date": "order_date",
        "target_price": "price",
        "occasion": "tags",
        "pairing": "notes",
        "companions": "notes",
        "score": "notes",
        "rating_words": "notes",
        "buy_again": "notes",
        "priority": "tags",
    },
    "wishlist": {"price": "target_price", "occasion": "notes", "location": "notes"},
    "tasting": {"order_date": "event_date", "tags": "notes"},
    "movements": {"order_date": "event_date", "tags": "notes"},
}

KIND_HINTS: dict[str, tuple[str, ...]] = {
    "wishlist": (
        "wish",
        "wishlist",
        "da comprare",
        "comprare",
        "da prendere",
        "vorrei",
        "shopping",
        "to buy",
        "liste d envies",
        "a acheter",
        "wunschliste",
        "einkaufsliste",
    ),
    "tasting": (
        "bevuti",
        "bevute",
        "degustazioni",
        "degustazione",
        "assaggi",
        "diario",
        "tasting",
        "tasted",
        "tried",
        "diary",
        "degustation",
        "verkostung",
    ),
    "movements": (
        "movimenti",
        "registro",
        "uscite",
        "entrate",
        "taken out",
        "log",
        "movements",
        "mouvements",
        "bewegungen",
    ),
    "summary": (
        "riepilogo",
        "riassunto",
        "totali",
        "statistiche",
        "summary",
        "totals",
        "dashboard",
        "overview",
        "resume",
        "ubersicht",
    ),
}

TASTING_SIGNALS = {"score", "rating_words", "buy_again", "pairing", "companions"}
STOCK_SIGNALS = {"price", "location", "current_value", "drink_from", "drink_to", "format", "bin"}


def kind_hint(names: list[str]) -> str:
    text = f" {' '.join(normalize_label(name) for name in names)} "
    for kind, words in KIND_HINTS.items():
        if any(f" {word} " in text or (len(word) > 5 and word in text) for word in words):
            return kind
    return ""


def detect_kind(fields: set[str], names: list[str], formula_share: float) -> tuple[str, str]:
    """(kind, confidence) from the proposed fields, the sheet names and titles."""
    hint = kind_hint(names)
    if "name" not in fields:
        if hint == "summary" or formula_share >= 0.5:
            return "summary", "medium"
        return "ignore", "medium"
    if fields & {"quantity_in", "quantity_out", "movement_kind"}:
        return "movements", "high" if hint == "movements" else "medium"
    if "event_date" in fields and fields & TASTING_SIGNALS:
        return "tasting", "high"
    if fields & {"target_price", "priority"}:
        return "wishlist", "high" if hint == "wishlist" else "medium"
    if hint == "summary" and formula_share >= 0.3:
        return "summary", "medium"
    if hint in {"wishlist", "tasting"} and not fields & STOCK_SIGNALS:
        return hint, "medium"
    if "event_date" in fields and "quantity" in fields and not fields & STOCK_SIGNALS:
        return "movements", "low"
    return "inventory", "high" if fields & {"quantity", "location"} else "medium"


def remap_field(kind: str, field: str) -> str:
    if field in FIELDS_BY_KIND.get(kind, ()):
        return field
    if kind in {"summary", "ignore"}:
        return "ignore"
    remapped = REMAP_BY_KIND.get(kind, {}).get(field, "notes")
    return remapped if remapped in FIELDS_BY_KIND[kind] else "notes"
