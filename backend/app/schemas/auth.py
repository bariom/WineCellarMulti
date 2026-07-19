from decimal import Decimal
from typing import Literal

from pydantic import BaseModel, EmailStr, Field


class RegisterRequest(BaseModel):
    email: EmailStr
    display_name: str = Field(min_length=1, max_length=120)
    password: str = Field(min_length=8, max_length=200)
    household_name: str = Field(min_length=1, max_length=160)
    photo_usage_disclaimer_accepted: Literal[True]


class LoginRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=1, max_length=200)


class EmailVerificationRequest(BaseModel):
    token: str = Field(min_length=16, max_length=512)


class PasswordResetRequest(BaseModel):
    email: EmailStr


class PasswordResetConfirmRequest(BaseModel):
    token: str = Field(min_length=16, max_length=512)
    password: str = Field(min_length=8, max_length=200)


class PasskeyRegistrationOptionsRequest(BaseModel):
    name: str = Field(default="Passkey", min_length=1, max_length=120)


class PasskeyRegistrationVerifyRequest(BaseModel):
    name: str = Field(default="Passkey", min_length=1, max_length=120)
    credential: dict


class PasskeyLoginVerifyRequest(BaseModel):
    credential: dict


class PasskeyResponse(BaseModel):
    id: str
    name: str
    created_at: str
    last_used_at: str | None = None


class PendingUserResponse(BaseModel):
    id: str
    email: str
    display_name: str


class UserAdminUpdate(BaseModel):
    is_app_admin: bool | None = None
    is_blocked: bool | None = None
    can_use_label_recognition: bool | None = None
    can_manage_wine_photos: bool | None = None
    ai_credit_balance_target_usd: Decimal | None = None
    ai_credit_note: str | None = Field(default=None, max_length=400)


class UserAdminResponse(BaseModel):
    id: str
    email: str
    display_name: str
    is_approved: bool
    is_app_admin: bool
    is_blocked: bool
    can_use_label_recognition: bool
    can_manage_wine_photos: bool
    ai_credit_balance_usd: Decimal = Decimal("0")
    approved_at: str | None = None
    entitlement_valid_until: str | None = None
    entitlement_days_remaining: int | None = None


class UserAdminStatsResponse(BaseModel):
    id: str
    email: str
    display_name: str
    is_approved: bool
    is_app_admin: bool
    is_blocked: bool
    households_total: int = 0
    cellar_wines_total: int = 0
    cellar_bottles_total: int = 0
    wines_created_total: int = 0
    ai_requests_total: int = 0
    last_sign_in_at: str | None = None
    last_ai_request_at: str | None = None
    last_activity_at: str | None = None


class UserPreferencesUpdate(BaseModel):
    locale: str | None = Field(default=None, pattern="^(en|it)$")
    theme_preference: str | None = Field(
        default=None,
        pattern="^(system|light|dark|private-cellar|sepia|white-wine|red-wine|rose-wine|champagne|bordeaux|burgundy|tuscany|piedmont|ticino|atelier|midnight-ledger)$",
    )
