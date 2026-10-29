from __future__ import annotations

import uuid
from datetime import datetime
from decimal import Decimal

from sqlalchemy import JSON, Boolean, DateTime, ForeignKey, Integer, Numeric, String, Uuid
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class DemoEvent(Base):
    """A QR-code entry point at a venue or tasting: guests try chosen AI features
    on Vinaris' credit, with no account, and may keep what they did as a real one."""

    __tablename__ = "demo_events"

    id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4)
    # The part of the QR address: /e/<slug>. Random, so it can be rotated.
    slug: Mapped[str] = mapped_column(String(40), unique=True, index=True)
    name: Mapped[str] = mapped_column(String(120))
    place: Mapped[str] = mapped_column(String(120), default="")
    locale: Mapped[str] = mapped_column(String(8), default="it")
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    starts_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    ends_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    # Which AI features a guest may use (see services/demo_events.py) and where
    # the QR lands them.
    features: Mapped[list[str]] = mapped_column(JSON, default=list)
    landing: Mapped[str] = mapped_column(String(32), default="pairing-restaurant")
    credit_per_visitor_usd: Mapped[Decimal] = mapped_column(Numeric(12, 6), default=Decimal("0.5"))
    # Zero means no ceiling.
    budget_usd: Mapped[Decimal] = mapped_column(Numeric(12, 2), default=Decimal("0"))
    max_visitors_per_day: Mapped[int] = mapped_column(Integer, default=200)
    session_hours: Mapped[int] = mapped_column(Integer, default=6)
    visitor_count: Mapped[int] = mapped_column(Integer, default=0)
    # users.event_id points back here: use_alter breaks the cycle for table drops.
    created_by_user_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL", use_alter=True), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow)
