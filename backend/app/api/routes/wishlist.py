from datetime import datetime
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.api.deps import (
    CurrentContext,
    get_current_context,
    require_admin_context,
    require_write_context,
)
from app.core.wine_types import normalize_wine_type
from app.db.session import get_db
from app.models import AiAuditLog, Wine, WishlistItem, WishlistList
from app.schemas.wishlist import (
    WishlistConvert,
    WishlistCreate,
    WishlistListCreate,
    WishlistListResponse,
    WishlistListUpdate,
    WishlistResponse,
    WishlistUpdate,
)
from app.services.free_tier import ensure_free_tier_label_capacity

router = APIRouter(prefix="/wishlist")

DEFAULT_WISHLIST_LIST_NAME = "Wishlist"
WISHLIST_AI_DATE_FEATURES = {"wishlist_strategy", "wishlist_target_price", "wishlist_purpose"}


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


def wishlist_ai_generated_dates(
    db: Session, context: CurrentContext, items: list[WishlistItem]
) -> dict[UUID, dict[str, datetime]]:
    item_ids = [item.id for item in items]
    if not item_ids:
        return {}
    rows = db.execute(
        select(AiAuditLog.entity_id, AiAuditLog.feature, func.max(AiAuditLog.created_at))
        .where(
            AiAuditLog.household_id == context.household.id,
            AiAuditLog.entity_type == "wishlist",
            AiAuditLog.entity_id.in_(item_ids),
            AiAuditLog.feature.in_(WISHLIST_AI_DATE_FEATURES),
        )
        .group_by(AiAuditLog.entity_id, AiAuditLog.feature),
    )
    dates: dict[UUID, dict[str, datetime]] = {}
    for entity_id, feature, generated_at in rows:
        key = (
            "ai_purpose_generated_at"
            if feature == "wishlist_purpose"
            else "ai_strategy_generated_at"
        )
        item_dates = dates.setdefault(entity_id, {})
        if key not in item_dates or generated_at > item_dates[key]:
            item_dates[key] = generated_at
    return dates


def wishlist_response(item: WishlistItem, ai_dates: dict[str, datetime] | None = None) -> dict:
    return {
        "id": item.id,
        "household_id": item.household_id,
        "wishlist_list_id": item.wishlist_list_id,
        "name": item.name,
        "producer": item.producer,
        "vintage": item.vintage,
        "format": item.format,
        "type": item.type,
        "region": item.region,
        "appellation": item.appellation,
        "target_price": item.target_price,
        "offer_price": item.offer_price,
        "investment_amount": item.investment_amount,
        "ai_market_price": item.ai_market_price,
        "ai_market_price_currency": item.ai_market_price_currency,
        "currency": item.currency,
        "merchant": item.merchant,
        "priority": item.priority,
        "purpose": item.purpose,
        "status": item.status,
        "status_source": item.status_source,
        "is_shared": item.is_shared,
        "notes": item.notes,
        "ai_context_note": item.ai_context_note,
        "ai_strategy": item.ai_strategy,
        "ai_purpose_advice": item.ai_purpose_advice,
        "ai_strategy_generated_at": (ai_dates or {}).get("ai_strategy_generated_at"),
        "ai_purpose_generated_at": (ai_dates or {}).get("ai_purpose_generated_at"),
    }


def get_household_wishlist_list(
    db: Session, context: CurrentContext, list_id: UUID
) -> WishlistList:
    wishlist_list = db.scalar(
        select(WishlistList).where(
            WishlistList.id == list_id,
            WishlistList.household_id == context.household.id,
        ),
    )
    if wishlist_list is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Wishlist list not found")
    return wishlist_list


def get_household_wishlist_item(
    db: Session, context: CurrentContext, item_id: UUID
) -> WishlistItem:
    item = db.scalar(
        select(WishlistItem).where(
            WishlistItem.id == item_id,
            WishlistItem.household_id == context.household.id,
        ),
    )
    if item is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Wishlist item not found")
    return item


def mark_wishlist_strategy_stale(
    db: Session, household_id: UUID, wishlist_list_ids: list[UUID]
) -> None:
    """Preserve the last strategy while flagging that its underlying list changed."""
    list_ids = list(set(wishlist_list_ids))
    if not list_ids:
        return
    lists = db.scalars(
        select(WishlistList).where(
            WishlistList.household_id == household_id,
            WishlistList.id.in_(list_ids),
        )
    )
    for wishlist_list in lists:
        strategy = wishlist_list.portfolio_strategy
        if isinstance(strategy, dict) and not strategy.get("stale"):
            wishlist_list.portfolio_strategy = {**strategy, "stale": True}


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
    existing_count = (
        db.scalar(
            select(func.count(WishlistList.id)).where(
                WishlistList.household_id == context.household.id
            )
        )
        or 0
    )
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
                "portfolio_strategy": wishlist_list.portfolio_strategy,
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
            "portfolio_strategy": wishlist_list.portfolio_strategy,
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
    item_count = (
        db.scalar(
            select(func.count(WishlistItem.id)).where(
                WishlistItem.household_id == context.household.id,
                WishlistItem.wishlist_list_id == wishlist_list.id,
            ),
        )
        or 0
    )
    return WishlistListResponse.model_validate(
        {
            "id": wishlist_list.id,
            "household_id": wishlist_list.household_id,
            "name": wishlist_list.name,
            "description": wishlist_list.description,
            "item_count": item_count,
            "portfolio_strategy": wishlist_list.portfolio_strategy,
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
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="At least one wishlist must remain",
        )
    fallback_list = next((item for item in household_lists if item.id != wishlist_list.id), None)
    if fallback_list is None:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="No destination wishlist available",
        )

    db.delete(wishlist_list)
    db.commit()

    item_count = (
        db.scalar(
            select(func.count(WishlistItem.id)).where(
                WishlistItem.household_id == context.household.id,
                WishlistItem.wishlist_list_id == fallback_list.id,
            ),
        )
        or 0
    )
    return WishlistListResponse.model_validate(
        {
            "id": fallback_list.id,
            "household_id": fallback_list.household_id,
            "name": fallback_list.name,
            "description": fallback_list.description,
            "item_count": item_count,
            "portfolio_strategy": fallback_list.portfolio_strategy,
        },
    )


