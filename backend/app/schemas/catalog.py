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
