from __future__ import annotations

from datetime import datetime, timezone
from decimal import Decimal, InvalidOperation
import re
from typing import Any
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import CurrentContext, require_write_context
from app.api.routes.wines import get_household_wine, record_wine_value_history, user_can_see_wine, user_tag_names_by_wine, wine_response, wine_value_history_by_wine
from app.api.routes.wishlist import get_household_wishlist_item, get_household_wishlist_list, get_or_create_default_wishlist_list, wishlist_ai_generated_dates, wishlist_response
from app.core.config import settings
from app.core.crypto import decrypt_secret, encrypt_secret
from app.core.wine_types import normalize_wine_type
from app.db.session import get_db
from app.models import AiAuditLog, UserAiSettings, Wine, WishlistItem
from app.schemas.ai import (
    AiGenerationRequest,
    AiAuditLogResponse,
    AiSettingsResponse,
    AiSettingsUpdate,
    AiUsageBucket,
    AiUsageResponse,
    PairingCellarMatch,
    PairingMarketWine,
    PairingRequest,
    PairingResponse,
    RegionalGapTargetSuggestionRequest,
    RegionalGapTargetSuggestionResponse,
    RegionalGapTarget,
    WineCompareRequest,
    WineCompareResponse,
    WineLabelEnrichmentRequest,
    WineLabelEnrichmentResponse,
    WishlistPortfolioStrategyRequest,
    WishlistPortfolioStrategyResponse,
)
from app.schemas.wine import WineResponse
from app.schemas.wishlist import WishlistResponse
from app.services.openai_client import TokenUsage, create_response, parse_json_response
from app.services.ai_credits import ZERO_USD, ai_credit_balance, create_ai_credit_transaction, quantize_usd
from app.api.routes.billing import stripe_ai_credit_amount


router = APIRouter(prefix="/ai")

LEGACY_MODEL_OPTIONS = ["gpt-5.4-nano", "gpt-5.4-mini", "gpt-5.4", "gpt-5.5"]
GPT56_MODEL_OPTIONS = ["gpt-5.6-luna", "gpt-5.6-terra", "gpt-5.6-sol"]
AI_PROVIDER_OPTIONS = ["auto", "user_key", "credits"]
MODEL_FIELDS = ["ai_notes_model", "drink_window_model", "value_model", "grape_model", "wishlist_model", "pairing_model"]
GPT56_DEFAULT_ROLE_BY_FIELD = {
    "ai_notes_model": "economy",
    "drink_window_model": "balanced",
    "value_model": "economy",
    "grape_model": "economy",
    "wishlist_model": "balanced",
    "pairing_model": "balanced",
}
MODEL_PRICING_USD_PER_MILLION_TOKENS = {
    "gpt-5.4-nano": {"input": Decimal("0.20"), "cached_input": Decimal("0.02"), "output": Decimal("1.25")},
    "gpt-5.4-mini": {"input": Decimal("0.75"), "cached_input": Decimal("0.075"), "output": Decimal("4.50")},
    "gpt-5.4": {"input": Decimal("2.50"), "cached_input": Decimal("0.25"), "output": Decimal("15.00")},
    "gpt-5.5": {"input": Decimal("5.00"), "cached_input": Decimal("0.50"), "output": Decimal("30.00")},
    "gpt-5.6-luna": {"input": Decimal("1.00"), "cached_input": Decimal("0.10"), "output": Decimal("6.00")},
    "gpt-5.6-terra": {"input": Decimal("2.50"), "cached_input": Decimal("0.25"), "output": Decimal("15.00")},
    "gpt-5.6-sol": {"input": Decimal("5.00"), "cached_input": Decimal("0.50"), "output": Decimal("30.00")},
}


def ai_pack_markup_percent() -> Decimal:
    try:
        markup = Decimal(str(settings.ai_pack_markup_percent or "0"))
    except (InvalidOperation, TypeError, ValueError) as exc:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="AI Pack markup configuration is invalid") from exc
    if markup < Decimal("0"):
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="AI Pack markup configuration is invalid")
    return markup


def response_language(locale: str) -> str:
    return "Italian" if locale == "it" else "English"


def response_language_instruction(locale: str) -> str:
    language = response_language(locale)
    return f"Write all user-facing prose in {language}. Keep structured status/priority labels concise and localized when natural."


def validate_model(model: str) -> str:
    if model not in available_model_options():
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Unsupported model: {model}")
    return model


def available_model_options() -> list[str]:
    """Models exposed to user/API settings; GPT-5.5 remains internal fallback when GPT-5.6 is enabled."""
    return list(GPT56_MODEL_OPTIONS if settings.openai_enable_gpt56 else LEGACY_MODEL_OPTIONS)


def default_model_for_field(field: str) -> str:
    """Return a valid default for a persisted per-feature model preference."""
    if not settings.openai_enable_gpt56:
        return str(getattr(settings, f"openai_{field}", "")).strip()

    configured_model = str(
        getattr(settings, f"openai_{GPT56_DEFAULT_ROLE_BY_FIELD[field]}_model", "")
    ).strip()
    if configured_model in GPT56_MODEL_OPTIONS:
        return configured_model
    return {
        "economy": "gpt-5.6-luna",
        "balanced": "gpt-5.6-terra",
        "advanced": "gpt-5.6-sol",
    }[GPT56_DEFAULT_ROLE_BY_FIELD[field]]


def normalize_user_ai_models(user_settings: UserAiSettings) -> bool:
    """Migrate old saved model preferences when the GPT-5.6-only flag is enabled."""
    if not settings.openai_enable_gpt56:
        return False
    changed = False
    allowed_models = set(available_model_options())
    for field in MODEL_FIELDS:
        if getattr(user_settings, field) not in allowed_models:
            setattr(user_settings, field, default_model_for_field(field))
            changed = True
    return changed


def validate_provider_mode(provider_mode: str) -> str:
    if provider_mode not in AI_PROVIDER_OPTIONS:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Unsupported AI provider mode: {provider_mode}")
    return provider_mode


def get_or_create_user_ai_settings(db: Session, context: CurrentContext) -> UserAiSettings:
    user_settings = db.get(UserAiSettings, context.user.id)
    if user_settings is None:
        user_settings = UserAiSettings(
            user_id=context.user.id,
            openai_api_key="",
            provider_mode="auto",
            ai_notes_model=default_model_for_field("ai_notes_model"),
            drink_window_model=default_model_for_field("drink_window_model"),
            value_model=default_model_for_field("value_model"),
            grape_model=default_model_for_field("grape_model"),
            wishlist_model=default_model_for_field("wishlist_model"),
            pairing_model=default_model_for_field("pairing_model"),
            pairing_preferences="",
        )
        db.add(user_settings)
        db.flush()
    normalize_user_ai_models(user_settings)
    return user_settings


def ai_wine_response(db: Session, context: CurrentContext, wine: Wine) -> WineResponse:
    return wine_response(
        wine,
        user_tag_names_by_wine(db, context, [wine.id]).get(wine.id),
        wine_value_history_by_wine(db, [wine.id]).get(wine.id),
    )


def ai_settings_response(db: Session, context: CurrentContext, user_settings: UserAiSettings) -> AiSettingsResponse:
    app_balance = ai_credit_balance(db, context.user)
    can_use_app_credits = bool(settings.openai_api_key.strip()) and app_balance > ZERO_USD
    return AiSettingsResponse(
        has_openai_api_key=bool(decrypt_secret(user_settings.openai_api_key).strip()),
        provider_mode=user_settings.provider_mode,
        provider_options=AI_PROVIDER_OPTIONS,
        app_credit_balance_usd=app_balance,
        ai_credit_pack_size_usd=stripe_ai_credit_amount() if settings.stripe_ai_credit_price_id else ZERO_USD,
        can_use_app_credits=can_use_app_credits,
        ai_notes_model=user_settings.ai_notes_model,
        drink_window_model=user_settings.drink_window_model,
        value_model=user_settings.value_model,
        grape_model=user_settings.grape_model,
        wishlist_model=user_settings.wishlist_model,
        pairing_model=user_settings.pairing_model,
        pairing_preferences=user_settings.pairing_preferences or "",
        model_options=available_model_options(),
    )


def clip_summary(value: str, limit: int = 900) -> str:
    text = " ".join(str(value or "").split())
    return text[:limit]


