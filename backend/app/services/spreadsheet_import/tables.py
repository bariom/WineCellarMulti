"""Find the data table in each sheet and group sheets that share one layout.

Signals, strongest first: an Excel table, the rows frozen above the data, then a
score per row (text labels over a run of filled rows). Titles on merged cells,
blank rows and total rows are dropped.
"""

from __future__ import annotations

import re
import unicodedata
from dataclasses import dataclass, field
from datetime import date, datetime

from app.services.spreadsheet_import.reader import MAX_ROWS, Cell, Sheet, SpreadsheetError

HEADER_SEARCH_ROWS = 15
TOTAL_LABELS = re.compile(
    r"^\s*(totale?|totali|total|totals|summe|gesamt|somme|sous-total|subtotal)\b", re.IGNORECASE
)


@dataclass
class Table:
    sheet: str
    # 0-based row index of the header in the sheet; data follows it.
    header_row: int
    headers: list[str]
    # Sheet column index of each header.
    columns: list[int]
    # Data cells aligned to `headers`, with the 1-based sheet row of each.
    rows: list[list[Cell]]
    row_numbers: list[int]
    dropdowns: dict[int, list[str]] = field(default_factory=dict)


@dataclass
class TableGroup:
    """Tables with the same header, imported as one (one sheet per shelf)."""

    tables: list[Table]

    @property
    def headers(self) -> list[str]:
        return self.tables[0].headers

    @property
    def sheets(self) -> list[str]:
        return [table.sheet for table in self.tables]

    @property
    def row_count(self) -> int:
        return sum(len(table.rows) for table in self.tables)


def normalize_label(value: object) -> str:
    text = unicodedata.normalize("NFKD", str(value or ""))
    text = "".join(char for char in text if not unicodedata.combining(char)).lower()
    return re.sub(r"\s+", " ", re.sub(r"[^\w€£$%/+\-]+", " ", text)).strip()


def is_text_label(cell: Cell) -> bool:
    if cell.empty or cell.formula or not isinstance(cell.value, str):
        return False
    text = cell.value.strip()
    return len(text) <= 60 and not re.fullmatch(r"[\d\s.,'’/:-]+", text)


def is_data_cell(cell: Cell) -> bool:
    return not cell.empty


def merged_title_rows(sheet: Sheet) -> set[int]:
    """Rows whose content sits in one cell merged across several columns."""
    return {
        first_row
        for first_row, first_col, last_row, last_col in sheet.merged
        if last_col - first_col >= 2 and first_row == last_row
    }


def header_score(sheet: Sheet, index: int, titles: set[int]) -> float:
    row = sheet.rows[index]
    labels = [cell for cell in row if is_text_label(cell)]
    filled = [cell for cell in row if not cell.empty]
    if len(labels) < 2 or index in titles:
        return 0.0
    # Headers are mostly labels and are followed by rows that fill the same columns.
    label_share = len(labels) / max(len(filled), 1)
    label_columns = {column for column, cell in enumerate(row) if is_text_label(cell)}
    below = sheet.rows[index + 1 : index + 6]
    support = sum(
        len(label_columns & {column for column, cell in enumerate(next_row) if not cell.empty})
        / len(label_columns)
        for next_row in below
    ) / max(len(below), 1)
    # A row of labels whose own values repeat below is data, not a header.
    distinct = len({normalize_label(cell.value) for cell in labels}) / len(labels)
    return len(labels) * label_share * (0.3 + support) * distinct


def find_header_row(sheet: Sheet) -> int | None:
    titles = merged_title_rows(sheet)
    for first_row, _first_col, last_row, _last_col in sheet.tables:
        if last_row > first_row:
            return first_row
    if 0 < sheet.frozen_rows <= HEADER_SEARCH_ROWS:
        candidate = sheet.frozen_rows - 1
        if candidate < len(sheet.rows) and header_score(sheet, candidate, titles) > 0:
            return candidate
    scores = [
        (header_score(sheet, index, titles), index)
        for index in range(min(len(sheet.rows), HEADER_SEARCH_ROWS))
    ]
    best_score, best_index = max(scores, default=(0.0, -1))
    return best_index if best_score > 0 else None


def is_total_row(cells: list[Cell]) -> bool:
    filled = [cell for cell in cells if not cell.empty]
    if not filled:
        return False
    first = next((cell for cell in filled if isinstance(cell.value, str)), None)
    if first is not None and TOTAL_LABELS.match(str(first.value)):
        return True
    # A row made only of formulas (sums under the table) carries no wine.
    return all(cell.formula for cell in filled) and len(filled) >= 1


def extract_table(sheet: Sheet) -> Table | None:
    header_row = find_header_row(sheet)
    if header_row is None:
        return None
    header_cells = sheet.rows[header_row]
    columns = [column for column, cell in enumerate(header_cells) if not cell.empty]
    headers = [str(header_cells[column].value).strip() for column in columns]
    # Repeated header names get a suffix so each column stays addressable.
    seen: dict[str, int] = {}
    for position, header in enumerate(headers):
        key = normalize_label(header)
        seen[key] = seen.get(key, 0) + 1
        if seen[key] > 1:
            headers[position] = f"{header} ({seen[key]})"
    last_row = len(sheet.rows) - 1
    for first_row, _first_col, table_last_row, _last_col in sheet.tables:
        if first_row == header_row:
            last_row = min(last_row, table_last_row)
    rows: list[list[Cell]] = []
    row_numbers: list[int] = []
    for index in range(header_row + 1, last_row + 1):
        source = sheet.rows[index]
        cells = [source[column] if column < len(source) else Cell() for column in columns]
        if all(cell.empty for cell in cells) or is_total_row(cells):
            continue
        rows.append(cells)
        row_numbers.append(index + 1)
        if len(rows) > MAX_ROWS:
            raise SpreadsheetError("too_many_rows", f"A sheet has more than {MAX_ROWS} rows.")
    if not rows:
        return None
    dropdowns = {
        columns.index(column): options
        for column, options in sheet.dropdowns.items()
        if column in columns
    }
    return Table(
        sheet=sheet.name,
        header_row=header_row,
        headers=headers,
        columns=columns,
        rows=rows,
        row_numbers=row_numbers,
        dropdowns=dropdowns,
    )


def group_tables(tables: list[Table]) -> list[TableGroup]:
    groups: dict[tuple[str, ...], TableGroup] = {}
    for table in tables:
        key = tuple(normalize_label(header) for header in table.headers)
        if key in groups:
            groups[key].tables.append(table)
        else:
            groups[key] = TableGroup(tables=[table])
    return list(groups.values())


def cell_text(cell: Cell) -> str:
    value = cell.value
    if value is None:
        return ""
    if isinstance(value, datetime):
        return (
            value.date().isoformat()
            if value.time() == datetime.min.time()
            else value.isoformat(sep=" ")
        )
    if isinstance(value, date):
        return value.isoformat()
    if isinstance(value, float) and value.is_integer():
        return str(int(value))
    return str(value).strip()
