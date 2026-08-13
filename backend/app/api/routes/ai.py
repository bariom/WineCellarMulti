from __future__ import annotations

import json
import math
import re
import unicodedata
from dataclasses import replace
from datetime import UTC, date, datetime
from decimal import ROUND_FLOOR, Decimal, InvalidOperation
from difflib import SequenceMatcher
from typing import Any, cast
from uuid import UUID, uuid4
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import CurrentContext, require_write_context
from app.api.routes.billing import stripe_ai_credit_amount
from app.api.routes.wines import (
    get_household_wine,
    record_wine_value_history,
    user_can_see_wine,
    user_tag_names_by_wine,
    wine_response,
    wine_value_history_by_wine,
)
from app.api.routes.wishlist import (
    get_household_wishlist_item,
    get_household_wishlist_list,
    get_or_create_default_wishlist_list,
    wishlist_ai_generated_dates,
    wishlist_response,
)
from app.core.config import settings
from app.core.crypto import decrypt_secret, encrypt_secret
from app.core.wine_types import normalize_wine_type
from app.db.session import get_db
from app.models import (
    AiAuditLog,
    AppAiPricing,
    CellarAiCommand,
    User,
    UserAiCreditTransaction,
    UserAiSettings,
    Wine,
    WineTastingEntry,
    WishlistItem,
)
from app.prompts import (
    ai_notes_prompt,
    cellar_command_prompt,
    drink_window_prompt,
    grape_composition_prompt,
    wine_full_enrichment_prompt,
    wine_scores_prompt,
    wine_value_prompt,
    wishlist_advice_prompt,
    wishlist_purpose_prompt,
    wishlist_value_prompt,
)
from app.schemas.ai import (
    AiAuditLogResponse,
    AiGenerationRequest,
    AiSettingsResponse,
    AiSettingsUpdate,
    AiUsageBucket,
    AiUsageResponse,
    BuyingAdviceRequest,
    BuyingAdviceResponse,
    BuyingRecommendation,
    CellarCommandEnjoyment,
    CellarCommandExecuteRequest,
    CellarCommandRequest,
    CellarCommandResponse,
    CellarCommandStatus,
    CellarCommandTasting,
    CellarCommandWineCandidate,
    PairingCellarMatch,
    PairingDishRecommendation,
    PairingMarketWine,
    PairingRequest,
    PairingResponse,
    RegionalGapTarget,
    RegionalGapTargetSuggestionRequest,
    RegionalGapTargetSuggestionResponse,
    TastingReflectionRequest,
    TastingReflectionResponse,
    WineCompareRequest,
    WineCompareResponse,
    WineLabelEnrichmentRequest,
    WineLabelEnrichmentResponse,
    WishlistPortfolioStrategyRequest,
    WishlistPortfolioStrategyResponse,
)
from app.schemas.wine import WineResponse
from app.schemas.wishlist import WishlistResponse
from app.services.ai_credits import (
    ZERO_USD,
    ai_credit_balance,
    create_ai_credit_transaction,
    quantize_usd,
)
from app.services.ai_models import parameters_for_model
from app.services.openai_client import TokenUsage, create_response, parse_json_response
from app.services.shared_wine_data import (
    SHARED_FEATURES,
    apply_shared_fact,
    get_shared_fact,
    hydrate_wine_from_shared,
    mark_local_feature,
    publish_shared_fact,
)
from app.services.wine_consumption import (
    NoBottlesAvailableError,
    normalize_tasting_history,
    record_wine_consumption,
)

router = APIRouter(prefix="/ai")

LEGACY_MODEL_OPTIONS = ["gpt-5.4-nano", "gpt-5.4-mini", "gpt-5.4", "gpt-5.5"]
GPT56_MODEL_OPTIONS = ["gpt-5.6-luna", "gpt-5.6-terra", "gpt-5.6-sol"]
AI_PROVIDER_OPTIONS = ["auto", "user_key", "credits"]
MODEL_FIELDS = ["ai_notes_model", "drink_window_model", "value_model", "grape_model", "score_model", "wishlist_model", "pairing_model"]
GPT56_DEFAULT_ROLE_BY_FIELD = {
    "ai_notes_model": "economy",
    "drink_window_model": "balanced",
    "value_model": "economy",
    "grape_model": "economy",
    "score_model": "economy",
    "wishlist_model": "balanced",
    "pairing_model": "economy",
}
PAIRING_MAX_CANDIDATES = 25
DEFAULT_MODEL_PRICING_USD_PER_MILLION_TOKENS = {
    "gpt-5.4-nano": {"input": Decimal("0.20"), "cached_input": Decimal("0.02"), "output": Decimal("1.25")},
    "gpt-5.4-mini": {"input": Decimal("0.75"), "cached_input": Decimal("0.075"), "output": Decimal("4.50")},
    "gpt-5.4": {"input": Decimal("2.50"), "cached_input": Decimal("0.25"), "output": Decimal("15.00")},
    "gpt-5.5": {"input": Decimal("5.00"), "cached_input": Decimal("0.50"), "output": Decimal("30.00")},
    "gpt-5.6-luna": {"input": Decimal("0.20"), "cached_input": Decimal("0.02"), "output": Decimal("1.20")},
    "gpt-5.6-terra": {"input": Decimal("2.00"), "cached_input": Decimal("0.20"), "output": Decimal("12.00")},
    "gpt-5.6-sol": {"input": Decimal("5.00"), "cached_input": Decimal("0.50"), "output": Decimal("30.00")},
}


def model_pricing_usd_per_million_tokens(db: Session | None = None) -> dict[str, dict[str, Decimal]]:
    """Return the default price book extended by operator-supplied JSON rates.

    The optional OPENAI_MODEL_PRICING_USD_PER_MILLION_TOKENS value accepts a
    JSON object keyed by model name. Each rate must contain non-negative
    ``input``, ``cached_input``, and ``output`` USD-per-million-token values.
    It can update an existing model or add a newly released one.
    """
    pricing = {model: dict(rates) for model, rates in DEFAULT_MODEL_PRICING_USD_PER_MILLION_TOKENS.items()}
    raw_overrides = str(settings.openai_model_pricing_usd_per_million_tokens or "").strip()
    if db is not None:
        app_pricing = db.get(AppAiPricing, 1)
        if app_pricing is not None and app_pricing.price_book_json.strip():
            raw_overrides = app_pricing.price_book_json.strip()
    if not raw_overrides:
        return pricing
    try:
        overrides = json.loads(raw_overrides)
    except json.JSONDecodeError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="AI pricing configuration is invalid",
        ) from exc
    if not isinstance(overrides, dict):
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="AI pricing configuration is invalid")

    for model, rates in overrides.items():
        if not isinstance(model, str) or not model.strip() or not isinstance(rates, dict):
            raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="AI pricing configuration is invalid")
        try:
            normalized_rates = {field: Decimal(str(rates[field])) for field in ("input", "cached_input", "output")}
        except (KeyError, InvalidOperation, TypeError, ValueError) as exc:
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="AI pricing configuration is invalid",
            ) from exc
        if any(rate < Decimal("0") or not rate.is_finite() for rate in normalized_rates.values()):
            raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="AI pricing configuration is invalid")
        pricing[model.strip()] = normalized_rates
    return pricing


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


def request_model(payload: AiGenerationRequest, configured_model: str) -> str:
    """Apply a model override to one request without changing user settings."""
    return validate_model(payload.model) if payload.model else configured_model


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
            score_model=default_model_for_field("score_model"),
            wishlist_model=default_model_for_field("wishlist_model"),
            pairing_model=default_model_for_field("pairing_model"),
            model_advisor_enabled=False,
            pairing_preferences="",
            pairing_candidate_limit=PAIRING_MAX_CANDIDATES,
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
        can_use_included_wine_search=bool(settings.openai_api_key.strip()),
        ai_notes_model=user_settings.ai_notes_model,
        drink_window_model=user_settings.drink_window_model,
        value_model=user_settings.value_model,
        grape_model=user_settings.grape_model,
        score_model=user_settings.score_model,
        wishlist_model=user_settings.wishlist_model,
        pairing_model=user_settings.pairing_model,
        model_advisor_enabled=user_settings.model_advisor_enabled,
        pairing_preferences=user_settings.pairing_preferences or "",
        pairing_candidate_limit=user_settings.pairing_candidate_limit,
        model_options=available_model_options(),
    )


def clip_summary(value: str, limit: int = 900) -> str:
    text = " ".join(str(value or "").split())
    return text[:limit]


def pricing_for_model(model: str, db: Session | None = None) -> dict[str, Decimal]:
    # The Responses API/dashboard may expose a dated snapshot even when the
    # request used an alias (for example gpt-5.5-2026-04-23). Price snapshots
    # with the same published base-model rate instead of silently returning 0.
    price_book = model_pricing_usd_per_million_tokens(db)
    pricing = price_book.get(model)
    if pricing is None:
        matching_models = [name for name in price_book if model.startswith(f"{name}-")]
        if matching_models:
            pricing = price_book[max(matching_models, key=len)]
    if pricing is None:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=f"AI pricing is not configured for model {model}",
        )
    return pricing


def reservation_pricing_model(model: str, db: Session | None = None) -> str:
    candidates = [model]
    if model.startswith("gpt-5.6"):
        candidates.append(settings.openai_fallback_model)
    priced_candidates = [(candidate, pricing_for_model(candidate, db)) for candidate in candidates]
    return max(priced_candidates, key=lambda item: item[1]["input"] + item[1]["output"])[0]


def estimate_cost_usd(model: str, usage: TokenUsage, db: Session | None = None) -> Decimal:
    pricing = pricing_for_model(model, db)
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


def maximum_billable_cost_usd(
    *,
    user_is_app_admin: bool,
    provider_source: str,
    model: str,
    input_tokens: int,
    output_tokens: int,
    web_search_calls: int,
    db: Session | None = None,
) -> Decimal:
    usage = TokenUsage(
        input_tokens=max(input_tokens, 0),
        output_tokens=max(output_tokens, 0),
        total_tokens=max(input_tokens, 0) + max(output_tokens, 0),
    )
    return billable_cost_usd(
        user_is_app_admin=user_is_app_admin,
        provider_source=provider_source,
        model=model,
        usage=usage,
        extra_cost_usd=web_search_tool_cost_usd(web_search_calls), db=db,
    )


def reserve_ai_credits(
    db: Session,
    context: CurrentContext,
    *,
    model: str,
    system_prompt: str,
    user_prompt: str,
    json_schema: dict[str, Any] | None,
    max_output_tokens: int,
    web_search: bool,
    max_tool_calls: int,
    input_image_count: int = 0,
) -> tuple[UUID, Decimal, int]:
    # Lock the user as the synchronization point for this append-only ledger.
    # Every AI reservation is committed before contacting the provider, so two
    # concurrent requests cannot authorize themselves against the same funds.
    db.scalar(select(User).where(User.id == context.user.id).with_for_update())
    balance = ai_credit_balance(db, context.user)
    if balance <= ZERO_USD:
        raise HTTPException(status_code=status.HTTP_402_PAYMENT_REQUIRED, detail="AI credits exhausted")

    schema_size = len(str(json_schema or {}))
    prompt_token_budget = max(math.ceil((len(system_prompt) + len(user_prompt) + schema_size) / 2), 2048)
    if web_search:
        # Search result context is provider-controlled. Keep a conservative
        # allowance in addition to the separately billed tool calls.
        prompt_token_budget += 32768
    # Vision tokenization varies with image size and model. Reserve a
    # conservative allowance per image, then refund the unused amount from the
    # provider's actual usage after the response completes.
    prompt_token_budget += max(input_image_count, 0) * 32768

    desired_cost = maximum_billable_cost_usd(
        user_is_app_admin=context.user.is_app_admin,
        provider_source="credits",
        model=model,
        input_tokens=prompt_token_budget,
        output_tokens=max_output_tokens,
        web_search_calls=max_tool_calls if web_search else 0,
        db=db,
    )
    effective_max_output_tokens = max_output_tokens
    reserved_cost = desired_cost

    if desired_cost > balance:
        pricing = pricing_for_model(model, db)
        markup_multiplier = Decimal("1") if context.user.is_app_admin else Decimal("1") + (ai_pack_markup_percent() / Decimal("100"))
        fixed_cost = maximum_billable_cost_usd(
            user_is_app_admin=context.user.is_app_admin,
            provider_source="credits",
            model=model,
            input_tokens=prompt_token_budget,
            output_tokens=0,
            web_search_calls=max_tool_calls if web_search else 0,
            db=db,
        )
        available_for_output = balance - fixed_cost
        if available_for_output <= ZERO_USD:
            raise HTTPException(status_code=status.HTTP_402_PAYMENT_REQUIRED, detail="Insufficient AI credits for this request")
        affordable_output_tokens = int(
            ((available_for_output * Decimal("1000000")) / (pricing["output"] * markup_multiplier)).to_integral_value(rounding=ROUND_FLOOR)
        )
        effective_max_output_tokens = min(max_output_tokens, affordable_output_tokens)
        if effective_max_output_tokens < 512:
            raise HTTPException(status_code=status.HTTP_402_PAYMENT_REQUIRED, detail="Insufficient AI credits for this request")
        reserved_cost = maximum_billable_cost_usd(
            user_is_app_admin=context.user.is_app_admin,
            provider_source="credits",
            model=model,
            input_tokens=prompt_token_budget,
            output_tokens=effective_max_output_tokens,
            web_search_calls=max_tool_calls if web_search else 0,
            db=db,
        )

    reservation_id = uuid4()
    create_ai_credit_transaction(
        db,
        context.user,
        amount_usd=-reserved_cost,
        source="usage_reservation",
        source_id=reservation_id,
        note=f"Reserved {model} usage for {context.household.name}",
    )
    db.commit()
    return reservation_id, reserved_cost, effective_max_output_tokens


