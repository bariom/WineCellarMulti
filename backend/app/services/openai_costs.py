from __future__ import annotations

import json
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import UTC, datetime
from decimal import Decimal, InvalidOperation

from app.core.config import settings

_CACHE_LOCK = threading.Lock()
_cached_at = 0.0
_cached_key = ""
_cached_summary: dict[str, object] | None = None


def unavailable_summary() -> dict[str, object]:
    return {
        "available": False,
        "current_month_usd": None,
        "previous_period_usd": None,
        "change_percent": None,
        "period_start": None,
        "collected_at": None,
    }


def _cost_for_period(api_key: str, start: datetime, end: datetime) -> Decimal:
    query = urllib.parse.urlencode(
        {
            "start_time": int(start.timestamp()),
            "end_time": int(end.timestamp()),
            "bucket_width": "1d",
            "limit": 180,
        }
    )
    request = urllib.request.Request(
        f"{settings.openai_costs_url}?{query}",
        headers={"Authorization": f"Bearer {api_key}", "Accept": "application/json"},
    )
    with urllib.request.urlopen(request, timeout=10) as response:  # noqa: S310 - configured OpenAI API URL
        payload = json.load(response)

    total = Decimal("0")
    for bucket in payload.get("data", []):
        for result in bucket.get("results", []):
            try:
                total += Decimal(str(result.get("amount", {}).get("value", "0")))
            except (InvalidOperation, TypeError, ValueError):
                continue
    return total


def _period_start(now: datetime) -> datetime:
    return now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)


def _fetch_summary(api_key: str) -> dict[str, object]:
    now = datetime.now(UTC)
    current_start = _period_start(now)
    elapsed = now - current_start
    previous_start = current_start - elapsed
    current = _cost_for_period(api_key, current_start, now)
    previous = _cost_for_period(api_key, previous_start, current_start)
    current_value = float(current)
    previous_value = float(previous)
    change_percent = None
    if previous:
        change_percent = round(
            ((current_value - previous_value) / previous_value) * 100,
            2,
        )
    return {
        "available": True,
        "current_month_usd": current_value,
        "previous_period_usd": previous_value,
        "change_percent": change_percent,
        "period_start": current_start.isoformat(),
        "collected_at": now.isoformat(),
    }


def organization_cost_summary() -> dict[str, object]:
    """Return a cached, app-admin-safe organization cost summary.

    The Admin key is intentionally consumed only on the server and no upstream
    error details are propagated to the UI.
    """

    global _cached_at, _cached_key, _cached_summary
    api_key = settings.openai_admin_key.strip()
    if not api_key:
        return unavailable_summary()

    now = time.monotonic()
    with _CACHE_LOCK:
        if (
            _cached_summary is not None
            and _cached_key == api_key
            and now - _cached_at < max(0, settings.openai_costs_cache_seconds)
        ):
            return _cached_summary.copy()

    try:
        summary = _fetch_summary(api_key)
    except (urllib.error.URLError, TimeoutError, OSError, ValueError, json.JSONDecodeError):
        return unavailable_summary()

    with _CACHE_LOCK:
        _cached_at = now
        _cached_key = api_key
        _cached_summary = summary
    return summary.copy()


def reset_openai_costs_cache() -> None:
    """Clear the in-process cache; used by tests."""

    global _cached_at, _cached_key, _cached_summary
    with _CACHE_LOCK:
        _cached_at = 0.0
        _cached_key = ""
        _cached_summary = None
