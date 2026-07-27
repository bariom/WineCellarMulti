import logging
import shutil
import struct
import uuid
from datetime import UTC, date, datetime
from decimal import Decimal
from pathlib import Path
from uuid import UUID

from fastapi import APIRouter, Depends, File, HTTPException, Query, Response, UploadFile, status
from fastapi.responses import FileResponse
from sqlalchemy import case, func, or_, select
from sqlalchemy.orm import Session, defer
from starlette.concurrency import run_in_threadpool

from app.api.deps import (
    CurrentContext,
    get_current_context,
    require_admin_context,
    require_wine_photo_write_context,
    require_write_context,
)
from app.api.routes.catalog import ensure_catalog_entry_for_wine_data
from app.api.routes.tags import get_or_create_user_tag
from app.core.config import settings
from app.core.wine_types import normalize_wine_type
from app.db.session import get_db
from app.models import (
    Household,
    Membership,
    User,
    UserNotification,
    UserTag,
    UserWineTag,
    Wine,
    WinePhotoLibraryEntry,
    WineShareOffer,
    WineTastingEntry,
    WineValueHistory,
)
from app.schemas.wine import (
    TastingArchiveItemResponse,
    TastingArchivePageResponse,
    WineConsume,
    WineCreate,
    WineResponse,
    WineShareOfferCreate,
    WineShareOfferRecipientResponse,
    WineShareOfferResponse,
    WineTastingEntryUpdate,
    WineUpdate,
)
from app.services.bottle_photo_ai import (
    BottlePhotoAiUnavailable,
    BottlePhotoNotDetected,
    InvalidBottlePhoto,
    process_bottle_photo,
)
from app.services.notifications import create_user_notification
from app.services.wine_photo_library import (
    archive_wine_photo,
    copy_library_photo,
    library_photo_path,
    normalize_photo_identity,
)

router = APIRouter()
logger = logging.getLogger(__name__)

PHOTO_SIZES = {"thumbnail": (160, 240, 512_000), "detail": (480, 720, 2_000_000)}


def wine_photo_path(wine: Wine, size: str) -> Path:
    return (
        Path(settings.wine_photo_storage_dir)
        / str(wine.household_id)
        / str(wine.id)
        / f"{size}.png"
    )


def validate_processed_photo(content: bytes, size: str) -> None:
    expected_width, expected_height, max_bytes = PHOTO_SIZES[size]
    if len(content) > max_bytes:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail="Processed bottle photo is too large",
        )
    if len(content) < 33 or content[:8] != b"\x89PNG\r\n\x1a\n" or content[12:16] != b"IHDR":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Bottle photos must be processed PNG images",
        )
    width, height = struct.unpack(">II", content[16:24])
    color_type = content[25]
    if (width, height) != (expected_width, expected_height):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid {size} bottle photo dimensions",
        )
    if color_type not in {4, 6}:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Bottle photos must include transparency",
        )


def copy_wine_photo(source: Wine, target: Wine) -> None:
    source_paths = {size: wine_photo_path(source, size) for size in PHOTO_SIZES}
    if not source.photo_version or not all(path.is_file() for path in source_paths.values()):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Bottle photo not found")

    target_dir = wine_photo_path(target, "detail").parent
    target_dir.mkdir(parents=True, exist_ok=True)
    temporary_paths: list[Path] = []
    try:
        for size, source_path in source_paths.items():
            temporary = wine_photo_path(target, size).with_suffix(".tmp")
            shutil.copyfile(source_path, temporary)
            temporary_paths.append(temporary)
        for size, temporary in zip(PHOTO_SIZES, temporary_paths, strict=True):
            temporary.replace(wine_photo_path(target, size))
    finally:
        for temporary in temporary_paths:
            temporary.unlink(missing_ok=True)

    target.photo_version = uuid.uuid4().hex


def photo_urls(wine: Wine) -> dict[str, str]:
    if not wine.photo_version:
        return {"photo_thumbnail_url": "", "photo_detail_url": ""}
    base = f"/api/v1/wines/{wine.id}/photo"
    version = wine.photo_version
    return {
        "photo_thumbnail_url": f"{base}/thumbnail?v={version}",
        "photo_detail_url": f"{base}/detail?v={version}",
    }


def user_can_see_wine(context: CurrentContext, wine: Wine) -> bool:
    if (
        context.membership.role in ("owner", "admin")
        or context.membership.visibility_scope == "all"
    ):
        return True
    if wine.created_by_user_id == context.user.id:
        return True
    user_email = context.user.email.strip().lower()
    return any(
        str(owner.get("email", "")).strip().lower() == user_email for owner in (wine.owners or [])
    )


def get_household_wine(
    db: Session, context: CurrentContext, wine_id: UUID, *, enforce_visibility: bool = True
) -> Wine:
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


def user_tag_names_by_wine(
    db: Session, context: CurrentContext, wine_ids: list[UUID]
) -> dict[UUID, list[str]]:
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


def wine_value_history_by_wine(
    db: Session, wine_ids: list[UUID]
) -> dict[UUID, list[WineValueHistory]]:
    if not wine_ids:
        return {}
    rows = db.scalars(
        select(WineValueHistory)
        .where(WineValueHistory.wine_id.in_(wine_ids))
        .order_by(WineValueHistory.recorded_at.asc(), WineValueHistory.id.asc()),
    )
    result: dict[UUID, list[WineValueHistory]] = {wine_id: [] for wine_id in wine_ids}
    for row in rows:
        result.setdefault(row.wine_id, []).append(row)
    return result


