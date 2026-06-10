"""trial redeem codes

Revision ID: 0034_trial_redeem_codes
Revises: 0033_email_verification
Create Date: 2026-06-10
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa


revision = "0034_trial_redeem_codes"
down_revision = "0033_email_verification"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("redeem_codes", sa.Column("kind", sa.String(length=32), nullable=False, server_default="standard"))
    op.alter_column("redeem_codes", "kind", server_default=None)
    op.create_index(op.f("ix_redeem_codes_kind"), "redeem_codes", ["kind"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_redeem_codes_kind"), table_name="redeem_codes")
    op.drop_column("redeem_codes", "kind")
