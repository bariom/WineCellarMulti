"""add public wine list token for restaurants

Revision ID: 0092_restaurant_public_wine_list
Revises: 0091_wine_commercial_lifecycle
"""

import sqlalchemy as sa

from alembic import op

revision = "0092_restaurant_public_wine_list"
down_revision = "0091_wine_commercial_lifecycle"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("households", sa.Column("public_wine_list_token", sa.String(length=80), nullable=True))
    op.create_unique_constraint(
        "uq_households_public_wine_list_token", "households", ["public_wine_list_token"]
    )


def downgrade() -> None:
    op.drop_constraint("uq_households_public_wine_list_token", "households", type_="unique")
    op.drop_column("households", "public_wine_list_token")
