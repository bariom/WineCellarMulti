from pydantic import BaseModel, EmailStr, Field


class RegisterRequest(BaseModel):
    email: EmailStr
    display_name: str = Field(min_length=1, max_length=120)
    password: str = Field(min_length=8, max_length=200)
    household_name: str = Field(min_length=1, max_length=160)


class LoginRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=1, max_length=200)


class EmailVerificationRequest(BaseModel):
    token: str = Field(min_length=16, max_length=512)


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


class UserAdminResponse(BaseModel):
    id: str
    email: str
    display_name: str
    is_approved: bool
    is_app_admin: bool
    is_blocked: bool
    approved_at: str | None = None
    entitlement_valid_until: str | None = None
    entitlement_days_remaining: int | None = None


class UserPreferencesUpdate(BaseModel):
    locale: str | None = Field(default=None, pattern="^(en|it)$")
    theme_preference: str | None = Field(
        default=None,
        pattern="^(system|light|dark|private-cellar|sepia|white-wine|red-wine|rose-wine|champagne|bordeaux|burgundy|tuscany|piedmont|ticino)$",
    )