def record_wine_value_history(db: Session, wine: Wine, *, source: str) -> None:
    if wine.current_value is None:
        return
    db.add(
        WineValueHistory(
            wine_id=wine.id,
            value=wine.current_value,
            currency=wine.currency,
            source=source,
            recorded_at=datetime.now(UTC),
        ),
    )


def wine_response(
    wine: Wine,
    tag_names: list[str] | None = None,
    value_history: list[WineValueHistory] | None = None,
    *,
    include_details: bool = True,
) -> WineResponse:
    if include_details:
        response = WineResponse.model_validate(wine)
        response = response.model_copy(update={"details_loaded": True, **photo_urls(wine)})
        if value_history is not None:
            response = response.model_copy(update={"value_history": value_history})
        if tag_names is not None and tag_names:
            return response.model_copy(update={"tags": tag_names})
        return response

    return WineResponse(
        id=wine.id,
        details_loaded=False,
        household_id=wine.household_id,
        name=wine.name,
        producer=wine.producer,
        vintage=wine.vintage,
        quantity=wine.quantity,
        currency=wine.currency,
        price=wine.price,
        current_value=wine.current_value,
        value_not_found=wine.value_not_found,
        status=wine.status,
        format=wine.format,
        type=wine.type,
        region=wine.region,
        appellation=wine.appellation,
        merchant=wine.merchant,
        order_date=wine.order_date,
        expected_delivery=wine.expected_delivery,
        owner_share_pct=wine.owner_share_pct,
        notes=wine.notes,
        ai_notes=wine.ai_notes,
        drink_from=wine.drink_from,
        drink_peak_from=wine.drink_peak_from,
        drink_peak_to=wine.drink_peak_to,
        drink_to=wine.drink_to,
        drink_window_notes=wine.drink_window_notes,
        ai_value_notes=wine.ai_value_notes,
        ai_value_estimated_at=wine.ai_value_estimated_at,
        rating=wine.rating,
        owners=wine.owners or [],
        tags=tag_names or [],
        grapes=wine.grapes or [],
        grapes_source_url=wine.grapes_source_url or "",
        grapes_source_title=wine.grapes_source_title or "",
        grapes_verified_at=wine.grapes_verified_at,
        grapes_not_applicable=wine.grapes_not_applicable,
        scores=wine.scores or [],
        scores_not_applicable=wine.scores_not_applicable,
        created_at=wine.created_at,
        **photo_urls(wine),
        tasting_history=[],
        value_history=[],
    )


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


def normalize_tasting_history(raw_entries: list[dict]) -> list[dict]:
    entries: list[dict] = []
    for raw_entry in raw_entries or []:
        consumed_at = str(raw_entry.get("consumed_at") or "").strip()
        created_at = str(raw_entry.get("created_at") or "").strip()
        enjoyment = str(raw_entry.get("enjoyment") or "").strip()
        if enjoyment not in {"positive", "negative"}:
            enjoyment = ""
        if not consumed_at or not created_at:
            continue
        entries.append(
            {
                "id": str(raw_entry.get("id") or uuid.uuid4()),
                "consumed_at": consumed_at,
                "note": str(raw_entry.get("note") or "").strip(),
                "rating": max(0, min(int(raw_entry.get("rating") or 0), 6)),
                "enjoyment": enjoyment,
                "occasion": str(raw_entry.get("occasion") or "").strip(),
                "pairing": str(raw_entry.get("pairing") or "").strip(),
                "companions": str(raw_entry.get("companions") or "").strip(),
                "created_at": created_at,
            },
        )
    return entries


def tasting_archive_entry_matches(entry: dict, wine: Wine, query: str) -> bool:
    if not query:
        return True
    haystack = " ".join(
        [
            wine.name,
            wine.producer,
            wine.vintage,
            wine.region,
            wine.appellation,
            str(entry.get("note") or ""),
            str(entry.get("occasion") or ""),
            str(entry.get("pairing") or ""),
            str(entry.get("companions") or ""),
        ],
    ).lower()
    return query in haystack


def tasting_archive_entry(entry: WineTastingEntry, wine: Wine) -> TastingArchiveItemResponse:
    return TastingArchiveItemResponse(
        wine_id=wine.id,
        wine_name=wine.name,
        wine_producer=wine.producer,
        wine_vintage=wine.vintage,
        wine_format=wine.format,
        wine_type=wine.type,
        wine_region=wine.region,
        wine_appellation=wine.appellation,
        wine_status=wine.status,
        consumed_at=entry.consumed_at,
        note=entry.note,
        rating=entry.rating,
        enjoyment=entry.enjoyment,
        occasion=entry.occasion,
        pairing=entry.pairing,
        companions=entry.companions,
        created_at=entry.created_at,
        tasting_id=entry.id,
    )


def tasting_entry_index(wine: Wine, tasting_id: UUID) -> tuple[list[dict], int]:
    entries = normalize_tasting_history([dict(entry) for entry in (wine.tasting_history or [])])
    tasting_id_str = str(tasting_id)
    for index, entry in enumerate(entries):
        if entry.get("id") == tasting_id_str:
            return entries, index
    raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Tasting entry not found")


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


