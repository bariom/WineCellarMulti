"""Split the wine cell of a spreadsheet into producer, wine name and vintage.

Rules in the order of docs/SPREADSHEET_IMPORT.md, stopping at the first sure
result: a producer column, the vintage at the end of the name, a separator
(" - ", " | "), a producer already known (in the household's cellar or in the
catalog) at the start or the end, an estate word (Château, Tenuta...). A cell
none of them resolve keeps the whole text as the name and an empty producer,
and the preview highlights it.
"""

from __future__ import annotations

import re
from collections import Counter
from dataclasses import dataclass

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import Wine, WineCatalogEntry
from app.services.spreadsheet_import.tables import normalize_label
from app.services.spreadsheet_import.values import split_trailing_vintage

SEPARATORS = (" - ", " – ", " — ", " | ")
ESTATE_WORDS = {
    "chateau",
    "domaine",
    "tenuta",
    "castello",
    "fattoria",
    "podere",
    "weingut",
    "schloss",
    "bodega",
    "bodegas",
    "quinta",
    "maison",
    "clos",
}
# Words that start a producer's name on either side of " - ".
PRODUCER_START_WORDS = ESTATE_WORDS | {
    "marchesi",
    "marchese",
    "conte",
    "conti",
    "cantina",
    "cantine",
    "azienda",
    "tenute",
    "famiglia",
    "fratelli",
    "f lli",
    "domaines",
    "maison",
    "weingut",
}
# Words that start a wine or an appellation, never a producer ("Barolo Bussia").
WINE_START_WORDS = {
    "amarone",
    "barbaresco",
    "barolo",
    "brunello",
    "chianti",
    "franciacorta",
    "lugana",
    "prosecco",
    "ripasso",
    "soave",
    "valpolicella",
    "champagne",
    "riesling",
    "sauvignon",
    "chardonnay",
    "pinot",
    "merlot",
    "shiraz",
    "syrah",
}
MAX_PRODUCER_WORDS = 5
MAX_CATALOG_PRODUCERS = 20000


@dataclass
class NameSplit:
    raw: str
    producer: str
    name: str
    vintage: str
    # producer_column, separator, known_producer, estate, unresolved
    rule: str

    @property
    def resolved(self) -> bool:
        return self.rule != "unresolved"


def known_producers(db: Session, household_id: object) -> dict[str, str]:
    """Normalized -> written producer, from the household's wines and the catalog."""
    names: dict[str, str] = {}
    catalog = db.scalars(
        select(WineCatalogEntry.producer)
        .where(WineCatalogEntry.is_active.is_(True), WineCatalogEntry.producer != "")
        .distinct()
        .limit(MAX_CATALOG_PRODUCERS)
    )
    household = db.scalars(
        select(Wine.producer)
        .where(Wine.household_id == household_id, Wine.producer != "")
        .distinct()
    )
    for producer in [*catalog, *household]:
        key = normalize_label(producer)
        if len(key) >= 3:
            names.setdefault(key, producer.strip())
    return names


def starts_like_producer(text: str) -> bool:
    words = normalize_label(text).split()
    return bool(words) and (
        words[0] in PRODUCER_START_WORDS or " ".join(words[:2]) in PRODUCER_START_WORDS
    )


def separator_in(text: str) -> str | None:
    return next((separator for separator in SEPARATORS if separator in text), None)


def known_edge(words: list[str], producers: dict[str, str]) -> tuple[str, str] | None:
    """(producer, rest) when the first or last words name a known producer."""
    for size in range(min(MAX_PRODUCER_WORDS, len(words) - 1), 0, -1):
        head, tail = " ".join(words[:size]), " ".join(words[size:])
        if normalize_label(head) in producers and normalize_label(words[0]) not in WINE_START_WORDS:
            return head, tail
        head, tail = " ".join(words[: len(words) - size]), " ".join(words[len(words) - size :])
        if normalize_label(tail) in producers:
            return tail, head
    return None


