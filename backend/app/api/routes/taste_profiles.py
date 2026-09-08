from __future__ import annotations

import json
from datetime import UTC, datetime
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import String, func, select
from sqlalchemy.orm import Session

from app.api.deps import (
    CurrentContext,
    get_current_context,
    require_app_admin_context,
    require_write_context,
)
from app.api.routes.wines import get_household_wine
from app.core.config import settings
from app.db.session import get_db
from app.models import (
    SensoryProfileBaseline,
    SharedWineIdentity,
    UserTasteProfile,
    Wine,
    WineSensoryProfile,
)
from app.prompts.library import wine_sensory_profile_prompt
from app.schemas.taste_profile import (
    BatchEnrichmentPreview,
    BatchEnrichmentRequest,
    LegacyTastingClaimResponse,
    LegacyTastingClaimStatus,
    SensoryBaselineInput,
    SensoryBaselineResponse,
    SensoryProfileResponse,
    SensoryProfileUpdate,
    TasteMatchResponse,
    TasteProfileCollectionResponse,
    TasteProfileResponse,
)
from app.services.openai_client import create_response
from app.services.shared_wine_data import (
    identity_parts,
    normalize_identity_part,
    resolve_shared_identity,
)
from app.services.taste_profiles import (
    calculate_taste_match,
    claim_unassigned_tastings,
    confidence_level,
    generate_wine_sensory_profile,
    infer_sensory_profile,
    rebuild_user_taste_profile,
    sensory_profile_for_wine,
    unassigned_tasting_count,
    validated_dimensions,
)

router = APIRouter(prefix="/taste-profile")


def profile_response(profile: UserTasteProfile) -> TasteProfileResponse:
    return TasteProfileResponse(
        category=profile.category,
        dimensions=profile.dimensions or {},
        attributes=profile.attributes or {},
        confidence=profile.confidence,
        sample_count=profile.sample_count,
        confidence_level=confidence_level(profile.confidence),
        rebuilt_at=profile.rebuilt_at,
    )


def sensory_response(profile: WineSensoryProfile) -> SensoryProfileResponse:
    return SensoryProfileResponse(
        identity_id=profile.identity_id,
        dimensions=profile.dimensions or {},
        source=profile.source,
        confidence=profile.confidence,
        validated=profile.validated,
        generation_status=profile.generation_status,
        generated_at=profile.generated_at,
    )


def baseline_response(baseline: SensoryProfileBaseline) -> SensoryBaselineResponse:
    return SensoryBaselineResponse(
        id=baseline.id,
        entity_type=baseline.entity_type,
        entity_key=baseline.entity_key,
        dimensions=baseline.dimensions or {},
        confidence=baseline.confidence,
        is_active=baseline.is_active,
    )


@router.get("/me", response_model=TasteProfileCollectionResponse)
def get_my_taste_profile(
    db: Session = Depends(get_db), context: CurrentContext = Depends(get_current_context)
) -> TasteProfileCollectionResponse:
    profiles = list(
        db.scalars(
            select(UserTasteProfile)
            .where(UserTasteProfile.user_id == context.user.id)
            .order_by(UserTasteProfile.category)
        )
    )
    if not profiles:
        profiles = rebuild_user_taste_profile(db, context.user.id)
        db.commit()
    return TasteProfileCollectionResponse(
        profiles=[profile_response(profile) for profile in profiles]
    )


@router.post("/me/rebuild", response_model=TasteProfileCollectionResponse)
def rebuild_my_taste_profile(
    db: Session = Depends(get_db), context: CurrentContext = Depends(require_write_context)
) -> TasteProfileCollectionResponse:
    profiles = rebuild_user_taste_profile(db, context.user.id)
    db.commit()
    return TasteProfileCollectionResponse(
        profiles=[profile_response(profile) for profile in profiles]
    )


@router.get("/me/legacy-tastings", response_model=LegacyTastingClaimStatus)
def legacy_tasting_status(
    db: Session = Depends(get_db), context: CurrentContext = Depends(require_write_context)
) -> LegacyTastingClaimStatus:
    return LegacyTastingClaimStatus(
        unassigned_count=unassigned_tasting_count(db, context.household.id)
    )


@router.post("/me/legacy-tastings/claim", response_model=LegacyTastingClaimResponse)
def claim_legacy_tastings(
    db: Session = Depends(get_db), context: CurrentContext = Depends(require_write_context)
) -> LegacyTastingClaimResponse:
    claimed_count, profiles = claim_unassigned_tastings(
        db, household_id=context.household.id, user_id=context.user.id
    )
    db.commit()
    return LegacyTastingClaimResponse(
        claimed_count=claimed_count,
        profiles=[profile_response(profile) for profile in profiles],
    )


