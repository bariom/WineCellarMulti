"""Names, preview and import of the generic spreadsheet import, end to end."""

from __future__ import annotations

import json
from decimal import Decimal
from typing import Any

import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient
from spreadsheet_fixtures import ALL_SHAPES, build_xlsx
from sqlalchemy import select
from test_auth_and_wines import TestingSessionLocal, register
from test_auth_and_wines import setup_function as setup_function  # noqa: F401
from test_auth_and_wines import teardown_function as teardown_function  # noqa: F401

from app.api.routes import ai as ai_routes
from app.api.routes import imports as imports_routes
from app.api.routes import spreadsheet_imports as spreadsheet_routes
from app.core.config import settings
from app.main import app
from app.models import (
    ExternalWineTasting,
    Household,
    SpreadsheetImportMap,
    User,
    Wine,
    WineStockLot,
    WineStockMovement,
    WineTastingEntry,
    WishlistItem,
)
from app.services import free_tier
from app.services.ai_credits import ai_credit_balance, set_ai_credit_balance
from app.services.openai_client import OpenAIResponse, TokenUsage
from app.services.spreadsheet_import.movements import direction_from_names, movement_type_of
from app.services.spreadsheet_import.names import split_names, verified_ai_split

PRODUCERS = {
    "antinori": "Antinori",
    "masi": "Masi",
    "tommasi": "Tommasi",
    "castello di ama": "Castello di Ama",
    "trimbach": "Trimbach",
}


def split(raw: str, **options: Any) -> tuple[str, str, str, str]:
    result = split_names([raw], producers=PRODUCERS, **options)[0]
    return result.producer, result.name, result.vintage, result.rule


def test_names_split_on_separators_known_producers_and_estates():
    assert split("Chianti Classico Riserva - Castello di Ama") == (
        "Castello di Ama",
        "Chianti Classico Riserva",
        "",
        "separator",
    )
    # The header says the producer comes first.
    assert split("Ca' del Bosco - Cuvée Prestige", order_hint="producer_first")[:2] == (
        "Ca' del Bosco",
        "Cuvée Prestige",
    )
    assert split("Masi Campofiorin")[:2] == ("Masi", "Campofiorin")
    assert split("Tignanello Antinori")[:2] == ("Antinori", "Tignanello")
    assert split("Vietti Barolo Castiglione 2019") == (
        "",
        "Vietti Barolo Castiglione",
        "2019",
        "unresolved",
    )
    assert split("Tignanello - Marchesi Antinori", order_hint="producer_first")[:2] == (
        "Marchesi Antinori",
        "Tignanello",
    )
    assert split("Château d'Armailhac")[:2] == ("Château d'Armailhac", "Château d'Armailhac")
    assert split("Riesling", producer_values=["Trimbach"])[:2] == ("Trimbach", "Riesling")
    # A vintage column wins over a year inside the name.
    assert split("Cuvée 2015", vintage_values=["2016"])[1:3] == ("Cuvée 2015", "2016")


def test_names_follow_the_file_majority_for_unknown_producers():
    raws = ["Amarone - Tommasi", "Ripasso - Tommasi", "Rosso di Montalcino - Col d'Orcia"]
    splits = split_names(raws, producers=PRODUCERS)
    assert [(item.producer, item.name) for item in splits] == [
        ("Tommasi", "Amarone"),
        ("Tommasi", "Ripasso"),
        ("Col d'Orcia", "Rosso di Montalcino"),
    ]


# --- end to end -------------------------------------------------------------------


def client_with_cellar() -> TestClient:
    client = TestClient(app)
    assert register(client).status_code == 201
    return client


def analyze(client: TestClient, content: bytes, name: str = "vini.xlsx") -> dict[str, Any]:
    response = client.post(
        "/api/v1/imports/spreadsheet/analyze",
        files={"file": (name, content, "application/octet-stream")},
    )
    assert response.status_code == 200, response.text
    return response.json()


def proposed_mapping(analysis: dict[str, Any], **table_options: Any) -> dict[str, Any]:
    """The mapping a user confirms without changing any proposal."""
    return {
        "fingerprint": analysis["fingerprint"],
        "tables": [
            {
                "id": table["id"],
                "kind": table["kind"],
                "columns": {column["key"]: column["field"] for column in table["columns"]},
                "currency": table["currency"],
                "split_positions": {
                    question["column"]: question["default"] == "split"
                    for question in table["questions"]
                    if question["code"] == "position_split"
                },
                "movement_direction": table["movement_direction"],
                **table_options,
            }
            for table in analysis["tables"]
        ],
    }


