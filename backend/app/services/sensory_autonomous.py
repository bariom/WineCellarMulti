"""An OpenAI Responses tool loop with server evidence feedback and bounded spending.

Tools have no database write access. Provider output/history stays in memory;
only the checked proposal, aggregate costs and non-sensitive step metadata persist.
"""

import json
from decimal import Decimal

from fastapi import HTTPException
from pydantic import ValidationError
from sqlalchemy.orm import Session

from app.api.deps import CurrentContext
from app.core.config import settings
from app.models import Wine
from app.prompts.sensory_autonomous import wine_sensory_autonomous_prompt
from app.schemas.sensory_agent import AgentStep, CompleteResearchOutput, SensoryResearchResult
from app.services.openai_client import OpenAIResponse, TokenUsage
from app.services.score_sources import DocumentText, read_public_document

MAX_TURNS = 8
MAX_SEARCH_CALLS = 8
MAX_DOCUMENTS = 12
MAX_HISTORY_CHARS = 180_000
MIN_OUTPUT = 2048
MAX_OUTPUT = 6000


def tools() -> list[dict]:
    return [
        {
            "type": "function",
            "name": "read_wine_source",
            "description": "Read a public source URL discovered in this run's web search. "
            "Returns actual server-readable text; blocked pages are not evidence.",
            "strict": True,
            "parameters": {
                "type": "object",
                "properties": {"url": {"type": "string"}},
                "required": ["url"],
                "additionalProperties": False,
            },
        },
        {
            "type": "function",
            "name": "review_wine_profile",
            "description": "Check a CompleteResearchOutput against the sources you read. "
            "Returns verified identity, trait support, conflicts and failed checks. "
            "Repair failures or leave gaps, then return your final profile. "
            "Does not save wine data.",
            "strict": True,
            "parameters": CompleteResearchOutput.model_json_schema(),
        },
    ]


def prompt_and_schema(wine: Wine, context: CurrentContext):
    from app.services.sensory_agent import research_wine_context

    return wine_sensory_autonomous_prompt(
        wine_context=research_wine_context(wine), locale=context.user.locale
    ), {"name": "wine_sensory_autonomous", "schema": CompleteResearchOutput.model_json_schema()}


def call_ceiling(db, context, provider, prompt, schema, history, output_tokens, searches):
    from app.api.routes.ai import maximum_billable_cost_usd, reservation_pricing_model

    return maximum_billable_cost_usd(
        user_is_app_admin=context.user.is_app_admin,
        user_has_active_entitlement=context.has_active_entitlement,
        provider_source=provider,
        model=reservation_pricing_model(settings.openai_sensory_agent_model, db),
        input_tokens=max(
            2048,
            (
                len(prompt.system)
                + len(json.dumps(history))
                + len(json.dumps(schema))
                + len(json.dumps(tools()))
            )
            // 2,
        )
        + (32768 if searches else 0),
        output_tokens=output_tokens,
        web_search_calls=searches,
        db=db,
    )


def minimum_cost(db: Session, context: CurrentContext, wine: Wine, provider: str) -> Decimal:
    prompt, schema = prompt_and_schema(wine, context)
    return call_ceiling(
        db,
        context,
        provider,
        prompt,
        schema,
        [{"role": "user", "content": prompt.user}],
        MIN_OUTPUT,
        2,
    )


