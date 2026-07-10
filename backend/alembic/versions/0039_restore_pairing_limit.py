"""restore pairing candidate limit

Revision ID: 0039_restore_pairing_limit
Revises: 0038_remove_pairing_limit
Create Date: 2026-07-10
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa


revision = "0039_restore_pairing_limit"
down_revision = "0038_remove_pairing_limit"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("user_ai_settings", sa.Column("pairing_candidate_limit", sa.Integer(), nullable=False, server_default="25"))
    op.alter_column("user_ai_settings", "pairing_candidate_limit", server_default=None)


def downgrade() -> None:
    op.drop_column("user_ai_settings", "pairing_candidate_limit")
