"""add dedicated AI score model

Revision ID: 0040_ai_score_model
Revises: 0039_restore_pairing_limit
Create Date: 2026-07-13
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa


revision = "0040_ai_score_model"
down_revision = "0039_restore_pairing_limit"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("user_ai_settings", sa.Column("score_model", sa.String(length=120), nullable=False, server_default="gpt-5.4-mini"))
    op.alter_column("user_ai_settings", "score_model", server_default=None)


def downgrade() -> None:
    op.drop_column("user_ai_settings", "score_model")
