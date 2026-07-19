import hashlib
import hmac
import json
import struct
import time
import uuid
from datetime import UTC, datetime, timedelta
from decimal import Decimal
from urllib.parse import parse_qs, urlparse

from fastapi import HTTPException
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, select
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.api.routes import wines as wines_route
from app.core.config import settings
from app.core.rate_limit import rate_limiter
from app.db.base import Base
from app.db.session import get_db
from app.main import app
from app.models import (
    AiAuditLog,
    Household,
    Membership,
    RedeemCode,
    User,
    UserAiCreditTransaction,
    UserAiSettings,
    UserEntitlement,
    UserNotification,
    Wine,
)
from app.services.openai_client import OpenAIResponse, TokenUsage

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
    rate_limiter.clear()
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)
    app.dependency_overrides[get_db] = override_get_db


def teardown_function():
    app.dependency_overrides.clear()


def register(
    client: TestClient, email: str = "owner@example.com", password: str = "strong-password-1"
):
    return client.post(
        "/api/v1/auth/register",
        json={
            "email": email,
            "display_name": "Cellar Owner",
            "password": password,
            "household_name": "Main Cellar",
        },
    )


def create_redeem_code(
    admin_client: TestClient, email: str | None = None, duration_days: int = 30
) -> str:
    payload = {"label": "Test access", "duration_days": duration_days, "max_redemptions": 1}
    if email:
        payload["email"] = email
    created = admin_client.post("/api/v1/billing/redeem-codes", json=payload)
    assert created.status_code == 201
    return created.json()["code"]


def test_register_login_session_and_logout():
    client = TestClient(app)

    anonymous = client.get("/api/v1/session")
    assert anonymous.status_code == 200
    assert anonymous.json()["authenticated"] is False
    assert client.get("/api/v1/auth/passkeys").status_code == 401

    registered = register(client)
    assert registered.status_code == 201
    assert registered.json()["authenticated"] is True
    assert registered.json()["user_email"] == "owner@example.com"
    assert registered.json()["is_app_admin"] is True
    assert registered.json()["active_household_name"] == "Main Cellar"
    assert registered.json()["locale"] == "it"
    assert registered.json()["theme_preference"] == "system"
    assert client.get("/api/v1/auth/passkeys").json() == []

    preferences = client.patch(
        "/api/v1/auth/preferences", json={"locale": "en", "theme_preference": "private-cellar"}
    )
    assert preferences.status_code == 200
    assert preferences.json()["locale"] == "en"
    assert preferences.json()["theme_preference"] == "private-cellar"

    pending_client = TestClient(app)
    pending = register(pending_client, email="pending@example.com", password="strong-password-2")
    assert pending.status_code == 201
    assert pending.json()["authenticated"] is False
    assert pending.json()["pending_approval"] is True
    blocked_login = pending_client.post(
        "/api/v1/auth/login", json={"email": "pending@example.com", "password": "strong-password-2"}
    )
    assert blocked_login.status_code == 403
    pending_users = client.get("/api/v1/auth/pending-users")
    assert pending_users.status_code == 200
    assert pending_users.json()[0]["email"] == "pending@example.com"
    approved = client.post(f"/api/v1/auth/pending-users/{pending_users.json()[0]['id']}/approve")
    assert approved.status_code == 200
    approved_login = pending_client.post(
        "/api/v1/auth/login", json={"email": "pending@example.com", "password": "strong-password-2"}
    )
    assert approved_login.status_code == 200
    assert approved_login.json()["is_app_admin"] is False
    assert approved_login.json()["has_active_entitlement"] is False
    assert pending_client.get("/api/v1/auth/pending-users").status_code == 402
    redeem_code = create_redeem_code(client, email="pending@example.com")
    redeemed = pending_client.post("/api/v1/billing/redeem", json={"code": redeem_code})
    assert redeemed.status_code == 200
    assert pending_client.get("/api/v1/auth/pending-users").status_code == 403

    users = client.get("/api/v1/auth/users")
    assert users.status_code == 200
    pending_record = next(user for user in users.json() if user["email"] == "pending@example.com")
    promoted = client.patch(
        f"/api/v1/auth/users/{pending_record['id']}", json={"is_app_admin": True}
    )
    assert promoted.status_code == 200
    assert promoted.json()["is_app_admin"] is True
    assert promoted.json()["ai_credit_balance_usd"] == "0.500000"
    blocked = client.patch(f"/api/v1/auth/users/{pending_record['id']}", json={"is_blocked": True})
    assert blocked.status_code == 200
    assert blocked.json()["is_blocked"] is True
    blocked_login = pending_client.post(
        "/api/v1/auth/login", json={"email": "pending@example.com", "password": "strong-password-2"}
    )
    assert blocked_login.status_code == 403
    deleted_user = client.delete(f"/api/v1/auth/users/{pending_record['id']}")
    assert deleted_user.status_code == 204
    users_after_delete = client.get("/api/v1/auth/users")
    assert all(user["email"] != "pending@example.com" for user in users_after_delete.json())
    logged_out = client.post("/api/v1/auth/logout")
    assert logged_out.status_code == 204
    assert client.get("/api/v1/session").json()["authenticated"] is False

    passkey_options = client.post("/api/v1/auth/passkeys/login/options")
    assert passkey_options.status_code == 200
    assert passkey_options.json()["challenge"]

    login = client.post(
        "/api/v1/auth/login", json={"email": "owner@example.com", "password": "strong-password-1"}
    )
    assert login.status_code == 200
    assert login.json()["authenticated"] is True
    assert login.json()["locale"] == "en"
    assert login.json()["theme_preference"] == "private-cellar"


def test_wine_product_photo_upload_serves_two_private_sizes_and_deletes(tmp_path, monkeypatch):
    client = TestClient(app)
    assert register(client).status_code == 201
    ai_png = b"\x89PNG\r\n\x1a\nAI bottle result"
    monkeypatch.setattr(wines_route, "process_bottle_photo", lambda content, model: ai_png)
    monkeypatch.setattr(settings, "wine_photo_ai_enabled", True)
    processed = client.post(
        "/api/v1/wines/photo/process",
        files={"source_image": ("bottle.jpg", b"source image", "image/jpeg")},
    )
    assert processed.status_code == 200
    assert processed.content == ai_png
    assert processed.headers["x-bottle-segmentation"] == "birefnet-general-lite"

    created = client.post("/api/v1/wines", json={"name": "Photo Bottle", "quantity": 1})
    assert created.status_code == 201
    wine_id = created.json()["id"]
    assert created.json()["photo_thumbnail_url"] == ""
    assert created.json()["photo_detail_url"] == ""

    previous_storage_dir = settings.wine_photo_storage_dir
    settings.wine_photo_storage_dir = str(tmp_path)
    try:

        def transparent_png_header(width: int, height: int) -> bytes:
            return (
                b"\x89PNG\r\n\x1a\n"
                + struct.pack(">I", 13)
                + b"IHDR"
                + struct.pack(">IIBBBBB", width, height, 8, 6, 0, 0, 0)
                + b"\x00\x00\x00\x00"
            )

        uploaded = client.put(
            f"/api/v1/wines/{wine_id}/photo",
            files={
                "thumbnail_image": ("thumbnail.png", transparent_png_header(160, 240), "image/png"),
                "detail_image": ("detail.png", transparent_png_header(480, 720), "image/png"),
            },
        )
        assert uploaded.status_code == 200
        payload = uploaded.json()
        assert payload["photo_thumbnail_url"].startswith(
            f"/api/v1/wines/{wine_id}/photo/thumbnail?v="
        )
        assert payload["photo_detail_url"].startswith(f"/api/v1/wines/{wine_id}/photo/detail?v=")

        thumbnail = client.get(payload["photo_thumbnail_url"])
        detail = client.get(payload["photo_detail_url"])
        assert thumbnail.status_code == 200
        assert thumbnail.headers["content-type"] == "image/png"
        assert detail.status_code == 200
        assert detail.headers["cache-control"] == "private, max-age=31536000, immutable"

        admin_photos = client.get("/api/v1/admin/operations/photos")
        assert admin_photos.status_code == 200
        assert admin_photos.json()["total"] == 1
        admin_photo = admin_photos.json()["items"][0]
        assert admin_photo["wine_id"] == wine_id
        assert admin_photo["name"] == "Photo Bottle"
        assert admin_photo["household_name"] == "Main Cellar"
        assert client.get(admin_photo["thumbnail_url"]).status_code == 200

        with TestingSessionLocal() as db:
            user = db.scalar(select(User).where(User.email == "owner@example.com"))
            assert user is not None
            user.is_app_admin = False
            now = datetime.now(UTC)
            db.add(
                UserEntitlement(
                    user_id=user.id,
                    source="test",
                    source_id=None,
                    valid_from=now,
                    valid_until=now + timedelta(days=1),
                )
            )
            db.commit()
        assert client.get(payload["photo_detail_url"]).status_code == 403
        assert client.delete(f"/api/v1/wines/{wine_id}/photo").status_code == 403
        assert client.get("/api/v1/admin/operations/photos").status_code == 403
        assert client.get(admin_photo["thumbnail_url"]).status_code == 403
        assert client.delete(f"/api/v1/admin/operations/photos/{wine_id}").status_code == 403
        assert (
            client.post(
                "/api/v1/wines/photo/process",
                files={"source_image": ("bottle.jpg", b"source image", "image/jpeg")},
            ).status_code
            == 403
        )
        with TestingSessionLocal() as db:
            user = db.scalar(select(User).where(User.email == "owner@example.com"))
            assert user is not None
            user.can_manage_wine_photos = True
            db.commit()

        delegated_process = client.post(
            "/api/v1/wines/photo/process",
            files={"source_image": ("bottle.jpg", b"source image", "image/jpeg")},
        )
        assert delegated_process.status_code == 200
        assert client.get(payload["photo_detail_url"]).status_code == 200
        delegated_upload = client.put(
            f"/api/v1/wines/{wine_id}/photo",
            files={
                "thumbnail_image": ("thumbnail.png", transparent_png_header(160, 240), "image/png"),
                "detail_image": ("detail.png", transparent_png_header(480, 720), "image/png"),
            },
        )
        assert delegated_upload.status_code == 200
        assert client.get("/api/v1/admin/operations/photos").status_code == 403

        with TestingSessionLocal() as db:
            user = db.scalar(select(User).where(User.email == "owner@example.com"))
            assert user is not None
            user.can_manage_wine_photos = False
            user.is_app_admin = True
            db.commit()

        invalid = client.put(
            f"/api/v1/wines/{wine_id}/photo",
            files={
                "thumbnail_image": ("thumbnail.png", transparent_png_header(161, 240), "image/png"),
                "detail_image": ("detail.png", transparent_png_header(480, 720), "image/png"),
            },
        )
        assert invalid.status_code == 400

        removed = client.delete(f"/api/v1/wines/{wine_id}/photo")
        assert removed.status_code == 200
        assert removed.json()["photo_detail_url"] == ""
        assert client.get(payload["photo_detail_url"]).status_code == 404

        uploaded_again = client.put(
            f"/api/v1/wines/{wine_id}/photo",
            files={
                "thumbnail_image": ("thumbnail.png", transparent_png_header(160, 240), "image/png"),
                "detail_image": ("detail.png", transparent_png_header(480, 720), "image/png"),
            },
        )
        assert uploaded_again.status_code == 200
        admin_removed = client.delete(f"/api/v1/admin/operations/photos/{wine_id}")
        assert admin_removed.status_code == 204
        assert client.get("/api/v1/admin/operations/photos").json()["total"] == 0
        with TestingSessionLocal() as db:
            assert db.get(Wine, uuid.UUID(wine_id)).photo_version == ""
    finally:
        settings.wine_photo_storage_dir = previous_storage_dir


def test_registration_rate_limit_ignores_spoofed_forwarded_ip(monkeypatch):
    monkeypatch.setattr(settings, "rate_limit_register_attempts", 2)
    monkeypatch.setattr(settings, "rate_limit_register_window_seconds", 60)
    client = TestClient(app)

    first = client.post(
        "/api/v1/auth/register",
        headers={"X-Forwarded-For": "198.51.100.10"},
        json={
            "email": "first@example.com",
            "display_name": "First",
            "password": "strong-password-1",
            "household_name": "First Cellar",
        },
    )
    second = client.post(
        "/api/v1/auth/register",
        headers={"X-Forwarded-For": "198.51.100.11"},
        json={
            "email": "second@example.com",
            "display_name": "Second",
            "password": "strong-password-2",
            "household_name": "Second Cellar",
        },
    )
    limited = client.post(
        "/api/v1/auth/register",
        headers={"X-Forwarded-For": "198.51.100.12"},
        json={
            "email": "third@example.com",
            "display_name": "Third",
            "password": "strong-password-3",
            "household_name": "Third Cellar",
        },
    )

    assert first.status_code == 201
    assert second.status_code == 201
    assert limited.status_code == 429
    assert int(limited.headers["Retry-After"]) >= 1


def test_login_rate_limit_blocks_repeated_account_attempts(monkeypatch):
    client = TestClient(app)
    assert register(client).status_code == 201
    rate_limiter.clear()
    monkeypatch.setattr(settings, "rate_limit_login_ip_attempts", 10)
    monkeypatch.setattr(settings, "rate_limit_login_account_attempts", 2)
    monkeypatch.setattr(settings, "rate_limit_login_window_seconds", 60)

    payload = {"email": "owner@example.com", "password": "incorrect-password"}
    assert client.post("/api/v1/auth/login", json=payload).status_code == 401
    assert client.post("/api/v1/auth/login", json=payload).status_code == 401
    limited = client.post("/api/v1/auth/login", json=payload)

    assert limited.status_code == 429
    assert limited.json()["detail"] == "Too many requests. Try again later."
    assert int(limited.headers["Retry-After"]) >= 1


def test_password_reset_changes_password_invalidates_sessions_and_is_single_use(monkeypatch):
    deliveries = []

    def fake_send_email(*, recipients, subject, body):
        deliveries.append({"recipients": recipients, "subject": subject, "body": body})
        return True

    monkeypatch.setattr("app.api.routes.auth.send_email", fake_send_email)
    monkeypatch.setattr(settings, "smtp_host", "smtp.example.com")
    monkeypatch.setattr(settings, "smtp_from_email", "noreply@example.com")
    client = TestClient(app)
    assert register(client).status_code == 201
    reset_client = TestClient(app)

    requested = reset_client.post(
        "/api/v1/auth/password-reset/request", json={"email": "owner@example.com"}
    )
    assert requested.status_code == 204
    assert len(deliveries) == 1
    reset_url = next(
        part for part in deliveries[0]["body"].split() if "password_reset_token=" in part
    )
    token = parse_qs(urlparse(reset_url).query)["password_reset_token"][0]

    completed = reset_client.post(
        "/api/v1/auth/password-reset/confirm",
        json={"token": token, "password": "new-strong-password-1"},
    )
    assert completed.status_code == 204
    assert client.get("/api/v1/session").json()["authenticated"] is False
    assert (
        TestClient(app)
        .post(
            "/api/v1/auth/login",
            json={"email": "owner@example.com", "password": "strong-password-1"},
        )
        .status_code
        == 401
    )
    assert (
        TestClient(app)
        .post(
            "/api/v1/auth/login",
            json={"email": "owner@example.com", "password": "new-strong-password-1"},
        )
        .status_code
        == 200
    )
    assert (
        reset_client.post(
            "/api/v1/auth/password-reset/confirm",
            json={"token": token, "password": "another-strong-password"},
        ).status_code
        == 400
    )

    unknown = reset_client.post(
        "/api/v1/auth/password-reset/request", json={"email": "unknown@example.com"}
    )
    assert unknown.status_code == 204
    assert len(deliveries) == 1


def test_email_verification_and_passkey_options_are_rate_limited(monkeypatch):
    client = TestClient(app)
    assert register(client).status_code == 201
    rate_limiter.clear()
    monkeypatch.setattr(settings, "rate_limit_verify_email_attempts", 1)
    monkeypatch.setattr(settings, "rate_limit_verify_email_window_seconds", 60)

    payload = {"token": "invalid-verification-token"}
    assert client.post("/api/v1/auth/verify-email", json=payload).status_code == 400
    assert client.post("/api/v1/auth/verify-email", json=payload).status_code == 429

    rate_limiter.clear()
    monkeypatch.setattr(settings, "rate_limit_passkey_options_attempts", 1)
    monkeypatch.setattr(settings, "rate_limit_passkey_window_seconds", 60)
    assert (
        client.post("/api/v1/auth/passkeys/register/options", json={"name": "Laptop"}).status_code
        == 200
    )
    assert (
        client.post("/api/v1/auth/passkeys/register/options", json={"name": "Laptop"}).status_code
        == 429
    )


def test_register_grants_signup_ai_credit():
    client = TestClient(app)
    registered = register(client)
    assert registered.status_code == 201

    billing = client.get("/api/v1/billing/status")
    assert billing.status_code == 200
    assert billing.json()["ai_credit_balance_usd"] == "0.500000"

    users = client.get("/api/v1/auth/users")
    assert users.status_code == 200
    assert users.json()[0]["ai_credit_balance_usd"] == "0.500000"

    with TestingSessionLocal() as db:
        credit_entries = db.query(UserAiCreditTransaction).all()
        assert len(credit_entries) == 1
        assert credit_entries[0].source == "signup_bonus"
        assert credit_entries[0].amount_usd == Decimal("0.500000")
        notifications = db.query(UserNotification).all()
        assert len(notifications) == 1
        assert notifications[0].kind == "ai_credits"
        assert "0.500000 USD" in notifications[0].message


