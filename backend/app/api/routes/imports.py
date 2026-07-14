from __future__ import annotations

from datetime import date, datetime, timezone
from decimal import Decimal, InvalidOperation
import json
from typing import Any
from uuid import UUID, uuid4

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import CurrentContext, require_admin_context
from app.api.routes.wines import normalize_owner_rows
from app.core.security import hash_invite_token, new_invite_token
from app.core.wine_types import normalize_wine_type
from app.db.session import get_db
from app.models import AiAuditLog, HouseholdInvite, Membership, User, UserTag, Wine, WineShareOffer, WineValueHistory, WishlistItem, WishlistList


router = APIRouter(prefix="/imports")

DEFAULT_WISHLIST_LIST_NAME = "Wishlist"
WishlistDuplicateKey = tuple[str, str, str, str, str, str]


class LegacyImportResult(BaseModel):
    wines_imported: int
    wishlist_imported: int
    wines_skipped: int = 0
    wishlist_skipped: int = 0
    wines_updated: int = 0
    wishlist_updated: int = 0
    wines_deleted: int = 0
    wishlist_deleted: int = 0
    members_imported: int = 0
    members_skipped: int = 0
    members_updated: int = 0
    invites_imported: int = 0
    invites_skipped: int = 0
    invites_updated: int = 0
    share_offers_imported: int = 0
    share_offers_skipped: int = 0
    share_offers_updated: int = 0
    user_tags_imported: int = 0
    user_tags_skipped: int = 0
    user_tags_updated: int = 0
    ai_audit_imported: int = 0
    ai_audit_skipped: int = 0
    ai_audit_updated: int = 0


class LegacyImportPreview(BaseModel):
    format: str = "legacy"
    included_blocks: list[str] = Field(default_factory=list)
    wines_total: int
    wishlist_total: int
    wine_duplicates: int
    wishlist_duplicates: int
    wine_new: int
    wishlist_new: int
    sample_wine_duplicates: list[str] = Field(default_factory=list)
    sample_wishlist_duplicates: list[str] = Field(default_factory=list)
    members_total: int = 0
    invites_total: int = 0
    share_offers_total: int = 0
    user_tags_total: int = 0
    ai_audit_total: int = 0


def as_uuid(value: Any) -> UUID:
    try:
        return UUID(str(value))
    except (TypeError, ValueError):
        return uuid4()


def as_str(value: Any) -> str:
    return "" if value is None else str(value).strip()


def as_legacy_ai_text(value: Any, *, kind: str) -> str:
    if value in (None, ""):
        return ""
    parsed = value
    if isinstance(value, str):
        text = value.strip()
        if not text:
            return ""
        if not text.startswith(("{", "[")):
            return text
        try:
            parsed = json.loads(text)
        except json.JSONDecodeError:
            return text
    if not isinstance(parsed, dict):
        return as_str(value)

    if kind == "strategy":
        parts = [
            as_str(parsed.get("signal")),
            as_str(parsed.get("reason")),
            as_str(parsed.get("price_assessment")),
        ]
        low = parsed.get("market_price_low")
        high = parsed.get("market_price_high")
        currency = as_str(parsed.get("market_price_currency"))
        if low is not None and high is not None and currency:
            parts.append(f"Fascia mercato stimata: {currency} {low}-{high}.")
        alternative = parsed.get("alternative")
        if isinstance(alternative, dict) and (alternative.get("name") or alternative.get("producer")):
            parts.append(f"Alternativa: {as_str(alternative.get('producer'))} {as_str(alternative.get('name'))}.".strip())
        return " ".join(part.rstrip(".") + "." for part in parts if part)

    parts = [
        as_str(parsed.get("signal")),
        as_str(parsed.get("reason")),
    ]
    confidence = as_str(parsed.get("confidence"))
    if confidence:
        parts.append(f"Confidenza: {confidence}.")
    recommended = as_str(parsed.get("recommended_purpose"))
    if recommended:
        parts.insert(0, f"Scopo consigliato: {recommended}.")
    return " ".join(part.rstrip(".") + "." for part in parts if part)


def as_int(value: Any, default: int = 0) -> int:
    try:
        return int(value)
    except (TypeError, ValueError):
        return default


def as_optional_int(value: Any) -> int | None:
    if value in (None, ""):
        return None
    return as_int(value)


def as_decimal(value: Any, default: str = "0") -> Decimal:
    try:
        return Decimal(str(value if value not in (None, "") else default))
    except (InvalidOperation, ValueError):
        return Decimal(default)


def as_optional_decimal(value: Any) -> Decimal | None:
    if value in (None, ""):
        return None
    return as_decimal(value)


def as_date(value: Any) -> date | None:
    if not value:
        return None
    try:
        return date.fromisoformat(str(value)[:10])
    except ValueError:
        return None


def as_datetime(value: Any) -> datetime | None:
    if not value:
        return None
    text = str(value).strip().replace(" ", "T", 1)
    try:
        return datetime.fromisoformat(text)
    except ValueError:
        return None


def as_list(value: Any) -> list:
    return value if isinstance(value, list) else []


def normalize_key_part(value: Any) -> str:
    return " ".join(as_str(value).lower().split())


def wine_duplicate_key(data: dict[str, Any]) -> tuple[str, str, str, str, str]:
    return (
        normalize_key_part(data.get("name")),
        normalize_key_part(data.get("producer")),
        normalize_key_part(data.get("vintage")),
        normalize_key_part(data.get("format")),
        normalize_key_part(data.get("type")),
    )