def reconcile_ai_credit_reservation(
    db: Session,
    context: CurrentContext,
    *,
    reservation_id: UUID,
    reserved_cost: Decimal,
    actual_cost: Decimal,
    model: str,
) -> None:
    if actual_cost > reserved_cost:
        # This should be unreachable because the reservation includes a large
        # input allowance and the provider receives the affordable output cap.
        # Refuse to create a negative balance instead of silently overbilling.
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="AI usage exceeded its reserved budget")
    refund = quantize_usd(reserved_cost - actual_cost)
    if refund > ZERO_USD:
        create_ai_credit_transaction(
            db,
            context.user,
            amount_usd=refund,
            source="usage_refund",
            source_id=reservation_id,
            note=f"Unused {model} AI reservation",
        )
    db.commit()


def cancel_ai_credit_reservation(db: Session, context: CurrentContext, *, reservation_id: UUID, reserved_cost: Decimal, model: str) -> None:
    create_ai_credit_transaction(
        db,
        context.user,
        amount_usd=reserved_cost,
        source="usage_refund",
        source_id=reservation_id,
        note=f"Cancelled {model} AI reservation",
    )
    db.commit()


def billable_cost_usd(*, user_is_app_admin: bool, provider_source: str, model: str, usage: TokenUsage, extra_cost_usd: Decimal = Decimal("0"), db: Session | None = None) -> Decimal:
    base_cost = quantize_usd(estimate_cost_usd(model, usage, db) + extra_cost_usd)
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
    web_search_use_default_location: bool = True,
    web_search_context_size: str | None = None,
    reasoning_effort: str | None = None,
    max_output_tokens: int | None = None,
    max_tool_calls: int | None = None,
    task_type: str = "sommelier",
    complexity: str | None = None,
    app_funded: bool = False,
    input_images: list[tuple[str, bytes]] | None = None,
    timeout_seconds: float | None = None,
) -> tuple[Any, str]:
    if app_funded:
        api_key = settings.openai_api_key.strip()
        if not api_key:
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="Application OpenAI API key is not configured",
            )
        provider_source = "application"
    else:
        provider_source, api_key = select_ai_provider(db, context, user_settings)
    # A per-feature model selected in Settings is an explicit user preference.
    # Routing remains the fallback only when a caller deliberately provides no model.
    requested_model = model
    if (
        requested_model
        and requested_model not in available_model_options()
        and not (
            task_type == "cellar_command"
            and requested_model == settings.openai_cellar_command_model.strip()
        )
    ):
        requested_model = ""
    effective_tool_limit = max_tool_calls if max_tool_calls is not None else (4 if web_search else 0)
    configured_limit = max_output_tokens if max_output_tokens is not None else parameters_for_model(requested_model or model).max_output_tokens
    effective_output_limit = min(max(int(configured_limit or 32768), 1), 32768)
    reservation_id: UUID | None = None
    reserved_cost = ZERO_USD
    if provider_source == "credits":
        reservation_model = reservation_pricing_model(requested_model or model, db)
        reservation_id, reserved_cost, effective_output_limit = reserve_ai_credits(
            db,
            context,
            model=reservation_model,
            system_prompt=system_prompt,
            user_prompt=user_prompt,
            json_schema=json_schema,
            max_output_tokens=effective_output_limit,
            web_search=web_search,
            max_tool_calls=effective_tool_limit,
            input_image_count=len(input_images or []),
        )
    try:
        response = create_response(
            requested_model,
            system_prompt,
            user_prompt,
            api_key=api_key,
            json_schema=json_schema,
            web_search=web_search,
            web_search_use_default_location=web_search_use_default_location,
            web_search_context_size=web_search_context_size,
            reasoning_effort=reasoning_effort,
            max_output_tokens=effective_output_limit,
            max_tool_calls=effective_tool_limit or None,
            task_type=task_type,
            complexity=complexity,
            input_images=input_images,
            timeout_seconds=timeout_seconds,
        )
        actual_cost = billable_cost_usd(
            user_is_app_admin=context.user.is_app_admin,
            provider_source=provider_source,
            model=response.model or model,
            usage=response.usage,
            extra_cost_usd=web_search_tool_cost_usd(response.web_search_calls),
            db=db,
        )
        if reservation_id is not None:
            reconcile_ai_credit_reservation(
                db,
                context,
                reservation_id=reservation_id,
                reserved_cost=reserved_cost,
                actual_cost=actual_cost,
                model=response.model or model,
            )
        response = replace(response, charged_cost_usd=actual_cost)
    except Exception:
        if reservation_id is not None:
            # Reconcile only if the normal success path did not already commit
            # the refund; a committed reservation has a positive refund row.
            refund_exists = db.scalar(
                select(UserAiCreditTransaction).where(
                    UserAiCreditTransaction.source_id == reservation_id,
                    UserAiCreditTransaction.source == "usage_refund",
                )
            )
            if refund_exists is None:
                cancel_ai_credit_reservation(db, context, reservation_id=reservation_id, reserved_cost=reserved_cost, model=requested_model or model)
        raise
    return response, provider_source


def record_ai_audit(
    db: Session,
    context: CurrentContext,
    *,
    entity_type: str,
    entity_id: UUID,
    feature: str,
    model: str,
    summary: str,
    reasoning_effort: str = "",
    sources: list[dict] | None = None,
    usage: TokenUsage | None = None,
    provider_source: str = "user_key",
    extra_cost_usd: Decimal = Decimal("0"),
) -> None:
    token_usage = usage or TokenUsage()
    if provider_source == "shared_cache":
        base_cost = ZERO_USD
        billed_cost = ZERO_USD
    else:
        base_cost = quantize_usd(estimate_cost_usd(model, token_usage, db) + extra_cost_usd)
        billed_cost = billable_cost_usd(
            user_is_app_admin=context.user.is_app_admin,
            provider_source=provider_source,
            model=model,
            usage=token_usage,
            extra_cost_usd=extra_cost_usd,
            db=db,
        )
    source_metadata: dict[str, str] = {"provider_source": provider_source}
    if provider_source == "application":
        source_metadata["funded_by"] = "application"
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
            reasoning_effort=reasoning_effort,
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


def reuse_shared_wine_feature(
    db: Session,
    context: CurrentContext,
    wine: Wine,
    feature: str,
    *,
    locale: str,
    force_refresh: bool,
) -> bool:
    if force_refresh or feature not in SHARED_FEATURES:
        return False
    hydrated = hydrate_wine_from_shared(db, wine, locale=locale)
    fact = get_shared_fact(db, wine, feature, locale=locale)
    if fact is None:
        return False
    changed = apply_shared_fact(wine, fact, only_missing=False)
    if feature == "scores" and not changed and feature not in hydrated:
        return False
    if feature == "value" and (changed or feature in hydrated):
        record_wine_value_history(db, wine, source="shared")
    record_ai_audit(
        db,
        context,
        entity_type="wine",
        entity_id=wine.id,
        feature=f"shared_{feature}",
        model=fact.model or default_model_for_field("ai_notes_model"),
        summary=f"Reused Vinaris data for {feature}",
        sources=(fact.sources or []) + [
            {
                "kind": "shared_data",
                "verified_at": fact.verified_at.isoformat(),
                "expires_at": fact.expires_at.isoformat() if fact.expires_at else "",
            }
        ],
        provider_source="shared_cache",
    )
    db.commit()
    db.refresh(wine)
    return True


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
        return value.replace(tzinfo=UTC)
    return value.astimezone(UTC)


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
    now = datetime.now(UTC)
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
    if payload.model_advisor_enabled is not None:
        user_settings.model_advisor_enabled = payload.model_advisor_enabled
    if payload.pairing_candidate_limit is not None:
        user_settings.pairing_candidate_limit = payload.pairing_candidate_limit
    user_settings.updated_at = datetime.now(UTC)
    db.commit()
    db.refresh(user_settings)
    return ai_settings_response(db, context, user_settings)


def normalize_cellar_command_identity(value: str) -> str:
    normalized = unicodedata.normalize("NFKD", value.casefold())
    return " ".join(
        "".join(character for character in normalized if not unicodedata.combining(character))
        .replace("'", " ")
        .replace("’", " ")
        .split()
    )


def cellar_command_match_score(parsed: dict[str, Any], wine: Wine) -> float:
    query = normalize_cellar_command_identity(str(parsed.get("wine_name") or ""))
    if not query:
        return 0
    name = normalize_cellar_command_identity(wine.name)
    producer = normalize_cellar_command_identity(wine.producer)
    combined = " ".join(part for part in (name, producer) if part)
    vintage = str(parsed.get("vintage") or "").strip().casefold()
    if vintage and wine.vintage.strip().casefold() != vintage:
        return 0
    requested_producer = normalize_cellar_command_identity(str(parsed.get("producer") or ""))
    if requested_producer and requested_producer not in producer and producer not in requested_producer:
        if SequenceMatcher(None, requested_producer, producer).ratio() < 0.78:
            return 0
    requested_format = normalize_cellar_command_identity(str(parsed.get("format") or ""))
    wine_format = normalize_cellar_command_identity(wine.format)
    if requested_format and requested_format not in wine_format and wine_format not in requested_format:
        return 0

    if query == name:
        score = 100.0
    elif query == producer:
        score = 88.0
    elif query in name or name in query:
        score = 82.0
    elif query in combined:
        score = 76.0
    else:
        score = SequenceMatcher(None, query, name).ratio() * 72.0
    if vintage:
        score += 25.0
    if requested_producer:
        score += 12.0
    if requested_format:
        score += 8.0
    return score


def cellar_command_candidate(wine: Wine) -> CellarCommandWineCandidate:
    return CellarCommandWineCandidate(
        wine_id=wine.id,
        name=wine.name,
        producer=wine.producer,
        vintage=wine.vintage,
        format=wine.format,
        quantity=wine.quantity,
    )


def matching_cellar_command_wines(
    db: Session, context: CurrentContext, parsed: dict[str, Any]
) -> list[tuple[Wine, float]]:
    wines = list(
        db.scalars(select(Wine).where(Wine.household_id == context.household.id))
    )
    ranked = [
        (wine, cellar_command_match_score(parsed, wine))
        for wine in wines
        if wine.quantity > 0 and user_can_see_wine(context, wine)
    ]
    return sorted(
        ((wine, score) for wine, score in ranked if score >= 65),
        key=lambda item: (-item[1], item[0].name.casefold(), item[0].vintage),
    )[:5]


def cellar_command_tasting(parsed: dict[str, Any]) -> CellarCommandTasting:
    score_present = bool(parsed.get("score_present"))
    return CellarCommandTasting(
        consumed_at=str(parsed.get("consumed_at") or ""),
        note=str(parsed.get("note") or "").strip(),
        score_value=Decimal(str(parsed.get("score_value") or 0)) if score_present else None,
        score_scale=int(parsed.get("score_scale") or 0) if score_present else None,
        enjoyment=cast(CellarCommandEnjoyment, str(parsed.get("enjoyment") or "")),
        occasion=str(parsed.get("occasion") or "").strip(),
        pairing=str(parsed.get("pairing") or "").strip(),
        companions=str(parsed.get("companions") or "").strip(),
    )


