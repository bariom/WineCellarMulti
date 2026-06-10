"""email verification

Revision ID: 0033_email_verification
Revises: 0032_wine_catalog_database
Create Date: 2026-06-10
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa


revision = "0033_email_verification"
down_revision = "0032_wine_catalog_database"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("users", sa.Column("email_verified_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("users", sa.Column("email_verification_token_hash", sa.String(length=128), nullable=False, server_default=""))
    op.add_column("users", sa.Column("email_verification_expires_at", sa.DateTime(timezone=True), nullable=True))
    op.create_index(op.f("ix_users_email_verification_token_hash"), "users", ["email_verification_token_hash"], unique=False)
    op.execute("UPDATE users SET email_verified_at = COALESCE(approved_at, CURRENT_TIMESTAMP) WHERE email_verified_at IS NULL")


def downgrade() -> None:
    op.drop_index(op.f("ix_users_email_verification_token_hash"), table_name="users")
    op.drop_column("users", "email_verification_expires_at")
    op.drop_column("users", "email_verification_token_hash")
    op.drop_column("users", "email_verified_at")