def test_app_admin_can_set_user_ai_credit_balance():
    admin_client = TestClient(app)
    user_client = TestClient(app)
    assert register(admin_client).status_code == 201
    assert (
        register(user_client, email="gifted@example.com", password="strong-password-2").status_code
        == 201
    )

    app_user = next(
        user
        for user in admin_client.get("/api/v1/auth/users").json()
        if user["email"] == "gifted@example.com"
    )
    assert app_user["ai_credit_balance_usd"] == "0.500000"
    assert (
        admin_client.post(f"/api/v1/auth/pending-users/{app_user['id']}/approve").status_code == 200
    )

    updated = admin_client.patch(
        f"/api/v1/auth/users/{app_user['id']}",
        json={"ai_credit_balance_target_usd": "1.75", "ai_credit_note": "Welcome gift"},
    )
    assert updated.status_code == 200
    assert updated.json()["ai_credit_balance_usd"] == "1.750000"
    assert (
        user_client.post(
            "/api/v1/auth/login",
            json={"email": "gifted@example.com", "password": "strong-password-2"},
        ).status_code
        == 200
    )
    user_notifications = user_client.get("/api/v1/notifications")
    assert user_notifications.status_code == 200
    assert any(
        "Welcome gift" in notification["message"] for notification in user_notifications.json()
    )

    second_update = admin_client.patch(
        f"/api/v1/auth/users/{app_user['id']}",
        json={"ai_credit_balance_target_usd": "2.00", "ai_credit_note": "Second gift"},
    )
    assert second_update.status_code == 200
    second_notifications = user_client.get("/api/v1/notifications")
    assert second_notifications.status_code == 200
    assert any(
        "Second gift" in notification["message"] for notification in second_notifications.json()
    )

    with TestingSessionLocal() as db:
        user = db.get(User, uuid.UUID(app_user["id"]))
        assert user is not None
        credit_entries = list(
            db.query(UserAiCreditTransaction)
            .filter(UserAiCreditTransaction.user_id == user.id)
            .order_by(UserAiCreditTransaction.created_at.asc())
        )
        assert len(credit_entries) == 3
        assert credit_entries[0].source == "signup_bonus"
        assert credit_entries[1].source == "admin_adjustment"
        assert credit_entries[1].amount_usd == Decimal("1.250000")
        assert "Welcome gift" in credit_entries[1].note
        assert credit_entries[2].source == "admin_adjustment"
        assert credit_entries[2].amount_usd == Decimal("0.250000")
        assert "Second gift" in credit_entries[2].note

        notifications = list(
            db.query(UserNotification).filter(UserNotification.user_id == user.id).all()
        )
        ai_credit_notification = next(
            notification
            for notification in notifications
            if notification.kind == "ai_credits" and "Welcome gift" in notification.message
        )
        assert "Welcome gift" in ai_credit_notification.message
        assert any(
            notification.kind == "ai_credits" and "Second gift" in notification.message
            for notification in notifications
        )


def test_app_admin_user_stats_endpoint_summarizes_cellar_and_ai_usage():
    admin_client = TestClient(app)
    member_client = TestClient(app)
    assert register(admin_client).status_code == 201
    assert (
        register(
            member_client, email="member@example.com", password="strong-password-2"
        ).status_code
        == 201
    )

    pending_user = next(
        user
        for user in admin_client.get("/api/v1/auth/pending-users").json()
        if user["email"] == "member@example.com"
    )
    assert (
        admin_client.post(f"/api/v1/auth/pending-users/{pending_user['id']}/approve").status_code
        == 200
    )
    assert (
        member_client.post(
            "/api/v1/auth/login",
            json={"email": "member@example.com", "password": "strong-password-2"},
        ).status_code
        == 200
    )

    session = member_client.get("/api/v1/session").json()
    with TestingSessionLocal() as db:
        member = db.get(User, uuid.UUID(session["user_id"]))
        household = db.get(Household, uuid.UUID(session["active_household_id"]))
        assert member is not None
        assert household is not None
        db.add_all(
            [
                Wine(
                    household_id=household.id,
                    created_by_user_id=member.id,
                    name="Barolo",
                    quantity=3,
                    price=Decimal("50.00"),
                ),
                Wine(
                    household_id=household.id,
                    created_by_user_id=member.id,
                    name="Brunello",
                    quantity=2,
                    price=Decimal("65.00"),
                ),
                AiAuditLog(
                    household_id=household.id,
                    user_id=member.id,
                    entity_type="wine",
                    entity_id=uuid.uuid4(),
                    feature="ai_notes",
                    model="gpt-5.4-mini",
                    outcome="success",
                    summary="Generated notes",
                    total_tokens=120,
                    estimated_cost_usd=Decimal("0.001000"),
                    created_at=datetime.now(UTC),
                ),
                AiAuditLog(
                    household_id=household.id,
                    user_id=member.id,
                    entity_type="wine",
                    entity_id=uuid.uuid4(),
                    feature="ai_value",
                    model="gpt-5.4-mini",
                    outcome="success",
                    summary="Estimated value",
                    total_tokens=140,
                    estimated_cost_usd=Decimal("0.001400"),
                    created_at=datetime.now(UTC),
                ),
            ],
        )
        db.commit()

    stats = admin_client.get("/api/v1/auth/users/stats")
    assert stats.status_code == 200
    member_stats = next(user for user in stats.json() if user["email"] == "member@example.com")
    assert member_stats["households_total"] == 1
    assert member_stats["cellar_wines_total"] == 2
    assert member_stats["cellar_bottles_total"] == 5
    assert member_stats["wines_created_total"] == 2
    assert member_stats["ai_requests_total"] == 2
    assert member_stats["last_sign_in_at"] is not None
    assert member_stats["last_ai_request_at"] is not None
    assert member_stats["last_activity_at"] is not None

    forbidden = member_client.get("/api/v1/auth/users/stats")
    assert forbidden.status_code == 402


def test_app_admin_can_fetch_single_user_stats():
    admin_client = TestClient(app)
    member_client = TestClient(app)
    assert register(admin_client).status_code == 201
    assert (
        register(
            member_client, email="detail@example.com", password="strong-password-2"
        ).status_code
        == 201
    )

    pending_user = next(
        user
        for user in admin_client.get("/api/v1/auth/pending-users").json()
        if user["email"] == "detail@example.com"
    )
    assert (
        admin_client.post(f"/api/v1/auth/pending-users/{pending_user['id']}/approve").status_code
        == 200
    )
    assert (
        member_client.post(
            "/api/v1/auth/login",
            json={"email": "detail@example.com", "password": "strong-password-2"},
        ).status_code
        == 200
    )

    user_stats = admin_client.get(f"/api/v1/auth/users/{pending_user['id']}/stats")
    assert user_stats.status_code == 200
    assert user_stats.json()["email"] == "detail@example.com"
    assert user_stats.json()["households_total"] == 1

    missing = admin_client.get(f"/api/v1/auth/users/{uuid.uuid4()}/stats")
    assert missing.status_code == 404

    forbidden = member_client.get(f"/api/v1/auth/users/{pending_user['id']}/stats")
    assert forbidden.status_code == 402


def test_register_auto_approves_when_approval_is_disabled(monkeypatch):
    from app.api.routes import auth as auth_routes

    deliveries: list[dict[str, object]] = []

    def fake_send_email(*, recipients: list[str], subject: str, body: str) -> bool:
        deliveries.append({"recipients": recipients, "subject": subject, "body": body})
        return True

    monkeypatch.setattr(auth_routes, "send_email", fake_send_email)
    monkeypatch.setattr(settings, "registration_requires_approval", False)
    monkeypatch.setattr(settings, "smtp_host", "smtp.example.com")
    monkeypatch.setattr(settings, "smtp_from_email", "noreply@example.com")

    admin_client = TestClient(app)
    assert register(admin_client).status_code == 201

    user_client = TestClient(app)
    registered = register(user_client, email="production@example.com", password="strong-password-2")
    assert registered.status_code == 201
    assert registered.json()["authenticated"] is False
    assert registered.json()["pending_approval"] is False
    assert registered.json()["pending_email_verification"] is True
    admin_notifications = admin_client.get("/api/v1/notifications")
    assert admin_notifications.status_code == 200
    assert admin_notifications.json()[0]["kind"] == "new_user_registration"
    assert "production@example.com" in admin_notifications.json()[0]["message"]

    blocked_login = user_client.post(
        "/api/v1/auth/login",
        json={"email": "production@example.com", "password": "strong-password-2"},
    )
    assert blocked_login.status_code == 403
    assert "verification" in blocked_login.json()["detail"].lower()

    verification_email = next(
        message for message in deliveries if message["recipients"] == ["production@example.com"]
    )
    verification_url = str(verification_email["body"]).split("email_verify_token=", 1)[1].split()[0]
    token = parse_qs(f"email_verify_token={verification_url}")["email_verify_token"][0]
    prefetched = user_client.get(f"/api/v1/auth/verify-email?token={token}", follow_redirects=False)
    assert prefetched.status_code == 303

    still_blocked_login = user_client.post(
        "/api/v1/auth/login",
        json={"email": "production@example.com", "password": "strong-password-2"},
    )
    assert still_blocked_login.status_code == 403

    verified = user_client.post("/api/v1/auth/verify-email", json={"token": token})
    assert verified.status_code == 200

    login = user_client.post(
        "/api/v1/auth/login",
        json={"email": "production@example.com", "password": "strong-password-2"},
    )
    assert login.status_code == 200
    assert login.json()["authenticated"] is True

    pending_users = admin_client.get("/api/v1/auth/pending-users")
    assert pending_users.status_code == 200
    assert pending_users.json() == []


def test_register_auto_approves_with_resend_configuration(monkeypatch):
    from app.api.routes import auth as auth_routes

    deliveries: list[dict[str, object]] = []

    def fake_send_email(*, recipients: list[str], subject: str, body: str) -> bool:
        deliveries.append({"recipients": recipients, "subject": subject, "body": body})
        return True

    monkeypatch.setattr(auth_routes, "send_email", fake_send_email)
    monkeypatch.setattr(settings, "registration_requires_approval", False)
    monkeypatch.setattr(settings, "email_provider", "resend")
    monkeypatch.setattr(settings, "resend_api_key", "re_test_key")
    monkeypatch.setattr(settings, "email_from_email", "noreply@example.com")
    monkeypatch.setattr(settings, "smtp_host", "")

    admin_client = TestClient(app)
    assert register(admin_client).status_code == 201

    user_client = TestClient(app)
    registered = register(user_client, email="resend@example.com", password="strong-password-2")
    assert registered.status_code == 201
    assert registered.json()["pending_email_verification"] is True

    verification_email = next(
        message for message in deliveries if message["recipients"] == ["resend@example.com"]
    )
    assert "email_verify_token=" in str(verification_email["body"])


def test_pending_registration_sends_admin_email(monkeypatch):
    from app.api.routes import auth as auth_routes

    deliveries: list[dict[str, object]] = []

    def fake_send_email(*, recipients: list[str], subject: str, body: str) -> bool:
        deliveries.append({"recipients": recipients, "subject": subject, "body": body})
        return True

    monkeypatch.setattr(auth_routes, "send_email", fake_send_email)
    monkeypatch.setattr(settings, "smtp_host", "smtp.example.com")
    monkeypatch.setattr(settings, "smtp_from_email", "noreply@example.com")

    admin_client = TestClient(app)
    assert register(admin_client).status_code == 201

    pending_client = TestClient(app)
    pending = register(pending_client, email="pending@example.com", password="strong-password-2")
    assert pending.status_code == 201
    assert pending.json()["pending_approval"] is True

    admin_email = next(
        message for message in deliveries if message["recipients"] == ["owner@example.com"]
    )
    user_email = next(
        message for message in deliveries if message["recipients"] == ["pending@example.com"]
    )

    assert "pending@example.com" in str(admin_email["body"])
    assert "Main Cellar" in str(admin_email["body"])
    assert "awaiting approval" in str(user_email["body"]).lower()


def test_pending_user_approval_and_rejection_send_user_email(monkeypatch):
    from app.api.routes import auth as auth_routes

    deliveries: list[dict[str, object]] = []

    def fake_send_email(*, recipients: list[str], subject: str, body: str) -> bool:
        deliveries.append({"recipients": recipients, "subject": subject, "body": body})
        return True

    monkeypatch.setattr(auth_routes, "send_email", fake_send_email)
    monkeypatch.setattr(settings, "smtp_host", "smtp.example.com")
    monkeypatch.setattr(settings, "smtp_from_email", "noreply@example.com")

    admin_client = TestClient(app)
    assert register(admin_client).status_code == 201

    pending_client = TestClient(app)
    assert (
        register(pending_client, email="approve@example.com", password="strong-password-2").json()[
            "pending_approval"
        ]
        is True
    )
    approve_target = next(
        user
        for user in admin_client.get("/api/v1/auth/pending-users").json()
        if user["email"] == "approve@example.com"
    )
    approved = admin_client.post(f"/api/v1/auth/pending-users/{approve_target['id']}/approve")
    assert approved.status_code == 200

    reject_client = TestClient(app)
    assert (
        register(reject_client, email="reject@example.com", password="strong-password-3").json()[
            "pending_approval"
        ]
        is True
    )
    reject_target = next(
        user
        for user in admin_client.get("/api/v1/auth/pending-users").json()
        if user["email"] == "reject@example.com"
    )
    rejected = admin_client.delete(f"/api/v1/auth/pending-users/{reject_target['id']}")
    assert rejected.status_code == 204

    approval_email = next(
        message
        for message in deliveries
        if message["recipients"] == ["approve@example.com"]
        and "approved" in str(message["subject"]).lower()
    )
    rejection_email = next(
        message
        for message in deliveries
        if message["recipients"] == ["reject@example.com"]
        and "not approved" in str(message["subject"]).lower()
    )
    assert "approved" in str(approval_email["subject"]).lower()
    assert "not approved" in str(rejection_email["subject"]).lower()


def test_household_invite_sends_email(monkeypatch):
    from app.api.routes import households as household_routes

    deliveries: list[dict[str, object]] = []

    def fake_send_email(*, recipients: list[str], subject: str, body: str) -> bool:
        deliveries.append({"recipients": recipients, "subject": subject, "body": body})
        return True

    monkeypatch.setattr(household_routes, "send_email", fake_send_email)
    monkeypatch.setattr(settings, "smtp_host", "smtp.example.com")
    monkeypatch.setattr(settings, "smtp_from_email", "noreply@example.com")

    owner = TestClient(app)
    assert register(owner).status_code == 201
    invite = owner.post(
        "/api/v1/household/invites", json={"email": "viewer@example.com", "role": "viewer"}
    )
    assert invite.status_code == 201

    assert len(deliveries) == 1
    assert deliveries[0]["recipients"] == ["viewer@example.com"]
    assert "Renamed Cellar" not in str(deliveries[0]["body"])
    assert "Main Cellar" in str(deliveries[0]["body"])
    assert "viewer" in str(deliveries[0]["body"]).lower()


def test_contact_support_sends_email_with_optional_context(monkeypatch):
    from app.api.routes import support as support_routes

    deliveries: list[dict[str, object]] = []

    def fake_send_email(*, recipients: list[str], subject: str, body: str) -> bool:
        deliveries.append({"recipients": recipients, "subject": subject, "body": body})
        return True

    monkeypatch.setattr(support_routes, "send_email", fake_send_email)
    monkeypatch.setattr(settings, "smtp_host", "smtp.example.com")
    monkeypatch.setattr(settings, "smtp_from_email", "noreply@example.com")

    admin_client = TestClient(app)
    assert register(admin_client).status_code == 201

    anonymous = TestClient(app)
    response = anonymous.post(
        "/api/v1/support/contact",
        json={
            "email": "guest@example.com",
            "subject": "Need help",
            "message": "I cannot understand how to start using the app.",
        },
    )
    assert response.status_code == 202

    authenticated = admin_client.post(
        "/api/v1/support/contact",
        json={
            "email": "owner@example.com",
            "subject": "Billing help",
            "message": "I need help with the redeem code screen after login.",
        },
    )
    assert authenticated.status_code == 202
    assert len(deliveries) == 2
    assert deliveries[0]["recipients"] == ["owner@example.com"]
    assert "guest@example.com" in str(deliveries[0]["body"])
    assert "Authenticated user:" not in str(deliveries[0]["body"])
    assert "Authenticated user: Cellar Owner <owner@example.com>" in str(deliveries[1]["body"])
    assert "Active household: Main Cellar" in str(deliveries[1]["body"])


def test_contact_support_is_rate_limited(monkeypatch):
    from app.api.routes import support as support_routes

    monkeypatch.setattr(support_routes, "send_email", lambda **_kwargs: True)
    monkeypatch.setattr(settings, "rate_limit_support_attempts", 2)
    monkeypatch.setattr(settings, "rate_limit_support_window_seconds", 60)
    client = TestClient(app)
    assert register(client).status_code == 201
    rate_limiter.clear()
    payload = {
        "email": "guest@example.com",
        "subject": "Need help",
        "message": "I need assistance with my cellar.",
    }

    assert client.post("/api/v1/support/contact", json=payload).status_code == 202
    assert client.post("/api/v1/support/contact", json=payload).status_code == 202
    limited = client.post("/api/v1/support/contact", json=payload)

    assert limited.status_code == 429
    assert int(limited.headers["Retry-After"]) >= 1


def test_notifications_generate_smart_reminders_without_duplicates():
    client = TestClient(app)
    assert register(client).status_code == 201

    with TestingSessionLocal() as db:
        owner = db.query(User).filter(User.email == "owner@example.com").one()
        household = db.query(Household).filter(Household.name == "Main Cellar").one()
        db.add_all(
            [
                Wine(
                    household_id=household.id,
                    created_by_user_id=owner.id,
                    name="Ready Bottle",
                    producer="Producer A",
                    vintage="2020",
                    quantity=1,
                    drink_from=2024,
                    drink_to=2028,
                ),
                Wine(
                    household_id=household.id,
                    created_by_user_id=owner.id,
                    name="Past Peak Bottle",
                    producer="Producer B",
                    vintage="2015",
                    quantity=1,
                    drink_to=2024,
                ),
                Wine(
                    household_id=household.id,
                    created_by_user_id=owner.id,
                    name="Delivery Bottle",
                    producer="Producer C",
                    vintage="2021",
                    quantity=1,
                    status="Ordered",
                    expected_delivery=(datetime.now(UTC) + timedelta(days=10)).date(),
                ),
                Wine(
                    household_id=household.id,
                    created_by_user_id=owner.id,
                    name="Pickup Bottle",
                    producer="Producer D",
                    vintage="2022",
                    quantity=1,
                    status="To collect",
                ),
            ]
        )
        db.commit()

    notifications = client.get("/api/v1/notifications")
    assert notifications.status_code == 200
    payload = notifications.json()
    kinds = {item["kind"] for item in payload}
    assert "smart_drink_now" in kinds
    assert "smart_past_window" in kinds
    assert "smart_future_deliveries" in kinds

    center = client.get("/api/v1/notifications/center")
    assert center.status_code == 200
    to_collect_items = [
        item for item in center.json()["items"] if item["kind"] == "smart_to_collect"
    ]
    assert all(item["category"] == "action" for item in to_collect_items)

    with TestingSessionLocal() as db:
        assert (
            db.query(UserNotification)
            .filter(
                UserNotification.user_id
                == db.query(User).filter(User.email == "owner@example.com").one().id
            )
            .count()
            == 5
        )

    drink_now_notification = next(item for item in payload if item["kind"] == "smart_drink_now")
    marked = client.post(f"/api/v1/notifications/{drink_now_notification['id']}/read")
    assert marked.status_code == 204

    refreshed = client.get("/api/v1/notifications")
    assert refreshed.status_code == 200
    refreshed_payload = refreshed.json()
    assert all(item["id"] != drink_now_notification["id"] for item in refreshed_payload)
    assert not any(item["kind"] == "smart_drink_now" for item in refreshed_payload)

    with TestingSessionLocal() as db:
        assert db.query(UserNotification).count() == 4

    regenerated = client.get(
        "/api/v1/notifications/center?category=system&view=active&item_state=all"
    )
    assert regenerated.status_code == 200
    assert not any(item["kind"] == "smart_drink_now" for item in regenerated.json()["items"])
    with TestingSessionLocal() as db:
        assert db.query(UserNotification).count() == 4


