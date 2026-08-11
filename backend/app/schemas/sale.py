from datetime import date, datetime
from decimal import Decimal
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, Field


class WineSaleCreate(BaseModel):
    wine_id: UUID
    sold_at: date | None = None
    quantity: int = Field(default=1, ge=1, le=1000)
    unit_sale_price: Decimal | None = Field(default=None, ge=0)
    note: str = Field(default="", max_length=1000)
    sale_kind: Literal["bottle", "glass"] = "bottle"


class WineSaleUpdate(BaseModel):
    sold_at: date
    quantity: int = Field(ge=1, le=1000)
    unit_sale_price: Decimal = Field(ge=0)
    note: str = Field(default="", max_length=1000)


class WineSaleVoid(BaseModel):
    reason: str = Field(min_length=2, max_length=300)


class WineSaleResponse(BaseModel):
    id: UUID
    wine_id: UUID
    wine_name: str
    wine_producer: str = ""
    wine_vintage: str = ""
    wine_type: str = ""
    sold_at: date
    quantity: int
    sale_kind: Literal["bottle", "glass"] = "bottle"
    pour_size_ml: int = 0
    bottle_yield_ml: int = 0
    discarded_volume_ml: int = 0
    stock_bottles_consumed: int = 0
    unit_sale_price: Decimal
    unit_purchase_cost: Decimal
    revenue: Decimal
    cost: Decimal
    gross_margin: Decimal
    currency: str
    note: str = ""
    voided_at: datetime | None = None
    void_reason: str = ""
    created_at: datetime


class SaleSeriesPoint(BaseModel):
    date: date
    currency: str
    revenue: Decimal
    cost: Decimal
    gross_margin: Decimal
    bottles: int
    glasses: int = 0


class SaleRankingItem(BaseModel):
    wine_id: UUID
    label: str
    bottles: int
    glasses: int = 0
    revenue: Decimal
    gross_margin: Decimal
    currency: str
    current_stock: int = 0


class SaleBreakdownItem(BaseModel):
    label: str
    currency: str
    bottles: int
    glasses: int = 0
    revenue: Decimal
    cost: Decimal
    gross_margin: Decimal


class CurrencySalesSummary(BaseModel):
    currency: str
    revenue: Decimal
    cost: Decimal
    gross_margin: Decimal
    gross_margin_pct: Decimal
    bottles: int
    glasses: int = 0
    average_sale_price: Decimal
    average_glass_price: Decimal = Decimal("0")


class WineSalesSummaryResponse(BaseModel):
    from_date: date
    to_date: date
    currencies: list[CurrencySalesSummary]
    series: list[SaleSeriesPoint]
    top_wines: list[SaleRankingItem]
    least_sold_wines: list[SaleRankingItem]
    sales_by_type: list[SaleBreakdownItem]
    sales_by_region: list[SaleBreakdownItem]
    sales_by_producer: list[SaleBreakdownItem]
    recent_sales: list[WineSaleResponse]


class WineSalesHistoryResponse(BaseModel):
    wine_id: UUID
    from_date: date
    to_date: date
    currency: str
    revenue: Decimal
    gross_margin: Decimal
    bottles: int
    glasses: int
    series: list[SaleSeriesPoint]
