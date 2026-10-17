from dataclasses import replace
from uuid import uuid4

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import event, select
from test_sensory_agent import setup as setup  # noqa: F401

from app.api.deps import get_current_context
from app.api.routes import catalog, imports, wines
from app.db.session import get_db
from app.models import Household, Membership, Wine, WineCatalogAlias, WineCatalogEntry
from app.services.catalog_sync import propose_wine_catalog_entry


@pytest.fixture
def api(setup):
    db, context, initial = setup
    db.delete(initial)
    db.commit()
    app = FastAPI()
    app.include_router(catalog.router, prefix="/wines")
    app.include_router(wines.router, prefix="/wines")
    app.include_router(imports.router)
    app.dependency_overrides[get_db] = lambda: db
    app.dependency_overrides[get_current_context] = lambda: context
    with TestClient(app) as client:
        yield client, db, context, app


def test_wine_completed_later_is_shared_only_after_approval(api):
    client, db, context, app = api
    response = client.post("/wines", json={"name": "Sync Testamatta"})
    assert response.status_code == 201, response.text
    wine_id = response.json()["id"]
    assert db.scalar(select(WineCatalogEntry)) is None
    db.scalar(
        select(Wine).where(Wine.household_id == context.household.id)
    ).vineyard_country = "Italia"
    db.commit()
    payload = {
        "producer": "Bibi Graetz",
        "region": "Toscana",
        "type": "Red",
        "wine_zone": "Chianti",
        "vineyard_locality": "Fiesole",
        "grapes": [{"name": "Sangiovese"}],
        "price": 77,
        "notes": "PRIVATE NOTE",
    }
    response = client.patch(f"/wines/{wine_id}", json=payload)
    assert response.status_code == 200, response.text
    entry = db.scalar(select(WineCatalogEntry))
    assert entry.name == "Sync Testamatta" and not entry.is_active
    assert entry.country == "Italia" and entry.grapes_text == "Sangiovese"
    assert entry.wine_zone == "Chianti" and entry.locality == "Fiesole"
    assert client.get("/wines/catalog?q=Sync%20Testamatta").json() == []
    assert len(client.get("/wines/catalog/admin?q=Sync%20Testamatta").json()) == 1
    assert client.post(f"/wines/catalog/{entry.id}/approve").status_code == 200
    other = Household(name="New empty cellar")
    db.add(other)
    db.flush()
    membership = Membership(user_id=context.user.id, household_id=other.id, role="owner")
    db.add(membership)
    db.commit()
    switched = replace(context, household=other, membership=membership)
    app.dependency_overrides[get_current_context] = lambda: switched
    result = client.get("/wines/catalog?q=Sync%20Testamatta").json()
    assert len(result) == 1 and result[0]["producer"] == "Bibi Graetz"
    assert "PRIVATE NOTE" not in str(result) and "price" not in result[0]
    assert client.patch(f"/wines/{wine_id}", json={"region": "Changed"}).status_code == 404


