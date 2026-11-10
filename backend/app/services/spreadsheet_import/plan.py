"""Turn a file and the mapping the user confirmed into a typed import plan.

The plan holds the cellar wines (with bottles per location and bin), the
wishlist items and the tastings, plus the name splits and the warnings the
preview shows. It reads no database: the caller passes the known producers and
the cellar's currency, and the persistence step writes the plan.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from datetime import date
from decimal import Decimal
from typing import Any

from app.schemas.spreadsheet_import import (
    SpreadsheetBalanceExample,
    SpreadsheetMapping,
    SpreadsheetNameRow,
    SpreadsheetTableMapping,
    SpreadsheetTablePreview,
    SpreadsheetWarning,
)
from app.services.spreadsheet_import.analysis import (
    group_columns,
    layout_fingerprint,
    virtual_columns,
)
from app.services.spreadsheet_import.columns import (
    SYNONYMS,
    name_order,
    profile_column,
    score_scale,
)
from app.services.spreadsheet_import.movements import (
    PlannedMovement,
    StockPlan,
    balance_example,
    movement_rows,
    settle_movements,
)
from app.services.spreadsheet_import.names import NameSplit, split_names
from app.services.spreadsheet_import.reader import Cell, SpreadsheetError, Workbook
from app.services.spreadsheet_import.sheet_kind import FIELDS_BY_KIND
from app.services.spreadsheet_import.tables import (
    TableGroup,
    cell_text,
    extract_tables,
    group_tables,
    normalize_label,
)
from app.services.spreadsheet_import.values import (
    VERBAL_RATINGS,
    currency_in,
    date_order,
    parse_bottle_format,
    parse_date,
    parse_drink_window,
    parse_number,
    parse_quantity,
    parse_vintage,
    parse_wine_type,
    parse_year,
    parse_yes_no,
    position_separator,
    split_position,
)

DEFAULT_FORMAT = "Bottle (750ml)"
IMPORT_TAG = "Excel"
NOTE_HEADERS = {normalize_label(synonym) for synonym in SYNONYMS["notes"]}
PRIORITIES = {
    "alta": "High",
    "high": "High",
    "haute": "High",
    "hoch": "High",
    "media": "Medium",
    "medium": "Medium",
    "moyenne": "Medium",
    "mittel": "Medium",
    "bassa": "Low",
    "low": "Low",
    "basse": "Low",
    "niedrig": "Low",
}
UNMATCHED_MOVEMENTS = {"movement_without_wine", "movement_ambiguous_wine"}
NAME_KINDS = {"inventory", "wishlist", "tasting", "movements"}


@dataclass
class PlannedTasting:
    ref: str
    name: str
    producer: str
    vintage: str
    consumed_at: date
    data: dict[str, Any]
    wine_type: str = ""
    buy_again: bool = False


@dataclass
class ImportPlan:
    # (Wine fields, bottles per (location, bin)), as persist_imported_wines takes them.
    wines: list[tuple[dict[str, Any], dict[tuple[str, str], int]]] = field(default_factory=list)
    wishlist: list[dict[str, Any]] = field(default_factory=list)
    tastings: list[PlannedTasting] = field(default_factory=list)
    names: list[SpreadsheetNameRow] = field(default_factory=list)
    warnings: list[SpreadsheetWarning] = field(default_factory=list)
    tables: list[SpreadsheetTablePreview] = field(default_factory=list)
    # Movement registers (movements.py): the ledger of each wine they touch, the
    # bottles they say were drunk, and what the preview must still ask.
    movements_total: int = 0
    movements_unmatched: int = 0
    stock: list[StockPlan] = field(default_factory=list)
    movement_tastings: list[tuple[StockPlan, PlannedTasting]] = field(default_factory=list)
    balance_questions: set[str] = field(default_factory=set)
    balance_example: SpreadsheetBalanceExample | None = None
    # id() of planned wines whose quantity the file does not state (a formula with
    # no saved value, or a wine only the register knows).
    unknown_quantity: set[int] = field(default_factory=set)
    unknown_rows: set[str] = field(default_factory=set)


@dataclass
class TableRows:
    """The cells of one table group by column key, and where each row comes from."""

    table_id: str
    headers: dict[str, str]
    cells: dict[str, list[Cell]]
    sheets: list[str]
    row_numbers: list[int]

    @property
    def count(self) -> int:
        return len(self.row_numbers)

    def ref(self, index: int) -> str:
        return f"{self.table_id}:{self.sheets[index]}!{self.row_numbers[index]}"


def table_rows(table_id: str, group: TableGroup) -> TableRows:
    keys = [f"c{index}" for index in range(len(group.headers))]
    cells = dict(zip(keys, group_columns(group), strict=True))
    headers = dict(zip(keys, group.headers, strict=True))
    for key, header, virtual_cells in virtual_columns(group):
        cells[key] = virtual_cells
        headers[key] = header
    return TableRows(
        table_id=table_id,
        headers=headers,
        cells=cells,
        sheets=[table.sheet for table in group.tables for _ in table.rows],
        row_numbers=[number for table in group.tables for number in table.row_numbers],
    )


class Row:
    """One row read through the confirmed mapping."""

    def __init__(self, rows: TableRows, mapping: SpreadsheetTableMapping, index: int) -> None:
        self.rows = rows
        self.mapping = mapping
        self.index = index
        self.by_field: dict[str, list[str]] = {}
        for key, field_name in mapping.columns.items():
            if key in rows.cells:
                self.by_field.setdefault(field_name, []).append(key)

    def cell(self, field_name: str) -> Cell:
        keys = self.by_field.get(field_name)
        return self.rows.cells[keys[0]][self.index] if keys else Cell()

    def key(self, field_name: str) -> str:
        keys = self.by_field.get(field_name)
        return keys[0] if keys else ""

    def text(self, field_name: str) -> str:
        return cell_text(self.cell(field_name))

    def has(self, field_name: str) -> bool:
        return field_name in self.by_field

    def labelled(self, field_name: str, *, always_label: bool = False) -> list[str]:
        """ "Header: value" for each column of a notes-like field."""
        parts = []
        for key in self.by_field.get(field_name, []):
            value = cell_text(self.rows.cells[key][self.index])
            if not value:
                continue
            header = self.rows.headers[key]
            plain = not always_label and normalize_label(header) in NOTE_HEADERS
            parts.append(value if plain else f"{header}: {value}")
        return parts

    def tag_values(self) -> list[str]:
        tags = []
        for key in self.by_field.get("tags", []):
            value = cell_text(self.rows.cells[key][self.index])
            tags.extend(part.strip()[:80] for part in re.split(r"[/,;]", value) if part.strip())
        return tags


def check_mapping(groups: list[TableGroup], mapping: SpreadsheetMapping) -> None:
    if mapping.fingerprint != layout_fingerprint(groups):
        raise SpreadsheetError("layout_changed", "The file changed since the analysis.")
    for table in mapping.tables:
        if not re.fullmatch(r"t\d+", table.id) or int(table.id[1:]) >= len(groups):
            raise SpreadsheetError("invalid_mapping", f"Unknown table {table.id}.")
        allowed = FIELDS_BY_KIND[table.kind]
        single = [
            field_name
            for field_name in table.columns.values()
            if field_name not in {"notes", "tags", "ignore"}
        ]
        if any(field_name not in allowed for field_name in table.columns.values()) or len(
            single
        ) != len(set(single)):
            raise SpreadsheetError("invalid_mapping", f"Invalid fields for table {table.id}.")


def column_date_order(row: Row, field_name: str) -> str:
    key = row.key(field_name)
    if key in row.mapping.date_orders:
        return row.mapping.date_orders[key]
    values = [cell.value for cell in row.rows.cells.get(key, [])]
    return date_order(values) or "dmy"


def row_currency(row: Row, table_currency: str) -> str:
    found = currency_in(row.text("currency")) if row.has("currency") else None
    return found[0] if found else table_currency


def money(row: Row, field_name: str) -> Decimal | None:
    if not row.has(field_name):
        return None
    return parse_number(row.cell(field_name).value)


def wine_identity(
    rows: TableRows,
    mapping: SpreadsheetTableMapping,
    producers: dict[str, str],
    order_hint: str,
) -> list[NameSplit]:
    def texts(field_name: str) -> list[str]:
        keys = [key for key, value in mapping.columns.items() if value == field_name]
        if not keys or keys[0] not in rows.cells:
            return [""] * rows.count
        return [cell_text(cell) for cell in rows.cells[keys[0]]]

    vintage_cells = next(
        (
            rows.cells[key]
            for key, value in mapping.columns.items()
            if value == "vintage" and key in rows.cells
        ),
        None,
    )
    vintages = (
        [parse_vintage(cell.value) or "" for cell in vintage_cells]
        if vintage_cells
        else [""] * rows.count
    )
    splits = split_names(
        texts("name"),
        producer_values=texts("producer"),
        vintage_values=vintages,
        order_hint=order_hint,
        producers=producers,
    )
    for index, split in enumerate(splits):
        override = mapping.name_overrides.get(rows.ref(index))
        if override is not None:
            splits[index] = NameSplit(
                split.raw,
                override.producer.strip(),
                override.name.strip(),
                override.vintage.strip(),
                "override",
            )
    return splits


def wine_type(row: Row) -> str:
    if row.has("type"):
        found = parse_wine_type(row.text("type"))
        if found:
            return found
    # One sheet per colour ("Scaffale A - rossi"): the sheet or section names the type.
    for key in ("sheet", "section"):
        if key in row.rows.cells and not row.has("type"):
            found = parse_wine_type(cell_text(row.rows.cells[key][row.index]))
            if found:
                return found
    return ""


def quantity_of(row: Row, plan: ImportPlan) -> int:
    def warn(code: str, column: str = "") -> None:
        plan.warnings.append(
            SpreadsheetWarning(
                code=code,
                table_id=row.rows.table_id,
                sheet=row.rows.sheets[row.index],
                row=row.rows.row_numbers[row.index],
                column=column,
            )
        )

    if row.has("quantity"):
        cell = row.cell("quantity")
        quantity = parse_quantity(cell.value)
        if quantity is not None:
            return quantity
        if not (cell.formula and cell.empty):
            if not cell.empty:
                warn("unreadable_value", row.key("quantity"))
            return 0
    if row.has("cases") or row.has("loose"):
        cases = parse_quantity(row.cell("cases").value) or 0
        size = parse_quantity(row.cell("case_size").value) or (6 if cases else 0)
        return cases * size + (parse_quantity(row.cell("loose").value) or 0)
    if row.has("quantity"):
        warn("formula_without_value", row.key("quantity"))
        plan.unknown_rows.add(row.rows.ref(row.index))
        return 0
    warn("quantity_assumed")
    return 1


def position_of(row: Row) -> tuple[str, str]:
    location, bin_name = row.text("location"), row.text("bin")
    key = row.key("location")
    if location and not bin_name and row.mapping.split_positions.get(key, False):
        separator = position_separator([cell_text(cell) for cell in row.rows.cells[key]])
        location, bin_name = split_position(location, separator)
    return location[:80], bin_name[:80]


def format_of(row: Row, plan: ImportPlan) -> str:
    if not row.has("format"):
        return DEFAULT_FORMAT
    raw = row.text("format")
    found = parse_bottle_format(row.cell("format").value, row.rows.headers[row.key("format")])
    if raw and not found:
        plan.warnings.append(
            SpreadsheetWarning(
                code="unknown_format",
                table_id=row.rows.table_id,
                sheet=row.rows.sheets[row.index],
                row=row.rows.row_numbers[row.index],
                column=row.key("format"),
                value=raw[:40],
            )
        )
    return found or (DEFAULT_FORMAT if not raw else "")


def grapes_of(row: Row) -> list[dict[str, str]]:
    return [
        {"name": part.strip()[:80]}
        for part in re.split(r"[,;/+]", row.text("grapes"))
        if part.strip()
    ]


def owners_of(row: Row) -> list[dict[str, Any]]:
    names = [part.strip()[:80] for part in re.split(r"[,;/&+]", row.text("owners")) if part.strip()]
    if not names:
        return []
    share = round(100 / len(names), 2)
    return [{"name": name, "share_pct": share} for name in names]


def drink_years(row: Row) -> tuple[int | None, int | None]:
    start = parse_year(row.cell("drink_from").value) if row.has("drink_from") else None
    end = parse_year(row.cell("drink_to").value) if row.has("drink_to") else None
    if row.has("drink_window"):
        window_start, window_end = parse_drink_window(row.cell("drink_window").value)
        start, end = start or window_start, end or window_end
    return start, end


def inventory_row(
    row: Row,
    split: NameSplit,
    plan: ImportPlan,
    context_ids: dict[str, Any],
    table_currency: str,
) -> tuple[dict[str, Any], tuple[str, str]]:
    notes = [*row.labelled("notes"), *row.labelled("consumed_count", always_label=True)]
    start, end = drink_years(row)
    order_date = (
        parse_date(row.cell("order_date").value, column_date_order(row, "order_date"))
        if row.has("order_date")
        else None
    )
    data = {
        **context_ids,
        "name": split.name[:200] or "Unnamed wine",
        "producer": split.producer[:200],
        "vintage": split.vintage[:16],
        "quantity": quantity_of(row, plan),
        "currency": row_currency(row, table_currency),
        "price": money(row, "price") or Decimal(0),
        "current_value": money(row, "current_value"),
        "status": "Delivered",
        "format": format_of(row, plan),
        "type": wine_type(row),
        "region": row.text("region")[:120],
        "appellation": row.text("appellation")[:120],
        "vineyard_country": row.text("country")[:120],
        "grapes": grapes_of(row),
        "merchant": row.text("merchant")[:160],
        "order_date": order_date,
        "drink_from": start,
        "drink_to": end,
        "owners": owners_of(row),
        "notes": "\n".join(notes),
        "tags": list(dict.fromkeys([IMPORT_TAG, *row.tag_values()])),
    }
    return data, position_of(row)


def wishlist_row(
    row: Row, split: NameSplit, context_ids: dict[str, Any], table_currency: str
) -> dict[str, Any]:
    notes = row.labelled("notes")
    if row.has("quantity") and row.text("quantity"):
        notes.append(f"{row.rows.headers[row.key('quantity')]}: {row.text('quantity')}")
    priority = PRIORITIES.get(normalize_label(row.text("priority")), "Medium")
    return {
        "household_id": context_ids["household_id"],
        "created_by_user_id": context_ids["created_by_user_id"],
        "name": split.name[:200] or "Unnamed wine",
        "producer": split.producer[:200],
        "vintage": split.vintage[:16],
        "format": DEFAULT_FORMAT
        if not row.has("format")
        else parse_bottle_format(row.cell("format").value),
        "type": wine_type(row),
        "region": row.text("region")[:120],
        "appellation": row.text("appellation")[:120],
        "country": row.text("country")[:120],
        "grapes": grapes_of(row),
        "target_price": money(row, "target_price") or Decimal(0),
        "currency": row_currency(row, table_currency),
        "merchant": row.text("merchant")[:160],
        "priority": priority,
        "notes": "\n".join([*notes, *row.tag_values()]),
    }


def tasting_row(row: Row, split: NameSplit, plan: ImportPlan) -> PlannedTasting | None:
    consumed_at = parse_date(row.cell("event_date").value, column_date_order(row, "event_date"))
    if consumed_at is None:
        plan.warnings.append(
            SpreadsheetWarning(
                code="tasting_without_date",
                table_id=row.rows.table_id,
                sheet=row.rows.sheets[row.index],
                row=row.rows.row_numbers[row.index],
                value=split.raw[:80],
            )
        )
        return None
    notes = row.labelled("notes")
    rating = 0.0
    score_value: Decimal | None = None
    scale: int | None = None
    if row.has("score"):
        score_value = parse_number(row.cell("score").value)
        if score_value is not None:
            header = row.rows.headers[row.key("score")]
            values = [cell for cell in row.rows.cells[row.key("score")] if not cell.empty]
            scale = score_scale(header, profile_column(values, header))
            rating = float(score_value) / scale * 6
    if row.has("rating_words") and row.text("rating_words"):
        words = row.text("rating_words")
        notes.append(f"{row.rows.headers[row.key('rating_words')]}: {words}")
        if row.mapping.rating_words == "standard" and not rating:
            rating = VERBAL_RATINGS.get(normalize_label(words), 0.0)
    return PlannedTasting(
        ref=row.rows.ref(row.index),
        name=split.name,
        producer=split.producer,
        vintage=split.vintage,
        consumed_at=consumed_at,
        wine_type=wine_type(row),
        buy_again=bool(row.has("buy_again") and parse_yes_no(row.cell("buy_again").value)),
        data={
            "note": "\n".join(notes),
            "rating": max(0.0, min(round(rating * 2) / 2, 6.0)),
            "score_value": score_value,
            "score_scale": scale,
            "occasion": row.text("occasion")[:200],
            "pairing": row.text("pairing")[:300],
            "companions": row.text("companions")[:300],
            "source": "spreadsheet",
            "source_text": " | ".join(
                f"{row.rows.headers[key]}: {cell_text(row.rows.cells[key][row.index])}"
                for key in row.rows.cells
                if cell_text(row.rows.cells[key][row.index])
            )[:2000],
        },
    )


def table_name_order(rows: TableRows, mapping: SpreadsheetTableMapping) -> str:
    """ "Produttore e vino" says the producer comes first in every cell."""
    key = next((key for key, value in mapping.columns.items() if value == "name"), "")
    return name_order(rows.headers.get(key, "")) if key else ""


def build_plan(
    workbook: Workbook,
    mapping: SpreadsheetMapping,
    *,
    producers: dict[str, str],
    default_currency: str,
    context_ids: dict[str, Any],
) -> ImportPlan:
    """`context_ids` holds household_id and created_by_user_id for new records."""
    groups = group_tables([table for sheet in workbook.sheets for table in extract_tables(sheet)])
    check_mapping(groups, mapping)
    plan = ImportPlan()
    grouped: dict[tuple[str, ...], tuple[dict[str, Any], dict[tuple[str, str], int]]] = {}
    movements: list[PlannedMovement] = []
    previews: dict[str, SpreadsheetTablePreview] = {}
    # Cellar sheet of each planned wine, and where wines with no stated count stand.
    stock_sheets: dict[int, str] = {}
    unplaced: dict[int, tuple[str, str]] = {}
    for table_mapping in mapping.tables:
        group = groups[int(table_mapping.id[1:])]
        rows = table_rows(table_mapping.id, group)
        preview = SpreadsheetTablePreview(
            id=table_mapping.id, kind=table_mapping.kind, rows=rows.count
        )
        plan.tables.append(preview)
        previews[table_mapping.id] = preview
        kind = table_mapping.kind
        if kind not in NAME_KINDS:
            continue
        splits = wine_identity(
            rows, table_mapping, producers, table_name_order(rows, table_mapping)
        )
        currency = table_mapping.currency or default_currency
        for index, split in enumerate(splits):
            if not split.name:
                preview.skipped_rows += 1
                continue
            plan.names.append(
                SpreadsheetNameRow(
                    ref=rows.ref(index),
                    table_id=table_mapping.id,
                    sheet=rows.sheets[index],
                    row=rows.row_numbers[index],
                    raw=split.raw,
                    producer=split.producer,
                    name=split.name,
                    vintage=split.vintage,
                    rule=split.rule,
                )
            )
            row = Row(rows, table_mapping, index)
            if kind == "movements":
                found = movement_rows(row, split, table_mapping, plan)
                if not found:
                    preview.skipped_rows += 1
                movements.extend(found)
            elif kind == "inventory":
                data, position = inventory_row(row, split, plan, context_ids, currency)
                key = (
                    normalize_label(data["name"]),
                    normalize_label(data["producer"]),
                    normalize_label(data["vintage"]),
                    normalize_label(data["format"]),
                    normalize_label(data["type"]),
                )
                if key in grouped:
                    grouped[key][0]["quantity"] += data["quantity"]
                else:
                    grouped[key] = (data, {})
                    plan.wines.append(grouped[key])
                    preview.wines += 1
                    stock_sheets[id(data)] = rows.sheets[index]
                wine_id = id(grouped[key][0])
                if rows.ref(index) in plan.unknown_rows:
                    plan.unknown_quantity.add(wine_id)
                    if position[0]:
                        unplaced.setdefault(wine_id, position)
                if data["quantity"] > 0 and position[0]:
                    allocations = grouped[key][1]
                    allocations[position] = allocations.get(position, 0) + data["quantity"]
                preview.bottles += data["quantity"]
            elif kind == "wishlist":
                plan.wishlist.append(wishlist_row(row, split, context_ids, currency))
                preview.wishlist += 1
            else:
                tasting = tasting_row(row, split, plan)
                if tasting is None:
                    preview.skipped_rows += 1
                    continue
                tasting.buy_again = tasting.buy_again and table_mapping.buy_again_to_wishlist
                plan.tastings.append(tasting)
                preview.tastings += 1
    if movements:
        plan.movements_total = len(movements)
        plan.balance_example = balance_example(plan, movements, stock_sheets)
        settle_movements(
            plan,
            movements,
            {table.id: table for table in mapping.tables},
            previews,
            context_ids=context_ids,
            currency=default_currency,
        )
        plan.movements_unmatched = sum(
            1 for warning in plan.warnings if warning.code in UNMATCHED_MOVEMENTS
        )
        # A count the register worked out goes where the cellar sheet put the wine.
        for data, allocations in plan.wines:
            position = unplaced.get(id(data))
            if position and not allocations and data["quantity"] > 0:
                allocations[position] = data["quantity"]
    return plan
