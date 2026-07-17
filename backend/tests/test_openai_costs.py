from __future__ import annotations

import json

from app.core.config import settings
from app.services.openai_costs import organization_cost_summary, reset_openai_costs_cache


class FakeResponse:
    def __init__(self, payload: dict) -> None:
        self.payload = payload

    def __enter__(self):
        return self

    def __exit__(self, *_args):
        return False

    def read(self) -> bytes:
        return json.dumps(self.payload).encode("utf-8")


def test_organization_cost_summary_uses_admin_key_and_caches(monkeypatch):
    reset_openai_costs_cache()
    monkeypatch.setattr(settings, "openai_admin_key", "admin-test-key")
    monkeypatch.setattr(settings, "openai_costs_cache_seconds", 300)
    calls = []

    def fake_urlopen(request, timeout):
        calls.append((request, timeout))
        return FakeResponse({"data": [{"results": [{"amount": {"value": "1.25"}}]}]})

    monkeypatch.setattr("app.services.openai_costs.urllib.request.urlopen", fake_urlopen)

    summary = organization_cost_summary()
    cached_summary = organization_cost_summary()

    assert summary["available"] is True
    assert summary["current_month_usd"] == 1.25
    assert summary["previous_period_usd"] == 1.25
    assert summary["change_percent"] == 0
    assert summary["period_start"] is not None
    assert len(calls) == 2
    assert all(timeout == 10 for _, timeout in calls)
    assert all(
        request.get_header("Authorization") == "Bearer admin-test-key" for request, _ in calls
    )
    assert cached_summary == summary


def test_organization_cost_summary_is_disabled_without_admin_key(monkeypatch):
    reset_openai_costs_cache()
    monkeypatch.setattr(settings, "openai_admin_key", "")

    assert organization_cost_summary() == {
        "available": False,
        "current_month_usd": None,
        "previous_period_usd": None,
        "change_percent": None,
        "period_start": None,
        "collected_at": None,
    }
