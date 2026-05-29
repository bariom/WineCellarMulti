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
