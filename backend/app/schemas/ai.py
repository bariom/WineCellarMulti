from datetime import datetime
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
    created_at: datetime


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
