"""add notification archive state

Revision ID: 0051_notification_archive
Revises: 0050_coownership_payments
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "0051_notification_archive"
down_revision: str | None = "0050_coownership_payments"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "user_notifications",
        sa.Column("archived_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index(
        "ix_user_notifications_user_archived_created",
        "user_notifications",
        ["user_id", "archived_at", "created_at"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index(
        "ix_user_notifications_user_archived_created",
        table_name="user_notifications",
    )
    op.drop_column("user_notifications", "archived_at")
