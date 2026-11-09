"""Find the data tables in each sheet and group tables that share one layout.

Signals, strongest first: an Excel table, the rows frozen above the data, then a
score per row (text labels over a run of filled rows). Titles on merged cells,
blank rows and total rows are dropped.

A sheet can hold more than one table: side by side (separated by empty
columns) or stacked (a blank row, then a new header over typed values). A
header can span two rows when a merged group label sits over its sub-labels
("Prezzo" over "Acquisto | Attuale"). A merged one-cell row inside the data is a
section label ("Rossi", "Scaffale 2") and is kept on the rows below it.
"""

from __future__ import annotations

import re
import unicodedata
from dataclasses import dataclass, field
from datetime import date, datetime

from app.services.spreadsheet_import.reader import MAX_ROWS, Cell, Sheet, SpreadsheetError

HEADER_SEARCH_ROWS = 15
# Rows above a header searched for the table's own title.
TITLE_SEARCH_ROWS = 4
TOTAL_LABELS = re.compile(
    r"^\s*(totale?|totali|total|totals|summe|gesamt|somme|sous-total|subtotal)\b", re.IGNORECASE
)


@dataclass
class Table:
    sheet: str
    # 0-based row index of the (last) header row in the sheet; data follows it.
    header_row: int
    headers: list[str]
    # Sheet column index of each header.
    columns: list[int]
    # Data cells aligned to `headers`, with the 1-based sheet row of each.
    rows: list[list[Cell]]
    row_numbers: list[int]
    dropdowns: dict[int, list[str]] = field(default_factory=dict)
    # Text of the title above the table ("Wish list"), if any.
    title: str = ""
    # Section label of each row (merged rows inside the data); empty when none.
    sections: list[str] = field(default_factory=list)


@dataclass
class TableGroup:
    """Tables with the same header, imported as one (one sheet per shelf)."""

    tables: list[Table]

    @property
    def headers(self) -> list[str]:
        return self.tables[0].headers

    @property
    def sheets(self) -> list[str]:
        return list(dict.fromkeys(table.sheet for table in self.tables))

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


def cell_at(sheet: Sheet, row: int, column: int) -> Cell:
    if 0 <= row < len(sheet.rows) and 0 <= column < len(sheet.rows[row]):
        return sheet.rows[row][column]
    return Cell()


def filled_count(sheet: Sheet, row: int) -> int:
    return sum(1 for cell in sheet.rows[row] if not cell.empty) if row < len(sheet.rows) else 0


def merged_title_rows(sheet: Sheet) -> set[int]:
    """Rows holding one text merged across several columns, and little else."""
    titles = set()
    for first_row, first_col, last_row, last_col in sheet.merged:
        if first_row != last_row or last_col == first_col or first_row >= len(sheet.rows):
            continue
        filled = filled_count(sheet, first_row)
        if filled == 1 or (filled == 2 and last_col - first_col >= 2):
            titles.add(first_row)
    return titles


def header_score(sheet: Sheet, index: int, titles: set[int]) -> float:
    row = sheet.rows[index]
    labels = [cell for cell in row if is_text_label(cell)]
    filled = [cell for cell in row if not cell.empty]
    if len(labels) < 2 or index in titles:
        return 0.0
    # Headers are mostly labels and are followed by rows that fill the same columns.
    label_share = len(labels) / max(len(filled), 1)
    label_columns = {column for column, cell in enumerate(row) if is_text_label(cell)}
    # The rows of its own table: up to the first blank row after the data starts.
    below: list[list[Cell]] = []
    for next_row in sheet.rows[index + 1 : index + 6]:
        if all(cell.empty for cell in next_row):
            if below:
                break
            continue
        below.append(next_row)
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
    if 0 < sheet.frozen_rows <= HEADER_SEARCH_ROWS:
        candidate = sheet.frozen_rows - 1
        if candidate < len(sheet.rows) and header_score(sheet, candidate, titles) > 0:
            return candidate
    best_score, best_index = 0.0, None
    for index in range(min(len(sheet.rows), HEADER_SEARCH_ROWS)):
        score = header_score(sheet, index, titles)
        if score > best_score:
            best_score, best_index = score, index
    return best_index


# --- two-row headers -------------------------------------------------------


def horizontal_merges(sheet: Sheet, row: int) -> list[tuple[int, int]]:
    return [
        (first_col, last_col)
        for first_row, first_col, _last_row, last_col in sheet.merged
        if first_row == row and last_col > first_col
    ]


def is_group_band(sheet: Sheet, top: int, bottom: int) -> bool:
    """`top` holds merged group labels and `bottom` the labels under them."""
    groups = horizontal_merges(sheet, top)
    if not groups or bottom >= len(sheet.rows):
        return False
    bottom_cells = [cell for cell in sheet.rows[bottom] if not cell.empty]
    if not bottom_cells or not all(is_text_label(cell) for cell in bottom_cells):
        return False
    return any(
        is_text_label(cell_at(sheet, top, first_col))
        and sum(
            is_text_label(cell_at(sheet, bottom, col)) for col in range(first_col, last_col + 1)
        )
        >= 2
        for first_col, last_col in groups
    )