def wishlist_duplicate_key(data: dict[str, Any]) -> WishlistDuplicateKey:
    return (
        normalize_key_part(data.get("wishlist_list_id")),
        normalize_key_part(data.get("name")),
        normalize_key_part(data.get("producer")),
        normalize_key_part(data.get("vintage")),
        normalize_key_part(data.get("format")),
        normalize_key_part(data.get("type")),
    )


def model_payload(instance: Wine | WishlistItem) -> dict[str, Any]:
    result: dict[str, Any] = {}
    for column in instance.__table__.columns:
        value = getattr(instance, column.name)
        if isinstance(value, UUID):
            result[column.name] = str(value)
        elif isinstance(value, Decimal):
            result[column.name] = str(value)
        elif isinstance(value, date | datetime):
            result[column.name] = value.isoformat()
        else:
            result[column.name] = value
    return result


def export_wines(db: Session, household_id: UUID) -> list[dict[str, Any]]:
    wines = list(db.scalars(select(Wine).where(Wine.household_id == household_id).order_by(Wine.name.asc(), Wine.vintage.desc())))
    wine_ids = [wine.id for wine in wines]
    value_history_by_wine: dict[UUID, list[dict[str, Any]]] = {wine.id: [] for wine in wines}
    if wine_ids:
        value_history = db.scalars(
            select(WineValueHistory)
            .where(WineValueHistory.wine_id.in_(wine_ids))
            .order_by(WineValueHistory.recorded_at.asc(), WineValueHistory.id.asc()),
        )
        for entry in value_history:
            value_history_by_wine.setdefault(entry.wine_id, []).append(model_payload(entry))

    payloads: list[dict[str, Any]] = []
    for wine in wines:
        payload = model_payload(wine)
        payload["value_history"] = value_history_by_wine.get(wine.id, [])
        payloads.append(payload)
    return payloads


def export_wishlist(db: Session, household_id: UUID) -> list[dict[str, Any]]:
    wishlist = list(db.scalars(select(WishlistItem).where(WishlistItem.household_id == household_id).order_by(WishlistItem.name.asc())))
    return [model_payload(item) for item in wishlist]


def export_wishlist_lists(db: Session, household_id: UUID) -> list[dict[str, Any]]:
    wishlist_lists = list(db.scalars(select(WishlistList).where(WishlistList.household_id == household_id).order_by(WishlistList.name.asc(), WishlistList.id.asc())))
    return [model_payload(item) for item in wishlist_lists]


def export_members(db: Session, household_id: UUID) -> list[dict[str, Any]]:
    rows = db.execute(
        select(Membership, User)
        .join(User, User.id == Membership.user_id)
        .where(Membership.household_id == household_id)
        .order_by(User.display_name.asc(), User.email.asc()),
    ).all()
    return [
        {
            "membership_id": str(membership.id),
            "user_id": str(user.id),
            "email": user.email,
            "display_name": user.display_name,
            "role": membership.role,
            "visibility_scope": membership.visibility_scope,
        }
        for membership, user in rows
    ]


def export_invites(db: Session, household_id: UUID) -> list[dict[str, Any]]:
    invites = db.scalars(select(HouseholdInvite).where(HouseholdInvite.household_id == household_id).order_by(HouseholdInvite.created_at.desc()))
    return [
        {
            "id": str(invite.id),
            "email": invite.email,
            "role": invite.role,
            "visibility_scope": invite.visibility_scope,
            "expires_at": invite.expires_at.isoformat(),
            "accepted_at": invite.accepted_at.isoformat() if invite.accepted_at else None,
            "created_at": invite.created_at.isoformat(),
        }
        for invite in invites
    ]


def export_share_offers(db: Session, household_id: UUID) -> list[dict[str, Any]]:
    offers = db.scalars(select(WineShareOffer).where(WineShareOffer.household_id == household_id).order_by(WineShareOffer.created_at.desc()))
    return [model_payload(offer) for offer in offers]


def export_user_tags(db: Session, user_id: UUID) -> list[dict[str, Any]]:
    tags = db.scalars(select(UserTag).where(UserTag.user_id == user_id).order_by(UserTag.name.asc()))
    return [model_payload(tag) for tag in tags]


def export_ai_audit(db: Session, household_id: UUID) -> list[dict[str, Any]]:
    logs = db.scalars(select(AiAuditLog).where(AiAuditLog.household_id == household_id).order_by(AiAuditLog.created_at.desc()))
    return [model_payload(log) for log in logs]


SUPPORTED_EXPORT_BLOCKS = ("wines", "wishlist", "members", "invites", "share_offers", "user_tags", "ai_audit")


def is_vinaris_export(payload: dict[str, Any]) -> bool:
    return as_str(payload.get("schema")) == "winecellarmulti.export.v2"


def payload_list(payload: dict[str, Any], key: str) -> list[dict[str, Any]]:
    value = payload.get(key, [])
    if not isinstance(value, list):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Invalid export block: {key}")
    return [item for item in value if isinstance(item, dict)]


def included_export_blocks(payload: dict[str, Any]) -> list[str]:
    configured = payload.get("included_blocks")
    if isinstance(configured, list):
        return [block for block in configured if block in SUPPORTED_EXPORT_BLOCKS]
    return [block for block in SUPPORTED_EXPORT_BLOCKS if isinstance(payload.get(block), list)]


def selected_import_blocks(payload: dict[str, Any]) -> list[str]:
    configured = payload.get("import_blocks")
    if isinstance(configured, list):
        return [block for block in configured if block in SUPPORTED_EXPORT_BLOCKS]
    return included_export_blocks(payload)


