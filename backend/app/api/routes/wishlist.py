import json
from dataclasses import dataclass
from datetime import UTC, datetime
from decimal import Decimal
from typing import Literal, cast
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
from app.core.config import settings
from app.core.wine_types import normalize_verified_vintage, normalize_wine_type
from app.db.session import get_db
from app.models import AiAuditLog, ExternalWineTasting, Wine, WishlistItem, WishlistList
from app.prompts.library import wine_sensory_metadata_prompt, wine_sensory_profile_prompt
from app.schemas.taste_profile import TasteMatchResponse
from app.schemas.wishlist import (
    ExternalWineTastingCreate,
    ExternalWineTastingResponse,
    StandaloneWineTastingCreate,
    WishlistConvert,
    WishlistCreate,
    WishlistListCreate,
    WishlistListResponse,
    WishlistListUpdate,
    WishlistResponse,
    WishlistTasteMatchPreview,
    WishlistUpdate,
)
from app.services.free_tier import ensure_free_tier_label_capacity
from app.services.merchants import get_or_create_merchant
from app.services.openai_client import TokenUsage
from app.services.shared_wine_data import resolve_shared_identity
from app.services.taste_profiles import (
    calculate_wishlist_taste_match,
    generate_wine_sensory_profile,
    mark_wine_for_sensory_enrichment,
    rebuild_user_taste_profile,
    validated_dimensions,
)

router = APIRouter(prefix="/wishlist")

DEFAULT_WISHLIST_LIST_NAME = "Wishlist"
WISHLIST_AI_DATE_FEATURES = {"wishlist_strategy", "wishlist_target_price", "wishlist_purpose"}


CatalogEnrichmentStatus = Literal["pending", "existing", "not_proposed", "failed"]
ExternalTastingEnrichmentIssue = Literal[
    "",
    "missing_name",
    "missing_producer",
    "missing_vintage",
    "profile_generation_failed",
    "catalog_save_failed",
    "processing_error",
]


@dataclass(frozen=True)
class ExternalTastingEnrichmentOutcome:
    estimated_cost_usd: Decimal = Decimal("0")
    profile_available: bool = False
    catalog_status: CatalogEnrichmentStatus = "not_proposed"
    issue: ExternalTastingEnrichmentIssue = ""


def propose_wishlist_catalog_entry(
    db: Session, wishlist_item: WishlistItem, *, grapes: list[dict[str, str]]
) -> Literal["pending", "existing", "not_proposed"]:
    """Submit source-backed wishlist metadata for central catalog review."""
    from app.api.routes.catalog import ensure_catalog_entry_for_wine_data

    entry = ensure_catalog_entry_for_wine_data(
        db,
        {
            "name": wishlist_item.name,
            "producer": wishlist_item.producer,
            "vintage": wishlist_item.vintage,
            "region": wishlist_item.region,
            "appellation": wishlist_item.appellation,
            "type": wishlist_item.type,
            "format": wishlist_item.format,
            "country": "",
            "grapes_text": ", ".join(grape["name"] for grape in grapes),
        },
        source="wishlist_ai_research",
    )
    if entry is None:
        return "not_proposed"
    return "existing" if entry.is_active else "pending"


