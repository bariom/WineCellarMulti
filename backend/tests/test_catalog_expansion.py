"""App administrators add the wines of more producers to the catalog, as proposals."""

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
from app.models import User, WineCatalogEntry
from app.services import catalog_expansion
from app.services.openai_client import OpenAIResponse, TokenUsage

PAGE = "https://www.lunaria.example/vini"
OTHER_PAGE = "https://example.com/not-searched"
URL = "/api/v1/catalog-expansion"


def wine(name: str, **extra) -> dict:
    return {
        "name": name,
        "appellation": "Etna DOC",
        "region": "Sicilia",
        "country": "Italia",
        "wine_type": "Red",
        "grapes": ["Nerello Mascalese"],
        "description": "Rosso dell'Etna.",
        "source_urls": [PAGE],
        **extra,
    }


def run_inline(monkeypatch, ranges: dict[str, list[dict]], discovered: list[str] | None = None):
    """Answer the discovery with `discovered` and each producer with its range."""
    calls: list[dict] = []
    monkeypatch.setattr(catalog_expansion, "submit", lambda task, *args: task(*args))
    monkeypatch.setattr(catalog_expansion, "SessionLocal", TestingSessionLocal)
    monkeypatch.setattr(catalog_expansion, "MAX_PARALLEL_CALLS", 1)
    monkeypatch.setattr(catalog_expansion, "_job", None)
    monkeypatch.setattr(settings, "openai_api_key", "test-app-key")

    def fake_create_response(*args, **kwargs):
        asked = json.loads(args[2].split("\n", 1)[1])
        calls.append(asked)
        if "producers_wanted" in asked:
            answer: dict = {"producers": discovered or []}
        else:
            wines = ranges.get(asked["producer"])
            answer = {
                "found": wines is not None,
                "producer": asked["producer"],
                "wines": wines or [],
            }
        return OpenAIResponse(
            text=json.dumps(answer),
            usage=TokenUsage(input_tokens=2000, output_tokens=600, total_tokens=2600),
            model=settings.openai_economy_model,
            web_sources=({"url": PAGE, "title": "Vini | Lunaria"},),
            web_search_calls=2,
        )

    monkeypatch.setattr(ai_routes, "create_response", fake_create_response)
    return calls


def add_approved(name: str, producer: str) -> None:
    now = datetime.now(UTC)
    with TestingSessionLocal() as db:
        db.add(
            WineCatalogEntry(
                name=name,
                producer=producer,
                region="Sicilia",
                appellation="Etna",
                type="Red",
                source="manual",
                is_active=True,
                created_at=now,
                updated_at=now,
            )
        )
        db.commit()


def entries_of(producer: str) -> dict[str, WineCatalogEntry]:
    with TestingSessionLocal() as db:
        return {
            entry.name: entry
            for entry in db.scalars(
                select(WineCatalogEntry).where(WineCatalogEntry.producer == producer)
            )
        }


