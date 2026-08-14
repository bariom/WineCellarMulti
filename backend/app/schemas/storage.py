from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, Field, model_validator


class CellarBinCreate(BaseModel):
    name: str = Field(min_length=1, max_length=80)
    description: str = Field(default="", max_length=300)
    sort_order: int = Field(default=0, ge=0, le=10000)


class CellarBinUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=80)
    description: str | None = Field(default=None, max_length=300)
    sort_order: int | None = Field(default=None, ge=0, le=10000)


class CellarBinResponse(BaseModel):
    id: UUID
    location_id: UUID
    name: str
    description: str = ""
    sort_order: int = 0
    bottle_count: int = 0


class CellarLocationCreate(BaseModel):
    name: str = Field(min_length=1, max_length=80)
    description: str = Field(default="", max_length=300)
    is_default: bool = False
    sort_order: int = Field(default=0, ge=0, le=10000)


class CellarLocationUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=80)
    description: str | None = Field(default=None, max_length=300)
    is_default: bool | None = None
    sort_order: int | None = Field(default=None, ge=0, le=10000)


class CellarLocationResponse(BaseModel):
    id: UUID
    name: str
    description: str = ""
    is_default: bool = False
    sort_order: int = 0
    bottle_count: int = 0
    bins: list[CellarBinResponse] = Field(default_factory=list)


class StorageAllocationInput(BaseModel):
    location_id: UUID | None = None
    bin_id: UUID | None = None
    quantity: int = Field(ge=1, le=10000)

    @model_validator(mode="after")
    def bin_requires_location(self) -> "StorageAllocationInput":
        if self.bin_id is not None and self.location_id is None:
            raise ValueError("A bin requires a location")
        return self


class StorageAllocationResponse(BaseModel):
    id: UUID
    wine_id: UUID
    location_id: UUID | None = None
    location_name: str = ""
    bin_id: UUID | None = None
    bin_name: str = ""
    quantity: int


class StorageRelocationCreate(BaseModel):
    wine_id: UUID
    source_allocation_id: UUID
    quantity: int = Field(ge=1, le=10000)
    location_id: UUID | None = None
    bin_id: UUID | None = None
    note: str = Field(default="", max_length=1000)

    @model_validator(mode="after")
    def bin_requires_location(self) -> "StorageRelocationCreate":
        if self.bin_id is not None and self.location_id is None:
            raise ValueError("A bin requires a location")
        return self


class StorageMovementResponse(BaseModel):
    id: UUID
    wine_id: UUID
    movement_type: str
    quantity: int
    from_location_name: str = ""
    from_bin_name: str = ""
    to_location_name: str = ""
    to_bin_name: str = ""
    note: str = ""
    created_at: datetime