def cellar_command_response(
    db: Session,
    context: CurrentContext,
    command: CellarAiCommand,
    *,
    message: str | None = None,
) -> CellarCommandResponse:
    parsed = command.parsed_payload or {}
    ranked = (
        matching_cellar_command_wines(db, context, parsed)
        if command.status == "needs_confirmation"
        else []
    )
    matched = db.get(Wine, command.matched_wine_id) if command.matched_wine_id else None
    localized_message = message or {
        "processing": "Comando in elaborazione.",
        "needs_confirmation": "Scegli la bottiglia da aggiornare.",
        "not_found": "Non trovo una bottiglia disponibile corrispondente.",
        "unsupported": "Questo comando non è ancora supportato.",
        "executed": "Aggiornamento già eseguito.",
        "undone": "Aggiornamento annullato.",
        "failed": "Non sono riuscito a interpretare il comando.",
    }.get(command.status, "Comando elaborato.")
    return CellarCommandResponse(
        command_id=command.id,
        status=cast(CellarCommandStatus, command.status),
        intent=command.intent,
        message=localized_message,
        candidates=[cellar_command_candidate(wine) for wine, _ in ranked],
        matched_wine=cellar_command_candidate(matched) if matched is not None else None,
        tasting=cellar_command_tasting(parsed) if command.intent == "consume_wine" else None,
        previous_quantity=command.previous_quantity,
        new_quantity=matched.quantity if matched is not None else None,
        model=command.model,
        estimated_cost_usd=command.estimated_cost_usd,
    )


def parsed_cellar_command_date(parsed: dict[str, Any], local_today: date) -> date:
    raw_date = str(parsed.get("consumed_at") or "").strip()
    if not raw_date:
        return local_today
    try:
        consumed_at = date.fromisoformat(raw_date)
    except ValueError as error:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="The cellar command contains an invalid consumption date",
        ) from error
    if consumed_at > local_today:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="A consumed bottle cannot have a future date",
        )
    return consumed_at


def execute_cellar_ai_command(
    db: Session,
    context: CurrentContext,
    command: CellarAiCommand,
    wine_id: UUID,
    *,
    local_today: date,
) -> CellarCommandResponse:
    if command.status not in {"needs_confirmation", "not_found"}:
        if command.status == "executed":
            return cellar_command_response(db, context, command, message="Comando già eseguito.")
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Command cannot be executed")
    wine = db.scalar(
        select(Wine)
        .where(Wine.id == wine_id, Wine.household_id == context.household.id)
        .with_for_update()
    )
    if wine is None or not user_can_see_wine(context, wine):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Wine not found")
    if cellar_command_match_score(command.parsed_payload or {}, wine) < 65:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Selected wine does not match the command",
        )
    tasting = cellar_command_tasting(command.parsed_payload or {})
    try:
        result = record_wine_consumption(
            db,
            wine,
            consumed_at=parsed_cellar_command_date(command.parsed_payload or {}, local_today),
            note=tasting.note,
            score_value=tasting.score_value,
            score_scale=tasting.score_scale,
            enjoyment=tasting.enjoyment,
            occasion=tasting.occasion,
            pairing=tasting.pairing,
            companions=tasting.companions,
            source="ai_command",
            source_text=command.raw_text,
            created_by_user_id=context.user.id,
        )
    except NoBottlesAvailableError as error:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(error)) from error
    command.status = "executed"
    command.matched_wine_id = wine.id
    command.tasting_id = result.tasting_id
    command.previous_quantity = result.previous_quantity
    command.previous_status = result.previous_status
    command.previous_rating = result.previous_rating
    command.executed_at = datetime.now(UTC)
    db.commit()
    db.refresh(command)
    db.refresh(wine)
    score_label = (
        f", {tasting.score_value:g}/{tasting.score_scale}"
        if tasting.score_value is not None and tasting.score_scale
        else ""
    )
    message = (
        f"Fatto. {wine.name} {wine.vintage}: {result.previous_quantity} → {wine.quantity} "
        f"bottiglie. Degustazione registrata il {tasting.consumed_at}{score_label}."
    )
    return cellar_command_response(db, context, command, message=message)


CELLAR_COMMAND_SCHEMA = {
    "name": "cellar_command",
    "schema": {
        "type": "object",
        "additionalProperties": False,
        "properties": {
            "intent": {"type": "string", "enum": ["consume_wine", "unsupported"]},
            "explicit_action": {"type": "boolean"},
            "wine_name": {"type": "string"},
            "producer": {"type": "string"},
            "vintage": {"type": "string"},
            "format": {"type": "string"},
            "quantity": {"type": "integer", "const": 1},
            "consumed_at": {"type": "string"},
            "note": {"type": "string"},
            "score_present": {"type": "boolean"},
            "score_value": {"type": "number", "minimum": 0, "maximum": 100},
            "score_scale": {"type": "integer", "minimum": 0, "maximum": 100},
            "enjoyment": {"type": "string", "enum": ["", "positive", "negative"]},
            "occasion": {"type": "string"},
            "pairing": {"type": "string"},
            "companions": {"type": "string"},
        },
        "required": [
            "intent", "explicit_action", "wine_name", "producer", "vintage", "format",
            "quantity", "consumed_at", "note", "score_present", "score_value",
            "score_scale", "enjoyment", "occasion", "pairing", "companions",
        ],
    },
}


@router.post("/cellar-commands", response_model=CellarCommandResponse)
def create_cellar_ai_command(
    payload: CellarCommandRequest,
    db: Session = Depends(get_db),
    context: CurrentContext = Depends(require_write_context),
) -> CellarCommandResponse:
    existing = db.get(CellarAiCommand, payload.request_id)
    if existing is not None:
        if existing.household_id != context.household.id:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Request ID already used")
        return cellar_command_response(db, context, existing)
    try:
        timezone = ZoneInfo(payload.timezone)
    except ZoneInfoNotFoundError as error:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Invalid timezone") from error
    local_today = datetime.now(timezone).date()
    command = CellarAiCommand(
        id=payload.request_id,
        household_id=context.household.id,
        user_id=context.user.id,
        raw_text=payload.text.strip(),
        status="processing",
        parsed_payload={},
    )
    db.add(command)
    db.commit()
    user_settings = get_or_create_user_ai_settings(db, context)
    prompt = cellar_command_prompt(
        locale=payload.locale,
        command_text=payload.text,
        local_date=local_today.isoformat(),
        timezone=payload.timezone,
    )
    try:
        response, provider_source = create_ai_response(
            db,
            context,
            user_settings,
            model=settings.openai_cellar_command_model,
            task_type="cellar_command",
            system_prompt=prompt.system,
            user_prompt=prompt.user,
            json_schema=CELLAR_COMMAND_SCHEMA,
            reasoning_effort="none",
            max_output_tokens=600,
        )
        parsed = parse_json_response(response.text)
    except Exception:
        command.status = "failed"
        db.commit()
        raise

    if not str(parsed.get("consumed_at") or "").strip():
        parsed["consumed_at"] = local_today.isoformat()
    command.intent = str(parsed.get("intent") or "unsupported")
    command.parsed_payload = parsed
    command.model = response.model or settings.openai_cellar_command_model
    command.reasoning_effort = response.reasoning_effort or "none"
    command.estimated_cost_usd = response.charged_cost_usd
    score_present = bool(parsed.get("score_present"))
    score_value = Decimal(str(parsed.get("score_value") or 0))
    score_scale = int(parsed.get("score_scale") or 0)
    if score_present and (score_scale <= 0 or score_value > score_scale):
        command.status = "failed"
        db.commit()
        return cellar_command_response(
            db, context, command, message="Il punteggio indicato non è valido."
        )
    record_ai_audit(
        db,
        context,
        entity_type="cellar_command",
        entity_id=command.id,
        feature="cellar_command_interpretation",
        model=command.model,
        reasoning_effort=command.reasoning_effort,
        summary=f"{command.intent}: {str(parsed.get('wine_name') or '')[:120]}",
        usage=response.usage,
        provider_source=provider_source,
    )
    if command.intent != "consume_wine":
        command.status = "unsupported"
        db.commit()
        return cellar_command_response(
            db,
            context,
            command,
            message="Per ora posso registrare soltanto il consumo di una bottiglia.",
        )
    ranked = matching_cellar_command_wines(db, context, parsed)
    if not ranked:
        command.status = "not_found"
        db.commit()
        return cellar_command_response(
            db, context, command, message="Non trovo una bottiglia disponibile corrispondente."
        )
    best_wine, best_score = ranked[0]
    clear_lead = len(ranked) == 1 or best_score - ranked[1][1] >= 20
    command.status = "needs_confirmation"
    db.commit()
    if bool(parsed.get("explicit_action")) and best_score >= 100 and clear_lead:
        return execute_cellar_ai_command(
            db, context, command, best_wine.id, local_today=local_today
        )
    return cellar_command_response(
        db,
        context,
        command,
        message="Ho trovato più possibilità: scegli la bottiglia da aggiornare."
        if len(ranked) > 1
        else "Ho preparato l’aggiornamento: conferma la bottiglia.",
    )


@router.post("/cellar-commands/{command_id}/execute", response_model=CellarCommandResponse)
def confirm_cellar_ai_command(
    command_id: UUID,
    payload: CellarCommandExecuteRequest,
    db: Session = Depends(get_db),
    context: CurrentContext = Depends(require_write_context),
) -> CellarCommandResponse:
    command = db.scalar(
        select(CellarAiCommand)
        .where(
            CellarAiCommand.id == command_id,
            CellarAiCommand.household_id == context.household.id,
        )
        .with_for_update()
    )
    if command is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Command not found")
    return execute_cellar_ai_command(
        db,
        context,
        command,
        payload.wine_id,
        local_today=datetime.now(UTC).date(),
    )


@router.post("/cellar-commands/{command_id}/undo", response_model=CellarCommandResponse)
def undo_cellar_ai_command(
    command_id: UUID,
    db: Session = Depends(get_db),
    context: CurrentContext = Depends(require_write_context),
) -> CellarCommandResponse:
    command = db.scalar(
        select(CellarAiCommand)
        .where(
            CellarAiCommand.id == command_id,
            CellarAiCommand.household_id == context.household.id,
        )
        .with_for_update()
    )
    if command is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Command not found")
    if command.status == "undone":
        return cellar_command_response(db, context, command, message="Comando già annullato.")
    if command.status != "executed" or command.matched_wine_id is None or command.tasting_id is None:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Command cannot be undone")
    wine = db.scalar(
        select(Wine)
        .where(
            Wine.id == command.matched_wine_id,
            Wine.household_id == context.household.id,
        )
        .with_for_update()
    )
    if wine is None or not user_can_see_wine(context, wine):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Wine not found")
    expected_quantity = max((command.previous_quantity or 1) - 1, 0)
    if wine.quantity != expected_quantity:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="The wine changed after this command and cannot be safely restored",
        )
    tasting = db.scalar(
        select(WineTastingEntry).where(
            WineTastingEntry.id == command.tasting_id,
            WineTastingEntry.household_id == context.household.id,
        )
    )
    if tasting is None:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Tasting no longer exists")
    db.delete(tasting)
    wine.tasting_history = normalize_tasting_history(
        [
            dict(entry)
            for entry in (wine.tasting_history or [])
            if str(entry.get("id") or "") != str(command.tasting_id)
        ]
    )
    wine.quantity = command.previous_quantity or wine.quantity + 1
    wine.status = command.previous_status
    if command.previous_rating is not None:
        wine.rating = command.previous_rating
    command.status = "undone"
    command.undone_at = datetime.now(UTC)
    db.commit()
    db.refresh(command)
    db.refresh(wine)
    return cellar_command_response(
        db,
        context,
        command,
        message=f"Annullato. {wine.name} {wine.vintage} è tornato a {wine.quantity} bottiglie.",
    )


def wine_market_context(wine: Wine) -> str:
    """Identity and attributes needed to find an exact market listing."""
    return "\n".join(
        [
            f"Name: {wine.name}",
            f"Producer: {wine.producer}",
            f"Vintage: {wine.vintage}",
            f"Format: {wine.format}",
            f"Region: {wine.region}",
            f"Appellation: {wine.appellation}",
        ],
    )