def test_named_producers_become_proposals_to_approve_or_discard(monkeypatch):
    client = TestClient(app)
    assert register(client).status_code == 201
    add_approved("Rovo Alto", "Lunaria")
    run_inline(
        monkeypatch,
        {
            "Lunaria": [
                wine("Rovo Alto", grapes=["Altro"]),
                wine("Sabbie Nere", wine_type="bianco", grapes=["Carricante", "carricante"]),
                wine("Contrada Vecchia"),
                wine("Sabbie Nere"),
                # A page the search never returned supports nothing.
                wine("Inventato", source_urls=[OTHER_PAGE]),
            ]
        },
    )
    started = client.post(URL, json={"producers": ["Lunaria", " lunaria ", "Sconosciuto"]})
    assert started.status_code == 202, started.text
    body = started.json()
    job = body["job"]
    assert job["status"] == "done" and job["stop_reason"] == "finished"
    assert (job["producers_total"], job["producers_done"]) == (2, 2)
    assert (job["created"], job["existing"], job["unsupported"]) == (2, 1, 1)
    assert job["producers_not_found"] == ["Sconosciuto"]
    assert Decimal(job["cost_usd"]) > 0
    assert body["pending_count"] == 2
    assert [item["name"] for item in body["pending"]] == ["Contrada Vecchia", "Sabbie Nere"]
    sabbie = next(item for item in body["pending"] if item["name"] == "Sabbie Nere")
    assert sabbie["grapes_text"] == "Carricante" and sabbie["type"] == "White"
    assert sabbie["source_url"] == PAGE

    wines = entries_of("Lunaria")
    assert wines["Rovo Alto"].grapes_text == "", "a known wine is left untouched"
    assert not wines["Sabbie Nere"].is_active and wines["Sabbie Nere"].source == "ai_research"
    assert "Inventato" not in wines
    # Pending wines are not catalog suggestions yet.
    assert client.get("/api/v1/wines/catalog?q=Sabbie").json() == []

    approved = client.post(f"{URL}/approve", json={"ids": [sabbie["id"]]})
    assert approved.status_code == 200 and approved.json()["pending_count"] == 1
    assert [item["name"] for item in client.get("/api/v1/wines/catalog?q=Sabbie").json()] == [
        "Sabbie Nere"
    ]
    other = approved.json()["pending"][0]["id"]
    # An approved wine is no longer a proposal: discarding it does nothing.
    discarded = client.post(f"{URL}/discard", json={"ids": [other, sabbie["id"]]})
    assert discarded.json()["pending_count"] == 0
    assert set(entries_of("Lunaria")) == {"Rovo Alto", "Sabbie Nere"}


def test_an_area_is_searched_for_producers_the_catalog_lacks(monkeypatch):
    client = TestClient(app)
    assert register(client).status_code == 201
    add_approved("Rovo Alto", "Lunaria")
    calls = run_inline(
        monkeypatch,
        {"Vigne Nuove": [wine("Etna Rosso")], "Terre Alte": [wine("Etna Bianco")]},
        discovered=["Lunaria", "Vigne Nuove", "Terre Alte", "Quarta Cantina"],
    )
    job = client.post(URL, json={"area": "Etna", "country": "Italia", "producer_count": 2}).json()[
        "job"
    ]
    assert calls[0]["already_covered"] == ["Lunaria"]
    assert (calls[0]["area"], calls[0]["producers_wanted"]) == ("Etna", 2)
    # The producer already covered is skipped even when the AI names it.
    assert [call["producer"] for call in calls[1:]] == ["Vigne Nuove", "Terre Alte"]
    assert (job["producers_total"], job["created"]) == (2, 2)


def test_research_stops_at_the_spending_cap(monkeypatch):
    client = TestClient(app)
    assert register(client).status_code == 201
    run_inline(monkeypatch, {})

    def fake_ask(job, prompt, schema, *, feature, tools):
        response = OpenAIResponse(text="{}", usage=TokenUsage(0, 0, 0))
        return {"found": False, "producer": "", "wines": []}, response, Decimal("0.40")

    monkeypatch.setattr(catalog_expansion, "_ask", fake_ask)
    job = client.post(
        URL, json={"producers": ["Uno", "Due", "Tre", "Quattro"], "budget_usd": 1}
    ).json()["job"]
    assert job["stop_reason"] == "budget"
    assert (job["producers_done"], Decimal(job["cost_usd"])) == (2, Decimal("0.80"))


def test_only_app_administrators_extend_the_catalog(monkeypatch):
    client = TestClient(app)
    assert register(client).status_code == 201
    run_inline(monkeypatch, {})
    assert client.post(URL, json={}).status_code == 422
    with TestingSessionLocal() as db:
        user = db.scalar(select(User))
        assert user is not None
        user.is_app_admin = False
        db.commit()
    assert client.get(URL).status_code == 403
    assert client.post(URL, json={"producers": ["Lunaria"]}).status_code == 403
    assert client.post(f"{URL}/cancel").status_code == 403
    for action in ("approve", "discard"):
        response = client.post(
            f"{URL}/{action}", json={"ids": ["00000000-0000-0000-0000-000000000001"]}
        )
        assert response.status_code == 403
