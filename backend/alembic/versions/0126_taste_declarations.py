"""Keep the taste preferences a user states in their own words."""

import sqlalchemy as sa

from alembic import op

revision = "0126_taste_declarations"
down_revision = "0125_assistant_feedback"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "user_taste_declarations",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column(
            "user_id", sa.Uuid(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False
        ),
        sa.Column("answers", sa.JSON(), nullable=False, server_default="{}"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.UniqueConstraint("user_id", name="uq_user_taste_declaration_user"),
    )


def downgrade() -> None:
    op.drop_table("user_taste_declarations")
