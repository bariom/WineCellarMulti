from datetime import datetime
from decimal import Decimal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class AiAuditLogResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    household_id: UUID
    user_id: UUID | None = None
    entity_type: str
    entity_id: UUID
    feature: str
    model: str
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
    ai_notes_model: str
    drink_window_model: str
    value_model: str
    grape_model: str
    wishlist_model: str
    pairing_model: str
    pairing_preferences: str = ""
    model_options: list[str]


class AiSettingsUpdate(BaseModel):
    openai_api_key: str | None = None
    provider_mode: str | None = Field(default=None, pattern="^(auto|user_key|credits)$")
    ai_notes_model: str | None = None
    drink_window_model: str | None = None
    value_model: str | None = None
    grape_model: str | None = None
    wishlist_model: str | None = None
    pairing_model: str | None = None
    pairing_preferences: str | None = Field(default=None, max_length=2000)


class AiGenerationRequest(BaseModel):
    locale: str = Field(default="it", pattern="^(it|en)$")


class WineLabelEnrichmentRequest(AiGenerationRequest):
    label: str = Field(min_length=2, max_length=260)
    source: str = Field(default="label", pattern="^(label|manual)$")


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


class PairingRequest(BaseModel):
    dish: str = Field(min_length=2, max_length=240)
    max_price_chf: Decimal | None = Field(default=None, gt=0, le=100000)
    include_market: bool = False
    market_only: bool = False
    ignore_preferences: bool = False
    locale: str = Field(default="it", pattern="^(it|en)$")


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


class PairingResponse(BaseModel):
    summary: str = ""
    model: str
    cellar_matches: list[PairingCellarMatch] = Field(default_factory=list)
    market_recommendations: dict[str, list[PairingMarketWine]] = Field(default_factory=dict)
    estimated_cost_usd: Decimal = Decimal("0")


class WineCompareRequest(BaseModel):
    wine_ids: list[UUID] = Field(min_length=2, max_length=2)
    locale: str = Field(default="it", pattern="^(it|en)$")


class WineCompareResponse(BaseModel):
    model: str
    style_profile: str
    readiness: str
    occasion: str
    cellar_value: str
    verdict: str
    estimated_cost_usd: Decimal


class WishlistPortfolioStrategyResponse(BaseModel):
    model: str
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
