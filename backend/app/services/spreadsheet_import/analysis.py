"""First step of the import: read the file and propose how to import each table.

Nothing is written and nothing is stored: the answer describes the tables, the
proposed kind and field of every column, and the questions the user must answer
before a preview (ambiguous "$", day/month order, verbal ratings...).
"""

from __future__ import annotations

import hashlib
import json
from collections import Counter

from app.schemas.spreadsheet_import import (
    SpreadsheetAnalysis,
    SpreadsheetColumn,
    SpreadsheetQuestion,
    SpreadsheetSkippedSheet,
    SpreadsheetTableAnalysis,
)
from app.services.spreadsheet_import.columns import (
    MULTI_FIELDS,
    ColumnProposal,
    profile_column,
    propose_columns,
    score_scale,
)
from app.services.spreadsheet_import.movements import direction_from_names
from app.services.spreadsheet_import.reader import Cell, Workbook
from app.services.spreadsheet_import.sheet_kind import FIELDS_BY_KIND, detect_kind, remap_field
from app.services.spreadsheet_import.tables import (
    TableGroup,
    extract_tables,
    group_tables,
    normalize_label,
)
from app.services.spreadsheet_import.values import (
    VERBAL_RATINGS,
    column_currency,
    currency_in,
    date_order,
    numeric_date_parts,
    parse_wine_type,
)

MONEY_FIELDS = {"price", "current_value", "target_price"}
DATE_FIELDS = {"order_date", "event_date"}
AMBIGUOUS_DOLLAR_OPTIONS = ["USD", "CAD", "AUD", "NZD"]


def group_columns(group: TableGroup) -> list[list[Cell]]:
    width = len(group.headers)
    return [[row[index] for table in group.tables for row in table.rows] for index in range(width)]


def virtual_columns(group: TableGroup) -> list[tuple[str, str, list[Cell]]]:
    """The sheet name (for sheets merged into one table) and section rows, as columns."""
    columns = []
    if len(group.sheets) > 1:
        columns.append(
            ("sheet", "Foglio", [Cell(table.sheet) for table in group.tables for _ in table.rows])
        )
    if any(table.sections for table in group.tables):
        columns.append(
            (
                "section",
                "Sezione",
                [
                    Cell(table.sections[index] if table.sections else None)
                    for table in group.tables
                    for index in range(len(table.rows))
                ],
            )
        )
    return columns


def virtual_proposal(
    key: str, header: str, cells: list[Cell], proposals: list[ColumnProposal]
) -> ColumnProposal:
    """The sheet name is the location; a location column beside it becomes the bin."""
    profile = profile_column(cells, header)
    taken = {proposal.field for proposal in proposals}
    location = next((proposal for proposal in proposals if proposal.field == "location"), None)
    if location is not None and "bin" not in taken and not location.position_separator:
        location.alternatives = ["location", *location.alternatives][:3]
        location.field = "bin"
        taken.discard("location")
    field = "location" if "location" not in taken else "tags"
    return ColumnProposal(
        key=key,
        header=header,
        field=field,
        confidence="medium",
        source="sheet_name" if key == "sheet" else "section",
        alternatives=[
            option for option in ("location", "type", "tags", "ignore") if option != field
        ],
        samples=list(dict.fromkeys(profile.texts))[:3],
        filled=profile.filled,
        profile=profile,
    )


def formula_share(columns: list[list[Cell]]) -> float:
    cells = [cell for column in columns for cell in column if cell.formula or not cell.empty]
    return sum(cell.formula for cell in cells) / len(cells) if cells else 0.0


def apply_kind(proposals: list[ColumnProposal], kind: str) -> None:
    """Move fields the kind has no place for, keeping single fields single."""
    taken = {proposal.field for proposal in proposals if proposal.field in FIELDS_BY_KIND[kind]}
    for proposal in proposals:
        if proposal.field in FIELDS_BY_KIND[kind]:
            continue
        target = remap_field(kind, proposal.field)
        if target in taken and target not in MULTI_FIELDS:
            target = "notes" if "notes" in FIELDS_BY_KIND[kind] else "ignore"
        proposal.alternatives = [proposal.field, *proposal.alternatives][:3]
        proposal.field = target
        taken.add(target)


