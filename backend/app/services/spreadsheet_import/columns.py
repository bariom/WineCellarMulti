"""Propose a Vinaris field for each column, from its header and its values.

A header synonym (Italian, English, French, German) proposes a field; the values
confirm it or overrule it. Fields that hold years, dates, numbers or wine types
need most of their cells to look like that ("Stato" or "When to open" are not
drinking windows), otherwise the column falls back to tags (short repeated
values) or notes. Columns no header names can still be recognised by their
values alone (a column of "Rosso", "Bianco" is the wine type), with lower
confidence. Every proposal is shown to the user, who can change it.
"""

from __future__ import annotations

import re
from collections.abc import Callable
from dataclasses import dataclass, field
from decimal import Decimal
from typing import Any

from app.services.spreadsheet_import.reader import Cell
from app.services.spreadsheet_import.tables import cell_text, normalize_label
from app.services.spreadsheet_import.values import (
    currency_in,
    date_order,
    is_yes_no_word,
    parse_bottle_format,
    parse_date,
    parse_drink_window,
    parse_number,
    parse_quantity,
    parse_verbal_rating,
    parse_vintage,
    parse_wine_type,
    parse_year,
    position_separator,
)

# Fields that can take several columns; every other field takes one.
MULTI_FIELDS = {"notes", "tags", "ignore"}

