from decimal import Decimal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class WishlistBase(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    producer: str = ""
    vintage: str = ""
    format: str = ""
    type: str = ""
    region: str = ""
    appellation: str = ""
    target_price: Decimal = Field(default=Decimal("0"), ge=0)
    currency: str = "CHF"
    merchant: str = ""
    priority: str = "Medium"
    purpose: str = "Drink"
    status: str = "Evaluate"
    status_source: str = "manual"
    is_shared: str = "0"
    notes: str = ""
    ai_strategy: str = ""
    ai_purpose_advice: str = ""


class WishlistCreate(WishlistBase):
    pass


class WishlistUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=200)
    producer: str | None = None
    vintage: str | None = None
    format: str | None = None
    type: str | None = None
    region: str | None = None
    appellation: str | None = None
    target_price: Decimal | None = Field(default=None, ge=0)
    currency: str | None = None
    merchant: str | None = None
    priority: str | None = None
    purpose: str | None = None
    status: str | None = None
    status_source: str | None = None
    is_shared: str | None = None
    notes: str | None = None
    ai_strategy: str | None = None
    ai_purpose_advice: str | None = None


class WishlistResponse(WishlistBase):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    household_id: UUID
