"""One optional, billed wine-specific research request within ordinary profile generation."""

import json
from datetime import UTC, datetime

from fastapi import HTTPException
from pydantic import ValidationError
from sqlalchemy import select

from app.core.config import settings
from app.models import SharedWineIdentity, Wine, WineSensoryProfile
from app.prompts.sensory_refinement import wine_sensory_refinement_prompt
from app.schemas.sensory_agent import CompletedDimension, SensoryResearchResult
from app.schemas.sensory_refinement import SensoryRefinementOutput
from app.services.sensory_completion import SensoryEvidenceVerifier, exact_evidence
from app.services.sensory_relevance import describes_trait
from app.services.shared_wine_data import normalize_identity_part


def checked_estimates(wine, response):
    """Verify descriptions without pretending the generated numbers are measurements."""
    try:
        output = SensoryRefinementOutput.model_validate_json(response.text)
    except ValidationError as exc:
        raise HTTPException(422, "Invalid research result; previous profile retained") from exc
    if any(
        normalize_identity_part(getattr(output, key)) != normalize_identity_part(getattr(wine, key))
        for key in ("name", "producer", "vintage")
    ):
        raise HTTPException(422, "Wine identity mismatch; previous profile retained")
    report = SensoryResearchResult(
        wine_id=wine.id,
        name=wine.name,
        producer=wine.producer,
        vintage=wine.vintage,
        status="incomplete",
        prompt_version="12",
    )
    from app.services.score_sources import read_public_document
    from app.services.sensory_agent import public_source_url
    from app.services.sensory_documents import prefetch_source_documents

    sources = {
        url: {"url": url}
        for item in response.web_sources
        if (url := public_source_url(str(item.get("url", ""))))
    }
    cache = {}
    prefetch_source_documents(output.model_dump(), sources, cache, read_public_document)
    verifier = SensoryEvidenceVerifier(sources, report, document_cache=cache)
    if not exact_evidence(output.identity_evidence, wine.vintage) or not verifier.verified(
        output.identity_evidence
    ):
        raise HTTPException(
            422, "Wine and vintage could not be verified; previous profile retained"
        )
    checked = {}
    for key, estimate in output.dimensions:
        if (
            estimate is None
            or estimate.upper - estimate.lower < 0.20 - 1e-9
            or not estimate.evidence
        ):
            continue
        # Reject the entire estimate when any cited premise fails. Never strip
        # conflicting/unreadable premises and keep the number they supposedly justify.
        if not all(
            exact_evidence(proof, wine.vintage)
            and verifier.verified(proof)
            and describes_trait(key, proof.excerpt)
            for proof in estimate.evidence
        ):
            continue
        from app.services.sensory_descriptors import descriptor_estimate

        anchors = descriptor_estimate(key, estimate.evidence, strict=True)
        if anchors is not None and anchors.conflicting:
            continue
        checked[key] = CompletedDimension(
            value=estimate.value,
            lower=estimate.lower,
            upper=estimate.upper,
            rationale=estimate.rationale,
            evidence=estimate.evidence,
            origin="ai_inference",
            confidence=0.45,
            sensory_support="description",
            inference_basis="verified_description",
            calculation_method="contextual_research_v1",
        )
    if not checked:
        raise HTTPException(422, "No usable wine-specific evidence; previous profile retained")
    return checked


