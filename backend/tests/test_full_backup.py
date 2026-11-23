"""Complete backup: every table with a cellar's or a user's data is either backed up or
excluded with a reason, and the ZIP holds the records, photos and documents."""

import base64
import hashlib
import io
import json
import zipfile
from pathlib import Path
from uuid import UUID

import pytest
from fastapi.testclient import TestClient
from PIL import Image
from sqlalchemy import select
from test_auth_and_wines import TestingSessionLocal, engine, register
from test_auth_and_wines import setup_function as setup_function  # noqa: F401
from test_auth_and_wines import teardown_function as teardown_function  # noqa: F401

import app.models  # noqa: F401
from app.core.config import settings
from app.db.base import Base
from app.main import app
from app.models import PurchaseDocumentWine, PurchaseImport, Wine, WineStockLot
from app.services import backup_restore
from app.services.backup_registry import BACKUP_TABLES, EXCLUDED_TABLES, SCHEMA

EXPORT = "/api/v1/backup/export"
PREVIEW = "/api/v1/backup/preview"
RESTORE = "/api/v1/backup/restore"
PNG = b"\x89PNG\r\n\x1a\n" + b"\x00" * 32
OWNER_COLUMNS = ("household_id", "user_id", "created_by_user_id")


def test_every_table_with_cellar_or_user_data_is_backed_up_or_excluded_with_a_reason():
    backed_up = {item.name for item in BACKUP_TABLES}
    assert not backed_up & set(EXCLUDED_TABLES), "A table cannot be both backed up and excluded"
    assert len(backed_up) == len(BACKUP_TABLES), "A table is listed twice"
    covered = backed_up | set(EXCLUDED_TABLES)
    tables = Base.metadata.tables
    parents = {item.parent[1] for item in BACKUP_TABLES if item.parent}
    unknown = sorted(
        name
        for name, table in tables.items()
        if name not in covered
        and (
            any(column in table.c for column in OWNER_COLUMNS)
            or any(fk.column.table.name in backed_up | parents for fk in table.foreign_keys)
        )
    )
    assert not unknown, (
        f"New tables with cellar or user data: {unknown}. Add each to BACKUP_TABLES in "
        "app/services/backup_registry.py, or to EXCLUDED_TABLES with the reason."
    )
    for name in backed_up | set(EXCLUDED_TABLES):
        assert name in tables, f"{name} is in the backup registry but not in the database"


def open_backup(response) -> tuple[dict, dict, zipfile.ZipFile]:
    assert response.status_code == 200, response.text
    assert response.headers["content-type"] == "application/zip"
    archive = zipfile.ZipFile(io.BytesIO(response.content))
    manifest = json.loads(archive.read("manifest.json"))
    data = json.loads(archive.read("data.json"))["tables"]
    return manifest, data, archive


def test_the_export_holds_wines_tastings_lots_and_the_drinks_of_other_wines():
    client = TestClient(app)
    assert register(client).status_code == 201
    wine = client.post(
        "/api/v1/wines",
        json={"name": "Rovo", "producer": "Lunaria", "vintage": "2020", "quantity": 3},
    )
    assert wine.status_code == 201, wine.text
    wine_id = wine.json()["id"]
    consumed = client.post(
        f"/api/v1/wines/{wine_id}/consume",
        json={"tasting_rating": 5, "tasting_perceived": {"body": 4}},
    )
    assert consumed.status_code == 200, consumed.text
    external = client.post(
        "/api/v1/wishlist/tastings",
        json={"name": "Vino da amici", "tasting_rating": 4, "tasting_perceived": {"acidity": 2}},
    )
    assert external.status_code in (200, 201), external.text

    manifest, data, archive = open_backup(client.get(EXPORT))
    assert manifest["schema"] == SCHEMA
    assert set(data) == {item.name for item in BACKUP_TABLES}
    assert manifest["counts"]["wines"] == 1
    assert [row["name"] for row in data["wines"]] == ["Rovo"]
    (tasting,) = data["wine_tasting_entries"]
    assert tasting["perceived"] == {"body": 4}
    (other,) = data["external_wine_tastings"]
    assert other["name"] == "Vino da amici" and other["perceived"] == {"acidity": 2}
    assert data["wine_stock_lots"], "The bottles bought must keep their lots"
    assert all(
        "invite_token_hash" not in row or row["invite_token_hash"] is None
        for row in data["coownership_participants"]
    )
    assert archive.namelist()[:2] == ["manifest.json", "data.json"]


