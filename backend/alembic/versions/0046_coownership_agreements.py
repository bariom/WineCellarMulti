"""add coownership agreements

Revision ID: 0046_coownership_agreements
Revises: 0045_password_reset_tokens
"""

from alembic import op
import sqlalchemy as sa


revision = "0046_coownership_agreements"
down_revision = "0045_password_reset_tokens"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "coownership_agreements",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("wine_id", sa.Uuid(), nullable=False),
        sa.Column("household_id", sa.Uuid(), nullable=False),
        sa.Column("created_by_user_id", sa.Uuid(), nullable=False),
        sa.Column("version", sa.Integer(), nullable=False),
        sa.Column("status", sa.String(length=32), nullable=False),
        sa.Column("ownership_mode", sa.String(length=32), nullable=False),
        sa.Column("custody_location", sa.String(length=500), nullable=False),
        sa.Column("terms", sa.Text(), nullable=False),
        sa.Column("wine_snapshot", sa.JSON(), nullable=False),
        sa.Column("document_hash", sa.String(length=64), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("finalized_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["created_by_user_id"], ["users.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["household_id"], ["households.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["wine_id"], ["wines.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_coownership_agreements_wine_id", "coownership_agreements", ["wine_id"])
    op.create_index("ix_coownership_agreements_household_id", "coownership_agreements", ["household_id"])
    op.create_index("ix_coownership_agreements_created_by_user_id", "coownership_agreements", ["created_by_user_id"])
    op.create_index("ix_coownership_agreements_status", "coownership_agreements", ["status"])
    op.create_index("ix_coownership_agreements_document_hash", "coownership_agreements", ["document_hash"])

    op.create_table(
        "coownership_participants",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("agreement_id", sa.Uuid(), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=True),
        sa.Column("name", sa.String(length=160), nullable=False),
        sa.Column("email", sa.String(length=320), nullable=False),
        sa.Column("share_pct", sa.Numeric(precision=9, scale=6), nullable=False),
        sa.Column("contribution", sa.Numeric(precision=12, scale=2), nullable=True),
        sa.Column("status", sa.String(length=32), nullable=False),
        sa.Column("invite_token_hash", sa.String(length=64), nullable=False),
        sa.Column("invite_token_encrypted", sa.Text(), nullable=False),
        sa.Column("invite_expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("invited_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("viewed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("responded_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("acceptance_name", sa.String(length=160), nullable=False),
        sa.Column("acceptance_method", sa.String(length=32), nullable=False),
        sa.Column("delivery_channel", sa.String(length=32), nullable=False),
        sa.Column("delivery_status", sa.String(length=32), nullable=False),
        sa.ForeignKeyConstraint(["agreement_id"], ["coownership_agreements.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("agreement_id", "email", name="uq_coownership_participant_email"),
    )
    op.create_index("ix_coownership_participants_agreement_id", "coownership_participants", ["agreement_id"])
    op.create_index("ix_coownership_participants_user_id", "coownership_participants", ["user_id"])
    op.create_index("ix_coownership_participants_email", "coownership_participants", ["email"])
    op.create_index("ix_coownership_participants_status", "coownership_participants", ["status"])
    op.create_index("ix_coownership_participants_invite_token_hash", "coownership_participants", ["invite_token_hash"], unique=True)
    op.create_index("ix_coownership_participants_invite_expires_at", "coownership_participants", ["invite_expires_at"])


def downgrade() -> None:
    op.drop_table("coownership_participants")
    op.drop_table("coownership_agreements")
