from decimal import Decimal
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, Field, field_validator

from app.core.wine_types import CANONICAL_WINE_TYPES, normalize_wine_type


class CatalogRecoveryResult(BaseModel):
    scanned: int = Field(default=0, ge=0)
    created: int = Field(default=0, ge=0)
    existing: int = Field(default=0, ge=0)
    skipped: int = Field(default=0, ge=0)


class CatalogWineResponse(BaseModel):
    id: UUID
    name: str
    producer: str = ""
    region: str = ""
    wine_zone: str = ""
    locality: str = ""
    appellation: str = ""
    type: str = ""
    format: str = ""
    country: str = ""
    grapes_text: str = ""
    source: str = "manual"
    is_active: bool = True


class CatalogWineCreate(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    producer: str = ""
    region: str = ""
    wine_zone: str = Field(default="", max_length=120)
    locality: str = Field(default="", max_length=240)
    appellation: str = ""
    type: str = ""
    format: str = ""
    country: str = ""
    grapes_text: str = ""
    aliases: list[str] = Field(default_factory=list)


class CatalogWineMetadataUpdate(BaseModel):
    model_config = {"extra": "forbid"}

    region: str = Field(max_length=120)
    wine_zone: str = Field(default="", max_length=120)
    locality: str = Field(default="", max_length=240)
    appellation: str = Field(max_length=120)
    type: str = Field(max_length=80)
    format: str = Field(max_length=80)
    country: str = Field(max_length=120)
    grapes_text: str = Field(max_length=2000)

    @field_validator(
        "region", "wine_zone", "locality", "appellation", "format", "country", "grapes_text"
    )
    @classmethod
    def trim_metadata(cls, value: str) -> str:
        return value.strip()

    @field_validator("type")
    @classmethod
    def valid_type(cls, value: str) -> str:
        normalized = normalize_wine_type(value)
        if normalized and normalized not in CANONICAL_WINE_TYPES:
            raise ValueError("Unsupported wine type")
        return normalized


class WineImageRecognitionCandidate(BaseModel):
    producer: str = ""
    estate: str = ""
    wine_name: str = ""
    cuvee: str = ""
    vintage: str = ""
    appellation: str = ""
    region: str = ""
    country: str = ""
    wine_type: str = ""


class WineImageRecognitionResponse(WineImageRecognitionCandidate):
    recognition_id: UUID
    status: Literal["recognized", "ambiguous", "not_recognized", "invalid_image", "error"]
    label_text: list[str] = Field(default_factory=list)
    alternative_candidates: list[WineImageRecognitionCandidate] = Field(default_factory=list)
    needs_user_confirmation: bool = True
    recognition_notes: list[str] = Field(default_factory=list)
    provider: Literal["luna"]
    matches: list[CatalogWineResponse] = Field(default_factory=list)
    estimated_cost_usd: Decimal = Decimal("0")


class WineImageRecognitionConfirmation(BaseModel):
    recognition_id: UUID
    corrected: bool = False
    candidate: WineImageRecognitionCandidate | None = None


class WineImageRecognitionConfirmationResponse(BaseModel):
    catalog_entry_id: UUID | None = None
    catalog_status: Literal["existing", "pending", "skipped"] = "skipped"
    sensory_profile_status: Literal["available", "pending", "skipped"] = "skipped"
    sensory_profile_source: str = ""
