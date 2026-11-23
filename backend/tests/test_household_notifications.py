"""Reminders about a cellar disappear with the cellar: deleting it, or no longer being a
member, leaves no "82 wines to drink in IMPORTED" behind."""

from datetime import date
from uuid import uuid4

from fastapi.testclient import TestClient
from test_auth_and_wines import TestingSessionLocal, register
from test_auth_and_wines import setup_function as setup_function  # noqa: F401
from test_auth_and_wines import teardown_function as teardown_function  # noqa: F401

from app.main import app
from app.models import User, UserNotification

YEAR = date.today().year


def messages(client: TestClient) -> list[str]:
    response = client.get("/api/v1/notifications", params={"include_read": True})
    assert response.status_code == 200, response.text
    return [item["message"] for item in response.json()]


def test_deleting_a_cellar_removes_its_reminders():
    client = TestClient(app)
    assert register(client).status_code == 201
    imported = client.post("/api/v1/household", json={"name": "IMPORTED"})
    assert imported.status_code == 201, imported.text
    imported_id = imported.json()["household_id"]
    assert (
        client.post("/api/v1/household/switch", json={"household_id": imported_id}).status_code
        == 200
    )
    wine = client.post(
        "/api/v1/wines",
        json={
            "name": "Barolo",
            "producer": "Rinaldi",
            "vintage": "2016",
            "quantity": 2,
            "drink_from": YEAR - 2,
            "drink_peak_from": YEAR - 1,
            "drink_peak_to": YEAR + 1,
            "drink_to": YEAR + 4,
        },
    )
    assert wine.status_code == 201, wine.text
    assert any("IMPORTED" in message for message in messages(client))

    assert client.delete("/api/v1/household").status_code == 204
    cellars = client.get("/api/v1/household/memberships").json()
    assert [item["household_name"] for item in cellars] == ["Main Cellar"]
    assert not any("IMPORTED" in message for message in messages(client))


def test_reminders_about_a_cellar_the_user_no_longer_belongs_to_are_cleared():
    client = TestClient(app)
    assert register(client).status_code == 201
    db = TestingSessionLocal()
    try:
        user = db.query(User).one()
        # Left behind by a cellar deleted before this fix, or one the user has left.
        db.add(
            UserNotification(
                user_id=user.id,
                kind="cellar_reminder",
                title="Promemoria cantina",
                message="Hai 82 vini da bere ora in IMPORTED.",
                fingerprint=f"smart:{uuid4()}:drink_now:82",
            )
        )
        # Account-wide reminders are not about a cellar and stay.
        db.add(
            UserNotification(
                user_id=user.id,
                kind="system",
                title="Abbonamento",
                message="Il tuo abbonamento scade presto.",
                fingerprint="smart:entitlement:2026-12-31",
            )
        )
        db.commit()
    finally:
        db.close()
    remaining = messages(client)
    assert "Hai 82 vini da bere ora in IMPORTED." not in remaining
    assert "Il tuo abbonamento scade presto." in remaining
