"""allow Wine Pulse partial-success run status

Revision ID: 0097_wine_pulse_run_status_length
Revises: 0096_free_tier_ai_markup
"""

import sqlalchemy as sa

from alembic import op

revision = "0097_wine_pulse_run_status_length"
down_revision = "0096_free_tier_ai_markup"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.alter_column(
        "wine_news_collection_runs",
        "status",
        existing_type=sa.String(length=20),
        type_=sa.String(length=32),
        existing_nullable=False,
    )


def downgrade() -> None:
    op.alter_column(
        "wine_news_collection_runs",
        "status",
        existing_type=sa.String(length=32),
        type_=sa.String(length=20),
        existing_nullable=False,
    )
