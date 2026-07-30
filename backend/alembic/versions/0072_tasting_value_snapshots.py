"""store value snapshots for tasting archive insights

Revision ID: 0072_tasting_value_snapshots
Revises: 0071_legal_acceptance
"""

import sqlalchemy as sa

from alembic import op

revision = "0072_tasting_value_snapshots"
down_revision = "0071_legal_acceptance"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "wine_tasting_entries",
        sa.Column("purchase_price_at_consumption", sa.Numeric(10, 2), nullable=True),
    )
    op.add_column(
        "wine_tasting_entries",
        sa.Column("market_value_at_consumption", sa.Numeric(10, 2), nullable=True),
    )
    op.add_column(
        "wine_tasting_entries",
        sa.Column("currency_at_consumption", sa.String(length=8), nullable=True),
    )
    # Purchase cost and currency are stable wine metadata for legacy tastings.
    # Market value remains null unless a historical value exists, so the UI does
    # not present today's estimate as a past valuation.
    op.execute(
        """
        UPDATE wine_tasting_entries AS tasting
        SET purchase_price_at_consumption = wine.price,
            currency_at_consumption = wine.currency
        FROM wines AS wine
        WHERE wine.id = tasting.wine_id
        """
    )


def downgrade() -> None:
    op.drop_column("wine_tasting_entries", "currency_at_consumption")
    op.drop_column("wine_tasting_entries", "market_value_at_consumption")
    op.drop_column("wine_tasting_entries", "purchase_price_at_consumption")
