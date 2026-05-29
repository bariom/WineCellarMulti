"""ai audit log

Revision ID: 0005_ai_audit_log
Revises: 0004_legacy_wine_fields_wishlist
Create Date: 2026-05-29 18:30:00
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = "0005_ai_audit_log"
down_revision = "0004_legacy_wine_fields_wishlist"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "ai_audit_log",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column("household_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("entity_type", sa.String(length=32), nullable=False),
        sa.Column("entity_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("feature", sa.String(length=64), nullable=False),
        sa.Column("model", sa.String(length=120), nullable=False, server_default=""),
        sa.Column("outcome", sa.String(length=32), nullable=False, server_default="success"),
        sa.Column("summary", sa.Text(), nullable=False, server_default=""),
        sa.Column("sources", sa.JSON(), nullable=False, server_default="[]"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.ForeignKeyConstraint(["household_id"], ["households.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="SET NULL"),
    )
    op.create_index("ix_ai_audit_log_household_created", "ai_audit_log", ["household_id", "created_at"], unique=False)
    op.create_index("ix_ai_audit_log_entity", "ai_audit_log", ["entity_type", "entity_id"], unique=False)


def downgrade() -> None:
    op.drop_index("ix_ai_audit_log_entity", table_name="ai_audit_log")
    op.drop_index("ix_ai_audit_log_household_created", table_name="ai_audit_log")
    op.drop_table("ai_audit_log")
