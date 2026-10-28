"""Store retired theme preferences as the closest signature theme.

Settings now offer the base appearance and four signature themes. Users who
had picked one of the twelve retired themes already saw the closest signature
theme in the app; this stores that choice. The mapping is copied here on
purpose so the migration never changes with application code.

Downgrade is a no-op: the original choice is not kept, and every retired
value would still be accepted and shown as its signature theme.
"""

import sqlalchemy as sa

from alembic import op

revision = "0127_retire_themes"
down_revision = "0126_taste_declarations"
branch_labels = None
depends_on = None

RETIRED_THEMES = {
    "sepia": "maison-champagne",
    "white-wine": "maison-champagne",
    "champagne": "maison-champagne",
    "tuscany": "maison-champagne",
    "rose-wine": "maison-champagne",
    "pietra-vigna": "atelier",
    "red-wine": "private-cellar",
    "bordeaux": "private-cellar",
    "burgundy": "private-cellar",
    "ticino": "private-cellar",
    "piedmont": "private-cellar",
    "midnight-ledger": "cave-privee",
}


def upgrade() -> None:
    users = sa.table("users", sa.column("theme_preference", sa.String(32)))
    for retired, curated in RETIRED_THEMES.items():
        op.execute(
            users.update()
            .where(users.c.theme_preference == retired)
            .values(theme_preference=curated)
        )


def downgrade() -> None:
    pass
