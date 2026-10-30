from datetime import UTC, datetime, timedelta
from types import SimpleNamespace
from uuid import UUID

import pytest
import test_auth_and_wines as harness
from fastapi import HTTPException
from fastapi.testclient import TestClient

from app.api.routes import ai
from app.api.routes import auth as auth_routes
from app.core.config import settings
from app.core.legal import LEGAL_DOCUMENT_VERSION
from app.core.security import hash_password
from app.main import app
from app.models import DemoEvent, Household, Membership, User, Wine
from app.services.demo_events import ensure_event_task_allowed


def setup_function():
    harness.setup_function()


def teardown_function():
    harness.teardown_function()


@pytest.fixture
def admin():
    client = TestClient(app)
    assert harness.register(client).status_code == 201
    return client


def create_event(admin: TestClient, **overrides):
    payload = {"name": "The Market", "place": "Lugano", "features": ["restaurant_wine_list"]}
    payload.update(overrides)
    response = admin.post("/api/v1/admin/events", json=payload)
    assert response.status_code == 201, response.text
    return response.json()


def test_guest_enters_through_the_qr_code_with_the_events_credit_and_features(admin, monkeypatch):
    event = create_event(admin)
    assert event["url"].endswith(f"/e/{event['slug']}")

    guest = TestClient(app)
    entered = guest.post(f"/api/v1/events/{event['slug']}/enter")
    assert entered.status_code == 200, entered.text
    session = entered.json()
    assert session["authenticated"] is True
    assert session["membership_role"] == "owner"
    assert session["active_household_name"] == "The Market · Lugano"
    assert session["event"]["name"] == "The Market"
    assert session["event"]["features"] == ["restaurant_wine_list"]
    assert session["event"]["landing"] == "pairing-restaurant"
    assert session["requires_legal_acceptance"] is False
    assert guest.get("/api/v1/wines").json() == []
    assert guest.get("/api/v1/ai/settings").json()["app_credit_balance_usd"] == "0.500000"

    # Dish pairing is not part of this event: refused before any AI work.
    refused = guest.post("/api/v1/ai/pairing", json={"dish": "Risotto", "locale": "it"})
    assert refused.status_code == 403

    # The wine-list scan is: it reaches the AI call.
    def reached(*args, **kwargs):
        raise HTTPException(status_code=418, detail="reached")

    monkeypatch.setattr(ai, "create_ai_response", reached)
    monkeypatch.setattr(ai, "optimized_wine_images", lambda content: [content])
    scanned = guest.post(
        "/api/v1/ai/restaurant-wine-list/scan",
        files={"image": ("list.jpg", b"jpeg-bytes", "image/jpeg")},
        data={"dish": "Risotto", "locale": "it", "ignore_preferences": "true"},
    )
    assert scanned.status_code == 418

    listed = admin.get("/api/v1/admin/events").json()
    assert listed[0]["stats"] == {
        "visitor_count": 1,
        "active_visitors": 1,
        "conversions": 0,
        "granted_usd": "0.500000",
        "spent_usd": "0.00",
    }


def test_every_ai_task_outside_the_event_is_refused():
    with harness.TestingSessionLocal() as db:
        event = DemoEvent(
            slug="x", name="Tasting", features=["dish_pairing"], created_at=datetime.now(UTC)
        )
        db.add(event)
        db.flush()
        guest = User(
            email="g@visitor.vinaris.app",
            display_name="Guest",
            password_hash="x",
            event_id=event.id,
            event_visitor_until=datetime.now(UTC) + timedelta(hours=1),
        )
        db.add(guest)
        db.flush()
        context = SimpleNamespace(user=guest)
        ensure_event_task_allowed(db, context, "pairing")
        with pytest.raises(HTTPException) as refused:
            ensure_event_task_allowed(db, context, "wine_value")
        assert refused.value.status_code == 403
        # Bottle photos come with the enrichment of what they found, nothing more.
        event.features = ["bottle_photo"]
        db.flush()
        ensure_event_task_allowed(db, context, "wine_full_enrichment")
        with pytest.raises(HTTPException):
            ensure_event_task_allowed(db, context, "pairing")
        # Wine Pulse is read only: it grants no AI task at all.
        event.features = ["wine_pulse"]
        db.flush()
        with pytest.raises(HTTPException):
            ensure_event_task_allowed(db, context, "structured_extraction")
        # A guest who kept the account is an ordinary user again.
        guest.event_visitor_until = None
        ensure_event_task_allowed(db, context, "wine_value")