def wine_lookup_context(wine: Wine) -> str:
    """Keep web lookups focused on wine identity, not cellar metadata."""
    return "\n".join(
        [
            f"Name: {wine.name}",
            f"Producer: {wine.producer}",
            f"Vintage: {wine.vintage}",
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
            f"Current value: {wine.currency} {wine.current_value}" if wine.current_value is not None else "Current value: unknown",
            f"Drink window: {wine.drink_from}-{wine.drink_to}" if wine.drink_from or wine.drink_to else "Drink window: unknown",
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
        (
            r"\bA(?=\s+(?:è|is|looks|seems|feels|fits|works|goes|suits|va|sembra|appare|resta|rimane|può|can|should))",
            first_name,
        ),
        (
            r"\bB(?=\s+(?:è|is|looks|seems|feels|fits|works|goes|suits|va|sembra|appare|resta|rimane|può|can|should))",
            second_name,
        ),
    ]
    for pattern, replacement in replacements:
        result = re.sub(pattern, replacement, result)
    return result


def wishlist_advice_context(item: WishlistItem) -> str:
    """Decision fields for strategy and purpose, excluding generated prose."""
    return "\n".join(
        [
            f"Name: {item.name}",
            f"Producer: {item.producer}",
            f"Vintage: {item.vintage}",
            f"Type: {item.type}",
            f"Region: {item.region}",
            f"Appellation: {item.appellation}",
            f"Target price: {item.currency} {item.target_price} (maximum)"
            if item.target_price and item.target_price > 0
            else "Target price: not provided",
            f"Offer price: {item.currency} {getattr(item, 'offer_price', None)}"
            if getattr(item, "offer_price", None) is not None
            else "Offer price: not provided",
            f"Priority: {item.priority}",
            f"Purpose: {item.purpose}",
            f"Status: {item.status}",
            f"Notes: {item.notes}",
            f"AI context note: {item.ai_context_note}",
        ],
    )


def wishlist_market_context(item: WishlistItem, *, include_ai_context: bool = False) -> str:
    """Identity and target price needed for an exact wishlist market lookup."""
    return "\n".join(
        [
            f"Name: {item.name}",
            f"Producer: {item.producer}",
            f"Vintage: {item.vintage}",
            f"Format: {item.format}",
            f"Region: {item.region}",
            f"Appellation: {item.appellation}",
            f"Target price: {item.currency} {item.target_price} (maximum)"
            if item.target_price and item.target_price > 0
            else "Target price: not provided",
            f"Offer price: {item.currency} {getattr(item, 'offer_price', None)}"
            if getattr(item, "offer_price", None) is not None
            else "Offer price: not provided",
            *([f"AI context note: {item.ai_context_note}"] if include_ai_context else []),
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
    return any(
        word in normalized
        for word in ["buy", "ready", "approved", "compra", "acquista", "pronto", "approvato"]
    )


def wishlist_portfolio_context(items: list[WishlistItem], household_name: str) -> str:
    sorted_items = sorted(
        items,
        key=lambda item: (
            wishlist_priority_rank(item.priority),
            -float(item.target_price or 0),
            item.name.lower(),
        ),
    )
    high_priority_count = sum(1 for item in items if wishlist_priority_rank(item.priority) == 0)
    ready_to_buy_count = sum(1 for item in items if wishlist_ready_to_buy(item.status))
    total_target_value = sum((Decimal(str(item.target_price or 0)) for item in items), Decimal("0"))
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
        target_ceiling = (
            f"{item.currency} {Decimal(str(item.target_price)).quantize(Decimal('0.01'))}"
            if item.target_price and item.target_price > 0
            else "not provided"
        )
        offer_price = (
            f"{item.currency} {item.offer_price}" if item.offer_price is not None else "unknown"
        )
        lines.extend(
            [
                (
                    f"{index}. {item.name} | Producer: {item.producer or 'Unknown'} | Vintage: {item.vintage or 'n/d'} | "
                    f"Target ceiling: {target_ceiling} | Offer: {offer_price} | "
                    f"Priority: {item.priority or 'Unknown'} | Purpose: {item.purpose or 'Unknown'} | Status: {item.status or 'Unknown'}"
                ),
                f"   Region/Appellation: {item.region or 'n/d'} / {item.appellation or 'n/d'}",
                f"   Market estimate: {item.ai_market_price_currency or item.currency} {item.ai_market_price}"
                if item.ai_market_price
                else "   Market estimate: unknown",
                f"   AI context note: {item.ai_context_note or 'none'}",
            ],
        )
    if len(sorted_items) > 40:
        lines.append(
            f"... {len(sorted_items) - 40} more items omitted from the detailed list, but included in the summary counts."
        )
    return "\n".join(lines)


def normalize_market_sources(
    raw_sources: Any, *, default_currency: str, require_url: bool = False
) -> list[dict]:
    if not isinstance(raw_sources, list):
        return []
    normalized: list[dict] = []
    for raw_source in raw_sources[:12]:
        if not isinstance(raw_source, dict):
            continue
        merchant = str(
            raw_source.get("merchant") or raw_source.get("source") or raw_source.get("name") or ""
        ).strip()[:160]
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
                "currency": str(raw_source.get("currency") or default_currency or "").strip()[:8]
                or default_currency,
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
    grapes = [
        str(grape.get("name") or "").strip()
        for grape in wine.grapes
        if isinstance(grape, dict) and str(grape.get("name") or "").strip()
    ]
    return {
        "id": str(wine.id),
        "name": wine.name,
        "producer": wine.producer,
        "vintage": wine.vintage,
        "type": wine.type,
        "region": wine.region,
        "appellation": wine.appellation,
        "value": str(wine.current_value if wine.current_value is not None else wine.price),
        "currency": wine.currency,
        "drink_window": f"{wine.drink_from or '?'}-{wine.drink_to or '?'}",
        "peak_window": f"{wine.drink_peak_from or '?'}-{wine.drink_peak_to or '?'}",
        "grapes": grapes[:3],
        "tags": wine.tags[:3],
    }


def pairing_candidate_sort_key(wine: Wine, current_year: int) -> tuple[int, int, str, str]:
    if (
        wine.drink_peak_from
        and wine.drink_peak_to
        and wine.drink_peak_from <= current_year <= wine.drink_peak_to
    ):
        readiness = 0
    elif wine.drink_from and wine.drink_to and wine.drink_from <= current_year <= wine.drink_to:
        readiness = 1
    elif wine.drink_from and wine.drink_from <= current_year + 2:
        readiness = 2
    elif wine.drink_to and wine.drink_to < current_year:
        readiness = 4
    else:
        readiness = 3
    return (readiness, wine.drink_to or 9999, wine.type or "", wine.name or "")


def pairing_wine_is_in_ideal_window(wine: Wine, current_year: int) -> bool:
    return bool(
        wine.drink_peak_from
        and wine.drink_peak_to
        and wine.drink_peak_from <= current_year <= wine.drink_peak_to
    )


def select_pairing_candidates(wines: list[Wine], limit: int = PAIRING_MAX_CANDIDATES) -> list[Wine]:
    if len(wines) <= limit:
        return wines

    current_year = datetime.now(UTC).year
    by_type: dict[str, list[Wine]] = {}
    for wine in sorted(wines, key=lambda item: pairing_candidate_sort_key(item, current_year)):
        by_type.setdefault((wine.type or "Other").strip() or "Other", []).append(wine)

    selected: list[Wine] = []
    while len(selected) < limit and any(by_type.values()):
        for wine_type in sorted(by_type):
            candidates = by_type[wine_type]
            if candidates and len(selected) < limit:
                selected.append(candidates.pop(0))
    return selected


def pairing_budget_value_chf(wine: Wine) -> Decimal:
    reference_value = wine.current_value if wine.current_value is not None else wine.price
    if reference_value is None:
        return Decimal("0")
    return Decimal(str(reference_value))


def clean_pairing_response(
    payload: dict,
    available_wine_ids: set[str],
    include_market: bool,
    *,
    target_wine: Wine | None = None,
) -> PairingResponse:
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
    if target_wine is None and (include_market or not cleaned_matches):
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
    raw_dishes = payload.get("dish_recommendations", [])
    if not isinstance(raw_dishes, list):
        raw_dishes = []
    dishes = (
        [
            PairingDishRecommendation(
                name=str(item.get("name") or "").strip(),
                description=str(item.get("description") or "").strip(),
                why_it_works=str(item.get("why_it_works") or "").strip(),
                dietary_note=str(item.get("dietary_note") or "").strip(),
            )
            for item in raw_dishes[:3]
            if isinstance(item, dict) and str(item.get("name") or "").strip()
        ]
        if target_wine is not None
        else []
    )
    return PairingResponse(
        summary=str(payload.get("summary") or "").strip(),
        model="",
        cellar_matches=cleaned_matches,
        market_recommendations=market,
        dish_recommendations=dishes,
        estimated_cost_usd=Decimal("0"),
    )


DISALLOWED_BUYING_SOURCE_TERMS = ("smood",)


def is_disallowed_buying_source(merchant: str, source_url: str) -> bool:
    haystack = f"{merchant} {source_url}".lower()
    return any(term in haystack for term in DISALLOWED_BUYING_SOURCE_TERMS)


def buying_price_amount(value: str) -> Decimal | None:
    match = re.search(r"\d+(?:[.,]\d+)?", value.replace("'", ""))
    if not match:
        return None
    try:
        return Decimal(match.group(0).replace(",", "."))
    except InvalidOperation:
        return None


def clean_recommendation_vintage(value: str) -> str:
    vintage = value.strip()
    lowered = vintage.lower()
    if any(
        term in lowered
        for term in ("non conferm", "not confirm", "non indic", "not indic", "pagina", "unknown")
    ):
        return ""
    return vintage[:24]


def clean_buying_recommendations(
    payload: dict,
    verified_urls: set[str],
    min_price_chf: Decimal | None = None,
    max_price_chf: Decimal | None = None,
) -> list[BuyingRecommendation]:
    raw_items = payload.get("recommendations", [])
    if not isinstance(raw_items, list):
        return []
    recommendations: list[BuyingRecommendation] = []
    seen_urls: set[str] = set()
    merchant_counts: dict[str, int] = {}
    coop_count = 0
    for item in raw_items[:6]:
        if not isinstance(item, dict):
            continue
        name = str(item.get("name") or "").strip()
        merchant = str(item.get("merchant") or "").strip()
        source_url = str(item.get("source_url") or "").strip()
        if (
            not name
            or not merchant
            or not source_url.startswith(("https://", "http://"))
            or source_url not in verified_urls
            or is_disallowed_buying_source(merchant, source_url)
            or source_url in seen_urls
        ):
            continue
        seen_urls.add(source_url)
        merchant_type = str(item.get("merchant_type") or "online").strip().lower()
        confidence = str(item.get("confidence") or "medium").strip().lower()
        price = str(item.get("price") or "").strip()
        price_amount = buying_price_amount(price)
        if (
            min_price_chf is not None and price_amount is not None and price_amount < min_price_chf
        ) or (
            max_price_chf is not None and price_amount is not None and price_amount > max_price_chf
        ):
            continue
        merchant_key = merchant.lower()
        is_coop = "coop" in merchant_key or "mondovino" in merchant_key
        if merchant_counts.get(merchant_key, 0) >= 2 or (is_coop and coop_count >= 1):
            continue
        recommendations.append(
            BuyingRecommendation(
                name=name[:180],
                producer=str(item.get("producer") or "").strip()[:160],
                vintage=clean_recommendation_vintage(str(item.get("vintage") or "")),
                merchant=merchant[:160],
                merchant_type=merchant_type
                if merchant_type in {"local_shop", "online"}
                else "online",
                price=price[:40],
                currency=str(item.get("currency") or "CHF").strip().upper()[:8] or "CHF",
                availability=str(item.get("availability") or "").strip()[:240],
                delivery_estimate=str(item.get("delivery_estimate") or "").strip()[:160],
                source_url=source_url[:500],
                reason=str(item.get("reason") or "").strip()[:800],
                local=bool(item.get("local")),
                confidence=confidence if confidence in {"high", "medium", "low"} else "medium",
            ),
        )
        merchant_counts[merchant_key] = merchant_counts.get(merchant_key, 0) + 1
        if is_coop:
            coop_count += 1
    return recommendations


@router.post("/compare-wines", response_model=WineCompareResponse)
def compare_wines(
    payload: WineCompareRequest,
    db: Session = Depends(get_db),
    context: CurrentContext = Depends(require_write_context),
) -> WineCompareResponse:
    user_settings = get_or_create_user_ai_settings(db, context)
    selected_wines = [get_household_wine(db, context, wine_id) for wine_id in payload.wine_ids]
    if len(selected_wines) != 2:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Exactly 2 wines are required"
        )
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
        model=request_model(payload, user_settings.pairing_model),
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
        model=effective_response_model(response, user_settings.pairing_model),
        usage=response.usage,
        db=db,
    )
    compare_response = WineCompareResponse(
        model=effective_response_model(response, user_settings.pairing_model),
        reasoning_effort=response.reasoning_effort or "",
        style_profile=replace_compare_placeholders(
            str(result.get("style_profile") or "").strip(), first.name, second.name
        ),
        readiness=replace_compare_placeholders(
            str(result.get("readiness") or "").strip(), first.name, second.name
        ),
        occasion=replace_compare_placeholders(
            str(result.get("occasion") or "").strip(), first.name, second.name
        ),
        cellar_value=replace_compare_placeholders(
            str(result.get("cellar_value") or "").strip(), first.name, second.name
        ),
        verdict=replace_compare_placeholders(
            str(result.get("verdict") or "").strip(), first.name, second.name
        ),
        estimated_cost_usd=charged_cost,
    )
    record_ai_audit(
        db,
        context,
        entity_type="comparison",
        entity_id=context.household.id,
        feature="wine_compare",
        model=effective_response_model(response, user_settings.pairing_model),
        reasoning_effort=response.reasoning_effort or "",
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
    if payload.target_wine_id is None and len(payload.dish.strip()) < 2:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Dish is required"
        )
    user_settings = get_or_create_user_ai_settings(db, context)
    pairing_preferences = (
        "" if payload.ignore_preferences else (user_settings.pairing_preferences or "").strip()
    )
    max_price_chf = (
        Decimal(str(payload.max_price_chf)) if payload.max_price_chf is not None else None
    )
    local_origin = payload.local_origin.strip()
    prefer_local_wines = payload.market_only and payload.prefer_local_wines and bool(local_origin)
    target_wine = (
        get_household_wine(db, context, payload.target_wine_id) if payload.target_wine_id else None
    )
    cellar_wines = (
        []
        if (payload.market_only or target_wine is not None)
        else list(
            db.scalars(
                select(Wine)
                .where(Wine.household_id == context.household.id)
                .where(Wine.status == "Delivered")
                .where(Wine.quantity > 0)
                .order_by(Wine.name)
                .limit(120),
            ),
        )
    )
    cellar_wines = [wine for wine in cellar_wines if user_can_see_wine(context, wine)]
    if max_price_chf is not None:
        cellar_wines = [
            wine for wine in cellar_wines if pairing_budget_value_chf(wine) <= max_price_chf
        ]
    if payload.only_ideal_drink_window:
        current_year = datetime.now(UTC).year
        cellar_wines = [
            wine for wine in cellar_wines if pairing_wine_is_in_ideal_window(wine, current_year)
        ]
    cellar_wines = select_pairing_candidates(
        cellar_wines, limit=user_settings.pairing_candidate_limit
    )
    wine_context_payload = (
        [pairing_wine_context(target_wine)]
        if target_wine is not None
        else [pairing_wine_context(wine) for wine in cellar_wines]
    )
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
                "dish_recommendations": {
                    "type": "array",
                    "items": {
                        "type": "object",
                        "additionalProperties": False,
                        "properties": {
                            "name": {"type": "string"},
                            "description": {"type": "string"},
                            "why_it_works": {"type": "string"},
                            "dietary_note": {"type": "string"},
                        },
                        "required": ["name", "description", "why_it_works", "dietary_note"],
                    },
                },
            },
            "required": [
                "summary",
                "cellar_matches",
                "market_recommendations",
                "dish_recommendations",
            ],
        },
    }
    target_mode = target_wine is not None
    selected_pairing_model = request_model(payload, user_settings.pairing_model)
    target_system_prompt = (
        "Sei un sommelier privato. Dato un vino gia selezionato, proponi da uno a tre piatti che lo valorizzino. "
        "Le allergie e gli ingredienti da evitare sono vincoli assoluti: non suggerire piatti che li contengano, neppure come variante. "
        "Le preferenze alimentari sono preferenze forti. Non proporre vini alternativi, mercato o cellar_matches. "
        "Compila dish_recommendations e lascia cellar_matches e market_recommendations vuoti. Rispondi solo con JSON valido. "
        f"{response_language_instruction(payload.locale)}"
    )
    response, provider_source = create_ai_response(
        db,
        context,
        user_settings,
        model=selected_pairing_model,
        task_type="pairing",
        system_prompt=target_system_prompt
        if target_mode
        else (
            "Sei un sommelier privato. Consiglia vini per un piatto usando prima le bottiglie disponibili in cantina. "
            "Rispondi solo con JSON valido. Se market_only e true, ignora la cantina e proponi solo mercato. "
            "Se include_market e false e trovi vini adeguati in cantina, lascia market_recommendations vuoto. "
            "Non inventare che un vino e in cantina se non e nel contesto. "
            "Se ricevi gusti personali dell'utente, trattali come preferenze morbide e non come vincoli assoluti. "
            "Se l'utente chiede di privilegiare vini locali mentre e al ristorante, usa quel contesto come preferenza forte per le proposte di mercato, senza forzare abbinamenti palesemente sbagliati. "
            f"{response_language_instruction(payload.locale)}"
        ),
        user_prompt=(
            f"Vino selezionato: {wine_context_payload[0]}\n"
            f"gusti_personali: {pairing_preferences or 'none'}\n"
            f"preferenze_alimentari: {payload.dietary_preferences.strip() or 'none'}\n"
            f"allergie_o_ingredienti_da_evitare: {payload.allergies.strip() or 'none'}\n"
            "Proponi piatti concreti, realizzabili e distinti; indica brevemente perche funzionano e una nota utile sulle preferenze o allergie."
        )
        if target_mode
        else (
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
            "Per il mercato proponi due bottiglie reali per fascia prezzo in CHF: low entro 30, medium entro 60, high oltre 60. "
            "Lascia dish_recommendations vuoto."
        ),
        json_schema=schema,
    )
    cleaned = clean_pairing_response(
        parse_json_response(response.text),
        {str(wine.id) for wine in cellar_wines},
        payload.include_market,
        target_wine=target_wine,
    )
    cleaned.model = effective_response_model(response, selected_pairing_model)
    cleaned.reasoning_effort = response.reasoning_effort or ""
    charged_cost = billable_cost_usd(
        user_is_app_admin=context.user.is_app_admin,
        provider_source=provider_source,
        model=effective_response_model(response, selected_pairing_model),
        usage=response.usage,
        db=db,
    )
    cleaned.estimated_cost_usd = charged_cost
    record_ai_audit(
        db,
        context,
        entity_type="pairing",
        entity_id=context.household.id,
        feature="pairing_dishes" if target_mode else "pairing",
        model=effective_response_model(response, selected_pairing_model),
        reasoning_effort=response.reasoning_effort or "",
        summary=f"{target_wine.name if target_wine is not None else payload.dish}: {cleaned.summary}",
        usage=response.usage,
        provider_source=provider_source,
    )
    db.commit()
    return cleaned


