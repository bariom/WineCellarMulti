"""A wishlist wine carries the same identity facts as a cellar wine: grapes, origin, character."""

import test_auth_and_wines as harness
from fastapi.testclient import TestClient

from app.main import app
from app.models import SensoryProfileBaseline
from app.services.openai_client import OpenAIResponse, TokenUsage


def setup_function():
    harness.setup_function()


def teardown_function():
    harness.teardown_function()


def _client_with_wishlist_item(**fields) -> tuple[TestClient, str]:
    client = TestClient(app)
    assert harness.register(client).status_code == 201
    created = client.post(
        "/api/v1/wishlist",
        json={"name": "Barolo Cannubi", "producer": "Brezza", "vintage": "2019", **fields},
    )
    assert created.status_code == 201, created.text
    return client, created.json()["id"]


def test_wishlist_item_stores_grapes_and_origin_and_converts_them_to_the_cellar():
    client, item_id = _client_with_wishlist_item(
        country="Italia",
        wine_zone="Langhe",
        grapes=[{"name": " Nebbiolo (100% da fonte) ", "percentage_from": 100}, {"name": "  "}],
        ai_notes="Barolo austero e floreale.",
    )
    item = client.get("/api/v1/wishlist").json()[0]
    assert item["grapes"] == [{"name": "Nebbiolo", "percentage_from": 100}]
    assert item["country"] == "Italia"
    assert item["wine_zone"] == "Langhe"
    assert item["ai_notes"] == "Barolo austero e floreale."

    converted = client.post(f"/api/v1/wishlist/{item_id}/convert", json={"quantity": 2})
    assert converted.status_code == 201
    wine = client.get(f"/api/v1/wines/{converted.json()['wine_id']}").json()
    assert wine["grapes"] == [{"name": "Nebbiolo", "percentage_from": 100}]
    assert wine["vineyard_country"] == "Italia"
    assert wine["wine_zone"] == "Langhe"
    assert wine["ai_notes"] == "Barolo austero e floreale."


def test_editing_the_blend_drops_the_source_that_verified_another_blend():
    client, item_id = _client_with_wishlist_item(
        grapes=[{"name": "Nebbiolo", "percentage_from": 100, "percentage_to": 100}],
        grapes_source_url="https://example.com/brezza",
        grapes_source_title="Brezza",
    )
    unchanged = client.patch(
        f"/api/v1/wishlist/{item_id}",
        json={"grapes": [{"name": "Nebbiolo", "percentage_from": 100, "percentage_to": 100}]},
    )
    assert unchanged.json()["grapes_source_url"] == "https://example.com/brezza"

    edited = client.patch(f"/api/v1/wishlist/{item_id}", json={"grapes": [{"name": "Barbera"}]})
    assert edited.status_code == 200
    assert edited.json()["grapes"] == [{"name": "Barbera"}]
    assert edited.json()["grapes_source_url"] == ""
    assert edited.json()["grapes_source_title"] == ""


def test_wishlist_grapes_ai_keeps_only_a_sourced_blend_and_reuses_it_for_the_cellar(monkeypatch):
    from app.api.routes import ai as ai_routes

    client, item_id = _client_with_wishlist_item()
    assert (
        client.patch("/api/v1/ai/settings", json={"openai_api_key": "sk-test"}).status_code == 200
    )

    def fake_create_response(*args, **kwargs):
        assert "Name: Barolo Cannubi" in args[2]
        assert kwargs["web_search"] is True
        return OpenAIResponse(
            text=(
                '{"grapes":[{"name":"Nebbiolo","percentage_from":100,"percentage_to":100}],'
                '"notes":"Estate page."}'
            ),
            usage=TokenUsage(input_tokens=100, output_tokens=50, total_tokens=150),
            web_sources=({"url": "https://example.com/cannubi", "title": "Cannubi 2019"},),
        )

    monkeypatch.setattr(ai_routes, "create_response", fake_create_response)
    generated = client.post(f"/api/v1/ai/wishlist/{item_id}/grapes")
    assert generated.status_code == 200, generated.text
    assert generated.json()["grapes"][0]["name"] == "Nebbiolo"
    assert generated.json()["grapes_source_url"] == "https://example.com/cannubi"

    monkeypatch.setattr(
        ai_routes,
        "create_response",
        lambda *args, **kwargs: (_ for _ in ()).throw(AssertionError("shared grapes reused")),
    )
    wine = client.post(
        "/api/v1/wines",
        json={"name": "Barolo Cannubi", "producer": "Brezza", "vintage": "2019", "quantity": 1},
    )
    assert wine.status_code == 201
    reused = client.post(f"/api/v1/ai/wines/{wine.json()['id']}/grapes")
    assert reused.status_code == 200
    assert reused.json()["grapes"][0]["name"] == "Nebbiolo"


