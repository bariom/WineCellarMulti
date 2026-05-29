from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class UserTagCreate(BaseModel):
    name: str = Field(min_length=1, max_length=80)
    color: str = Field(default="", max_length=16)


class UserTagUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=80)
    color: str | None = Field(default=None, max_length=16)


class UserTagResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    name: str
    color: str
