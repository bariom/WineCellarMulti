from datetime import UTC, datetime
from decimal import Decimal
from uuid import UUID, uuid4

from sqlalchemy import JSON, DateTime, ForeignKey, Integer, Numeric, String, Uuid
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class SensoryAgentRun(Base):
    __tablename__ = "sensory_agent_runs"

    id: Mapped[UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid4)
    household_id: Mapped[UUID] = mapped_column(
        ForeignKey("households.id", ondelete="CASCADE"), index=True
    )
    user_id: Mapped[UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    status: Mapped[str] = mapped_column(String(24), default="queued")
    wine_ids: Mapped[list] = mapped_column(JSON, default=list)
    results: Mapped[list] = mapped_column(JSON, default=list)
    max_wines: Mapped[int] = mapped_column(Integer, default=10)
    budget_usd: Mapped[Decimal] = mapped_column(Numeric(12, 6), default=Decimal("1"))
    cost_usd: Mapped[Decimal] = mapped_column(Numeric(12, 6), default=Decimal("0"))
    issue: Mapped[str] = mapped_column(String(40), default="")
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(UTC)
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(UTC),
        onupdate=lambda: datetime.now(UTC),
    )
