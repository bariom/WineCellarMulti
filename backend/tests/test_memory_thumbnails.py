import base64
import random
from io import BytesIO

import pytest
import test_auth_and_wines as harness
from fastapi.testclient import TestClient
from PIL import Image
from test_tasting_memory_photos import photo

from app.main import app
from app.services.tasting_photos import process_memory_photo, thumbnail_memory_photo


def setup_function():
    harness.setup_function()


def teardown_function():
    harness.teardown_function()


def test_thumbnail_reduces_bytes_and_dimensions_without_changing_original():
    image = Image.frombytes("RGB", (1280, 960), random.Random(7).randbytes(1280 * 960 * 3))
    uploaded = BytesIO()
    image.save(uploaded, "JPEG", quality=85)
    original = process_memory_photo(
        "data:image/jpeg;base64," + base64.b64encode(uploaded.getvalue()).decode()
    )
    assert original
    thumbnail = thumbnail_memory_photo(original)
    assert len(thumbnail) < len(original) * 0.4
    with Image.open(BytesIO(thumbnail)) as preview:
        assert preview.size == (480, 360)
        assert preview.format == "JPEG"
        assert not preview.getexif()
    with Image.open(BytesIO(original)) as full:
        assert full.width > 480


@pytest.mark.parametrize("source", ["cellar", "external"])
@pytest.mark.parametrize("origin", [None, "http://localhost:5173"])
def test_thumbnail_cache_revalidates_permissions_versions_and_deleted_memories(source, origin):
    client = TestClient(app, headers={"Origin": origin} if origin else {})
    assert harness.register(client).status_code == 201
    if source == "cellar":
        wine = client.post("/api/v1/wines", json={"name": "Thumbnail wine", "quantity": 2}).json()
        saved = client.post(
            f"/api/v1/wines/{wine['id']}/consume", json={"memory_photo": photo()}
        ).json()["tasting_history"][0]
        edit = f"/api/v1/wines/{wine['id']}/tastings/{saved['id']}"
    else:
        saved = client.post(
            "/api/v1/wishlist/tastings", json={"name": "Thumbnail wine", "memory_photo": photo()}
        ).json()
        edit = f"/api/v1/wishlist/tastings/{saved['id']}"
    url = saved["memory_photo_url"]
    thumbnail_url = url + "&size=thumbnail"
    full = client.get(url)
    preview = client.get(thumbnail_url)
    assert full.status_code == preview.status_code == 200
    assert preview.headers["cache-control"] == "private, no-cache"
    # CORS middleware may also add Origin; Vary is a case-insensitive field list.
    assert "cookie" in {field.strip().lower() for field in preview.headers["vary"].split(",")}
    assert preview.headers["etag"] != full.headers["etag"]
    with Image.open(BytesIO(preview.content)) as image:
        assert image.size == (480, 240)
    conditional = {"If-None-Match": preview.headers["etag"]}
    cached = client.get(thumbnail_url, headers=conditional)
    assert cached.status_code == 304 and not cached.content
    assert cached.headers["cache-control"] == "private, no-cache"
    assert "cookie" in {field.strip().lower() for field in cached.headers["vary"].split(",")}
    assert client.get(url, headers=conditional).status_code == 200
    assert client.get(url + "&size=invalid").status_code == 422
    assert TestClient(app).get(thumbnail_url, headers=conditional).status_code == 401
    other = TestClient(app)
    assert harness.register(other, email="thumbnail-other@example.com").status_code == 201
    pending = client.get("/api/v1/auth/pending-users").json()[0]
    assert client.post(f"/api/v1/auth/pending-users/{pending['id']}/approve").status_code == 200
    assert (
        other.post(
            "/api/v1/auth/login",
            json={"email": "thumbnail-other@example.com", "password": "strong-password-1"},
        ).status_code
        == 200
    )
    assert other.get(thumbnail_url, headers=conditional).status_code == 404
    # Existing photos acquire previews on demand; edits invalidate both variants.
    payload = {"consumed_at": saved["consumed_at"], "note": "", "memory_photo": photo("blue")}
    assert client.patch(edit, json=payload).status_code == 200
    changed = client.get(thumbnail_url, headers=conditional)
    assert changed.status_code == 200
    assert changed.headers["etag"] != preview.headers["etag"]
    assert client.patch(edit, json={**payload, "memory_photo": ""}).status_code == 200
    assert client.get(thumbnail_url, headers=conditional).status_code == 404
