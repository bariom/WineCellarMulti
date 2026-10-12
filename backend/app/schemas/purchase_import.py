import re
from datetime import date
from decimal import Decimal
from typing import Annotated, Literal, Self
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, StringConstraints, model_validator

Money = Annotated[Decimal, Field(ge=0, le=99999999, decimal_places=2)]
Currency = Annotated[str, StringConstraints(pattern=r"^[A-Z]{3}$")]


_BOTTLE_VOLUME = re.compile(
    r"(?<![\w.,])(?:\(\s*|\[\s*)?(?P<volume>\d+(?:[.,]\d+)?)\s*"
    r"(?P<unit>ml|cl|litres?|liters?|litri|litro|l)(?:\s*\)|\s*\])?(?!\w)",
    re.IGNORECASE,
)


def separate_bottle_format(name: str, bottle_format: str) -> tuple[str, str]:
    """Remove explicit volumes, retaining a supplied format over inferred data."""
    volumes = set()

    def remove_volume(match: re.Match[str]) -> str:
        factor = {"ml": 1, "cl": 10}.get(match["unit"].lower(), 1000)
        volume = Decimal(match["volume"].replace(",", ".")) * factor
        volumes.add(f"{format(volume.normalize(), 'f')}ml")
        return " "

    cleaned = _BOTTLE_VOLUME.sub(remove_volume, name)
    if not volumes:
        return name, bottle_format
    cleaned = " ".join(cleaned.split()).strip(" -–—,;/")
    if not bottle_format.strip() and len(volumes) == 1:
        bottle_format = volumes.pop()
    return cleaned, bottle_format


class ExtractedPurchaseRow(BaseModel):
    model_config = ConfigDict(extra="forbid")
    name: str = Field(max_length=200)
    producer: str = Field(max_length=200)
    vintage: str = Field(max_length=16)
    format: str = Field(max_length=80)
    quantity: int | None = Field(ge=1, le=10000)
    unit_price: Money | None
    line_total: Money | None
    warnings: list[str] = Field(max_length=10)

    @model_validator(mode="after")
    def separate_format_from_name(self) -> Self:
        self.name, self.format = separate_bottle_format(self.name, self.format)
        return self


class PurchaseExtraction(BaseModel):
    model_config = ConfigDict(extra="forbid")
    supplier: str = Field(max_length=160)
    reference: str = Field(max_length=160)
    order_date: date | None
    currency: Currency | None
    document_total: Money | None
    additional_costs: Decimal | None = Field(ge=-99999999, le=99999999, decimal_places=2)
    rows: list[ExtractedPurchaseRow] = Field(max_length=60)
    warnings: list[str] = Field(max_length=20)


class PurchaseRow(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)
    name: str = Field(min_length=1, max_length=200)
    producer: str = Field(default="", max_length=200)
    vintage: str = Field(default="", max_length=16)
    format: str = Field(min_length=1, max_length=80)
    quantity: int = Field(ge=1, le=10000, strict=True)
    unit_price: Money
    existing_wine_id: UUID | None = None

    @model_validator(mode="after")
    def separate_format_from_name(self) -> Self:
        self.name, self.format = separate_bottle_format(self.name, self.format)
        if not self.name:
            raise ValueError("Wine name must contain more than a bottle format")
        return self


class PurchaseConfirmation(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)
    supplier: str = Field(default="", max_length=160)
    reference: str = Field(default="", max_length=160)
    order_date: date
    currency: Currency
    delivery: Literal["received", "pending"]
    expected_delivery: date | None = None
    document_total: Money | None = None
    additional_costs: Decimal = Field(
        default=Decimal("0"), ge=-99999999, le=99999999, decimal_places=2
    )
    rows: list[PurchaseRow] = Field(min_length=1, max_length=60)
    reviewed: Literal[True]
    accept_total_difference: bool = False


class PurchaseResult(BaseModel):
    id: UUID
    status: Literal["pending", "received"]
    wine_ids: list[UUID]
    bottles: int


class PurchaseMatch(BaseModel):
    id: UUID
    name: str
    producer: str
    vintage: str
    format: str
    currency: str


class PurchasePreview(BaseModel):
    id: UUID
    status: str
    extraction: PurchaseExtraction
    matches: list[list[PurchaseMatch]]
    estimated_cost_usd: Decimal = Decimal("0")


class PendingPurchase(BaseModel):
    id: UUID
    supplier: str
    reference: str
    expected_delivery: date | None
    bottles: int
