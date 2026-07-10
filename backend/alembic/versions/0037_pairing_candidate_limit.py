"""pairing candidate limit

Revision ID: 0037_pairing_candidate_limit
Revises: 0036_wine_scores_not_applicable
Create Date: 2026-07-10
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa


revision = "0037_pairing_candidate_limit"
down_revision = "0036_wine_scores_not_applicable"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("user_ai_settings", sa.Column("pairing_candidate_limit", sa.Integer(), nullable=False, server_default="25"))
    op.alter_column("user_ai_settings", "pairing_candidate_limit", server_default=None)


def downgrade() -> None:
    op.drop_column("user_ai_settings", "pairing_candidate_limit")
