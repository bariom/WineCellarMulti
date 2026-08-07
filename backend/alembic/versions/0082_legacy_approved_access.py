"""preserve access for approved users that predate entitlements

Revision ID: 0082_legacy_approved_access
Revises: 0081_tasting_ai_cost
"""

from datetime import UTC, datetime, timedelta
from uuid import uuid4

import sqlalchemy as sa

from alembic import op

revision = "0082_legacy_approved_access"
down_revision = "0081_tasting_ai_cost"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    users = sa.table(
        "users",
        sa.column("id", sa.Uuid()),
        sa.column("is_approved", sa.Boolean()),
        sa.column("is_blocked", sa.Boolean()),
    )
    entitlements = sa.table(
        "user_entitlements",
        sa.column("id", sa.Uuid()),
        sa.column("user_id", sa.Uuid()),
        sa.column("source", sa.String()),
        sa.column("source_id", sa.Uuid()),
        sa.column("valid_from", sa.DateTime(timezone=True)),
        sa.column("valid_until", sa.DateTime(timezone=True)),
        sa.column("created_at", sa.DateTime(timezone=True)),
    )

    now = datetime.now(UTC)
    has_active_entitlement = sa.exists(
        sa.select(entitlements.c.id).where(
            entitlements.c.user_id == users.c.id,
            entitlements.c.valid_until > now,
        )
    )
    user_ids = bind.execute(
        sa.select(users.c.id).where(
            users.c.is_approved.is_(True),
            users.c.is_blocked.is_(False),
            ~has_active_entitlement,
        )
    ).scalars().all()
    if not user_ids:
        return

    valid_until = now + timedelta(days=365)
    bind.execute(
        entitlements.insert(),
        [
            {
                "id": uuid4(),
                "user_id": user_id,
                "source": "legacy",
                "source_id": None,
                "valid_from": now,
                "valid_until": valid_until,
                "created_at": now,
            }
            for user_id in user_ids
        ],
    )


def downgrade() -> None:
    entitlements = sa.table("user_entitlements", sa.column("source", sa.String()))
    op.execute(entitlements.delete().where(entitlements.c.source == "legacy"))
