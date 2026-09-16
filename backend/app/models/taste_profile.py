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
        UniqueConstraint("user_id", "household_id", "category", name="uq_user_taste_profile_scope"),
        Index("ix_user_taste_profiles_scope", "user_id", "household_id", "category"),
    )

    id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    # Nullable only for preserved profiles created before household scoping.
    household_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("households.id", ondelete="CASCADE"),
        nullable=True,
        index=True,
    )
    category: Mapped[str] = mapped_column(String(24), default="global")
    dimensions: Mapped[dict] = mapped_column(JSON, default=dict)
    attributes: Mapped[dict] = mapped_column(JSON, default=dict)
    confidence: Mapped[float] = mapped_column(Float, default=0.0)
    sample_count: Mapped[int] = mapped_column(default=0)
    calculation_version: Mapped[int] = mapped_column(default=2)
    shadow_dimensions: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    shadow_confidence: Mapped[float | None] = mapped_column(Float, nullable=True)
    shadow_calculation_version: Mapped[int | None] = mapped_column(nullable=True)
    rebuilt_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=datetime.utcnow, onupdate=datetime.utcnow
    )


class UserTasteProfileRevision(Base):
    """Immutable snapshot retained before a derived taste profile changes."""

    __tablename__ = "user_taste_profile_revisions"
    __table_args__ = (
        Index(
            "ix_user_taste_profile_revisions_scope",
            "user_id",
            "household_id",
            "category",
            "archived_at",
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4)
    profile_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("user_taste_profiles.id", ondelete="SET NULL"),
        nullable=True,
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    household_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("households.id", ondelete="CASCADE"),
        nullable=True,
        index=True,
    )
    category: Mapped[str] = mapped_column(String(24), default="global")
    dimensions: Mapped[dict] = mapped_column(JSON, default=dict)
    attributes: Mapped[dict] = mapped_column(JSON, default=dict)
    confidence: Mapped[float] = mapped_column(Float, default=0.0)
    sample_count: Mapped[int] = mapped_column(default=0)
    calculation_version: Mapped[int] = mapped_column(default=2)
    rebuilt_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow)
    archived_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow)
    archive_reason: Mapped[str] = mapped_column(String(32), default="rebuild")


class UserWineRating(Base):
    """A private star rating used as a lightweight taste-preference signal."""

    __tablename__ = "user_wine_ratings"
    __table_args__ = (
        UniqueConstraint("user_id", "wine_id", name="uq_user_wine_rating_user_wine"),
        Index("ix_user_wine_ratings_user_household", "user_id", "household_id"),
    )

    id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    household_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("households.id", ondelete="CASCADE"), index=True
    )
    wine_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("wines.id", ondelete="CASCADE"), index=True
    )
    rating: Mapped[int] = mapped_column(default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=datetime.utcnow, onupdate=datetime.utcnow
    )
