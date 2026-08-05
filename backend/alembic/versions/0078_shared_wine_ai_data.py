"""add reusable shared wine AI data

Revision ID: 0078_shared_wine_ai_data
Revises: 0077_wine_vineyard_location
"""

import sqlalchemy as sa

from alembic import op

revision = "0078_shared_wine_ai_data"
down_revision = "0077_wine_vineyard_location"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "shared_wine_identities",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("identity_key", sa.String(length=64), nullable=False),
        sa.Column("normalized_name", sa.String(length=240), nullable=False),
        sa.Column("normalized_producer", sa.String(length=240), nullable=False),
        sa.Column("normalized_vintage", sa.String(length=24), nullable=False),
        sa.Column("name", sa.String(length=200), nullable=False),
        sa.Column("producer", sa.String(length=200), nullable=False),
        sa.Column("vintage", sa.String(length=16), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("identity_key"),
    )
    op.create_index("ix_shared_wine_identities_identity_key", "shared_wine_identities", ["identity_key"], unique=True)
    op.create_index("ix_shared_wine_identities_normalized_name", "shared_wine_identities", ["normalized_name"])
    op.create_index("ix_shared_wine_identities_normalized_producer", "shared_wine_identities", ["normalized_producer"])
    op.create_index("ix_shared_wine_identities_normalized_vintage", "shared_wine_identities", ["normalized_vintage"])

    op.create_table(
        "shared_wine_facts",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("identity_id", sa.Uuid(), nullable=False),
        sa.Column("feature", sa.String(length=40), nullable=False),
        sa.Column("locale", sa.String(length=8), nullable=False, server_default=""),
        sa.Column("format_key", sa.String(length=80), nullable=False, server_default=""),
        sa.Column("currency", sa.String(length=8), nullable=False, server_default=""),
        sa.Column("status", sa.String(length=24), nullable=False, server_default="available"),
        sa.Column("payload", sa.JSON(), nullable=False, server_default="{}"),
        sa.Column("sources", sa.JSON(), nullable=False, server_default="[]"),
        sa.Column("model", sa.String(length=120), nullable=False, server_default=""),
        sa.Column("prompt_version", sa.String(length=32), nullable=False, server_default="1"),
        sa.Column("verified_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["identity_id"], ["shared_wine_identities.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("identity_id", "feature", "locale", "format_key", "currency", name="uq_shared_wine_fact_scope"),
    )
    op.create_index("ix_shared_wine_facts_identity_id", "shared_wine_facts", ["identity_id"])
    op.create_index("ix_shared_wine_facts_feature", "shared_wine_facts", ["feature"])
    op.create_index("ix_shared_wine_facts_status", "shared_wine_facts", ["status"])
    op.create_index("ix_shared_wine_fact_feature_verified", "shared_wine_facts", ["feature", "verified_at"])

    op.add_column("wines", sa.Column("shared_identity_id", sa.Uuid(), nullable=True))
    op.add_column("wines", sa.Column("shared_data_features", sa.JSON(), nullable=False, server_default="[]"))
    op.add_column("wines", sa.Column("shared_data_updated_at", sa.DateTime(timezone=True), nullable=True))
    op.create_foreign_key("fk_wines_shared_identity_id", "wines", "shared_wine_identities", ["shared_identity_id"], ["id"], ondelete="SET NULL")
    op.create_index("ix_wines_shared_identity_id", "wines", ["shared_identity_id"])
    op.create_index("ix_wines_vintage", "wines", ["vintage"])


def downgrade() -> None:
    op.drop_index("ix_wines_vintage", table_name="wines")
    op.drop_index("ix_wines_shared_identity_id", table_name="wines")
    op.drop_constraint("fk_wines_shared_identity_id", "wines", type_="foreignkey")
    op.drop_column("wines", "shared_data_updated_at")
    op.drop_column("wines", "shared_data_features")
    op.drop_column("wines", "shared_identity_id")
    op.drop_table("shared_wine_facts")
    op.drop_table("shared_wine_identities")
