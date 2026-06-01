import hashlib
import hmac
import json
import time
import uuid
from datetime import datetime, timedelta, timezone
from decimal import Decimal
from urllib.parse import parse_qs

from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.db.base import Base
from app.db.session import get_db
from app.main import app
from app.models import AiAuditLog, Household, RedeemCode, UserAiSettings, Wine
from app.core.config import settings
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


def create_redeem_code(admin_client: TestClient, email: str | None = None, duration_days: int = 30) -> str:
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

    preferences = client.patch("/api/v1/auth/preferences", json={"locale": "en", "theme_preference": "ticino"})
    assert preferences.status_code == 200
    assert preferences.json()["locale"] == "en"
    assert preferences.json()["theme_preference"] == "ticino"

    pending_client = TestClient(app)
    pending = register(pending_client, email="pending@example.com", password="strong-password-2")
    assert pending.status_code == 201
    assert pending.json()["authenticated"] is False
    assert pending.json()["pending_approval"] is True
    blocked_login = pending_client.post("/api/v1/auth/login", json={"email": "pending@example.com", "password": "strong-password-2"})
    assert blocked_login.status_code == 403
    pending_users = client.get("/api/v1/auth/pending-users")
    assert pending_users.status_code == 200
    assert pending_users.json()[0]["email"] == "pending@example.com"
    approved = client.post(f"/api/v1/auth/pending-users/{pending_users.json()[0]['id']}/approve")
    assert approved.status_code == 200
    approved_login = pending_client.post("/api/v1/auth/login", json={"email": "pending@example.com", "password": "strong-password-2"})
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
    promoted = client.patch(f"/api/v1/auth/users/{pending_record['id']}", json={"is_app_admin": True})
    assert promoted.status_code == 200
    assert promoted.json()["is_app_admin"] is True
    blocked = client.patch(f"/api/v1/auth/users/{pending_record['id']}", json={"is_blocked": True})
    assert blocked.status_code == 200
    assert blocked.json()["is_blocked"] is True
    blocked_login = pending_client.post("/api/v1/auth/login", json={"email": "pending@example.com", "password": "strong-password-2"})
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

    login = client.post("/api/v1/auth/login", json={"email": "owner@example.com", "password": "strong-password-1"})
    assert login.status_code == 200
    assert login.json()["authenticated"] is True
    assert login.json()["locale"] == "en"
    assert login.json()["theme_preference"] == "ticino"


def test_authenticated_user_can_read_wine_catalog():
    client = TestClient(app)
    assert register(client).status_code == 201

    response = client.get("/api/v1/wines/catalog")
    assert response.status_code == 200
    catalog = response.json()
    assert len(catalog) > 400
    assert {"name", "producer", "region", "appellation", "type", "format"} <= set(catalog[0])


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
    assert admin_client.post(f"/api/v1/auth/pending-users/{pending_user['id']}/approve").status_code == 200
    login = user_client.post("/api/v1/auth/login", json={"email": "redeem@example.com", "password": "strong-password-2"})
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
        code.expires_at = datetime.now(timezone.utc) - timedelta(minutes=1)
        db.commit()
    assert user_client.get("/api/v1/billing/status").json()["has_active_entitlement"] is False
    assert user_client.get("/api/v1/wines").status_code == 402

    duplicate = user_client.post("/api/v1/billing/redeem", json={"code": redeem_code})
    assert duplicate.status_code == 400
    revoked = admin_client.delete(f"/api/v1/billing/redeem-codes/{unused_code_id}")
    assert revoked.status_code == 204
    listed_after_revoke = admin_client.get("/api/v1/billing/redeem-codes")
    assert listed_after_revoke.json()[0]["is_active"] is False
    force_deleted = admin_client.delete(f"/api/v1/billing/redeem-codes/{unused_code_id}?force=true")
    assert force_deleted.status_code == 204
    assert all(code["id"] != unused_code_id for code in admin_client.get("/api/v1/billing/redeem-codes").json())

    extra_code = admin_client.post(
        "/api/v1/billing/redeem-codes",
        json={"label": "Unused", "duration_days": 7, "max_redemptions": 1},
    )
    assert extra_code.status_code == 201
    extra_code_id = extra_code.json()["id"]
    deleted = admin_client.delete(f"/api/v1/billing/redeem-codes/{extra_code_id}")
    assert deleted.status_code == 204
    assert all(code["id"] != extra_code_id for code in admin_client.get("/api/v1/billing/redeem-codes").json())


def stripe_signature(payload: bytes, secret: str) -> str:
    timestamp = int(time.time())
    digest = hmac.new(secret.encode("utf-8"), f"{timestamp}.{payload.decode('utf-8')}".encode("utf-8"), hashlib.sha256).hexdigest()
    return f"t={timestamp},v1={digest}"


