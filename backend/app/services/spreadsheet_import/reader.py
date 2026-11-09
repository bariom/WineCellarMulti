"""Read .xlsx/.xlsm, .xls, .ods and .csv files into one workbook model.

Every format ends up as sheets of cells with their value, whether the cell was a
formula, its number format (or currency code) and the sheet's merged ranges,
Excel tables, frozen rows and dropdown lists. Nothing is evaluated: a formula
cell carries the value the spreadsheet application last saved, or None.
"""

from __future__ import annotations

import csv
import io
import zipfile
from dataclasses import dataclass, field
from datetime import date, datetime, time
from typing import Any

MAX_FILE_BYTES = 5 * 1024 * 1024
# A small zip can expand to gigabytes of XML; refuse before parsing.
MAX_UNCOMPRESSED_BYTES = 60 * 1024 * 1024
MAX_SHEETS = 20
MAX_ROWS = 5000
MAX_COLUMNS = 60
# Rows read past the last data row are dropped, but the reader still walks them.
MAX_SCANNED_ROWS = MAX_ROWS + 200


class SpreadsheetError(ValueError):
    """A file the import cannot read; `code` is stable for the frontend."""

    def __init__(self, code: str, message: str) -> None:
        super().__init__(message)
        self.code = code


@dataclass
class Cell:
    value: Any = None
    formula: bool = False
    number_format: str = ""

    @property
    def empty(self) -> bool:
        return self.value is None or (isinstance(self.value, str) and not self.value.strip())


@dataclass
class Sheet:
    name: str
    rows: list[list[Cell]]
    # (first_row, first_col, last_row, last_col), 0-based and inclusive.
    merged: list[tuple[int, int, int, int]] = field(default_factory=list)
    tables: list[tuple[int, int, int, int]] = field(default_factory=list)
    # Number of rows frozen at the top (Excel "freeze panes"), 0 when none.
    frozen_rows: int = 0
    # Column index -> allowed values of an in-cell dropdown list.
    dropdowns: dict[int, list[str]] = field(default_factory=dict)


@dataclass
class Workbook:
    file_format: str
    sheets: list[Sheet]


def read_workbook(content: bytes, filename: str = "") -> Workbook:
    if not content:
        raise SpreadsheetError("empty_file", "The file is empty.")
    if len(content) > MAX_FILE_BYTES:
        raise SpreadsheetError("file_too_large", "The file is larger than 5 MB.")
    file_format = detect_format(content, filename)
    if file_format in {"xlsx", "ods"}:
        check_zip_size(content)
    reader = {"xlsx": read_xlsx, "xls": read_xls, "ods": read_ods, "csv": read_csv}[file_format]
    try:
        sheets = reader(content)
    except SpreadsheetError:
        raise
    except Exception as exc:  # A damaged file must answer with a clear error, not a 500.
        raise SpreadsheetError("unreadable_file", "The file could not be read.") from exc
    sheets = [
        sheet for sheet in sheets if any(not cell.empty for row in sheet.rows for cell in row)
    ]
    if not sheets:
        raise SpreadsheetError("no_data", "The file has no data.")
    if len(sheets) > MAX_SHEETS:
        raise SpreadsheetError("too_many_sheets", f"The file has more than {MAX_SHEETS} sheets.")
    return Workbook(file_format=file_format, sheets=sheets)


def detect_format(content: bytes, filename: str) -> str:
    if content.startswith(b"\xd0\xcf\x11\xe0\xa1\xb1\x1a\xe1"):
        return "xls"
    if content.startswith(b"PK"):
        try:
            with zipfile.ZipFile(io.BytesIO(content)) as archive:
                names = set(archive.namelist())
                if "mimetype" in names and b"opendocument.spreadsheet" in archive.read("mimetype"):
                    return "ods"
                if "[Content_Types].xml" in names and any(name.startswith("xl/") for name in names):
                    return "xlsx"
        except zipfile.BadZipFile as exc:
            raise SpreadsheetError("unreadable_file", "The file could not be read.") from exc
        raise SpreadsheetError("unsupported_format", "This file is not a spreadsheet.")
    if filename.lower().endswith((".xlsx", ".xlsm", ".xls", ".ods", ".numbers")):
        raise SpreadsheetError("unsupported_format", "The file could not be read as a spreadsheet.")
    return "csv"


def check_zip_size(content: bytes) -> None:
    with zipfile.ZipFile(io.BytesIO(content)) as archive:
        if sum(item.file_size for item in archive.infolist()) > MAX_UNCOMPRESSED_BYTES:
            raise SpreadsheetError("file_too_large", "The file is too large once uncompressed.")


