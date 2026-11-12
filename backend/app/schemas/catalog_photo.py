"""Contracts of the app-admin catalog enrichment from photos."""

from __future__ import annotations

from decimal import Decimal
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, Field

from app.schemas.catalog import CatalogWineResponse

CatalogPhotoMode = Literal["shelf", "close"]
CatalogPhotoMatchStatus = Literal["known", "pending", "uncertain", "new"]
# Why a bottle's photo is not good enough for the shared photo library.
CatalogPhotoIssue = Literal["", "uncertain", "cut", "small", "blurry", "dark", "bright", "crowded"]


# Why a wine chosen for automatic saving was left for review instead.
CatalogPhotoAutoReason = Literal[
    "", "uncertain_reading", "ambiguous", "not_found", "incomplete", "failed"
]


class CatalogPhotoSource(BaseModel):
    url: str
    title: str = ""


class CatalogPhotoDetails(BaseModel):
    """What a web search found about a wine, already checked against the label and the sources."""

    found: bool = False
    name: str = ""
    producer: str = ""
    appellation: str = ""
    region: str = ""
    country: str = ""
    wine_type: str = ""
    grapes: list[str] = Field(default_factory=list)
    description: str = ""
    drink_from: int | None = None
    drink_peak_from: int | None = None
    drink_peak_to: int | None = None
    drink_to: int | None = None
    drink_notes: str = ""
    sources: list[CatalogPhotoSource] = Field(default_factory=list)


class CatalogPhotoCheck(BaseModel):
    """Whether the bottle can go to the shared photo library, checked without AI."""

    ok: bool = False
    issue: CatalogPhotoIssue = ""
    has_library_photo: bool = False


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
    photo: CatalogPhotoCheck = Field(default_factory=CatalogPhotoCheck)
    details: CatalogPhotoDetails | None = None
    saved: bool = False
    photo_saved: bool = False
    # Outcome of the automatic saving, when the admin chose it for this wine.
    auto: Literal["", "saved", "review"] = ""
    auto_reason: CatalogPhotoAutoReason = ""


class CatalogPhotoScanResult(BaseModel):
    bottles: list[CatalogPhotoBottle] = Field(default_factory=list)
    photo_count: int = 0
    unread_sections: int = 0
    model: str = ""
    estimated_cost_usd: Decimal = Decimal("0")
    details_cost_usd: Decimal = Decimal("0")


class CatalogPhotoScanStatus(BaseModel):
    id: UUID
    mode: CatalogPhotoMode = "shelf"
    status: Literal["running", "done", "failed"] = "running"
    stage: Literal["reading", "matching", "researching", "saving", "done"] = "reading"
    sections_total: int = 0
    sections_done: int = 0
    bottles_found: int = 0
    error: str = ""
    result: CatalogPhotoScanResult | None = None


class CatalogPhotoDetailsRequest(BaseModel):
    """The bottles (positions in the result) whose details the admin wants researched."""

    bottles: list[int] = Field(min_length=1, max_length=10)


class CatalogPhotoSave(BaseModel):
    """A bottle reviewed by the admin, saved to the catalog.

    entry_id completes an existing entry (the matched one or a candidate the admin
    chose); without it a new approved entry is created. The sources are never taken
    from the client: they are the ones the research verified.
    """

    entry_id: UUID | None = None
    name: str = Field(min_length=1, max_length=200)
    producer: str = Field(default="", max_length=200)
    appellation: str = Field(default="", max_length=120)
    region: str = Field(default="", max_length=120)
    country: str = Field(default="", max_length=120)
    type: str = Field(default="", max_length=80)
    grapes_text: str = Field(default="", max_length=400)
    description: str = Field(default="", max_length=1500)
    drink_from: int | None = Field(default=None, ge=1800, le=2200)
    drink_peak_from: int | None = Field(default=None, ge=1800, le=2200)
    drink_peak_to: int | None = Field(default=None, ge=1800, le=2200)
    drink_to: int | None = Field(default=None, ge=1800, le=2200)
    save_photo: bool = False
    replace_photo: bool = False


class CatalogPhotoSaveResult(BaseModel):
    bottle: CatalogPhotoBottle
    photo: Literal["saved", "exists", "skipped", "failed"] = "skipped"
