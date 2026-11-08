"""A wishlist wine keeps the same identity facts as a cellar wine: grapes, origin, description."""

import sqlalchemy as sa

from alembic import op

revision = "0131_wishlist_wine_profile"
down_revision = "0130_session_resume_user"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "wishlist_items",
        sa.Column("grapes", sa.JSON(), nullable=False, server_default="[]"),
    )
    op.add_column(
        "wishlist_items",
        sa.Column("grapes_source_url", sa.String(500), nullable=False, server_default=""),
    )
    op.add_column(
        "wishlist_items",
        sa.Column("grapes_source_title", sa.String(200), nullable=False, server_default=""),
    )
    op.add_column(
        "wishlist_items",
        sa.Column("country", sa.String(120), nullable=False, server_default=""),
    )
    op.add_column(
        "wishlist_items",
        sa.Column("wine_zone", sa.String(120), nullable=False, server_default=""),
    )
    op.add_column(
        "wishlist_items",
        sa.Column("ai_notes", sa.Text(), nullable=False, server_default=""),
    )


def downgrade() -> None:
    for column in (
        "ai_notes",
        "wine_zone",
        "country",
        "grapes_source_title",
        "grapes_source_url",
        "grapes",
    ):
        op.drop_column("wishlist_items", column)
