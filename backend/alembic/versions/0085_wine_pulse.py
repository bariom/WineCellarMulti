"""add autonomous Wine Pulse news archive

Revision ID: 0085_wine_pulse
Revises: 0084_map_place_cache
"""

import sqlalchemy as sa

from alembic import op

revision = "0085_wine_pulse"
down_revision = "0084_map_place_cache"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "wine_news_sources",
        sa.Column("id", sa.String(length=80), primary_key=True),
        sa.Column("name", sa.String(length=160), nullable=False),
        sa.Column("feed_url", sa.String(length=1000), nullable=False, unique=True),
        sa.Column("website_url", sa.String(length=500), nullable=False),
        sa.Column("language", sa.String(length=8), nullable=False),
        sa.Column("enabled", sa.Boolean(), nullable=False),
        sa.Column("etag", sa.String(length=500), nullable=False),
        sa.Column("last_modified", sa.String(length=200), nullable=False),
        sa.Column("last_attempt_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("last_success_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("last_error", sa.Text(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_wine_news_sources_language", "wine_news_sources", ["language"])

    op.create_table(
        "wine_news_articles",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column(
            "source_id",
            sa.String(length=80),
            sa.ForeignKey("wine_news_sources.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("canonical_url", sa.String(length=1500), nullable=False),
        sa.Column("original_title", sa.Text(), nullable=False),
        sa.Column("original_summary", sa.Text(), nullable=False),
        sa.Column("source_language", sa.String(length=8), nullable=False),
        sa.Column("source_published_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("discovered_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("image_url", sa.String(length=1500), nullable=False),
        sa.Column("content_fingerprint", sa.String(length=64), nullable=False),
        sa.Column("story_cluster", sa.String(length=100), nullable=False),
        sa.Column("status", sa.String(length=20), nullable=False),
        sa.Column("category", sa.String(length=40), nullable=False),
        sa.Column("importance_score", sa.Integer(), nullable=False),
        sa.Column("wine_relevance", sa.Integer(), nullable=False),
        sa.Column("general_interest", sa.Integer(), nullable=False),
        sa.Column("commerciality", sa.Integer(), nullable=False),
        sa.Column("local_scope", sa.Integer(), nullable=False),
        sa.Column("confidence", sa.Integer(), nullable=False),
        sa.Column("headline_it", sa.Text(), nullable=False),
        sa.Column("headline_en", sa.Text(), nullable=False),
        sa.Column("summary_it", sa.Text(), nullable=False),
        sa.Column("summary_en", sa.Text(), nullable=False),
        sa.Column("rejection_reason", sa.String(length=240), nullable=False),
        sa.Column("ai_model", sa.String(length=120), nullable=False),
        sa.Column("ai_processed_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index("ix_wine_news_articles_source_id", "wine_news_articles", ["source_id"])
    op.create_index(
        "uq_wine_news_articles_canonical_url", "wine_news_articles", ["canonical_url"], unique=True
    )
    op.create_index(
        "ix_wine_news_articles_status_published",
        "wine_news_articles",
        ["status", "source_published_at"],
    )
    op.create_index(
        "ix_wine_news_articles_fingerprint", "wine_news_articles", ["content_fingerprint"]
    )
    op.create_index(
        "ix_wine_news_articles_category_score",
        "wine_news_articles",
        ["category", "importance_score"],
    )
    op.create_index(
        "ix_wine_news_articles_source_language", "wine_news_articles", ["source_language"]
    )
    op.create_index(
        "ix_wine_news_articles_source_published_at", "wine_news_articles", ["source_published_at"]
    )
    op.create_index("ix_wine_news_articles_story_cluster", "wine_news_articles", ["story_cluster"])
    op.create_index("ix_wine_news_articles_status", "wine_news_articles", ["status"])
    op.create_index("ix_wine_news_articles_category", "wine_news_articles", ["category"])

    op.create_table(
        "wine_news_collection_runs",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("status", sa.String(length=20), nullable=False),
        sa.Column("stats", sa.JSON(), nullable=False),
        sa.Column("error", sa.Text(), nullable=False),
    )
    op.create_index(
        "ix_wine_news_collection_runs_started_at", "wine_news_collection_runs", ["started_at"]
    )


def downgrade() -> None:
    op.drop_table("wine_news_collection_runs")
    op.drop_table("wine_news_articles")
    op.drop_table("wine_news_sources")
