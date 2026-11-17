"""Let users stop being asked to complete a tasting's sensory profile.

Some wines (obscure producers, little-documented countries) cannot be researched:
the user dismisses them and the taste profile page stops proposing them.
"""

import sqlalchemy as sa

from alembic import op

revision = "0137_tasting_sensory_dismissed"
down_revision = "0136_wine_en_primeur"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "external_wine_tastings",
        sa.Column("sensory_enrichment_dismissed_at", sa.DateTime(timezone=True), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("external_wine_tastings", "sensory_enrichment_dismissed_at")
