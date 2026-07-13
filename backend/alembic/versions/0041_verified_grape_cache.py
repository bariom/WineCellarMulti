"""store verified grape composition sources

Revision ID: 0041_verified_grape_cache
Revises: 0040_ai_score_model
Create Date: 2026-07-13
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa


revision = "0041_verified_grape_cache"
down_revision = "0040_ai_score_model"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("wines", sa.Column("grapes_source_url", sa.String(length=500), nullable=False, server_default=""))
    op.add_column("wines", sa.Column("grapes_source_title", sa.String(length=200), nullable=False, server_default=""))
    op.add_column("wines", sa.Column("grapes_verified_at", sa.DateTime(timezone=True), nullable=True))
    op.alter_column("wines", "grapes_source_url", server_default=None)
    op.alter_column("wines", "grapes_source_title", server_default=None)


def downgrade() -> None:
    op.drop_column("wines", "grapes_verified_at")
    op.drop_column("wines", "grapes_source_title")
    op.drop_column("wines", "grapes_source_url")
