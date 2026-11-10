"""Contracts of the generic spreadsheet import (docs/SPREADSHEET_IMPORT.md)."""

from __future__ import annotations

from decimal import Decimal
from typing import Literal

from pydantic import BaseModel, Field

SheetKind = Literal["inventory", "wishlist", "tasting", "movements", "summary", "ignore"]
Confidence = Literal["high", "medium", "low"]


class SpreadsheetColumn(BaseModel):
    # "c0", "c1"... for file columns; "sheet" and "section" for the virtual ones.
    key: str
    header: str
    field: str
    confidence: Confidence
    # header, values, header_and_values, fallback, sheet_name, section
    source: str
    alternatives: list[str] = Field(default_factory=list)
    samples: list[str] = Field(default_factory=list)
    filled: int = 0
    formulas_without_values: int = 0
    # The header suggested this field but the values do not fit it.
    rejected_field: str = ""
    name_order: Literal["", "producer_first", "wine_first"] = ""
    position_separator: str = ""
    currency: str = ""
    currency_ambiguous: bool = False
    date_order: Literal["", "dmy", "mdy"] = ""
    score_scale: int | None = None


class SpreadsheetQuestion(BaseModel):
    # currency, date_order, rating_words, position_split
    code: str
    column: str
    default: str
    options: list[str] = Field(default_factory=list)
    # Values from the file the question is about ("$", "05/06/2026", "molto buono").
    examples: list[str] = Field(default_factory=list)


class SpreadsheetTableAnalysis(BaseModel):
    id: str
    sheets: list[str]
    title: str = ""
    # 1-based row of the header in the first sheet.
    header_row: int
    row_count: int
    kind: SheetKind
    kind_confidence: Confidence
    allowed_fields: list[str]
    columns: list[SpreadsheetColumn]
    currency: str = ""
    questions: list[SpreadsheetQuestion] = Field(default_factory=list)
    # formulas_without_values, header_rejected, type_from_sheet_name, no_name_column
    warnings: list[str] = Field(default_factory=list)
    # For a movement register with only a "how many" column: the sheet name says
    # which way ("Uscite", "Taken out" -> out; "Acquisti", "Entrate" -> in).
    movement_direction: Literal["in", "out"] = "out"


class SpreadsheetSkippedSheet(BaseModel):
    name: str
    reason: Literal["no_table"]


class SpreadsheetNameOverride(BaseModel):
    producer: str = Field(default="", max_length=200)
    name: str = Field(min_length=1, max_length=200)
    vintage: str = Field(default="", max_length=16)


class SpreadsheetTableMapping(BaseModel):
    """What the user confirmed for one table of the analysis."""

    id: str = Field(max_length=8)
    kind: SheetKind
    # Column key ("c0", "sheet"...) -> field.
    columns: dict[str, str]
    currency: str = Field(default="", max_length=8)
    date_orders: dict[str, Literal["dmy", "mdy"]] = Field(default_factory=dict)
    split_positions: dict[str, bool] = Field(default_factory=dict)
    rating_words: Literal["standard", "notes_only"] = "standard"
    # Tasted wines marked "buy again" that are not in the cellar go to the wishlist.
    buy_again_to_wishlist: bool = True
    # Row ref (see SpreadsheetNameRow.ref) -> corrected producer / name / vintage.
    name_overrides: dict[str, SpreadsheetNameOverride] = Field(default_factory=dict)
    # Movements: which way a plain "how many" column goes when nothing else says so.
    movement_direction: Literal["in", "out"] = "out"
    # Movements: do the cellar quantities in the file already include them? The
    # preview asks; None until the user answers, read as "yes" (quantities untouched).
    stock_includes_movements: Literal["yes", "no"] | None = None


class SpreadsheetMapping(BaseModel):
    fingerprint: str = Field(max_length=64)
    tables: list[SpreadsheetTableMapping]


