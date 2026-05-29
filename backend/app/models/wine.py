from __future__ import annotations

import uuid
from datetime import date, datetime
from decimal import Decimal

from sqlalchemy import Date, DateTime, ForeignKey, JSON, Numeric, String, Text, Uuid
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class Wine(Base):
    __tablename__ = "wines"

    id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4)
    household_id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), ForeignKey("households.id", ondelete="CASCADE"), index=True)
    created_by_user_id: Mapped[uuid.UUID | None] = mapped_column(Uuid(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    name: Mapped[str] = mapped_column(String(200), index=True)
    producer: Mapped[str] = mapped_column(String(200), default="")
    vintage: Mapped[str] = mapped_column(String(16), default="")
    quantity: Mapped[int] = mapped_column(default=0)
    currency: Mapped[str] = mapped_column(String(8), default="CHF")
    price: Mapped[Decimal] = mapped_column(Numeric(10, 2), default=0)
    current_value: Mapped[Decimal | None] = mapped_column(Numeric(10, 2), nullable=True)
    status: Mapped[str] = mapped_column(String(32), default="Ordered")
    format: Mapped[str] = mapped_column(String(80), default="")
    type: Mapped[str] = mapped_column(String(80), default="")
    region: Mapped[str] = mapped_column(String(120), default="")
    appellation: Mapped[str] = mapped_column(String(120), default="")
    merchant: Mapped[str] = mapped_column(String(160), default="")
    order_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    expected_delivery: Mapped[date | None] = mapped_column(Date, nullable=True)
    owner_share_pct: Mapped[Decimal] = mapped_column(Numeric(5, 2), default=100)
    notes: Mapped[str] = mapped_column(Text, default="")
    ai_notes: Mapped[str] = mapped_column(Text, default="")
    drink_from: Mapped[int | None] = mapped_column(nullable=True)
    drink_peak_from: Mapped[int | None] = mapped_column(nullable=True)
    drink_peak_to: Mapped[int | None] = mapped_column(nullable=True)
    drink_to: Mapped[int | None] = mapped_column(nullable=True)
    drink_window_notes: Mapped[str] = mapped_column(Text, default="")
    ai_value_notes: Mapped[str] = mapped_column(Text, default="")
    ai_value_estimated_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    rating: Mapped[int] = mapped_column(default=0)
    owners: Mapped[list[dict]] = mapped_column(JSON, default=list)
    tags: Mapped[list[str]] = mapped_column(JSON, default=list)
    grapes: Mapped[list[dict]] = mapped_column(JSON, default=list)
    scores: Mapped[list[dict]] = mapped_column(JSON, default=list)
