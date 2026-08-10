"""add restaurant stock lots and movement ledger

Revision ID: 0088_restaurant_stock_ledger
Revises: 0087_user_restaurant_mode_access
"""

import uuid
from datetime import UTC, date, datetime
from decimal import Decimal

import sqlalchemy as sa

from alembic import op

revision = "0088_restaurant_stock_ledger"
down_revision = "0087_user_restaurant_mode_access"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("wine_sales", sa.Column("total_purchase_cost", sa.Numeric(12, 2), nullable=True))
    op.execute(
        "UPDATE wine_sales SET total_purchase_cost = unit_purchase_cost * quantity "
        "WHERE total_purchase_cost IS NULL"
    )
    op.create_table(
        "wine_stock_lots",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("wine_id", sa.Uuid(), nullable=False),
        sa.Column("household_id", sa.Uuid(), nullable=False),
        sa.Column("acquired_on", sa.Date(), nullable=False),
        sa.Column("quantity_received", sa.Integer(), nullable=False),
        sa.Column("quantity_remaining", sa.Integer(), nullable=False),
        sa.Column("unit_cost", sa.Numeric(10, 2), nullable=False),
        sa.Column("currency", sa.String(length=8), nullable=False, server_default="CHF"),
        sa.Column("supplier", sa.String(length=160), nullable=False, server_default=""),
        sa.Column("reference", sa.String(length=160), nullable=False, server_default=""),
        sa.Column("note", sa.Text(), nullable=False, server_default=""),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint("quantity_received > 0", name="ck_wine_stock_lot_received_positive"),
        sa.CheckConstraint(
            "quantity_remaining >= 0", name="ck_wine_stock_lot_remaining_nonnegative"
        ),
        sa.ForeignKeyConstraint(["household_id"], ["households.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["wine_id"], ["wines.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_wine_stock_lots_wine_id", "wine_stock_lots", ["wine_id"])
    op.create_index("ix_wine_stock_lots_household_id", "wine_stock_lots", ["household_id"])
    op.create_index("ix_wine_stock_lots_acquired_on", "wine_stock_lots", ["acquired_on"])
    op.create_index("ix_wine_stock_lots_created_at", "wine_stock_lots", ["created_at"])
    op.create_index(
        "ix_wine_stock_lots_household_wine", "wine_stock_lots", ["household_id", "wine_id"]
    )
    op.create_index(
        "ix_wine_stock_lots_fifo", "wine_stock_lots", ["wine_id", "acquired_on", "created_at"]
    )

    op.create_table(
        "wine_stock_movements",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("wine_id", sa.Uuid(), nullable=False),
        sa.Column("household_id", sa.Uuid(), nullable=False),
        sa.Column("lot_id", sa.Uuid(), nullable=True),
        sa.Column("sale_id", sa.Uuid(), nullable=True),
        sa.Column("created_by_user_id", sa.Uuid(), nullable=True),
        sa.Column("movement_type", sa.String(length=32), nullable=False),
        sa.Column("quantity_delta", sa.Integer(), nullable=False),
        sa.Column("unit_cost", sa.Numeric(10, 2), nullable=False),
        sa.Column("currency", sa.String(length=8), nullable=False, server_default="CHF"),
        sa.Column("occurred_on", sa.Date(), nullable=False),
        sa.Column("supplier", sa.String(length=160), nullable=False, server_default=""),
        sa.Column("reference", sa.String(length=160), nullable=False, server_default=""),
        sa.Column("note", sa.Text(), nullable=False, server_default=""),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint("quantity_delta <> 0", name="ck_wine_stock_movement_delta_nonzero"),
        sa.ForeignKeyConstraint(["created_by_user_id"], ["users.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["household_id"], ["households.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["lot_id"], ["wine_stock_lots.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["sale_id"], ["wine_sales.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["wine_id"], ["wines.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    for column in ("wine_id", "household_id", "movement_type", "occurred_on", "created_at"):
        op.create_index(f"ix_wine_stock_movements_{column}", "wine_stock_movements", [column])
    op.create_index("ix_wine_stock_movements_sale_id", "wine_stock_movements", ["sale_id"])
    op.create_index("ix_wine_stock_movements_lot_id", "wine_stock_movements", ["lot_id"])
    op.create_index(
        "ix_wine_stock_movements_household_occurred",
        "wine_stock_movements",
        ["household_id", "occurred_on", "created_at"],
    )
    op.create_index(
        "ix_wine_stock_movements_wine_occurred",
        "wine_stock_movements",
        ["wine_id", "occurred_on"],
    )

    connection = op.get_bind()
    wines = connection.execute(
        sa.text(
            "SELECT id, household_id, quantity, price, currency, order_date, merchant, created_at "
            "FROM wines WHERE quantity > 0"
        )
    ).mappings()
    now = datetime.now(UTC)
    for wine in wines:
        lot_id = uuid.uuid4()
        movement_id = uuid.uuid4()
        acquired_on = wine["order_date"] or (
            wine["created_at"].date() if wine["created_at"] else date.today()
        )
        values = {
            "wine_id": wine["id"],
            "household_id": wine["household_id"],
            "quantity": int(wine["quantity"]),
            "cost": Decimal(wine["price"] or 0),
            "currency": (wine["currency"] or "CHF").upper(),
            "acquired_on": acquired_on,
            "supplier": wine["merchant"] or "",
            "created_at": now,
        }
        connection.execute(
            sa.text(
                "INSERT INTO wine_stock_lots "
                "(id, wine_id, household_id, acquired_on, quantity_received, quantity_remaining, "
                "unit_cost, currency, supplier, reference, note, created_at) "
                "VALUES (:id, :wine_id, :household_id, :acquired_on, :quantity, :quantity, :cost, "
                ":currency, :supplier, '', 'Saldo iniziale migrato', :created_at)"
            ),
            {"id": lot_id, **values},
        )
        connection.execute(
            sa.text(
                "INSERT INTO wine_stock_movements "
                "(id, wine_id, household_id, lot_id, sale_id, created_by_user_id, movement_type, "
                "quantity_delta, unit_cost, currency, occurred_on, supplier, reference, note, "
                "created_at) "
                "VALUES (:id, :wine_id, :household_id, :lot_id, NULL, NULL, 'opening_balance', "
                ":quantity, :cost, :currency, :acquired_on, :supplier, '', "
                "'Saldo iniziale migrato', :created_at)"
            ),
            {"id": movement_id, "lot_id": lot_id, **values},
        )


def downgrade() -> None:
    op.drop_table("wine_stock_movements")
    op.drop_table("wine_stock_lots")
    op.drop_column("wine_sales", "total_purchase_cost")
