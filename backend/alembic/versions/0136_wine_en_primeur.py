"""Mark wines bought en primeur.

The flag stays after delivery; the cellar value tells apart the en primeur bottles
still waiting for delivery from those already in the cellar.
"""

import sqlalchemy as sa

from alembic import op

revision = "0136_wine_en_primeur"
down_revision = "0135_catalog_sources_jsonb"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "wines",
        sa.Column("en_primeur", sa.Boolean(), nullable=False, server_default=sa.false()),
    )


def downgrade() -> None:
    op.drop_column("wines", "en_primeur")