def send(
    client: TestClient, step: str, content: bytes, mapping: dict[str, Any], query: str = ""
) -> dict[str, Any]:
    path = "/api/v1/imports/spreadsheet" + (f"/{step}" if step else "") + query
    response = client.post(
        path,
        files={"file": ("vini.xlsx", content, "application/octet-stream")},
        data={"mapping": json.dumps(mapping)},
    )
    assert response.status_code == 200, response.text
    return response.json()


def wines_by_name(client: TestClient) -> dict[str, dict[str, Any]]:
    return {wine["name"]: wine for wine in client.get("/api/v1/wines").json()}


def positions(wine: dict[str, Any]) -> dict[tuple[str, str], int]:
    return {
        (item.get("location_name") or "", item.get("bin_name") or ""): item["quantity"]
        for item in wine.get("storage_allocations") or []
    }


def test_personal_cellar_previews_imports_and_remembers_the_mapping():
    client = client_with_cellar()
    content = build_xlsx(ALL_SHAPES["personal_cellar"]())
    analysis = analyze(client, content)
    assert analysis["saved_mapping"] is None
    mapping = proposed_mapping(analysis)

    preview = send(client, "preview", content, mapping)
    assert (preview["wines_total"], preview["wine_new"], preview["bottles_total"]) == (5, 5, 12)
    names = {name["raw"]: name for name in preview["names"]}
    assert names["Chianti Classico Riserva - Castello di Ama"]["producer"] == "Castello di Ama"
    assert names["Château d'Armailhac"]["rule"] == "estate"
    assert client.get("/api/v1/wines").json() == []

    result = send(client, "", content, mapping)
    assert result["wines_imported"] == 5
    wines = wines_by_name(client)
    chianti = wines["Chianti Classico Riserva"]
    assert (chianti["producer"], chianti["vintage"], chianti["quantity"]) == (
        "Castello di Ama",
        "2020",
        4,
    )
    assert (chianti["currency"], chianti["price"], chianti["type"]) == ("CHF", "32.00", "Red")
    assert chianti["merchant"] == "Coop"
    assert chianti["order_date"] == "2025-02-14"
    assert chianti["notes"] == "Piaciuto"
    assert positions(chianti) == {("Scaffale 1", ""): 4}
    assert wines["Bollinger Special Cuvée"]["type"] == "Sparkling"

    again = analyze(client, content)
    assert again["saved_mapping"]["fingerprint"] == analysis["fingerprint"]
    repeat = send(client, "", content, mapping)
    assert (repeat["wines_imported"], repeat["wines_skipped"]) == (0, 5)


def test_locations_split_and_sheets_become_locations_with_their_type():
    client = client_with_cellar()
    content = build_xlsx(ALL_SHAPES["collector_register"]())
    send(client, "", content, proposed_mapping(analyze(client, content)))
    wines = wines_by_name(client)
    tignanello = wines["Tignanello"]
    assert tignanello["producer"] == "Antinori"
    assert positions(tignanello) == {("B1", "ripiano 1"): 6}
    assert (tignanello["drink_from"], tignanello["drink_to"]) == (2026, 2040)
    assert tignanello["current_value"] == "145.00"
    assert "Bottiglie bevute: 1" in tignanello["notes"]
    assert "Pronto" in tignanello["tags"]

    client = client_with_cellar_second(client)
    content = build_xlsx(ALL_SHAPES["shelves"]())
    send(client, "", content, proposed_mapping(analyze(client, content)))
    wines = wines_by_name(client)
    # No catalog in the test database: an unknown producer stays inside the name.
    soave = wines["Pieropan Soave Classico"]
    assert soave["producer"] == ""
    assert (soave["type"], soave["currency"]) == ("White", "EUR")
    assert positions(soave) == {("Scaffale B - bianchi", "B2"): 4}
    assert wines["Tignanello"]["producer"] == "Marchesi Antinori"


def client_with_cellar_second(admin: TestClient) -> TestClient:
    """A second user with their own cellar; new users wait for an admin's approval."""
    client = TestClient(app)
    assert register(client, "second@example.com", "strong-password-2").status_code == 201
    pending = next(
        user
        for user in admin.get("/api/v1/auth/pending-users").json()
        if user["email"] == "second@example.com"
    )
    approved = admin.post(f"/api/v1/auth/pending-users/{pending['id']}/approve")
    assert approved.status_code == 200
    login = client.post(
        "/api/v1/auth/login",
        json={"email": "second@example.com", "password": "strong-password-2"},
    )
    assert login.status_code == 200
    return client


