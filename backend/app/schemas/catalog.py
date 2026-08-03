from typing import Literal
from uuid import UUID

from pydantic import BaseModel, Field


class CatalogWineResponse(BaseModel):
    id: UUID
    name: str
    producer: str = ""
    region: str = ""
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
    appellation: str = ""
    type: str = ""
    format: str = ""
    country: str = ""
    grapes_text: str = ""
    aliases: list[str] = Field(default_factory=list)


class CatalogRecognitionSuggestion(BaseModel):
    label: str
    confidence: float | None = None
    vintage: str = ""
    producer: str = ""
    region: str = ""
    appellation: str = ""
    type: str = ""


class CatalogRecognitionResponse(BaseModel):
    suggestions: list[CatalogRecognitionSuggestion] = Field(default_factory=list)
    matches: list[CatalogWineResponse] = Field(default_factory=list)
    raw_best_label: str = ""


class WineImageRecognitionCandidate(BaseModel):
    producer: str = ""
    estate: str = ""
    wine_name: str = ""
    cuvee: str = ""
    vintage: str = ""
    appellation: str = ""
    region: str = ""
    country: str = ""


class WineImageRecognitionResponse(WineImageRecognitionCandidate):
    recognition_id: UUID
    status: Literal["recognized", "ambiguous", "not_recognized", "invalid_image", "error"]
    label_text: list[str] = Field(default_factory=list)
    alternative_candidates: list[WineImageRecognitionCandidate] = Field(default_factory=list)
    needs_user_confirmation: bool = True
    recognition_notes: list[str] = Field(default_factory=list)
    provider: Literal["luna", "api4ai"]
    fallback_used: bool = False
    matches: list[CatalogWineResponse] = Field(default_factory=list)


class WineImageRecognitionConfirmation(BaseModel):
    recognition_id: UUID
    corrected: bool = False
