from types import SimpleNamespace
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, select
from sqlalchemy.orm import Session
from sqlalchemy.pool import StaticPool

from app.api.deps import get_current_context
from app.db.base import Base
from app.db.session import get_db
from app.main import app
from app.models import SharedWineFact, SharedWineIdentity, WineSensoryProfile
from app.schemas.sensory_agent import CompletedDimension
from app.services.sensory_references import import_references, preview_references
from app.services.sensory_review_workflow import apply_review, proposal, undo_review


@pytest.fixture
def db():
    engine = create_engine(
        "sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool
    )
    Base.metadata.create_all(engine)
    with Session(engine) as session:
        yield session
    engine.dispose()


def setup_profile(db, dossier_id="bibi-graetz-testamatta-2018", acidity=0.6936):
    preview = preview_references(db)
    import_references(db, preview.revision, [dossier_id], "editor")
    identity = db.scalars(select(SharedWineIdentity)).all()[-1]
    profile = WineSensoryProfile(
        identity_id=identity.id,
        dimensions={
            "body": 0.644,
            "acidity": acidity,
            "tannin": 0.644,
            "sweetness": 0.08,
            "aromatic_intensity": 0.62,
            "fruit": 0.672,
            "wood": 0.3792,
            "spice": 0.456,
            "minerality": 0.3816,
        },
        validated=True,
        confidence=0.72,
        source="hybrid",
    )
    db.add(profile)
    db.flush()
    return profile


def test_testamatta_preserves_compatible_numbers_and_records_evidence(db):
    profile = setup_profile(db)
    before = dict(profile.dimensions)
    result = proposal(db, profile.identity_id)
    choices = {c.trait.dimension: c for c in result.choices}
    assert choices["acidity"].action == "retain"
    assert choices["acidity"].proposed_value == 0.6936
    assert choices["body"].action == "blocked"
    assert choices["wood"].action == "blocked"
    actor = uuid4()
    history = apply_review(db, profile.identity_id, result.revision, ["acidity", "fruit"], actor)
    assert profile.dimensions == before
    assert not profile.validated
    assert profile.provenance["acidity"]["reviewed_trait"]["evidence"]
    for proof in profile.provenance.values():
        CompletedDimension.model_validate(proof)
    assert profile.provenance["body"]["confidence"] == 0.72
    next_result = proposal(db, profile.identity_id)
    assert next_result.undo_history_id == history
    assert (
        next(c for c in next_result.choices if c.trait.dimension == "acidity").action == "recorded"
    )
    undo_review(db, profile.identity_id, history, next_result.revision, actor)
    assert profile.dimensions == before and profile.validated
    assert profile.confidence == 0.72 and profile.provenance == {}


def test_selective_adjustment_stale_rejection_and_undo_protection(db):
    profile = setup_profile(db, acidity=0.2)
    original = proposal(db, profile.identity_id)
    assert original.choices[1].proposed_value == 0.55
    assert original.choices[1].action == "adjust"
    actor = uuid4()
    with pytest.raises(ValueError):
        apply_review(db, profile.identity_id, original.revision, ["body", "acidity"], actor)
    assert profile.dimensions["acidity"] == 0.2
    history = apply_review(db, profile.identity_id, original.revision, ["acidity"], actor)
    assert profile.dimensions["acidity"] == 0.55
    assert profile.dimensions["body"] == 0.644
    with pytest.raises(ValueError):
        apply_review(db, profile.identity_id, original.revision, ["fruit"], actor)
    applied = proposal(db, profile.identity_id)
    profile.dimensions = {**profile.dimensions, "fruit": 0.7}
    db.flush()
    with pytest.raises(ValueError):
        undo_review(db, profile.identity_id, history, applied.revision, actor)
    assert profile.dimensions["fruit"] == 0.7


@pytest.mark.parametrize(
    "dossier_id",
    [
        "ridge-monte-bello-2022",
        "zind-roche-calcaire-2022",
        "esporao-reserva-red-2022",
        "cloudy-bay-sauvignon-2024",
        "klein-vin-de-constance-2020",
        "bibi-graetz-testamatta-2018",
        "loimer-gruner-veltliner-2024",
    ],
)
def test_reference_group_policy_consistency_not_accuracy(db, dossier_id):
    profile = setup_profile(db, dossier_id, acidity=0.2)
    result = proposal(db, profile.identity_id)
    for choice in result.choices:
        if choice.action == "adjust":
            assert choice.lower <= choice.proposed_value <= choice.upper
            assert choice.proposed_value in (choice.lower, choice.upper)
        else:
            assert choice.proposed_value == choice.trait.current_value
    assert len(result.choices) == 9


def test_no_dossier_no_profile_and_api_authorization(db):
    profile = setup_profile(db)
    identity = db.get(SharedWineIdentity, profile.identity_id)
    identity.identity_key = "x" * 64
    db.commit()
    assert all(c.action == "blocked" for c in proposal(db, identity.id).choices)
    context = SimpleNamespace(user=SimpleNamespace(id=uuid4(), is_app_admin=False))
    app.dependency_overrides[get_current_context] = lambda: context
    app.dependency_overrides[get_db] = lambda: db
    try:
        with TestClient(app) as client:
            path = f"/api/v1/taste-profile/admin/references/profiles/{identity.id}"
            assert client.get(path + "/proposal").status_code == 403
            request = {"revision": "a" * 64, "dimensions": ["fruit"], "acknowledged": True}
            assert client.post(path + "/apply", json=request).status_code == 403
            assert (
                client.post(path + f"/undo/{uuid4()}", json={"revision": "a" * 64}).status_code
                == 403
            )
            context.user.is_app_admin = True
            assert client.get(path + "/proposal").status_code == 200
            assert client.post(path + "/apply", json=request).status_code == 409
            request["acknowledged"] = False
            assert client.post(path + "/apply", json=request).status_code == 422
    finally:
        app.dependency_overrides.clear()
    db.delete(profile)
    db.flush()
    assert all(c.action == "blocked" for c in proposal(db, identity.id).choices)
    assert not db.scalars(
        select(SharedWineFact).where(SharedWineFact.feature == "sensory_review_history")
    ).all()


def test_http_apply_undo_and_public_provenance(db):
    profile = setup_profile(db, acidity=0.2)
    db.commit()
    context = SimpleNamespace(user=SimpleNamespace(id=uuid4(), is_app_admin=True))
    app.dependency_overrides[get_current_context] = lambda: context
    app.dependency_overrides[get_db] = lambda: db
    try:
        with TestClient(app) as client:
            path = f"/api/v1/taste-profile/admin/references/profiles/{profile.identity_id}"
            before = client.get(path + "/proposal").json()
            result = client.post(
                path + "/apply",
                json={
                    "revision": before["revision"],
                    "dimensions": ["acidity"],
                    "acknowledged": True,
                },
            )
            assert result.status_code == 200
            applied = result.json()
            assert applied["proposal"]["undo_history_id"] == applied["history_id"]
            from app.api.routes.taste_profiles import sensory_response

            assert sensory_response(profile).provenance["acidity"].documentary_evidence
            restored = client.post(
                path + "/undo/" + applied["history_id"],
                json={"revision": applied["proposal"]["revision"]},
            )
            assert restored.status_code == 200
            assert restored.json()["choices"][1]["trait"]["current_value"] == 0.2
            assert (
                client.post(
                    path + "/undo/" + applied["history_id"],
                    json={"revision": applied["proposal"]["revision"]},
                ).status_code
                == 409
            )
    finally:
        app.dependency_overrides.clear()
