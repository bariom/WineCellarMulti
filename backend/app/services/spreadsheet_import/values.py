"""Turn spreadsheet values into Vinaris values: numbers, currencies, dates,
vintages, wine types, bottle formats, quantities and storage positions.

Every parser returns None (or "") when it is not sure, so the preview can flag
the cell instead of importing a guess.
"""

from __future__ import annotations

import re
from collections import Counter
from datetime import date, datetime
from decimal import Decimal, InvalidOperation
from typing import Any

from app.services.spreadsheet_import.tables import normalize_label

# --- numbers --------------------------------------------------------------

CURRENCY_NOISE = re.compile(r"(?i)\b(chf|sfr|fr|eur|euro|euros|gbp|usd|aud|cad|nzd)\b\.?|[€£$]")


def parse_number(value: Any) -> Decimal | None:
    """Read 24.9, "1'250.–", "1.250,00", "CHF 45.-", "£12.50" or "45 €"."""
    if value is None or isinstance(value, bool):
        return None
    if isinstance(value, int | float | Decimal):
        try:
            return Decimal(str(value))
        except InvalidOperation:
            return None
    if isinstance(value, date):
        return None
    text = CURRENCY_NOISE.sub("", str(value)).strip()
    text = re.sub(r"[.,]\s*[-–—]+\s*$", "", text)  # Swiss "45.-" / "45.–"
    text = text.replace(" ", "").replace(" ", "").replace("'", "").replace("’", "")
    if not re.fullmatch(r"[-+]?\d[\d.,]*", text):
        return None
    if "," in text and "." in text:
        decimal_mark = "," if text.rfind(",") > text.rfind(".") else "."
        thousands = "." if decimal_mark == "," else ","
        text = text.replace(thousands, "").replace(decimal_mark, ".")
    elif "," in text:
        whole, _, fraction = text.rpartition(",")
        # "1,250" is a thousand separator only with exactly three digits after it.
        text = (
            text.replace(",", "")
            if len(fraction) == 3 and whole.isdigit() and len(whole) <= 3
            else text.replace(",", ".")
        )
    elif text.count(".") > 1:
        text = text.replace(".", "")
    try:
        return Decimal(text)
    except InvalidOperation:
        return None


def parse_quantity(value: Any) -> int | None:
    """Bottle counts: 3, "3", "3 bottles", "6 bt", "una"."""
    number = parse_number(value)
    if number is None and isinstance(value, str):
        match = re.match(r"\s*(\d+)\b", value)
        if match:
            number = Decimal(match.group(1))
        else:
            words = {"una": 1, "uno": 1, "one": 1, "a": 1, "due": 2, "two": 2, "tre": 3, "three": 3}
            first = normalize_label(value).split(" ")[0] if value.strip() else ""
            number = Decimal(words[first]) if first in words else None
    if number is None or number < 0 or number != number.to_integral_value():
        return None
    return int(number)


# --- currencies -----------------------------------------------------------

CURRENCY_PATTERNS: list[tuple[str, re.Pattern[str]]] = [
    ("CHF", re.compile(r"(?i)\bchf\b|\bsfr\b|\bfr\.")),
    ("EUR", re.compile(r"(?i)€|\beur\b|\beuro?s?\b")),
    ("GBP", re.compile(r"(?i)£|\bgbp\b")),
    ("USD", re.compile(r"(?i)\busd\b|us\$")),
    ("AUD", re.compile(r"(?i)\baud\b|a\$")),
    ("CAD", re.compile(r"(?i)\bcad\b|c\$")),
    ("NZD", re.compile(r"(?i)\bnzd\b|nz\$")),
]
ISO_CURRENCIES = {"CHF", "EUR", "GBP", "USD", "AUD", "CAD", "NZD", "JPY", "SEK", "NOK", "DKK"}


def currency_in(text: str) -> tuple[str, bool] | None:
    """The currency named in a header, cell value or number format.

    Returns (code, ambiguous). A bare "$" is USD but ambiguous: it must be confirmed.
    """
    if not text:
        return None
    stripped = text.strip().upper()
    if stripped in ISO_CURRENCIES:
        return stripped, False
    for code, pattern in CURRENCY_PATTERNS:
        if pattern.search(text):
            return code, False
    if "$" in text:
        return "USD", True
    return None


