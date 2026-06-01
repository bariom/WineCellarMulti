"""wine share offers

Revision ID: 0012_wine_share_offers
Revises: 0011_passkeys
Create Date: 2026-06-01 10:10:00
"""

from alembic import op
import sqlalchemy as sa


revision = "0012_wine_share_offers"
down_revision = "0011_passkeys"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "wine_share_offers",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("household_id", sa.Uuid(), nullable=False),
        sa.Column("wine_id", sa.Uuid(), nullable=False),
        sa.Column("created_by_user_id", sa.Uuid(), nullable=False),
        sa.Column("recipient_user_id", sa.Uuid(), nullable=False),
        sa.Column("recipient_email", sa.String(length=320), nullable=False),
        sa.Column("share_pct", sa.Numeric(5, 2), nullable=False),
        sa.Column("message", sa.Text(), nullable=False, server_default=""),
        sa.Column("status", sa.String(length=32), nullable=False, server_default="pending"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("decided_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["created_by_user_id"], ["users.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["household_id"], ["households.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["recipient_user_id"], ["users.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["wine_id"], ["wines.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_wine_share_offers_household_id", "wine_share_offers", ["household_id"])
    op.create_index("ix_wine_share_offers_wine_id", "wine_share_offers", ["wine_id"])
    op.create_index("ix_wine_share_offers_created_by_user_id", "wine_share_offers", ["created_by_user_id"])
    op.create_index("ix_wine_share_offers_recipient_user_id", "wine_share_offers", ["recipient_user_id"])
    op.create_index("ix_wine_share_offers_recipient_email", "wine_share_offers", ["recipient_email"])
    op.create_index("ix_wine_share_offers_status", "wine_share_offers", ["status"])


def downgrade() -> None:
    op.drop_table("wine_share_offers")
