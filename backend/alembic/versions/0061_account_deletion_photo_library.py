"""account deletion photo library

Revision ID: 0061_account_deletion_photos
Revises: 0060_wine_created_at
"""

import sqlalchemy as sa

from alembic import op

revision = "0061_account_deletion_photos"
down_revision = "0060_wine_created_at"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "wine_photo_library_entries",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("name", sa.String(length=200), nullable=False),
        sa.Column("producer", sa.String(length=200), nullable=False),
        sa.Column("normalized_name", sa.String(length=200), nullable=False),
        sa.Column("normalized_producer", sa.String(length=200), nullable=False),
        sa.Column("source_wine_id", sa.Uuid(), nullable=True),
        sa.Column("photo_version", sa.String(length=32), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(
            ["source_wine_id"],
            ["wines.id"],
            ondelete="SET NULL",
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_wine_photo_library_entries_source_wine_id",
        "wine_photo_library_entries",
        ["source_wine_id"],
    )
    op.create_index(
        "ix_wine_photo_library_entries_normalized_name",
        "wine_photo_library_entries",
        ["normalized_name"],
    )
    op.create_index(
        "ix_wine_photo_library_entries_normalized_producer",
        "wine_photo_library_entries",
        ["normalized_producer"],
    )
    op.create_index(
        "uq_wine_photo_library_identity",
        "wine_photo_library_entries",
        ["normalized_name", "normalized_producer"],
        unique=True,
    )


def downgrade() -> None:
    op.drop_index(
        "ix_wine_photo_library_entries_source_wine_id",
        table_name="wine_photo_library_entries",
    )
    op.drop_index(
        "uq_wine_photo_library_identity",
        table_name="wine_photo_library_entries",
    )
    op.drop_index(
        "ix_wine_photo_library_entries_normalized_producer",
        table_name="wine_photo_library_entries",
    )
    op.drop_index(
        "ix_wine_photo_library_entries_normalized_name",
        table_name="wine_photo_library_entries",
    )
    op.drop_table("wine_photo_library_entries")