def test_only_cellar_admins_can_export():
    client = TestClient(app)
    assert client.get(EXPORT).status_code == 401


# --- restore -----------------------------------------------------------------


@pytest.fixture
def storage(tmp_path, monkeypatch):
    monkeypatch.setattr(settings, "wine_photo_storage_dir", str(tmp_path / "photos"))
    monkeypatch.setattr(settings, "purchase_document_storage_dir", str(tmp_path / "documents"))
    return tmp_path


def memory_photo(color="green") -> str:
    buffer = io.BytesIO()
    Image.new("RGB", (64, 48), color).save(buffer, "JPEG")
    return "data:image/jpeg;base64," + base64.b64encode(buffer.getvalue()).decode()


def upload(client, url, content: bytes):
    return client.post(url, files={"file": ("backup.zip", content, "application/zip")})


def fill_cellar(client) -> dict:
    """A cellar with one of every kind of record the API lets us create."""
    location = client.post(
        "/api/v1/storage/locations", json={"name": "Cantina", "is_default": True}
    )
    assert location.status_code == 201, location.text
    location_id = location.json()["id"]
    shelf = client.post(f"/api/v1/storage/locations/{location_id}/bins", json={"name": "A-01"})
    assert shelf.status_code == 201, shelf.text
    tag = client.post("/api/v1/tags", json={"name": "Primeur", "color": "#8f2039"})
    assert tag.status_code == 201, tag.text
    wine = client.post(
        "/api/v1/wines",
        json={
            "name": "Tignanello",
            "producer": "Antinori",
            "vintage": "2021",
            "quantity": 6,
            "price": "80",
            "status": "Delivered",
            "tags": ["Primeur"],
            "storage_allocations": [
                {"location_id": location_id, "bin_id": shelf.json()["id"], "quantity": 6}
            ],
        },
    )
    assert wine.status_code == 201, wine.text
    wine_id = wine.json()["id"]
    other = client.post(
        "/api/v1/wines",
        json={"name": "Rovo", "producer": "Lunaria", "vintage": "2020", "quantity": 2},
    )
    assert other.status_code == 201, other.text
    sale = client.post(
        "/api/v1/sales", json={"wine_id": wine_id, "quantity": 1, "unit_sale_price": "120"}
    )
    assert sale.status_code == 201, sale.text
    consumed = client.post(
        f"/api/v1/wines/{wine_id}/consume",
        json={
            "tasting_rating": 5,
            "tasting_perceived": {"body": 4},
            "memory_photo": memory_photo(),
        },
    )
    assert consumed.status_code == 200, consumed.text
    allocations = client.put(
        f"/api/v1/intelligence/wines/{wine_id}/allocations",
        json={"allocations": [{"purpose": "maturation", "quantity": 2, "horizon_year": 2030}]},
    )
    assert allocations.status_code == 200, allocations.text
    wishlist = client.post("/api/v1/wishlist/lists", json={"name": "Da comprare"})
    assert wishlist.status_code == 201, wishlist.text
    item = client.post(
        "/api/v1/wishlist",
        json={"name": "Sassicaia", "wishlist_list_id": wishlist.json()["id"]},
    )
    assert item.status_code == 201, item.text
    external = client.post(
        "/api/v1/wishlist/tastings",
        json={
            "name": "Vino da amici",
            "tasting_rating": 4,
            "tasting_perceived": {"acidity": 2},
            "memory_photo": memory_photo("blue"),
        },
    )
    assert external.status_code in (200, 201), external.text

    db = TestingSessionLocal()
    try:
        stored = db.get(Wine, UUID(wine_id))
        assert stored is not None
        stored.photo_version = "v1"
        stored.open_bottle_lot_id = db.scalar(
            select(WineStockLot.id).where(WineStockLot.wine_id == stored.id)
        )
        household_id = stored.household_id
        photo_dir = Path(settings.wine_photo_storage_dir) / str(household_id) / wine_id
        photo_dir.mkdir(parents=True)
        (photo_dir / "thumbnail.png").write_bytes(PNG + b"thumb")
        (photo_dir / "detail.png").write_bytes(PNG + b"detail")
        record = PurchaseImport(
            household_id=household_id,
            document_hash="a" * 64,
            document_name="fattura.pdf",
            document_mime="application/pdf",
            document_size=12,
            status="confirmed",
        )
        db.add(record)
        db.flush()
        db.add(
            PurchaseDocumentWine(
                purchase_import_id=record.id, wine_id=stored.id, household_id=household_id
            )
        )
        document = (
            Path(settings.purchase_document_storage_dir)
            / str(household_id)
            / str(record.id)
            / "original"
        )
        document.parent.mkdir(parents=True)
        document.write_bytes(b"%PDF-1.4 doc")
        db.commit()
    finally:
        db.close()
    return {"wine_id": wine_id, "household_id": str(household_id)}