def clear_household_export_blocks(db: Session, context: CurrentContext, blocks: list[str]) -> tuple[int, int]:
    if "share_offers" in blocks and "wines" not in blocks:
        db.query(WineShareOffer).filter(WineShareOffer.household_id == context.household.id).delete(synchronize_session=False)
    if "invites" in blocks:
        db.query(HouseholdInvite).filter(HouseholdInvite.household_id == context.household.id).delete(synchronize_session=False)
    if "ai_audit" in blocks:
        db.query(AiAuditLog).filter(AiAuditLog.household_id == context.household.id).delete(synchronize_session=False)
    wines_deleted = 0
    wishlist_deleted = 0
    if "wines" in blocks:
        db.query(WineShareOffer).filter(WineShareOffer.household_id == context.household.id).delete(synchronize_session=False)
        wines_deleted = db.query(Wine).filter(Wine.household_id == context.household.id).delete(synchronize_session=False)
    if "wishlist" in blocks:
        wishlist_deleted = db.query(WishlistItem).filter(WishlistItem.household_id == context.household.id).delete(synchronize_session=False)
        db.query(WishlistList).filter(WishlistList.household_id == context.household.id).delete(synchronize_session=False)
    return wines_deleted, wishlist_deleted


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


def existing_wishlist_lists_by_name(db: Session, context: CurrentContext) -> dict[str, WishlistList]:
    return {
        wishlist_list.name.strip().lower(): wishlist_list
        for wishlist_list in db.scalars(select(WishlistList).where(WishlistList.household_id == context.household.id))
    }


def prepare_import_wishlist_lists(
    payload: dict[str, Any],
    db: Session,
    context: CurrentContext,
    reserved_ids: set[UUID] | None = None,
    create_missing: bool = True,
) -> tuple[dict[UUID, UUID], dict[str, UUID]]:
    existing_by_name = existing_wishlist_lists_by_name(db, context)
    default_list = get_or_create_default_wishlist_list(db, context) if create_missing else next(iter(existing_by_name.values()), None)
    list_id_map: dict[UUID, UUID] = {}
    list_name_map: dict[str, UUID] = {}
    raw_lists = payload_list(payload, "wishlist_lists") if isinstance(payload.get("wishlist_lists"), list) else []
    for raw_list in raw_lists:
        original_id = as_uuid(raw_list.get("id"))
        name = as_str(raw_list.get("name")) or DEFAULT_WISHLIST_LIST_NAME
        description = as_str(raw_list.get("description"))
        portfolio_strategy = raw_list.get("portfolio_strategy") if isinstance(raw_list.get("portfolio_strategy"), dict) else None
        normalized_name = name.strip().lower()
        existing = existing_by_name.get(normalized_name)
        if existing is None:
            if not create_missing:
                continue
            list_id = ensure_unused_id(db, WishlistList, original_id, reserved_ids)
            existing = WishlistList(
                id=list_id,
                household_id=context.household.id,
                created_by_user_id=context.user.id,
                name=name,
                description=description,
                portfolio_strategy=portfolio_strategy,
            )
            db.add(existing)
            db.flush()
        else:
            if portfolio_strategy is not None:
                existing.portfolio_strategy = portfolio_strategy
            if description and not existing.description:
                existing.description = description
        existing_by_name[normalized_name] = existing
        list_id_map[original_id] = existing.id
        list_name_map[normalized_name] = existing.id
    if not list_name_map and default_list is not None:
        list_name_map[default_list.name.strip().lower()] = default_list.id
    return list_id_map, list_name_map


def legacy_wine_data(raw: dict[str, Any], context: CurrentContext) -> dict[str, Any]:
    return {
        "id": as_uuid(raw.get("id")),
        "household_id": context.household.id,
        "created_by_user_id": context.user.id,
        "name": as_str(raw.get("name")) or "Unnamed wine",
        "producer": as_str(raw.get("producer")),
        "vintage": as_str(raw.get("vintage")),
        "quantity": as_int(raw.get("quantity")),
        "currency": as_str(raw.get("currency")) or "CHF",
        "price": as_decimal(raw.get("price")),
        "current_value": as_optional_decimal(raw.get("current_value")),
        "status": as_str(raw.get("status")) or "Ordered",
        "format": as_str(raw.get("format")),
        "type": normalize_wine_type(as_str(raw.get("type"))),
        "region": as_str(raw.get("region")),
        "appellation": as_str(raw.get("appellation")),
        "merchant": as_str(raw.get("merchant")),
        "order_date": as_date(raw.get("order_date")),
        "expected_delivery": as_date(raw.get("expected_delivery")),
        "owner_share_pct": as_decimal(raw.get("owner_share_pct"), "100"),
        "notes": as_str(raw.get("notes")),
        "ai_notes": as_str(raw.get("ai_notes")),
        "drink_from": as_optional_int(raw.get("drink_from")),
        "drink_peak_from": as_optional_int(raw.get("drink_peak_from")),
        "drink_peak_to": as_optional_int(raw.get("drink_peak_to")),
        "drink_to": as_optional_int(raw.get("drink_to")),
        "drink_window_notes": as_str(raw.get("drink_window_notes")),
        "ai_value_notes": as_str(raw.get("ai_value_notes")),
        "ai_value_estimated_at": as_datetime(raw.get("ai_value_estimated_at")),
        "rating": as_int(raw.get("rating")),
        "owners": normalize_owner_rows(as_list(raw.get("owners"))),
        "tags": [as_str(tag) for tag in as_list(raw.get("tags")) if as_str(tag)],
        "grapes": as_list(raw.get("grapes")),
        "scores": as_list(raw.get("scores")),
        "scores_not_applicable": raw.get("scores_not_applicable") in (True, "1", 1, "true", "True"),
        "tasting_history": as_list(raw.get("tasting_history")),
    }


