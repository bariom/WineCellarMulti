"""Remember the column mapping a household confirmed for a spreadsheet layout."""

import sqlalchemy as sa

from alembic import op

revision = "0132_spreadsheet_import_maps"
down_revision = "0131_wishlist_wine_profile"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "spreadsheet_import_maps",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column(
            "household_id",
            sa.Uuid(),
            sa.ForeignKey("households.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("fingerprint", sa.String(64), nullable=False),
        sa.Column("mapping", sa.JSON(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("last_used_at", sa.DateTime(timezone=True), nullable=False),
        sa.UniqueConstraint(
            "household_id", "fingerprint", name="uq_spreadsheet_import_maps_layout"
        ),
    )
    op.create_index(
        "ix_spreadsheet_import_maps_household_id", "spreadsheet_import_maps", ["household_id"]
    )


def downgrade() -> None:
    op.drop_index("ix_spreadsheet_import_maps_household_id", table_name="spreadsheet_import_maps")
    op.drop_table("spreadsheet_import_maps")
