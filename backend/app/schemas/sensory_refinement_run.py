from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict

from app.schemas.taste_profile import SensoryProfileResponse


class SensoryRefinementRunResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    identity_id: UUID
    name: str
    producer: str
    vintage: str
    status: Literal["queued", "running", "completed", "failed"]
    issue: str
    proposal: SensoryProfileResponse | None
    created_at: datetime