def estimate_cost_usd(model: str, usage: TokenUsage) -> Decimal:
    pricing = MODEL_PRICING_USD_PER_MILLION_TOKENS.get(model)
    if pricing is None:
        return Decimal("0.000000")
    uncached_input_tokens = max(usage.input_tokens - usage.cached_input_tokens, 0)
    cost = (
        Decimal(uncached_input_tokens) * pricing["input"]
        + Decimal(usage.cached_input_tokens) * pricing["cached_input"]
        + Decimal(usage.output_tokens) * pricing["output"]
    ) / Decimal("1000000")
    return cost.quantize(Decimal("0.000001"))


def effective_response_model(response: Any, configured_model: str) -> str:
    return str(getattr(response, "model", "") or configured_model)


def web_search_tool_cost_usd(call_count: int) -> Decimal:
    try:
        unit_cost = Decimal(str(settings.openai_web_search_tool_cost_usd or "0"))
    except (InvalidOperation, TypeError, ValueError) as exc:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="OpenAI web search cost configuration is invalid") from exc
    if unit_cost < Decimal("0"):
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="OpenAI web search cost configuration is invalid")
    return quantize_usd(unit_cost * Decimal(max(call_count, 0)))


def billable_cost_usd(*, user_is_app_admin: bool, provider_source: str, model: str, usage: TokenUsage, extra_cost_usd: Decimal = Decimal("0")) -> Decimal:
    base_cost = quantize_usd(estimate_cost_usd(model, usage) + extra_cost_usd)
    if provider_source != "credits" or user_is_app_admin:
        return base_cost
    markup = ai_pack_markup_percent()
    if markup <= Decimal("0"):
        return base_cost
    return quantize_usd(base_cost * (Decimal("1") + (markup / Decimal("100"))))


def user_openai_api_key(user_settings: UserAiSettings) -> str:
    return decrypt_secret(user_settings.openai_api_key)


def select_ai_provider(db: Session, context: CurrentContext, user_settings: UserAiSettings) -> tuple[str, str]:
    user_key = user_openai_api_key(user_settings).strip()
    app_key = settings.openai_api_key.strip()
    balance = ai_credit_balance(db, context.user)
    mode = user_settings.provider_mode or "auto"

    if mode == "user_key":
        if user_key:
            return ("user_key", user_key)
        raise HTTPException(status_code=status.HTTP_402_PAYMENT_REQUIRED, detail="No personal OpenAI API key configured")
    if mode == "credits":
        if app_key and balance > ZERO_USD:
            return ("credits", app_key)
        if not app_key:
            raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="Application OpenAI API key is not configured")
        raise HTTPException(status_code=status.HTTP_402_PAYMENT_REQUIRED, detail="AI credits exhausted")

    if user_key:
        return ("user_key", user_key)
    if app_key and balance > ZERO_USD:
        return ("credits", app_key)
    if app_key and balance <= ZERO_USD:
        raise HTTPException(status_code=status.HTTP_402_PAYMENT_REQUIRED, detail="AI credits exhausted")
    raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="No AI provider configured")


def create_ai_response(
    db: Session,
    context: CurrentContext,
    user_settings: UserAiSettings,
    *,
    model: str,
    system_prompt: str,
    user_prompt: str,
    json_schema: dict[str, Any] | None = None,
    web_search: bool = False,
    charge_immediately: bool = True,
    task_type: str = "sommelier",
    complexity: str | None = None,
) -> tuple[Any, str]:
    provider_source, api_key = select_ai_provider(db, context, user_settings)
    # Old per-user GPT-5.4 values remain valid for compatibility. When routing
    # is enabled, the central deterministic router owns the model decision.
    requested_model = "" if settings.openai_enable_model_routing else model
    if requested_model and requested_model not in available_model_options():
        requested_model = ""
    response = create_response(
        requested_model,
        system_prompt,
        user_prompt,
        api_key=api_key,
        json_schema=json_schema,
        web_search=web_search,
        task_type=task_type,
        complexity=complexity,
    )
    if charge_immediately:
        charge_ai_usage(
            db,
            context,
            provider_source,
            model=response.model or model,
            usage=response.usage,
            extra_cost_usd=web_search_tool_cost_usd(response.web_search_calls),
        )
    return response, provider_source


def charge_ai_usage(
    db: Session,
    context: CurrentContext,
    provider_source: str,
    *,
    model: str,
    usage: TokenUsage,
    extra_cost_usd: Decimal = Decimal("0"),
) -> Decimal:
    cost = billable_cost_usd(
        user_is_app_admin=context.user.is_app_admin,
        provider_source=provider_source,
        model=model,
        usage=usage,
        extra_cost_usd=extra_cost_usd,
    )
    if provider_source == "credits":
        create_ai_credit_transaction(
            db,
            context.user,
            amount_usd=-cost,
            source="usage",
            note=f"{model} tokens for {context.household.name}",
        )
    return cost


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
    usage: TokenUsage | None = None,
    provider_source: str = "user_key",
    extra_cost_usd: Decimal = Decimal("0"),
) -> None:
    token_usage = usage or TokenUsage()
    base_cost = quantize_usd(estimate_cost_usd(model, token_usage) + extra_cost_usd)
    billed_cost = billable_cost_usd(
        user_is_app_admin=context.user.is_app_admin,
        provider_source=provider_source,
        model=model,
        usage=token_usage,
        extra_cost_usd=extra_cost_usd,
    )
    source_metadata: dict[str, str] = {"provider_source": provider_source}
    if provider_source == "credits":
        source_metadata["base_cost_usd"] = str(base_cost)
        source_metadata["charged_cost_usd"] = str(billed_cost)
        if extra_cost_usd > ZERO_USD:
            source_metadata["external_tool_cost_usd"] = str(quantize_usd(extra_cost_usd))
        if not context.user.is_app_admin:
            source_metadata["markup_percent"] = str(ai_pack_markup_percent())
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
            sources=(sources or []) + [source_metadata],
            input_tokens=token_usage.input_tokens,
            cached_input_tokens=token_usage.cached_input_tokens,
            output_tokens=token_usage.output_tokens,
            total_tokens=token_usage.total_tokens,
            estimated_cost_usd=billed_cost,
        ),
    )


def usage_bucket(entries: list[AiAuditLog]) -> AiUsageBucket:
    return AiUsageBucket(
        requests=len(entries),
        input_tokens=sum(entry.input_tokens or 0 for entry in entries),
        cached_input_tokens=sum(entry.cached_input_tokens or 0 for entry in entries),
        output_tokens=sum(entry.output_tokens or 0 for entry in entries),
        total_tokens=sum(entry.total_tokens or 0 for entry in entries),
        estimated_cost_usd=sum((entry.estimated_cost_usd or Decimal("0") for entry in entries), Decimal("0")).quantize(Decimal("0.000001")),
    )


def utc_datetime(value: datetime) -> datetime:
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)


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


@router.get("/usage", response_model=AiUsageResponse)
def get_ai_usage(
    db: Session = Depends(get_db),
    context: CurrentContext = Depends(require_write_context),
) -> AiUsageResponse:
    entries = list(
        db.scalars(
            select(AiAuditLog)
            .where(AiAuditLog.household_id == context.household.id)
            .where(AiAuditLog.user_id == context.user.id),
        ),
    )
    now = datetime.now(timezone.utc)
    today = [entry for entry in entries if utc_datetime(entry.created_at).date() == now.date()]
    current_month = [
        entry
        for entry in entries
        if utc_datetime(entry.created_at).year == now.year and utc_datetime(entry.created_at).month == now.month
    ]
    usage = AiUsageResponse(today=usage_bucket(today), current_month=usage_bucket(current_month), all_time=usage_bucket(entries))
    usage.currency = "USD"
    usage.is_estimate = True
    return usage


@router.get("/settings", response_model=AiSettingsResponse)
def get_ai_settings(
    db: Session = Depends(get_db),
    context: CurrentContext = Depends(require_write_context),
) -> AiSettingsResponse:
    user_settings = get_or_create_user_ai_settings(db, context)
    db.commit()
    db.refresh(user_settings)
    return ai_settings_response(db, context, user_settings)


