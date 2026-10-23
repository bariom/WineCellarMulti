from decimal import Decimal
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

from app.schemas.ai import CellarCommandCatalogCandidate


class BottlePhotoExistingWine(BaseModel):
    wine_id: UUID
    name: str
    producer: str = ""
    vintage: str = ""
    quantity: int = 0


class BottlePhotoRow(BaseModel):
    """One wine read in the photos, with its bottles counted and its matches."""

    name: str
    producer: str = ""
    vintage: str = ""
    format: str = ""
    style: str = ""
    region: str = ""
    quantity: int = Field(default=1, ge=1)
    confidence: Literal["high", "medium", "low"] = "low"
    # Where its label is, normalized to the photo, for a thumbnail.
    image_index: int = 0
    x: float = 0
    y: float = 0
    width: float = 0
    height: float = 0
    existing_wine: BottlePhotoExistingWine | None = None
    catalog: CellarCommandCatalogCandidate | None = None


class BottlePhotoScanResult(BaseModel):
    rows: list[BottlePhotoRow] = Field(default_factory=list)
    photo_count: int = 1
    model: str = ""
    estimated_cost_usd: Decimal = Decimal("0")


class BottlePhotoScanStatus(BaseModel):
    id: UUID
    status: Literal["running", "done", "failed"]
    stage: Literal["reading", "matching", "done"]
    photos_total: int = 0
    photos_done: int = 0
    wines_found: int = 0
    error: str = ""
    result: BottlePhotoScanResult | None = None


class BottlePhotoConfirmRow(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    name: str = Field(min_length=1, max_length=200)
    producer: str = Field(default="", max_length=200)
    vintage: str = Field(default="", max_length=16)
    format: str = Field(default="", max_length=80)
    type: str = Field(default="", max_length=40)
    region: str = Field(default="", max_length=120)
    appellation: str = Field(default="", max_length=120)
    country: str = Field(default="", max_length=120)
    quantity: int = Field(ge=1, le=10000)
    price: Decimal | None = Field(default=None, ge=0, le=1000000)
    # Add the bottles to this wine of the cellar instead of creating a new one.
    existing_wine_id: UUID | None = None


class BottlePhotoConfirmation(BaseModel):
    model_config = ConfigDict(extra="forbid")

    rows: list[BottlePhotoConfirmRow] = Field(min_length=1, max_length=120)
    locale: str = Field(default="it", pattern="^(it|en)$")


class BottlePhotoConfirmResult(BaseModel):
    created_wine_ids: list[UUID] = Field(default_factory=list)
    updated_wine_ids: list[UUID] = Field(default_factory=list)
    bottles: int = 0
    # How many reviewed rows were saved, in order, before the free-tier label limit.
    saved_rows: int = 0
    limit_reached: bool = False
