from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Response
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.api.deps import CurrentContext, get_current_context, require_write_context
from app.db.session import get_db
from app.models import CellarBin, CellarLocation, Wine, WineStorageAllocation
from app.schemas.storage import (
    CellarBinCreate,
    CellarBinResponse,
    CellarBinUpdate,
    CellarLocationCreate,
    CellarLocationResponse,
    CellarLocationUpdate,
    StorageAllocationResponse,
    StorageRelocationCreate,
)
from app.services.storage import (
    allocation_responses_by_wine,
    clean_storage_name,
    normalized_storage_name,
    relocate_storage,
)

router = APIRouter(prefix="/storage")


def _location(db: Session, context: CurrentContext, location_id: UUID) -> CellarLocation:
    item = db.scalar(
        select(CellarLocation).where(
            CellarLocation.id == location_id,
            CellarLocation.household_id == context.household.id,
        )
    )
    if item is None:
        raise HTTPException(status_code=404, detail="Location not found")
    return item


def _bin(db: Session, context: CurrentContext, bin_id: UUID) -> CellarBin:
    item = db.scalar(
        select(CellarBin)
        .join(CellarLocation, CellarLocation.id == CellarBin.location_id)
        .where(CellarBin.id == bin_id, CellarLocation.household_id == context.household.id)
    )
    if item is None:
        raise HTTPException(status_code=404, detail="Bin not found")
    return item


def _location_responses(db: Session, context: CurrentContext) -> list[CellarLocationResponse]:
    locations = list(
        db.scalars(
            select(CellarLocation)
            .where(CellarLocation.household_id == context.household.id)
            .order_by(CellarLocation.sort_order, CellarLocation.name)
        )
    )
    location_counts = dict(
        db.execute(
            select(WineStorageAllocation.location_id, func.sum(WineStorageAllocation.quantity))
            .where(WineStorageAllocation.household_id == context.household.id)
            .group_by(WineStorageAllocation.location_id)
        ).all()
    )
    bins = list(
        db.scalars(
            select(CellarBin)
            .join(CellarLocation, CellarLocation.id == CellarBin.location_id)
            .where(CellarLocation.household_id == context.household.id)
            .order_by(CellarBin.sort_order, CellarBin.name)
        )
    )
    bin_counts = dict(
        db.execute(
            select(WineStorageAllocation.bin_id, func.sum(WineStorageAllocation.quantity))
            .where(WineStorageAllocation.household_id == context.household.id)
            .group_by(WineStorageAllocation.bin_id)
        ).all()
    )
    return [
        CellarLocationResponse(
            id=location.id,
            name=location.name,
            description=location.description,
            is_default=location.is_default,
            sort_order=location.sort_order,
            bottle_count=int(location_counts.get(location.id) or 0),
            bins=[
                CellarBinResponse(
                    id=item.id,
                    location_id=item.location_id,
                    name=item.name,
                    description=item.description,
                    sort_order=item.sort_order,
                    bottle_count=int(bin_counts.get(item.id) or 0),
                )
                for item in bins
                if item.location_id == location.id
            ],
        )
        for location in locations
    ]


@router.get("/locations", response_model=list[CellarLocationResponse])
def list_locations(
    db: Session = Depends(get_db), context: CurrentContext = Depends(get_current_context)
) -> list[CellarLocationResponse]:
    return _location_responses(db, context)


@router.post("/locations", response_model=CellarLocationResponse, status_code=201)
def create_location(
    payload: CellarLocationCreate,
    db: Session = Depends(get_db),
    context: CurrentContext = Depends(require_write_context),
) -> CellarLocationResponse:
    name = clean_storage_name(payload.name)
    duplicate = db.scalar(
        select(CellarLocation.id).where(
            CellarLocation.household_id == context.household.id,
            CellarLocation.normalized_name == normalized_storage_name(name),
        )
    )
    if duplicate:
        raise HTTPException(status_code=409, detail="A location with this name already exists")
    if payload.is_default:
        for item in db.scalars(
            select(CellarLocation).where(CellarLocation.household_id == context.household.id)
        ):
            item.is_default = False
    location = CellarLocation(
        household_id=context.household.id,
        name=name,
        normalized_name=normalized_storage_name(name),
        description=payload.description.strip(),
        is_default=payload.is_default,
        sort_order=payload.sort_order,
    )
    db.add(location)
    db.commit()
    return next(item for item in _location_responses(db, context) if item.id == location.id)


@router.patch("/locations/{location_id}", response_model=CellarLocationResponse)
def update_location(
    location_id: UUID,
    payload: CellarLocationUpdate,
    db: Session = Depends(get_db),
    context: CurrentContext = Depends(require_write_context),
) -> CellarLocationResponse:
    location = _location(db, context, location_id)
    data = payload.model_dump(exclude_unset=True)
    if "name" in data:
        name = clean_storage_name(data.pop("name"))
        normalized = normalized_storage_name(name)
        duplicate = db.scalar(
            select(CellarLocation.id).where(
                CellarLocation.household_id == context.household.id,
                CellarLocation.normalized_name == normalized,
                CellarLocation.id != location.id,
            )
        )
        if duplicate:
            raise HTTPException(status_code=409, detail="A location with this name already exists")
        location.name, location.normalized_name = name, normalized
    if data.get("is_default"):
        for item in db.scalars(
            select(CellarLocation).where(
                CellarLocation.household_id == context.household.id,
                CellarLocation.id != location.id,
            )
        ):
            item.is_default = False
    for field, value in data.items():
        setattr(location, field, value.strip() if isinstance(value, str) else value)
    db.commit()
    return next(item for item in _location_responses(db, context) if item.id == location.id)