SYNONYMS: dict[str, tuple[str, ...]] = {
    "name": (
        "vino",
        "vini",
        "nome",
        "nome vino",
        "nome del vino",
        "etichetta",
        "wine",
        "wine name",
        "name",
        "label",
        "cuvee",
        "wine cuvee",
        "vin",
        "nom",
        "nom du vin",
        "wein",
        "weinname",
        "bezeichnung",
        "vorrei comprare",
        "da comprare",
        "wine i d like",
        "wine to buy",
        "wines to buy",
        "brand",
    ),
    "producer": (
        "produttore",
        "azienda",
        "azienda agricola",
        "producer",
        "winery",
        "estate",
        "maker",
        "domaine",
        "chateau",
        "producteur",
        "erzeuger",
        "weingut",
        "produzent",
    ),
    "vintage": (
        "annata",
        "anno",
        "vendemmia",
        "millesimo",
        "vintage",
        "year",
        "yr",
        "millesime",
        "annee",
        "jahrgang",
    ),
    "quantity": (
        "bottiglie",
        "quantita",
        "qta",
        "qty",
        "quantity",
        "quante",
        "quante ne ho",
        "quante bottiglie",
        "quante bott",
        "bottiglie attuali",
        "numero bottiglie",
        "n bottiglie",
        "giacenza",
        "rimaste",
        "pezzi",
        "pz",
        "bottles",
        "bottles left",
        "in cellar",
        "in stock",
        "stock",
        "on hand",
        "remaining",
        "left",
        "count",
        "total bottles",
        "how many",
        "bouteilles",
        "nombre",
        "quantite",
        "anzahl",
        "flaschen",
        "menge",
        "bestand",
    ),
    "cases": ("casse", "cassa", "cartoni", "cases", "caisses", "kisten"),
    "case_size": (
        "case size",
        "bottiglie per cassa",
        "per cassa",
        "bottles per case",
        "taille caisse",
        "flaschen pro kiste",
    ),
    "loose": ("sciolte", "singole", "loose", "single bottles", "einzeln"),
    "consumed_count": (
        "bottiglie bevute",
        "bevute",
        "bottles drunk",
        "drunk",
        "consumed",
        "bues",
        "getrunken",
    ),
    "price": (
        "prezzo",
        "prezzo pagato",
        "prezzo acquisto",
        "prezzo d acquisto",
        "costo",
        "pagato",
        "price",
        "paid",
        "cost",
        "cost each",
        "purchase price",
        "price paid",
        "prix",
        "prix d achat",
        "preis",
        "einkaufspreis",
        "kaufpreis",
    ),
    "current_value": (
        "valore",
        "valore stimato",
        "valore attuale",
        "prezzo attuale",
        "current price",
        "prix actuel",
        "aktueller preis",
        "quotazione",
        "value",
        "current value",
        "market value",
        "estimated value",
        "valeur",
        "wert",
        "marktwert",
    ),
    "target_price": (
        "budget",
        "prezzo obiettivo",
        "prezzo max",
        "prezzo massimo",
        "target price",
        "max price",
        "prix cible",
        "zielpreis",
    ),
    "currency": ("valuta", "moneta", "currency", "devise", "wahrung"),
    "type": (
        "tipo",
        "tipologia",
        "colore",
        "categoria",
        "type",
        "colour",
        "color",
        "style",
        "category",
        "red / white",
        "rosso / bianco",
        "couleur",
        "art",
        "weinart",
        "farbe",
    ),
    "format": (
        "formato",
        "formato ml",
        "capacita",
        "bottle ml",
        "bottle size",
        "size",
        "format",
        "ml",
        "cl",
        "contenance",
        "flaschengrosse",
        "grosse",
    ),
    "region": (
        "regione",
        "zona",
        "zona di produzione",
        "region",
        "area",
        "gebiet",
        "anbaugebiet",
    ),
    "country": (
        "paese",
        "nazione",
        "provenienza",
        "origine",
        "country",
        "origin",
        "pays",
        "land",
        "herkunft",
    ),
    "appellation": (
        "denominazione",
        "doc",
        "docg",
        "appellation",
        "aoc",
        "denomination",
    ),
    "grapes": (
        "vitigno",
        "vitigni",
        "uvaggio",
        "uve",
        "grape",
        "grapes",
        "varietal",
        "variety",
        "cepage",
        "cepages",
        "rebsorte",
        "traube",
    ),
    "merchant": (
        "dove comprato",
        "dove l ho preso",
        "dove l ho comprato",
        "comprato da",
        "fornitore",
        "negozio",
        "enoteca",
        "rivenditore",
        "venditore",
        "merchant",
        "shop",
        "store",
        "retailer",
        "supplier",
        "from",
        "bought at",
        "where bought",
        "caviste",
        "fournisseur",
        "handler",
        "lieferant",
        "gekauft bei",
    ),
    "order_date": (
        "data acquisto",
        "data d acquisto",
        "quando comprato",
        "comprato il",
        "acquistato il",
        "bought",
        "bought on",
        "purchased",
        "purchase date",
        "date bought",
        "date d achat",
        "kaufdatum",
        "gekauft am",
    ),
    "event_date": (
        "data",
        "date",
        "giorno",
        "quando",
        "tasted on",
        "tasted",
        "bevuto il",
        "aperto il",
        "data degustazione",
        "degustato il",
        "drunk on",
        "opened",
        "opened on",
        "datum",
        "getrunken am",
    ),
    "drink_from": (
        "bere dal",
        "bere da",
        "da bere dal",
        "bevibile dal",
        "pronto dal",
        "drink from",
        "ready from",
        "from year",
        "a boire a partir de",
        "trinkreif ab",
        "trinken ab",
    ),
    "drink_to": (
        "bere entro",
        "da bere entro",
        "bere fino al",
        "fino al",
        "drink by",
        "drink until",
        "drink to",
        "drink before",
        "a boire avant",
        "trinken bis",
    ),
    "drink_window": (
        "finestra di beva",
        "finestra",
        "drinking window",
        "drink window",
        "fenetre",
        "trinkfenster",
    ),
    "location": (
        "posizione",
        "posizione cantina",
        "ubicazione",
        "collocazione",
        "dove si trova",
        "dov e",
        "posto",
        "scaffale",
        "location",
        "where",
        "position",
        "storage",
        "rack",
        "emplacement",
        "lieu",
        "standort",
        "lagerort",
        "regal",
    ),
    "bin": ("casella", "ripiano", "fila", "bin", "slot", "fach"),
    "owners": (
        "proprietario",
        "proprietari",
        "di chi",
        "owner",
        "owners",
        "whose",
        "belongs to",
        "proprietaire",
        "besitzer",
        "eigentumer",
    ),
    "priority": ("priorita", "priority", "priorite", "prioritat"),
    "occasion": (
        "occasione",
        "per quando",
        "quando lo apro",
        "quando aprirlo",
        "per cosa",
        "motivo / occasione",
        "occasion",
        "when to open",
        "for what",
        "anlass",
    ),
    "pairing": (
        "abbinamento",
        "abbinamenti",
        "con cosa",
        "cibo",
        "piatto",
        "food",
        "pairing",
        "food pairing",
        "accord",
        "accords",
        "speise",
        "essen",
    ),
    "companions": ("con chi", "with whom", "who with", "companions", "avec qui", "mit wem"),
    "score": (
        "punteggio",
        "voto",
        "punti",
        "score",
        "points",
        "rating",
        "note /20",
        "punkte",
        "bewertung",
    ),
    "rating_words": (
        "com era",
        "giudizio",
        "valutazione",
        "voto",
        "how was it",
        "verdict",
        "rating",
        "avis",
        "urteil",
    ),
    "buy_again": (
        "lo ricompro",
        "ricomprare",
        "da ricomprare",
        "ricompro",
        "buy again",
        "rebuy",
        "would buy again",
        "racheter",
        "nachkaufen",
        "wieder kaufen",
    ),
    "movement_kind": (
        "cosa ho fatto",
        "movimento",
        "tipo movimento",
        "operazione",
        "entrata / uscita",
        "in / out",
        "action",
        "movement",
    ),
    "quantity_in": ("+ bottiglie", "entrate", "carico", "in", "bottles in", "+ bottles"),
    "quantity_out": ("- bottiglie", "uscite", "scarico", "out", "bottles out", "- bottles"),
    "notes": (
        "note",
        "nota",
        "note personali",
        "nota mia",
        "annotazioni",
        "appunti",
        "commento",
        "commenti",
        "promemoria",
        "motivo",
        "perche",
        "impressioni",
        "notes",
        "quick notes",
        "personal notes",
        "comments",
        "comment",
        "remarks",
        "memo",
        "reminder",
        "why",
        "what i thought",
        "tasting notes",
        "remarques",
        "bemerkung",
        "bemerkungen",
        "notizen",
        "kommentar",
    ),
    "tags": ("tag", "tags", "parole chiave", "keywords", "etiquettes", "schlagworter"),
}

