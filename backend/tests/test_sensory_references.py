from types import SimpleNamespace
from uuid import uuid4

import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, func, select
from sqlalchemy.orm import Session
from sqlalchemy.pool import StaticPool

from app.api.deps import get_current_context, require_app_admin_context
from app.db.base import Base
from app.db.session import get_db
from app.main import app
from app.models import SharedWineFact, SharedWineIdentity, WineSensoryProfile
from app.services.sensory_references import import_references, preview_references


@pytest.fixture
def db():
    engine = create_engine(
        "sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool
    )
    Base.metadata.create_all(engine)
    with Session(engine) as session:
        yield session
    engine.dispose()


def test_batch_has_sources_and_no_numeric_sensory_claims(db):
    preview = preview_references(db)
    assert len(preview.rows) == 5
    assert all(row.status == "new" for row in preview.rows)
    assert all(row.dossier.limitations for row in preview.rows)
    assert all(row.dossier.source_url.scheme == "https" for row in preview.rows)
    assert all(row.existing_dimensions == {} for row in preview.rows)
    assert "<0.5" in preview.rows[1].dossier.analytical["Zucchero residuo"]


def test_import_is_idempotent_and_preserves_approved_profile(db):
    preview = preview_references(db)
    ids = [preview.rows[0].dossier.id]
    assert import_references(db, preview.revision, ids, "editor") == 1
    identity = db.scalar(select(SharedWineIdentity))
    profile = WineSensoryProfile(
        identity_id=identity.id,
        dimensions={"body": 0.64},
        source="manual",
        confidence=1,
        validated=True,
    )
    db.add(profile)
    db.flush()
    preview = preview_references(db)
    assert preview.rows[0].status == "imported"
    assert preview.rows[0].review_status == "needs_evidence_review"
    assert preview.rows[0].existing_dimensions == {"body": 0.64}
    assert preview.previously_approved_profiles == 1
    assert import_references(db, preview.revision, ids, "editor") == 0
    fact = db.scalar(select(SharedWineFact))
    db.delete(fact)
    db.flush()
    preview = preview_references(db)
    assert preview.rows[0].status == "matched"
    assert import_references(db, preview.revision, ids, "editor") == 1
    db.refresh(profile)
    assert profile.validated and profile.dimensions == {"body": 0.64}
    assert db.scalar(select(func.count()).select_from(SharedWineFact)) == 1


def test_stale_preview_and_unknown_selection_do_not_write(db):
    preview = preview_references(db)
    with pytest.raises(ValueError):
        import_references(db, preview.revision, ["unknown", preview.rows[0].dossier.id], "editor")
    assert db.scalar(select(func.count()).select_from(SharedWineIdentity)) == 0
    import_references(db, preview.revision, [preview.rows[0].dossier.id], "editor")
    with pytest.raises(ValueError, match="scaduta"):
        import_references(db, preview.revision, [preview.rows[1].dossier.id], "editor")
    assert db.scalar(select(func.count()).select_from(SharedWineIdentity)) == 1


def test_alias_conflict_is_not_merged_or_imported(db):
    db.add(
        SharedWineIdentity(
            identity_key="x" * 64,
            name="Monte Bello Estate",
            producer="Ridge",
            vintage="2022",
            normalized_name="monte bello estate",
            normalized_producer="ridge",
            normalized_vintage="2022",
        )
    )
    db.flush()
    preview = preview_references(db)
    assert preview.rows[0].status == "conflict"
    with pytest.raises(ValueError):
        import_references(db, preview.revision, [preview.rows[0].dossier.id], "editor")
    assert db.scalar(select(func.count()).select_from(SharedWineFact)) == 0


def test_changed_dossier_is_conflict_not_overwritten(db):
    preview = preview_references(db)
    import_references(db, preview.revision, [preview.rows[0].dossier.id], "editor")
    fact = db.scalar(select(SharedWineFact))
    fact.payload = {"dossier": {"unknown": "previous edition"}}
    db.flush()
    assert preview_references(db).rows[0].status == "conflict"


def test_only_app_admin_can_access_global_catalog():
    context = SimpleNamespace(user=SimpleNamespace(id=uuid4(), is_app_admin=False))
    with pytest.raises(HTTPException) as exc:
        require_app_admin_context(context)
    assert exc.value.status_code == 403
    context.user.is_app_admin = True
    assert require_app_admin_context(context) is context


def test_http_permissions_import_and_stale_conflict(db):
    context = SimpleNamespace(user=SimpleNamespace(id=uuid4(), is_app_admin=False))
    app.dependency_overrides[get_current_context] = lambda: context
    app.dependency_overrides[get_db] = lambda: db
    try:
        with TestClient(app) as client:
            path = "/api/v1/taste-profile/admin/references"
            assert client.get(path).status_code == 403
            assert client.post(path, json={"revision": "a" * 64, "ids": ["x"]}).status_code == 403
            context.user.is_app_admin = True
            preview = client.get(path).json()
            request = {
                "revision": preview["revision"],
                "ids": [preview["rows"][0]["dossier"]["id"]],
            }
            response = client.post(path, json=request)
            assert response.status_code == 200
            assert response.json()["rows"][0]["status"] == "imported"
            assert client.post(path, json=request).status_code == 409
            assert client.post(path, json={"revision": "wrong", "ids": []}).status_code == 422
            assert db.scalar(select(func.count()).select_from(SharedWineFact)) == 1
    finally:
        app.dependency_overrides.clear()
