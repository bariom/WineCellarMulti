from datetime import datetime
from decimal import Decimal
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, model_validator

from app.schemas.sensory_reference import TraitEvidence


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


def require_evidence_properties(schema: dict) -> None:
    schema["required"] = list(schema.get("properties", {}))


class SourceEvidence(ResearchEvidence):
    # Provider schemas require every property; old stored reports may omit attribution.
    model_config = ConfigDict(
        extra="forbid",
        json_schema_extra=require_evidence_properties,
    )
    attribution_excerpt: str = Field(default="", max_length=400)
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


class SensoryEstimate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    value: float = Field(ge=0, le=1, strict=True)
    lower: float = Field(ge=0, le=1, strict=True)
    upper: float = Field(ge=0, le=1, strict=True)
    rationale: str = Field(min_length=20, max_length=600)
    evidence: list[SourceEvidence] = Field(max_length=3)

    @model_validator(mode="after")
    def ordered_range(self):
        if not self.lower <= self.value <= self.upper:
            raise ValueError("Estimate must be inside its uncertainty range")
        return self


class EstimatedDimensions(BaseModel):
    model_config = ConfigDict(extra="forbid")
    body: SensoryEstimate
    acidity: SensoryEstimate
    tannin: SensoryEstimate
    sweetness: SensoryEstimate
    aromatic_intensity: SensoryEstimate
    fruit: SensoryEstimate
    wood: SensoryEstimate
    spice: SensoryEstimate
    minerality: SensoryEstimate


class SensoryCompletionOutput(BaseModel):
    model_config = ConfigDict(extra="forbid")
    name: str = Field(max_length=240)
    producer: str = Field(max_length=240)
    vintage: str = Field(max_length=40)
    identity_ambiguous: bool
    summary: str = Field(min_length=1, max_length=1500)
    limitations: str = Field(min_length=1, max_length=1500)
    estimates: EstimatedDimensions
    research: CompleteResearchOutput | None


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
    documentary_evidence: list[TraitEvidence] = Field(default_factory=list)
    value: float | None = Field(default=None, ge=0, le=1)
    origin: Literal[
        "corroborated", "single_source", "wine_style", "similar_wines", "ai_inference", "unknown"
    ] = "unknown"
    confidence: float = Field(default=0, ge=0, le=1)
    issue: str = ""
    evidence: list[SourceEvidence] = Field(default_factory=list)
    references: list[ProfileReference] = Field(default_factory=list)
    rationale: str = ""
    lower: float | None = Field(default=None, ge=0, le=1)
    upper: float | None = Field(default=None, ge=0, le=1)
    inference_basis: (
        Literal["verified_description", "mixed_sources", "unverified_source", "model_knowledge"]
        | None
    ) = None
    unverified_evidence: list[SourceEvidence] = Field(default_factory=list)
    calculation_method: str = ""
    context_evidence: list[SourceEvidence] = Field(default_factory=list)
    sensory_support: Literal["intensity", "description", "context", "none"] | None = None


class SourceCheck(BaseModel):
    status: str
    content_type: str = ""
    http_status: int | None = None
    matched_excerpts: int = 0
    unmatched_excerpts: int = 0


class AppliedDimension(BaseModel):
    value: float = Field(ge=0, le=1)
    confidence: float = Field(ge=0, le=1)
    origin: Literal["agent", "baseline"]
    reason: str


class SensoryApplicationPreview(BaseModel):
    policy_version: str = "2"
    eligible: bool = False
    reason: str = ""
    dimensions: dict[str, AppliedDimension] = Field(default_factory=dict)
    updated: list[str] = Field(default_factory=list)
    retained: list[str] = Field(default_factory=list)
    review_required: list[str] = Field(default_factory=list)
    candidates: dict[str, AppliedDimension] = Field(default_factory=dict)


class SensoryApplyRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    dimensions: list[
        Literal[
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
    ] = Field(min_length=1, max_length=9)
    confirm_protected: bool = False


class AgentStep(BaseModel):
    turn: int = Field(ge=1)
    web_search_calls: int = Field(default=0, ge=0)
    cost_usd: Decimal = Decimal("0")
    tools: list[str] = Field(default_factory=list)


class SensoryProfileSnapshot(BaseModel):
    dimensions: dict[str, float]
    provenance: dict
    source: str
    validated: bool
    confidence: float
    model: str
    generated_at: datetime | None
    replaced_at: datetime
    replaced_by: UUID


class SensoryResearchResult(BaseModel):
    previous_profile: SensoryProfileSnapshot | None = None
    agent_steps: list[AgentStep] = Field(default_factory=list)
    wine_id: UUID
    identity_id: UUID | None = None
    name: str
    producer: str
    vintage: str
    status: Literal["ready", "incomplete", "no_evidence", "failed", "skipped", "applied"]
    issue: str = ""
    summary: str = ""
    limitations: str = ""
    agent_summary: str = ""
    agent_limitations: str = ""
    identity_confirmed: bool = False
    identity_evidence: SourceEvidence | None = None
    vintage_confirmed: bool = False
    identity_ambiguous: bool = False
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
    source_checks: dict[str, SourceCheck] = Field(default_factory=dict)
    prompt_version: str = "2"
    cost_usd: Decimal = Decimal("0")
    web_search_calls: int = Field(default=0, ge=0)
    duration_ms: int = Field(default=0, ge=0)
    application: SensoryApplicationPreview | None = None


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
