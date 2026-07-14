"""Persist wishlist portfolio strategies on their wishlist list.

Revision ID: 0044_wishlist_portfolio_strategy
Revises: 0043_ai_audit_reasoning_effort
"""

from alembic import op
import sqlalchemy as sa


revision = "0044_wishlist_portfolio_strategy"
down_revision = "0043_ai_audit_reasoning_effort"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("wishlist_lists", sa.Column("portfolio_strategy", sa.JSON(), nullable=True))


def downgrade() -> None:
    op.drop_column("wishlist_lists", "portfolio_strategy")