def test_tastings_link_to_cellar_wines_and_keep_their_score():
    client = client_with_cellar()
    content = build_xlsx(ALL_SHAPES["tasting_diary"]())
    analysis = analyze(client, content)
    preview = send(client, "preview", content, proposed_mapping(analysis))
    assert (preview["tastings_total"], preview["tastings_linked"]) == (2, 1)
    # "Buy again: Yes" for a wine the cellar holds adds nothing to the wishlist.
    assert preview["wishlist_total"] == 0

    result = send(client, "", content, proposed_mapping(analysis))
    assert result["tastings_imported"] == 2
    with TestingSessionLocal() as db:
        entry = db.scalars(select(WineTastingEntry)).one()
        assert (float(entry.score_value or 0), entry.score_scale, entry.rating) == (8.0, 10, 5.0)
        assert (entry.pairing, entry.occasion, entry.source) == (
            "raclette",
            "friends",
            "spreadsheet",
        )
        assert entry.note == "dry, crisp"
        external = db.scalars(select(ExternalWineTasting)).one()
        assert external.name == "Gérard Bertrand Côte des Roses Rosé"
        assert external.note.startswith("6/10")
    with TestingSessionLocal() as db:
        riesling = db.scalars(select(Wine).where(Wine.name == "Trimbach Riesling")).one()
        assert [entry["score_value"] for entry in riesling.tasting_history] == [8.0]

    repeat = send(client, "", content, proposed_mapping(analysis))
    assert repeat["tastings_imported"] == 0


def test_verbal_ratings_and_buy_again_for_wines_not_in_the_cellar():
    client = client_with_cellar()
    content = build_xlsx(ALL_SHAPES["occasions_and_drunk"]())
    analysis = analyze(client, content)
    mapping = proposed_mapping(analysis)
    # Mark the Allegrini as "buy again" through a corrected name is not needed:
    # Lugana is in the cellar, so it is linked and stays out of the wishlist.
    result = send(client, "", content, mapping)
    assert result["tastings_imported"] == 2
    wines = wines_by_name(client)
    lugana = wines["Lugana"]
    assert (lugana["producer"], lugana["vintage"]) == ("Ca' dei Frati I Frati", "2023")
    assert wines["Vietti Barolo Castiglione"]["vintage"] == "2019"
    assert "aperitivo" in wines["Moët & Chandon Brut Impérial"]["tags"]
    with TestingSessionLocal() as db:
        linked = db.scalars(select(WineTastingEntry)).one()
        assert linked.rating == 5.0
        assert "Com'era: molto buono" in linked.note
        external = db.scalars(select(ExternalWineTasting)).one()
        assert external.rating == 3.0
        assert db.scalars(select(WishlistItem)).all() == []


def test_wishlists_cases_owners_and_movements():
    client = client_with_cellar()
    content = build_xlsx(ALL_SHAPES["shared_stash"]())
    analysis = analyze(client, content)
    preview = send(client, "preview", content, proposed_mapping(analysis))
    assert preview["bottles_total"] == 8
    send(client, "", content, proposed_mapping(analysis))
    masi = wines_by_name(client)["Masi Campofiorin"]
    assert masi["quantity"] == 6
    assert [owner["name"] for owner in masi["owners"]] == ["Sam"]

    client = client_with_cellar_second(client)
    content = build_xlsx(ALL_SHAPES["house_list"]())
    result = send(client, "", content, proposed_mapping(analyze(client, content)))
    assert result["wishlist_imported"] == 2
    with TestingSessionLocal() as db:
        amarone = db.scalars(
            select(WishlistItem).where(WishlistItem.name == "Amarone della Valpolicella")
        ).one()
        assert (amarone.producer, float(amarone.target_price), amarone.currency) == (
            "Tommasi",
            45.0,
            "CHF",
        )
        assert "per Natale" in amarone.notes


