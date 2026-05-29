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
from app.models import AiAuditLog, Household, UserAiSettings, Wine
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
    assert client.get("/api/v1/auth/passkeys").status_code == 401

    registered = register(client)
    assert registered.status_code == 201
    assert registered.json()["authenticated"] is True
    assert registered.json()["user_email"] == "owner@example.com"
    assert registered.json()["active_household_name"] == "Main Cellar"
    assert client.get("/api/v1/auth/passkeys").json() == []

    logged_out = client.post("/api/v1/auth/logout")
    assert logged_out.status_code == 204
    assert client.get("/api/v1/session").json()["authenticated"] is False

    passkey_options = client.post("/api/v1/auth/passkeys/login/options")
    assert passkey_options.status_code == 200
    assert passkey_options.json()["challenge"]

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

    updated = client.patch(f"/api/v1/wines/{wine_id}", json={"quantity": 5, "status": "Shipped", "rating": 6})
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


def test_user_tags_can_be_defined_and_assigned_to_wines():
    client = TestClient(app)
    assert register(client).status_code == 201

    tag = client.post("/api/v1/tags", json={"name": "En Primeur", "color": "#8f2039"})
    assert tag.status_code == 201
    assert tag.json()["name"] == "En Primeur"
    assert tag.json()["color"] == "#8f2039"
    assert client.get("/api/v1/tags").json()[0]["name"] == "En Primeur"
    renamed = client.patch(f"/api/v1/tags/{tag.json()['id']}", json={"name": "Primeur", "color": "#245142"})
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
                    "ai_strategy": '{"signal":"Buon prezzo","reason":"Sotto mercato.","price_assessment":"Target interessante.","market_price_low":40,"market_price_high":50,"market_price_currency":"CHF"}',
                    "ai_purpose_advice": '{"recommended_purpose":"Cellar","signal":"Da cantina","reason":"Annata giovane.","confidence":"medium"}',
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
    assert wishlist.json()[0]["ai_strategy"] == "Buon prezzo. Sotto mercato. Target interessante. Fascia mercato stimata: CHF 40-50."
    assert wishlist.json()[0]["ai_purpose_advice"] == "Scopo consigliato: Cellar. Da cantina. Annata giovane. Confidenza: medium."

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
    assert settings.json()["pairing_model"] == "gpt-5.4"

    updated_settings = client.patch(
        "/api/v1/ai/settings",
        json={"openai_api_key": "sk-test", "ai_notes_model": "gpt-5.5", "pairing_model": "gpt-5.5"},
    )
    assert updated_settings.status_code == 200
    assert updated_settings.json()["has_openai_api_key"] is True
    assert updated_settings.json()["ai_notes_model"] == "gpt-5.5"
    assert updated_settings.json()["pairing_model"] == "gpt-5.5"
    with TestingSessionLocal() as db:
        stored_settings = db.get(UserAiSettings, uuid.UUID(client.get("/api/v1/session").json()["user_id"]))
        assert stored_settings is not None
        assert stored_settings.openai_api_key.startswith("enc:v1:")
        assert "sk-test" not in stored_settings.openai_api_key

    cleared_settings = client.patch("/api/v1/ai/settings", json={"openai_api_key": ""})
    assert cleared_settings.status_code == 200
    assert cleared_settings.json()["has_openai_api_key"] is False

    generated = client.post(f"/api/v1/ai/wines/{created.json()['id']}/notes")
    assert generated.status_code == 503
    assert "OPENAI_API_KEY" in generated.json()["detail"]


def test_wishlist_ai_features_are_separate(monkeypatch):
    from app.api.routes import ai as ai_routes

    client = TestClient(app)
    assert register(client).status_code == 201
    assert client.patch("/api/v1/ai/settings", json={"openai_api_key": "sk-test"}).status_code == 200
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
        },
    )
    assert created.status_code == 201
    item_id = created.json()["id"]

    def fake_create_response(*args, **kwargs):
        schema_name = kwargs["json_schema"]["name"]
        if schema_name == "wishlist_strategy":
            text = '{"strategy":"Compra solo sotto target.","purpose_advice":"Non modificato.","recommended_status":"Watch","recommended_priority":"High"}'
        elif schema_name == "wishlist_purpose":
            text = '{"recommended_purpose":"Cellar","purpose_advice":"Meglio da cantina.","recommended_priority":"Medium"}'
        else:
            text = '{"target_price":35,"currency":"CHF","price_advice":"Target prudente.","recommended_status":"Ready"}'
        return OpenAIResponse(text=text, usage=TokenUsage(input_tokens=100, output_tokens=50, total_tokens=150))

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
    assert target_price.json()["target_price"] == "35.00"
    assert target_price.json()["status"] == "Ready"

    usage = client.get("/api/v1/ai/usage")
    assert usage.status_code == 200
    assert usage.json()["all_time"]["requests"] == 3


def test_pairing_ai_uses_delivered_cellar_wines_and_market(monkeypatch):
    from app.api.routes import ai as ai_routes

    client = TestClient(app)
    assert register(client).status_code == 201
    assert client.patch("/api/v1/ai/settings", json={"openai_api_key": "sk-test", "pairing_model": "gpt-5.5"}).status_code == 200
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
        assert args[0] == "gpt-5.5"
        assert "Barolo" in args[2]
        assert "Future Wine" not in args[2]
        text = (
            '{"summary":"Il Barolo funziona con il brasato.",'
            f'"cellar_matches":[{{"wine_id":"{wine_id}","wine_name":"Barolo","producer":"Produttore","reason":"Struttura e tannino.","serving_note":"Servire a 18 C."}}],'
            '"market_recommendations":{"low":[{"name":"Chianti","producer":"Prod","price_hint":"entro 30 CHF","reason":"Acidita."}],"medium":[],"high":[]}}'
        )
        return OpenAIResponse(text=text, usage=TokenUsage(input_tokens=100, output_tokens=50, total_tokens=150))

    monkeypatch.setattr(ai_routes, "create_response", fake_create_response)

    pairing = client.post("/api/v1/ai/pairing", json={"dish": "Brasato", "include_market": True})
    assert pairing.status_code == 200
    assert pairing.json()["model"] == "gpt-5.5"
    assert pairing.json()["cellar_matches"][0]["wine_id"] == wine_id
    assert pairing.json()["market_recommendations"]["low"][0]["name"] == "Chianti"

    usage = client.get("/api/v1/ai/usage")
    assert usage.status_code == 200
    assert usage.json()["all_time"]["requests"] == 1


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