# Words that, together in one header, mean wine and producer share the column.
WINE_WORDS = {"vino", "wine", "etichetta", "vin", "wein", "cuvee"}
PRODUCER_WORDS = {"produttore", "producer", "cantina", "winery", "producteur", "produzent"}


@dataclass
class ColumnProfile:
    filled: int = 0
    formulas_without_values: int = 0
    numbers: int = 0
    vintages: int = 0
    years: int = 0
    dates: int = 0
    quantities: int = 0
    wine_types: int = 0
    formats: int = 0
    currencies: int = 0
    verbal: int = 0
    yes_no: int = 0
    windows: int = 0
    distinct: int = 0
    average_length: float = 0.0
    max_number: Decimal | None = None
    texts: list[str] = field(default_factory=list)

    def share(self, count: int) -> float:
        return count / self.filled if self.filled else 0.0


def profile_column(cells: list[Cell], header: str = "") -> ColumnProfile:
    profile = ColumnProfile()
    values = [cell.value for cell in cells if not cell.empty]
    profile.formulas_without_values = sum(1 for cell in cells if cell.formula and cell.empty)
    profile.filled = len(values)
    order = date_order(values) or "dmy"
    texts = [cell_text(cell) for cell in cells if not cell.empty]
    profile.texts = texts
    profile.distinct = len({normalize_label(text) for text in texts})
    profile.average_length = sum(len(text) for text in texts) / len(texts) if texts else 0.0
    for value in values:
        number = parse_number(value) if not isinstance(value, str) or value.strip() else None
        is_date = parse_date(value, order) is not None
        if number is not None and not is_date:
            profile.numbers += 1
            profile.max_number = (
                number if profile.max_number is None else max(profile.max_number, number)
            )
        if parse_vintage(value) is not None and not is_date:
            profile.vintages += 1
        if parse_year(value) is not None and not is_date:
            profile.years += 1
        profile.dates += is_date
        quantity = parse_quantity(value)
        profile.quantities += quantity is not None and quantity <= 10000 and not is_date
        profile.wine_types += bool(parse_wine_type(value))
        # "1 bottle" is a quantity, not a bottle size.
        counted = isinstance(value, str) and re.match(r"\s*\d+\s+[^\W\d]", value)
        profile.formats += bool(parse_bottle_format(value, header)) and not counted
        profile.currencies += isinstance(value, str) and currency_in(value) is not None
        profile.verbal += parse_verbal_rating(value) is not None
        profile.yes_no += is_yes_no_word(value)
        window = parse_drink_window(value)
        profile.windows += (window[0] or window[1]) is not None and not is_date
    return profile