def test_notification_center_history_filters_and_pagination():
    client = TestClient(app)
    assert register(client).status_code == 201

    with TestingSessionLocal() as db:
        owner = db.query(User).filter(User.email == "owner@example.com").one()
        db.add_all(
            [
                UserNotification(
                    user_id=owner.id,
                    kind="info",
                    title=f"System event {index}",
                    message="Notification center pagination test",
                    fingerprint=f"notification-center-page:{index}",
                )
                for index in range(25)
            ]
        )
        db.commit()

    first_page = client.get(
        "/api/v1/notifications/center?category=system&view=active&item_state=all&limit=10"
    )
    assert first_page.status_code == 200
    assert len(first_page.json()["items"]) == 10
    created_at_values = [item["created_at"] for item in first_page.json()["items"]]
    assert created_at_values == sorted(created_at_values, reverse=True)
    assert first_page.json()["has_more"] is True
    assert first_page.json()["next_offset"] == 10

    second_page = client.get(
        "/api/v1/notifications/center?category=system&view=active&item_state=all&limit=10&offset=10"
    )
    assert second_page.status_code == 200
    assert set(item["id"] for item in first_page.json()["items"]).isdisjoint(
        item["id"] for item in second_page.json()["items"]
    )

    notification_id = first_page.json()["items"][0]["id"]
    assert client.post(f"/api/v1/notifications/{notification_id}/archive").status_code == 204
    archived = client.get(
        "/api/v1/notifications/center?category=system&view=archived&item_state=all"
    )
    assert archived.status_code == 200
    archived_item = next(item for item in archived.json()["items"] if item["id"] == notification_id)
    assert archived_item["state"] == "archived"

    assert client.post(f"/api/v1/notifications/{notification_id}/restore").status_code == 204
    restored = client.get(
        "/api/v1/notifications/center?category=system&view=active&item_state=unread"
    )
    assert any(item["id"] == notification_id for item in restored.json()["items"])

    assert client.post(f"/api/v1/notifications/{notification_id}/archive").status_code == 204
    assert client.delete(f"/api/v1/notifications/{notification_id}").status_code == 204
    after_delete = client.get(
        "/api/v1/notifications/center?category=system&view=archived&item_state=all"
    )
    assert all(item["id"] != notification_id for item in after_delete.json()["items"])
    with TestingSessionLocal() as db:
        assert db.get(UserNotification, uuid.UUID(notification_id)) is None
    assert client.delete(f"/api/v1/notifications/{notification_id}").status_code == 404

    assert client.post("/api/v1/notifications/read-all").status_code == 204
    unread = client.get(
        "/api/v1/notifications/center?category=system&view=active&item_state=unread"
    )
    assert unread.status_code == 200
    assert unread.json()["items"] == []
    with TestingSessionLocal() as db:
        assert (
            db.query(UserNotification)
            .filter(UserNotification.fingerprint.like("notification-center-page:%"))
            .count()
            == 0
        )


def test_authenticated_user_can_read_wine_catalog():
    client = TestClient(app)
    assert register(client).status_code == 201

    response = client.get("/api/v1/wines/catalog?q=chateau&limit=10")
    assert response.status_code == 200
    catalog = response.json()
    assert 1 <= len(catalog) <= 10
    assert {"id", "name", "producer", "region", "appellation", "type", "format"} <= set(catalog[0])


def test_wine_recognition_parser_uses_api4ai_classes():
    from app.api.routes.catalog import extract_recognition_suggestions

    suggestions = extract_recognition_suggestions(
        {
            "results": [
                {
                    "status": {"code": "ok", "message": "Success"},
                    "entities": [
                        {
                            "kind": "classes",
                            "name": "wine-image-classes",
                            "classes": {
                                "buitenverwachting 1769 vintage 2000": 0.8465678215026855,
                                "raventos i blanc cava reserva brut l'hereu 2012": 0.821323823928833,
                            },
                        },
                    ],
                },
            ],
        },
    )

    assert [suggestion.label for suggestion in suggestions] == [
        "buitenverwachting 1769 vintage 2000",
        "raventos i blanc cava reserva brut l'hereu 2012",
    ]
    assert suggestions[0].confidence == 0.8465678215026855


def test_create_wine_adds_pending_entry_to_catalog_for_admin_approval():
    client = TestClient(app)
    assert register(client).status_code == 201

    created = client.post(
        "/api/v1/wines",
        json={
            "name": "Unique Catalog Test",
            "producer": "Producer Test",
            "quantity": 1,
            "type": "Red",
            "region": "Ticino",
            "appellation": "Ticino DOC",
            "format": "Bottle (750ml)",
        },
    )
    assert created.status_code == 201

    catalog = client.get("/api/v1/wines/catalog?q=unique%20catalog%20test")
    assert catalog.status_code == 200
    assert catalog.json() == []

    pending = client.get("/api/v1/wines/catalog/pending")
    assert pending.status_code == 200
    pending_entry = next(
        entry for entry in pending.json() if entry["name"] == "Unique Catalog Test"
    )
    assert pending_entry["producer"] == "Producer Test"
    assert pending_entry["is_active"] is False

    approved = client.post(f"/api/v1/wines/catalog/{pending_entry['id']}/approve")
    assert approved.status_code == 200
    assert approved.json()["is_active"] is True

    catalog = client.get("/api/v1/wines/catalog?q=unique%20catalog%20test")
    assert catalog.status_code == 200
    assert catalog.json()[0]["name"] == "Unique Catalog Test"
    assert catalog.json()[0]["producer"] == "Producer Test"


def test_create_wine_without_complementary_data_does_not_create_catalog_entry():
    client = TestClient(app)
    assert register(client).status_code == 201

    created = client.post("/api/v1/wines", json={"name": "Only Name Wine", "quantity": 1})
    assert created.status_code == 201

    pending = client.get("/api/v1/wines/catalog/pending")
    assert pending.status_code == 200
    assert all(entry["name"] != "Only Name Wine" for entry in pending.json())


def test_create_catalog_entry_ignores_duplicate_aliases_in_same_request():
    client = TestClient(app)
    assert register(client).status_code == 201

    response = client.post(
        "/api/v1/wines/catalog",
        json={
            "name": "Dogaia Brivio",
            "producer": "",
            "region": "Ticino",
            "appellation": "Ticino DOC",
            "type": "Red",
            "format": "Bottle (750ml)",
            "aliases": ["Dogaia Brivio"],
        },
    )
    assert response.status_code == 201
    assert response.json()["name"] == "Dogaia Brivio"
    assert response.json()["is_active"] is False

    repeated = client.post(
        "/api/v1/wines/catalog",
        json={
            "name": "Dogaia Brivio",
            "producer": "",
            "aliases": ["Dogaia Brivio"],
        },
    )
    assert repeated.status_code == 201
    assert repeated.json()["id"] == response.json()["id"]


def test_create_catalog_entry_requires_complementary_data():
    client = TestClient(app)
    assert register(client).status_code == 201

    response = client.post(
        "/api/v1/wines/catalog", json={"name": "Dogaia Brivio", "aliases": ["Dogaia Brivio"]}
    )
    assert response.status_code == 422


def test_app_admin_can_search_and_delete_catalog_entry():
    client = TestClient(app)
    assert register(client).status_code == 201

    created = client.post(
        "/api/v1/wines/catalog",
        json={
            "name": "Dogaia Brivio",
            "producer": "Guido Brivio",
            "region": "Ticino",
            "type": "Red",
            "aliases": ["Dogaia Brivio"],
        },
    )
    assert created.status_code == 201
    entry_id = created.json()["id"]

    found = client.get("/api/v1/wines/catalog/admin?q=dogaia")
    assert found.status_code == 200
    assert any(entry["id"] == entry_id for entry in found.json())

    deleted = client.delete(f"/api/v1/wines/catalog/{entry_id}")
    assert deleted.status_code == 204

    found_after_delete = client.get("/api/v1/wines/catalog/admin?q=dogaia")
    assert found_after_delete.status_code == 200
    assert all(entry["id"] != entry_id for entry in found_after_delete.json())


def test_ai_wine_label_enrichment(monkeypatch):
    from app.api.routes import ai as ai_routes

    client = TestClient(app)
    assert register(client).status_code == 201
    assert (
        client.patch("/api/v1/ai/settings", json={"openai_api_key": "sk-test"}).status_code == 200
    )
    with TestingSessionLocal() as db:
        user = db.query(User).filter(User.email == "owner@example.com").one()
        user.can_use_label_recognition = True
        db.commit()

    def fake_create_response(*args, **kwargs):
        assert kwargs["web_search"] is True
        return OpenAIResponse(
            text=json.dumps(
                {
                    "name": "Grattamacco Bolgheri Superiore",
                    "producer": "Grattamacco",
                    "vintage": "2016",
                    "type": "Red",
                    "region": "Tuscany",
                    "appellation": "Bolgheri Superiore",
                    "country": "Italy",
                    "grapes_text": "Cabernet Sauvignon, Merlot, Sangiovese",
                    "confidence": "high",
                    "notes": "Known Tuscan red.",
                },
            ),
            usage=TokenUsage(input_tokens=10, output_tokens=20, total_tokens=30),
        )

    monkeypatch.setattr(ai_routes, "create_response", fake_create_response)
    response = client.post(
        "/api/v1/ai/wine-label/enrich", json={"label": "grattamacco bolgheri superiore 2016"}
    )
    assert response.status_code == 200
    assert response.json()["producer"] == "Grattamacco"
    assert response.json()["appellation"] == "Bolgheri Superiore"
    assert response.json()["country"] == "Italy"
    assert response.json()["grapes_text"] == "Cabernet Sauvignon, Merlot, Sangiovese"


def test_manual_wine_data_enrichment_is_funded_by_application(monkeypatch):
    from app.api.routes import ai as ai_routes

    client = TestClient(app)
    assert register(client).status_code == 201
    session = client.get("/api/v1/session").json()
    with TestingSessionLocal() as db:
        current_user = db.get(User, uuid.UUID(session["user_id"]))
        assert current_user is not None
        assert current_user.can_use_label_recognition is False
        current_user.is_app_admin = False
        db.add(
            UserEntitlement(
                user_id=current_user.id,
                source="test",
                valid_from=datetime.now(UTC),
                valid_until=datetime.now(UTC) + timedelta(days=30),
            ),
        )
        db.add(
            UserAiCreditTransaction(
                user_id=current_user.id,
                amount_usd=Decimal("5.000000"),
                source="purchase",
                note="Seed AI budget",
            ),
        )
        db.commit()

    assert (
        client.patch(
            "/api/v1/ai/settings", json={"provider_mode": "credits", "grape_model": "gpt-5.4"}
        ).status_code
        == 200
    )
    monkeypatch.setattr(settings, "openai_api_key", "sk-app-test")
    monkeypatch.setattr(settings, "ai_pack_markup_percent", "20")

    def fake_create_response(*args, **kwargs):
        assert args[0] == "gpt-5.4"
        assert kwargs["web_search"] is True
        return OpenAIResponse(
            text=json.dumps(
                {
                    "name": "Dogaia",
                    "producer": "Guido Brivio",
                    "vintage": "",
                    "type": "Red",
                    "region": "Ticino",
                    "appellation": "Ticino DOC",
                    "country": "Switzerland",
                    "grapes_text": "Merlot",
                    "confidence": "high",
                    "notes": "Ticino wine found with producer Guido Brivio.",
                },
            ),
            usage=TokenUsage(input_tokens=1000, output_tokens=500, total_tokens=1500),
            web_search_calls=1,
        )

    monkeypatch.setattr(ai_routes, "create_response", fake_create_response)
    starting_balance = Decimal(client.get("/api/v1/billing/status").json()["ai_credit_balance_usd"])
    response = client.post(
        "/api/v1/ai/wine-label/enrich", json={"label": "Dogaia di Brivio", "source": "manual"}
    )
    assert response.status_code == 200
    assert response.json()["name"] == "Dogaia"
    assert response.json()["producer"] == "Guido Brivio"
    assert response.json()["grapes_text"] == "Merlot"

    billing = client.get("/api/v1/billing/status")
    assert billing.status_code == 200
    assert Decimal(billing.json()["ai_credit_balance_usd"]) == starting_balance

    with TestingSessionLocal() as db:
        audit = db.scalar(select(AiAuditLog).where(AiAuditLog.feature == "wine_name_search"))
        assert audit is not None
        assert audit.estimated_cost_usd > Decimal("0")
        assert audit.sources[-1]["provider_source"] == "application"
        assert audit.sources[-1]["funded_by"] == "application"


def test_app_admin_can_create_and_user_can_redeem_code():
    admin_client = TestClient(app)
    registered = register(admin_client)
    assert registered.status_code == 201

    created = admin_client.post(
        "/api/v1/billing/redeem-codes",
        json={"label": "Trial", "duration_days": 30, "max_redemptions": 1},
    )
    assert created.status_code == 201
    redeem_code = created.json()["code"]
    assert redeem_code.startswith("WCM-")

    listed = admin_client.get("/api/v1/billing/redeem-codes")
    assert listed.status_code == 200
    assert listed.json()[0]["code"] == redeem_code
    assert listed.json()[0]["redeemed_count"] == 0
    unused_code_id = listed.json()[0]["id"]

    user_client = TestClient(app)
    pending = register(user_client, email="redeem@example.com", password="strong-password-2")
    assert pending.status_code == 201
    pending_users = admin_client.get("/api/v1/auth/pending-users").json()
    pending_user = next(user for user in pending_users if user["email"] == "redeem@example.com")
    assert (
        admin_client.post(f"/api/v1/auth/pending-users/{pending_user['id']}/approve").status_code
        == 200
    )
    login = user_client.post(
        "/api/v1/auth/login", json={"email": "redeem@example.com", "password": "strong-password-2"}
    )
    assert login.status_code == 200
    assert login.json()["has_active_entitlement"] is False
    assert user_client.get("/api/v1/wines").status_code == 402

    redeemed = user_client.post("/api/v1/billing/redeem", json={"code": redeem_code})
    assert redeemed.status_code == 200
    assert redeemed.json()["has_active_entitlement"] is True
    assert redeemed.json()["active_source"] == "redeem"
    assert user_client.get("/api/v1/wines").status_code == 200

    with TestingSessionLocal() as db:
        code = db.get(RedeemCode, uuid.UUID(unused_code_id))
        assert code is not None
        code.expires_at = datetime.now(UTC) - timedelta(minutes=1)
        db.commit()
    assert user_client.get("/api/v1/billing/status").json()["has_active_entitlement"] is False
    assert user_client.get("/api/v1/wines").status_code == 402

    duplicate = user_client.post("/api/v1/billing/redeem", json={"code": redeem_code})
    assert duplicate.status_code == 400
    revoked = admin_client.delete(f"/api/v1/billing/redeem-codes/{unused_code_id}")
    assert revoked.status_code == 204
    listed_after_revoke = admin_client.get("/api/v1/billing/redeem-codes")
    revoked_code = next(code for code in listed_after_revoke.json() if code["id"] == unused_code_id)
    assert revoked_code["is_active"] is False
    force_deleted = admin_client.delete(f"/api/v1/billing/redeem-codes/{unused_code_id}?force=true")
    assert force_deleted.status_code == 204
    assert all(
        code["id"] != unused_code_id
        for code in admin_client.get("/api/v1/billing/redeem-codes").json()
    )

    extra_code = admin_client.post(
        "/api/v1/billing/redeem-codes",
        json={"label": "Unused", "duration_days": 7, "max_redemptions": 1},
    )
    assert extra_code.status_code == 201
    extra_code_id = extra_code.json()["id"]
    deleted = admin_client.delete(f"/api/v1/billing/redeem-codes/{extra_code_id}")
    assert deleted.status_code == 204
    assert all(
        code["id"] != extra_code_id
        for code in admin_client.get("/api/v1/billing/redeem-codes").json()
    )


def test_new_user_gets_single_lifetime_trial_redeem_code():
    from app.api.routes.auth import generate_redeem_code, normalize_redeem_code
    from app.core.crypto import encrypt_secret
    from app.core.security import hash_redeem_code

    admin_client = TestClient(app)
    assert register(admin_client).status_code == 201

    user_client = TestClient(app)
    pending = register(user_client, email="trial@example.com", password="strong-password-2")
    assert pending.status_code == 201
    pending_user = next(
        user
        for user in admin_client.get("/api/v1/auth/pending-users").json()
        if user["email"] == "trial@example.com"
    )
    assert (
        admin_client.post(f"/api/v1/auth/pending-users/{pending_user['id']}/approve").status_code
        == 200
    )

    login = user_client.post(
        "/api/v1/auth/login", json={"email": "trial@example.com", "password": "strong-password-2"}
    )
    assert login.status_code == 200
    assert login.json()["has_active_entitlement"] is False
    assert user_client.get("/api/v1/wines").status_code == 402

    status_payload = user_client.get("/api/v1/billing/status").json()
    assert len(status_payload["available_redeem_codes"]) == 1
    trial_code = status_payload["available_redeem_codes"][0]
    assert trial_code["kind"] == "trial"
    assert trial_code["duration_days"] == 5
    assert trial_code["max_redemptions"] == 1
    assert trial_code["email"] == "trial@example.com"
    assert trial_code["expires_at"] is not None

    redeemed = user_client.post("/api/v1/billing/redeem", json={"code": trial_code["code"]})
    assert redeemed.status_code == 200
    assert redeemed.json()["has_active_entitlement"] is True
    assert redeemed.json()["active_source"] == "trial"
    assert user_client.get("/api/v1/wines").status_code == 200

    with TestingSessionLocal() as db:
        user = db.query(User).filter(User.email == "trial@example.com").one()
        clear_code = generate_redeem_code()
        normalized = normalize_redeem_code(clear_code)
        db.add(
            RedeemCode(
                code_hash=hash_redeem_code(normalized),
                code_prefix=clear_code[:8],
                encrypted_code=encrypt_secret(clear_code),
                kind="trial",
                label="Second trial",
                duration_days=5,
                max_redemptions=1,
                email=user.email,
                expires_at=datetime.now(UTC) + timedelta(days=5),
            ),
        )
        db.commit()

    second_trial = user_client.post("/api/v1/billing/redeem", json={"code": clear_code})
    assert second_trial.status_code == 400
    assert "trial" in second_trial.json()["detail"].lower()


