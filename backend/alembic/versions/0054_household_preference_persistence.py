"""persist household gap settings and operational snoozes

Revision ID: 0054_household_preference_persistence
Revises: 0053_delete_orphaned_households
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "0054_household_preference_persistence"
down_revision: str | None = "0053_delete_orphaned_households"
branch_labels: str | Sequence[str] | None = None
depends_on: str | None = None


def upgrade() -> None:
    op.create_table(
        "household_regional_gap_settings",
        sa.Column("household_id", sa.Uuid(), nullable=False),
        sa.Column("targets", sa.JSON(), nullable=False),
        sa.Column("last_ai_suggestion", sa.JSON(), nullable=True),
        sa.Column("updated_by_user_id", sa.Uuid(), nullable=True),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["household_id"], ["households.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["updated_by_user_id"], ["users.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("household_id"),
    )
    op.create_table(
        "user_operational_action_snoozes",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("household_id", sa.Uuid(), nullable=False),
        sa.Column("action_id", sa.String(length=240), nullable=False),
        sa.Column("signature", sa.String(length=512), nullable=False),
        sa.Column("until", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["household_id"], ["households.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("user_id", "household_id", "action_id", name="uq_operational_action_snooze"),
    )
    op.create_index("ix_user_operational_action_snoozes_user_id", "user_operational_action_snoozes", ["user_id"])
    op.create_index("ix_user_operational_action_snoozes_household_id", "user_operational_action_snoozes", ["household_id"])
    op.create_index("ix_user_operational_action_snoozes_until", "user_operational_action_snoozes", ["until"])


def downgrade() -> None:
    op.drop_table("user_operational_action_snoozes")
    op.drop_table("household_regional_gap_settings")
