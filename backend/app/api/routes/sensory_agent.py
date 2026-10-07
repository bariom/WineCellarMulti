from datetime import UTC, datetime, timedelta
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, BackgroundTasks, Body, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import CurrentContext, require_app_admin_context
from app.core.config import settings
from app.db.session import get_db
from app.models import Household, SensoryAgentRun, SharedWineIdentity, Wine, WineSensoryProfile
from app.schemas.sensory_agent import (
    SensoryApplyRequest,
    SensoryProfileSnapshot,
    SensoryResearchCandidate,
    SensoryResearchRequest,
    SensoryResearchResult,
    SensoryResearchRunResponse,
)
from app.services.sensory_agent import candidate_wines, run_sensory_research
from app.services.shared_wine_data import normalize_identity_part, resolve_shared_identity

router = APIRouter(prefix="/taste-profile/admin/research-runs")


def scoped_run(
    db: Session, context: CurrentContext, run_id: UUID, *, lock: bool = False
) -> SensoryAgentRun:
    query = select(SensoryAgentRun).where(
        SensoryAgentRun.id == run_id,
        SensoryAgentRun.household_id == context.household.id,
    )
    run = db.scalar(query.with_for_update() if lock else query)
    if run is None:
        raise HTTPException(404, "Research run not found")
    return run


def expire_interrupted(run: SensoryAgentRun) -> None:
    if run.status in {"queued", "running"} and run.updated_at.replace(tzinfo=UTC) < datetime.now(
        UTC
    ) - timedelta(hours=1):
        run.status, run.issue = "failed", "interrupted"


@router.post("", response_model=SensoryResearchRunResponse, status_code=202)
def start_research(
    payload: SensoryResearchRequest,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    context: CurrentContext = Depends(require_app_admin_context),
) -> SensoryResearchRunResponse:
    if not settings.wine_sensory_ai_enabled:
        raise HTTPException(503, "Sensory profile AI generation is disabled")
    # Serialize submissions for this household, including across API processes.
    db.scalar(select(Household).where(Household.id == context.household.id).with_for_update())
    active_runs = db.scalars(
        select(SensoryAgentRun).where(
            SensoryAgentRun.household_id == context.household.id,
            SensoryAgentRun.status.in_(["queued", "running"]),
        )
    ).all()
    for active in active_runs:
        expire_interrupted(active)
        if active.status in {"queued", "running"}:
            raise HTTPException(409, "Research is already running for this cellar")
    if payload.wine_ids is not None:
        requested = list(dict.fromkeys(payload.wine_ids))
        if len(requested) > payload.max_wines:
            raise HTTPException(422, "Selected wines exceed the maximum number")
        candidates = candidate_wines(db, context, None, wine_ids=requested)
        if {wine.id for wine in candidates} != set(requested):
            raise HTTPException(422, "Selected wines are unavailable or duplicated")
    else:
        candidates = candidate_wines(db, context, payload.max_wines)
    if not candidates:
        raise HTTPException(422, "No wines available for research in this cellar")
    run = SensoryAgentRun(
        household_id=context.household.id,
        user_id=context.user.id,
        max_wines=payload.max_wines,
        budget_usd=payload.budget_usd,
        wine_ids=[str(wine.id) for wine in candidates],
    )
    db.add(run)
    db.commit()
    db.refresh(run)
    background_tasks.add_task(
        run_sensory_research, run.id, context.household.id, context.session.id
    )
    return SensoryResearchRunResponse.model_validate(run)


@router.get("", response_model=list[SensoryResearchRunResponse])
def list_research(
    db: Session = Depends(get_db), context: CurrentContext = Depends(require_app_admin_context)
) -> list[SensoryResearchRunResponse]:
    runs = db.scalars(
        select(SensoryAgentRun)
        .where(SensoryAgentRun.household_id == context.household.id)
        .order_by(SensoryAgentRun.created_at.desc())
        .limit(5)
    ).all()
    for run in runs:
        expire_interrupted(run)
    db.commit()
    return [SensoryResearchRunResponse.model_validate(run) for run in runs]


@router.get("/candidates", response_model=list[SensoryResearchCandidate])
def list_candidates(
    db: Session = Depends(get_db), context: CurrentContext = Depends(require_app_admin_context)
) -> list[SensoryResearchCandidate]:
    return [
        SensoryResearchCandidate.model_validate(wine) for wine in candidate_wines(db, context, None)
    ]


@router.get("/{run_id}", response_model=SensoryResearchRunResponse)
def get_research(
    run_id: UUID,
    db: Session = Depends(get_db),
    context: CurrentContext = Depends(require_app_admin_context),
) -> SensoryResearchRunResponse:
    run = scoped_run(db, context, run_id)
    expire_interrupted(run)
    db.commit()
    return SensoryResearchRunResponse.model_validate(run)


