"""wine value history

Revision ID: 0019_wine_value_history
Revises: 0018_block_users
Create Date: 2026-06-01 00:00:00.000000
"""

from alembic import op
import sqlalchemy as sa


revision = "0019_wine_value_history"
down_revision = "0018_block_users"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "wine_value_history",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("wine_id", sa.Uuid(), nullable=False),
        sa.Column("value", sa.Numeric(10, 2), nullable=False),
        sa.Column("currency", sa.String(length=8), nullable=False),
        sa.Column("source", sa.String(length=32), nullable=False),
        sa.Column("recorded_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["wine_id"], ["wines.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_wine_value_history_recorded_at"), "wine_value_history", ["recorded_at"], unique=False)
    op.create_index(op.f("ix_wine_value_history_wine_id"), "wine_value_history", ["wine_id"], unique=False)
    op.execute("CREATE EXTENSION IF NOT EXISTS pgcrypto")
    op.execute(
        """
        INSERT INTO wine_value_history (id, wine_id, value, currency, source, recorded_at)
        SELECT gen_random_uuid(), id, current_value, currency, 'imported', COALESCE(ai_value_estimated_at, CURRENT_TIMESTAMP)
        FROM wines
        WHERE current_value IS NOT NULL
        """,
    )


def downgrade() -> None:
    op.drop_index(op.f("ix_wine_value_history_wine_id"), table_name="wine_value_history")
    op.drop_index(op.f("ix_wine_value_history_recorded_at"), table_name="wine_value_history")
    op.drop_table("wine_value_history")