def test_wishlist_grapes_ai_without_a_source_saves_nothing(monkeypatch):
    from app.api.routes import ai as ai_routes

    client, item_id = _client_with_wishlist_item()
    assert (
        client.patch("/api/v1/ai/settings", json={"openai_api_key": "sk-test"}).status_code == 200
    )
    monkeypatch.setattr(
        ai_routes,
        "create_response",
        lambda *args, **kwargs: OpenAIResponse(
            text='{"grapes":[{"name":"Nebbiolo","percentage_from":100,"percentage_to":100}],"notes":""}',
            usage=TokenUsage(input_tokens=10, output_tokens=5, total_tokens=15),
        ),
    )
    generated = client.post(f"/api/v1/ai/wishlist/{item_id}/grapes")
    assert generated.status_code == 200
    assert generated.json()["grapes"] == []


def test_wishlist_notes_ai_describes_the_wine(monkeypatch):
    from app.api.routes import ai as ai_routes

    client, item_id = _client_with_wishlist_item()
    assert (
        client.patch("/api/v1/ai/settings", json={"openai_api_key": "sk-test"}).status_code == 200
    )
    monkeypatch.setattr(
        ai_routes,
        "create_response",
        lambda *args, **kwargs: OpenAIResponse(
            text="Un Barolo di Cannubi, elegante.",
            usage=TokenUsage(input_tokens=10, output_tokens=5, total_tokens=15),
        ),
    )
    generated = client.post(f"/api/v1/ai/wishlist/{item_id}/notes")
    assert generated.status_code == 200
    assert generated.json()["ai_notes"] == "Un Barolo di Cannubi, elegante."
    audit = client.get(
        "/api/v1/ai/audit", params={"entity_type": "wishlist", "entity_id": item_id}
    ).json()
    assert any(entry["feature"] == "ai_notes" for entry in audit)


def test_wishlist_sensory_signature_is_estimated_from_grapes_but_not_from_type_alone():
    client, item_id = _client_with_wishlist_item(type="Red")
    assert client.get(f"/api/v1/taste-profile/wishlist/{item_id}/sensory").json() is None

    with harness.TestingSessionLocal() as db:
        db.add(
            SensoryProfileBaseline(
                entity_type="grape",
                entity_key="nebbiolo",
                dimensions={"body": 0.75, "tannin": 0.9},
                confidence=0.7,
            )
        )
        db.commit()
    assert (
        client.patch(f"/api/v1/wishlist/{item_id}", json={"grapes": [{"name": "Nebbiolo"}]})
    ).status_code == 200
    signature = client.get(f"/api/v1/taste-profile/wishlist/{item_id}/sensory")
    assert signature.status_code == 200
    body = signature.json()
    assert body["estimated"] is True
    assert body["source"] == "grape"
    assert body["dimensions"]["tannin"] == 0.9


def test_wishlist_sensory_signature_is_scoped_to_the_household():
    owner, item_id = _client_with_wishlist_item()
    stranger = TestClient(app)
    assert harness.register(stranger, email="other@example.com").status_code == 201
    pending = owner.get("/api/v1/auth/pending-users").json()[0]
    assert owner.post(f"/api/v1/auth/pending-users/{pending['id']}/approve").status_code == 200
    login = {"email": "other@example.com", "password": "strong-password-1"}
    assert stranger.post("/api/v1/auth/login", json=login).status_code == 200
    assert stranger.get(f"/api/v1/taste-profile/wishlist/{item_id}/sensory").status_code == 404