def test_app_admin_can_enable_beta_features_for_user():
    admin_client = TestClient(app)
    assert register(admin_client).status_code == 201

    user_client = TestClient(app)
    pending = register(user_client, email="label-beta@example.com", password="strong-password-2")
    assert pending.status_code == 201
    pending_user = next(
        user
        for user in admin_client.get("/api/v1/auth/pending-users").json()
        if user["email"] == "label-beta@example.com"
    )
    assert (
        admin_client.post(f"/api/v1/auth/pending-users/{pending_user['id']}/approve").status_code
        == 200
    )

    login = user_client.post(
        "/api/v1/auth/login",
        json={"email": "label-beta@example.com", "password": "strong-password-2"},
    )
    assert login.status_code == 200
    assert login.json()["can_use_label_recognition"] is False
    assert login.json()["can_manage_wine_photos"] is False
    trial_code = user_client.get("/api/v1/billing/status").json()["available_redeem_codes"][0][
        "code"
    ]
    assert user_client.post("/api/v1/billing/redeem", json={"code": trial_code}).status_code == 200

    blocked = user_client.post(
        "/api/v1/wines/catalog/recognize",
        files={"image": ("label.jpg", b"fake-image", "image/jpeg")},
    )
    assert blocked.status_code == 403

    app_user = next(
        user
        for user in admin_client.get("/api/v1/auth/users").json()
        if user["email"] == "label-beta@example.com"
    )
    assert app_user["can_use_label_recognition"] is False
    assert app_user["can_manage_wine_photos"] is False
    enabled = admin_client.patch(
        f"/api/v1/auth/users/{app_user['id']}",
        json={"can_use_label_recognition": True, "can_manage_wine_photos": True},
    )
    assert enabled.status_code == 200
    assert enabled.json()["can_use_label_recognition"] is True
    assert enabled.json()["can_manage_wine_photos"] is True

    refreshed_login = user_client.post(
        "/api/v1/auth/login",
        json={"email": "label-beta@example.com", "password": "strong-password-2"},
    )
    assert refreshed_login.status_code == 200
    assert refreshed_login.json()["can_use_label_recognition"] is True
    assert refreshed_login.json()["can_manage_wine_photos"] is True


def stripe_signature(payload: bytes, secret: str) -> str:
    timestamp = int(time.time())
    digest = hmac.new(
        secret.encode("utf-8"),
        f"{timestamp}.{payload.decode('utf-8')}".encode(),
        hashlib.sha256,
    ).hexdigest()
    return f"t={timestamp},v1={digest}"


def test_stripe_checkout_webhook_creates_redeem_code_once(monkeypatch):
    from app.api.routes import billing as billing_routes

    webhook_secret = "whsec_test"
    deliveries: list[dict[str, object]] = []

    def fake_send_email(*, recipients: list[str], subject: str, body: str) -> bool:
        deliveries.append({"recipients": recipients, "subject": subject, "body": body})
        return True

    monkeypatch.setattr(billing_routes, "send_email", fake_send_email)
    monkeypatch.setattr(settings, "smtp_host", "smtp.example.com")
    monkeypatch.setattr(settings, "smtp_from_email", "noreply@example.com")
    monkeypatch.setattr(settings, "stripe_webhook_secret", webhook_secret)
    monkeypatch.setattr(settings, "stripe_monthly_entitlement_days", 31)
    client = TestClient(app)
    registered = register(client, email="stripe@example.com", password="strong-password-3")
    assert registered.status_code == 201
    user_id = registered.json()["user_id"]

    event = {
        "id": "evt_test",
        "type": "checkout.session.completed",
        "data": {
            "object": {
                "id": "cs_test_paid",
                "client_reference_id": user_id,
                "customer": "cus_test",
                "subscription": "sub_test",
                "payment_status": "paid",
                "amount_total": 4900,
                "currency": "chf",
                "metadata": {"user_id": user_id, "duration_days": "31", "plan": "monthly"},
            },
        },
    }
    payload = json.dumps(event, separators=(",", ":")).encode("utf-8")
    headers = {
        "Stripe-Signature": stripe_signature(payload, webhook_secret),
        "Content-Type": "application/json",
    }

    first = client.post("/api/v1/billing/stripe/webhook", content=payload, headers=headers)
    assert first.status_code == 204
    second = client.post("/api/v1/billing/stripe/webhook", content=payload, headers=headers)
    assert second.status_code == 204

    status_response = client.get("/api/v1/billing/status")
    assert status_response.status_code == 200
    status_payload = status_response.json()
    assert status_payload["has_active_entitlement"] is False
    assert len(status_payload["entitlements"]) == 0
    assert len(status_payload["available_redeem_codes"]) == 1
    paid_code = status_payload["available_redeem_codes"][0]["code"]
    assert paid_code.startswith("WCM-")
    assert any(
        message["recipients"] == ["stripe@example.com"] and paid_code in str(message["body"])
        for message in deliveries
    )
    notifications = client.get("/api/v1/notifications")
    assert notifications.status_code == 200
    assert notifications.json()[0]["kind"] == "redeem_code"
    read_notification = client.post(f"/api/v1/notifications/{notifications.json()[0]['id']}/read")
    assert read_notification.status_code == 204
    assert [item["kind"] for item in client.get("/api/v1/notifications").json()] == ["ai_credits"]

    redeemed = client.post("/api/v1/billing/redeem", json={"code": paid_code})
    assert redeemed.status_code == 200
    assert redeemed.json()["has_active_entitlement"] is True
    assert redeemed.json()["active_source"] == "redeem"
    assert redeemed.json()["available_redeem_codes"] == []

    invoice_event = {
        "id": "evt_invoice_paid",
        "type": "invoice.paid",
        "data": {
            "object": {
                "id": "in_test_paid",
                "subscription": "sub_test",
                "status": "paid",
                "paid": True,
                "billing_reason": "subscription_cycle",
                "amount_paid": 4900,
                "currency": "chf",
            },
        },
    }
    invoice_payload = json.dumps(invoice_event, separators=(",", ":")).encode("utf-8")
    invoice_headers = {
        "Stripe-Signature": stripe_signature(invoice_payload, webhook_secret),
        "Content-Type": "application/json",
    }
    renewed = client.post(
        "/api/v1/billing/stripe/webhook", content=invoice_payload, headers=invoice_headers
    )
    assert renewed.status_code == 204
    duplicate_renewal = client.post(
        "/api/v1/billing/stripe/webhook", content=invoice_payload, headers=invoice_headers
    )
    assert duplicate_renewal.status_code == 204
    renewal_status = client.get("/api/v1/billing/status").json()
    assert len(renewal_status["entitlements"]) == 1
    assert len(renewal_status["available_redeem_codes"]) == 1
    renewal_code = renewal_status["available_redeem_codes"][0]["code"]
    assert any(
        message["recipients"] == ["stripe@example.com"] and renewal_code in str(message["body"])
        for message in deliveries
    )

    class FakePortalResponse:
        def __enter__(self):
            return self

        def __exit__(self, *_args):
            return None

        def read(self) -> bytes:
            return b'{"id":"bps_test","url":"https://billing.stripe.test/session"}'

    portal_payload: dict[str, str] = {}

    def fake_portal_urlopen(request, timeout):
        portal_payload["data"] = request.data.decode("utf-8")
        portal_payload["timeout"] = str(timeout)
        return FakePortalResponse()

    monkeypatch.setattr(settings, "stripe_secret_key", "sk_test")
    monkeypatch.setattr("app.api.routes.billing.urlopen", fake_portal_urlopen)
    portal = client.post("/api/v1/billing/portal")
    assert portal.status_code == 200
    assert portal.json()["portal_url"] == "https://billing.stripe.test/session"
    parsed_portal = parse_qs(portal_payload["data"])
    assert parsed_portal["customer"] == ["cus_test"]


def test_coownership_agreement_supports_registered_and_external_participants(monkeypatch):
    deliveries = []

    def fake_send_email(*, recipients, subject, body):
        deliveries.append({"recipients": recipients, "subject": subject, "body": body})
        return True

    monkeypatch.setattr("app.api.routes.coownership.send_email", fake_send_email)
    owner_client = TestClient(app)
    guest_user_client = TestClient(app)
    assert register(owner_client).status_code == 201
    assert (
        register(
            guest_user_client, email="partner@example.com", password="strong-password-2"
        ).status_code
        == 201
    )
    created_wine = owner_client.post(
        "/api/v1/wines",
        json={
            "name": "Shared Barolo",
            "vintage": "2019",
            "quantity": 12,
            "price": 1200,
            "currency": "CHF",
        },
    )
    assert created_wine.status_code == 201

    created = owner_client.post(
        f"/api/v1/co-ownership-agreements/wines/{created_wine.json()['id']}",
        json={
            "ownership_mode": "undivided",
            "custody_location": "Main cellar, rack B",
            "terms": "A bottle may be opened only with unanimous consent.",
            "email_registered_users": False,
            "participants": [
                {
                    "name": "Cellar Owner",
                    "email": "owner@example.com",
                    "share_pct": "33.333334",
                    "contribution": 400,
                },
                {
                    "name": "Registered Partner",
                    "email": "partner@example.com",
                    "share_pct": "33.333333",
                    "contribution": 400,
                },
                {
                    "name": "External Partner",
                    "email": "external@example.com",
                    "share_pct": "33.333333",
                    "contribution": 400,
                },
            ],
        },
    )
    assert created.status_code == 201
    agreement = created.json()
    assert agreement["status"] == "pending"
    assert agreement["wine_snapshot"]["quantity"] == 12
    assert len(agreement["document_hash"]) == 64
    assert len(deliveries) == 1
    assert deliveries[0]["recipients"] == ["external@example.com"]
    registered = next(
        item for item in agreement["participants"] if item["email"] == "partner@example.com"
    )
    external = next(
        item for item in agreement["participants"] if item["email"] == "external@example.com"
    )
    assert registered["user_id"] is not None
    assert registered["delivery_channel"] == "notification"
    assert external["user_id"] is None
    assert external["invite_url"]
    assert agreement["can_manage_payments"] is True

    owner_agreements = owner_client.get("/api/v1/co-ownership-agreements/mine")
    assert owner_agreements.status_code == 200
    assert [item["id"] for item in owner_agreements.json()] == [agreement["id"]]
    assert owner_agreements.json()[0]["can_manage_payments"] is True

    first_payment = owner_client.post(
        f"/api/v1/co-ownership-agreements/{agreement['id']}/participants/{registered['id']}/payments",
        json={"amount": 150, "paid_on": "2026-07-15", "note": "Bank transfer"},
    )
    assert first_payment.status_code == 201
    second_payment = owner_client.post(
        f"/api/v1/co-ownership-agreements/{agreement['id']}/participants/{registered['id']}/payments",
        json={"amount": 250, "paid_on": "2026-07-16", "note": "Final balance"},
    )
    assert second_payment.status_code == 201
    unauthorized_payment = guest_user_client.post(
        f"/api/v1/co-ownership-agreements/{agreement['id']}/participants/{registered['id']}/payments",
        json={"amount": 1, "paid_on": "2026-07-16", "note": "Unauthorized"},
    )
    assert unauthorized_payment.status_code in {401, 404}

    payment_summary = owner_client.get(
        f"/api/v1/co-ownership-agreements/wines/{created_wine.json()['id']}"
    ).json()[0]
    registered_summary = next(
        item for item in payment_summary["participants"] if item["email"] == "partner@example.com"
    )
    assert Decimal(registered_summary["paid_total"]) == Decimal("400")
    assert Decimal(registered_summary["outstanding"]) == Decimal("0")

    voided = owner_client.delete(
        f"/api/v1/co-ownership-agreements/{agreement['id']}/payments/{second_payment.json()['id']}"
    )
    assert voided.status_code == 200
    assert voided.json()["voided_at"] is not None
    after_void = owner_client.get(
        f"/api/v1/co-ownership-agreements/wines/{created_wine.json()['id']}"
    ).json()[0]
    registered_after_void = next(
        item for item in after_void["participants"] if item["email"] == "partner@example.com"
    )
    assert Decimal(registered_after_void["paid_total"]) == Decimal("150")
    assert Decimal(registered_after_void["outstanding"]) == Decimal("250")
    assert len(registered_after_void["payments"]) == 2

    with TestingSessionLocal() as db:
        partner = db.query(User).filter(User.email == "partner@example.com").one()
        assert (
            db.query(UserNotification)
            .filter(
                UserNotification.user_id == partner.id,
                UserNotification.kind == "coownership_agreement",
            )
            .count()
            == 1
        )

    tokens = {
        item["email"]: parse_qs(urlparse(item["invite_url"]).query)["coownership_token"][0]
        for item in agreement["participants"]
    }
    authenticated_response = owner_client.post(
        f"/api/v1/co-ownership-agreements/{agreement['id']}/respond",
        json={"decision": "accepted", "full_name": "Cellar Owner"},
    )
    assert authenticated_response.status_code == 200
    assert authenticated_response.json()["status"] == "pending"
    authenticated_participant = next(
        item
        for item in authenticated_response.json()["participants"]
        if item["email"] == "owner@example.com"
    )
    assert authenticated_participant["acceptance_method"] == "authenticated_session"
    viewed = TestClient(app).get(
        f"/api/v1/co-ownership-agreements/public/{tokens['external@example.com']}"
    )
    assert viewed.status_code == 200
    assert viewed.json()["can_manage_payments"] is False
    first_accept = TestClient(app).post(
        f"/api/v1/co-ownership-agreements/public/{tokens['external@example.com']}/respond",
        json={"decision": "accepted", "full_name": "External Partner"},
    )
    assert first_accept.status_code == 200
    assert first_accept.json()["status"] == "pending"
    response_notifications = owner_client.get("/api/v1/notifications").json()
    response_notification = next(
        item for item in response_notifications if item["kind"] == "coownership_response"
    )
    assert response_notification["action_url"] == (
        f"/cellar?wine_id={created_wine.json()['id']}&section=coownership"
    )
    assert "Shared Barolo 2019" in response_notification["message"]
    for email in ("partner@example.com",):
        response = TestClient(app).post(
            f"/api/v1/co-ownership-agreements/public/{tokens[email]}/respond",
            json={"decision": "accepted", "full_name": email},
        )
        assert response.status_code == 200
    assert response.json()["status"] == "accepted"
    assert response.json()["finalized_at"] is not None
    replay = TestClient(app).post(
        f"/api/v1/co-ownership-agreements/public/{tokens['external@example.com']}/respond",
        json={"decision": "accepted", "full_name": "External Partner"},
    )
    assert replay.status_code == 409


def test_stripe_ai_pack_checkout_webhook_adds_balance_without_redeem_code(monkeypatch):
    from app.api.routes import billing as billing_routes

    webhook_secret = "whsec_ai_pack"
    deliveries: list[dict[str, object]] = []

    def fake_send_email(*, recipients: list[str], subject: str, body: str) -> bool:
        deliveries.append({"recipients": recipients, "subject": subject, "body": body})
        return True

    monkeypatch.setattr(billing_routes, "send_email", fake_send_email)
    monkeypatch.setattr(settings, "stripe_webhook_secret", webhook_secret)
    monkeypatch.setattr(settings, "stripe_ai_credit_amount_usd", "5.00")
    monkeypatch.setattr(settings, "signup_ai_credit_usd", "0")

    client = TestClient(app)
    registered = register(client, email="aipack@example.com", password="strong-password-5")
    assert registered.status_code == 201
    user_id = registered.json()["user_id"]

    event = {
        "id": "evt_ai_pack_paid",
        "type": "checkout.session.completed",
        "data": {
            "object": {
                "id": "cs_ai_pack_paid",
                "client_reference_id": user_id,
                "customer": "cus_ai_pack",
                "payment_status": "paid",
                "amount_total": 500,
                "currency": "chf",
                "metadata": {
                    "user_id": user_id,
                    "duration_days": "0",
                    "plan": "ai_credits",
                    "ai_credit_amount_usd": "5.00",
                },
            },
        },
    }
    payload = json.dumps(event, separators=(",", ":")).encode("utf-8")
    headers = {
        "Stripe-Signature": stripe_signature(payload, webhook_secret),
        "Content-Type": "application/json",
    }

    first = client.post("/api/v1/billing/stripe/webhook", content=payload, headers=headers)
    assert first.status_code == 204
    second = client.post("/api/v1/billing/stripe/webhook", content=payload, headers=headers)
    assert second.status_code == 204

    status_payload = client.get("/api/v1/billing/status").json()
    assert status_payload["has_active_entitlement"] is False
    assert status_payload["available_redeem_codes"] == []
    assert Decimal(status_payload["ai_credit_balance_usd"]) == Decimal("5.000000")

    notifications = client.get("/api/v1/notifications")
    assert notifications.status_code == 200
    assert notifications.json()[0]["kind"] == "ai_credits"

    assert deliveries == []

    with TestingSessionLocal() as db:
        redeem_codes = db.query(RedeemCode).all()
        credit_entries = db.query(UserAiCreditTransaction).all()
        assert redeem_codes == []
        assert len(credit_entries) == 1
        assert credit_entries[0].source == "purchase"
        assert credit_entries[0].amount_usd == Decimal("5.000000")


