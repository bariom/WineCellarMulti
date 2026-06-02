from datetime import datetime
from uuid import UUID

from pydantic import BaseModel


class NotificationResponse(BaseModel):
    id: UUID
    kind: str
    title: str
    message: str
    action_url: str | None
    created_at: datetime
    read_at: datetime | None
