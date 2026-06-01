from datetime import datetime, timezone
from decimal import Decimal, ROUND_HALF_UP
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import CurrentContext, get_current_context, require_admin_context, require_write_context
from app.api.routes.tags import get_or_create_user_tag
from app.db.session import get_db
from app.models import Household, Membership, User, UserTag, UserWineTag, Wine, WineShareOffer
from app.schemas.wine import WineCreate, WineResponse, WineShareOfferCreate, WineShareOfferResponse, WineUpdate


router = APIRouter()


def user_can_see_wine(context: CurrentContext, wine: Wine) -> bool:
    if context.membership.role in ("owner", "admin") or context.membership.visibility_scope == "all":
        return True
    if wine.created_by_user_id == context.user.id:
        return True
    user_email = context.user.email.strip().lower()
    return any(str(owner.get("email", "")).strip().lower() == user_email for owner in (wine.owners or []))


def get_household_wine(db: Session, context: CurrentContext, wine_id: UUID, *, enforce_visibility: bool = True) -> Wine:
    wine = db.scalar(
        select(Wine).where(
            Wine.id == wine_id,
            Wine.household_id == context.household.id,
        ),
    )
    if wine is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Wine not found")
    if enforce_visibility and not user_can_see_wine(context, wine):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Wine not found")
    return wine


def user_tag_names_by_wine(db: Session, context: CurrentContext, wine_ids: list[UUID]) -> dict[UUID, list[str]]:
    if not wine_ids:
        return {}
    rows = db.execute(
        select(UserWineTag.wine_id, UserTag.name)
        .join(UserTag, UserTag.id == UserWineTag.tag_id)
        .where(UserWineTag.user_id == context.user.id, UserWineTag.wine_id.in_(wine_ids))
        .order_by(UserTag.name.asc()),
    ).all()
    result: dict[UUID, list[str]] = {wine_id: [] for wine_id in wine_ids}
    for wine_id, tag_name in rows:
        result.setdefault(wine_id, []).append(tag_name)
    return result


def wine_response(wine: Wine, tag_names: list[str] | None = None) -> WineResponse:
    response = WineResponse.model_validate(wine)
    if tag_names is not None and tag_names:
        return response.model_copy(update={"tags": tag_names})
    return response


def share_offer_response(db: Session, offer: WineShareOffer) -> WineShareOfferResponse:
    wine = db.get(Wine, offer.wine_id)
    sender = db.get(User, offer.created_by_user_id)
    return WineShareOfferResponse(
        id=offer.id,
        wine_id=offer.wine_id,
        wine_name=wine.name if wine else "",
        wine_vintage=wine.vintage if wine else "",
        created_by_email=sender.email if sender else "",
        recipient_email=offer.recipient_email,
        share_pct=offer.share_pct,
        message=offer.message,
        status=offer.status,
        created_at=offer.created_at,
        decided_at=offer.decided_at,
    )


def user_personal_household(db: Session, user_id: UUID) -> Household | None:
    membership = db.scalar(
        select(Membership)
        .where(Membership.user_id == user_id, Membership.role == "owner")
        .order_by(Membership.id.asc()),
    )
    return db.get(Household, membership.household_id) if membership is not None else None


def normalize_owner_rows(raw_owners: list[dict]) -> list[dict]:
    owners: list[dict] = []
    for raw_owner in raw_owners or []:
        name = str(raw_owner.get("name") or "").strip()
        email = str(raw_owner.get("email") or "").strip().lower()
        share_pct = raw_owner.get("share_pct") or 0
        if not name and email:
            name = email
        if not name or not share_pct:
            continue
        owner = {"name": name, "share_pct": float(share_pct)}
        if email:
            owner["email"] = email
        owners.append(owner)
    return owners


def upsert_owner_share(wine: Wine, owner_name: str, owner_email: str, share_pct: Decimal) -> None:
    cleaned_email = owner_email.strip().lower()
    cleaned_name = owner_name.strip() or cleaned_email
    owners = normalize_owner_rows([dict(owner) for owner in (wine.owners or [])])
    for owner in owners:
        if str(owner.get("email", "")).strip().lower() == cleaned_email:
            owner["name"] = cleaned_name
            owner["email"] = cleaned_email
            owner["share_pct"] = float(share_pct)
            wine.owners = owners
            return
    owners.append({"name": cleaned_name, "email": cleaned_email, "share_pct": float(share_pct)})
    wine.owners = owners