@router.get("/wines/{wine_id}/match", response_model=TasteMatchResponse)
def wine_taste_match(
    wine_id: UUID,
    db: Session = Depends(get_db),
    context: CurrentContext = Depends(get_current_context),
) -> TasteMatchResponse:
    wine = get_household_wine(db, context, wine_id)
    return TasteMatchResponse(**calculate_taste_match(db, context.user.id, wine))


def _ai_sensory_profile(wine: Wine) -> tuple[dict[str, float], str]:
    if not settings.wine_sensory_ai_enabled:
        return {}, ""
    prompt = wine_sensory_profile_prompt(
        wine_context={
            "name": wine.name,
            "producer": wine.producer,
            "vintage": wine.vintage,
            "type": wine.type,
            "region": wine.region,
            "appellation": wine.appellation,
            "grapes": [item.get("name") for item in (wine.grapes or []) if isinstance(item, dict)],
            "description": wine.ai_notes[:500],
        }
    )
    schema = {
        "name": "wine_sensory_profile",
        "schema": {
            "type": "object",
            "additionalProperties": False,
            "properties": {
                key: {"type": ["number", "null"], "minimum": 0, "maximum": 1}
                for key in (
                    "body",
                    "acidity",
                    "tannin",
                    "sweetness",
                    "aromatic_intensity",
                    "fruit",
                    "wood",
                    "spice",
                    "minerality",
                )
            },
            "required": [
                "body",
                "acidity",
                "tannin",
                "sweetness",
                "aromatic_intensity",
                "fruit",
                "wood",
                "spice",
                "minerality",
            ],
        },
    }
    response = create_response(
        settings.openai_economy_model,
        prompt.system,
        prompt.user,
        json_schema=schema,
        task_type="sensory_profile",
        max_output_tokens=350,
        reasoning_effort="low",
    )
    try:
        result = json.loads(response.text)
    except json.JSONDecodeError:
        return {}, response.model
    return validated_dimensions(result), response.model


def _admin_profile(identity_id: UUID, db: Session) -> WineSensoryProfile:
    profile = db.scalar(
        select(WineSensoryProfile).where(WineSensoryProfile.identity_id == identity_id)
    )
    if profile is None:
        raise HTTPException(status_code=404, detail="Sensory profile not found")
    return profile


def _batch_candidates(db: Session) -> list[Wine]:
    """One representative per canonical identity, including pre-feature historical wines."""
    candidates: dict[tuple[str, ...], Wine] = {}
    for wine in db.scalars(select(Wine).order_by(Wine.created_at)):
        identity = resolve_shared_identity(db, wine, create=False)
        parts = identity_parts(wine)
        key = (str(identity.id),) if identity is not None else parts
        if key is not None:
            candidates.setdefault(key, wine)
    return list(candidates.values())


@router.get("/admin/summary")
def sensory_profile_summary(
    db: Session = Depends(get_db), context: CurrentContext = Depends(require_app_admin_context)
) -> dict:
    identities = db.scalar(select(func.count(SharedWineIdentity.id))) or 0
    profiles = list(db.scalars(select(WineSensoryProfile)))
    available = [profile for profile in profiles if profile.generation_status == "available"]
    return {
        "wines_with_profile": len(available),
        "wines_without_profile": max(0, identities - len(available)),
        "generated_by_ai": sum(profile.source == "ai" for profile in available),
        "inferred_from_metadata": sum(
            profile.source in {"metadata", "hybrid", "appellation", "grape"}
            for profile in available
        ),
        "manually_validated": sum(profile.validated for profile in available),
        "low_confidence": sum(profile.confidence < 0.4 for profile in available),
    }


