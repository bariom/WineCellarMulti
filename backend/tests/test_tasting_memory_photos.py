import base64
import importlib.util
from io import BytesIO
from pathlib import Path

import pytest
import sqlalchemy as sa
from alembic.migration import MigrationContext
from alembic.operations import Operations
from fastapi import HTTPException
from fastapi.testclient import TestClient
from PIL import Image

import test_auth_and_wines as harness
from app.main import app
from app.services.tasting_photos import process_memory_photo


def setup_function():
    harness.setup_function()


def teardown_function():
    harness.teardown_function()


def photo(color="green"):
    buffer = BytesIO()
    image = Image.new("RGB", (2000, 1000), color)
    exif = Image.Exif()
    exif[270] = "Private occasion"
    image.save(buffer, "JPEG", exif=exif)
    return "data:image/jpeg;base64," + base64.b64encode(buffer.getvalue()).decode()


def test_photo_is_compact_preserves_ratio_and_strips_metadata():
    content = process_memory_photo(photo())
    assert content and len(content) <= 200_000
    with Image.open(BytesIO(content)) as image:
        assert image.format == "JPEG"
        assert image.size == (1280, 640)
        assert not image.getexif()
    assert process_memory_photo(None) is None
    assert process_memory_photo("") is None


@pytest.mark.parametrize("value", ["broken", "data:image/svg+xml;base64,AAAA", "data:image/jpeg;base64,@@@@", "data:image/png;base64," + base64.b64encode(b"not a picture").decode()])
def test_invalid_photos_are_rejected(value):
    with pytest.raises(HTTPException) as error:
        process_memory_photo(value)
    assert error.value.status_code == 400


def test_cellar_photo_is_atomic_scoped_editable_and_deleted_with_tasting():
    client = TestClient(app)
    assert harness.register(client).status_code == 201
    wine = client.post("/api/v1/wines", json={"name": "Memory wine", "quantity": 2}).json()
    endpoint = f"/api/v1/wines/{wine['id']}/consume"
    assert client.post(endpoint, json={"memory_photo": "bad"}).status_code == 400
    assert client.get(f"/api/v1/wines/{wine['id']}").json()["quantity"] == 2
    response = client.post(endpoint, json={"memory_photo": photo()})
    assert response.status_code == 200, response.text
    entry = response.json()["tasting_history"][0]
    url = entry["memory_photo_url"]
    assert "base64" not in response.text
    assert client.get(url).headers["content-type"] == "image/jpeg"
    assert TestClient(app).get(url).status_code == 401
    other = TestClient(app)
    assert harness.register(other, email="other@example.com").status_code == 201
    pending = client.get("/api/v1/auth/pending-users").json()[0]
    assert client.post(f"/api/v1/auth/pending-users/{pending['id']}/approve").status_code == 200
    assert other.post("/api/v1/auth/login", json={"email": "other@example.com", "password": "strong-password-1"}).status_code == 200
    assert other.get(url).status_code == 404
    external = client.post("/api/v1/wishlist/tastings", json={"name": "Private memory", "memory_photo": photo()}).json()
    assert other.get(external["memory_photo_url"]).status_code == 404
    edit = f"/api/v1/wines/{wine['id']}/tastings/{entry['id']}"
    payload = {"consumed_at": entry["consumed_at"], "note": "New note"}
    assert client.patch(edit, json=payload).json()["tasting_history"][0]["memory_photo_url"] == url
    archive = client.get("/api/v1/wines/tasting-archive").json()
    assert next(item for item in archive["items"] if item["tasting_id"] == entry["id"])["memory_photo_url"] == url
    replacement = client.patch(edit, json={**payload, "memory_photo": photo("blue")}).json()
    assert replacement["tasting_history"][0]["memory_photo_url"] != url
    removed = client.patch(edit, json={**payload, "memory_photo": ""}).json()
    assert removed["tasting_history"][0]["memory_photo_url"] == ""
    assert client.get(url).status_code == 404
    assert client.patch(edit, json={**payload, "memory_photo": photo()}).status_code == 200
    assert client.delete(edit).status_code == 200
    assert client.get(url).status_code == 404


def test_external_photo_roundtrip_preserve_replace_remove():
    client = TestClient(app)
    assert harness.register(client).status_code == 201
    response = client.post("/api/v1/wishlist/tastings", json={"name": "Wine with friends", "memory_photo": photo()})
    assert response.status_code == 201, response.text
    entry = response.json()
    url = entry["memory_photo_url"]
    assert client.get(url).status_code == 200
    assert client.get("/api/v1/wines").json() == []
    assert client.get("/api/v1/wines/tasting-archive").json()["items"][0]["memory_photo_url"] == url
    endpoint = f"/api/v1/wishlist/tastings/{entry['id']}"
    assert client.patch(endpoint, json={"note": "Changed"}).json()["memory_photo_url"] == url
    assert client.patch(endpoint, json={"memory_photo": "bad"}).status_code == 400
    assert client.get(url).status_code == 200
    assert client.patch(endpoint, json={"memory_photo": ""}).json()["memory_photo_url"] == ""
    assert client.get(url).status_code == 404


def test_photo_migration_preserves_existing_tastings():
    spec = importlib.util.spec_from_file_location("photo_migration", Path(__file__).parents[1] / "alembic/versions/0112_tasting_memory_photos.py")
    assert spec and spec.loader
    migration = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(migration)
    assert len(migration.revision) <= 32
    engine = sa.create_engine("sqlite://")
    with engine.begin() as connection:
        for table in ("wine_tasting_entries", "external_wine_tastings"):
            connection.execute(sa.text(f"CREATE TABLE {table} (id TEXT PRIMARY KEY)"))
            connection.execute(sa.text(f"INSERT INTO {table} VALUES ('existing')"))
        with Operations.context(MigrationContext.configure(connection)):
            migration.upgrade()
            for table in ("wine_tasting_entries", "external_wine_tastings"):
                assert connection.execute(sa.text(f"SELECT id, memory_photo, memory_photo_version FROM {table}")).one() == ("existing", None, "")
            migration.downgrade()
            for table in ("wine_tasting_entries", "external_wine_tastings"):
                assert connection.execute(sa.text(f"SELECT id FROM {table}")).scalar() == "existing"