def allocated_bottle_count(total_quantity: int, share_pct: Decimal) -> int:
    if total_quantity <= 0 or share_pct <= 0:
        return 0
    allocated = (Decimal(total_quantity) * share_pct / Decimal("100")).quantize(Decimal("1"), rounding=ROUND_HALF_UP)
    return max(1, int(allocated))


def wine_copy_for_recipient(source: Wine, target_household: Household, recipient: User, share_pct: Decimal) -> Wine:
    recipient_quantity = allocated_bottle_count(source.quantity, share_pct)
    return Wine(
        household_id=target_household.id,
        created_by_user_id=recipient.id,
        name=source.name,
        producer=source.producer,
        vintage=source.vintage,
        quantity=recipient_quantity,
        currency=source.currency,
        price=source.price,
        current_value=source.current_value,
        status=source.status,
        format=source.format,
        type=source.type,
        region=source.region,
        appellation=source.appellation,
        merchant=source.merchant,
        order_date=source.order_date,
        expected_delivery=source.expected_delivery,
        owner_share_pct=Decimal("100") if recipient_quantity else Decimal("0"),
        notes=source.notes,
        ai_notes=source.ai_notes,
        drink_from=source.drink_from,
        drink_peak_from=source.drink_peak_from,
        drink_peak_to=source.drink_peak_to,
        drink_to=source.drink_to,
        drink_window_notes=source.drink_window_notes,
        ai_value_notes=source.ai_value_notes,
        ai_value_estimated_at=source.ai_value_estimated_at,
        rating=source.rating,
        owners=[],
        tags=[],
        grapes=source.grapes,
        scores=source.scores,
    )


def set_user_wine_tags(db: Session, context: CurrentContext, wine: Wine, tag_names: list[str]) -> None:
    db.query(UserWineTag).filter(UserWineTag.user_id == context.user.id, UserWineTag.wine_id == wine.id).delete()
    cleaned_names = []
    for tag_name in tag_names:
        cleaned_name = " ".join(str(tag_name).strip().split())[:80]
        if cleaned_name and cleaned_name.lower() not in [name.lower() for name in cleaned_names]:
            cleaned_names.append(cleaned_name)
    for tag_name in cleaned_names:
        tag = get_or_create_user_tag(db, context, tag_name)
        db.add(UserWineTag(user_id=context.user.id, wine_id=wine.id, tag_id=tag.id))
    wine.tags = []


@router.get("", response_model=list[WineResponse])
def list_wines(
    db: Session = Depends(get_db),
    context: CurrentContext = Depends(get_current_context),
) -> list[WineResponse]:
    wines = list(
        db.scalars(
            select(Wine)
            .where(Wine.household_id == context.household.id)
            .order_by(Wine.name.asc(), Wine.vintage.desc()),
        ),
    )
    wines = [wine for wine in wines if user_can_see_wine(context, wine)]
    tags_by_wine = user_tag_names_by_wine(db, context, [wine.id for wine in wines])
    return [wine_response(wine, tags_by_wine.get(wine.id)) for wine in wines]


@router.get("/share-offers", response_model=list[WineShareOfferResponse])
def list_share_offers(
    db: Session = Depends(get_db),
    context: CurrentContext = Depends(get_current_context),
) -> list[WineShareOfferResponse]:
    offers = db.scalars(
        select(WineShareOffer)
        .where(
            WineShareOffer.recipient_user_id == context.user.id,
            WineShareOffer.status == "pending",
        )
        .order_by(WineShareOffer.created_at.desc()),
    )
    return [share_offer_response(db, offer) for offer in offers]


@router.post("/{wine_id}/share-offers", response_model=WineShareOfferResponse, status_code=status.HTTP_201_CREATED)
def create_share_offer(
    wine_id: UUID,
    payload: WineShareOfferCreate,
    db: Session = Depends(get_db),
    context: CurrentContext = Depends(require_write_context),
) -> WineShareOfferResponse:
    wine = get_household_wine(db, context, wine_id)
    recipient_email = payload.email.strip().lower()
    if recipient_email == context.user.email.lower():
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Cannot share a wine with yourself")
    recipient = db.scalar(select(User).where(User.email == recipient_email))
    if recipient is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User must register before receiving a share offer")

    offer = db.scalar(
        select(WineShareOffer).where(
            WineShareOffer.wine_id == wine.id,
            WineShareOffer.recipient_user_id == recipient.id,
            WineShareOffer.status == "pending",
        ),
    )
    if offer is None:
        offer = WineShareOffer(
            household_id=context.household.id,
            wine_id=wine.id,
            created_by_user_id=context.user.id,
            recipient_user_id=recipient.id,
            recipient_email=recipient.email,
        )
        db.add(offer)
    offer.share_pct = payload.share_pct
    offer.message = payload.message.strip()
    db.commit()
    db.refresh(offer)
    return share_offer_response(db, offer)


