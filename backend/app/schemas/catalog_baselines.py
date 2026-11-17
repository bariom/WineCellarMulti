from __future__ import annotations

from datetime import datetime
from decimal import Decimal
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, Field

from app.schemas.catalog_completion import CatalogCompletionStop

BaselineKind = Literal["appellation", "grape"]


class CatalogBaselineStart(BaseModel):
    """How many appellations and grapes to cover at most, within a spending cap."""

    limit: int = Field(default=60, ge=1, le=300)
    budget_usd: Decimal = Field(default=Decimal("5"), gt=0, le=100)


class CatalogBaselineJobStatus(BaseModel):
    id: UUID
    status: Literal["running", "done"]
    stop_reason: CatalogCompletionStop = ""
    total: int = 0
    done: int = 0
    created: int = 0
    unknown: int = 0
    failed: int = 0
    cost_usd: Decimal = Decimal("0")
    budget_usd: Decimal = Decimal("0")
    error: str = ""
    started_at: datetime


class CatalogBaselineMissing(BaseModel):
    entity_type: BaselineKind
    label: str
    wines: int


class CatalogBaselineProposal(BaseModel):
    id: UUID
    entity_type: str
    entity_key: str
    dimensions: dict[str, float]
    confidence: float
    wines: int = 0


class CatalogBaselineStatus(BaseModel):
    # Approved entries by what their taste profile can rest on.
    entries: int = 0
    specific: int = 0
    generic: int = 0
    without: int = 0
    # Appellations and grapes of the catalog with no baseline, most used first.
    missing_count: int = 0
    missing: list[CatalogBaselineMissing] = Field(default_factory=list)
    proposal_count: int = 0
    proposals: list[CatalogBaselineProposal] = Field(default_factory=list)
    job: CatalogBaselineJobStatus | None = None


class CatalogBaselineReview(BaseModel):
    ids: list[UUID] = Field(min_length=1, max_length=500)


class CatalogBaselineRecalculation(BaseModel):
    checked: int = 0
    updated: int = 0
