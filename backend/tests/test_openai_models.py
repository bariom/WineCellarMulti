from __future__ import annotations

from io import BytesIO
import json
import logging
from types import SimpleNamespace
import urllib.error
from uuid import uuid4

from fastapi import HTTPException
import pytest

from app.core.config import settings
from app.api.routes.ai import available_model_options, clean_buying_recommendations, clean_recommendation_vintage, estimate_cost_usd, is_disallowed_buying_source, normalize_user_ai_models, pairing_wine_context, select_pairing_candidates
from app.services.ai_models import parameters_for_model, select_ai_model
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
        wishlist_model="gpt-5.4",
        pairing_model="gpt-5.4",
    )

    assert normalize_user_ai_models(saved_settings) is True
    assert saved_settings.ai_notes_model == "gpt-5.6-luna"
    assert saved_settings.value_model == "gpt-5.6-luna"
    assert saved_settings.grape_model == "gpt-5.6-luna"
    assert saved_settings.drink_window_model == "gpt-5.6-terra"
    assert saved_settings.wishlist_model == "gpt-5.6-terra"
    assert saved_settings.pairing_model == "gpt-5.6-terra"


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


def test_output_limit_cannot_be_disabled_or_raised_above_safety_ceiling(monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setattr(settings, "openai_legacy_max_output_tokens", 0)
    assert response_body("gpt-5.5", "system", "user")["max_output_tokens"] == 32768

    monkeypatch.setattr(settings, "openai_legacy_max_output_tokens", 128000)
    assert response_body("gpt-5.5", "system", "user")["max_output_tokens"] == 32768


def test_gpt55_snapshot_cost_uses_official_base_model_pricing():
    usage = TokenUsage(input_tokens=9348, output_tokens=128000, total_tokens=137348)
    assert estimate_cost_usd("gpt-5.5-2026-04-23", usage) == pytest.approx(3.886740)


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
