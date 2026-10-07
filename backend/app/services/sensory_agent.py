"""Bounded source-backed research; proposals never overwrite validated wine profiles."""

import ipaddress
import json
from datetime import UTC, datetime
from decimal import Decimal
from urllib.parse import urlsplit, urlunsplit
from uuid import UUID

from pydantic import ValidationError
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import (
    CurrentContext,
    active_entitlement_valid_until,
    get_current_context,
    require_app_admin_context,
)
from app.core.config import settings
from app.db.session import SessionLocal
from app.models import (
    Household,
    Membership,
    SensoryAgentRun,
    User,
    UserSession,
    Wine,
)
from app.prompts.sensory_agent import wine_sensory_research_prompt
from app.schemas.sensory_agent import ResearchOutput, SensoryResearchResult
from app.services.openai_client import OpenAIResponse
from app.services.shared_wine_data import normalize_identity_part
from app.services.taste_profiles import infer_sensory_profile, sensory_profile_for_wine


def public_source_url(value: str) -> str:
    """Accept provider-cited public HTTP URLs, never local targets or credentials."""
    try:
        parts = urlsplit(value.strip())
        host = parts.hostname or ""
        if parts.scheme not in {"http", "https"} or parts.username or parts.password:
            return ""
        if "." not in host or host.endswith((".local", ".localhost", ".internal")):
            return ""
        try:
            if not ipaddress.ip_address(host).is_global:
                return ""
        except ValueError:
            pass
        return urlunsplit(
            (parts.scheme, parts.netloc.lower(), parts.path.rstrip("/"), parts.query, "")
        )
    except ValueError:
        return ""


def proposal_from_response(
    wine: Wine, response: OpenAIResponse, baseline: dict
) -> SensoryResearchResult:
    result = SensoryResearchResult(
        wine_id=wine.id,
        identity_id=wine.shared_identity_id,
        name=wine.name,
        producer=wine.producer,
        vintage=wine.vintage,
        status="no_evidence",
        baseline=baseline,
        model=response.model,
        cost_usd=response.charged_cost_usd,
    )
    try:
        output = ResearchOutput.model_validate_json(response.text)
    except ValidationError:
        result.status, result.issue = "failed", "invalid_output"
        return result
    if not output.identity_confirmed or any(
        normalize_identity_part(getattr(output, key)) != normalize_identity_part(getattr(wine, key))
        for key in ("name", "producer", "vintage")
    ):
        result.issue = "identity_mismatch"
        return result
    sources = {
        url: {"url": url, "title": str(source.get("title") or "")[:200]}
        for source in response.web_sources
        if (url := public_source_url(str(source.get("url") or "")))
    }
    used: set[str] = set()
    for dimension, trait in output.dimensions:
        if trait is None:
            continue
        url = public_source_url(trait.source_url)
        if url in sources and trait.excerpt.strip():
            trait.source_url = url
            result.dimensions[dimension] = trait
            used.add(url)
    for aroma in output.aromas:
        url = public_source_url(aroma.source_url)
        if url in sources and aroma.excerpt.strip():
            aroma.source_url = url
            result.aromas.append(aroma)
            used.add(url)
    result.sources = [sources[url] for url in sorted(used)]
    if not used or not result.dimensions:
        result.issue = "no_verified_sources"
        return result
    result.summary = output.summary
    result.limitations = output.limitations
    result.vintage_confirmed = output.vintage_confirmed and bool(wine.vintage.strip())
    documented = sum(trait.basis == "documented" for trait in result.dimensions.values())
    result.confidence = round(
        min(0.85, 0.45 + 0.3 * documented / 9 + (0.1 if result.vintage_confirmed else 0)), 3
    )
    result.status = (
        "ready"
        if len(result.dimensions) >= 3 and documented and result.vintage_confirmed
        else "incomplete"
    )
    if result.status == "incomplete":
        result.issue = "weak_evidence" if result.vintage_confirmed else "vintage_unverified"
    return result


def candidate_wines(db: Session, context: CurrentContext, limit: int) -> list[Wine]:
    candidates: list[Wine] = []
    seen: set[object] = set()
    for wine in db.scalars(
        select(Wine)
        .where(Wine.household_id == context.household.id)
        .order_by(Wine.created_at, Wine.id)
    ):
        identity = wine.shared_identity_id or (wine.producer, wine.name, wine.vintage)
        if identity in seen:
            continue
        seen.add(identity)
        profile = sensory_profile_for_wine(db, wine)
        if profile and (
            profile.validated
            or profile.source == "manual"
            or (profile.generation_status == "available" and profile.confidence >= 0.65)
        ):
            continue
        candidates.append(wine)
        if len(candidates) >= limit:
            break
    return candidates


