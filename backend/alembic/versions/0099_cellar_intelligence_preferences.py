"""add cellar intelligence preferences

Revision ID: 0099_cellar_intelligence_preferences
Revises: 0098_wine_strategy_allocations
"""

import sqlalchemy as sa

from alembic import op

revision = "0099_cellar_intelligence_preferences"
down_revision = "0098_wine_strategy_allocations"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "households",
        sa.Column(
            "cellar_intelligence_preferences",
            sa.JSON(),
            nullable=False,
            server_default=sa.text("'{}'"),
        ),
    )


def downgrade() -> None:
    op.drop_column("households", "cellar_intelligence_preferences")
