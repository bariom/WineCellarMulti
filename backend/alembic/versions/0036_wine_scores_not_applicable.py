"""wine scores not applicable

Revision ID: 0036_wine_scores_not_applicable
Revises: 0035_user_label_recognition_flag
Create Date: 2026-07-07
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa


revision = "0036_wine_scores_not_applicable"
down_revision = "0035_user_label_recognition_flag"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("wines", sa.Column("scores_not_applicable", sa.Boolean(), nullable=False, server_default=sa.false()))
    op.alter_column("wines", "scores_not_applicable", server_default=None)


def downgrade() -> None:
    op.drop_column("wines", "scores_not_applicable")
