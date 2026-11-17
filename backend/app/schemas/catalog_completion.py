from __future__ import annotations

from datetime import datetime
from decimal import Decimal
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, Field

CatalogCompletionStop = Literal["", "finished", "budget", "cancelled", "failed"]


class CatalogCompletionStart(BaseModel):
    """How many entries to research at most, and the spend the batch must not exceed."""

    limit: int = Field(default=100, ge=1, le=2000)
    budget_usd: Decimal = Field(default=Decimal("25"), gt=0, le=100)
    # Also research again the entries a previous batch could not find.
    retry_not_found: bool = False


class CatalogCompletionJobStatus(BaseModel):
    id: UUID
    status: Literal["running", "done"]
    stop_reason: CatalogCompletionStop = ""
    total: int = 0
    done: int = 0
    completed: int = 0
    not_found: int = 0
    failed: int = 0
    cost_usd: Decimal = Decimal("0")
    budget_usd: Decimal = Decimal("0")
    error: str = ""
    started_at: datetime


class CatalogCompletionStatus(BaseModel):
    # Approved entries without grapes or country: never researched, and researched in vain.
    incomplete_count: int = 0
    not_found_count: int = 0
    job: CatalogCompletionJobStatus | None = None
