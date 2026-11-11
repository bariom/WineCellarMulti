"""App administrators complete catalog wines read on photos and keep good bottle photos."""

from __future__ import annotations

import json
import random
from io import BytesIO

from fastapi.testclient import TestClient
from PIL import Image, ImageDraw, ImageFilter
from sqlalchemy import select
from test_auth_and_wines import TestingSessionLocal, register
from test_auth_and_wines import setup_function as setup_function  # noqa: F401
from test_auth_and_wines import teardown_function as teardown_function  # noqa: F401
from test_catalog_photo_scan import label

from app.api.routes import ai as ai_routes
from app.api.routes import catalog_photos as catalog_photo_routes
from app.core.config import settings
from app.main import app
from app.models import (
    AiAuditLog,
    SharedWineFact,
    User,
    WineCatalogAlias,
    WineCatalogEntry,
    WinePhotoLibraryEntry,
)
from app.schemas.catalog_photo import CatalogPhotoBottle
from app.services import bottle_photo_ai, catalog_photo_details, catalog_photo_scan
from app.services.openai_client import OpenAIResponse, TokenUsage

PAGE = "https://www.benanti.it/vini/etna-rosso"
OTHER_PAGE = "https://example.com/not-searched"
# A whole bottle in a 1200x1800 photo, its label centered at (600, 1000).
BOTTLE = {
    "x": 0.375,
    "y": 0.4444,
    "width": 0.25,
    "height": 0.2222,
    "bottle_top": 0.1,
    "bottle_bottom": 0.9,
    "whole_bottle": True,
    "confidence": "high",
}


