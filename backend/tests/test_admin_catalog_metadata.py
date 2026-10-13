from uuid import uuid4

import pytest
from fastapi import BackgroundTasks, FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import sessionmaker
from test_sensory_agent import setup as setup  # noqa: F401

from app.api.deps import get_current_context
from app.api.routes import catalog, taste_profiles, wines
from app.db.session import get_db
from app.models import Household, SensoryProfileBaseline, Wine, WineCatalogEntry, WineSensoryProfile
from app.schemas.taste_profile import BatchEnrichmentRequest
from app.services import sensory_agent, sensory_batch_jobs
from app.services.shared_wine_data import resolve_shared_identity

PAYLOAD = {
    "type": "Rosso",
    "region": " Piemonte ",
    "appellation": "Langhe DOC",
    "country": "Italia",
    "format": "750ml",
    "grapes_text": "Nebbiolo, Barbera",
    "wine_zone": "Roero",
    "locality": "Castagnito",
}


@pytest.fixture
def editor(setup):
    db, context, _ = setup
    entry = WineCatalogEntry(name="La Luna dei Tempi", producer="Massucco", is_active=True)
    db.add(entry)
    other = Household(name="Another cellar")
    db.add(other)
    db.flush()
    foreign = Wine(
        household_id=other.id,
        name=entry.name,
        producer=entry.producer,
        vintage="2019",
        type="White",
        quantity=2,
    )
    db.add(foreign)
    db.flush()
    identity = resolve_shared_identity(db, foreign, create=True)
    db.commit()
    app = FastAPI()
    app.include_router(catalog.router, prefix="/wines")
    app.include_router(wines.router, prefix="/wines")
    app.include_router(taste_profiles.router)
    app.dependency_overrides[get_db] = lambda: db
    app.dependency_overrides[get_current_context] = lambda: context
    with TestClient(app) as client:
        yield client, db, context, entry, foreign, identity


@pytest.mark.parametrize("active", [False, True])
def test_admin_edits_catalog_metadata_without_changing_private_inventory(editor, active):
    client, db, _, entry, foreign, identity = editor
    entry.is_active = active
    profile = WineSensoryProfile(identity_id=identity.id, dimensions={"body": 0.9}, validated=True)
    db.add(profile)
    db.commit()
    response = client.put(f"/wines/catalog/{entry.id}/metadata", json=PAYLOAD)
    assert response.status_code == 200, response.text
    result = response.json()
    assert result["region"] == "Piemonte" and result["type"] == "Red"
    assert result["wine_zone"] == "Roero" and result["locality"] == "Castagnito"
    assert result["is_active"] is active
    db.refresh(entry)
    db.refresh(foreign)
    db.refresh(profile)
    assert "nebbiolo" in entry.search_text and "piemonte" in entry.search_text
    assert foreign.type == "White" and foreign.region == "" and foreign.quantity == 2
    assert profile.validated and profile.dimensions == {"body": 0.9}


def test_catalog_metadata_requires_admin_and_valid_fields(editor):
    client, db, context, entry, _, _ = editor
    url = f"/wines/catalog/{entry.id}/metadata"
    for invalid in [
        {**PAYLOAD, "type": "invented"},
        {**PAYLOAD, "region": "x" * 121},
        {**PAYLOAD, "name": "renamed"},
        {**PAYLOAD, "is_active": True},
    ]:
        assert client.put(url, json=invalid).status_code == 422
    assert client.put(f"/wines/catalog/{uuid4()}/metadata", json=PAYLOAD).status_code == 404
    context.user.is_app_admin = False
    db.commit()
    assert client.put(url, json=PAYLOAD).status_code == 403


