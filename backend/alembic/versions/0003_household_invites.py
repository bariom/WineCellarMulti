"""household invites

Revision ID: 0003_household_invites
Revises: 0002_auth_sessions
Create Date: 2026-05-29 13:00:00
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = "0003_household_invites"
down_revision = "0002_auth_sessions"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "household_invites",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column("household_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("invited_by_user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("email", sa.String(length=320), nullable=False),
        sa.Column("role", sa.String(length=32), nullable=False),
        sa.Column("token_hash", sa.String(length=128), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("accepted_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["household_id"], ["households.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["invited_by_user_id"], ["users.id"], ondelete="CASCADE"),
    )
    op.create_index("ix_household_invites_household_id", "household_invites", ["household_id"], unique=False)
    op.create_index("ix_household_invites_email", "household_invites", ["email"], unique=False)
    op.create_index("ix_household_invites_token_hash", "household_invites", ["token_hash"], unique=True)
    op.create_index("ix_household_invites_expires_at", "household_invites", ["expires_at"], unique=False)


def downgrade() -> None:
    op.drop_index("ix_household_invites_expires_at", table_name="household_invites")
    op.drop_index("ix_household_invites_token_hash", table_name="household_invites")
    op.drop_index("ix_household_invites_email", table_name="household_invites")
    op.drop_index("ix_household_invites_household_id", table_name="household_invites")
    op.drop_table("household_invites")
