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
from app.db.session import get_db
from app.models import Wine, WineShareOffer, WishlistItem


router = APIRouter(prefix="/imports")


class LegacyImportResult(BaseModel):
    wines_imported: int
    wishlist_imported: int
    wines_skipped: int = 0
    wishlist_skipped: int = 0
    wines_updated: int = 0
    wishlist_updated: int = 0
    wines_deleted: int = 0
    wishlist_deleted: int = 0


class LegacyImportPreview(BaseModel):
    wines_total: int
    wishlist_total: int
    wine_duplicates: int
    wishlist_duplicates: int
    wine_new: int
    wishlist_new: int
    sample_wine_duplicates: list[str] = Field(default_factory=list)
    sample_wishlist_duplicates: list[str] = Field(default_factory=list)


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


def wishlist_duplicate_key(data: dict[str, Any]) -> tuple[str, str, str, str, str]:
    return (
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
        "type": as_str(raw.get("type")),
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
    }


def legacy_wishlist_data(raw: dict[str, Any], context: CurrentContext) -> dict[str, Any]:
    return {
        "id": as_uuid(raw.get("id")),
        "household_id": context.household.id,
        "created_by_user_id": context.user.id,
        "name": as_str(raw.get("name")) or "Unnamed wishlist item",
        "producer": as_str(raw.get("producer")),
        "vintage": as_str(raw.get("vintage")),
        "format": as_str(raw.get("format")),
        "type": as_str(raw.get("type")),
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
    key: tuple[str, str, str, str, str],
    existing_keys: dict[tuple[str, str, str, str, str], Wine | WishlistItem],
) -> Wine | WishlistItem | None:
    instance = db.scalar(select(model).where(model.id == data["id"], model.household_id == household_id))
    return instance or existing_keys.get(key)


def existing_wine_keys(db: Session, context: CurrentContext) -> dict[tuple[str, str, str, str, str], Wine]:
    wines = db.scalars(select(Wine).where(Wine.household_id == context.household.id))
    return {wine_duplicate_key(model_payload(wine)): wine for wine in wines}


def existing_wishlist_keys(db: Session, context: CurrentContext) -> dict[tuple[str, str, str, str, str], WishlistItem]:
    items = db.scalars(select(WishlistItem).where(WishlistItem.household_id == context.household.id))
    return {wishlist_duplicate_key(model_payload(item)): item for item in items}


def legacy_payload_lists(payload: dict[str, Any]) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    wines = payload.get("wines", [])
    wishlist = payload.get("wishlist", [])
    if not isinstance(wines, list) or not isinstance(wishlist, list):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid legacy export")
    return [item for item in wines if isinstance(item, dict)], [item for item in wishlist if isinstance(item, dict)]


def clear_household_cellar(db: Session, context: CurrentContext) -> tuple[int, int]:
    db.query(WineShareOffer).filter(WineShareOffer.household_id == context.household.id).delete(synchronize_session=False)
    wines_deleted = db.query(Wine).filter(Wine.household_id == context.household.id).delete(synchronize_session=False)
    wishlist_deleted = db.query(WishlistItem).filter(WishlistItem.household_id == context.household.id).delete(synchronize_session=False)
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
    wine_duplicates = []
    wishlist_duplicates = []

    for raw_wine in raw_wines:
        data = legacy_wine_data(raw_wine, context)
        if existing_by_id_or_key(db, Wine, context.household.id, data, wine_duplicate_key(data), wine_keys):
            wine_duplicates.append(data["name"])
    for raw_item in raw_wishlist:
        data = legacy_wishlist_data(raw_item, context)
        if existing_by_id_or_key(db, WishlistItem, context.household.id, data, wishlist_duplicate_key(data), wishlist_keys):
            wishlist_duplicates.append(data["name"])

    return LegacyImportPreview(
        wines_total=len(raw_wines),
        wishlist_total=len(raw_wishlist),
        wine_duplicates=len(wine_duplicates),
        wishlist_duplicates=len(wishlist_duplicates),
        wine_new=len(raw_wines) - len(wine_duplicates),
        wishlist_new=len(raw_wishlist) - len(wishlist_duplicates),
        sample_wine_duplicates=wine_duplicates[:5],
        sample_wishlist_duplicates=wishlist_duplicates[:5],
    )


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
        data = legacy_wishlist_data(raw_item, context)
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
    db: Session = Depends(get_db),
    context: CurrentContext = Depends(require_admin_context),
) -> dict[str, Any]:
    wines = list(db.scalars(select(Wine).where(Wine.household_id == context.household.id).order_by(Wine.name.asc(), Wine.vintage.desc())))
    wishlist = list(db.scalars(select(WishlistItem).where(WishlistItem.household_id == context.household.id).order_by(WishlistItem.name.asc())))
    return {
        "schema": "winecellarmulti.export.v1",
        "exported_at": datetime.now(timezone.utc).isoformat(),
        "household": {
            "id": str(context.household.id),
            "name": context.household.name,
        },
        "wines": [model_payload(wine) for wine in wines],
        "wishlist": [model_payload(item) for item in wishlist],
    }
