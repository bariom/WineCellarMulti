"""Keep per-dimension evidence when applying a completed sensory profile."""

import sqlalchemy as sa

from alembic import op

revision = "0115_sensory_provenance"
down_revision = "0114_sensory_agent"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "wine_sensory_profiles",
        sa.Column("provenance", sa.JSON(), nullable=False, server_default="{}"),
    )


def downgrade() -> None:
    with op.batch_alter_table("wine_sensory_profiles") as batch:
        batch.drop_column("provenance")