@router.post("/share-offers/{offer_id}/accept", response_model=WineResponse)
def accept_share_offer(
    offer_id: UUID,
    db: Session = Depends(get_db),
    context: CurrentContext = Depends(get_current_context),
) -> WineResponse:
    offer = db.scalar(
        select(WineShareOffer).where(
            WineShareOffer.id == offer_id,
            WineShareOffer.recipient_user_id == context.user.id,
            WineShareOffer.status == "pending",
        ),
    )
    if offer is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Share offer not found")
    wine = db.get(Wine, offer.wine_id)
    if wine is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Wine not found")
    sender = db.get(User, offer.created_by_user_id)
    target_household = user_personal_household(db, context.user.id) or context.household
    if not wine.owners:
        if sender is not None:
            upsert_owner_share(wine, sender.display_name or sender.email, sender.email, Decimal("100") - offer.share_pct)
    upsert_owner_share(wine, context.user.display_name or context.user.email, context.user.email, offer.share_pct)
    copied_wine = wine_copy_for_recipient(wine, target_household, context.user, offer.share_pct)
    db.add(copied_wine)
    offer.status = "accepted"
    offer.decided_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(copied_wine)
    return wine_response(copied_wine, user_tag_names_by_wine(db, context, [copied_wine.id]).get(copied_wine.id))


@router.post("/share-offers/{offer_id}/decline", response_model=WineShareOfferResponse)
def decline_share_offer(
    offer_id: UUID,
    db: Session = Depends(get_db),
    context: CurrentContext = Depends(get_current_context),
) -> WineShareOfferResponse:
    offer = db.scalar(
        select(WineShareOffer).where(
            WineShareOffer.id == offer_id,
            WineShareOffer.recipient_user_id == context.user.id,
            WineShareOffer.status == "pending",
        ),
    )
    if offer is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Share offer not found")
    offer.status = "declined"
    offer.decided_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(offer)
    return share_offer_response(db, offer)


@router.post("", response_model=WineResponse, status_code=status.HTTP_201_CREATED)
def create_wine(
    payload: WineCreate,
    db: Session = Depends(get_db),
    context: CurrentContext = Depends(require_write_context),
) -> WineResponse:
    data = payload.model_dump()
    tag_names = data.pop("tags", [])
    data["owners"] = normalize_owner_rows(data.get("owners", []))
    wine = Wine(
        household_id=context.household.id,
        created_by_user_id=context.user.id,
        **data,
    )
    db.add(wine)
    db.flush()
    set_user_wine_tags(db, context, wine, tag_names)
    db.commit()
    db.refresh(wine)
    return wine_response(wine, tag_names)


@router.get("/{wine_id}", response_model=WineResponse)
def get_wine(
    wine_id: UUID,
    db: Session = Depends(get_db),
    context: CurrentContext = Depends(get_current_context),
) -> WineResponse:
    wine = get_household_wine(db, context, wine_id)
    return wine_response(wine, user_tag_names_by_wine(db, context, [wine.id]).get(wine.id))


@router.patch("/{wine_id}", response_model=WineResponse)
def update_wine(
    wine_id: UUID,
    payload: WineUpdate,
    db: Session = Depends(get_db),
    context: CurrentContext = Depends(require_write_context),
) -> WineResponse:
    wine = get_household_wine(db, context, wine_id)
    data = payload.model_dump(exclude_unset=True)
    tag_names = data.pop("tags", None)
    for field, value in data.items():
        if field == "owners":
            value = normalize_owner_rows(value or [])
        setattr(wine, field, value)
    if tag_names is not None:
        set_user_wine_tags(db, context, wine, tag_names)
    db.commit()
    db.refresh(wine)
    return wine_response(wine, tag_names if tag_names is not None else user_tag_names_by_wine(db, context, [wine.id]).get(wine.id))


@router.delete("/{wine_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_wine(
    wine_id: UUID,
    db: Session = Depends(get_db),
    context: CurrentContext = Depends(require_admin_context),
) -> Response:
    wine = get_household_wine(db, context, wine_id)
    db.delete(wine)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