@router.get("", response_model=list[WishlistResponse])
def list_wishlist(
    wishlist_list_id: UUID | None = Query(default=None),
    db: Session = Depends(get_db),
    context: CurrentContext = Depends(get_current_context),
) -> list[dict]:
    existing_count = (
        db.scalar(
            select(func.count(WishlistList.id)).where(
                WishlistList.household_id == context.household.id
            )
        )
        or 0
    )
    default_list = get_or_create_default_wishlist_list(db, context)
    if existing_count == 0:
        db.commit()
        db.refresh(default_list)
    active_list_id = wishlist_list_id or default_list.id
    get_household_wishlist_list(db, context, active_list_id)
    items = list(
        db.scalars(
            select(WishlistItem)
            .where(
                WishlistItem.household_id == context.household.id,
                WishlistItem.wishlist_list_id == active_list_id,
            )
            .order_by(WishlistItem.priority.asc(), WishlistItem.name.asc()),
        ),
    )
    ai_dates = wishlist_ai_generated_dates(db, context, items)
    return [wishlist_response(item, ai_dates.get(item.id)) for item in items]


@router.post("", response_model=WishlistResponse, status_code=status.HTTP_201_CREATED)
def create_wishlist_item(
    payload: WishlistCreate,
    db: Session = Depends(get_db),
    context: CurrentContext = Depends(require_write_context),
) -> dict:
    wishlist_list_id = payload.wishlist_list_id
    if wishlist_list_id is None:
        wishlist_list_id = get_or_create_default_wishlist_list(db, context).id
    get_household_wishlist_list(db, context, wishlist_list_id)
    data = payload.model_dump()
    data["wishlist_list_id"] = wishlist_list_id
    data["type"] = normalize_wine_type(data.get("type"))
    item = WishlistItem(
        household_id=context.household.id,
        created_by_user_id=context.user.id,
        **data,
    )
    db.add(item)
    mark_wishlist_strategy_stale(db, context.household.id, [wishlist_list_id])
    db.commit()
    db.refresh(item)
    return wishlist_response(item)


@router.patch("/{item_id}", response_model=WishlistResponse)
def update_wishlist_item(
    item_id: UUID,
    payload: WishlistUpdate,
    db: Session = Depends(get_db),
    context: CurrentContext = Depends(require_write_context),
) -> dict:
    item = get_household_wishlist_item(db, context, item_id)
    previous_list_id = item.wishlist_list_id
    updates = payload.model_dump(exclude_unset=True)
    if "wishlist_list_id" in updates:
        get_household_wishlist_list(db, context, updates["wishlist_list_id"])
    if "type" in updates:
        updates["type"] = normalize_wine_type(updates.get("type"))
    for field, value in updates.items():
        setattr(item, field, value)
    mark_wishlist_strategy_stale(
        db, context.household.id, [previous_list_id, item.wishlist_list_id]
    )
    db.commit()
    db.refresh(item)
    ai_dates = wishlist_ai_generated_dates(db, context, [item])
    return wishlist_response(item, ai_dates.get(item.id))


@router.delete("/{item_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_wishlist_item(
    item_id: UUID,
    db: Session = Depends(get_db),
    context: CurrentContext = Depends(require_admin_context),
) -> Response:
    item = get_household_wishlist_item(db, context, item_id)
    mark_wishlist_strategy_stale(db, context.household.id, [item.wishlist_list_id])
    db.delete(item)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/{item_id}/convert", response_model=dict, status_code=status.HTTP_201_CREATED)
def convert_wishlist_item(
    item_id: UUID,
    payload: WishlistConvert | None = None,
    db: Session = Depends(get_db),
    context: CurrentContext = Depends(require_write_context),
) -> dict:
    item = get_household_wishlist_item(db, context, item_id)
    quantity = payload.quantity if payload is not None else 1
    ensure_free_tier_label_capacity(db, context, will_be_active=quantity > 0)
    wine = Wine(
        household_id=context.household.id,
        created_by_user_id=context.user.id,
        name=item.name,
        producer=item.producer,
        vintage=item.vintage,
        quantity=quantity,
        currency=item.currency,
        price=item.target_price,
        current_value=item.target_price,
        status="Ordered",
        format=item.format,
        type=normalize_wine_type(item.type),
        region=item.region,
        appellation=item.appellation,
        merchant=item.merchant,
        notes=item.notes,
    )
    db.add(wine)
    mark_wishlist_strategy_stale(db, context.household.id, [item.wishlist_list_id])
    db.delete(item)
    db.commit()
    db.refresh(wine)
    return {"wine_id": wine.id}