def legacy_wishlist_data(raw: dict[str, Any], context: CurrentContext, wishlist_list_id: UUID) -> dict[str, Any]:
    return {
        "id": as_uuid(raw.get("id")),
        "household_id": context.household.id,
        "wishlist_list_id": wishlist_list_id,
        "created_by_user_id": context.user.id,
        "name": as_str(raw.get("name")) or "Unnamed wishlist item",
        "producer": as_str(raw.get("producer")),
        "vintage": as_str(raw.get("vintage")),
        "format": as_str(raw.get("format")),
        "type": normalize_wine_type(as_str(raw.get("type"))),
        "region": as_str(raw.get("region")),
        "appellation": as_str(raw.get("appellation")),
        "target_price": as_decimal(raw.get("target_price")),
        "currency": as_str(raw.get("currency")) or "CHF",
        "merchant": as_str(raw.get("merchant")),
        "priority": as_str(raw.get("priority")) or "Medium",
        "purpose": as_str(raw.get("purpose")) or "Drink",
        "status": as_str(raw.get("status")) or "Evaluate",
        "status_source": as_str(raw.get("status_source")) or "manual",
        "is_shared": "1" if raw.get("is_shared") in (True, "1", 1, "true") else "0",
        "notes": as_str(raw.get("notes")),
        "ai_strategy": as_legacy_ai_text(raw.get("ai_strategy"), kind="strategy"),
        "ai_purpose_advice": as_legacy_ai_text(raw.get("ai_purpose_advice"), kind="purpose"),
    }


def upsert_model(db: Session, model: type[Wine] | type[WishlistItem], data: dict[str, Any]) -> None:
    instance = db.scalar(select(model).where(model.id == data["id"], model.household_id == data["household_id"]))
    if instance is None:
        db.add(model(**data))
        return
    for field, value in data.items():
        setattr(instance, field, value)


def existing_by_id_or_key(
    db: Session,
    model: type[Wine] | type[WishlistItem],
    household_id: UUID,
    data: dict[str, Any],
    key: tuple[str, ...],
    existing_keys: dict[tuple[str, ...], Wine | WishlistItem],
) -> Wine | WishlistItem | None:
    instance = db.scalar(select(model).where(model.id == data["id"], model.household_id == household_id))
    return instance or existing_keys.get(key)


def ensure_unused_id(db: Session, model: Any, candidate_id: UUID, reserved_ids: set[UUID] | None = None) -> UUID:
    reserved = reserved_ids if reserved_ids is not None else set()
    next_id = candidate_id
    while next_id in reserved or db.get(model, next_id) is not None:
        next_id = uuid4()
    reserved.add(next_id)
    return next_id


def existing_wine_keys(db: Session, context: CurrentContext) -> dict[tuple[str, str, str, str, str], Wine]:
    wines = db.scalars(select(Wine).where(Wine.household_id == context.household.id))
    return {wine_duplicate_key(model_payload(wine)): wine for wine in wines}


def existing_wishlist_keys(db: Session, context: CurrentContext) -> dict[WishlistDuplicateKey, WishlistItem]:
    items = db.scalars(select(WishlistItem).where(WishlistItem.household_id == context.household.id))
    return {wishlist_duplicate_key(model_payload(item)): item for item in items}


def legacy_payload_lists(payload: dict[str, Any]) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    wines = payload.get("wines", [])
    wishlist = payload.get("wishlist", [])
    if not isinstance(wines, list) or not isinstance(wishlist, list):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid legacy export")
    return [item for item in wines if isinstance(item, dict)], [item for item in wishlist if isinstance(item, dict)]


def vinaris_preview_payload(payload: dict[str, Any], db: Session, context: CurrentContext) -> LegacyImportPreview:
    blocks = included_export_blocks(payload)
    raw_wines = payload_list(payload, "wines")
    raw_wishlist = payload_list(payload, "wishlist")
    wine_keys = existing_wine_keys(db, context)
    wishlist_keys = existing_wishlist_keys(db, context)
    _, wishlist_list_name_map = prepare_import_wishlist_lists(payload, db, context, create_missing=False)
    default_wishlist_list = next(iter(existing_wishlist_lists_by_name(db, context).values()), None)
    wine_duplicates: list[str] = []
    wishlist_duplicates: list[str] = []

    for raw_wine in raw_wines:
        data = legacy_wine_data(raw_wine, context)
        if existing_by_id_or_key(db, Wine, context.household.id, data, wine_duplicate_key(data), wine_keys):
            wine_duplicates.append(data["name"])
    for raw_item in raw_wishlist:
        raw_list_name = as_str(raw_item.get("wishlist_list_name"))
        mapped_list_id = wishlist_list_name_map.get(raw_list_name.strip().lower()) if raw_list_name else None
        mapped_list_id = mapped_list_id or (default_wishlist_list.id if default_wishlist_list else UUID(int=0))
        data = legacy_wishlist_data(raw_item, context, mapped_list_id)
        if existing_by_id_or_key(db, WishlistItem, context.household.id, data, wishlist_duplicate_key(data), wishlist_keys):
            wishlist_duplicates.append(data["name"])

    return LegacyImportPreview(
        format="vinaris",
        included_blocks=blocks,
        wines_total=len(raw_wines),
        wishlist_total=len(raw_wishlist),
        wine_duplicates=len(wine_duplicates),
        wishlist_duplicates=len(wishlist_duplicates),
        wine_new=len(raw_wines) - len(wine_duplicates),
        wishlist_new=len(raw_wishlist) - len(wishlist_duplicates),
        sample_wine_duplicates=wine_duplicates[:5],
        sample_wishlist_duplicates=wishlist_duplicates[:5],
        members_total=len(payload_list(payload, "members")),
        invites_total=len(payload_list(payload, "invites")),
        share_offers_total=len(payload_list(payload, "share_offers")),
        user_tags_total=len(payload_list(payload, "user_tags")),
        ai_audit_total=len(payload_list(payload, "ai_audit")),
    )


