"""add quantitative wine strategy allocations

Revision ID: 0098_wine_strategy_allocations
Revises: 0097_pulse_run_status_len
"""

import sqlalchemy as sa

from alembic import op

revision = "0098_wine_strategy_allocations"
down_revision = "0097_pulse_run_status_len"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "wine_strategy_allocations",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("wine_id", sa.Uuid(), nullable=False),
        sa.Column("household_id", sa.Uuid(), nullable=False),
        sa.Column("stock_lot_id", sa.Uuid(), nullable=True),
        sa.Column("purpose", sa.String(length=32), nullable=False),
        sa.Column("quantity", sa.Integer(), nullable=False),
        sa.Column("horizon_year", sa.Integer(), nullable=True),
        sa.Column("note", sa.Text(), nullable=False, server_default=""),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint("quantity > 0", name="ck_wine_strategy_allocations_quantity"),
        sa.CheckConstraint(
            "purpose IN ('drink', 'maturation', 'investment', 'special_occasion', 'undecided')",
            name="ck_wine_strategy_allocations_purpose",
        ),
        sa.ForeignKeyConstraint(["household_id"], ["households.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["stock_lot_id"], ["wine_stock_lots.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["wine_id"], ["wines.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_wine_strategy_allocations_household_wine",
        "wine_strategy_allocations",
        ["household_id", "wine_id"],
    )
    op.create_index(
        "ix_wine_strategy_allocations_lot", "wine_strategy_allocations", ["stock_lot_id"]
    )
    op.create_index(
        op.f("ix_wine_strategy_allocations_purpose"),
        "wine_strategy_allocations",
        ["purpose"],
    )
    op.create_index(
        op.f("ix_wine_strategy_allocations_wine_id"),
        "wine_strategy_allocations",
        ["wine_id"],
    )


def downgrade() -> None:
    op.drop_table("wine_strategy_allocations")