def header_band(sheet: Sheet, header_row: int, titles: set[int]) -> tuple[int, int]:
    if is_group_band(sheet, header_row, header_row + 1):
        return header_row, header_row + 1
    above = header_row - 1
    if above >= 0 and above not in titles and is_group_band(sheet, above, header_row):
        return above, header_row
    return header_row, header_row


def band_headers(sheet: Sheet, top: int, bottom: int) -> list[tuple[int, str]]:
    """(column, header) pairs, a group label joined to each of its sub-labels."""
    if top == bottom:
        return [
            (column, cell_text(cell))
            for column, cell in enumerate(sheet.rows[top])
            if not cell.empty
        ]
    group_of: dict[int, str] = {}
    for first_col, last_col in horizontal_merges(sheet, top):
        label = cell_text(cell_at(sheet, top, first_col))
        for column in range(first_col, last_col + 1):
            group_of[column] = label
    width = max(len(sheet.rows[top]), len(sheet.rows[bottom]))
    pairs: list[tuple[int, str]] = []
    for column in range(width):
        upper = group_of.get(column) or cell_text(cell_at(sheet, top, column))
        lower = cell_text(cell_at(sheet, bottom, column))
        header = " ".join(part for part in (upper, lower) if part)
        if header:
            pairs.append((column, header))
    return pairs


# --- rows ------------------------------------------------------------------


def is_total_row(cells: list[Cell]) -> bool:
    filled = [cell for cell in cells if not cell.empty]
    if not filled:
        return False
    first = next((cell for cell in filled if isinstance(cell.value, str)), None)
    if first is not None and TOTAL_LABELS.match(str(first.value)):
        return True
    # A row made only of formulas (sums under the table) carries no wine.
    return all(cell.formula for cell in filled)


def starts_new_table(sheet: Sheet, index: int) -> bool:
    """A row of labels over typed values (numbers, dates) is the next table's header."""
    row = sheet.rows[index]
    filled = [cell for cell in row if not cell.empty]
    label_columns = {column for column, cell in enumerate(row) if is_text_label(cell)}
    if len(label_columns) < 2 or len(label_columns) != len(filled):
        return False
    return any(
        column in label_columns and not cell.empty and not isinstance(cell.value, str)
        for next_row in sheet.rows[index + 1 : index + 4]
        for column, cell in enumerate(next_row)
    )


def table_title(sheet: Sheet, top: int, start: int) -> str:
    for index in range(top - 1, max(start, top - TITLE_SEARCH_ROWS) - 1, -1):
        filled = [cell for cell in sheet.rows[index] if not cell.empty]
        if len(filled) == 1 and is_text_label(filled[0]):
            return cell_text(filled[0])
    return ""


def unique_headers(headers: list[str]) -> list[str]:
    """Repeated header names get a suffix so each column stays addressable."""
    seen: dict[str, int] = {}
    result = []
    for header in headers:
        key = normalize_label(header)
        seen[key] = seen.get(key, 0) + 1
        result.append(f"{header} ({seen[key]})" if seen[key] > 1 else header)
    return result


def build_table(
    sheet: Sheet,
    top: int,
    bottom: int,
    *,
    span: tuple[int, int] | None,
    last_row: int,
    title_from: int,
    split: bool,
) -> tuple[Table | None, int | None]:
    """The table under the header band, and the row where the next table starts."""
    titles = merged_title_rows(sheet)
    pairs = band_headers(sheet, top, bottom)
    if span is not None:
        pairs = [(column, header) for column, header in pairs if span[0] <= column <= span[1]]
    if not pairs:
        return None, None
    columns = [column for column, _ in pairs]
    rows: list[list[Cell]] = []
    row_numbers: list[int] = []
    sections: list[str] = []
    section = ""
    after_gap = False
    next_header: int | None = None
    for index in range(bottom + 1, min(last_row, len(sheet.rows) - 1) + 1):
        source = sheet.rows[index]
        if index in titles:
            section = cell_text(next(cell for cell in source if not cell.empty))
            after_gap = True
            continue
        cells = [source[column] if column < len(source) else Cell() for column in columns]
        if all(cell.empty for cell in cells):
            after_gap = True
            continue
        if split and after_gap and starts_new_table(sheet, index):
            next_header = index
            break
        # A lone label between a gap and the next header is that table's title.
        filled = [cell for cell in source if not cell.empty]
        if (
            split
            and after_gap
            and len(filled) == 1
            and is_text_label(filled[0])
            and index + 1 < len(sheet.rows)
            and starts_new_table(sheet, index + 1)
        ):
            continue
        after_gap = False
        if is_total_row(cells):
            continue
        rows.append(cells)
        row_numbers.append(index + 1)
        sections.append(section)
        if len(rows) > MAX_ROWS:
            raise SpreadsheetError("too_many_rows", f"A sheet has more than {MAX_ROWS} rows.")
    if not rows:
        return None, next_header
    dropdowns = {
        columns.index(column): options
        for column, options in sheet.dropdowns.items()
        if column in columns
    }
    table = Table(
        sheet=sheet.name,
        header_row=bottom,
        headers=unique_headers([header for _, header in pairs]),
        columns=columns,
        rows=rows,
        row_numbers=row_numbers,
        dropdowns=dropdowns,
        title=table_title(sheet, top, title_from),
        sections=sections if any(sections) else [],
    )
    return table, next_header


