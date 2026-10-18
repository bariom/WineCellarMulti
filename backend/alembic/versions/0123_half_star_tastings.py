"""Allow half points for tasting scores."""

import sqlalchemy as sa

from alembic import op

revision = "0123_half_star_tastings"
down_revision = "0122_half_star_ratings"
branch_labels = None
depends_on = None

TABLES = ("wine_tasting_entries", "external_wine_tastings")


def upgrade() -> None:
    for table in TABLES:
        with op.batch_alter_table(table) as batch:
            batch.alter_column("rating", existing_type=sa.Integer(), type_=sa.Float())


def downgrade() -> None:
    for table in reversed(TABLES):
        op.alter_column(
            table,
            "rating",
            existing_type=sa.Float(),
            type_=sa.Integer(),
            postgresql_using="round(rating)::integer",
        )