def empty_cellar(client):
    # SQLite applies ON DELETE CASCADE only with this pragma; Postgres always does.
    with engine.connect() as connection:
        connection.exec_driver_sql("PRAGMA foreign_keys=ON")
    try:
        response = client.delete("/api/v1/imports/cellar")
    finally:
        with engine.connect() as connection:
            connection.exec_driver_sql("PRAGMA foreign_keys=OFF")
    assert response.status_code == 200, response.text


def normalised(data: dict, archive: zipfile.ZipFile) -> dict[str, list[str]]:
    """Rows per table without the IDs a restore renews; binary members become their hash."""
    result = {}
    for name, rows in data.items():
        table = Base.metadata.tables[name]
        dropped = {"id", "entity_id"} | {column.name for column in table.c if column.foreign_keys}
        items = []
        for row in rows:
            item = {key: value for key, value in row.items() if key not in dropped}
            for key, value in item.items():
                if isinstance(value, str) and value.startswith("files/binary/"):
                    item[key] = hashlib.sha256(archive.read(value)).hexdigest()
            items.append(json.dumps(item, sort_keys=True))
        result[name] = sorted(items)
    return result


def files_by_kind(archive: zipfile.ZipFile) -> dict[str, list[str]]:
    kinds: dict[str, list[str]] = {}
    for name in archive.namelist():
        if name.startswith("files/"):
            parts = name.split("/")
            kind = parts[1] + ("/" + parts[-1] if parts[1] == "wine-photos" else "")
            kinds.setdefault(kind, []).append(hashlib.sha256(archive.read(name)).hexdigest())
    return {kind: sorted(values) for kind, values in kinds.items()}


