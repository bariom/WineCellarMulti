"""stripe checkout sessions

Revision ID: 0021_stripe_checkout_sessions
Revises: 0020_redeem_code_encrypted_value
Create Date: 2026-06-01 00:00:00.000000
"""

from alembic import op
import sqlalchemy as sa


revision = "0021_stripe_checkout_sessions"
down_revision = "0020_redeem_code_encrypted_value"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "stripe_checkout_sessions",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("stripe_session_id", sa.String(length=255), nullable=False),
        sa.Column("stripe_customer_id", sa.String(length=255), nullable=True),
        sa.Column("status", sa.String(length=32), nullable=False),
        sa.Column("duration_days", sa.Integer(), nullable=False),
        sa.Column("amount_total", sa.Integer(), nullable=True),
        sa.Column("currency", sa.String(length=16), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_stripe_checkout_sessions_user_id"), "stripe_checkout_sessions", ["user_id"], unique=False)
    op.create_index(op.f("ix_stripe_checkout_sessions_stripe_session_id"), "stripe_checkout_sessions", ["stripe_session_id"], unique=True)


def downgrade() -> None:
    op.drop_index(op.f("ix_stripe_checkout_sessions_stripe_session_id"), table_name="stripe_checkout_sessions")
    op.drop_index(op.f("ix_stripe_checkout_sessions_user_id"), table_name="stripe_checkout_sessions")
    op.drop_table("stripe_checkout_sessions")
