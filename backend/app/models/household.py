from __future__ import annotations

import uuid

from sqlalchemy import JSON, Boolean, Integer, String, Uuid
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class Household(Base):
    __tablename__ = "households"

    id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name: Mapped[str] = mapped_column(String(160), index=True)
    is_demo: Mapped[bool] = mapped_column(Boolean, default=False, index=True)
    operating_mode: Mapped[str] = mapped_column(String(24), default="private", index=True)
    restaurant_default_pour_size_ml: Mapped[int] = mapped_column(Integer, default=100)
    restaurant_service_loss_ml: Mapped[int] = mapped_column(Integer, default=50)
    restaurant_default_reorder_threshold: Mapped[int] = mapped_column(Integer, default=2)
    cellar_intelligence_preferences: Mapped[dict] = mapped_column(JSON, default=dict)
    public_wine_list_token: Mapped[str | None] = mapped_column(
        String(80), unique=True, nullable=True
    )
