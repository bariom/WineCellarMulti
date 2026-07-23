"""user daily wine budget

Revision ID: 0063_user_daily_wine_budget
Revises: 0062_user_dashboard_focus
"""

import sqlalchemy as sa

from alembic import op

revision = "0063_user_daily_wine_budget"
down_revision = "0062_user_dashboard_focus"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "users",
        sa.Column("daily_wine_budget_chf", sa.Numeric(10, 2), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("users", "daily_wine_budget_chf")
