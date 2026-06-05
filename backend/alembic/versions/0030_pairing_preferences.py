"""pairing preferences

Revision ID: 0030_pairing_preferences
Revises: 0029_notification_fingerprint
Create Date: 2026-06-05
"""

from alembic import op
import sqlalchemy as sa


revision = "0030_pairing_preferences"
down_revision = "0029_notification_fingerprint"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("user_ai_settings", sa.Column("pairing_preferences", sa.Text(), nullable=False, server_default=""))
    op.alter_column("user_ai_settings", "pairing_preferences", server_default=None)


def downgrade() -> None:
    op.drop_column("user_ai_settings", "pairing_preferences")
