"""ai usage costs

Revision ID: 0007_ai_usage_costs
Revises: 0006_user_ai_settings
Create Date: 2026-05-29 21:15:00
"""

from alembic import op
import sqlalchemy as sa


revision = "0007_ai_usage_costs"
down_revision = "0006_user_ai_settings"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("ai_audit_log", sa.Column("input_tokens", sa.Integer(), nullable=False, server_default="0"))
    op.add_column("ai_audit_log", sa.Column("cached_input_tokens", sa.Integer(), nullable=False, server_default="0"))
    op.add_column("ai_audit_log", sa.Column("output_tokens", sa.Integer(), nullable=False, server_default="0"))
    op.add_column("ai_audit_log", sa.Column("total_tokens", sa.Integer(), nullable=False, server_default="0"))
    op.add_column("ai_audit_log", sa.Column("estimated_cost_usd", sa.Numeric(12, 6), nullable=False, server_default="0"))


def downgrade() -> None:
    op.drop_column("ai_audit_log", "estimated_cost_usd")
    op.drop_column("ai_audit_log", "total_tokens")
    op.drop_column("ai_audit_log", "output_tokens")
    op.drop_column("ai_audit_log", "cached_input_tokens")
    op.drop_column("ai_audit_log", "input_tokens")
