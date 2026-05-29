from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal, InvalidOperation
import json
from typing import Any
from uuid import UUID, uuid4

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import CurrentContext, require_admin_context
from app.db.session import get_db
from app.models import Wine, WishlistItem


router = APIRouter(prefix="/imports")


class LegacyImportResult(BaseModel):
    wines_imported: int
    wishlist_imported: int


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
        "owners": as_list(raw.get("owners")),
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


@router.post("/legacy-json", response_model=LegacyImportResult)
def import_legacy_json(
    payload: dict[str, Any],
    db: Session = Depends(get_db),
    context: CurrentContext = Depends(require_admin_context),
) -> LegacyImportResult:
    wines = payload.get("wines", [])
    wishlist = payload.get("wishlist", [])
    if not isinstance(wines, list) or not isinstance(wishlist, list):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid legacy export")

    for raw_wine in wines:
        if isinstance(raw_wine, dict):
            upsert_model(db, Wine, legacy_wine_data(raw_wine, context))
    for raw_item in wishlist:
        if isinstance(raw_item, dict):
            upsert_model(db, WishlistItem, legacy_wishlist_data(raw_item, context))
    db.commit()
    return LegacyImportResult(wines_imported=len(wines), wishlist_imported=len(wishlist))