def test_stripe_checkout_uses_selected_annual_price(monkeypatch):
    captured: dict[str, str] = {}

    class FakeResponse:
        def __enter__(self):
            return self

        def __exit__(self, *_args):
            return None

        def read(self) -> bytes:
            return b'{"id":"cs_annual","url":"https://checkout.stripe.test"}'

    def fake_urlopen(request, timeout):
        captured["payload"] = request.data.decode("utf-8")
        captured["timeout"] = str(timeout)
        return FakeResponse()

    monkeypatch.setattr(settings, "stripe_secret_key", "sk_test")
    monkeypatch.setattr(settings, "stripe_annual_price_id", "price_annual")
    monkeypatch.setattr(settings, "stripe_monthly_price_id", "price_monthly")
    monkeypatch.setattr("app.api.routes.billing.urlopen", fake_urlopen)

    client = TestClient(app)
    assert (
        register(client, email="checkout@example.com", password="strong-password-4").status_code
        == 201
    )
    response = client.post("/api/v1/billing/checkout", json={"plan": "annual"})

    assert response.status_code == 200
    assert response.json()["plan"] == "annual"
    parsed = parse_qs(captured["payload"])
    assert parsed["mode"] == ["subscription"]
    assert parsed["line_items[0][price]"] == ["price_annual"]
    assert parsed["metadata[plan]"] == ["annual"]


def test_wine_crud_requires_auth_and_is_scoped_to_active_household():
    client = TestClient(app)

    unauthenticated = client.get("/api/v1/wines")
    assert unauthenticated.status_code == 401

    registered = register(client)
    assert registered.status_code == 201

    created = client.post(
        "/api/v1/wines",
        json={
            "name": "Testamatta",
            "producer": "Bibi Graetz",
            "vintage": "2018",
            "quantity": 6,
            "price": 45.4,
            "currency": "CHF",
            "status": "Delivered",
            "rating": 4,
            "owner_share_pct": 50,
            "owners": [{"name": "Omar", "share_pct": 50}, {"name": "Luca", "share_pct": 50}],
        },
    )
    assert created.status_code == 201
    wine_id = created.json()["id"]

    with TestingSessionLocal() as db:
        other_household = Household(name="Other Cellar")
        db.add(other_household)
        db.flush()
        db.add(
            Wine(
                household_id=other_household.id,
                name="Hidden Wine",
                producer="Other",
                vintage="2020",
                quantity=1,
                price=10,
            ),
        )
        db.commit()

    listed = client.get("/api/v1/wines")
    assert listed.status_code == 200
    assert [wine["name"] for wine in listed.json()] == ["Testamatta"]
    assert listed.json()[0]["rating"] == 4

    invalid_rating = client.patch(f"/api/v1/wines/{wine_id}", json={"rating": 7})
    assert invalid_rating.status_code == 422

    updated = client.patch(
        f"/api/v1/wines/{wine_id}", json={"quantity": 5, "status": "Shipped", "rating": 6}
    )
    assert updated.status_code == 200
    assert updated.json()["quantity"] == 5
    assert updated.json()["status"] == "Shipped"
    assert updated.json()["rating"] == 6
    assert updated.json()["owner_share_pct"] == "50.00"
    assert updated.json()["owners"][0]["name"] == "Omar"

    missing = client.get(f"/api/v1/wines/{uuid.uuid4()}")
    assert missing.status_code == 404

    deleted = client.delete(f"/api/v1/wines/{wine_id}")
    assert deleted.status_code == 204
    assert client.get("/api/v1/wines").json() == []


def test_consuming_a_bottle_updates_quantity_and_preserves_tasting_history():
    client = TestClient(app)
    assert register(client).status_code == 201

    created = client.post(
        "/api/v1/wines",
        json={
            "name": "Castello Luigi",
            "producer": "Castello Luigi",
            "vintage": "2018",
            "quantity": 2,
            "price": 120,
            "currency": "CHF",
            "status": "Delivered",
        },
    )
    assert created.status_code == 201
    wine_id = created.json()["id"]

    consumed_once = client.post(
        f"/api/v1/wines/{wine_id}/consume",
        json={
            "consumed_at": "2026-06-02",
            "note": "Opened for dinner",
            "tasting_rating": 5,
            "tasting_enjoyment": "positive",
            "tasting_occasion": "Dinner",
            "tasting_pairing": "Risotto",
            "tasting_companions": "Friends",
        },
    )
    assert consumed_once.status_code == 200
    assert consumed_once.json()["quantity"] == 1
    assert consumed_once.json()["status"] == "Delivered"
    assert consumed_once.json()["rating"] == 5
    assert len(consumed_once.json()["tasting_history"]) == 1
    assert consumed_once.json()["tasting_history"][0]["note"] == "Opened for dinner"
    assert consumed_once.json()["tasting_history"][0]["rating"] == 5
    assert consumed_once.json()["tasting_history"][0]["enjoyment"] == "positive"

    consumed_twice = client.post(f"/api/v1/wines/{wine_id}/consume", json={"note": "Last bottle"})
    assert consumed_twice.status_code == 200
    assert consumed_twice.json()["quantity"] == 0
    assert consumed_twice.json()["status"] == "Consumed"
    assert len(consumed_twice.json()["tasting_history"]) == 2

    no_more = client.post(f"/api/v1/wines/{wine_id}/consume", json={})
    assert no_more.status_code == 400


def test_tasting_archive_reads_paginated_normalized_entries():
    client = TestClient(app)
    assert register(client).status_code == 201
    created = client.post(
        "/api/v1/wines",
        json={"name": "Archive Search Wine", "quantity": 2, "price": 25, "status": "Delivered"},
    )
    wine_id = created.json()["id"]
    assert (
        client.post(
            f"/api/v1/wines/{wine_id}/consume",
            json={"consumed_at": "2026-01-10", "note": "First archive note"},
        ).status_code
        == 200
    )
    assert (
        client.post(
            f"/api/v1/wines/{wine_id}/consume",
            json={"consumed_at": "2026-02-10", "note": "Second archive note", "tasting_rating": 5},
        ).status_code
        == 200
    )

    page = client.get("/api/v1/wines/tasting-archive?q=second&limit=1&offset=0")
    assert page.status_code == 200
    assert page.json()["total"] == 1
    assert page.json()["rated_count"] == 1
    assert page.json()["items"][0]["note"] == "Second archive note"


def test_user_can_create_and_switch_to_second_household():
    client = TestClient(app)
    assert register(client).status_code == 201

    before = client.get("/api/v1/household/memberships")
    assert before.status_code == 200
    assert len(before.json()) == 1
    assert before.json()[0]["household_name"] == "Main Cellar"

    created = client.post("/api/v1/household", json={"name": "Test Cellar"})
    assert created.status_code == 201
    assert created.json()["household_name"] == "Test Cellar"
    assert created.json()["role"] == "owner"

    session = client.get("/api/v1/session")
    assert session.status_code == 200
    assert session.json()["active_household_name"] == "Test Cellar"

    after = client.get("/api/v1/household/memberships")
    assert after.status_code == 200
    assert sorted(entry["household_name"] for entry in after.json()) == [
        "Main Cellar",
        "Test Cellar",
    ]

    switched = client.post(
        "/api/v1/household/switch", json={"household_id": before.json()[0]["household_id"]}
    )
    assert switched.status_code == 200
    assert switched.json()["household_name"] == "Main Cellar"


def test_household_deletion_requires_fallback_and_switches_session():
    client = TestClient(app)
    assert register(client).status_code == 201

    denied = client.delete("/api/v1/household")
    assert denied.status_code == 409

    created = client.post("/api/v1/household", json={"name": "Disposable Cellar"})
    assert created.status_code == 201
    created_household_id = created.json()["household_id"]

    listed = client.get("/api/v1/household/memberships")
    assert listed.status_code == 200
    fallback_household_id = next(
        entry["household_id"] for entry in listed.json() if entry["household_name"] == "Main Cellar"
    )

    deleted = client.delete("/api/v1/household")
    assert deleted.status_code == 204

    session = client.get("/api/v1/session")
    assert session.status_code == 200
    assert session.json()["active_household_name"] == "Main Cellar"
    assert session.json()["active_household_id"] == fallback_household_id

    memberships = client.get("/api/v1/household/memberships")
    assert memberships.status_code == 200
    assert all(entry["household_id"] != created_household_id for entry in memberships.json())


def test_household_preferences_persist_regional_gap_and_operational_snoozes():
    client = TestClient(app)
    assert client.get("/api/v1/household/regional-gap-settings").status_code == 401
    assert register(client).status_code == 201

    empty_settings = client.get("/api/v1/household/regional-gap-settings")
    assert empty_settings.status_code == 200
    assert empty_settings.json() == {
        "targets": [],
        "last_ai_suggestion": None,
        "updated_at": None,
    }

    suggestion = {
        "rationale": "Increase Burgundy exposure gradually.",
        "targets": [{"region": "Burgundy", "target_pct": 25}],
        "model": "gpt-5.4",
    }
    saved_settings = client.put(
        "/api/v1/household/regional-gap-settings",
        json={
            "targets": [
                {"region": "Bordeaux", "targetPct": 40},
                {"region": "Burgundy", "targetPct": 25},
            ],
            "last_ai_suggestion": suggestion,
        },
    )
    assert saved_settings.status_code == 200
    assert saved_settings.json()["targets"] == [
        {"region": "Bordeaux", "targetPct": 40},
        {"region": "Burgundy", "targetPct": 25},
    ]
    assert saved_settings.json()["last_ai_suggestion"] == suggestion
    assert saved_settings.json()["updated_at"] is not None

    snooze_payload = {
        "action_id": "refresh-value:barolo",
        "signature": "value-2026-07-17",
        "until": (datetime.now(UTC) + timedelta(days=14)).isoformat(),
    }
    created_snooze = client.post(
        "/api/v1/household/operational-action-snoozes", json=snooze_payload
    )
    assert created_snooze.status_code == 200
    assert created_snooze.json()["action_id"] == snooze_payload["action_id"]

    updated_snooze = client.post(
        "/api/v1/household/operational-action-snoozes",
        json={**snooze_payload, "signature": "value-2026-07-18"},
    )
    assert updated_snooze.status_code == 200
    listed_snoozes = client.get("/api/v1/household/operational-action-snoozes")
    assert listed_snoozes.status_code == 200
    assert listed_snoozes.json() == [
        {
            "action_id": snooze_payload["action_id"],
            "signature": "value-2026-07-18",
            "until": updated_snooze.json()["until"],
        }
    ]

    expired_snooze = client.post(
        "/api/v1/household/operational-action-snoozes",
        json={**snooze_payload, "action_id": "expired", "until": "2020-01-01T00:00:00Z"},
    )
    assert expired_snooze.status_code == 422


def test_operational_metrics_are_restricted_to_the_app_admin_and_sampled(monkeypatch):
    client = TestClient(app)
    assert client.get("/api/v1/admin/operations/overview").status_code == 401
    assert register(client).status_code == 201

    with TestingSessionLocal() as db:
        user = db.scalar(select(User).where(User.email == "owner@example.com"))
        household = db.scalar(select(Household).where(Household.name == "Main Cellar"))
        assert user is not None
        assert household is not None
        db.add(
            Wine(
                household_id=household.id,
                created_by_user_id=user.id,
                name="Photographed Wine",
                photo_version="photo-version",
            )
        )
        db.add(
            AiAuditLog(
                household_id=household.id,
                user_id=user.id,
                entity_type="catalog",
                entity_id=household.id,
                feature="wine_name_search",
                model="gpt-5.4",
                outcome="success",
                estimated_cost_usd=Decimal("0.012345"),
            )
        )
        db.commit()

    overview = client.get("/api/v1/admin/operations/overview")
    assert overview.status_code == 200
    payload = overview.json()
    assert payload["system"]["host"]["cpu_percent"] >= 0
    assert payload["application"]["requests_total"] >= 1
    assert payload["business"]["users_total"] == 1
    assert payload["business"]["users_enabled"] == 1
    assert payload["business"]["households_total"] == 1
    assert payload["business"]["bottles_in_cellar"] == 0
    assert payload["business"]["bottles_to_collect"] == 0
    assert payload["business"]["bottles_in_future_deliveries"] == 0
    assert payload["business"]["tastings_total"] == 0
    assert payload["business"]["tastings_30d"] == 0
    assert payload["business"]["wishlist_items_total"] == 0
    assert payload["business"]["ai_requests_30d"] == 1
    assert payload["business"]["wine_name_searches_30d"] == 1
    assert payload["business"]["wine_name_search_cost_30d_usd"] == 0.012345
    assert payload["business"]["wine_photos_total"] == 1
    assert payload["business"]["label_recognitions_30d"] == 0
    assert payload["business"]["coownership_active"] == 0
    assert payload["business"]["coownership_pending"] == 0
    assert payload["openai"]["available"] is False
    assert payload["history_retention_days"] == 14

    history = client.get("/api/v1/admin/operations/history?hours=24")
    assert history.status_code == 200
    assert history.json()["hours"] == 24
    assert len(history.json()["samples"]) == 1

    default_history = client.get("/api/v1/admin/operations/history")
    assert default_history.status_code == 200
    assert default_history.json()["hours"] == 1

    monkeypatch.setattr(settings, "operations_collector_token", "collector-test-token")
    rejected_collector = client.post("/api/v1/admin/operations/collect", json={"host": {}})
    assert rejected_collector.status_code == 401
    accepted_collector = client.post(
        "/api/v1/admin/operations/collect",
        headers={"X-Operations-Collector-Token": "collector-test-token"},
        json={"collected_at": "2026-07-17T00:00:00Z", "host": {"cpu_percent": 12.5}},
    )
    assert accepted_collector.status_code == 204
    assert len(client.get("/api/v1/admin/operations/history?hours=24").json()["samples"]) == 2


def test_user_tags_can_be_defined_and_assigned_to_wines():
    client = TestClient(app)
    assert register(client).status_code == 201

    tag = client.post("/api/v1/tags", json={"name": "En Primeur", "color": "#8f2039"})
    assert tag.status_code == 201
    assert tag.json()["name"] == "En Primeur"
    assert tag.json()["color"] == "#8f2039"
    assert client.get("/api/v1/tags").json()[0]["name"] == "En Primeur"
    renamed = client.patch(
        f"/api/v1/tags/{tag.json()['id']}", json={"name": "Primeur", "color": "#245142"}
    )
    assert renamed.status_code == 200
    assert renamed.json()["name"] == "Primeur"

    created = client.post(
        "/api/v1/wines",
        json={
            "name": "Tagged Wine",
            "quantity": 1,
            "price": 20,
            "tags": ["Primeur"],
        },
    )
    assert created.status_code == 201
    assert created.json()["tags"] == ["Primeur"]

    wine_id = created.json()["id"]
    listed = client.get("/api/v1/wines")
    assert listed.status_code == 200
    assert listed.json()[0]["tags"] == ["Primeur"]

    updated = client.patch(f"/api/v1/wines/{wine_id}", json={"tags": ["Ready"]})
    assert updated.status_code == 200
    assert updated.json()["tags"] == ["Ready"]
    assert sorted(tag["name"] for tag in client.get("/api/v1/tags").json()) == ["Primeur", "Ready"]

    deleted = client.delete(f"/api/v1/tags/{tag.json()['id']}")
    assert deleted.status_code == 204


