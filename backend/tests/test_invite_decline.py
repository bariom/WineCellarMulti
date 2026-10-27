import test_auth_and_wines as harness
from fastapi.testclient import TestClient

from app.main import app


def setup_function():
    harness.setup_function()


def teardown_function():
    harness.teardown_function()


def invited_client(owner: TestClient, email: str) -> TestClient:
    guest = TestClient(app)
    assert harness.register(guest, email=email, password="strong-password-2").status_code == 201
    pending = owner.get("/api/v1/auth/pending-users").json()
    user = next(user for user in pending if user["email"] == email)
    assert owner.post(f"/api/v1/auth/pending-users/{user['id']}/approve").status_code == 200
    login = {"email": email, "password": "strong-password-2"}
    assert guest.post("/api/v1/auth/login", json=login).status_code == 200
    return guest


def test_received_invite_can_be_declined_only_by_its_recipient():
    owner = TestClient(app)
    assert harness.register(owner).status_code == 201
    invite = owner.post(
        "/api/v1/household/invites", json={"email": "guest@example.com", "role": "member"}
    ).json()
    guest = invited_client(owner, "guest@example.com")
    stranger = invited_client(owner, "stranger@example.com")

    assert [item["id"] for item in guest.get("/api/v1/household/invites/received").json()] == [
        invite["id"]
    ]
    # Someone else cannot decline it, nor learn that it exists.
    assert stranger.post(f"/api/v1/household/invites/{invite['id']}/decline").status_code == 404

    assert guest.post(f"/api/v1/household/invites/{invite['id']}/decline").status_code == 204
    assert guest.get("/api/v1/household/invites/received").json() == []
    assert owner.get("/api/v1/household/invites").json() == []
    center = guest.get("/api/v1/notifications/center").json()
    assert not any(item["source"] == "household_invite" for item in center["items"])
    # Gone for good: it can be neither declined again nor accepted.
    assert guest.post(f"/api/v1/household/invites/{invite['id']}/decline").status_code == 404
    assert guest.post(f"/api/v1/household/invites/{invite['id']}/accept").status_code == 404
