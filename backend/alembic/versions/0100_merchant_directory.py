"""add household merchant directory

Revision ID: 0100_merchant_directory
Revises: 0099_intelligence_preferences
"""

import unicodedata
import uuid

import sqlalchemy as sa

from alembic import op

revision = "0100_merchant_directory"
down_revision = "0099_intelligence_preferences"
branch_labels = None
depends_on = None


def _canonical_name(value: str) -> str:
    return " ".join(value.strip().split())[:160]


def _normalized_name(value: str) -> str:
    normalized = unicodedata.normalize("NFKD", _canonical_name(value).casefold())
    return "".join(character for character in normalized if not unicodedata.combining(character))


def upgrade() -> None:
    op.create_table(
        "merchants",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("household_id", sa.Uuid(), nullable=False),
        sa.Column("created_by_user_id", sa.Uuid(), nullable=True),
        sa.Column("name", sa.String(length=160), nullable=False),
        sa.Column("normalized_name", sa.String(length=160), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("CURRENT_TIMESTAMP"),
        ),
        sa.ForeignKeyConstraint(["household_id"], ["households.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["created_by_user_id"], ["users.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "household_id",
            "normalized_name",
            name="uq_merchants_household_normalized_name",
        ),
    )
    op.create_index("ix_merchants_household_name", "merchants", ["household_id", "name"])

    connection = op.get_bind()
    rows = connection.execute(
        sa.text(
            """
            SELECT household_id, created_by_user_id, merchant AS name
            FROM wines
            WHERE trim(merchant) <> ''
            UNION ALL
            SELECT household_id, created_by_user_id, merchant AS name
            FROM wishlist_items
            WHERE trim(merchant) <> ''
            UNION ALL
            SELECT household_id, NULL AS created_by_user_id, supplier AS name
            FROM wine_stock_lots
            WHERE trim(supplier) <> ''
            """
        )
    )
    seen: set[tuple[object, str]] = set()
    records = []
    for row in rows.mappings():
        name = _canonical_name(str(row["name"] or ""))
        normalized_name = _normalized_name(name)
        key = (row["household_id"], normalized_name)
        if not name or key in seen:
            continue
        seen.add(key)
        records.append(
            {
                "id": uuid.uuid4(),
                "household_id": row["household_id"],
                "created_by_user_id": row["created_by_user_id"],
                "name": name,
                "normalized_name": normalized_name,
            }
        )
    if records:
        op.bulk_insert(
            sa.table(
                "merchants",
                sa.column("id", sa.Uuid()),
                sa.column("household_id", sa.Uuid()),
                sa.column("created_by_user_id", sa.Uuid()),
                sa.column("name", sa.String()),
                sa.column("normalized_name", sa.String()),
            ),
            records,
        )


def downgrade() -> None:
    op.drop_table("merchants")