@router.get("/admin/profiles")
def list_sensory_profiles(
    source: str | None = None,
    validated: bool | None = None,
    low_confidence: bool = False,
    missing: bool = False,
    wine_type: str | None = None,
    region: str | None = None,
    appellation: str | None = None,
    grape: str | None = None,
    producer: str | None = None,
    limit: int = Query(default=100, ge=1, le=500),
    db: Session = Depends(get_db),
    context: CurrentContext = Depends(require_app_admin_context),
) -> list[dict]:
    if missing:
        query = (
            select(SharedWineIdentity)
            .outerjoin(WineSensoryProfile, WineSensoryProfile.identity_id == SharedWineIdentity.id)
            .where(
                (WineSensoryProfile.id.is_(None))
                | (WineSensoryProfile.generation_status != "available")
            )
            .order_by(SharedWineIdentity.name)
            .limit(limit)
        )
        return [
            {
                "identity_id": str(identity.id),
                "name": identity.name,
                "producer": identity.producer,
                "vintage": identity.vintage,
                "dimensions": {},
                "source": "missing",
                "confidence": 0,
                "validated": False,
                "generation_status": "pending",
                "missing": True,
            }
            for identity in db.scalars(query)
        ]
    query = select(WineSensoryProfile, SharedWineIdentity).join(
        SharedWineIdentity, SharedWineIdentity.id == WineSensoryProfile.identity_id
    )
    if source:
        query = query.where(WineSensoryProfile.source == source)
    if validated is not None:
        query = query.where(WineSensoryProfile.validated == validated)
    if low_confidence:
        query = query.where(WineSensoryProfile.confidence < 0.4)
    if producer:
        query = query.where(func.lower(SharedWineIdentity.producer).like(f"%{producer.lower()}%"))
    wine_filters = []
    if wine_type:
        wine_filters.append(func.lower(Wine.type).like(f"%{wine_type.lower()}%"))
    if region:
        wine_filters.append(func.lower(Wine.region).like(f"%{region.lower()}%"))
    if appellation:
        wine_filters.append(func.lower(Wine.appellation).like(f"%{appellation.lower()}%"))
    if grape:
        wine_filters.append(func.lower(Wine.grapes.cast(String)).like(f"%{grape.lower()}%"))
    if wine_filters:
        query = query.where(
            WineSensoryProfile.identity_id.in_(select(Wine.shared_identity_id).where(*wine_filters))
        )
    return [
        {
            "name": identity.name,
            "producer": identity.producer,
            "vintage": identity.vintage,
            **sensory_response(profile).model_dump(mode="json"),
        }
        for profile, identity in db.execute(
            query.order_by(WineSensoryProfile.updated_at.desc()).limit(limit)
        )
    ]


@router.put("/admin/profiles/{identity_id}", response_model=SensoryProfileResponse)
def update_sensory_profile(
    identity_id: UUID,
    payload: SensoryProfileUpdate,
    db: Session = Depends(get_db),
    context: CurrentContext = Depends(require_app_admin_context),
) -> SensoryProfileResponse:
    profile = _admin_profile(identity_id, db)
    profile.dimensions = validated_dimensions(payload.dimensions)
    profile.source = "manual"
    profile.confidence = 1.0 if payload.validated else max(profile.confidence, 0.85)
    profile.validated = (
        bool(payload.validated) if payload.validated is not None else profile.validated
    )
    profile.generation_status = "available"
    profile.last_modified_by_user_id = context.user.id
    profile.generated_at = datetime.now(UTC)
    db.commit()
    db.refresh(profile)
    return sensory_response(profile)


@router.get("/admin/baselines", response_model=list[SensoryBaselineResponse])
def list_sensory_baselines(
    entity_type: str | None = None,
    db: Session = Depends(get_db),
    context: CurrentContext = Depends(require_app_admin_context),
) -> list[SensoryBaselineResponse]:
    query = select(SensoryProfileBaseline).order_by(
        SensoryProfileBaseline.entity_type, SensoryProfileBaseline.entity_key
    )
    if entity_type:
        query = query.where(SensoryProfileBaseline.entity_type == entity_type)
    return [baseline_response(item) for item in db.scalars(query)]


@router.post("/admin/baselines", response_model=SensoryBaselineResponse)
def create_sensory_baseline(
    payload: SensoryBaselineInput,
    db: Session = Depends(get_db),
    context: CurrentContext = Depends(require_app_admin_context),
) -> SensoryBaselineResponse:
    entity_type = normalize_identity_part(payload.entity_type)
    entity_key = normalize_identity_part(payload.entity_key)
    existing = db.scalar(
        select(SensoryProfileBaseline).where(
            SensoryProfileBaseline.entity_type == entity_type,
            SensoryProfileBaseline.entity_key == entity_key,
        )
    )
    if existing:
        raise HTTPException(status_code=409, detail="A baseline for this entity already exists")
    baseline = SensoryProfileBaseline(
        entity_type=entity_type,
        entity_key=entity_key,
        dimensions=validated_dimensions(payload.dimensions),
        confidence=payload.confidence,
        is_active=payload.is_active,
        last_modified_by_user_id=context.user.id,
    )
    db.add(baseline)
    db.commit()
    db.refresh(baseline)
    return baseline_response(baseline)


