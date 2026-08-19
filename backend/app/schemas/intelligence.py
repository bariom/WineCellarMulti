from datetime import datetime
from decimal import Decimal
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, Field

WineStrategyPurpose = Literal[
    "drink", "maturation", "investment", "special_occasion", "undecided"
]


class WineStrategyAllocationInput(BaseModel):
    purpose: WineStrategyPurpose
    quantity: int = Field(ge=1, le=100000)
    stock_lot_id: UUID | None = None
    horizon_year: int | None = Field(default=None, ge=1900, le=2200)
    note: str = Field(default="", max_length=1000)


class WineStrategyAllocationResponse(WineStrategyAllocationInput):
    id: UUID
    wine_id: UUID
    created_at: datetime
    updated_at: datetime


class WineStrategyAllocationUpdate(BaseModel):
    allocations: list[WineStrategyAllocationInput] = Field(default_factory=list, max_length=100)


class CellarIntelligenceWine(BaseModel):
    wine_id: UUID
    name: str
    producer: str = ""
    vintage: str = ""
    region: str = ""
    quantity: int = 0
    allocated_quantity: int = 0
    unallocated_quantity: int = 0
    currency: str = "CHF"
    purchase_value: Decimal = Decimal("0")
    current_value: Decimal = Decimal("0")
    drink_from: int | None = None
    drink_peak_from: int | None = None
    drink_peak_to: int | None = None
    drink_to: int | None = None
    readiness: Literal["unknown", "too_young", "ready", "peak", "late"] = "unknown"
    purposes: dict[str, int] = Field(default_factory=dict)
    signals: list[str] = Field(default_factory=list)


class CellarIntelligenceSnapshot(BaseModel):
    generated_at: datetime
    wine_count: int = 0
    bottle_count: int = 0
    allocated_bottle_count: int = 0
    allocation_coverage_pct: int = 0
    purpose_totals: dict[str, int] = Field(default_factory=dict)
    drink_now_count: int = 0
    maturation_count: int = 0
    investment_count: int = 0
    undecided_count: int = 0
    wines: list[CellarIntelligenceWine] = Field(default_factory=list)
