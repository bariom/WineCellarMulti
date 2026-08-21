from datetime import date, datetime
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


class CellarIntelligencePreferences(BaseModel):
    annual_drink_target: int = Field(default=24, ge=0, le=10000)
    protected_capital_pct: int = Field(default=50, ge=0, le=100)
    special_occasion_target: int = Field(default=6, ge=0, le=10000)
    next_special_occasion_date: date | None = None
    planning_horizon_years: int = Field(default=5, ge=1, le=20)
    refresh_interval_days: int = Field(default=30, ge=1, le=365)


class BulkStrategyAssignment(BaseModel):
    wine_ids: list[UUID] = Field(min_length=1, max_length=120)
    purpose: WineStrategyPurpose


class BulkStrategyAssignmentResult(BaseModel):
    changed_wines: int = 0
    assigned_bottles: int = 0
    purpose: WineStrategyPurpose


class CellarIntelligenceWine(BaseModel):
    wine_id: UUID
    name: str
    photo_thumbnail_url: str = ""
    producer: str = ""
    vintage: str = ""
    region: str = ""
    type: str = ""
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
    fingerprint: str = ""
    preferences: CellarIntelligencePreferences = Field(
        default_factory=CellarIntelligencePreferences
    )
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