def wine_copy_for_recipient(
    source: Wine, target_household: Household, recipient: User, share_pct: Decimal
) -> Wine:
    recipient_email = recipient.email.strip().lower()
    recipient_owners = normalize_owner_rows([dict(owner) for owner in (source.owners or [])])
    if not any(
        str(owner.get("email", "")).strip().lower() == recipient_email for owner in recipient_owners
    ):
        recipient_owners.append(
            {
                "name": recipient.display_name or recipient.email,
                "email": recipient_email,
                "share_pct": float(share_pct),
            },
        )
    return Wine(
        household_id=target_household.id,
        created_by_user_id=recipient.id,
        name=source.name,
        producer=source.producer,
        vintage=source.vintage,
        quantity=source.quantity,
        currency=source.currency,
        price=source.price,
        current_value=source.current_value,
        value_not_found=source.value_not_found,
        status=source.status,
        format=source.format,
        type=source.type,
        region=source.region,
        appellation=source.appellation,
        merchant=source.merchant,
        order_date=source.order_date,
        expected_delivery=source.expected_delivery,
        owner_share_pct=share_pct,
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
        owners=recipient_owners,
        tags=[],
        grapes=source.grapes,
        grapes_not_applicable=source.grapes_not_applicable,
        scores=source.scores,
        scores_not_applicable=source.scores_not_applicable,
        tasting_history=normalize_tasting_history(
            [dict(entry) for entry in (source.tasting_history or [])]
        ),
    )


def set_user_wine_tags(
    db: Session, context: CurrentContext, wine: Wine, tag_names: list[str]
) -> None:
    db.query(UserWineTag).filter(
        UserWineTag.user_id == context.user.id, UserWineTag.wine_id == wine.id
    ).delete()
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
            .options(defer(Wine.tasting_history))
            .where(Wine.household_id == context.household.id)
            .order_by(Wine.name.asc(), Wine.vintage.desc()),
        ),
    )
    wines = [wine for wine in wines if user_can_see_wine(context, wine)]
    wine_ids = [wine.id for wine in wines]
    tags_by_wine = user_tag_names_by_wine(db, context, wine_ids)
    return [wine_response(wine, tags_by_wine.get(wine.id), include_details=False) for wine in wines]


@router.get("/value-history/portfolio")
def portfolio_value_history(
    db: Session = Depends(get_db), context: CurrentContext = Depends(get_current_context)
) -> list[dict]:
    wines = {
        wine.id: wine
        for wine in db.scalars(select(Wine).where(Wine.household_id == context.household.id))
        if user_can_see_wine(context, wine)
    }
    if not wines:
        return []
    rows = db.scalars(
        select(WineValueHistory)
        .where(WineValueHistory.wine_id.in_(wines))
        .order_by(WineValueHistory.recorded_at.asc(), WineValueHistory.id.asc())
    )
    values: dict[UUID, Decimal] = {}
    points: list[dict] = []
    for row in rows:
        wine = wines[row.wine_id]
        values[wine.id] = row.value * max(wine.quantity, 0)
        points.append({"recorded_at": row.recorded_at, "value": sum(values.values(), Decimal("0"))})
    current = sum(
        (
            Decimal(str(wine.current_value or wine.price or 0)) * max(wine.quantity, 0)
            for wine in wines.values()
        ),
        Decimal("0"),
    )
    if not points or points[-1]["value"] != current:
        points.append({"recorded_at": datetime.now(UTC), "value": current})
    return points[-30:]


@router.get("/tasting-archive", response_model=TastingArchivePageResponse)
def list_tasting_archive(
    q: str = Query(default=""),
    type: str = Query(default=""),
    status_filter: str = Query(default="", alias="status"),
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db),
    context: CurrentContext = Depends(get_current_context),
) -> TastingArchivePageResponse:
    query = q.strip().lower()
    normalized_type = normalize_wine_type(type).lower()
    normalized_status = status_filter.strip().lower()
    filters = [WineTastingEntry.household_id == context.household.id]
    if normalized_type:
        filters.append(func.lower(Wine.type) == normalized_type)
    if normalized_status:
        filters.append(func.lower(Wine.status) == normalized_status)
    if query:
        like = f"%{query}%"
        filters.append(
            or_(
                func.lower(Wine.name).like(like),
                func.lower(Wine.producer).like(like),
                func.lower(Wine.vintage).like(like),
                func.lower(Wine.region).like(like),
                func.lower(Wine.appellation).like(like),
                func.lower(WineTastingEntry.note).like(like),
                func.lower(WineTastingEntry.occasion).like(like),
                func.lower(WineTastingEntry.pairing).like(like),
                func.lower(WineTastingEntry.companions).like(like),
            )
        )

    base = (
        select(WineTastingEntry, Wine)
        .join(Wine, Wine.id == WineTastingEntry.wine_id)
        .where(*filters)
    )
    stats = db.execute(
        select(
            func.count(WineTastingEntry.id),
            func.coalesce(func.sum(case((WineTastingEntry.rating > 0, 1), else_=0)), 0),
            func.coalesce(func.sum(case((WineTastingEntry.note != "", 1), else_=0)), 0),
            func.max(WineTastingEntry.consumed_at),
        )
        .join(Wine, Wine.id == WineTastingEntry.wine_id)
        .where(*filters)
    ).one()
    rows = db.execute(
        base.order_by(
            WineTastingEntry.consumed_at.desc(),
            WineTastingEntry.created_at.desc(),
            WineTastingEntry.id.desc(),
        )
        .offset(offset)
        .limit(limit)
    ).all()
    visible_items = [
        tasting_archive_entry(entry, wine)
        for entry, wine in rows
        if user_can_see_wine(context, wine)
    ]

    return TastingArchivePageResponse(
        total=int(stats[0] or 0),
        limit=limit,
        offset=offset,
        rated_count=int(stats[1] or 0),
        notes_count=int(stats[2] or 0),
        latest_consumed_at=stats[3],
        items=visible_items,
    )


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


