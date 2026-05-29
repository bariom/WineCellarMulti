from datetime import datetime
from decimal import Decimal
from uuid import UUID

from pydantic import BaseModel, ConfigDict


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
    ai_notes_model: str
    drink_window_model: str
    value_model: str
    grape_model: str
    wishlist_model: str
    model_options: list[str]


class AiSettingsUpdate(BaseModel):
    openai_api_key: str | None = None
    ai_notes_model: str | None = None
    drink_window_model: str | None = None
    value_model: str | None = None
    grape_model: str | None = None
    wishlist_model: str | None = None