def import_vinaris_json_payload(
    payload: dict[str, Any],
    mode: str,
    db: Session,
    context: CurrentContext,
) -> LegacyImportResult:
    blocks = selected_import_blocks(payload)
    result = LegacyImportResult(wines_imported=0, wishlist_imported=0)
    reserved_ids: dict[type[Any], set[UUID]] = {
        Wine: set(),
        WishlistItem: set(),
        WishlistList: set(),
        WineValueHistory: set(),
        HouseholdInvite: set(),
        UserTag: set(),
        WineShareOffer: set(),
        AiAuditLog: set(),
    }
    if mode == "replace_all":
        result.wines_deleted, result.wishlist_deleted = clear_household_export_blocks(db, context, blocks)
        db.flush()

    wine_keys = existing_wine_keys(db, context)
    wishlist_keys = existing_wishlist_keys(db, context)
    wishlist_list_id_map, wishlist_list_name_map = prepare_import_wishlist_lists(payload, db, context, reserved_ids[WishlistList])
    default_wishlist_list = next(iter(existing_wishlist_lists_by_name(db, context).values()), None)
    imported_wine_ids: dict[UUID, UUID] = {}
    imported_wishlist_ids: dict[UUID, UUID] = {}

    for raw_wine in payload_list(payload, "wines") if "wines" in blocks else []:
        data = legacy_wine_data(raw_wine, context)
        original_id = data["id"]
        key = wine_duplicate_key(data)
        existing = existing_by_id_or_key(db, Wine, context.household.id, data, key, wine_keys)
        if mode == "skip_duplicates" and existing is not None:
            result.wines_skipped += 1
            imported_wine_ids[original_id] = existing.id
            continue
        if mode == "update_existing" and existing is not None:
            for field, value in data.items():
                if field != "id":
                    setattr(existing, field, value)
            wine = existing
            result.wines_updated += 1
        else:
            data["id"] = ensure_unused_id(db, Wine, data["id"], reserved_ids[Wine])
            wine = Wine(**data)
            db.add(wine)
            wine_keys[key] = wine
            result.wines_imported += 1
        imported_wine_ids[original_id] = wine.id
        for raw_entry in as_list(raw_wine.get("value_history")):
            if not isinstance(raw_entry, dict):
                continue
            entry_id = as_uuid(raw_entry.get("id"))
            value_entry = db.scalar(select(WineValueHistory).where(WineValueHistory.id == entry_id, WineValueHistory.wine_id == wine.id))
            value_data = {
                "id": entry_id,
                "wine_id": wine.id,
                "value": as_decimal(raw_entry.get("value")),
                "currency": as_str(raw_entry.get("currency")) or wine.currency,
                "source": as_str(raw_entry.get("source")) or "imported",
                "recorded_at": as_datetime(raw_entry.get("recorded_at")) or datetime.now(timezone.utc),
            }
            if value_entry is None:
                value_data["id"] = ensure_unused_id(db, WineValueHistory, value_data["id"], reserved_ids[WineValueHistory])
                db.add(WineValueHistory(**value_data))
            elif mode in {"update_existing", "replace_all"}:
                for field, value in value_data.items():
                    if field != "id":
                        setattr(value_entry, field, value)

    for raw_item in payload_list(payload, "wishlist") if "wishlist" in blocks else []:
        raw_list_id = as_uuid(raw_item.get("wishlist_list_id"))
        raw_list_name = as_str(raw_item.get("wishlist_list_name"))
        mapped_list_id = wishlist_list_id_map.get(raw_list_id)
        if mapped_list_id is None and raw_list_name:
            mapped_list_id = wishlist_list_name_map.get(raw_list_name.strip().lower())
        mapped_list_id = mapped_list_id or default_wishlist_list.id
        data = legacy_wishlist_data(raw_item, context, mapped_list_id)
        original_id = data["id"]
        data["ai_market_price"] = as_optional_decimal(raw_item.get("ai_market_price"))
        data["ai_market_price_currency"] = as_str(raw_item.get("ai_market_price_currency"))
        data["ai_context_note"] = as_str(raw_item.get("ai_context_note"))
        key = wishlist_duplicate_key(data)
        existing = existing_by_id_or_key(db, WishlistItem, context.household.id, data, key, wishlist_keys)
        if mode == "skip_duplicates" and existing is not None:
            result.wishlist_skipped += 1
            imported_wishlist_ids[original_id] = existing.id
            continue
        if mode == "update_existing" and existing is not None:
            for field, value in data.items():
                if field != "id":
                    setattr(existing, field, value)
            item = existing
            result.wishlist_updated += 1
        else:
            data["id"] = ensure_unused_id(db, WishlistItem, data["id"], reserved_ids[WishlistItem])
            item = WishlistItem(**data)
            db.add(item)
            wishlist_keys[key] = item
            result.wishlist_imported += 1
        imported_wishlist_ids[original_id] = item.id

    user_by_email = {user.email.lower(): user for user in db.scalars(select(User))}

    for raw_member in payload_list(payload, "members") if "members" in blocks else []:
        email = as_str(raw_member.get("email")).lower()
        user = user_by_email.get(email)
        if user is None:
            result.members_skipped += 1
            continue
        membership = db.scalar(select(Membership).where(Membership.user_id == user.id, Membership.household_id == context.household.id))
        if membership is None:
            db.add(
                Membership(
                    user_id=user.id,
                    household_id=context.household.id,
                    role=as_str(raw_member.get("role")) or "member",
                    visibility_scope=as_str(raw_member.get("visibility_scope")) or "shared",
                ),
            )
            result.members_imported += 1
            continue
        if mode in {"update_existing", "replace_all"}:
            membership.role = as_str(raw_member.get("role")) or membership.role
            membership.visibility_scope = as_str(raw_member.get("visibility_scope")) or membership.visibility_scope
            result.members_updated += 1
        else:
            result.members_skipped += 1

    existing_invites = list(db.scalars(select(HouseholdInvite).where(HouseholdInvite.household_id == context.household.id)))
    for raw_invite in payload_list(payload, "invites") if "invites" in blocks else []:
        email = as_str(raw_invite.get("email"))
        created_at = as_datetime(raw_invite.get("created_at")) or datetime.now(timezone.utc)
        existing_invite = next((invite for invite in existing_invites if invite.email.lower() == email.lower() and invite.created_at == created_at), None)
        if mode == "skip_duplicates" and existing_invite is not None:
            result.invites_skipped += 1
            continue
        if existing_invite is not None and mode in {"update_existing", "replace_all"}:
            existing_invite.role = as_str(raw_invite.get("role")) or existing_invite.role
            existing_invite.visibility_scope = as_str(raw_invite.get("visibility_scope")) or existing_invite.visibility_scope
            existing_invite.expires_at = as_datetime(raw_invite.get("expires_at")) or existing_invite.expires_at
            existing_invite.accepted_at = as_datetime(raw_invite.get("accepted_at"))
            result.invites_updated += 1
            continue
        invite_id = as_uuid(raw_invite.get("id"))
        invite_id = ensure_unused_id(db, HouseholdInvite, invite_id, reserved_ids[HouseholdInvite])
        db.add(
            HouseholdInvite(
                id=invite_id,
                household_id=context.household.id,
                invited_by_user_id=context.user.id,
                email=email,
                role=as_str(raw_invite.get("role")) or "member",
                visibility_scope=as_str(raw_invite.get("visibility_scope")) or "shared",
                token_hash=hash_invite_token(new_invite_token()),
                expires_at=as_datetime(raw_invite.get("expires_at")) or datetime.now(timezone.utc),
                accepted_at=as_datetime(raw_invite.get("accepted_at")),
                created_at=created_at,
            ),
        )
        result.invites_imported += 1

    existing_tags = {
        tag.name.lower(): tag
        for tag in db.scalars(select(UserTag).where(UserTag.user_id == context.user.id))
    }
    for raw_tag in payload_list(payload, "user_tags") if "user_tags" in blocks else []:
        name = as_str(raw_tag.get("name"))
        if not name:
            result.user_tags_skipped += 1
            continue
        existing_tag = existing_tags.get(name.lower())
        if existing_tag is None:
            tag_id = as_uuid(raw_tag.get("id"))
            tag_id = ensure_unused_id(db, UserTag, tag_id, reserved_ids[UserTag])
            db.add(UserTag(id=tag_id, user_id=context.user.id, name=name, color=as_str(raw_tag.get("color")), created_at=as_datetime(raw_tag.get("created_at")) or datetime.now(timezone.utc)))
            result.user_tags_imported += 1
            continue
        if mode in {"update_existing", "replace_all"}:
            existing_tag.color = as_str(raw_tag.get("color")) or existing_tag.color
            result.user_tags_updated += 1
        else:
            result.user_tags_skipped += 1

    existing_offers = list(db.scalars(select(WineShareOffer).where(WineShareOffer.household_id == context.household.id)))
    for raw_offer in payload_list(payload, "share_offers") if "share_offers" in blocks else []:
        original_wine_id = as_uuid(raw_offer.get("wine_id"))
        mapped_wine_id = imported_wine_ids.get(original_wine_id, original_wine_id)
        wine = db.scalar(select(Wine).where(Wine.id == mapped_wine_id, Wine.household_id == context.household.id))
        if wine is None:
            result.share_offers_skipped += 1
            continue
        recipient_email = as_str(raw_offer.get("recipient_email"))
        created_at = as_datetime(raw_offer.get("created_at")) or datetime.now(timezone.utc)
        existing_offer = next(
            (
                offer
                for offer in existing_offers
                if offer.wine_id == mapped_wine_id
                and offer.recipient_email.lower() == recipient_email.lower()
                and offer.created_at == created_at
            ),
            None,
        )
        recipient_user = user_by_email.get(recipient_email.lower())
        if recipient_user is None:
            result.share_offers_skipped += 1
            continue
        if mode == "skip_duplicates" and existing_offer is not None:
            result.share_offers_skipped += 1
            continue
        if existing_offer is not None and mode in {"update_existing", "replace_all"}:
            existing_offer.recipient_user_id = recipient_user.id
            existing_offer.share_pct = as_decimal(raw_offer.get("share_pct"))
            existing_offer.message = as_str(raw_offer.get("message"))
            existing_offer.status = as_str(raw_offer.get("status")) or existing_offer.status
            existing_offer.decided_at = as_datetime(raw_offer.get("decided_at"))
            result.share_offers_updated += 1
            continue
        offer_id = as_uuid(raw_offer.get("id"))
        offer_id = ensure_unused_id(db, WineShareOffer, offer_id, reserved_ids[WineShareOffer])
        db.add(
            WineShareOffer(
                id=offer_id,
                household_id=context.household.id,
                wine_id=mapped_wine_id,
                created_by_user_id=context.user.id,
                recipient_user_id=recipient_user.id,
                recipient_email=recipient_email,
                share_pct=as_decimal(raw_offer.get("share_pct")),
                message=as_str(raw_offer.get("message")),
                status=as_str(raw_offer.get("status")) or "pending",
                created_at=created_at,
                decided_at=as_datetime(raw_offer.get("decided_at")),
            ),
        )
        result.share_offers_imported += 1

    existing_audit = list(db.scalars(select(AiAuditLog).where(AiAuditLog.household_id == context.household.id)))
    for raw_log in payload_list(payload, "ai_audit") if "ai_audit" in blocks else []:
        entity_type = as_str(raw_log.get("entity_type"))
        original_entity_id = as_uuid(raw_log.get("entity_id"))
        mapped_entity_id = imported_wine_ids.get(original_entity_id, imported_wishlist_ids.get(original_entity_id, original_entity_id))
        created_at = as_datetime(raw_log.get("created_at")) or datetime.now(timezone.utc)
        existing_log = next(
            (
                log
                for log in existing_audit
                if log.entity_type == entity_type
                and log.entity_id == mapped_entity_id
                and log.feature == as_str(raw_log.get("feature"))
                and log.created_at == created_at
            ),
            None,
        )
        if mode == "skip_duplicates" and existing_log is not None:
            result.ai_audit_skipped += 1
            continue
        log_data = {
            "household_id": context.household.id,
            "user_id": context.user.id,
            "entity_type": entity_type,
            "entity_id": mapped_entity_id,
            "feature": as_str(raw_log.get("feature")),
            "model": as_str(raw_log.get("model")),
            "reasoning_effort": as_str(raw_log.get("reasoning_effort")),
            "outcome": as_str(raw_log.get("outcome")) or "success",
            "summary": as_str(raw_log.get("summary")),
            "sources": as_list(raw_log.get("sources")),
            "input_tokens": as_int(raw_log.get("input_tokens")),
            "cached_input_tokens": as_int(raw_log.get("cached_input_tokens")),
            "output_tokens": as_int(raw_log.get("output_tokens")),
            "total_tokens": as_int(raw_log.get("total_tokens")),
            "estimated_cost_usd": as_decimal(raw_log.get("estimated_cost_usd")),
            "created_at": created_at,
        }
        if existing_log is not None and mode in {"update_existing", "replace_all"}:
            for field, value in log_data.items():
                setattr(existing_log, field, value)
            result.ai_audit_updated += 1
            continue
        log_id = as_uuid(raw_log.get("id"))
        log_id = ensure_unused_id(db, AiAuditLog, log_id, reserved_ids[AiAuditLog])
        db.add(AiAuditLog(id=log_id, **log_data))
        result.ai_audit_imported += 1

    db.commit()
    return result


