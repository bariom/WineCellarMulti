"""add per-user restaurant mode access

Revision ID: 0087_user_restaurant_mode_access
Revises: 0086_restaurant_sales
"""

import sqlalchemy as sa

from alembic import op

revision = "0087_user_restaurant_mode_access"
down_revision = "0086_restaurant_sales"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "users",
        sa.Column("can_use_restaurant_mode", sa.Boolean(), nullable=False, server_default=sa.false()),
    )
    # Preserve access for users already participating in a restaurant cellar.
    op.execute(
        """
        UPDATE users
        SET can_use_restaurant_mode = true
        WHERE id IN (
            SELECT memberships.user_id
            FROM memberships
            JOIN households ON households.id = memberships.household_id
            WHERE households.operating_mode = 'restaurant'
        )
        """
    )
    op.alter_column("users", "can_use_restaurant_mode", server_default=None)


def downgrade() -> None:
    op.drop_column("users", "can_use_restaurant_mode")
