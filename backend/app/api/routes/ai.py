from __future__ import annotations

from datetime import datetime, timezone
from decimal import Decimal, InvalidOperation
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import CurrentContext, require_write_context
from app.api.routes.wines import get_household_wine
from app.api.routes.wishlist import get_household_wishlist_item
from app.core.config import settings
from app.db.session import get_db
from app.models import AiAuditLog, UserAiSettings, Wine, WishlistItem
from app.schemas.ai import AiAuditLogResponse, AiSettingsResponse, AiSettingsUpdate
from app.schemas.wine import WineResponse
from app.schemas.wishlist import WishlistResponse
from app.services.openai_client import create_response, parse_json_response


router = APIRouter(prefix="/ai")

MODEL_OPTIONS = ["gpt-5.4-nano", "gpt-5.4-mini", "gpt-5.4", "gpt-5.5"]


def validate_model(model: str) -> str:
    if model not in MODEL_OPTIONS:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Unsupported model: {model}")
    return model


def get_or_create_user_ai_settings(db: Session, context: CurrentContext) -> UserAiSettings:
    user_settings = db.get(UserAiSettings, context.user.id)
    if user_settings is None:
        user_settings = UserAiSettings(
            user_id=context.user.id,
            openai_api_key="",
            ai_notes_model=settings.openai_ai_notes_model,
            drink_window_model=settings.openai_drink_window_model,
            value_model=settings.openai_value_model,
            grape_model=settings.openai_grape_model,
            wishlist_model=settings.openai_wishlist_model,
        )
        db.add(user_settings)
        db.flush()
    return user_settings


def ai_settings_response(user_settings: UserAiSettings) -> AiSettingsResponse:
    return AiSettingsResponse(
        has_openai_api_key=bool(user_settings.openai_api_key.strip() or settings.openai_api_key.strip()),
        ai_notes_model=user_settings.ai_notes_model,
        drink_window_model=user_settings.drink_window_model,
        value_model=user_settings.value_model,
        grape_model=user_settings.grape_model,
        wishlist_model=user_settings.wishlist_model,
        model_options=MODEL_OPTIONS,
    )


def clip_summary(value: str, limit: int = 900) -> str:
    text = " ".join(str(value or "").split())
    return text[:limit]


def record_ai_audit(
    db: Session,
    context: CurrentContext,
    *,
    entity_type: str,
    entity_id: UUID,
    feature: str,
    model: str,
    summary: str,
    sources: list[dict] | None = None,
) -> None:
    db.add(
        AiAuditLog(
            household_id=context.household.id,
            user_id=context.user.id,
            entity_type=entity_type,
            entity_id=entity_id,
            feature=feature,
            model=model,
            outcome="success",
            summary=clip_summary(summary),
            sources=sources or [],
        ),
    )


@router.get("/audit", response_model=list[AiAuditLogResponse])
def list_ai_audit(
    db: Session = Depends(get_db),
    context: CurrentContext = Depends(require_write_context),
) -> list[AiAuditLog]:
    return list(
        db.scalars(
            select(AiAuditLog)
            .where(AiAuditLog.household_id == context.household.id)
            .order_by(AiAuditLog.created_at.desc())
            .limit(30),
        ),
    )


@router.get("/settings", response_model=AiSettingsResponse)
def get_ai_settings(
    db: Session = Depends(get_db),
    context: CurrentContext = Depends(require_write_context),
) -> AiSettingsResponse:
    return ai_settings_response(get_or_create_user_ai_settings(db, context))


@router.patch("/settings", response_model=AiSettingsResponse)
def update_ai_settings(
    payload: AiSettingsUpdate,
    db: Session = Depends(get_db),
    context: CurrentContext = Depends(require_write_context),
) -> AiSettingsResponse:
    user_settings = get_or_create_user_ai_settings(db, context)
    if payload.openai_api_key is not None:
        user_settings.openai_api_key = payload.openai_api_key.strip()
    for field in ["ai_notes_model", "drink_window_model", "value_model", "grape_model", "wishlist_model"]:
        value = getattr(payload, field)
        if value is not None:
            setattr(user_settings, field, validate_model(value))
    user_settings.updated_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(user_settings)
    return ai_settings_response(user_settings)


