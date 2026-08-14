"""add planned investment amount to wishlist items

Revision ID: 0094_wishlist_investment_amount
Revises: 0093_cellar_ai_commands
"""

import sqlalchemy as sa

from alembic import op

revision = "0094_wishlist_investment_amount"
down_revision = "0093_cellar_ai_commands"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("wishlist_items", sa.Column("investment_amount", sa.Numeric(10, 2), nullable=True))


def downgrade() -> None:
    op.drop_column("wishlist_items", "investment_amount")
