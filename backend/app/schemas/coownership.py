from datetime import date, datetime
from decimal import Decimal
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, EmailStr, Field


class CoOwnershipParticipantCreate(BaseModel):
    name: str = Field(min_length=1, max_length=160)
    email: EmailStr
    share_pct: Decimal = Field(gt=0, le=100, decimal_places=6)
    contribution: Decimal | None = Field(default=None, ge=0)


class CoOwnershipPaymentCreate(BaseModel):
    amount: Decimal = Field(gt=0, decimal_places=2)
    paid_on: date
    note: str = Field(default="", max_length=500)


class CoOwnershipPaymentResponse(BaseModel):
    id: UUID
    participant_id: UUID
    amount: Decimal
    currency: str
    paid_on: date
    note: str
    created_at: datetime
    voided_at: datetime | None = None


class CoOwnershipAgreementCreate(BaseModel):
    ownership_mode: Literal["undivided", "allocated"] = "undivided"
    custody_location: str = Field(default="", max_length=500)
    terms: str = Field(default="", max_length=10000)
    email_registered_users: bool = True
    participants: list[CoOwnershipParticipantCreate] = Field(min_length=2, max_length=20)


class CoOwnershipParticipantResponse(BaseModel):
    id: UUID
    user_id: UUID | None = None
    name: str
    email: str
    share_pct: Decimal
    contribution: Decimal | None = None
    status: str
    invited_at: datetime | None = None
    viewed_at: datetime | None = None
    responded_at: datetime | None = None
    acceptance_name: str = ""
    acceptance_method: str = ""
    delivery_channel: str
    delivery_status: str
    invite_url: str | None = None
    paid_total: Decimal = Decimal("0")
    outstanding: Decimal | None = None
    payments: list[CoOwnershipPaymentResponse] = Field(default_factory=list)


class CoOwnershipAgreementResponse(BaseModel):
    id: UUID
    wine_id: UUID
    version: int
    status: str
    ownership_mode: str
    custody_location: str
    terms: str
    wine_snapshot: dict
    document_hash: str
    created_at: datetime
    finalized_at: datetime | None = None
    responding_participant_id: UUID | None = None
    can_cancel: bool = False
    can_manage_payments: bool = False
    participants: list[CoOwnershipParticipantResponse]


class CoOwnershipResponseRequest(BaseModel):
    decision: Literal["accepted", "declined"]
    full_name: str = Field(min_length=1, max_length=160)
