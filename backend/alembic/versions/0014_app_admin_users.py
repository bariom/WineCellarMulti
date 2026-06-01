"""application admin users

Revision ID: 0014_app_admin_users
Revises: 0013_user_approval
Create Date: 2026-06-01 00:00:00.000000
"""

from alembic import op
import sqlalchemy as sa


revision = "0014_app_admin_users"
down_revision = "0013_user_approval"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("users", sa.Column("is_app_admin", sa.Boolean(), nullable=False, server_default=sa.false()))
    op.execute(
        """
        UPDATE users
        SET is_app_admin = true
        WHERE id = (
            SELECT id
            FROM users
            WHERE is_approved = true
            ORDER BY approved_at ASC NULLS LAST, email ASC
            LIMIT 1
        )
        """,
    )
    op.alter_column("users", "is_app_admin", server_default=None)


def downgrade() -> None:
    op.drop_column("users", "is_app_admin")
