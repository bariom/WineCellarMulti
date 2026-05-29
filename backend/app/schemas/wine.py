from datetime import date, datetime
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
    current_value: Decimal | None = Field(default=None, ge=0)
    status: str = "Ordered"
    format: str = ""
    type: str = ""
    region: str = ""
    appellation: str = ""
    merchant: str = ""
    order_date: date | None = None
    expected_delivery: date | None = None
    owner_share_pct: Decimal = Field(default=Decimal("100"), ge=0, le=100)
    notes: str = ""
    ai_notes: str = ""
    drink_from: int | None = None
    drink_peak_from: int | None = None
    drink_peak_to: int | None = None
    drink_to: int | None = None
    drink_window_notes: str = ""
    ai_value_notes: str = ""
    ai_value_estimated_at: datetime | None = None
    rating: int = Field(default=0, ge=0, le=6)
    owners: list[dict] = Field(default_factory=list)
    tags: list[str] = Field(default_factory=list)
    grapes: list[dict] = Field(default_factory=list)
    scores: list[dict] = Field(default_factory=list)


class WineUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=200)
    producer: str | None = None
    vintage: str | None = None
    quantity: int | None = Field(default=None, ge=0)
    currency: str | None = None
    price: Decimal | None = Field(default=None, ge=0)
    current_value: Decimal | None = Field(default=None, ge=0)
    status: str | None = None
    format: str | None = None
    type: str | None = None
    region: str | None = None
    appellation: str | None = None
    merchant: str | None = None
    order_date: date | None = None
    expected_delivery: date | None = None
    owner_share_pct: Decimal | None = Field(default=None, ge=0, le=100)
    notes: str | None = None
    ai_notes: str | None = None
    drink_from: int | None = None
    drink_peak_from: int | None = None
    drink_peak_to: int | None = None
    drink_to: int | None = None
    drink_window_notes: str | None = None
    ai_value_notes: str | None = None
    ai_value_estimated_at: datetime | None = None
    rating: int | None = Field(default=None, ge=0, le=6)
    owners: list[dict] | None = None
    tags: list[str] | None = None
    grapes: list[dict] | None = None
    scores: list[dict] | None = None


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
    current_value: Decimal | None = None
    status: str
    format: str
    type: str
    region: str
    appellation: str
    merchant: str
    order_date: date | None = None
    expected_delivery: date | None = None
    owner_share_pct: Decimal
    notes: str
    ai_notes: str
    drink_from: int | None = None
    drink_peak_from: int | None = None
    drink_peak_to: int | None = None
    drink_to: int | None = None
    drink_window_notes: str
    ai_value_notes: str
    ai_value_estimated_at: datetime | None = None
    rating: int
    owners: list[dict]
    tags: list[str]
    grapes: list[dict]
    scores: list[dict]
