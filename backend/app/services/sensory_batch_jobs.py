"""Short start/status requests; commit each wine and progress atomically."""

from datetime import UTC, datetime, timedelta
from uuid import UUID

from fastapi import BackgroundTasks, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import CurrentContext
from app.core.config import settings
from app.db.session import SessionLocal as SessionLocal
from app.models import Household, SensoryBatchRun, SharedWineIdentity, Wine
from app.schemas.taste_profile import BatchEnrichmentRequest, SensoryBatchRunResponse
from app.services.shared_wine_data import resolve_shared_identity
from app.services.taste_profiles import sensory_profile_for_wine


def expire_interrupted(run: SensoryBatchRun) -> None:
    if run.status in {"queued", "running"} and run.updated_at.replace(tzinfo=UTC) < (
        datetime.now(UTC) - timedelta(minutes=15)
    ):
        run.status, run.issue = "failed", "interrupted"


def scoped_run(db: Session, context: CurrentContext, run_id: UUID) -> SensoryBatchRun:
    run = db.scalar(
        select(SensoryBatchRun).where(
            SensoryBatchRun.id == run_id,
            SensoryBatchRun.household_id == context.household.id,
            SensoryBatchRun.user_id == context.user.id,
        )
    )
    if run is None:
        raise HTTPException(404, "Sensory batch not found")
    expire_interrupted(run)
    db.commit()
    return run


def start_batch(
    db: Session,
    context: CurrentContext,
    payload: BatchEnrichmentRequest,
    background_tasks: BackgroundTasks,
) -> SensoryBatchRunResponse:
    from app.api.routes.taste_profiles import _batch_candidates

    db.scalar(select(Household).where(Household.id == context.household.id).with_for_update())
    active = db.scalars(
        select(SensoryBatchRun).where(
            SensoryBatchRun.household_id == context.household.id,
            SensoryBatchRun.status.in_(["queued", "running"]),
        )
    ).all()
    for run in active:
        expire_interrupted(run)
        if run.status in {"queued", "running"}:
            if run.user_id == context.user.id and run.scope == payload.scope:
                db.commit()
                return SensoryBatchRunResponse.model_validate(run)
            raise HTTPException(409, "Another sensory batch is already running")
    targets: list[dict] = []
    seen: set[UUID] = set()
    limit = min(payload.limit, settings.wine_sensory_ai_batch_max)
    for wine in _batch_candidates(db, context, payload.scope):
        identity = resolve_shared_identity(db, wine, create=True)
        if identity is None or identity.id in seen:
            continue
        seen.add(identity.id)
        profile = sensory_profile_for_wine(db, wine)
        if profile and (profile.validated or profile.generation_status == "available"):
            continue
        targets.append(
            {"identity_id": str(identity.id), "wine_id": str(wine.id) if wine.id else None}
        )
        if len(targets) >= limit:
            break
    run = SensoryBatchRun(
        household_id=context.household.id,
        user_id=context.user.id,
        scope=payload.scope,
        allow_ai=payload.allow_ai,
        targets=targets,
        total=len(targets),
        status="queued" if targets else "completed",
    )
    db.add(run)
    db.commit()
    if targets:
        background_tasks.add_task(run_batch, run.id, context.household.id, context.session.id)
    return SensoryBatchRunResponse.model_validate(run)


def run_batch(run_id: UUID, household_id: UUID, session_id: UUID) -> None:
    from app.api.routes.taste_profiles import _generate_with_sensory_metadata, _identity_metadata
    from app.services.sensory_agent import worker_context

    with SessionLocal() as db:
        query = select(SensoryBatchRun).where(
            SensoryBatchRun.id == run_id,
            SensoryBatchRun.household_id == household_id,
        )
        run = db.scalar(query.with_for_update())
        if run is None or run.status != "queued":
            return
        run.status = "running"
        db.commit()
        while True:
            run = db.scalar(query.execution_options(populate_existing=True))
            if run is None or run.status != "running":
                return
            if run.processed >= run.total:
                run.status = "completed"
                db.commit()
                return
            target = run.targets[run.processed]
            try:
                context = worker_context(db, household_id, run.user_id, session_id)
                # Serialize changes to this global identity, including across households.
                identity = db.scalar(
                    select(SharedWineIdentity)
                    .where(SharedWineIdentity.id == UUID(target["identity_id"]))
                    .with_for_update()
                )
                wine = (
                    db.scalar(
                        select(Wine).where(
                            Wine.id == UUID(target["wine_id"]),
                            Wine.household_id == household_id,
                            Wine.shared_identity_id == UUID(target["identity_id"]),
                        )
                    )
                    if target["wine_id"]
                    else None
                )
                skipped = identity is None or (target["wine_id"] and wine is None)
                generated = None
                if not skipped and identity is not None:
                    wine = wine if wine is not None else _identity_metadata(identity)
                    existing = sensory_profile_for_wine(db, wine)
                    skipped = bool(
                        existing
                        and (existing.validated or existing.generation_status == "available")
                    )
                    if not skipped:
                        generated = _generate_with_sensory_metadata(
                            db,
                            wine,
                            allow_ai=run.allow_ai,
                            modified_by_user_id=context.user.id,
                        )
                # Status can expire while a provider call is running. Never publish a late result.
                run = db.scalar(query.execution_options(populate_existing=True).with_for_update())
                if run is None or run.status != "running":
                    db.rollback()
                    return
                run.processed += 1
                run.skipped += bool(skipped)
                if generated and generated.generation_status == "available":
                    run.resolved += 1
                    run.ai_generated += generated.source == "ai"
                db.commit()
            except Exception as exc:
                db.rollback()
                run = db.scalar(query.execution_options(populate_existing=True).with_for_update())
                if run is None or run.status != "running":
                    return
                if isinstance(exc, PermissionError) or (
                    isinstance(exc, HTTPException) and exc.status_code in {401, 403}
                ):
                    run.status, run.issue = "failed", "session_expired"
                else:
                    # No provider exception, prompt or wine data is returned or logged.
                    run.processed += 1
                    run.failed += 1
                db.commit()