def trim_rows(rows: list[list[Cell]]) -> list[list[Cell]]:
    """Drop trailing empty cells and rows, cap the size, keep inner blanks."""
    trimmed: list[list[Cell]] = []
    for row in rows[:MAX_SCANNED_ROWS]:
        cells = list(row[:MAX_COLUMNS])
        while cells and cells[-1].empty:
            cells.pop()
        trimmed.append(cells)
    while trimmed and not trimmed[-1]:
        trimmed.pop()
    return trimmed


# --- .xlsx / .xlsm ---------------------------------------------------------


def read_xlsx(content: bytes) -> list[Sheet]:
    from openpyxl import load_workbook
    from openpyxl.utils.cell import range_boundaries

    # Values as last saved, then the same file again to see which cells are formulas.
    values_book = load_workbook(io.BytesIO(content), data_only=True)
    formula_book = load_workbook(io.BytesIO(content), data_only=False)
    sheets: list[Sheet] = []
    for values_sheet in values_book.worksheets:
        if values_sheet.sheet_state != "visible":
            continue
        formula_sheet = formula_book[values_sheet.title]
        rows: list[list[Cell]] = []
        # Bound by the sheet's own size: a fixed bound would create every empty cell.
        max_row = min(values_sheet.max_row, MAX_SCANNED_ROWS)
        max_col = min(values_sheet.max_column, MAX_COLUMNS)
        for value_row, formula_row in zip(
            values_sheet.iter_rows(max_row=max_row, max_col=max_col),
            formula_sheet.iter_rows(max_row=max_row, max_col=max_col),
            strict=False,
        ):
            rows.append(
                [
                    Cell(
                        value=value_cell.value,
                        formula=isinstance(formula_cell.value, str)
                        and formula_cell.value.startswith("="),
                        number_format=value_cell.number_format or "",
                    )
                    for value_cell, formula_cell in zip(value_row, formula_row, strict=False)
                ]
            )
        merged = []
        for merged_range in values_sheet.merged_cells.ranges:
            min_col, min_row, max_col, max_row = merged_range.bounds
            merged.append((min_row - 1, min_col - 1, max_row - 1, max_col - 1))
        tables = []
        for table in values_sheet.tables.values():
            min_col, min_row, max_col, max_row = range_boundaries(table.ref)
            if min_col and min_row and max_col and max_row:
                tables.append((min_row - 1, min_col - 1, max_row - 1, max_col - 1))
        frozen_rows = 0
        if values_sheet.freeze_panes:
            frozen_rows = values_sheet[values_sheet.freeze_panes].row - 1
        dropdowns: dict[int, list[str]] = {}
        for validation in values_sheet.data_validations.dataValidation:
            formula = (validation.formula1 or "").strip()
            if validation.type == "list" and formula.startswith('"') and formula.endswith('"'):
                options = [
                    option.strip() for option in formula.strip('"').split(",") if option.strip()
                ]
                for cell_range in validation.sqref.ranges:
                    for column in range(cell_range.min_col - 1, cell_range.max_col):
                        dropdowns[column] = options
        sheets.append(
            Sheet(
                name=values_sheet.title,
                rows=trim_rows(rows),
                merged=merged,
                tables=tables,
                frozen_rows=frozen_rows,
                dropdowns=dropdowns,
            )
        )
    return sheets


# --- .xls -----------------------------------------------------------------


def read_xls(content: bytes) -> list[Sheet]:
    import xlrd

    book = xlrd.open_workbook(file_contents=content, formatting_info=True)
    sheets: list[Sheet] = []
    for xls_sheet in book.sheets():
        if xls_sheet.visibility != 0:
            continue
        rows: list[list[Cell]] = []
        for row_index in range(min(xls_sheet.nrows, MAX_SCANNED_ROWS)):
            row: list[Cell] = []
            for column_index in range(min(xls_sheet.ncols, MAX_COLUMNS)):
                cell = xls_sheet.cell(row_index, column_index)
                number_format = ""
                try:
                    xf = book.xf_list[cell.xf_index or 0]
                    number_format = book.format_map[xf.format_key].format_str
                except (IndexError, KeyError, TypeError):
                    pass
                value: Any = cell.value
                if cell.ctype == xlrd.XL_CELL_EMPTY or cell.ctype == xlrd.XL_CELL_BLANK:
                    value = None
                elif cell.ctype == xlrd.XL_CELL_DATE:
                    value = xlrd.xldate_as_datetime(float(cell.value), book.datemode)
                elif cell.ctype == xlrd.XL_CELL_BOOLEAN:
                    value = bool(cell.value)
                elif cell.ctype == xlrd.XL_CELL_ERROR:
                    value = None
                elif cell.ctype == xlrd.XL_CELL_NUMBER and float(cell.value).is_integer():
                    value = int(cell.value)
                # xlrd does not expose formulas; their saved values are what we read anyway.
                row.append(Cell(value=value, number_format=number_format))
            rows.append(row)
        merged = [
            (first_row, first_col, last_row - 1, last_col - 1)
            for first_row, last_row, first_col, last_col in xls_sheet.merged_cells
        ]
        frozen_rows = (
            xls_sheet.horz_split_pos if getattr(xls_sheet, "panes_are_frozen", False) else 0
        )
        sheets.append(
            Sheet(
                name=xls_sheet.name,
                rows=trim_rows(rows),
                merged=merged,
                frozen_rows=frozen_rows or 0,
            )
        )
    return sheets


