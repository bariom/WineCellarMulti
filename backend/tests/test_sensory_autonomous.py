import json
from decimal import Decimal
from types import SimpleNamespace
from uuid import uuid4

import pytest

from app.api.routes import ai
from app.prompts.sensory_autonomous import wine_sensory_autonomous_prompt
from app.schemas.sensory_agent import CompleteResearchOutput
from app.services import sensory_autonomous as autonomous
from app.services.openai_client import OpenAIResponse, TokenUsage, create_response, response_body
from app.services.score_sources import DocumentText
from app.services.taste_profiles import SENSORY_DIMENSIONS

URL = "https://producer.example/testamatta-2018"
HEADING = "Bibi Graetz Testamatta 2018"
PAGE = HEADING + " Full-bodied. Light mineral notes."


def profile():
    evidence = {
        "source_url": URL,
        "excerpt": "Full-bodied",
        "attribution_excerpt": HEADING,
        "scope": "exact_vintage",
        "vintage": "2018",
        "published_year": None,
        "publisher": "Bibi Graetz",
        "role": "producer",
    }
    return {
        "name": "Testamatta",
        "producer": "Bibi Graetz",
        "vintage": "2018",
        "identity_confirmed": True,
        "vintage_confirmed": True,
        "identity_evidence": evidence | {"excerpt": HEADING},
        "summary": "Corpo pieno; le altre intensità restano da verificare.",
        "limitations": "Una sola fonte, nessuna accuratezza misurata.",
        "dimensions": {
            key: (evidence | {"value": 0.75, "basis": "inferred", "intensity_supported": True})
            if key == "body"
            else None
            for key in SENSORY_DIMENSIONS
        },
        "comparisons": [],
        "references": [],
        "aromas": [],
    }


@pytest.fixture
def setup(monkeypatch):
    household = uuid4()
    wine = SimpleNamespace(
        id=uuid4(),
        household_id=household,
        shared_identity_id=None,
        name="Testamatta",
        producer="Bibi Graetz",
        vintage="2018",
        type="Red",
        region="Tuscany",
        appellation="Toscana IGT",
        grapes=["Sangiovese"],
    )
    context = SimpleNamespace(
        household=SimpleNamespace(id=household),
        user=SimpleNamespace(id=uuid4(), locale="it"),
        session=SimpleNamespace(id=uuid4()),
    )
    monkeypatch.setattr("app.services.sensory_agent.worker_context", lambda *args: context)
    monkeypatch.setattr("app.services.taste_profiles.sensory_profile_for_wine", lambda *args: None)
    monkeypatch.setattr(ai, "get_or_create_user_ai_settings", lambda *args: object())
    monkeypatch.setattr(ai, "select_ai_provider", lambda *args: ("application", "unused"))
    monkeypatch.setattr(ai, "record_ai_audit", lambda *args, **kwargs: None)
    monkeypatch.setattr(autonomous, "call_ceiling", lambda *args: Decimal("0.1"))
    monkeypatch.setattr(
        autonomous,
        "read_public_document",
        lambda *args, **kwargs: DocumentText(text=PAGE, status="readable"),
    )
    return wine, context


def reply(*, text="", calls=(), searches=0):
    return OpenAIResponse(
        text=text,
        usage=TokenUsage(),
        charged_cost_usd=Decimal("0.02"),
        web_search_calls=searches,
        web_sources=({"url": URL, "title": HEADING},),
        agent_output=tuple(calls),
    ), "application"


def call(name, args):
    return {
        "type": "function_call",
        "name": name,
        "arguments": json.dumps(args),
        "call_id": name,
        "id": "fc_" + name,
    }


def test_native_tool_loop_reads_reviews_and_preserves_partial_checked_profile(setup, monkeypatch):
    wine, context = setup
    responses = iter(
        [
            reply(calls=[call("read_wine_source", {"url": URL})], searches=1),
            reply(calls=[call("review_wine_profile", profile())]),
            reply(text=json.dumps(profile())),
        ]
    )
    histories = []

    def respond(*args, **kwargs):
        histories.append(list(kwargs["agent_history"]))
        return next(responses)

    monkeypatch.setattr(ai, "create_ai_response", respond)
    result = autonomous.research_autonomously(None, context, wine, Decimal("1"))
    assert result.identity_confirmed and result.vintage_confirmed
    assert result.complete_profile["body"].value == 0.75
    assert result.complete_profile["fruit"].value is None
    assert result.prompt_version == "12" and result.status == "incomplete"
    assert result.cost_usd == Decimal("0.06") and result.web_search_calls == 1
    assert len(result.agent_steps) == 3
    assert any(item.get("type") == "function_call_output" for item in histories[1])
    feedback = [item for item in histories[2] if item.get("type") == "function_call_output"]
    assert "identity_confirmed" in feedback[-1]["output"]
    limits = json.loads(histories[2][-1]["content"])["runtime_limits"]
    assert limits["remaining_provider_turns"] == autonomous.MAX_TURNS - 2
    assert limits["remaining_web_calls"] == autonomous.MAX_SEARCH_CALLS - 1
    assert Decimal(limits["remaining_budget_usd"]) == Decimal("0.96")