def test_closed_events_daily_cap_and_budget_stop_new_guests(admin):
    paused = create_event(admin, is_active=False)
    assert TestClient(app).post(f"/api/v1/events/{paused['slug']}/enter").status_code == 404
    over = create_event(admin, ends_at=(datetime.now(UTC) - timedelta(hours=1)).isoformat())
    assert TestClient(app).post(f"/api/v1/events/{over['slug']}/enter").status_code == 404

    capped = create_event(admin, max_visitors_per_day=1)
    assert TestClient(app).post(f"/api/v1/events/{capped['slug']}/enter").status_code == 200
    assert TestClient(app).post(f"/api/v1/events/{capped['slug']}/enter").status_code == 429

    tight = create_event(admin, credit_per_visitor_usd="0.4", budget_usd="0.5")
    assert TestClient(app).post(f"/api/v1/events/{tight['slug']}/enter").status_code == 200
    assert TestClient(app).post(f"/api/v1/events/{tight['slug']}/enter").status_code == 503

    unknown = TestClient(app).post("/api/v1/events/no-such-event/enter")
    assert unknown.status_code == 404


def test_guest_keeps_the_account_and_nothing_starts_over(admin, monkeypatch):
    deliveries = []
    monkeypatch.setattr(
        auth_routes,
        "send_email",
        lambda *, recipients, subject, body: deliveries.append(recipients) or True,
    )
    monkeypatch.setattr(settings, "registration_requires_approval", False)
    monkeypatch.setattr(settings, "smtp_host", "smtp.example.com")
    monkeypatch.setattr(settings, "smtp_from_email", "noreply@example.com")
    event = create_event(admin)
    guest = TestClient(app)
    entered = guest.post(f"/api/v1/events/{event['slug']}/enter").json()

    # Only guests can claim; a claim with an e-mail in use is refused.
    assert (
        admin.post("/api/v1/events/claim", json=claim_payload("x@example.com")).status_code == 400
    )
    assert (
        guest.post("/api/v1/events/claim", json=claim_payload("owner@example.com")).status_code
        == 409
    )

    claimed = guest.post("/api/v1/events/claim", json=claim_payload("guest@example.com"))
    assert claimed.status_code == 200, claimed.text
    assert claimed.json()["pending_email_verification"] is True
    assert deliveries == [["guest@example.com"]]
    with harness.TestingSessionLocal() as db:
        user = db.get(User, UUID(entered["user_id"]))
        assert user.email == "guest@example.com"
        assert user.display_name == "Anna"
        assert str(user.event_id) == event["id"]
        assert user.event_visitor_until is None
        household = db.get(Household, UUID(entered["active_household_id"]))
        assert household.name == "La mia cantina"
    stats = admin.get("/api/v1/admin/events").json()[0]["stats"]
    assert stats["conversions"] == 1
    assert stats["active_visitors"] == 0


def test_expired_guests_are_purged_with_their_cellars(admin):
    event = create_event(admin)
    entered = TestClient(app).post(f"/api/v1/events/{event['slug']}/enter").json()
    with harness.TestingSessionLocal() as db:
        user = db.get(User, UUID(entered["user_id"]))
        user.event_visitor_until = datetime.now(UTC) - timedelta(minutes=1)
        db.commit()

    listed = admin.get("/api/v1/admin/events").json()
    assert listed[0]["stats"]["visitor_count"] == 1
    assert listed[0]["stats"]["active_visitors"] == 0
    with harness.TestingSessionLocal() as db:
        assert db.get(User, UUID(entered["user_id"])) is None
        assert db.get(Household, UUID(entered["active_household_id"])) is None


def test_admin_edits_and_rotates_the_qr_address(admin):
    event = create_event(admin)
    updated = admin.patch(
        f"/api/v1/admin/events/{event['id']}",
        json={
            "features": ["restaurant_wine_list", "bottle_photo"],
            "landing": "sommelier",
            "rotate_slug": True,
        },
    )
    assert updated.status_code == 200, updated.text
    assert updated.json()["slug"] != event["slug"]
    assert updated.json()["features"] == ["restaurant_wine_list", "bottle_photo"]
    pulse = admin.patch(f"/api/v1/admin/events/{event['id']}", json={"features": ["wine_pulse"]})
    assert pulse.status_code == 200, pulse.text
    assert pulse.json()["features"] == ["wine_pulse"]
    assert (
        admin.patch(f"/api/v1/admin/events/{event['id']}", json={"features": ["x"]}).status_code
        == 422
    )
    assert (
        admin.patch(f"/api/v1/admin/events/{event['id']}", json={"features": []}).status_code == 422
    )
    qr = admin.get(f"/api/v1/admin/events/{event['id']}/qr.svg")
    assert qr.status_code == 200
    assert qr.headers["content-type"].startswith("image/svg+xml")
    # Dressed as Vinaris: the event on the caption, the glass at the centre.
    assert "Vinaris at The Market · Lugano" in qr.text
    assert 'aria-label="Vinaris QR"' in qr.text
    # Guests cannot reach the administration.
    guest = TestClient(app)
    assert guest.post(f"/api/v1/events/{updated.json()['slug']}/enter").status_code == 200
    assert guest.get("/api/v1/admin/events").status_code == 403