@router.patch("/settings", response_model=AiSettingsResponse)
def update_ai_settings(
    payload: AiSettingsUpdate,
    db: Session = Depends(get_db),
    context: CurrentContext = Depends(require_write_context),
) -> AiSettingsResponse:
    user_settings = get_or_create_user_ai_settings(db, context)
    if payload.openai_api_key is not None:
        user_settings.openai_api_key = encrypt_secret(payload.openai_api_key.strip())
    if payload.provider_mode is not None:
        user_settings.provider_mode = validate_provider_mode(payload.provider_mode)
    for field in MODEL_FIELDS:
        value = getattr(payload, field)
        if value is not None:
            # The UI may submit all fields together. Convert a stale preference
            # saved before the GPT-5.6-only rollout instead of rejecting the
            # whole update because one untouched field still contains GPT-5.4.
            if settings.openai_enable_gpt56 and value in LEGACY_MODEL_OPTIONS:
                setattr(user_settings, field, default_model_for_field(field))
            else:
                setattr(user_settings, field, validate_model(value))
    if payload.pairing_preferences is not None:
        user_settings.pairing_preferences = payload.pairing_preferences.strip()[:2000]
    user_settings.updated_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(user_settings)
    return ai_settings_response(db, context, user_settings)


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


def compare_wine_context(wine: Wine) -> str:
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
            f"Quantity: {wine.quantity}",
            f"Purchase price: {wine.currency} {wine.price}",
            f"Current value: {wine.currency} {wine.current_value}" if wine.current_value is not None else "Current value: unknown",
            f"Drink window: {wine.drink_from}-{wine.drink_to}" if wine.drink_from or wine.drink_to else "Drink window: unknown",
            f"Rating: {wine.rating or 'unknown'}",
            f"Scores: {wine.scores}",
            f"Grapes: {wine.grapes}",
            f"Tags: {', '.join(wine.tags)}",
            f"Notes: {wine.notes}",
            f"AI notes: {wine.ai_notes}",
            f"AI value notes: {wine.ai_value_notes}",
        ],
    )


def replace_compare_placeholders(text: str, first_name: str, second_name: str) -> str:
    result = text or ""
    replacements = [
        (r"\bWINE A\b", first_name),
        (r"\bWINE B\b", second_name),
        (r"\bWine A\b", first_name),
        (r"\bWine B\b", second_name),
        (r"\bA vs B\b", f"{first_name} vs {second_name}"),
        (r"\bB vs A\b", f"{second_name} vs {first_name}"),
        (r"\bA(?=\s+(?:è|is|looks|seems|feels|fits|works|goes|suits|va|sembra|appare|resta|rimane|può|can|should))", first_name),
        (r"\bB(?=\s+(?:è|is|looks|seems|feels|fits|works|goes|suits|va|sembra|appare|resta|rimane|può|can|should))", second_name),
    ]
    for pattern, replacement in replacements:
        result = re.sub(pattern, replacement, result)
    return result


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
            f"AI context note: {item.ai_context_note}",
            f"AI strategy: {item.ai_strategy}",
            f"AI purpose advice: {item.ai_purpose_advice}",
        ],
    )


def wishlist_priority_rank(priority: str) -> int:
    normalized = str(priority or "").strip().lower()
    if "high" in normalized or "alta" in normalized:
        return 0
    if "medium" in normalized or "media" in normalized:
        return 1
    if "low" in normalized or "bassa" in normalized:
        return 2
    return 3


def wishlist_ready_to_buy(status: str) -> bool:
    normalized = str(status or "").strip().lower()
    return any(word in normalized for word in ["buy", "ready", "approved", "compra", "acquista", "pronto", "approvato"])


def wishlist_portfolio_context(items: list[WishlistItem], household_name: str) -> str:
    sorted_items = sorted(
        items,
        key=lambda item: (wishlist_priority_rank(item.priority), -float(item.target_price or 0), item.name.lower()),
    )
    high_priority_count = sum(1 for item in items if wishlist_priority_rank(item.priority) == 0)
    ready_to_buy_count = sum(1 for item in items if wishlist_ready_to_buy(item.status))
    total_target_value = sum(Decimal(str(item.target_price or 0)) for item in items)
    lines = [
        f"Household: {household_name}",
        f"Wishlist items: {len(items)}",
        f"High priority items: {high_priority_count}",
        f"Ready to buy items: {ready_to_buy_count}",
        f"Total target value: CHF {total_target_value.quantize(Decimal('0.01'))}",
        "",
        "Wishlist portfolio:",
    ]
    for index, item in enumerate(sorted_items[:40], start=1):
        lines.extend(
            [
                (
                    f"{index}. {item.name} | Producer: {item.producer or 'Unknown'} | Vintage: {item.vintage or 'n/d'} | "
                    f"Target: {item.currency} {Decimal(str(item.target_price or 0)).quantize(Decimal('0.01'))} | "
                    f"Priority: {item.priority or 'Unknown'} | Purpose: {item.purpose or 'Unknown'} | Status: {item.status or 'Unknown'}"
                ),
                f"   Region/Appellation: {item.region or 'n/d'} / {item.appellation or 'n/d'}",
                f"   Merchant: {item.merchant or 'n/d'}",
                f"   Market estimate: {item.ai_market_price_currency or item.currency} {item.ai_market_price}" if item.ai_market_price else "   Market estimate: unknown",
                f"   Notes: {item.notes or 'none'}",
                f"   AI context note: {item.ai_context_note or 'none'}",
                f"   Existing AI strategy: {item.ai_strategy or 'none'}",
                f"   Existing AI purpose advice: {item.ai_purpose_advice or 'none'}",
            ],
        )
    if len(sorted_items) > 40:
        lines.append(f"... {len(sorted_items) - 40} more items omitted from the detailed list, but included in the summary counts.")
    return "\n".join(lines)


def normalize_market_sources(raw_sources: Any, *, default_currency: str, require_url: bool = False) -> list[dict]:
    if not isinstance(raw_sources, list):
        return []
    normalized: list[dict] = []
    for raw_source in raw_sources[:12]:
        if not isinstance(raw_source, dict):
            continue
        merchant = str(raw_source.get("merchant") or raw_source.get("source") or raw_source.get("name") or "").strip()[:160]
        if not merchant:
            continue
        try:
            price = Decimal(str(raw_source.get("price"))).quantize(Decimal("0.01"))
        except (InvalidOperation, TypeError, ValueError):
            continue
        if price < Decimal("0"):
            continue
        url = str(raw_source.get("url") or raw_source.get("link") or "").strip()[:500]
        if require_url and not url:
            continue
        normalized.append(
            {
                "kind": "market_source",
                "merchant": merchant,
                "country": str(raw_source.get("country") or "").strip()[:80],
                "price": str(price),
                "currency": str(raw_source.get("currency") or default_currency or "").strip()[:8] or default_currency,
                "url": url,
                "note": str(raw_source.get("note") or "").strip()[:240],
                "verified": bool(url),
            },
        )
    return normalized


def web_search_source_entries(web_sources: tuple[dict[str, str], ...]) -> list[dict]:
    entries: list[dict] = []
    for source in web_sources[:12]:
        url = str(source.get("url") or "").strip()[:500]
        if not url:
            continue
        entries.append(
            {
                "kind": "web_search_source",
                "url": url,
                "title": str(source.get("title") or "").strip()[:200],
            },
        )
    return entries


def value_currency_instruction(currency: str) -> str:
    target_currency = (currency or "CHF").strip().upper()[:8]
    return (
        f"Return the final estimate in {target_currency}. "
        f"If a source is listed in EUR, USD, GBP, or another currency, convert it mentally to {target_currency} before setting the final estimate and mention the conversion basis in market_note. "
        "Do not average raw prices across different currencies. "
        "Use the user's purchase or target price only as a comparison reference, never as an anchor for the market estimate. "
        "Prioritize exact matches for producer, cuvee/name, vintage, bottle format, and region/appellation. "
        "Do not use generic category comparables such as 'similar Barbaresco' unless no exact source is available; if you must use comparables, say so clearly in market_note and keep confidence lower. "
        "Use live web search. Prefer real retailer or marketplace listings with a URL; do not invent source URLs or quote source names as exact listings if you cannot identify a concrete listing. "
        "For Swiss cellars, favor Swiss retail availability and final consumer pricing when available, including VAT and typical local-market premium."
    )