def split_one(
    raw: str,
    *,
    producer_value: str,
    vintage_value: str,
    order: str,
    producers: dict[str, str],
) -> NameSplit:
    text = re.sub(r"\s+", " ", raw or "").strip()
    vintage = vintage_value
    if not vintage:
        text, found = split_trailing_vintage(text)
        vintage = found or ""
    if producer_value:
        return NameSplit(raw, producer_value.strip(), text, vintage, "producer_column")
    separator = separator_in(text)
    if separator:
        left, _, right = (part.strip() for part in text.partition(separator))
        if left and right:
            if normalize_label(right) in producers and normalize_label(left) not in producers:
                return NameSplit(raw, right, left, vintage, "separator")
            if normalize_label(left) in producers:
                return NameSplit(raw, left, right, vintage, "separator")
            # "Tignanello - Marchesi Antinori": the side that reads like a producer wins.
            left_producer, right_producer = starts_like_producer(left), starts_like_producer(right)
            if right_producer and not left_producer:
                return NameSplit(raw, right, left, vintage, "separator")
            if left_producer and not right_producer:
                return NameSplit(raw, left, right, vintage, "separator")
            if order == "producer_first":
                return NameSplit(raw, left, right, vintage, "separator")
            return NameSplit(raw, right, left, vintage, "separator")
    words = text.split(" ")
    if len(words) > 1:
        edge = known_edge(words, producers)
        if edge:
            return NameSplit(raw, edge[0], edge[1], vintage, "known_producer")
    if words and normalize_label(words[0]) in ESTATE_WORDS:
        return NameSplit(raw, text, text, vintage, "estate")
    return NameSplit(raw, "", text, vintage, "unresolved")


def file_order(raws: list[str], hint: str, producers: dict[str, str]) -> str:
    """Which side of " - " holds the producer in this file: header hint, then majority."""
    if hint:
        return hint
    votes: Counter[str] = Counter()
    for raw in raws:
        separator = separator_in(raw or "")
        if not separator:
            continue
        left, _, right = (normalize_label(part) for part in raw.partition(separator))
        if left in producers and right not in producers:
            votes["producer_first"] += 1
        elif right in producers and left not in producers:
            votes["wine_first"] += 1
    # Collectors write "Wine - Producer" more often (files 1, 2 and 3).
    return votes.most_common(1)[0][0] if votes else "wine_first"


def split_names(
    raws: list[str],
    *,
    producer_values: list[str] | None = None,
    vintage_values: list[str] | None = None,
    order_hint: str = "",
    producers: dict[str, str],
) -> list[NameSplit]:
    order = file_order(raws, order_hint, producers)
    producer_values = producer_values or [""] * len(raws)
    vintage_values = vintage_values or [""] * len(raws)
    return [
        split_one(
            raw,
            producer_value=producer,
            vintage_value=vintage,
            order=order,
            producers=producers,
        )
        for raw, producer, vintage in zip(raws, producer_values, vintage_values, strict=True)
    ]


def squeeze(text: str) -> str:
    return " ".join(str(text or "").split())


def verified_ai_split(raw: str, producer: str, name: str, vintage: str) -> NameSplit | None:
    """An AI proposal, kept only if every part is written in the label itself.

    The model may not invent a producer, translate a name or guess a vintage: what
    it returns has to be read back from the user's own text.
    """
    label = squeeze(raw)
    folded = label.casefold()
    producer, name, vintage = squeeze(producer), squeeze(name).strip(" -–—/,|"), squeeze(vintage)
    if not name or name.casefold() not in folded:
        return None
    if producer and producer.casefold() not in folded:
        return None
    if vintage and not (len(vintage) == 4 and vintage.isdigit() and vintage in label):
        return None
    if not producer:
        return None
    return NameSplit(raw=label, producer=producer, name=name, vintage=vintage, rule="ai")