def test_invite_acceptance_and_viewer_permissions():
    owner = TestClient(app)
    member = TestClient(app)

    assert register(owner).status_code == 201
    renamed = owner.patch("/api/v1/household", json={"name": "Renamed Cellar"})
    assert renamed.status_code == 200
    assert renamed.json()["household_name"] == "Renamed Cellar"
    assert owner.get("/api/v1/session").json()["active_household_name"] == "Renamed Cellar"

    invite = owner.post(
        "/api/v1/household/invites", json={"email": "viewer@example.com", "role": "viewer"}
    )
    assert invite.status_code == 201
    invite_id = invite.json()["id"]
    invite_token = invite.json()["invite_token"]
    assert invite_token

    invites = owner.get("/api/v1/household/invites")
    assert invites.status_code == 200
    assert invites.json()[0]["email"] == "viewer@example.com"

    members_before = owner.get("/api/v1/household/members")
    assert members_before.status_code == 200
    assert [member_data["email"] for member_data in members_before.json()] == ["owner@example.com"]

    registered_viewer = register(member, email="viewer@example.com", password="strong-password-2")
    assert registered_viewer.status_code == 201
    assert registered_viewer.json()["pending_approval"] is True
    pending_viewers = owner.get("/api/v1/auth/pending-users")
    viewer_user = next(
        user for user in pending_viewers.json() if user["email"] == "viewer@example.com"
    )
    assert owner.post(f"/api/v1/auth/pending-users/{viewer_user['id']}/approve").status_code == 200
    assert (
        member.post(
            "/api/v1/auth/login",
            json={"email": "viewer@example.com", "password": "strong-password-2"},
        ).status_code
        == 200
    )
    redeem_code = create_redeem_code(owner, email="viewer@example.com")
    assert member.post("/api/v1/billing/redeem", json={"code": redeem_code}).status_code == 200
    received_invites = member.get("/api/v1/household/invites/received")
    assert received_invites.status_code == 200
    assert received_invites.json()[0]["household_name"] == "Renamed Cellar"
    invite_center = member.get("/api/v1/notifications/center")
    assert invite_center.status_code == 200
    invite_item = next(
        item for item in invite_center.json()["items"] if item["source"] == "household_invite"
    )
    assert invite_item["category"] == "action"
    assert invite_item["state"] == "pending"
    assert invite_center.json()["counts"]["actionable"] >= 1
    assert invite_center.json()["counts"]["unread"] >= 1
    accepted = member.post(f"/api/v1/household/invites/{invite_id}/accept")
    assert accepted.status_code == 200
    assert accepted.json()["role"] == "viewer"
    invited_membership_id = accepted.json()["membership_id"]
    owner_updates = owner.get("/api/v1/notifications/center")
    assert any(
        item["kind"] == "household_invite_accepted" and item["category"] == "update"
        for item in owner_updates.json()["items"]
    )

    members_after = owner.get("/api/v1/household/members")
    assert members_after.status_code == 200
    assert sorted(member_data["email"] for member_data in members_after.json()) == [
        "owner@example.com",
        "viewer@example.com",
    ]

    private_wine = owner.post(
        "/api/v1/wines", json={"name": "Private Wine", "quantity": 1, "price": 50}
    )
    assert private_wine.status_code == 201
    owner_wine = owner.post(
        "/api/v1/wines",
        json={
            "name": "Shared Wine",
            "quantity": 6,
            "price": 20,
            "owners": [
                {"name": "Cellar Owner", "email": "owner@example.com", "share_pct": 50},
                {"name": "Viewer", "email": "viewer@example.com", "share_pct": 50},
            ],
        },
    )
    assert owner_wine.status_code == 201
    owner_wine_id = owner_wine.json()["id"]
    eligible_recipients = owner.get(f"/api/v1/wines/{owner_wine_id}/share-offer-recipients")
    assert eligible_recipients.status_code == 200
    assert eligible_recipients.json() == [
        {"email": "viewer@example.com", "display_name": "Viewer", "share_pct": "50.0"}
    ]
    share_offer = owner.post(
        f"/api/v1/wines/{owner_wine_id}/share-offers",
        json={
            "email": "viewer@example.com",
            "share_pct": 50,
            "message": "You own this allocation too.",
        },
    )
    assert share_offer.status_code == 201
    assert share_offer.json()["recipient_email"] == "viewer@example.com"
    outgoing_offers = owner.get(f"/api/v1/wines/{owner_wine_id}/share-offers")
    assert outgoing_offers.status_code == 200
    assert len(outgoing_offers.json()) == 1
    cancelled_offer = owner.delete(f"/api/v1/wines/share-offers/{outgoing_offers.json()[0]['id']}")
    assert cancelled_offer.status_code == 200
    assert cancelled_offer.json()["status"] == "cancelled"
    reopened_recipients = owner.get(f"/api/v1/wines/{owner_wine_id}/share-offer-recipients").json()
    assert len(reopened_recipients) == 1
    assert reopened_recipients[0]["email"] == "viewer@example.com"
    assert reopened_recipients[0]["share_pct"] == "50.0"
    share_offer = owner.post(
        f"/api/v1/wines/{owner_wine_id}/share-offers",
        json={
            "email": "viewer@example.com",
            "share_pct": 50,
            "message": "You own this allocation too.",
        },
    )
    assert share_offer.status_code == 201
    assert owner.get(f"/api/v1/wines/{owner_wine_id}/share-offer-recipients").json() == []
    assert owner.patch(f"/api/v1/wines/{owner_wine_id}", json={"quantity": 5}).status_code == 200

    offers = member.get("/api/v1/wines/share-offers")
    assert offers.status_code == 200
    assert offers.json()[0]["wine_name"] == "Shared Wine"
    share_center = member.get("/api/v1/notifications/center")
    share_item = next(
        item for item in share_center.json()["items"] if item["source"] == "share_offer"
    )
    assert share_item["resource_id"] == offers.json()[0]["id"]
    assert share_item["action_kind"] == "decide_share_offer"
    assert share_center.json()["counts"]["unread"] >= 1
    accepted_offer = member.post(f"/api/v1/wines/share-offers/{offers.json()[0]['id']}/accept")
    assert accepted_offer.status_code == 200
    assert accepted_offer.json()["quantity"] == 5
    assert accepted_offer.json()["owner_share_pct"] == "50.00"
    assert sorted(owner["email"] for owner in accepted_offer.json()["owners"]) == [
        "owner@example.com",
        "viewer@example.com",
    ]
    viewer_owner = next(
        owner for owner in accepted_offer.json()["owners"] if owner["email"] == "viewer@example.com"
    )
    assert viewer_owner["share_pct"] == 50.0
    owner_share_updates = owner.get("/api/v1/notifications/center")
    assert any(
        item["kind"] == "share_offer_response" and item["category"] == "update"
        for item in owner_share_updates.json()["items"]
    )
    assert (
        member.get(f"/api/v1/wines/{accepted_offer.json()['id']}/share-offer-recipients").json()
        == []
    )
    returned_share = member.post(
        f"/api/v1/wines/{accepted_offer.json()['id']}/share-offers",
        json={"email": "owner@example.com", "share_pct": 50},
    )
    assert returned_share.status_code == 400
    personal_list = member.get("/api/v1/wines")
    assert personal_list.status_code == 200
    assert [wine["name"] for wine in personal_list.json()] == ["Shared Wine"]
    assert personal_list.json()[0]["quantity"] == 5
    agreement_created_after_share = owner.post(
        f"/api/v1/co-ownership-agreements/wines/{owner_wine_id}",
        json={
            "participants": [
                {"name": "Cellar Owner", "email": "owner@example.com", "share_pct": 50},
                {"name": "Viewer", "email": "viewer@example.com", "share_pct": 50},
            ],
        },
    )
    assert agreement_created_after_share.status_code == 201
    recipient_agreements = member.get(
        f"/api/v1/co-ownership-agreements/wines/{accepted_offer.json()['id']}"
    )
    assert recipient_agreements.status_code == 200
    assert [item["id"] for item in recipient_agreements.json()] == [
        agreement_created_after_share.json()["id"]
    ]
    accepted_outgoing = owner.get(f"/api/v1/wines/{owner_wine_id}/share-offers")
    assert accepted_outgoing.status_code == 200
    assert accepted_outgoing.json()[0]["status"] == "accepted"
    revocation = owner.post(
        f"/api/v1/wines/share-offers/{accepted_outgoing.json()[0]['id']}/revoke"
    )
    assert revocation.status_code == 200
    assert revocation.json()["status"] == "revocation_pending"
    revocation_notifications = member.get("/api/v1/notifications")
    revocation_notification = next(
        item for item in revocation_notifications.json() if item["kind"] == "share_revocation"
    )
    assert revocation_notification["title"] == "Rimozione richiesta: Shared Wine"
    assert "owner@example.com" in revocation_notification["message"]
    assert "Shared Wine" in revocation_notification["message"]
    assert "50.00% di 5 bottiglie" in revocation_notification["message"]
    approved_revocation = member.post(
        f"/api/v1/wines/share-offers/{accepted_outgoing.json()[0]['id']}/revocation/approve"
    )
    assert approved_revocation.status_code == 200
    assert approved_revocation.json()["status"] == "revoked"
    assert member.get("/api/v1/wines").json() == []
    revocation_result = next(
        item
        for item in owner.get("/api/v1/notifications").json()
        if item["kind"] == "share_revocation_result"
    )
    assert revocation_result["title"] == "Revoca comproprietà: Shared Wine"
    assert "approvato" in revocation_result["message"]
    reopened_after_revocation = owner.get(
        f"/api/v1/wines/{owner_wine_id}/share-offer-recipients"
    ).json()
    assert len(reopened_after_revocation) == 1
    assert reopened_after_revocation[0]["email"] == "viewer@example.com"
    assert reopened_after_revocation[0]["share_pct"] == "50.0"

    member_households = member.get("/api/v1/household/memberships")
    assert member_households.status_code == 200
    shared_household = next(item for item in member_households.json() if item["role"] == "viewer")
    assert shared_household["household_name"] == "Renamed Cellar"
    assert invited_membership_id

    switched = member.post(
        "/api/v1/household/switch", json={"household_id": shared_household["household_id"]}
    )
    assert switched.status_code == 200
    viewer_rename = member.patch("/api/v1/household", json={"name": "Viewer Rename"})
    assert viewer_rename.status_code == 403

    viewer_list = member.get("/api/v1/wines")
    assert viewer_list.status_code == 200
    assert [wine["name"] for wine in viewer_list.json()] == ["Shared Wine"]
    assert viewer_list.json()[0]["quantity"] == 5

    visibility_update = owner.patch(
        f"/api/v1/household/members/{invited_membership_id}",
        json={"visibility_scope": "all"},
    )
    assert visibility_update.status_code == 200
    assert visibility_update.json()["visibility_scope"] == "all"
    full_viewer_list = member.get("/api/v1/wines")
    assert full_viewer_list.status_code == 200
    assert [wine["name"] for wine in full_viewer_list.json()] == ["Private Wine", "Shared Wine"]

    viewer_create = member.post(
        "/api/v1/wines", json={"name": "Blocked Wine", "quantity": 1, "price": 20}
    )
    assert viewer_create.status_code == 403

    promoted = owner.patch(
        f"/api/v1/household/members/{invited_membership_id}", json={"role": "member"}
    )
    assert promoted.status_code == 200
    assert promoted.json()["role"] == "member"

    assert member.post("/api/v1/auth/logout").status_code == 204
    assert (
        member.post(
            "/api/v1/auth/login",
            json={"email": "viewer@example.com", "password": "strong-password-2"},
        ).status_code
        == 200
    )
    shared_household = next(
        item
        for item in member.get("/api/v1/household/memberships").json()
        if item["role"] == "member"
    )
    assert (
        member.post(
            "/api/v1/household/switch", json={"household_id": shared_household["household_id"]}
        ).status_code
        == 200
    )
    member_create = member.post(
        "/api/v1/wines", json={"name": "Allowed Wine", "quantity": 1, "price": 30}
    )
    assert member_create.status_code == 201

    viewer_members = member.get("/api/v1/household/members")
    assert viewer_members.status_code == 200

    removed = owner.delete(f"/api/v1/household/members/{invited_membership_id}")
    assert removed.status_code == 204
    members_after_remove = owner.get("/api/v1/household/members")
    assert [member_data["email"] for member_data in members_after_remove.json()] == [
        "owner@example.com"
    ]

    revoked = owner.delete(f"/api/v1/household/invites/{invite_id}")
    assert revoked.status_code == 204
    assert owner.get("/api/v1/household/invites").json() == []


def test_legacy_import_scopes_wines_and_wishlist_to_household():
    client = TestClient(app)
    assert register(client).status_code == 201
    legacy_payload = {
        "wines": [
            {
                "id": str(uuid.uuid4()),
                "name": "Imported Wine",
                "producer": "Legacy Producer",
                "vintage": "2020",
                "quantity": 2,
                "format": "Bottle (750ml)",
                "type": "Red",
                "region": "Bordeaux",
                "price": 42,
                "current_value": 50,
                "tags": ["Imported"],
                "scores": [{"critic": "Test", "score": "95/100", "note": "Good"}],
            },
        ],
        "wishlist": [
            {
                "id": str(uuid.uuid4()),
                "name": "Wanted Wine",
                "producer": "Wishlist Producer",
                "target_price": 30,
                "priority": "High",
                "purpose": "Drink",
                "ai_strategy": '{"signal":"Buon prezzo","reason":"Sotto mercato.","price_assessment":"Target interessante.","market_price_low":40,"market_price_high":50,"market_price_currency":"CHF"}',
                "ai_purpose_advice": '{"recommended_purpose":"Cellar","signal":"Da cantina","reason":"Annata giovane.","confidence":"medium"}',
            },
        ],
    }

    preview = client.post("/api/v1/imports/legacy-json/preview", json=legacy_payload)
    assert preview.status_code == 200
    assert preview.json()["wine_new"] == 1
    assert preview.json()["wishlist_new"] == 1

    imported = client.post("/api/v1/imports/legacy-json", json=legacy_payload)
    assert imported.status_code == 200
    assert imported.json()["wines_imported"] == 1
    assert imported.json()["wishlist_imported"] == 1

    duplicate_preview = client.post("/api/v1/imports/legacy-json/preview", json=legacy_payload)
    assert duplicate_preview.json()["wine_duplicates"] == 1
    assert duplicate_preview.json()["wishlist_duplicates"] == 1

    skipped = client.post("/api/v1/imports/legacy-json?mode=skip_duplicates", json=legacy_payload)
    assert skipped.status_code == 200
    assert skipped.json()["wines_skipped"] == 1
    assert skipped.json()["wishlist_skipped"] == 1

    wines = client.get("/api/v1/wines")
    assert wines.status_code == 200
    assert wines.json()[0]["name"] == "Imported Wine"
    assert wines.json()[0]["tags"] == ["Imported"]
    assert wines.json()[0]["scores"][0]["critic"] == "Test"

    wishlist_lists = client.get("/api/v1/wishlist/lists")
    assert wishlist_lists.status_code == 200
    imported_list = next(item for item in wishlist_lists.json() if item["item_count"] == 1)
    wishlist = client.get(f"/api/v1/wishlist?wishlist_list_id={imported_list['id']}")
    assert wishlist.status_code == 200
    assert wishlist.json()[0]["name"] == "Wanted Wine"
    assert wishlist.json()[0]["priority"] == "High"
    assert (
        wishlist.json()[0]["ai_strategy"]
        == "Buon prezzo. Sotto mercato. Target interessante. Fascia mercato stimata: CHF 40-50."
    )
    assert (
        wishlist.json()[0]["ai_purpose_advice"]
        == "Scopo consigliato: Cellar. Da cantina. Annata giovane. Confidenza: medium."
    )

    wishlist_id = wishlist.json()[0]["id"]
    converted = client.post(f"/api/v1/wishlist/{wishlist_id}/convert", json={"quantity": 3})
    assert converted.status_code == 201
    assert converted.json()["wine_id"]
    assert client.get("/api/v1/wishlist").json() == []
    assert sorted(wine["name"] for wine in client.get("/api/v1/wines").json()) == [
        "Imported Wine",
        "Wanted Wine",
    ]
    assert (
        next(wine for wine in client.get("/api/v1/wines").json() if wine["name"] == "Wanted Wine")[
            "quantity"
        ]
        == 3
    )

    exported = client.get("/api/v1/imports/export-json")
    assert exported.status_code == 200
    assert exported.json()["schema"] == "winecellarmulti.export.v2"
    assert [wine["name"] for wine in exported.json()["wines"]] == ["Imported Wine", "Wanted Wine"]

    replacement_payload = {
        "wines": [
            {"id": str(uuid.uuid4()), "name": "Replacement Wine", "quantity": 1, "price": 10}
        ],
        "wishlist": [],
    }
    replaced = client.post("/api/v1/imports/legacy-json?mode=replace_all", json=replacement_payload)
    assert replaced.status_code == 200
    assert replaced.json()["wines_deleted"] == 2
    assert [wine["name"] for wine in client.get("/api/v1/wines").json()] == ["Replacement Wine"]

    emptied = client.delete("/api/v1/imports/cellar")
    assert emptied.status_code == 200
    assert emptied.json()["wines_deleted"] == 1
    assert client.get("/api/v1/wines").json() == []


def test_vinaris_export_roundtrip_uses_selected_blocks():
    client = TestClient(app)
    assert register(client).status_code == 201

    created_wine = client.post(
        "/api/v1/wines",
        json={
            "name": "Roundtrip Wine",
            "producer": "Roundtrip Producer",
            "vintage": "2019",
            "quantity": 3,
            "price": 33,
            "currency": "CHF",
            "status": "Delivered",
            "tags": ["Roundtrip"],
        },
    )
    assert created_wine.status_code == 201

    created_wishlist = client.post(
        "/api/v1/wishlist",
        json={
            "name": "Roundtrip Wishlist",
            "producer": "Wishlist Producer",
            "target_price": 55,
            "currency": "CHF",
            "priority": "High",
            "purpose": "Drink",
        },
    )
    assert created_wishlist.status_code == 201
    consumed = client.post(
        f"/api/v1/wines/{created_wine.json()['id']}/consume",
        json={
            "consumed_at": "2026-06-03",
            "note": "Saved in backup history",
            "tasting_rating": 6,
        },
    )
    assert consumed.status_code == 200
    assert consumed.json()["quantity"] == 2
    assert len(consumed.json()["tasting_history"]) == 1

    exported = client.get(
        "/api/v1/imports/export-json?include_members=false&include_invites=false&include_share_offers=false&include_tags=false&include_ai_audit=false",
    )
    assert exported.status_code == 200
    export_payload = exported.json()
    assert export_payload["schema"] == "winecellarmulti.export.v2"
    assert export_payload["included_blocks"] == ["wines", "wishlist"]
    assert export_payload["wines"][0]["tasting_history"][0]["note"] == "Saved in backup history"

    preview = client.post("/api/v1/imports/json/preview", json=export_payload)
    assert preview.status_code == 200
    assert preview.json()["format"] == "vinaris"
    assert preview.json()["included_blocks"] == ["wines", "wishlist"]
    assert preview.json()["wines_total"] == 1
    assert preview.json()["wishlist_total"] == 1

    emptied = client.delete("/api/v1/imports/cellar")
    assert emptied.status_code == 200

    imported = client.post("/api/v1/imports/json?mode=replace_all", json=export_payload)
    assert imported.status_code == 200
    assert imported.json()["wines_imported"] == 1
    assert imported.json()["wishlist_imported"] == 1
    assert imported.json()["members_imported"] == 0
    assert imported.json()["user_tags_imported"] == 0

    wines = client.get("/api/v1/wines")
    assert wines.status_code == 200
    assert [wine["name"] for wine in wines.json()] == ["Roundtrip Wine"]
    restored_wine = client.get(f"/api/v1/wines/{wines.json()[0]['id']}")
    assert restored_wine.status_code == 200
    assert restored_wine.json()["tasting_history"][0]["note"] == "Saved in backup history"

    wishlist_lists = client.get("/api/v1/wishlist/lists")
    assert wishlist_lists.status_code == 200
    imported_list = next(item for item in wishlist_lists.json() if item["item_count"] == 1)
    wishlist = client.get(f"/api/v1/wishlist?wishlist_list_id={imported_list['id']}")
    assert wishlist.status_code == 200
    assert [item["name"] for item in wishlist.json()] == ["Roundtrip Wishlist"]