def test_name_corrections_from_the_preview_are_applied():
    client = client_with_cellar()
    content = build_xlsx(ALL_SHAPES["occasions_and_drunk"]())
    analysis = analyze(client, content)
    preview = send(client, "preview", content, proposed_mapping(analysis))
    vietti = next(name for name in preview["names"] if name["raw"].startswith("Vietti"))
    assert vietti["rule"] == "unresolved"
    mapping = proposed_mapping(analysis)
    mapping["tables"][0]["name_overrides"] = {
        vietti["ref"]: {"producer": "Vietti", "name": "Barolo Castiglione", "vintage": "2019"}
    }
    send(client, "", content, mapping)
    barolo = wines_by_name(client)["Barolo Castiglione"]
    assert (barolo["producer"], barolo["vintage"]) == ("Vietti", "2019")
    with TestingSessionLocal() as db:
        stored = db.scalars(select(SpreadsheetImportMap)).one()
        assert stored.mapping["tables"][0]["name_overrides"] == {}


def test_invalid_mappings_and_changed_files_are_refused():
    client = client_with_cellar()
    content = build_xlsx(ALL_SHAPES["house_list"]())
    analysis = analyze(client, content)
    mapping = proposed_mapping(analysis)
    mapping["tables"][1]["columns"]["c1"] = "drink_from"  # not a wishlist field
    response = client.post(
        "/api/v1/imports/spreadsheet/preview",
        files={"file": ("vini.xlsx", content, "application/octet-stream")},
        data={"mapping": json.dumps(mapping)},
    )
    assert response.status_code == 422
    assert response.json()["detail"]["code"] == "invalid_mapping"

    other = build_xlsx(ALL_SHAPES["cupboard"]())
    response = client.post(
        "/api/v1/imports/spreadsheet",
        files={"file": ("vini.xlsx", other, "application/octet-stream")},
        data={"mapping": json.dumps(proposed_mapping(analysis))},
    )
    assert response.status_code == 422
    assert response.json()["detail"]["code"] == "layout_changed"
    assert client.get("/api/v1/wines").json() == []


def test_saved_mappings_stay_in_their_household():
    first = client_with_cellar()
    content = build_xlsx(ALL_SHAPES["cupboard"]())
    send(first, "", content, proposed_mapping(analyze(first, content)))
    second = client_with_cellar_second(first)
    assert analyze(second, content)["saved_mapping"] is None


def test_free_tier_imports_up_to_the_label_limit(monkeypatch: pytest.MonkeyPatch):
    for module in (free_tier, imports_routes, spreadsheet_routes):
        monkeypatch.setattr(module, "is_free_tier", lambda context: True)
    monkeypatch.setattr(settings, "free_tier_label_limit", 3)
    client = client_with_cellar()
    content = build_xlsx(ALL_SHAPES["personal_cellar"]())
    analysis = analyze(client, content)
    preview = send(client, "preview", content, proposed_mapping(analysis))
    assert (preview["free_tier_label_limit"], preview["free_tier_importable_wines"]) == (3, 3)
    result = send(client, "", content, proposed_mapping(analysis))
    assert (result["wines_imported"], result["wines_over_free_tier"]) == (3, 2)
    assert len(client.get("/api/v1/wines").json()) == 3


# --- AI name split ----------------------------------------------------------------

AI_ANSWERS = {
    "Pieropan Soave Classico 2021": ("Pieropan", "Soave Classico", "2021", "high"),
    "Planeta La Segreta Rosso": ("Planeta", "La Segreta Rosso", "", "high"),
    # Invented producer: not written in the label, dropped.
    "Sassicaia 2019": ("Tenuta San Guido", "Sassicaia", "2019", "high"),
    "19 Crimes Red": ("", "19 Crimes Red", "", "low"),
}


def test_ai_splits_are_kept_only_when_read_from_the_label():
    assert verified_ai_split("Pieropan Soave Classico 2021", "Pieropan", "Soave Classico", "2021")
    assert not verified_ai_split("Sassicaia 2019", "Tenuta San Guido", "Sassicaia", "2019")
    assert not verified_ai_split("Soave Pieropan", "Pieropan", "Soave Classico", "")
    assert not verified_ai_split("Soave Pieropan", "Pieropan", "Soave", "2020")
    assert not verified_ai_split("Soave Pieropan", "", "Soave Pieropan", "")