@router.post("/tasting-reflection", response_model=TastingReflectionResponse)
def create_tasting_reflection(
    payload: TastingReflectionRequest,
    db: Session = Depends(get_db),
    context: CurrentContext = Depends(require_write_context),
) -> TastingReflectionResponse:
    """Create and retain a concise evaluation of one wine-and-food pairing."""
    wine = get_household_wine(db, context, payload.wine_id)
    entry = db.scalar(
        select(WineTastingEntry).where(
            WineTastingEntry.id == payload.tasting_id,
            WineTastingEntry.wine_id == wine.id,
            WineTastingEntry.household_id == context.household.id,
        )
    )
    if entry is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Tasting entry not found")

    user_settings = get_or_create_user_ai_settings(db, context)
    selected_model = request_model(payload, user_settings.pairing_model)
    schema = {
        "name": "tasting_sommelier_reflection",
        "schema": {
            "type": "object",
            "additionalProperties": False,
            "properties": {
                "feedback": {"type": "string"},
                "pairing_score": {"type": "integer", "minimum": 1, "maximum": 10},
                "advice": {"type": "string"},
            },
            "required": ["feedback", "pairing_score", "advice"],
        },
    }
    wine_label = " ".join(part for part in (wine.name, wine.vintage) if part).strip()
    response, provider_source = create_ai_response(
        db,
        context,
        user_settings,
        model=selected_model,
        task_type="tasting_reflection",
        # A compact JSON response can still require reasoning tokens. Leave enough
        # headroom so structured output is not cut off before its closing brace.
        max_output_tokens=512,
        system_prompt=(
            "Sei il sommelier personale di una cantina privata. Valuta con rigore ma con un tono conviviale "
            "un abbinamento vino-piatto gia avvenuto. Assegna pairing_score da 1 a 10: 5 e corretto, 7 e molto riuscito, "
            "9-10 e eccezionale. Non inventare aromi o sensazioni non fornite. "
            "feedback deve spiegare in massimo 30 parole perche l'abbinamento funziona o dove e limitato, citando "
            "un rapporto gastronomico concreto (freschezza, struttura, sapidita, dolcezza, grasso o intensita) solo quando giustificato. "
            "advice deve dare un unico suggerimento pratico, massimo 22 parole, per servirlo meglio o perfezionare il piatto. "
            "Non usare liste, premesse o frasi generiche sul ricordo della serata. "
            f"{response_language_instruction(payload.locale)}"
        ),
        user_prompt=(
            f"Vino: {wine_label}\n"
            f"Produttore: {wine.producer or 'non indicato'}\n"
            f"Data degustazione: {entry.consumed_at.isoformat()}\n"
            f"Occasione: {entry.occasion or 'non indicata'}\n"
            f"Abbinamento: {entry.pairing or 'non indicato'}\n"
            f"Compagnia: {entry.companions or 'non indicata'}\n"
            f"Voto: {entry.rating or 'non indicato'} su 6\n"
            f"Gradimento: {entry.enjoyment or 'non indicato'}\n"
            f"Nota registrata: {entry.note or 'nessuna'}\n"
            f"Ricordo aggiuntivo del collezionista: {payload.personal_feedback.strip() or 'nessuno'}"
        ),
        json_schema=schema,
    )
    parsed = parse_json_response(response.text)
    feedback = str(parsed.get("feedback") or "").strip()
    advice = str(parsed.get("advice") or "").strip()
    raw_pairing_score = parsed.get("pairing_score")
    if raw_pairing_score is None:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY, detail="The sommelier pairing score was missing"
        )
    try:
        pairing_score = int(raw_pairing_score)
    except (TypeError, ValueError) as exc:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail="The sommelier pairing score was invalid") from exc
    if not feedback or not advice or pairing_score < 1 or pairing_score > 10:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY, detail="The sommelier evaluation was incomplete"
        )

    entry.sommelier_feedback = feedback
    entry.sommelier_pairing_score = pairing_score
    entry.sommelier_pairing_advice = advice
    entry.sommelier_feedback_at = datetime.now(UTC)
    effective_model = effective_response_model(response, selected_model)
    charged_cost = billable_cost_usd(
        user_is_app_admin=context.user.is_app_admin,
        provider_source=provider_source,
        model=effective_model,
        usage=response.usage,
        db=db,
    )
    entry.sommelier_feedback_cost_usd = charged_cost
    record_ai_audit(
        db,
        context,
        entity_type="tasting",
        entity_id=entry.id,
        feature="tasting_reflection",
        model=effective_model,
        reasoning_effort=response.reasoning_effort or "",
        summary=f"{wine_label}: {feedback}",
        usage=response.usage,
        provider_source=provider_source,
    )
    db.commit()
    return TastingReflectionResponse(
        feedback=feedback,
        pairing_score=pairing_score,
        advice=advice,
        model=effective_model,
        reasoning_effort=response.reasoning_effort or "",
        estimated_cost_usd=charged_cost,
    )


