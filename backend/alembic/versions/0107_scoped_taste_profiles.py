"""scope and version private taste profiles without discarding legacy data

Revision ID: 0107_scoped_taste_profiles
Revises: 0106_external_wine_tastings
"""

import sqlalchemy as sa

from alembic import op

revision = "0107_scoped_taste_profiles"
down_revision = "0106_external_wine_tastings"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("user_taste_profiles", sa.Column("household_id", sa.Uuid(), nullable=True))
    op.add_column("user_taste_profiles", sa.Column("shadow_dimensions", sa.JSON(), nullable=True))
    op.add_column("user_taste_profiles", sa.Column("shadow_confidence", sa.Float(), nullable=True))
    op.add_column(
        "user_taste_profiles", sa.Column("shadow_calculation_version", sa.Integer(), nullable=True)
    )
    op.create_foreign_key(
        "fk_user_taste_profiles_household",
        "user_taste_profiles",
        "households",
        ["household_id"],
        ["id"],
        ondelete="CASCADE",
    )
    op.create_index(
        "ix_user_taste_profiles_household_id", "user_taste_profiles", ["household_id"]
    )
    op.drop_index("ix_user_taste_profiles_user_category", table_name="user_taste_profiles")
    op.drop_constraint(
        "uq_user_taste_profile_category", "user_taste_profiles", type_="unique"
    )
    op.create_unique_constraint(
        "uq_user_taste_profile_scope",
        "user_taste_profiles",
        ["user_id", "household_id", "category"],
    )
    op.create_index(
        "ix_user_taste_profiles_scope",
        "user_taste_profiles",
        ["user_id", "household_id", "category"],
    )

    op.create_table(
        "user_taste_profile_revisions",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("profile_id", sa.Uuid(), nullable=True),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("household_id", sa.Uuid(), nullable=True),
        sa.Column("category", sa.String(length=24), nullable=False),
        sa.Column("dimensions", sa.JSON(), nullable=False),
        sa.Column("attributes", sa.JSON(), nullable=False),
        sa.Column("confidence", sa.Float(), nullable=False),
        sa.Column("sample_count", sa.Integer(), nullable=False),
        sa.Column("calculation_version", sa.Integer(), nullable=False),
        sa.Column("rebuilt_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("archived_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("archive_reason", sa.String(length=32), nullable=False),
        sa.ForeignKeyConstraint(["profile_id"], ["user_taste_profiles.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["household_id"], ["households.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_user_taste_profile_revisions_user_id",
        "user_taste_profile_revisions",
        ["user_id"],
    )
    op.create_index(
        "ix_user_taste_profile_revisions_household_id",
        "user_taste_profile_revisions",
        ["household_id"],
    )
    op.create_index(
        "ix_user_taste_profile_revisions_scope",
        "user_taste_profile_revisions",
        ["user_id", "household_id", "category", "archived_at"],
    )

    # Keep an exact copy of every pre-migration aggregate. New household-scoped
    # profiles are then rebuilt lazily from the authoritative tasting records.
    op.execute(
        sa.text(
            """
            INSERT INTO user_taste_profile_revisions (
                id, profile_id, user_id, household_id, category, dimensions,
                attributes, confidence, sample_count, calculation_version,
                rebuilt_at, archived_at, archive_reason
            )
            SELECT id, id, user_id, NULL, category, dimensions, attributes,
                   confidence, sample_count, calculation_version, rebuilt_at,
                   CURRENT_TIMESTAMP, 'legacy_migration'
            FROM user_taste_profiles
            """
        )
    )


def downgrade() -> None:
    op.drop_table("user_taste_profile_revisions")
    op.drop_index("ix_user_taste_profiles_scope", table_name="user_taste_profiles")
    op.drop_constraint("uq_user_taste_profile_scope", "user_taste_profiles", type_="unique")
    op.create_unique_constraint(
        "uq_user_taste_profile_category", "user_taste_profiles", ["user_id", "category"]
    )
    op.create_index(
        "ix_user_taste_profiles_user_category",
        "user_taste_profiles",
        ["user_id", "category"],
    )
    op.drop_index("ix_user_taste_profiles_household_id", table_name="user_taste_profiles")
    op.drop_constraint(
        "fk_user_taste_profiles_household", "user_taste_profiles", type_="foreignkey"
    )
    op.drop_column("user_taste_profiles", "shadow_calculation_version")
    op.drop_column("user_taste_profiles", "shadow_confidence")
    op.drop_column("user_taste_profiles", "shadow_dimensions")
    op.drop_column("user_taste_profiles", "household_id")
