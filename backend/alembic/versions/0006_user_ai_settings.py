"""user ai settings

Revision ID: 0006_user_ai_settings
Revises: 0005_ai_audit_log
Create Date: 2026-05-29 19:30:00
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = "0006_user_ai_settings"
down_revision = "0005_ai_audit_log"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "user_ai_settings",
        sa.Column("user_id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column("openai_api_key", sa.Text(), nullable=False, server_default=""),
        sa.Column("ai_notes_model", sa.String(length=120), nullable=False, server_default="gpt-5.4-mini"),
        sa.Column("drink_window_model", sa.String(length=120), nullable=False, server_default="gpt-5.4"),
        sa.Column("value_model", sa.String(length=120), nullable=False, server_default="gpt-5.4-mini"),
        sa.Column("grape_model", sa.String(length=120), nullable=False, server_default="gpt-5.4-nano"),
        sa.Column("wishlist_model", sa.String(length=120), nullable=False, server_default="gpt-5.4"),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
    )


def downgrade() -> None:
    op.drop_table("user_ai_settings")
