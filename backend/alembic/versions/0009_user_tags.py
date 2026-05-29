"""user tags

Revision ID: 0009_user_tags
Revises: 0008_encrypt_user_ai_keys
Create Date: 2026-05-29 23:00:00
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = "0009_user_tags"
down_revision = "0008_encrypt_user_ai_keys"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "user_tags",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("name", sa.String(length=80), nullable=False),
        sa.Column("color", sa.String(length=16), nullable=False, server_default=""),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.UniqueConstraint("user_id", "name", name="uq_user_tags_user_name"),
    )
    op.create_index(op.f("ix_user_tags_user_id"), "user_tags", ["user_id"])

    op.create_table(
        "user_wine_tags",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("wine_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("tag_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["wine_id"], ["wines.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["tag_id"], ["user_tags.id"], ondelete="CASCADE"),
        sa.UniqueConstraint("user_id", "wine_id", "tag_id", name="uq_user_wine_tags_user_wine_tag"),
    )
    op.create_index(op.f("ix_user_wine_tags_user_id"), "user_wine_tags", ["user_id"])
    op.create_index(op.f("ix_user_wine_tags_wine_id"), "user_wine_tags", ["wine_id"])
    op.create_index(op.f("ix_user_wine_tags_tag_id"), "user_wine_tags", ["tag_id"])


def downgrade() -> None:
    op.drop_index(op.f("ix_user_wine_tags_tag_id"), table_name="user_wine_tags")
    op.drop_index(op.f("ix_user_wine_tags_wine_id"), table_name="user_wine_tags")
    op.drop_index(op.f("ix_user_wine_tags_user_id"), table_name="user_wine_tags")
    op.drop_table("user_wine_tags")
    op.drop_index(op.f("ix_user_tags_user_id"), table_name="user_tags")
    op.drop_table("user_tags")
