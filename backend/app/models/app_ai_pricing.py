from __future__ import annotations

from datetime import UTC, datetime

from sqlalchemy import DateTime, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class AppAiPricing(Base):
    """Singleton, app-admin-managed price overrides for AI token accounting."""

    __tablename__ = "app_ai_pricing"

    id: Mapped[int] = mapped_column(primary_key=True, default=1)
    price_book_json: Mapped[str] = mapped_column(Text, default="")
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(UTC),
        onupdate=lambda: datetime.now(UTC),
    )
