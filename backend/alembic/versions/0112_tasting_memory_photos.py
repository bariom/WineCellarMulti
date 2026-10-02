"""Attach compact memory photos to cellar and external tastings."""

import sqlalchemy as sa
from alembic import op

revision = "0112_tasting_memory_photos"
down_revision = "0111_user_onboarding"
branch_labels = None
depends_on = None


def upgrade() -> None:
    for table in ("wine_tasting_entries", "external_wine_tastings"):
        op.add_column(table, sa.Column("memory_photo", sa.LargeBinary(), nullable=True))
        op.add_column(
            table,
            sa.Column("memory_photo_version", sa.String(32), nullable=False, server_default=""),
        )


def downgrade() -> None:
    for table in ("external_wine_tastings", "wine_tasting_entries"):
        op.drop_column(table, "memory_photo_version")
        op.drop_column(table, "memory_photo")
