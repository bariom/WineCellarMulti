"""add verified vineyard location to wines

Revision ID: 0077_wine_vineyard_location
Revises: 0076_demo_cellar
"""

import sqlalchemy as sa

from alembic import op

revision = "0077_wine_vineyard_location"
down_revision = "0076_demo_cellar"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "wines",
        sa.Column("vineyard_name", sa.String(length=240), nullable=False, server_default=""),
    )
    op.add_column(
        "wines",
        sa.Column("vineyard_locality", sa.String(length=240), nullable=False, server_default=""),
    )
    op.add_column(
        "wines",
        sa.Column("vineyard_country", sa.String(length=120), nullable=False, server_default=""),
    )
    op.add_column("wines", sa.Column("vineyard_latitude", sa.Float(), nullable=True))
    op.add_column("wines", sa.Column("vineyard_longitude", sa.Float(), nullable=True))
    op.add_column(
        "wines",
        sa.Column("vineyard_precision", sa.String(length=24), nullable=False, server_default=""),
    )
    op.add_column(
        "wines",
        sa.Column("vineyard_source_url", sa.String(length=500), nullable=False, server_default=""),
    )
    op.add_column(
        "wines",
        sa.Column(
            "vineyard_source_title", sa.String(length=240), nullable=False, server_default=""
        ),
    )
    op.add_column(
        "wines", sa.Column("vineyard_notes", sa.Text(), nullable=False, server_default="")
    )
    op.add_column(
        "wines", sa.Column("vineyard_verified_at", sa.DateTime(timezone=True), nullable=True)
    )
    op.add_column(
        "wines",
        sa.Column("vineyard_not_found", sa.Boolean(), nullable=False, server_default=sa.false()),
    )


def downgrade() -> None:
    for column in (
        "vineyard_not_found",
        "vineyard_verified_at",
        "vineyard_notes",
        "vineyard_source_title",
        "vineyard_source_url",
        "vineyard_precision",
        "vineyard_longitude",
        "vineyard_latitude",
        "vineyard_country",
        "vineyard_locality",
        "vineyard_name",
    ):
        op.drop_column("wines", column)