def check_vintage(profile: ColumnProfile) -> float:
    return profile.share(profile.vintages)


def check_year(profile: ColumnProfile) -> float:
    return profile.share(profile.years)


def check_date(profile: ColumnProfile) -> float:
    return profile.share(profile.dates)


def check_number(profile: ColumnProfile) -> float:
    return profile.share(profile.numbers)


def check_quantity(profile: ColumnProfile) -> float:
    return profile.share(profile.quantities)


def check_window(profile: ColumnProfile) -> float:
    return profile.share(profile.windows)


def check_text(profile: ColumnProfile) -> float:
    # Free text: at most a few cells may be plain numbers.
    return 1.0 - profile.share(profile.numbers) if profile.filled else 0.0


# Fields whose values must agree with the header: (check, minimum share).
VALUE_CHECKS: dict[str, tuple[Callable[[ColumnProfile], float], float]] = {
    "vintage": (check_vintage, 0.8),
    "quantity": (check_quantity, 0.8),
    "cases": (check_quantity, 0.8),
    "case_size": (check_quantity, 0.8),
    "loose": (check_quantity, 0.8),
    "consumed_count": (check_quantity, 0.8),
    "quantity_in": (check_quantity, 0.8),
    "quantity_out": (check_quantity, 0.8),
    "price": (check_number, 0.8),
    "current_value": (check_number, 0.8),
    "target_price": (check_number, 0.8),
    "currency": (lambda profile: profile.share(profile.currencies), 0.8),
    "type": (lambda profile: profile.share(profile.wine_types), 0.5),
    "format": (lambda profile: profile.share(profile.formats), 0.6),
    "order_date": (check_date, 0.8),
    "event_date": (check_date, 0.8),
    "drink_from": (check_year, 0.8),
    "drink_to": (check_year, 0.8),
    "drink_window": (check_window, 0.8),
    "score": (check_number, 0.8),
    "rating_words": (lambda profile: profile.share(profile.verbal), 0.6),
    "buy_again": (lambda profile: profile.share(profile.yes_no), 0.6),
    "name": (check_text, 0.8),
    "producer": (check_text, 0.8),
}

# Recognised from the values alone, when no header names the column.
VALUE_ONLY: list[tuple[str, Callable[[ColumnProfile], float], float, float]] = [
    ("type", lambda profile: profile.share(profile.wine_types), 0.8, 0.55),
    ("format", lambda profile: profile.share(profile.formats), 0.8, 0.5),
    ("currency", lambda profile: profile.share(profile.currencies), 0.8, 0.5),
    ("rating_words", lambda profile: profile.share(profile.verbal), 0.6, 0.5),
    ("event_date", check_date, 0.9, 0.4),
    ("vintage", check_vintage, 0.9, 0.35),
]


