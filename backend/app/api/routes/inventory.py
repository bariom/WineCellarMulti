from datetime import UTC, datetime
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import delete, func, select
from sqlalchemy.orm import Session

from app.api.deps import CurrentContext, get_current_context, require_write_context
from app.db.session import get_db
from app.models import Wine, WineStockLot, WineStockMovement, WineStrategyAllocation
from app.schemas.inventory import (
    StockLotDeleted,
    StockLotResponse,
    StockLotUpdate,
    StockMovementCreate,
    StockMovementResponse,
)
from app.services.free_tier import ensure_free_tier_label_capacity
from app.services.merchants import get_or_create_merchant
from app.services.stock_ledger import (
    INBOUND_LEDGER_TYPES,
    add_inbound_stock,
    remove_fifo_stock,
)
from app.services.storage import sync_storage_to_wine_quantity

router = APIRouter(prefix="/inventory")


def movement_response(movement: WineStockMovement, wine: Wine) -> StockMovementResponse:
    return StockMovementResponse(
        id=movement.id,
        wine_id=wine.id,
        wine_name=wine.name,
        wine_producer=wine.producer,
        wine_vintage=wine.vintage,
        lot_id=movement.lot_id,
        sale_id=movement.sale_id,
        movement_type=movement.movement_type,
        quantity_delta=movement.quantity_delta,
        unit_cost=movement.unit_cost,
        total_cost=movement.unit_cost * abs(movement.quantity_delta),
        currency=movement.currency,
        occurred_on=movement.occurred_on,
        supplier=movement.supplier,
        reference=movement.reference,
        note=movement.note,
        created_at=movement.created_at,
    )


@router.get("/movements", response_model=list[StockMovementResponse])
def list_movements(
    wine_id: UUID | None = None,
    limit: int = Query(default=100, ge=1, le=500),
    db: Session = Depends(get_db),
    context: CurrentContext = Depends(get_current_context),
) -> list[StockMovementResponse]:
    query = (
        select(WineStockMovement, Wine)
        .join(Wine, Wine.id == WineStockMovement.wine_id)
        .where(WineStockMovement.household_id == context.household.id)
        .order_by(WineStockMovement.occurred_on.desc(), WineStockMovement.created_at.desc())
        .limit(limit)
    )
    if wine_id is not None:
        query = query.where(WineStockMovement.wine_id == wine_id)
    return [movement_response(movement, wine) for movement, wine in db.execute(query).all()]


@router.get("/lots", response_model=list[StockLotResponse])
def list_lots(
    wine_id: UUID | None = None,
    include_empty: bool = False,
    db: Session = Depends(get_db),
    context: CurrentContext = Depends(get_current_context),
) -> list[StockLotResponse]:
    query = (
        select(WineStockLot, Wine)
        .join(Wine, Wine.id == WineStockLot.wine_id)
        .where(WineStockLot.household_id == context.household.id)
        .order_by(WineStockLot.acquired_on.asc(), WineStockLot.created_at.asc())
    )
    if wine_id is not None:
        query = query.where(WineStockLot.wine_id == wine_id)
    if not include_empty:
        query = query.where(WineStockLot.quantity_remaining > 0)
    return [lot_response(lot, wine) for lot, wine in db.execute(query).all()]


# Movements that brought a lot into the cellar, as opposed to bottles taken from it.
LOT_SOURCE_TYPES = INBOUND_LEDGER_TYPES | {"opening_balance"}


def lot_response(lot: WineStockLot, wine: Wine) -> StockLotResponse:
    return StockLotResponse(
        id=lot.id,
        wine_id=wine.id,
        wine_name=wine.name,
        acquired_on=lot.acquired_on,
        quantity_received=lot.quantity_received,
        quantity_remaining=lot.quantity_remaining,
        unit_cost=lot.unit_cost,
        total_remaining_cost=lot.unit_cost * lot.quantity_remaining,
        currency=lot.currency,
        supplier=lot.supplier,
        reference=lot.reference,
        note=lot.note,
        created_at=lot.created_at,
    )


def get_household_lot(
    db: Session, context: CurrentContext, lot_id: UUID
) -> tuple[WineStockLot, Wine]:
    row = db.execute(
        select(WineStockLot, Wine)
        .join(Wine, Wine.id == WineStockLot.wine_id)
        .where(WineStockLot.id == lot_id, WineStockLot.household_id == context.household.id)
        .with_for_update()
    ).first()
    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Lot not found")
    return row[0], row[1]


