from datetime import datetime
from decimal import Decimal
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class SensoryResearchRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    max_wines: int = Field(default=10, ge=1, le=20)
    budget_usd: Decimal = Field(default=Decimal("1"), ge=Decimal("0.05"), le=Decimal("5"))


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
    dimensions: dict[str, ResearchTrait] = Field(default_factory=dict)
    aromas: list[ResearchAroma] = Field(default_factory=list)
    sources: list[dict[str, str]] = Field(default_factory=list)
    model: str = ""
    comparisons: list[ResearchComparison] = Field(default_factory=list)
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
