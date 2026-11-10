"""Movement registers (phase 2 of docs/SPREADSHEET_IMPORT.md).

A register lists purchases and bottles taken out ("bevuto", "regalo", "Taken
out"). Each row becomes a stock movement of a wine the same file creates: the
wine of the cellar sheet with the same name, or a new wine when the register
holds its purchases. The balance is replayed in date order, so an outflow can
never take more bottles than there are. Whether the cellar sheet's quantities
already include the register is the user's answer; without one they are left
as they are and the register becomes their history.

Wines already in the household before the import keep their own ledger: the
register is not applied to them, so importing the same file twice never
counts a bottle twice.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import UTC, date, datetime
from decimal import Decimal
from typing import TYPE_CHECKING, Any

from app.schemas.spreadsheet_import import (
    SpreadsheetBalanceExample,
    SpreadsheetBalanceStep,
    SpreadsheetTableMapping,
    SpreadsheetTablePreview,
    SpreadsheetWarning,
)
from app.services.spreadsheet_import.names import NameSplit
from app.services.spreadsheet_import.tables import normalize_label
from app.services.spreadsheet_import.values import parse_date, parse_number, parse_quantity

if TYPE_CHECKING:
    from app.services.spreadsheet_import.plan import ImportPlan, Row

INBOUND = {"purchase", "adjustment_in"}
OUTBOUND = {"consumption", "complimentary", "breakage", "adjustment_out"}

# What a "what happened" cell says, matched on whole words (accents and case aside).
MOVEMENT_WORDS: dict[str, tuple[str, ...]] = {
    "purchase": (
        "acquisto",
        "acquistato",
        "acquistata",
        "acquistate",
        "comprato",
        "comprata",
        "comprate",
        "entrata",
        "carico",
        "arrivo",
        "arrivate",
        "purchase",
        "purchased",
        "bought",
        "buy",
        "added",
        "achat",
        "achete",
        "kauf",
        "gekauft",
    ),
    "consumption": (
        "bevuto",
        "bevuta",
        "bevute",
        "bevuti",
        "aperto",
        "aperta",
        "aperte",
        "stappato",
        "stappata",
        "consumo",
        "consumato",
        "drunk",
        "drank",
        "opened",
        "consumed",
        "drink",
        "bu",
        "ouvert",
        "getrunken",
        "geoffnet",
    ),
    "complimentary": (
        "regalo",
        "regalato",
        "regalata",
        "regalate",
        "omaggio",
        "gift",
        "gifted",
        "given",
        "present",
        "cadeau",
        "offert",
        "geschenk",
        "verschenkt",
    ),
    "breakage": (
        "rotto",
        "rotta",
        "rotte",
        "tappo",
        "difettoso",
        "difettosa",
        "andato",
        "broken",
        "corked",
        "spoiled",
        "faulty",
        "casse",
        "bouchonne",
        "kaputt",
        "korkig",
    ),
    "adjustment_out": (
        "venduto",
        "venduta",
        "vendute",
        "vendita",
        "uscita",
        "scarico",
        "perso",
        "persa",
        "sold",
        "sale",
        "lost",
        "vendu",
        "verkauft",
    ),
    "moved": (
        "spostato",
        "spostata",
        "spostate",
        "spostamento",
        "moved",
        "transfer",
        "transferred",
        "deplace",
        "umgelagert",
    ),
}

DIRECTION_HINTS = {
    "out": ("uscite", "uscita", "bevute", "bevuti", "taken out", "out", "drunk", "sorties"),
    "in": ("acquisti", "entrate", "entrata", "comprati", "purchases", "bought", "achats"),
}


def movement_type_of(text: str) -> str | None:
    words = f" {normalize_label(text)} "
    for movement_type, synonyms in MOVEMENT_WORDS.items():
        if any(f" {synonym} " in words for synonym in synonyms):
            return movement_type
    return None


def direction_from_names(names: list[str]) -> str:
    """ "Uscite", "Taken out" -> out; "Acquisti" -> in; otherwise out, the usual register."""
    for name in names:
        label = f" {normalize_label(name)} "
        for direction, hints in DIRECTION_HINTS.items():
            if any(f" {hint} " in label for hint in hints):
                return direction
    return "out"


@dataclass
class PlannedMovement:
    ref: str
    table_id: str
    sheet: str
    split: NameSplit
    occurred_on: date | None
    direction: str
    movement_type: str
    quantity: int
    occasion: str
    note: str


@dataclass
class StockPlan:
    """The ledger of one wine the import creates: opening stock, then its movements."""

    wine: dict[str, Any]
    table_id: str
    opening: int = 0
    steps: list[PlannedMovement] = field(default_factory=list)
    # Bottles added or removed at the end so the cellar sheet's count holds.
    adjustment: int = 0


def movement_rows(
    row: Row, split: NameSplit, mapping: SpreadsheetTableMapping, plan: ImportPlan
) -> list[PlannedMovement]:
    """The movements one register row describes: none, one, or an in and an out."""
    from app.services.spreadsheet_import.plan import column_date_order

    raw_kind = row.text("movement_kind")
    word_type = movement_type_of(raw_kind) if raw_kind else None
    if word_type == "moved":
        return []
    flows: list[tuple[str, int]] = []
    if row.has("quantity_in") or row.has("quantity_out"):
        quantity_in = parse_quantity(row.cell("quantity_in").value) if row.has("quantity_in") else 0
        quantity_out = (
            parse_quantity(row.cell("quantity_out").value) if row.has("quantity_out") else 0
        )
        flows += [("in", quantity_in or 0), ("out", quantity_out or 0)]
    elif row.has("quantity"):
        number = parse_number(row.cell("quantity").value)
        if number is not None and number != 0:
            if number < 0:
                direction = "out"
            elif word_type in INBOUND:
                direction = "in"
            elif word_type in OUTBOUND:
                direction = "out"
            else:
                direction = mapping.movement_direction
            flows.append((direction, int(abs(number))))
    else:
        # A register with no count: one bottle per row.
        direction = "in" if word_type in INBOUND else "out" if word_type else ""
        flows.append((direction or mapping.movement_direction, 1))
    occurred_on = (
        parse_date(row.cell("event_date").value, column_date_order(row, "event_date"))
        if row.has("event_date")
        else None
    )
    notes = [part for part in [raw_kind, *row.labelled("notes")] if part]
    movements = []
    for direction, quantity in flows:
        if quantity <= 0:
            continue
        if direction == "in":
            movement_type = "purchase" if word_type in {None, "purchase"} else "adjustment_in"
        else:
            movement_type = word_type if word_type in OUTBOUND else "consumption"
        movements.append(
            PlannedMovement(
                ref=row.rows.ref(row.index),
                table_id=row.rows.table_id,
                sheet=row.rows.sheets[row.index],
                split=split,
                occurred_on=occurred_on,
                direction=direction,
                movement_type=movement_type,
                quantity=quantity,
                occasion=row.text("occasion")[:200],
                note=" · ".join(notes)[:500],
            )
        )
    return movements


def text_keys(producer: str, name: str) -> set[str]:
    producer, name = normalize_label(producer), normalize_label(name)
    return {f"{producer} {name}".strip(), f"{name} {producer}".strip()}


class WineFinder:
    """Find the wine of the cellar sheet a register row is about."""

    def __init__(self, wines: list[dict[str, Any]]) -> None:
        self.by_identity: dict[tuple[str, str, str], dict[str, Any]] = {}
        self.by_text: dict[str, list[dict[str, Any]]] = {}
        for data in wines:
            identity = (
                normalize_label(data["name"]),
                normalize_label(data["producer"]),
                normalize_label(data["vintage"]),
            )
            self.by_identity.setdefault(identity, data)
            for key in text_keys(data["producer"], data["name"]):
                bucket = self.by_text.setdefault(key, [])
                if data not in bucket:
                    bucket.append(data)

    def find(self, split: NameSplit) -> tuple[dict[str, Any] | None, bool]:
        """(wine, ambiguous): registers often leave out the vintage."""
        identity = (
            normalize_label(split.name),
            normalize_label(split.producer),
            normalize_label(split.vintage),
        )
        if identity in self.by_identity:
            return self.by_identity[identity], False
        candidates: list[dict[str, Any]] = []
        for key in text_keys(split.producer, split.name):
            for data in self.by_text.get(key, []):
                if data not in candidates and (
                    not split.vintage or normalize_label(data["vintage"]) == identity[2]
                ):
                    candidates.append(data)
        if len(candidates) == 1:
            return candidates[0], False
        return None, len(candidates) > 1


def new_wine_from_movements(
    split: NameSplit, context_ids: dict[str, Any], currency: str
) -> dict[str, Any]:
    from app.services.spreadsheet_import.plan import DEFAULT_FORMAT, IMPORT_TAG

    return {
        **context_ids,
        "name": split.name[:200] or "Unnamed wine",
        "producer": split.producer[:200],
        "vintage": split.vintage[:16],
        "quantity": 0,
        "currency": currency,
        "price": Decimal(0),
        "current_value": None,
        "status": "Delivered",
        "format": DEFAULT_FORMAT,
        "type": "",
        "region": "",
        "appellation": "",
        "vineyard_country": "",
        "grapes": [],
        "merchant": "",
        "order_date": None,
        "drink_from": None,
        "drink_to": None,
        "owners": [],
        "notes": "",
        "tags": [IMPORT_TAG],
    }


def settle_movements(
    plan: ImportPlan,
    movements: list[PlannedMovement],
    mappings: dict[str, SpreadsheetTableMapping],
    previews: dict[str, SpreadsheetTablePreview],
    *,
    context_ids: dict[str, Any],
    currency: str,
) -> None:
    """Link register rows to wines, replay each balance and fill plan.stock."""
    from app.services.spreadsheet_import.plan import PlannedTasting

    def warn(movement: PlannedMovement, code: str) -> None:
        plan.warnings.append(
            SpreadsheetWarning(
                code=code,
                table_id=movement.table_id,
                sheet=movement.sheet,
                row=int(movement.ref.rsplit("!", 1)[1]),
                value=movement.split.raw[:80],
            )
        )

    finder = WineFinder([data for data, _ in plan.wines])
    stock: dict[int, StockPlan] = {}
    created: dict[tuple[str, str, str], dict[str, Any]] = {}
    pending: list[PlannedMovement] = []
    for movement in movements:
        wine, ambiguous = finder.find(movement.split)
        if wine is None and ambiguous:
            warn(movement, "movement_ambiguous_wine")
            continue
        if wine is None:
            pending.append(movement)
            continue
        stock.setdefault(id(wine), StockPlan(wine=wine, table_id=movement.table_id))
        stock[id(wine)].steps.append(movement)
    # Register rows for wines no cellar sheet lists: purchases create the wine.
    by_identity: dict[tuple[str, str, str], list[PlannedMovement]] = {}
    for movement in pending:
        identity = (
            normalize_label(movement.split.name),
            normalize_label(movement.split.producer),
            normalize_label(movement.split.vintage),
        )
        by_identity.setdefault(identity, []).append(movement)
    for identity, rows in by_identity.items():
        if not any(movement.direction == "in" for movement in rows):
            for movement in rows:
                warn(movement, "movement_without_wine")
            continue
        wine = created.get(identity)
        if wine is None:
            wine = new_wine_from_movements(rows[0].split, context_ids, currency)
            created[identity] = wine
            plan.wines.append((wine, {}))
            plan.unknown_quantity.add(id(wine))
        stock[id(wine)] = StockPlan(wine=wine, table_id=rows[0].table_id, steps=list(rows))
    for wine_stock in stock.values():
        replay(plan, wine_stock, mappings, previews, warn)
    plan.stock = list(stock.values())
    for wine_stock in plan.stock:
        wine = wine_stock.wine
        for step in wine_stock.steps:
            if step.movement_type != "consumption" or step.occurred_on is None:
                continue
            note = step.note if step.quantity == 1 else f"{step.note} · {step.quantity}".strip(" ·")
            plan.movement_tastings.append(
                (
                    wine_stock,
                    PlannedTasting(
                        ref=step.ref,
                        name=wine["name"],
                        producer=wine["producer"],
                        vintage=wine["vintage"],
                        consumed_at=step.occurred_on,
                        data={
                            "note": note,
                            "rating": 0.0,
                            "score_value": None,
                            "score_scale": None,
                            "occasion": step.occasion,
                            "pairing": "",
                            "companions": "",
                            "source": "spreadsheet",
                            "source_text": f"{step.sheet}: {step.split.raw}"[:2000],
                        },
                    ),
                )
            )


def replay(
    plan: ImportPlan,
    wine_stock: StockPlan,
    mappings: dict[str, SpreadsheetTableMapping],
    previews: dict[str, SpreadsheetTablePreview],
    warn: Any,
) -> None:
    wine = wine_stock.wine
    steps = wine_stock.steps
    # Rows without a date keep their place in the file, after the dated row before them.
    last: date | None = None
    for step in steps:
        if step.occurred_on is None:
            warn(step, "movement_without_date")
            step.occurred_on = last
        last = step.occurred_on or last
    fallback = next((step.occurred_on for step in steps if step.occurred_on), None)
    fallback = fallback or wine.get("order_date") or datetime.now(UTC).date()
    for step in steps:
        step.occurred_on = step.occurred_on or fallback
    steps.sort(key=lambda step: (step.occurred_on, step.direction != "in"))
    net = sum(step.quantity if step.direction == "in" else -step.quantity for step in steps)
    known = id(wine) not in plan.unknown_quantity
    stated = int(wine["quantity"])
    answer = mappings[wine_stock.table_id].stock_includes_movements or "yes"
    if not known:
        opening = 0
    elif answer == "no":
        opening = stated
    else:
        opening = max(stated - net, 0)
    running = opening
    kept = []
    for step in steps:
        if step.direction == "in":
            running += step.quantity
        else:
            taken = min(step.quantity, running)
            if taken < step.quantity:
                warn(step, "movement_more_than_stock")
            step.quantity = taken
            running -= taken
        if step.quantity:
            kept.append(step)
    wine_stock.steps = kept
    wine_stock.opening = opening
    if known and mappings[wine_stock.table_id].stock_includes_movements is None:
        plan.balance_questions.add(wine_stock.table_id)
    if known and answer != "no" and running != stated:
        wine_stock.adjustment = stated - running
        if steps:
            warn(steps[-1], "stock_adjusted")
        running = stated
    wine["quantity"] = running
    if running == 0:
        wine["status"] = "Consumed"
    preview = previews.get(wine_stock.table_id)
    if preview is not None:
        preview.movements += len(kept)


def balance_example(
    plan: ImportPlan, movements: list[PlannedMovement], stock_sheets: dict[int, str]
) -> SpreadsheetBalanceExample | None:
    """The first wine with a stated quantity and register rows, both ways.

    Read before the replay, which changes quantities and fills missing dates.
    """
    finder = WineFinder([data for data, _ in plan.wines])
    for movement in movements:
        wine, _ = finder.find(movement.split)
        if wine is None or id(wine) in plan.unknown_quantity or id(wine) not in stock_sheets:
            continue
        rows = [
            other
            for other in movements
            if other.table_id == movement.table_id and finder.find(other.split)[0] is wine
        ]
        stated = int(wine["quantity"])
        net = sum(row.quantity if row.direction == "in" else -row.quantity for row in rows)
        return SpreadsheetBalanceExample(
            table_id=movement.table_id,
            wine=" ".join(
                part for part in (wine["producer"], wine["name"], wine["vintage"]) if part
            ),
            stock=stated,
            stock_sheet=stock_sheets[id(wine)],
            movements_sheet=movement.sheet,
            steps=[
                SpreadsheetBalanceStep(
                    date=row.occurred_on.isoformat() if row.occurred_on else "",
                    delta=row.quantity if row.direction == "in" else -row.quantity,
                )
                for row in rows[:4]
            ],
            if_included=stated,
            if_applied=max(stated + net, 0),
        )
    return None
