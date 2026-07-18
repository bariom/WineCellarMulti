"""wine product photos

Revision ID: 0056_wine_product_photos
Revises: 0055_operational_metrics
"""

import sqlalchemy as sa

from alembic import op

revision = "0056_wine_product_photos"
down_revision = "0055_operational_metrics"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "wines",
        sa.Column("photo_version", sa.String(length=32), nullable=False, server_default=""),
    )
    op.alter_column("wines", "photo_version", server_default=None)


def downgrade() -> None:
    op.drop_column("wines", "photo_version")
