"""add notification fingerprint

Revision ID: 0029_notification_fingerprint
Revises: 0028_wishlist_ai_context_note
Create Date: 2026-06-05 10:00:00.000000
"""

from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa


revision: str = "0029_notification_fingerprint"
down_revision: str | Sequence[str] | None = "0028_wishlist_ai_context_note"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("user_notifications", sa.Column("fingerprint", sa.String(length=200), nullable=True))
    op.create_index(
        "uq_user_notifications_user_id_fingerprint",
        "user_notifications",
        ["user_id", "fingerprint"],
        unique=True,
    )


def downgrade() -> None:
    op.drop_index("uq_user_notifications_user_id_fingerprint", table_name="user_notifications")
    op.drop_column("user_notifications", "fingerprint")
