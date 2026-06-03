"""wishlist ai context note

Revision ID: 0028_wishlist_ai_context_note
Revises: 0027_ai_credit_wallet
Create Date: 2026-06-03 00:00:00.000000
"""

from alembic import op
import sqlalchemy as sa


revision = "0028_wishlist_ai_context_note"
down_revision = "0027_ai_credit_wallet"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("wishlist_items", sa.Column("ai_context_note", sa.Text(), nullable=False, server_default=""))
    op.alter_column("wishlist_items", "ai_context_note", server_default=None)


def downgrade() -> None:
    op.drop_column("wishlist_items", "ai_context_note")
