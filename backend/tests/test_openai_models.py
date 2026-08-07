from __future__ import annotations

from io import BytesIO
import json
import logging
from decimal import Decimal
from types import SimpleNamespace
import urllib.error
from uuid import uuid4

from fastapi import HTTPException
import pytest

from app.core.config import settings
from app.api.routes.ai import available_model_options, clean_buying_recommendations, clean_recommendation_vintage, compare_wine_context, estimate_cost_usd, is_disallowed_buying_source, normalize_user_ai_models, pairing_wine_context, pairing_wine_is_in_ideal_window, select_pairing_candidates, web_search_tool_cost_usd, wine_market_context, wishlist_advice_context, wishlist_market_context
from app.services.ai_models import parameters_for_model, reasoning_effort_for_request, select_ai_model
from app.services.openai_client import TokenUsage, create_response, response_body


class FakeResponse:
    def __init__(self, payload: dict, request_id: str = "req_test") -> None:
        self.payload = payload
        self.headers = {"x-request-id": request_id}

    def __enter__(self):
        return self

    def __exit__(self, *_args):
        return False

    def read(self) -> bytes:
        return json.dumps(self.payload).encode("utf-8")


def http_error(status_code: int, error: dict) -> urllib.error.HTTPError:
    return urllib.error.HTTPError(
        url="https://api.openai.com/v1/responses",
        code=status_code,
        msg="error",
        hdrs={},
        fp=BytesIO(json.dumps({"error": error}).encode("utf-8")),
    )


