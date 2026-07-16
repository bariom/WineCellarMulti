"""delete households without members

Revision ID: 0053_delete_orphaned_households
Revises: 0052_notification_dismissals
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "0053_delete_orphaned_households"
down_revision: str | None = "0052_notification_dismissals"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.execute(
        sa.text(
            """
            DELETE FROM households
            WHERE NOT EXISTS (
                SELECT 1
                FROM memberships
                WHERE memberships.household_id = households.id
            )
            """
        )
    )


def downgrade() -> None:
    # Deleted orphaned households cannot be reconstructed.
    pass