@dataclass
class Candidate:
    field: str
    score: float
    # "header", "values" or "header_and_values".
    source: str


@dataclass
class ColumnProposal:
    key: str
    header: str
    field: str
    confidence: str
    source: str
    alternatives: list[str]
    samples: list[str]
    filled: int
    formulas_without_values: int = 0
    # The header proposed a field the values contradict (e.g. "Stato").
    rejected_field: str = ""
    # "producer_first" or "wine_first" when one column holds both.
    name_order: str = ""
    # Separator that splits a location column into location and bin.
    position_separator: str = ""
    profile: ColumnProfile | None = None


def header_strength(header: str, synonym: str) -> float:
    if header == synonym:
        return 1.0
    if f" {synonym} " in f" {header} ":
        return 0.55 + 0.4 * len(synonym) / max(len(header), 1)
    return 0.0


def header_candidates(header: str) -> list[Candidate]:
    text = normalize_label(header)
    # Units and currencies in brackets do not change the meaning of a header.
    bare = normalize_label(re.sub(r"(?i)\b(chf|eur|gbp|usd|ml|cl)\b|[€£$]", " ", text))
    candidates = []
    for field_name, synonyms in SYNONYMS.items():
        strength = max(
            (
                max(
                    header_strength(text, normalize_label(synonym)),
                    header_strength(bare, normalize_label(synonym)),
                )
                for synonym in synonyms
            ),
            default=0.0,
        )
        if strength > 0:
            candidates.append(Candidate(field_name, strength, "header"))
    words = set(text.replace("/", " ").split())
    if words & WINE_WORDS and words & PRODUCER_WORDS:
        candidates.append(Candidate("name", 1.05, "header"))
    if not candidates and currency_in(header):
        candidates.append(Candidate("price", 0.6, "header"))
    return candidates


def name_order(header: str) -> str:
    words = normalize_label(header).replace("/", " ").split()
    wine = next((index for index, word in enumerate(words) if word in WINE_WORDS), None)
    producer = next((index for index, word in enumerate(words) if word in PRODUCER_WORDS), None)
    if wine is None or producer is None:
        return ""
    return "producer_first" if producer < wine else "wine_first"


def rank_candidates(header: str, profile: ColumnProfile) -> tuple[list[Candidate], str]:
    """Candidates best first, and the field the values ruled out, if any."""
    ranked: list[Candidate] = []
    rejected = ""
    for candidate in sorted(header_candidates(header), key=lambda item: -item.score):
        check = VALUE_CHECKS.get(candidate.field)
        if check is None or profile.filled == 0:
            ranked.append(candidate)
            continue
        agreement = check[0](profile)
        if agreement < check[1]:
            rejected = rejected or candidate.field
            continue
        ranked.append(
            Candidate(
                candidate.field, candidate.score * (0.75 + 0.25 * agreement), "header_and_values"
            )
        )
    if profile.filled:
        for field_name, check, minimum, weight in VALUE_ONLY:
            if all(item.field != field_name for item in ranked) and check(profile) >= minimum:
                ranked.append(Candidate(field_name, weight * check(profile), "values"))
    ranked.sort(key=lambda item: -item.score)
    return ranked, rejected


def fallback_field(profile: ColumnProfile, categorical: bool = False) -> str:
    if profile.filled == 0:
        return "notes" if profile.formulas_without_values else "ignore"
    if categorical:
        return "tags"
    repeated = profile.distinct <= max(2, 0.6 * profile.filled)
    if repeated and profile.average_length <= 25 and profile.share(profile.numbers) < 0.5:
        return "tags"
    return "notes"


def confidence_of(score: float) -> str:
    if score >= 0.8:
        return "high"
    if score >= 0.5:
        return "medium"
    return "low"