def stacked_tables(sheet: Sheet) -> list[Table]:
    titles = merged_title_rows(sheet)
    tables: list[Table] = []
    start = 0
    header_row = find_header_row(sheet)
    while header_row is not None:
        top, bottom = header_band(sheet, header_row, titles)
        table, next_header = build_table(
            sheet,
            top,
            bottom,
            span=None,
            last_row=len(sheet.rows) - 1,
            title_from=start,
            split=True,
        )
        if table:
            tables.append(table)
        if next_header is None:
            break
        start = table.row_numbers[-1] if table else bottom + 1
        header_row = next_header
    return tables


# --- side by side ----------------------------------------------------------


def column_slices(sheet: Sheet, titles: set[int]) -> list[tuple[int, int]]:
    """Column ranges of tables placed side by side, split on empty columns.

    Only runs at least two columns wide start a slice; a lone column next to a
    table (a total, a note) stays with the table on its left.
    """
    width = max((len(row) for row in sheet.rows), default=0)
    used = [False] * width
    for index, row in enumerate(sheet.rows):
        if index in titles:
            continue
        for column, cell in enumerate(row):
            if not cell.empty:
                used[column] = True
    runs: list[tuple[int, int]] = []
    start: int | None = None
    for column, filled in enumerate([*used, False]):
        if filled and start is None:
            start = column
        elif not filled and start is not None:
            runs.append((start, column - 1))
            start = None
    starts = [first for first, last in runs if last > first]
    if len(starts) < 2:
        return []
    starts[0] = 0
    return [
        (first, starts[position + 1] - 1 if position + 1 < len(starts) else width - 1)
        for position, first in enumerate(starts)
    ]


def column_slice(sheet: Sheet, first: int, last: int) -> Sheet:
    return Sheet(
        name=sheet.name,
        rows=[row[first : last + 1] for row in sheet.rows],
        merged=[
            (first_row, first_col - first, last_row, min(last_col, last) - first)
            for first_row, first_col, last_row, last_col in sheet.merged
            if first <= first_col <= last
        ],
        frozen_rows=sheet.frozen_rows,
        dropdowns={
            column - first: options
            for column, options in sheet.dropdowns.items()
            if first <= column <= last
        },
    )


def join_spacer_splits(tables: list[Table]) -> list[Table]:
    """Two halves on the same rows are one table with an empty spacer column."""
    joined: list[Table] = []
    for table in tables:
        partner = next(
            (
                other
                for other in joined
                if other.header_row == table.header_row
                and other.row_numbers == table.row_numbers
                and max(other.columns) < min(table.columns)
            ),
            None,
        )
        if partner is None:
            joined.append(table)
            continue
        offset = len(partner.columns)
        partner.headers = unique_headers([*partner.headers, *table.headers])
        partner.columns = [*partner.columns, *table.columns]
        partner.rows = [left + right for left, right in zip(partner.rows, table.rows, strict=True)]
        partner.dropdowns.update(
            {index + offset: options for index, options in table.dropdowns.items()}
        )
    return joined


def extract_tables(sheet: Sheet) -> list[Table]:
    if sheet.tables:
        found = []
        for first_row, first_col, last_row, last_col in sorted(sheet.tables):
            if last_row <= first_row:
                continue
            table, _ = build_table(
                sheet,
                first_row,
                first_row,
                span=(first_col, last_col),
                last_row=last_row,
                title_from=0,
                split=False,
            )
            if table:
                found.append(table)
        return found
    slices = column_slices(sheet, merged_title_rows(sheet))
    if not slices:
        return stacked_tables(sheet)
    found = []
    for first, last in slices:
        for table in stacked_tables(column_slice(sheet, first, last)):
            table.columns = [column + first for column in table.columns]
            found.append(table)
    return join_spacer_splits(found)


def extract_table(sheet: Sheet) -> Table | None:
    """The first table of the sheet."""
    tables = extract_tables(sheet)
    return tables[0] if tables else None


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
