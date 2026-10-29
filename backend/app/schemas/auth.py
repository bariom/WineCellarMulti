from datetime import UTC, datetime
from decimal import Decimal
from typing import Literal, get_args

from pydantic import AwareDatetime, BaseModel, EmailStr, Field, field_validator

from app.core.themes import curated_theme
from app.schemas.dashboard import DashboardWidgetPreference
from app.services.valuation_market import MARKET_COUNTRIES


class RegisterRequest(BaseModel):
    email: EmailStr
    display_name: str = Field(min_length=1, max_length=120)
    password: str = Field(min_length=8, max_length=200)
    household_name: str = Field(min_length=1, max_length=160)
    locale: Literal["it", "en"] = "it"
    legal_document_version: str = Field(min_length=1, max_length=32)
    privacy_policy_accepted: Literal[True]
    terms_accepted: Literal[True]
    photo_usage_disclaimer_accepted: Literal[True]


class LoginRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=1, max_length=200)


class LegalAcceptanceRequest(BaseModel):
    locale: Literal["it", "en"]
    legal_document_version: str = Field(min_length=1, max_length=32)
    privacy_policy_accepted: Literal[True]
    terms_accepted: Literal[True]


class AccountDeletionRequest(BaseModel):
    confirmation_email: EmailStr
    password: str = Field(min_length=1, max_length=200)


class EmailVerificationRequest(BaseModel):
    token: str = Field(min_length=16, max_length=512)


class EmailVerificationResendRequest(BaseModel):
    email: EmailStr


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


class AmbassadorUpdate(BaseModel):
    valid_until: AwareDatetime
    ai_credit_target_usd: Decimal = Field(ge=0, le=99999, decimal_places=6)

    @field_validator("valid_until")
    @classmethod
    def future_expiry(cls, value: datetime) -> datetime:
        if value <= datetime.now(UTC):
            raise ValueError("Ambassador expiry must be in the future")
        return value.astimezone(UTC)


class UserAdminUpdate(BaseModel):
    ambassador: AmbassadorUpdate | None = None
    revoke_ambassador: bool = False
    is_app_admin: bool | None = None
    is_blocked: bool | None = None
    can_use_restaurant_mode: bool | None = None
    can_use_label_recognition: bool | None = None
    can_manage_wine_photos: bool | None = None
    ai_credit_balance_target_usd: Decimal | None = None
    ai_credit_note: str | None = Field(default=None, max_length=400)
    access_override_days: int | None = Field(default=None, ge=0, le=3650)
    clear_access_override: bool = False


class UserAdminResponse(BaseModel):
    id: str
    email: str
    display_name: str
    is_approved: bool
    is_app_admin: bool
    is_ambassador: bool = False
    ambassador_until: str | None = None
    ambassador_ai_credit_balance_usd: Decimal = Decimal("0")
    standard_ai_credit_balance_usd: Decimal = Decimal("0")
    is_blocked: bool
    can_use_restaurant_mode: bool
    can_use_label_recognition: bool
    can_manage_wine_photos: bool
    has_demo_access: bool = False
    has_active_subscription: bool = False
    subscription_plan: str | None = None
    subscription_cancel_at_period_end: bool = False
    access_override_until: str | None = None
    ai_credit_balance_usd: Decimal = Decimal("0")
    approved_at: str | None = None
    entitlement_valid_until: str | None = None
    entitlement_days_remaining: int | None = None
    last_activity_at: str | None = None
    last_activity_days_ago: int | None = None


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
    market_country: str | None = Field(default=None, max_length=2)
    onboarding_completed: Literal[True] | None = None

    @field_validator("market_country")
    @classmethod
    def valid_market_country(cls, value: str | None) -> str | None:
        if value is not None and value != "" and value not in MARKET_COUNTRIES:
            raise ValueError("Unsupported reference market")
        return value

    dashboard_focus: str | None = Field(
        default=None,
        pattern="^(collector|daily|balanced|personal)$",
    )
    # Each widget at most once (see the validator below): the catalogue is the limit.
    personal_dashboard_widgets: list[DashboardWidgetPreference] | None = Field(
        default=None,
        max_length=len(get_args(DashboardWidgetPreference.model_fields["id"].annotation)),
    )

    @field_validator("personal_dashboard_widgets")
    @classmethod
    def unique_dashboard_widgets(
        cls, widgets: list[DashboardWidgetPreference] | None
    ) -> list[DashboardWidgetPreference] | None:
        if widgets is not None and len({widget.id for widget in widgets}) != len(widgets):
            raise ValueError("Dashboard widgets must be unique")
        return widgets

    daily_wine_budget_chf: Decimal | None = Field(default=None, gt=0, le=100000)
    news_email_opt_out: bool | None = None
    theme_preference: str | None = Field(
        default=None,
        pattern="^(system|light|dark|private-cellar|sepia|white-wine|red-wine|rose-wine|champagne|bordeaux|burgundy|tuscany|piedmont|ticino|atelier|midnight-ledger|maison-champagne|pietra-vigna|cave-privee)$",
    )

    @field_validator("theme_preference")
    @classmethod
    def store_curated_theme(cls, theme: str | None) -> str | None:
        # Retired themes are still accepted from cached clients but stored as
        # the closest signature theme.
        return curated_theme(theme) if theme is not None else None