@router.get(
    "/{wine_id}/share-offer-recipients", response_model=list[WineShareOfferRecipientResponse]
)
def list_share_offer_recipients(
    wine_id: UUID,
    db: Session = Depends(get_db),
    context: CurrentContext = Depends(require_write_context),
) -> list[WineShareOfferRecipientResponse]:
    wine = get_household_wine(db, context, wine_id)
    owner_rows = normalize_owner_rows([dict(owner) for owner in (wine.owners or [])])
    owner_by_email = {
        str(owner.get("email") or "").strip().lower(): owner
        for owner in owner_rows
        if str(owner.get("email") or "").strip()
    }
    if not owner_by_email:
        return []
    original_sender_ids = set(
        db.scalars(
            select(WineShareOffer.created_by_user_id).where(
                WineShareOffer.recipient_wine_id == wine.id,
                WineShareOffer.status.in_(("accepted", "revocation_pending")),
            ),
        ),
    )
    existing_recipient_ids = set(
        db.scalars(
            select(WineShareOffer.recipient_user_id).where(
                WineShareOffer.wine_id == wine.id,
                WineShareOffer.status.in_(("pending", "accepted", "revocation_pending")),
            ),
        ),
    )
    users = db.scalars(select(User).where(User.email.in_(list(owner_by_email))))
    recipients: list[WineShareOfferRecipientResponse] = []
    for user in users:
        if (
            user.id == context.user.id
            or user.id in original_sender_ids
            or user.id in existing_recipient_ids
        ):
            continue
        owner = owner_by_email[user.email.lower()]
        recipients.append(
            WineShareOfferRecipientResponse(
                email=user.email,
                display_name=str(owner.get("name") or user.display_name or user.email),
                share_pct=Decimal(str(owner.get("share_pct") or 0)),
            ),
        )
    return sorted(recipients, key=lambda item: (item.display_name.lower(), item.email.lower()))


@router.get("/{wine_id}/share-offers", response_model=list[WineShareOfferResponse])
def list_outgoing_share_offers(
    wine_id: UUID,
    db: Session = Depends(get_db),
    context: CurrentContext = Depends(require_write_context),
) -> list[WineShareOfferResponse]:
    wine = get_household_wine(db, context, wine_id)
    offers = db.scalars(
        select(WineShareOffer)
        .where(
            WineShareOffer.wine_id == wine.id,
            WineShareOffer.created_by_user_id == context.user.id,
            WineShareOffer.status.in_(("pending", "accepted", "revocation_pending")),
        )
        .order_by(WineShareOffer.created_at.desc()),
    )
    return [share_offer_response(db, offer) for offer in offers]


@router.post(
    "/{wine_id}/share-offers",
    response_model=WineShareOfferResponse,
    status_code=status.HTTP_201_CREATED,
)
def create_share_offer(
    wine_id: UUID,
    payload: WineShareOfferCreate,
    db: Session = Depends(get_db),
    context: CurrentContext = Depends(require_write_context),
) -> WineShareOfferResponse:
    wine = get_household_wine(db, context, wine_id)
    recipient_email = payload.email.strip().lower()
    if recipient_email == context.user.email.lower():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="Cannot share a wine with yourself"
        )
    recipient = db.scalar(select(User).where(User.email == recipient_email))
    if recipient is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User must register before receiving a share offer",
        )
    original_sender = db.scalar(
        select(WineShareOffer.id).where(
            WineShareOffer.recipient_wine_id == wine.id,
            WineShareOffer.created_by_user_id == recipient.id,
            WineShareOffer.status.in_(("accepted", "revocation_pending")),
        ),
    )
    if original_sender is not None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot send a received shared position back to its original sender",
        )

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
            upsert_owner_share(
                wine,
                sender.display_name or sender.email,
                sender.email,
                Decimal("100") - offer.share_pct,
            )
    upsert_owner_share(
        wine, context.user.display_name or context.user.email, context.user.email, offer.share_pct
    )
    copied_wine = wine_copy_for_recipient(wine, target_household, context.user, offer.share_pct)
    db.add(copied_wine)
    db.flush()
    offer.recipient_wine_id = copied_wine.id
    record_wine_value_history(db, copied_wine, source="shared")
    offer.status = "accepted"
    offer.decided_at = datetime.now(UTC)
    if sender is not None:
        italian = (sender.locale or "it").lower().startswith("it")
        wine_label = " ".join(part for part in (wine.name, wine.vintage) if part).strip()
        recipient_name = context.user.display_name or context.user.email
        create_user_notification(
            db,
            sender,
            kind="share_offer_response",
            title="Condivisione accettata" if italian else "Shared position accepted",
            message=(
                f"{recipient_name} ha accettato la condivisione di {wine_label}."
                if italian
                else f"{recipient_name} accepted the shared position for {wine_label}."
            ),
            action_url=f"/cellar?wine_id={wine.id}",
            fingerprint=f"share-offer-response:{offer.id}:accepted",
        )
    db.commit()
    db.refresh(copied_wine)
    return wine_response(
        copied_wine,
        user_tag_names_by_wine(db, context, [copied_wine.id]).get(copied_wine.id),
        wine_value_history_by_wine(db, [copied_wine.id]).get(copied_wine.id),
    )


