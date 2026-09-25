from datetime import UTC, datetime, timedelta
from uuid import uuid4

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, func, select
from sqlalchemy.orm import Session
from sqlalchemy.pool import StaticPool

from app.api.deps import CurrentContext, get_authenticated_context, get_current_context
from app.api.routes import announcements, notifications
from app.db.base import Base
from app.db.session import get_db
from app.models import AdminAnnouncement, Household, Membership, User, UserNotification, UserSession
from app.schemas.announcement import AnnouncementCreate
from app.services.announcements import send_announcement


@pytest.fixture
def env():
    engine = create_engine(
        "sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool
    )
    Base.metadata.create_all(engine)
    with Session(engine, expire_on_commit=False) as db:
        household = Household(name="Admin cellar")
        admin = User(
            email="admin@example.test",
            display_name="Admin",
            password_hash="unused",
            is_app_admin=True,
        )
        db.add_all([admin, household])
        db.flush()
        membership = Membership(user_id=admin.id, household_id=household.id, role="owner")
        db.add(membership)
        db.commit()
        context = CurrentContext(
            user=admin,
            household=household,
            membership=membership,
            session=UserSession(
                user_id=admin.id,
                active_household_id=household.id,
                token_hash="test",
                expires_at=datetime.now(UTC) + timedelta(days=1),
            ),
        )
        app = FastAPI()
        app.include_router(announcements.router, prefix="/api/v1")
        app.include_router(notifications.router, prefix="/api/v1")
        app.dependency_overrides[get_db] = lambda: db
        app.dependency_overrides[get_current_context] = lambda: context
        app.dependency_overrides[get_authenticated_context] = lambda: context
        with TestClient(app) as client:
            yield db, context, app, client
    engine.dispose()


def payload(**overrides):
    return {
        "id": str(uuid4()),
        "title": "Nuova Vinaris",
        "message": "Scopri la nuova Home.",
        "action_url": "/home",
        "confirm": True,
        **overrides,
    }


def add_user(db, name, *, demo=False, approved=True, blocked=False):
    user = User(
        email=f"{name}@example.test",
        display_name=name,
        password_hash="unused",
        is_approved=approved,
        is_blocked=blocked,
    )
    household = Household(name=name, is_demo=demo)
    db.add_all([user, household])
    db.flush()
    membership = Membership(user_id=user.id, household_id=household.id, role="owner")
    db.add(membership)
    db.commit()
    return user, household, membership


@pytest.mark.parametrize("endpoint", ["", "/audience"])
def test_only_app_admin_can_access_history_and_audience(env, endpoint):
    _, context, app, client = env
    context.user.is_app_admin = False  # Still a household owner.
    assert client.get("/api/v1/admin/announcements" + endpoint).status_code == 403
    assert client.post("/api/v1/admin/announcements", json=payload()).status_code == 403
    app.dependency_overrides.pop(get_current_context)
    app.dependency_overrides.pop(get_authenticated_context)
    assert client.get("/api/v1/admin/announcements" + endpoint).status_code == 401
    assert client.post("/api/v1/admin/announcements", json=payload()).status_code == 401


def test_demo_admin_cannot_broadcast(env):
    db, context, _, client = env
    context.household.is_demo = True
    assert client.post("/api/v1/admin/announcements", json=payload()).status_code == 403
    assert db.scalar(select(func.count()).select_from(AdminAnnouncement)) == 0


@pytest.mark.parametrize(
    "overrides",
    [
        {"title": "  "},
        {"message": " \n "},
        {"title": "x" * 181},
        {"message": "x" * 4001},
        {"action_url": "https://evil.example"},
        {"action_url": "javascript:alert(1)"},
        {"confirm": False},
        {"id": "not-a-uuid"},
        {"recipient_ids": []},
    ],
)
def test_rejects_invalid_or_unconfirmed_announcements(env, overrides):
    db, _, _, client = env
    assert client.post("/api/v1/admin/announcements", json=payload(**overrides)).status_code == 422
    assert db.scalar(select(func.count()).select_from(UserNotification)) == 0


def test_delivers_once_per_real_user_across_cellars_and_retries(env):
    db, context, app, client = env
    first, first_household, first_membership = add_user(db, "first")
    second, _, _ = add_user(db, "second")
    add_user(db, "blocked", blocked=True)
    add_user(db, "pending", approved=False)
    add_user(db, "demo", demo=True)
    db.add(Membership(user_id=first.id, household_id=context.household.id, role="viewer"))
    db.commit()
    assert client.get("/api/v1/admin/announcements/audience").json() == {"recipient_count": 3}
    request = payload(title="  Nuova Vinaris  ")
    response = client.post("/api/v1/admin/announcements", json=request)
    assert response.status_code == 200
    result = response.json()
    assert result["title"] == "Nuova Vinaris"
    assert result["recipient_count"] == 3
    assert result["created_by_user_id"] == str(context.user.id)
    assert client.post("/api/v1/admin/announcements", json=request).json() == result
    rows = db.scalars(select(UserNotification)).all()
    assert {row.user_id for row in rows} == {first.id, second.id, context.user.id}
    assert len(rows) == 3
    assert all(row.read_at is None and row.archived_at is None for row in rows)
    assert len(client.get("/api/v1/admin/announcements").json()) == 1
    assert (
        client.post(
            "/api/v1/admin/announcements", json={**request, "message": "Changed"}
        ).status_code
        == 409
    )

    # Normal recipients see only their copy; read/archive cannot affect other users.
    recipient_context = CurrentContext(first, first_household, first_membership, context.session)
    app.dependency_overrides[get_authenticated_context] = lambda: recipient_context
    own = next(row for row in rows if row.user_id == first.id)
    foreign = next(row for row in rows if row.user_id == second.id)
    feed = client.get("/api/v1/notifications/center").json()
    assert any(item["title"] == "Nuova Vinaris" for item in feed["items"])
    assert client.post(f"/api/v1/notifications/{foreign.id}/archive").status_code == 404
    assert client.post(f"/api/v1/notifications/{own.id}/archive").status_code == 204
    assert foreign.archived_at is None
    assert client.post("/api/v1/admin/announcements", json=request).status_code == 200
    assert db.scalar(select(func.count()).select_from(UserNotification)) == 3
    assert own.archived_at is not None


def test_partial_failure_rolls_back_audit_and_deliveries(env, monkeypatch):
    db, context, _, _ = env
    add_user(db, "recipient")
    original_flush = db.flush
    calls = 0

    def fail_second_flush(*args, **kwargs):
        nonlocal calls
        calls += 1
        if calls == 2:
            raise RuntimeError("simulated delivery failure")
        return original_flush(*args, **kwargs)

    monkeypatch.setattr(db, "flush", fail_second_flush)
    with pytest.raises(RuntimeError):
        send_announcement(db, context, AnnouncementCreate(**payload()))
    monkeypatch.setattr(db, "flush", original_flush)
    assert db.scalar(select(func.count()).select_from(AdminAnnouncement)) == 0
    assert db.scalar(select(func.count()).select_from(UserNotification)) == 0


def test_empty_audience_does_not_create_a_send(env):
    db, context, _, client = env
    context.user.is_blocked = True  # Bypass auth only to exercise the empty audience transaction.
    db.commit()
    assert client.post("/api/v1/admin/announcements", json=payload()).status_code == 409
    assert db.scalar(select(func.count()).select_from(AdminAnnouncement)) == 0
