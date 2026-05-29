import uuid
from datetime import datetime, timezone
from decimal import Decimal

from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.db.base import Base
from app.db.session import get_db
from app.main import app
from app.models import AiAuditLog, Household, Wine


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


def register(client: TestClient, email: str = "owner@example.com", password: str = "strong-password-1"):
    return client.post(
        "/api/v1/auth/register",
        json={
            "email": email,
            "display_name": "Cellar Owner",
            "password": password,
            "household_name": "Main Cellar",
        },
    )


def test_register_login_session_and_logout():
    client = TestClient(app)

    anonymous = client.get("/api/v1/session")
    assert anonymous.status_code == 200
    assert anonymous.json()["authenticated"] is False

    registered = register(client)
    assert registered.status_code == 201
    assert registered.json()["authenticated"] is True
    assert registered.json()["user_email"] == "owner@example.com"
    assert registered.json()["active_household_name"] == "Main Cellar"

    logged_out = client.post("/api/v1/auth/logout")
    assert logged_out.status_code == 204
    assert client.get("/api/v1/session").json()["authenticated"] is False

    login = client.post("/api/v1/auth/login", json={"email": "owner@example.com", "password": "strong-password-1"})
    assert login.status_code == 200
    assert login.json()["authenticated"] is True


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

    updated = client.patch(f"/api/v1/wines/{wine_id}", json={"quantity": 5, "status": "Shipped"})
    assert updated.status_code == 200
    assert updated.json()["quantity"] == 5
    assert updated.json()["status"] == "Shipped"

    missing = client.get(f"/api/v1/wines/{uuid.uuid4()}")
    assert missing.status_code == 404

    deleted = client.delete(f"/api/v1/wines/{wine_id}")
    assert deleted.status_code == 204
    assert client.get("/api/v1/wines").json() == []


def test_invite_acceptance_and_viewer_permissions():
    owner = TestClient(app)
    member = TestClient(app)

    assert register(owner).status_code == 201
    invite = owner.post("/api/v1/household/invites", json={"email": "viewer@example.com", "role": "viewer"})
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

    assert register(member, email="viewer@example.com", password="strong-password-2").status_code == 201
    accepted = member.post("/api/v1/household/invites/accept", json={"token": invite_token})
    assert accepted.status_code == 200
    assert accepted.json()["role"] == "viewer"
    invited_membership_id = accepted.json()["membership_id"]

    members_after = owner.get("/api/v1/household/members")
    assert members_after.status_code == 200
    assert sorted(member_data["email"] for member_data in members_after.json()) == ["owner@example.com", "viewer@example.com"]

    owner_wine = owner.post("/api/v1/wines", json={"name": "Shared Wine", "quantity": 1, "price": 20})
    assert owner_wine.status_code == 201

    member_households = member.get("/api/v1/household/memberships")
    assert member_households.status_code == 200
    shared_household = next(item for item in member_households.json() if item["role"] == "viewer")
    assert shared_household["household_name"] == "Main Cellar"
    assert invited_membership_id

    switched = member.post("/api/v1/household/switch", json={"household_id": shared_household["household_id"]})
    assert switched.status_code == 200

    viewer_list = member.get("/api/v1/wines")
    assert viewer_list.status_code == 200
    assert [wine["name"] for wine in viewer_list.json()] == ["Shared Wine"]

    viewer_create = member.post("/api/v1/wines", json={"name": "Blocked Wine", "quantity": 1, "price": 20})
    assert viewer_create.status_code == 403

    promoted = owner.patch(f"/api/v1/household/members/{invited_membership_id}", json={"role": "member"})
    assert promoted.status_code == 200
    assert promoted.json()["role"] == "member"

    assert member.post("/api/v1/auth/logout").status_code == 204
    assert member.post("/api/v1/auth/login", json={"email": "viewer@example.com", "password": "strong-password-2"}).status_code == 200
    shared_household = next(item for item in member.get("/api/v1/household/memberships").json() if item["role"] == "member")
    assert member.post("/api/v1/household/switch", json={"household_id": shared_household["household_id"]}).status_code == 200
    member_create = member.post("/api/v1/wines", json={"name": "Allowed Wine", "quantity": 1, "price": 30})
    assert member_create.status_code == 201

    viewer_members = member.get("/api/v1/household/members")
    assert viewer_members.status_code == 200

    removed = owner.delete(f"/api/v1/household/members/{invited_membership_id}")
    assert removed.status_code == 204
    members_after_remove = owner.get("/api/v1/household/members")
    assert [member_data["email"] for member_data in members_after_remove.json()] == ["owner@example.com"]

    revoked = owner.delete(f"/api/v1/household/invites/{invite_id}")
    assert revoked.status_code == 204
    assert owner.get("/api/v1/household/invites").json() == []


def test_legacy_import_scopes_wines_and_wishlist_to_household():
    client = TestClient(app)
    assert register(client).status_code == 201

    imported = client.post(
        "/api/v1/imports/legacy-json",
        json={
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
                },
            ],
        },
    )
    assert imported.status_code == 200
    assert imported.json() == {"wines_imported": 1, "wishlist_imported": 1}

    wines = client.get("/api/v1/wines")
    assert wines.status_code == 200
    assert wines.json()[0]["name"] == "Imported Wine"
    assert wines.json()[0]["tags"] == ["Imported"]
    assert wines.json()[0]["scores"][0]["critic"] == "Test"

    wishlist = client.get("/api/v1/wishlist")
    assert wishlist.status_code == 200
    assert wishlist.json()[0]["name"] == "Wanted Wine"
    assert wishlist.json()[0]["priority"] == "High"

    wishlist_id = wishlist.json()[0]["id"]
    converted = client.post(f"/api/v1/wishlist/{wishlist_id}/convert")
    assert converted.status_code == 201
    assert converted.json()["wine_id"]
    assert client.get("/api/v1/wishlist").json() == []
    assert sorted(wine["name"] for wine in client.get("/api/v1/wines").json()) == ["Imported Wine", "Wanted Wine"]


def test_ai_generation_requires_configured_openai_key():
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

    settings = client.get("/api/v1/ai/settings")
    assert settings.status_code == 200
    assert settings.json()["has_openai_api_key"] is False
    assert "gpt-5.5" in settings.json()["model_options"]

    updated_settings = client.patch(
        "/api/v1/ai/settings",
        json={"openai_api_key": "sk-test", "ai_notes_model": "gpt-5.5"},
    )
    assert updated_settings.status_code == 200
    assert updated_settings.json()["has_openai_api_key"] is True
    assert updated_settings.json()["ai_notes_model"] == "gpt-5.5"

    cleared_settings = client.patch("/api/v1/ai/settings", json={"openai_api_key": ""})
    assert cleared_settings.status_code == 200
    assert cleared_settings.json()["has_openai_api_key"] is False

    generated = client.post(f"/api/v1/ai/wines/{created.json()['id']}/notes")
    assert generated.status_code == 503
    assert "OPENAI_API_KEY" in generated.json()["detail"]


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
                created_at=datetime.now(timezone.utc),
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
