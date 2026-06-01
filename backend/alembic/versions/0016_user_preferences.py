"""user preferences

Revision ID: 0016_user_preferences
Revises: 0015_member_visibility_scope
Create Date: 2026-06-01 00:00:00.000000
"""

from alembic import op
import sqlalchemy as sa


revision = "0016_user_preferences"
down_revision = "0015_member_visibility_scope"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("users", sa.Column("locale", sa.String(length=8), nullable=False, server_default="it"))
    op.add_column("users", sa.Column("theme_preference", sa.String(length=32), nullable=False, server_default="system"))
    op.alter_column("users", "locale", server_default=None)
    op.alter_column("users", "theme_preference", server_default=None)


def downgrade() -> None:
    op.drop_column("users", "theme_preference")
    op.drop_column("users", "locale")