# --- .ods -----------------------------------------------------------------


def read_ods(content: bytes) -> list[Sheet]:
    from odf.namespaces import OFFICENS, TABLENS
    from odf.opendocument import load
    from odf.table import Table, TableRow

    document: Any = load(io.BytesIO(content))
    sheets: list[Sheet] = []
    for table in document.spreadsheet.getElementsByType(Table):
        name = table.getAttrNS(TABLENS, "name") or ""
        rows: list[list[Cell]] = []
        merged: list[tuple[int, int, int, int]] = []
        for table_row in table.getElementsByType(TableRow):
            repeat_rows = int(table_row.getAttrNS(TABLENS, "number-rows-repeated") or 1)
            row: list[Cell] = []
            for table_cell in table_row.childNodes:
                if table_cell.qname[1] not in {"table-cell", "covered-table-cell"}:
                    continue
                repeat_columns = int(table_cell.getAttrNS(TABLENS, "number-columns-repeated") or 1)
                cell = (
                    ods_cell(table_cell, OFFICENS, TABLENS)
                    if table_cell.qname[1] == "table-cell"
                    else Cell()
                )
                span_columns = int(table_cell.getAttrNS(TABLENS, "number-columns-spanned") or 1)
                span_rows = int(table_cell.getAttrNS(TABLENS, "number-rows-spanned") or 1)
                if span_columns > 1 or span_rows > 1:
                    merged.append(
                        (
                            len(rows),
                            len(row),
                            len(rows) + span_rows - 1,
                            len(row) + span_columns - 1,
                        )
                    )
                # Trailing repeats fill the sheet to its edge; an empty cell repeated
                # a thousand times adds nothing, so stop at the column cap.
                for _ in range(min(repeat_columns, MAX_COLUMNS - len(row))):
                    row.append(cell)
                if len(row) >= MAX_COLUMNS:
                    break
            row_is_empty = all(cell.empty for cell in row)
            # Empty rows repeated to the bottom of the sheet are padding, not data.
            for _ in range(
                1 if row_is_empty and repeat_rows > 1 else min(repeat_rows, MAX_SCANNED_ROWS)
            ):
                rows.append(list(row))
            if len(rows) >= MAX_SCANNED_ROWS:
                break
        sheets.append(Sheet(name=name, rows=trim_rows(rows), merged=merged))
    return sheets


def ods_cell(table_cell: Any, office_ns: str, table_ns: str) -> Cell:
    value_type = table_cell.getAttrNS(office_ns, "value-type") or ""
    formula = bool(table_cell.getAttrNS(table_ns, "formula"))
    number_format = ""
    value: Any
    if value_type in {"float", "percentage", "currency"}:
        raw = table_cell.getAttrNS(office_ns, "value") or "0"
        number = float(raw)
        value = int(number) if number.is_integer() else number
        if value_type == "currency":
            number_format = table_cell.getAttrNS(office_ns, "currency") or ""
    elif value_type == "date":
        raw = table_cell.getAttrNS(office_ns, "date-value") or ""
        value = (
            datetime.fromisoformat(raw)
            if "T" in raw
            else datetime.combine(date.fromisoformat(raw), time())
        )
    elif value_type == "boolean":
        value = (table_cell.getAttrNS(office_ns, "boolean-value") or "") == "true"
    else:
        text = "\n".join(
            str(paragraph) for paragraph in table_cell.childNodes if paragraph.qname[1] == "p"
        )
        value = text if text.strip() else None
    return Cell(value=value, formula=formula, number_format=number_format)


# --- .csv -----------------------------------------------------------------


def read_csv(content: bytes) -> list[Sheet]:
    text = decode_text(content)
    sample = text[:20000]
    try:
        dialect: Any = csv.Sniffer().sniff(sample, delimiters=",;\t|")
    except csv.Error:
        dialect = csv.excel
    rows = []
    for index, values in enumerate(csv.reader(io.StringIO(text), dialect)):
        if index >= MAX_SCANNED_ROWS:
            break
        rows.append(
            [Cell(value=value if value.strip() else None) for value in values[:MAX_COLUMNS]]
        )
    return [Sheet(name="CSV", rows=trim_rows(rows))]


def decode_text(content: bytes) -> str:
    for encoding in ("utf-8-sig", "cp1252", "latin-1"):
        try:
            return content.decode(encoding)
        except UnicodeDecodeError:
            continue
    return content.decode("utf-8", errors="replace")
