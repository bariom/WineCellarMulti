from __future__ import annotations

import uuid
from datetime import datetime
from decimal import Decimal

from sqlalchemy import Boolean, DateTime, Numeric, String, Uuid
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class User(Base):
    __tablename__ = "users"

    id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4)
    email: Mapped[str] = mapped_column(String(320), unique=True, index=True)
    display_name: Mapped[str] = mapped_column(String(120))
    password_hash: Mapped[str] = mapped_column(String(512))
    is_approved: Mapped[bool] = mapped_column(Boolean, default=True)
    is_app_admin: Mapped[bool] = mapped_column(Boolean, default=False)
    is_blocked: Mapped[bool] = mapped_column(Boolean, default=False)
    can_use_label_recognition: Mapped[bool] = mapped_column(Boolean, default=False)
    can_manage_wine_photos: Mapped[bool] = mapped_column(Boolean, default=False)
    photo_usage_disclaimer_accepted_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    approved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    email_verified_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    email_verification_token_hash: Mapped[str] = mapped_column(String(128), default="", index=True)
    email_verification_expires_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    password_reset_token_hash: Mapped[str] = mapped_column(String(128), default="", index=True)
    password_reset_expires_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    locale: Mapped[str] = mapped_column(String(8), default="it")
    theme_preference: Mapped[str] = mapped_column(String(32), default="system")
    dashboard_focus: Mapped[str] = mapped_column(String(32), default="collector")
    daily_wine_budget_chf: Mapped[Decimal | None] = mapped_column(
        Numeric(10, 2), nullable=True
    )
