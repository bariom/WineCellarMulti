"""wishlist ai market price

Revision ID: 0025_wishlist_ai_market
Revises: 0024_notifications_status
Create Date: 2026-06-02 00:00:00.000000
"""

from alembic import op
import sqlalchemy as sa


revision = "0025_wishlist_ai_market"
down_revision = "0024_notifications_status"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("wishlist_items", sa.Column("ai_market_price", sa.Numeric(10, 2), nullable=True))
    op.add_column("wishlist_items", sa.Column("ai_market_price_currency", sa.String(length=8), nullable=False, server_default=""))
    op.alter_column("wishlist_items", "ai_market_price_currency", server_default=None)


def downgrade() -> None:
    op.drop_column("wishlist_items", "ai_market_price_currency")
    op.drop_column("wishlist_items", "ai_market_price")
