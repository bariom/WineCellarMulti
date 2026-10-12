import importlib.util
from datetime import UTC, datetime, timedelta
from decimal import Decimal
from pathlib import Path
from uuid import UUID, uuid4

import pytest
import sqlalchemy as sa
import test_auth_and_wines as harness
from alembic.migration import MigrationContext
from alembic.operations import Operations
from fastapi import HTTPException
from fastapi.testclient import TestClient

from app.api.deps import CurrentContext
from app.api.routes import ai
from app.main import app
from app.models import (
    Household,
    Membership,
    User,
    UserEntitlement,
    UserSession,
)
from app.services.ai_credits import (
    ai_credit_balance,
    create_ai_usage_transaction,
    set_ai_credit_balance,
)
from app.services.openai_client import OpenAIResponse, TokenUsage


def setup_function():
    harness.setup_function()


def teardown_function():
    harness.teardown_function()


@pytest.fixture
def clients():
    admin, member = TestClient(app), TestClient(app)
    assert harness.register(admin).status_code == 201
    assert harness.register(member, "ambassador@example.com").status_code == 201
    with harness.TestingSessionLocal() as db:
        user = db.scalar(sa.select(User).where(User.email == "ambassador@example.com"))
        user.is_approved = True
        user.email_verified_at = datetime.now(UTC)
        user.is_app_admin = False
        user.can_use_label_recognition = False
        user.can_manage_wine_photos = False
        user.can_use_restaurant_mode = False
        user_id = str(user.id)
        db.commit()
    assert (
        member.post(
            "/api/v1/auth/login",
            json={"email": "ambassador@example.com", "password": "strong-password-1"},
        ).status_code
        == 200
    )
    return admin, member, user_id


def grant(admin, user_id, credit="10", days=30):
    return admin.patch(
        f"/api/v1/auth/users/{user_id}",
        json={
            "ambassador": {
                "valid_until": (datetime.now(UTC) + timedelta(days=days)).isoformat(),
                "ai_credit_target_usd": credit,
            }
        },
    )


def test_ambassador_full_user_access_without_admin_or_cross_cellar_access(clients, monkeypatch):
    admin, member, user_id = clients
    response = grant(admin, user_id)
    assert response.status_code == 200, response.text
    assert response.json()["is_ambassador"]
    assert response.json()["ambassador_ai_credit_balance_usd"] == "10.000000"
    assert not response.json()["is_app_admin"]
    assert datetime.fromisoformat(response.json()["ambassador_until"]).tzinfo is not None
    # Promotional access never rewrites ordinary permissions.
    assert not response.json()["can_use_label_recognition"]
    session = member.get("/api/v1/session").json()
    for field in [
        "is_ambassador",
        "has_active_entitlement",
        "can_use_label_recognition",
        "can_manage_wine_photos",
        "restaurant_mode_available",
        "cellar_ai_assistant_available",
    ]:
        assert session[field]
    assert not session["is_free_tier"] and not session["is_app_admin"]
    monkeypatch.setattr(ai.settings, "free_tier_label_limit", 0)
    assert (
        member.post("/api/v1/wines", json={"name": "Ambassador wine", "quantity": 1}).status_code
        == 201
    )
    assert member.get("/api/v1/wines/tasting-archive?photos_only=true").status_code == 200
    assert member.get("/api/v1/auth/users").status_code == 403
    assert (
        member.patch(f"/api/v1/auth/users/{user_id}", json={"is_app_admin": True}).status_code
        == 403
    )
    other = admin.post("/api/v1/wines", json={"name": "Private admin wine", "quantity": 1})
    assert other.status_code == 201
    assert member.get(f"/api/v1/wines/{other.json()['id']}").status_code == 404
    status = member.get("/api/v1/billing/status").json()
    assert status["active_source"] == "ambassador"
    assert status["ambassador_until"] and status["ambassador_ai_credit_balance_usd"] == "10.000000"