def test_deleting_an_event_ends_its_visits_and_keeps_the_accounts(admin):
    event = create_event(admin)
    visiting = TestClient(app)
    visitor = visiting.post(f"/api/v1/events/{event['slug']}/enter").json()
    kept = TestClient(app).post(f"/api/v1/events/{event['slug']}/enter").json()
    with harness.TestingSessionLocal() as db:
        db.get(User, UUID(kept["user_id"])).event_visitor_until = None
        db.commit()

    # Only the administration may delete an event.
    assert visiting.delete(f"/api/v1/admin/events/{event['id']}").status_code == 403
    assert admin.delete(f"/api/v1/admin/events/{event['id']}").status_code == 204
    assert admin.delete(f"/api/v1/admin/events/{event['id']}").status_code == 404

    assert admin.get("/api/v1/admin/events").json() == []
    assert TestClient(app).post(f"/api/v1/events/{event['slug']}/enter").status_code == 404
    with harness.TestingSessionLocal() as db:
        assert db.get(DemoEvent, UUID(event["id"])) is None
        # The guest still visiting is gone, with the cellar of tonight.
        assert db.get(User, UUID(visitor["user_id"])) is None
        assert db.get(Household, UUID(visitor["active_household_id"])) is None
        # The account kept stays, without the event as provenance.
        account = db.get(User, UUID(kept["user_id"]))
        assert account is not None
        assert account.event_id is None
    assert visiting.get("/api/v1/session").json()["authenticated"] is False


def claim_payload(email: str) -> dict:
    return {
        "email": email,
        "display_name": "Anna",
        "password": "strong-password-9",
        "household_name": "La mia cantina",
        "locale": "it",
        "legal_document_version": LEGAL_DOCUMENT_VERSION,
        "privacy_policy_accepted": True,
        "terms_accepted": True,
        "photo_usage_disclaimer_accepted": True,
    }


def test_guest_comes_back_from_the_demo_to_the_same_account(admin):
    event = create_event(admin, max_visitors_per_day=1)
    # A demo cellar to look at: one wine, read by the Italian demo account.
    now = datetime.now(UTC)
    with harness.TestingSessionLocal() as db:
        demo_household = Household(name="Cantina demo", is_demo=True)
        demo_user = User(
            email="demo-it@internal.vinaris.app",
            display_name="Demo",
            password_hash=hash_password("demo-password-1"),
            is_approved=True,
            approved_at=now,
            email_verified_at=now,
            privacy_policy_accepted_at=now,
            privacy_policy_version=LEGAL_DOCUMENT_VERSION,
            terms_accepted_at=now,
            terms_version=LEGAL_DOCUMENT_VERSION,
        )
        db.add_all([demo_household, demo_user])
        db.flush()
        db.add(Membership(user_id=demo_user.id, household_id=demo_household.id, role="viewer"))
        db.add(Wine(household_id=demo_household.id, name="Demo Barolo", quantity=1))
        db.commit()

    guest = TestClient(app)
    entered = guest.post(f"/api/v1/events/{event['slug']}/enter").json()
    assert entered["event_return"] is None
    # Anyone else in the demo has no event to go back to.
    stranger = TestClient(app)
    stranger_demo = stranger.post("/api/v1/auth/demo", params={"locale": "it"}).json()
    assert stranger_demo["event_return"] is None
    assert stranger.post("/api/v1/events/return").status_code == 404

    demo = guest.post("/api/v1/auth/demo", params={"locale": "it"})
    assert demo.status_code == 200, demo.text
    assert demo.json()["is_demo"] is True
    assert demo.json()["event_return"] == {
        "slug": event["slug"],
        "name": "The Market",
        "place": "Lugano",
    }
    assert guest.get("/api/v1/session").json()["event_return"]["slug"] == event["slug"]

    # Back to tonight: the same guest, with the day's only entry already used.
    returned = guest.post("/api/v1/events/return")
    assert returned.status_code == 200, returned.text
    assert returned.json()["user_id"] == entered["user_id"]
    assert returned.json()["event"]["slug"] == event["slug"]
    assert returned.json()["event_return"] is None
    assert guest.get("/api/v1/session").json()["user_id"] == entered["user_id"]
    assert admin.get("/api/v1/admin/events").json()[0]["stats"]["visitor_count"] == 1
    # The demo session is gone, and a second return has nothing to go back to.
    assert guest.post("/api/v1/events/return").status_code == 404

    # Once the visit is over, the demo offers no way back.
    assert guest.post("/api/v1/auth/demo", params={"locale": "it"}).status_code == 200
    with harness.TestingSessionLocal() as db:
        user = db.get(User, UUID(entered["user_id"]))
        user.event_visitor_until = datetime.now(UTC) - timedelta(minutes=1)
        db.commit()
    assert guest.get("/api/v1/session").json()["event_return"] is None
    assert guest.post("/api/v1/events/return").status_code == 404