def enrich_external_tasting_sensory_profile(
    db: Session,
    context: CurrentContext,
    tasting: ExternalWineTasting,
    *,
    raise_configuration_errors: bool = False,
    research_catalog: bool = False,
) -> ExternalTastingEnrichmentOutcome:
    """Enrich a personally recorded tasting, using verified AI research when needed."""
    if not settings.wine_sensory_ai_enabled:
        if raise_configuration_errors:
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="Sensory profile AI generation is disabled",
            )
        return ExternalTastingEnrichmentOutcome(issue="processing_error")
    # Imported lazily: the AI route also uses wishlist helpers during application startup.
    from app.api.routes.ai import (
        create_ai_response,
        get_or_create_user_ai_settings,
        record_ai_audit,
    )

    response_details: dict[str, object] = {}
    total_cost = Decimal("0")
    researched_grapes: list[dict[str, str]] = []
    catalog_status: CatalogEnrichmentStatus = "not_proposed"
    wishlist_item = (
        db.scalar(
            select(WishlistItem).where(
                WishlistItem.id == tasting.wishlist_item_id,
                WishlistItem.household_id == context.household.id,
            )
        )
        if tasting.wishlist_item_id
        else None
    )
    if wishlist_item is not None:
        for field in ("name", "producer", "vintage", "format", "type", "region", "appellation"):
            setattr(tasting, field, getattr(wishlist_item, field))
        resolve_shared_identity(db, tasting, create=True)

    def charged_cost(response: object) -> Decimal:
        try:
            return Decimal(str(getattr(response, "charged_cost_usd", "0") or "0"))
        except Exception:
            return Decimal("0")

    def research_missing_metadata() -> None:
        nonlocal catalog_status, total_cost, researched_grapes
        prompt = wine_sensory_metadata_prompt(
            wine_context={
                "name": tasting.name,
                "producer": tasting.producer,
                "vintage": tasting.vintage,
                "type": tasting.type,
                "region": tasting.region,
                "appellation": tasting.appellation,
                "grapes": [],
            }
        )
        schema = {
            "name": "wine_sensory_metadata",
            "schema": {
                "type": "object",
                "additionalProperties": False,
                "properties": {
                    "vintage": {"type": "string"},
                    "type": {"type": "string"},
                    "region": {"type": "string"},
                    "appellation": {"type": "string"},
                    "grapes": {"type": "array", "items": {"type": "string"}},
                    "source_url": {"type": "string"},
                    "source_title": {"type": "string"},
                },
                "required": [
                    "vintage",
                    "type",
                    "region",
                    "appellation",
                    "grapes",
                    "source_url",
                    "source_title",
                ],
            },
        }
        response, provider_source = create_ai_response(
            db,
            context,
            get_or_create_user_ai_settings(db, context),
            model=settings.openai_economy_model,
            system_prompt=prompt.system,
            user_prompt=prompt.user,
            json_schema=schema,
            web_search=True,
            web_search_use_default_location=False,
            web_search_context_size="low",
            task_type="sensory_profile",
            max_output_tokens=800,
            max_tool_calls=1,
            reasoning_effort="low",
        )
        total_cost += charged_cost(response)
        try:
            result = json.loads(response.text)
        except (TypeError, json.JSONDecodeError):
            result = {}
        source_url = str(result.get("source_url") or "").strip()
        verified_source = next(
            (
                source
                for source in response.web_sources
                if str(source.get("url") or "").strip().rstrip("/") == source_url.rstrip("/")
            ),
            None,
        )
        record_ai_audit(
            db,
            context,
            entity_type="external_tasting",
            entity_id=tasting.id,
            feature="sensory_metadata",
            model=str(response.model or settings.openai_economy_model),
            summary="Researched sensory metadata for an outside tasting",
            reasoning_effort="low",
            sources=[verified_source] if verified_source else [],
            usage=response.usage,
            provider_source=provider_source,
        )
        if not verified_source:
            return
        researched_vintage = normalize_verified_vintage(str(result.get("vintage") or ""))
        if not tasting.vintage.strip() and researched_vintage:
            tasting.vintage = researched_vintage
            if wishlist_item is not None and not wishlist_item.vintage.strip():
                wishlist_item.vintage = researched_vintage
        candidate_type = normalize_wine_type(str(result.get("type") or ""))
        if not tasting.type.strip() and candidate_type:
            tasting.type = candidate_type
            if wishlist_item is not None and not wishlist_item.type.strip():
                wishlist_item.type = candidate_type
        if not tasting.region.strip():
            researched_region = str(result.get("region") or "").strip()[:120]
            tasting.region = researched_region
            if wishlist_item is not None and not wishlist_item.region.strip():
                wishlist_item.region = researched_region
        if not tasting.appellation.strip():
            researched_appellation = str(result.get("appellation") or "").strip()[:120]
            tasting.appellation = researched_appellation
            if wishlist_item is not None and not wishlist_item.appellation.strip():
                wishlist_item.appellation = researched_appellation
        researched_grapes = [
            {"name": grape.strip()}
            for item in result.get("grapes", [])
            if isinstance(item, str) and (grape := item.strip())
        ]
        resolve_shared_identity(db, tasting, create=True)
        if wishlist_item is not None:
            try:
                with db.begin_nested():
                    catalog_status = propose_wishlist_catalog_entry(
                        db, wishlist_item, grapes=researched_grapes
                    )
            except Exception:
                catalog_status = "failed"

    def ai_generate(item: Wine | ExternalWineTasting) -> tuple[dict[str, float], str]:
        prompt = wine_sensory_profile_prompt(
            wine_context={
                "name": item.name,
                "producer": item.producer,
                "vintage": item.vintage,
                "type": item.type,
                "region": item.region,
                "appellation": item.appellation,
                "grapes": researched_grapes,
                "description": "",
            }
        )
        schema = {
            "name": "wine_sensory_profile",
            "schema": {
                "type": "object",
                "additionalProperties": False,
                "properties": {
                    key: {"type": ["number", "null"], "minimum": 0, "maximum": 1}
                    for key in (
                        "body",
                        "acidity",
                        "tannin",
                        "sweetness",
                        "aromatic_intensity",
                        "fruit",
                        "wood",
                        "spice",
                        "minerality",
                    )
                },
                "required": [
                    "body",
                    "acidity",
                    "tannin",
                    "sweetness",
                    "aromatic_intensity",
                    "fruit",
                    "wood",
                    "spice",
                    "minerality",
                ],
            },
        }
        response, provider_source = create_ai_response(
            db,
            context,
            get_or_create_user_ai_settings(db, context),
            model=settings.openai_economy_model,
            system_prompt=prompt.system,
            user_prompt=prompt.user,
            json_schema=schema,
            task_type="sensory_profile",
            max_output_tokens=350,
            reasoning_effort="low",
        )
        try:
            dimensions = validated_dimensions(json.loads(response.text))
        except (TypeError, json.JSONDecodeError):
            dimensions = {}
        response_details.update(
            model=response.model or settings.openai_economy_model,
            provider_source=provider_source,
            usage=response.usage,
        )
        nonlocal total_cost
        total_cost += charged_cost(response)
        return dimensions, str(response_details["model"])

    try:
        if not research_catalog:
            profile = generate_wine_sensory_profile(
                db,
                tasting,
                modified_by_user_id=context.user.id,
            )
            if profile is not None and profile.generation_status == "available":
                return ExternalTastingEnrichmentOutcome(profile_available=True)
        research_missing_metadata()
        profile = generate_wine_sensory_profile(
            db,
            tasting,
            allow_ai=True,
            ai_generate=ai_generate,
            modified_by_user_id=context.user.id,
        )
    except HTTPException as exc:
        if raise_configuration_errors and exc.status_code in {
            status.HTTP_402_PAYMENT_REQUIRED,
            status.HTTP_503_SERVICE_UNAVAILABLE,
        }:
            raise
        # Recording a real tasting must never fail because one enrichment fails.
        return ExternalTastingEnrichmentOutcome(
            estimated_cost_usd=total_cost,
            catalog_status=catalog_status,
            issue="processing_error",
        )
    except Exception:
        # Recording a real tasting must never fail because credits, a provider, or AI are unavailable.
        return ExternalTastingEnrichmentOutcome(
            estimated_cost_usd=total_cost,
            catalog_status=catalog_status,
            issue="processing_error",
        )
    if profile is not None and profile.source == "ai" and response_details:
        record_ai_audit(
            db,
            context,
            entity_type="external_tasting",
            entity_id=tasting.id,
            feature="sensory_profile",
            model=str(response_details["model"]),
            summary="Generated a shared sensory profile from an outside tasting",
            reasoning_effort="low",
            usage=cast(TokenUsage, response_details["usage"]),
            provider_source=str(response_details["provider_source"]),
        )
    profile_available = profile is not None and profile.generation_status == "available"
    issue: ExternalTastingEnrichmentIssue
    if profile_available:
        issue = "catalog_save_failed" if catalog_status == "failed" else ""
    elif not tasting.name.strip():
        issue = "missing_name"
    elif not tasting.producer.strip():
        issue = "missing_producer"
    elif not tasting.vintage.strip():
        issue = "missing_vintage"
    else:
        issue = "profile_generation_failed"
    return ExternalTastingEnrichmentOutcome(
        estimated_cost_usd=total_cost,
        profile_available=profile_available,
        catalog_status=catalog_status,
        issue=issue,
    )


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


