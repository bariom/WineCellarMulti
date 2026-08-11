"""add restaurant commercial bottle yield settings

Revision ID: 0090_restaurant_commercial_yield
Revises: 0089_restaurant_glass_service
"""

import sqlalchemy as sa

from alembic import op

revision = "0090_restaurant_commercial_yield"
down_revision = "0089_restaurant_glass_service"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "households",
        sa.Column(
            "restaurant_default_pour_size_ml",
            sa.Integer(),
            nullable=False,
            server_default="100",
        ),
    )
    op.add_column(
        "households",
        sa.Column(
            "restaurant_service_loss_ml",
            sa.Integer(),
            nullable=False,
            server_default="50",
        ),
    )
    op.add_column(
        "households",
        sa.Column(
            "restaurant_default_reorder_threshold",
            sa.Integer(),
            nullable=False,
            server_default="2",
        ),
    )
    op.add_column(
        "wine_sales",
        sa.Column("bottle_yield_ml", sa.Integer(), nullable=False, server_default="0"),
    )
    op.add_column(
        "wine_sales",
        sa.Column("discarded_volume_ml", sa.Integer(), nullable=False, server_default="0"),
    )


def downgrade() -> None:
    op.drop_column("wine_sales", "discarded_volume_ml")
    op.drop_column("wine_sales", "bottle_yield_ml")
    op.drop_column("households", "restaurant_default_reorder_threshold")
    op.drop_column("households", "restaurant_service_loss_ml")
    op.drop_column("households", "restaurant_default_pour_size_ml")
