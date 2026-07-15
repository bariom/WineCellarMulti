"""add co-ownership payment ledger

Revision ID: 0050_coownership_payments
Revises: 0049_normalize_tastings
"""

import sqlalchemy as sa

from alembic import op


revision = "0050_coownership_payments"
down_revision = "0049_normalize_tastings"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "coownership_payments",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("agreement_id", sa.Uuid(), nullable=False),
        sa.Column("participant_id", sa.Uuid(), nullable=False),
        sa.Column("recorded_by_user_id", sa.Uuid(), nullable=True),
        sa.Column("amount", sa.Numeric(precision=12, scale=2), nullable=False),
        sa.Column("currency", sa.String(length=8), nullable=False),
        sa.Column("paid_on", sa.Date(), nullable=False),
        sa.Column("note", sa.String(length=500), nullable=False, server_default=""),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("voided_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("voided_by_user_id", sa.Uuid(), nullable=True),
        sa.CheckConstraint("amount > 0", name="ck_coownership_payment_positive_amount"),
        sa.ForeignKeyConstraint(["agreement_id"], ["coownership_agreements.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["participant_id"], ["coownership_participants.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["recorded_by_user_id"], ["users.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["voided_by_user_id"], ["users.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_coownership_payments_agreement_id", "coownership_payments", ["agreement_id"])
    op.create_index("ix_coownership_payments_participant_id", "coownership_payments", ["participant_id"])
    op.create_index("ix_coownership_payments_recorded_by_user_id", "coownership_payments", ["recorded_by_user_id"])
    op.create_index(
        "ix_coownership_payments_participant_paid_on",
        "coownership_payments",
        ["participant_id", "paid_on"],
    )


def downgrade() -> None:
    op.drop_index("ix_coownership_payments_participant_paid_on", table_name="coownership_payments")
    op.drop_index("ix_coownership_payments_recorded_by_user_id", table_name="coownership_payments")
    op.drop_index("ix_coownership_payments_participant_id", table_name="coownership_payments")
    op.drop_index("ix_coownership_payments_agreement_id", table_name="coownership_payments")
    op.drop_table("coownership_payments")
