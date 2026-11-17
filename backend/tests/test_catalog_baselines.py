"""App administrators give the catalog's appellations and grapes a sensory baseline."""

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
from app.models import (
    SensoryProfileBaseline,
    SharedWineIdentity,
    User,
    WineCatalogEntry,
    WineSensoryProfile,
)
from app.services import catalog_baselines, catalog_expansion
from app.services.openai_client import OpenAIResponse, TokenUsage
from app.services.shared_wine_data import identity_key
from app.services.taste_profiles import SENSORY_DIMENSIONS, TYPE_BASELINES

URL = "/api/v1/catalog-baselines"
ETNA = dict(
    zip(SENSORY_DIMENSIONS, (0.6, 0.74, 0.62, 0.05, 0.7, 0.66, 0.3, 0.5, 0.72), strict=True)
)


def add_entry(name: str, **fields) -> None:
    now = datetime.now(UTC)
    values = {
        "producer": "Lunaria",
        "region": "Sicilia",
        "appellation": "Etna DOC",
        "type": "Red",
        "grapes_text": "Nerello Mascalese 80%, Nerello Cappuccio (20%)",
        "source": "manual",
        "is_active": True,
        **fields,
    }
    with TestingSessionLocal() as db:
        db.add(WineCatalogEntry(name=name, created_at=now, updated_at=now, **values))
        db.commit()


def add_baseline(kind: str, key: str) -> None:
    with TestingSessionLocal() as db:
        db.add(
            SensoryProfileBaseline(
                entity_type=kind, entity_key=key, dimensions=ETNA, confidence=0.8, is_active=True
            )
        )
        db.commit()


def run_inline(monkeypatch, unknown: set[str] = frozenset()):  # type: ignore[assignment]
    """Answer every item with the Etna profile, except the names in `unknown`."""
    calls: list[list[dict]] = []
    monkeypatch.setattr(catalog_baselines, "submit", lambda task, *args: task(*args))
    monkeypatch.setattr(catalog_baselines, "SessionLocal", TestingSessionLocal)
    monkeypatch.setattr(catalog_expansion, "SessionLocal", TestingSessionLocal)
    monkeypatch.setattr(catalog_baselines, "MAX_PARALLEL_CALLS", 1)
    monkeypatch.setattr(catalog_baselines, "_job", None)
    monkeypatch.setattr(settings, "openai_api_key", "test-app-key")

    def fake_create_response(*args, **kwargs):
        assert not kwargs.get("web_search")
        items = json.loads(args[2].split("\n", 1)[1])["items"]
        calls.append(items)
        nothing = dict.fromkeys(SENSORY_DIMENSIONS)
        answer = [
            {"index": item["index"], "known": False, **nothing}
            if item["name"] in unknown
            else {"index": item["index"], "known": True, **ETNA}
            for item in items
        ]
        return OpenAIResponse(
            text=json.dumps({"baselines": answer}),
            usage=TokenUsage(input_tokens=900, output_tokens=500, total_tokens=1400),
            model=settings.openai_economy_model,
        )

    monkeypatch.setattr(ai_routes, "create_response", fake_create_response)
    return calls


def test_missing_baselines_are_proposed_then_activated_or_discarded(monkeypatch):
    client = TestClient(app)
    assert register(client).status_code == 201
    add_baseline("grape", "nerello mascalese")
    add_entry("Rovo Alto")
    add_entry("Sabbie Nere")
    add_entry("Bianco di Sera", type="White", grapes_text="Carricante", appellation="Sicilia DOC")
    add_entry("Rosso di Sera", grapes_text="", appellation="Sicilia DOC")
    add_entry("Senza Dati", grapes_text="", appellation="", type="")
    add_entry("In attesa", grapes_text="Frappato", is_active=False)

    before = client.get(URL).json()
    assert (before["entries"], before["specific"], before["generic"], before["without"]) == (
        5,
        2,
        2,
        1,
    )
    # Sicilia DOC makes reds and whites: one baseline cannot describe it. Pending wines
    # and the grape already covered are not asked either.
    assert [(item["entity_type"], item["label"], item["wines"]) for item in before["missing"]] == [
        ("appellation", "Etna DOC", 2),
        ("grape", "Nerello Cappuccio", 2),
        ("grape", "Carricante", 1),
    ]

    calls = run_inline(monkeypatch, unknown={"Nerello Cappuccio"})
    started = client.post(URL, json={"limit": 10})
    assert started.status_code == 202, started.text
    body = started.json()
    assert calls == [
        [
            {"index": 0, "kind": "appellation", "name": "Etna DOC", "wine_type": "Red"},
            {"index": 1, "kind": "grape", "name": "Nerello Cappuccio", "wine_type": ""},
            {"index": 2, "kind": "grape", "name": "Carricante", "wine_type": ""},
        ]
    ]
    job = body["job"]
    assert job["status"] == "done" and job["stop_reason"] == "finished"
    assert (job["total"], job["created"], job["unknown"], job["failed"]) == (3, 2, 1, 0)
    assert Decimal(job["cost_usd"]) > 0
    # A proposal changes nothing until it is activated; an unknown grape is not asked again.
    assert (body["specific"], body["missing_count"], body["proposal_count"]) == (2, 0, 2)
    etna, carricante = body["proposals"]
    assert (etna["entity_key"], etna["wines"], etna["confidence"]) == ("etna doc", 2, 0.6)
    assert etna["dimensions"] == ETNA

    approved = client.post(f"{URL}/approve", json={"ids": [carricante["id"]]}).json()
    assert (approved["specific"], approved["generic"], approved["proposal_count"]) == (3, 1, 1)
    discarded = client.post(f"{URL}/discard", json={"ids": [etna["id"], carricante["id"]]}).json()
    assert discarded["proposal_count"] == 0
    assert [item["label"] for item in discarded["missing"]] == ["Etna DOC"]
    with TestingSessionLocal() as db:
        kept = {
            item.entity_key: (item.is_active, item.source)
            for item in db.scalars(select(SensoryProfileBaseline))
        }
    assert kept == {
        "nerello mascalese": (True, "editorial"),
        "carricante": (True, "ai_research"),
        "nerello cappuccio": (False, "ai_unknown"),
    }