def market_note_source(note: Any) -> dict | None:
    text = clip_summary(str(note or ""), limit=500).strip()
    if not text:
        return None
    return {"kind": "market_note", "text": text}


def pairing_wine_context(wine: Wine) -> dict:
    return {
        "id": str(wine.id),
        "name": wine.name,
        "producer": wine.producer,
        "vintage": wine.vintage,
        "type": wine.type,
        "region": wine.region,
        "appellation": wine.appellation,
        "quantity": wine.quantity,
        "format": wine.format,
        "current_value": str(wine.current_value if wine.current_value is not None else wine.price),
        "currency": wine.currency,
        "drink_peak_from": wine.drink_peak_from,
        "drink_peak_to": wine.drink_peak_to,
        "drink_to": wine.drink_to,
        "scores": wine.scores,
        "grapes": wine.grapes,
        "tags": wine.tags,
    }


def pairing_budget_value_chf(wine: Wine) -> Decimal:
    reference_value = wine.current_value if wine.current_value is not None else wine.price
    if reference_value is None:
        return Decimal("0")
    return Decimal(str(reference_value))


def clean_pairing_response(payload: dict, available_wine_ids: set[str], include_market: bool) -> PairingResponse:
    matches = payload.get("cellar_matches", [])
    if not isinstance(matches, list):
        matches = []
    cleaned_matches: list[PairingCellarMatch] = []
    seen_ids: set[str] = set()
    for match in matches[:3]:
        if not isinstance(match, dict):
            continue
        wine_id = str(match.get("wine_id") or "").strip()
        if wine_id not in available_wine_ids or wine_id in seen_ids:
            continue
        seen_ids.add(wine_id)
        cleaned_matches.append(
            PairingCellarMatch(
                wine_id=UUID(wine_id),
                wine_name=str(match.get("wine_name") or "").strip(),
                producer=str(match.get("producer") or "").strip(),
                reason=str(match.get("reason") or "").strip(),
                serving_note=str(match.get("serving_note") or "").strip(),
            ),
        )

    market: dict[str, list[PairingMarketWine]] = {"low": [], "medium": [], "high": []}
    if include_market or not cleaned_matches:
        raw_market = payload.get("market_recommendations", {})
        if isinstance(raw_market, dict):
            for tier in ["low", "medium", "high"]:
                items = raw_market.get(tier, [])
                if not isinstance(items, list):
                    items = []
                market[tier] = [
                    PairingMarketWine(
                        name=str(item.get("name") or "").strip(),
                        producer=str(item.get("producer") or "").strip(),
                        price_hint=str(item.get("price_hint") or "").strip(),
                        reason=str(item.get("reason") or "").strip(),
                    )
                    for item in items[:2]
                    if isinstance(item, dict) and str(item.get("name") or "").strip()
                ]
    return PairingResponse(
        summary=str(payload.get("summary") or "").strip(),
        model="",
        cellar_matches=cleaned_matches,
        market_recommendations=market,
        estimated_cost_usd=Decimal("0"),
    )


@router.post("/compare-wines", response_model=WineCompareResponse)
def compare_wines(
    payload: WineCompareRequest,
    db: Session = Depends(get_db),
    context: CurrentContext = Depends(require_write_context),
) -> WineCompareResponse:
    user_settings = get_or_create_user_ai_settings(db, context)
    selected_wines = [get_household_wine(db, context, wine_id) for wine_id in payload.wine_ids]
    if len(selected_wines) != 2:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Exactly 2 wines are required")
    first, second = selected_wines
    schema = {
        "name": "wine_compare",
        "schema": {
            "type": "object",
            "additionalProperties": False,
            "properties": {
                "style_profile": {"type": "string"},
                "readiness": {"type": "string"},
                "occasion": {"type": "string"},
                "cellar_value": {"type": "string"},
                "verdict": {"type": "string"},
            },
            "required": ["style_profile", "readiness", "occasion", "cellar_value", "verdict"],
        },
    }
    response, provider_source = create_ai_response(
        db,
        context,
        user_settings,
        model=user_settings.pairing_model,
        task_type="wine_comparison",
        system_prompt=(
            "You compare two wines for a private collector. Return JSON only. "
            "Be concise, concrete, and decision-oriented. "
            f"Always refer to the wines by their exact names: '{first.name}' and '{second.name}'. "
            "Never call them A or B in the output. "
            "In style_profile, write one short direct comparison using the real wine names. "
            "Do not invent unavailable facts; acknowledge uncertainty briefly if needed. "
            f"{response_language_instruction(payload.locale)}"
        ),
        user_prompt=(
            "Compare these two wines for a collector deciding what to open, keep, or prioritize.\n\n"
            "Return:\n"
            "- style_profile: direct A vs B on style and profile\n"
            "- readiness: which is more ready now vs better to hold\n"
            "- occasion: which suits what occasion better\n"
            "- cellar_value: which seems more compelling in cellar/value terms\n"
            "- verdict: one clear recommendation sentence\n\n"
            f"WINE A\n{compare_wine_context(first)}\n\n"
            f"WINE B\n{compare_wine_context(second)}"
        ),
        json_schema=schema,
    )
    result = parse_json_response(response.text)
    charged_cost = billable_cost_usd(
        user_is_app_admin=context.user.is_app_admin,
        provider_source=provider_source,
        model=user_settings.pairing_model,
        usage=response.usage,
    )
    compare_response = WineCompareResponse(
        model=user_settings.pairing_model,
        style_profile=replace_compare_placeholders(str(result.get("style_profile") or "").strip(), first.name, second.name),
        readiness=replace_compare_placeholders(str(result.get("readiness") or "").strip(), first.name, second.name),
        occasion=replace_compare_placeholders(str(result.get("occasion") or "").strip(), first.name, second.name),
        cellar_value=replace_compare_placeholders(str(result.get("cellar_value") or "").strip(), first.name, second.name),
        verdict=replace_compare_placeholders(str(result.get("verdict") or "").strip(), first.name, second.name),
        estimated_cost_usd=charged_cost,
    )
    record_ai_audit(
        db,
        context,
        entity_type="comparison",
        entity_id=context.household.id,
        feature="wine_compare",
        model=user_settings.pairing_model,
        summary=f"{first.name} vs {second.name}: {compare_response.verdict}",
        usage=response.usage,
        provider_source=provider_source,
    )
    db.commit()
    return compare_response


