from datetime import date
from typing import Literal

from pydantic import BaseModel, Field, HttpUrl, model_validator

DIMENSIONS = (
    "body",
    "acidity",
    "tannin",
    "sweetness",
    "aromatic_intensity",
    "fruit",
    "wood",
    "spice",
    "minerality",
)


class TraitEvidence(BaseModel):
    source_url: HttpUrl
    publisher: str
    summary: str
    note_date: str | None = None


class DocumentaryAssessment(BaseModel):
    status: Literal["described", "conflicting", "context_only"]
    rationale: str
    evidence: list[TraitEvidence] = Field(min_length=1)

    @model_validator(mode="after")
    def conflict_requires_distinct_accounts(self):
        if self.status == "conflicting" and len({e.publisher for e in self.evidence}) < 2:
            raise ValueError("A conflict requires at least two attributed accounts")
        return self


class TraitReview(BaseModel):
    dimension: str
    current_value: float | None = None
    status: Literal["described", "conflicting", "context_only", "no_evidence"]
    rationale: str
    evidence: list[TraitEvidence] = Field(default_factory=list)
    numerical_validation: Literal["not_validated"] = "not_validated"


class ReferenceDossier(BaseModel):
    id: str
    name: str
    producer: str
    vintage: str
    country: str
    source_url: HttpUrl
    checked_on: date
    analytical: dict[str, str]
    observations: dict[str, str]
    limitations: list[str]
    reuse: str
    assessments: dict[str, DocumentaryAssessment] = Field(default_factory=dict)

    @model_validator(mode="after")
    def known_dimensions(self):
        if set(self.assessments) - set(DIMENSIONS):
            raise ValueError("Unknown sensory dimension")
        return self


class ReferenceRow(BaseModel):
    dossier: ReferenceDossier
    status: Literal["new", "matched", "imported", "conflict"]
    identity_id: str | None = None
    existing_dimensions: dict[str, float | None] = Field(default_factory=dict)
    previously_approved: bool = False
    conflicts: list[str] = Field(default_factory=list)
    review_status: Literal["needs_evidence_review"] = "needs_evidence_review"
    traits: list[TraitReview] = Field(default_factory=list)


class WineEvidenceReview(BaseModel):
    identity_id: str
    name: str
    producer: str
    vintage: str
    previously_approved: bool
    dossier: ReferenceDossier | None = None
    traits: list[TraitReview]


class ReferencePreview(BaseModel):
    revision: str
    rows: list[ReferenceRow]
    excluded: list[str]
    profiles_to_review: int
    previously_approved_profiles: int


class ReferenceImport(BaseModel):
    revision: str = Field(pattern=r"^[a-f0-9]{64}$")
    ids: list[str] = Field(min_length=1, max_length=50)
