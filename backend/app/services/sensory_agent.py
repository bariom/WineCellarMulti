"""Bounded source-backed research; proposals never overwrite validated wine profiles."""

import ipaddress
import json
from dataclasses import replace
from datetime import UTC, datetime
from decimal import Decimal
from time import perf_counter
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
from app.db.session import SessionLocal as SessionLocal
from app.models import (
    Household,
    Membership,
    User,
    UserSession,
    Wine,
)
from app.prompts.sensory_agent import wine_sensory_completion_prompt, wine_sensory_research_prompt
from app.schemas.sensory_agent import (
    CompleteResearchOutput,
    ResearchOutput,
    SensoryCompletionOutput,
    SensoryResearchResult,
)
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
    document_cache: dict | None = None,
) -> SensoryResearchResult:
    if prompt_version in {"4", "5", "6", "7", "8", "9"}:
        from app.services.sensory_completion import build_complete_proposal

        return build_complete_proposal(
            wine,
            response,
            baseline,
            source_texts=source_texts,
            prompt_version=prompt_version,
            document_cache=document_cache,
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


def complete_with_estimates(
    wine: Wine,
    result: SensoryResearchResult,
    response: OpenAIResponse,
    *,
    previous_sources: tuple[dict[str, str], ...] = (),
    document_cache: dict | None = None,
    locale: str = "it",
) -> SensoryResearchResult:
    """Keep checked observations and fill gaps with explicitly unvalidated model estimates."""
    result.cost_usd += response.charged_cost_usd
    result.web_search_calls += response.web_search_calls
    try:
        output = SensoryCompletionOutput.model_validate_json(response.text)
    except ValidationError:
        result.warnings.append("completion_invalid_output")
        return result
    if any(
        normalize_identity_part(getattr(output, key)) != normalize_identity_part(getattr(wine, key))
        for key in ("name", "producer", "vintage")
    ):
        result.warnings.append("completion_identity_mismatch")
        return result
    if output.research is not None:
        checked = proposal_from_response(
            wine,
            replace(
                response,
                text=output.research.model_dump_json(),
                web_sources=(*previous_sources, *response.web_sources),
            ),
            {},
            prompt_version=result.prompt_version,
            document_cache=document_cache,
        )
        rank = {
            "unknown": 0,
            "similar_wines": 1,
            "wine_style": 2,
            "single_source": 3,
            "corroborated": 4,
        }
        for key, item in checked.complete_profile.items():
            current = result.complete_profile[key]
            current.context_evidence = list(
                {
                    (e.source_url, e.excerpt): e
                    for e in [*current.context_evidence, *item.context_evidence]
                }.values()
            )
            # Refinement cannot silently erase previously observed disagreement.
            if current.issue in {"conflicting_sources", "reference_disagreement"}:
                continue
            if item.value is None and item.evidence and current.value is None:
                current.evidence = list(
                    {
                        (e.source_url, e.excerpt): e for e in [*current.evidence, *item.evidence]
                    }.values()
                )
            if item.issue == "conflicting_sources" or rank[item.origin] > rank[current.origin]:
                result.complete_profile[key] = item
                if key in checked.dimensions:
                    result.dimensions[key] = checked.dimensions[key]
                else:
                    result.dimensions.pop(key, None)
        result.vintage_confirmed |= checked.vintage_confirmed
        result.identity_confirmed |= checked.identity_confirmed
        if checked.identity_evidence:
            result.identity_evidence = checked.identity_evidence
        result.sources = list({s["url"]: s for s in [*result.sources, *checked.sources]}.values())
        for url, check in checked.source_checks.items():
            previous = result.source_checks.get(url)
            if previous:
                check.matched_excerpts = max(check.matched_excerpts, previous.matched_excerpts)
                check.unmatched_excerpts = max(
                    check.unmatched_excerpts, previous.unmatched_excerpts
                )
            result.source_checks[url] = check
        result.warnings = list(dict.fromkeys([*result.warnings, *checked.warnings]))
        comparisons = {c.dimension: c for c in result.comparisons}
        for comparison in checked.comparisons:
            previous = comparisons.get(comparison.dimension)
            if previous is None or previous.agreement != "conflicting":
                comparisons[comparison.dimension] = comparison
        result.comparisons = list(comparisons.values())
        result.aromas = list({a.name: a for a in [*result.aromas, *checked.aromas]}.values())
    result.summary, result.limitations = output.summary, output.limitations
    result.identity_ambiguous = output.identity_ambiguous
    result.model = response.model or result.model
    from app.services.sensory_completion import SensoryEvidenceVerifier

    sources = {
        url: {"url": url, "title": str(source.get("title") or "")[:200]}
        for source in (*previous_sources, *response.web_sources)
        if (url := public_source_url(str(source.get("url") or "")))
    }
    verifier = SensoryEvidenceVerifier(sources, result, document_cache=document_cache)
    for key, estimate in output.estimates:
        current = result.complete_profile[key]
        if current.value is not None:
            continue
        # These are plausible ranges, not calibrated statistical intervals. Require breadth
        # even if the provider supplied an unjustifiably narrow range.
        current.value = round(estimate.value, 2)
        current.origin = "ai_inference"
        current.rationale = estimate.rationale
        for premise in estimate.evidence:
            url = public_source_url(premise.source_url)
            if not url:
                result.warnings.append(f"{key}:invalid_premise_url")
                continue
            premise.source_url = url
            if verifier.verified(premise):
                current.evidence.append(premise)
            else:
                current.unverified_evidence.append(premise)
        current.evidence = list({(e.source_url, e.excerpt): e for e in current.evidence}.values())
        if current.evidence and current.issue in {
            "missing_evidence",
            "unverified_excerpt",
            "source_unreadable",
        }:
            # A later verified premise resolves the earlier quotation failure, not the
            # missing numeric intensity. Keep prior attempts in warnings/source_checks.
            current.issue = "unsupported_intensity"
        current.inference_basis = (
            "mixed_sources"
            if current.evidence and current.unverified_evidence
            else "verified_description"
            if current.evidence
            else "unverified_source"
            if current.unverified_evidence
            else "model_knowledge"
        )
        current.lower = round(
            min(
                estimate.lower,
                max(0, estimate.value - 0.15),
                current.lower if current.lower is not None else 1,
            ),
            2,
        )
        current.upper = round(
            max(
                estimate.upper,
                min(1, estimate.value + 0.15),
                current.upper if current.upper is not None else 0,
            ),
            2,
        )
        current.confidence = 0  # No verified evidence for this numeric intensity.
    from app.services.sensory_completion import apply_descriptor_estimates

    apply_descriptor_estimates(result, wine)
    result.sources = list(
        {
            s["url"]: s for s in [*result.sources, *(sources[url] for url in sorted(verifier.used))]
        }.values()
    )
    exact = sum(
        i.origin in {"corroborated", "single_source"} for i in result.complete_profile.values()
    )
    inferred = sum(i.origin == "ai_inference" for i in result.complete_profile.values())
    result.coverage = {
        "available": 9,
        "total": 9,
        "exact_vintage": exact,
        "corroborated": sum(i.origin == "corroborated" for i in result.complete_profile.values()),
        "estimated": 9 - exact,
        "inferred": inferred,
        "unknown": 0,
    }
    result.confidence = round(sum(i.confidence for i in result.complete_profile.values()) / 9, 3)
    result.status = "incomplete" if output.identity_ambiguous else "ready"
    result.issue = "ambiguous_identity" if output.identity_ambiguous else ""
    return describe_checked_result(result, locale)


def describe_checked_result(result: SensoryResearchResult, locale: str) -> SensoryResearchResult:
    """Keep provider prose separate from statements derived from actual server checks."""
    if result.prompt_version not in {"7", "8", "9"}:
        return result
    if result.agent_summary:
        return result
    result.agent_summary, result.agent_limitations = result.summary, result.limitations
    qualitative = sum(bool(item.evidence) for item in result.complete_profile.values())
    grounded = sum(
        item.origin == "ai_inference" and bool(item.evidence)
        for item in result.complete_profile.values()
    )
    unsupported = sum(
        item.origin == "ai_inference" and bool(item.unverified_evidence)
        for item in result.complete_profile.values()
    )
    result.coverage.update(
        qualitative=qualitative, inferred_grounded=grounded, inferred_unverified=unsupported
    )
    if result.prompt_version == "9":
        result.coverage.update(
            described_estimates=sum(
                i.sensory_support == "description" for i in result.complete_profile.values()
            ),
            context_estimates=sum(
                i.sensory_support == "context" for i in result.complete_profile.values()
            ),
        )
    numeric = sum(
        item.value is not None and item.origin not in {"ai_inference", "unknown"}
        for item in result.complete_profile.values()
    )
    if locale == "it":
        identity = (
            "Identità con riscontro documentale."
            if result.identity_confirmed
            else ("Identità senza riscontro documentale verificato.")
        )
        vintage = (
            "Annata confermata da una citazione verificata."
            if result.vintage_confirmed
            else ("Annata non confermata dalle verifiche del server.")
        )
        result.summary = f"{identity} {vintage} {numeric}/9 intensità sostenute da fonti; " + (
            f"{qualitative}/9 tratti con citazioni qualitative verificate."
        )
        result.limitations = (
            "Le inferenze restano stime: una descrizione qualitativa verificata non verifica "
            "il valore numerico. Il testo libero dell'agente è separato dalle prove controllate."
        )
    else:
        identity = (
            "Identity has documentary support."
            if result.identity_confirmed
            else ("Identity has no verified documentary support.")
        )
        vintage = (
            "Vintage confirmed by a verified quotation."
            if result.vintage_confirmed
            else ("Vintage not confirmed by server verification.")
        )
        result.summary = f"{identity} {vintage} {numeric}/9 source-supported intensities; " + (
            f"{qualitative}/9 traits with verified qualitative quotations."
        )
        result.limitations = (
            "Inferences remain estimates: a verified qualitative description does not verify "
            "the numeric value. Free-form agent text is separate from checked evidence."
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


def research_wine_context(wine: Wine) -> dict:
    return {
        "name": wine.name,
        "producer": wine.producer,
        "vintage": wine.vintage,
        "type": wine.type,
        "region": wine.region,
        "appellation": wine.appellation,
        "grapes": wine.grapes or [],
    }


def research_costs(db: Session, context: CurrentContext, wine: Wine, provider: str):
    from app.api.routes.ai import maximum_billable_cost_usd, reservation_pricing_model

    prompt = wine_sensory_research_prompt(
        wine_context=research_wine_context(wine), locale=context.user.locale
    )
    schema = {"name": "wine_sensory_research", "schema": CompleteResearchOutput.model_json_schema()}

    def ceiling(input_tokens: int, calls: int) -> Decimal:
        return maximum_billable_cost_usd(
            user_is_app_admin=context.user.is_app_admin,
            user_has_active_entitlement=context.has_active_entitlement,
            provider_source=provider,
            model=reservation_pricing_model(settings.openai_economy_model, db),
            output_tokens=12000,
            db=db,
            input_tokens=input_tokens,
            web_search_calls=calls,
        )

    first = ceiling(
        32768 + max(2048, (len(prompt.system) + len(prompt.user) + len(json.dumps(schema))) // 2), 4
    )
    completion = ceiling(65536, 2)
    return first, completion


def research_cost_ceiling(db: Session, context: CurrentContext, wine: Wine) -> Decimal:
    if not wine.vintage.strip():
        return Decimal("0")
    from app.api.routes.ai import get_or_create_user_ai_settings, select_ai_provider

    user_settings = get_or_create_user_ai_settings(db, context)
    provider, _ = select_ai_provider(db, context, user_settings)
    return sum(research_costs(db, context, wine, provider), Decimal("0"))


def research_wine(
    db: Session, context: CurrentContext, wine: Wine, remaining: Decimal
) -> SensoryResearchResult | None:
    started = perf_counter()
    result = _research_wine(db, context, wine, remaining)
    if result is not None:
        result.duration_ms = round((perf_counter() - started) * 1000)
    return result


def _research_wine(
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

    wine_context = research_wine_context(wine)
    prompt = wine_sensory_research_prompt(wine_context=wine_context, locale=context.user.locale)
    schema = {"name": "wine_sensory_research", "schema": CompleteResearchOutput.model_json_schema()}
    user_settings = get_or_create_user_ai_settings(db, context)
    provider, _ = select_ai_provider(db, context, user_settings)
    model = settings.openai_economy_model
    estimated_ceiling, completion_ceiling = research_costs(db, context, wine, provider)
    completion_schema = {
        "name": "wine_sensory_completion",
        "schema": SensoryCompletionOutput.model_json_schema(),
    }
    # Reserve room for a useful completed proposal before spending on source research.
    if estimated_ceiling + completion_ceiling > remaining:
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
        max_tool_calls=4,
        reasoning_effort="medium",
        timeout_seconds=240,
    )
    document_cache: dict = {}
    result = proposal_from_response(
        wine, response, baseline, prompt_version=prompt.version, document_cache=document_cache
    )
    result.web_search_calls = response.web_search_calls
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
        summary="Sensory research: source verification",
        usage=response.usage,
        provider_source=provider,
        sources=result.sources,
        extra_cost_usd=web_search_tool_cost_usd(response.web_search_calls),
    )
    if result.status == "ready":
        return describe_checked_result(result, context.user.locale)
    from app.services.sensory_documents import readable_source_passages

    readable = readable_source_passages(document_cache, wine.name)
    qualitative = sum(bool(item.evidence) for item in result.complete_profile.values())
    refinement_calls = 0 if len(readable) >= 2 and qualitative >= 3 else 2
    feedback = {
        "readable_sources": readable,
        "traits_without_sensory_description": [
            key for key, item in result.complete_profile.items() if not item.evidence
        ],
        "blocked_hosts": sorted(
            {
                urlsplit(url).hostname or ""
                for url, check in result.source_checks.items()
                if check.status in {"cloudflare_challenge", "host_blocked"}
                or check.http_status == 429
            }
        ),
        "web_search_calls_available": refinement_calls,
        "vintage_verified": result.vintage_confirmed,
        "issue": result.issue,
        "checked_profile": {
            key: item.model_dump(mode="json") for key, item in result.complete_profile.items()
        },
        "source_checks": {
            url: check.model_dump(mode="json") for url, check in result.source_checks.items()
        },
        "warnings": result.warnings,
        "unverified_research_summary": result.summary,
        "research_limitations": result.limitations,
    }
    completion_prompt = wine_sensory_completion_prompt(
        wine_context=wine_context, feedback=feedback, locale=context.user.locale
    )
    actual_completion_ceiling = maximum_billable_cost_usd(
        user_is_app_admin=context.user.is_app_admin,
        user_has_active_entitlement=context.has_active_entitlement,
        provider_source=provider,
        model=reservation_pricing_model(model, db),
        input_tokens=32768
        + max(
            2048,
            (
                len(completion_prompt.system)
                + len(completion_prompt.user)
                + len(json.dumps(completion_schema))
            )
            // 2,
        ),
        output_tokens=12000,
        web_search_calls=refinement_calls,
        db=db,
    )
    if actual_completion_ceiling > remaining - result.cost_usd:
        result.warnings.append("completion_budget_limit")
        return describe_checked_result(result, context.user.locale)
    try:
        completion_response, completion_provider = create_ai_response(
            db,
            context,
            user_settings,
            model=model,
            system_prompt=completion_prompt.system,
            user_prompt=completion_prompt.user,
            json_schema=completion_schema,
            web_search=refinement_calls > 0,
            web_search_use_default_location=False,
            web_search_context_size="medium",
            task_type="sensory_profile",
            max_output_tokens=12000,
            max_tool_calls=refinement_calls,
            reasoning_effort="medium",
            timeout_seconds=240,
        )
    except Exception:
        # A failed refinement must not lose the paid first pass or abort subsequent wines.
        result.warnings.append("completion_failed")
        return describe_checked_result(result, context.user.locale)
    result = complete_with_estimates(
        wine,
        result,
        completion_response,
        previous_sources=response.web_sources,
        document_cache=document_cache,
        locale=context.user.locale,
    )
    record_ai_audit(
        db,
        context,
        entity_type="wine",
        entity_id=wine.id,
        feature="sensory_research",
        model=completion_response.model or model,
        summary="Sensory research: profile completion",
        usage=completion_response.usage,
        provider_source=completion_provider,
        sources=result.sources,
        extra_cost_usd=web_search_tool_cost_usd(completion_response.web_search_calls),
    )
    return describe_checked_result(result, context.user.locale)


def run_sensory_research(run_id: UUID, household_id: UUID, session_id: UUID) -> None:
    from app.services.sensory_parallel import run_parallel_research

    run_parallel_research(run_id, household_id, session_id)
