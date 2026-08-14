from datetime import UTC, datetime
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import CurrentContext, get_current_context, require_write_context
from app.db.session import get_db
from app.models import Wine, WineStockLot, WineStockMovement
from app.schemas.inventory import StockLotResponse, StockMovementCreate, StockMovementResponse
from app.services.stock_ledger import add_inbound_stock, remove_fifo_stock

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
    return [
        StockLotResponse(
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
        for lot, wine in db.execute(query).all()
    ]


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
        movements = add_inbound_stock(
            db,
            wine,
            movement_type=payload.movement_type,
            quantity=payload.quantity,
            occurred_on=occurred_on,
            unit_cost=payload.unit_cost,
            supplier=payload.supplier,
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