@router.post("/pairing", response_model=PairingResponse)
def suggest_pairing(
    payload: PairingRequest,
    db: Session = Depends(get_db),
    context: CurrentContext = Depends(require_write_context),
) -> PairingResponse:
    user_settings = get_or_create_user_ai_settings(db, context)
    pairing_preferences = "" if payload.ignore_preferences else (user_settings.pairing_preferences or "").strip()
    max_price_chf = Decimal(str(payload.max_price_chf)) if payload.max_price_chf is not None else None
    local_origin = payload.local_origin.strip()
    prefer_local_wines = payload.market_only and payload.prefer_local_wines and bool(local_origin)
    cellar_wines = [] if payload.market_only else list(
        db.scalars(
            select(Wine)
            .where(Wine.household_id == context.household.id)
            .where(Wine.status == "Delivered")
            .where(Wine.quantity > 0)
            .order_by(Wine.name)
            .limit(120),
        ),
    )
    cellar_wines = [wine for wine in cellar_wines if user_can_see_wine(context, wine)]
    if max_price_chf is not None:
        cellar_wines = [wine for wine in cellar_wines if pairing_budget_value_chf(wine) <= max_price_chf]
    wine_context_payload = [pairing_wine_context(wine) for wine in cellar_wines]
    schema = {
        "name": "wine_pairing",
        "schema": {
            "type": "object",
            "additionalProperties": False,
            "properties": {
                "summary": {"type": "string"},
                "cellar_matches": {
                    "type": "array",
                    "items": {
                        "type": "object",
                        "additionalProperties": False,
                        "properties": {
                            "wine_id": {"type": "string"},
                            "wine_name": {"type": "string"},
                            "producer": {"type": "string"},
                            "reason": {"type": "string"},
                            "serving_note": {"type": "string"},
                        },
                        "required": ["wine_id", "wine_name", "producer", "reason", "serving_note"],
                    },
                },
                "market_recommendations": {
                    "type": "object",
                    "additionalProperties": False,
                    "properties": {
                        tier: {
                            "type": "array",
                            "items": {
                                "type": "object",
                                "additionalProperties": False,
                                "properties": {
                                    "name": {"type": "string"},
                                    "producer": {"type": "string"},
                                    "price_hint": {"type": "string"},
                                    "reason": {"type": "string"},
                                },
                                "required": ["name", "producer", "price_hint", "reason"],
                            },
                        }
                        for tier in ["low", "medium", "high"]
                    },
                    "required": ["low", "medium", "high"],
                },
            },
            "required": ["summary", "cellar_matches", "market_recommendations"],
        },
    }
    response, provider_source = create_ai_response(
        db,
        context,
        user_settings,
        model=user_settings.pairing_model,
        task_type="pairing",
        system_prompt=(
            "Sei un sommelier privato. Consiglia vini per un piatto usando prima le bottiglie disponibili in cantina. "
            "Rispondi solo con JSON valido. Se market_only e true, ignora la cantina e proponi solo mercato. "
            "Se include_market e false e trovi vini adeguati in cantina, lascia market_recommendations vuoto. "
            "Non inventare che un vino e in cantina se non e nel contesto. "
            "Se ricevi gusti personali dell'utente, trattali come preferenze morbide e non come vincoli assoluti. "
            "Se l'utente chiede di privilegiare vini locali mentre e al ristorante, usa quel contesto come preferenza forte per le proposte di mercato, senza forzare abbinamenti palesemente sbagliati. "
            f"{response_language_instruction(payload.locale)}"
        ),
        user_prompt=(
            f"Piatto o pietanza: {payload.dish}\n"
            f"budget_massimo_chf: {str(max_price_chf) if max_price_chf is not None else 'none'}\n"
            f"include_market: {str(payload.include_market).lower()}\n"
            f"market_only: {str(payload.market_only).lower()}\n\n"
            f"gusti_personali: {pairing_preferences or 'none'}\n"
            f"ignore_preferences: {str(payload.ignore_preferences).lower()}\n\n"
            f"preferire_vini_locali: {str(prefer_local_wines).lower()}\n"
            f"origine_locale: {local_origin or 'none'}\n\n"
            "Vini disponibili in cantina, solo questi possono essere scelti come cellar_matches:\n"
            f"{wine_context_payload}\n\n"
            "Se e presente un budget massimo in CHF, privilegia chiaramente bottiglie entro quel tetto e non proporre cellar_matches sopra budget. "
            "Se preferire_vini_locali e true, privilegia per il mercato bottiglie coerenti con origine_locale, restando sensato rispetto al piatto. "
            "Se include_market e true, le proposte di mercato devono stare entro il budget quando possibile. "
            "Per il mercato proponi due bottiglie reali per fascia prezzo in CHF: low entro 30, medium entro 60, high oltre 60."
        ),
        json_schema=schema,
    )
    cleaned = clean_pairing_response(parse_json_response(response.text), {str(wine.id) for wine in cellar_wines}, payload.include_market)
    cleaned.model = user_settings.pairing_model
    charged_cost = billable_cost_usd(
        user_is_app_admin=context.user.is_app_admin,
        provider_source=provider_source,
        model=user_settings.pairing_model,
        usage=response.usage,
    )
    cleaned.estimated_cost_usd = charged_cost
    record_ai_audit(
        db,
        context,
        entity_type="pairing",
        entity_id=context.household.id,
        feature="pairing",
        model=user_settings.pairing_model,
        summary=f"{payload.dish}: {cleaned.summary}",
        usage=response.usage,
        provider_source=provider_source,
    )
    db.commit()
    return cleaned


@router.post("/wines/{wine_id}/notes", response_model=WineResponse)
def generate_wine_notes(
    wine_id: UUID,
    payload: AiGenerationRequest = AiGenerationRequest(),
    db: Session = Depends(get_db),
    context: CurrentContext = Depends(require_write_context),
) -> WineResponse:
    wine = get_household_wine(db, context, wine_id)
    user_settings = get_or_create_user_ai_settings(db, context)
    response, provider_source = create_ai_response(
        db,
        context,
        user_settings,
        model=user_settings.ai_notes_model,
        task_type="ai_notes",
        system_prompt=f"You are a concise wine expert. {response_language_instruction(payload.locale)} Do not invent exact facts; say when evidence is limited.",
        user_prompt=f"Create practical cellar notes for this wine in 3-5 sentences.\n\n{wine_context(wine)}",
    )
    notes = response.text
    wine.ai_notes = notes[:4000]
    record_ai_audit(db, context, entity_type="wine", entity_id=wine.id, feature="ai_notes", model=user_settings.ai_notes_model, summary=notes, usage=response.usage, provider_source=provider_source)
    db.commit()
    db.refresh(wine)
    return ai_wine_response(db, context, wine)


@router.post("/wine-label/enrich", response_model=WineLabelEnrichmentResponse)
def enrich_wine_label(
    payload: WineLabelEnrichmentRequest,
    db: Session = Depends(get_db),
    context: CurrentContext = Depends(require_write_context),
) -> WineLabelEnrichmentResponse:
    if payload.source == "label" and not context.user.can_use_label_recognition:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Wine label recognition is not enabled for this user")
    user_settings = get_or_create_user_ai_settings(db, context)
    model = validate_model(user_settings.grape_model or settings.openai_grape_model)
    schema = {
        "name": "wine_label_enrichment",
        "schema": {
            "type": "object",
            "additionalProperties": False,
            "properties": {
                "name": {"type": "string"},
                "producer": {"type": "string"},
                "vintage": {"type": "string"},
                "type": {"type": "string"},
                "region": {"type": "string"},
                "appellation": {"type": "string"},
                "country": {"type": "string"},
                "grapes_text": {"type": "string"},
                "confidence": {"type": "string", "enum": ["low", "medium", "high"]},
                "notes": {"type": "string"},
            },
            "required": ["name", "producer", "vintage", "type", "region", "appellation", "country", "grapes_text", "confidence", "notes"],
        },
    }
    response, provider_source = create_ai_response(
        db,
        context,
        user_settings,
        model=model,
        task_type="label_enrichment",
        system_prompt=(
            "You enrich a cellar catalog entry from a wine name or label text. "
            "Use web search when needed, especially for local or niche wines. "
            "Prefer winery, official producer, importer, regional authority, or merchant pages over generic snippets. "
            "If evidence is weak, return empty fields and set confidence accordingly."
        ),
        user_prompt=(
            f"{response_language_instruction(payload.locale)}\n"
            "Extract structured wine data from this input.\n\n"
            f"Input: {payload.label}\n"
            f"Input source: {payload.source}\n\n"
            "Guidelines:\n"
            "- name should be the cuvee/wine name without vintage or producer when possible.\n"
            "- Preserve apostrophes inside names. Do not truncate Italian or French names at apostrophes, e.g. keep \"Torre dell'anima\" complete.\n"
            "- producer should be winery/domain/brand.\n"
            "- If the input contains patterns like 'X di Y', 'X by Y', or 'X de Y', treat Y as a candidate producer and verify it.\n"
            "- vintage should be a four-digit year, NV, MV, or empty.\n"
            "- type should be one of common cellar types such as Red, White, Sparkling, Rose, Sweet, Fortified.\n"
            "- country, region, and appellation should be filled only if supported.\n"
            "- grapes_text should summarize the blend/assemblage with percentages when supported, e.g. 'Merlot 80%, Cabernet Franc 20%'.\n"
            "- notes should briefly state what was found and mention uncertainty if applicable.\n"
        ),
        json_schema=schema,
        web_search=True,
    )
    result = parse_json_response(response.text)
    cleaned = WineLabelEnrichmentResponse(
        name=str(result.get("name") or payload.label).strip(),
        producer=str(result.get("producer") or "").strip(),
        vintage=str(result.get("vintage") or "").strip(),
        type=normalize_wine_type(str(result.get("type") or "").strip()),
        region=str(result.get("region") or "").strip(),
        appellation=str(result.get("appellation") or "").strip(),
        country=str(result.get("country") or "").strip(),
        grapes_text=str(result.get("grapes_text") or "").strip(),
        confidence=str(result.get("confidence") or "low").strip() or "low",
        notes=str(result.get("notes") or "").strip(),
    )
    record_ai_audit(
        db,
        context,
        entity_type="catalog",
        entity_id=context.household.id,
        feature="wine_label_enrichment",
        model=model,
        summary=f"{payload.label}: {cleaned.producer} {cleaned.name} {cleaned.vintage}".strip(),
        usage=response.usage,
        provider_source=provider_source,
    )
    db.commit()
    return cleaned


