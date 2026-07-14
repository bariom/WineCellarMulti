"""Store the reasoning effort used by AI requests.

Revision ID: 0043_ai_audit_reasoning_effort
Revises: 0042_ai_model_advisor
"""

from alembic import op
import sqlalchemy as sa


revision = "0043_ai_audit_reasoning_effort"
down_revision = "0042_ai_model_advisor"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "ai_audit_log",
        sa.Column("reasoning_effort", sa.String(length=16), nullable=False, server_default=""),
    )
    op.alter_column("ai_audit_log", "reasoning_effort", server_default=None)


def downgrade() -> None:
    op.drop_column("ai_audit_log", "reasoning_effort")
