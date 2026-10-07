"""Persist asynchronous per-wine sensory refinement proposals."""

import sqlalchemy as sa
from alembic import op

revision = "0116_sensory_refinement"
down_revision = "0115_sensory_provenance"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "sensory_refinement_runs",
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
        sa.Column(
            "wine_id", sa.Uuid(), sa.ForeignKey("wines.id", ondelete="CASCADE"), nullable=False
        ),
        sa.Column(
            "identity_id",
            sa.Uuid(),
            sa.ForeignKey("shared_wine_identities.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("status", sa.String(24), nullable=False),
        sa.Column("issue", sa.String(40), nullable=False),
        sa.Column("proposal", sa.JSON(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index(
        "ix_sensory_refinement_runs_household_id", "sensory_refinement_runs", ["household_id"]
    )


def downgrade() -> None:
    op.drop_table("sensory_refinement_runs")