def wine_context(wine: Wine) -> str:
    return "\n".join(
        [
            f"Name: {wine.name}",
            f"Producer: {wine.producer}",
            f"Vintage: {wine.vintage}",
            f"Type: {wine.type}",
            f"Format: {wine.format}",
            f"Region: {wine.region}",
            f"Appellation: {wine.appellation}",
            f"Status: {wine.status}",
            f"Purchase price: {wine.currency} {wine.price}",
            f"Current value: {wine.currency} {wine.current_value}" if wine.current_value is not None else "Current value: unknown",
            f"Scores: {wine.scores}",
            f"Grapes: {wine.grapes}",
            f"Tags: {', '.join(wine.tags)}",
            f"Notes: {wine.notes}",
            f"AI notes: {wine.ai_notes}",
        ],
    )


def wishlist_context(item: WishlistItem) -> str:
    return "\n".join(
        [
            f"Name: {item.name}",
            f"Producer: {item.producer}",
            f"Vintage: {item.vintage}",
            f"Type: {item.type}",
            f"Format: {item.format}",
            f"Region: {item.region}",
            f"Appellation: {item.appellation}",
            f"Target price: {item.currency} {item.target_price}",
            f"Priority: {item.priority}",
            f"Purpose: {item.purpose}",
            f"Status: {item.status}",
            f"Merchant: {item.merchant}",
            f"Notes: {item.notes}",
        ],
    )


@router.post("/wines/{wine_id}/notes", response_model=WineResponse)
def generate_wine_notes(
    wine_id: UUID,
    db: Session = Depends(get_db),
    context: CurrentContext = Depends(require_write_context),
) -> Wine:
    wine = get_household_wine(db, context, wine_id)
    user_settings = get_or_create_user_ai_settings(db, context)
    notes = create_response(
        user_settings.ai_notes_model,
        "You are a concise wine expert. Write in Italian. Do not invent exact facts; say when evidence is limited.",
        f"Create practical cellar notes for this wine in 3-5 sentences.\n\n{wine_context(wine)}",
        api_key=user_settings.openai_api_key,
    )
    wine.ai_notes = notes[:4000]
    record_ai_audit(db, context, entity_type="wine", entity_id=wine.id, feature="ai_notes", model=user_settings.ai_notes_model, summary=notes)
    db.commit()
    db.refresh(wine)
    return wine


@router.post("/wines/{wine_id}/drink-window", response_model=WineResponse)
def generate_drink_window(
    wine_id: UUID,
    db: Session = Depends(get_db),
    context: CurrentContext = Depends(require_write_context),
) -> Wine:
    wine = get_household_wine(db, context, wine_id)
    user_settings = get_or_create_user_ai_settings(db, context)
    schema = {
        "name": "drink_window",
        "schema": {
            "type": "object",
            "additionalProperties": False,
            "properties": {
                "drink_from": {"type": "integer"},
                "drink_peak_from": {"type": "integer"},
                "drink_peak_to": {"type": "integer"},
                "drink_to": {"type": "integer"},
                "notes": {"type": "string"},
            },
            "required": ["drink_from", "drink_peak_from", "drink_peak_to", "drink_to", "notes"],
        },
    }
    result = parse_json_response(
        create_response(
            user_settings.drink_window_model,
            "You are a conservative wine cellar planner. Return JSON only.",
            f"Estimate a drinking window for this wine. Use realistic years and concise Italian notes.\n\n{wine_context(wine)}",
            api_key=user_settings.openai_api_key,
            json_schema=schema,
        ),
    )
    wine.drink_from = int(result["drink_from"])
    wine.drink_peak_from = int(result["drink_peak_from"])
    wine.drink_peak_to = int(result["drink_peak_to"])
    wine.drink_to = int(result["drink_to"])
    wine.drink_window_notes = str(result["notes"])[:2000]
    record_ai_audit(
        db,
        context,
        entity_type="wine",
        entity_id=wine.id,
        feature="drink_window",
        model=user_settings.drink_window_model,
        summary=f"{wine.drink_from}-{wine.drink_to}: {wine.drink_window_notes}",
    )
    db.commit()
    db.refresh(wine)
    return wine


