"""allow multiple bottle-photo variants for the same wine identity

Revision ID: 0073_multiple_wine_photo_variants
Revises: 0072_tasting_value_snapshots
"""

import sqlalchemy as sa

from alembic import op

revision = "0073_multiple_wine_photo_variants"
down_revision = "0072_tasting_value_snapshots"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.drop_index("uq_wine_photo_library_identity", table_name="wine_photo_library_entries")
    op.add_column(
        "wine_photo_library_entries",
        sa.Column("content_hash", sa.String(length=64), nullable=True),
    )
    op.create_index(
        "ix_wine_photo_library_entries_content_hash",
        "wine_photo_library_entries",
        ["content_hash"],
    )
    op.create_index(
        "ix_wine_photo_library_identity_created",
        "wine_photo_library_entries",
        ["normalized_name", "normalized_producer", "created_at"],
    )


def downgrade() -> None:
    op.drop_index("ix_wine_photo_library_identity_created", table_name="wine_photo_library_entries")
    op.drop_index("ix_wine_photo_library_entries_content_hash", table_name="wine_photo_library_entries")
    op.drop_column("wine_photo_library_entries", "content_hash")
    op.create_index(
        "uq_wine_photo_library_identity",
        "wine_photo_library_entries",
        ["normalized_name", "normalized_producer"],
        unique=True,
    )
