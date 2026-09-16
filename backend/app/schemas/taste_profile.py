from __future__ import annotations

from datetime import datetime
from decimal import Decimal
from typing import Literal
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


class SensoryMetadataEnrichmentResponse(SensoryProfileResponse):
    metadata_updated: list[str] = Field(default_factory=list)
    estimated_cost_usd: str = "0"


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


class TasteProfileEvidence(BaseModel):
    tasting_rating_count: int = 0
    enjoyment_only_count: int = 0
    direct_rating_count: int = 0
    unique_wine_count: int = 0
    sensory_covered_count: int = 0
    sensory_missing_count: int = 0


class TasteProfileCollectionResponse(BaseModel):
    profiles: list[TasteProfileResponse] = Field(default_factory=list)
    evidence: TasteProfileEvidence = Field(default_factory=TasteProfileEvidence)


class TasteProfileAlgorithmDimension(BaseModel):
    dimension: str
    v2_preference: float | None = None
    v2_confidence: float | None = None
    v3_preference: float | None = None
    v3_confidence: float | None = None
    scale_gap: float | None = None


class TasteProfileAlgorithmCategory(BaseModel):
    category: str
    sample_count: int
    v2_version: int
    v2_confidence: float
    v3_version: int | None = None
    v3_confidence: float | None = None
    dimensions: list[TasteProfileAlgorithmDimension] = Field(default_factory=list)
    rebuilt_at: datetime


class TasteProfileAlgorithmValidation(BaseModel):
    status: Literal["ready", "insufficient"]
    method: Literal["leave_one_experience_out"] = "leave_one_experience_out"
    tested_experiences: int = 0
    positive_experiences: int = 0
    negative_experiences: int = 0
    v2_mean_absolute_error: float | None = None
    v3_mean_absolute_error: float | None = None
    winner: Literal["v2", "v3", "tie", "insufficient"] = "insufficient"


class TasteProfileAlgorithmDiagnostics(BaseModel):
    mode: Literal["shadow"] = "shadow"
    active_version: int = 2
    candidate_version: int = 3
    categories: list[TasteProfileAlgorithmCategory] = Field(default_factory=list)
    validation: TasteProfileAlgorithmValidation


class LegacyTastingClaimStatus(BaseModel):
    unassigned_count: int


class LegacyTastingClaimResponse(TasteProfileCollectionResponse):
    claimed_count: int


class ExternalTastingEnrichmentPreview(BaseModel):
    missing_count: int = 0
    items: list[ExternalTastingEnrichmentItem] = Field(default_factory=list)


class ExternalTastingEnrichmentItem(BaseModel):
    id: UUID
    name: str
    producer: str = ""
    vintage: str = ""
    type: str = ""
    region: str = ""
    appellation: str = ""


class ExternalTastingEnrichmentResultItem(BaseModel):
    id: UUID
    name: str
    profile_status: Literal["available", "unresolved"]
    catalog_status: Literal["pending", "existing", "not_proposed", "failed"]
    issue: Literal[
        "",
        "missing_name",
        "missing_producer",
        "missing_vintage",
        "profile_generation_failed",
        "catalog_save_failed",
        "processing_error",
    ] = ""


class ExternalTastingEnrichmentResponse(TasteProfileCollectionResponse):
    processed_count: int = 0
    enriched_count: int = 0
    unresolved_count: int = 0
    catalog_pending_count: int = 0
    catalog_existing_count: int = 0
    results: list[ExternalTastingEnrichmentResultItem] = Field(default_factory=list)
    estimated_cost_usd: Decimal = Decimal("0")


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
