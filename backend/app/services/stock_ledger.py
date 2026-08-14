from __future__ import annotations

import uuid
from datetime import UTC, date, datetime
from decimal import Decimal

from fastapi import HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models import Wine, WineSale, WineStockLot, WineStockMovement

INBOUND_TYPES = {"purchase", "adjustment_in"}
INBOUND_LEDGER_TYPES = INBOUND_TYPES | {"initial_purchase", "sale_void"}
OUTBOUND_TYPES = {"adjustment_out", "breakage", "complimentary", "consumption"}


def ensure_opening_stock(
    db: Session,
    wine: Wine,
    *,
    user_id: uuid.UUID | None = None,
    quantity: int | None = None,
) -> None:
    movement_count = db.scalar(
        select(func.count(WineStockMovement.id)).where(WineStockMovement.wine_id == wine.id)
    )
    opening_quantity = wine.quantity if quantity is None else quantity
    if movement_count or opening_quantity <= 0:
        return
    occurred_on = wine.order_date or (
        wine.created_at.date() if wine.created_at else datetime.now(UTC).date()
    )
    lot = WineStockLot(
        wine_id=wine.id,
        household_id=wine.household_id,
        acquired_on=occurred_on,
        quantity_received=opening_quantity,
        quantity_remaining=opening_quantity,
        unit_cost=wine.price or Decimal("0"),
        currency=(wine.currency or "CHF").upper(),
        supplier=wine.merchant,
        note="Opening stock",
    )
    db.add(lot)
    db.flush()
    db.add(
        WineStockMovement(
            wine_id=wine.id,
            household_id=wine.household_id,
            lot_id=lot.id,
            created_by_user_id=user_id,
            movement_type="opening_balance",
            quantity_delta=opening_quantity,
            unit_cost=lot.unit_cost,
            currency=lot.currency,
            occurred_on=occurred_on,
            supplier=lot.supplier,
            note="Opening stock",
        )
    )


def add_inbound_stock(
    db: Session,
    wine: Wine,
    *,
    movement_type: str,
    quantity: int,
    occurred_on: date,
    unit_cost: Decimal | None,
    supplier: str,
    reference: str,
    note: str,
    user_id: uuid.UUID | None,
    update_quantity: bool = True,
) -> list[WineStockMovement]:
    if movement_type not in INBOUND_LEDGER_TYPES or quantity <= 0:
        raise ValueError("Invalid inbound stock movement")
    cost = unit_cost if unit_cost is not None else wine.price or Decimal("0")
    lot = WineStockLot(
        wine_id=wine.id,
        household_id=wine.household_id,
        acquired_on=occurred_on,
        quantity_received=quantity,
        quantity_remaining=quantity,
        unit_cost=cost,
        currency=(wine.currency or "CHF").upper(),
        supplier=supplier.strip(),
        reference=reference.strip(),
        note=note.strip(),
    )
    db.add(lot)
    db.flush()
    movement = WineStockMovement(
        wine_id=wine.id,
        household_id=wine.household_id,
        lot_id=lot.id,
        created_by_user_id=user_id,
        movement_type=movement_type,
        quantity_delta=quantity,
        unit_cost=cost,
        currency=lot.currency,
        occurred_on=occurred_on,
        supplier=lot.supplier,
        reference=lot.reference,
        note=lot.note,
    )
    db.add(movement)
    if update_quantity:
        wine.quantity += quantity
        if wine.quantity > 0 and wine.status.lower() == "sold":
            wine.status = "Delivered"
    return [movement]