def column_currency(
    header: str, values: list[Any], number_formats: list[str]
) -> tuple[str, bool] | None:
    """Currency of a money column: the header first, then the cells' formats or text."""
    found = currency_in(header)
    if found:
        return found
    for candidates in (number_formats, [value for value in values if isinstance(value, str)]):
        counts = Counter(result for result in (currency_in(item) for item in candidates) if result)
        if counts:
            return counts.most_common(1)[0][0]
    return None


# --- dates ----------------------------------------------------------------

MONTHS = {
    "jan": 1,
    "gen": 1,
    "janv": 1,
    "feb": 2,
    "febb": 2,
    "fev": 2,
    "fevr": 2,
    "mar": 3,
    "mrz": 3,
    "apr": 4,
    "avr": 4,
    "may": 5,
    "mag": 5,
    "mai": 5,
    "jun": 6,
    "giu": 6,
    "juin": 6,
    "jul": 7,
    "lug": 7,
    "juil": 7,
    "aug": 8,
    "ago": 8,
    "aou": 8,
    "sep": 9,
    "set": 9,
    "sept": 9,
    "oct": 10,
    "ott": 10,
    "okt": 10,
    "nov": 11,
    "dec": 12,
    "dic": 12,
    "dez": 12,
}
NUMERIC_DATE = re.compile(r"^\s*(\d{1,4})[./-](\d{1,2})[./-](\d{1,4})\s*$")


def numeric_date_parts(value: Any) -> tuple[int, int, int] | None:
    match = NUMERIC_DATE.match(str(value)) if isinstance(value, str) else None
    return (int(match.group(1)), int(match.group(2)), int(match.group(3))) if match else None


def date_order(values: list[Any]) -> str | None:
    """'dmy' or 'mdy' for a column of text dates like 05/11/2026, None if unknown.

    One value with a first part above 12 settles it as day-first, one with a
    second part above 12 as month-first; a column with neither stays ambiguous.
    """
    day_first = month_first = False
    for value in values:
        parts = numeric_date_parts(value)
        if not parts or parts[0] > 31:  # ISO year-first needs no order
            continue
        day_first |= parts[0] > 12
        month_first |= parts[1] > 12
    if day_first and not month_first:
        return "dmy"
    if month_first and not day_first:
        return "mdy"
    return None


def parse_date(value: Any, order: str = "dmy") -> date | None:
    if isinstance(value, datetime):
        return value.date()
    if isinstance(value, date):
        return value
    if value is None or isinstance(value, bool | int | float):
        return None
    text = str(value).strip()
    parts = numeric_date_parts(text)
    if parts:
        first, second, third = parts
        if first > 31:  # 2024-11-12
            year, month, day = first, second, third
        elif order == "mdy":
            month, day, year = first, second, third
        else:
            day, month, year = first, second, third
        if year < 100:
            year += 2000 if year < 70 else 1900
        try:
            return date(year, month, day)
        except ValueError:
            return None
    words = normalize_label(text).replace(".", " ").split()
    numbers = [int(word) for word in words if word.isdigit()]
    month_words = [
        MONTHS[word[:4]] if word[:4] in MONTHS else MONTHS.get(word[:3])
        for word in words
        if not word.isdigit()
    ]
    month_numbers = [month for month in month_words if month]
    if len(numbers) == 2 and len(month_numbers) == 1:
        day, year = (numbers[0], numbers[1]) if numbers[1] > 31 else (numbers[1], numbers[0])
        try:
            return date(year, month_numbers[0], day)
        except ValueError:
            return None
    return None


# --- vintages and years ---------------------------------------------------

NON_VINTAGE = {
    "nv",
    "n v",
    "sa",
    "s a",
    "senza annata",
    "sans annee",
    "non vintage",
    "mv",
    "multi vintage",
}


def year_bounds() -> tuple[int, int]:
    return 1900, date.today().year + 1


def parse_year(value: Any) -> int | None:
    if isinstance(value, datetime | date):
        return value.year
    number = parse_number(value)
    low, high = year_bounds()
    if number is not None and number == number.to_integral_value() and low <= number <= high + 60:
        return int(number)
    return None


