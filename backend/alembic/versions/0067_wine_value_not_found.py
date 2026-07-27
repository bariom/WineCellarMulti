"""track wines without a verified market price

Revision ID: 0067_wine_value_not_found
Revises: 0066_user_activity_log
"""

import sqlalchemy as sa

from alembic import op

revision = "0067_wine_value_not_found"
down_revision = "0066_user_activity_log"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "wines",
        sa.Column("value_not_found", sa.Boolean(), nullable=False, server_default=sa.false()),
    )
    op.alter_column("wines", "value_not_found", server_default=None)


def downgrade() -> None:
    op.drop_column("wines", "value_not_found")
