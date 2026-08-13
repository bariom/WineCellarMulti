from datetime import datetime
from decimal import Decimal
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

CellarCommandEnjoyment = Literal["", "positive", "negative"]
CellarCommandStatus = Literal[
    "processing",
    "needs_confirmation",
    "catalog_selection",
    "draft_ready",
    "ai_research_required",
    "not_found",
    "unsupported",
    "executed",
    "undone",
    "failed",
]


class AiAuditLogResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    household_id: UUID
    user_id: UUID | None = None
    entity_type: str
    entity_id: UUID
    feature: str
    model: str
    reasoning_effort: str = ""
    outcome: str
    summary: str
    sources: list[dict]
    input_tokens: int = 0
    cached_input_tokens: int = 0
    output_tokens: int = 0
    total_tokens: int = 0
    estimated_cost_usd: Decimal = Decimal("0")
    created_at: datetime


class AiUsageBucket(BaseModel):
    requests: int
    input_tokens: int
    cached_input_tokens: int
    output_tokens: int
    total_tokens: int
    estimated_cost_usd: Decimal


class AiUsageResponse(BaseModel):
    today: AiUsageBucket
    current_month: AiUsageBucket
    all_time: AiUsageBucket
    currency: str = "USD"
    is_estimate: bool = True


class AiSettingsResponse(BaseModel):
    has_openai_api_key: bool
    provider_mode: str
    provider_options: list[str]
    app_credit_balance_usd: Decimal = Decimal("0")
    ai_credit_pack_size_usd: Decimal = Decimal("0")
    can_use_app_credits: bool = False
    can_use_included_wine_search: bool = False
    ai_notes_model: str
    drink_window_model: str
    value_model: str
    grape_model: str
    score_model: str
    wishlist_model: str
    pairing_model: str
    model_advisor_enabled: bool = False
    pairing_preferences: str = ""
    pairing_candidate_limit: int = 25
    model_options: list[str]


class AiSettingsUpdate(BaseModel):
    openai_api_key: str | None = None
    provider_mode: str | None = Field(default=None, pattern="^(auto|user_key|credits)$")
    ai_notes_model: str | None = None
    drink_window_model: str | None = None
    value_model: str | None = None
    grape_model: str | None = None
    score_model: str | None = None
    wishlist_model: str | None = None
    pairing_model: str | None = None
    model_advisor_enabled: bool | None = None
    pairing_preferences: str | None = Field(default=None, max_length=2000)
    pairing_candidate_limit: int | None = Field(default=None, ge=5, le=50)


class AiGenerationRequest(BaseModel):
    locale: str = Field(default="it", pattern="^(it|en)$")
    model: str | None = Field(default=None, max_length=120)
    force_refresh: bool = False


class CellarCommandRequest(BaseModel):
    request_id: UUID
    text: str = Field(min_length=3, max_length=2000)
    locale: str = Field(default="it", pattern="^(it|en)$")
    timezone: str = Field(default="Europe/Zurich", min_length=1, max_length=80)


class CellarCommandExecuteRequest(BaseModel):
    wine_id: UUID


class CellarCommandWineCandidate(BaseModel):
    wine_id: UUID
    name: str
    producer: str = ""
    vintage: str = ""
    format: str = ""
    quantity: int


class CellarCommandCatalogCandidate(BaseModel):
    catalog_entry_id: UUID
    name: str
    producer: str = ""
    region: str = ""
    appellation: str = ""
    type: str = ""
    format: str = ""
    country: str = ""
    grapes_text: str = ""


class CellarCommandPurchaseDraft(BaseModel):
    catalog_entry_id: UUID | None = None
    lookup_source: Literal["catalog", "ai_required"]
    name: str
    producer: str = ""
    vintage: str = ""
    quantity: int = 1
    format: str = ""
    region: str = ""
    appellation: str = ""
    type: str = ""
    country: str = ""
    grapes_text: str = ""
    price: Decimal | None = None
    currency: str = ""
    merchant: str = ""
    order_date: str = ""


class CellarCommandTasting(BaseModel):
    consumed_at: str = ""
    note: str = ""
    score_value: Decimal | None = None
    score_scale: int | None = None
    enjoyment: CellarCommandEnjoyment = ""
    occasion: str = ""
    pairing: str = ""
    companions: str = ""


class CellarCommandResponse(BaseModel):
    command_id: UUID
    status: CellarCommandStatus
    intent: str = "unsupported"
    message: str
    candidates: list[CellarCommandWineCandidate] = Field(default_factory=list)
    catalog_candidates: list[CellarCommandCatalogCandidate] = Field(default_factory=list)
    matched_wine: CellarCommandWineCandidate | None = None
    tasting: CellarCommandTasting | None = None
    purchase_draft: CellarCommandPurchaseDraft | None = None
    previous_quantity: int | None = None
    new_quantity: int | None = None
    model: str = ""
    estimated_cost_usd: Decimal = Decimal("0")


class WineLabelEnrichmentRequest(AiGenerationRequest):
    label: str = Field(min_length=2, max_length=260)
    source: str = Field(default="label", pattern="^(label|manual|photo)$")
    confirmed_name: str = Field(default="", max_length=160)
    confirmed_producer: str = Field(default="", max_length=160)
    confirmed_vintage: str = Field(default="", max_length=4)
    confirmed_appellation: str = Field(default="", max_length=160)