def test_shared_identity_uses_manual_catalog_metadata_for_single_and_batch_generation(
    editor, monkeypatch
):
    client, db, context, entry, foreign, identity = editor
    assert client.put(f"/wines/catalog/{entry.id}/metadata", json=PAYLOAD).status_code == 200
    db.add(
        SensoryProfileBaseline(
            entity_type="grape", entity_key="nebbiolo", dimensions={"body": 0.73}, confidence=0.9
        )
    )
    db.commit()
    monkeypatch.setattr(
        taste_profiles, "create_response", lambda *a, **k: pytest.fail("Unexpected AI")
    )
    carrier = next(
        wine
        for wine in taste_profiles._batch_candidates(db, context, "catalog")
        if wine.shared_identity_id == identity.id
    )
    assert carrier.id is None
    assert carrier.type == "Red" and carrier.region == "Piemonte"
    assert carrier.wine_zone == "Roero" and carrier.vineyard_locality == "Castagnito"
    assert carrier.grapes == [{"name": "Nebbiolo"}, {"name": "Barbera"}]
    response = client.post(f"/taste-profile/admin/profiles/{identity.id}/regenerate?allow_ai=false")
    assert response.status_code == 200, response.text
    assert response.json()["dimensions"]["body"] == 0.73
    profile = db.scalar(
        select(WineSensoryProfile).where(WineSensoryProfile.identity_id == identity.id)
    )
    db.delete(profile)
    db.commit()
    preview = taste_profiles.batch_preview(db, context, "catalog")
    assert preview.deterministic >= 1
    monkeypatch.setattr(sensory_batch_jobs, "SessionLocal", sessionmaker(bind=db.get_bind()))
    monkeypatch.setattr(sensory_agent, "worker_context", lambda *args: context)
    run = sensory_batch_jobs.start_batch(
        db, context, BatchEnrichmentRequest(scope="catalog", allow_ai=False), BackgroundTasks()
    )
    sensory_batch_jobs.run_batch(run.id, context.household.id, context.session.id)
    db.expire_all()
    profile = db.scalar(
        select(WineSensoryProfile).where(WineSensoryProfile.identity_id == identity.id)
    )
    assert profile and profile.dimensions["body"] == 0.73
    assert foreign.type == "White" and foreign.grapes == []
    assert len(list(db.scalars(select(Wine)))) == 2


@pytest.mark.parametrize("state", ["pending", "ambiguous", "missing"])
def test_shared_identity_ignores_unapproved_or_ambiguous_catalog_metadata(editor, state):
    _, db, _, entry, _, identity = editor
    entry.type = "Red"
    if state == "pending":
        entry.is_active = False
    elif state == "ambiguous":
        db.add(WineCatalogEntry(name=entry.name, producer=entry.producer, type="White"))
    else:
        db.delete(entry)
    db.commit()
    assert taste_profiles._identity_metadata(identity, db).type == ""


def test_private_wine_geography_round_trip_and_household_isolation(editor):
    client, db, context, _, foreign, _ = editor
    payload = {
        "name": "Geographic wine",
        "region": "Piemonte",
        "wine_zone": "Roero",
        "vineyard_locality": "Castagnito",
    }
    created = client.post("/wines", json=payload)
    assert created.status_code == 201, created.text
    result = created.json()
    assert result["wine_zone"] == "Roero" and result["vineyard_locality"] == "Castagnito"
    assert result["vineyard_latitude"] is None and result["vineyard_longitude"] is None
    changed = client.patch(f"/wines/{result['id']}", json={"wine_zone": "Langhe"})
    assert changed.status_code == 200, changed.text
    assert changed.json()["vineyard_locality"] == "Castagnito"
    assert client.patch(f"/wines/{foreign.id}", json={"wine_zone": "Langhe"}).status_code == 404
    assert client.patch(f"/wines/{result['id']}", json={"wine_zone": None}).status_code == 422
    assert (
        client.patch(f"/wines/{result['id']}", json={"vineyard_locality": "x" * 241}).status_code
        == 422
    )
    from app.api.routes.imports import legacy_wine_data

    restored = legacy_wine_data(result, context)
    assert restored["wine_zone"] == "Roero" and restored["vineyard_locality"] == "Castagnito"
