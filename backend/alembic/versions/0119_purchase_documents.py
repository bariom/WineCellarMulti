"""Archive original purchase documents and link them to wines."""

import sqlalchemy as sa

from alembic import op

revision = "0119_purchase_documents"
down_revision = "0118_ambassador"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "purchase_imports",
        sa.Column("document_name", sa.String(200), nullable=False, server_default=""),
    )
    op.add_column(
        "purchase_imports",
        sa.Column("document_mime", sa.String(64), nullable=False, server_default=""),
    )
    op.add_column(
        "purchase_imports",
        sa.Column("document_size", sa.Integer(), nullable=False, server_default="0"),
    )
    op.create_table(
        "purchase_document_wines",
        sa.Column(
            "purchase_import_id",
            sa.Uuid(),
            sa.ForeignKey("purchase_imports.id", ondelete="CASCADE"),
            primary_key=True,
        ),
        sa.Column(
            "wine_id", sa.Uuid(), sa.ForeignKey("wines.id", ondelete="CASCADE"), primary_key=True
        ),
        sa.Column(
            "household_id",
            sa.Uuid(),
            sa.ForeignKey("households.id", ondelete="CASCADE"),
            nullable=False,
        ),
    )
    op.create_index(
        "ix_purchase_document_wines_household_id", "purchase_document_wines", ["household_id"]
    )
    op.create_index("ix_purchase_document_wines_wine_id", "purchase_document_wines", ["wine_id"])


def downgrade() -> None:
    op.drop_table("purchase_document_wines")
    op.drop_column("purchase_imports", "document_size")
    op.drop_column("purchase_imports", "document_mime")
    op.drop_column("purchase_imports", "document_name")
