"""Persist purchase review and idempotency per household."""

import sqlalchemy as sa

from alembic import op

revision = "0117_purchase_imports"
down_revision = "0116_sensory_refinement"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "purchase_imports",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column(
            "household_id",
            sa.Uuid(),
            sa.ForeignKey("households.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("created_by_user_id", sa.Uuid(), sa.ForeignKey("users.id", ondelete="SET NULL")),
        sa.Column("document_hash", sa.String(64), nullable=False),
        sa.Column("status", sa.String(24), nullable=False),
        sa.Column("draft", sa.JSON(), nullable=False),
        sa.Column("confirmed", sa.JSON(), nullable=False),
        sa.Column("result", sa.JSON(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.UniqueConstraint("household_id", "document_hash"),
    )
    op.create_index("ix_purchase_imports_household_id", "purchase_imports", ["household_id"])


def downgrade() -> None:
    op.drop_table("purchase_imports")
