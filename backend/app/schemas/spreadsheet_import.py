"""Contracts of the generic spreadsheet import (docs/SPREADSHEET_IMPORT.md)."""

from __future__ import annotations

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


class SpreadsheetSkippedSheet(BaseModel):
    name: str
    reason: Literal["no_table"]


class SpreadsheetAnalysis(BaseModel):
    file_format: Literal["xlsx", "xls", "ods", "csv"]
    # Same layout -> same fingerprint, to reuse a saved mapping next time.
    fingerprint: str
    tables: list[SpreadsheetTableAnalysis]
    skipped_sheets: list[SpreadsheetSkippedSheet] = Field(default_factory=list)
