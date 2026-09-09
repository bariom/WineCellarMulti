from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import (
    JSON,
    Boolean,
    DateTime,
    Float,
    ForeignKey,
    Index,
    String,
    UniqueConstraint,
    Uuid,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class WineSensoryProfile(Base):
    """A Vinaris-owned profile, shared by every inventory wine of one identity."""

    __tablename__ = "wine_sensory_profiles"
    __table_args__ = (
        UniqueConstraint("identity_id", name="uq_wine_sensory_profile_identity"),
        Index("ix_wine_sensory_profiles_source_confidence", "source", "confidence"),
    )

    id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4)
    identity_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("shared_wine_identities.id", ondelete="CASCADE"),
        index=True,
    )
    dimensions: Mapped[dict] = mapped_column(JSON, default=dict)
    source: Mapped[str] = mapped_column(String(24), default="metadata", index=True)
    confidence: Mapped[float] = mapped_column(Float, default=0.0)
    validated: Mapped[bool] = mapped_column(Boolean, default=False, index=True)
    generation_status: Mapped[str] = mapped_column(String(24), default="available", index=True)
    model: Mapped[str] = mapped_column(String(120), default="")
    last_modified_by_user_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    generated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=datetime.utcnow, onupdate=datetime.utcnow
    )


class SensoryProfileBaseline(Base):
    __tablename__ = "sensory_profile_baselines"
    __table_args__ = (
        UniqueConstraint("entity_type", "entity_key", name="uq_sensory_profile_baseline"),
        Index("ix_sensory_profile_baseline_type_key", "entity_type", "entity_key"),
    )

    id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4)
    entity_type: Mapped[str] = mapped_column(String(24), index=True)
    entity_key: Mapped[str] = mapped_column(String(240), index=True)
    dimensions: Mapped[dict] = mapped_column(JSON, default=dict)
    confidence: Mapped[float] = mapped_column(Float, default=0.5)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    last_modified_by_user_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=datetime.utcnow, onupdate=datetime.utcnow
    )


class UserTasteProfile(Base):
    __tablename__ = "user_taste_profiles"
    __table_args__ = (
        UniqueConstraint("user_id", "category", name="uq_user_taste_profile_category"),
        Index("ix_user_taste_profiles_user_category", "user_id", "category"),
    )

    id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    category: Mapped[str] = mapped_column(String(24), default="global")
    dimensions: Mapped[dict] = mapped_column(JSON, default=dict)
    attributes: Mapped[dict] = mapped_column(JSON, default=dict)
    confidence: Mapped[float] = mapped_column(Float, default=0.0)
    sample_count: Mapped[int] = mapped_column(default=0)
    calculation_version: Mapped[int] = mapped_column(default=2)
    rebuilt_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=datetime.utcnow, onupdate=datetime.utcnow
    )
