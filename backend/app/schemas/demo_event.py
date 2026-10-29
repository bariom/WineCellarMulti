from datetime import datetime
from decimal import Decimal
from typing import Literal

from pydantic import BaseModel, EmailStr, Field, field_validator

from app.services.demo_events import EVENT_FEATURES, EVENT_LANDINGS

EventFeature = Literal[
    "restaurant_wine_list", "dish_pairing", "bottle_photo", "assistant", "buying_advice"
]
EventLanding = Literal["pairing-restaurant", "pairing-home", "assistant", "buying", "sommelier"]


class DemoEventBase(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    place: str = Field(default="", max_length=120)
    locale: Literal["it", "en"] = "it"
    is_active: bool = True
    starts_at: datetime | None = None
    ends_at: datetime | None = None
    features: list[EventFeature] = Field(
        default_factory=lambda: ["restaurant_wine_list"], max_length=len(EVENT_FEATURES)
    )
    landing: EventLanding = "pairing-restaurant"
    credit_per_visitor_usd: Decimal = Field(
        default=Decimal("0.5"), ge=Decimal("0.01"), le=Decimal("50")
    )
    budget_usd: Decimal = Field(default=Decimal("0"), ge=Decimal("0"), le=Decimal("100000"))
    max_visitors_per_day: int = Field(default=200, ge=1, le=10000)
    session_hours: int = Field(default=6, ge=1, le=72)

    @field_validator("features")
    @classmethod
    def unique_features(cls, value: list[str]) -> list[str]:
        if len(set(value)) != len(value):
            raise ValueError("Each feature at most once")
        if not value:
            raise ValueError("Choose at least one feature")
        return value

    @field_validator("landing")
    @classmethod
    def known_landing(cls, value: str) -> str:
        if value not in EVENT_LANDINGS:
            raise ValueError("Unknown landing page")
        return value


class DemoEventCreate(DemoEventBase):
    pass


class DemoEventUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=120)
    place: str | None = Field(default=None, max_length=120)
    locale: Literal["it", "en"] | None = None
    is_active: bool | None = None
    starts_at: datetime | None = None
    ends_at: datetime | None = None
    clear_dates: bool = False
    features: list[EventFeature] | None = Field(default=None, max_length=len(EVENT_FEATURES))
    landing: EventLanding | None = None
    credit_per_visitor_usd: Decimal | None = Field(
        default=None, ge=Decimal("0.01"), le=Decimal("50")
    )
    budget_usd: Decimal | None = Field(default=None, ge=Decimal("0"), le=Decimal("100000"))
    max_visitors_per_day: int | None = Field(default=None, ge=1, le=10000)
    session_hours: int | None = Field(default=None, ge=1, le=72)
    rotate_slug: bool = False

    @field_validator("features")
    @classmethod
    def unique_features(cls, value: list[str] | None) -> list[str] | None:
        if value is not None:
            DemoEventBase.unique_features(value)
        return value


class DemoEventStats(BaseModel):
    visitor_count: int
    active_visitors: int
    conversions: int
    granted_usd: Decimal
    spent_usd: Decimal


class DemoEventResponse(DemoEventBase):
    id: str
    slug: str
    url: str
    qr_url: str
    created_at: datetime
    stats: DemoEventStats


class EventClaimRequest(BaseModel):
    """A guest keeps the account: the same promises a registration makes."""

    email: EmailStr
    display_name: str = Field(min_length=1, max_length=120)
    password: str = Field(min_length=8, max_length=200)
    household_name: str = Field(min_length=1, max_length=160)
    locale: Literal["it", "en"] = "it"
    legal_document_version: str = Field(min_length=1, max_length=32)
    privacy_policy_accepted: Literal[True]
    terms_accepted: Literal[True]
    photo_usage_disclaimer_accepted: Literal[True]


class SessionEventReturn(BaseModel):
    """From the demo: the event a guest can go back to."""

    slug: str
    name: str
    place: str


class SessionEvent(BaseModel):
    """What the app shows a guest: the event's name on the masthead and the features on offer."""

    id: str
    slug: str
    name: str
    place: str
    locale: str
    features: list[str]
    landing: str
    visitor_until: str
