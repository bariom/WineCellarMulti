from dataclasses import replace
from datetime import UTC, datetime, timedelta
from types import SimpleNamespace

import pytest
from fastapi import BackgroundTasks, FastAPI, HTTPException
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import sessionmaker
from test_sensory_agent import setup as setup  # noqa: F401

from app.api.deps import get_current_context
from app.api.routes import taste_profiles as routes
from app.db.session import get_db
from app.models import Household, SensoryBatchRun, Wine, WineSensoryProfile
from app.schemas.taste_profile import BatchEnrichmentRequest
from app.services import sensory_agent
from app.services import sensory_batch_jobs as jobs
from app.services.shared_wine_data import resolve_shared_identity


def test_batch_migration_upgrade_and_downgrade():
    import importlib.util
    from pathlib import Path

    from alembic.migration import MigrationContext
    from alembic.operations import Operations
    from sqlalchemy import create_engine, inspect

    path = Path(__file__).parents[1] / "alembic/versions/0120_sensory_batch.py"
    spec = importlib.util.spec_from_file_location("batch_migration", path)
    assert spec and spec.loader
    migration = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(migration)
    assert len(migration.revision) <= 32
    engine = create_engine("sqlite://")
    with engine.begin() as connection:
        migration.op = Operations(MigrationContext.configure(connection))
        migration.upgrade()
        inspector = inspect(connection)
        assert "sensory_batch_runs" in inspector.get_table_names()
        assert {item["name"] for item in inspector.get_columns("sensory_batch_runs")} == {
            column.name for column in SensoryBatchRun.__table__.columns
        }
        assert {
            item["referred_table"] for item in inspector.get_foreign_keys("sensory_batch_runs")
        } == {"households", "users"}
        migration.downgrade()
        assert "sensory_batch_runs" not in inspect(connection).get_table_names()
    engine.dispose()


@pytest.fixture
def batch(setup, monkeypatch):
    db, context, first = setup
    first.type = "Red"
    factory = sessionmaker(bind=db.get_bind())
    monkeypatch.setattr(jobs, "SessionLocal", factory)
    monkeypatch.setattr(sensory_agent, "worker_context", lambda *_args: context)
    db.commit()
    return db, context, first, factory


def start(batch, limit=50):
    db, context, _, _ = batch
    tasks = BackgroundTasks()
    result = jobs.start_batch(
        db, context, BatchEnrichmentRequest(scope="cellar", limit=limit), tasks
    )
    return result, tasks


def run(batch, run_id):
    _, context, _, _ = batch
    jobs.run_batch(run_id, context.household.id, context.session.id)


def add_wine(db, context, name):
    wine = Wine(
        household_id=context.household.id,
        name=name,
        producer="Producer",
        vintage="2022",
        type="Red",
    )
    db.add(wine)
    db.flush()
    resolve_shared_identity(db, wine, create=True)
    db.commit()
    return wine


def test_start_returns_before_generation_and_repeated_start_reuses_run(batch, monkeypatch):
    monkeypatch.setattr(
        routes, "_generate_with_sensory_metadata", lambda *a, **k: pytest.fail("AI on start")
    )
    response, tasks = start(batch)
    assert response.status == "queued" and response.total == 1
    assert len(tasks.tasks) == 1
    again, more = start(batch)
    assert again.id == response.id and not more.tasks
    db, context, _, _ = batch
    with pytest.raises(HTTPException) as conflict:
        jobs.start_batch(db, context, BatchEnrichmentRequest(scope="catalog"), BackgroundTasks())
    assert conflict.value.status_code == 409


def test_snapshot_limits_missing_identities_and_empty_batch_finishes_immediately(
    batch, monkeypatch
):
    db, context, first, _ = batch
    db.add(
        WineSensoryProfile(
            identity_id=first.shared_identity_id,
            dimensions={"body": 0.7},
            generation_status="available",
        )
    )
    db.commit()
    empty, tasks = start(batch)
    assert empty.status == "completed" and empty.total == 0 and not tasks.tasks
    add_wine(db, context, "Second")
    add_wine(db, context, "Third")
    monkeypatch.setattr(jobs.settings, "wine_sensory_ai_batch_max", 1)
    response, tasks = start(batch, limit=50)
    assert response.total == 1 and len(tasks.tasks) == 1
    stored = db.get(SensoryBatchRun, response.id)
    assert stored.targets[0]["identity_id"] != str(first.shared_identity_id)


