from __future__ import annotations

import uuid
from datetime import date, datetime
from decimal import Decimal

from sqlalchemy import (
    JSON,
    Boolean,
    Date,
    DateTime,
    Float,
    ForeignKey,
    Index,
    Numeric,
    String,
    Text,
    Uuid,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class Wine(Base):
    __tablename__ = "wines"
    __table_args__ = (Index("ix_wines_household_name_vintage", "household_id", "name", "vintage"),)

    id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4)
    household_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("households.id", ondelete="CASCADE"), index=True
    )
    created_by_user_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    name: Mapped[str] = mapped_column(String(200), index=True)
    producer: Mapped[str] = mapped_column(String(200), default="")
    vintage: Mapped[str] = mapped_column(String(16), default="")
    quantity: Mapped[int] = mapped_column(default=0)
    currency: Mapped[str] = mapped_column(String(8), default="CHF")
    price: Mapped[Decimal] = mapped_column(Numeric(10, 2), default=0)
    current_value: Mapped[Decimal | None] = mapped_column(Numeric(10, 2), nullable=True)
    value_not_found: Mapped[bool] = mapped_column(Boolean, default=False)
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
    ai_value_estimated_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    rating: Mapped[int] = mapped_column(default=0)
    owners: Mapped[list[dict]] = mapped_column(JSON, default=list)
    tags: Mapped[list[str]] = mapped_column(JSON, default=list)
    grapes: Mapped[list[dict]] = mapped_column(JSON, default=list)
    grapes_source_url: Mapped[str] = mapped_column(String(500), default="")
    grapes_source_title: Mapped[str] = mapped_column(String(200), default="")
    grapes_verified_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    grapes_not_applicable: Mapped[bool] = mapped_column(Boolean, default=False)
    scores: Mapped[list[dict]] = mapped_column(JSON, default=list)
    scores_not_applicable: Mapped[bool] = mapped_column(Boolean, default=False)
    vineyard_name: Mapped[str] = mapped_column(String(240), default="")
    vineyard_locality: Mapped[str] = mapped_column(String(240), default="")
    vineyard_country: Mapped[str] = mapped_column(String(120), default="")
    vineyard_latitude: Mapped[float | None] = mapped_column(Float, nullable=True)
    vineyard_longitude: Mapped[float | None] = mapped_column(Float, nullable=True)
    vineyard_precision: Mapped[str] = mapped_column(String(24), default="")
    vineyard_source_url: Mapped[str] = mapped_column(String(500), default="")
    vineyard_source_title: Mapped[str] = mapped_column(String(240), default="")
    vineyard_notes: Mapped[str] = mapped_column(Text, default="")
    vineyard_verified_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    vineyard_not_found: Mapped[bool] = mapped_column(Boolean, default=False)
    photo_version: Mapped[str] = mapped_column(String(32), default="")
    tasting_history: Mapped[list[dict]] = mapped_column(JSON, default=list)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=datetime.utcnow, index=True
    )


class WineValueHistory(Base):
    __tablename__ = "wine_value_history"
    __table_args__ = (Index("ix_wine_value_history_wine_recorded_at", "wine_id", "recorded_at"),)

    id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4)
    wine_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("wines.id", ondelete="CASCADE"), index=True
    )
    value: Mapped[Decimal] = mapped_column(Numeric(10, 2))
    currency: Mapped[str] = mapped_column(String(8), default="CHF")
    source: Mapped[str] = mapped_column(String(32), default="manual")
    recorded_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=datetime.utcnow, index=True
    )


class WineTastingEntry(Base):
    __tablename__ = "wine_tasting_entries"
    __table_args__ = (
        Index(
            "ix_wine_tastings_household_consumed_created",
            "household_id",
            "consumed_at",
            "created_at",
        ),
        Index("ix_wine_tastings_wine_consumed", "wine_id", "consumed_at"),
    )

    id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4)
    wine_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("wines.id", ondelete="CASCADE"), index=True
    )
    household_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("households.id", ondelete="CASCADE"), index=True
    )
    consumed_at: Mapped[date] = mapped_column(Date, index=True)
    note: Mapped[str] = mapped_column(Text, default="")
    rating: Mapped[int] = mapped_column(default=0)
    enjoyment: Mapped[str] = mapped_column(String(16), default="")
    occasion: Mapped[str] = mapped_column(String(200), default="")
    pairing: Mapped[str] = mapped_column(String(300), default="")
    companions: Mapped[str] = mapped_column(String(300), default="")
    purchase_price_at_consumption: Mapped[Decimal | None] = mapped_column(
        Numeric(10, 2), nullable=True
    )
    market_value_at_consumption: Mapped[Decimal | None] = mapped_column(
        Numeric(10, 2), nullable=True
    )
    currency_at_consumption: Mapped[str] = mapped_column(String(8), default="")
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=datetime.utcnow, index=True
    )
