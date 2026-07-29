"""add wishlist offer price

Revision ID: 0070_wishlist_offer_price
Revises: 0069_monitor_device_tokens
"""
from alembic import op
import sqlalchemy as sa

revision = "0070_wishlist_offer_price"
down_revision = "0069_monitor_device_tokens"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("wishlist_items", sa.Column("offer_price", sa.Numeric(10, 2), nullable=True))


def downgrade() -> None:
    op.drop_column("wishlist_items", "offer_price")
