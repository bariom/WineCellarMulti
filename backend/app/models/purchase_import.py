"""Reviewed purchase imports; document hashes also act as idempotency keys."""

import uuid
from datetime import UTC, datetime

from sqlalchemy import JSON, DateTime, ForeignKey, Integer, String, UniqueConstraint, Uuid
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class PurchaseImport(Base):
    __tablename__ = "purchase_imports"
    __table_args__ = (UniqueConstraint("household_id", "document_hash"),)

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    household_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("households.id", ondelete="CASCADE"), index=True
    )
    created_by_user_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid, ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    document_hash: Mapped[str] = mapped_column(String(64))
    document_name: Mapped[str] = mapped_column(String(200), default="")
    document_mime: Mapped[str] = mapped_column(String(64), default="")
    document_size: Mapped[int] = mapped_column(Integer, default=0)
    status: Mapped[str] = mapped_column(String(24), default="draft")
    draft: Mapped[dict] = mapped_column(JSON, default=dict)
    confirmed: Mapped[dict] = mapped_column(JSON, default=dict)
    result: Mapped[dict] = mapped_column(JSON, default=dict)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(UTC)
    )


class PurchaseDocumentWine(Base):
    __tablename__ = "purchase_document_wines"

    purchase_import_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("purchase_imports.id", ondelete="CASCADE"), primary_key=True
    )
    wine_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("wines.id", ondelete="CASCADE"), primary_key=True, index=True
    )
    household_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("households.id", ondelete="CASCADE"), index=True
    )