def test_tools_reject_undiscovered_urls_and_unread_evidence(setup):
    wine, _ = setup
    runtime = autonomous.WineResearchTools(wine, {})
    assert runtime.read({"url": URL})["error"] == "url_not_discovered_in_this_research"
    runtime.sources[URL] = {"url": URL, "title": HEADING}
    feedback = runtime.review(profile())
    assert not feedback["identity_confirmed"]
    assert runtime.last_review.complete_profile["body"].value is None
    assert runtime.invoke("delete_wine", "{}")["error"] == "unknown_tool"
    assert runtime.invoke("read_wine_source", "[]")["error"] == "invalid_tool_arguments"
    assert runtime.review({"name": "invented"})["error"] == "invalid_profile_schema"


def test_feedback_allows_repair_of_a_fabricated_quote(setup):
    wine, _ = setup
    runtime = autonomous.WineResearchTools(wine, {})
    runtime.sources[URL] = {"url": URL, "title": HEADING}
    runtime.read({"url": URL})
    broken = profile()
    broken["dimensions"]["body"]["excerpt"] = "Light-bodied"
    feedback = runtime.review(broken)
    assert feedback["traits"]["body"]["value"] is None
    assert runtime.review(profile())["traits"]["body"]["value"] == 0.75


def test_budget_stops_before_provider_and_paid_review_survives(setup, monkeypatch):
    wine, context = setup
    monkeypatch.setattr(
        ai, "create_ai_response", lambda *args, **kwargs: pytest.fail("Unaffordable")
    )
    assert autonomous.research_autonomously(None, context, wine, Decimal("0.05")) is None
    responses = iter(
        [
            reply(calls=[call("read_wine_source", {"url": URL})]),
            reply(calls=[call("review_wine_profile", profile())]),
        ]
    )
    monkeypatch.setattr(ai, "create_ai_response", lambda *args, **kwargs: next(responses))
    result = autonomous.research_autonomously(None, context, wine, Decimal("0.13"))
    assert result.cost_usd == Decimal("0.04")
    assert result.complete_profile["body"].value == 0.75
    assert "agent_budget_limit" in result.warnings


def test_provider_failure_and_other_household_are_not_silent_budget_failures(setup, monkeypatch):
    wine, context = setup
    monkeypatch.setattr(
        ai,
        "create_ai_response",
        lambda *args, **kwargs: (_ for _ in ()).throw(RuntimeError("private")),
    )
    result = autonomous.research_autonomously(None, context, wine, Decimal("1"))
    assert result.status == "failed" and "agent_provider_failed" in result.warnings
    assert "private" not in result.model_dump_json()
    wine.household_id = uuid4()
    with pytest.raises(PermissionError):
        autonomous.research_autonomously(None, context, wine, Decimal("1"))


@pytest.mark.parametrize("locale,language", [("it", "Italian"), ("en", "English")])
def test_autonomous_prompt_and_strict_tools(locale, language):
    prompt = wine_sensory_autonomous_prompt(wine_context={"vintage": "2018"}, locale=locale)
    assert prompt.id == "wine.sensory_autonomous" and prompt.version == "2"
    assert language in prompt.system and '"2018"' in prompt.user
    for required in ["untrusted", "null", "review_wine_profile", "independent", "not complexity"]:
        assert required in prompt.system
    assert CompleteResearchOutput.model_validate(profile())
    assert all(tool["strict"] for tool in autonomous.tools())


def test_response_transport_accepts_function_only_output_and_preserves_reasoning(monkeypatch):
    native = [
        {"type": "reasoning", "id": "rs_test", "encrypted_content": "opaque", "summary": []},
        call("read_wine_source", {"url": URL}),
    ]
    monkeypatch.setattr(
        "app.services.openai_client.send_response_request",
        lambda *args, **kwargs: ({"output": native, "usage": {}}, "req_test"),
    )
    response = create_response(
        "gpt-5.5", "system", "user", api_key="test", agent_tools=autonomous.tools()
    )
    assert not response.text and response.agent_output == tuple(native)
    assert "opaque" not in repr(response)
    history = [
        *native,
        {"type": "function_call_output", "call_id": "read_wine_source", "output": "{}"},
    ]
    body = response_body(
        "gpt-5.5",
        "system",
        "user",
        web_search=True,
        agent_tools=autonomous.tools(),
        agent_history=history,
    )
    assert body["tool_choice"] == "auto" and not body["store"]
    assert body["input"][1:] == history
    assert "reasoning.encrypted_content" in body["include"]
    assert body["tools"][0]["type"] == "web_search"


