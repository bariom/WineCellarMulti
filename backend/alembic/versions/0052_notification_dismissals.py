"""remember permanently dismissed notifications

Revision ID: 0052_notification_dismissals
Revises: 0051_notification_archive
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "0052_notification_dismissals"
down_revision: str | None = "0051_notification_archive"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "user_notification_dismissals",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("fingerprint", sa.String(length=200), nullable=False),
        sa.Column("dismissed_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_user_notification_dismissals_user_id",
        "user_notification_dismissals",
        ["user_id"],
        unique=False,
    )
    op.create_index(
        "uq_user_notification_dismissals_user_fingerprint",
        "user_notification_dismissals",
        ["user_id", "fingerprint"],
        unique=True,
    )


def downgrade() -> None:
    op.drop_index(
        "uq_user_notification_dismissals_user_fingerprint",
        table_name="user_notification_dismissals",
    )
    op.drop_index(
        "ix_user_notification_dismissals_user_id",
        table_name="user_notification_dismissals",
    )
    op.drop_table("user_notification_dismissals")
