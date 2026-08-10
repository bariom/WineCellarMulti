from datetime import UTC, datetime, timedelta

from fastapi.testclient import TestClient
from sqlalchemy import create_engine, select
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.api.routes.wine_news import next_wine_pulse_cycle
from app.core.config import settings
from app.core.legal import LEGAL_DOCUMENT_VERSION
from app.db.base import Base
from app.db.session import get_db
from app.main import app
from app.models import (
    User,
    UserNotification,
    WineNewsArticle,
    WineNewsCollectionRun,
    WineNewsSource,
)
from app.services import wine_news as wine_news_service
from app.services.wine_news import (
    FeedEntry,
    collect_wine_news,
    notify_wine_pulse_edition,
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


def test_next_wine_pulse_cycle_reports_scheduled_window(monkeypatch):
    monkeypatch.setattr(settings, "wine_pulse_enabled", True)
    monkeypatch.setattr(settings, "wine_pulse_schedule_hours", "5,13,21")
    monkeypatch.setattr(settings, "wine_pulse_schedule_minute", 20)
    monkeypatch.setattr(settings, "wine_pulse_schedule_timezone", "Europe/Zurich")
    monkeypatch.setattr(settings, "wine_pulse_random_delay_minutes", 15)

    cycle = next_wine_pulse_cycle(datetime(2026, 8, 10, 10, 0, tzinfo=UTC))

    assert cycle == {
        "scheduled_from": "2026-08-10T11:20:00+00:00",
        "scheduled_to": "2026-08-10T11:35:00+00:00",
        "timezone": "Europe/Zurich",
        "random_delay_minutes": 15,
    }


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
            "Le condizioni recenti migliorano le prospettive. I produttori restano prudenti."
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

        assert refresh_publication_selection(db) == []


def test_first_edition_uses_a_seven_day_bootstrap_window():
    with TestingSessionLocal() as db:
        source = WineNewsSource(
            id="bootstrap-source",
            name="Bootstrap Journal",
            feed_url="https://example.com/bootstrap-feed",
            website_url="https://example.com",
            language="en",
            enabled=True,
        )
        db.add(source)
        article = WineNewsArticle(
            source_id=source.id,
            canonical_url="https://example.com/bootstrap-story",
            original_title="A recent editorial wine story",
            source_language="en",
            source_published_at=datetime.now(UTC) - timedelta(days=3),
            content_fingerprint="bootstrap-fingerprint",
            importance_score=90,
            status="candidate",
            ai_processed_at=datetime.now(UTC),
        )
        db.add(article)
        db.commit()

        assert len(refresh_publication_selection(db)) == 1
        assert article.status == "published"


def test_later_editions_use_a_seventy_two_hour_window():
    with TestingSessionLocal() as db:
        source = WineNewsSource(
            id="rolling-source",
            name="Rolling Journal",
            feed_url="https://example.com/rolling-feed",
            website_url="https://example.com",
            language="en",
            enabled=True,
        )
        db.add(source)
        db.add(
            WineNewsArticle(
                source_id=source.id,
                canonical_url="https://example.com/older-published-story",
                original_title="An earlier published wine story",
                source_language="en",
                source_published_at=datetime.now(UTC) - timedelta(days=5),
                content_fingerprint="older-published-fingerprint",
                importance_score=91,
                status="published",
                ai_processed_at=datetime.now(UTC),
            )
        )
        article = WineNewsArticle(
            source_id=source.id,
            canonical_url="https://example.com/two-day-story",
            original_title="A two-day-old wine story",
            source_language="en",
            source_published_at=datetime.now(UTC) - timedelta(days=2),
            content_fingerprint="two-day-fingerprint",
            importance_score=89,
            status="candidate",
            ai_processed_at=datetime.now(UTC),
        )
        db.add(article)
        db.commit()

        assert len(refresh_publication_selection(db)) == 1
        assert article.status == "published"


def test_wine_pulse_notifications_are_localized_and_rate_limited():
    with TestingSessionLocal() as db:
        italian_user = User(
            email="pulse-it@example.com",
            display_name="Lettore italiano",
            password_hash="hash",
            locale="it",
            is_approved=True,
            is_blocked=False,
        )
        english_user = User(
            email="pulse-en@example.com",
            display_name="English reader",
            password_hash="hash",
            locale="en",
            is_approved=True,
            is_blocked=False,
        )
        blocked_user = User(
            email="pulse-blocked@example.com",
            display_name="Blocked reader",
            password_hash="hash",
            locale="it",
            is_approved=True,
            is_blocked=True,
        )
        run = WineNewsCollectionRun(started_at=datetime.now(UTC), status="completed", stats={})
        db.add_all([italian_user, english_user, blocked_user, run])
        db.commit()

        assert notify_wine_pulse_edition(db, run, published_count=3) == 2
        db.commit()
        notifications = db.scalars(select(UserNotification).order_by(UserNotification.title)).all()
        assert len(notifications) == 2
        assert {notification.action_url for notification in notifications} == {"/pulse"}
        assert any(
            notification.title == "Wine Pulse \u00e8 aggiornato" for notification in notifications
        )
        assert any(notification.title == "Wine Pulse is updated" for notification in notifications)
        assert all("3" in notification.message for notification in notifications)

        next_run = WineNewsCollectionRun(started_at=datetime.now(UTC), status="completed", stats={})
        db.add(next_run)
        db.commit()
        assert notify_wine_pulse_edition(db, next_run, published_count=2) == 0


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