@router.post("/share-offers/{offer_id}/revoke", response_model=WineShareOfferResponse)
def request_share_offer_revocation(
    offer_id: UUID,
    db: Session = Depends(get_db),
    context: CurrentContext = Depends(require_write_context),
) -> WineShareOfferResponse:
    offer = db.scalar(
        select(WineShareOffer).where(
            WineShareOffer.id == offer_id,
            WineShareOffer.household_id == context.household.id,
            WineShareOffer.created_by_user_id == context.user.id,
            WineShareOffer.status == "accepted",
        ),
    )
    if offer is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Accepted share offer not found"
        )
    recipient = db.get(User, offer.recipient_user_id)
    if recipient is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Share recipient not found"
        )
    wine = db.get(Wine, offer.wine_id)
    wine_label = " ".join(
        part for part in ((wine.name if wine else "Wine"), (wine.vintage if wine else "")) if part
    ).strip()
    sender_label = context.user.display_name or context.user.email
    share_label = f"{offer.share_pct}% of {wine.quantity if wine else 0} bottles"
    if recipient.locale.lower().startswith("it"):
        title = f"Rimozione richiesta: {wine_label}"
        message = f"{sender_label} ({context.user.email}) chiede di rimuovere dalla tua cantina la posizione condivisa '{wine_label}' ({offer.share_pct}% di {wine.quantity if wine else 0} bottiglie). Approva per completare l'operazione."
    else:
        title = f"Removal requested: {wine_label}"
        message = f"{sender_label} ({context.user.email}) requests removal of the shared position '{wine_label}' ({share_label}) from your cellar. Approve to complete the operation."
    offer.status = "revocation_pending"
    create_user_notification(
        db,
        recipient,
        kind="share_revocation",
        title=title,
        message=message,
        action_url=f"/share-offer-revocation/{offer.id}",
        fingerprint=f"share-revocation:{offer.id}",
    )
    db.commit()
    db.refresh(offer)
    return share_offer_response(db, offer)


@router.post(
    "/share-offers/{offer_id}/revocation/{decision}", response_model=WineShareOfferResponse
)
def decide_share_offer_revocation(
    offer_id: UUID,
    decision: str,
    db: Session = Depends(get_db),
    context: CurrentContext = Depends(get_current_context),
) -> WineShareOfferResponse:
    if decision not in {"approve", "decline"}:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid revocation decision"
        )
    offer = db.scalar(
        select(WineShareOffer).where(
            WineShareOffer.id == offer_id,
            WineShareOffer.recipient_user_id == context.user.id,
            WineShareOffer.status == "revocation_pending",
        ),
    )
    if offer is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Share revocation request not found"
        )
    if decision == "approve":
        copied_wine = db.get(Wine, offer.recipient_wine_id) if offer.recipient_wine_id else None
        if copied_wine is not None:
            db.delete(copied_wine)
        offer.status = "revoked"
    else:
        offer.status = "accepted"
    offer.decided_at = datetime.now(UTC)
    notification = db.scalar(
        select(UserNotification).where(
            UserNotification.user_id == context.user.id,
            UserNotification.fingerprint == f"share-revocation:{offer.id}",
        ),
    )
    if notification is not None:
        notification.read_at = datetime.now(UTC)
    sender = db.get(User, offer.created_by_user_id)
    wine = db.get(Wine, offer.wine_id)
    if sender is not None:
        wine_label = " ".join(
            part
            for part in ((wine.name if wine else "Wine"), (wine.vintage if wine else ""))
            if part
        ).strip()
        if sender.locale.lower().startswith("it"):
            title = f"Revoca comproprietà: {wine_label}"
            message = (
                f"{context.user.display_name or context.user.email} ha approvato la rimozione della posizione condivisa. "
                "Il vino è stato rimosso dalla sua cantina."
                if decision == "approve"
                else f"{context.user.display_name or context.user.email} ha scelto di mantenere la posizione condivisa nella propria cantina."
            )
        else:
            title = f"Co-ownership revocation: {wine_label}"
            message = (
                f"{context.user.display_name or context.user.email} approved removal of the shared position. "
                "The wine was removed from their cellar."
                if decision == "approve"
                else f"{context.user.display_name or context.user.email} chose to keep the shared position in their cellar."
            )
        create_user_notification(
            db,
            sender,
            kind="share_revocation_result",
            title=title,
            message=message,
            action_url="/cellar",
            fingerprint=f"share-revocation-result:{offer.id}:{decision}",
        )
    db.commit()
    db.refresh(offer)
    return share_offer_response(db, offer)


