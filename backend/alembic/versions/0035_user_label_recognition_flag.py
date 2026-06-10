"""user label recognition flag

Revision ID: 0035_user_label_recognition_flag
Revises: 0034_trial_redeem_codes
Create Date: 2026-06-10
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa


revision = "0035_user_label_recognition_flag"
down_revision = "0034_trial_redeem_codes"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("users", sa.Column("can_use_label_recognition", sa.Boolean(), nullable=False, server_default=sa.false()))
    op.alter_column("users", "can_use_label_recognition", server_default=None)


def downgrade() -> None:
    op.drop_column("users", "can_use_label_recognition")
