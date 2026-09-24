"""Add a private dashboard layout to user preferences."""

import sqlalchemy as sa

from alembic import op

revision = "0108_personal_dashboard"
down_revision = "0107_scoped_taste_profiles"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("users", sa.Column("personal_dashboard_widgets", sa.JSON(), nullable=True))


def downgrade() -> None:
    op.drop_column("users", "personal_dashboard_widgets")
