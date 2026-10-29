"""An event guest who looks at the demo can come back: the demo session remembers them."""

import sqlalchemy as sa

from alembic import op

revision = "0130_session_resume_user"
down_revision = "0129_demo_events"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "user_sessions",
        sa.Column(
            "resume_user_id",
            sa.Uuid(),
            sa.ForeignKey("users.id", ondelete="SET NULL"),
            nullable=True,
        ),
    )


def downgrade() -> None:
    op.drop_column("user_sessions", "resume_user_id")
