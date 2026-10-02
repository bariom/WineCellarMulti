"""Preserve GPS coordinates separately from sanitized memory photos."""

import sqlalchemy as sa

from alembic import op

revision = "0113_memory_photo_location"
down_revision = "0112_tasting_memory_photos"
branch_labels = None
depends_on = None


def upgrade() -> None:
    for table in ("wine_tasting_entries", "external_wine_tastings"):
        op.add_column(table, sa.Column("memory_photo_location", sa.JSON(), nullable=True))


def downgrade() -> None:
    for table in ("external_wine_tastings", "wine_tasting_entries"):
        op.drop_column(table, "memory_photo_location")
