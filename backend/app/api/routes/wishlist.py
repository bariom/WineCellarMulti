from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import CurrentContext, get_current_context, require_admin_context, require_write_context
from app.db.session import get_db
from app.models import Wine, WishlistItem
from app.schemas.wishlist import WishlistCreate, WishlistResponse, WishlistUpdate


router = APIRouter(prefix="/wishlist")


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


@router.get("", response_model=list[WishlistResponse])
def list_wishlist(
    db: Session = Depends(get_db),
    context: CurrentContext = Depends(get_current_context),
) -> list[WishlistItem]:
    return list(
        db.scalars(
            select(WishlistItem)
            .where(WishlistItem.household_id == context.household.id)
            .order_by(WishlistItem.priority.asc(), WishlistItem.name.asc()),
        ),
    )


@router.post("", response_model=WishlistResponse, status_code=status.HTTP_201_CREATED)
def create_wishlist_item(
    payload: WishlistCreate,
    db: Session = Depends(get_db),
    context: CurrentContext = Depends(require_write_context),
) -> WishlistItem:
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
    for field, value in payload.model_dump(exclude_unset=True).items():
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
