"""redeem code encrypted value

Revision ID: 0020_redeem_code_encrypted_value
Revises: 0019_wine_value_history
Create Date: 2026-06-01 00:00:00.000000
"""

from alembic import op
import sqlalchemy as sa


revision = "0020_redeem_code_encrypted_value"
down_revision = "0019_wine_value_history"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("redeem_codes", sa.Column("encrypted_code", sa.String(length=512), nullable=False, server_default=""))
    op.alter_column("redeem_codes", "encrypted_code", server_default=None)


def downgrade() -> None:
    op.drop_column("redeem_codes", "encrypted_code")
