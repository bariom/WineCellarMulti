"""Persist bounded, household-scoped sensory research prototypes."""

import sqlalchemy as sa

from alembic import op

revision = "0114_sensory_agent"
down_revision = "0113_memory_photo_location"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "sensory_agent_runs",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column(
            "household_id",
            sa.Uuid(),
            sa.ForeignKey("households.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "user_id", sa.Uuid(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False
        ),
        sa.Column("status", sa.String(24), nullable=False),
        sa.Column("wine_ids", sa.JSON(), nullable=False),
        sa.Column("results", sa.JSON(), nullable=False),
        sa.Column("max_wines", sa.Integer(), nullable=False),
        sa.Column("budget_usd", sa.Numeric(12, 6), nullable=False),
        sa.Column("cost_usd", sa.Numeric(12, 6), nullable=False),
        sa.Column("issue", sa.String(40), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_sensory_agent_runs_household_id", "sensory_agent_runs", ["household_id"])


def downgrade() -> None:
    op.drop_table("sensory_agent_runs")
