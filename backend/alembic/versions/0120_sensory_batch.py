"""Persist background sensory generation progress."""

import sqlalchemy as sa

from alembic import op

revision = "0120_sensory_batch"
down_revision = "0119_purchase_documents"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "sensory_batch_runs",
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
        sa.Column("scope", sa.String(24), nullable=False),
        sa.Column("allow_ai", sa.Boolean(), nullable=False),
        sa.Column("status", sa.String(24), nullable=False),
        sa.Column("issue", sa.String(40), nullable=False),
        sa.Column("targets", sa.JSON(), nullable=False),
        *(
            sa.Column(name, sa.Integer(), nullable=False)
            for name in ("total", "processed", "resolved", "ai_generated", "skipped", "failed")
        ),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_sensory_batch_runs_household_id", "sensory_batch_runs", ["household_id"])


def downgrade() -> None:
    op.drop_table("sensory_batch_runs")
