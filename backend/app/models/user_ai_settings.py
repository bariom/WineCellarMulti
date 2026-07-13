from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Integer, String, Text, Uuid
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class UserAiSettings(Base):
    __tablename__ = "user_ai_settings"

    user_id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
    openai_api_key: Mapped[str] = mapped_column(Text, default="")
    provider_mode: Mapped[str] = mapped_column(String(32), default="auto")
    ai_notes_model: Mapped[str] = mapped_column(String(120), default="gpt-5.4-mini")
    drink_window_model: Mapped[str] = mapped_column(String(120), default="gpt-5.4")
    value_model: Mapped[str] = mapped_column(String(120), default="gpt-5.4-mini")
    grape_model: Mapped[str] = mapped_column(String(120), default="gpt-5.4-nano")
    score_model: Mapped[str] = mapped_column(String(120), default="gpt-5.4-mini")
    wishlist_model: Mapped[str] = mapped_column(String(120), default="gpt-5.4")
    pairing_model: Mapped[str] = mapped_column(String(120), default="gpt-5.4")
    pairing_preferences: Mapped[str] = mapped_column(Text, default="")
    pairing_candidate_limit: Mapped[int] = mapped_column(Integer, default=25)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow)
