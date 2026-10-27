import pytest
import test_auth_and_wines as harness
from fastapi.testclient import TestClient
from test_tasting_memory_photos import photo

from app.main import app


def setup_function():
    harness.setup_function()


def teardown_function():
    harness.teardown_function()


def archive_entry(client: TestClient) -> dict:
    page = client.get("/api/v1/wines/tasting-archive", params={"photos_only": "true"}).json()
    return page["items"][0]


@pytest.mark.parametrize("source", ["cellar", "external"])
def test_memory_photo_place_can_be_set_corrected_and_removed(source):
    client = TestClient(app)
    assert harness.register(client).status_code == 201
    if source == "cellar":
        wine = client.post("/api/v1/wines", json={"name": "Place wine", "quantity": 2}).json()
        saved = client.post(
            f"/api/v1/wines/{wine['id']}/consume", json={"memory_photo": photo()}
        ).json()["tasting_history"][0]
    else:
        saved = client.post(
            "/api/v1/wishlist/tastings", json={"name": "Place wine", "memory_photo": photo()}
        ).json()
    url = f"/api/v1/wines/tasting-photos/{source}/{saved['id']}/location"
    entry = archive_entry(client)
    assert entry["memory_photo_location"] is None
    assert entry["can_edit_location"] is True

    place = {"latitude": 46.0037, "longitude": 8.9511}
    response = client.put(url, json={"location": place})
    assert response.status_code == 200
    assert response.json()["memory_photo_location"] == place
    assert archive_entry(client)["memory_photo_location"] == place
    if source == "cellar":
        # The wine detail reads the same place from the wine's tasting history.
        history = client.get(f"/api/v1/wines/{wine['id']}").json()["tasting_history"]
        assert history[0]["memory_photo_location"] == place

    assert client.put(url, json={"location": None}).json()["memory_photo_location"] is None
    assert archive_entry(client)["memory_photo_location"] is None

    for invalid in ({"latitude": 91, "longitude": 0}, {"latitude": 0, "longitude": -181}):
        assert client.put(url, json={"location": invalid}).status_code == 422

    # Another account cannot reach this memory, even knowing its id.
    other = TestClient(app)
    assert harness.register(other, email="place-other@example.com").status_code == 201
    pending = client.get("/api/v1/auth/pending-users").json()[0]
    assert client.post(f"/api/v1/auth/pending-users/{pending['id']}/approve").status_code == 200
    login = {"email": "place-other@example.com", "password": "strong-password-1"}
    assert other.post("/api/v1/auth/login", json=login).status_code == 200
    assert other.put(url, json={"location": place}).status_code in {403, 404}
    assert archive_entry(client)["memory_photo_location"] is None
