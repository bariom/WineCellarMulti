"""user dashboard focus

Revision ID: 0062_user_dashboard_focus
Revises: 0061_account_deletion_photos
"""

import sqlalchemy as sa

from alembic import op

revision = "0062_user_dashboard_focus"
down_revision = "0061_account_deletion_photos"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "users",
        sa.Column(
            "dashboard_focus",
            sa.String(length=32),
            nullable=False,
            server_default="collector",
        ),
    )
    op.alter_column("users", "dashboard_focus", server_default=None)


def downgrade() -> None:
    op.drop_column("users", "dashboard_focus")
