from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, EmailStr, Field


class RedeemCodeCreate(BaseModel):
    label: str = Field(default="", max_length=160)
    duration_days: int = Field(ge=1, le=3650)
    max_redemptions: int = Field(default=1, ge=1, le=10000)
    email: EmailStr | None = None
    expires_at: datetime | None = None


class RedeemCodeResponse(BaseModel):
    id: UUID
    code: str | None = None
    code_prefix: str
    label: str
    duration_days: int
    max_redemptions: int
    redeemed_count: int
    email: str | None
    expires_at: datetime | None
    created_at: datetime
    revoked_at: datetime | None
    is_active: bool


class RedeemRequest(BaseModel):
    code: str = Field(min_length=6, max_length=80)


class CheckoutSessionResponse(BaseModel):
    checkout_url: str
    stripe_session_id: str


class EntitlementResponse(BaseModel):
    id: UUID
    source: str
    valid_from: datetime
    valid_until: datetime
    created_at: datetime


class BillingStatusResponse(BaseModel):
    has_active_entitlement: bool
    valid_until: datetime | None
    active_source: str | None
    entitlements: list[EntitlementResponse]
