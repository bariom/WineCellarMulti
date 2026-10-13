"""Separate wine area and locality from region and appellation."""

import sqlalchemy as sa

from alembic import op

revision = "0121_wine_geography"
down_revision = "0120_sensory_batch"
branch_labels = None
depends_on = None


def upgrade() -> None:
    for table, field, length in [
        ("wines", "wine_zone", 120),
        ("wine_catalog_entries", "wine_zone", 120),
        ("wine_catalog_entries", "locality", 240),
    ]:
        op.add_column(table, sa.Column(field, sa.String(length), nullable=False, server_default=""))


def downgrade() -> None:
    op.drop_column("wine_catalog_entries", "locality")
    op.drop_column("wine_catalog_entries", "wine_zone")
    op.drop_column("wines", "wine_zone")