def clear_household_cellar(db: Session, context: CurrentContext) -> tuple[int, int]:
    db.query(WineShareOffer).filter(WineShareOffer.household_id == context.household.id).delete(synchronize_session=False)
    wines_deleted = db.query(Wine).filter(Wine.household_id == context.household.id).delete(synchronize_session=False)
    wishlist_deleted = db.query(WishlistItem).filter(WishlistItem.household_id == context.household.id).delete(synchronize_session=False)
    db.query(WishlistList).filter(WishlistList.household_id == context.household.id).delete(synchronize_session=False)
    return wines_deleted, wishlist_deleted


@router.post("/legacy-json/preview", response_model=LegacyImportPreview)
def preview_legacy_json(
    payload: dict[str, Any],
    db: Session = Depends(get_db),
    context: CurrentContext = Depends(require_admin_context),
) -> LegacyImportPreview:
    raw_wines, raw_wishlist = legacy_payload_lists(payload)
    wine_keys = existing_wine_keys(db, context)
    wishlist_keys = existing_wishlist_keys(db, context)
    default_wishlist_list = next(iter(existing_wishlist_lists_by_name(db, context).values()), None)
    wine_duplicates = []
    wishlist_duplicates = []

    for raw_wine in raw_wines:
        data = legacy_wine_data(raw_wine, context)
        if existing_by_id_or_key(db, Wine, context.household.id, data, wine_duplicate_key(data), wine_keys):
            wine_duplicates.append(data["name"])
    for raw_item in raw_wishlist:
        data = legacy_wishlist_data(raw_item, context, default_wishlist_list.id if default_wishlist_list else UUID(int=0))
        if existing_by_id_or_key(db, WishlistItem, context.household.id, data, wishlist_duplicate_key(data), wishlist_keys):
            wishlist_duplicates.append(data["name"])

    return LegacyImportPreview(
        format="legacy",
        included_blocks=["wines", "wishlist"],
        wines_total=len(raw_wines),
        wishlist_total=len(raw_wishlist),
        wine_duplicates=len(wine_duplicates),
        wishlist_duplicates=len(wishlist_duplicates),
        wine_new=len(raw_wines) - len(wine_duplicates),
        wishlist_new=len(raw_wishlist) - len(wishlist_duplicates),
        sample_wine_duplicates=wine_duplicates[:5],
        sample_wishlist_duplicates=wishlist_duplicates[:5],
    )