def test_admin_recovery_is_global_idempotent_and_keeps_private_data_private(api):
    client, db, context, _ = api
    other = Household(name="Foreign")
    db.add(other)
    db.flush()
    for vintage in ("2018", "2019"):
        db.add(
            Wine(
                household_id=context.household.id,
                name="Sync Testamatta",
                producer="Bibi Graetz",
                vintage=vintage,
                type="Red",
                quantity=6,
                notes="PRIVATE NOTE",
                price=77,
            )
        )
    db.add(Wine(household_id=context.household.id, name="Bare name"))
    db.add(
        Wine(
            household_id=other.id,
            name="Foreign wine",
            producer="Other",
            notes="FOREIGN PRIVATE NOTE",
            price=123,
            quantity=4,
        )
    )
    db.commit()
    url = "/wines/catalog/recover"
    statements = []

    def capture_sql(_connection, _cursor, statement, _parameters, _context, _many):
        statements.append(statement.lower())

    event.listen(db.get_bind(), "before_cursor_execute", capture_sql)
    response = client.post(url)
    event.remove(db.get_bind(), "before_cursor_execute", capture_sql)
    projections = [sql for sql in statements if "from wines" in sql]
    assert projections
    assert all(
        field not in sql
        for sql in projections
        for field in ("wines.notes", "wines.price", "wines.quantity", "wines.household_id")
    )
    assert response.status_code == 200, response.text
    assert response.json() == {"scanned": 4, "created": 2, "existing": 1, "skipped": 1}
    entry = db.scalar(select(WineCatalogEntry).where(WineCatalogEntry.name == "Sync Testamatta"))
    assert entry.name == "Sync Testamatta" and not entry.is_active
    assert "private" not in entry.search_text and "77" not in entry.search_text
    foreign = db.scalar(select(WineCatalogEntry).where(WineCatalogEntry.name == "Foreign wine"))
    assert foreign is not None and not foreign.is_active
    assert "private" not in foreign.search_text and "123" not in foreign.search_text
    assert client.get("/wines/catalog?q=Foreign").json() == []
    assert "PRIVATE" not in response.text and "household" not in response.text
    assert len(list(db.scalars(select(Wine)))) == 4
    assert client.post(url).json() == {"scanned": 4, "created": 0, "existing": 3, "skipped": 1}
    assert len(list(db.scalars(select(WineCatalogEntry)))) == 2
    context.user.is_app_admin = False
    db.commit()
    assert client.post(url).status_code == 403
    context.user.is_app_admin = True
    context.membership.role = "viewer"
    db.commit()
    assert client.post(url).status_code == 403


def test_sync_fills_missing_metadata_and_preserves_existing_approved_values(api):
    client, db, context, _ = api
    wine = Wine(household_id=context.household.id, name="Sync Testamatta", producer="Bibi Graetz")
    db.add(wine)
    db.flush()
    entry = propose_wine_catalog_entry(db, wine)
    db.commit()
    assert client.patch(f"/wines/{wine.id}", json={"region": "Toscana"}).status_code == 200
    db.refresh(entry)
    assert entry.region == "Toscana"
    assert client.post(f"/wines/catalog/{entry.id}/approve").status_code == 200
    assert (
        client.patch(
            f"/wines/{wine.id}", json={"appellation": "Toscana IGT", "region": "Conflicting region"}
        ).status_code
        == 200
    )
    db.refresh(entry)
    assert entry.appellation == "Toscana IGT" and entry.region == "Toscana" and entry.is_active
    assert client.post("/wines/catalog/recover").status_code == 200
    db.refresh(entry)
    assert entry.appellation == "Toscana IGT" and entry.region == "Toscana" and entry.is_active


@pytest.mark.parametrize("kind", ["legacy", "vinaris", "cellartracker"])
def test_imports_propose_catalog_entries_without_duplicates(api, kind):
    client, db, _, _ = api
    data = {
        "id": str(uuid4()),
        "name": "Imported Testamatta",
        "producer": "Bibi Graetz",
        "vintage": "2018",
        "type": "Red",
        "quantity": 2,
        "notes": "PRIVATE NOTE",
    }
    if kind == "cellartracker":
        url = "/imports/cellartracker"
        payload = {
            "csv_text": (
                "Wine,Producer,Vintage,Quantity,Type,Region,PNotes\n"
                "Imported Testamatta,Bibi Graetz,2018,2,Red,Toscana,PRIVATE NOTE\n"
            )
        }
    else:
        url = "/imports/json" if kind == "vinaris" else "/imports/legacy-json"
        payload = {"wines": [data]}
        if kind == "vinaris":
            payload["schema"] = "winecellarmulti.export.v2"
    first = client.post(url, json=payload)
    assert first.status_code == 200, first.text
    entry = db.scalar(select(WineCatalogEntry))
    assert entry.name == "Imported Testamatta" and not entry.is_active
    assert "private" not in entry.search_text
    repeated = client.post(url + "?mode=update_existing", json=payload)
    assert repeated.status_code == 200, repeated.text
    assert repeated.json()["wines_updated"] == 1
    assert len(list(db.scalars(select(WineCatalogEntry)))) == 1
    db.query(WineCatalogAlias).delete()
    db.query(WineCatalogEntry).delete()
    db.commit()
    skipped = client.post(url + "?mode=skip_duplicates", json=payload)
    assert skipped.status_code == 200, skipped.text
    assert skipped.json()["wines_skipped"] == 1
    assert len(list(db.scalars(select(WineCatalogEntry)))) == 1
