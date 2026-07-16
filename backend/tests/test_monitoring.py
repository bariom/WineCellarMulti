from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.core.config import settings
from app.db.base import Base
from app.db.session import get_db
from app.main import app
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
