import hashlib
import json
from collections import defaultdict
from datetime import UTC, datetime
from decimal import Decimal
from typing import Any, cast
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from app.api.deps import CurrentContext, get_current_context, require_write_context
from app.api.routes.wines import photo_urls
from app.db.session import get_db
from app.models import Wine, WineStockLot, WineStrategyAllocation
from app.schemas.intelligence import (
    BulkStrategyAssignment,
    BulkStrategyAssignmentResult,
    CellarIntelligencePreferences,
    CellarIntelligenceSnapshot,
    CellarIntelligenceWine,
    WineStrategyAllocationResponse,
    WineStrategyAllocationUpdate,
)

router = APIRouter(prefix="/intelligence")
PURPOSES = {"drink", "maturation", "investment", "special_occasion", "undecided"}


def _allocation_response(item: WineStrategyAllocation) -> WineStrategyAllocationResponse:
    return WineStrategyAllocationResponse(
        id=item.id,
        wine_id=item.wine_id,
        purpose=cast(Any, item.purpose),
        quantity=item.quantity,
        stock_lot_id=item.stock_lot_id,
        horizon_year=item.horizon_year,
        note=item.note,
        created_at=item.created_at,
        updated_at=item.updated_at,
    )


def _household_wine(db: Session, context: CurrentContext, wine_id: UUID) -> Wine:
    wine = db.scalar(
        select(Wine).where(Wine.id == wine_id, Wine.household_id == context.household.id)
    )
    if wine is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Wine not found")
    return wine


def _intelligence_preferences(context: CurrentContext) -> CellarIntelligencePreferences:
    return CellarIntelligencePreferences.model_validate(
        context.household.cellar_intelligence_preferences or {}
    )


@router.get("/preferences", response_model=CellarIntelligencePreferences)
def cellar_intelligence_preferences(
    context: CurrentContext = Depends(get_current_context),
) -> CellarIntelligencePreferences:
    return _intelligence_preferences(context)


@router.put("/preferences", response_model=CellarIntelligencePreferences)
def update_cellar_intelligence_preferences(
    payload: CellarIntelligencePreferences,
    db: Session = Depends(get_db),
    context: CurrentContext = Depends(require_write_context),
) -> CellarIntelligencePreferences:
    context.household.cellar_intelligence_preferences = payload.model_dump(mode="json")
    db.commit()
    return payload


@router.put("/allocations/bulk", response_model=BulkStrategyAssignmentResult)
def assign_unallocated_bottles_in_bulk(
    payload: BulkStrategyAssignment,
    db: Session = Depends(get_db),
    context: CurrentContext = Depends(require_write_context),
) -> BulkStrategyAssignmentResult:
    wine_ids = set(payload.wine_ids)
    wines = list(
        db.scalars(
            select(Wine).where(
                Wine.household_id == context.household.id,
                Wine.id.in_(wine_ids),
                Wine.quantity > 0,
            )
        )
    )
    if len(wines) != len(wine_ids):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="One or more wines are not available in this cellar",
        )
    allocations = list(
        db.scalars(
            select(WineStrategyAllocation).where(
                WineStrategyAllocation.household_id == context.household.id,
                WineStrategyAllocation.wine_id.in_(wine_ids),
            )
        )
    )
    allocated_by_wine: dict[UUID, int] = defaultdict(int)
    for allocation in allocations:
        allocated_by_wine[allocation.wine_id] += allocation.quantity
    created: list[WineStrategyAllocation] = []
    assigned_bottles = 0
    for wine in wines:
        available = max(wine.quantity - allocated_by_wine[wine.id], 0)
        if not available:
            continue
        assigned_bottles += available
        created.append(
            WineStrategyAllocation(
                household_id=context.household.id,
                wine_id=wine.id,
                purpose=payload.purpose,
                quantity=available,
                note="Bulk assignment from Cellar Intelligence",
            )
        )
    db.add_all(created)
    db.commit()
    return BulkStrategyAssignmentResult(
        changed_wines=len(created),
        assigned_bottles=assigned_bottles,
        purpose=payload.purpose,
    )


