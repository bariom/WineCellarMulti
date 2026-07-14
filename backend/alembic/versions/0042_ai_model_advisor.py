"""add opt-in AI model advisor

Revision ID: 0042_ai_model_advisor
Revises: 0041_verified_grape_cache
Create Date: 2026-07-14
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa


revision = "0042_ai_model_advisor"
down_revision = "0041_verified_grape_cache"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "user_ai_settings",
        sa.Column("model_advisor_enabled", sa.Boolean(), nullable=False, server_default=sa.false()),
    )
    op.alter_column("user_ai_settings", "model_advisor_enabled", server_default=None)


def downgrade() -> None:
    op.drop_column("user_ai_settings", "model_advisor_enabled")
