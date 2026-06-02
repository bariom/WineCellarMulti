"""wine tasting history

Revision ID: 0026_wine_tasting_history
Revises: 0025_wishlist_ai_market
Create Date: 2026-06-02 00:00:00.000000
"""

from alembic import op
import sqlalchemy as sa


revision = "0026_wine_tasting_history"
down_revision = "0025_wishlist_ai_market"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("wines", sa.Column("tasting_history", sa.JSON(), nullable=False, server_default="[]"))
    op.alter_column("wines", "tasting_history", server_default=None)


def downgrade() -> None:
    op.drop_column("wines", "tasting_history")
