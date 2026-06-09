from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.api.deps import CurrentContext, get_current_context, require_admin_context, require_write_context
from app.db.session import get_db
from app.models import Wine, WishlistItem, WishlistList
from app.schemas.wishlist import (
    WishlistCreate,
    WishlistListCreate,
    WishlistListResponse,
    WishlistListUpdate,
    WishlistResponse,
    WishlistUpdate,
)


router = APIRouter(prefix="/wishlist")

DEFAULT_WISHLIST_LIST_NAME = "Wishlist"


def get_or_create_default_wishlist_list(db: Session, context: CurrentContext) -> WishlistList:
    wishlist_list = db.scalar(
        select(WishlistList)
        .where(WishlistList.household_id == context.household.id)
        .order_by(WishlistList.name.asc(), WishlistList.id.asc()),
    )
    if wishlist_list is not None:
        return wishlist_list
    wishlist_list = WishlistList(
        household_id=context.household.id,
        created_by_user_id=context.user.id,
        name=DEFAULT_WISHLIST_LIST_NAME,
        description="",
    )
    db.add(wishlist_list)
    db.flush()
    return wishlist_list


def get_household_wishlist_list(db: Session, context: CurrentContext, list_id: UUID) -> WishlistList:
    wishlist_list = db.scalar(
        select(WishlistList).where(
            WishlistList.id == list_id,
            WishlistList.household_id == context.household.id,
        ),
    )
    if wishlist_list is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Wishlist list not found")
    return wishlist_list


def get_household_wishlist_item(db: Session, context: CurrentContext, item_id: UUID) -> WishlistItem:
    item = db.scalar(
        select(WishlistItem).where(
            WishlistItem.id == item_id,
            WishlistItem.household_id == context.household.id,
        ),
    )
    if item is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Wishlist item not found")
    return item


def wishlist_list_counts(db: Session, household_id: UUID) -> dict[UUID, int]:
    rows = db.execute(
        select(WishlistItem.wishlist_list_id, func.count(WishlistItem.id))
        .where(WishlistItem.household_id == household_id)
        .group_by(WishlistItem.wishlist_list_id),
    ).all()
    return {list_id: count for list_id, count in rows}


@router.get("/lists", response_model=list[WishlistListResponse])
def list_wishlist_lists(
    db: Session = Depends(get_db),
    context: CurrentContext = Depends(get_current_context),
) -> list[WishlistListResponse]:
    existing_count = db.scalar(select(func.count(WishlistList.id)).where(WishlistList.household_id == context.household.id)) or 0
    default_list = get_or_create_default_wishlist_list(db, context)
    if existing_count == 0:
        db.commit()
        db.refresh(default_list)
    counts = wishlist_list_counts(db, context.household.id)
    rows = list(
        db.scalars(
            select(WishlistList)
            .where(WishlistList.household_id == context.household.id)
            .order_by(WishlistList.name.asc(), WishlistList.id.asc()),
        ),
    )
    if not rows:
        rows = [default_list]
    return [
        WishlistListResponse.model_validate(
            {
                "id": wishlist_list.id,
                "household_id": wishlist_list.household_id,
                "name": wishlist_list.name,
                "description": wishlist_list.description,
                "item_count": counts.get(wishlist_list.id, 0),
            },
        )
        for wishlist_list in rows
    ]


@router.post("/lists", response_model=WishlistListResponse, status_code=status.HTTP_201_CREATED)
def create_wishlist_list(
    payload: WishlistListCreate,
    db: Session = Depends(get_db),
    context: CurrentContext = Depends(require_write_context),
) -> WishlistListResponse:
    wishlist_list = WishlistList(
        household_id=context.household.id,
        created_by_user_id=context.user.id,
        name=payload.name.strip(),
        description=payload.description.strip(),
    )
    db.add(wishlist_list)
    db.commit()
    db.refresh(wishlist_list)
    return WishlistListResponse.model_validate(
        {
            "id": wishlist_list.id,
            "household_id": wishlist_list.household_id,
            "name": wishlist_list.name,
            "description": wishlist_list.description,
            "item_count": 0,
        },
    )


@router.patch("/lists/{list_id}", response_model=WishlistListResponse)
def update_wishlist_list(
    list_id: UUID,
    payload: WishlistListUpdate,
    db: Session = Depends(get_db),
    context: CurrentContext = Depends(require_write_context),
) -> WishlistListResponse:
    wishlist_list = get_household_wishlist_list(db, context, list_id)
    if payload.name is not None:
        wishlist_list.name = payload.name.strip()
    if payload.description is not None:
        wishlist_list.description = payload.description.strip()
    db.commit()
    db.refresh(wishlist_list)
    item_count = db.scalar(
        select(func.count(WishlistItem.id)).where(
            WishlistItem.household_id == context.household.id,
            WishlistItem.wishlist_list_id == wishlist_list.id,
        ),
    ) or 0
    return WishlistListResponse.model_validate(
        {
            "id": wishlist_list.id,
            "household_id": wishlist_list.household_id,
            "name": wishlist_list.name,
            "description": wishlist_list.description,
            "item_count": item_count,
        },
    )


