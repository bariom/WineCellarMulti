"""legacy wine fields and wishlist

Revision ID: 0004_legacy_wine_fields_wishlist
Revises: 0003_household_invites
Create Date: 2026-05-29 15:00:00
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = "0004_legacy_wine_fields_wishlist"
down_revision = "0003_household_invites"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("wines", sa.Column("current_value", sa.Numeric(10, 2), nullable=True))
    op.add_column("wines", sa.Column("format", sa.String(length=80), nullable=False, server_default=""))
    op.add_column("wines", sa.Column("type", sa.String(length=80), nullable=False, server_default=""))
    op.add_column("wines", sa.Column("region", sa.String(length=120), nullable=False, server_default=""))
    op.add_column("wines", sa.Column("appellation", sa.String(length=120), nullable=False, server_default=""))
    op.add_column("wines", sa.Column("merchant", sa.String(length=160), nullable=False, server_default=""))
    op.add_column("wines", sa.Column("order_date", sa.Date(), nullable=True))
    op.add_column("wines", sa.Column("owner_share_pct", sa.Numeric(5, 2), nullable=False, server_default="100"))
    op.add_column("wines", sa.Column("ai_notes", sa.Text(), nullable=False, server_default=""))
    op.add_column("wines", sa.Column("drink_from", sa.Integer(), nullable=True))
    op.add_column("wines", sa.Column("drink_peak_from", sa.Integer(), nullable=True))
    op.add_column("wines", sa.Column("drink_peak_to", sa.Integer(), nullable=True))
    op.add_column("wines", sa.Column("drink_to", sa.Integer(), nullable=True))
    op.add_column("wines", sa.Column("drink_window_notes", sa.Text(), nullable=False, server_default=""))
    op.add_column("wines", sa.Column("ai_value_notes", sa.Text(), nullable=False, server_default=""))
    op.add_column("wines", sa.Column("ai_value_estimated_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("wines", sa.Column("rating", sa.Integer(), nullable=False, server_default="0"))
    op.add_column("wines", sa.Column("owners", sa.JSON(), nullable=False, server_default="[]"))
    op.add_column("wines", sa.Column("tags", sa.JSON(), nullable=False, server_default="[]"))
    op.add_column("wines", sa.Column("grapes", sa.JSON(), nullable=False, server_default="[]"))
    op.add_column("wines", sa.Column("scores", sa.JSON(), nullable=False, server_default="[]"))

    op.create_table(
        "wishlist_items",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column("household_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("created_by_user_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("name", sa.String(length=200), nullable=False),
        sa.Column("producer", sa.String(length=200), nullable=False, server_default=""),
        sa.Column("vintage", sa.String(length=16), nullable=False, server_default=""),
        sa.Column("format", sa.String(length=80), nullable=False, server_default=""),
        sa.Column("type", sa.String(length=80), nullable=False, server_default=""),
        sa.Column("region", sa.String(length=120), nullable=False, server_default=""),
        sa.Column("appellation", sa.String(length=120), nullable=False, server_default=""),
        sa.Column("target_price", sa.Numeric(10, 2), nullable=False, server_default="0"),
        sa.Column("currency", sa.String(length=8), nullable=False, server_default="CHF"),
        sa.Column("merchant", sa.String(length=160), nullable=False, server_default=""),
        sa.Column("priority", sa.String(length=32), nullable=False, server_default="Medium"),
        sa.Column("purpose", sa.String(length=32), nullable=False, server_default="Drink"),
        sa.Column("status", sa.String(length=32), nullable=False, server_default="Evaluate"),
        sa.Column("status_source", sa.String(length=32), nullable=False, server_default="manual"),
        sa.Column("is_shared", sa.String(length=8), nullable=False, server_default="0"),
        sa.Column("notes", sa.Text(), nullable=False, server_default=""),
        sa.Column("ai_strategy", sa.Text(), nullable=False, server_default=""),
        sa.Column("ai_purpose_advice", sa.Text(), nullable=False, server_default=""),
        sa.ForeignKeyConstraint(["created_by_user_id"], ["users.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["household_id"], ["households.id"], ondelete="CASCADE"),
    )
    op.create_index("ix_wishlist_items_household_id", "wishlist_items", ["household_id"], unique=False)
    op.create_index("ix_wishlist_items_name", "wishlist_items", ["name"], unique=False)


def downgrade() -> None:
    op.drop_index("ix_wishlist_items_name", table_name="wishlist_items")
    op.drop_index("ix_wishlist_items_household_id", table_name="wishlist_items")
    op.drop_table("wishlist_items")
    for column in [
        "scores",
        "grapes",
        "tags",
        "owners",
        "rating",
        "ai_value_estimated_at",
        "ai_value_notes",
        "drink_window_notes",
        "drink_to",
        "drink_peak_to",
        "drink_peak_from",
        "drink_from",
        "ai_notes",
        "owner_share_pct",
        "order_date",
        "merchant",
        "appellation",
        "region",
        "type",
        "format",
        "current_value",
    ]:
        op.drop_column("wines", column)
