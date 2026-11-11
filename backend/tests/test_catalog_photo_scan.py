"""App administrators read labels on photos and see what the catalog already knows."""

from __future__ import annotations

import json
import uuid

from fastapi.testclient import TestClient
from sqlalchemy import select
from test_auth_and_wines import TestingSessionLocal, register
from test_auth_and_wines import setup_function as setup_function  # noqa: F401
from test_auth_and_wines import teardown_function as teardown_function  # noqa: F401

from app.api.routes import ai as ai_routes
from app.api.routes import catalog_photos as catalog_photo_routes
from app.core.config import settings
from app.main import app
from app.models import AiAuditLog, User, WineCatalogEntry
from app.services import catalog_photo_scan
from app.services.openai_client import OpenAIResponse, TokenUsage

SECTIONS = {
    b"one": [
        (b"left", (0.0, 0.0, 0.6, 1.0), (600, 1000)),
        (b"right", (0.4, 0.0, 0.6, 1.0), (600, 1000)),
    ],
}


def label(name: str, producer: str, vintage: str = "", **extra: object) -> dict[str, object]:
    return {
        "name": name,
        "producer": producer,
        "vintage": vintage,
        "wine_type": "",
        "region": "",
        "appellation": "",
        "country": "",
        "confidence": "high",
        "center_x": 300,
        "center_y": 500,
        "label_width": 80,
        "label_height": 120,
        "bottle_top": 200,
        "bottle_bottom": 900,
        "whole_bottle": True,
        **extra,
    }


def run_inline(monkeypatch, readings: dict[bytes, list[dict[str, object]]]) -> list[dict]:
    """Run the jobs synchronously on the test database, on the application's key."""
    calls: list[dict] = []
    monkeypatch.setattr(catalog_photo_scan, "submit", lambda task, *args: task(*args))
    monkeypatch.setattr(catalog_photo_scan, "SessionLocal", TestingSessionLocal)
    monkeypatch.setattr(catalog_photo_scan, "MAX_PARALLEL_SECTIONS", 1)
    monkeypatch.setattr(
        catalog_photo_scan, "label_snapper", lambda image: lambda x, y, w, h: (x, y)
    )
    monkeypatch.setattr(
        catalog_photo_routes, "shelf_photo_sections", lambda content: SECTIONS[content]
    )
    monkeypatch.setattr(
        catalog_photo_routes, "model_view_image", lambda content: (b"close", (800, 1200))
    )
    monkeypatch.setattr(settings, "openai_api_key", "test-app-key")

    def fake_create_response(*args, **kwargs):
        image = kwargs["input_images"][0][1]
        calls.append(
            {
                "image": image,
                "api_key": kwargs.get("api_key"),
                "user": args[2],
                "web_search": kwargs.get("web_search"),
            }
        )
        if image == b"broken":
            raise TimeoutError("section timed out")
        return OpenAIResponse(
            text=json.dumps({"bottles": readings[image]}),
            usage=TokenUsage(input_tokens=900, output_tokens=200, total_tokens=1100),
            model=settings.openai_economy_model,
        )

    monkeypatch.setattr(ai_routes, "create_response", fake_create_response)
    return calls


def seed_catalog() -> None:
    with TestingSessionLocal() as db:
        db.add_all(
            [
                WineCatalogEntry(
                    name="Soave Classico",
                    producer="Pieropan",
                    region="Veneto",
                    appellation="Soave Classico DOC",
                    type="White",
                    country="Italia",
                    search_text="soave classico pieropan veneto",
                    is_active=True,
                ),
                WineCatalogEntry(
                    name="Rosso di Montalcino",
                    producer="Il Poggione",
                    region="Toscana",
                    type="Red",
                    search_text="rosso di montalcino il poggione toscana",
                    is_active=False,
                ),
            ]
        )
        db.commit()


def scan(client: TestClient, mode: str = "shelf", content: bytes = b"one"):
    started = client.post(
        "/api/v1/catalog-photos/scans",
        data={"mode": mode},
        files=[("images", ("shelf.jpg", content, "image/jpeg"))],
    )
    assert started.status_code == 202, started.text
    job = client.get(f"/api/v1/catalog-photos/scans/{started.json()['id']}")
    assert job.status_code == 200, job.text
    return job.json()


