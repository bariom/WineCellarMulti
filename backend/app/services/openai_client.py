from __future__ import annotations

from dataclasses import dataclass
import json
import logging
import time
import urllib.error
import urllib.request
from typing import Any

from fastapi import HTTPException, status

from app.core.config import settings
from app.services.ai_models import (
    LEGACY_MODEL,
    ModelSelection,
    parameters_for_model,
    safe_fallback_model,
    select_ai_model,
)


logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class TokenUsage:
    input_tokens: int = 0
    cached_input_tokens: int = 0
    output_tokens: int = 0
    total_tokens: int = 0


@dataclass(frozen=True)
class OpenAIResponse:
    text: str
    usage: TokenUsage
    web_sources: tuple[dict[str, str], ...] = ()
    web_search_calls: int = 0
    requested_model: str = ""
    model: str = ""
    model_role: str = "legacy"
    fallback_occurred: bool = False
    fallback_reason: str = ""
    request_id: str = ""


@dataclass(frozen=True)
class OpenAITransportError(Exception):
    reason: str
    fallback_allowed: bool


def int_from_payload(value: Any) -> int:
    try:
        return max(int(value or 0), 0)
    except (TypeError, ValueError):
        return 0


def extract_token_usage(payload: dict[str, Any]) -> TokenUsage:
    usage = payload.get("usage")
    if not isinstance(usage, dict):
        return TokenUsage()

    input_tokens = int_from_payload(usage.get("input_tokens") or usage.get("prompt_tokens"))
    output_tokens = int_from_payload(usage.get("output_tokens") or usage.get("completion_tokens"))
    total_tokens = int_from_payload(usage.get("total_tokens"))
    if total_tokens == 0:
        total_tokens = input_tokens + output_tokens

    input_details = usage.get("input_tokens_details") or usage.get("prompt_tokens_details") or {}
    cached_input_tokens = int_from_payload(input_details.get("cached_tokens") if isinstance(input_details, dict) else 0)

    return TokenUsage(
        input_tokens=input_tokens,
        cached_input_tokens=min(cached_input_tokens, input_tokens),
        output_tokens=output_tokens,
        total_tokens=total_tokens,
    )


def extract_response_text(payload: dict[str, Any]) -> str:
    if isinstance(payload.get("output_text"), str):
        return payload["output_text"].strip()
    parts: list[str] = []
    for item in payload.get("output", []):
        if not isinstance(item, dict):
            continue
        for content in item.get("content", []):
            if isinstance(content, dict) and isinstance(content.get("text"), str):
                parts.append(content["text"])
    return "\n".join(parts).strip()


def extract_web_sources(payload: dict[str, Any]) -> tuple[dict[str, str], ...]:
    sources: list[dict[str, str]] = []
    seen_urls: set[str] = set()
    for item in payload.get("output", []):
        if not isinstance(item, dict):
            continue
        action = item.get("action")
        if not isinstance(action, dict):
            continue
        for source in action.get("sources", []):
            if not isinstance(source, dict):
                continue
            url = str(source.get("url") or "").strip()
            if not url or url in seen_urls:
                continue
            seen_urls.add(url)
            sources.append(
                {
                    "url": url,
                    "title": str(source.get("title") or "").strip(),
                },
            )
    return tuple(sources)


def count_web_search_calls(payload: dict[str, Any]) -> int:
    return sum(1 for item in payload.get("output", []) if isinstance(item, dict) and item.get("type") == "web_search_call")


def parse_json_response(text: str) -> dict[str, Any]:
    cleaned = text.strip()
    if cleaned.startswith("```"):
        cleaned = cleaned.strip("`")
        if cleaned.lower().startswith("json"):
            cleaned = cleaned[4:]
    try:
        parsed = json.loads(cleaned)
    except json.JSONDecodeError as exc:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail="AI returned invalid JSON") from exc
    if not isinstance(parsed, dict):
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail="AI returned unexpected JSON")
    return parsed


def response_body(
    model: str,
    system_prompt: str,
    user_prompt: str,
    *,
    json_schema: dict[str, Any] | None = None,
    web_search: bool = False,
) -> dict[str, Any]:
    body: dict[str, Any] = {
        "model": model,
        "input": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt},
        ],
    }
    parameters = parameters_for_model(model)
    if parameters.reasoning_effort is not None:
        body["reasoning"] = {"effort": parameters.reasoning_effort}
    if parameters.max_output_tokens is not None:
        body["max_output_tokens"] = parameters.max_output_tokens
    if json_schema is not None:
        body["text"] = {
            "format": {
                "type": "json_schema",
                "name": json_schema["name"],
                "schema": json_schema["schema"],
                "strict": True,
            },
        }
    if web_search:
        body["tools"] = [
            {
                "type": "web_search",
                "external_web_access": True,
                "user_location": {
                    "type": "approximate",
                    "country": "CH",
                    "region": "Ticino",
                    "timezone": "Europe/Zurich",
                },
            },
        ]
        body["tool_choice"] = "required"
        body["include"] = ["web_search_call.action.sources"]
    return body


