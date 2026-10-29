"""Demo events: QR entry points where guests try chosen AI features on Vinaris' credit."""

import sqlalchemy as sa

from alembic import op

revision = "0129_demo_events"
down_revision = "0128_email_campaigns"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "demo_events",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("slug", sa.String(40), nullable=False),
        sa.Column("name", sa.String(120), nullable=False),
        sa.Column("place", sa.String(120), nullable=False, server_default=""),
        sa.Column("locale", sa.String(8), nullable=False, server_default="it"),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("starts_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("ends_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("features", sa.JSON(), nullable=False),
        sa.Column("landing", sa.String(32), nullable=False, server_default="pairing-restaurant"),
        sa.Column(
            "credit_per_visitor_usd", sa.Numeric(12, 6), nullable=False, server_default="0.5"
        ),
        sa.Column("budget_usd", sa.Numeric(12, 2), nullable=False, server_default="0"),
        sa.Column("max_visitors_per_day", sa.Integer(), nullable=False, server_default="200"),
        sa.Column("session_hours", sa.Integer(), nullable=False, server_default="6"),
        sa.Column("visitor_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column(
            "created_by_user_id",
            sa.Uuid(),
            sa.ForeignKey("users.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_demo_events_slug", "demo_events", ["slug"], unique=True)
    op.add_column(
        "users",
        sa.Column(
            "event_id",
            sa.Uuid(),
            sa.ForeignKey("demo_events.id", ondelete="SET NULL"),
            nullable=True,
        ),
    )
    op.create_index("ix_users_event_id", "users", ["event_id"])
    op.add_column(
        "users", sa.Column("event_visitor_until", sa.DateTime(timezone=True), nullable=True)
    )


def downgrade() -> None:
    op.drop_index("ix_users_event_id", table_name="users")
    op.drop_column("users", "event_visitor_until")
    op.drop_column("users", "event_id")
    op.drop_index("ix_demo_events_slug", table_name="demo_events")
    op.drop_table("demo_events")
