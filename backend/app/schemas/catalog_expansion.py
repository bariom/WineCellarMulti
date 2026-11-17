from __future__ import annotations

from datetime import datetime
from decimal import Decimal
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, Field, model_validator

from app.schemas.catalog_completion import CatalogCompletionStop


class CatalogExpansionStart(BaseModel):
    """Producers to research: named ones, or those the AI finds in a wine area."""

    area: str = Field(default="", max_length=120)
    country: str = Field(default="", max_length=120)
    producers: list[str] = Field(default_factory=list, max_length=40)
    producer_count: int = Field(default=10, ge=1, le=40)
    budget_usd: Decimal = Field(default=Decimal("25"), gt=0, le=100)

    @model_validator(mode="after")
    def producers_or_area(self) -> CatalogExpansionStart:
        self.producers = [name for item in self.producers if (name := " ".join(item.split())[:200])]
        self.area = " ".join(self.area.split())
        self.country = " ".join(self.country.split())
        if not self.producers and not self.area:
            raise ValueError("Give producers or a wine area")
        return self


class CatalogExpansionJobStatus(BaseModel):
    id: UUID
    status: Literal["running", "done"]
    stage: Literal["discovering", "researching", "done"]
    stop_reason: CatalogCompletionStop = ""
    producers_total: int = 0
    producers_done: int = 0
    producers_not_found: list[str] = Field(default_factory=list)
    created: int = 0
    existing: int = 0
    unsupported: int = 0
    cost_usd: Decimal = Decimal("0")
    budget_usd: Decimal = Decimal("0")
    error: str = ""
    started_at: datetime


class CatalogExpansionProposal(BaseModel):
    id: UUID
    name: str
    producer: str
    appellation: str = ""
    region: str = ""
    country: str = ""
    type: str = ""
    grapes_text: str = ""
    description: str = ""
    source_url: str = ""


class CatalogExpansionStatus(BaseModel):
    # Wines researched by AI and waiting for approval, newest first.
    pending_count: int = 0
    pending: list[CatalogExpansionProposal] = Field(default_factory=list)
    job: CatalogExpansionJobStatus | None = None


class CatalogExpansionReview(BaseModel):
    """Proposals the administrator approves or discards together."""

    ids: list[UUID] = Field(min_length=1, max_length=500)