def remove_fifo_stock(
    db: Session,
    wine: Wine,
    *,
    movement_type: str,
    quantity: int,
    occurred_on: date,
    note: str,
    user_id: uuid.UUID | None,
    sale: WineSale | None = None,
    update_quantity: bool = True,
    reserved_lot_id: uuid.UUID | None = None,
    preferred_lot_id: uuid.UUID | None = None,
) -> tuple[list[WineStockMovement], Decimal, Decimal]:
    if movement_type not in OUTBOUND_TYPES | {"sale"} or quantity <= 0:
        raise ValueError("Invalid outbound stock movement")
    if quantity > wine.quantity:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT, detail="Not enough bottles in stock"
        )
    ensure_opening_stock(db, wine, user_id=user_id)
    lots = list(
        db.scalars(
            select(WineStockLot)
            .where(WineStockLot.wine_id == wine.id, WineStockLot.quantity_remaining > 0)
            .order_by(WineStockLot.acquired_on.asc(), WineStockLot.created_at.asc())
            .with_for_update()
        )
    )
    if preferred_lot_id is not None:
        lots.sort(key=lambda lot: lot.id != preferred_lot_id)
    effective_reserved_lot_id = reserved_lot_id or (
        wine.open_bottle_lot_id if preferred_lot_id is None else None
    )
    available_quantity = sum(
        max(lot.quantity_remaining - (1 if lot.id == effective_reserved_lot_id else 0), 0)
        for lot in lots
    )
    if available_quantity < quantity:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Stock ledger does not match the current bottle quantity",
        )
    remaining = quantity
    total_cost = Decimal("0")
    movements: list[WineStockMovement] = []
    for lot in lots:
        if remaining <= 0:
            break
        lot_available = max(
            lot.quantity_remaining - (1 if lot.id == effective_reserved_lot_id else 0), 0
        )
        allocated = min(remaining, lot_available)
        if allocated <= 0:
            continue
        lot.quantity_remaining -= allocated
        total_cost += lot.unit_cost * allocated
        movement = WineStockMovement(
            wine_id=wine.id,
            household_id=wine.household_id,
            lot_id=lot.id,
            sale_id=sale.id if sale else None,
            created_by_user_id=user_id,
            movement_type=movement_type,
            quantity_delta=-allocated,
            unit_cost=lot.unit_cost,
            currency=lot.currency,
            occurred_on=occurred_on,
            supplier=lot.supplier,
            reference=lot.reference,
            note=note.strip(),
        )
        db.add(movement)
        movements.append(movement)
        remaining -= allocated
    if update_quantity:
        wine.quantity -= quantity
        if wine.quantity == 0:
            wine.status = "Sold"
    return movements, (total_cost / quantity).quantize(Decimal("0.01")), total_cost


def restore_sale_stock(
    db: Session,
    wine: Wine,
    sale: WineSale,
    *,
    note: str,
    user_id: uuid.UUID | None,
) -> list[WineStockMovement]:
    source_movements = list(
        db.scalars(
            select(WineStockMovement)
            .where(
                WineStockMovement.sale_id == sale.id,
                WineStockMovement.movement_type == "sale",
            )
            .order_by(WineStockMovement.created_at.asc())
            .with_for_update()
        )
    )
    restored: list[WineStockMovement] = []
    if not source_movements:
        # Compatibility with sales created before the ledger was introduced.
        return add_inbound_stock(
            db,
            wine,
            movement_type="sale_void",
            quantity=sale.quantity,
            occurred_on=datetime.now(UTC).date(),
            unit_cost=sale.unit_purchase_cost,
            supplier="",
            reference=f"void:{sale.id}",
            note=note,
            user_id=user_id,
        )
    for source in source_movements:
        quantity = abs(source.quantity_delta)
        lot = db.get(WineStockLot, source.lot_id) if source.lot_id else None
        if lot is not None:
            lot.quantity_remaining += quantity
        movement = WineStockMovement(
            wine_id=wine.id,
            household_id=wine.household_id,
            lot_id=source.lot_id,
            sale_id=sale.id,
            created_by_user_id=user_id,
            movement_type="sale_void",
            quantity_delta=quantity,
            unit_cost=source.unit_cost,
            currency=source.currency,
            occurred_on=datetime.now(UTC).date(),
            supplier=source.supplier,
            reference=source.reference,
            note=note.strip(),
        )
        db.add(movement)
        restored.append(movement)
    wine.quantity += sum(abs(movement.quantity_delta) for movement in source_movements)
    return restored


def reconcile_direct_quantity_change(
    db: Session,
    wine: Wine,
    *,
    previous_quantity: int,
    user_id: uuid.UUID | None,
) -> None:
    desired_quantity = wine.quantity
    delta = desired_quantity - previous_quantity
    if not delta:
        return
    ensure_opening_stock(db, wine, user_id=user_id, quantity=previous_quantity)
    today = datetime.now(UTC).date()
    if delta > 0:
        add_inbound_stock(
            db,
            wine,
            movement_type="adjustment_in",
            quantity=delta,
            occurred_on=today,
            unit_cost=wine.price,
            supplier=wine.merchant,
            reference="",
            note="Quantity changed from wine record",
            user_id=user_id,
            update_quantity=False,
        )
    else:
        wine.quantity = previous_quantity
        remove_fifo_stock(
            db,
            wine,
            movement_type="adjustment_out",
            quantity=abs(delta),
            occurred_on=today,
            note="Quantity changed from wine record",
            user_id=user_id,
        )
