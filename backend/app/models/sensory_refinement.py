from datetime import UTC, datetime
from uuid import UUID, uuid4

from sqlalchemy import JSON, DateTime, ForeignKey, String, Uuid
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class SensoryRefinementRun(Base):
    __tablename__ = "sensory_refinement_runs"

    id: Mapped[UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid4)
    household_id: Mapped[UUID] = mapped_column(
        ForeignKey("households.id", ondelete="CASCADE"), index=True
    )
    user_id: Mapped[UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    wine_id: Mapped[UUID] = mapped_column(ForeignKey("wines.id", ondelete="CASCADE"))
    identity_id: Mapped[UUID] = mapped_column(
        ForeignKey("shared_wine_identities.id", ondelete="CASCADE")
    )
    status: Mapped[str] = mapped_column(String(24), default="queued")
    issue: Mapped[str] = mapped_column(String(40), default="")
    proposal: Mapped[dict] = mapped_column(JSON, default=dict)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(UTC)
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(UTC),
        onupdate=lambda: datetime.now(UTC),
    )