def test_a_backup_restored_into_the_emptied_cellar_gives_back_the_same_cellar(storage):
    client = TestClient(app)
    assert register(client).status_code == 201
    filled = fill_cellar(client)
    first = client.get(EXPORT)
    _, before, before_archive = open_backup(first)
    for name in (
        "cellar_locations",
        "cellar_bins",
        "wines",
        "wine_stock_lots",
        "wine_sales",
        "wine_stock_movements",
        "wine_storage_allocations",
        "wine_strategy_allocations",
        "wine_tasting_entries",
        "external_wine_tastings",
        "wishlist_lists",
        "wishlist_items",
        "user_tags",
        "user_wine_tags",
        "purchase_imports",
        "purchase_document_wines",
    ):
        assert before[name], f"The test cellar has no {name}"
    assert len([n for n in before_archive.namelist() if n.startswith("files/binary/")]) == 2

    empty_cellar(client)
    assert client.get("/api/v1/wines").json() == []
    preview = upload(client, PREVIEW, first.content)
    assert preview.status_code == 200, preview.text
    assert preview.json()["target_empty"] is True

    restored = upload(client, RESTORE, first.content)
    assert restored.status_code == 200, restored.text
    body = restored.json()
    assert body["restored"]["wines"] == 2
    assert not any(body["skipped"].values()), body
    _, after, after_archive = open_backup(client.get(EXPORT))

    assert normalised(after, after_archive) == normalised(before, before_archive)
    assert files_by_kind(after_archive) == files_by_kind(before_archive)

    (new_wine,) = [row for row in after["wines"] if row["name"] == "Tignanello"]
    assert new_wine["id"] != filled["wine_id"]
    wine_ids = {row["id"] for row in after["wines"]}
    photo_dir = Path(settings.wine_photo_storage_dir) / filled["household_id"] / new_wine["id"]
    assert (photo_dir / "detail.png").read_bytes() == PNG + b"detail"
    assert (photo_dir / "thumbnail.png").read_bytes() == PNG + b"thumb"
    (record,) = after["purchase_imports"]
    document = (
        Path(settings.purchase_document_storage_dir)
        / filled["household_id"]
        / record["id"]
        / "original"
    )
    assert document.read_bytes() == b"%PDF-1.4 doc"
    (link,) = after["purchase_document_wines"]
    assert link["wine_id"] == new_wine["id"]
    lots = {row["id"] for row in after["wine_stock_lots"]}
    assert all(row["wine_id"] in wine_ids for row in after["wine_stock_lots"])
    assert all(row["lot_id"] in lots | {None} for row in after["wine_stock_movements"])
    assert all(row["stock_lot_id"] in lots | {None} for row in after["wine_strategy_allocations"])
    (tasting,) = after["wine_tasting_entries"]
    assert tasting["wine_id"] == new_wine["id"] and tasting["perceived"] == {"body": 4}
    (item,) = after["wishlist_items"]
    assert item["wishlist_list_id"] == after["wishlist_lists"][0]["id"]
    bins = {row["id"] for row in after["cellar_bins"]}
    assert all(row["bin_id"] in bins | {None} for row in after["wine_storage_allocations"])
    assert any(row["bin_id"] in bins for row in after["wine_storage_allocations"])
    detail = client.get(f"/api/v1/wines/{new_wine['id']}")
    assert detail.status_code == 200 and detail.json()["tags"] == ["Primeur"]
    assert detail.json()["quantity"] == 4
    assert new_wine["open_bottle_lot_id"] in lots, "The open bottle keeps its lot"


def test_a_failed_restore_leaves_no_records_and_no_files(storage, monkeypatch):
    client = TestClient(app)
    assert register(client).status_code == 201
    fill_cellar(client)
    content = client.get(EXPORT).content
    empty_cellar(client)
    before = sorted(path for path in storage.rglob("*") if path.is_file())

    def fail(self):
        raise RuntimeError("disk full")

    monkeypatch.setattr(backup_restore._Restore, "apply_household_settings", fail)
    with pytest.raises(RuntimeError):
        upload(client, RESTORE, content)
    assert client.get("/api/v1/wines").json() == []
    assert sorted(path for path in storage.rglob("*") if path.is_file()) == before


def test_a_bottle_photo_missing_from_the_backup_is_not_shown_broken(storage):
    client = TestClient(app)
    assert register(client).status_code == 201
    fill_cellar(client)
    original = zipfile.ZipFile(io.BytesIO(client.get(EXPORT).content))
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w") as archive:
        for name in original.namelist():
            if not name.endswith("detail.png"):
                archive.writestr(name, original.read(name))
    empty_cellar(client)
    response = upload(client, RESTORE, buffer.getvalue())
    assert response.status_code == 200, response.text
    assert any("foto" in warning for warning in response.json()["warnings"])
    _, after, _ = open_backup(client.get(EXPORT))
    assert all(row["photo_version"] == "" for row in after["wines"])


def test_restore_refuses_a_cellar_that_is_not_empty(storage):
    client = TestClient(app)
    assert register(client).status_code == 201
    assert client.post("/api/v1/wines", json={"name": "Rovo", "quantity": 1}).status_code == 201
    content = client.get(EXPORT).content
    preview = upload(client, PREVIEW, content)
    assert preview.status_code == 200 and preview.json()["target_empty"] is False
    response = upload(client, RESTORE, content)
    assert response.status_code == 409
    assert "non è vuota" in response.json()["detail"]
    assert len(client.get("/api/v1/wines").json()) == 1