def fake_ai(calls: list[dict[str, Any]]):
    def respond(model, system_prompt, user_prompt, **kwargs):
        labels = json.loads(user_prompt.split("\n", 1)[1])["labels"]
        calls.append({"labels": [item["label"] for item in labels], "api_key": kwargs["api_key"]})
        names = [
            dict(
                zip(
                    ("producer", "name", "vintage", "confidence"),
                    AI_ANSWERS[item["label"]],
                    strict=True,
                )
            )
            | {"index": item["index"]}
            for item in labels
        ]
        return OpenAIResponse(
            text=json.dumps({"names": names}),
            usage=TokenUsage(),
            model=settings.openai_economy_model,
        )

    return respond


def names_used() -> int:
    with TestingSessionLocal() as db:
        return db.scalars(select(Household)).one().spreadsheet_ai_names_used


def test_ai_name_split_is_free_for_the_first_names_and_verified(
    monkeypatch: pytest.MonkeyPatch,
):
    calls: list[dict[str, Any]] = []
    monkeypatch.setattr(settings, "openai_api_key", "test-app-key")
    monkeypatch.setattr(ai_routes, "create_response", fake_ai(calls))
    for module in (free_tier, ai_routes, spreadsheet_routes):
        monkeypatch.setattr(module, "is_free_tier", lambda context: True)
    client = client_with_cellar()
    response = client.post(
        "/api/v1/imports/spreadsheet/names",
        json={"names": [*AI_ANSWERS, "Sassicaia 2019"]},
    )
    assert response.status_code == 200, response.text
    body = response.json()
    # Only the labels go to the provider, once each, on the application key.
    assert calls == [{"labels": list(AI_ANSWERS), "api_key": "test-app-key"}]
    suggestions = {
        item["raw"]: (item["producer"], item["name"], item["vintage"])
        for item in body["suggestions"]
    }
    assert suggestions == {
        "Pieropan Soave Classico 2021": ("Pieropan", "Soave Classico", "2021"),
        "Planeta La Segreta Rosso": ("Planeta", "La Segreta Rosso", ""),
    }
    assert (body["unsplit"], body["free_names_used"], body["ai_free_names_left"]) == (2, 4, 11)
    assert names_used() == 4

    # Beyond the free names a free-tier user without credits is told so; the free part runs.
    with TestingSessionLocal() as db:
        db.scalars(select(Household)).one().spreadsheet_ai_names_used = 14
        user = db.scalars(select(User)).one()
        if ai_credit_balance(db, user) > 0:
            set_ai_credit_balance(db, user, target_balance_usd=Decimal("0"), source="test")
        db.commit()
    calls.clear()
    response = client.post(
        "/api/v1/imports/spreadsheet/names", json={"names": list(AI_ANSWERS)[:3]}
    )
    assert response.status_code == 200, response.text
    body = response.json()
    assert calls == [{"labels": ["Pieropan Soave Classico 2021"], "api_key": "test-app-key"}]
    assert (body["free_names_used"], body["needs_credits"], body["ai_free_names_left"]) == (
        1,
        2,
        0,
    )
    response = client.post("/api/v1/imports/spreadsheet/names", json={"names": ["Sassicaia 2019"]})
    assert response.status_code == 402
    assert names_used() == 15
    blank = client.post("/api/v1/imports/spreadsheet/names", json={"names": [" "]})
    assert blank.status_code == 422


def test_ai_name_split_gives_the_free_names_back_when_the_provider_fails(
    monkeypatch: pytest.MonkeyPatch,
):
    def unavailable(*args, **kwargs):
        raise HTTPException(503, "Provider unavailable")

    monkeypatch.setattr(settings, "openai_api_key", "test-app-key")
    monkeypatch.setattr(ai_routes, "create_response", unavailable)
    client = client_with_cellar()
    response = client.post("/api/v1/imports/spreadsheet/names", json={"names": ["Sassicaia 2019"]})
    assert response.status_code == 503
    assert names_used() == 0
    content = build_xlsx(ALL_SHAPES["personal_cellar"]())
    preview = send(client, "preview", content, proposed_mapping(analyze(client, content)))
    assert preview["ai_free_names_left"] == 15


# --- movement registers -------------------------------------------------------------


def ledger(name: str) -> list[tuple[str, int, str]]:
    with TestingSessionLocal() as db:
        wine = db.scalars(select(Wine).where(Wine.name == name)).one()
        movements = db.scalars(
            select(WineStockMovement)
            .where(WineStockMovement.wine_id == wine.id)
            .order_by(WineStockMovement.occurred_on, WineStockMovement.created_at)
        ).all()
        lots = db.scalars(select(WineStockLot).where(WineStockLot.wine_id == wine.id)).all()
        assert sum(lot.quantity_remaining for lot in lots) == wine.quantity
        return [
            (movement.movement_type, movement.quantity_delta, movement.occurred_on.isoformat())
            for movement in movements
        ]


