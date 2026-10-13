import importlib.util
from pathlib import Path
from uuid import UUID, uuid4

import sqlalchemy as sa
from alembic.migration import MigrationContext
from alembic.operations import Operations
from test_purchase_imports import client as client  # noqa: F401
from test_purchase_imports import confirmation, image, preview
from test_sensory_agent import setup as setup  # noqa: F401

from app.api.deps import get_current_context
from app.api.routes import wines
from app.core.config import settings
from app.models import Household, PurchaseDocumentWine, PurchaseImport, Wine, WineStockLot
from app.services.purchase_documents import document_path


def test_pdf_original_preserved_and_filename_sanitized(client):
    from test_purchase_imports import invoice_pdf

    test, _, _, _, _ = client
    content = invoice_pdf()
    response = test.post(
        "/imports/purchases/preview",
        files={"document": ("../../invoice.pdf", content, "application/pdf")},
    )
    assert response.status_code == 200, response.text
    docs = test.get("/imports/purchases/documents").json()
    assert docs[0]["filename"] == "invoice.pdf"
    original = test.get(f"/imports/purchases/{response.json()['id']}/document")
    assert original.content == content
    assert original.headers["content-type"] == "application/pdf"


def test_known_document_can_be_rearchived_without_remaining_ai_credit(client, monkeypatch):
    test, db, context, _, calls = client
    record = preview(test)
    stored = db.get(PurchaseImport, UUID(record["id"]))
    document_path(stored).unlink()
    from app.api.routes import purchase_imports

    monkeypatch.setattr(purchase_imports, "is_free_tier", lambda context: True)
    monkeypatch.setattr(purchase_imports, "ai_credit_balance", lambda db, user: 0)
    assert preview(test)["id"] == record["id"]
    assert len(calls) == 1
    assert document_path(stored).is_file()


def confirmed(test, rows=None):
    record = preview(test)
    payload = confirmation()
    if rows:
        payload["rows"] = rows
        payload["document_total"] = "180"
    response = test.post(f"/imports/purchases/{record['id']}/confirm", json=payload)
    assert response.status_code == 200, response.text
    return record, response.json()


def test_original_archived_once_downloadable_and_linked_to_all_purchase_wines(client):
    test, db, _, _, calls = client
    payload = confirmation()["rows"][0]
    record, result = confirmed(test, [payload, {**payload, "name": "Brunello"}])
    stored = db.get(PurchaseImport, UUID(record["id"]))
    path = document_path(stored)
    assert path.read_bytes() == image()
    assert len(list(path.parent.iterdir())) == 1
    assert len(list(db.scalars(sa.select(PurchaseDocumentWine)))) == 2
    for wine_id in result["wine_ids"]:
        docs = test.get("/imports/purchases/documents", params={"wine_id": wine_id}).json()
        assert len(docs) == 1 and docs[0]["wine_count"] == 2
        url = docs[0]["url"].removeprefix("/api/v1")
        original = test.get(url)
        assert original.content == image()
        assert original.headers["content-type"] == "image/png"
        assert original.headers["cache-control"] == "private, no-store"
        assert original.headers["content-disposition"].startswith("inline;")
        assert (
            test.get(url + "?download=true")
            .headers["content-disposition"]
            .startswith("attachment;")
        )
    assert preview(test)["id"] == record["id"]
    assert len(calls) == 1
    assert len(list(db.scalars(sa.select(PurchaseDocumentWine)))) == 2


def test_deleting_document_keeps_wines_lots_and_duplicate_protection(client):
    test, db, _, _, _ = client
    record, result = confirmed(test)
    stored = db.get(PurchaseImport, UUID(record["id"]))
    original_hash = stored.document_hash
    path = document_path(stored)
    url = f"/imports/purchases/{record['id']}/document"
    assert test.delete(url + "?only_unlinked=true").status_code == 409
    assert test.delete(url).status_code == 204
    assert not path.exists()
    assert test.get(url).status_code == 404
    assert test.get("/imports/purchases/documents").json() == []
    assert stored.document_hash == original_hash and stored.confirmed
    assert db.get(Wine, UUID(result["wine_ids"][0])).quantity == 3
    assert len(list(db.scalars(sa.select(WineStockLot)))) == 1
    assert test.delete(url).status_code == 204