@router.post("/json/preview", response_model=LegacyImportPreview)
def preview_json_import(
    payload: dict[str, Any],
    db: Session = Depends(get_db),
    context: CurrentContext = Depends(require_admin_context),
) -> LegacyImportPreview:
    if is_vinaris_export(payload):
        return vinaris_preview_payload(payload, db, context)
    return preview_legacy_json(payload, db, context)


@router.post("/legacy-json", response_model=LegacyImportResult)
def import_legacy_json(
    payload: dict[str, Any],
    mode: str = Query(default="add_all", pattern="^(add_all|skip_duplicates|update_existing|replace_all)$"),
    db: Session = Depends(get_db),
    context: CurrentContext = Depends(require_admin_context),
) -> LegacyImportResult:
    wines, wishlist = legacy_payload_lists(payload)
    result = LegacyImportResult(wines_imported=0, wishlist_imported=0)
    if mode == "replace_all":
        result.wines_deleted, result.wishlist_deleted = clear_household_cellar(db, context)
        db.flush()
    wine_keys = existing_wine_keys(db, context)
    wishlist_keys = existing_wishlist_keys(db, context)
    default_wishlist_list = get_or_create_default_wishlist_list(db, context)

    for raw_wine in wines:
        data = legacy_wine_data(raw_wine, context)
        key = wine_duplicate_key(data)
        existing = existing_by_id_or_key(db, Wine, context.household.id, data, key, wine_keys)
        if mode == "skip_duplicates" and existing is not None:
            result.wines_skipped += 1
            continue
        if mode == "update_existing" and existing is not None:
            for field, value in data.items():
                if field != "id":
                    setattr(existing, field, value)
            result.wines_updated += 1
            continue
        if mode == "add_all" and db.get(Wine, data["id"]) is not None:
            data["id"] = uuid4()
        wine = Wine(**data)
        db.add(wine)
        wine_keys[key] = wine
        result.wines_imported += 1

    for raw_item in wishlist:
        data = legacy_wishlist_data(raw_item, context, default_wishlist_list.id)
        key = wishlist_duplicate_key(data)
        existing = existing_by_id_or_key(db, WishlistItem, context.household.id, data, key, wishlist_keys)
        if mode == "skip_duplicates" and existing is not None:
            result.wishlist_skipped += 1
            continue
        if mode == "update_existing" and existing is not None:
            for field, value in data.items():
                if field != "id":
                    setattr(existing, field, value)
            result.wishlist_updated += 1
            continue
        if mode == "add_all" and db.get(WishlistItem, data["id"]) is not None:
            data["id"] = uuid4()
        item = WishlistItem(**data)
        db.add(item)
        wishlist_keys[key] = item
        result.wishlist_imported += 1

    db.commit()
    return result