def test_vinaris_import_from_other_household_reassigns_conflicting_ids():
    source = TestClient(app)
    target = TestClient(app)
    assert register(source, email="source@example.com").status_code == 201
    assert register(target, email="target@example.com").status_code == 201
    pending_users = source.get("/api/v1/auth/pending-users")
    assert pending_users.status_code == 200
    target_user = next(
        user for user in pending_users.json() if user["email"] == "target@example.com"
    )
    assert source.post(f"/api/v1/auth/pending-users/{target_user['id']}/approve").status_code == 200
    target_login = target.post(
        "/api/v1/auth/login", json={"email": "target@example.com", "password": "strong-password-1"}
    )
    assert target_login.status_code == 200
    target_session = target.get("/api/v1/session").json()
    with TestingSessionLocal() as db:
        db.add(
            UserEntitlement(
                user_id=uuid.UUID(target_session["user_id"]),
                source="test",
                valid_from=datetime.now(UTC),
                valid_until=datetime.now(UTC) + timedelta(days=30),
            ),
        )
        db.commit()

    created_wine = source.post(
        "/api/v1/wines",
        json={
            "name": "Shared Export Wine",
            "producer": "Source Producer",
            "quantity": 1,
            "price": 42,
            "currency": "CHF",
        },
    )
    assert created_wine.status_code == 201
    source_session = source.get("/api/v1/session").json()
    source_wine_id = uuid.UUID(created_wine.json()["id"])
    audit_id = uuid.uuid4()

    with TestingSessionLocal() as db:
        db.add(
            AiAuditLog(
                id=audit_id,
                household_id=uuid.UUID(source_session["active_household_id"]),
                user_id=uuid.UUID(source_session["user_id"]),
                entity_type="wine",
                entity_id=source_wine_id,
                feature="ai_value",
                model="gpt-5.4-mini",
                outcome="success",
                summary="Imported from source household",
                sources=[],
                input_tokens=10,
                cached_input_tokens=0,
                output_tokens=5,
                total_tokens=15,
                estimated_cost_usd=Decimal("0.001000"),
                created_at=datetime.now(UTC),
            ),
        )
        db.commit()

    exported = source.get(
        "/api/v1/imports/export-json?include_members=false&include_invites=false&include_share_offers=false&include_tags=false",
    )
    assert exported.status_code == 200
    export_payload = exported.json()
    assert "ai_audit" in export_payload["included_blocks"]

    preview = target.post("/api/v1/imports/json/preview", json=export_payload)
    assert preview.status_code == 200
    assert preview.json()["format"] == "vinaris"

    imported = target.post(
        "/api/v1/imports/json?mode=skip_duplicates",
        json={
            **export_payload,
            "import_blocks": ["wines", "wishlist", "user_tags", "ai_audit"],
        },
    )
    assert imported.status_code == 200
    assert imported.json()["wines_imported"] == 1
    assert imported.json()["ai_audit_imported"] == 1
    assert imported.json()["members_imported"] == 0

    with TestingSessionLocal() as db:
        target_household_id = uuid.UUID(target.get("/api/v1/session").json()["active_household_id"])
        memberships = list(
            db.query(Membership).filter(Membership.household_id == target_household_id).all()
        )
        assert len(memberships) == 1


def test_ai_generation_requires_configured_openai_key(monkeypatch):
    monkeypatch.setattr(settings, "openai_api_key", "")
    client = TestClient(app)
    assert register(client).status_code == 201
    created = client.post("/api/v1/wines", json={"name": "AI Wine", "quantity": 1, "price": 20})
    assert created.status_code == 201

    audit = client.get("/api/v1/ai/audit")
    assert audit.status_code == 200
    assert audit.json() == []
    usage = client.get("/api/v1/ai/usage")
    assert usage.status_code == 200
    assert usage.json()["all_time"]["requests"] == 0
    assert usage.json()["all_time"]["estimated_cost_usd"] == "0.000000"

    settings_response = client.get("/api/v1/ai/settings")
    assert settings_response.status_code == 200
    assert settings_response.json()["has_openai_api_key"] is False
    assert "gpt-5.5" in settings_response.json()["model_options"]
    assert settings_response.json()["pairing_model"] == "gpt-5.4"
    assert settings_response.json()["model_advisor_enabled"] is False

    updated_settings = client.patch(
        "/api/v1/ai/settings",
        json={
            "openai_api_key": "sk-test",
            "ai_notes_model": "gpt-5.5",
            "pairing_model": "gpt-5.5",
            "model_advisor_enabled": True,
        },
    )
    assert updated_settings.status_code == 200
    assert updated_settings.json()["has_openai_api_key"] is True
    assert updated_settings.json()["ai_notes_model"] == "gpt-5.5"
    assert updated_settings.json()["pairing_model"] == "gpt-5.5"
    assert updated_settings.json()["model_advisor_enabled"] is True
    with TestingSessionLocal() as db:
        stored_settings = db.get(
            UserAiSettings, uuid.UUID(client.get("/api/v1/session").json()["user_id"])
        )
        assert stored_settings is not None
        assert stored_settings.openai_api_key.startswith("enc:v1:")
        assert "sk-test" not in stored_settings.openai_api_key

    cleared_settings = client.patch("/api/v1/ai/settings", json={"openai_api_key": ""})
    assert cleared_settings.status_code == 200
    assert cleared_settings.json()["has_openai_api_key"] is False

    generated = client.post(f"/api/v1/ai/wines/{created.json()['id']}/notes")
    assert generated.status_code == 503
    assert generated.json()["detail"] == "No AI provider configured"


def test_ai_pack_usage_applies_markup_for_end_users(monkeypatch):
    from app.api.routes import ai as ai_routes

    client = TestClient(app)
    assert register(client).status_code == 201
    session = client.get("/api/v1/session").json()
    with TestingSessionLocal() as db:
        current_user = db.get(User, uuid.UUID(session["user_id"]))
        assert current_user is not None
        current_user.is_app_admin = False
        db.add(
            UserEntitlement(
                user_id=current_user.id,
                source="test",
                valid_from=datetime.now(UTC),
                valid_until=datetime.now(UTC) + timedelta(days=30),
            ),
        )
        db.add(
            UserAiCreditTransaction(
                user_id=current_user.id,
                amount_usd=Decimal("5.000000"),
                source="purchase",
                note="Seed AI budget",
            ),
        )
        db.commit()

    created = client.post("/api/v1/wines", json={"name": "AI Wine", "quantity": 1, "price": 20})
    assert created.status_code == 201
    assert client.patch("/api/v1/ai/settings", json={"provider_mode": "credits"}).status_code == 200

    monkeypatch.setattr(settings, "openai_api_key", "sk-app-test")
    monkeypatch.setattr(settings, "ai_pack_markup_percent", "20")

    def fake_create_response(*args, **kwargs):
        return OpenAIResponse(
            text="Structured cellar note.",
            usage=TokenUsage(input_tokens=1000, output_tokens=500, total_tokens=1500),
        )

    monkeypatch.setattr(ai_routes, "create_response", fake_create_response)

    generated = client.post(f"/api/v1/ai/wines/{created.json()['id']}/notes")
    assert generated.status_code == 200

    usage = client.get("/api/v1/ai/usage")
    assert usage.status_code == 200
    assert usage.json()["all_time"]["estimated_cost_usd"] == "0.003600"

    billing = client.get("/api/v1/billing/status")
    assert billing.status_code == 200
    assert billing.json()["ai_credit_balance_usd"] == "5.496400"
    with TestingSessionLocal() as db:
        entries = list(
            db.scalars(
                select(UserAiCreditTransaction).where(
                    UserAiCreditTransaction.user_id == uuid.UUID(session["user_id"])
                )
            )
        )
        assert any(
            entry.source == "usage_reservation" and entry.amount_usd < 0 for entry in entries
        )
        assert any(entry.source == "usage_refund" and entry.amount_usd > 0 for entry in entries)


def test_ai_pack_rejects_request_before_provider_when_balance_cannot_cover_minimum(monkeypatch):
    from app.api.routes import ai as ai_routes

    client = TestClient(app)
    assert register(client).status_code == 201
    session = client.get("/api/v1/session").json()
    with TestingSessionLocal() as db:
        current_user = db.get(User, uuid.UUID(session["user_id"]))
        assert current_user is not None
        current_user.is_app_admin = False
        db.add(
            UserEntitlement(
                user_id=current_user.id,
                source="test",
                valid_from=datetime.now(UTC),
                valid_until=datetime.now(UTC) + timedelta(days=30),
            )
        )
        db.add(
            UserAiCreditTransaction(
                user_id=current_user.id,
                amount_usd=Decimal("-0.499500"),
                source="test_adjustment",
                note="Leave less than the minimum safe request budget",
            )
        )
        db.commit()

    created = client.post("/api/v1/wines", json={"name": "Budget Guard Wine", "quantity": 1})
    assert created.status_code == 201
    assert client.patch("/api/v1/ai/settings", json={"provider_mode": "credits"}).status_code == 200
    monkeypatch.setattr(settings, "openai_api_key", "sk-app-test")

    provider_called = False

    def fake_create_response(*args, **kwargs):
        nonlocal provider_called
        provider_called = True
        raise AssertionError("provider must not be called without a safe reservation")

    monkeypatch.setattr(ai_routes, "create_response", fake_create_response)
    generated = client.post(f"/api/v1/ai/wines/{created.json()['id']}/notes")

    assert generated.status_code == 402
    assert provider_called is False
    billing = client.get("/api/v1/billing/status")
    assert billing.json()["ai_credit_balance_usd"] == "0.000500"


def test_ai_pack_refunds_reservation_when_provider_fails(monkeypatch):
    from app.api.routes import ai as ai_routes

    client = TestClient(app)
    assert register(client).status_code == 201
    created = client.post("/api/v1/wines", json={"name": "Refund Wine", "quantity": 1})
    assert created.status_code == 201
    assert client.patch("/api/v1/ai/settings", json={"provider_mode": "credits"}).status_code == 200
    monkeypatch.setattr(settings, "openai_api_key", "sk-app-test")
    starting_balance = client.get("/api/v1/billing/status").json()["ai_credit_balance_usd"]

    def fake_create_response(*args, **kwargs):
        raise HTTPException(status_code=502, detail="Provider unavailable")

    monkeypatch.setattr(ai_routes, "create_response", fake_create_response)
    generated = client.post(f"/api/v1/ai/wines/{created.json()['id']}/notes")

    assert generated.status_code == 502
    assert client.get("/api/v1/billing/status").json()["ai_credit_balance_usd"] == starting_balance


def test_ai_pack_usage_keeps_base_cost_for_app_admin(monkeypatch):
    from app.api.routes import ai as ai_routes

    client = TestClient(app)
    assert register(client).status_code == 201
    session = client.get("/api/v1/session").json()
    with TestingSessionLocal() as db:
        current_user = db.get(User, uuid.UUID(session["user_id"]))
        assert current_user is not None
        db.add(
            UserAiCreditTransaction(
                user_id=current_user.id,
                amount_usd=Decimal("5.000000"),
                source="purchase",
                note="Seed AI budget",
            ),
        )
        db.commit()

    created = client.post(
        "/api/v1/wines", json={"name": "Admin AI Wine", "quantity": 1, "price": 20}
    )
    assert created.status_code == 201
    assert client.patch("/api/v1/ai/settings", json={"provider_mode": "credits"}).status_code == 200

    monkeypatch.setattr(settings, "openai_api_key", "sk-app-test")
    monkeypatch.setattr(settings, "ai_pack_markup_percent", "20")

    def fake_create_response(*args, **kwargs):
        return OpenAIResponse(
            text="Structured cellar note.",
            usage=TokenUsage(input_tokens=1000, output_tokens=500, total_tokens=1500),
        )

    monkeypatch.setattr(ai_routes, "create_response", fake_create_response)

    generated = client.post(f"/api/v1/ai/wines/{created.json()['id']}/notes")
    assert generated.status_code == 200

    usage = client.get("/api/v1/ai/usage")
    assert usage.status_code == 200
    assert usage.json()["all_time"]["estimated_cost_usd"] == "0.003000"

    billing = client.get("/api/v1/billing/status")
    assert billing.status_code == 200
    assert billing.json()["ai_credit_balance_usd"] == "5.497000"


def test_wishlist_ai_features_are_separate(monkeypatch):
    from app.api.routes import ai as ai_routes

    client = TestClient(app)
    assert register(client).status_code == 201
    assert (
        client.patch("/api/v1/ai/settings", json={"openai_api_key": "sk-test"}).status_code == 200
    )
    created = client.post(
        "/api/v1/wishlist",
        json={
            "name": "Wishlist Wine",
            "producer": "Producer",
            "vintage": "2022",
            "target_price": 40,
            "currency": "CHF",
            "priority": "Medium",
            "purpose": "Drink",
            "status": "Evaluate",
            "ai_context_note": "In my region this bottle usually trades around CHF 150.",
        },
    )
    assert created.status_code == 201
    item_id = created.json()["id"]

    def fake_create_response(*args, **kwargs):
        assert "CHF 150" in args[2]
        schema_name = kwargs["json_schema"]["name"]
        if schema_name == "wishlist_strategy":
            text = '{"strategy":"Compra solo sotto target.","purpose_advice":"Non modificato.","recommended_status":"Watch","recommended_priority":"High"}'
        elif schema_name == "wishlist_purpose":
            text = '{"recommended_purpose":"Cellar","purpose_advice":"Meglio da cantina.","recommended_priority":"Medium"}'
        else:
            text = (
                '{"market_price":35,"market_price_currency":"CHF","price_advice":"Target prudente.","recommended_status":"Ready",'
                '"market_note":"Buona disponibilita in Svizzera.","market_sources":[{"merchant":"Vergani","country":"Switzerland","price":36,"currency":"CHF","url":"https://example.com/ver","note":"In stock"}]}'
            )
        return OpenAIResponse(
            text=text, usage=TokenUsage(input_tokens=100, output_tokens=50, total_tokens=150)
        )

    monkeypatch.setattr(ai_routes, "create_response", fake_create_response)

    strategy = client.post(f"/api/v1/ai/wishlist/{item_id}/strategy")
    assert strategy.status_code == 200
    assert strategy.json()["ai_strategy"] == "Compra solo sotto target."
    assert strategy.json()["ai_purpose_advice"] == "Non modificato."

    purpose = client.post(f"/api/v1/ai/wishlist/{item_id}/purpose")
    assert purpose.status_code == 200
    assert purpose.json()["purpose"] == "Cellar"
    assert purpose.json()["ai_purpose_advice"] == "Meglio da cantina."

    target_price = client.post(f"/api/v1/ai/wishlist/{item_id}/target-price")
    assert target_price.status_code == 200
    assert target_price.json()["target_price"] == "40.00"
    assert target_price.json()["ai_market_price"] == "35.00"
    assert target_price.json()["status"] == "Ready"
    assert target_price.json()["ai_strategy_generated_at"]
    assert target_price.json()["ai_purpose_generated_at"]
    wishlist = client.get("/api/v1/wishlist")
    assert wishlist.status_code == 200
    assert (
        wishlist.json()[0]["ai_strategy_generated_at"]
        == target_price.json()["ai_strategy_generated_at"]
    )
    assert (
        wishlist.json()[0]["ai_purpose_generated_at"]
        == target_price.json()["ai_purpose_generated_at"]
    )
    audit = client.get("/api/v1/ai/audit")
    assert audit.status_code == 200
    wishlist_target_entry = next(
        entry for entry in audit.json() if entry["feature"] == "wishlist_target_price"
    )
    assert any(
        source.get("kind") == "market_source" and source.get("merchant") == "Vergani"
        for source in wishlist_target_entry["sources"]
    )
    assert any(source.get("kind") == "market_note" for source in wishlist_target_entry["sources"])

    usage = client.get("/api/v1/ai/usage")
    assert usage.status_code == 200
    assert usage.json()["all_time"]["requests"] == 3


def test_wishlist_portfolio_strategy_records_structured_audit(monkeypatch):
    from app.api.routes import ai as ai_routes

    client = TestClient(app)
    assert register(client).status_code == 201
    assert (
        client.patch(
            "/api/v1/ai/settings", json={"openai_api_key": "sk-test", "wishlist_model": "gpt-5.5"}
        ).status_code
        == 200
    )
    first = client.post(
        "/api/v1/wishlist",
        json={
            "name": "Sassicaia",
            "producer": "Tenuta San Guido",
            "vintage": "2021",
            "target_price": 235,
            "currency": "CHF",
            "priority": "High",
            "purpose": "Cellar",
            "status": "Monitor",
        },
    )
    second = client.post(
        "/api/v1/wishlist",
        json={
            "name": "Tignanello",
            "producer": "Antinori",
            "vintage": "2021",
            "target_price": 118,
            "currency": "CHF",
            "priority": "High",
            "purpose": "Drink",
            "status": "Buy",
        },
    )
    assert first.status_code == 201
    assert second.status_code == 201

    def fake_create_response(*args, **kwargs):
        prompt = args[2]
        assert "Wishlist portfolio" in prompt
        assert "Sassicaia" in prompt
        assert "Tignanello" in prompt
        assert kwargs["json_schema"]["name"] == "wishlist_portfolio_strategy"
        return OpenAIResponse(
            text=(
                '{"overview":"La wishlist è concentrata su pochi acquisti forti e leggibili.",'
                '"buy_now":"Compra Tignanello se resta in area target: è il candidato più pronto e disciplinato.",'
                '"wait_watch":"Tieni Sassicaia sotto osservazione finché il mercato non rientra meglio nei tuoi parametri.",'
                '"allocation":"Difendi più budget sui vini ad alta convinzione e limita gli acquisti tattici secondari.",'
                '"next_step":"Aggiorna le stime di mercato mancanti e rivedi la wishlist a shortlist operativa."}'
            ),
            usage=TokenUsage(input_tokens=180, output_tokens=90, total_tokens=270),
        )

    monkeypatch.setattr(ai_routes, "create_response", fake_create_response)

    strategy = client.post("/api/v1/ai/wishlist/portfolio-strategy")
    assert strategy.status_code == 200
    assert strategy.json()["model"] == "gpt-5.5"
    assert "Tignanello" in strategy.json()["buy_now"]

    audit = client.get("/api/v1/ai/audit")
    assert audit.status_code == 200
    strategy_entry = next(
        entry for entry in audit.json() if entry["feature"] == "wishlist_portfolio_strategy"
    )
    strategy_source = next(
        source
        for source in strategy_entry["sources"]
        if source.get("kind") == "wishlist_portfolio_strategy"
    )
    assert strategy_source["item_count"] == 2
    assert "shortlist operativa" in strategy_source["next_step"]

    usage = client.get("/api/v1/ai/usage")
    assert usage.status_code == 200
    assert usage.json()["all_time"]["requests"] == 1


def test_wine_value_audit_includes_market_sources(monkeypatch):
    from app.api.routes import ai as ai_routes

    client = TestClient(app)
    assert register(client).status_code == 201
    assert (
        client.patch("/api/v1/ai/settings", json={"openai_api_key": "sk-test"}).status_code == 200
    )
    created = client.post(
        "/api/v1/wines",
        json={
            "name": "Dom Perignon",
            "producer": "Moet",
            "vintage": "2017",
            "quantity": 1,
            "price": 165,
            "currency": "CHF",
        },
    )
    assert created.status_code == 201
    wine_id = created.json()["id"]

    def fake_create_response(*args, **kwargs):
        assert kwargs["json_schema"]["name"] == "wine_value"
        return OpenAIResponse(
            text=(
                '{"current_value":172,"currency":"CHF","notes":"Stima prudente vicina al mercato.","market_note":"Offerta discreta presso merchant svizzeri.",'
                '"market_sources":[{"merchant":"Vergani Wiedikon","country":"Switzerland","price":170,"currency":"CHF","url":"https://example.com/vergani"},'
                '{"merchant":"WeinVogel","country":"Switzerland","price":174,"currency":"CHF","url":"https://example.com/weinvogel","note":"Low stock"}]}'
            ),
            usage=TokenUsage(input_tokens=120, output_tokens=60, total_tokens=180),
        )

    monkeypatch.setattr(ai_routes, "create_response", fake_create_response)

    generated = client.post(f"/api/v1/ai/wines/{wine_id}/value")
    assert generated.status_code == 200
    assert generated.json()["current_value"] == "172.00"
    assert generated.json()["ai_value_notes"] == "Stima prudente vicina al mercato."

    audit = client.get("/api/v1/ai/audit")
    assert audit.status_code == 200
    value_entry = next(entry for entry in audit.json() if entry["feature"] == "ai_value")
    assert any(
        source.get("kind") == "market_source" and source.get("merchant") == "Vergani Wiedikon"
        for source in value_entry["sources"]
    )
    assert any(
        source.get("kind") == "market_note" and "merchant svizzeri" in source.get("text", "")
        for source in value_entry["sources"]
    )


