"""Keep the thumbs users give to the cellar assistant's answers."""

import sqlalchemy as sa

from alembic import op

revision = "0125_assistant_feedback"
down_revision = "0124_drop_pulse_notifications"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "assistant_feedback",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column(
            "household_id",
            sa.Uuid(),
            sa.ForeignKey("households.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "user_id", sa.Uuid(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False
        ),
        sa.Column("rating", sa.String(8), nullable=False),
        sa.Column("question", sa.Text(), nullable=False, server_default=""),
        sa.Column("answer", sa.Text(), nullable=False, server_default=""),
        sa.Column("comment", sa.Text(), nullable=False, server_default=""),
        sa.Column("model", sa.String(80), nullable=False, server_default=""),
        sa.Column("tools_used", sa.JSON(), nullable=False, server_default="[]"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_assistant_feedback_household_id", "assistant_feedback", ["household_id"])
    op.create_index("ix_assistant_feedback_user_id", "assistant_feedback", ["user_id"])
    op.create_index("ix_assistant_feedback_created_at", "assistant_feedback", ["created_at"])


def downgrade() -> None:
    op.drop_table("assistant_feedback")
