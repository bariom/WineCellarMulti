"""add restaurant glass service

Revision ID: 0089_restaurant_glass_service
Revises: 0088_restaurant_stock_ledger
"""

import sqlalchemy as sa

from alembic import op

revision = "0089_restaurant_glass_service"
down_revision = "0088_restaurant_stock_ledger"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("wines", sa.Column("glass_price", sa.Numeric(10, 2), nullable=True))
    op.add_column(
        "wines", sa.Column("pour_size_ml", sa.Integer(), nullable=False, server_default="100")
    )
    op.add_column(
        "wines", sa.Column("reorder_threshold", sa.Integer(), nullable=False, server_default="2")
    )
    op.add_column(
        "wines", sa.Column("open_bottle_ml", sa.Integer(), nullable=False, server_default="0")
    )
    op.add_column(
        "wines",
        sa.Column(
            "open_bottle_lot_id",
            sa.Uuid(),
            sa.ForeignKey(
                "wine_stock_lots.id",
                ondelete="SET NULL",
                name="fk_wines_open_bottle_lot_id",
            ),
            nullable=True,
        ),
    )
    op.add_column(
        "wines",
        sa.Column(
            "open_bottle_cost_remaining", sa.Numeric(12, 4), nullable=False, server_default="0"
        ),
    )
    op.add_column(
        "wines",
        sa.Column(
            "open_bottle_original_cost", sa.Numeric(12, 4), nullable=False, server_default="0"
        ),
    )
    op.add_column(
        "wine_sales",
        sa.Column("sale_kind", sa.String(length=16), nullable=False, server_default="bottle"),
    )
    op.add_column(
        "wine_sales", sa.Column("pour_size_ml", sa.Integer(), nullable=False, server_default="0")
    )
    op.add_column(
        "wine_sales",
        sa.Column("stock_bottles_consumed", sa.Integer(), nullable=False, server_default="0"),
    )


def downgrade() -> None:
    op.drop_column("wine_sales", "stock_bottles_consumed")
    op.drop_column("wine_sales", "pour_size_ml")
    op.drop_column("wine_sales", "sale_kind")
    op.drop_column("wines", "open_bottle_original_cost")
    op.drop_column("wines", "open_bottle_cost_remaining")
    op.drop_column("wines", "open_bottle_lot_id")
    op.drop_column("wines", "open_bottle_ml")
    op.drop_column("wines", "reorder_threshold")
    op.drop_column("wines", "pour_size_ml")
    op.drop_column("wines", "glass_price")
