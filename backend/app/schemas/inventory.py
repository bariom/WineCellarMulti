from datetime import date, datetime
from decimal import Decimal
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, Field, model_validator

ManualStockMovementType = Literal[
    "purchase",
    "adjustment_in",
    "adjustment_out",
    "breakage",
    "complimentary",
]


class StockMovementCreate(BaseModel):
    wine_id: UUID
    movement_type: ManualStockMovementType
    quantity: int = Field(ge=1, le=10000)
    occurred_on: date | None = None
    unit_cost: Decimal | None = Field(default=None, ge=0)
    supplier: str = Field(default="", max_length=160)
    reference: str = Field(default="", max_length=160)
    note: str = Field(default="", max_length=1000)
    storage_location_id: UUID | None = None
    storage_bin_id: UUID | None = None
    storage_allocation_id: UUID | None = None

    @model_validator(mode="after")
    def validate_purchase(self) -> "StockMovementCreate":
        if self.movement_type == "purchase" and self.unit_cost is None:
            raise ValueError("Unit cost is required for a purchase")
        return self


class StockMovementResponse(BaseModel):
    id: UUID
    wine_id: UUID
    wine_name: str
    wine_producer: str
    wine_vintage: str
    lot_id: UUID | None
    sale_id: UUID | None
    movement_type: str
    quantity_delta: int
    unit_cost: Decimal
    total_cost: Decimal
    currency: str
    occurred_on: date
    supplier: str
    reference: str
    note: str
    created_at: datetime


class StockLotResponse(BaseModel):
    id: UUID
    wine_id: UUID
    wine_name: str
    acquired_on: date
    quantity_received: int
    quantity_remaining: int
    unit_cost: Decimal
    total_remaining_cost: Decimal
    currency: str
    supplier: str
    reference: str
    note: str
    created_at: datetime
