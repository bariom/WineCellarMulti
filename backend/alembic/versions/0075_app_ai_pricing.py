"""persist app-admin AI price book

Revision ID: 0075_app_ai_pricing
Revises: 0074_luna_recognition_provider
"""

import sqlalchemy as sa

from alembic import op

revision = "0075_app_ai_pricing"
down_revision = "0074_luna_recognition_provider"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "app_ai_pricing",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("price_book_json", sa.Text(), nullable=False, server_default=""),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
    )


def downgrade() -> None:
    op.drop_table("app_ai_pricing")