def add_profile(name: str, vintage: str, **fields) -> None:
    parts = (name.lower(), "lunaria", vintage)
    values = {
        "dimensions": dict(TYPE_BASELINES["Red"]),
        "source": "metadata",
        "confidence": 0.35,
        "generation_status": "available",
        **fields,
    }
    with TestingSessionLocal() as db:
        identity = SharedWineIdentity(
            identity_key=identity_key(parts),
            normalized_name=parts[0],
            normalized_producer=parts[1],
            normalized_vintage=vintage,
            name=name,
            producer="Lunaria",
            vintage=vintage,
        )
        db.add(identity)
        db.flush()
        db.add(WineSensoryProfile(identity_id=identity.id, **values))
        db.commit()


def test_estimated_profiles_follow_the_baselines_and_the_others_stay(monkeypatch):
    client = TestClient(app)
    assert register(client).status_code == 201
    add_entry("Rovo", grapes_text="Nerello Mascalese")
    add_profile("Rovo", "2019")
    add_profile("Rovo", "2020", validated=True)
    add_profile("Rovo", "2021", source="ai", confidence=0.65)
    add_profile("Ignoto", "2020")

    # Nothing better than the wine type is known yet.
    nothing = {"checked": 2, "updated": 0, "changes": []}
    assert client.post(f"{URL}/recalculate").json() == nothing
    add_baseline("grape", "nerello mascalese")
    # The comparison shows before and after without saving anything.
    for _ in range(2):
        preview = client.get(f"{URL}/recalculation").json()
        assert (preview["checked"], preview["updated"]) == (2, 1)
    (change,) = preview["changes"]
    assert (change["name"], change["vintage"]) == ("Rovo", "2019")
    assert change["before"] == TYPE_BASELINES["Red"] and change["after"] == ETNA
    assert (change["source_before"], change["source_after"]) == ("metadata", "grape")
    assert change["confidence_after"] > change["confidence_before"] == 0.35
    applied = client.post(f"{URL}/recalculate").json()
    assert (applied["updated"], applied["changes"]) == (1, [change])
    with TestingSessionLocal() as db:
        profiles = {
            identity.name + " " + identity.vintage: profile
            for profile, identity in db.execute(
                select(WineSensoryProfile, SharedWineIdentity).join(
                    SharedWineIdentity, WineSensoryProfile.identity_id == SharedWineIdentity.id
                )
            )
        }
    # Every vintage of the entry shares the profile of its grapes and appellation.
    assert profiles["Rovo 2019"].source == "grape" and profiles["Rovo 2019"].confidence > 0.35
    assert profiles["Rovo 2019"].dimensions["minerality"] > 0.5
    for untouched in ("Rovo 2020", "Rovo 2021", "Ignoto 2020"):
        assert profiles[untouched].dimensions == TYPE_BASELINES["Red"]
    assert client.post(f"{URL}/recalculate").json() == nothing
    assert client.get(f"{URL}/recalculation").json() == nothing


def test_baseline_research_stops_at_the_spending_cap(monkeypatch):
    client = TestClient(app)
    assert register(client).status_code == 201
    for letter in "abcd":
        add_entry(f"Vino {letter}", appellation="", grapes_text=f"Vitigno {letter}")
    run_inline(monkeypatch)
    monkeypatch.setattr(catalog_baselines, "ITEMS_PER_CALL", 1)

    def fake_ask(job, prompt, schema, **kwargs):
        answer = {"index": 0, "known": True, **ETNA}
        return {"baselines": [answer]}, None, Decimal("0.40")

    monkeypatch.setattr(catalog_expansion, "_ask", fake_ask)
    job = client.post(URL, json={"budget_usd": 1}).json()["job"]
    assert job["stop_reason"] == "budget"
    assert (job["done"], job["created"], Decimal(job["cost_usd"])) == (2, 2, Decimal("0.80"))


def test_only_app_administrators_manage_catalog_baselines(monkeypatch):
    client = TestClient(app)
    assert register(client).status_code == 201
    run_inline(monkeypatch)
    # With nothing missing there is nothing to pay for.
    assert client.post(URL, json={}).status_code == 409
    with TestingSessionLocal() as db:
        user = db.scalar(select(User))
        assert user is not None
        user.is_app_admin = False
        db.commit()
    assert client.get(URL).status_code == 403
    assert client.post(URL, json={}).status_code == 403
    assert client.get(f"{URL}/recalculation").status_code == 403
    for action in ("cancel", "recalculate"):
        assert client.post(f"{URL}/{action}").status_code == 403
    for action in ("approve", "discard"):
        response = client.post(
            f"{URL}/{action}", json={"ids": ["00000000-0000-0000-0000-000000000001"]}
        )
        assert response.status_code == 403
