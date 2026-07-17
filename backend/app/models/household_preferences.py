from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import JSON, DateTime, ForeignKey, String, UniqueConstraint, Uuid
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class HouseholdRegionalGapSettings(Base):
    __tablename__ = "household_regional_gap_settings"

    household_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("households.id", ondelete="CASCADE"),
        primary_key=True,
    )
    targets: Mapped[list[dict]] = mapped_column(JSON, default=list)
    last_ai_suggestion: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    updated_by_user_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=datetime.utcnow,
        onupdate=datetime.utcnow,
    )


class UserOperationalActionSnooze(Base):
    __tablename__ = "user_operational_action_snoozes"
    __table_args__ = (
        UniqueConstraint(
            "user_id",
            "household_id",
            "action_id",
            name="uq_operational_action_snooze",
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        index=True,
    )
    household_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("households.id", ondelete="CASCADE"),
        index=True,
    )
    action_id: Mapped[str] = mapped_column(String(240))
    signature: Mapped[str] = mapped_column(String(512))
    until: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)
