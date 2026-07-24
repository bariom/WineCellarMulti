"""speed up operational metric collection and dashboard reads

Revision ID: 0064_ops_metrics_perf
Revises: 0063_user_daily_wine_budget
"""

import sqlalchemy as sa

from alembic import op

revision = "0064_ops_metrics_perf"
down_revision = "0063_user_daily_wine_budget"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "operational_metric_samples",
        sa.Column("openai", sa.JSON(), nullable=False, server_default=sa.text("'{}'::json")),
    )
    op.alter_column("operational_metric_samples", "openai", server_default=None)
    op.create_index("ix_ai_audit_created_at", "ai_audit_log", ["created_at"])
    op.create_index(
        "ix_ai_audit_feature_outcome_created",
        "ai_audit_log",
        ["feature", "outcome", "created_at"],
    )


def downgrade() -> None:
    op.drop_index("ix_ai_audit_feature_outcome_created", table_name="ai_audit_log")
    op.drop_index("ix_ai_audit_created_at", table_name="ai_audit_log")
    op.drop_column("operational_metric_samples", "openai")