@router.delete("/locations/{location_id}", status_code=204)
def delete_location(
    location_id: UUID,
    db: Session = Depends(get_db),
    context: CurrentContext = Depends(require_write_context),
) -> Response:
    location = _location(db, context, location_id)
    bottles = (
        db.scalar(
            select(func.sum(WineStorageAllocation.quantity)).where(
                WineStorageAllocation.location_id == location.id
            )
        )
        or 0
    )
    if bottles:
        raise HTTPException(
            status_code=409, detail="Move all bottles before deleting this location"
        )
    db.delete(location)
    db.commit()
    return Response(status_code=204)


@router.post("/locations/{location_id}/bins", response_model=CellarBinResponse, status_code=201)
def create_bin(
    location_id: UUID,
    payload: CellarBinCreate,
    db: Session = Depends(get_db),
    context: CurrentContext = Depends(require_write_context),
) -> CellarBinResponse:
    location = _location(db, context, location_id)
    name = clean_storage_name(payload.name)
    normalized = normalized_storage_name(name)
    if db.scalar(
        select(CellarBin.id).where(
            CellarBin.location_id == location.id, CellarBin.normalized_name == normalized
        )
    ):
        raise HTTPException(
            status_code=409, detail="A bin with this name already exists in the location"
        )
    item = CellarBin(
        location_id=location.id,
        name=name,
        normalized_name=normalized,
        description=payload.description.strip(),
        sort_order=payload.sort_order,
    )
    db.add(item)
    db.commit()
    db.refresh(item)
    return CellarBinResponse(
        id=item.id,
        location_id=item.location_id,
        name=item.name,
        description=item.description,
        sort_order=item.sort_order,
    )


@router.patch("/bins/{bin_id}", response_model=CellarBinResponse)
def update_bin(
    bin_id: UUID,
    payload: CellarBinUpdate,
    db: Session = Depends(get_db),
    context: CurrentContext = Depends(require_write_context),
) -> CellarBinResponse:
    item = _bin(db, context, bin_id)
    data = payload.model_dump(exclude_unset=True)
    if "name" in data:
        name = clean_storage_name(data.pop("name"))
        normalized = normalized_storage_name(name)
        if db.scalar(
            select(CellarBin.id).where(
                CellarBin.location_id == item.location_id,
                CellarBin.normalized_name == normalized,
                CellarBin.id != item.id,
            )
        ):
            raise HTTPException(
                status_code=409, detail="A bin with this name already exists in the location"
            )
        item.name, item.normalized_name = name, normalized
    for field, value in data.items():
        setattr(item, field, value.strip() if isinstance(value, str) else value)
    db.commit()
    count = (
        db.scalar(
            select(func.sum(WineStorageAllocation.quantity)).where(
                WineStorageAllocation.bin_id == item.id
            )
        )
        or 0
    )
    return CellarBinResponse(
        id=item.id,
        location_id=item.location_id,
        name=item.name,
        description=item.description,
        sort_order=item.sort_order,
        bottle_count=int(count),
    )


@router.delete("/bins/{bin_id}", status_code=204)
def delete_bin(
    bin_id: UUID,
    db: Session = Depends(get_db),
    context: CurrentContext = Depends(require_write_context),
) -> Response:
    item = _bin(db, context, bin_id)
    bottles = (
        db.scalar(
            select(func.sum(WineStorageAllocation.quantity)).where(
                WineStorageAllocation.bin_id == item.id
            )
        )
        or 0
    )
    if bottles:
        raise HTTPException(status_code=409, detail="Move all bottles before deleting this bin")
    db.delete(item)
    db.commit()
    return Response(status_code=204)


@router.get("/allocations", response_model=list[StorageAllocationResponse])
def list_allocations(
    wine_id: UUID,
    db: Session = Depends(get_db),
    context: CurrentContext = Depends(get_current_context),
) -> list[StorageAllocationResponse]:
    wine = db.scalar(
        select(Wine).where(Wine.id == wine_id, Wine.household_id == context.household.id)
    )
    if wine is None:
        raise HTTPException(status_code=404, detail="Wine not found")
    return allocation_responses_by_wine(db, [wine.id]).get(wine.id, [])


@router.post("/relocations", response_model=list[StorageAllocationResponse])
def relocate(
    payload: StorageRelocationCreate,
    db: Session = Depends(get_db),
    context: CurrentContext = Depends(require_write_context),
) -> list[StorageAllocationResponse]:
    wine = db.scalar(
        select(Wine)
        .where(Wine.id == payload.wine_id, Wine.household_id == context.household.id)
        .with_for_update()
    )
    if wine is None:
        raise HTTPException(status_code=404, detail="Wine not found")
    relocate_storage(
        db,
        wine,
        source_allocation_id=payload.source_allocation_id,
        quantity=payload.quantity,
        location_id=payload.location_id,
        bin_id=payload.bin_id,
        user_id=context.user.id,
        note=payload.note,
    )
    db.commit()
    return allocation_responses_by_wine(db, [wine.id]).get(wine.id, [])
