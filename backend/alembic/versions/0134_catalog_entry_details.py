"""Give shared catalog entries a description, its sources and when AI researched them."""

import sqlalchemy as sa

from alembic import op

revision = "0134_catalog_entry_details"
down_revision = "0133_spreadsheet_ai_names"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "wine_catalog_entries",
        sa.Column("description", sa.Text(), nullable=False, server_default=""),
    )
    op.add_column(
        "wine_catalog_entries",
        sa.Column("sources", sa.JSON(), nullable=False, server_default="[]"),
    )
    op.add_column(
        "wine_catalog_entries",
        sa.Column("enriched_at", sa.DateTime(timezone=True), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("wine_catalog_entries", "enriched_at")
    op.drop_column("wine_catalog_entries", "sources")
    op.drop_column("wine_catalog_entries", "description")
