"""use Luna as the wine-recognition provider default

Revision ID: 0074_luna_recognition_provider
Revises: 0073_multi_photo_variants
"""

import sqlalchemy as sa

from alembic import op

revision = "0074_luna_recognition_provider"
down_revision = "0073_multi_photo_variants"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.alter_column(
        "wine_recognition_logs",
        "provider",
        existing_type=sa.String(length=40),
        server_default="luna",
        existing_nullable=False,
    )


def downgrade() -> None:
    op.alter_column(
        "wine_recognition_logs",
        "provider",
        existing_type=sa.String(length=40),
        server_default="api4ai",
        existing_nullable=False,
    )
