from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Index, String, Text, Uuid
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class UserNotification(Base):
    __tablename__ = "user_notifications"
    __table_args__ = (
        Index("uq_user_notifications_user_id_fingerprint", "user_id", "fingerprint", unique=True),
        Index("ix_user_notifications_user_read_created", "user_id", "read_at", "created_at"),
    )

    id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    kind: Mapped[str] = mapped_column(String(80), default="info")
    title: Mapped[str] = mapped_column(String(180))
    message: Mapped[str] = mapped_column(Text, default="")
    action_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    fingerprint: Mapped[str | None] = mapped_column(String(200), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow)
    read_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    archived_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class UserNotificationDismissal(Base):
    __tablename__ = "user_notification_dismissals"
    __table_args__ = (
        Index(
            "uq_user_notification_dismissals_user_fingerprint",
            "user_id",
            "fingerprint",
            unique=True,
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    fingerprint: Mapped[str] = mapped_column(String(200))
    dismissed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow)