@router.post("/json", response_model=LegacyImportResult)
def import_json(
    payload: dict[str, Any],
    mode: str = Query(default="add_all", pattern="^(add_all|skip_duplicates|update_existing|replace_all)$"),
    db: Session = Depends(get_db),
    context: CurrentContext = Depends(require_admin_context),
) -> LegacyImportResult:
    if is_vinaris_export(payload):
        return import_vinaris_json_payload(payload, mode, db, context)
    return import_legacy_json(payload, mode, db, context)


@router.delete("/cellar", response_model=LegacyImportResult)
def empty_cellar(
    db: Session = Depends(get_db),
    context: CurrentContext = Depends(require_admin_context),
) -> LegacyImportResult:
    wines_deleted, wishlist_deleted = clear_household_cellar(db, context)
    db.commit()
    return LegacyImportResult(wines_imported=0, wishlist_imported=0, wines_deleted=wines_deleted, wishlist_deleted=wishlist_deleted)


@router.get("/export-json")
def export_json(
    include_wines: bool = Query(default=True),
    include_wishlist: bool = Query(default=True),
    include_members: bool = Query(default=True),
    include_invites: bool = Query(default=True),
    include_share_offers: bool = Query(default=True),
    include_tags: bool = Query(default=True),
    include_ai_audit: bool = Query(default=True),
    db: Session = Depends(get_db),
    context: CurrentContext = Depends(require_admin_context),
) -> dict[str, Any]:
    export_payload: dict[str, Any] = {
        "schema": "winecellarmulti.export.v2",
        "exported_at": datetime.now(timezone.utc).isoformat(),
        "household": {
            "id": str(context.household.id),
            "name": context.household.name,
        },
        "included_blocks": [],
    }
    if include_wines:
        export_payload["wines"] = export_wines(db, context.household.id)
        export_payload["included_blocks"].append("wines")
    if include_wishlist:
        export_payload["wishlist"] = export_wishlist(db, context.household.id)
        export_payload["wishlist_lists"] = export_wishlist_lists(db, context.household.id)
        export_payload["included_blocks"].append("wishlist")
    if include_members:
        export_payload["members"] = export_members(db, context.household.id)
        export_payload["included_blocks"].append("members")
    if include_invites:
        export_payload["invites"] = export_invites(db, context.household.id)
        export_payload["included_blocks"].append("invites")
    if include_share_offers:
        export_payload["share_offers"] = export_share_offers(db, context.household.id)
        export_payload["included_blocks"].append("share_offers")
    if include_tags:
        export_payload["user_tags"] = export_user_tags(db, context.user.id)
        export_payload["included_blocks"].append("user_tags")
    if include_ai_audit:
        export_payload["ai_audit"] = export_ai_audit(db, context.household.id)
        export_payload["included_blocks"].append("ai_audit")
    return export_payload
