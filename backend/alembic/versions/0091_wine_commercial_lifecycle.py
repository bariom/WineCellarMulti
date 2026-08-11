"""add wine commercial lifecycle

Revision ID: 0091_wine_commercial_lifecycle
Revises: 0090_restaurant_commercial_yield
"""

import sqlalchemy as sa

from alembic import op

revision = "0091_wine_commercial_lifecycle"
down_revision = "0090_restaurant_commercial_yield"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "wines",
        sa.Column("reorder_enabled", sa.Boolean(), nullable=False, server_default=sa.true()),
    )
    op.add_column(
        "wines",
        sa.Column(
            "commercial_status", sa.String(length=24), nullable=False, server_default="active"
        ),
    )


def downgrade() -> None:
    op.drop_column("wines", "commercial_status")
    op.drop_column("wines", "reorder_enabled")