@router.delete("/share-offers/{offer_id}", response_model=WineShareOfferResponse)
def cancel_share_offer(
    offer_id: UUID,
    db: Session = Depends(get_db),
    context: CurrentContext = Depends(require_write_context),
) -> WineShareOfferResponse:
    offer = db.scalar(
        select(WineShareOffer).where(
            WineShareOffer.id == offer_id,
            WineShareOffer.household_id == context.household.id,
            WineShareOffer.created_by_user_id == context.user.id,
            WineShareOffer.status == "pending",
        ),
    )
    if offer is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Pending share offer not found"
        )
    offer.status = "cancelled"
    offer.decided_at = datetime.now(UTC)
    db.commit()
    db.refresh(offer)
    return share_offer_response(db, offer)


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
    sender = db.get(User, offer.created_by_user_id)
    wine = db.get(Wine, offer.wine_id)
    offer.status = "declined"
    offer.decided_at = datetime.now(UTC)
    if sender is not None:
        italian = (sender.locale or "it").lower().startswith("it")
        wine_label = " ".join(
            part for part in (wine.name if wine else "", wine.vintage if wine else "") if part
        ).strip() or ("vino" if italian else "wine")
        recipient_name = context.user.display_name or context.user.email
        create_user_notification(
            db,
            sender,
            kind="share_offer_response",
            title="Condivisione rifiutata" if italian else "Shared position declined",
            message=(
                f"{recipient_name} ha rifiutato la condivisione di {wine_label}."
                if italian
                else f"{recipient_name} declined the shared position for {wine_label}."
            ),
            action_url=f"/cellar?wine_id={offer.wine_id}",
            fingerprint=f"share-offer-response:{offer.id}:declined",
        )
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
    data["type"] = normalize_wine_type(data.get("type"))
    if data.get("scores"):
        data["scores_not_applicable"] = False
    if data.get("grapes"):
        data["grapes_not_applicable"] = False
    if data.get("current_value") is not None:
        data["value_not_found"] = False
    wine = Wine(
        household_id=context.household.id,
        created_by_user_id=context.user.id,
        **data,
    )
    db.add(wine)
    db.flush()
    ensure_catalog_entry_for_wine_data(db, data)
    record_wine_value_history(db, wine, source="manual")
    set_user_wine_tags(db, context, wine, tag_names)
    db.commit()
    db.refresh(wine)
    return wine_response(wine, tag_names, wine_value_history_by_wine(db, [wine.id]).get(wine.id))


@router.get("/{wine_id}", response_model=WineResponse)
def get_wine(
    wine_id: UUID,
    db: Session = Depends(get_db),
    context: CurrentContext = Depends(get_current_context),
) -> WineResponse:
    wine = get_household_wine(db, context, wine_id)
    return wine_response(
        wine,
        user_tag_names_by_wine(db, context, [wine.id]).get(wine.id),
        wine_value_history_by_wine(db, [wine.id]).get(wine.id),
    )


@router.post("/photo/process", response_class=Response)
async def process_wine_photo(
    source_image: UploadFile = File(...),
    context: CurrentContext = Depends(require_wine_photo_write_context),
) -> Response:
    del context
    if not settings.wine_photo_ai_enabled:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="AI bottle photo processing is disabled",
        )
    content = await source_image.read(settings.wine_photo_ai_max_input_bytes + 1)
    if len(content) > settings.wine_photo_ai_max_input_bytes:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail="Bottle photo is too large",
        )
    if not content:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Bottle photo is empty",
        )
    try:
        processed = await run_in_threadpool(
            process_bottle_photo,
            content,
            settings.wine_photo_ai_model,
        )
    except InvalidBottlePhoto as error:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(error)) from error
    except BottlePhotoNotDetected as error:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=str(error),
        ) from error
    except BottlePhotoAiUnavailable as error:
        logger.exception("Bottle photo AI processing is unavailable")
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=str(error),
        ) from error
    return Response(
        content=processed,
        media_type="image/png",
        headers={
            "Cache-Control": "no-store",
            "X-Bottle-Segmentation": settings.wine_photo_ai_model,
        },
    )


@router.get("/photo/suggestion")
def suggest_wine_photo(
    name: str = Query(min_length=2, max_length=200),
    producer: str = Query(min_length=1, max_length=200),
    db: Session = Depends(get_db),
    _: CurrentContext = Depends(require_write_context),
) -> dict[str, str] | None:
    normalized_name = normalize_photo_identity(name)
    normalized_producer = normalize_photo_identity(producer)
    if not normalized_name or not normalized_producer:
        return None
    library_photo = db.scalar(
        select(WinePhotoLibraryEntry).where(
            WinePhotoLibraryEntry.normalized_name == normalized_name,
            WinePhotoLibraryEntry.normalized_producer == normalized_producer,
        )
    )
    if library_photo is not None and all(
        library_photo_path(library_photo, size).is_file() for size in PHOTO_SIZES
    ):
        source_id = library_photo.source_wine_id or library_photo.id
        return {
            "source_wine_id": str(source_id),
            "thumbnail_url": (
                f"/api/v1/wines/photo/library/{source_id}/thumbnail"
                f"?v={library_photo.photo_version}"
            ),
            "detail_url": (
                f"/api/v1/wines/photo/library/{source_id}/detail"
                f"?v={library_photo.photo_version}"
            ),
        }
    wine = db.scalar(
        select(Wine)
        .where(
            Wine.photo_version != "",
            func.lower(func.trim(Wine.name)) == normalized_name,
            func.lower(func.trim(Wine.producer)) == normalized_producer,
        )
        .limit(1)
    )
    if wine is None or not all(wine_photo_path(wine, size).is_file() for size in PHOTO_SIZES):
        return None
    return {
        "source_wine_id": str(wine.id),
        "thumbnail_url": f"/api/v1/wines/photo/library/{wine.id}/thumbnail?v={wine.photo_version}",
        "detail_url": f"/api/v1/wines/photo/library/{wine.id}/detail?v={wine.photo_version}",
    }


@router.get("/photo/library/{source_wine_id}/{size}", response_class=FileResponse)
def get_library_wine_photo(
    source_wine_id: UUID,
    size: str,
    db: Session = Depends(get_db),
    _: CurrentContext = Depends(get_current_context),
) -> FileResponse:
    if size not in PHOTO_SIZES:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Bottle photo not found")
    library_photo = db.get(WinePhotoLibraryEntry, source_wine_id)
    if library_photo is None:
        library_photo = db.scalar(
            select(WinePhotoLibraryEntry).where(
                WinePhotoLibraryEntry.source_wine_id == source_wine_id
            )
        )
    if library_photo is not None:
        path = library_photo_path(library_photo, size)
    else:
        source = db.get(Wine, source_wine_id)
        if source is None or not source.photo_version:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND, detail="Bottle photo not found"
            )
        path = wine_photo_path(source, size)
    if not path.is_file():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Bottle photo not found")
    return FileResponse(
        path,
        media_type="image/png",
        headers={"Cache-Control": "private, max-age=31536000, immutable"},
    )


