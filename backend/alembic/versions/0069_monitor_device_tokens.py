"""add revocable monitor device tokens

Revision ID: 0069_monitor_device_tokens
Revises: 0068_wine_grapes_not_applicable
"""

import sqlalchemy as sa

from alembic import op

revision = "0069_monitor_device_tokens"
down_revision = "0068_wine_grapes_not_applicable"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "user_monitor_device_tokens",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("token_hash", sa.String(length=128), nullable=False),
        sa.Column("label", sa.String(length=80), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("last_used_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("revoked_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("token_hash"),
    )
    op.create_index("ix_user_monitor_device_tokens_user_id", "user_monitor_device_tokens", ["user_id"])
    op.create_index("ix_user_monitor_device_tokens_token_hash", "user_monitor_device_tokens", ["token_hash"])


def downgrade() -> None:
    op.drop_index("ix_user_monitor_device_tokens_token_hash", table_name="user_monitor_device_tokens")
    op.drop_index("ix_user_monitor_device_tokens_user_id", table_name="user_monitor_device_tokens")
    op.drop_table("user_monitor_device_tokens")