@router.put("/admin/baselines/{baseline_id}", response_model=SensoryBaselineResponse)
def update_sensory_baseline(
    baseline_id: UUID,
    payload: SensoryBaselineInput,
    db: Session = Depends(get_db),
    context: CurrentContext = Depends(require_app_admin_context),
) -> SensoryBaselineResponse:
    baseline = db.get(SensoryProfileBaseline, baseline_id)
    if baseline is None:
        raise HTTPException(status_code=404, detail="Sensory baseline not found")
    baseline.entity_type = normalize_identity_part(payload.entity_type)
    baseline.entity_key = normalize_identity_part(payload.entity_key)
    baseline.dimensions = validated_dimensions(payload.dimensions)
    baseline.confidence = payload.confidence
    baseline.is_active = payload.is_active
    baseline.last_modified_by_user_id = context.user.id
    db.commit()
    db.refresh(baseline)
    return baseline_response(baseline)


@router.delete("/admin/baselines/{baseline_id}", status_code=204)
def delete_sensory_baseline(
    baseline_id: UUID,
    db: Session = Depends(get_db),
    context: CurrentContext = Depends(require_app_admin_context),
) -> None:
    baseline = db.get(SensoryProfileBaseline, baseline_id)
    if baseline is None:
        raise HTTPException(status_code=404, detail="Sensory baseline not found")
    db.delete(baseline)
    db.commit()


@router.post("/admin/profiles/{identity_id}/regenerate", response_model=SensoryProfileResponse)
def regenerate_sensory_profile(
    identity_id: UUID,
    allow_ai: bool = True,
    db: Session = Depends(get_db),
    context: CurrentContext = Depends(require_app_admin_context),
) -> SensoryProfileResponse:
    profile = db.scalar(
        select(WineSensoryProfile).where(WineSensoryProfile.identity_id == identity_id)
    )
    if profile is not None and profile.validated:
        raise HTTPException(
            status_code=409, detail="Validated profiles are never regenerated automatically"
        )
    wine = db.scalar(
        select(Wine).where(Wine.shared_identity_id == identity_id).order_by(Wine.created_at.desc())
    )
    if wine is None:
        raise HTTPException(status_code=404, detail="No reusable wine metadata is available")
    generated = generate_wine_sensory_profile(
        db,
        wine,
        allow_ai=allow_ai,
        ai_generate=_ai_sensory_profile,
        modified_by_user_id=context.user.id,
    )
    if generated is None:
        raise HTTPException(status_code=422, detail="No sensory profile can be inferred")
    db.commit()
    return sensory_response(generated)


@router.post("/admin/batch-preview", response_model=BatchEnrichmentPreview)
def batch_preview(
    db: Session = Depends(get_db), context: CurrentContext = Depends(require_app_admin_context)
) -> BatchEnrichmentPreview:
    wines = _batch_candidates(db)
    seen: set[tuple[str, ...]] = set()
    missing = deterministic = 0
    for wine in wines:
        identity = resolve_shared_identity(db, wine, create=False)
        parts = identity_parts(wine)
        identity_key = (str(identity.id),) if identity is not None else parts
        if identity_key is None or identity_key in seen:
            continue
        seen.add(identity_key)
        existing = sensory_profile_for_wine(db, wine)
        if existing and existing.generation_status == "available":
            continue
        missing += 1
        if infer_sensory_profile(db, wine)[0]:
            deterministic += 1
    return BatchEnrichmentPreview(
        missing=missing, deterministic=deterministic, requires_ai=missing - deterministic
    )


@router.post("/admin/enrich-missing")
def enrich_missing_profiles(
    payload: BatchEnrichmentRequest,
    db: Session = Depends(get_db),
    context: CurrentContext = Depends(require_app_admin_context),
) -> dict:
    limit = min(payload.limit, settings.wine_sensory_ai_batch_max)
    wines = _batch_candidates(db)
    seen: set[tuple[str, ...]] = set()
    processed = resolved = ai_generated = skipped = 0
    for wine in wines:
        identity = resolve_shared_identity(db, wine, create=True)
        if identity is None:
            continue
        identity_key = (str(identity.id),)
        if identity_key in seen:
            continue
        seen.add(identity_key)
        existing = sensory_profile_for_wine(db, wine)
        if existing and (existing.validated or existing.generation_status == "available"):
            skipped += 1
            continue
        if processed >= limit:
            break
        processed += 1
        generated = generate_wine_sensory_profile(
            db,
            wine,
            allow_ai=payload.allow_ai,
            ai_generate=_ai_sensory_profile,
            modified_by_user_id=context.user.id,
        )
        if generated and generated.generation_status == "available":
            resolved += 1
            ai_generated += generated.source == "ai"
    db.commit()
    return {
        "processed": processed,
        "resolved": resolved,
        "ai_generated": ai_generated,
        "skipped": skipped,
        "ai_enabled": settings.wine_sensory_ai_enabled,
    }
