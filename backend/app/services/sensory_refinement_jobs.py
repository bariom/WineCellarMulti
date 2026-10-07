"""Persistent single-wine proposals with short HTTP start/status requests."""

from datetime import UTC, datetime, timedelta
from uuid import UUID

from fastapi import HTTPException
from sqlalchemy import select

from app.core.config import settings
from app.db.session import SessionLocal as SessionLocal
from app.models import Household, SensoryRefinementRun, Wine
from app.schemas.sensory_refinement_run import SensoryRefinementRunResponse


def expire_interrupted(run):
    if run.status in {"queued", "running"} and run.updated_at.replace(tzinfo=UTC) < datetime.now(
        UTC
    ) - timedelta(minutes=15):
        run.status, run.issue = "failed", "interrupted"


def scoped_run(db, context, run_id):
    run = db.scalar(
        select(SensoryRefinementRun)
        .where(
            SensoryRefinementRun.id == run_id,
            SensoryRefinementRun.household_id == context.household.id,
            SensoryRefinementRun.user_id == context.user.id,
        )
        .with_for_update()
    )
    if run is None:
        raise HTTPException(404, "Sensory refinement not found")
    expire_interrupted(run)
    db.commit()
    return run


def run_response(db, context, run):
    wine = db.scalar(
        select(Wine).where(Wine.id == run.wine_id, Wine.household_id == context.household.id)
    )
    if wine is None:
        raise HTTPException(404, "Wine not found in the active cellar")
    return SensoryRefinementRunResponse(
        id=run.id,
        identity_id=run.identity_id,
        status=run.status,
        issue=run.issue,
        proposal=run.proposal or None,
        created_at=run.created_at,
        name=wine.name,
        producer=wine.producer,
        vintage=wine.vintage,
    )


def start_refinement(db, context, identity_id, background_tasks):
    if not settings.wine_sensory_ai_enabled:
        raise HTTPException(503, "Sensory profile AI generation is disabled")
    wine = db.scalar(
        select(Wine)
        .where(
            Wine.shared_identity_id == identity_id,
            Wine.household_id == context.household.id,
        )
        .order_by(Wine.created_at.desc())
    )
    if wine is None:
        raise HTTPException(404, "Wine not found in the active cellar")
    if not wine.vintage.strip():
        raise HTTPException(422, "A vintage is required for advanced research")
    db.scalar(select(Household).where(Household.id == context.household.id).with_for_update())
    active = db.scalars(
        select(SensoryRefinementRun).where(
            SensoryRefinementRun.household_id == context.household.id,
            SensoryRefinementRun.user_id == context.user.id,
            SensoryRefinementRun.status.in_(["queued", "running"]),
        )
    ).all()
    for run in active:
        expire_interrupted(run)
        if run.status in {"queued", "running"}:
            if run.identity_id == identity_id:
                db.commit()
                return run_response(db, context, run)
            raise HTTPException(409, "Another sensory refinement is already running")
    run = SensoryRefinementRun(
        household_id=context.household.id,
        user_id=context.user.id,
        wine_id=wine.id,
        identity_id=identity_id,
    )
    db.add(run)
    db.commit()
    background_tasks.add_task(run_refinement, run.id, context.household.id, context.session.id)
    return run_response(db, context, run)


def run_refinement(run_id: UUID, household_id: UUID, session_id: UUID):
    from app.api.routes.taste_profiles import refine_sensory_profile
    from app.services.sensory_agent import worker_context

    with SessionLocal() as db:
        query = select(SensoryRefinementRun).where(
            SensoryRefinementRun.id == run_id,
            SensoryRefinementRun.household_id == household_id,
        )
        run = db.scalar(query.with_for_update())
        if run is None or run.status != "queued":
            return
        run.status = "running"
        db.commit()
        try:
            context = worker_context(db, household_id, run.user_id, session_id)
            wine = db.scalar(
                select(Wine).where(
                    Wine.id == run.wine_id,
                    Wine.household_id == household_id,
                    Wine.shared_identity_id == run.identity_id,
                )
            )
            if wine is None:
                raise HTTPException(409, "Wine changed before research")
            proposal = refine_sensory_profile(run.identity_id, db, context)
            run = db.scalar(query.execution_options(populate_existing=True).with_for_update())
            if run is not None and run.status == "running":
                run.proposal = proposal.model_dump(mode="json")
                run.status = "completed"
                db.commit()
        except Exception as exc:
            db.rollback()
            run = db.scalar(query.execution_options(populate_existing=True).with_for_update())
            if run is not None and run.status == "running":
                # Do not expose provider exceptions, credentials or raw response text.
                issue = "research_failed"
                if isinstance(exc, PermissionError):
                    issue = "session_expired"
                elif isinstance(exc, HTTPException):
                    issue = {
                        422: "no_usable_evidence",
                        409: "profile_changed",
                        503: "ai_unavailable",
                        402: "insufficient_credits",
                    }.get(exc.status_code, issue)
                run.status, run.issue = "failed", issue
                db.commit()