def test_ai_scores_respects_wine_exclusion_flag():
    client = TestClient(app)
    assert register(client).status_code == 201
    created = client.post(
        "/api/v1/wines",
        json={
            "name": "No Score Wine",
            "producer": "Producer",
            "vintage": "2022",
            "quantity": 1,
            "price": 20,
        },
    )
    assert created.status_code == 201

    updated = client.patch(
        f"/api/v1/wines/{created.json()['id']}", json={"scores_not_applicable": True}
    )
    assert updated.status_code == 200
    assert updated.json()["scores_not_applicable"] is True

    generated = client.post(f"/api/v1/ai/wines/{created.json()['id']}/scores")
    assert generated.status_code == 400
    assert "disabled" in generated.json()["detail"].lower()


def test_ai_scores_preserves_existing_scores_and_adds_only_new_ones(monkeypatch):
    from app.api.routes import ai as ai_routes

    client = TestClient(app)
    assert register(client).status_code == 201
    assert (
        client.patch(
            "/api/v1/ai/settings", json={"openai_api_key": "sk-test", "score_model": "gpt-5.5"}
        ).status_code
        == 200
    )
    created = client.post(
        "/api/v1/wines",
        json={
            "name": "Barolo",
            "producer": "Example Producer",
            "vintage": "2019",
            "quantity": 1,
            "price": 70,
            "scores": [{"critic": "Existing Critic", "score": "94", "note": "Stored score"}],
        },
    )
    assert created.status_code == 201

    def fake_create_response(*args, **kwargs):
        assert args[0] == "gpt-5.4"
        assert "Name: Barolo" in args[2]
        assert "Producer: Example Producer" in args[2]
        assert "Vintage: 2019" in args[2]
        assert "Existing Critic 94" not in args[2]
        assert "Grapes:" not in args[2]
        assert "AI notes:" not in args[2]
        assert kwargs["web_search"] is True
        assert kwargs["web_search_context_size"] == "medium"
        return OpenAIResponse(
            text='{"scores":[{"critic":"Existing Critic","score":"94","note":"Duplicate"},{"critic":"New Critic","score":"96","note":"New score"}]}',
            usage=TokenUsage(input_tokens=100, output_tokens=50, total_tokens=150),
        )

    monkeypatch.setattr(ai_routes, "create_response", fake_create_response)
    generated = client.post(
        f"/api/v1/ai/wines/{created.json()['id']}/scores", json={"model": "gpt-5.4"}
    )
    assert generated.status_code == 200
    assert generated.json()["scores"] == [
        {"critic": "Existing Critic", "score": "94", "note": "Stored score"},
        {"critic": "New Critic", "score": "96", "note": "New score"},
    ]


def test_ai_grapes_cache_verified_web_result(monkeypatch):
    from app.api.routes import ai as ai_routes

    client = TestClient(app)
    assert register(client).status_code == 201
    assert (
        client.patch("/api/v1/ai/settings", json={"openai_api_key": "sk-test"}).status_code == 200
    )
    created = client.post(
        "/api/v1/wines",
        json={
            "name": "Chateau Citran",
            "producer": "Chateau Citran",
            "vintage": "2018",
            "quantity": 1,
            "price": 25,
        },
    )
    assert created.status_code == 201

    def fake_create_response(*args, **kwargs):
        assert "Name: Chateau Citran" in args[2]
        assert "Producer: Chateau Citran" in args[2]
        assert "Vintage: 2018" in args[2]
        assert "Grapes:" not in args[2]
        assert "AI notes:" not in args[2]
        assert kwargs["web_search"] is True
        return OpenAIResponse(
            text='{"grapes":[{"name":"Merlot","percentage_from":50,"percentage_to":50},{"name":"Cabernet Sauvignon","percentage_from":39,"percentage_to":39},{"name":"Cabernet Franc","percentage_from":11,"percentage_to":11}],"notes":"Source-supported 2018 blend."}',
            usage=TokenUsage(input_tokens=100, output_tokens=50, total_tokens=150),
            web_sources=(
                {"url": "https://example.com/citran-2018", "title": "Chateau Citran 2018"},
            ),
        )

    monkeypatch.setattr(ai_routes, "create_response", fake_create_response)
    generated = client.post(f"/api/v1/ai/wines/{created.json()['id']}/grapes")
    assert generated.status_code == 200
    assert generated.json()["grapes_source_url"] == "https://example.com/citran-2018"
    assert generated.json()["grapes_verified_at"] is not None

    monkeypatch.setattr(
        ai_routes,
        "create_response",
        lambda *args, **kwargs: (_ for _ in ()).throw(
            AssertionError("cached grapes must not call AI")
        ),
    )
    cached = client.post(f"/api/v1/ai/wines/{created.json()['id']}/grapes")
    assert cached.status_code == 200
    assert cached.json()["grapes"] == generated.json()["grapes"]


def test_compare_wines_ai_returns_structured_comparison(monkeypatch):
    from app.api.routes import ai as ai_routes

    client = TestClient(app)
    assert register(client).status_code == 201
    assert (
        client.patch(
            "/api/v1/ai/settings", json={"openai_api_key": "sk-test", "pairing_model": "gpt-5.5"}
        ).status_code
        == 200
    )
    first = client.post(
        "/api/v1/wines",
        json={
            "name": "Tignanello",
            "producer": "Antinori",
            "vintage": "2021",
            "quantity": 1,
            "price": 140,
            "currency": "CHF",
            "type": "Red",
            "region": "Tuscany",
        },
    )
    second = client.post(
        "/api/v1/wines",
        json={
            "name": "Dom Perignon",
            "producer": "Moet",
            "vintage": "2015",
            "quantity": 1,
            "price": 180,
            "currency": "CHF",
            "type": "Sparkling",
            "region": "Champagne",
        },
    )
    assert first.status_code == 201
    assert second.status_code == 201

    def fake_create_response(*args, **kwargs):
        prompt = args[2]
        assert "WINE A" in prompt
        assert "WINE B" in prompt
        assert "Tignanello" in prompt
        assert "Dom Perignon" in prompt
        return OpenAIResponse(
            text=(
                '{"style_profile":"Tignanello vs Dom Perignon: Tignanello is darker, more structured, and more savory, while Dom Perignon is brighter, finer, and more lifted.",'
                '"readiness":"Dom Perignon looks easier to open now, while Tignanello can still benefit from more time.",'
                '"occasion":"Choose Dom Perignon for celebration and aperitif energy; choose Tignanello for a deeper dinner table moment.",'
                '"cellar_value":"Tignanello feels more cellar-driven as a red to follow over time, while Dom Perignon offers more immediate prestige and versatility.",'
                '"verdict":"Open Dom Perignon first if the goal is immediacy and finesse; keep Tignanello for a more structured meal or a later date."}'
            ),
            usage=TokenUsage(input_tokens=220, output_tokens=140, total_tokens=360),
            reasoning_effort="medium",
        )

    monkeypatch.setattr(ai_routes, "create_response", fake_create_response)

    compared = client.post(
        "/api/v1/ai/compare-wines",
        json={"wine_ids": [first.json()["id"], second.json()["id"]], "locale": "en"},
    )
    assert compared.status_code == 200
    assert compared.json()["model"] == "gpt-5.5"
    assert compared.json()["reasoning_effort"] == "medium"
    assert "Tignanello vs Dom Perignon" in compared.json()["style_profile"]
    assert "Open Dom Perignon first" in compared.json()["verdict"]
    assert compared.json()["estimated_cost_usd"] != "0.000000"
    assert " A " not in f" {compared.json()['readiness']} "
    assert " B " not in f" {compared.json()['readiness']} "

    audit = client.get("/api/v1/ai/audit")
    assert audit.status_code == 200
    compare_entry = next(entry for entry in audit.json() if entry["feature"] == "wine_compare")
    assert "Tignanello vs Dom Perignon" in compare_entry["summary"]
    assert compare_entry["reasoning_effort"] == "medium"
    assert compare_entry["estimated_cost_usd"] == compared.json()["estimated_cost_usd"]


def test_pairing_ai_uses_delivered_cellar_wines_and_market(monkeypatch):
    from app.api.routes import ai as ai_routes

    client = TestClient(app)
    assert register(client).status_code == 201
    settings_response = client.patch(
        "/api/v1/ai/settings",
        json={
            "openai_api_key": "sk-test",
            "pairing_model": "gpt-5.4",
            "pairing_candidate_limit": 5,
        },
    )
    assert settings_response.status_code == 200
    assert settings_response.json()["pairing_candidate_limit"] == 5
    delivered = client.post(
        "/api/v1/wines",
        json={
            "name": "Barolo",
            "producer": "Produttore",
            "vintage": "2019",
            "quantity": 2,
            "price": 55,
            "status": "Delivered",
            "type": "Red",
        },
    )
    assert delivered.status_code == 201
    ignored = client.post(
        "/api/v1/wines",
        json={"name": "Future Wine", "quantity": 1, "price": 30, "status": "Ordered"},
    )
    assert ignored.status_code == 201
    wine_id = delivered.json()["id"]

    def fake_create_response(*args, **kwargs):
        assert args[0] == "gpt-5.4"
        assert "Barolo" in args[2]
        assert "Future Wine" not in args[2]
        text = (
            '{"summary":"Il Barolo funziona con il brasato.",'
            f'"cellar_matches":[{{"wine_id":"{wine_id}","wine_name":"Barolo","producer":"Produttore","reason":"Struttura e tannino.","serving_note":"Servire a 18 C."}}],'
            '"market_recommendations":{"low":[{"name":"Chianti","producer":"Prod","price_hint":"entro 30 CHF","reason":"Acidita."}],"medium":[],"high":[]}}'
        )
        return OpenAIResponse(
            text=text,
            usage=TokenUsage(input_tokens=100, output_tokens=50, total_tokens=150),
            model="gpt-5.5",
        )

    monkeypatch.setattr(ai_routes, "create_response", fake_create_response)

    pairing = client.post("/api/v1/ai/pairing", json={"dish": "Brasato", "include_market": True})
    assert pairing.status_code == 200
    assert pairing.json()["model"] == "gpt-5.5"
    assert pairing.json()["cellar_matches"][0]["wine_id"] == wine_id
    assert pairing.json()["market_recommendations"]["low"][0]["name"] == "Chianti"

    usage = client.get("/api/v1/ai/usage")
    assert usage.status_code == 200
    assert usage.json()["all_time"]["requests"] == 1
    audit = client.get("/api/v1/ai/audit")
    assert audit.status_code == 200
    assert audit.json()[0]["model"] == "gpt-5.5"


def test_pairing_restaurant_mode_can_prefer_local_market_wines(monkeypatch):
    from app.api.routes import ai as ai_routes

    client = TestClient(app)
    assert register(client).status_code == 201
    assert (
        client.patch(
            "/api/v1/ai/settings", json={"openai_api_key": "sk-test", "pairing_model": "gpt-5.5"}
        ).status_code
        == 200
    )

    def fake_create_response(*args, **kwargs):
        assert args[0] == "gpt-5.5"
        assert "market_only: true" in args[2]
        assert "preferire_vini_locali: true" in args[2]
        assert "origine_locale: Toscana" in args[2]
        text = (
            '{"summary":"Per una bistecca in Toscana conviene restare su rossi locali.",'
            '"cellar_matches":[],'
            '"market_recommendations":{"low":[{"name":"Chianti Classico","producer":"Prod","price_hint":"entro 30 CHF","reason":"Rosso locale adatto alla carne."}],"medium":[],"high":[]}}'
        )
        return OpenAIResponse(
            text=text, usage=TokenUsage(input_tokens=100, output_tokens=50, total_tokens=150)
        )

    monkeypatch.setattr(ai_routes, "create_response", fake_create_response)

    pairing = client.post(
        "/api/v1/ai/pairing",
        json={
            "dish": "Bistecca",
            "market_only": True,
            "prefer_local_wines": True,
            "local_origin": "Toscana",
        },
    )
    assert pairing.status_code == 200
    assert pairing.json()["cellar_matches"] == []
    assert pairing.json()["market_recommendations"]["low"][0]["name"] == "Chianti Classico"


def test_buying_advice_uses_deadline_location_and_verified_product_pages(monkeypatch):
    from app.api.routes import ai as ai_routes

    client = TestClient(app)
    assert register(client).status_code == 201
    assert (
        client.patch(
            "/api/v1/ai/settings", json={"openai_api_key": "sk-test", "pairing_model": "gpt-5.5"}
        ).status_code
        == 200
    )

    def fake_create_response(*args, **kwargs):
        assert kwargs["web_search"] is True
        assert kwargs["web_search_use_default_location"] is False
        assert kwargs["web_search_context_size"] == "low"
        assert kwargs["reasoning_effort"] == "low"
        assert kwargs["max_output_tokens"] == 6000
        assert kwargs["max_tool_calls"] == 4
        assert "available for pickup or delivery today" in args[2]
        assert "Buyer location: Lugano, Svizzera" in args[2]
        assert "CHF 75" in args[2]
        return OpenAIResponse(
            text=(
                '{"summary":"Una proposta locale pronta da bere.","warning":"Confermare il ritiro.",'
                '"recommendations":[{"name":"Merlot del Ticino","producer":"Produttore",'
                '"vintage":"2021","merchant":"Enoteca Lugano","merchant_type":"local_shop",'
                '"price":"42.00","currency":"CHF","availability":"Disponibile, ritiro da confermare",'
                '"delivery_estimate":"Oggi con ritiro","source_url":"https://example.com/wine/merlot",'
                '"reason":"Gia pronto e vicino.","local":true,"confidence":"medium"},'
                '{"name":"Senza fonte","producer":"","vintage":"","merchant":"Negozio",'
                '"merchant_type":"online","price":"30","currency":"CHF","availability":"",'
                '"delivery_estimate":"","source_url":"","reason":"","local":false,"confidence":"low"}]}'
            ),
            usage=TokenUsage(input_tokens=100, output_tokens=50, total_tokens=150),
            web_sources=({"url": "https://example.com/wine/merlot", "title": "Merlot"},),
            web_search_calls=1,
            model="gpt-5.5",
        )

    monkeypatch.setattr(ai_routes, "create_response", fake_create_response)
    response = client.post(
        "/api/v1/ai/buying-advice",
        json={
            "purpose": "drink_now",
            "needed_by": "today",
            "location": "Lugano, Svizzera",
            "max_price_chf": 75,
        },
    )
    assert response.status_code == 200
    body = response.json()
    assert body["model"] == "gpt-5.5"
    assert len(body["recommendations"]) == 1
    assert body["recommendations"][0]["merchant"] == "Enoteca Lugano"
    assert body["recommendations"][0]["local"] is True
    assert body["recommendations"][0]["source_url"] == "https://example.com/wine/merlot"

    audit = client.get("/api/v1/ai/audit").json()
    entry = next(item for item in audit if item["feature"] == "buying_advice")
    assert any(
        source.get("url") == "https://example.com/wine/merlot" for source in entry["sources"]
    )


def test_ai_usage_summarizes_current_user_costs():
    client = TestClient(app)
    assert register(client).status_code == 201
    session = client.get("/api/v1/session").json()

    with TestingSessionLocal() as db:
        db.add(
            AiAuditLog(
                household_id=uuid.UUID(session["active_household_id"]),
                user_id=uuid.UUID(session["user_id"]),
                entity_type="wine",
                entity_id=uuid.uuid4(),
                feature="ai_notes",
                model="gpt-5.4-mini",
                outcome="success",
                summary="Generated notes",
                input_tokens=1000,
                cached_input_tokens=100,
                output_tokens=250,
                total_tokens=1250,
                estimated_cost_usd=Decimal("0.001800"),
                created_at=datetime.now(UTC),
            ),
        )
        db.commit()

    usage = client.get("/api/v1/ai/usage")
    assert usage.status_code == 200
    assert usage.json()["today"]["requests"] == 1
    assert usage.json()["today"]["input_tokens"] == 1000
    assert usage.json()["today"]["cached_input_tokens"] == 100
    assert usage.json()["today"]["output_tokens"] == 250
    assert usage.json()["today"]["estimated_cost_usd"] == "0.001800"


def test_deleting_user_removes_only_households_without_remaining_members():
    admin_client = TestClient(app)
    member_client = TestClient(app)
    assert register(admin_client).status_code == 201
    assert (
        register(
            member_client, email="member@example.com", password="strong-password-2"
        ).status_code
        == 201
    )

    pending_users = admin_client.get("/api/v1/auth/pending-users").json()
    member_id = pending_users[0]["id"]
    assert admin_client.post(f"/api/v1/auth/pending-users/{member_id}/approve").status_code == 200

    with TestingSessionLocal() as db:
        admin = db.query(User).filter(User.email == "owner@example.com").one()
        member = db.query(User).filter(User.email == "member@example.com").one()
        admin_household = (
            db.query(Household).join(Membership).filter(Membership.user_id == admin.id).one()
        )
        member_household = (
            db.query(Household).join(Membership).filter(Membership.user_id == member.id).one()
        )
        db.add(Membership(user_id=member.id, household_id=admin_household.id, role="member"))
        db.commit()
        member_household_id = member_household.id
        admin_household_id = admin_household.id

    deleted = admin_client.delete(f"/api/v1/auth/users/{member_id}")
    assert deleted.status_code == 204

    with TestingSessionLocal() as db:
        assert db.get(Household, member_household_id) is None
        assert db.get(Household, admin_household_id) is not None
