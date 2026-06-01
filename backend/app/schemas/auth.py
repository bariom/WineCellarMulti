from pydantic import BaseModel, EmailStr, Field


class RegisterRequest(BaseModel):
    email: EmailStr
    display_name: str = Field(min_length=1, max_length=120)
    password: str = Field(min_length=8, max_length=200)
    household_name: str = Field(min_length=1, max_length=160)


class LoginRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=1, max_length=200)


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
