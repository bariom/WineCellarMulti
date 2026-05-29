import uuid

from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.db.base import Base
from app.db.session import get_db
from app.main import app
from app.models import Household, Wine


engine = create_engine(
    "sqlite+pysqlite:///:memory:",
    connect_args={"check_same_thread": False},
    poolclass=StaticPool,
)
TestingSessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)


def override_get_db():
    db = TestingSessionLocal()
    try:
        yield db
    finally:
        db.close()


def setup_function():
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)
    app.dependency_overrides[get_db] = override_get_db


def teardown_function():
    app.dependency_overrides.clear()


def register(client: TestClient, email: str = "owner@example.com", password: str = "strong-password-1"):
    return client.post(
        "/api/v1/auth/register",
        json={
            "email": email,
            "display_name": "Cellar Owner",
            "password": password,
            "household_name": "Main Cellar",
        },
    )


def test_register_login_session_and_logout():
    client = TestClient(app)

    anonymous = client.get("/api/v1/session")
    assert anonymous.status_code == 200
    assert anonymous.json()["authenticated"] is False

    registered = register(client)
    assert registered.status_code == 201
    assert registered.json()["authenticated"] is True
    assert registered.json()["user_email"] == "owner@example.com"
    assert registered.json()["active_household_name"] == "Main Cellar"

    logged_out = client.post("/api/v1/auth/logout")
    assert logged_out.status_code == 204
    assert client.get("/api/v1/session").json()["authenticated"] is False

    login = client.post("/api/v1/auth/login", json={"email": "owner@example.com", "password": "strong-password-1"})
    assert login.status_code == 200
    assert login.json()["authenticated"] is True


def test_wine_crud_requires_auth_and_is_scoped_to_active_household():
    client = TestClient(app)

    unauthenticated = client.get("/api/v1/wines")
    assert unauthenticated.status_code == 401

    registered = register(client)
    assert registered.status_code == 201

    created = client.post(
        "/api/v1/wines",
        json={
            "name": "Testamatta",
            "producer": "Bibi Graetz",
            "vintage": "2018",
            "quantity": 6,
            "price": 45.4,
            "currency": "CHF",
            "status": "Delivered",
        },
    )
    assert created.status_code == 201
    wine_id = created.json()["id"]

    with TestingSessionLocal() as db:
        other_household = Household(name="Other Cellar")
        db.add(other_household)
        db.flush()
        db.add(
            Wine(
                household_id=other_household.id,
                name="Hidden Wine",
                producer="Other",
                vintage="2020",
                quantity=1,
                price=10,
            ),
        )
        db.commit()

    listed = client.get("/api/v1/wines")
    assert listed.status_code == 200
    assert [wine["name"] for wine in listed.json()] == ["Testamatta"]

    updated = client.patch(f"/api/v1/wines/{wine_id}", json={"quantity": 5, "status": "Shipped"})
    assert updated.status_code == 200
    assert updated.json()["quantity"] == 5
    assert updated.json()["status"] == "Shipped"

    missing = client.get(f"/api/v1/wines/{uuid.uuid4()}")
    assert missing.status_code == 404

    deleted = client.delete(f"/api/v1/wines/{wine_id}")
    assert deleted.status_code == 204
    assert client.get("/api/v1/wines").json() == []


def test_invite_acceptance_and_viewer_permissions():
    owner = TestClient(app)
    member = TestClient(app)

    assert register(owner).status_code == 201
    invite = owner.post("/api/v1/household/invites", json={"email": "viewer@example.com", "role": "viewer"})
    assert invite.status_code == 201
    invite_token = invite.json()["invite_token"]
    assert invite_token

    members_before = owner.get("/api/v1/household/members")
    assert members_before.status_code == 200
    assert [member_data["email"] for member_data in members_before.json()] == ["owner@example.com"]

    assert register(member, email="viewer@example.com", password="strong-password-2").status_code == 201
    accepted = member.post("/api/v1/household/invites/accept", json={"token": invite_token})
    assert accepted.status_code == 200
    assert accepted.json()["role"] == "viewer"
    invited_membership_id = accepted.json()["membership_id"]

    members_after = owner.get("/api/v1/household/members")
    assert members_after.status_code == 200
    assert sorted(member_data["email"] for member_data in members_after.json()) == ["owner@example.com", "viewer@example.com"]

    owner_wine = owner.post("/api/v1/wines", json={"name": "Shared Wine", "quantity": 1, "price": 20})
    assert owner_wine.status_code == 201

    member_households = member.get("/api/v1/household/memberships")
    assert member_households.status_code == 200
    shared_household = next(item for item in member_households.json() if item["role"] == "viewer")
    assert shared_household["household_name"] == "Main Cellar"
    assert invited_membership_id

    switched = member.post("/api/v1/household/switch", json={"household_id": shared_household["household_id"]})
    assert switched.status_code == 200

    viewer_list = member.get("/api/v1/wines")
    assert viewer_list.status_code == 200
    assert [wine["name"] for wine in viewer_list.json()] == ["Shared Wine"]

    viewer_create = member.post("/api/v1/wines", json={"name": "Blocked Wine", "quantity": 1, "price": 20})
    assert viewer_create.status_code == 403

    viewer_members = member.get("/api/v1/household/members")
    assert viewer_members.status_code == 200
