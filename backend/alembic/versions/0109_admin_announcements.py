"""Audit global administrator announcements without changing existing notifications."""

import sqlalchemy as sa

from alembic import op

revision = "0109_admin_announcements"
down_revision = "0108_personal_dashboard"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "admin_announcements",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column(
            "created_by_user_id",
            sa.Uuid(),
            sa.ForeignKey("users.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("title", sa.String(180), nullable=False),
        sa.Column("message", sa.Text(), nullable=False),
        sa.Column("action_url", sa.String(500), nullable=True),
        sa.Column("recipient_count", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_admin_announcements_created_at", "admin_announcements", ["created_at"])


def downgrade() -> None:
    op.drop_table("admin_announcements")