def test_incomplete_agent_response_returns_usage_for_billing(monkeypatch):
    monkeypatch.setattr(
        "app.services.openai_client.send_response_request",
        lambda *args, **kwargs: (
            {
                "status": "incomplete",
                "output": [],
                "usage": {"input_tokens": 100, "output_tokens": 2048},
            },
            "req_test",
        ),
    )
    response = create_response(
        "gpt-5.5", "system", "user", api_key="test", agent_tools=autonomous.tools()
    )
    assert response.incomplete and response.usage.output_tokens == 2048


def test_step_limit_accounts_for_malformed_outputs_without_creating_evidence(setup, monkeypatch):
    wine, context = setup
    monkeypatch.setattr(ai, "create_ai_response", lambda *args, **kwargs: reply(text="not JSON"))
    result = autonomous.research_autonomously(None, context, wine, Decimal("1"))
    assert result.status == "failed" and not result.identity_confirmed
    assert len(result.agent_steps) == autonomous.MAX_TURNS
    assert result.cost_usd == Decimal("0.02") * autonomous.MAX_TURNS
    assert "agent_step_limit" in result.warnings


def test_unreadable_document_remains_unverified(setup, monkeypatch):
    wine, _ = setup
    runtime = autonomous.WineResearchTools(wine, {})
    runtime.sources[URL] = {"url": URL, "title": HEADING}
    monkeypatch.setattr(
        autonomous,
        "read_public_document",
        lambda *args, **kwargs: DocumentText(status="cloudflare_challenge", http_status=403),
    )
    assert runtime.read({"url": URL})["status"] == "cloudflare_challenge"
    feedback = runtime.review(profile())
    assert not feedback["identity_confirmed"]
    assert feedback["source_checks"][URL]["http_status"] == 403


def test_revoked_session_blocks_next_provider_step(setup, monkeypatch):
    wine, context = setup
    monkeypatch.setattr(
        "app.services.sensory_agent.worker_context",
        lambda *args: (_ for _ in ()).throw(PermissionError()),
    )
    monkeypatch.setattr(ai, "create_ai_response", lambda *args, **kwargs: pytest.fail("Revoked"))
    result = autonomous.research_autonomously(None, context, wine, Decimal("1"))
    assert result.cost_usd == 0 and "agent_authorization_revoked" in result.warnings


def test_autonomous_model_selection_is_isolated_from_existing_features(monkeypatch):
    from app.services.ai_models import LEGACY_MODEL, select_ai_model

    monkeypatch.setattr(autonomous.settings, "openai_enable_gpt56", False)
    monkeypatch.setattr(autonomous.settings, "openai_sensory_agent_model", "gpt-6.1-sol")
    assert (
        select_ai_model("sensory_autonomous", requested_model="gpt-6.1-sol").model == "gpt-6.1-sol"
    )
    assert select_ai_model("sensory_profile", requested_model="gpt-6.1-sol").model == LEGACY_MODEL


@pytest.mark.parametrize("protected", [False, True])
def test_research_entrypoint_adds_assisted_preview_to_autonomous_results(
    setup, monkeypatch, protected
):
    from app.services import sensory_agent as agent

    wine, context = setup
    monkeypatch.setattr(agent.settings, "wine_sensory_research_enabled", True)
    monkeypatch.setattr(agent.settings, "wine_sensory_autonomous_enabled", True)
    runtime = autonomous.WineResearchTools(wine, {"body": 0.64})
    runtime.sources[URL] = {"url": URL, "title": HEADING}
    runtime.read({"url": URL})
    runtime.review(profile())
    checked = runtime.last_review
    checked.baseline_validated = protected
    checked.baseline_source = "manual" if protected else "metadata"
    monkeypatch.setattr(autonomous, "research_autonomously", lambda *args: checked)
    monkeypatch.setattr(agent, "sensory_profile_for_wine", lambda *args: None)
    monkeypatch.setattr(
        "app.services.taste_profiles.infer_sensory_profile",
        lambda *args: ({"body": 0.64}, "metadata", 0.35),
    )
    result = agent.research_wine(None, context, wine, Decimal("1"))
    assert result.application.eligible is not protected
    assert result.application.dimensions["body"].value == (0.64 if protected else 0.75)