@router.post("/buying-advice", response_model=BuyingAdviceResponse)
def suggest_buying_advice(
    payload: BuyingAdviceRequest,
    db: Session = Depends(get_db),
    context: CurrentContext = Depends(require_write_context),
) -> BuyingAdviceResponse:
    if payload.purpose == "pairing" and not payload.pairing_with.strip():
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Pairing food is required"
        )
    if (
        payload.min_price_chf is not None
        and payload.max_price_chf is not None
        and payload.min_price_chf > payload.max_price_chf
    ):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Minimum price cannot exceed maximum price",
        )
    user_settings = get_or_create_user_ai_settings(db, context)
    purpose_labels = {
        "drink_now": "drink immediately",
        "cellar": "hold in the cellar",
        "pairing": "pair with the specified food",
    }
    deadline_labels = {
        "today": "available for pickup or delivery today",
        "tomorrow": "available for pickup or delivery no later than tomorrow",
        "can_wait": "delivery can take several days",
    }
    schema = {
        "name": "wine_buying_advice",
        "schema": {
            "type": "object",
            "additionalProperties": False,
            "properties": {
                "summary": {"type": "string"},
                "warning": {"type": "string"},
                "recommendations": {
                    "type": "array",
                    "items": {
                        "type": "object",
                        "additionalProperties": False,
                        "properties": {
                            "name": {"type": "string"},
                            "producer": {"type": "string"},
                            "vintage": {"type": "string"},
                            "merchant": {"type": "string"},
                            "merchant_type": {"type": "string", "enum": ["local_shop", "online"]},
                            "price": {"type": "string"},
                            "currency": {"type": "string"},
                            "availability": {"type": "string"},
                            "delivery_estimate": {"type": "string"},
                            "source_url": {"type": "string"},
                            "reason": {"type": "string"},
                            "local": {"type": "boolean"},
                            "confidence": {"type": "string", "enum": ["high", "medium", "low"]},
                        },
                        "required": [
                            "name",
                            "producer",
                            "vintage",
                            "merchant",
                            "merchant_type",
                            "price",
                            "currency",
                            "availability",
                            "delivery_estimate",
                            "source_url",
                            "reason",
                            "local",
                            "confidence",
                        ],
                    },
                },
            },
            "required": ["summary", "warning", "recommendations"],
        },
    }
    response, provider_source = create_ai_response(
        db,
        context,
        user_settings,
        model=request_model(payload, user_settings.pairing_model),
        task_type="buying_advice",
        system_prompt=(
            "You are a pragmatic wine purchasing advisor with live web search. Return JSON only. "
            "Every recommendation must correspond to a concrete retailer product page found during this search. "
            "Never invent stock, pickup availability, delivery dates, prices, merchants, or URLs. "
            "Treat stock and delivery claims as verified only when the retailer page explicitly supports them; otherwise say that confirmation with the shop is required. "
            "For today or tomorrow, strongly prioritize nearby physical retailers and pickup over online shipping. "
            "Local refers to the retailer's location, not the wine's origin: offer stylistically relevant wines from varied regions unless the user asks for a specific origin. "
            "Diversify merchants. Do not return a list dominated by one retailer; Coop/Mondovino is a fallback only and at most one Coop recommendation is allowed. Prefer independent wine shops when their stock can be verified. "
            "For a flexible deadline, consider reputable online retailers serving the user's location, including ARVI, Bindella, or better alternatives when actually relevant. "
            "Do not use Smood: it is no longer an active retailer or delivery channel and must never be recommended, even when stale Smood pages appear in search results. "
            "If the deadline cannot be supported by verified evidence, return fewer recommendations and explain the limitation in warning. "
            f"{response_language_instruction(payload.locale)}"
        ),
        user_prompt=(
            f"Purchase purpose: {purpose_labels[payload.purpose]}\n"
            f"Pairing food: {payload.pairing_with.strip() or 'none'}\n"
            f"Additional preferences: {payload.preferences.strip() or 'none'}\n"
            f"Need: {deadline_labels[payload.needed_by]}\n"
            f"Buyer location: {payload.location.strip()}\n"
            f"Minimum price per bottle: {f'CHF {payload.min_price_chf}' if payload.min_price_chf is not None else 'none'}\n"
            f"Maximum price per bottle: {f'CHF {payload.max_price_chf}' if payload.max_price_chf is not None else 'none'}\n\n"
            "Return up to 6 ranked options. For drink_now, favor wines already in a suitable drinking window. "
            "For cellar, favor age-worthy wines and explain the expected holding rationale. For pairing, optimize for the named food. "
            "For today/tomorrow, set local=true only for a physical shop plausibly reachable from the stated location and use merchant_type=local_shop. "
            "Use the exact product-page URL, not a search page or merchant homepage. Return the exact listed price when available, not a vague range. "
            "Set vintage to an empty string unless that exact vintage is clearly stated on the product page; never write a status such as 'not confirmed from page' in the vintage field. "
            "Put any uncertainty in availability and warning."
        ),
        json_schema=schema,
        web_search=True,
        web_search_use_default_location=False,
        # Product searches only need compact evidence such as price, vintage,
        # stock and delivery. Avoid passing whole retailer pages to the model.
        web_search_context_size="low",
        reasoning_effort="low",
        max_output_tokens=6000,
        max_tool_calls=4,
    )
    parsed = parse_json_response(response.text)
    verified_urls = {str(source.get("url") or "").strip() for source in response.web_sources}
    recommendations = clean_buying_recommendations(
        parsed, verified_urls, payload.min_price_chf, payload.max_price_chf
    )
    extra_cost = web_search_tool_cost_usd(response.web_search_calls)
    effective_model = effective_response_model(response, user_settings.pairing_model)
    charged_cost = response.charged_cost_usd
    sources = [
        {
            "kind": "market_source",
            "merchant": item.merchant,
            "url": item.source_url,
            "price": item.price,
            "currency": item.currency,
            "note": item.availability,
            "verified": True,
        }
        for item in recommendations
    ] + web_search_source_entries(response.web_sources)
    result = BuyingAdviceResponse(
        summary=str(parsed.get("summary") or "").strip()[:1500],
        warning=str(parsed.get("warning") or "").strip()[:1000],
        model=effective_model,
        reasoning_effort=response.reasoning_effort or "",
        recommendations=recommendations,
        estimated_cost_usd=charged_cost,
    )
    record_ai_audit(
        db,
        context,
        entity_type="buying_advice",
        entity_id=context.household.id,
        feature="buying_advice",
        model=effective_model,
        reasoning_effort=response.reasoning_effort or "",
        summary=f"{payload.purpose} / {payload.needed_by} / {payload.location}: {result.summary}",
        sources=sources,
        usage=response.usage,
        provider_source=provider_source,
        extra_cost_usd=extra_cost,
    )
    db.commit()
    return result


@router.post("/wines/{wine_id}/notes", response_model=WineResponse)
def generate_wine_notes(
    wine_id: UUID,
    payload: AiGenerationRequest = AiGenerationRequest(),
    db: Session = Depends(get_db),
    context: CurrentContext = Depends(require_write_context),
) -> WineResponse:
    wine = get_household_wine(db, context, wine_id)
    if reuse_shared_wine_feature(
        db, context, wine, "notes", locale=payload.locale, force_refresh=payload.force_refresh
    ):
        return ai_wine_response(db, context, wine)
    user_settings = get_or_create_user_ai_settings(db, context)
    prompt = ai_notes_prompt(locale=payload.locale, wine_context=wine_lookup_context(wine))
    response, provider_source = create_ai_response(
        db,
        context,
        user_settings,
        model=request_model(payload, user_settings.ai_notes_model),
        task_type="ai_notes",
        system_prompt=prompt.system,
        user_prompt=prompt.user,
    )
    notes = response.text
    wine.ai_notes = notes[:4000]
    mark_local_feature(wine, "notes")
    publish_shared_fact(
        db,
        wine,
        "notes",
        {"ai_notes": wine.ai_notes},
        locale=payload.locale,
        model=effective_response_model(response, user_settings.ai_notes_model),
    )
    record_ai_audit(
        db,
        context,
        entity_type="wine",
        entity_id=wine.id,
        feature="ai_notes",
        model=effective_response_model(response, user_settings.ai_notes_model),
        summary=notes,
        reasoning_effort=response.reasoning_effort or "",
        usage=response.usage,
        provider_source=provider_source,
    )
    db.commit()
    db.refresh(wine)
    return ai_wine_response(db, context, wine)


