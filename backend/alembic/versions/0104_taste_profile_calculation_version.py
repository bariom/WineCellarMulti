"""version taste-profile calculations

Revision ID: 0104_taste_profile_calc_version
Revises: 0103_expand_sensory_baselines
"""

import sqlalchemy as sa

from alembic import op

revision = "0104_taste_profile_calc_version"
down_revision = "0103_expand_sensory_baselines"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "user_taste_profiles",
        sa.Column("calculation_version", sa.Integer(), nullable=False, server_default="2"),
    )
    # This table is a deterministic, private cache. Removing existing entries ensures
    # historical tastings are rebuilt with 3/6 neutral and 4/6 positive.
    op.execute(sa.text("DELETE FROM user_taste_profiles"))
    op.alter_column("user_taste_profiles", "calculation_version", server_default=None)


def downgrade() -> None:
    op.drop_column("user_taste_profiles", "calculation_version")
