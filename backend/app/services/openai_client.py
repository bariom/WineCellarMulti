from __future__ import annotations

from dataclasses import dataclass
import json
import urllib.error
import urllib.request
from typing import Any

from fastapi import HTTPException, status

from app.core.config import settings


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


def create_response(
    model: str,
    system_prompt: str,
    user_prompt: str,
    *,
    api_key: str | None = None,
    json_schema: dict[str, Any] | None = None,
    web_search: bool = False,
) -> OpenAIResponse:
    active_api_key = settings.openai_api_key if api_key is None else api_key.strip()
    if not active_api_key:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="OPENAI_API_KEY is not configured")

    body: dict[str, Any] = {
        "model": model or settings.openai_model,
        "input": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt},
        ],
    }
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

    request = urllib.request.Request(
        settings.openai_responses_url,
        data=json.dumps(body).encode("utf-8"),
        headers={
            "Authorization": f"Bearer {active_api_key}",
            "Content-Type": "application/json",
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(request, timeout=60) as response:
            payload = json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="replace")
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=f"OpenAI request failed: {detail}") from exc
    except (urllib.error.URLError, TimeoutError) as exc:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail="OpenAI request failed") from exc

    text = extract_response_text(payload)
    if not text:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail="AI returned an empty response")
    return OpenAIResponse(
        text=text,
        usage=extract_token_usage(payload),
        web_sources=extract_web_sources(payload),
        web_search_calls=count_web_search_calls(payload),
    )
