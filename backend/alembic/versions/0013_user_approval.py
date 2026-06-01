"""user approval

Revision ID: 0013_user_approval
Revises: 0012_wine_share_offers
Create Date: 2026-06-01 11:20:00
"""

from alembic import op
import sqlalchemy as sa


revision = "0013_user_approval"
down_revision = "0012_wine_share_offers"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("users", sa.Column("is_approved", sa.Boolean(), nullable=False, server_default=sa.true()))
    op.add_column("users", sa.Column("approved_at", sa.DateTime(timezone=True), nullable=True))


def downgrade() -> None:
    op.drop_column("users", "approved_at")
    op.drop_column("users", "is_approved")