@router.post("/wines/{wine_id}/drink-window", response_model=WineResponse)
def generate_drink_window(
    wine_id: UUID,
    payload: AiGenerationRequest = AiGenerationRequest(),
    db: Session = Depends(get_db),
    context: CurrentContext = Depends(require_write_context),
) -> WineResponse:
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
    response, provider_source = create_ai_response(
        db,
        context,
        user_settings,
        model=user_settings.drink_window_model,
        task_type="drink_window",
        system_prompt=f"You are a conservative wine cellar planner. Return JSON only. {response_language_instruction(payload.locale)}",
        user_prompt=f"Estimate a drinking window for this wine. Use realistic years and concise notes.\n\n{wine_context(wine)}",
        json_schema=schema,
    )
    result = parse_json_response(response.text)
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
        usage=response.usage,
        provider_source=provider_source,
    )
    db.commit()
    db.refresh(wine)
    return ai_wine_response(db, context, wine)


@router.post("/wines/{wine_id}/value", response_model=WineResponse)
def generate_wine_value(
    wine_id: UUID,
    payload: AiGenerationRequest = AiGenerationRequest(),
    db: Session = Depends(get_db),
    context: CurrentContext = Depends(require_write_context),
) -> WineResponse:
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
                "market_note": {"type": "string"},
                "market_sources": {
                    "type": "array",
                    "items": {
                        "type": "object",
                        "additionalProperties": False,
                        "properties": {
                            "merchant": {"type": "string"},
                            "country": {"type": "string"},
                            "price": {"type": "number"},
                            "currency": {"type": "string"},
                            "url": {"type": "string"},
                            "note": {"type": "string"},
                        },
                        "required": ["merchant", "country", "price", "currency", "url", "note"],
                    },
                },
            },
            "required": ["current_value", "currency", "notes", "market_note", "market_sources"],
        },
    }
    response, provider_source = create_ai_response(
        db,
        context,
        user_settings,
        model=user_settings.value_model,
        task_type="wine_value",
        system_prompt=(
            "You estimate wine value cautiously. Return JSON only. "
            "Use live web search for current market prices. "
            "If verified market data is uncertain, keep close to the best verified sources and explain uncertainty. "
            "Provide 3-8 verified market sources with concrete URLs when possible, using an empty array if none can be cited reliably. "
            "Keep market_note concise and useful. "
            f"{value_currency_instruction(wine.currency)} "
            f"{response_language_instruction(payload.locale)}"
        ),
        user_prompt=(
            f"Estimate current unit value for this exact wine. Final current_value and currency must be {wine.currency}. "
            "For market_sources, list only concrete merchants or marketplaces with country, price, currency, and URL for the exact wine when available. "
            "Use market_note for a short availability or confidence comment.\n\n"
            f"{wine_context(wine)}"
        ),
        json_schema=schema,
        web_search=True,
        charge_immediately=False,
    )
    extra_cost = web_search_tool_cost_usd(response.web_search_calls)
    result = parse_json_response(response.text)
    try:
        value = Decimal(str(result["current_value"])).quantize(Decimal("0.01"))
    except (InvalidOperation, KeyError) as exc:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail="AI returned invalid value") from exc
    result_currency = str(result.get("currency") or wine.currency)[:8]
    market_sources = normalize_market_sources(result.get("market_sources"), default_currency=result_currency, require_url=True)
    if not market_sources:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail="No verified live market price sources found")
    charge_ai_usage(
        db,
        context,
        provider_source,
        model=effective_response_model(response, user_settings.value_model),
        usage=response.usage,
        extra_cost_usd=extra_cost,
    )
    wine.current_value = max(value, Decimal("0"))
    wine.currency = result_currency
    wine.ai_value_notes = str(result["notes"])[:2000]
    wine.ai_value_estimated_at = datetime.now(timezone.utc)
    note_entry = market_note_source(result.get("market_note") or result.get("notes"))
    audit_sources = market_sources + web_search_source_entries(response.web_sources) + ([note_entry] if note_entry else [])
    record_wine_value_history(db, wine, source="ai")
    record_ai_audit(
        db,
        context,
        entity_type="wine",
        entity_id=wine.id,
        feature="ai_value",
        model=effective_response_model(response, user_settings.value_model),
        summary=f"{wine.currency} {wine.current_value}: {wine.ai_value_notes}",
        sources=audit_sources,
        usage=response.usage,
        provider_source=provider_source,
        extra_cost_usd=extra_cost,
    )
    db.commit()
    db.refresh(wine)
    return ai_wine_response(db, context, wine)


@router.post("/wines/{wine_id}/grapes", response_model=WineResponse)
def generate_grapes(
    wine_id: UUID,
    payload: AiGenerationRequest = AiGenerationRequest(),
    db: Session = Depends(get_db),
    context: CurrentContext = Depends(require_write_context),
) -> WineResponse:
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
    response, provider_source = create_ai_response(
        db,
        context,
        user_settings,
        model=user_settings.grape_model,
        task_type="grape_inference",
        system_prompt=f"You infer grape composition for wine. Return JSON only. Prefer known appellation rules when exact producer data is unavailable. {response_language_instruction(payload.locale)}",
        user_prompt=f"Estimate grape composition for this wine.\n\n{wine_context(wine)}",
        json_schema=schema,
    )
    result = parse_json_response(response.text)
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
        usage=response.usage,
        provider_source=provider_source,
    )
    db.commit()
    db.refresh(wine)
    return ai_wine_response(db, context, wine)


@router.post("/wines/{wine_id}/scores", response_model=WineResponse)
def generate_scores(
    wine_id: UUID,
    payload: AiGenerationRequest = AiGenerationRequest(),
    db: Session = Depends(get_db),
    context: CurrentContext = Depends(require_write_context),
) -> WineResponse:
    wine = get_household_wine(db, context, wine_id)
    if wine.scores_not_applicable:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="AI score lookup disabled for this wine")
    user_settings = get_or_create_user_ai_settings(db, context)
    schema = {
        "name": "wine_scores",
        "schema": {
            "type": "object",
            "additionalProperties": False,
            "properties": {
                "scores": {
                    "type": "array",
                    "items": {
                        "type": "object",
                        "additionalProperties": False,
                        "properties": {
                            "critic": {"type": "string"},
                            "score": {"type": "string"},
                            "note": {"type": "string"},
                        },
                        "required": ["critic", "score", "note"],
                    },
                },
            },
            "required": ["scores"],
        },
    }
    response, provider_source = create_ai_response(
        db,
        context,
        user_settings,
        model=user_settings.ai_notes_model,
        task_type="score_summary",
        system_prompt=f"You summarize known wine critic scores cautiously. Return JSON only. {response_language_instruction(payload.locale)}",
        user_prompt=(
            "Estimate likely published critic scores for this wine only when plausible. "
            "Prefer well-known critics and include short uncertainty notes. If evidence is weak, return an empty scores array.\n\n"
            f"{wine_context(wine)}"
        ),
        json_schema=schema,
    )
    result = parse_json_response(response.text)
    scores = result.get("scores") or []
    if not isinstance(scores, list):
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail="AI returned invalid scores")
    wine.scores = [
        {
            "critic": str(item.get("critic") or "")[:120],
            "score": str(item.get("score") or "")[:40],
            "note": str(item.get("note") or "")[:800],
        }
        for item in scores
        if isinstance(item, dict) and (item.get("critic") or item.get("score"))
    ][:8]
    if wine.scores:
        wine.scores_not_applicable = False
    record_ai_audit(
        db,
        context,
        entity_type="wine",
        entity_id=wine.id,
        feature="scores",
        model=user_settings.ai_notes_model,
        summary=f"{len(wine.scores)} scores generated",
        usage=response.usage,
        provider_source=provider_source,
    )
    db.commit()
    db.refresh(wine)
    return ai_wine_response(db, context, wine)


