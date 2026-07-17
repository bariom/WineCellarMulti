from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import JSON, DateTime, Uuid
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class OperationalMetricSample(Base):
    __tablename__ = "operational_metric_samples"

    id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4)
    collected_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)
    system: Mapped[dict] = mapped_column(JSON, default=dict)
    application: Mapped[dict] = mapped_column(JSON, default=dict)
    business: Mapped[dict] = mapped_column(JSON, default=dict)
