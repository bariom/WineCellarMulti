"""ai credit wallet

Revision ID: 0027_ai_credit_wallet
Revises: 0026_wine_tasting_history
Create Date: 2026-06-03 00:00:00.000000
"""

from alembic import op
import sqlalchemy as sa


revision = "0027_ai_credit_wallet"
down_revision = "0026_wine_tasting_history"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("user_ai_settings", sa.Column("provider_mode", sa.String(length=32), nullable=False, server_default="auto"))
    op.alter_column("user_ai_settings", "provider_mode", server_default=None)
    op.create_table(
        "user_ai_credit_transactions",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("amount_usd", sa.Numeric(12, 6), nullable=False),
        sa.Column("source", sa.String(length=32), nullable=False),
        sa.Column("source_id", sa.Uuid(), nullable=True),
        sa.Column("note", sa.Text(), nullable=False, server_default=""),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_user_ai_credit_transactions_source_id"), "user_ai_credit_transactions", ["source_id"], unique=False)
    op.create_index(op.f("ix_user_ai_credit_transactions_user_id"), "user_ai_credit_transactions", ["user_id"], unique=False)
    op.alter_column("user_ai_credit_transactions", "note", server_default=None)


def downgrade() -> None:
    op.drop_index(op.f("ix_user_ai_credit_transactions_user_id"), table_name="user_ai_credit_transactions")
    op.drop_index(op.f("ix_user_ai_credit_transactions_source_id"), table_name="user_ai_credit_transactions")
    op.drop_table("user_ai_credit_transactions")
    op.drop_column("user_ai_settings", "provider_mode")
