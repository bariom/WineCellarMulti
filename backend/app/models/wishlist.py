from __future__ import annotations

import uuid
from datetime import date, datetime
from decimal import Decimal

from sqlalchemy import JSON, Date, DateTime, ForeignKey, Index, Integer, Numeric, String, Text, Uuid
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class WishlistList(Base):
    __tablename__ = "wishlist_lists"
    __table_args__ = (Index("ix_wishlist_lists_household_name_id", "household_id", "name", "id"),)

    id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4)
    household_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("households.id", ondelete="CASCADE"), index=True
    )
    created_by_user_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    name: Mapped[str] = mapped_column(String(120), default="Wishlist")
    description: Mapped[str] = mapped_column(Text, default="")
    portfolio_strategy: Mapped[dict | None] = mapped_column(JSON, nullable=True, default=None)


class WishlistItem(Base):
    __tablename__ = "wishlist_items"
    __table_args__ = (
        Index(
            "ix_wishlist_items_household_list_priority_name",
            "household_id",
            "wishlist_list_id",
            "priority",
            "name",
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4)
    household_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("households.id", ondelete="CASCADE"), index=True
    )
    wishlist_list_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("wishlist_lists.id", ondelete="CASCADE"), index=True
    )
    created_by_user_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    name: Mapped[str] = mapped_column(String(200), index=True)
    producer: Mapped[str] = mapped_column(String(200), default="")
    vintage: Mapped[str] = mapped_column(String(16), default="")
    format: Mapped[str] = mapped_column(String(80), default="")
    type: Mapped[str] = mapped_column(String(80), default="")
    region: Mapped[str] = mapped_column(String(120), default="")
    appellation: Mapped[str] = mapped_column(String(120), default="")
    target_price: Mapped[Decimal] = mapped_column(Numeric(10, 2), default=0)
    offer_price: Mapped[Decimal | None] = mapped_column(Numeric(10, 2), nullable=True)
    investment_amount: Mapped[Decimal | None] = mapped_column(Numeric(10, 2), nullable=True)
    ai_market_price: Mapped[Decimal | None] = mapped_column(Numeric(10, 2), nullable=True)
    ai_market_price_currency: Mapped[str] = mapped_column(String(8), default="")
    currency: Mapped[str] = mapped_column(String(8), default="CHF")
    merchant: Mapped[str] = mapped_column(String(160), default="")
    priority: Mapped[str] = mapped_column(String(32), default="Medium")
    purpose: Mapped[str] = mapped_column(String(32), default="Drink")
    status: Mapped[str] = mapped_column(String(32), default="Evaluate")
    status_source: Mapped[str] = mapped_column(String(32), default="manual")
    is_shared: Mapped[str] = mapped_column(String(8), default="0")
    notes: Mapped[str] = mapped_column(Text, default="")
    ai_context_note: Mapped[str] = mapped_column(Text, default="")
    ai_strategy: Mapped[str] = mapped_column(Text, default="")
    ai_purpose_advice: Mapped[str] = mapped_column(Text, default="")


class ExternalWineTasting(Base):
    """A personal tasting of a wine that is not part of the cellar inventory."""

    __tablename__ = "external_wine_tastings"
    __table_args__ = (
        Index(
            "ix_external_wine_tastings_household_consumed_created",
            "household_id",
            "consumed_at",
            "created_at",
        ),
        Index("ix_external_wine_tastings_user_consumed", "created_by_user_id", "consumed_at"),
    )

    id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4)
    household_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("households.id", ondelete="CASCADE"), index=True
    )
    created_by_user_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    wishlist_item_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("wishlist_items.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    shared_identity_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("shared_wine_identities.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    name: Mapped[str] = mapped_column(String(200), index=True)
    producer: Mapped[str] = mapped_column(String(200), default="")
    vintage: Mapped[str] = mapped_column(String(16), default="")
    format: Mapped[str] = mapped_column(String(80), default="")
    type: Mapped[str] = mapped_column(String(80), default="")
    region: Mapped[str] = mapped_column(String(120), default="")
    appellation: Mapped[str] = mapped_column(String(120), default="")
    consumed_at: Mapped[date] = mapped_column(Date, index=True)
    note: Mapped[str] = mapped_column(Text, default="")
    rating: Mapped[int] = mapped_column(Integer, default=0)
    enjoyment: Mapped[str] = mapped_column(String(16), default="")
    occasion: Mapped[str] = mapped_column(String(200), default="")
    pairing: Mapped[str] = mapped_column(String(300), default="")
    companions: Mapped[str] = mapped_column(String(300), default="")
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=datetime.utcnow, index=True
    )