@router.post("/{run_id}/wines/{wine_id}/apply", response_model=SensoryResearchRunResponse)
def apply_research(
    run_id: UUID,
    wine_id: UUID,
    db: Session = Depends(get_db),
    context: CurrentContext = Depends(require_app_admin_context),
    payload: Annotated[SensoryApplyRequest | None, Body()] = None,
) -> SensoryResearchRunResponse:
    run = scoped_run(db, context, run_id, lock=True)
    if run.status not in {"completed", "failed"}:
        raise HTTPException(409, "Wait for research to finish")
    result = next(
        (
            SensoryResearchResult.model_validate(item)
            for item in run.results
            if item["wine_id"] == str(wine_id)
        ),
        None,
    )
    if result is None or (
        result.status != "ready"
        and not (result.prompt_version == "12" and result.status == "incomplete")
    ):
        raise HTTPException(422, "No complete proposal for this wine")
    if result.prompt_version not in {"11", "12"}:
        raise HTTPException(422, "Research again to use the assisted application policy")
    wine = db.scalar(
        select(Wine)
        .where(Wine.id == wine_id, Wine.household_id == context.household.id)
        .with_for_update()
    )
    if wine is None:
        raise HTTPException(404, "Wine not found")
    if (
        any(
            normalize_identity_part(getattr(wine, key))
            != normalize_identity_part(getattr(result, key))
            for key in ("name", "producer", "vintage")
        )
        or wine.shared_identity_id != result.identity_id
    ):
        raise HTTPException(409, "Wine identity has changed; research again")
    identity = resolve_shared_identity(db, wine, create=True)
    if identity is None:
        raise HTTPException(422, "Wine identity is incomplete")
    db.scalar(
        select(SharedWineIdentity).where(SharedWineIdentity.id == identity.id).with_for_update()
    )
    profile = db.scalar(
        select(WineSensoryProfile).where(WineSensoryProfile.identity_id == identity.id)
    )
    explicit_revision = bool(payload and payload.confirm_protected and payload.dimensions)
    if profile and (
        profile.dimensions != result.baseline
        or profile.validated != result.baseline_validated
        or profile.source != result.baseline_source
        or ((profile.validated or profile.source == "manual") and not explicit_revision)
    ):
        raise HTTPException(409, "Profile was validated or modified; proposal cannot overwrite it")
    from app.services.sensory_application import application_preview
    from app.services.taste_profiles import infer_sensory_profile

    fallback, _, fallback_confidence = infer_sensory_profile(db, wine)
    if profile:
        fallback, fallback_confidence = profile.dimensions, profile.confidence
    preview = application_preview(
        result,
        fallback,
        fallback_confidence,
        baseline_provenance=profile.provenance if profile else None,
    )
    if result.application is None or preview != result.application:
        raise HTTPException(409, "Application preview has changed; research again")
    if payload:
        if any(key not in preview.candidates for key in payload.dimensions):
            raise HTTPException(422, "Selection contains unsupported or conflicting traits")
        preview = application_preview(
            result,
            fallback,
            fallback_confidence,
            baseline_provenance=profile.provenance if profile else None,
            selected_dimensions=payload.dimensions,
            confirm_protected=payload.confirm_protected,
        )
    if not preview.eligible:
        raise HTTPException(422, "No attributable supported intensity updates")
    previous_provenance = dict(profile.provenance or {}) if profile else {}
    if profile:
        result.previous_profile = SensoryProfileSnapshot(
            dimensions=dict(profile.dimensions),
            provenance=previous_provenance,
            source=profile.source,
            validated=profile.validated,
            confidence=profile.confidence,
            model=profile.model,
            generated_at=profile.generated_at,
            replaced_at=datetime.now(UTC),
            replaced_by=context.user.id,
        )
    if profile is None:
        profile = WineSensoryProfile(identity_id=identity.id)
        db.add(profile)
    profile.dimensions = {key: item.value for key, item in preview.dimensions.items()}
    profile.provenance = {
        key: (
            result.complete_profile[key].model_dump(mode="json")
            if item.origin == "agent"
            else previous_provenance.get(key)
            or {
                "origin": "baseline",
                "confidence": item.confidence,
                "calculation_method": "baseline_fallback_v1",
            }
        )
        for key, item in preview.dimensions.items()
    }
    profile.source = "hybrid" if preview.retained else "ai"
    profile.confidence = round(sum(i.confidence for i in preview.dimensions.values()) / 9, 4)
    profile.validated, profile.generation_status = False, "available"
    profile.model, profile.last_modified_by_user_id = result.model[:120], context.user.id
    profile.generated_at = datetime.now(UTC)
    result.status = "applied"
    result.application = preview
    run.results = [
        result.model_dump(mode="json") if item["wine_id"] == str(wine_id) else item
        for item in run.results
    ]
    db.commit()
    db.refresh(run)
    return SensoryResearchRunResponse.model_validate(run)
