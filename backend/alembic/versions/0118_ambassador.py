"""Time-limited Ambassador access and separate promotional AI credit wallets."""

import sqlalchemy as sa

from alembic import op

revision = "0118_ambassador"
down_revision = "0117_purchase_imports"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("users", sa.Column("ambassador_until", sa.DateTime(timezone=True), nullable=True))
    op.add_column(
        "users",
        sa.Column("ambassador_credit_wallet", sa.String(64), nullable=False, server_default=""),
    )
    op.add_column(
        "user_ai_credit_transactions",
        sa.Column("wallet", sa.String(64), nullable=False, server_default="standard"),
    )
    op.create_index(
        "ix_user_ai_credit_transactions_wallet", "user_ai_credit_transactions", ["wallet"]
    )


def downgrade() -> None:
    op.drop_index("ix_user_ai_credit_transactions_wallet", table_name="user_ai_credit_transactions")
    op.drop_column("user_ai_credit_transactions", "wallet")
    op.drop_column("users", "ambassador_credit_wallet")
    op.drop_column("users", "ambassador_until")
