"""Remember how a wine felt to the person who tasted it.

Body, acidity, tannin and sweetness on a 1..5 scale, each optional: the first
first-hand data to compare with the estimated sensory profiles.
"""

import sqlalchemy as sa

from alembic import op

revision = "0140_tasting_perceived"
down_revision = "0139_baseline_source"
branch_labels = None
depends_on = None


def upgrade() -> None:
    for table in ("wine_tasting_entries", "external_wine_tastings"):
        op.add_column(table, sa.Column("perceived", sa.JSON(), nullable=True))


def downgrade() -> None:
    for table in ("wine_tasting_entries", "external_wine_tastings"):
        op.drop_column(table, "perceived")
