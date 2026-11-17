"""Tell the sensory baselines proposed by AI apart from the editorial ones.

A baseline proposed for an appellation or grape of the catalog stays inactive until
an app administrator activates it.
"""

import sqlalchemy as sa

from alembic import op

revision = "0139_baseline_source"
down_revision = "0138_catalog_completion"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "sensory_profile_baselines",
        sa.Column("source", sa.String(length=24), nullable=False, server_default="editorial"),
    )


def downgrade() -> None:
    op.drop_column("sensory_profile_baselines", "source")