def test_movement_words_and_directions():
    assert movement_type_of("Acquisto") == "purchase"
    assert movement_type_of("bevuta a cena") == "consumption"
    assert movement_type_of("Regalo") == "complimentary"
    assert movement_type_of("sa di tappo") == "breakage"
    assert movement_type_of("Sold") == "adjustment_out"
    assert movement_type_of("spostato in cantina") == "moved"
    assert movement_type_of("cena") is None
    assert direction_from_names(["Taken out"]) == "out"
    assert direction_from_names(["Acquisti 2025"]) == "in"


def test_a_purchase_register_works_out_the_balance_the_formula_lost():
    client = client_with_cellar()
    content = build_xlsx(ALL_SHAPES["movement_register"]())
    analysis = analyze(client, content)
    assert [table["kind"] for table in analysis["tables"]] == ["movements", "inventory"]
    preview = send(client, "preview", content, proposed_mapping(analysis))
    # The balance sheet's "Rimaste" is a formula Excel never saved: +6 -2 from the register.
    assert (preview["wines_total"], preview["bottles_total"]) == (1, 4)
    assert (preview["movements_total"], preview["movements_linked"]) == (3, 2)
    assert (preview["movements_drunk"], preview["movements_unmatched"]) == (1, 1)
    # Nothing to ask: the sheet states no count the register could already include.
    assert preview["balance_questions"] == [] and preview["balance_example"] is None
    codes = {warning["code"] for warning in preview["warnings"]}
    assert "movement_without_wine" in codes

    result = send(client, "", content, proposed_mapping(analysis))
    assert (result["wines_imported"], result["movements_imported"]) == (1, 2)
    wine = next(wine for wine in wines_by_name(client).values() if "Soave" in wine["name"])
    assert (wine["producer"], wine["name"]) == ("", "Pieropan Soave Classico")
    assert (wine["quantity"], wine["vintage"]) == (4, "2023")
    assert positions(wine) == {("B2", ""): 4}
    assert ledger(wine["name"]) == [
        ("purchase", 6, "2025-06-02"),
        ("consumption", -2, "2025-08-15"),
    ]
    with TestingSessionLocal() as db:
        tasting = db.scalars(select(WineTastingEntry)).one()
        assert (tasting.consumed_at.isoformat(), tasting.occasion) == ("2025-08-15", "pranzo")
    # The same file again: the wine is there, its register is not counted twice.
    again = send(client, "", content, proposed_mapping(analysis))
    assert (again["wines_skipped"], again["movements_imported"]) == (1, 0)
    assert wines_by_name(client)[wine["name"]]["quantity"] == 4


@pytest.mark.parametrize(("answer", "bottles"), [(None, 6), ("yes", 6), ("no", 4)])
def test_outflows_follow_the_answer_about_the_cellar_counts(answer: str | None, bottles: int):
    client = client_with_cellar()
    content = build_xlsx(ALL_SHAPES["shared_stash"]())
    analysis = analyze(client, content)
    assert analysis["tables"][1]["movement_direction"] == "out"
    preview = send(client, "preview", content, proposed_mapping(analysis))
    assert preview["balance_questions"] == ["t1"]
    example = preview["balance_example"]
    assert example == {
        "table_id": "t1",
        "wine": "Masi Campofiorin 2020",
        "stock": 6,
        "stock_sheet": "Our bottles",
        "movements_sheet": "Taken out",
        "steps": [{"date": "2026-05-11", "delta": -2}],
        "if_included": 6,
        "if_applied": 4,
    }
    mapping = proposed_mapping(analysis, stock_includes_movements=answer)
    answered = send(client, "preview", content, mapping)
    assert answered["balance_questions"] == ([] if answer else ["t1"])
    assert answered["bottles_total"] == bottles + 2
    send(client, "", content, mapping)
    masi = wines_by_name(client)["Masi Campofiorin"]
    assert masi["quantity"] == bottles
    expected_opening = 8 if bottles == 6 else 6
    assert ledger("Masi Campofiorin") == [
        ("initial_purchase", expected_opening, "2026-05-11"),
        ("consumption", -2, "2026-05-11"),
    ]
