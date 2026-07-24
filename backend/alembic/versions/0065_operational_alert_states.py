"""persist operational alert state

Revision ID: 0065_ops_alert_states
Revises: 0064_ops_metrics_perf
"""

import sqlalchemy as sa

from alembic import op

revision = "0065_ops_alert_states"
down_revision = "0064_ops_metrics_perf"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "operational_alert_states",
        sa.Column("metric", sa.String(length=48), nullable=False),
        sa.Column("severity", sa.String(length=16), nullable=False),
        sa.Column("opened_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("last_notified_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("last_value", sa.Float(), nullable=False),
        sa.PrimaryKeyConstraint("metric"),
    )


def downgrade() -> None:
    op.drop_table("operational_alert_states")
