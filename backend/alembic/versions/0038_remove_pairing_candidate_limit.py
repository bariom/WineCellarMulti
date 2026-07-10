"""remove pairing candidate limit

Revision ID: 0038_remove_pairing_candidate_limit
Revises: 0037_pairing_candidate_limit
Create Date: 2026-07-10
"""

from __future__ import annotations

from alembic import op


revision = "0038_remove_pairing_candidate_limit"
down_revision = "0037_pairing_candidate_limit"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.drop_column("user_ai_settings", "pairing_candidate_limit")


def downgrade() -> None:
    raise RuntimeError("Downgrading this migration is not supported")
