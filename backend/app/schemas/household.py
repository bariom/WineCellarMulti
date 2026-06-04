from datetime import datetime
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
    role: str


class HouseholdSwitch(BaseModel):
    household_id: UUID


class HouseholdUpdate(BaseModel):
    name: str = Field(min_length=1, max_length=160)


class HouseholdCreate(BaseModel):
    name: str = Field(min_length=1, max_length=160)


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
