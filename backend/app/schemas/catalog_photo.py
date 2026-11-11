"""Contracts of the app-admin catalog enrichment from photos."""

from __future__ import annotations

from decimal import Decimal
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, Field

from app.schemas.catalog import CatalogWineResponse

CatalogPhotoMode = Literal["shelf", "close"]
CatalogPhotoMatchStatus = Literal["known", "pending", "uncertain", "new"]


class CatalogPhotoBottle(BaseModel):
    """A label read on a photo, with what the catalog already knows about it.

    The label box (x, y, width, height) and the bottle's top and bottom are
    ratios of the photo it was read on.
    """

    name: str = ""
    producer: str = ""
    vintage: str = ""
    wine_type: str = ""
    region: str = ""
    appellation: str = ""
    country: str = ""
    confidence: Literal["high", "medium", "low"] = "low"
    image_index: int = 0
    x: float = 0
    y: float = 0
    width: float = 0
    height: float = 0
    bottle_top: float = 0
    bottle_bottom: float = 0
    whole_bottle: bool = False
    status: CatalogPhotoMatchStatus = "new"
    entry: CatalogWineResponse | None = None
    candidates: list[CatalogWineResponse] = Field(default_factory=list)
    missing_fields: list[str] = Field(default_factory=list)


class CatalogPhotoScanResult(BaseModel):
    bottles: list[CatalogPhotoBottle] = Field(default_factory=list)
    photo_count: int = 0
    unread_sections: int = 0
    model: str = ""
    estimated_cost_usd: Decimal = Decimal("0")


class CatalogPhotoScanStatus(BaseModel):
    id: UUID
    mode: CatalogPhotoMode = "shelf"
    status: Literal["running", "done", "failed"] = "running"
    stage: Literal["reading", "matching", "done"] = "reading"
    sections_total: int = 0
    sections_done: int = 0
    bottles_found: int = 0
    error: str = ""
    result: CatalogPhotoScanResult | None = None
