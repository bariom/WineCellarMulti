"""ai pairing model

Revision ID: 0010_ai_pairing_model
Revises: 0009_user_tags
Create Date: 2026-05-29 23:40:00
"""

from alembic import op
import sqlalchemy as sa


revision = "0010_ai_pairing_model"
down_revision = "0009_user_tags"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("user_ai_settings", sa.Column("pairing_model", sa.String(length=120), nullable=False, server_default="gpt-5.4"))
    op.alter_column("user_ai_settings", "pairing_model", server_default=None)


def downgrade() -> None:
    op.drop_column("user_ai_settings", "pairing_model")