def test_event_guests_pay_the_real_ai_cost_without_the_ai_pack_markup(monkeypatch):
    from decimal import Decimal

    from app.services.openai_client import TokenUsage

    monkeypatch.setattr(settings, "free_tier_ai_pack_markup_percent", "100")
    monkeypatch.setattr(ai, "estimate_cost_usd", lambda model, usage, db=None: Decimal("0.05"))
    guest = SimpleNamespace(
        user=SimpleNamespace(
            is_app_admin=False,
            event_id=UUID(int=1),
            event_visitor_until=datetime.now(UTC) + timedelta(hours=1),
        )
    )
    member = SimpleNamespace(
        user=SimpleNamespace(is_app_admin=False, event_id=None, event_visitor_until=None)
    )
    assert ai.exempt_from_markup(guest) is True
    assert ai.exempt_from_markup(member) is False

    def charged(context) -> Decimal:
        return ai.billable_cost_usd(
            markup_exempt=ai.exempt_from_markup(context),
            user_has_active_entitlement=False,
            provider_source="credits",
            model="gpt-6-luna",
            usage=TokenUsage(),
            extra_cost_usd=Decimal("0.02"),
        )

    # Tokens plus two web searches, as they cost Vinaris.
    assert charged(guest) == Decimal("0.07")
    assert charged(member) == Decimal("0.14")


def test_event_guests_complete_a_wine_without_its_market_value(admin, monkeypatch):
    from app.services.openai_client import OpenAIResponse, TokenUsage

    monkeypatch.setattr(settings, "openai_api_key", "sk-app")
    event = create_event(admin, features=["bottle_photo"])
    guest = TestClient(app)
    assert guest.post(f"/api/v1/events/{event['slug']}/enter").status_code == 200
    created = guest.post(
        "/api/v1/wines",
        json={"name": "Sfursat 5 Stelle", "producer": "Nino Negri", "vintage": "2020"},
    )
    assert created.status_code == 201, created.text
    calls = []

    def fake_create_response(*args, **kwargs):
        calls.append(kwargs)
        schema = kwargs["json_schema"]["schema"]
        # At a venue the price would reveal the markup: never researched, never asked.
        assert "value" not in schema["properties"]
        assert "value" not in schema["required"]
        assert "market value" in args[1] and "Do not research" in args[1]
        assert kwargs["max_tool_calls"] == 2
        return OpenAIResponse(
            text=(
                '{"ai_notes":"Rosso secco da uve appassite, pieno e caldo.",'
                '"drink_window":{"drink_from":2024,"drink_peak_from":2027,"drink_peak_to":2034,'
                '"drink_to":2040,"notes":"Ancora giovane."},'
                '"grape_composition":{"grapes":[{"name":"Nebbiolo","percentage_from":100,'
                '"percentage_to":100}],"notes":"","source_url":"https://example.com/sfursat",'
                '"source_title":"Sfursat 5 Stelle"}}'
            ),
            usage=TokenUsage(input_tokens=200, output_tokens=120, total_tokens=320),
            web_sources=({"url": "https://example.com/sfursat", "title": "Sfursat 5 Stelle"},),
            web_search_calls=1,
        )

    monkeypatch.setattr(ai, "create_response", fake_create_response)
    generated = guest.post(f"/api/v1/ai/wines/{created.json()['id']}/all", json={"locale": "it"})
    assert generated.status_code == 200, generated.text
    wine = generated.json()
    assert len(calls) == 1
    assert wine["current_value"] is None
    assert wine["drink_peak_to"] == 2034
    assert wine["grapes"][0]["name"] == "Nebbiolo"
    entry = guest.get("/api/v1/ai/audit").json()[0]
    assert not any(source.get("kind") == "valuation_market" for source in entry["sources"])