@router.post("/wishlist/{item_id}/strategy", response_model=WishlistResponse)
def generate_wishlist_strategy(
    item_id: UUID,
    payload: AiGenerationRequest = AiGenerationRequest(),
    db: Session = Depends(get_db),
    context: CurrentContext = Depends(require_write_context),
) -> dict:
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
    response, provider_source = create_ai_response(
        db,
        context,
        user_settings,
        model=user_settings.wishlist_model,
        task_type="wishlist_advice",
        system_prompt=f"You are a pragmatic wine buying advisor. Return JSON only. {response_language_instruction(payload.locale)}",
        user_prompt=f"Advise whether and how to buy this wishlist wine.\n\n{wishlist_context(item)}",
        json_schema=schema,
    )
    result = parse_json_response(response.text)
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
        usage=response.usage,
        provider_source=provider_source,
    )
    db.commit()
    db.refresh(item)
    ai_dates = wishlist_ai_generated_dates(db, context, [item])
    return wishlist_response(item, ai_dates.get(item.id))


@router.post("/wishlist/{item_id}/purpose", response_model=WishlistResponse)
def generate_wishlist_purpose(
    item_id: UUID,
    payload: AiGenerationRequest = AiGenerationRequest(),
    db: Session = Depends(get_db),
    context: CurrentContext = Depends(require_write_context),
) -> dict:
    item = get_household_wishlist_item(db, context, item_id)
    user_settings = get_or_create_user_ai_settings(db, context)
    schema = {
        "name": "wishlist_purpose",
        "schema": {
            "type": "object",
            "additionalProperties": False,
            "properties": {
                "recommended_purpose": {"type": "string"},
                "purpose_advice": {"type": "string"},
                "recommended_priority": {"type": "string"},
            },
            "required": ["recommended_purpose", "purpose_advice", "recommended_priority"],
        },
    }
    response, provider_source = create_ai_response(
        db,
        context,
        user_settings,
        model=user_settings.wishlist_model,
        task_type="wishlist_purpose",
        system_prompt=f"You decide the best purpose for a wishlist wine. Return JSON only. {response_language_instruction(payload.locale)}",
        user_prompt=f"Recommend whether this wine is best for drinking, cellaring, gifting, or investment.\n\n{wishlist_context(item)}",
        json_schema=schema,
    )
    result = parse_json_response(response.text)
    item.purpose = str(result["recommended_purpose"] or item.purpose)[:32]
    item.priority = str(result["recommended_priority"] or item.priority)[:32]
    item.ai_purpose_advice = str(result["purpose_advice"])[:3000]
    record_ai_audit(
        db,
        context,
        entity_type="wishlist",
        entity_id=item.id,
        feature="wishlist_purpose",
        model=user_settings.wishlist_model,
        summary=f"{item.purpose} / {item.priority}: {item.ai_purpose_advice}",
        usage=response.usage,
        provider_source=provider_source,
    )
    db.commit()
    db.refresh(item)
    ai_dates = wishlist_ai_generated_dates(db, context, [item])
    return wishlist_response(item, ai_dates.get(item.id))


@router.post("/wishlist/{item_id}/target-price", response_model=WishlistResponse)
def generate_wishlist_target_price(
    item_id: UUID,
    payload: AiGenerationRequest = AiGenerationRequest(),
    db: Session = Depends(get_db),
    context: CurrentContext = Depends(require_write_context),
) -> dict:
    item = get_household_wishlist_item(db, context, item_id)
    user_settings = get_or_create_user_ai_settings(db, context)
    schema = {
        "name": "wishlist_market_price",
        "schema": {
            "type": "object",
            "additionalProperties": False,
            "properties": {
                "market_price": {"type": "number"},
                "market_price_currency": {"type": "string"},
                "price_advice": {"type": "string"},
                "recommended_status": {"type": "string"},
                "market_note": {"type": "string"},
                "market_sources": {
                    "type": "array",
                    "items": {
                        "type": "object",
                        "additionalProperties": False,
                        "properties": {
                            "merchant": {"type": "string"},
                            "country": {"type": "string"},
                            "price": {"type": "number"},
                            "currency": {"type": "string"},
                            "url": {"type": "string"},
                            "note": {"type": "string"},
                        },
                        "required": ["merchant", "country", "price", "currency", "url", "note"],
                    },
                },
            },
            "required": ["market_price", "market_price_currency", "price_advice", "recommended_status", "market_note", "market_sources"],
        },
    }
    response, provider_source = create_ai_response(
        db,
        context,
        user_settings,
        model=user_settings.value_model,
        task_type="wishlist_value",
        system_prompt=(
            "You estimate a realistic market price for a wishlist wine. Return JSON only. Be conservative. "
            "Use live web search for current market prices. "
            "Provide 3-8 verified market sources with concrete URLs when possible, using an empty array if none can be cited reliably. "
            "Keep market_note concise and useful. "
            f"{value_currency_instruction(item.currency)} "
            f"{response_language_instruction(payload.locale)}"
        ),
        user_prompt=(
            f"Estimate the current market price for this exact wishlist item. "
            f"Final market_price and market_price_currency must be {item.currency}. "
            f"The user target price is {item.currency} {item.target_price}; use it only to evaluate opportunity after estimating market price independently. "
            "Use price_advice to compare the user target price with the estimated market price. "
            "For market_sources, list only concrete merchants or marketplaces with country, price, currency, and URL for the exact wine when available. "
            "Use market_note for a short availability or confidence comment.\n\n"
            f"{wishlist_context(item)}"
        ),
        json_schema=schema,
        web_search=True,
        charge_immediately=False,
    )
    extra_cost = web_search_tool_cost_usd(response.web_search_calls)
    result = parse_json_response(response.text)
    try:
        market_price = Decimal(str(result["market_price"])).quantize(Decimal("0.01"))
    except (InvalidOperation, KeyError) as exc:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail="AI returned invalid market price") from exc
    result_currency = str(result.get("market_price_currency") or item.currency)[:8]
    market_sources = normalize_market_sources(result.get("market_sources"), default_currency=result_currency, require_url=True)
    if not market_sources:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail="No verified live market price sources found")
    charge_ai_usage(
        db,
        context,
        provider_source,
        model=effective_response_model(response, user_settings.value_model),
        usage=response.usage,
        extra_cost_usd=extra_cost,
    )
    item.ai_market_price = max(market_price, Decimal("0"))
    item.ai_market_price_currency = result_currency
    item.status = str(result["recommended_status"] or item.status)[:32]
    item.ai_strategy = str(result["price_advice"])[:3000]
    note_entry = market_note_source(result.get("market_note") or result.get("price_advice"))
    audit_sources = market_sources + web_search_source_entries(response.web_sources) + ([note_entry] if note_entry else [])
    record_ai_audit(
        db,
        context,
        entity_type="wishlist",
        entity_id=item.id,
        feature="wishlist_target_price",
        model=effective_response_model(response, user_settings.value_model),
        summary=(
            f"Target {item.currency} {item.target_price} / "
            f"Market {item.ai_market_price_currency or item.currency} {item.ai_market_price}: {item.ai_strategy}"
        ),
        sources=audit_sources,
        usage=response.usage,
        provider_source=provider_source,
        extra_cost_usd=extra_cost,
    )
    db.commit()
    db.refresh(item)
    ai_dates = wishlist_ai_generated_dates(db, context, [item])
    return wishlist_response(item, ai_dates.get(item.id))