def test_worker_commits_each_wine_and_continues_after_bad_or_empty_ai(batch, monkeypatch):
    db, context, first, factory = batch
    add_wine(db, context, "Bad result")
    add_wine(db, context, "Empty result")
    add_wine(db, context, "Last wine")
    first_id = first.id
    calls = []

    def generate(session, wine, **kwargs):
        calls.append(wine.name)
        if len(calls) == 2:
            with factory() as check:
                assert check.scalar(select(WineSensoryProfile)) is not None
                saved = check.scalar(select(SensoryBatchRun))
                assert saved.processed == 1 and saved.resolved == 1
            raise HTTPException(502, "secret-provider-payload")
        if wine.name == "Empty result":
            return None
        profile = WineSensoryProfile(
            identity_id=wine.shared_identity_id,
            dimensions={"body": 0.6},
            generation_status="available",
            source="ai",
        )
        session.add(profile)
        return profile

    monkeypatch.setattr(routes, "_generate_with_sensory_metadata", generate)
    response, _ = start(batch)
    run(batch, response.id)
    status = jobs.scoped_run(db, context, response.id)
    assert (status.status, status.processed, status.resolved, status.failed) == (
        "completed",
        4,
        2,
        1,
    )
    assert "secret" not in str(status.issue)
    assert db.get(Wine, first_id) is not None
    run(batch, response.id)
    assert len(calls) == 4


def test_worker_preserves_profiles_created_after_queueing(batch, monkeypatch):
    db, context, first, _ = batch
    response, _ = start(batch)
    db.add(
        WineSensoryProfile(
            identity_id=first.shared_identity_id,
            dimensions={"body": 0.9},
            generation_status="available",
            validated=True,
        )
    )
    db.commit()
    monkeypatch.setattr(
        routes, "_generate_with_sensory_metadata", lambda *a, **k: pytest.fail("overwritten")
    )
    run(batch, response.id)
    status = jobs.scoped_run(db, context, response.id)
    assert status.skipped == 1 and status.resolved == 0 and status.processed == 1
    assert db.scalar(select(WineSensoryProfile)).dimensions == {"body": 0.9}


@pytest.mark.parametrize(
    "error", [PermissionError("private session"), HTTPException(403, "not admin")]
)
def test_worker_stops_when_authorization_expires(batch, monkeypatch, error):
    db, context, _, _ = batch
    response, _ = start(batch)

    def expired(*args):
        raise error

    monkeypatch.setattr(sensory_agent, "worker_context", expired)
    run(batch, response.id)
    status = jobs.scoped_run(db, context, response.id)
    assert status.status == "failed" and status.issue == "session_expired"
    assert status.processed == 0


def test_status_scopes_household_and_user_and_expires_interrupted_runs(batch):
    db, context, _, _ = batch
    response, _ = start(batch)
    other = Household(name="Other")
    db.add(other)
    db.commit()
    for invalid in [
        replace(context, household=other),
        replace(context, user=SimpleNamespace(id=other.id)),
    ]:
        with pytest.raises(HTTPException) as denied:
            jobs.scoped_run(db, invalid, response.id)
        assert denied.value.status_code == 404
    stored = db.get(SensoryBatchRun, response.id)
    stored.updated_at = datetime.now(UTC) - timedelta(minutes=16)
    stored.resolved = 1
    db.commit()
    status = jobs.scoped_run(db, context, response.id)
    assert status.status == "failed" and status.issue == "interrupted" and status.resolved == 1


def test_batch_http_contract_and_admin_authorization(batch, monkeypatch):
    db, context, _, _ = batch
    app = FastAPI()
    app.include_router(routes.router)
    app.dependency_overrides[get_db] = lambda: db
    app.dependency_overrides[get_current_context] = lambda: context
    calls = []
    monkeypatch.setattr(jobs, "run_batch", lambda *args: calls.append(args))
    with TestClient(app) as client:
        response = client.post(
            "/taste-profile/admin/batches", json={"scope": "cellar", "limit": 50}
        )
        assert response.status_code == 202, response.text
        result = response.json()
        assert result["status"] == "queued" and len(calls) == 1
        assert "targets" not in result and "user_id" not in result
        assert client.get(f"/taste-profile/admin/batches/{result['id']}").status_code == 200
        context.user.is_app_admin = False
        db.commit()
        assert client.get(f"/taste-profile/admin/batches/{result['id']}").status_code == 403
        assert client.post("/taste-profile/admin/batches", json={}).status_code == 403
