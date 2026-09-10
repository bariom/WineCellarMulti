"""add external tastings linked to wishlist wines

Revision ID: 0106_external_wine_tastings
Revises: 0105_user_wine_ratings
"""

import sqlalchemy as sa

from alembic import op

revision = "0106_external_wine_tastings"
down_revision = "0105_user_wine_ratings"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "external_wine_tastings",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("household_id", sa.Uuid(), nullable=False),
        sa.Column("created_by_user_id", sa.Uuid(), nullable=False),
        sa.Column("wishlist_item_id", sa.Uuid(), nullable=True),
        sa.Column("shared_identity_id", sa.Uuid(), nullable=True),
        sa.Column("name", sa.String(length=200), nullable=False),
        sa.Column("producer", sa.String(length=200), nullable=False),
        sa.Column("vintage", sa.String(length=16), nullable=False),
        sa.Column("format", sa.String(length=80), nullable=False),
        sa.Column("type", sa.String(length=80), nullable=False),
        sa.Column("region", sa.String(length=120), nullable=False),
        sa.Column("appellation", sa.String(length=120), nullable=False),
        sa.Column("consumed_at", sa.Date(), nullable=False),
        sa.Column("note", sa.Text(), nullable=False),
        sa.Column("rating", sa.Integer(), nullable=False),
        sa.Column("enjoyment", sa.String(length=16), nullable=False),
        sa.Column("occasion", sa.String(length=200), nullable=False),
        sa.Column("pairing", sa.String(length=300), nullable=False),
        sa.Column("companions", sa.String(length=300), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["household_id"], ["households.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["created_by_user_id"], ["users.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["wishlist_item_id"], ["wishlist_items.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(
            ["shared_identity_id"], ["shared_wine_identities.id"], ondelete="SET NULL"
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_external_wine_tastings_household_id", "external_wine_tastings", ["household_id"]
    )
    op.create_index(
        "ix_external_wine_tastings_created_by_user_id",
        "external_wine_tastings",
        ["created_by_user_id"],
    )
    op.create_index(
        "ix_external_wine_tastings_wishlist_item_id", "external_wine_tastings", ["wishlist_item_id"]
    )
    op.create_index(
        "ix_external_wine_tastings_shared_identity_id",
        "external_wine_tastings",
        ["shared_identity_id"],
    )
    op.create_index("ix_external_wine_tastings_name", "external_wine_tastings", ["name"])
    op.create_index(
        "ix_external_wine_tastings_consumed_at", "external_wine_tastings", ["consumed_at"]
    )
    op.create_index(
        "ix_external_wine_tastings_created_at", "external_wine_tastings", ["created_at"]
    )
    op.create_index(
        "ix_external_wine_tastings_household_consumed_created",
        "external_wine_tastings",
        ["household_id", "consumed_at", "created_at"],
    )
    op.create_index(
        "ix_external_wine_tastings_user_consumed",
        "external_wine_tastings",
        ["created_by_user_id", "consumed_at"],
    )


def downgrade() -> None:
    op.drop_table("external_wine_tastings")