def error_metadata(exc: urllib.error.HTTPError) -> tuple[str, bool]:
    raw = exc.read().decode("utf-8", errors="replace")
    code = ""
    message = ""
    try:
        payload = json.loads(raw)
        error = payload.get("error", {}) if isinstance(payload, dict) else {}
        if isinstance(error, dict):
            code = str(error.get("code") or error.get("type") or "").lower()
            message = str(error.get("message") or "").lower()
    except json.JSONDecodeError:
        pass

    if code in {"content_filter", "content_policy_violation", "policy_violation", "safety_violation"}:
        return "safety_or_policy_error", False
    if exc.code in {401, 403}:
        return "model_access_denied", True
    if exc.code == 404:
        return "model_not_available", True
    if exc.code == 429:
        return "rate_limit", True
    if exc.code in {408, 409} or exc.code >= 500:
        return "temporary_api_error", True
    model_error_codes = {"model_not_found", "invalid_model", "unsupported_model", "permission_denied"}
    model_configuration_error = code in model_error_codes or (
        exc.code == 400 and "model" in message and any(term in message for term in {"not found", "does not exist", "access"})
    )
    if model_configuration_error:
        return "model_configuration", True
    return "non_fallback_api_error", False


def send_response_request(body: dict[str, Any], api_key: str) -> tuple[dict[str, Any], str]:
    parameters = parameters_for_model(str(body["model"]))

    request = urllib.request.Request(
        settings.openai_responses_url,
        data=json.dumps(body).encode("utf-8"),
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(request, timeout=parameters.timeout_seconds) as response:
            payload = json.loads(response.read().decode("utf-8"))
            request_id = str(response.headers.get("x-request-id") or "")
    except urllib.error.HTTPError as exc:
        reason, fallback_allowed = error_metadata(exc)
        raise OpenAITransportError(reason, fallback_allowed) from exc
    except (urllib.error.URLError, TimeoutError) as exc:
        raise OpenAITransportError("network_or_timeout", True) from exc
    except json.JSONDecodeError as exc:
        raise OpenAITransportError("invalid_api_response", False) from exc
    if not isinstance(payload, dict):
        raise OpenAITransportError("invalid_api_response", False)
    return payload, request_id


def log_ai_request(
    *,
    selection: ModelSelection,
    effective_model: str,
    fallback_occurred: bool,
    fallback_reason: str,
    latency_ms: int,
    usage: TokenUsage,
    request_id: str,
) -> None:
    logger.info(
        json.dumps(
            {
                "event": "openai_response",
                "requested_model": selection.requested_model,
                "effective_model": effective_model,
                "model_role": selection.role,
                "gpt56_enabled": settings.openai_enable_gpt56,
                "model_routing_enabled": settings.openai_enable_model_routing,
                "fallback_occurred": fallback_occurred,
                "fallback_reason": fallback_reason or None,
                "latency_ms": latency_ms,
                "input_tokens": usage.input_tokens,
                "cached_input_tokens": usage.cached_input_tokens,
                "output_tokens": usage.output_tokens,
                "request_id": request_id or None,
            },
            separators=(",", ":"),
        ),
    )


def create_response(
    model: str,
    system_prompt: str,
    user_prompt: str,
    *,
    api_key: str | None = None,
    json_schema: dict[str, Any] | None = None,
    web_search: bool = False,
    task_type: str = "sommelier",
    complexity: str | None = None,
) -> OpenAIResponse:
    active_api_key = settings.openai_api_key if api_key is None else api_key.strip()
    if not active_api_key:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="OPENAI_API_KEY is not configured")

    selection = select_ai_model(task_type, complexity, model or None)
    effective_model = selection.model
    fallback_occurred = False
    fallback_reason = ""
    started_at = time.monotonic()
    request_count = 0
    payload: dict[str, Any]
    request_id = ""
    while True:
        request_count += 1
        try:
            payload, request_id = send_response_request(
                response_body(
                    effective_model,
                    system_prompt,
                    user_prompt,
                    json_schema=json_schema,
                    web_search=web_search,
                ),
                active_api_key,
            )
            break
        except OpenAITransportError as exc:
            fallback_model = safe_fallback_model()
            can_fallback = (
                not settings.openai_enable_gpt56
                and
                exc.fallback_allowed
                and request_count == 1
                and effective_model != fallback_model
                and effective_model != LEGACY_MODEL
            )
            can_retry_legacy = (
                not settings.openai_enable_gpt56
                and
                exc.fallback_allowed
                and request_count == 1
                and effective_model == fallback_model
                and parameters_for_model(effective_model).max_retries > 0
            )
            if can_fallback:
                fallback_occurred = True
                fallback_reason = exc.reason
                effective_model = fallback_model
                logger.warning(
                    "OpenAI model fallback requested_model=%s fallback_model=%s reason=%s",
                    selection.model,
                    fallback_model,
                    exc.reason,
                )
                continue
            if can_retry_legacy:
                fallback_reason = exc.reason
                continue
            if settings.openai_enable_gpt56 and exc.reason in {"model_not_available", "model_access_denied", "model_configuration"}:
                logger.warning("OpenAI GPT-5.6 model unavailable requested_model=%s reason=%s", selection.model, exc.reason)
                raise HTTPException(
                    status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                    detail="Configured GPT-5.6 model is unavailable for this API key",
                ) from exc
            raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail="OpenAI request failed") from exc

    text = extract_response_text(payload)
    if not text:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail="AI returned an empty response")
    usage = extract_token_usage(payload)
    result = OpenAIResponse(
        text=text,
        usage=usage,
        web_sources=extract_web_sources(payload),
        web_search_calls=count_web_search_calls(payload),
        requested_model=selection.requested_model or "",
        model=effective_model,
        model_role=selection.role,
        fallback_occurred=fallback_occurred,
        fallback_reason=fallback_reason,
        request_id=request_id,
    )
    log_ai_request(
        selection=selection,
        effective_model=effective_model,
        fallback_occurred=fallback_occurred,
        fallback_reason=fallback_reason,
        latency_ms=round((time.monotonic() - started_at) * 1000),
        usage=usage,
        request_id=request_id,
    )
    return result