def refine_profile(db, context, wine, profile):
    from app.api.routes.ai import (
        create_ai_response,
        get_or_create_user_ai_settings,
        record_ai_audit,
        web_search_tool_cost_usd,
    )
    from app.services.taste_profiles import infer_sensory_profile, sensory_dimension_confidence

    if not settings.wine_sensory_ai_enabled:
        raise HTTPException(503, "Sensory profile AI generation is disabled")
    if profile and (profile.validated or profile.source == "manual"):
        raise HTTPException(409, "Manual or validated profiles are protected")
    if not wine.vintage.strip():
        raise HTTPException(422, "A vintage is required for advanced research")
    identity = (wine.name, wine.producer, wine.vintage, wine.shared_identity_id)
    before = (
        json.dumps(
            {
                "dimensions": profile.dimensions,
                "provenance": profile.provenance,
                "validated": profile.validated,
                "source": profile.source,
            },
            sort_keys=True,
        )
        if profile
        else None
    )
    prompt = wine_sensory_refinement_prompt(
        wine_context={
            key: getattr(wine, key)
            for key in ("name", "producer", "vintage", "type", "region", "appellation", "grapes")
        },
        locale=context.user.locale,
    )
    response, provider = create_ai_response(
        db,
        context,
        get_or_create_user_ai_settings(db, context),
        model=settings.openai_sensory_refinement_model,
        system_prompt=prompt.system,
        user_prompt=prompt.user,
        json_schema={
            "name": "wine_sensory_refinement",
            "schema": SensoryRefinementOutput.model_json_schema(),
        },
        web_search=True,
        web_search_use_default_location=False,
        web_search_context_size="high",
        max_tool_calls=5,
        max_output_tokens=6000,
        reasoning_effort="high",
        task_type="sensory_refinement",
        timeout_seconds=240,
    )
    record_ai_audit(
        db,
        context,
        entity_type="wine",
        entity_id=wine.id,
        feature=prompt.id,
        model=response.model,
        summary="Wine sensory refinement v1",
        usage=response.usage,
        provider_source=provider,
        sources=list(response.web_sources),
        extra_cost_usd=web_search_tool_cost_usd(response.web_search_calls),
    )
    db.commit()  # Keep paid usage/audit even when evidence validation fails.
    checked = checked_estimates(wine, response)
    current_wine = db.scalar(
        select(Wine)
        .where(Wine.id == wine.id, Wine.household_id == context.household.id)
        .execution_options(populate_existing=True)
        .with_for_update()
    )
    if (
        current_wine is None
        or (
            current_wine.name,
            current_wine.producer,
            current_wine.vintage,
            current_wine.shared_identity_id,
        )
        != identity
    ):
        raise HTTPException(409, "Wine changed during research; retry")
    db.scalar(
        select(SharedWineIdentity)
        .where(SharedWineIdentity.id == wine.shared_identity_id)
        .with_for_update()
    )
    current = db.scalar(
        select(WineSensoryProfile)
        .where(WineSensoryProfile.identity_id == wine.shared_identity_id)
        .execution_options(populate_existing=True)
        .with_for_update()
    )
    after = (
        json.dumps(
            {
                "dimensions": current.dimensions,
                "provenance": current.provenance,
                "validated": current.validated,
                "source": current.source,
            },
            sort_keys=True,
        )
        if current
        else None
    )
    if before != after:
        raise HTTPException(409, "Profile changed during research; previous profile retained")
    fallback, _, fallback_confidence = infer_sensory_profile(db, wine)
    dimensions = dict(current.dimensions) if current else fallback
    provenance = dict(current.provenance or {}) if current else {}
    for key, value in dimensions.items():
        try:
            CompletedDimension.model_validate(provenance[key])
        except (KeyError, ValidationError):
            provenance[key] = CompletedDimension(
                value=value,
                origin="wine_style",
                confidence=sensory_dimension_confidence(current, key)
                if current
                else fallback_confidence,
                calculation_method="metadata_fallback_v1",
                sensory_support="context",
            ).model_dump(mode="json")
    for key, item in checked.items():
        dimensions[key] = item.value
        provenance[key] = item.model_dump(mode="json")
    current = current or WineSensoryProfile(identity_id=wine.shared_identity_id)
    db.add(current)
    current.dimensions, current.provenance = dimensions, provenance
    current.source, current.validated, current.generation_status = "hybrid", False, "available"
    current.confidence = sum(float(provenance[key].get("confidence", 0)) for key in dimensions) / 9
    current.model, current.generated_at = response.model[:120], datetime.now(UTC)
    current.last_modified_by_user_id = context.user.id
    db.commit()
    return current, str(response.charged_cost_usd)