@router.post("/wines/{wine_id}/all", response_model=WineResponse)
def generate_all_wine_ai(
    wine_id: UUID,
    payload: AiGenerationRequest = AiGenerationRequest(),
    db: Session = Depends(get_db),
    context: CurrentContext = Depends(require_write_context),
) -> WineResponse:
    wine = get_household_wine(db, context, wine_id)
    if not payload.force_refresh:
        cached_facts = {
            feature: get_shared_fact(db, wine, feature, locale=payload.locale)
            for feature in ("notes", "drink_window", "value", "grapes")
        }
        if all(cached_facts.values()):
            applied = []
            value_changed = False
            for feature, fact in cached_facts.items():
                if fact is not None:
                    changed = apply_shared_fact(wine, fact, only_missing=False)
                    value_changed = value_changed or (feature == "value" and changed)
                    applied.append(feature)
            if len(applied) == len(cached_facts):
                if value_changed:
                    record_wine_value_history(db, wine, source="shared")
                record_ai_audit(
                    db,
                    context,
                    entity_type="wine",
                    entity_id=wine.id,
                    feature="shared_full_enrichment",
                    model=next(
                        (fact.model for fact in cached_facts.values() if fact and fact.model),
                        default_model_for_field("ai_notes_model"),
                    ),
                    summary="Reused Vinaris data for full wine enrichment",
                    sources=[{"kind": "shared_data", "features": applied}],
                    provider_source="shared_cache",
                )
                db.commit()
                db.refresh(wine)
                return ai_wine_response(db, context, wine)
    user_settings = get_or_create_user_ai_settings(db, context)
    prompt = wine_full_enrichment_prompt(
        locale=payload.locale,
        currency_instruction=value_currency_instruction(wine.currency),
        currency=wine.currency,
        wine_context=wine_market_context(wine),
    )
    schema = {
        "name": "wine_full_enrichment",
        "schema": {
            "type": "object",
            "additionalProperties": False,
            "properties": {
                "ai_notes": {"type": "string"},
                "drink_window": {
                    "type": "object",
                    "additionalProperties": False,
                    "properties": {
                        "drink_from": {"type": "integer"},
                        "drink_peak_from": {"type": "integer"},
                        "drink_peak_to": {"type": "integer"},
                        "drink_to": {"type": "integer"},
                        "notes": {"type": "string"},
                    },
                    "required": [
                        "drink_from",
                        "drink_peak_from",
                        "drink_peak_to",
                        "drink_to",
                        "notes",
                    ],
                },
                "value": {
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
                                "required": [
                                    "merchant",
                                    "country",
                                    "price",
                                    "currency",
                                    "url",
                                    "note",
                                ],
                            },
                        },
                    },
                    "required": [
                        "current_value",
                        "currency",
                        "notes",
                        "market_note",
                        "market_sources",
                    ],
                },
                "grape_composition": {
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
                        "source_url": {"type": "string"},
                        "source_title": {"type": "string"},
                    },
                    "required": ["grapes", "notes", "source_url", "source_title"],
                },
            },
            "required": ["ai_notes", "drink_window", "value", "grape_composition"],
        },
    }
    # The combined route is cost-first: reuse the value model (Luna by default)
    # and raise reasoning to medium through the task policy for the drink window.
    selected_model = request_model(payload, user_settings.value_model)
    response, provider_source = create_ai_response(
        db,
        context,
        user_settings,
        model=selected_model,
        task_type="wine_full_enrichment",
        system_prompt=prompt.system,
        user_prompt=prompt.user,
        json_schema=schema,
        web_search=True,
        web_search_context_size="medium",
        max_output_tokens=6000,
        max_tool_calls=6,
    )
    result = parse_json_response(response.text)
    drink_window = result.get("drink_window")
    value_result = result.get("value")
    grape_result = result.get("grape_composition")
    if (
        not isinstance(drink_window, dict)
        or not isinstance(value_result, dict)
        or not isinstance(grape_result, dict)
    ):
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY, detail="AI returned invalid wine enrichment"
        )

    try:
        current_value = Decimal(str(value_result["current_value"])).quantize(Decimal("0.01"))
        drink_from = int(drink_window["drink_from"])
        drink_peak_from = int(drink_window["drink_peak_from"])
        drink_peak_to = int(drink_window["drink_peak_to"])
        drink_to = int(drink_window["drink_to"])
    except (InvalidOperation, KeyError, TypeError, ValueError) as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY, detail="AI returned invalid wine enrichment"
        ) from exc
    if not (drink_from <= drink_peak_from <= drink_peak_to <= drink_to):
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY, detail="AI returned an invalid drinking window"
        )

    result_currency = str(value_result.get("currency") or wine.currency)[:8]
    market_sources = normalize_market_sources(
        value_result.get("market_sources"),
        default_currency=result_currency,
        require_url=True,
    )
    if not market_sources:
        wine.value_not_found = True
        db.commit()
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="No verified live market price sources found",
        )

    grapes = grape_result.get("grapes", [])
    if not isinstance(grapes, list):
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY, detail="AI returned invalid grapes"
        )
    grape_source_url = str(grape_result.get("source_url") or "").strip()
    verified_grape_source = next(
        (
            source
            for source in response.web_sources
            if str(source.get("url") or "").strip().rstrip("/") == grape_source_url.rstrip("/")
        ),
        {},
    )
    saved_verified_grapes = bool(grapes and grape_source_url and verified_grape_source)

    ai_notes = str(result.get("ai_notes") or "").strip()
    grape_note = str(grape_result.get("notes") or "").strip()
    if grape_note and saved_verified_grapes:
        grape_label = "Uve" if payload.locale == "it" else "Grapes"
        ai_notes = f"{ai_notes}\n\n{grape_label}: {grape_note}".strip()
    wine.ai_notes = ai_notes[:4000]
    wine.drink_from = drink_from
    wine.drink_peak_from = drink_peak_from
    wine.drink_peak_to = drink_peak_to
    wine.drink_to = drink_to
    wine.drink_window_notes = str(drink_window.get("notes") or "")[:2000]
    wine.current_value = max(current_value, Decimal("0"))
    wine.value_not_found = False
    wine.currency = result_currency
    wine.ai_value_notes = str(value_result.get("notes") or "")[:2000]
    wine.ai_value_estimated_at = datetime.now(UTC)
    if saved_verified_grapes:
        wine.grapes = grapes
        wine.grapes_source_url = grape_source_url[:500]
        wine.grapes_source_title = str(
            verified_grape_source.get("title") or grape_result.get("source_title") or ""
        )[:200]
        wine.grapes_verified_at = datetime.now(UTC)
        wine.grapes_not_applicable = False
    else:
        wine.grapes_not_applicable = True

    for feature in ("notes", "drink_window", "value", "grapes"):
        mark_local_feature(wine, feature)

    record_wine_value_history(db, wine, source="ai")
    extra_cost = web_search_tool_cost_usd(response.web_search_calls)
    note_entry = market_note_source(value_result.get("market_note") or value_result.get("notes"))
    grape_source_entry = (
        {
            "kind": "grape_source",
            "url": wine.grapes_source_url,
            "title": wine.grapes_source_title,
        }
        if saved_verified_grapes
        else None
    )
    audit_sources = (
        market_sources
        + web_search_source_entries(response.web_sources)
        + ([note_entry] if note_entry else [])
        + ([grape_source_entry] if grape_source_entry else [])
    )
    effective_model = effective_response_model(response, selected_model)
    publish_shared_fact(
        db, wine, "notes", {"ai_notes": wine.ai_notes}, locale=payload.locale, model=effective_model
    )
    publish_shared_fact(
        db,
        wine,
        "drink_window",
        {
            "drink_from": wine.drink_from,
            "drink_peak_from": wine.drink_peak_from,
            "drink_peak_to": wine.drink_peak_to,
            "drink_to": wine.drink_to,
            "notes": wine.drink_window_notes,
        },
        locale=payload.locale,
        model=effective_model,
    )
    publish_shared_fact(
        db,
        wine,
        "value",
        {
            "current_value": str(wine.current_value),
            "currency": wine.currency,
            "notes": wine.ai_value_notes,
        },
        locale=payload.locale,
        sources=audit_sources,
        model=effective_model,
    )
    if saved_verified_grapes:
        publish_shared_fact(
            db,
            wine,
            "grapes",
            {
                "grapes": wine.grapes,
                "source_url": wine.grapes_source_url,
                "source_title": wine.grapes_source_title,
            },
            sources=[grape_source_entry] if grape_source_entry else [],
            model=effective_model,
        )
    record_ai_audit(
        db,
        context,
        entity_type="wine",
        entity_id=wine.id,
        feature="wine_full_enrichment",
        model=effective_model,
        reasoning_effort=response.reasoning_effort or "",
        summary=(
            f"{wine.currency} {wine.current_value}; "
            f"drink {wine.drink_from}-{wine.drink_to}; "
            f"{len(wine.grapes)} grapes; {wine.ai_notes}"
        ),
        sources=audit_sources,
        usage=response.usage,
        provider_source=provider_source,
        extra_cost_usd=extra_cost,
    )
    db.commit()
    db.refresh(wine)
    return ai_wine_response(db, context, wine)


