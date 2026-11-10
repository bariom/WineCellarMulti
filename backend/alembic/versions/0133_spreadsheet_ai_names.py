"""Count the spreadsheet-import names a household had split by AI."""

import sqlalchemy as sa

from alembic import op

revision = "0133_spreadsheet_ai_names"
down_revision = "0132_spreadsheet_import_maps"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "households",
        sa.Column("spreadsheet_ai_names_used", sa.Integer(), nullable=False, server_default="0"),
    )


def downgrade() -> None:
    op.drop_column("households", "spreadsheet_ai_names_used")
