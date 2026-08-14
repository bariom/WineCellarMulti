from __future__ import annotations

import uuid
from collections import defaultdict

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import CellarBin, CellarLocation, Wine, WineStorageAllocation, WineStorageMovement
from app.schemas.storage import StorageAllocationResponse


def normalized_storage_name(value: str) -> str:
    return " ".join(value.strip().split()).casefold()


def clean_storage_name(value: str) -> str:
    return " ".join(value.strip().split())


def validate_storage_destination(
    db: Session,
    household_id: uuid.UUID,
    location_id: uuid.UUID | None,
    bin_id: uuid.UUID | None,
) -> tuple[CellarLocation | None, CellarBin | None]:
    if bin_id is not None and location_id is None:
        raise HTTPException(status_code=422, detail="A bin requires a location")
    location = db.get(CellarLocation, location_id) if location_id else None
    if location_id and (location is None or location.household_id != household_id):
        raise HTTPException(status_code=404, detail="Location not found")
    cellar_bin = db.get(CellarBin, bin_id) if bin_id else None
    if bin_id and (cellar_bin is None or cellar_bin.location_id != location_id):
        raise HTTPException(status_code=404, detail="Bin not found in this location")
    return location, cellar_bin


def _matching_allocation(
    db: Session,
    wine_id: uuid.UUID,
    location_id: uuid.UUID | None,
    bin_id: uuid.UUID | None,
) -> WineStorageAllocation | None:
    return db.scalar(
        select(WineStorageAllocation)
        .where(
            WineStorageAllocation.wine_id == wine_id,
            WineStorageAllocation.location_id.is_(None)
            if location_id is None
            else WineStorageAllocation.location_id == location_id,
            WineStorageAllocation.bin_id.is_(None)
            if bin_id is None
            else WineStorageAllocation.bin_id == bin_id,
        )
        .with_for_update()
    )


def add_to_storage(
    db: Session,
    wine: Wine,
    quantity: int,
    *,
    location_id: uuid.UUID | None = None,
    bin_id: uuid.UUID | None = None,
) -> WineStorageAllocation:
    if quantity <= 0:
        raise ValueError("Storage quantity must be positive")
    validate_storage_destination(db, wine.household_id, location_id, bin_id)
    allocation = _matching_allocation(db, wine.id, location_id, bin_id)
    if allocation is None:
        allocation = WineStorageAllocation(
            household_id=wine.household_id,
            wine_id=wine.id,
            location_id=location_id,
            bin_id=bin_id,
            quantity=quantity,
        )
        db.add(allocation)
        db.flush()
    else:
        allocation.quantity += quantity
    return allocation


def remove_from_storage(
    db: Session,
    wine: Wine,
    quantity: int,
    *,
    allocation_id: uuid.UUID | None = None,
) -> list[tuple[WineStorageAllocation, int]]:
    if quantity <= 0:
        raise ValueError("Storage quantity must be positive")
    query = (
        select(WineStorageAllocation)
        .where(
            WineStorageAllocation.wine_id == wine.id,
            WineStorageAllocation.household_id == wine.household_id,
        )
        .order_by(WineStorageAllocation.location_id.is_not(None), WineStorageAllocation.created_at)
        .with_for_update()
    )
    if allocation_id is not None:
        query = query.where(WineStorageAllocation.id == allocation_id)
    allocations = list(db.scalars(query))
    if sum(item.quantity for item in allocations) < quantity:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Not enough bottles in the selected storage position",
        )
    remaining = quantity
    removed: list[tuple[WineStorageAllocation, int]] = []
    for allocation in allocations:
        used = min(remaining, allocation.quantity)
        if not used:
            continue
        allocation.quantity -= used
        removed.append((allocation, used))
        remaining -= used
        if allocation.quantity == 0:
            db.delete(allocation)
        if remaining == 0:
            break
    return removed


def sync_storage_to_wine_quantity(db: Session, wine: Wine) -> None:
    allocations = list(
        db.scalars(
            select(WineStorageAllocation)
            .where(WineStorageAllocation.wine_id == wine.id)
            .with_for_update()
        )
    )
    allocated = sum(item.quantity for item in allocations)
    if allocated < wine.quantity:
        add_to_storage(db, wine, wine.quantity - allocated)
    elif allocated > wine.quantity:
        remove_from_storage(db, wine, allocated - wine.quantity)


def allocation_responses_by_wine(
    db: Session, wine_ids: list[uuid.UUID]
) -> dict[uuid.UUID, list[StorageAllocationResponse]]:
    result: dict[uuid.UUID, list[StorageAllocationResponse]] = defaultdict(list)
    if not wine_ids:
        return result
    rows = db.execute(
        select(WineStorageAllocation, CellarLocation.name, CellarBin.name)
        .outerjoin(CellarLocation, CellarLocation.id == WineStorageAllocation.location_id)
        .outerjoin(CellarBin, CellarBin.id == WineStorageAllocation.bin_id)
        .where(WineStorageAllocation.wine_id.in_(wine_ids))
        .order_by(
            CellarLocation.sort_order, CellarLocation.name, CellarBin.sort_order, CellarBin.name
        )
    ).all()
    for allocation, location_name, bin_name in rows:
        result[allocation.wine_id].append(
            StorageAllocationResponse(
                id=allocation.id,
                wine_id=allocation.wine_id,
                location_id=allocation.location_id,
                location_name=location_name or "",
                bin_id=allocation.bin_id,
                bin_name=bin_name or "",
                quantity=allocation.quantity,
            )
        )
    return result


def relocate_storage(
    db: Session,
    wine: Wine,
    *,
    source_allocation_id: uuid.UUID,
    quantity: int,
    location_id: uuid.UUID | None,
    bin_id: uuid.UUID | None,
    user_id: uuid.UUID | None,
    note: str = "",
) -> None:
    validate_storage_destination(db, wine.household_id, location_id, bin_id)
    source = db.scalar(
        select(WineStorageAllocation)
        .where(
            WineStorageAllocation.id == source_allocation_id,
            WineStorageAllocation.wine_id == wine.id,
            WineStorageAllocation.household_id == wine.household_id,
        )
        .with_for_update()
    )
    if source is None:
        raise HTTPException(status_code=404, detail="Storage allocation not found")
    if source.location_id == location_id and source.bin_id == bin_id:
        raise HTTPException(status_code=409, detail="Choose a different storage position")
    if quantity > source.quantity:
        raise HTTPException(status_code=409, detail="Not enough bottles in the source position")
    from_location_id, from_bin_id = source.location_id, source.bin_id
    remove_from_storage(db, wine, quantity, allocation_id=source.id)
    add_to_storage(db, wine, quantity, location_id=location_id, bin_id=bin_id)
    db.add(
        WineStorageMovement(
            household_id=wine.household_id,
            wine_id=wine.id,
            created_by_user_id=user_id,
            movement_type="relocation",
            quantity=quantity,
            from_location_id=from_location_id,
            from_bin_id=from_bin_id,
            to_location_id=location_id,
            to_bin_id=bin_id,
            note=note.strip(),
        )
    )