@router.put("/{wine_id}/photo", response_model=WineResponse)
async def upload_wine_photo(
    wine_id: UUID,
    thumbnail_image: UploadFile = File(...),
    detail_image: UploadFile = File(...),
    db: Session = Depends(get_db),
    context: CurrentContext = Depends(require_wine_photo_write_context),
) -> WineResponse:
    wine = get_household_wine(db, context, wine_id)
    thumbnail = await thumbnail_image.read(PHOTO_SIZES["thumbnail"][2] + 1)
    detail = await detail_image.read(PHOTO_SIZES["detail"][2] + 1)
    validate_processed_photo(thumbnail, "thumbnail")
    validate_processed_photo(detail, "detail")

    target_dir = wine_photo_path(wine, "detail").parent
    target_dir.mkdir(parents=True, exist_ok=True)
    pending = {"thumbnail": thumbnail, "detail": detail}
    temporary_paths: list[Path] = []
    try:
        for size, content in pending.items():
            temporary = wine_photo_path(wine, size).with_suffix(".tmp")
            temporary.write_bytes(content)
            temporary_paths.append(temporary)
        for size, temporary in zip(pending, temporary_paths, strict=True):
            temporary.replace(wine_photo_path(wine, size))
    finally:
        for temporary in temporary_paths:
            temporary.unlink(missing_ok=True)

    wine.photo_version = uuid.uuid4().hex
    archive_wine_photo(db, wine)
    db.commit()
    db.refresh(wine)
    return wine_response(
        wine,
        user_tag_names_by_wine(db, context, [wine.id]).get(wine.id),
        wine_value_history_by_wine(db, [wine.id]).get(wine.id),
    )


@router.post("/{wine_id}/photo/reuse/{source_wine_id}", response_model=WineResponse)
def reuse_wine_photo(
    wine_id: UUID,
    source_wine_id: UUID,
    db: Session = Depends(get_db),
    context: CurrentContext = Depends(require_write_context),
) -> WineResponse:
    wine = get_household_wine(db, context, wine_id)
    library_photo = db.get(WinePhotoLibraryEntry, source_wine_id)
    if library_photo is None:
        library_photo = db.scalar(
            select(WinePhotoLibraryEntry).where(
                WinePhotoLibraryEntry.source_wine_id == source_wine_id
            )
        )
    if library_photo is not None:
        try:
            copy_library_photo(library_photo, wine)
        except FileNotFoundError as error:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND, detail="Bottle photo not found"
            ) from error
    else:
        source = db.get(Wine, source_wine_id)
        if source is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND, detail="Bottle photo not found"
            )
        copy_wine_photo(source, wine)
        archive_wine_photo(db, source)
    archive_wine_photo(db, wine)
    db.commit()
    db.refresh(wine)
    return wine_response(
        wine,
        user_tag_names_by_wine(db, context, [wine.id]).get(wine.id),
        wine_value_history_by_wine(db, [wine.id]).get(wine.id),
    )


@router.get("/{wine_id}/photo/{size}", response_class=FileResponse)
def get_wine_photo(
    wine_id: UUID,
    size: str,
    db: Session = Depends(get_db),
    context: CurrentContext = Depends(get_current_context),
) -> FileResponse:
    if size not in PHOTO_SIZES:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Bottle photo not found")
    wine = get_household_wine(db, context, wine_id)
    path = wine_photo_path(wine, size)
    if not wine.photo_version or not path.is_file():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Bottle photo not found")
    return FileResponse(
        path,
        media_type="image/png",
        headers={"Cache-Control": "private, max-age=31536000, immutable"},
    )


@router.delete("/{wine_id}/photo", response_model=WineResponse)
def delete_wine_photo(
    wine_id: UUID,
    db: Session = Depends(get_db),
    context: CurrentContext = Depends(require_wine_photo_write_context),
) -> WineResponse:
    wine = get_household_wine(db, context, wine_id)
    for size in PHOTO_SIZES:
        wine_photo_path(wine, size).unlink(missing_ok=True)
    wine.photo_version = ""
    db.commit()
    db.refresh(wine)
    return wine_response(
        wine,
        user_tag_names_by_wine(db, context, [wine.id]).get(wine.id),
        wine_value_history_by_wine(db, [wine.id]).get(wine.id),
    )


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
    if "type" in data:
        data["type"] = normalize_wine_type(data.get("type"))
    if data.get("scores"):
        data["scores_not_applicable"] = False
    if data.get("grapes"):
        data["grapes_not_applicable"] = False
    if data.get("current_value") is not None:
        data["value_not_found"] = False
    old_value = wine.current_value
    old_currency = wine.currency
    for field, value in data.items():
        if field == "owners":
            value = normalize_owner_rows(value or [])
        setattr(wine, field, value)
    if (
        "current_value" in data
        and wine.current_value is not None
        and (old_value != wine.current_value or old_currency != wine.currency)
    ):
        record_wine_value_history(db, wine, source="manual")
    if tag_names is not None:
        set_user_wine_tags(db, context, wine, tag_names)
    db.commit()
    db.refresh(wine)
    return wine_response(
        wine,
        tag_names
        if tag_names is not None
        else user_tag_names_by_wine(db, context, [wine.id]).get(wine.id),
        wine_value_history_by_wine(db, [wine.id]).get(wine.id),
    )


