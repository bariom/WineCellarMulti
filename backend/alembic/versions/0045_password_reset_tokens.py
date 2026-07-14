"""add password reset tokens

Revision ID: 0045_password_reset_tokens
Revises: 0044_wishlist_portfolio_strategy
"""

from alembic import op
import sqlalchemy as sa


revision = "0045_password_reset_tokens"
down_revision = "0044_wishlist_portfolio_strategy"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("users", sa.Column("password_reset_token_hash", sa.String(length=128), nullable=False, server_default=""))
    op.add_column("users", sa.Column("password_reset_expires_at", sa.DateTime(timezone=True), nullable=True))
    op.create_index("ix_users_password_reset_token_hash", "users", ["password_reset_token_hash"])
    op.alter_column("users", "password_reset_token_hash", server_default=None)


def downgrade() -> None:
    op.drop_index("ix_users_password_reset_token_hash", table_name="users")
    op.drop_column("users", "password_reset_expires_at")
    op.drop_column("users", "password_reset_token_hash")
