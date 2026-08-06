"""store optional sommelier reflections on tasting history

Revision ID: 0079_tasting_sommelier_feedback
Revises: 0078_shared_wine_ai_data
"""

import sqlalchemy as sa

from alembic import op

revision = "0079_tasting_sommelier_feedback"
down_revision = "0078_shared_wine_ai_data"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "wine_tasting_entries",
        sa.Column("sommelier_feedback", sa.Text(), nullable=False, server_default=""),
    )
    op.add_column(
        "wine_tasting_entries",
        sa.Column("sommelier_feedback_at", sa.DateTime(timezone=True), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("wine_tasting_entries", "sommelier_feedback_at")
    op.drop_column("wine_tasting_entries", "sommelier_feedback")