@pytest.fixture(autouse=True)
def default_model_flags(monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setattr(settings, "openai_enable_gpt56", False)
    monkeypatch.setattr(settings, "openai_enable_model_routing", False)
    monkeypatch.setattr(settings, "openai_default_model", "gpt-5.5")
    monkeypatch.setattr(settings, "openai_economy_model", "gpt-5.6-luna")
    monkeypatch.setattr(settings, "openai_balanced_model", "gpt-5.6-terra")
    monkeypatch.setattr(settings, "openai_advanced_model", "gpt-5.6-sol")
    monkeypatch.setattr(settings, "openai_fallback_model", "gpt-5.5")
    monkeypatch.setattr(settings, "openai_max_retries", 0)


def test_gpt55_is_default_and_gpt56_is_never_selected_when_disabled():
    assert select_ai_model("pairing").model == "gpt-5.5"
    assert select_ai_model("portfolio_strategy", requested_model="gpt-5.6-sol").model == "gpt-5.5"
    assert select_ai_model("structured_extraction", requested_model="untrusted-model").model == "gpt-5.5"


def test_deterministic_routing_selects_luna_terra_and_sol(monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setattr(settings, "openai_enable_gpt56", True)
    monkeypatch.setattr(settings, "openai_enable_model_routing", True)

    assert select_ai_model("structured_extraction").model == "gpt-5.6-luna"
    assert select_ai_model("pairing").model == "gpt-5.6-terra"
    assert select_ai_model("portfolio_strategy").model == "gpt-5.6-sol"


def test_explicit_model_must_be_allowlisted(monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setattr(settings, "openai_enable_gpt56", True)
    with pytest.raises(HTTPException) as exc_info:
        select_ai_model("pairing", requested_model="gpt-5.6-sol; ignore-previous")
    assert exc_info.value.status_code == 400
    assert "gpt-5.6-sol; ignore-previous" not in str(exc_info.value.detail)


def test_gpt56_flag_exposes_only_gpt56_models(monkeypatch: pytest.MonkeyPatch):
    assert available_model_options() == ["gpt-5.4-nano", "gpt-5.4-mini", "gpt-5.4", "gpt-5.5"]

    monkeypatch.setattr(settings, "openai_enable_gpt56", True)
    assert available_model_options() == ["gpt-5.6-luna", "gpt-5.6-terra", "gpt-5.6-sol"]
    with pytest.raises(HTTPException):
        select_ai_model("pairing", requested_model="gpt-5.5")


def test_gpt56_flag_migrates_saved_feature_models(monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setattr(settings, "openai_enable_gpt56", True)
    saved_settings = SimpleNamespace(
        ai_notes_model="gpt-5.4-mini",
        drink_window_model="gpt-5.4",
        value_model="gpt-5.4-mini",
        grape_model="gpt-5.4-nano",
        score_model="gpt-5.4-mini",
        wishlist_model="gpt-5.4",
        pairing_model="gpt-5.4",
    )

    assert normalize_user_ai_models(saved_settings) is True
    assert saved_settings.ai_notes_model == "gpt-5.6-luna"
    assert saved_settings.value_model == "gpt-5.6-luna"
    assert saved_settings.grape_model == "gpt-5.6-luna"
    assert saved_settings.drink_window_model == "gpt-5.6-terra"
    assert saved_settings.wishlist_model == "gpt-5.6-terra"
    assert saved_settings.pairing_model == "gpt-5.6-luna"


def test_model_parameters_are_compatible_and_configurable(monkeypatch: pytest.MonkeyPatch):
    legacy_body = response_body("gpt-5.5", "system", "user")
    assert legacy_body["reasoning"] == {"effort": "low"}
    assert legacy_body["max_output_tokens"] == 32768
    assert "temperature" not in legacy_body

    monkeypatch.setattr(settings, "openai_economy_max_output_tokens", 2048)
    luna_body = response_body("gpt-5.6-luna", "system", "user")
    assert luna_body["reasoning"] == {"effort": "low"}
    assert luna_body["max_output_tokens"] == 2048
    assert "temperature" not in luna_body
    assert parameters_for_model("gpt-5.6-terra").reasoning_effort == "medium"
    assert parameters_for_model("gpt-5.6-sol").reasoning_effort == "high"


def test_reasoning_effort_follows_task_instead_of_model_role():
    assert reasoning_effort_for_request("gpt-5.6-luna", "drink_window") == "medium"
    assert reasoning_effort_for_request("gpt-5.6-terra", "wine_full_enrichment") == "medium"
    assert reasoning_effort_for_request("gpt-5.6-sol", "grape_inference") == "low"
    assert reasoning_effort_for_request("gpt-5.6-sol", "pairing") == "medium"
    assert reasoning_effort_for_request("gpt-5.6-terra", "portfolio_strategy") == "high"


def test_reasoning_effort_priority_is_explicit_then_complexity_then_task():
    assert reasoning_effort_for_request("gpt-5.6-sol", "portfolio_strategy", explicit_effort="low") == "low"
    assert reasoning_effort_for_request("gpt-5.6-luna", "grape_inference", complexity="advanced") == "high"
    assert reasoning_effort_for_request("gpt-5.6-terra", "unknown_task") == "medium"


def test_create_response_sends_automatic_task_effort(monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setattr(settings, "openai_enable_gpt56", True)
    captured_body: dict = {}

    def fake_urlopen(request, timeout):
        captured_body.update(json.loads(request.data.decode("utf-8")))
        return FakeResponse({"output_text": "ok", "usage": {}})

    monkeypatch.setattr("app.services.openai_client.urllib.request.urlopen", fake_urlopen)
    response = create_response("gpt-5.6-sol", "system", "user", api_key="sk-test", task_type="grape_inference")

    assert captured_body["reasoning"] == {"effort": "low"}
    assert response.reasoning_effort == "low"
    assert response.task_type == "grape_inference"


def test_create_response_rejects_incomplete_structured_output(monkeypatch: pytest.MonkeyPatch):
    def fake_urlopen(request, timeout):
        return FakeResponse(
            {
                "status": "incomplete",
                "incomplete_details": {"reason": "max_output_tokens"},
                "output_text": '{"feedback":"truncated',
                "usage": {},
            }
        )

    monkeypatch.setattr("app.services.openai_client.urllib.request.urlopen", fake_urlopen)

    with pytest.raises(HTTPException) as exc_info:
        create_response("gpt-5.6-luna", "system", "user", api_key="sk-test")

    assert exc_info.value.status_code == 502
    assert exc_info.value.detail == "AI response was incomplete because it reached the output limit"


def test_response_body_allows_cost_controls_for_web_search():
    body = response_body(
        "gpt-5.6-terra",
        "system",
        "user",
        web_search=True,
        web_search_context_size="low",
        reasoning_effort="low",
        max_output_tokens=6000,
        max_tool_calls=4,
    )

    assert body["reasoning"] == {"effort": "low"}
    assert body["max_output_tokens"] == 6000
    assert body["max_tool_calls"] == 4
    assert body["tools"][0]["search_context_size"] == "low"


def test_output_limit_cannot_be_disabled_or_raised_above_safety_ceiling(monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setattr(settings, "openai_legacy_max_output_tokens", 0)
    assert response_body("gpt-5.5", "system", "user")["max_output_tokens"] == 32768

    monkeypatch.setattr(settings, "openai_legacy_max_output_tokens", 128000)
    assert response_body("gpt-5.5", "system", "user")["max_output_tokens"] == 32768


def test_gpt55_snapshot_cost_uses_official_base_model_pricing():
    usage = TokenUsage(input_tokens=9348, output_tokens=128000, total_tokens=137348)
    assert estimate_cost_usd("gpt-5.5-2026-04-23", usage) == Decimal("3.886740")


@pytest.mark.parametrize(
    ("model", "expected_cost"),
    [
        ("gpt-5.6-luna", Decimal("0.000404")),
        ("gpt-5.6-terra", Decimal("0.004040")),
    ],
)
def test_gpt56_cost_uses_current_official_pricing(model: str, expected_cost: Decimal):
    usage = TokenUsage(input_tokens=1000, cached_input_tokens=200, output_tokens=200, total_tokens=1200)
    assert estimate_cost_usd(model, usage) == expected_cost


def test_unknown_model_cost_fails_closed():
    with pytest.raises(HTTPException) as exc_info:
        estimate_cost_usd("gpt-future-unpriced", TokenUsage(input_tokens=1000, output_tokens=1000, total_tokens=2000))

    assert exc_info.value.status_code == 503
    assert "pricing is not configured" in exc_info.value.detail


def test_model_price_book_can_add_new_models_and_override_existing_rates(monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setattr(
        settings,
        "openai_model_pricing_usd_per_million_tokens",
        '{"gpt-future":{"input":"1.25","cached_input":"0.125","output":"10"},"gpt-5.5":{"input":"1","cached_input":"0.1","output":"2"}}',
    )
    usage = TokenUsage(input_tokens=1000, cached_input_tokens=200, output_tokens=200, total_tokens=1200)

    assert estimate_cost_usd("gpt-future-2026-08-04", usage) == Decimal("0.003025")
    assert estimate_cost_usd("gpt-5.5", usage) == Decimal("0.001220")


def test_invalid_model_price_book_fails_closed(monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setattr(settings, "openai_model_pricing_usd_per_million_tokens", '{"gpt-future":{"input":"1"}}')

    with pytest.raises(HTTPException) as exc_info:
        estimate_cost_usd("gpt-5.5", TokenUsage(input_tokens=1000, output_tokens=1000, total_tokens=2000))

    assert exc_info.value.status_code == 503
    assert "pricing configuration is invalid" in exc_info.value.detail


def test_database_price_book_takes_precedence_over_environment(monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setattr(
        settings,
        "openai_model_pricing_usd_per_million_tokens",
        '{"gpt-5.5":{"input":"1","cached_input":"0.1","output":"2"}}',
    )
    db = SimpleNamespace(get=lambda *_args: SimpleNamespace(
        price_book_json='{"gpt-5.5":{"input":"2","cached_input":"0.2","output":"4"}}'
    ))

    assert estimate_cost_usd("gpt-5.5", TokenUsage(input_tokens=1000, output_tokens=1000, total_tokens=2000), db) == Decimal("0.006000")


def test_web_search_has_non_zero_default_cost(monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setattr(settings, "openai_web_search_tool_cost_usd", "0.01")
    assert web_search_tool_cost_usd(3) == Decimal("0.030000")


def test_pairing_candidates_are_compact_diverse_and_limited_to_25():
    wine_types = ["White", "Red", "Sparkling", "Rose", "Sweet"]
    wines = [
        SimpleNamespace(
            id=uuid4(), name=f"Wine {index}", producer="Producer", vintage="2022", type=wine_types[index % len(wine_types)],
            region="Region", appellation="Appellation", current_value=20, price=20, currency="CHF",
            drink_from=2024, drink_peak_from=2025, drink_peak_to=2027, drink_to=2030,
            grapes=[{"name": "Chardonnay"}, {"name": "Pinot Noir"}, {"name": "Extra grape"}, {"name": "Ignored"}],
            tags=["Dinner", "Ready", "Extra", "Ignored"],
        )
        for index in range(30)
    ]

    selected = select_pairing_candidates(wines)
    compact = pairing_wine_context(selected[0])

    assert len(selected) == 25
    assert {wine.type for wine in selected[:5]} == set(wine_types)
    assert compact["grapes"] == ["Chardonnay", "Pinot Noir", "Extra grape"]
    assert compact["tags"] == ["Dinner", "Ready", "Extra"]
    assert "scores" not in compact


def test_pairing_ideal_window_requires_the_current_year_to_be_in_the_peak_window():
    current_year = 2026
    assert pairing_wine_is_in_ideal_window(SimpleNamespace(drink_peak_from=2024, drink_peak_to=2028), current_year)
    assert not pairing_wine_is_in_ideal_window(SimpleNamespace(drink_peak_from=2027, drink_peak_to=2030), current_year)
    assert not pairing_wine_is_in_ideal_window(SimpleNamespace(drink_peak_from=None, drink_peak_to=None), current_year)


def test_task_contexts_exclude_unrelated_cellar_and_generated_data():
    wine = SimpleNamespace(
        name="Test Wine", producer="Test Producer", vintage="2020", type="Red", format="Bottle (750ml)",
        region="Ticino", appellation="Ticino DOC", current_value=42, currency="CHF", drink_from=2025,
        drink_to=2030, quantity=9, price=12, scores=[{"critic": "Critic", "score": "95"}],
        grapes=[{"name": "Merlot"}], tags=["Private"], notes="Private notes", ai_notes="Generated notes",
        ai_value_notes="Generated value notes", rating="95", status="Delivered",
    )
    item = SimpleNamespace(
        name="Wanted Wine", producer="Wanted Producer", vintage="2021", format="Bottle (750ml)", type="Red",
        region="Ticino", appellation="Ticino DOC", target_price=50, currency="CHF", priority="High",
        purpose="Cellar", status="Watch", merchant="Private merchant", notes="Private notes",
        ai_context_note="Context", ai_strategy="Generated strategy", ai_purpose_advice="Generated purpose",
    )

    market = wine_market_context(wine)
    comparison = compare_wine_context(wine)
    advice = wishlist_advice_context(item)
    wishlist_market = wishlist_market_context(item)

    assert "Name: Test Wine" in market
    assert "Scores:" not in market and "AI notes:" not in market and "Purchase price:" not in market
    assert "Drink window: 2025-2030" in comparison
    assert "Grapes:" not in comparison and "AI value notes:" not in comparison
    assert "AI context note: Context" in advice
    assert "AI strategy:" not in advice and "Merchant:" not in advice
    assert "Target price: CHF 50" in wishlist_market
    assert "Private notes" not in wishlist_market and "AI context note:" not in wishlist_market


def test_fallback_to_gpt55_happens_once(monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setattr(settings, "openai_enable_gpt56", True)
    bodies: list[dict] = []

    def fake_urlopen(request, timeout):
        assert timeout == 60
        bodies.append(json.loads(request.data.decode("utf-8")))
        if len(bodies) == 1:
            raise http_error(404, {"code": "model_not_found", "message": "model unavailable"})
        return FakeResponse(
            {
                "output_text": "fallback answer",
                "usage": {"input_tokens": 10, "output_tokens": 3, "total_tokens": 13},
            },
        )

    monkeypatch.setattr("app.services.openai_client.urllib.request.urlopen", fake_urlopen)
    response = create_response("gpt-5.6-terra", "secret system prompt", "private user data", api_key="sk-secret")

    assert [body["model"] for body in bodies] == ["gpt-5.6-terra", "gpt-5.5"]
    assert response.model == "gpt-5.5"
    assert response.fallback_occurred is True
    assert response.fallback_reason == "model_not_available"


@pytest.mark.parametrize(
    ("status_code", "error"),
    [
        (400, {"code": "invalid_request_error", "message": "Invalid prompt"}),
        (403, {"code": "content_policy_violation", "message": "Request blocked"}),
    ],
)
def test_non_fallback_error_only_calls_provider_once(
    monkeypatch: pytest.MonkeyPatch,
    status_code: int,
    error: dict,
):
    monkeypatch.setattr(settings, "openai_enable_gpt56", True)
    calls = 0

    def fake_urlopen(_request, timeout):
        nonlocal calls
        calls += 1
        raise http_error(status_code, error)

    monkeypatch.setattr("app.services.openai_client.urllib.request.urlopen", fake_urlopen)
    with pytest.raises(HTTPException) as exc_info:
        create_response("gpt-5.6-sol", "system", "user", api_key="sk-test")
    assert calls == 1
    assert exc_info.value.status_code == 502


def test_logs_include_metrics_but_not_prompts_keys_or_personal_data(
    monkeypatch: pytest.MonkeyPatch,
    caplog: pytest.LogCaptureFixture,
):
    captured_body: dict = {}

    def fake_urlopen(request, timeout):
        captured_body.update(json.loads(request.data.decode("utf-8")))
        return FakeResponse(
            {
                "output_text": "ok",
                "usage": {
                    "input_tokens": 12,
                    "input_tokens_details": {"cached_tokens": 4},
                    "output_tokens": 2,
                    "total_tokens": 14,
                },
            },
            request_id="req_safe",
        )

    monkeypatch.setattr("app.services.openai_client.urllib.request.urlopen", fake_urlopen)
    with caplog.at_level(logging.INFO, logger="app.services.openai_client"):
        response = create_response(
            "gpt-5.6-sol",
            "SYSTEM_PROMPT_SECRET",
            "PERSONAL_DATA_SECRET",
            api_key="sk-super-secret",
        )

    log_text = caplog.text
    assert captured_body["model"] == "gpt-5.5"
    assert response.model == "gpt-5.5"
    assert '"input_tokens":12' in log_text
    assert '"cached_input_tokens":4' in log_text
    assert '"request_id":"req_safe"' in log_text
    assert "SYSTEM_PROMPT_SECRET" not in log_text
    assert "PERSONAL_DATA_SECRET" not in log_text
    assert "sk-super-secret" not in log_text


def test_sommelier_uses_gpt55_with_standard_configuration(monkeypatch: pytest.MonkeyPatch):
    sent_models: list[str] = []

    def fake_urlopen(request, timeout):
        sent_models.append(json.loads(request.data.decode("utf-8"))["model"])
        return FakeResponse({"output_text": "pairing", "usage": {}})

    monkeypatch.setattr("app.services.openai_client.urllib.request.urlopen", fake_urlopen)
    create_response("gpt-5.4", "sommelier", "dish", api_key="sk-test", task_type="pairing")
    assert sent_models == ["gpt-5.5"]


def test_buying_advice_rejects_retired_smood_source():
    assert is_disallowed_buying_source("Enoteca Vinarte Lugano / Smood", "https://example.com/product")
    assert is_disallowed_buying_source("Enoteca", "https://smood.ch/product")
    assert not is_disallowed_buying_source("Enoteca Vinarte", "https://vinarte.example/product")


def test_buying_advice_cleans_unverified_vintage_and_limits_coop_results():
    first_url = "https://coop.example/first"
    second_url = "https://coop.example/second"
    recommendations = clean_buying_recommendations(
        {
            "recommendations": [
                {
                    "name": "First", "producer": "Producer", "vintage": "Non confermata dalla pagina",
                    "merchant": "Coop / Mondovino", "merchant_type": "local_shop", "price": "CHF 35",
                    "currency": "CHF", "availability": "In stock", "delivery_estimate": "Today",
                    "source_url": first_url, "reason": "Reason", "local": True, "confidence": "medium",
                },
                {
                    "name": "Second", "producer": "Producer", "vintage": "2022",
                    "merchant": "Coop / Mondovino", "merchant_type": "local_shop", "price": "CHF 45",
                    "currency": "CHF", "availability": "In stock", "delivery_estimate": "Today",
                    "source_url": second_url, "reason": "Reason", "local": True, "confidence": "medium",
                },
            ],
        },
        {first_url, second_url},
    )
    assert len(recommendations) == 1
    assert recommendations[0].vintage == ""
    assert clean_recommendation_vintage("2022") == "2022"