def wishlist_response(
    item: WishlistItem,
    ai_dates: dict[str, datetime] | None = None,
    *,
    tasting_count: int = 0,
) -> dict:
    return {
        "id": item.id,
        "household_id": item.household_id,
        "wishlist_list_id": item.wishlist_list_id,
        "tasting_count": tasting_count,
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


def wishlist_tasting_counts(
    db: Session, context: CurrentContext, item_ids: list[UUID]
) -> dict[UUID, int]:
    if not item_ids:
        return {}
    rows = db.execute(
        select(ExternalWineTasting.wishlist_item_id, func.count(ExternalWineTasting.id))
        .where(
            ExternalWineTasting.household_id == context.household.id,
            ExternalWineTasting.created_by_user_id == context.user.id,
            ExternalWineTasting.wishlist_item_id.in_(item_ids),
        )
        .group_by(ExternalWineTasting.wishlist_item_id)
    )
    return {item_id: int(count) for item_id, count in rows if item_id is not None}


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
    tasting_counts = wishlist_tasting_counts(db, context, [item.id for item in items])
    return [
        wishlist_response(item, ai_dates.get(item.id), tasting_count=tasting_counts.get(item.id, 0))
        for item in items
    ]


@router.get("/{item_id}/taste-match", response_model=TasteMatchResponse)
def wishlist_taste_match(
    item_id: UUID,
    db: Session = Depends(get_db),
    context: CurrentContext = Depends(get_current_context),
) -> TasteMatchResponse:
    item = get_household_wishlist_item(db, context, item_id)
    return TasteMatchResponse(**calculate_wishlist_taste_match(db, context.user.id, item))


@router.post("/taste-match-preview", response_model=TasteMatchResponse)
def wishlist_taste_match_preview(
    payload: WishlistTasteMatchPreview,
    db: Session = Depends(get_db),
    context: CurrentContext = Depends(get_current_context),
) -> TasteMatchResponse:
    candidate = WishlistItem(
        household_id=context.household.id,
        wishlist_list_id=UUID(int=0),
        name=payload.name.strip(),
        producer=payload.producer.strip(),
        vintage=payload.vintage.strip(),
        type=normalize_wine_type(payload.type),
        region=payload.region.strip(),
        appellation=payload.appellation.strip(),
    )
    return TasteMatchResponse(**calculate_wishlist_taste_match(db, context.user.id, candidate))


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
    data["merchant"] = get_or_create_merchant(db, context, str(data.get("merchant") or ""))
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
    if "merchant" in updates:
        updates["merchant"] = get_or_create_merchant(db, context, str(updates["merchant"] or ""))
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


@router.post(
    "/tastings",
    response_model=ExternalWineTastingResponse,
    status_code=status.HTTP_201_CREATED,
)
def record_standalone_tasting(
    payload: StandaloneWineTastingCreate,
    db: Session = Depends(get_db),
    context: CurrentContext = Depends(require_write_context),
) -> ExternalWineTastingResponse:
    """Save a tasting directly, without creating wishlist or inventory records."""
    if payload.wishlist_item_id is not None:
        return record_wishlist_tasting(payload.wishlist_item_id, payload, db, context)
    tasting = ExternalWineTasting(
        household_id=context.household.id,
        created_by_user_id=context.user.id,
        **payload.model_dump(
            include={"name", "producer", "vintage", "format", "region", "appellation"}
        ),
        type=normalize_wine_type(payload.type),
    )
    return save_external_tasting(db, context, tasting, payload)


@router.post(
    "/{item_id}/tastings",
    response_model=ExternalWineTastingResponse,
    status_code=status.HTTP_201_CREATED,
)
def record_wishlist_tasting(
    item_id: UUID,
    payload: ExternalWineTastingCreate,
    db: Session = Depends(get_db),
    context: CurrentContext = Depends(require_write_context),
) -> ExternalWineTastingResponse:
    """Record a personal tasting without turning a wishlist wine into inventory."""
    item = get_household_wishlist_item(db, context, item_id)
    tasting = ExternalWineTasting(
        household_id=context.household.id,
        created_by_user_id=context.user.id,
        wishlist_item_id=item.id,
        name=item.name,
        producer=item.producer,
        vintage=item.vintage,
        format=item.format,
        type=normalize_wine_type(item.type),
        region=item.region,
        appellation=item.appellation,
    )
    return save_external_tasting(db, context, tasting, payload)


def save_external_tasting(
    db: Session,
    context: CurrentContext,
    tasting: ExternalWineTasting,
    payload: ExternalWineTastingCreate,
) -> ExternalWineTastingResponse:
    tasting.consumed_at = payload.consumed_at or datetime.now(UTC).date()
    tasting.note = payload.note.strip()
    tasting.rating = payload.tasting_rating
    tasting.enjoyment = payload.tasting_enjoyment
    tasting.occasion = payload.tasting_occasion.strip()
    tasting.pairing = payload.tasting_pairing.strip()
    tasting.companions = payload.tasting_companions.strip()
    db.add(tasting)
    db.flush()
    # Shared sensory data is optional. Its absence never prevents the explicit
    # rating from contributing to the user's private taste profile.
    resolve_shared_identity(db, tasting, create=True)
    if payload.tasting_rating > 0 or payload.tasting_enjoyment:
        mark_wine_for_sensory_enrichment(db, tasting)
        db.flush()
        enrich_external_tasting_sensory_profile(db, context, tasting)
        rebuild_user_taste_profile(db, household_id=context.household.id, user_id=context.user.id)
    db.commit()
    db.refresh(tasting)
    return ExternalWineTastingResponse.model_validate(tasting)


@router.patch("/tastings/{tasting_id}", response_model=ExternalWineTastingResponse)
def update_wishlist_tasting(
    tasting_id: UUID,
    payload: ExternalWineTastingCreate,
    db: Session = Depends(get_db),
    context: CurrentContext = Depends(require_write_context),
) -> ExternalWineTastingResponse:
    """Update the current user's personal external tasting."""
    tasting = db.scalar(
        select(ExternalWineTasting).where(
            ExternalWineTasting.id == tasting_id,
            ExternalWineTasting.household_id == context.household.id,
            ExternalWineTasting.created_by_user_id == context.user.id,
        )
    )
    if tasting is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="External tasting not found"
        )
    tasting.consumed_at = payload.consumed_at or tasting.consumed_at
    tasting.note = payload.note.strip()
    tasting.rating = payload.tasting_rating
    tasting.enjoyment = payload.tasting_enjoyment
    tasting.occasion = payload.tasting_occasion.strip()
    tasting.pairing = payload.tasting_pairing.strip()
    tasting.companions = payload.tasting_companions.strip()
    if payload.tasting_rating > 0 or payload.tasting_enjoyment:
        mark_wine_for_sensory_enrichment(db, tasting)
        db.flush()
        enrich_external_tasting_sensory_profile(db, context, tasting)
    rebuild_user_taste_profile(db, household_id=context.household.id, user_id=context.user.id)
    db.commit()
    db.refresh(tasting)
    return ExternalWineTastingResponse.model_validate(tasting)


@router.delete("/tastings/{tasting_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_wishlist_tasting(
    tasting_id: UUID,
    db: Session = Depends(get_db),
    context: CurrentContext = Depends(require_write_context),
) -> Response:
    tasting = db.scalar(
        select(ExternalWineTasting).where(
            ExternalWineTasting.id == tasting_id,
            ExternalWineTasting.household_id == context.household.id,
            ExternalWineTasting.created_by_user_id == context.user.id,
        )
    )
    if tasting is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="External tasting not found"
        )
    db.delete(tasting)
    rebuild_user_taste_profile(db, household_id=context.household.id, user_id=context.user.id)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


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
        merchant=get_or_create_merchant(db, context, item.merchant),
        notes=item.notes,
    )
    db.add(wine)
    mark_wishlist_strategy_stale(db, context.household.id, [item.wishlist_list_id])
    db.delete(item)
    db.commit()
    db.refresh(wine)
    return {"wine_id": wine.id}
