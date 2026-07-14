from __future__ import annotations

import uuid
from datetime import datetime
from decimal import Decimal

from sqlalchemy import DateTime, ForeignKey, Numeric, String, Text, Uuid
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class WineShareOffer(Base):
    __tablename__ = "wine_share_offers"

    id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4)
    household_id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), ForeignKey("households.id", ondelete="CASCADE"), index=True)
    wine_id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), ForeignKey("wines.id", ondelete="CASCADE"), index=True)
    created_by_user_id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), index=True)
    recipient_user_id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), index=True)
    recipient_wine_id: Mapped[uuid.UUID | None] = mapped_column(Uuid(as_uuid=True), ForeignKey("wines.id", ondelete="SET NULL"), nullable=True, index=True)
    recipient_email: Mapped[str] = mapped_column(String(320), index=True)
    share_pct: Mapped[Decimal] = mapped_column(Numeric(5, 2), default=0)
    message: Mapped[str] = mapped_column(Text, default="")
    status: Mapped[str] = mapped_column(String(32), default="pending", index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow)
    decided_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
