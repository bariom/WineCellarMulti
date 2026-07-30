"""record versioned privacy and terms acceptance

Revision ID: 0071_legal_acceptance
Revises: 0070_wishlist_offer_price
"""

import sqlalchemy as sa
from alembic import op

revision = "0071_legal_acceptance"
down_revision = "0070_wishlist_offer_price"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "users",
        sa.Column("privacy_policy_accepted_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.add_column(
        "users",
        sa.Column(
            "privacy_policy_version", sa.String(length=32), nullable=False, server_default=""
        ),
    )
    op.add_column(
        "users",
        sa.Column("terms_accepted_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.add_column(
        "users",
        sa.Column("terms_version", sa.String(length=32), nullable=False, server_default=""),
    )
    op.add_column(
        "users",
        sa.Column(
            "legal_acceptance_locale", sa.String(length=8), nullable=False, server_default=""
        ),
    )


def downgrade() -> None:
    op.drop_column("users", "legal_acceptance_locale")
    op.drop_column("users", "terms_version")
    op.drop_column("users", "terms_accepted_at")
    op.drop_column("users", "privacy_policy_version")
    op.drop_column("users", "privacy_policy_accepted_at")