def propose_columns(
    headers: list[str],
    columns: list[list[Cell]],
    keys: list[str] | None = None,
    categorical: set[int] | None = None,
) -> list[ColumnProposal]:
    """One proposal per column; single-value fields go to their best column.

    `categorical` lists the columns with an in-cell dropdown: unnamed, they are tags.
    """
    categorical = categorical or set()
    keys = keys or [f"c{index}" for index in range(len(headers))]
    profiles = [
        profile_column(cells, header) for header, cells in zip(headers, columns, strict=True)
    ]
    ranked = [
        rank_candidates(header, profile) for header, profile in zip(headers, profiles, strict=True)
    ]
    assigned: dict[int, Candidate] = {}
    taken: set[str] = set()
    # Strongest claims first: a clear "Annata" beats a column that only looks like years.
    claims = sorted(
        (
            (candidate.score, index, position, candidate)
            for index, (candidates, _) in enumerate(ranked)
            for position, candidate in enumerate(candidates)
        ),
        key=lambda item: (-item[0], item[2], item[1]),
    )
    for _score, index, _position, candidate in claims:
        if index in assigned or (candidate.field in taken and candidate.field not in MULTI_FIELDS):
            continue
        assigned[index] = candidate
        taken.add(candidate.field)
    proposals = []
    for index, header in enumerate(headers):
        profile = profiles[index]
        candidates, rejected = ranked[index]
        chosen = assigned.get(index)
        field_name = chosen.field if chosen else fallback_field(profile, index in categorical)
        proposal = ColumnProposal(
            key=keys[index],
            header=header,
            field=field_name,
            confidence=confidence_of(chosen.score) if chosen else "low",
            source=chosen.source if chosen else "fallback",
            alternatives=[item.field for item in candidates if item.field != field_name][:3],
            samples=list(dict.fromkeys(profile.texts))[:3],
            filled=profile.filled,
            formulas_without_values=profile.formulas_without_values,
            rejected_field=rejected,
            profile=profile,
        )
        if field_name == "name":
            proposal.name_order = name_order(header)
        proposals.append(proposal)
    settle_positions(proposals)
    ensure_name(proposals)
    return proposals


def settle_positions(proposals: list[ColumnProposal]) -> None:
    """ "Rack A / 01" in a bin column without a location column is location and bin."""
    has_location = any(proposal.field == "location" for proposal in proposals)
    for proposal in proposals:
        if proposal.field not in {"location", "bin"} or proposal.profile is None:
            continue
        separator = position_separator(proposal.profile.texts)
        if proposal.field == "bin" and separator and not has_location:
            proposal.field = "location"
            has_location = True
        if proposal.field == "location" and separator:
            proposal.position_separator = separator


def ensure_name(proposals: list[ColumnProposal]) -> None:
    """Without a named wine column, the most varied text column holds the wine."""
    if any(proposal.field == "name" for proposal in proposals):
        return
    texts = [
        proposal
        for proposal in proposals
        if proposal.field in {"notes", "tags"}
        and proposal.profile is not None
        and proposal.profile.filled
        and check_text(proposal.profile) >= 0.8
    ]
    if not texts:
        return
    best = max(
        texts,
        key=lambda proposal: (
            (proposal.profile.distinct, proposal.profile.average_length)
            if proposal.profile
            else (0, 0.0)
        ),
    )
    best.alternatives = [best.field, *best.alternatives][:3]
    best.field, best.confidence, best.source = "name", "low", "values"


def score_scale(header: str, profile: ColumnProfile | None) -> int:
    """The scale of a score column: from the header (/10, su 20, 100 points) or its maximum."""
    match = re.search(r"(?:/|su|out of|sur|von)\s*(5|10|20|100)\b", normalize_label(header))
    if match:
        return int(match.group(1))
    highest = profile.max_number if profile and profile.max_number is not None else Decimal(0)
    for scale in (5, 10, 20, 100):
        if highest <= scale:
            return scale
    return 100


def column_values(rows: list[list[Cell]], index: int) -> list[Any]:
    return [row[index].value for row in rows if index < len(row)]