@pytest.mark.parametrize("expired", [False, True])
def test_expiry_or_revocation_removes_promotional_credit_preserves_purchases(clients, expired):
    admin, member, user_id = clients
    assert grant(admin, user_id).status_code == 200
    assert grant(admin, user_id).json()["ambassador_ai_credit_balance_usd"] == "10.000000"
    with harness.TestingSessionLocal() as db:
        user = db.get(User, UUID(user_id))
        set_ai_credit_balance(db, user, target_balance_usd=Decimal("2"), source="test_purchase")
        if expired:
            user.ambassador_until = datetime.now(UTC) - timedelta(seconds=1)
        db.commit()
    if not expired:
        assert (
            admin.patch(
                f"/api/v1/auth/users/{user_id}", json={"revoke_ambassador": True}
            ).status_code
            == 200
        )
    session = member.get("/api/v1/session").json()
    assert not session["is_ambassador"] and session["is_free_tier"]
    assert not session["can_use_label_recognition"] and not session["can_manage_wine_photos"]
    assert not session["restaurant_mode_available"]
    assert member.get("/api/v1/wines/tasting-archive?photos_only=true").status_code == 403
    status = member.get("/api/v1/billing/status").json()
    assert Decimal(status["ambassador_ai_credit_balance_usd"]) == 0
    assert Decimal(status["ai_credit_balance_usd"]) == Decimal("2")
    assert grant(admin, user_id, "3").status_code == 200
    assert Decimal(member.get("/api/v1/billing/status").json()["ai_credit_balance_usd"]) == Decimal(
        "5"
    )


def test_ambassador_expiry_preserves_independent_paid_access(clients):
    admin, member, user_id = clients
    assert grant(admin, user_id).status_code == 200
    with harness.TestingSessionLocal() as db:
        user = db.get(User, UUID(user_id))
        user.ambassador_until = datetime.now(UTC) - timedelta(seconds=1)
        db.add(
            UserEntitlement(
                user_id=user.id,
                source="paid",
                valid_from=datetime.now(UTC),
                valid_until=datetime.now(UTC) + timedelta(days=90),
            )
        )
        db.commit()
    session = member.get("/api/v1/session").json()
    assert not session["is_ambassador"] and session["has_active_entitlement"]
    assert member.get("/api/v1/wines/tasting-archive?photos_only=true").status_code == 200


@pytest.mark.parametrize(
    "change",
    [
        {"valid_until": "2000-01-01T00:00:00Z", "ai_credit_target_usd": "10"},
        {"valid_until": "2099-01-01T00:00:00", "ai_credit_target_usd": "10"},
        {"valid_until": "2099-01-01T00:00:00Z", "ai_credit_target_usd": "-1"},
        {"valid_until": "2099-01-01T00:00:00Z", "ai_credit_target_usd": "NaN"},
    ],
)
def test_ambassador_validation_and_admin_only_management(clients, change):
    admin, member, user_id = clients
    assert member.patch(
        f"/api/v1/auth/users/{user_id}", json={"ambassador": change}
    ).status_code in {403, 422}
    assert (
        admin.patch(f"/api/v1/auth/users/{user_id}", json={"ambassador": change}).status_code == 422
    )
    assert not member.get("/api/v1/session").json()["is_ambassador"]


def test_credit_split_refund_and_late_refund_never_revive_expired_affiliation(clients):
    admin, _, user_id = clients
    assert grant(admin, user_id, "1").status_code == 200
    reservation = uuid4()
    with harness.TestingSessionLocal() as db:
        user = db.get(User, UUID(user_id))
        set_ai_credit_balance(db, user, target_balance_usd=Decimal("2"), source="test_purchase")
        db.flush()
        original_wallet = user.ambassador_credit_wallet
        create_ai_usage_transaction(
            db,
            user,
            amount_usd=Decimal("-1.5"),
            source="usage_reservation",
            source_id=reservation,
            note="test",
        )
        db.commit()
        assert ai_credit_balance(db, user, wallet="standard") == Decimal("1.5")
        assert ai_credit_balance(db, user, wallet=original_wallet) == 0
        user.ambassador_until = datetime.now(UTC) - timedelta(seconds=1)
        db.commit()
    assert grant(admin, user_id, "3").status_code == 200
    with harness.TestingSessionLocal() as db:
        user = db.get(User, UUID(user_id))
        assert user.ambassador_credit_wallet != original_wallet
        create_ai_usage_transaction(
            db,
            user,
            amount_usd=Decimal("1.25"),
            source="usage_refund",
            source_id=reservation,
            note="late refund",
        )
        db.commit()
        assert ai_credit_balance(db, user, wallet="standard") == Decimal("2")
        assert ai_credit_balance(db, user, wallet=original_wallet) == Decimal(".75")
        assert ai_credit_balance(db, user) == Decimal("5")


