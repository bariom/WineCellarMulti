from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import JSON, DateTime, Float, ForeignKey, Index, String, Text, Uuid
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class WineCatalogEntry(Base):
    __tablename__ = "wine_catalog_entries"

    id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name: Mapped[str] = mapped_column(String(200), index=True)
    producer: Mapped[str] = mapped_column(String(200), default="", index=True)
    region: Mapped[str] = mapped_column(String(120), default="", index=True)
    appellation: Mapped[str] = mapped_column(String(120), default="", index=True)
    type: Mapped[str] = mapped_column(String(80), default="")
    format: Mapped[str] = mapped_column(String(80), default="")
    country: Mapped[str] = mapped_column(String(120), default="")
    grapes_text: Mapped[str] = mapped_column(Text, default="")
    search_text: Mapped[str] = mapped_column(Text, default="", index=True)
    source: Mapped[str] = mapped_column(String(40), default="manual")
    is_active: Mapped[bool] = mapped_column(default=True, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=datetime.utcnow,
        onupdate=datetime.utcnow,
    )


class WineCatalogAlias(Base):
    __tablename__ = "wine_catalog_aliases"

    id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4)
    catalog_entry_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("wine_catalog_entries.id", ondelete="CASCADE"),
        index=True,
    )
    alias: Mapped[str] = mapped_column(String(260), index=True)
    normalized_alias: Mapped[str] = mapped_column(String(260), index=True)
    source: Mapped[str] = mapped_column(String(40), default="manual")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow)


class WinePhotoLibraryEntry(Base):
    __tablename__ = "wine_photo_library_entries"
    __table_args__ = (
        Index(
            "ix_wine_photo_library_identity_created",
            "normalized_name",
            "normalized_producer",
            "created_at",
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    name: Mapped[str] = mapped_column(String(200))
    producer: Mapped[str] = mapped_column(String(200), default="")
    normalized_name: Mapped[str] = mapped_column(String(200), index=True)
    normalized_producer: Mapped[str] = mapped_column(String(200), default="", index=True)
    source_wine_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("wines.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    photo_version: Mapped[str] = mapped_column(String(32))
    content_hash: Mapped[str | None] = mapped_column(String(64), nullable=True, index=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=datetime.utcnow
    )


class WineRecognitionLog(Base):
    __tablename__ = "wine_recognition_logs"

    id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4)
    household_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("households.id", ondelete="CASCADE"),
        index=True,
    )
    user_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    provider: Mapped[str] = mapped_column(String(40), default="api4ai")
    status: Mapped[str] = mapped_column(String(40), default="success", index=True)
    image_filename: Mapped[str] = mapped_column(String(240), default="")
    best_label: Mapped[str] = mapped_column(String(260), default="")
    confidence: Mapped[float | None] = mapped_column(Float, nullable=True)
    matched_catalog_entry_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("wine_catalog_entries.id", ondelete="SET NULL"),
        nullable=True,
    )
    response_payload: Mapped[dict] = mapped_column(JSON, default=dict)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=datetime.utcnow,
        index=True,
    )
