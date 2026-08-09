"""add restaurant cellar mode and wine sales

Revision ID: 0086_restaurant_sales
Revises: 0085_wine_pulse
"""

import sqlalchemy as sa

from alembic import op

revision = "0086_restaurant_sales"
down_revision = "0085_wine_pulse"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "households",
        sa.Column("operating_mode", sa.String(length=24), nullable=False, server_default="private"),
    )
    op.create_index("ix_households_operating_mode", "households", ["operating_mode"])
    op.add_column("wines", sa.Column("sale_price", sa.Numeric(10, 2), nullable=True))
    op.create_table(
        "wine_sales",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("wine_id", sa.Uuid(), nullable=False),
        sa.Column("household_id", sa.Uuid(), nullable=False),
        sa.Column("created_by_user_id", sa.Uuid(), nullable=True),
        sa.Column("sold_at", sa.Date(), nullable=False),
        sa.Column("quantity", sa.Integer(), nullable=False),
        sa.Column("unit_sale_price", sa.Numeric(10, 2), nullable=False),
        sa.Column("unit_purchase_cost", sa.Numeric(10, 2), nullable=False),
        sa.Column("currency", sa.String(length=8), nullable=False, server_default="CHF"),
        sa.Column(
            "previous_wine_status", sa.String(length=64), nullable=False, server_default="Delivered"
        ),
        sa.Column("note", sa.Text(), nullable=False, server_default=""),
        sa.Column("voided_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("void_reason", sa.String(length=300), nullable=False, server_default=""),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["created_by_user_id"], ["users.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["household_id"], ["households.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["wine_id"], ["wines.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_wine_sales_household_id", "wine_sales", ["household_id"])
    op.create_index("ix_wine_sales_wine_id", "wine_sales", ["wine_id"])
    op.create_index("ix_wine_sales_sold_at", "wine_sales", ["sold_at"])
    op.create_index("ix_wine_sales_created_at", "wine_sales", ["created_at"])
    op.create_index(
        "ix_wine_sales_household_sold",
        "wine_sales",
        ["household_id", "sold_at", "created_at"],
    )
    op.create_index("ix_wine_sales_wine_sold", "wine_sales", ["wine_id", "sold_at"])


def downgrade() -> None:
    op.drop_table("wine_sales")
    op.drop_column("wines", "sale_price")
    op.drop_index("ix_households_operating_mode", table_name="households")
    op.drop_column("households", "operating_mode")
