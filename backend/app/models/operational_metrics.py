from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import JSON, DateTime, Float, String, Uuid
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class OperationalMetricSample(Base):
    __tablename__ = "operational_metric_samples"

    id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4)
    collected_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)
    system: Mapped[dict] = mapped_column(JSON, default=dict)
    application: Mapped[dict] = mapped_column(JSON, default=dict)
    business: Mapped[dict] = mapped_column(JSON, default=dict)
    # The cost portal is external and can take seconds to answer.  Persist its
    # result with the sample so opening the operations dashboard never waits on
    # an upstream network call.
    openai: Mapped[dict] = mapped_column(JSON, default=dict)


class OperationalAlertState(Base):
    """Persistent alert state used to avoid repeating operational emails."""

    __tablename__ = "operational_alert_states"

    metric: Mapped[str] = mapped_column(String(48), primary_key=True)
    severity: Mapped[str] = mapped_column(String(16))
    opened_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    last_notified_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    last_value: Mapped[float] = mapped_column(Float)