@router.post("/{wine_id}/consume", response_model=WineResponse)
def consume_wine_bottle(
    wine_id: UUID,
    payload: WineConsume,
    db: Session = Depends(get_db),
    context: CurrentContext = Depends(require_write_context),
) -> WineResponse:
    wine = get_household_wine(db, context, wine_id)
    if wine.quantity <= 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="No bottles left to consume"
        )

    tasting_entry = {
        "id": str(uuid.uuid4()),
        "consumed_at": (payload.consumed_at or datetime.now(UTC).date()).isoformat(),
        "note": payload.note.strip(),
        "rating": payload.tasting_rating,
        "enjoyment": payload.tasting_enjoyment,
        "occasion": payload.tasting_occasion.strip(),
        "pairing": payload.tasting_pairing.strip(),
        "companions": payload.tasting_companions.strip(),
        "created_at": datetime.now(UTC).isoformat(),
    }
    wine.tasting_history = normalize_tasting_history([*(wine.tasting_history or []), tasting_entry])
    db.add(
        WineTastingEntry(
            id=UUID(tasting_entry["id"]),
            wine_id=wine.id,
            household_id=wine.household_id,
            consumed_at=date.fromisoformat(tasting_entry["consumed_at"]),
            note=tasting_entry["note"],
            rating=tasting_entry["rating"],
            enjoyment=tasting_entry["enjoyment"],
            occasion=tasting_entry["occasion"],
            pairing=tasting_entry["pairing"],
            companions=tasting_entry["companions"],
            created_at=datetime.fromisoformat(tasting_entry["created_at"]),
        )
    )
    wine.quantity = max(wine.quantity - 1, 0)
    if payload.tasting_rating > 0:
        wine.rating = payload.tasting_rating
    if wine.quantity == 0:
        wine.status = "Consumed"
    elif wine.status.lower() not in {"delivered", "consegnato", "consumed", "bevuto"}:
        wine.status = "Delivered"

    db.commit()
    db.refresh(wine)
    return wine_response(
        wine,
        user_tag_names_by_wine(db, context, [wine.id]).get(wine.id),
        wine_value_history_by_wine(db, [wine.id]).get(wine.id),
    )


@router.patch("/{wine_id}/tastings/{tasting_id}", response_model=WineResponse)
def update_wine_tasting_entry(
    wine_id: UUID,
    tasting_id: UUID,
    payload: WineTastingEntryUpdate,
    db: Session = Depends(get_db),
    context: CurrentContext = Depends(require_write_context),
) -> WineResponse:
    wine = get_household_wine(db, context, wine_id)
    entries, index = tasting_entry_index(wine, tasting_id)
    current_entry = entries[index]
    entries[index] = {
        **current_entry,
        "consumed_at": payload.consumed_at.isoformat(),
        "note": payload.note.strip(),
        "rating": payload.tasting_rating,
        "enjoyment": payload.tasting_enjoyment,
        "occasion": payload.tasting_occasion.strip(),
        "pairing": payload.tasting_pairing.strip(),
        "companions": payload.tasting_companions.strip(),
    }
    wine.tasting_history = normalize_tasting_history(entries)
    tasting = db.scalar(
        select(WineTastingEntry).where(
            WineTastingEntry.id == tasting_id, WineTastingEntry.wine_id == wine.id
        )
    )
    if tasting is not None:
        tasting.consumed_at = payload.consumed_at
        tasting.note = payload.note.strip()
        tasting.rating = payload.tasting_rating
        tasting.enjoyment = payload.tasting_enjoyment
        tasting.occasion = payload.tasting_occasion.strip()
        tasting.pairing = payload.tasting_pairing.strip()
        tasting.companions = payload.tasting_companions.strip()

    db.commit()
    db.refresh(wine)
    return wine_response(
        wine,
        user_tag_names_by_wine(db, context, [wine.id]).get(wine.id),
        wine_value_history_by_wine(db, [wine.id]).get(wine.id),
    )


@router.delete("/{wine_id}/tastings/{tasting_id}", response_model=WineResponse)
def delete_wine_tasting_entry(
    wine_id: UUID,
    tasting_id: UUID,
    db: Session = Depends(get_db),
    context: CurrentContext = Depends(require_write_context),
) -> WineResponse:
    wine = get_household_wine(db, context, wine_id)
    entries, index = tasting_entry_index(wine, tasting_id)
    entries.pop(index)
    wine.tasting_history = normalize_tasting_history(entries)
    tasting = db.scalar(
        select(WineTastingEntry).where(
            WineTastingEntry.id == tasting_id, WineTastingEntry.wine_id == wine.id
        )
    )
    if tasting is not None:
        db.delete(tasting)

    db.commit()
    db.refresh(wine)
    return wine_response(
        wine,
        user_tag_names_by_wine(db, context, [wine.id]).get(wine.id),
        wine_value_history_by_wine(db, [wine.id]).get(wine.id),
    )


@router.delete("/{wine_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_wine(
    wine_id: UUID,
    db: Session = Depends(get_db),
    context: CurrentContext = Depends(require_admin_context),
) -> Response:
    wine = get_household_wine(db, context, wine_id)
    archive_wine_photo(db, wine)
    for size in PHOTO_SIZES:
        wine_photo_path(wine, size).unlink(missing_ok=True)
    db.delete(wine)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
