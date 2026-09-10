from __future__ import annotations

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, Field


class SensoryProfileResponse(BaseModel):
    identity_id: UUID
    dimensions: dict[str, float | None] = Field(default_factory=dict)
    source: str
    confidence: float
    validated: bool
    generation_status: str
    generated_at: datetime


class TasteProfileResponse(BaseModel):
    category: str
    dimensions: dict[str, dict] = Field(default_factory=dict)
    attributes: dict[str, list[list[object]]] = Field(default_factory=dict)
    confidence: float
    sample_count: int
    tasting_count: int
    star_rating_count: int
    confidence_level: str
    rebuilt_at: datetime


class TasteProfileCollectionResponse(BaseModel):
    profiles: list[TasteProfileResponse] = Field(default_factory=list)


class LegacyTastingClaimStatus(BaseModel):
    unassigned_count: int


class LegacyTastingClaimResponse(TasteProfileCollectionResponse):
    claimed_count: int


class ExternalTastingEnrichmentPreview(BaseModel):
    missing_count: int = 0


class ExternalTastingEnrichmentResponse(TasteProfileCollectionResponse):
    processed_count: int = 0
    enriched_count: int = 0
    unresolved_count: int = 0


class TasteMatchResponse(BaseModel):
    score: float | None = None
    confidence: float
    matching_traits: list[str] = Field(default_factory=list)
    conflicting_traits: list[str] = Field(default_factory=list)


class SensoryProfileUpdate(BaseModel):
    dimensions: dict[str, float | None]
    validated: bool | None = None


class SensoryBaselineInput(BaseModel):
    entity_type: str = Field(min_length=1, max_length=24)
    entity_key: str = Field(min_length=1, max_length=240)
    dimensions: dict[str, float | None]
    confidence: float = Field(default=0.5, ge=0, le=1)
    is_active: bool = True


class SensoryBaselineResponse(SensoryBaselineInput):
    id: UUID


class BatchEnrichmentRequest(BaseModel):
    limit: int = Field(default=100, ge=1, le=1000)
    allow_ai: bool = True


class BatchEnrichmentPreview(BaseModel):
    missing: int
    deterministic: int
    requires_ai: int


class BatchProfileApprovalResponse(BaseModel):
    approved: int
