from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, Field


class EmailBlock(BaseModel):
    type: Literal["heading", "paragraph", "image", "button"]
    text: str = Field(default="", max_length=1200)
    asset_id: str = Field(default="", max_length=80)
    caption: str = Field(default="", max_length=200)
    path: str = Field(default="", max_length=60)


class EmailDraft(BaseModel):
    locale: Literal["it", "en"] = "it"
    subject: str = Field(min_length=1, max_length=160)
    preheader: str = Field(default="", max_length=200)
    blocks: list[EmailBlock] = Field(min_length=1, max_length=24)


class EmailComposeRequest(BaseModel):
    locale: Literal["it", "en"] = "it"
    brief: str = Field(min_length=10, max_length=4000)


class EmailComposeResponse(BaseModel):
    subject: str
    preheader: str
    blocks: list[EmailBlock]
    model: str


class EmailPreviewResponse(BaseModel):
    html: str
    text: str


class EmailSendRequest(EmailDraft):
    id: UUID
    recipient_ids: list[UUID] = Field(min_length=1, max_length=5000)
    confirm: Literal[True]


class EmailTestResponse(BaseModel):
    delivered: bool
    email: str


class EmailRecipient(BaseModel):
    id: UUID
    display_name: str
    email: str
    locale: str
    opted_out: bool


class EmailAssetItem(BaseModel):
    id: str
    kind: Literal["library", "upload"]
    title: str
    description: str
    url: str


class EmailCampaignSummary(BaseModel):
    id: UUID
    subject: str
    locale: str
    recipient_count: int
    sent_count: int
    failed_count: int
    created_at: datetime
    finished_at: datetime | None

    model_config = {"from_attributes": True}
