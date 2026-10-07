from datetime import UTC, datetime, timedelta
from uuid import uuid4

import pytest
from fastapi import BackgroundTasks, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import sessionmaker
from test_sensory_agent import setup as setup  # noqa: F401
from test_sensory_refinement import payload, response, source_reader

from app.api.routes import ai, taste_profiles
from app.core.config import settings
from app.models import SensoryRefinementRun, WineSensoryProfile
from app.services import sensory_refinement_jobs as jobs


@pytest.fixture
def job_setup(request, monkeypatch):
    db, context, wine = request.getfixturevalue("setup")
    context.user.is_approved = True
    db.commit()
    monkeypatch.setattr(settings, "wine_sensory_ai_enabled", True)
    monkeypatch.setattr(jobs, "SessionLocal", sessionmaker(bind=db.get_bind()))
    return db, context, wine


def test_start_is_fast_deduplicated_and_worker_preserves_validated_profile(job_setup, monkeypatch):
    db, context, wine = job_setup
    db.add(
        WineSensoryProfile(
            identity_id=wine.shared_identity_id,
            dimensions={"body": 0.5},
            source="manual",
            validated=True,
        )
    )
    db.commit()
    calls = []
    source_reader(monkeypatch)
    monkeypatch.setattr(
        ai,
        "create_ai_response",
        lambda *args, **kwargs: (calls.append(1) or response(payload()), "credits"),
    )
    monkeypatch.setattr(ai, "get_or_create_user_ai_settings", lambda *args: object())
    monkeypatch.setattr(ai, "record_ai_audit", lambda *args, **kwargs: None)
    tasks = BackgroundTasks()
    started = taste_profiles.start_sensory_refinement(wine.shared_identity_id, tasks, db, context)
    duplicate = taste_profiles.start_sensory_refinement(wine.shared_identity_id, tasks, db, context)
    assert started.status == "queued" and duplicate.id == started.id
    assert not calls and len(tasks.tasks) == 1
    jobs.run_refinement(started.id, context.household.id, context.session.id)
    jobs.run_refinement(started.id, context.household.id, context.session.id)
    db.expire_all()
    result = taste_profiles.sensory_refinement_status(started.id, db, context)
    assert result.status == "completed" and result.proposal.is_proposal
    assert result.proposal.dimensions["body"] == 0.68 and len(calls) == 1
    profile = db.scalar(select(WineSensoryProfile))
    assert profile.validated and profile.source == "manual" and profile.dimensions == {"body": 0.5}


@pytest.mark.parametrize("case", ["malformed", "provider_error", "expired_session"])
def test_failed_worker_is_terminal_and_does_not_expose_provider_details(
    job_setup, monkeypatch, case
):
    db, context, wine = job_setup
    started = taste_profiles.start_sensory_refinement(
        wine.shared_identity_id, BackgroundTasks(), db, context
    )
    source_reader(monkeypatch)
    monkeypatch.setattr(ai, "get_or_create_user_ai_settings", lambda *args: object())
    monkeypatch.setattr(ai, "record_ai_audit", lambda *args, **kwargs: None)
    if case == "expired_session":
        context.session.expires_at = datetime.now(UTC) - timedelta(days=1)
        db.commit()

    def generate(*args, **kwargs):
        if case == "provider_error":
            raise RuntimeError("sensitive provider details must stay private")
        return response([]), "credits"

    monkeypatch.setattr(ai, "create_ai_response", generate)
    jobs.run_refinement(started.id, context.household.id, context.session.id)
    db.expire_all()
    result = taste_profiles.sensory_refinement_status(started.id, db, context)
    assert result.status == "failed" and result.proposal is None
    assert (
        result.issue
        == {
            "malformed": "no_usable_evidence",
            "provider_error": "research_failed",
            "expired_session": "session_expired",
        }[case]
    )
    assert "sensitive" not in result.model_dump_json()


def test_status_is_scoped_to_user_and_household_and_expires_stale_jobs(job_setup):
    db, context, wine = job_setup
    started = taste_profiles.start_sensory_refinement(
        wine.shared_identity_id, BackgroundTasks(), db, context
    )
    run = db.scalar(select(SensoryRefinementRun))
    run.updated_at = datetime.now(UTC) - timedelta(minutes=16)
    db.commit()
    assert taste_profiles.sensory_refinement_status(started.id, db, context).issue == "interrupted"
    from types import SimpleNamespace

    for foreign in [
        SimpleNamespace(user=SimpleNamespace(id=uuid4()), household=context.household),
        SimpleNamespace(user=context.user, household=SimpleNamespace(id=uuid4())),
    ]:
        with pytest.raises(HTTPException) as exc:
            taste_profiles.sensory_refinement_status(started.id, db, foreign)
        assert exc.value.status_code == 404


@pytest.mark.parametrize("case", ["disabled", "missing_vintage", "foreign"])
def test_start_rejects_invalid_requests_before_scheduling_work(job_setup, monkeypatch, case):
    db, context, wine = job_setup
    tasks = BackgroundTasks()
    identity_id = wine.shared_identity_id
    if case == "disabled":
        monkeypatch.setattr(settings, "wine_sensory_ai_enabled", False)
    elif case == "missing_vintage":
        wine.vintage = ""
        db.commit()
    else:
        identity_id = uuid4()
    with pytest.raises(HTTPException) as exc:
        taste_profiles.start_sensory_refinement(identity_id, tasks, db, context)
    assert exc.value.status_code == {"disabled": 503, "missing_vintage": 422, "foreign": 404}[case]
    assert not tasks.tasks and db.scalar(select(SensoryRefinementRun)) is None
