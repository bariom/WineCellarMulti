from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, EmailStr, Field


class MemberResponse(BaseModel):
    membership_id: UUID
    user_id: UUID
    email: str
    display_name: str
    role: str


class HouseholdMembershipResponse(BaseModel):
    membership_id: UUID
    household_id: UUID
    household_name: str
    role: str


class HouseholdSwitch(BaseModel):
    household_id: UUID


class InviteCreate(BaseModel):
    email: EmailStr
    role: str = Field(default="member", pattern="^(admin|member|viewer)$")


class InviteResponse(BaseModel):
    id: UUID
    email: str
    role: str
    expires_at: datetime
    accepted_at: datetime | None = None
    invite_token: str | None = None


class InviteAccept(BaseModel):
    token: str = Field(min_length=20)


class MemberRoleUpdate(BaseModel):
    role: str = Field(pattern="^(admin|member|viewer)$")
