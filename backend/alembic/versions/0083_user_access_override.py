"""add per-user administrative access override

Revision ID: 0083_user_access_override
Revises: 0082_legacy_approved_access
"""

import sqlalchemy as sa

from alembic import op

revision = "0083_user_access_override"
down_revision = "0082_legacy_approved_access"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("users", sa.Column("access_override_until", sa.DateTime(timezone=True), nullable=True))


def downgrade() -> None:
    op.drop_column("users", "access_override_until")