class WineLabelEnrichmentResponse(BaseModel):
    name: str = ""
    producer: str = ""
    vintage: str = ""
    type: str = ""
    region: str = ""
    appellation: str = ""
    country: str = ""
    grapes_text: str = ""
    confidence: str = "low"
    notes: str = ""


class WishlistPortfolioStrategyRequest(AiGenerationRequest):
    wishlist_list_id: UUID | None = None


class RegionalGapCurrentAllocation(BaseModel):
    region: str = Field(min_length=1, max_length=80)
    current_pct: Decimal = Field(ge=0, le=100)
    value_chf: Decimal = Field(ge=0)


class RegionalGapTarget(BaseModel):
    region: str = Field(min_length=1, max_length=80)
    target_pct: Decimal = Field(ge=0, le=100)


class RegionalGapTargetSuggestionRequest(AiGenerationRequest):
    profile: str = Field(pattern="^(investment|readiness|daily|balanced)$")
    current_allocation: list[RegionalGapCurrentAllocation] = Field(min_length=1, max_length=12)


class RegionalGapTargetSuggestionResponse(BaseModel):
    model: str
    reasoning_effort: str = ""
    profile: str
    rationale: str = ""
    targets: list[RegionalGapTarget] = Field(default_factory=list)
    estimated_cost_usd: Decimal = Decimal("0")


class PairingRequest(AiGenerationRequest):
    dish: str = Field(default="", max_length=240)
    target_wine_id: UUID | None = None
    dietary_preferences: str = Field(default="", max_length=600)
    allergies: str = Field(default="", max_length=600)
    max_price_chf: Decimal | None = Field(default=None, gt=0, le=100000)
    include_market: bool = False
    market_only: bool = False
    only_ideal_drink_window: bool = False
    ignore_preferences: bool = False
    prefer_local_wines: bool = False
    local_origin: str = Field(default="", max_length=160)


class PairingCellarMatch(BaseModel):
    wine_id: UUID
    wine_name: str
    producer: str = ""
    reason: str = ""
    serving_note: str = ""


class PairingMarketWine(BaseModel):
    name: str
    producer: str = ""
    price_hint: str = ""
    reason: str = ""


class PairingDishRecommendation(BaseModel):
    name: str
    description: str = ""
    why_it_works: str = ""
    dietary_note: str = ""


class PairingResponse(BaseModel):
    summary: str = ""
    model: str
    reasoning_effort: str = ""
    cellar_matches: list[PairingCellarMatch] = Field(default_factory=list)
    market_recommendations: dict[str, list[PairingMarketWine]] = Field(default_factory=dict)
    dish_recommendations: list[PairingDishRecommendation] = Field(default_factory=list)
    estimated_cost_usd: Decimal = Decimal("0")


class TastingReflectionRequest(AiGenerationRequest):
    wine_id: UUID
    tasting_id: UUID
    personal_feedback: str = Field(default="", max_length=1200)


class TastingReflectionResponse(BaseModel):
    feedback: str = ""
    pairing_score: int = Field(ge=1, le=10)
    advice: str = ""
    model: str
    reasoning_effort: str = ""
    estimated_cost_usd: Decimal = Decimal("0")


class BuyingAdviceRequest(AiGenerationRequest):
    purpose: str = Field(pattern="^(drink_now|cellar|pairing)$")
    pairing_with: str = Field(default="", max_length=240)
    preferences: str = Field(default="", max_length=600)
    needed_by: str = Field(pattern="^(today|tomorrow|can_wait)$")
    location: str = Field(min_length=2, max_length=160)
    min_price_chf: Decimal | None = Field(default=None, gt=0, le=100000)
    max_price_chf: Decimal | None = Field(default=None, gt=0, le=100000)


class BuyingRecommendation(BaseModel):
    name: str
    producer: str = ""
    vintage: str = ""
    merchant: str
    merchant_type: str = "online"
    price: str = ""
    currency: str = "CHF"
    availability: str = ""
    delivery_estimate: str = ""
    source_url: str
    reason: str = ""
    local: bool = False
    confidence: str = "medium"


class BuyingAdviceResponse(BaseModel):
    summary: str = ""
    model: str
    reasoning_effort: str = ""
    recommendations: list[BuyingRecommendation] = Field(default_factory=list)
    warning: str = ""
    estimated_cost_usd: Decimal = Decimal("0")


class WineCompareRequest(AiGenerationRequest):
    wine_ids: list[UUID] = Field(min_length=2, max_length=2)


class WineCompareResponse(BaseModel):
    model: str
    reasoning_effort: str = ""
    style_profile: str
    readiness: str
    occasion: str
    cellar_value: str
    verdict: str
    estimated_cost_usd: Decimal


class WishlistPortfolioStrategyResponse(BaseModel):
    model: str
    reasoning_effort: str = ""
    overview: str
    buy_now: str
    wait_watch: str
    allocation: str
    next_step: str
    wishlist_list_id: UUID | None = None
    wishlist_list_name: str = ""
    item_count: int = 0
    generated_at: datetime | None = None
    estimated_cost_usd: Decimal