@router.delete("/lists/{list_id}", response_model=WishlistListResponse)
def delete_wishlist_list(
    list_id: UUID,
    db: Session = Depends(get_db),
    context: CurrentContext = Depends(require_admin_context),
) -> WishlistListResponse:
    wishlist_list = get_household_wishlist_list(db, context, list_id)
    household_lists = list(
        db.scalars(
            select(WishlistList)
            .where(WishlistList.household_id == context.household.id)
            .order_by(WishlistList.name.asc(), WishlistList.id.asc()),
        ),
    )
    if len(household_lists) <= 1:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="At least one wishlist must remain")
    fallback_list = next((item for item in household_lists if item.id != wishlist_list.id), None)
    if fallback_list is None:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="No destination wishlist available")

    db.delete(wishlist_list)
    db.commit()

    item_count = db.scalar(
        select(func.count(WishlistItem.id)).where(
            WishlistItem.household_id == context.household.id,
            WishlistItem.wishlist_list_id == fallback_list.id,
        ),
    ) or 0
    return WishlistListResponse.model_validate(
        {
            "id": fallback_list.id,
            "household_id": fallback_list.household_id,
            "name": fallback_list.name,
            "description": fallback_list.description,
            "item_count": item_count,
        },
    )


@router.get("", response_model=list[WishlistResponse])
def list_wishlist(
    wishlist_list_id: UUID | None = Query(default=None),
    db: Session = Depends(get_db),
    context: CurrentContext = Depends(get_current_context),
) -> list[WishlistItem]:
    existing_count = db.scalar(select(func.count(WishlistList.id)).where(WishlistList.household_id == context.household.id)) or 0
    default_list = get_or_create_default_wishlist_list(db, context)
    if existing_count == 0:
        db.commit()
        db.refresh(default_list)
    active_list_id = wishlist_list_id or default_list.id
    get_household_wishlist_list(db, context, active_list_id)
    return list(
        db.scalars(
            select(WishlistItem)
            .where(
                WishlistItem.household_id == context.household.id,
                WishlistItem.wishlist_list_id == active_list_id,
            )
            .order_by(WishlistItem.priority.asc(), WishlistItem.name.asc()),
        ),
    )


@router.post("", response_model=WishlistResponse, status_code=status.HTTP_201_CREATED)
def create_wishlist_item(
    payload: WishlistCreate,
    db: Session = Depends(get_db),
    context: CurrentContext = Depends(require_write_context),
) -> WishlistItem:
    get_household_wishlist_list(db, context, payload.wishlist_list_id)
    item = WishlistItem(
        household_id=context.household.id,
        created_by_user_id=context.user.id,
        **payload.model_dump(),
    )
    db.add(item)
    db.commit()
    db.refresh(item)
    return item


@router.patch("/{item_id}", response_model=WishlistResponse)
def update_wishlist_item(
    item_id: UUID,
    payload: WishlistUpdate,
    db: Session = Depends(get_db),
    context: CurrentContext = Depends(require_write_context),
) -> WishlistItem:
    item = get_household_wishlist_item(db, context, item_id)
    updates = payload.model_dump(exclude_unset=True)
    if "wishlist_list_id" in updates:
        get_household_wishlist_list(db, context, updates["wishlist_list_id"])
    for field, value in updates.items():
        setattr(item, field, value)
    db.commit()
    db.refresh(item)
    return item


@router.delete("/{item_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_wishlist_item(
    item_id: UUID,
    db: Session = Depends(get_db),
    context: CurrentContext = Depends(require_admin_context),
) -> Response:
    item = get_household_wishlist_item(db, context, item_id)
    db.delete(item)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/{item_id}/convert", response_model=dict, status_code=status.HTTP_201_CREATED)
def convert_wishlist_item(
    item_id: UUID,
    db: Session = Depends(get_db),
    context: CurrentContext = Depends(require_write_context),
) -> dict:
    item = get_household_wishlist_item(db, context, item_id)
    wine = Wine(
        household_id=context.household.id,
        created_by_user_id=context.user.id,
        name=item.name,
        producer=item.producer,
        vintage=item.vintage,
        quantity=1,
        currency=item.currency,
        price=item.target_price,
        current_value=item.target_price,
        status="Ordered",
        format=item.format,
        type=item.type,
        region=item.region,
        appellation=item.appellation,
        merchant=item.merchant,
        notes=item.notes,
    )
    db.add(wine)
    db.delete(item)
    db.commit()
    db.refresh(wine)
    return {"wine_id": wine.id}