def test_shelf_photo_labels_are_merged_and_looked_up_in_the_whole_catalog(monkeypatch):
    client = TestClient(app)
    assert register(client).status_code == 201
    seed_catalog()
    calls = run_inline(
        monkeypatch,
        {
            b"left": [
                # Seen small in the left section, larger and whole in the right one.
                label(
                    "Soave Classico",
                    "Pieropan",
                    "2023",
                    confidence="medium",
                    label_width=40,
                    label_height=60,
                    whole_bottle=False,
                    region="Veneto",
                ),
                label("Rosso di Montalcino", "Il Poggione", "2021", wine_type="Rosso"),
                label("", "Illeggibile"),
            ],
            b"right": [
                label(
                    "Soave Classico",
                    "Pieropan",
                    "2023",
                    appellation="Soave Classico DOC",
                    center_x=100,
                ),
                # The bottle does not contain its own label: no usable outline.
                label(
                    "Etna Rosso",
                    "Benanti",
                    "2022",
                    vintage_note="x",
                    bottle_top=700,
                    bottle_bottom=900,
                ),
            ],
        },
    )
    job = scan(client)
    assert (job["status"], job["stage"], job["mode"]) == ("done", "done", "shelf")
    assert (job["sections_total"], job["sections_done"], job["bottles_found"]) == (2, 2, 3)
    # Labels are read once per section, without web search, on the application's key.
    assert [call["image"] for call in calls] == [b"left", b"right"]
    assert {call["api_key"] for call in calls} == {"test-app-key"}
    assert not any(call["web_search"] for call in calls)
    assert "untrusted reference material" in calls[0]["user"]

    bottles = {bottle["name"]: bottle for bottle in job["result"]["bottles"]}
    soave = bottles["Soave Classico"]
    assert (soave["status"], soave["entry"]["is_active"]) == ("known", True)
    assert soave["missing_fields"] == ["grapes_text"]
    # The surest reading wins, missing fields come from the other one, and the largest
    # whole bottle is kept for the photo: the right section starts at 40% of the photo.
    assert (soave["confidence"], soave["region"], soave["appellation"]) == (
        "high",
        "Veneto",
        "Soave Classico DOC",
    )
    assert soave["whole_bottle"] is True
    assert abs(soave["x"] - (0.4 + (100 - 40) / 600 * 0.6)) < 1e-6
    assert (soave["bottle_top"], soave["bottle_bottom"]) == (0.2, 0.9)

    poggione = bottles["Rosso di Montalcino"]
    assert (poggione["status"], poggione["wine_type"]) == ("pending", "Red")
    assert poggione["entry"]["producer"] == "Il Poggione"

    etna = bottles["Etna Rosso"]
    assert (etna["status"], etna["entry"], etna["candidates"]) == ("new", None, [])
    assert (etna["bottle_top"], etna["bottle_bottom"], etna["whole_bottle"]) == (0.0, 0.0, False)

    with TestingSessionLocal() as db:
        audits = list(
            db.scalars(select(AiAuditLog).where(AiAuditLog.feature == "catalog_photo_scan"))
        )
        assert len(audits) == 2
        # Reading never writes to the catalog.
        assert len(list(db.scalars(select(WineCatalogEntry)))) == 2


def test_close_up_photo_is_read_whole_and_similar_entries_stay_uncertain(monkeypatch):
    client = TestClient(app)
    assert register(client).status_code == 201
    with TestingSessionLocal() as db:
        for name in ("Barolo Brunate", "Barolo Bussia"):
            db.add(
                WineCatalogEntry(
                    name=name, producer="Cantina Rossi", search_text=name.lower(), is_active=True
                )
            )
        db.commit()
    calls = run_inline(monkeypatch, {b"close": [label("Barolo Brunata", "Cantina Rossi", "2019")]})
    job = scan(client, mode="close", content=b"close-up")
    assert [call["image"] for call in calls] == [b"close"]
    assert job["sections_total"] == 1
    (bottle,) = job["result"]["bottles"]
    assert (bottle["status"], bottle["entry"]) == ("uncertain", None)
    assert [candidate["name"] for candidate in bottle["candidates"]][:1] == ["Barolo Brunate"]
    # A close-up photo is the whole photo: the label box is not snapped or offset.
    assert abs(bottle["x"] - (300 - 40) / 800) < 1e-6


def test_unread_sections_are_counted_and_all_failures_fail_the_job(monkeypatch):
    client = TestClient(app)
    assert register(client).status_code == 201
    SECTIONS[b"half"] = [
        (b"good", (0.0, 0.0, 1.0, 1.0), (600, 1000)),
        (b"broken", (0.0, 0.0, 1.0, 1.0), (600, 1000)),
    ]
    SECTIONS[b"none"] = [(b"broken", (0.0, 0.0, 1.0, 1.0), (600, 1000))]
    run_inline(monkeypatch, {b"good": [label("Etna Rosso", "Benanti", "2022")]})
    job = scan(client, content=b"half")
    assert job["status"] == "done"
    assert job["result"]["unread_sections"] == 1
    failed = scan(client, content=b"none")
    assert failed["status"] == "failed"
    assert failed["result"] is None


def test_only_app_administrators_scan_and_jobs_stay_private(monkeypatch):
    client = TestClient(app)
    assert register(client).status_code == 201
    run_inline(monkeypatch, {b"left": [], b"right": []})
    job = scan(client)
    too_many = client.post(
        "/api/v1/catalog-photos/scans",
        files=[("images", (f"{index}.jpg", b"one", "image/jpeg")) for index in range(4)],
    )
    assert too_many.status_code == 422
    not_image = client.post(
        "/api/v1/catalog-photos/scans", files=[("images", ("a.txt", b"one", "text/plain"))]
    )
    assert not_image.status_code == 415
    assert client.get(f"/api/v1/catalog-photos/scans/{uuid.uuid4()}").status_code == 404

    with TestingSessionLocal() as db:
        user = db.scalar(select(User))
        assert user is not None
        user.is_app_admin = False
        db.commit()
    assert client.get(f"/api/v1/catalog-photos/scans/{job['id']}").status_code == 403
    denied = client.post(
        "/api/v1/catalog-photos/scans", files=[("images", ("a.jpg", b"one", "image/jpeg"))]
    )
    assert denied.status_code == 403
