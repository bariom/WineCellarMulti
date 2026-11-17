"""Tastings of wines that cannot be researched can be left out of sensory enrichment."""

from fastapi.testclient import TestClient
from test_auth_and_wines import register
from test_auth_and_wines import setup_function as setup_function  # noqa: F401
from test_auth_and_wines import teardown_function as teardown_function  # noqa: F401

from app.main import app

PREVIEW = "/api/v1/taste-profile/me/external-tastings/enrichment-preview"
DISMISS = "/api/v1/taste-profile/me/external-tastings/enrichment-dismiss"


def add_tasting(client: TestClient, name: str) -> str:
    response = client.post(
        "/api/v1/wishlist/tastings",
        json={"name": name, "producer": "Cantina", "tasting_rating": 4},
    )
    assert response.status_code == 201, response.text
    return response.json()["id"]


def test_dismissed_tastings_are_no_longer_proposed():
    client = TestClient(app)
    assert register(client).status_code == 201
    egyptian = add_tasting(client, "Layali")
    other = add_tasting(client, "Altro")
    third = add_tasting(client, "Terzo")
    assert client.get(PREVIEW).json()["missing_count"] == 3

    one = client.post(DISMISS, json={"ids": [egyptian]})
    assert one.status_code == 200, one.text
    assert one.json()["missing_count"] == 2
    assert {item["id"] for item in one.json()["items"]} == {other, third}

    everything = client.post(DISMISS, json={"ids": []})
    assert everything.json() == {"missing_count": 0, "items": []}
    assert client.get(PREVIEW).json()["missing_count"] == 0
    # The tastings themselves stay in the diary.
    assert client.get("/api/v1/wines/tasting-archive?origin=external").json()["total"] == 3
