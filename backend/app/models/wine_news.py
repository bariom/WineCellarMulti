from __future__ import annotations

import uuid
from datetime import UTC, datetime

from sqlalchemy import JSON, DateTime, ForeignKey, Index, Integer, String, Text, Uuid
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class WineNewsSource(Base):
    __tablename__ = "wine_news_sources"

    id: Mapped[str] = mapped_column(String(80), primary_key=True)
    name: Mapped[str] = mapped_column(String(160))
    feed_url: Mapped[str] = mapped_column(String(1000), unique=True)
    website_url: Mapped[str] = mapped_column(String(500), default="")
    language: Mapped[str] = mapped_column(String(8), index=True)
    enabled: Mapped[bool] = mapped_column(default=True)
    etag: Mapped[str] = mapped_column(String(500), default="")
    last_modified: Mapped[str] = mapped_column(String(200), default="")
    last_attempt_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    last_success_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    last_error: Mapped[str] = mapped_column(Text, default="")
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(UTC)
    )


class WineNewsArticle(Base):
    __tablename__ = "wine_news_articles"
    __table_args__ = (
        Index("uq_wine_news_articles_canonical_url", "canonical_url", unique=True),
        Index("ix_wine_news_articles_status_published", "status", "source_published_at"),
        Index("ix_wine_news_articles_fingerprint", "content_fingerprint"),
        Index("ix_wine_news_articles_category_score", "category", "importance_score"),
    )

    id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4)
    source_id: Mapped[str] = mapped_column(
        ForeignKey("wine_news_sources.id", ondelete="CASCADE"), index=True
    )
    canonical_url: Mapped[str] = mapped_column(String(1500))
    original_title: Mapped[str] = mapped_column(Text)
    original_summary: Mapped[str] = mapped_column(Text, default="")
    source_language: Mapped[str] = mapped_column(String(8), index=True)
    source_published_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)
    discovered_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(UTC)
    )
    image_url: Mapped[str] = mapped_column(String(1500), default="")
    content_fingerprint: Mapped[str] = mapped_column(String(64))
    story_cluster: Mapped[str] = mapped_column(String(100), default="", index=True)
    status: Mapped[str] = mapped_column(String(20), default="candidate", index=True)
    category: Mapped[str] = mapped_column(String(40), default="wine_world", index=True)
    importance_score: Mapped[int] = mapped_column(Integer, default=0)
    wine_relevance: Mapped[int] = mapped_column(Integer, default=0)
    general_interest: Mapped[int] = mapped_column(Integer, default=0)
    commerciality: Mapped[int] = mapped_column(Integer, default=0)
    local_scope: Mapped[int] = mapped_column(Integer, default=0)
    confidence: Mapped[int] = mapped_column(Integer, default=0)
    headline_it: Mapped[str] = mapped_column(Text, default="")
    headline_en: Mapped[str] = mapped_column(Text, default="")
    summary_it: Mapped[str] = mapped_column(Text, default="")
    summary_en: Mapped[str] = mapped_column(Text, default="")
    rejection_reason: Mapped[str] = mapped_column(String(240), default="")
    ai_model: Mapped[str] = mapped_column(String(120), default="")
    ai_processed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class WineNewsCollectionRun(Base):
    __tablename__ = "wine_news_collection_runs"

    id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4)
    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    status: Mapped[str] = mapped_column(String(32), default="running")
    stats: Mapped[dict] = mapped_column(JSON, default=dict)
    error: Mapped[str] = mapped_column(Text, default="")