def zip_bytes(members: dict[str, str]) -> bytes:
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w") as archive:
        for name, content in members.items():
            archive.writestr(name, content)
    return buffer.getvalue()


MANIFEST = json.dumps({"schema": SCHEMA})
NO_TABLES = json.dumps({"tables": {}})


@pytest.mark.parametrize(
    "content",
    [
        b"not a zip at all",
        zip_bytes({"data.json": NO_TABLES}),
        zip_bytes(
            {
                "manifest.json": json.dumps({"schema": "winecellarmulti.export.v2"}),
                "data.json": NO_TABLES,
            }
        ),
        zip_bytes({"manifest.json": MANIFEST, "data.json": NO_TABLES, "../../etc/passwd": "x"}),
        zip_bytes(
            {
                "manifest.json": MANIFEST,
                "data.json": NO_TABLES,
                "files/wine-photos/../../evil.png": "x",
            }
        ),
        zip_bytes(
            {
                "manifest.json": MANIFEST,
                "data.json": json.dumps(
                    {"tables": {"wines": [{"id": "x", "name": "Bad", "quantity": "many"}]}}
                ),
            }
        ),
    ],
    ids=["not-zip", "no-manifest", "wrong-schema", "zip-slip", "zip-slip-files", "bad-value"],
)
def test_restore_rejects_files_that_are_not_valid_backups(storage, content):
    client = TestClient(app)
    assert register(client).status_code == 201
    if content.startswith(b"PK") and b"many" not in content:
        assert upload(client, PREVIEW, content).status_code == 400
    response = upload(client, RESTORE, content)
    assert response.status_code == 400, response.text
    assert client.get("/api/v1/wines").json() == []
    assert not list(storage.rglob("*"))


def test_a_backup_of_another_cellar_restores_into_a_new_account(storage):
    source = TestClient(app)
    assert register(source).status_code == 201
    fill_cellar(source)
    content = source.get(EXPORT).content
    _, before, _ = open_backup(source.get(EXPORT))
    source_user = before["user_tags"][0]["user_id"]

    target = TestClient(app)
    assert register(target, "second@example.com").status_code == 201
    pending = source.get("/api/v1/auth/pending-users").json()[0]
    assert source.post(f"/api/v1/auth/pending-users/{pending['id']}/approve").status_code == 200
    login = {"email": "second@example.com", "password": "strong-password-1"}
    assert target.post("/api/v1/auth/login", json=login).status_code == 200
    preview = upload(target, PREVIEW, content)
    assert preview.status_code == 200, preview.text
    body = preview.json()
    assert body["schema"] == SCHEMA
    assert body["household_name"] == "Main Cellar"
    assert body["exported_at"]
    assert body["counts"]["wines"] == 2 and body["counts"]["wine_sales"] == 1
    members = zipfile.ZipFile(io.BytesIO(content)).namelist()
    assert body["file_count"] == len([name for name in members if name.startswith("files/")])
    assert body["file_count"] == 5
    assert body["target_empty"] is True

    restored = upload(target, RESTORE, content)
    assert restored.status_code == 200, restored.text
    assert restored.json()["file_count"] == 5
    _, after, _ = open_backup(target.get(EXPORT))
    assert sorted(row["name"] for row in after["wines"]) == ["Rovo", "Tignanello"]
    target_user = after["user_tags"][0]["user_id"]
    assert target_user != source_user
    for row in after["wines"] + after["wine_sales"] + after["wine_tasting_entries"]:
        assert row["created_by_user_id"] is None, "Non-members are not kept as authors"
    (external,) = after["external_wine_tastings"]
    assert external["created_by_user_id"] == target_user, "A required author becomes the restorer"
    assert all(row["user_id"] == target_user for row in after["user_wine_tags"])
    assert {row["household_id"] for row in after["wines"]}.isdisjoint(
        {row["household_id"] for row in before["wines"]}
    )
    # The source cellar is untouched.
    assert len(source.get("/api/v1/wines").json()) == 2


def test_only_cellar_admins_can_restore(storage):
    client = TestClient(app)
    assert upload(client, RESTORE, b"x").status_code == 401
    assert upload(client, PREVIEW, b"x").status_code == 401
