"""normalize wine tasting history for paginated archive queries

Revision ID: 0049_normalize_tastings
Revises: 0048_query_performance_indexes
"""

import json
import uuid
from datetime import UTC, date, datetime

import sqlalchemy as sa

from alembic import op

revision = "0049_normalize_tastings"
down_revision = "0048_query_performance_indexes"
branch_labels = None
depends_on = None


def _as_datetime(value: object) -> datetime:
    try:
        return datetime.fromisoformat(str(value).replace("Z", "+00:00"))
    except (TypeError, ValueError):
        return datetime.now(UTC)


def upgrade() -> None:
    op.create_table(
        "wine_tasting_entries",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column(
            "wine_id", sa.Uuid(), sa.ForeignKey("wines.id", ondelete="CASCADE"), nullable=False
        ),
        sa.Column(
            "household_id",
            sa.Uuid(),
            sa.ForeignKey("households.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("consumed_at", sa.Date(), nullable=False),
        sa.Column("note", sa.Text(), nullable=False, server_default=""),
        sa.Column("rating", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("enjoyment", sa.String(16), nullable=False, server_default=""),
        sa.Column("occasion", sa.String(200), nullable=False, server_default=""),
        sa.Column("pairing", sa.String(300), nullable=False, server_default=""),
        sa.Column("companions", sa.String(300), nullable=False, server_default=""),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index(
        "ix_wine_tastings_household_consumed_created",
        "wine_tasting_entries",
        ["household_id", "consumed_at", "created_at"],
    )
    op.create_index(
        "ix_wine_tastings_wine_consumed", "wine_tasting_entries", ["wine_id", "consumed_at"]
    )

    bind = op.get_bind()
    rows = bind.execute(sa.text("SELECT id, household_id, tasting_history FROM wines"))
    tasting_entries = sa.table(
        "wine_tasting_entries",
        sa.column("id", sa.Uuid()),
        sa.column("wine_id", sa.Uuid()),
        sa.column("household_id", sa.Uuid()),
        sa.column("consumed_at", sa.Date()),
        sa.column("note", sa.Text()),
        sa.column("rating", sa.Integer()),
        sa.column("enjoyment", sa.String()),
        sa.column("occasion", sa.String()),
        sa.column("pairing", sa.String()),
        sa.column("companions", sa.String()),
        sa.column("created_at", sa.DateTime(timezone=True)),
    )
    entries: list[dict[str, object]] = []
    tasting_ids: set[uuid.UUID] = set()
    for wine_id, household_id, history in rows:
        if isinstance(history, str):
            try:
                history = json.loads(history)
            except json.JSONDecodeError:
                history = []
        for raw in history or []:
            if not isinstance(raw, dict):
                continue
            try:
                consumed_at = date.fromisoformat(str(raw.get("consumed_at")))
            except ValueError:
                continue
            try:
                tasting_id = uuid.UUID(str(raw.get("id")))
            except (TypeError, ValueError, AttributeError):
                tasting_id = uuid.uuid4()
            if tasting_id in tasting_ids:
                tasting_id = uuid.uuid4()
            tasting_ids.add(tasting_id)
            entries.append(
                {
                    "id": tasting_id,
                    "wine_id": wine_id,
                    "household_id": household_id,
                    "consumed_at": consumed_at,
                    "note": str(raw.get("note") or ""),
                    "rating": int(raw.get("rating") or 0),
                    "enjoyment": str(raw.get("enjoyment") or ""),
                    "occasion": str(raw.get("occasion") or ""),
                    "pairing": str(raw.get("pairing") or ""),
                    "companions": str(raw.get("companions") or ""),
                    "created_at": _as_datetime(raw.get("created_at")),
                }
            )
    if entries:
        bind.execute(tasting_entries.insert(), entries)


def downgrade() -> None:
    op.drop_index("ix_wine_tastings_wine_consumed", table_name="wine_tasting_entries")
    op.drop_index("ix_wine_tastings_household_consumed_created", table_name="wine_tasting_entries")
    op.drop_table("wine_tasting_entries")
