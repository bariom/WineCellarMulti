"""record photo usage disclaimer acceptance

Revision ID: 0058_photo_disclaimer
Revises: 0057_wine_photo_permission
"""

import sqlalchemy as sa

from alembic import op

revision = "0058_photo_disclaimer"
down_revision = "0057_wine_photo_permission"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "users",
        sa.Column("photo_usage_disclaimer_accepted_at", sa.DateTime(timezone=True), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("users", "photo_usage_disclaimer_accepted_at")
