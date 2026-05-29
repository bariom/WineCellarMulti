from datetime import date
from decimal import Decimal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class WineCreate(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    producer: str = ""
    vintage: str = ""
    quantity: int = Field(default=0, ge=0)
    currency: str = "CHF"
    price: Decimal = Field(default=Decimal("0"), ge=0)
    status: str = "Ordered"
    expected_delivery: date | None = None
    notes: str = ""


class WineUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=200)
    producer: str | None = None
    vintage: str | None = None
    quantity: int | None = Field(default=None, ge=0)
    currency: str | None = None
    price: Decimal | None = Field(default=None, ge=0)
    status: str | None = None
    expected_delivery: date | None = None
    notes: str | None = None


class WineResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    household_id: UUID
    name: str
    producer: str
    vintage: str
    quantity: int
    currency: str
    price: Decimal
    status: str
    expected_delivery: date | None = None
    notes: str