class SpreadsheetAnalysis(BaseModel):
    file_format: Literal["xlsx", "xls", "ods", "csv"]
    # Same layout -> same fingerprint, to reuse a saved mapping next time.
    fingerprint: str
    tables: list[SpreadsheetTableAnalysis]
    skipped_sheets: list[SpreadsheetSkippedSheet] = Field(default_factory=list)
    # The mapping confirmed the last time this household imported this layout.
    saved_mapping: SpreadsheetMapping | None = None
    # Currency of the household's cellar, used where the file names none.
    default_currency: str = "CHF"
    # Fields each kind accepts, for the column menus when the user changes a kind.
    fields_by_kind: dict[str, list[str]] = Field(default_factory=dict)


class SpreadsheetNameRow(BaseModel):
    # "<table id>:<sheet>!<row>", stable between preview and import.
    ref: str
    table_id: str
    sheet: str
    row: int
    raw: str
    producer: str
    name: str
    vintage: str
    # producer_column, separator, known_producer, estate, unresolved, override
    rule: str


class SpreadsheetWarning(BaseModel):
    # quantity_assumed, formula_without_value, tasting_without_date,
    # movements_not_imported, unknown_format, unreadable_value
    code: str
    table_id: str
    sheet: str = ""
    row: int | None = None
    column: str = ""
    value: str = ""


class SpreadsheetTablePreview(BaseModel):
    id: str
    kind: SheetKind
    rows: int
    wines: int = 0
    bottles: int = 0
    wishlist: int = 0
    tastings: int = 0
    movements: int = 0
    skipped_rows: int = 0


class SpreadsheetBalanceStep(BaseModel):
    # ISO date, empty when the row has none.
    date: str
    delta: int


class SpreadsheetBalanceExample(BaseModel):
    """One wine from the file, to make "already included?" concrete."""

    table_id: str
    wine: str
    stock: int
    stock_sheet: str
    movements_sheet: str
    steps: list[SpreadsheetBalanceStep]
    if_included: int
    if_applied: int


class SpreadsheetPreview(BaseModel):
    tables: list[SpreadsheetTablePreview]
    names: list[SpreadsheetNameRow]
    unresolved_names: int
    wines_total: int
    wine_new: int
    wine_duplicates: int
    sample_wine_duplicates: list[str] = Field(default_factory=list)
    bottles_total: int
    wishlist_total: int
    wishlist_new: int
    wishlist_duplicates: int
    tastings_total: int
    tastings_linked: int
    warnings: list[SpreadsheetWarning] = Field(default_factory=list)
    free_tier_label_limit: int | None = None
    free_tier_active_labels: int | None = 0
    free_tier_labels_required: int | None = 0
    free_tier_importable_wines: int | None = None
    # Names the household can still have split by AI for free.
    ai_free_names_left: int = 0
    movements_total: int = 0
    # Linked to a cellar wine of this file (or creating one from purchases).
    movements_linked: int = 0
    movements_drunk: int = 0
    movements_unmatched: int = 0
    # Movement tables whose "already included?" question still waits for an answer.
    balance_questions: list[str] = Field(default_factory=list)
    balance_example: SpreadsheetBalanceExample | None = None


class SpreadsheetNameSplitRequest(BaseModel):
    # Only the label strings the rules left unresolved; nothing else from the file.
    names: list[str] = Field(min_length=1, max_length=100)


class SpreadsheetNameSuggestion(BaseModel):
    raw: str
    producer: str
    name: str
    vintage: str
    confidence: str


class SpreadsheetNameSplitResult(BaseModel):
    suggestions: list[SpreadsheetNameSuggestion]
    # Names sent but not split: the AI was unsure or its answer did not match the label.
    unsplit: int
    free_names_used: int
    ai_free_names_left: int
    # Names not sent because splitting them needs AI credits the user does not have.
    needs_credits: int = 0
    charged_cost_usd: Decimal = Decimal("0")


class SpreadsheetImportResult(BaseModel):
    wines_imported: int = 0
    wines_updated: int = 0
    wines_skipped: int = 0
    # Wines left out because the free tier's label limit was reached.
    wines_over_free_tier: int = 0
    wishlist_imported: int = 0
    wishlist_skipped: int = 0
    tastings_imported: int = 0
    # Stock movements written to the ledger of the wines this import created.
    movements_imported: int = 0
