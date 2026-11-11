"""Store catalog entry sources as jsonb so catalog searches can use SELECT DISTINCT.

PostgreSQL has no equality operator for json, and the catalog searches select whole
entries with DISTINCT: with a json column they all failed.
"""

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision = "0135_catalog_sources_jsonb"
down_revision = "0134_catalog_entry_details"
branch_labels = None
depends_on = None


def upgrade() -> None:
    if op.get_bind().dialect.name != "postgresql":
        return
    op.alter_column(
        "wine_catalog_entries",
        "sources",
        type_=postgresql.JSONB(),
        existing_type=sa.JSON(),
        postgresql_using="sources::jsonb",
        existing_nullable=False,
        server_default=sa.text("'[]'::jsonb"),
    )


def downgrade() -> None:
    if op.get_bind().dialect.name != "postgresql":
        return
    op.alter_column(
        "wine_catalog_entries",
        "sources",
        type_=sa.JSON(),
        existing_type=postgresql.JSONB(),
        postgresql_using="sources::json",
        existing_nullable=False,
        server_default=sa.text("'[]'::json"),
    )
