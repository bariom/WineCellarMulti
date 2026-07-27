"""track wines without a verified grape composition

Revision ID: 0068_wine_grapes_not_applicable
Revises: 0067_wine_value_not_found
"""

import sqlalchemy as sa

from alembic import op

revision = "0068_wine_grapes_not_applicable"
down_revision = "0067_wine_value_not_found"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "wines",
        sa.Column("grapes_not_applicable", sa.Boolean(), nullable=False, server_default=sa.false()),
    )
    op.alter_column("wines", "grapes_not_applicable", server_default=None)


def downgrade() -> None:
    op.drop_column("wines", "grapes_not_applicable")
