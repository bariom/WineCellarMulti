"""notifications and subscription status

Revision ID: 0024_notifications_status
Revises: 0023_stripe_checkout_redeem_code
Create Date: 2026-06-02 00:00:00.000000
"""

from alembic import op
import sqlalchemy as sa


revision = "0024_notifications_status"
down_revision = "0023_stripe_checkout_redeem_code"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("stripe_checkout_sessions", sa.Column("subscription_status", sa.String(length=64), nullable=True))
    op.add_column("stripe_checkout_sessions", sa.Column("cancel_at_period_end", sa.Boolean(), nullable=False, server_default=sa.false()))
    op.alter_column("stripe_checkout_sessions", "cancel_at_period_end", server_default=None)
    op.create_table(
        "user_notifications",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("kind", sa.String(length=80), nullable=False),
        sa.Column("title", sa.String(length=180), nullable=False),
        sa.Column("message", sa.Text(), nullable=False),
        sa.Column("action_url", sa.String(length=500), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("read_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_user_notifications_user_id"), "user_notifications", ["user_id"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_user_notifications_user_id"), table_name="user_notifications")
    op.drop_table("user_notifications")
    op.drop_column("stripe_checkout_sessions", "cancel_at_period_end")
    op.drop_column("stripe_checkout_sessions", "subscription_status")
