"""Bottles that leave the cellar without being drunk or sold."""

from fastapi.testclient import TestClient
from test_auth_and_wines import register
from test_auth_and_wines import setup_function as setup_function  # noqa: F401
from test_auth_and_wines import teardown_function as teardown_function  # noqa: F401

from app.main import app


def create_wine(client: TestClient, **extra) -> dict:
    payload = {"name": "Barolo", "quantity": 6, "price": 50, "status": "Delivered", **extra}
    created = client.post("/api/v1/wines", json=payload)
    assert created.status_code == 201, created.text
    return created.json()


def exit_bottles(client: TestClient, wine_id: str, movement_type: str, quantity: int, **extra):
    return client.post(
        "/api/v1/inventory/movements",
        json={"wine_id": wine_id, "movement_type": movement_type, "quantity": quantity, **extra},
    )


def test_gift_breakage_defective_and_return_take_bottles_out():
    client = TestClient(app)
    assert register(client).status_code == 201
    wine = create_wine(client)
    for movement_type in ("complimentary", "breakage", "defective", "returned"):
        response = exit_bottles(client, wine["id"], movement_type, 1, note="Una nota")
        assert response.status_code == 201, response.text
        assert response.json()[0]["movement_type"] == movement_type
        assert response.json()[0]["quantity_delta"] == -1
    assert client.get(f"/api/v1/wines/{wine['id']}").json()["quantity"] == 2
    listed = client.get(f"/api/v1/inventory/movements?wine_id={wine['id']}").json()
    assert {"complimentary", "breakage", "defective", "returned"} <= {
        item["movement_type"] for item in listed
    }
    assert exit_bottles(client, wine["id"], "breakage", 3).status_code == 409


def test_co_owner_withdrawal_keeps_the_other_owners_bottles():
    client = TestClient(app)
    assert register(client).status_code == 201
    wine = create_wine(
        client,
        owners=[
            {"name": "Owner", "email": "owner@example.com", "share_pct": 50},
            {"name": "Friend", "email": "friend@example.com", "share_pct": 50},
        ],
    )
    # The friend owns three of the six bottles: four are more than that.
    too_many = exit_bottles(
        client, wine["id"], "co_owner_withdrawal", 4, co_owner_email="friend@example.com"
    )
    assert too_many.status_code == 409
    unknown = exit_bottles(
        client, wine["id"], "co_owner_withdrawal", 1, co_owner_email="nobody@example.com"
    )
    assert unknown.status_code == 422
    taken = exit_bottles(
        client, wine["id"], "co_owner_withdrawal", 2, co_owner_email="friend@example.com"
    )
    assert taken.status_code == 201, taken.text
    updated = client.get(f"/api/v1/wines/{wine['id']}").json()
    assert updated["quantity"] == 4
    shares = {owner["email"]: owner["share_pct"] for owner in updated["owners"]}
    # Three of the four bottles left are the owner's, one is still the friend's.
    assert shares == {"owner@example.com": 75.0, "friend@example.com": 25.0}
    # Taking the last one leaves the owner alone with the whole wine.
    assert (
        exit_bottles(
            client, wine["id"], "co_owner_withdrawal", 1, co_owner_email="friend@example.com"
        ).status_code
        == 201
    )
    owners = client.get(f"/api/v1/wines/{wine['id']}").json()["owners"]
    assert [(owner["email"], owner["share_pct"]) for owner in owners] == [
        ("owner@example.com", 100.0)
    ]


def test_co_owner_withdrawal_without_named_owners_raises_the_household_share():
    client = TestClient(app)
    assert register(client).status_code == 201
    wine = create_wine(client, quantity=4, owner_share_pct=50)
    taken = exit_bottles(client, wine["id"], "co_owner_withdrawal", 2)
    assert taken.status_code == 201, taken.text
    updated = client.get(f"/api/v1/wines/{wine['id']}").json()
    assert updated["quantity"] == 2
    assert float(updated["owner_share_pct"]) == 100.0
    assert exit_bottles(client, wine["id"], "co_owner_withdrawal", 1).status_code == 409
