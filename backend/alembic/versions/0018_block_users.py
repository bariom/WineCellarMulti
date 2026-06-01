"""block users

Revision ID: 0018_block_users
Revises: 0017_billing_redeem_codes
Create Date: 2026-06-01 00:00:00.000000
"""

from alembic import op
import sqlalchemy as sa


revision = "0018_block_users"
down_revision = "0017_billing_redeem_codes"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("users", sa.Column("is_blocked", sa.Boolean(), nullable=False, server_default=sa.false()))
    op.alter_column("users", "is_blocked", server_default=None)


def downgrade() -> None:
    op.drop_column("users", "is_blocked")
