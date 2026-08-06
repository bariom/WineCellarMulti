"""store the charged cost of each tasting sommelier evaluation

Revision ID: 0081_tasting_ai_cost
Revises: 0080_tasting_pairing_evaluation
"""

import sqlalchemy as sa

from alembic import op

revision = "0081_tasting_ai_cost"
down_revision = "0080_tasting_pairing_evaluation"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "wine_tasting_entries",
        sa.Column("sommelier_feedback_cost_usd", sa.Numeric(12, 6), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("wine_tasting_entries", "sommelier_feedback_cost_usd")
