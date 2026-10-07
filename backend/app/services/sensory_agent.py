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
from app.schemas.sensory_agent import CompleteResearchOutput, ResearchOutput, SensoryResearchResult
from app.services.openai_client import OpenAIResponse
from app.services.shared_wine_data import normalize_identity_part
from app.services.taste_profiles import sensory_profile_for_wine


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
    wine: Wine,
    response: OpenAIResponse,
    baseline: dict,
    *,
    prompt_version: str = "3",
    source_texts: dict[str, str] | None = None,
) -> SensoryResearchResult:
    if prompt_version in {"4", "5"}:
        from app.services.sensory_completion import build_complete_proposal

        return build_complete_proposal(
            wine, response, baseline, source_texts=source_texts, prompt_version=prompt_version
        )
    result = SensoryResearchResult(
        wine_id=wine.id,
        identity_id=wine.shared_identity_id,
        name=wine.name,
        producer=wine.producer,
        vintage=wine.vintage,
        status="no_evidence",
        baseline=baseline,
        prompt_version="3",
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
    compared: set[str] = set()
    conflicts = False
    for comparison in output.comparisons:
        if comparison.dimension not in result.dimensions or comparison.dimension in compared:
            continue
        compared.add(comparison.dimension)
        evidence = []
        seen_urls: set[str] = set()
        for item in comparison.evidence:
            url = public_source_url(item.source_url)
            if url in sources and url not in seen_urls and item.excerpt.strip():
                item.source_url = url
                evidence.append(item)
                seen_urls.add(url)
                used.add(url)
        comparison.evidence = evidence
        domains = {urlsplit(item.source_url).hostname.removeprefix("www.") for item in evidence}
        primary = result.dimensions[comparison.dimension].source_url
        if primary not in seen_urls or not evidence:
            continue
        if comparison.agreement == "corroborated" and (
            not comparison.independent or len(domains) < 2
        ):
            comparison.agreement = "single_source"
        conflicts |= comparison.agreement == "conflicting"
        result.comparisons.append(comparison)
    result.sources = [sources[url] for url in sorted(used)]
    if not used or not result.dimensions:
        result.issue = "no_verified_sources"
        return result
    result.summary = output.summary
    result.limitations = output.limitations
    result.vintage_confirmed = output.vintage_confirmed and bool(wine.vintage.strip())
    corroborated = sum(item.agreement == "corroborated" for item in result.comparisons)
    # Evidence coverage, not a calibrated probability of sensory accuracy.
    result.confidence = round(
        min(0.85, 0.2 + 0.55 * corroborated / 9 + (0.1 if result.vintage_confirmed else 0)), 3
    )
    result.status = (
        "ready"
        if corroborated >= 3 and result.vintage_confirmed and not conflicts
        else "incomplete"
    )
    if result.status == "incomplete":
        result.issue = (
            "vintage_unverified"
            if not result.vintage_confirmed
            else "conflicting_sources"
            if conflicts
            else "weak_evidence"
        )
    return result


def candidate_wines(
    db: Session, context: CurrentContext, limit: int | None, *, wine_ids: list[UUID] | None = None
) -> list[Wine]:
    candidates: list[Wine] = []
    seen: set[object] = set()
    query = (
        select(Wine)
        .where(Wine.household_id == context.household.id)
        .order_by(Wine.created_at, Wine.id)
    )
    if wine_ids is not None:
        query = query.where(Wine.id.in_(wine_ids))
    wines = list(db.scalars(query))
    if wine_ids is not None:
        order = {wine_id: index for index, wine_id in enumerate(wine_ids)}
        wines.sort(key=lambda wine: order[wine.id])
    for wine in wines:
        identity = wine.shared_identity_id or (wine.producer, wine.name, wine.vintage)
        if identity in seen:
            continue
        seen.add(identity)
        candidates.append(wine)
        if limit is not None and len(candidates) >= limit:
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
    existing = sensory_profile_for_wine(db, wine)
    baseline = dict(existing.dimensions) if existing else {}
    baseline_source = existing.source if existing else ""
    baseline_validated = bool(existing and existing.validated)
    baseline_confidence = existing.confidence if existing else None
    if not wine.vintage.strip():
        return SensoryResearchResult(
            wine_id=wine.id,
            identity_id=wine.shared_identity_id,
            name=wine.name,
            producer=wine.producer,
            vintage=wine.vintage,
            status="skipped",
            issue="missing_vintage",
            baseline=baseline,
            baseline_source=baseline_source,
            baseline_validated=baseline_validated,
            baseline_confidence=baseline_confidence,
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

    prompt = wine_sensory_research_prompt(
        wine_context={
            "name": wine.name,
            "producer": wine.producer,
            "vintage": wine.vintage,
            "type": wine.type,
            "region": wine.region,
            "appellation": wine.appellation,
            "grapes": wine.grapes or [],
        },
        locale=context.user.locale,
    )
    schema = {"name": "wine_sensory_research", "schema": CompleteResearchOutput.model_json_schema()}
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
        output_tokens=12000,
        web_search_calls=10,
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
        web_search_context_size="medium",
        task_type="sensory_profile",
        max_output_tokens=12000,
        max_tool_calls=10,
        reasoning_effort="medium",
        timeout_seconds=240,
    )
    result = proposal_from_response(wine, response, baseline, prompt_version=prompt.version)
    result.baseline_source = baseline_source
    result.baseline_validated = baseline_validated
    result.baseline_confidence = baseline_confidence
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
