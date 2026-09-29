"""Persist completion of personal setup for new and existing users."""

import sqlalchemy as sa
from alembic import op

revision = "0111_user_onboarding"
down_revision = "0110_valuation_market"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "users", sa.Column("onboarding_completed_at", sa.DateTime(timezone=True), nullable=True)
    )


def downgrade() -> None:
    op.drop_column("users", "onboarding_completed_at")
