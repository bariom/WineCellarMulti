"""Assisted application of checked intensities; free model guesses remain research."""

from app.schemas.sensory_agent import (
    AppliedDimension,
    SensoryApplicationPreview,
    SensoryResearchResult,
)
from app.services.taste_profiles import SENSORY_DIMENSIONS, validated_dimensions

MAX_SINGLE_SOURCE_CHANGE = 0.20


def application_preview(
    result: SensoryResearchResult,
    baseline: dict,
    baseline_confidence: float,
    *,
    baseline_provenance: dict | None = None,
) -> SensoryApplicationPreview:
    preview = SensoryApplicationPreview()
    for key, value in validated_dimensions(baseline).items():
        proof = (baseline_provenance or {}).get(key, {})
        raw_confidence = (
            baseline_confidence
            if not baseline_provenance
            else proof.get("confidence", 0)
            if isinstance(proof, dict)
            else 0
        )
        try:
            confidence = float(raw_confidence)
            if not 0 <= confidence <= 1:
                confidence = 0
        except (TypeError, ValueError):
            confidence = 0
        preview.dimensions[key] = AppliedDimension(
            value=value,
            confidence=confidence,
            origin="baseline",
            reason="no_supported_intensity",
        )
    blocked = (
        "protected_profile"
        if result.baseline_validated or result.baseline_source == "manual"
        else "identity_unverified"
        if not result.identity_confirmed or result.identity_ambiguous
        else "research_failed"
        if result.status in {"failed", "skipped", "no_evidence"}
        else ""
    )
    for key in SENSORY_DIMENSIONS:
        item = result.complete_profile.get(key)
        reason = blocked or "no_supported_intensity"
        supported = bool(
            item
            and item.value is not None
            and item.sensory_support == "intensity"
            and item.calculation_method == "verified_descriptor_v2"
            and item.origin in {"corroborated", "single_source", "wine_style"}
            and item.confidence > 0
            and item.evidence
            and not item.issue
            and not item.references
        )
        if not blocked and supported and item is not None and item.value is not None:
            previous = preview.dimensions.get(key)
            if (
                previous
                and item.origin != "corroborated"
                and abs(item.value - previous.value) > MAX_SINGLE_SOURCE_CHANGE + 1e-9
            ):
                reason = "large_single_source_change"
                preview.review_required.append(key)
            else:
                preview.dimensions[key] = AppliedDimension(
                    value=item.value,
                    confidence=item.confidence,
                    origin="agent",
                    reason="verified_intensity",
                )
                preview.updated.append(key)
                continue
        if item and item.issue in {"conflicting_sources", "reference_disagreement"}:
            reason = "conflicting_sources"
            if key not in preview.review_required:
                preview.review_required.append(key)
        if key in preview.dimensions:
            preview.dimensions[key].reason = reason
            preview.retained.append(key)
    preview.eligible = not blocked and bool(preview.updated)
    preview.reason = blocked or ("" if preview.eligible else "no_supported_updates")
    return preview