def parse_vintage(value: Any) -> str | None:
    """'2019', 'NV', or None for an empty/unknown cell."""
    if value is None or (isinstance(value, str) and not value.strip()):
        return None
    if normalize_label(value) in NON_VINTAGE:
        return "NV"
    year = parse_year(value)
    low, high = year_bounds()
    return str(year) if year is not None and low <= year <= high else None


TRAILING_VINTAGE = re.compile(
    r"^(?P<name>.*?\S)[\s,]*(?:\((?P<paren>(?:19|20)\d{2})\)|(?P<year>(?:19|20)\d{2}))\s*$"
)


def split_trailing_vintage(name: str) -> tuple[str, str | None]:
    """'Vietti Barolo Castiglione 2019' -> ('Vietti Barolo Castiglione', '2019')."""
    match = TRAILING_VINTAGE.match(name or "")
    if not match:
        return name.strip(), None
    year = match.group("paren") or match.group("year")
    low, high = year_bounds()
    if not low <= int(year) <= high:
        return name.strip(), None
    return match.group("name").strip(" -–,"), year


# --- wine types and formats -----------------------------------------------

TYPE_WORDS: list[tuple[str, tuple[str, ...]]] = [
    (
        "Sparkling",
        (
            "bollicine",
            "spumante",
            "spumanti",
            "sparkling",
            "champagne",
            "cremant",
            "cava",
            "prosecco",
            "franciacorta",
            "metodo classico",
            "sekt",
            "mousseux",
            "petillant",
            "fizz",
            "bubbles",
            "bulles",
            "schaumwein",
        ),
    ),
    ("Rose", ("rose", "rosato", "rosati", "rosado", "rosé", "blush", "ramato")),
    (
        "Sweet",
        (
            "dolce",
            "dolci",
            "sweet",
            "dessert",
            "passito",
            "liquoroso",
            "moelleux",
            "liquoreux",
            "susswein",
            "suss",
        ),
    ),
    ("Fortified", ("fortificato", "fortified", "porto", "port", "sherry", "madeira", "marsala")),
    (
        "White",
        ("bianco", "bianchi", "white", "whites", "blanc", "blancs", "weiss", "weisswein", "blanco"),
    ),
    ("Red", ("rosso", "rossi", "red", "reds", "rouge", "rouges", "rot", "rotwein", "tinto")),
]


def parse_wine_type(value: Any) -> str:
    """A Vinaris type (Red, White, Rose, Sparkling, Sweet, Fortified) or ""."""
    words = normalize_label(value)
    if not words:
        return ""
    tokens = set(words.split())
    for canonical, synonyms in TYPE_WORDS:
        if any((" " in synonym and synonym in words) or synonym in tokens for synonym in synonyms):
            return canonical
    return ""


# Only the formats the app offers; other sizes stay empty and are flagged.
FORMATS_BY_ML = {
    375: "Half bottle (375ml)",
    750: "Bottle (750ml)",
    1000: "Bottle (1L)",
    1500: "Magnum (1.5L)",
    3000: "Jeroboam (3L)",
    4500: "Rehoboam (4.5L)",
    6000: "Imperial (6L)",
    9000: "Salmanazar (9L)",
    12000: "Balthazar (12L)",
    15000: "Nebuchadnezzar (15L)",
    18000: "Melchior (18L)",
}
FORMAT_NAMES = {
    "mezza": 375,
    "half": 375,
    "demi": 375,
    "bottiglia": 750,
    "bottle": 750,
    "standard": 750,
    "magnum": 1500,
    "doppio magnum": 3000,
    "double magnum": 3000,
    "jeroboam": 3000,
    "rehoboam": 4500,
    "imperial": 6000,
    "methuselah": 6000,
    "salmanazar": 9000,
    "balthazar": 12000,
    "nebuchadnezzar": 15000,
    "melchior": 18000,
}


