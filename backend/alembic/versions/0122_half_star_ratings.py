"""Allow half stars for personal wine ratings."""

import sqlalchemy as sa

from alembic import op

revision = "0122_half_star_ratings"
down_revision = "0121_wine_geography"
branch_labels = None
depends_on = None


def upgrade() -> None:
    for table, column in [
        ("wines", "rating"),
        ("user_wine_ratings", "rating"),
        ("cellar_ai_commands", "previous_rating"),
    ]:
        with op.batch_alter_table(table) as batch:
            batch.alter_column(column, existing_type=sa.Integer(), type_=sa.Float())


def downgrade() -> None:
    for table, column in [
        ("cellar_ai_commands", "previous_rating"),
        ("user_wine_ratings", "rating"),
        ("wines", "rating"),
    ]:
        op.alter_column(
            table,
            column,
            existing_type=sa.Float(),
            type_=sa.Integer(),
            postgresql_using=f"round({column})::integer",
        )
