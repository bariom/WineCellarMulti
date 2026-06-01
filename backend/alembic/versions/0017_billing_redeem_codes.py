"""billing redeem codes

Revision ID: 0017_billing_redeem_codes
Revises: 0016_user_preferences
Create Date: 2026-06-01 00:00:00.000000
"""

from alembic import op
import sqlalchemy as sa


revision = "0017_billing_redeem_codes"
down_revision = "0016_user_preferences"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "redeem_codes",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("code_hash", sa.String(length=128), nullable=False),
        sa.Column("code_prefix", sa.String(length=16), nullable=False),
        sa.Column("label", sa.String(length=160), nullable=False),
        sa.Column("duration_days", sa.Integer(), nullable=False),
        sa.Column("max_redemptions", sa.Integer(), nullable=False),
        sa.Column("redeemed_count", sa.Integer(), nullable=False),
        sa.Column("email", sa.String(length=320), nullable=True),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_by_user_id", sa.Uuid(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("revoked_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["created_by_user_id"], ["users.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_redeem_codes_code_hash"), "redeem_codes", ["code_hash"], unique=True)
    op.create_index(op.f("ix_redeem_codes_email"), "redeem_codes", ["email"], unique=False)

    op.create_table(
        "redeem_redemptions",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("redeem_code_id", sa.Uuid(), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("redeemed_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["redeem_code_id"], ["redeem_codes.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("redeem_code_id", "user_id", name="uq_redeem_redemptions_code_user"),
    )
    op.create_index(op.f("ix_redeem_redemptions_redeem_code_id"), "redeem_redemptions", ["redeem_code_id"], unique=False)
    op.create_index(op.f("ix_redeem_redemptions_user_id"), "redeem_redemptions", ["user_id"], unique=False)

    op.create_table(
        "user_entitlements",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("source", sa.String(length=32), nullable=False),
        sa.Column("source_id", sa.Uuid(), nullable=True),
        sa.Column("valid_from", sa.DateTime(timezone=True), nullable=False),
        sa.Column("valid_until", sa.DateTime(timezone=True), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_user_entitlements_source_id"), "user_entitlements", ["source_id"], unique=False)
    op.create_index(op.f("ix_user_entitlements_user_id"), "user_entitlements", ["user_id"], unique=False)
    op.create_index(op.f("ix_user_entitlements_valid_until"), "user_entitlements", ["valid_until"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_user_entitlements_valid_until"), table_name="user_entitlements")
    op.drop_index(op.f("ix_user_entitlements_user_id"), table_name="user_entitlements")
    op.drop_index(op.f("ix_user_entitlements_source_id"), table_name="user_entitlements")
    op.drop_table("user_entitlements")
    op.drop_index(op.f("ix_redeem_redemptions_user_id"), table_name="redeem_redemptions")
    op.drop_index(op.f("ix_redeem_redemptions_redeem_code_id"), table_name="redeem_redemptions")
    op.drop_table("redeem_redemptions")
    op.drop_index(op.f("ix_redeem_codes_email"), table_name="redeem_codes")
    op.drop_index(op.f("ix_redeem_codes_code_hash"), table_name="redeem_codes")
    op.drop_table("redeem_codes")
