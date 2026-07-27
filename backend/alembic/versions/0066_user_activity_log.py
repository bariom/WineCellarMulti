"""add user activity log

Revision ID: 0066_user_activity_log
Revises: 0065_ops_alert_states
"""

import sqlalchemy as sa

from alembic import op

revision = "0066_user_activity_log"
down_revision = "0065_ops_alert_states"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "user_activity_log",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("household_id", sa.Uuid(), nullable=True),
        sa.Column("action", sa.String(length=96), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["household_id"], ["households.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        op.f("ix_user_activity_log_user_id"), "user_activity_log", ["user_id"], unique=False
    )
    op.create_index(
        op.f("ix_user_activity_log_household_id"),
        "user_activity_log",
        ["household_id"],
        unique=False,
    )
    op.create_index(
        "ix_user_activity_created_at", "user_activity_log", ["created_at"], unique=False
    )


def downgrade() -> None:
    op.drop_index("ix_user_activity_created_at", table_name="user_activity_log")
    op.drop_index(op.f("ix_user_activity_log_household_id"), table_name="user_activity_log")
    op.drop_index(op.f("ix_user_activity_log_user_id"), table_name="user_activity_log")
    op.drop_table("user_activity_log")