def test_stripe_checkout_webhook_grants_entitlement_once(monkeypatch):
    webhook_secret = "whsec_test"
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
    headers = {"Stripe-Signature": stripe_signature(payload, webhook_secret), "Content-Type": "application/json"}

    first = client.post("/api/v1/billing/stripe/webhook", content=payload, headers=headers)
    assert first.status_code == 204
    second = client.post("/api/v1/billing/stripe/webhook", content=payload, headers=headers)
    assert second.status_code == 204

    status_response = client.get("/api/v1/billing/status")
    assert status_response.status_code == 200
    status_payload = status_response.json()
    assert status_payload["has_active_entitlement"] is True
    assert status_payload["active_source"] == "stripe"
    assert len(status_payload["entitlements"]) == 1

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
    invoice_headers = {"Stripe-Signature": stripe_signature(invoice_payload, webhook_secret), "Content-Type": "application/json"}
    renewed = client.post("/api/v1/billing/stripe/webhook", content=invoice_payload, headers=invoice_headers)
    assert renewed.status_code == 204
    duplicate_renewal = client.post("/api/v1/billing/stripe/webhook", content=invoice_payload, headers=invoice_headers)
    assert duplicate_renewal.status_code == 204
    assert len(client.get("/api/v1/billing/status").json()["entitlements"]) == 2


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
    assert register(client, email="checkout@example.com", password="strong-password-4").status_code == 201
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
    renamed = owner.patch("/api/v1/household", json={"name": "Renamed Cellar"})
    assert renamed.status_code == 200
    assert renamed.json()["household_name"] == "Renamed Cellar"
    assert owner.get("/api/v1/session").json()["active_household_name"] == "Renamed Cellar"

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

    registered_viewer = register(member, email="viewer@example.com", password="strong-password-2")
    assert registered_viewer.status_code == 201
    assert registered_viewer.json()["pending_approval"] is True
    pending_viewers = owner.get("/api/v1/auth/pending-users")
    viewer_user = next(user for user in pending_viewers.json() if user["email"] == "viewer@example.com")
    assert owner.post(f"/api/v1/auth/pending-users/{viewer_user['id']}/approve").status_code == 200
    assert member.post("/api/v1/auth/login", json={"email": "viewer@example.com", "password": "strong-password-2"}).status_code == 200
    redeem_code = create_redeem_code(owner, email="viewer@example.com")
    assert member.post("/api/v1/billing/redeem", json={"code": redeem_code}).status_code == 200
    received_invites = member.get("/api/v1/household/invites/received")
    assert received_invites.status_code == 200
    assert received_invites.json()[0]["household_name"] == "Renamed Cellar"
    accepted = member.post(f"/api/v1/household/invites/{invite_id}/accept")
    assert accepted.status_code == 200
    assert accepted.json()["role"] == "viewer"
    invited_membership_id = accepted.json()["membership_id"]

    members_after = owner.get("/api/v1/household/members")
    assert members_after.status_code == 200
    assert sorted(member_data["email"] for member_data in members_after.json()) == ["owner@example.com", "viewer@example.com"]

    private_wine = owner.post("/api/v1/wines", json={"name": "Private Wine", "quantity": 1, "price": 50})
    assert private_wine.status_code == 201
    owner_wine = owner.post("/api/v1/wines", json={"name": "Shared Wine", "quantity": 6, "price": 20})
    assert owner_wine.status_code == 201
    owner_wine_id = owner_wine.json()["id"]
    share_offer = owner.post(
        f"/api/v1/wines/{owner_wine_id}/share-offers",
        json={"email": "viewer@example.com", "share_pct": 50, "message": "You own this allocation too."},
    )
    assert share_offer.status_code == 201
    assert share_offer.json()["recipient_email"] == "viewer@example.com"
    assert owner.patch(f"/api/v1/wines/{owner_wine_id}", json={"quantity": 5}).status_code == 200

    offers = member.get("/api/v1/wines/share-offers")
    assert offers.status_code == 200
    assert offers.json()[0]["wine_name"] == "Shared Wine"
    accepted_offer = member.post(f"/api/v1/wines/share-offers/{offers.json()[0]['id']}/accept")
    assert accepted_offer.status_code == 200
    assert accepted_offer.json()["quantity"] == 3
    assert accepted_offer.json()["owner_share_pct"] == "100.00"
    assert sorted(owner["email"] for owner in accepted_offer.json()["owners"]) == ["owner@example.com", "viewer@example.com"]
    viewer_owner = next(owner for owner in accepted_offer.json()["owners"] if owner["email"] == "viewer@example.com")
    assert viewer_owner["share_pct"] == 50.0
    personal_list = member.get("/api/v1/wines")
    assert personal_list.status_code == 200
    assert [wine["name"] for wine in personal_list.json()] == ["Shared Wine"]
    assert personal_list.json()[0]["quantity"] == 3

    member_households = member.get("/api/v1/household/memberships")
    assert member_households.status_code == 200
    shared_household = next(item for item in member_households.json() if item["role"] == "viewer")
    assert shared_household["household_name"] == "Renamed Cellar"
    assert invited_membership_id

    switched = member.post("/api/v1/household/switch", json={"household_id": shared_household["household_id"]})
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

    exported = client.get("/api/v1/imports/export-json")
    assert exported.status_code == 200
    assert exported.json()["schema"] == "winecellarmulti.export.v1"
    assert [wine["name"] for wine in exported.json()["wines"]] == ["Imported Wine", "Wanted Wine"]

    replacement_payload = {
        "wines": [{"id": str(uuid.uuid4()), "name": "Replacement Wine", "quantity": 1, "price": 10}],
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
