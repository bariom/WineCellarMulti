from __future__ import annotations

from dataclasses import dataclass
from typing import Literal

from fastapi import HTTPException, status

from app.core.config import settings


LEGACY_MODEL = "gpt-5.5"
COMPATIBILITY_MODELS = {"gpt-5.4", "gpt-5.4-mini", "gpt-5.4-nano"}
DEFAULT_MAX_OUTPUT_TOKENS = 32768
ABSOLUTE_MAX_OUTPUT_TOKENS = 32768
ModelRole = Literal["legacy", "economy", "balanced", "advanced"]

SIMPLE_TASKS = {
    "ai_notes",
    "grape_inference",
    "label_enrichment",
    "score_summary",
    "structured_extraction",
}
ADVANCED_TASKS = {
    "cellar_analysis",
    "portfolio_strategy",
    "regional_gap_targets",
    "multi_step_planning",
}


@dataclass(frozen=True)
class ModelSelection:
    requested_model: str | None
    model: str
    role: ModelRole


@dataclass(frozen=True)
class ModelParameters:
    reasoning_effort: str | None
    max_output_tokens: int | None
    timeout_seconds: float
    max_retries: int


def model_by_role() -> dict[ModelRole, str]:
    return {
        "legacy": (settings.openai_default_model or LEGACY_MODEL).strip(),
        "economy": settings.openai_economy_model.strip(),
        "balanced": settings.openai_balanced_model.strip(),
        "advanced": settings.openai_advanced_model.strip(),
    }


def allowed_models() -> frozenset[str]:
    configured = {model for model in model_by_role().values() if model}
    if settings.openai_enable_gpt56:
        # GPT-5.5 remains an internal rollback/fallback target, not a model
        # exposed for user selection while the GPT-5.6 rollout is enabled.
        return frozenset(configured - {model_by_role()["legacy"]})
    return frozenset(configured | COMPATIBILITY_MODELS)


def role_for_model(model: str) -> ModelRole:
    for role, configured_model in model_by_role().items():
        if model == configured_model:
            return role
    return "legacy"


def safe_fallback_model() -> str:
    configured = settings.openai_fallback_model.strip()
    legacy = model_by_role()["legacy"]
    return configured if configured in {legacy, LEGACY_MODEL} else LEGACY_MODEL


def select_ai_model(
    task_type: str,
    complexity: str | None = None,
    requested_model: str | None = None,
) -> ModelSelection:
    requested = requested_model.strip() if requested_model else None

    # This is the immediate rollback switch and intentionally overrides every
    # stored/user model preference.
    if not settings.openai_enable_gpt56:
        return ModelSelection(requested_model=requested, model=LEGACY_MODEL, role="legacy")

    if requested is not None:
        if requested not in allowed_models():
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Unsupported OpenAI model",
            )
        return ModelSelection(requested_model=requested, model=requested, role=role_for_model(requested))

    if not settings.openai_enable_model_routing:
        model = model_by_role()["legacy"] or LEGACY_MODEL
        return ModelSelection(requested_model=None, model=model, role="legacy")

    normalized_complexity = (complexity or "").strip().lower()
    normalized_task = task_type.strip().lower()
    if normalized_complexity in {"advanced", "complex", "high"} or normalized_task in ADVANCED_TASKS:
        role: ModelRole = "advanced"
    elif normalized_complexity in {"economy", "simple", "low"} or normalized_task in SIMPLE_TASKS:
        role = "economy"
    else:
        role = "balanced"

    model = model_by_role().get(role) or safe_fallback_model()
    if model not in allowed_models():
        return ModelSelection(requested_model=None, model=LEGACY_MODEL, role="legacy")
    return ModelSelection(requested_model=None, model=model, role=role)


def parameters_for_model(model: str) -> ModelParameters:
    role = role_for_model(model)
    effort_by_role = {
        "legacy": settings.openai_legacy_reasoning_effort,
        "economy": settings.openai_economy_reasoning_effort,
        "balanced": settings.openai_balanced_reasoning_effort,
        "advanced": settings.openai_advanced_reasoning_effort,
    }
    max_tokens_by_role = {
        "legacy": settings.openai_legacy_max_output_tokens,
        "economy": settings.openai_economy_max_output_tokens,
        "balanced": settings.openai_balanced_max_output_tokens,
        "advanced": settings.openai_advanced_max_output_tokens,
    }
    effort = effort_by_role[role].strip().lower() or None
    if effort not in {None, "none", "low", "medium", "high", "xhigh", "max"}:
        effort = None
    configured_max_tokens = max_tokens_by_role[role]
    # Never send an unbounded request. A zero/missing deployment value used to
    # omit max_output_tokens and allowed a malformed structured response to run
    # all the way to the model's native 128k output limit.
    max_tokens = min(
        configured_max_tokens if configured_max_tokens > 0 else DEFAULT_MAX_OUTPUT_TOKENS,
        ABSOLUTE_MAX_OUTPUT_TOKENS,
    )
    return ModelParameters(
        reasoning_effort=effort,
        max_output_tokens=max_tokens,
        timeout_seconds=max(float(settings.openai_timeout_seconds), 1.0),
        # At most two HTTP requests are allowed. A GPT-5.6 fallback consumes
        # the second request; legacy-only calls may use it as one normal retry.
        max_retries=min(max(int(settings.openai_max_retries), 0), 1),
    )
