"""persist regional gap profile targets and AI history

Revision ID: 0059_regional_gap_profiles
Revises: 0058_photo_usage_disclaimer
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "0059_regional_gap_profiles"
down_revision: str | None = "0058_photo_disclaimer"
branch_labels: str | Sequence[str] | None = None
depends_on: str | None = None


def upgrade() -> None:
    op.add_column(
        "household_regional_gap_settings",
        sa.Column("profile_targets", sa.JSON(), nullable=False, server_default=sa.text("'{}'")),
    )
    op.add_column(
        "household_regional_gap_settings",
        sa.Column("ai_suggestions", sa.JSON(), nullable=False, server_default=sa.text("'[]'")),
    )
    op.alter_column("household_regional_gap_settings", "profile_targets", server_default=None)
    op.alter_column("household_regional_gap_settings", "ai_suggestions", server_default=None)


def downgrade() -> None:
    op.drop_column("household_regional_gap_settings", "ai_suggestions")
    op.drop_column("household_regional_gap_settings", "profile_targets")
