"""add curated read-only demo cellar

Revision ID: 0076_demo_cellar
Revises: 0075_app_ai_pricing
"""

import sqlalchemy as sa

from alembic import op

revision = "0076_demo_cellar"
down_revision = "0075_app_ai_pricing"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "households",
        sa.Column("is_demo", sa.Boolean(), nullable=False, server_default=sa.false()),
    )
    op.create_index("ix_households_is_demo", "households", ["is_demo"])
    op.create_table(
        "demo_wine_selections",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("source_wine_id", sa.Uuid(), sa.ForeignKey("wines.id", ondelete="CASCADE"), nullable=False),
        sa.Column("demo_wine_id", sa.Uuid(), sa.ForeignKey("wines.id", ondelete="CASCADE"), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.UniqueConstraint("source_wine_id", name="uq_demo_selection_source_wine"),
        sa.UniqueConstraint("demo_wine_id", name="uq_demo_selection_demo_wine"),
    )
    op.create_index("ix_demo_wine_selections_source_wine_id", "demo_wine_selections", ["source_wine_id"])
    op.create_index("ix_demo_wine_selections_demo_wine_id", "demo_wine_selections", ["demo_wine_id"])


def downgrade() -> None:
    op.drop_table("demo_wine_selections")
    op.drop_index("ix_households_is_demo", table_name="households")
    op.drop_column("households", "is_demo")
