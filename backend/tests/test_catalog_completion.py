"""App administrators complete catalog entries lacking grapes or country, within a cap."""

from __future__ import annotations

import json
from datetime import UTC, datetime
from decimal import Decimal

from fastapi.testclient import TestClient
from sqlalchemy import select
from test_auth_and_wines import TestingSessionLocal, register
from test_auth_and_wines import setup_function as setup_function  # noqa: F401
from test_auth_and_wines import teardown_function as teardown_function  # noqa: F401

from app.api.routes import ai as ai_routes
from app.core.config import settings
from app.main import app
from app.models import AiAuditLog, User, WineCatalogEntry
from app.services import catalog_completion, catalog_photo_details
from app.services.openai_client import OpenAIResponse, TokenUsage

PAGE = "https://www.lunaria.example/vini"
URL = "/api/v1/catalog-completion"


def add_entry(name: str, producer: str = "Lunaria", **extra) -> None:
    now = datetime.now(UTC)
    with TestingSessionLocal() as db:
        db.add(
            WineCatalogEntry(
                name=name,
                producer=producer,
                region="Sicilia",
                appellation="Etna",
                type="Red",
                source="test",
                created_at=now,
                updated_at=now,
                **{"is_active": True, **extra},
            )
        )
        db.commit()


def reset_catalog() -> None:
    """Keep only the entries of the test: the JSON seed lacks grapes too."""
    with TestingSessionLocal() as db:
        for entry in db.scalars(select(WineCatalogEntry)):
            db.delete(entry)
        db.commit()


def entry_named(name: str) -> WineCatalogEntry:
    with TestingSessionLocal() as db:
        entry = db.scalar(select(WineCatalogEntry).where(WineCatalogEntry.name == name))
        assert entry is not None
        return entry


def run_inline(monkeypatch, answers: dict[str, dict]) -> list[list[dict]]:
    """Answer each research call with what `answers` says of the wines asked, by name."""
    calls: list[list[dict]] = []
    monkeypatch.setattr(catalog_completion, "submit", lambda task, *args: task(*args))
    monkeypatch.setattr(catalog_completion, "SessionLocal", TestingSessionLocal)
    monkeypatch.setattr(catalog_photo_details, "SessionLocal", TestingSessionLocal)
    monkeypatch.setattr(catalog_completion, "MAX_PARALLEL_CALLS", 1)
    monkeypatch.setattr(catalog_completion, "WINES_PER_CALL", 2)
    monkeypatch.setattr(catalog_completion, "_job", None)
    monkeypatch.setattr(settings, "openai_api_key", "test-app-key")

    def fake_create_response(*args, **kwargs):
        wines = json.loads(args[2].split("\n", 1)[1])
        calls.append(wines)
        found = []
        for wine in wines:
            answer = answers.get(wine["name"])
            if answer is not None:
                found.append(
                    {
                        "index": wine["index"],
                        "found": True,
                        "producer": wine["producer"],
                        "name": wine["name"],
                        "source_urls": [PAGE],
                        **answer,
                    }
                )
        return OpenAIResponse(
            text=json.dumps({"wines": found}),
            usage=TokenUsage(input_tokens=2000, output_tokens=600, total_tokens=2600),
            model=settings.openai_economy_model,
            web_sources=({"url": PAGE, "title": "Vini | Lunaria"},),
            web_search_calls=2,
        )

    monkeypatch.setattr(ai_routes, "create_response", fake_create_response)
    return calls


def test_incomplete_entries_receive_only_the_fields_they_lack(monkeypatch):
    client = TestClient(app)
    assert register(client).status_code == 201
    reset_catalog()
    add_entry("Rovo Alto")
    add_entry("Sabbie Nere", grapes_text="Carricante")
    add_entry("Introvabile")
    add_entry("Completo", grapes_text="Nerello Mascalese", country="Italia")
    add_entry("In attesa", is_active=False)
    calls = run_inline(
        monkeypatch,
        {
            "Rovo Alto": {
                "country": "Italia",
                "region": "Etna",
                "grapes": ["Nerello Mascalese", "Nerello Cappuccio"],
                "description": "Rosso dell'Etna.",
            },
            "Sabbie Nere": {"country": "Italia", "grapes": ["Catarratto"]},
        },
    )
    before = client.get(URL).json()
    assert before == {"incomplete_count": 3, "not_found_count": 0, "job": None}

    started = client.post(URL, json={"limit": 50, "budget_usd": 25})
    assert started.status_code == 202, started.text
    job = started.json()["job"]
    assert job["status"] == "done" and job["stop_reason"] == "finished"
    assert (job["total"], job["done"], job["completed"], job["not_found"]) == (3, 3, 2, 1)
    assert Decimal(job["cost_usd"]) > 0
    # Complete and pending entries are never sent to the research.
    assert sorted(wine["name"] for call in calls for wine in call) == [
        "Introvabile",
        "Rovo Alto",
        "Sabbie Nere",
    ]

    rovo = entry_named("Rovo Alto")
    assert rovo.country == "Italia"
    assert rovo.grapes_text == "Nerello Mascalese, Nerello Cappuccio"
    assert rovo.region == "Sicilia", "an existing value is never replaced"
    assert rovo.description == "Rosso dell'Etna."
    assert rovo.sources == [{"kind": "web_search_source", "url": PAGE, "title": "Vini | Lunaria"}]
    assert "nerello" in rovo.search_text.lower()
    assert rovo.enriched_at is not None
    sabbie = entry_named("Sabbie Nere")
    assert (sabbie.grapes_text, sabbie.country) == ("Carricante", "Italia")
    missing = entry_named("Introvabile")
    assert missing.grapes_text == "" and missing.completion_attempted_at is not None
    assert entry_named("In attesa").completion_attempted_at is None

    # A wine not found is not paid for again, unless the administrator asks.
    after = client.get(URL).json()
    assert (after["incomplete_count"], after["not_found_count"]) == (0, 1)
    assert client.post(URL, json={}).status_code == 409
    again = client.post(URL, json={"retry_not_found": True})
    assert again.status_code == 202 and again.json()["job"]["total"] == 1
    with TestingSessionLocal() as db:
        features = set(db.scalars(select(AiAuditLog.feature)))
    assert "catalog_completion" in features


def test_a_batch_stops_at_the_spending_cap(monkeypatch):
    client = TestClient(app)
    assert register(client).status_code == 201
    reset_catalog()
    for number in range(6):
        add_entry(f"Vino {number}")
    calls = run_inline(monkeypatch, {})
    monkeypatch.setattr(catalog_photo_details, "research_group", fake_group(calls, Decimal("0.40")))
    job = client.post(URL, json={"limit": 50, "budget_usd": 1}).json()["job"]
    # Two calls cost 0.80: a third would pass the cap of 1.
    assert job["stop_reason"] == "budget"
    assert (job["done"], Decimal(job["cost_usd"])) == (4, Decimal("0.80"))
    assert client.get(URL).json()["incomplete_count"] == 2


def fake_group(calls: list, cost: Decimal):
    def research_group(job, bottles, **kwargs):
        calls.append(bottles)
        return {}, cost

    return research_group


def test_only_app_administrators_complete_the_catalog(monkeypatch):
    client = TestClient(app)
    assert register(client).status_code == 201
    run_inline(monkeypatch, {})
    with TestingSessionLocal() as db:
        user = db.scalar(select(User))
        assert user is not None
        user.is_app_admin = False
        db.commit()
    assert client.get(URL).status_code == 403
    assert client.post(URL, json={}).status_code == 403
    assert client.post(f"{URL}/cancel").status_code == 403
