"""add configurable AI Pack markups

Revision ID: 0096_free_tier_ai_markup
Revises: 0095_cellar_locations
"""

import sqlalchemy as sa

from alembic import op

revision = "0096_free_tier_ai_markup"
down_revision = "0095_cellar_locations"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "app_ai_pricing",
        sa.Column("ai_pack_markup_percent", sa.Text(), nullable=False, server_default=""),
    )
    op.add_column(
        "app_ai_pricing",
        sa.Column(
            "free_tier_ai_pack_markup_percent",
            sa.Text(),
            nullable=False,
            server_default="",
        ),
    )


def downgrade() -> None:
    op.drop_column("app_ai_pricing", "free_tier_ai_pack_markup_percent")
    op.drop_column("app_ai_pricing", "ai_pack_markup_percent")
