"""add private user wine ratings

Revision ID: 0105_user_wine_ratings
Revises: 0104_taste_profile_calc_version
"""

import sqlalchemy as sa

from alembic import op

revision = "0105_user_wine_ratings"
down_revision = "0104_taste_profile_calc_version"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "user_wine_ratings",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("household_id", sa.Uuid(), nullable=False),
        sa.Column("wine_id", sa.Uuid(), nullable=False),
        sa.Column("rating", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["household_id"], ["households.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["wine_id"], ["wines.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("user_id", "wine_id", name="uq_user_wine_rating_user_wine"),
    )
    op.create_index("ix_user_wine_ratings_user_id", "user_wine_ratings", ["user_id"])
    op.create_index("ix_user_wine_ratings_household_id", "user_wine_ratings", ["household_id"])
    op.create_index("ix_user_wine_ratings_wine_id", "user_wine_ratings", ["wine_id"])
    op.create_index(
        "ix_user_wine_ratings_user_household", "user_wine_ratings", ["user_id", "household_id"]
    )


def downgrade() -> None:
    op.drop_table("user_wine_ratings")
