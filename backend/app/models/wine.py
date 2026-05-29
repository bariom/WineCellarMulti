from __future__ import annotations

import uuid
from datetime import date
from decimal import Decimal

from sqlalchemy import Date, ForeignKey, Numeric, String, Text, Uuid
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
    status: Mapped[str] = mapped_column(String(32), default="Ordered")
    expected_delivery: Mapped[date | None] = mapped_column(Date, nullable=True)
    notes: Mapped[str] = mapped_column(Text, default="")
