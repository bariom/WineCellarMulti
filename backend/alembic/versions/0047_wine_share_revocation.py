"""track received wine copies for share revocation

Revision ID: 0047_wine_share_revocation
Revises: 0046_coownership_agreements
"""

from alembic import op
import sqlalchemy as sa


revision = "0047_wine_share_revocation"
down_revision = "0046_coownership_agreements"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("wine_share_offers", sa.Column("recipient_wine_id", sa.Uuid(), nullable=True))
    op.create_foreign_key("fk_wine_share_offers_recipient_wine_id", "wine_share_offers", "wines", ["recipient_wine_id"], ["id"], ondelete="SET NULL")
    op.create_index("ix_wine_share_offers_recipient_wine_id", "wine_share_offers", ["recipient_wine_id"])


def downgrade() -> None:
    op.drop_index("ix_wine_share_offers_recipient_wine_id", table_name="wine_share_offers")
    op.drop_constraint("fk_wine_share_offers_recipient_wine_id", "wine_share_offers", type_="foreignkey")
    op.drop_column("wine_share_offers", "recipient_wine_id")
