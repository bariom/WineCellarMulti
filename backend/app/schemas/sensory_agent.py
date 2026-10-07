from datetime import datetime
from decimal import Decimal
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class SensoryResearchRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    max_wines: int = Field(default=10, ge=1, le=20)
    budget_usd: Decimal = Field(default=Decimal("1"), ge=Decimal("0.05"), le=Decimal("5"))
    wine_ids: list[UUID] | None = Field(default=None, min_length=1, max_length=20)


class SensoryResearchCandidate(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    name: str
    producer: str
    vintage: str


class ResearchEvidence(BaseModel):
    model_config = ConfigDict(extra="forbid")
    excerpt: str = Field(min_length=1, max_length=400)
    source_url: str = Field(min_length=1, max_length=500)


class ResearchTrait(ResearchEvidence):
    value: float = Field(ge=0, le=1, strict=True)
    basis: Literal["documented", "inferred"]


class ResearchAroma(ResearchEvidence):
    name: str = Field(min_length=1, max_length=80)


class ResearchDimensions(BaseModel):
    model_config = ConfigDict(extra="forbid")
    body: ResearchTrait | None
    acidity: ResearchTrait | None
    tannin: ResearchTrait | None
    sweetness: ResearchTrait | None
    aromatic_intensity: ResearchTrait | None
    fruit: ResearchTrait | None
    wood: ResearchTrait | None
    spice: ResearchTrait | None
    minerality: ResearchTrait | None


class ResearchComparison(BaseModel):
    model_config = ConfigDict(extra="forbid")
    dimension: Literal[
        "body",
        "acidity",
        "tannin",
        "sweetness",
        "aromatic_intensity",
        "fruit",
        "wood",
        "spice",
        "minerality",
    ]
    agreement: Literal["corroborated", "conflicting", "single_source"]
    independent: bool
    explanation: str = Field(min_length=1, max_length=400)
    evidence: list[ResearchEvidence] = Field(min_length=1, max_length=4)


class ResearchOutput(BaseModel):
    model_config = ConfigDict(extra="forbid")
    name: str = Field(max_length=240)
    producer: str = Field(max_length=240)
    vintage: str = Field(max_length=40)
    identity_confirmed: bool
    vintage_confirmed: bool
    summary: str = Field(max_length=1500)
    limitations: str = Field(max_length=800)
    comparisons: list[ResearchComparison] = Field(max_length=9)
    dimensions: ResearchDimensions
    aromas: list[ResearchAroma] = Field(max_length=12)


class SourceEvidence(ResearchEvidence):
    scope: Literal["exact_vintage", "wine_style", "other_vintage", "historical_nv"]
    vintage: str = Field(max_length=40)
    published_year: int | None = Field(ge=1900, le=2100)
    publisher: str = Field(min_length=1, max_length=160)
    role: Literal["producer", "critic", "retailer"]


class SourceTrait(SourceEvidence):
    value: float = Field(ge=0, le=1, strict=True)
    basis: Literal["documented", "inferred"]
    intensity_supported: bool


class SourceDimensions(BaseModel):
    model_config = ConfigDict(extra="forbid")
    body: SourceTrait | None
    acidity: SourceTrait | None
    tannin: SourceTrait | None
    sweetness: SourceTrait | None
    aromatic_intensity: SourceTrait | None
    fruit: SourceTrait | None
    wood: SourceTrait | None
    spice: SourceTrait | None
    minerality: SourceTrait | None


class SourceComparison(BaseModel):
    model_config = ConfigDict(extra="forbid")
    dimension: Literal[
        "body",
        "acidity",
        "tannin",
        "sweetness",
        "aromatic_intensity",
        "fruit",
        "wood",
        "spice",
        "minerality",
    ]
    agreement: Literal["corroborated", "conflicting", "single_source"]
    independent: bool
    explanation: str = Field(min_length=1, max_length=400)
    evidence: list[SourceEvidence] = Field(min_length=1, max_length=4)


class ResearchReference(BaseModel):
    model_config = ConfigDict(extra="forbid")
    name: str = Field(min_length=1, max_length=240)
    producer: str = Field(min_length=1, max_length=240)
    vintage: str = Field(max_length=40)
    wine_type: str = Field(max_length=80)
    appellation: str = Field(max_length=120)
    grapes: list[str] = Field(max_length=12)
    identity_confirmed: bool
    production_style_matches: bool
    identity_evidence: SourceEvidence
    production_evidence: list[SourceEvidence] = Field(max_length=2)
    dimensions: SourceDimensions


class CompleteResearchOutput(BaseModel):
    model_config = ConfigDict(extra="forbid")
    name: str = Field(max_length=240)
    producer: str = Field(max_length=240)
    vintage: str = Field(max_length=40)
    identity_confirmed: bool
    vintage_confirmed: bool
    identity_evidence: SourceEvidence
    summary: str = Field(max_length=1500)
    limitations: str = Field(max_length=800)
    dimensions: SourceDimensions
    comparisons: list[SourceComparison] = Field(max_length=9)
    references: list[ResearchReference] = Field(max_length=5)
    aromas: list[ResearchAroma] = Field(max_length=12)


class ProfileReference(BaseModel):
    name: str
    producer: str
    vintage: str
    similarity: float = Field(ge=0, le=1)
    value: float = Field(ge=0, le=1)
    evidence: SourceEvidence
    identity_evidence: SourceEvidence | None = None
    production_evidence: list[SourceEvidence] = Field(default_factory=list)


class CompletedDimension(BaseModel):
    value: float | None = Field(default=None, ge=0, le=1)
    origin: Literal["corroborated", "single_source", "wine_style", "similar_wines", "unknown"] = (
        "unknown"
    )
    confidence: float = Field(default=0, ge=0, le=1)
    issue: str = ""
    evidence: list[SourceEvidence] = Field(default_factory=list)
    references: list[ProfileReference] = Field(default_factory=list)


class SensoryResearchResult(BaseModel):
    wine_id: UUID
    identity_id: UUID | None = None
    name: str
    producer: str
    vintage: str
    status: Literal["ready", "incomplete", "no_evidence", "failed", "skipped", "applied"]
    issue: str = ""
    summary: str = ""
    limitations: str = ""
    vintage_confirmed: bool = False
    confidence: float = 0
    baseline: dict[str, float] = Field(default_factory=dict)
    baseline_source: str = ""
    baseline_validated: bool = False
    baseline_confidence: float | None = None
    dimensions: dict[str, ResearchTrait] = Field(default_factory=dict)
    aromas: list[ResearchAroma] = Field(default_factory=list)
    sources: list[dict[str, str]] = Field(default_factory=list)
    model: str = ""
    comparisons: list[ResearchComparison] = Field(default_factory=list)
    complete_profile: dict[str, CompletedDimension] = Field(default_factory=dict)
    coverage: dict[str, int] = Field(default_factory=dict)
    warnings: list[str] = Field(default_factory=list)
    prompt_version: str = "2"
    cost_usd: Decimal = Decimal("0")


class SensoryResearchRunResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    status: str
    issue: str
    max_wines: int
    selected_wines: int
    budget_usd: Decimal
    cost_usd: Decimal
    results: list[SensoryResearchResult]
    created_at: datetime
    updated_at: datetime