class WineResearchTools:
    def __init__(self, wine: Wine, baseline: dict):
        self.wine, self.baseline = wine, baseline
        self.sources: dict[str, dict] = {}
        self.documents: dict[str, DocumentText] = {}
        self.last_review: SensoryResearchResult | None = None

    def read(self, arguments: dict) -> dict:
        from app.services.sensory_agent import public_source_url

        url = public_source_url(str(arguments.get("url") or ""))
        if not url or url not in self.sources:
            return {"error": "url_not_discovered_in_this_research"}
        if url not in self.documents:
            if len(self.documents) >= MAX_DOCUMENTS:
                return {"error": "document_limit"}
            self.documents[url] = read_public_document(url, allow_pdf=True)
        document = self.documents[url]
        text = " ".join(document.text.split())
        return {
            "url": url,
            "status": document.status,
            "http_status": document.http_status,
            "text": text[:24000],
            "truncated": len(text) > 24000,
        }

    def review(self, arguments: dict) -> dict:
        from app.services.sensory_agent import proposal_from_response

        try:
            output = CompleteResearchOutput.model_validate(arguments)
        except (ValidationError, ValueError, TypeError):
            return {"error": "invalid_profile_schema", "instruction": "Use CompleteResearchOutput."}
        response = OpenAIResponse(
            text=output.model_dump_json(),
            usage=TokenUsage(),
            web_sources=tuple(self.sources.values()),
        )
        # Supplying the cache prevents the verifier from fetching documents the
        # agent has not read and inspected through its explicit tool.
        pages = {
            url: doc.text if doc.status == "readable" else "" for url, doc in self.documents.items()
        }
        checked = proposal_from_response(
            self.wine,
            response,
            self.baseline,
            prompt_version="12",
            source_texts=pages,
        )
        for url, doc in self.documents.items():
            if url in checked.source_checks:
                checked.source_checks[url].status = doc.status
                checked.source_checks[url].http_status = doc.http_status
        self.last_review = checked
        return {
            "identity_confirmed": checked.identity_confirmed,
            "vintage_confirmed": checked.vintage_confirmed,
            "traits": {
                key: {
                    "value": item.value,
                    "support": item.sensory_support,
                    "issue": item.issue,
                    "confidence": item.confidence,
                    "range": [item.lower, item.upper],
                }
                for key, item in checked.complete_profile.items()
            },
            "warnings": checked.warnings,
            "source_checks": {
                url: check.model_dump() for url, check in checked.source_checks.items()
            },
            "instruction": "Repair failed quotations/attribution using actual read text. "
            "Preserve conflicts and leave unsupported traits null; "
            "do not increase confidence yourself.",
        }

    def invoke(self, name: str, arguments: str) -> dict:
        try:
            parsed = json.loads(arguments)
            if not isinstance(parsed, dict):
                return {"error": "invalid_tool_arguments"}
            if name == "read_wine_source":
                return self.read(parsed)
            if name == "review_wine_profile":
                return self.review(parsed)
            return {"error": "unknown_tool"}
        except (ValueError, TypeError):
            return {"error": "invalid_tool_arguments"}


