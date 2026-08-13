"""add cellar AI commands and exact tasting scores

Revision ID: 0093_cellar_ai_commands
Revises: 0092_restaurant_public_wine_list
"""

import sqlalchemy as sa

from alembic import op

revision = "0093_cellar_ai_commands"
down_revision = "0092_restaurant_public_wine_list"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("wine_tasting_entries", sa.Column("created_by_user_id", sa.Uuid(), nullable=True))
    op.add_column("wine_tasting_entries", sa.Column("score_value", sa.Numeric(6, 2), nullable=True))
    op.add_column("wine_tasting_entries", sa.Column("score_scale", sa.Integer(), nullable=True))
    op.add_column(
        "wine_tasting_entries",
        sa.Column("source", sa.String(length=32), nullable=False, server_default="manual"),
    )
    op.add_column(
        "wine_tasting_entries",
        sa.Column("source_text", sa.Text(), nullable=False, server_default=""),
    )
    op.create_index(
        op.f("ix_wine_tasting_entries_created_by_user_id"),
        "wine_tasting_entries",
        ["created_by_user_id"],
        unique=False,
    )
    op.create_foreign_key(
        "fk_wine_tasting_entries_created_by_user_id",
        "wine_tasting_entries",
        "users",
        ["created_by_user_id"],
        ["id"],
        ondelete="SET NULL",
    )

    op.create_table(
        "cellar_ai_commands",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("household_id", sa.Uuid(), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=True),
        sa.Column("raw_text", sa.Text(), nullable=False),
        sa.Column("intent", sa.String(length=48), nullable=False, server_default="unsupported"),
        sa.Column("parsed_payload", sa.JSON(), nullable=False),
        sa.Column("status", sa.String(length=32), nullable=False, server_default="processing"),
        sa.Column("matched_wine_id", sa.Uuid(), nullable=True),
        sa.Column("tasting_id", sa.Uuid(), nullable=True),
        sa.Column("previous_quantity", sa.Integer(), nullable=True),
        sa.Column("previous_status", sa.String(length=64), nullable=False, server_default=""),
        sa.Column("previous_rating", sa.Integer(), nullable=True),
        sa.Column("model", sa.String(length=120), nullable=False, server_default=""),
        sa.Column("reasoning_effort", sa.String(length=16), nullable=False, server_default=""),
        sa.Column("estimated_cost_usd", sa.Numeric(12, 6), nullable=False, server_default="0"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("executed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("undone_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["household_id"], ["households.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["matched_wine_id"], ["wines.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["tasting_id"], ["wine_tasting_entries.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        op.f("ix_cellar_ai_commands_household_id"),
        "cellar_ai_commands",
        ["household_id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_cellar_ai_commands_user_id"), "cellar_ai_commands", ["user_id"], unique=False
    )
    op.create_index(
        op.f("ix_cellar_ai_commands_status"), "cellar_ai_commands", ["status"], unique=False
    )


def downgrade() -> None:
    op.drop_table("cellar_ai_commands")
    op.drop_constraint(
        "fk_wine_tasting_entries_created_by_user_id", "wine_tasting_entries", type_="foreignkey"
    )
    op.drop_index(
        op.f("ix_wine_tasting_entries_created_by_user_id"), table_name="wine_tasting_entries"
    )
    op.drop_column("wine_tasting_entries", "source_text")
    op.drop_column("wine_tasting_entries", "source")
    op.drop_column("wine_tasting_entries", "score_scale")
    op.drop_column("wine_tasting_entries", "score_value")
    op.drop_column("wine_tasting_entries", "created_by_user_id")