@router.post("/regional-gap-targets", response_model=RegionalGapTargetSuggestionResponse)
def suggest_regional_gap_targets(
    payload: RegionalGapTargetSuggestionRequest,
    db: Session = Depends(get_db),
    context: CurrentContext = Depends(require_write_context),
) -> RegionalGapTargetSuggestionResponse:
    user_settings = get_or_create_user_ai_settings(db, context)
    regions = [item.region for item in payload.current_allocation]
    schema = {
        "name": "regional_gap_targets",
        "schema": {
            "type": "object",
            "additionalProperties": False,
            "properties": {
                "rationale": {"type": "string"},
                "targets": {
                    "type": "array",
                    "items": {
                        "type": "object",
                        "additionalProperties": False,
                        "properties": {
                            "region": {"type": "string", "enum": regions},
                            "target_pct": {"type": "number", "minimum": 0, "maximum": 100},
                        },
                        "required": ["region", "target_pct"],
                    },
                },
            },
            "required": ["rationale", "targets"],
        },
    }
    profile_labels = {
        "investment": "investment value, liquidity, blue-chip depth, and long-term capital resilience",
        "readiness": "drinking readiness, usable maturity windows, and avoiding too much capital locked in bottles that are not ready",
        "daily": "everyday drinking usefulness, rotation, approachable pricing, and lower concentration risk",
        "balanced": "balanced allocation across investment quality, readiness, everyday usability, and regional diversification",
    }
    allocation_context = [
        {
            "region": item.region,
            "current_pct": float(item.current_pct),
            "value_chf": float(item.value_chf),
        }
        for item in payload.current_allocation
    ]
    response, provider_source = create_ai_response(
        db,
        context,
        user_settings,
        model=user_settings.wishlist_model,
        task_type="regional_gap_targets",
        system_prompt=(
            "You advise a private wine collector on regional portfolio allocation. Return JSON only. "
            "Return one target for every input region and no other regions. "
            "The target_pct values must sum to exactly 100. "
            "Do not recommend individual wines. Explain the allocation logic briefly. "
            f"{response_language_instruction(payload.locale)}"
        ),
        user_prompt=(
            f"Household cellar: {context.household.name}\n"
            f"Target profile: {payload.profile} ({profile_labels[payload.profile]}).\n\n"
            "Current regional allocation by value in CHF:\n"
            f"{allocation_context}\n\n"
            "Create target_pct values for the same regions only. "
            "Favor practical collector balance over theoretical perfection. Keep rationale concise."
        ),
        json_schema=schema,
    )
    result = parse_json_response(response.text)
    raw_targets = result.get("targets") if isinstance(result.get("targets"), list) else []
    target_by_region: dict[str, Decimal] = {}
    for item in raw_targets:
        if not isinstance(item, dict):
            continue
        region = str(item.get("region") or "")
        if region not in regions:
            continue
        try:
            target_by_region[region] = Decimal(str(item.get("target_pct") or 0))
        except (InvalidOperation, TypeError, ValueError):
            target_by_region[region] = Decimal("0")
    targets = [max(target_by_region.get(region, Decimal("0")), Decimal("0")) for region in regions]
    total = sum(targets, Decimal("0"))
    if total <= Decimal("0"):
        even = (Decimal("100") / Decimal(len(regions))).quantize(Decimal("0.01"))
        targets = [even for _ in regions]
        total = sum(targets, Decimal("0"))
    normalized: list[RegionalGapTarget] = []
    running = Decimal("0")
    for index, region in enumerate(regions):
        if index == len(regions) - 1:
            pct = max(Decimal("0"), Decimal("100") - running)
        else:
            pct = ((targets[index] / total) * Decimal("100")).quantize(Decimal("0.01"))
            running += pct
        normalized.append(RegionalGapTarget(region=region, target_pct=pct))
    charged_cost = billable_cost_usd(
        user_is_app_admin=context.user.is_app_admin,
        provider_source=provider_source,
        model=user_settings.wishlist_model,
        usage=response.usage,
    )
    suggestion = RegionalGapTargetSuggestionResponse(
        model=user_settings.wishlist_model,
        profile=payload.profile,
        rationale=str(result.get("rationale") or "").strip()[:1200],
        targets=normalized,
        estimated_cost_usd=charged_cost,
    )
    record_ai_audit(
        db,
        context,
        entity_type="household",
        entity_id=context.household.id,
        feature="regional_gap_targets",
        model=user_settings.wishlist_model,
        summary=f"{payload.profile}: {suggestion.rationale}",
        sources=[{"kind": "regional_gap_targets", "profile": payload.profile, "targets": [target.model_dump(mode="json") for target in normalized]}],
        usage=response.usage,
        provider_source=provider_source,
    )
    db.commit()
    return suggestion


@router.post("/wishlist/portfolio-strategy", response_model=WishlistPortfolioStrategyResponse)
def generate_wishlist_portfolio_strategy(
    payload: WishlistPortfolioStrategyRequest = WishlistPortfolioStrategyRequest(),
    db: Session = Depends(get_db),
    context: CurrentContext = Depends(require_write_context),
) -> WishlistPortfolioStrategyResponse:
    user_settings = get_or_create_user_ai_settings(db, context)
    wishlist_list = (
        get_household_wishlist_list(db, context, payload.wishlist_list_id)
        if payload.wishlist_list_id
        else get_or_create_default_wishlist_list(db, context)
    )
    items = list(
        db.scalars(
            select(WishlistItem)
            .where(
                WishlistItem.household_id == context.household.id,
                WishlistItem.wishlist_list_id == wishlist_list.id,
            )
            .order_by(WishlistItem.name),
        ),
    )
    if not items:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Wishlist is empty")
    schema = {
        "name": "wishlist_portfolio_strategy",
        "schema": {
            "type": "object",
            "additionalProperties": False,
            "properties": {
                "overview": {"type": "string"},
                "buy_now": {"type": "string"},
                "wait_watch": {"type": "string"},
                "allocation": {"type": "string"},
                "next_step": {"type": "string"},
            },
            "required": ["overview", "buy_now", "wait_watch", "allocation", "next_step"],
        },
    }
    response, provider_source = create_ai_response(
        db,
        context,
        user_settings,
        model=user_settings.wishlist_model,
        task_type="portfolio_strategy",
        system_prompt=(
            "You are a disciplined private wine buying advisor working at the portfolio level. Return JSON only. "
            "You are advising a serious collector, not a casual shopper. "
            "Be concrete, concise, and decision-oriented. "
            "Assume capital is finite and the collector wants to prioritize well. "
            "Use the actual wine names when useful. Do not invent missing facts; acknowledge uncertainty briefly when necessary. "
            f"{response_language_instruction(payload.locale)}"
        ),
        user_prompt=(
            f"Build a practical buying strategy for this wishlist portfolio named '{wishlist_list.name}'.\n\n"
            "Return:\n"
            "- overview: short summary of the current wishlist posture and what stands out\n"
            "- buy_now: which items deserve priority now and why\n"
            "- wait_watch: which items should be monitored, repriced, or deferred\n"
            "- allocation: how the collector should think about capital allocation across the wishlist\n"
            "- next_step: one concise operational next step\n\n"
            f"{wishlist_portfolio_context(items, context.household.name)}"
        ),
        json_schema=schema,
    )
    result = parse_json_response(response.text)
    charged_cost = billable_cost_usd(
        user_is_app_admin=context.user.is_app_admin,
        provider_source=provider_source,
        model=user_settings.wishlist_model,
        usage=response.usage,
    )
    strategy_response = WishlistPortfolioStrategyResponse(
        model=user_settings.wishlist_model,
        overview=str(result.get("overview") or "").strip(),
        buy_now=str(result.get("buy_now") or "").strip(),
        wait_watch=str(result.get("wait_watch") or "").strip(),
        allocation=str(result.get("allocation") or "").strip(),
        next_step=str(result.get("next_step") or "").strip(),
        wishlist_list_id=wishlist_list.id,
        wishlist_list_name=wishlist_list.name,
        item_count=len(items),
        generated_at=datetime.now(timezone.utc),
        estimated_cost_usd=charged_cost,
    )
    record_ai_audit(
        db,
        context,
        entity_type="household",
        entity_id=context.household.id,
        feature="wishlist_portfolio_strategy",
        model=user_settings.wishlist_model,
        summary=f"{strategy_response.overview} Next: {strategy_response.next_step}",
        sources=[
            {
                "kind": "wishlist_portfolio_strategy",
                "overview": strategy_response.overview,
                "buy_now": strategy_response.buy_now,
                "wait_watch": strategy_response.wait_watch,
                "allocation": strategy_response.allocation,
                "next_step": strategy_response.next_step,
                "wishlist_list_id": str(wishlist_list.id),
                "wishlist_list_name": wishlist_list.name,
                "item_count": len(items),
            },
        ],
        usage=response.usage,
        provider_source=provider_source,
    )
    db.commit()
    return strategy_response
