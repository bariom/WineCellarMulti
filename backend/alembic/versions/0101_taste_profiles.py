"""add shared wine sensory and private taste profiles

Revision ID: 0101_taste_profiles
Revises: 0100_merchant_directory
"""

from alembic import op
import sqlalchemy as sa

revision = "0101_taste_profiles"
down_revision = "0100_merchant_directory"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "wine_sensory_profiles",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("identity_id", sa.Uuid(), nullable=False),
        sa.Column("dimensions", sa.JSON(), nullable=False),
        sa.Column("source", sa.String(length=24), nullable=False),
        sa.Column("confidence", sa.Float(), nullable=False),
        sa.Column("validated", sa.Boolean(), nullable=False),
        sa.Column("generation_status", sa.String(length=24), nullable=False),
        sa.Column("model", sa.String(length=120), nullable=False),
        sa.Column("last_modified_by_user_id", sa.Uuid(), nullable=True),
        sa.Column("generated_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["identity_id"], ["shared_wine_identities.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["last_modified_by_user_id"], ["users.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("identity_id", name="uq_wine_sensory_profile_identity"),
    )
    op.create_index("ix_wine_sensory_profiles_identity_id", "wine_sensory_profiles", ["identity_id"])
    op.create_index("ix_wine_sensory_profiles_source_confidence", "wine_sensory_profiles", ["source", "confidence"])
    op.create_index("ix_wine_sensory_profiles_validated", "wine_sensory_profiles", ["validated"])
    op.create_index("ix_wine_sensory_profiles_generation_status", "wine_sensory_profiles", ["generation_status"])
    op.create_table(
        "sensory_profile_baselines",
        sa.Column("id", sa.Uuid(), nullable=False), sa.Column("entity_type", sa.String(length=24), nullable=False),
        sa.Column("entity_key", sa.String(length=240), nullable=False), sa.Column("dimensions", sa.JSON(), nullable=False),
        sa.Column("confidence", sa.Float(), nullable=False), sa.Column("is_active", sa.Boolean(), nullable=False),
        sa.Column("last_modified_by_user_id", sa.Uuid(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False), sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["last_modified_by_user_id"], ["users.id"], ondelete="SET NULL"), sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("entity_type", "entity_key", name="uq_sensory_profile_baseline"),
    )
    op.create_index("ix_sensory_profile_baseline_type_key", "sensory_profile_baselines", ["entity_type", "entity_key"])
    op.create_index("ix_sensory_profile_baselines_entity_type", "sensory_profile_baselines", ["entity_type"])
    op.create_index("ix_sensory_profile_baselines_entity_key", "sensory_profile_baselines", ["entity_key"])
    op.create_table(
        "user_taste_profiles",
        sa.Column("id", sa.Uuid(), nullable=False), sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("category", sa.String(length=24), nullable=False), sa.Column("dimensions", sa.JSON(), nullable=False),
        sa.Column("attributes", sa.JSON(), nullable=False), sa.Column("confidence", sa.Float(), nullable=False),
        sa.Column("sample_count", sa.Integer(), nullable=False), sa.Column("rebuilt_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False), sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"), sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("user_id", "category", name="uq_user_taste_profile_category"),
    )
    op.create_index("ix_user_taste_profiles_user_category", "user_taste_profiles", ["user_id", "category"])
    op.create_index("ix_user_taste_profiles_user_id", "user_taste_profiles", ["user_id"])


def downgrade() -> None:
    op.drop_table("user_taste_profiles")
    op.drop_table("sensory_profile_baselines")
    op.drop_table("wine_sensory_profiles")
