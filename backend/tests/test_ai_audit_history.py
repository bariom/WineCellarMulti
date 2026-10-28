from datetime import UTC, datetime, timedelta
from uuid import uuid4

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import Session
from sqlalchemy.pool import StaticPool

from app.api.deps import CurrentContext, require_write_context
from app.api.routes import ai as ai_routes
from app.db.base import Base
from app.db.session import get_db
from app.models import AiAuditLog, Household, Membership, User, UserSession


@pytest.fixture
def env():
    engine = create_engine(
        "sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool
    )
    Base.metadata.create_all(engine)
    with Session(engine, expire_on_commit=False) as db:
        mine = Household(name="My cellar")
        other = Household(name="Other cellar")
        user = User(email="owner@example.test", display_name="Owner", password_hash="unused")
        db.add_all([mine, other, user])
        db.flush()
        membership = Membership(user_id=user.id, household_id=mine.id, role="owner")
        db.add(membership)
        db.commit()
        context = CurrentContext(
            user=user,
            household=mine,
            membership=membership,
            session=UserSession(
                user_id=user.id,
                active_household_id=mine.id,
                token_hash="test",
                expires_at=datetime.now(UTC) + timedelta(days=1),
            ),
        )
        app = FastAPI()
        app.include_router(ai_routes.router, prefix="/api/v1")
        app.dependency_overrides[get_db] = lambda: db
        app.dependency_overrides[require_write_context] = lambda: context
        with TestClient(app) as client:
            yield db, mine, other, client
    engine.dispose()


def audit(household: Household, wine_id, feature: str, days_ago: float) -> AiAuditLog:
    return AiAuditLog(
        household_id=household.id,
        entity_type="wine",
        entity_id=wine_id,
        feature=feature,
        summary=feature,
        created_at=datetime.now(UTC) - timedelta(days=days_ago),
    )


def test_a_wine_keeps_its_audit_after_newer_ai_calls_on_other_wines(env):
    db, mine, other, client = env
    old_wine, busy_wine = uuid4(), uuid4()
    db.add(audit(mine, old_wine, "ai_value", days_ago=6))
    db.add_all(audit(mine, busy_wine, f"notes-{index}", days_ago=index / 10) for index in range(35))
    # Another cellar's record for the same id must never leak in.
    db.add(audit(other, old_wine, "other-cellar", days_ago=1))
    db.commit()

    recent = client.get("/api/v1/ai/audit")
    assert recent.status_code == 200
    assert len(recent.json()) == 30
    assert all(entry["entity_id"] != str(old_wine) for entry in recent.json())

    history = client.get(
        "/api/v1/ai/audit", params={"entity_type": "wine", "entity_id": str(old_wine)}
    )
    assert history.status_code == 200
    assert [entry["feature"] for entry in history.json()] == ["ai_value"]

    busy = client.get(
        "/api/v1/ai/audit", params={"entity_type": "wine", "entity_id": str(busy_wine)}
    )
    assert len(busy.json()) == 35
    assert busy.json()[0]["feature"] == "notes-0"


def test_entity_filters_must_come_together(env):
    _, _, _, client = env
    assert client.get("/api/v1/ai/audit", params={"entity_type": "wine"}).status_code == 422
    assert client.get("/api/v1/ai/audit", params={"entity_id": str(uuid4())}).status_code == 422
    assert (
        client.get(
            "/api/v1/ai/audit", params={"entity_type": "household", "entity_id": str(uuid4())}
        ).status_code
        == 422
    )
