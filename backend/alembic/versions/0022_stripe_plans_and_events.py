"""stripe plans and webhook events

Revision ID: 0022_stripe_plans_and_events
Revises: 0021_stripe_checkout_sessions
Create Date: 2026-06-01 00:00:00.000000
"""

from alembic import op
import sqlalchemy as sa


revision = "0022_stripe_plans_and_events"
down_revision = "0021_stripe_checkout_sessions"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("stripe_checkout_sessions", sa.Column("stripe_subscription_id", sa.String(length=255), nullable=True))
    op.add_column("stripe_checkout_sessions", sa.Column("plan", sa.String(length=32), nullable=False, server_default="annual"))
    op.alter_column("stripe_checkout_sessions", "plan", server_default=None)
    op.create_index(op.f("ix_stripe_checkout_sessions_stripe_subscription_id"), "stripe_checkout_sessions", ["stripe_subscription_id"], unique=False)
    op.create_table(
        "stripe_webhook_events",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("stripe_event_id", sa.String(length=255), nullable=False),
        sa.Column("event_type", sa.String(length=120), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_stripe_webhook_events_stripe_event_id"), "stripe_webhook_events", ["stripe_event_id"], unique=True)


def downgrade() -> None:
    op.drop_index(op.f("ix_stripe_webhook_events_stripe_event_id"), table_name="stripe_webhook_events")
    op.drop_table("stripe_webhook_events")
    op.drop_index(op.f("ix_stripe_checkout_sessions_stripe_subscription_id"), table_name="stripe_checkout_sessions")
    op.drop_column("stripe_checkout_sessions", "plan")
    op.drop_column("stripe_checkout_sessions", "stripe_subscription_id")