def column_contract(
    proposal: ColumnProposal, cells: list[Cell], questions: list[SpreadsheetQuestion]
) -> SpreadsheetColumn:
    column = SpreadsheetColumn(
        key=proposal.key,
        header=proposal.header,
        field=proposal.field,
        confidence=proposal.confidence,  # type: ignore[arg-type]
        source=proposal.source,
        alternatives=proposal.alternatives,
        samples=proposal.samples,
        filled=proposal.filled,
        formulas_without_values=proposal.formulas_without_values,
        rejected_field=proposal.rejected_field,
        name_order=proposal.name_order,  # type: ignore[arg-type]
        position_separator=proposal.position_separator,
    )
    values = [cell.value for cell in cells if not cell.empty]
    if proposal.field in MONEY_FIELDS:
        found = column_currency(proposal.header, values, [cell.number_format for cell in cells])
        if found:
            column.currency, column.currency_ambiguous = found
        if column.currency_ambiguous:
            questions.append(
                SpreadsheetQuestion(
                    code="currency",
                    column=proposal.key,
                    default=column.currency,
                    options=AMBIGUOUS_DOLLAR_OPTIONS,
                    examples=["$"],
                )
            )
    if proposal.field in DATE_FIELDS:
        text_dates = [
            value for value in values if isinstance(value, str) and numeric_date_parts(value)
        ]
        order = date_order(text_dates)
        ambiguous = [value for value in text_dates if numeric_date_parts(value)[0] <= 31]  # type: ignore[index]
        column.date_order = order or ("dmy" if ambiguous else "")  # type: ignore[assignment]
        if ambiguous and order is None:
            questions.append(
                SpreadsheetQuestion(
                    code="date_order",
                    column=proposal.key,
                    default="dmy",
                    options=["dmy", "mdy"],
                    examples=list(dict.fromkeys(ambiguous))[:3],
                )
            )
    if proposal.field == "score":
        column.score_scale = score_scale(proposal.header, proposal.profile)
    if proposal.field == "rating_words":
        words = [normalize_label(value) for value in values if isinstance(value, str)]
        questions.append(
            SpreadsheetQuestion(
                code="rating_words",
                column=proposal.key,
                default="standard",
                options=["standard", "notes_only"],
                examples=[word for word in dict.fromkeys(words) if word in VERBAL_RATINGS][:6],
            )
        )
    if proposal.field == "location" and proposal.position_separator:
        questions.append(
            SpreadsheetQuestion(
                code="position_split",
                column=proposal.key,
                default="split",
                options=["split", "keep"],
                examples=proposal.samples,
            )
        )
    return column


def table_currency(columns: list[SpreadsheetColumn], cells: dict[str, list[Cell]]) -> str:
    currency_column = next((column for column in columns if column.field == "currency"), None)
    if currency_column is not None:
        codes = Counter(
            found[0]
            for cell in cells[currency_column.key]
            if isinstance(cell.value, str) and (found := currency_in(cell.value))
        )
        if codes:
            return codes.most_common(1)[0][0]
    return next((column.currency for column in columns if column.currency), "")


def analyze_group(table_id: str, group: TableGroup) -> SpreadsheetTableAnalysis:
    first = group.tables[0]
    headers = list(group.headers)
    cells = group_columns(group)
    keys = [f"c{index}" for index in range(len(headers))]
    categorical = {index for table in group.tables for index in table.dropdowns}
    proposals = propose_columns(headers, cells, keys, categorical)
    cells_by_key = dict(zip(keys, cells, strict=True))
    for key, header, virtual_cells in virtual_columns(group):
        proposals.append(virtual_proposal(key, header, virtual_cells, proposals))
        cells_by_key[key] = virtual_cells
    taken = {proposal.field for proposal in proposals}
    names = [*group.sheets, *(table.title for table in group.tables if table.title)]
    kind, confidence = detect_kind(taken, names, formula_share(cells))
    apply_kind(proposals, kind)
    questions: list[SpreadsheetQuestion] = []
    columns = [
        column_contract(proposal, cells_by_key[proposal.key], questions) for proposal in proposals
    ]
    warnings = []
    if any(column.formulas_without_values for column in columns if column.field != "ignore"):
        warnings.append("formulas_without_values")
    if any(column.rejected_field for column in columns):
        warnings.append("header_rejected")
    if kind not in {"summary", "ignore"} and not any(column.field == "name" for column in columns):
        warnings.append("no_name_column")
    if (
        len(group.sheets) > 1
        and not any(column.field == "type" for column in columns)
        and any(parse_wine_type(sheet) for sheet in group.sheets)
    ):
        warnings.append("type_from_sheet_name")
    return SpreadsheetTableAnalysis(
        id=table_id,
        sheets=group.sheets,
        title=first.title,
        header_row=first.header_row + 1,
        row_count=group.row_count,
        kind=kind,  # type: ignore[arg-type]
        kind_confidence=confidence,  # type: ignore[arg-type]
        allowed_fields=list(FIELDS_BY_KIND[kind]),
        columns=columns,
        currency=table_currency(columns, cells_by_key),
        questions=questions,
        warnings=warnings,
        movement_direction=direction_from_names(names),  # type: ignore[arg-type]
    )


def layout_fingerprint(groups: list[TableGroup]) -> str:
    layout = [
        [group.sheets, [normalize_label(header) for header in group.headers]] for group in groups
    ]
    return hashlib.sha256(json.dumps(layout, ensure_ascii=False).encode()).hexdigest()[:32]


def analyze_workbook(workbook: Workbook) -> SpreadsheetAnalysis:
    tables = []
    skipped = []
    for sheet in workbook.sheets:
        found = extract_tables(sheet)
        if not found:
            skipped.append(SpreadsheetSkippedSheet(name=sheet.name, reason="no_table"))
        tables.extend(found)
    groups = group_tables(tables)
    return SpreadsheetAnalysis(
        file_format=workbook.file_format,  # type: ignore[arg-type]
        fingerprint=layout_fingerprint(groups),
        tables=[analyze_group(f"t{index}", group) for index, group in enumerate(groups)],
        skipped_sheets=skipped,
        fields_by_kind={kind: list(fields) for kind, fields in FIELDS_BY_KIND.items()},
    )