def test_wine_deletion_keeps_shared_original_then_exposes_unlinked_document(client):
    test, db, _, _, _ = client
    # Production PostgreSQL enforces these cascades; explicitly enable them in SQLite too.
    db.commit()
    db.execute(sa.text("PRAGMA foreign_keys=ON"))
    db.commit()
    test.app.include_router(wines.router, prefix="/wines")
    payload = confirmation()["rows"][0]
    record, result = confirmed(test, [payload, {**payload, "name": "Brunello"}])
    url = f"/imports/purchases/{record['id']}/document"
    assert test.delete(f"/wines/{result['wine_ids'][0]}").status_code == 204
    assert test.get(url).status_code == 200
    assert test.get("/imports/purchases/documents").json()[0]["wine_count"] == 1
    assert test.get("/imports/purchases/documents?unlinked_only=true").json() == []
    assert test.delete(f"/wines/{result['wine_ids'][1]}").status_code == 204
    unlinked = test.get("/imports/purchases/documents?unlinked_only=true").json()
    assert len(unlinked) == 1 and unlinked[0]["wine_count"] == 0
    assert test.get(url).status_code == 200
    assert test.delete(url + "?only_unlinked=true").status_code == 204
    assert test.get(url).status_code == 404
    assert len(list(db.scalars(sa.select(PurchaseDocumentWine)))) == 0


def test_document_read_delete_and_wine_filters_are_tenant_scoped(client):
    test, db, context, wine, _ = client
    record, _ = confirmed(test)
    original_context = context
    home = Household(name="Other household")
    db.add(home)
    db.commit()
    from dataclasses import replace

    test.app.dependency_overrides[get_current_context] = lambda: replace(
        original_context, household=home
    )
    assert test.get("/imports/purchases/documents").json() == []
    assert test.get(f"/imports/purchases/documents?wine_id={wine.id}").status_code == 404
    assert test.get(f"/imports/purchases/{record['id']}/document").status_code == 404
    assert test.delete(f"/imports/purchases/{record['id']}/document").status_code == 404
    test.app.dependency_overrides[get_current_context] = lambda: original_context
    context.membership.role = "viewer"
    db.commit()
    assert test.get(f"/imports/purchases/{record['id']}/document").status_code == 200
    assert test.delete(f"/imports/purchases/{record['id']}/document").status_code == 403


def test_failed_archive_can_retry_without_repeating_ai_analysis(client, monkeypatch):
    test, _, _, _, calls = client
    bad = Path(settings.purchase_document_storage_dir)
    bad.parent.mkdir(parents=True, exist_ok=True)
    bad.write_text("not a directory")
    response = test.post(
        "/imports/purchases/preview", files={"document": ("receipt.png", image(), "image/png")}
    )
    assert response.status_code == 503
    bad.unlink()
    record = preview(test)
    assert len(calls) == 1
    assert test.get(f"/imports/purchases/{record['id']}/document").status_code == 200


def test_missing_original_and_legacy_import_are_not_exposed_as_available(client):
    test, db, context, _, _ = client
    legacy = PurchaseImport(household_id=context.household.id, document_hash=uuid4().hex)
    db.add(legacy)
    db.commit()
    assert test.get(f"/imports/purchases/{legacy.id}/document").status_code == 404
    record = preview(test)
    stored = db.get(PurchaseImport, UUID(record["id"]))
    document_path(stored).unlink()
    assert test.get("/imports/purchases/documents").json() == []
    assert test.get(f"/imports/purchases/{record['id']}/document").status_code == 404


def test_purchase_documents_migration_round_trip():
    root = Path(__file__).parents[1] / "alembic/versions"
    engine = sa.create_engine("sqlite://")
    with engine.begin() as conn:
        for table in ["households", "users", "wines"]:
            conn.execute(sa.text(f"CREATE TABLE {table} (id TEXT PRIMARY KEY)"))
        with Operations.context(MigrationContext.configure(conn)):
            for name in ["0117_purchase_imports", "0119_purchase_documents"]:
                spec = importlib.util.spec_from_file_location(name, root / f"{name}.py")
                module = importlib.util.module_from_spec(spec)
                spec.loader.exec_module(module)
                module.upgrade()
            assert len(module.revision) <= 32
            assert "purchase_document_wines" in sa.inspect(conn).get_table_names()
            assert "document_size" in {
                c["name"] for c in sa.inspect(conn).get_columns("purchase_imports")
            }
            module.downgrade()
            assert "purchase_document_wines" not in sa.inspect(conn).get_table_names()
