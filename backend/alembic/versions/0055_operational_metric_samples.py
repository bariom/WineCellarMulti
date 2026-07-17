"""store aggregated operational metric samples

Revision ID: 0055_operational_metrics
Revises: 0054_household_preferences
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "0055_operational_metrics"
down_revision: str | None = "0054_household_preferences"
branch_labels: str | Sequence[str] | None = None
depends_on: str | None = None


def upgrade() -> None:
    op.create_table(
        "operational_metric_samples",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("collected_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("system", sa.JSON(), nullable=False),
        sa.Column("application", sa.JSON(), nullable=False),
        sa.Column("business", sa.JSON(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_operational_metric_samples_collected_at",
        "operational_metric_samples",
        ["collected_at"],
    )


def downgrade() -> None:
    op.drop_table("operational_metric_samples")