def parse_bottle_format(value: Any, unit_hint: str = "") -> str:
    """750, '0.75', '75cl', '1,5 l', 'Magnum' -> a Vinaris format name, or ""."""
    if value is None or (isinstance(value, str) and not value.strip()):
        return ""
    text = normalize_label(value)
    for name, millilitres in sorted(FORMAT_NAMES.items(), key=lambda item: -len(item[0])):
        if name in text:
            return FORMATS_BY_ML[millilitres]
    number = (
        parse_number(re.sub(r"(?i)\s*(ml|cl|lt|l)\s*$", "", str(value).strip()))
        if not isinstance(value, int | float)
        else Decimal(str(value))
    )
    if number is None:
        return ""
    unit = re.search(r"(?i)(ml|cl|lt|l)\s*$", str(value).strip()) or re.search(
        r"(?i)\b(ml|cl|l)\b", unit_hint
    )
    unit_text = unit.group(1).lower() if unit else ""
    if unit_text == "cl":
        millilitres = number * 10
    elif unit_text in {"l", "lt"} or (not unit_text and number < 20):
        millilitres = number * 1000
    else:
        millilitres = number
    return (
        FORMATS_BY_ML.get(int(millilitres), "")
        if millilitres == millilitres.to_integral_value()
        else ""
    )


# --- storage positions ----------------------------------------------------

POSITION_SEPARATORS = (" / ", " - ", " – ", " | ", ", ")


def position_separator(values: list[str]) -> str | None:
    """The separator that splits most of a location column into place and slot.

    "A1 - ripiano 2" and "Rack A / 01" split; "Scaffale 3" and "Frigo cantina" do
    not. The separator must hold for at least 80% of the filled cells.
    """
    filled = [value for value in values if value.strip()]
    if not filled:
        return None
    for separator in POSITION_SEPARATORS:
        if sum(1 for value in filled if separator in value) >= 0.8 * len(filled):
            return separator
    return None


def split_position(value: str, separator: str | None) -> tuple[str, str]:
    text = (value or "").strip()
    if separator and separator in text:
        location, _, slot = text.partition(separator)
        return location.strip()[:80], slot.strip()[:80]
    return text[:80], ""


# --- ratings, yes/no and drinking windows -----------------------------------

# Verbal judgements on the Vinaris 0-6 scale (decided 9.11.2026); the user can
# change them in the preview, and the words stay in the tasting note.
VERBAL_RATINGS = {
    "discreto": 3.0,
    "buono": 4.0,
    "molto buono": 5.0,
    "ottimo": 5.5,
    "eccellente": 6.0,
    "fair": 3.0,
    "good": 4.0,
    "very good": 5.0,
    "excellent": 5.5,
    "great": 5.5,
    "outstanding": 6.0,
}


def parse_verbal_rating(value: Any) -> float | None:
    return VERBAL_RATINGS.get(normalize_label(value)) if isinstance(value, str) else None


YES_WORDS = {"si", "sì", "yes", "y", "oui", "ja", "x", "ricomprare", "da ricomprare", "ok"}
NO_WORDS = {"no", "n", "non", "nein"}
MAYBE_WORDS = {"forse", "maybe", "peut etre", "vielleicht", "boh"}


def parse_yes_no(value: Any) -> bool | None:
    """True, False, or None for "maybe" and anything else."""
    if isinstance(value, bool):
        return value
    text = normalize_label(value)
    if text in YES_WORDS:
        return True
    if text in NO_WORDS:
        return False
    return None


def is_yes_no_word(value: Any) -> bool:
    return parse_yes_no(value) is not None or normalize_label(value) in MAYBE_WORDS


WINDOW_YEARS = re.compile(r"(?:19|20)\d{2}")


def parse_drink_window(value: Any) -> tuple[int | None, int | None]:
    """'2025-2030', '2025 / 2030', 'dal 2027', 'entro 2030', 2028 -> (from, to)."""
    if isinstance(value, int | float) and not isinstance(value, bool):
        year = parse_year(value)
        return year, None
    text = normalize_label(value)
    years = [int(year) for year in WINDOW_YEARS.findall(text)]
    if len(years) >= 2:
        return min(years[:2]), max(years[:2])
    if len(years) == 1:
        if re.search(r"\b(entro|by|until|bis|avant|fino|to)\b", text):
            return None, years[0]
        return years[0], None
    return None, None
