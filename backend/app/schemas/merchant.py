from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict


class MerchantResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    name: str
    created_at: datetime