@router.put(
    "/allocations/bulk/reassign", response_model=BulkStrategyAssignmentResult
)
def reassign_bottles_in_bulk(
    payload: BulkStrategyAssignment,
    db: Session = Depends(get_db),
    context: CurrentContext = Depends(require_write_context),
) -> BulkStrategyAssignmentResult:
    wine_ids = set(payload.wine_ids)
    wines = list(
        db.scalars(
            select(Wine).where(
                Wine.household_id == context.household.id,
                Wine.id.in_(wine_ids),
                Wine.quantity > 0,
            )
        )
    )
    if len(wines) != len(wine_ids):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="One or more wines are not available in this cellar",
        )
    allocations = list(
        db.scalars(
            select(WineStrategyAllocation).where(
                WineStrategyAllocation.household_id == context.household.id,
                WineStrategyAllocation.wine_id.in_(wine_ids),
            )
        )
    )
    for allocation in allocations:
        allocation.purpose = payload.purpose
    db.commit()
    return BulkStrategyAssignmentResult(
        changed_wines=len({allocation.wine_id for allocation in allocations}),
        assigned_bottles=sum(allocation.quantity for allocation in allocations),
        purpose=payload.purpose,
    )


@router.get(
    "/wines/{wine_id}/allocations", response_model=list[WineStrategyAllocationResponse]
)
def list_wine_strategy_allocations(
    wine_id: UUID,
    db: Session = Depends(get_db),
    context: CurrentContext = Depends(get_current_context),
) -> list[WineStrategyAllocationResponse]:
    _household_wine(db, context, wine_id)
    items = db.scalars(
        select(WineStrategyAllocation)
        .where(
            WineStrategyAllocation.household_id == context.household.id,
            WineStrategyAllocation.wine_id == wine_id,
        )
        .order_by(WineStrategyAllocation.purpose, WineStrategyAllocation.created_at)
    ).all()
    return [_allocation_response(item) for item in items]


@router.put(
    "/wines/{wine_id}/allocations", response_model=list[WineStrategyAllocationResponse]
)
def replace_wine_strategy_allocations(
    wine_id: UUID,
    payload: WineStrategyAllocationUpdate,
    db: Session = Depends(get_db),
    context: CurrentContext = Depends(require_write_context),
) -> list[WineStrategyAllocationResponse]:
    wine = _household_wine(db, context, wine_id)
    if sum(item.quantity for item in payload.allocations) > wine.quantity:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Strategy allocation quantities exceed available bottles",
        )
    lot_ids = {item.stock_lot_id for item in payload.allocations if item.stock_lot_id is not None}
    lots = {
        lot.id: lot
        for lot in db.scalars(
            select(WineStockLot).where(
                WineStockLot.id.in_(lot_ids),
                WineStockLot.wine_id == wine.id,
                WineStockLot.household_id == context.household.id,
            )
        ).all()
    } if lot_ids else {}
    if len(lots) != len(lot_ids):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="A selected purchase lot does not belong to this wine",
        )
    per_lot: dict[UUID, int] = defaultdict(int)
    for item in payload.allocations:
        if item.purpose not in PURPOSES:
            raise HTTPException(status_code=422, detail="Unsupported strategy purpose")
        if item.stock_lot_id is not None:
            per_lot[item.stock_lot_id] += item.quantity
    for lot_id, quantity in per_lot.items():
        if quantity > lots[lot_id].quantity_remaining:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Strategy allocation exceeds the selected lot's remaining bottles",
            )

    db.execute(
        delete(WineStrategyAllocation).where(
            WineStrategyAllocation.household_id == context.household.id,
            WineStrategyAllocation.wine_id == wine.id,
        )
    )
    created = [
        WineStrategyAllocation(
            household_id=context.household.id,
            wine_id=wine.id,
            stock_lot_id=item.stock_lot_id,
            purpose=item.purpose,
            quantity=item.quantity,
            horizon_year=item.horizon_year,
            note=item.note.strip(),
        )
        for item in payload.allocations
    ]
    db.add_all(created)
    db.commit()
    for item in created:
        db.refresh(item)
    return [_allocation_response(item) for item in created]


