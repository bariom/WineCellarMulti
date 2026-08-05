from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import JSON, DateTime, ForeignKey, Index, String, UniqueConstraint, Uuid
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class SharedWineIdentity(Base):
    __tablename__ = "shared_wine_identities"

    id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4)
    identity_key: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    normalized_name: Mapped[str] = mapped_column(String(240), index=True)
    normalized_producer: Mapped[str] = mapped_column(String(240), index=True)
    normalized_vintage: Mapped[str] = mapped_column(String(24), index=True)
    name: Mapped[str] = mapped_column(String(200))
    producer: Mapped[str] = mapped_column(String(200))
    vintage: Mapped[str] = mapped_column(String(16))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=datetime.utcnow, onupdate=datetime.utcnow
    )


class SharedWineFact(Base):
    __tablename__ = "shared_wine_facts"
    __table_args__ = (
        UniqueConstraint(
            "identity_id",
            "feature",
            "locale",
            "format_key",
            "currency",
            name="uq_shared_wine_fact_scope",
        ),
        Index("ix_shared_wine_fact_feature_verified", "feature", "verified_at"),
    )

    id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4)
    identity_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("shared_wine_identities.id", ondelete="CASCADE"),
        index=True,
    )
    feature: Mapped[str] = mapped_column(String(40), index=True)
    locale: Mapped[str] = mapped_column(String(8), default="")
    format_key: Mapped[str] = mapped_column(String(80), default="")
    currency: Mapped[str] = mapped_column(String(8), default="")
    status: Mapped[str] = mapped_column(String(24), default="available", index=True)
    payload: Mapped[dict] = mapped_column(JSON, default=dict)
    sources: Mapped[list[dict]] = mapped_column(JSON, default=list)
    model: Mapped[str] = mapped_column(String(120), default="")
    prompt_version: Mapped[str] = mapped_column(String(32), default="1")
    verified_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow)
    expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=datetime.utcnow, onupdate=datetime.utcnow
    )
