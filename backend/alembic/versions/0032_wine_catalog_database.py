"""wine catalog database

Revision ID: 0032_wine_catalog_database
Revises: 0031_wishlist_lists
Create Date: 2026-06-09
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa


revision = "0032_wine_catalog_database"
down_revision = "0031_wishlist_lists"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "wine_catalog_entries",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("name", sa.String(length=200), nullable=False),
        sa.Column("producer", sa.String(length=200), nullable=False, server_default=""),
        sa.Column("region", sa.String(length=120), nullable=False, server_default=""),
        sa.Column("appellation", sa.String(length=120), nullable=False, server_default=""),
        sa.Column("type", sa.String(length=80), nullable=False, server_default=""),
        sa.Column("format", sa.String(length=80), nullable=False, server_default=""),
        sa.Column("country", sa.String(length=120), nullable=False, server_default=""),
        sa.Column("grapes_text", sa.Text(), nullable=False, server_default=""),
        sa.Column("search_text", sa.Text(), nullable=False, server_default=""),
        sa.Column("source", sa.String(length=40), nullable=False, server_default="manual"),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_wine_catalog_entries_name"), "wine_catalog_entries", ["name"], unique=False)
    op.create_index(op.f("ix_wine_catalog_entries_producer"), "wine_catalog_entries", ["producer"], unique=False)
    op.create_index(op.f("ix_wine_catalog_entries_region"), "wine_catalog_entries", ["region"], unique=False)
    op.create_index(op.f("ix_wine_catalog_entries_appellation"), "wine_catalog_entries", ["appellation"], unique=False)
    op.create_index(op.f("ix_wine_catalog_entries_search_text"), "wine_catalog_entries", ["search_text"], unique=False)
    op.create_index(op.f("ix_wine_catalog_entries_is_active"), "wine_catalog_entries", ["is_active"], unique=False)

    op.create_table(
        "wine_catalog_aliases",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("catalog_entry_id", sa.Uuid(), nullable=False),
        sa.Column("alias", sa.String(length=260), nullable=False),
        sa.Column("normalized_alias", sa.String(length=260), nullable=False),
        sa.Column("source", sa.String(length=40), nullable=False, server_default="manual"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["catalog_entry_id"], ["wine_catalog_entries.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_wine_catalog_aliases_catalog_entry_id"), "wine_catalog_aliases", ["catalog_entry_id"], unique=False)
    op.create_index(op.f("ix_wine_catalog_aliases_alias"), "wine_catalog_aliases", ["alias"], unique=False)
    op.create_index(op.f("ix_wine_catalog_aliases_normalized_alias"), "wine_catalog_aliases", ["normalized_alias"], unique=True)

    op.create_table(
        "wine_recognition_logs",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("household_id", sa.Uuid(), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=True),
        sa.Column("provider", sa.String(length=40), nullable=False, server_default="api4ai"),
        sa.Column("status", sa.String(length=40), nullable=False, server_default="success"),
        sa.Column("image_filename", sa.String(length=240), nullable=False, server_default=""),
        sa.Column("best_label", sa.String(length=260), nullable=False, server_default=""),
        sa.Column("confidence", sa.Float(), nullable=True),
        sa.Column("matched_catalog_entry_id", sa.Uuid(), nullable=True),
        sa.Column("response_payload", sa.JSON(), nullable=False, server_default="{}"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["household_id"], ["households.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["matched_catalog_entry_id"], ["wine_catalog_entries.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_wine_recognition_logs_household_id"), "wine_recognition_logs", ["household_id"], unique=False)
    op.create_index(op.f("ix_wine_recognition_logs_user_id"), "wine_recognition_logs", ["user_id"], unique=False)
    op.create_index(op.f("ix_wine_recognition_logs_status"), "wine_recognition_logs", ["status"], unique=False)
    op.create_index(op.f("ix_wine_recognition_logs_created_at"), "wine_recognition_logs", ["created_at"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_wine_recognition_logs_created_at"), table_name="wine_recognition_logs")
    op.drop_index(op.f("ix_wine_recognition_logs_status"), table_name="wine_recognition_logs")
    op.drop_index(op.f("ix_wine_recognition_logs_user_id"), table_name="wine_recognition_logs")
    op.drop_index(op.f("ix_wine_recognition_logs_household_id"), table_name="wine_recognition_logs")
    op.drop_table("wine_recognition_logs")
    op.drop_index(op.f("ix_wine_catalog_aliases_normalized_alias"), table_name="wine_catalog_aliases")
    op.drop_index(op.f("ix_wine_catalog_aliases_alias"), table_name="wine_catalog_aliases")
    op.drop_index(op.f("ix_wine_catalog_aliases_catalog_entry_id"), table_name="wine_catalog_aliases")
    op.drop_table("wine_catalog_aliases")
    op.drop_index(op.f("ix_wine_catalog_entries_is_active"), table_name="wine_catalog_entries")
    op.drop_index(op.f("ix_wine_catalog_entries_search_text"), table_name="wine_catalog_entries")
    op.drop_index(op.f("ix_wine_catalog_entries_appellation"), table_name="wine_catalog_entries")
    op.drop_index(op.f("ix_wine_catalog_entries_region"), table_name="wine_catalog_entries")
    op.drop_index(op.f("ix_wine_catalog_entries_producer"), table_name="wine_catalog_entries")
    op.drop_index(op.f("ix_wine_catalog_entries_name"), table_name="wine_catalog_entries")
    op.drop_table("wine_catalog_entries")
