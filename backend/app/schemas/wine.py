from datetime import date, datetime
from decimal import Decimal
from typing import Literal
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
    value_not_found: bool = False
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
    grapes_source_url: str = ""
    grapes_source_title: str = ""
    grapes_verified_at: datetime | None = None
    grapes_not_applicable: bool = False
    scores: list[dict] = Field(default_factory=list)
    scores_not_applicable: bool = False


class WineUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=200)
    producer: str | None = None
    vintage: str | None = None
    quantity: int | None = Field(default=None, ge=0)
    currency: str | None = None
    price: Decimal | None = Field(default=None, ge=0)
    current_value: Decimal | None = Field(default=None, ge=0)
    value_not_found: bool | None = None
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
    grapes_source_url: str | None = None
    grapes_source_title: str | None = None
    grapes_verified_at: datetime | None = None
    grapes_not_applicable: bool | None = None
    scores: list[dict] | None = None
    scores_not_applicable: bool | None = None


class WineTastingEntryResponse(BaseModel):
    id: UUID
    consumed_at: date
    note: str
    rating: int = Field(default=0, ge=0, le=6)
    enjoyment: Literal["", "positive", "negative"] = ""
    occasion: str = ""
    pairing: str = ""
    companions: str = ""
    created_at: datetime


class TastingArchiveItemResponse(BaseModel):
    wine_id: UUID
    wine_name: str
    wine_producer: str = ""
    wine_vintage: str = ""
    wine_format: str = ""
    wine_type: str = ""
    wine_region: str = ""
    wine_appellation: str = ""
    wine_status: str = ""
    consumed_at: date
    note: str = ""
    rating: int = Field(default=0, ge=0, le=6)
    enjoyment: Literal["", "positive", "negative"] = ""
    occasion: str = ""
    pairing: str = ""
    companions: str = ""
    created_at: datetime
    tasting_id: UUID


class TastingArchiveProfileResponse(BaseModel):
    wine_type: str = "Other"
    currency: str = "CHF"
    count: int = 0
    purchase_total: float = 0
    comparable_purchase_total: float = 0
    market_value_total: float = 0
    comparable_count: int = 0


class TastingArchivePageResponse(BaseModel):
    total: int
    limit: int
    offset: int
    rated_count: int
    notes_count: int
    latest_consumed_at: date | None = None
    profile: list[TastingArchiveProfileResponse] = Field(default_factory=list)
    items: list[TastingArchiveItemResponse] = Field(default_factory=list)


class WineConsume(BaseModel):
    consumed_at: date | None = None
    note: str = ""
    tasting_rating: int = Field(default=0, ge=0, le=6)
    tasting_enjoyment: Literal["", "positive", "negative"] = ""
    tasting_occasion: str = ""
    tasting_pairing: str = ""
    tasting_companions: str = ""


class WineTastingEntryUpdate(BaseModel):
    consumed_at: date
    note: str = ""
    tasting_rating: int = Field(default=0, ge=0, le=6)
    tasting_enjoyment: Literal["", "positive", "negative"] = ""
    tasting_occasion: str = ""
    tasting_pairing: str = ""
    tasting_companions: str = ""


class WineValueHistoryResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    value: Decimal
    currency: str
    source: str
    recorded_at: datetime


class WineResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    details_loaded: bool = True
    shared_data_features: list[str] = Field(default_factory=list)
    shared_data_updated_at: datetime | None = None
    household_id: UUID
    name: str
    producer: str
    vintage: str
    quantity: int
    currency: str
    price: Decimal
    current_value: Decimal | None = None
    value_not_found: bool = False
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
    grapes_source_url: str = ""
    grapes_source_title: str = ""
    grapes_verified_at: datetime | None = None
    grapes_not_applicable: bool = False
    scores: list[dict]
    scores_not_applicable: bool = False
    vineyard_name: str = ""
    vineyard_locality: str = ""
    vineyard_country: str = ""
    vineyard_latitude: float | None = None
    vineyard_longitude: float | None = None
    vineyard_precision: Literal["", "vineyard", "estate", "locality", "appellation"] = ""
    vineyard_source_url: str = ""
    vineyard_source_title: str = ""
    vineyard_notes: str = ""
    vineyard_verified_at: datetime | None = None
    vineyard_not_found: bool = False
    photo_thumbnail_url: str = ""
    photo_detail_url: str = ""
    created_at: datetime
    tasting_history: list[WineTastingEntryResponse] = Field(default_factory=list)
    value_history: list[WineValueHistoryResponse] = Field(default_factory=list)


class WineShareOfferCreate(BaseModel):
    email: str = Field(min_length=3, max_length=320)
    share_pct: Decimal = Field(gt=0, le=100)
    message: str = ""


class WineShareOfferRecipientResponse(BaseModel):
    email: str
    display_name: str
    share_pct: Decimal


class WineShareOfferResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    wine_id: UUID
    wine_name: str
    wine_vintage: str
    created_by_email: str
    recipient_email: str
    share_pct: Decimal
    message: str
    status: str
    created_at: datetime
    decided_at: datetime | None = None
