from datetime import date
from typing import Literal

from pydantic import BaseModel, Field, HttpUrl


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


class ReferenceRow(BaseModel):
    dossier: ReferenceDossier
    status: Literal["new", "matched", "imported", "conflict"]
    identity_id: str | None = None
    existing_dimensions: dict[str, float | None] = Field(default_factory=dict)
    previously_approved: bool = False
    conflicts: list[str] = Field(default_factory=list)
    review_status: Literal["needs_evidence_review"] = "needs_evidence_review"


class ReferencePreview(BaseModel):
    revision: str
    rows: list[ReferenceRow]
    excluded: list[str]
    profiles_to_review: int
    previously_approved_profiles: int


class ReferenceImport(BaseModel):
    revision: str = Field(pattern=r"^[a-f0-9]{64}$")
    ids: list[str] = Field(min_length=1, max_length=50)