def research_autonomously(
    db: Session, context: CurrentContext, wine: Wine, budget: Decimal
) -> SensoryResearchResult | None:
    from app.api.routes.ai import (
        create_ai_response,
        get_or_create_user_ai_settings,
        record_ai_audit,
        select_ai_provider,
        web_search_tool_cost_usd,
    )
    from app.services.sensory_agent import (
        describe_checked_result,
        public_source_url,
        worker_context,
    )
    from app.services.taste_profiles import sensory_profile_for_wine

    if wine.household_id != context.household.id:
        raise PermissionError("Wine is outside the active household")
    profile = sensory_profile_for_wine(db, wine)
    runtime = WineResearchTools(wine, dict(profile.dimensions) if profile else {})
    prompt, schema = prompt_and_schema(wine, context)
    history = [{"role": "user", "content": prompt.user}]
    user_settings = get_or_create_user_ai_settings(db, context)
    provider, _ = select_ai_provider(db, context, user_settings)
    cost, searches = Decimal("0"), 0
    last_model = settings.openai_sensory_agent_model
    steps: list[AgentStep] = []
    stop_reason = "agent_step_limit"
    for turn in range(MAX_TURNS):
        try:
            context = worker_context(db, context.household.id, context.user.id, context.session.id)
        except (PermissionError, HTTPException):
            stop_reason = "agent_authorization_revoked"
            break
        if len(json.dumps(history)) > MAX_HISTORY_CHARS:
            stop_reason = "agent_context_limit"
            break
        history.append(
            {
                "role": "user",
                "content": json.dumps(
                    {
                        "runtime_limits": {
                            "remaining_provider_turns": MAX_TURNS - turn,
                            "remaining_web_calls": MAX_SEARCH_CALLS - searches,
                            "remaining_budget_usd": str(max(Decimal("0"), budget - cost)),
                        },
                    }
                ),
            }
        )
        # Once searches run out, the agent can still read and review found sources.
        search_limit = min(2, MAX_SEARCH_CALLS - searches)
        remaining = budget - cost
        output_limit = MAX_OUTPUT
        while (
            output_limit > MIN_OUTPUT
            and call_ceiling(
                db, context, provider, prompt, schema, history, output_limit, search_limit
            )
            > remaining
        ):
            output_limit = max(MIN_OUTPUT, output_limit - 512)
        if (
            call_ceiling(db, context, provider, prompt, schema, history, output_limit, search_limit)
            > remaining
        ):
            # Finalization may fit without another search allowance.
            search_limit = 0
            if (
                call_ceiling(db, context, provider, prompt, schema, history, output_limit, 0)
                > remaining
            ):
                stop_reason = "agent_budget_limit"
                break
        try:
            response, provider = create_ai_response(
                db,
                context,
                user_settings,
                model=settings.openai_sensory_agent_model,
                system_prompt=prompt.system,
                user_prompt=prompt.user,
                json_schema=schema,
                web_search=search_limit > 0,
                web_search_use_default_location=False,
                web_search_context_size="medium",
                max_tool_calls=search_limit or None,
                max_output_tokens=output_limit,
                reasoning_effort="medium",
                task_type="sensory_autonomous",
                timeout_seconds=240,
                agent_tools=tools(),
                agent_history=history,
            )
        except Exception:
            stop_reason = "agent_provider_failed"
            break
        cost += response.charged_cost_usd
        last_model = response.model or settings.openai_sensory_agent_model
        searches += response.web_search_calls
        record_ai_audit(
            db,
            context,
            entity_type="wine",
            entity_id=wine.id,
            feature=prompt.id,
            model=response.model or settings.openai_sensory_agent_model,
            summary=f"Autonomous sensory research v{prompt.version}: step {turn + 1}",
            usage=response.usage,
            provider_source=provider,
            sources=list(response.web_sources),
            extra_cost_usd=web_search_tool_cost_usd(response.web_search_calls),
        )
        for source in response.web_sources:
            if url := public_source_url(source.get("url", "")):
                runtime.sources[url] = {"url": url, "title": source.get("title", "")[:200]}
        calls = [item for item in response.agent_output if item.get("type") == "function_call"]
        history.extend(response.agent_output)
        steps.append(
            AgentStep(
                turn=turn + 1,
                web_search_calls=response.web_search_calls,
                cost_usd=response.charged_cost_usd,
                tools=[str(call.get("name", "")) for call in calls][:8],
            )
        )
        if response.incomplete:
            # Usage must be billed even when the provider exhausted its output
            # limit; do not execute partial arguments or refund a paid response.
            stop_reason = "agent_response_incomplete"
            break
        if calls:
            for call in calls[:8]:
                feedback = runtime.invoke(str(call.get("name", "")), str(call.get("arguments", "")))
                history.append(
                    {
                        "type": "function_call_output",
                        "call_id": call.get("call_id", ""),
                        "output": json.dumps(feedback, ensure_ascii=False),
                    }
                )
            if len(calls) > 8:
                stop_reason = "agent_tool_limit"
                break
            continue
        if response.text:
            feedback = runtime.invoke("review_wine_profile", response.text)
            if (
                "error" not in feedback
                and runtime.last_review
                and runtime.last_review.identity_confirmed
            ):
                stop_reason = ""
                break
            history.append({"role": "user", "content": json.dumps(feedback, ensure_ascii=False)})
    if not steps and stop_reason == "agent_budget_limit":
        return None
    result = runtime.last_review or SensoryResearchResult(
        wine_id=wine.id,
        identity_id=wine.shared_identity_id,
        name=wine.name,
        producer=wine.producer,
        vintage=wine.vintage,
        prompt_version="12",
        status="failed",
        issue="no_verified_sources",
        baseline=runtime.baseline,
    )
    result = replace_cost_and_baseline(result, cost, searches, steps, profile)
    result.model = last_model
    if stop_reason:
        result.warnings.append(stop_reason)
    return describe_checked_result(result, context.user.locale)


def replace_cost_and_baseline(result, cost, searches, steps, profile):
    result.cost_usd, result.web_search_calls, result.agent_steps = cost, searches, steps
    if profile:
        result.baseline_source, result.baseline_validated = profile.source, profile.validated
        result.baseline_confidence = profile.confidence
    return result
