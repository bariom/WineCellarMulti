"""News e-mail campaigns: opt-out flag, campaigns, deliveries and assets.

Every existing account keeps receiving news e-mails (opt-out model, decided
on 2026-10-28) until the user unsubscribes from a link or from Settings.
"""

import sqlalchemy as sa

from alembic import op

revision = "0128_email_campaigns"
down_revision = "0127_retire_themes"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "users",
        sa.Column("news_email_opt_out", sa.Boolean(), nullable=False, server_default=sa.false()),
    )
    op.create_table(
        "email_campaigns",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column(
            "created_by_user_id",
            sa.Uuid(),
            sa.ForeignKey("users.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("locale", sa.String(8), nullable=False),
        sa.Column("subject", sa.String(160), nullable=False),
        sa.Column("preheader", sa.String(200), nullable=False, server_default=""),
        sa.Column("blocks", sa.JSON(), nullable=False),
        sa.Column("recipient_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("sent_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("failed_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("finished_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index("ix_email_campaigns_created_at", "email_campaigns", ["created_at"])
    op.create_table(
        "email_campaign_deliveries",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column(
            "campaign_id",
            sa.Uuid(),
            sa.ForeignKey("email_campaigns.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "user_id", sa.Uuid(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False
        ),
        sa.Column("status", sa.String(16), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.UniqueConstraint("campaign_id", "user_id", name="uq_email_delivery_campaign_user"),
    )
    op.create_index(
        "ix_email_campaign_deliveries_campaign_id", "email_campaign_deliveries", ["campaign_id"]
    )
    op.create_index(
        "ix_email_campaign_deliveries_user_id", "email_campaign_deliveries", ["user_id"]
    )
    op.create_table(
        "email_assets",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column(
            "created_by_user_id",
            sa.Uuid(),
            sa.ForeignKey("users.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("title", sa.String(120), nullable=False),
        sa.Column("description", sa.Text(), nullable=False, server_default=""),
        sa.Column("content_type", sa.String(32), nullable=False),
        sa.Column("width", sa.Integer(), nullable=False),
        sa.Column("height", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )


def downgrade() -> None:
    op.drop_table("email_assets")
    op.drop_index("ix_email_campaign_deliveries_user_id", table_name="email_campaign_deliveries")
    op.drop_index(
        "ix_email_campaign_deliveries_campaign_id", table_name="email_campaign_deliveries"
    )
    op.drop_table("email_campaign_deliveries")
    op.drop_index("ix_email_campaigns_created_at", table_name="email_campaigns")
    op.drop_table("email_campaigns")
    op.drop_column("users", "news_email_opt_out")
