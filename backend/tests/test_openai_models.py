from __future__ import annotations

from io import BytesIO
import json
import logging
import urllib.error

from fastapi import HTTPException
import pytest

from app.core.config import settings
from app.api.routes.ai import available_model_options
from app.services.ai_models import parameters_for_model, select_ai_model
from app.services.openai_client import create_response, response_body


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


def test_model_parameters_are_compatible_and_configurable(monkeypatch: pytest.MonkeyPatch):
    legacy_body = response_body("gpt-5.5", "system", "user")
    assert "reasoning" not in legacy_body
    assert "max_output_tokens" not in legacy_body
    assert "temperature" not in legacy_body

    monkeypatch.setattr(settings, "openai_economy_max_output_tokens", 2048)
    luna_body = response_body("gpt-5.6-luna", "system", "user")
    assert luna_body["reasoning"] == {"effort": "low"}
    assert luna_body["max_output_tokens"] == 2048
    assert "temperature" not in luna_body
    assert parameters_for_model("gpt-5.6-terra").reasoning_effort == "medium"
    assert parameters_for_model("gpt-5.6-sol").reasoning_effort == "high"


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
