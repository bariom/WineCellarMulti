"""record when wines are added

Revision ID: 0060_wine_created_at
Revises: 0059_regional_gap_profiles
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "0060_wine_created_at"
down_revision: str | None = "0059_regional_gap_profiles"
branch_labels: str | Sequence[str] | None = None
depends_on: str | None = None


def upgrade() -> None:
    op.add_column(
        "wines",
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
    )
    op.create_index("ix_wines_created_at", "wines", ["created_at"])


def downgrade() -> None:
    op.drop_index("ix_wines_created_at", table_name="wines")
    op.drop_column("wines", "created_at")