@router.post("/wine-label/enrich", response_model=WineLabelEnrichmentResponse)
def enrich_wine_label(
    payload: WineLabelEnrichmentRequest,
    db: Session = Depends(get_db),
    context: CurrentContext = Depends(require_write_context),
) -> WineLabelEnrichmentResponse:
    if payload.source in {"label", "photo"} and not context.user.can_use_label_recognition:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Wine label recognition is not enabled for this user",
        )
    user_settings = get_or_create_user_ai_settings(db, context)
    model = request_model(payload, user_settings.grape_model or settings.openai_grape_model)
    confirmed_identity = "\n".join(
        value
        for value in (
            f"Confirmed wine name: {payload.confirmed_name}" if payload.confirmed_name else "",
            f"Confirmed producer: {payload.confirmed_producer}"
            if payload.confirmed_producer
            else "",
            f"Confirmed vintage: {payload.confirmed_vintage}" if payload.confirmed_vintage else "",
            f"Confirmed appellation: {payload.confirmed_appellation}"
            if payload.confirmed_appellation
            else "",
        )
        if value
    )
    photo_identity_rules = (
        "The identity below was confirmed by the user from a bottle photo. Treat wine name, producer, "
        "vintage, and appellation as constraints, never as suggestions. Do not substitute a similarly "
        "named wine from another producer. If the exact identity cannot be verified, preserve the confirmed "
        "identity and leave unsupported complementary fields empty.\n"
        f"{confirmed_identity}\n"
        if payload.source == "photo"
        else ""
    )
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
            "required": [
                "name",
                "producer",
                "vintage",
                "type",
                "region",
                "appellation",
                "country",
                "grapes_text",
                "confidence",
                "notes",
            ],
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
            f"{photo_identity_rules}"
            "Guidelines:\n"
            "- name should be the cuvee/wine name without vintage or producer when possible.\n"
            '- Preserve apostrophes inside names. Do not truncate Italian or French names at apostrophes, e.g. keep "Torre dell\'anima" complete.\n'
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
        app_funded=payload.source == "manual",
    )
    result = parse_json_response(response.text)
    result_producer = str(result.get("producer") or "").strip()
    result_vintage = str(result.get("vintage") or "").strip()

    def normalize_identity(value: str) -> str:
        return re.sub(r"[^a-z0-9]+", "", value.casefold())

    identity_conflict = payload.source == "photo" and (
        bool(
            payload.confirmed_producer
            and result_producer
            and normalize_identity(payload.confirmed_producer)
            != normalize_identity(result_producer)
        )
        or bool(
            payload.confirmed_vintage
            and result_vintage
            and payload.confirmed_vintage.casefold() != result_vintage.casefold()
        )
    )
    cleaned = WineLabelEnrichmentResponse(
        name=payload.confirmed_name or str(result.get("name") or payload.label).strip(),
        producer=payload.confirmed_producer or result_producer,
        vintage=payload.confirmed_vintage or result_vintage,
        type=(
            "" if identity_conflict else normalize_wine_type(str(result.get("type") or "").strip())
        ),
        region="" if identity_conflict else str(result.get("region") or "").strip(),
        appellation=(
            payload.confirmed_appellation
            or ("" if identity_conflict else str(result.get("appellation") or "").strip())
        ),
        country="" if identity_conflict else str(result.get("country") or "").strip(),
        grapes_text="" if identity_conflict else str(result.get("grapes_text") or "").strip(),
        confidence=(
            "low" if identity_conflict else str(result.get("confidence") or "low").strip() or "low"
        ),
        notes=(
            "Discarded complementary data because it referred to a different producer or vintage."
            if identity_conflict
            else str(result.get("notes") or "").strip()
        ),
    )
    record_ai_audit(
        db,
        context,
        entity_type="catalog",
        entity_id=context.household.id,
        feature=(
            "wine_name_search"
            if payload.source == "manual"
            else "wine_photo_enrichment"
            if payload.source == "photo"
            else "wine_label_enrichment"
        ),
        model=effective_response_model(response, model),
        reasoning_effort=response.reasoning_effort or "",
        summary=f"{payload.label}: {cleaned.producer} {cleaned.name} {cleaned.vintage}".strip(),
        usage=response.usage,
        provider_source=provider_source,
        extra_cost_usd=web_search_tool_cost_usd(response.web_search_calls),
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
    if reuse_shared_wine_feature(
        db,
        context,
        wine,
        "drink_window",
        locale=payload.locale,
        force_refresh=payload.force_refresh,
    ):
        return ai_wine_response(db, context, wine)
    user_settings = get_or_create_user_ai_settings(db, context)
    prompt = drink_window_prompt(locale=payload.locale, wine_context=wine_market_context(wine))
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
        model=request_model(payload, user_settings.drink_window_model),
        task_type="drink_window",
        system_prompt=prompt.system,
        user_prompt=prompt.user,
        json_schema=schema,
    )
    result = parse_json_response(response.text)
    wine.drink_from = int(result["drink_from"])
    wine.drink_peak_from = int(result["drink_peak_from"])
    wine.drink_peak_to = int(result["drink_peak_to"])
    wine.drink_to = int(result["drink_to"])
    wine.drink_window_notes = str(result["notes"])[:2000]
    mark_local_feature(wine, "drink_window")
    publish_shared_fact(
        db,
        wine,
        "drink_window",
        {
            "drink_from": wine.drink_from,
            "drink_peak_from": wine.drink_peak_from,
            "drink_peak_to": wine.drink_peak_to,
            "drink_to": wine.drink_to,
            "notes": wine.drink_window_notes,
        },
        locale=payload.locale,
        model=effective_response_model(response, user_settings.drink_window_model),
    )
    record_ai_audit(
        db,
        context,
        entity_type="wine",
        entity_id=wine.id,
        feature="drink_window",
        model=effective_response_model(response, user_settings.drink_window_model),
        reasoning_effort=response.reasoning_effort or "",
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
    if reuse_shared_wine_feature(
        db, context, wine, "value", locale=payload.locale, force_refresh=payload.force_refresh
    ):
        return ai_wine_response(db, context, wine)
    user_settings = get_or_create_user_ai_settings(db, context)
    prompt = wine_value_prompt(
        locale=payload.locale,
        currency_instruction=value_currency_instruction(wine.currency),
        currency=wine.currency,
        wine_context=wine_market_context(wine),
    )
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
        model=request_model(payload, user_settings.value_model),
        task_type="wine_value",
        system_prompt=prompt.system,
        user_prompt=prompt.user,
        json_schema=schema,
        web_search=True,
    )
    extra_cost = web_search_tool_cost_usd(response.web_search_calls)
    result = parse_json_response(response.text)
    try:
        value = Decimal(str(result["current_value"])).quantize(Decimal("0.01"))
    except (InvalidOperation, KeyError) as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY, detail="AI returned invalid value"
        ) from exc
    result_currency = str(result.get("currency") or wine.currency)[:8]
    market_sources = normalize_market_sources(
        result.get("market_sources"), default_currency=result_currency, require_url=True
    )
    if not market_sources:
        wine.value_not_found = True
        db.commit()
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="No verified live market price sources found",
        )
    wine.current_value = max(value, Decimal("0"))
    wine.value_not_found = False
    wine.currency = result_currency
    wine.ai_value_notes = str(result["notes"])[:2000]
    wine.ai_value_estimated_at = datetime.now(UTC)
    note_entry = market_note_source(result.get("market_note") or result.get("notes"))
    audit_sources = (
        market_sources
        + web_search_source_entries(response.web_sources)
        + ([note_entry] if note_entry else [])
    )
    mark_local_feature(wine, "value")
    publish_shared_fact(
        db,
        wine,
        "value",
        {
            "current_value": str(wine.current_value),
            "currency": wine.currency,
            "notes": wine.ai_value_notes,
        },
        locale=payload.locale,
        sources=audit_sources,
        model=effective_response_model(response, user_settings.value_model),
    )
    record_wine_value_history(db, wine, source="ai")
    record_ai_audit(
        db,
        context,
        entity_type="wine",
        entity_id=wine.id,
        feature="ai_value",
        model=effective_response_model(response, user_settings.value_model),
        reasoning_effort=response.reasoning_effort or "",
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
    if wine.grapes and wine.grapes_source_url and not payload.force_refresh:
        return ai_wine_response(db, context, wine)
    if reuse_shared_wine_feature(
        db, context, wine, "grapes", locale=payload.locale, force_refresh=payload.force_refresh
    ):
        return ai_wine_response(db, context, wine)
    user_settings = get_or_create_user_ai_settings(db, context)
    prompt = grape_composition_prompt(locale=payload.locale, wine_context=wine_lookup_context(wine))
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
        model=request_model(payload, user_settings.grape_model),
        task_type="grape_inference",
        system_prompt=prompt.system,
        user_prompt=prompt.user,
        json_schema=schema,
        web_search=True,
        web_search_context_size="medium",
        max_tool_calls=5,
    )
    result = parse_json_response(response.text)
    grapes = result.get("grapes", [])
    if not isinstance(grapes, list):
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY, detail="AI returned invalid grapes"
        )
    verified_source = response.web_sources[0] if response.web_sources else {}
    saved_verified_grapes = bool(grapes and verified_source.get("url"))
    if saved_verified_grapes:
        wine.grapes = grapes
        wine.grapes_source_url = str(verified_source.get("url") or "")[:500]
        wine.grapes_source_title = str(verified_source.get("title") or "")[:200]
        wine.grapes_verified_at = datetime.now(UTC)
        wine.grapes_not_applicable = False
    else:
        wine.grapes_not_applicable = True
    note = str(result.get("notes") or "").strip()
    if note and saved_verified_grapes:
        wine.ai_notes = f"{wine.ai_notes}\n\nUve: {note}".strip()[:4000]
    if saved_verified_grapes:
        mark_local_feature(wine, "grapes")
        publish_shared_fact(
            db,
            wine,
            "grapes",
            {
                "grapes": wine.grapes,
                "source_url": wine.grapes_source_url,
                "source_title": wine.grapes_source_title,
            },
            sources=web_search_source_entries(response.web_sources),
            model=effective_response_model(response, user_settings.grape_model),
        )
    record_ai_audit(
        db,
        context,
        entity_type="wine",
        entity_id=wine.id,
        feature="grapes",
        model=effective_response_model(response, user_settings.grape_model),
        reasoning_effort=response.reasoning_effort or "",
        summary=note
        or (
            "Verified grape composition saved"
            if saved_verified_grapes
            else "No verified grape composition found"
        ),
        sources=web_search_source_entries(response.web_sources),
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
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="AI score lookup disabled for this wine"
        )
    if reuse_shared_wine_feature(
        db, context, wine, "scores", locale=payload.locale, force_refresh=payload.force_refresh
    ):
        return ai_wine_response(db, context, wine)
    user_settings = get_or_create_user_ai_settings(db, context)
    prompt = wine_scores_prompt(locale=payload.locale, wine_context=wine_lookup_context(wine))
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
    existing_scores = [dict(score) for score in (wine.scores or []) if isinstance(score, dict)]
    response, provider_source = create_ai_response(
        db,
        context,
        user_settings,
        model=request_model(payload, user_settings.score_model),
        task_type="score_summary",
        system_prompt=prompt.system,
        user_prompt=prompt.user,
        json_schema=schema,
        web_search=True,
        web_search_context_size="medium",
        max_tool_calls=6,
    )
    result = parse_json_response(response.text)
    scores = result.get("scores") or []
    if not isinstance(scores, list):
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY, detail="AI returned invalid scores"
        )
    new_scores = [
        {
            "critic": str(item.get("critic") or "")[:120],
            "score": str(item.get("score") or "")[:40],
            "note": str(item.get("note") or "")[:800],
        }
        for item in scores
        if isinstance(item, dict) and (item.get("critic") or item.get("score"))
    ][:8]
    known_scores = {
        (
            str(score.get("critic") or "").strip().casefold(),
            str(score.get("score") or "").strip().casefold(),
        )
        for score in existing_scores
    }
    additional_scores = []
    for score in new_scores:
        key = (score["critic"].strip().casefold(), score["score"].strip().casefold())
        if key in known_scores:
            continue
        known_scores.add(key)
        additional_scores.append(score)
    wine.scores = [*existing_scores, *additional_scores]
    if wine.scores:
        wine.scores_not_applicable = False
    else:
        wine.scores_not_applicable = True
    if wine.scores:
        mark_local_feature(wine, "scores")
        existing_shared_scores: list[dict] = []
        existing_fact = get_shared_fact(db, wine, "scores", locale=payload.locale)
        if existing_fact is not None and isinstance(existing_fact.payload.get("scores"), list):
            existing_shared_scores = [
                dict(item) for item in existing_fact.payload["scores"] if isinstance(item, dict)
            ]
        verified_scores: list[dict] = []
        verified_keys: set[tuple[str, str]] = set()
        for score in [*existing_shared_scores, *new_scores]:
            key = (
                str(score.get("critic") or "").strip().casefold(),
                str(score.get("score") or "").strip().casefold(),
            )
            if not all(key) or key in verified_keys:
                continue
            verified_keys.add(key)
            verified_scores.append(score)
        if verified_scores:
            publish_shared_fact(
                db,
                wine,
                "scores",
                {"scores": verified_scores[:8]},
                sources=web_search_source_entries(response.web_sources),
                model=effective_response_model(response, user_settings.score_model),
            )
    record_ai_audit(
        db,
        context,
        entity_type="wine",
        entity_id=wine.id,
        feature="scores",
        model=effective_response_model(response, user_settings.score_model),
        reasoning_effort=response.reasoning_effort or "",
        summary=f"{len(additional_scores)} new scores found ({len(wine.scores)} total)",
        sources=web_search_source_entries(response.web_sources),
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
    prompt = wishlist_advice_prompt(
        locale=payload.locale, wishlist_context=wishlist_advice_context(item)
    )
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
            "required": [
                "strategy",
                "purpose_advice",
                "recommended_status",
                "recommended_priority",
            ],
        },
    }
    response, provider_source = create_ai_response(
        db,
        context,
        user_settings,
        model=request_model(payload, user_settings.wishlist_model),
        task_type="wishlist_advice",
        system_prompt=prompt.system,
        user_prompt=prompt.user,
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
        model=effective_response_model(response, user_settings.wishlist_model),
        reasoning_effort=response.reasoning_effort or "",
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
    prompt = wishlist_purpose_prompt(
        locale=payload.locale, wishlist_context=wishlist_advice_context(item)
    )
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
        model=request_model(payload, user_settings.wishlist_model),
        task_type="wishlist_purpose",
        system_prompt=prompt.system,
        user_prompt=prompt.user,
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
        model=effective_response_model(response, user_settings.wishlist_model),
        reasoning_effort=response.reasoning_effort or "",
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
    prompt = wishlist_value_prompt(
        locale=payload.locale,
        currency_instruction=value_currency_instruction(item.currency),
        currency=item.currency,
        target_price=item.target_price if item.target_price and item.target_price > 0 else None,
        wishlist_context=wishlist_market_context(item, include_ai_context=True),
    )
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
            "required": [
                "market_price",
                "market_price_currency",
                "price_advice",
                "recommended_status",
                "market_note",
                "market_sources",
            ],
        },
    }
    response, provider_source = create_ai_response(
        db,
        context,
        user_settings,
        model=request_model(payload, user_settings.value_model),
        task_type="wishlist_value",
        system_prompt=prompt.system,
        user_prompt=prompt.user,
        json_schema=schema,
        web_search=True,
    )
    extra_cost = web_search_tool_cost_usd(response.web_search_calls)
    result = parse_json_response(response.text)
    try:
        market_price = Decimal(str(result["market_price"])).quantize(Decimal("0.01"))
    except (InvalidOperation, KeyError) as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY, detail="AI returned invalid market price"
        ) from exc
    result_currency = str(result.get("market_price_currency") or item.currency)[:8]
    market_sources = normalize_market_sources(
        result.get("market_sources"), default_currency=result_currency, require_url=True
    )
    if not market_sources:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="No verified live market price sources found",
        )
    item.ai_market_price = max(market_price, Decimal("0"))
    item.ai_market_price_currency = result_currency
    item.status = str(result["recommended_status"] or item.status)[:32]
    item.ai_strategy = str(result["price_advice"])[:3000]
    note_entry = market_note_source(result.get("market_note") or result.get("price_advice"))
    audit_sources = (
        market_sources
        + web_search_source_entries(response.web_sources)
        + ([note_entry] if note_entry else [])
    )
    record_ai_audit(
        db,
        context,
        entity_type="wishlist",
        entity_id=item.id,
        feature="wishlist_target_price",
        model=effective_response_model(response, user_settings.value_model),
        reasoning_effort=response.reasoning_effort or "",
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
        model=request_model(payload, user_settings.wishlist_model),
        task_type="regional_gap_targets",
        system_prompt=(
            "You advise a private wine collector on regional portfolio allocation. Return JSON only. "
            "Return one target for every input region and no other regions. "
            "The target_pct values must sum to exactly 100. "
            "Do not recommend individual wines. The rationale is required: write two concise sentences "
            "that explain the allocation logic and the most important proposed changes. "
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
    raw_targets_value = result.get("targets")
    raw_targets: list[Any] = raw_targets_value if isinstance(raw_targets_value, list) else []
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
        model=effective_response_model(response, user_settings.wishlist_model),
        usage=response.usage,
        db=db,
    )
    rationale = str(result.get("rationale") or "").strip()[:1200]
    if not rationale:
        rationale = (
            "L'AI ha generato questa ripartizione regionale per il profilo richiesto. "
            "Verifica i target proposti prima di adottarli nella tua cantina."
            if payload.locale == "it"
            else "AI generated this regional allocation for the requested profile. "
            "Review the proposed targets before adopting them in your cellar."
        )
    suggestion = RegionalGapTargetSuggestionResponse(
        model=effective_response_model(response, user_settings.wishlist_model),
        reasoning_effort=response.reasoning_effort or "",
        profile=payload.profile,
        rationale=rationale,
        targets=normalized,
        estimated_cost_usd=charged_cost,
    )
    record_ai_audit(
        db,
        context,
        entity_type="household",
        entity_id=context.household.id,
        feature="regional_gap_targets",
        model=effective_response_model(response, user_settings.wishlist_model),
        reasoning_effort=response.reasoning_effort or "",
        summary=f"{payload.profile}: {suggestion.rationale}",
        sources=[
            {
                "kind": "regional_gap_targets",
                "profile": payload.profile,
                "targets": [target.model_dump(mode="json") for target in normalized],
            }
        ],
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
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Wishlist is empty"
        )
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
        model=request_model(payload, user_settings.wishlist_model),
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
        model=effective_response_model(response, user_settings.wishlist_model),
        usage=response.usage,
        db=db,
    )
    strategy_response = WishlistPortfolioStrategyResponse(
        model=effective_response_model(response, user_settings.wishlist_model),
        reasoning_effort=response.reasoning_effort or "",
        overview=str(result.get("overview") or "").strip(),
        buy_now=str(result.get("buy_now") or "").strip(),
        wait_watch=str(result.get("wait_watch") or "").strip(),
        allocation=str(result.get("allocation") or "").strip(),
        next_step=str(result.get("next_step") or "").strip(),
        wishlist_list_id=wishlist_list.id,
        wishlist_list_name=wishlist_list.name,
        item_count=len(items),
        generated_at=datetime.now(UTC),
        estimated_cost_usd=charged_cost,
    )
    wishlist_list.portfolio_strategy = strategy_response.model_dump(mode="json")
    record_ai_audit(
        db,
        context,
        entity_type="household",
        entity_id=context.household.id,
        feature="wishlist_portfolio_strategy",
        model=effective_response_model(response, user_settings.wishlist_model),
        reasoning_effort=response.reasoning_effort or "",
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
