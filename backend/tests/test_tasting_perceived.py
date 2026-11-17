"""A tasting remembers how the wine felt: body, acidity, tannin and sweetness, each optional."""

from fastapi.testclient import TestClient
from test_auth_and_wines import register
from test_auth_and_wines import setup_function as setup_function  # noqa: F401
from test_auth_and_wines import teardown_function as teardown_function  # noqa: F401

from app.main import app

ARCHIVE = "/api/v1/wines/tasting-archive"


def archive_perceived(client: TestClient) -> dict[str, dict[str, int]]:
    return {item["wine_name"]: item["perceived"] for item in client.get(ARCHIVE).json()["items"]}


def test_cellar_tastings_keep_the_perceived_traits_and_edits_change_them():
    client = TestClient(app)
    assert register(client).status_code == 201
    wine = client.post(
        "/api/v1/wines",
        json={"name": "Rovo", "producer": "Lunaria", "vintage": "2020", "quantity": 2},
    )
    assert wine.status_code == 201, wine.text
    wine_id = wine.json()["id"]
    consumed = client.post(
        f"/api/v1/wines/{wine_id}/consume",
        json={"tasting_rating": 5, "tasting_perceived": {"body": 4, "tannin": 2}},
    )
    assert consumed.status_code == 200, consumed.text
    (entry,) = consumed.json()["tasting_history"]
    assert entry["perceived"] == {"body": 4, "tannin": 2}
    assert archive_perceived(client) == {"Rovo": {"body": 4, "tannin": 2}}

    url = f"/api/v1/wines/{wine_id}/tastings/{entry['id']}"
    # An edit from an older client, without the traits, keeps them.
    kept = client.patch(url, json={"consumed_at": "2026-11-01", "note": "Ottimo"})
    assert kept.json()["tasting_history"][0]["perceived"] == {"body": 4, "tannin": 2}
    changed = client.patch(
        url, json={"consumed_at": "2026-11-01", "tasting_perceived": {"acidity": 5}}
    )
    assert changed.json()["tasting_history"][0]["perceived"] == {"acidity": 5}
    assert archive_perceived(client) == {"Rovo": {"acidity": 5}}
    cleared = client.patch(url, json={"consumed_at": "2026-11-01", "tasting_perceived": {}})
    assert cleared.json()["tasting_history"][0]["perceived"] == {}
    assert archive_perceived(client) == {"Rovo": {}}


def test_external_tastings_keep_the_perceived_traits_and_reject_odd_values():
    client = TestClient(app)
    assert register(client).status_code == 201
    created = client.post(
        "/api/v1/wishlist/tastings",
        json={"name": "Layali", "tasting_perceived": {"sweetness": 1, "body": 3}},
    )
    assert created.status_code == 201, created.text
    assert created.json()["perceived"] == {"sweetness": 1, "body": 3}
    assert archive_perceived(client) == {"Layali": {"sweetness": 1, "body": 3}}

    url = f"/api/v1/wishlist/tastings/{created.json()['id']}"
    assert client.patch(url, json={"note": "Ricordo"}).json()["perceived"] == {
        "sweetness": 1,
        "body": 3,
    }
    assert client.patch(url, json={"tasting_perceived": {"tannin": 2}}).json()["perceived"] == {
        "tannin": 2
    }
    for odd in ({"body": 6}, {"body": 0}, {"body": 2.5}, {"colour": 3}):
        response = client.post(
            "/api/v1/wishlist/tastings", json={"name": "Altro", "tasting_perceived": odd}
        )
        assert response.status_code == 422, odd
