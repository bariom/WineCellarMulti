"""user wine photo permission

Revision ID: 0057_wine_photo_permission
Revises: 0056_wine_product_photos
"""

import sqlalchemy as sa

from alembic import op

revision = "0057_wine_photo_permission"
down_revision = "0056_wine_product_photos"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "users",
        sa.Column(
            "can_manage_wine_photos",
            sa.Boolean(),
            nullable=False,
            server_default=sa.false(),
        ),
    )
    op.alter_column("users", "can_manage_wine_photos", server_default=None)


def downgrade() -> None:
    op.drop_column("users", "can_manage_wine_photos")
