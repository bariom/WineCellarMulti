"""passkeys

Revision ID: 0011_passkeys
Revises: 0010_ai_pairing_model
Create Date: 2026-05-29 23:55:00
"""

from alembic import op
import sqlalchemy as sa


revision = "0011_passkeys"
down_revision = "0010_ai_pairing_model"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "user_passkeys",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("credential_id", sa.String(length=512), nullable=False),
        sa.Column("public_key", sa.LargeBinary(), nullable=False),
        sa.Column("sign_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("name", sa.String(length=120), nullable=False, server_default="Passkey"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("last_used_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("credential_id"),
    )
    op.create_index("ix_user_passkeys_user_id", "user_passkeys", ["user_id"])
    op.create_index("ix_user_passkeys_credential_id", "user_passkeys", ["credential_id"])
    op.create_table(
        "passkey_challenges",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("challenge", sa.String(length=256), nullable=False),
        sa.Column("purpose", sa.String(length=32), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("challenge"),
    )
    op.create_index("ix_passkey_challenges_challenge", "passkey_challenges", ["challenge"])
    op.create_index("ix_passkey_challenges_purpose", "passkey_challenges", ["purpose"])
    op.create_index("ix_passkey_challenges_user_id", "passkey_challenges", ["user_id"])
    op.create_index("ix_passkey_challenges_expires_at", "passkey_challenges", ["expires_at"])


def downgrade() -> None:
    op.drop_table("passkey_challenges")
    op.drop_table("user_passkeys")