@router.patch("/lots/{lot_id}", response_model=StockLotResponse)
def update_lot(
    lot_id: UUID,
    payload: StockLotUpdate,
    db: Session = Depends(get_db),
    context: CurrentContext = Depends(require_write_context),
) -> StockLotResponse:
    """Correct a lot's date, price or supplier; its bottle count changes only by movements."""
    lot, wine = get_household_lot(db, context, lot_id)
    data = payload.model_dump(exclude_unset=True, exclude_none=True)
    if "supplier" in data:
        data["supplier"] = get_or_create_merchant(db, context, data["supplier"])
    for field, value in data.items():
        setattr(lot, field, value.strip() if isinstance(value, str) else value)
    for movement in db.scalars(
        select(WineStockMovement).where(
            WineStockMovement.lot_id == lot.id,
            WineStockMovement.movement_type.in_(LOT_SOURCE_TYPES),
        )
    ):
        movement.occurred_on = lot.acquired_on
        movement.unit_cost = lot.unit_cost
        movement.supplier = lot.supplier
        movement.reference = lot.reference
    db.commit()
    db.refresh(lot)
    return lot_response(lot, wine)


@router.delete("/lots/{lot_id}", response_model=StockLotDeleted)
def delete_lot(
    lot_id: UUID,
    db: Session = Depends(get_db),
    context: CurrentContext = Depends(require_write_context),
) -> StockLotDeleted:
    """Remove a lot recorded by mistake, as long as no bottle has left it.

    The wine keeps its quantity when the other lots still cover it; otherwise
    the quantity drops to what they hold.
    """
    lot, wine = get_household_lot(db, context, lot_id)
    used = db.scalar(
        select(func.count(WineStockMovement.id)).where(
            WineStockMovement.lot_id == lot.id,
            WineStockMovement.movement_type.not_in(LOT_SOURCE_TYPES),
        )
    )
    if used or lot.quantity_remaining != lot.quantity_received or wine.open_bottle_lot_id == lot.id:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Bottles from this lot were already used; it cannot be deleted",
        )
    db.execute(delete(WineStockMovement).where(WineStockMovement.lot_id == lot.id))
    db.execute(delete(WineStrategyAllocation).where(WineStrategyAllocation.stock_lot_id == lot.id))
    db.delete(lot)
    db.flush()
    covered = int(
        db.scalar(
            select(func.coalesce(func.sum(WineStockLot.quantity_remaining), 0)).where(
                WineStockLot.wine_id == wine.id
            )
        )
        or 0
    )
    removed = max(wine.quantity - covered, 0)
    if removed:
        wine.quantity = covered
        if covered == 0 and wine.status.lower() not in {"ordered", "shipped"}:
            wine.status = "Sold"
        sync_storage_to_wine_quantity(db, wine)
    db.commit()
    return StockLotDeleted(wine_quantity=wine.quantity, quantity_removed=removed)


@router.post("/movements", response_model=list[StockMovementResponse], status_code=201)
def create_movement(
    payload: StockMovementCreate,
    db: Session = Depends(get_db),
    context: CurrentContext = Depends(require_write_context),
) -> list[StockMovementResponse]:
    wine = db.scalar(
        select(Wine)
        .where(Wine.id == payload.wine_id, Wine.household_id == context.household.id)
        .with_for_update()
    )
    if wine is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Wine not found")
    occurred_on = payload.occurred_on or datetime.now(UTC).date()
    if payload.movement_type in {"purchase", "adjustment_in"}:
        ensure_free_tier_label_capacity(db, context, wine=wine)
        movements = add_inbound_stock(
            db,
            wine,
            movement_type=payload.movement_type,
            quantity=payload.quantity,
            occurred_on=occurred_on,
            unit_cost=payload.unit_cost,
            supplier=get_or_create_merchant(db, context, payload.supplier),
            reference=payload.reference,
            note=payload.note,
            user_id=context.user.id,
            storage_location_id=payload.storage_location_id,
            storage_bin_id=payload.storage_bin_id,
        )
    else:
        movements, _, _ = remove_fifo_stock(
            db,
            wine,
            movement_type=payload.movement_type,
            quantity=payload.quantity,
            occurred_on=occurred_on,
            note=payload.note,
            user_id=context.user.id,
            storage_allocation_id=payload.storage_allocation_id,
        )
    db.commit()
    for movement in movements:
        db.refresh(movement)
    return [movement_response(movement, wine) for movement in movements]
