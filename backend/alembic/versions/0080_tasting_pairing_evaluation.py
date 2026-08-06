"""add pairing evaluation details to sommelier tasting feedback

Revision ID: 0080_tasting_pairing_evaluation
Revises: 0079_tasting_sommelier_feedback
"""

import sqlalchemy as sa

from alembic import op

revision = "0080_tasting_pairing_evaluation"
down_revision = "0079_tasting_sommelier_feedback"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "wine_tasting_entries",
        sa.Column("sommelier_pairing_score", sa.Integer(), nullable=True),
    )
    op.add_column(
        "wine_tasting_entries",
        sa.Column("sommelier_pairing_advice", sa.Text(), nullable=False, server_default=""),
    )


def downgrade() -> None:
    op.drop_column("wine_tasting_entries", "sommelier_pairing_advice")
    op.drop_column("wine_tasting_entries", "sommelier_pairing_score")
