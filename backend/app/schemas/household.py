from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, EmailStr, Field


class MemberResponse(BaseModel):
    membership_id: UUID
    user_id: UUID
    email: str
    display_name: str
    role: str
    visibility_scope: str = "all"


class HouseholdMembershipResponse(BaseModel):
    membership_id: UUID
    household_id: UUID
    household_name: str
    operating_mode: Literal["private", "restaurant"] = "private"
    role: str


class HouseholdSwitch(BaseModel):
    household_id: UUID


class HouseholdUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=160)
    operating_mode: Literal["private", "restaurant"] | None = None


class HouseholdCreate(BaseModel):
    name: str = Field(min_length=1, max_length=160)
    operating_mode: Literal["private", "restaurant"] = "private"


class RegionalGapTargetPayload(BaseModel):
    region: str = Field(min_length=1, max_length=80)
    targetPct: float = Field(ge=0, le=100)


class RegionalGapSettingsUpdate(BaseModel):
    targets: list[RegionalGapTargetPayload] = Field(default_factory=list, max_length=12)
    last_ai_suggestion: dict | None = None
    profile_targets: dict[str, list[RegionalGapTargetPayload]] = Field(default_factory=dict)
    ai_suggestions: list[dict] = Field(default_factory=list, max_length=24)


class RegionalGapSettingsResponse(BaseModel):
    targets: list[RegionalGapTargetPayload] = Field(default_factory=list)
    last_ai_suggestion: dict | None = None
    profile_targets: dict[str, list[RegionalGapTargetPayload]] = Field(default_factory=dict)
    ai_suggestions: list[dict] = Field(default_factory=list)
    updated_at: datetime | None = None


class OperationalActionSnoozeCreate(BaseModel):
    action_id: str = Field(min_length=1, max_length=240)
    signature: str = Field(min_length=1, max_length=512)
    until: datetime


class OperationalActionSnoozeResponse(OperationalActionSnoozeCreate):
    pass


class InviteCreate(BaseModel):
    email: EmailStr
    role: str = Field(default="member", pattern="^(admin|member|viewer)$")
    visibility_scope: str = Field(default="shared", pattern="^(all|shared)$")


class InviteResponse(BaseModel):
    id: UUID
    household_id: UUID | None = None
    household_name: str | None = None
    email: str
    role: str
    visibility_scope: str = "shared"
    expires_at: datetime
    accepted_at: datetime | None = None
    invite_token: str | None = None


class InviteAccept(BaseModel):
    token: str = Field(min_length=20)


class MemberRoleUpdate(BaseModel):
    role: str | None = Field(default=None, pattern="^(admin|member|viewer)$")
    visibility_scope: str | None = Field(default=None, pattern="^(all|shared)$")