def worker_context(
    db: Session, household_id: UUID, user_id: UUID, session_id: UUID
) -> CurrentContext:
    user_session = db.scalar(
        select(UserSession).where(
            UserSession.id == session_id,
            UserSession.user_id == user_id,
            UserSession.active_household_id == household_id,
            UserSession.expires_at > datetime.now(UTC),
        )
    )
    user = db.get(User, user_id)
    household = db.scalar(select(Household).where(Household.id == household_id))
    membership = db.scalar(
        select(Membership).where(
            Membership.user_id == user_id, Membership.household_id == household_id
        )
    )
    if (
        not user_session
        or not user
        or not household
        or not membership
        or user.is_blocked
        or not user.is_approved
    ):
        raise PermissionError("Research context is no longer authorized")
    until = active_entitlement_valid_until(db, user)
    context = CurrentContext(
        user=user,
        household=household,
        membership=membership,
        session=user_session,
        has_active_entitlement=until is not None,
        entitlement_valid_until=until,
    )
    return require_app_admin_context(get_current_context(context))


def research_wine(
    db: Session, context: CurrentContext, wine: Wine, remaining: Decimal
) -> SensoryResearchResult | None:
    if not wine.vintage.strip():
        return SensoryResearchResult(
            wine_id=wine.id,
            identity_id=wine.shared_identity_id,
            name=wine.name,
            producer=wine.producer,
            vintage=wine.vintage,
            status="skipped",
            issue="missing_vintage",
        )
    # Reuse Vinaris provider selection, credit reservation and usage accounting.
    from app.api.routes.ai import (
        create_ai_response,
        get_or_create_user_ai_settings,
        maximum_billable_cost_usd,
        record_ai_audit,
        reservation_pricing_model,
        select_ai_provider,
        web_search_tool_cost_usd,
    )

    existing = sensory_profile_for_wine(db, wine)
    baseline = existing.dimensions if existing else infer_sensory_profile(db, wine)[0]
    prompt = wine_sensory_research_prompt(
        wine_context={
            "name": wine.name,
            "producer": wine.producer,
            "vintage": wine.vintage,
            "type": wine.type,
            "region": wine.region,
            "appellation": wine.appellation,
        },
        locale=context.user.locale,
    )
    schema = {"name": "wine_sensory_research", "schema": ResearchOutput.model_json_schema()}
    user_settings = get_or_create_user_ai_settings(db, context)
    provider, _ = select_ai_provider(db, context, user_settings)
    model = settings.openai_economy_model
    estimated_ceiling = maximum_billable_cost_usd(
        user_is_app_admin=context.user.is_app_admin,
        user_has_active_entitlement=context.has_active_entitlement,
        provider_source=provider,
        model=reservation_pricing_model(model, db),
        input_tokens=32768
        + max(2048, (len(prompt.system) + len(prompt.user) + len(json.dumps(schema))) // 2),
        output_tokens=3000,
        web_search_calls=3,
        db=db,
    )
    if estimated_ceiling > remaining:
        return None
    response, provider = create_ai_response(
        db,
        context,
        user_settings,
        model=model,
        system_prompt=prompt.system,
        user_prompt=prompt.user,
        json_schema=schema,
        web_search=True,
        web_search_use_default_location=False,
        web_search_context_size="low",
        task_type="sensory_profile",
        max_output_tokens=3000,
        max_tool_calls=3,
        reasoning_effort="low",
        timeout_seconds=90,
    )
    result = proposal_from_response(wine, response, baseline)
    record_ai_audit(
        db,
        context,
        entity_type="wine",
        entity_id=wine.id,
        feature="sensory_research",
        model=response.model or model,
        summary="Source-backed sensory prototype",
        usage=response.usage,
        provider_source=provider,
        sources=result.sources,
        extra_cost_usd=web_search_tool_cost_usd(response.web_search_calls),
    )
    return result


def run_sensory_research(run_id: UUID, household_id: UUID, session_id: UUID) -> None:
    with SessionLocal() as db:
        run = db.scalar(
            select(SensoryAgentRun)
            .where(SensoryAgentRun.id == run_id, SensoryAgentRun.household_id == household_id)
            .with_for_update()
        )
        if run is None or run.status != "queued":
            return
        run.status = "running"
        db.commit()
        try:
            for wine_id in run.wine_ids:
                db.refresh(run)
                if run.status != "running":
                    return
                context = worker_context(db, household_id, run.user_id, session_id)
                wine = db.scalar(
                    select(Wine).where(
                        Wine.id == UUID(wine_id), Wine.household_id == context.household.id
                    )
                )
                if wine is None:
                    continue
                profile = sensory_profile_for_wine(db, wine)
                if profile and (profile.validated or profile.source == "manual"):
                    continue
                result = research_wine(db, context, wine, run.budget_usd - run.cost_usd)
                if result is None:
                    run.issue = "budget_limit"
                    break
                run.results = [*run.results, result.model_dump(mode="json")]
                run.cost_usd += result.cost_usd
                db.commit()
                if run.cost_usd >= run.budget_usd:
                    run.issue = "budget_limit"
                    break
            run.status = "completed"
            db.commit()
        except Exception:
            # Preserve proposals without persisting raw provider errors or prompts.
            db.rollback()
            db.refresh(run)
            run.status, run.issue = "failed", "research_failed"
            db.commit()
