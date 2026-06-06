"""wishlist lists

Revision ID: 0031_wishlist_lists
Revises: 0030_pairing_preferences
Create Date: 2026-06-06
"""

from __future__ import annotations

import uuid

from alembic import op
import sqlalchemy as sa


revision = "0031_wishlist_lists"
down_revision = "0030_pairing_preferences"
branch_labels = None
depends_on = None


wishlist_lists = sa.table(
    "wishlist_lists",
    sa.column("id", sa.Uuid()),
    sa.column("household_id", sa.Uuid()),
    sa.column("created_by_user_id", sa.Uuid()),
    sa.column("name", sa.String()),
    sa.column("description", sa.Text()),
)

wishlist_items = sa.table(
    "wishlist_items",
    sa.column("id", sa.Uuid()),
    sa.column("household_id", sa.Uuid()),
    sa.column("created_by_user_id", sa.Uuid()),
    sa.column("wishlist_list_id", sa.Uuid()),
)


def upgrade() -> None:
    op.create_table(
        "wishlist_lists",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("household_id", sa.Uuid(), nullable=False),
        sa.Column("created_by_user_id", sa.Uuid(), nullable=True),
        sa.Column("name", sa.String(length=120), nullable=False, server_default="Wishlist"),
        sa.Column("description", sa.Text(), nullable=False, server_default=""),
        sa.ForeignKeyConstraint(["created_by_user_id"], ["users.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["household_id"], ["households.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_wishlist_lists_household_id"), "wishlist_lists", ["household_id"], unique=False)
    op.add_column("wishlist_items", sa.Column("wishlist_list_id", sa.Uuid(), nullable=True))
    op.create_index(op.f("ix_wishlist_items_wishlist_list_id"), "wishlist_items", ["wishlist_list_id"], unique=False)
    op.create_foreign_key(
        "fk_wishlist_items_wishlist_list_id",
        "wishlist_items",
        "wishlist_lists",
        ["wishlist_list_id"],
        ["id"],
        ondelete="CASCADE",
    )

    bind = op.get_bind()
    households = list(bind.execute(sa.text("SELECT DISTINCT household_id, max(created_by_user_id) AS created_by_user_id FROM wishlist_items GROUP BY household_id")))
    for household_id, created_by_user_id in households:
        list_id = uuid.uuid4()
        bind.execute(
            wishlist_lists.insert().values(
                id=list_id,
                household_id=household_id,
                created_by_user_id=created_by_user_id,
                name="Wishlist",
                description="",
            ),
        )
        bind.execute(
            wishlist_items.update()
            .where(wishlist_items.c.household_id == household_id)
            .values(wishlist_list_id=list_id),
        )

    empty_households = list(
        bind.execute(
            sa.text(
                """
                SELECT h.id
                FROM households h
                WHERE NOT EXISTS (
                    SELECT 1
                    FROM wishlist_lists wl
                    WHERE wl.household_id = h.id
                )
                """,
            ),
        ),
    )
    for (household_id,) in empty_households:
        bind.execute(
            wishlist_lists.insert().values(
                id=uuid.uuid4(),
                household_id=household_id,
                created_by_user_id=None,
                name="Wishlist",
                description="",
            ),
        )

    op.alter_column("wishlist_lists", "name", server_default=None)
    op.alter_column("wishlist_lists", "description", server_default=None)
    op.alter_column("wishlist_items", "wishlist_list_id", nullable=False)


def downgrade() -> None:
    op.drop_constraint("fk_wishlist_items_wishlist_list_id", "wishlist_items", type_="foreignkey")
    op.drop_index(op.f("ix_wishlist_items_wishlist_list_id"), table_name="wishlist_items")
    op.drop_column("wishlist_items", "wishlist_list_id")
    op.drop_index(op.f("ix_wishlist_lists_household_id"), table_name="wishlist_lists")
    op.drop_table("wishlist_lists")
