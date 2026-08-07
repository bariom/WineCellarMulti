"""cache nearby wine places from OpenStreetMap

Revision ID: 0084_map_place_cache
Revises: 0083_user_access_override
"""

import sqlalchemy as sa

from alembic import op

revision = "0084_map_place_cache"
down_revision = "0083_user_access_override"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "map_place_cache",
        sa.Column("query_key", sa.String(length=160), primary_key=True),
        sa.Column("payload", sa.Text(), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_map_place_cache_expires_at", "map_place_cache", ["expires_at"])


def downgrade() -> None:
    op.drop_table("map_place_cache")
