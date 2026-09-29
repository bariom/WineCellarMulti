"""Scope AI valuations by the user's explicit reference market."""

import sqlalchemy as sa
from alembic import op

revision = "0110_valuation_market"
down_revision = "0109_admin_announcements"
branch_labels = None
depends_on = None


def upgrade() -> None:
    for table, column in (
        ("users", "market_country"),
        ("wines", "ai_value_market_country"),
        ("wishlist_items", "ai_market_price_market_country"),
    ):
        op.add_column(table, sa.Column(column, sa.String(2), nullable=False, server_default=""))
    with op.batch_alter_table("shared_wine_facts") as batch:
        batch.add_column(
            sa.Column("market_country", sa.String(2), nullable=False, server_default="")
        )
        batch.drop_constraint("uq_shared_wine_fact_scope", type_="unique")
        batch.create_unique_constraint(
            "uq_shared_wine_fact_scope",
            ["identity_id", "feature", "locale", "format_key", "currency", "market_country"],
        )


def downgrade() -> None:
    # Multiple market-specific facts cannot fit the old unique scope. Keep the newest.
    op.execute(
        sa.text(
            "DELETE FROM shared_wine_facts WHERE id IN (SELECT id FROM "
            "(SELECT id, ROW_NUMBER() OVER (PARTITION BY identity_id, feature, locale, "
            "format_key, currency ORDER BY verified_at DESC, id DESC) AS rn "
            "FROM shared_wine_facts) AS ranked WHERE rn > 1)"
        )
    )
    with op.batch_alter_table("shared_wine_facts") as batch:
        batch.drop_constraint("uq_shared_wine_fact_scope", type_="unique")
        batch.drop_column("market_country")
        batch.create_unique_constraint(
            "uq_shared_wine_fact_scope",
            ["identity_id", "feature", "locale", "format_key", "currency"],
        )
    op.drop_column("wishlist_items", "ai_market_price_market_country")
    op.drop_column("wines", "ai_value_market_country")
    op.drop_column("users", "market_country")
