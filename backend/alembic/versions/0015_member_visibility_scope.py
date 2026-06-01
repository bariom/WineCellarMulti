"""member visibility scope

Revision ID: 0015_member_visibility_scope
Revises: 0014_app_admin_users
Create Date: 2026-06-01 00:00:00.000000
"""

from alembic import op
import sqlalchemy as sa


revision = "0015_member_visibility_scope"
down_revision = "0014_app_admin_users"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("memberships", sa.Column("visibility_scope", sa.String(length=32), nullable=False, server_default="all"))
    op.add_column("household_invites", sa.Column("visibility_scope", sa.String(length=32), nullable=False, server_default="shared"))
    op.alter_column("memberships", "visibility_scope", server_default=None)
    op.alter_column("household_invites", "visibility_scope", server_default=None)


def downgrade() -> None:
    op.drop_column("household_invites", "visibility_scope")
    op.drop_column("memberships", "visibility_scope")
