from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.core.config import settings
from app.core.legal import LEGAL_DOCUMENT_VERSION
from app.db.base import Base
from app.db.session import get_db
from app.main import (
    app,
    is_application_request,
    is_interactive_application_request,
    user_activity_action,
)
from app.services import operational_alerts, operational_metrics
from app.services.request_metrics import request_metrics

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


def test_technical_operations_requests_are_excluded_from_application_latency():
    assert is_application_request("/api/v1/wines") is True
    assert is_application_request("/api/v1/admin/operations/collect") is False
    assert is_application_request("/api/v1/admin/operations/overview") is False
    assert is_application_request("/api/v1/monitoring/application") is False
    assert is_interactive_application_request("/api/v1/wines") is True
    assert is_interactive_application_request("/api/v1/ai/wines/test/value") is False
    assert is_interactive_application_request("/api/v1/imports/json") is False
    assert is_interactive_application_request("/api/v1/wines/photo/process") is False
    assert is_interactive_application_request("/api/v1/map/places") is False


def test_latency_alert_requires_a_representative_interactive_sample():
    system = {"host": {"cpu_percent": 20, "memory": {"percent": 20}, "disk": {"percent": 30}}}
    sparse = operational_alerts.detected_alerts(
        system,
        {"interactive_p95_duration_ms": 9_909, "interactive_requests_recent": 4},
    )
    representative = operational_alerts.detected_alerts(
        system,
        {"interactive_p95_duration_ms": 9_909, "interactive_requests_recent": 20},
    )

    assert all(alert.metric != "latency" for alert in sparse)
    assert any(alert.metric == "latency" and alert.severity == "critical" for alert in representative)


def test_user_activity_actions_identify_specific_features():
    assert user_activity_action("POST", "/api/v1/wines/photo/process") == "wine_photo_ai_cutout"
    assert user_activity_action("POST", "/api/v1/wines/photo/warmup") is None
    assert (
        user_activity_action("POST", "/api/v1/wines/catalog/recognize-bottle")
        == "wine_label_recognition"
    )
    assert (
        user_activity_action("POST", "/api/v1/ai/wishlist/portfolio-strategy")
        == "ai_wishlist_analysis"
    )
    assert user_activity_action("POST", "/api/v1/billing/checkout") == "billing_checkout_started"
    assert user_activity_action("POST", "/api/v1/notifications/item/read") == "notification_read"


def test_operational_alerts_notify_once_and_send_a_recovery(monkeypatch):
    deliveries: list[dict[str, object]] = []
    monkeypatch.setattr(
        operational_alerts,
        "send_email",
        lambda **kwargs: deliveries.append(kwargs) or True,
    )
    db = TestingSessionLocal()
    try:
        from app.models import User

        db.add(
            User(
                email="admin@example.com",
                display_name="Admin",
                password_hash="not-used",
                is_approved=True,
                is_app_admin=True,
                is_blocked=False,
            )
        )
        db.commit()
        high_system = {
            "host": {"cpu_percent": 91, "memory": {"percent": 20}, "disk": {"percent": 30}},
            "conntrack": {"count": 10, "max": 100},
        }
        normal_system = {
            "host": {"cpu_percent": 20, "memory": {"percent": 20}, "disk": {"percent": 30}},
            "conntrack": {"count": 10, "max": 100},
        }

        operational_alerts.evaluate_operational_alerts(db, system=high_system, application={})
        db.commit()
        operational_alerts.evaluate_operational_alerts(db, system=high_system, application={})
        db.commit()
        operational_alerts.evaluate_operational_alerts(db, system=normal_system, application={})
        db.commit()

        assert len(deliveries) == 2
        assert deliveries[0]["recipients"] == ["admin@example.com"]
        assert "CPU: 91% (CRITICA)" in str(deliveries[0]["body"])
        assert "Rientro operativo" in str(deliveries[1]["subject"])
    finally:
        db.close()


def test_monitoring_endpoints_require_a_dedicated_token(monkeypatch):
    monkeypatch.setattr(settings, "monitoring_api_token", "monitoring-test-token")
    client = TestClient(app)
    initial_metrics = request_metrics.snapshot()

    assert client.get("/api/v1/monitoring/business").status_code == 401

    registered = client.post(
        "/api/v1/auth/register",
        json={
            "email": "owner@example.com",
            "display_name": "Cellar Owner",
            "password": "strong-password-1",
            "household_name": "Main Cellar",
            "locale": "it",
            "legal_document_version": LEGAL_DOCUMENT_VERSION,
            "privacy_policy_accepted": True,
            "terms_accepted": True,
            "photo_usage_disclaimer_accepted": True,
        },
    )
    assert registered.status_code == 201
    assert client.post("/api/v1/wines", json={"name": "Barolo", "quantity": 6}).status_code == 201

    headers = {"Authorization": "Bearer monitoring-test-token"}
    business = client.get("/api/v1/monitoring/business", headers=headers)
    assert business.status_code == 200
    assert business.json() == {
        "users_total": 1,
        "users_approved": 1,
        "users_blocked": 0,
        "households_total": 1,
        "wines_total": 1,
        "bottles_total": 6,
    }

    application = client.get("/api/v1/monitoring/application", headers=headers)
    assert application.status_code == 200
    assert application.json()["requests_total"] >= initial_metrics["requests_total"] + 2
    assert application.json()["errors_total"] == initial_metrics["errors_total"]

    system = client.get("/api/v1/monitoring/system", headers=headers)
    assert system.status_code == 200
    assert system.json()["host"]["memory"]["total_bytes"] > 0


def test_linux_tcp_connection_counts_reads_procfs_without_psutil(monkeypatch, tmp_path):
    tcp = tmp_path / "tcp"
    tcp6 = tmp_path / "tcp6"
    tcp.write_text("header\n0: local remote 01\n1: local remote 06\n", encoding="utf-8")
    tcp6.write_text("header\n0: local remote 01\n", encoding="utf-8")
    original_path = operational_metrics.Path

    def proc_path(path: str):
        return original_path({"/proc/net/tcp": tcp, "/proc/net/tcp6": tcp6}.get(path, path))

    monkeypatch.setattr(operational_metrics, "Path", proc_path)
    monkeypatch.setattr(
        operational_metrics.psutil,
        "net_connections",
        lambda **_kwargs: (_ for _ in ()).throw(AssertionError("psutil fallback should not run")),
    )

    assert operational_metrics._tcp_connection_counts() == {
        "tcp_established": 2,
        "tcp_time_wait": 1,
        "tcp_total": 3,
    }
