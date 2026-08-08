from datetime import UTC, datetime

from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.core.legal import LEGAL_DOCUMENT_VERSION
from app.db.base import Base
from app.db.session import get_db
from app.main import app
from app.models import WineNewsArticle, WineNewsSource
from app.services import wine_news as wine_news_service
from app.services.wine_news import (
    FeedEntry,
    collect_wine_news,
    parse_feed,
    refresh_publication_selection,
)

engine = create_engine(
    "sqlite+pysqlite:///:memory:",
    connect_args={"check_same_thread": False},
    poolclass=StaticPool,
)
TestingSessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)


def override_get_db():
    db = TestingSessionLocal()
    try:
        yield db
    finally:
        db.close()


def setup_function():
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)
    app.dependency_overrides[get_db] = override_get_db


def teardown_function():
    app.dependency_overrides.clear()


def register(client: TestClient):
    return client.post(
        "/api/v1/auth/register",
        json={
            "email": "pulse@example.com",
            "display_name": "Pulse Reader",
            "password": "strong-password-1",
            "household_name": "Pulse Cellar",
            "locale": "it",
            "legal_document_version": LEGAL_DOCUMENT_VERSION,
            "privacy_policy_accepted": True,
            "terms_accepted": True,
            "photo_usage_disclaimer_accepted": True,
        },
    )


def editorial_decision(*_args):
    return {
        "wine_relevance": 96,
        "general_interest": 88,
        "commerciality": 4,
        "local_scope": 12,
        "confidence": 94,
        "category": "regions_vintages",
        "publish": True,
        "rejection_reason": "",
        "headline_it": "La vendemmia di Bordeaux mostra segnali incoraggianti",
        "headline_en": "Bordeaux harvest shows encouraging signs",
        "summary_it": (
            "Le condizioni recenti migliorano le prospettive. "
            "I produttori restano prudenti."
        ),
        "summary_en": "Recent conditions improved the outlook. Producers remain cautious.",
        "ai_model": "gpt-5.6-luna",
        "_input_tokens": 120,
        "_output_tokens": 80,
    }


def test_parse_rss_and_remove_tracking_parameters():
    payload = b"""<?xml version="1.0"?>
    <rss version="2.0"><channel><item>
      <title>Bordeaux harvest outlook improves</title>
      <link>https://example.com/story?utm_source=rss&amp;edition=global</link>
      <description><![CDATA[Wine producers report better vineyard conditions.]]></description>
      <pubDate>Fri, 08 Aug 2026 09:00:00 GMT</pubDate>
    </item></channel></rss>"""
    entries = parse_feed(payload, base_url="https://example.com/feed")
    assert len(entries) == 1
    assert entries[0].url == "https://example.com/story?edition=global"
    assert entries[0].published_at == datetime(2026, 8, 8, 9, tzinfo=UTC)
    assert entries[0].summary == "Wine producers report better vineyard conditions."


def test_collector_publishes_curated_article(monkeypatch):
    with TestingSessionLocal() as db:
        source = WineNewsSource(
            id="test-source",
            name="Test Wine Journal",
            feed_url="https://example.com/feed",
            website_url="https://example.com",
            language="en",
            enabled=True,
        )
        db.add(source)
        db.commit()
        monkeypatch.setattr(wine_news_service, "sync_sources", lambda _db: [source])
        monkeypatch.setattr(
            wine_news_service,
            "fetch_source",
            lambda _source: (
                [
                    FeedEntry(
                        url="https://example.com/bordeaux-2026",
                        title="Bordeaux wine harvest outlook improves",
                        summary="Wine producers report improving conditions across the vineyards.",
                        published_at=datetime.now(UTC),
                    )
                ],
                "etag-1",
                "",
                False,
            ),
        )
        run = collect_wine_news(db, classifier=editorial_decision)
        assert run.status == "completed"
        assert run.stats["published"] == 1
        assert run.stats["ai_input_tokens"] == 120


def test_publication_selection_excludes_unprocessed_candidates():
    with TestingSessionLocal() as db:
        source = WineNewsSource(
            id="pending-source",
            name="Pending Journal",
            feed_url="https://example.com/pending-feed",
            website_url="https://example.com",
            language="en",
            enabled=True,
        )
        db.add(source)
        db.add(
            WineNewsArticle(
                source_id=source.id,
                canonical_url="https://example.com/pending-story",
                original_title="A pending wine story",
                source_language="en",
                source_published_at=datetime.now(UTC),
                content_fingerprint="pending-fingerprint",
                importance_score=100,
                status="candidate",
            )
        )
        db.commit()

        assert refresh_publication_selection(db) == 0


def test_authenticated_feed_returns_localized_editorial_copy(monkeypatch):
    test_collector_publishes_curated_article(monkeypatch)
    with TestClient(app) as client:
        assert register(client).status_code == 201
        response = client.get("/api/v1/wine-pulse?locale=it")
        assert response.status_code == 200
        payload = response.json()
        assert payload["total"] == 1
        assert payload["items"][0]["headline"].startswith("La vendemmia")
        assert payload["items"][0]["source"] == "Test Wine Journal"
