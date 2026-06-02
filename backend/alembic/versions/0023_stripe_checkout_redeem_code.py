"""stripe checkout redeem code link

Revision ID: 0023_stripe_checkout_redeem_code
Revises: 0022_stripe_plans_and_events
Create Date: 2026-06-02 00:00:00.000000
"""

from alembic import op
import sqlalchemy as sa


revision = "0023_stripe_checkout_redeem_code"
down_revision = "0022_stripe_plans_and_events"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("stripe_checkout_sessions", sa.Column("redeem_code_id", sa.Uuid(), nullable=True))
    op.create_foreign_key("fk_stripe_checkout_sessions_redeem_code_id", "stripe_checkout_sessions", "redeem_codes", ["redeem_code_id"], ["id"], ondelete="SET NULL")
    op.create_index(op.f("ix_stripe_checkout_sessions_redeem_code_id"), "stripe_checkout_sessions", ["redeem_code_id"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_stripe_checkout_sessions_redeem_code_id"), table_name="stripe_checkout_sessions")
    op.drop_constraint("fk_stripe_checkout_sessions_redeem_code_id", "stripe_checkout_sessions", type_="foreignkey")
    op.drop_column("stripe_checkout_sessions", "redeem_code_id")