@router.post("/wines/{wine_id}/value", response_model=WineResponse)
def generate_wine_value(
    wine_id: UUID,
    db: Session = Depends(get_db),
    context: CurrentContext = Depends(require_write_context),
) -> Wine:
    wine = get_household_wine(db, context, wine_id)
    user_settings = get_or_create_user_ai_settings(db, context)
    schema = {
        "name": "wine_value",
        "schema": {
            "type": "object",
            "additionalProperties": False,
            "properties": {
                "current_value": {"type": "number"},
                "currency": {"type": "string"},
                "notes": {"type": "string"},
            },
            "required": ["current_value", "currency", "notes"],
        },
    }
    result = parse_json_response(
        create_response(
            user_settings.value_model,
            "You estimate wine value cautiously. Return JSON only. If market data is uncertain, keep close to purchase price and explain uncertainty.",
            f"Estimate current unit value for this wine. Currency should preferably remain {wine.currency}.\n\n{wine_context(wine)}",
            api_key=user_settings.openai_api_key,
            json_schema=schema,
        ),
    )
    try:
        value = Decimal(str(result["current_value"])).quantize(Decimal("0.01"))
    except (InvalidOperation, KeyError) as exc:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail="AI returned invalid value") from exc
    wine.current_value = max(value, Decimal("0"))
    wine.currency = str(result.get("currency") or wine.currency)[:8]
    wine.ai_value_notes = str(result["notes"])[:2000]
    wine.ai_value_estimated_at = datetime.now(timezone.utc)
    record_ai_audit(
        db,
        context,
        entity_type="wine",
        entity_id=wine.id,
        feature="ai_value",
        model=user_settings.value_model,
        summary=f"{wine.currency} {wine.current_value}: {wine.ai_value_notes}",
    )
    db.commit()
    db.refresh(wine)
    return wine


@router.post("/wines/{wine_id}/grapes", response_model=WineResponse)
def generate_grapes(
    wine_id: UUID,
    db: Session = Depends(get_db),
    context: CurrentContext = Depends(require_write_context),
) -> Wine:
    wine = get_household_wine(db, context, wine_id)
    user_settings = get_or_create_user_ai_settings(db, context)
    schema = {
        "name": "grape_composition",
        "schema": {
            "type": "object",
            "additionalProperties": False,
            "properties": {
                "grapes": {
                    "type": "array",
                    "items": {
                        "type": "object",
                        "additionalProperties": False,
                        "properties": {
                            "name": {"type": "string"},
                            "percentage_from": {"type": "integer"},
                            "percentage_to": {"type": "integer"},
                        },
                        "required": ["name", "percentage_from", "percentage_to"],
                    },
                },
                "notes": {"type": "string"},
            },
            "required": ["grapes", "notes"],
        },
    }
    result = parse_json_response(
        create_response(
            user_settings.grape_model,
            "You infer grape composition for wine. Return JSON only. Prefer known appellation rules when exact producer data is unavailable.",
            f"Estimate grape composition for this wine.\n\n{wine_context(wine)}",
            api_key=user_settings.openai_api_key,
            json_schema=schema,
        ),
    )
    wine.grapes = result.get("grapes", [])
    note = str(result.get("notes") or "").strip()
    if note:
        wine.ai_notes = f"{wine.ai_notes}\n\nUve: {note}".strip()[:4000]
    record_ai_audit(
        db,
        context,
        entity_type="wine",
        entity_id=wine.id,
        feature="grapes",
        model=user_settings.grape_model,
        summary=note or str(wine.grapes),
    )
    db.commit()
    db.refresh(wine)
    return wine


@router.post("/wishlist/{item_id}/strategy", response_model=WishlistResponse)
def generate_wishlist_strategy(
    item_id: UUID,
    db: Session = Depends(get_db),
    context: CurrentContext = Depends(require_write_context),
) -> WishlistItem:
    item = get_household_wishlist_item(db, context, item_id)
    user_settings = get_or_create_user_ai_settings(db, context)
    schema = {
        "name": "wishlist_strategy",
        "schema": {
            "type": "object",
            "additionalProperties": False,
            "properties": {
                "strategy": {"type": "string"},
                "purpose_advice": {"type": "string"},
                "recommended_status": {"type": "string"},
                "recommended_priority": {"type": "string"},
            },
            "required": ["strategy", "purpose_advice", "recommended_status", "recommended_priority"],
        },
    }
    result = parse_json_response(
        create_response(
            user_settings.wishlist_model,
            "You are a pragmatic wine buying advisor. Return JSON only. Write text fields in Italian.",
            f"Advise whether and how to buy this wishlist wine.\n\n{wishlist_context(item)}",
            api_key=user_settings.openai_api_key,
            json_schema=schema,
        ),
    )
    item.ai_strategy = str(result["strategy"])[:3000]
    item.ai_purpose_advice = str(result["purpose_advice"])[:3000]
    item.status = str(result["recommended_status"] or item.status)[:32]
    item.priority = str(result["recommended_priority"] or item.priority)[:32]
    record_ai_audit(
        db,
        context,
        entity_type="wishlist",
        entity_id=item.id,
        feature="wishlist_strategy",
        model=user_settings.wishlist_model,
        summary=f"{item.priority} / {item.status}: {item.ai_strategy}",
    )
    db.commit()
    db.refresh(item)
    return item