def build_cellar_intelligence_snapshot(
    db: Session, context: CurrentContext
) -> CellarIntelligenceSnapshot:
    wines = list(
        db.scalars(
            select(Wine)
            .where(Wine.household_id == context.household.id, Wine.quantity > 0)
            .order_by(Wine.name)
        )
    )
    allocations = list(
        db.scalars(
            select(WineStrategyAllocation).where(
                WineStrategyAllocation.household_id == context.household.id
            )
        )
    )
    by_wine: dict[UUID, list[WineStrategyAllocation]] = defaultdict(list)
    purpose_totals = {purpose: 0 for purpose in PURPOSES}
    for allocation in allocations:
        by_wine[allocation.wine_id].append(allocation)
        purpose_totals[allocation.purpose] += allocation.quantity

    current_year = datetime.now(UTC).year
    preferences = _intelligence_preferences(context)
    rows: list[CellarIntelligenceWine] = []
    for wine in wines:
        wine_allocations = by_wine.get(wine.id, [])
        purposes: dict[str, int] = defaultdict(int)
        for allocation in wine_allocations:
            purposes[allocation.purpose] += allocation.quantity
        allocated = min(sum(purposes.values()), wine.quantity)
        unallocated = max(wine.quantity - allocated, 0)
        readiness = "unknown"
        if wine.drink_to is not None and current_year > wine.drink_to:
            readiness = "late"
        elif (
            wine.drink_peak_from is not None
            and wine.drink_peak_to is not None
            and wine.drink_peak_from <= current_year <= wine.drink_peak_to
        ):
            readiness = "peak"
        elif (
            wine.drink_from is not None
            and current_year >= wine.drink_from
            and (wine.drink_to is None or current_year <= wine.drink_to)
        ):
            readiness = "ready"
        elif wine.drink_from is not None and current_year < wine.drink_from:
            readiness = "too_young"
        signals: list[str] = []
        if readiness in {"ready", "peak", "late"}:
            signals.append("drink_window_active")
        if readiness == "late":
            signals.append("drink_window_expired")
        if unallocated:
            signals.append("strategy_incomplete")
        if wine.current_value is None:
            signals.append("market_value_missing")
        purchase_value = Decimal(wine.price or 0) * wine.quantity
        current_value = Decimal(wine.current_value if wine.current_value is not None else wine.price or 0) * wine.quantity
        rows.append(
            CellarIntelligenceWine(
                wine_id=wine.id,
                name=wine.name,
                photo_thumbnail_url=photo_urls(wine)["photo_thumbnail_url"],
                producer=wine.producer,
                vintage=wine.vintage,
                region=wine.region,
                type=wine.type,
                quantity=wine.quantity,
                allocated_quantity=allocated,
                unallocated_quantity=unallocated,
                currency=wine.currency,
                purchase_value=purchase_value,
                current_value=current_value,
                drink_from=wine.drink_from,
                drink_peak_from=wine.drink_peak_from,
                drink_peak_to=wine.drink_peak_to,
                drink_to=wine.drink_to,
                readiness=readiness,
                purposes=dict(purposes),
                signals=signals,
            )
        )
    bottle_count = sum(wine.quantity for wine in wines)
    allocated_count = sum(row.allocated_quantity for row in rows)
    fingerprint_payload = {
        "preferences": preferences.model_dump(mode="json"),
        "wines": [
            {
                "id": str(row.wine_id),
                "quantity": row.quantity,
                "purposes": row.purposes,
                "readiness": row.readiness,
                "window": [row.drink_from, row.drink_peak_from, row.drink_peak_to, row.drink_to],
                "purchase_value": str(row.purchase_value),
                "current_value": str(row.current_value),
            }
            for row in rows
        ],
    }
    fingerprint = hashlib.sha256(
        json.dumps(fingerprint_payload, sort_keys=True, separators=(",", ":")).encode()
    ).hexdigest()[:24]
    return CellarIntelligenceSnapshot(
        generated_at=datetime.now(UTC),
        fingerprint=fingerprint,
        preferences=preferences,
        wine_count=len(wines),
        bottle_count=bottle_count,
        allocated_bottle_count=allocated_count,
        allocation_coverage_pct=round((allocated_count / bottle_count) * 100) if bottle_count else 0,
        purpose_totals=purpose_totals,
        drink_now_count=sum(
            row.purposes.get("drink", 0)
            for row in rows
            if row.readiness in {"ready", "peak", "late"}
        ),
        maturation_count=purpose_totals["maturation"],
        investment_count=purpose_totals["investment"],
        undecided_count=purpose_totals["undecided"] + sum(row.unallocated_quantity for row in rows),
        wines=rows,
    )


@router.get("/cellar", response_model=CellarIntelligenceSnapshot)
def cellar_intelligence_snapshot(
    db: Session = Depends(get_db),
    context: CurrentContext = Depends(get_current_context),
) -> CellarIntelligenceSnapshot:
    return build_cellar_intelligence_snapshot(db, context)