def bottle_photo(*, blur: float = 0, dark: bool = False) -> Image.Image:
    """A dark bottle with a light label covered in fine print, on a wooden shelf."""
    image = Image.new("RGB", (1200, 1800), (107, 74, 43))
    draw = ImageDraw.Draw(image)
    draw.rectangle((470, 400, 730, 1620), fill=(29, 42, 31))
    draw.rectangle((560, 180, 640, 420), fill=(29, 42, 31))
    draw.rectangle((450, 800, 750, 1200), fill=(241, 230, 200))
    rng = random.Random(7)
    for row in range(820, 1180, 9):
        for column in range(470, 730, 7):
            if rng.random() < 0.55:
                draw.rectangle((column, row, column + 3, row + 4), fill=(30, 30, 30))
    if blur:
        image = image.filter(ImageFilter.GaussianBlur(blur))
    if dark:
        image = image.point(lambda value: value // 8)
    return image


def jpeg(image: Image.Image) -> bytes:
    output = BytesIO()
    image.save(output, format="JPEG", quality=92)
    return output.getvalue()


def cutout() -> bytes:
    output = BytesIO()
    Image.new("RGBA", (480, 720), (20, 30, 20, 255)).save(output, format="PNG")
    return output.getvalue()


def test_research_keeps_only_what_the_label_and_the_searched_pages_support():
    bottles = [
        CatalogPhotoBottle(name="Rovo Alto", producer="Lunaria", vintage="2022"),
        CatalogPhotoBottle(name="Soave Classico", producer="Pieropan", vintage="2023"),
        CatalogPhotoBottle(name="Barolo", producer="Rossi", vintage="2019"),
        CatalogPhotoBottle(name="Chianti", producer="Verdi", vintage="NV"),
    ]
    answer = {
        "wines": [
            {
                "index": 1,
                "found": True,
                "producer": "Lunaria Viticoltori",
                "name": "Rovo Alto DOC",
                "appellation": "Etna DOC",
                "region": "Sicilia",
                "country": "Italia",
                "wine_type": "rosso",
                "grapes": ["Nerello Mascalese", "Nerello Cappuccio", "nerello mascalese"],
                "description": "Rosso dell'Etna da Nerello.",
                "drink_from": 2024,
                "drink_peak_from": 2025,
                "drink_peak_to": 2029,
                "drink_to": 2032,
                "drink_notes": "Fresco e teso.",
                "source_urls": [f"{PAGE}/", OTHER_PAGE],
            },
            # A page the search never returned is not a source.
            {
                "index": 2,
                "found": True,
                "producer": "Pieropan",
                "name": "Soave Classico",
                "source_urls": [OTHER_PAGE],
            },
            # Another producer than the label is another wine.
            {
                "index": 3,
                "found": True,
                "producer": "Giacomo Conterno",
                "name": "Barolo",
                "source_urls": [PAGE],
            },
            # Without a vintage there is no drinking window.
            {
                "index": 4,
                "found": True,
                "producer": "Verdi",
                "name": "Chianti",
                "drink_from": 2020,
                "drink_peak_from": 2021,
                "drink_peak_to": 2022,
                "drink_to": 2023,
                "source_urls": [PAGE],
            },
            {"index": 1, "found": False, "source_urls": []},
            {"index": 9, "found": True, "source_urls": [PAGE]},
        ]
    }
    details = catalog_photo_details.details_from_answer(
        answer, bottles, [{"url": PAGE, "title": "Rovo Alto | Lunaria"}]
    )

    etna = details[0]
    assert etna.found and etna.producer == "Lunaria Viticoltori" and etna.wine_type == "Red"
    assert etna.grapes == ["Nerello Mascalese", "Nerello Cappuccio"]
    assert (etna.drink_from, etna.drink_peak_from, etna.drink_peak_to, etna.drink_to) == (
        2024,
        2025,
        2029,
        2032,
    )
    assert [source.model_dump() for source in etna.sources] == [
        {"url": PAGE, "title": "Rovo Alto | Lunaria"}
    ]
    assert not details[1].found and not details[2].found
    assert details[3].found and details[3].drink_from is None and details[3].drink_notes == ""
    assert set(details) == {0, 1, 2, 3}
    # A window starting before the vintage or out of order is dropped.
    assert catalog_photo_details.drink_window("2022", [2020, 2024, 2026, 2030]) is None
    assert catalog_photo_details.drink_window("2022", [2024, 2028, 2026, 2030]) is None


def test_only_sharp_well_exposed_whole_bottles_read_with_confidence_qualify():
    bottle = CatalogPhotoBottle(name="Rovo Alto", producer="Lunaria", **BOTTLE)
    check = catalog_photo_details.check_bottle_photo
    assert check(bottle_photo(), bottle).ok
    assert check(bottle_photo(blur=6), bottle).issue == "blurry"
    assert check(bottle_photo(dark=True), bottle).issue == "dark"
    small = bottle_photo().resize((300, 450))
    assert check(small, bottle).issue == "small"
    uncertain = bottle.model_copy(update={"confidence": "medium"})
    assert check(bottle_photo(), uncertain).issue == "uncertain"
    cut = bottle.model_copy(update={"whole_bottle": False})
    assert check(bottle_photo(), cut).issue == "cut"

    # The bottle is framed 2:3, from 5% to 95% of the height, as the cutout expects.
    with Image.open(
        BytesIO(catalog_photo_details.bottle_photo_source(jpeg(bottle_photo()), bottle))
    ) as frame:
        assert abs(frame.width / frame.height - 2 / 3) < 0.01
        assert abs(frame.height - 1440 / 0.9) < 3


def run_inline(
    monkeypatch, tmp_path, photo: bytes, readings: list[dict[str, object]], answer: dict
) -> list[dict]:
    calls: list[dict] = []
    monkeypatch.setattr(catalog_photo_scan, "submit", lambda task, *args: task(*args))
    monkeypatch.setattr(catalog_photo_details, "submit", lambda task, *args: task(*args))
    monkeypatch.setattr(catalog_photo_scan, "SessionLocal", TestingSessionLocal)
    monkeypatch.setattr(catalog_photo_details, "SessionLocal", TestingSessionLocal)
    monkeypatch.setattr(catalog_photo_details, "MAX_PARALLEL_CALLS", 1)
    monkeypatch.setattr(
        catalog_photo_routes, "model_view_image", lambda content: (b"close", (800, 1200))
    )
    monkeypatch.setattr(settings, "openai_api_key", "test-app-key")
    monkeypatch.setattr(settings, "wine_photo_ai_enabled", True)
    monkeypatch.setattr(settings, "wine_photo_storage_dir", str(tmp_path))
    sources: list[bytes] = []

    def fake_cutout(content: bytes, *args) -> bytes:
        sources.append(content)
        return cutout()

    monkeypatch.setattr(bottle_photo_ai, "process_bottle_photo", fake_cutout)

    def fake_create_response(*args, **kwargs):
        calls.append(
            {
                "api_key": kwargs.get("api_key"),
                "web_search": kwargs.get("web_search"),
                "max_tool_calls": kwargs.get("max_tool_calls"),
                "user": args[2],
            }
        )
        if kwargs.get("web_search"):
            return OpenAIResponse(
                text=json.dumps(answer),
                usage=TokenUsage(input_tokens=2000, output_tokens=600, total_tokens=2600),
                model=settings.openai_economy_model,
                web_sources=({"url": PAGE, "title": "Rovo Alto | Lunaria"},),
                web_search_calls=2,
            )
        return OpenAIResponse(
            text=json.dumps({"bottles": readings}),
            usage=TokenUsage(input_tokens=900, output_tokens=200, total_tokens=1100),
            model=settings.openai_economy_model,
        )

    monkeypatch.setattr(ai_routes, "create_response", fake_create_response)
    calls.append({"photo_sources": sources})
    return calls


# The bottle of bottle_photo() as the vision model reports it on an 800x1200 view.
ETNA_LABEL = label(
    "Rovo Alto",
    "Lunaria",
    "2022",
    center_x=400,
    center_y=666.7,
    label_width=200,
    label_height=266.7,
    bottle_top=120,
    bottle_bottom=1080,
)
ETNA_ANSWER = {
    "wines": [
        {
            "index": 1,
            "found": True,
            "producer": "Lunaria",
            "name": "Rovo Alto",
            "appellation": "Etna DOC",
            "region": "Sicilia",
            "country": "Italia",
            "wine_type": "Red",
            "grapes": ["Nerello Mascalese", "Nerello Cappuccio"],
            "description": "Rosso dell'Etna da Nerello Mascalese, fresco e minerale.",
            "drink_from": 2024,
            "drink_peak_from": 2025,
            "drink_peak_to": 2029,
            "drink_to": 2032,
            "drink_notes": "Da bere giovane.",
            "source_urls": [PAGE],
        }
    ]
}


def scan_close_up(client: TestClient, photo: bytes) -> dict:
    started = client.post(
        "/api/v1/catalog-photos/scans",
        data={"mode": "close"},
        files=[("images", ("etna.jpg", photo, "image/jpeg"))],
    )
    assert started.status_code == 202, started.text
    return client.get(f"/api/v1/catalog-photos/scans/{started.json()['id']}").json()


def test_new_wine_is_researched_saved_approved_and_reused_by_a_cellar(monkeypatch, tmp_path):
    client = TestClient(app)
    assert register(client).status_code == 201
    photo = jpeg(bottle_photo())
    calls = run_inline(monkeypatch, tmp_path, photo, [ETNA_LABEL], ETNA_ANSWER)
    photo_sources = calls.pop()["photo_sources"]

    job = scan_close_up(client, photo)
    bottle = job["result"]["bottles"][0]
    assert bottle["status"] == "new"
    assert bottle["photo"] == {"ok": True, "issue": "", "has_library_photo": False}

    started = client.post(
        f"/api/v1/catalog-photos/scans/{job['id']}/details", json={"bottles": [0]}
    )
    assert started.status_code == 202, started.text
    job = client.get(f"/api/v1/catalog-photos/scans/{job['id']}").json()
    assert job["status"] == "done" and job["error"] == ""
    details = job["result"]["bottles"][0]["details"]
    assert details["found"] and details["appellation"] == "Etna DOC"
    assert details["sources"] == [{"url": PAGE, "title": "Rovo Alto | Lunaria"}]
    assert float(job["result"]["details_cost_usd"]) >= 0.02  # two web searches
    research = [call for call in calls if call["web_search"]]
    assert len(research) == 1 and research[0]["api_key"] == "test-app-key"
    assert research[0]["max_tool_calls"] == 1
    assert "Rovo Alto" in research[0]["user"] and "untrusted" in research[0]["user"]

    saved = client.post(
        f"/api/v1/catalog-photos/scans/{job['id']}/bottles/0",
        json={
            "name": "Rovo Alto",
            "producer": "Lunaria",
            "appellation": "Etna DOC",
            "region": "Sicilia",
            "country": "Italia",
            "type": "Red",
            "grapes_text": "Nerello Mascalese, Nerello Cappuccio",
            "description": details["description"],
            "drink_from": 2024,
            "drink_peak_from": 2025,
            "drink_peak_to": 2029,
            "drink_to": 2032,
            "save_photo": True,
        },
    )
    assert saved.status_code == 200, saved.text
    assert saved.json()["photo"] == "saved"
    assert saved.json()["bottle"]["saved"] and saved.json()["bottle"]["status"] == "known"
    assert len(photo_sources) == 1
    with Image.open(BytesIO(photo_sources[0])) as frame:
        assert abs(frame.width / frame.height - 2 / 3) < 0.01

    with TestingSessionLocal() as db:
        entry = db.scalar(select(WineCatalogEntry).where(WineCatalogEntry.name == "Rovo Alto"))
        assert entry is not None and entry.is_active and entry.source == "photo"
        assert entry.description.startswith("Rosso dell'Etna")
        assert entry.sources == [
            {"kind": "web_search_source", "url": PAGE, "title": "Rovo Alto | Lunaria"}
        ]
        assert entry.enriched_at is not None
        aliases = set(
            db.scalars(
                select(WineCatalogAlias.normalized_alias).where(
                    WineCatalogAlias.catalog_entry_id == entry.id
                )
            )
        )
        assert aliases == {"rovo alto", "lunaria rovo alto"}
        facts = {fact.feature: fact for fact in db.scalars(select(SharedWineFact))}
        assert set(facts) == {"drink_window", "notes", "grapes"}
        assert facts["drink_window"].payload["drink_to"] == 2032
        assert facts["grapes"].payload["source_url"] == PAGE
        library = db.scalars(select(WinePhotoLibraryEntry)).all()
        assert len(library) == 1 and library[0].normalized_producer == "lunaria"
        audit = db.scalars(
            select(AiAuditLog).where(AiAuditLog.feature == "catalog_photo_details")
        ).all()
        assert len(audit) == 1

    # A cellar adding that vintage gets the window, the notes, the grapes and the photo for free.
    calls.clear()
    wine = client.post(
        "/api/v1/wines",
        json={"name": "Rovo Alto", "producer": "Lunaria", "vintage": "2022", "quantity": 1},
    )
    assert wine.status_code == 201, wine.text
    body = wine.json()
    assert (body["drink_from"], body["drink_to"]) == (2024, 2032)
    assert [grape["name"] for grape in body["grapes"]] == ["Nerello Mascalese", "Nerello Cappuccio"]
    assert body["photo_thumbnail_url"]
    assert calls == []

    # Saving again keeps the existing library photo unless the admin replaces it.
    again = client.post(
        f"/api/v1/catalog-photos/scans/{job['id']}/bottles/0",
        json={
            "entry_id": saved.json()["bottle"]["entry"]["id"],
            "name": "Rovo Alto",
            "producer": "Lunaria",
            "save_photo": True,
        },
    )
    assert again.status_code == 200, again.text
    assert again.json()["photo"] == "exists"
    assert len(photo_sources) == 1


def test_existing_entries_are_completed_and_approved_without_losing_data(monkeypatch, tmp_path):
    client = TestClient(app)
    assert register(client).status_code == 201
    with TestingSessionLocal() as db:
        pending = WineCatalogEntry(
            name="Rovo Alto",
            producer="Lunaria",
            region="Sicilia",
            search_text="rovo alto lunaria",
            is_active=False,
            source="user_saved",
        )
        db.add(pending)
        db.commit()
        pending_id = str(pending.id)
    photo = jpeg(bottle_photo(blur=6))
    calls = run_inline(monkeypatch, tmp_path, photo, [ETNA_LABEL], {"wines": []})
    photo_sources = calls.pop()["photo_sources"]

    job = scan_close_up(client, photo)
    bottle = job["result"]["bottles"][0]
    assert bottle["status"] == "pending" and bottle["photo"]["issue"] == "blurry"

    # A blurry photo is never saved; empty fields never erase the catalog's data.
    saved = client.post(
        f"/api/v1/catalog-photos/scans/{job['id']}/bottles/0",
        json={
            "entry_id": pending_id,
            "name": "Rovo Alto",
            "producer": "Lunaria",
            "region": "",
            "appellation": "Etna DOC",
            "save_photo": True,
        },
    )
    assert saved.status_code == 200, saved.text
    assert saved.json()["photo"] == "skipped" and photo_sources == []
    with TestingSessionLocal() as db:
        entry = db.get(WineCatalogEntry, pending.id)
        assert entry is not None and entry.is_active
        assert (entry.region, entry.appellation, entry.source) == (
            "Sicilia",
            "Etna DOC",
            "user_saved",
        )
        assert entry.enriched_at is None and entry.sources == []
        assert db.scalars(select(SharedWineFact)).all() == []
    assert (
        client.post(
            f"/api/v1/catalog-photos/scans/{job['id']}/bottles/5", json={"name": "Rovo Alto"}
        ).status_code
        == 404
    )
    assert (
        client.post(
            f"/api/v1/catalog-photos/scans/{job['id']}/details", json={"bottles": [3]}
        ).status_code
        == 422
    )


def test_ambiguous_names_must_be_chosen_and_only_app_admins_save(monkeypatch, tmp_path):
    client = TestClient(app)
    assert register(client).status_code == 201
    with TestingSessionLocal() as db:
        for region in ("Sicilia", "Calabria"):
            entry = WineCatalogEntry(
                name="Rovo Alto",
                producer="Lunaria",
                region=region,
                search_text="rovo alto lunaria",
                is_active=True,
            )
            db.add(entry)
            db.flush()
            db.add(
                WineCatalogAlias(
                    catalog_entry_id=entry.id,
                    alias="Lunaria Rovo Alto",
                    normalized_alias=f"lunaria rovo alto {region.lower()}",
                )
            )
        db.commit()
    photo = jpeg(bottle_photo())
    run_inline(monkeypatch, tmp_path, photo, [ETNA_LABEL], {"wines": []})
    job = scan_close_up(client, photo)
    conflict = client.post(
        f"/api/v1/catalog-photos/scans/{job['id']}/bottles/0",
        json={"name": "Rovo Alto", "producer": "Lunaria"},
    )
    assert conflict.status_code == 409

    with TestingSessionLocal() as db:
        user = db.scalar(select(User))
        assert user is not None
        user.is_app_admin = False
        db.commit()
    assert (
        client.post(
            f"/api/v1/catalog-photos/scans/{job['id']}/details", json={"bottles": [0]}
        ).status_code
        == 403
    )
    assert (
        client.post(
            f"/api/v1/catalog-photos/scans/{job['id']}/bottles/0", json={"name": "Rovo Alto"}
        ).status_code
        == 403
    )


def test_catalog_entries_stay_selectable_with_distinct_on_postgresql():
    """PostgreSQL cannot compare json: a json column breaks every catalog search (DISTINCT)."""
    from sqlalchemy import JSON
    from sqlalchemy.dialects import postgresql

    dialect = postgresql.dialect()
    for column in WineCatalogEntry.__table__.columns:
        if isinstance(column.type, JSON):
            assert column.type.dialect_impl(dialect).compile(dialect=dialect) == "JSONB", (
                column.name
            )
