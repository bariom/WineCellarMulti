from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class AnnouncementCreate(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True, extra="forbid")

    id: UUID
    title: str = Field(min_length=1, max_length=180)
    message: str = Field(min_length=1, max_length=4000)
    action_url: Literal["/home", "/cellar", "/pulse"] | None = None
    confirm: Literal[True]


class AnnouncementResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    title: str
    message: str
    action_url: str | None
    recipient_count: int
    created_by_user_id: UUID | None
    created_at: datetime


class AnnouncementAudience(BaseModel):
    recipient_count: int