@pytest.mark.parametrize("failure", [False, True])
def test_ambassador_ai_uses_configured_budget_even_for_app_funded_requests(
    clients, monkeypatch, failure
):
    admin, _, user_id = clients
    assert grant(admin, user_id, "2").status_code == 200
    monkeypatch.setattr(ai.settings, "openai_api_key", "test-app-key")
    monkeypatch.setattr(ai, "maximum_billable_cost_usd", lambda **kw: Decimal("1"))
    monkeypatch.setattr(ai, "billable_cost_usd", lambda **kw: Decimal(".1"))

    def respond(*args, **kwargs):
        if failure:
            raise HTTPException(503, "Provider unavailable")
        return OpenAIResponse(text="{}", usage=TokenUsage(), model="test")

    monkeypatch.setattr(ai, "create_response", respond)
    with harness.TestingSessionLocal() as db:
        user = db.get(User, UUID(user_id))
        membership = db.scalar(sa.select(Membership).where(Membership.user_id == user.id))
        household = db.get(Household, membership.household_id)
        session = db.scalar(sa.select(UserSession).where(UserSession.user_id == user.id))
        context = CurrentContext(user, household, membership, session, True, user.ambassador_until)
        user_settings = ai.get_or_create_user_ai_settings(db, context)
        user_settings.provider_mode = "credits"
        before = ai_credit_balance(db, user)
        kwargs = dict(model="gpt-6-luna", system_prompt="test", user_prompt="test", app_funded=True)
        if failure:
            with pytest.raises(HTTPException):
                ai.create_ai_response(db, context, user_settings, **kwargs)
        else:
            response, provider = ai.create_ai_response(db, context, user_settings, **kwargs)
            assert provider == "credits" and response.charged_cost_usd == Decimal(".1")
        assert ai_credit_balance(db, user) == before - (Decimal("0") if failure else Decimal(".1"))
        assert ai_credit_balance(db, user, wallet="standard") == Decimal(".5")


def test_ambassador_migration_upgrades_existing_credit_and_downgrades():
    path = Path(__file__).parents[1] / "alembic/versions/0118_ambassador.py"
    spec = importlib.util.spec_from_file_location("ambassador_migration", path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    assert len(module.revision) <= 32
    engine = sa.create_engine("sqlite://")
    with engine.begin() as connection:
        connection.execute(sa.text("CREATE TABLE users (id INTEGER PRIMARY KEY)"))
        connection.execute(
            sa.text(
                "CREATE TABLE user_ai_credit_transactions "
                "(id INTEGER PRIMARY KEY, amount_usd NUMERIC)"
            )
        )
        connection.execute(sa.text("INSERT INTO user_ai_credit_transactions VALUES (1, 5.5)"))
        with Operations.context(MigrationContext.configure(connection)):
            module.upgrade()
            assert connection.execute(
                sa.text("SELECT amount_usd, wallet FROM user_ai_credit_transactions")
            ).one() == (5.5, "standard")
            module.downgrade()
            assert "wallet" not in {
                c["name"] for c in sa.inspect(connection).get_columns("user_ai_credit_transactions")
            }


def test_ambassador_management_cannot_self_grant_or_mix_admin_privileges(clients):
    admin, member, user_id = clients
    change = {"valid_until": "2099-01-01T00:00:00Z", "ai_credit_target_usd": "1"}
    assert (
        member.patch(f"/api/v1/auth/users/{user_id}", json={"ambassador": change}).status_code
        == 403
    )
    for extra in [{"revoke_ambassador": True}, {"is_app_admin": True}]:
        assert (
            admin.patch(
                f"/api/v1/auth/users/{user_id}", json={"ambassador": change, **extra}
            ).status_code
            == 400
        )
    admin_id = admin.get("/api/v1/session").json()["user_id"]
    assert grant(admin, admin_id).status_code == 400
    assert not member.get("/api/v1/session").json()["is_ambassador"]


def test_ambassador_without_credit_cannot_bypass_budget(clients, monkeypatch):
    admin, _, user_id = clients
    assert grant(admin, user_id, "0").status_code == 200
    monkeypatch.setattr(ai.settings, "openai_api_key", "test-app-key")

    def unexpected_provider_call(*args, **kwargs):
        pytest.fail("Exhausted Ambassador budget must not call the AI provider")

    monkeypatch.setattr(ai, "create_response", unexpected_provider_call)
    with harness.TestingSessionLocal() as db:
        user = db.get(User, UUID(user_id))
        set_ai_credit_balance(db, user, target_balance_usd=Decimal("0"), source="test")
        db.commit()
        membership = db.scalar(sa.select(Membership).where(Membership.user_id == user.id))
        household = db.get(Household, membership.household_id)
        session = db.scalar(sa.select(UserSession).where(UserSession.user_id == user.id))
        context = CurrentContext(user, household, membership, session, True, user.ambassador_until)
        user_settings = ai.get_or_create_user_ai_settings(db, context)
        user_settings.provider_mode = "credits"
        with pytest.raises(HTTPException) as error:
            ai.create_ai_response(
                db,
                context,
                user_settings,
                model="gpt-6-luna",
                system_prompt="test",
                user_prompt="test",
                app_funded=True,
            )
        assert error.value.status_code == 402
