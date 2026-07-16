from datetime import datetime
from typing import Any
from uuid import UUID

from pydantic import BaseModel, Field


class NotificationResponse(BaseModel):
    id: UUID
    kind: str
    title: str
    message: str
    action_url: str | None
    created_at: datetime
    read_at: datetime | None


class NotificationCenterItem(BaseModel):
    id: str
    source: str
    kind: str
    category: str
    state: str
    title: str
    message: str
    action_url: str | None = None
    action_kind: str = "open"
    resource_id: UUID | None = None
    actor_label: str | None = None
    created_at: datetime
    read_at: datetime | None = None
    metadata: dict[str, Any] = Field(default_factory=dict)


class NotificationCenterCounts(BaseModel):
    total: int
    unread: int
    actionable: int
    actions: int
    updates: int
    system: int


class NotificationCenterResponse(BaseModel):
    items: list[NotificationCenterItem]
    counts: NotificationCenterCounts
