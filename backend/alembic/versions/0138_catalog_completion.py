"""Remember which catalog entries the completion research already tried.

A wine the web search could not find is not paid for again at every batch.
"""

import sqlalchemy as sa

from alembic import op

revision = "0138_catalog_completion"
down_revision = "0137_tasting_sensory_dismissed"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "wine_catalog_entries",
        sa.Column("completion_attempted_at", sa.DateTime(timezone=True), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("wine_catalog_entries", "completion_attempted_at")
