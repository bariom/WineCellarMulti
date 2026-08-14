"""add cellar locations, bins and wine storage allocations

Revision ID: 0095_cellar_locations
Revises: 0094_wishlist_investment_amount
"""

import uuid
from datetime import UTC, datetime

import sqlalchemy as sa

from alembic import op

revision = "0095_cellar_locations"
down_revision = "0094_wishlist_investment_amount"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "cellar_locations",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("household_id", sa.Uuid(), nullable=False),
        sa.Column("name", sa.String(80), nullable=False),
        sa.Column("normalized_name", sa.String(80), nullable=False),
        sa.Column("description", sa.String(300), nullable=False, server_default=""),
        sa.Column("is_default", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("sort_order", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["household_id"], ["households.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "household_id", "normalized_name", name="uq_cellar_location_household_name"
        ),
    )
    op.create_index("ix_cellar_locations_household_id", "cellar_locations", ["household_id"])
    op.create_table(
        "cellar_bins",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("location_id", sa.Uuid(), nullable=False),
        sa.Column("name", sa.String(80), nullable=False),
        sa.Column("normalized_name", sa.String(80), nullable=False),
        sa.Column("description", sa.String(300), nullable=False, server_default=""),
        sa.Column("sort_order", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["location_id"], ["cellar_locations.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("location_id", "normalized_name", name="uq_cellar_bin_location_name"),
    )
    op.create_index("ix_cellar_bins_location_id", "cellar_bins", ["location_id"])
    op.create_table(
        "wine_storage_allocations",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("household_id", sa.Uuid(), nullable=False),
        sa.Column("wine_id", sa.Uuid(), nullable=False),
        sa.Column("location_id", sa.Uuid(), nullable=True),
        sa.Column("bin_id", sa.Uuid(), nullable=True),
        sa.Column("quantity", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint("quantity > 0", name="ck_wine_storage_allocation_quantity_positive"),
        sa.ForeignKeyConstraint(["household_id"], ["households.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["wine_id"], ["wines.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["location_id"], ["cellar_locations.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["bin_id"], ["cellar_bins.id"], ondelete="RESTRICT"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_wine_storage_allocations_household_id", "wine_storage_allocations", ["household_id"]
    )
    op.create_index("ix_wine_storage_allocations_wine_id", "wine_storage_allocations", ["wine_id"])
    op.create_index(
        "ix_wine_storage_allocations_household_wine",
        "wine_storage_allocations",
        ["household_id", "wine_id"],
    )
    op.create_index(
        "ix_wine_storage_allocations_location_bin",
        "wine_storage_allocations",
        ["location_id", "bin_id"],
    )
    op.create_table(
        "wine_storage_movements",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("household_id", sa.Uuid(), nullable=False),
        sa.Column("wine_id", sa.Uuid(), nullable=False),
        sa.Column("created_by_user_id", sa.Uuid(), nullable=True),
        sa.Column("movement_type", sa.String(24), nullable=False, server_default="relocation"),
        sa.Column("quantity", sa.Integer(), nullable=False),
        sa.Column("from_location_id", sa.Uuid(), nullable=True),
        sa.Column("from_bin_id", sa.Uuid(), nullable=True),
        sa.Column("to_location_id", sa.Uuid(), nullable=True),
        sa.Column("to_bin_id", sa.Uuid(), nullable=True),
        sa.Column("note", sa.Text(), nullable=False, server_default=""),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint("quantity > 0", name="ck_wine_storage_movement_quantity_positive"),
        sa.ForeignKeyConstraint(["household_id"], ["households.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["wine_id"], ["wines.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["created_by_user_id"], ["users.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["from_location_id"], ["cellar_locations.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["from_bin_id"], ["cellar_bins.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["to_location_id"], ["cellar_locations.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["to_bin_id"], ["cellar_bins.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_wine_storage_movements_household_id", "wine_storage_movements", ["household_id"]
    )
    op.create_index("ix_wine_storage_movements_wine_id", "wine_storage_movements", ["wine_id"])
    op.create_index(
        "ix_wine_storage_movements_household_created",
        "wine_storage_movements",
        ["household_id", "created_at"],
    )
    op.create_index(
        "ix_wine_storage_movements_wine_created",
        "wine_storage_movements",
        ["wine_id", "created_at"],
    )

    connection = op.get_bind()
    now = datetime.now(UTC)
    for wine in connection.execute(
        sa.text("SELECT id, household_id, quantity FROM wines WHERE quantity > 0")
    ).mappings():
        connection.execute(
            sa.text(
                "INSERT INTO wine_storage_allocations "
                "(id, household_id, wine_id, location_id, bin_id, quantity, "
                "created_at, updated_at) VALUES "
                "(:id, :household_id, :wine_id, NULL, NULL, :quantity, "
                ":created_at, :updated_at)"
            ),
            {
                "id": uuid.uuid4(),
                "household_id": wine["household_id"],
                "wine_id": wine["id"],
                "quantity": int(wine["quantity"]),
                "created_at": now,
                "updated_at": now,
            },
        )


def downgrade() -> None:
    op.drop_table("wine_storage_movements")
    op.drop_table("wine_storage_allocations")
    op.drop_table("cellar_bins")
    op.drop_table("cellar_locations")
