from datetime import UTC, datetime, timedelta
from decimal import Decimal

import pytest
import test_auth_and_wines as harness
from fastapi.testclient import TestClient
from sqlalchemy import select
from test_tasting_memory_photos import photo

from app.main import app
from app.models import Household, User
from app.services.ai_credits import create_ai_credit_transaction


def setup_function():
    harness.setup_function()


def teardown_function():
    harness.teardown_function()


@pytest.mark.parametrize("plan", ["free", "pack", "subscriber", "admin", "expired", "demo"])
def test_memories_require_subscription_or_app_admin_without_losing_tastings(plan):
    client = TestClient(app)
    assert harness.register(client).status_code == 201
    wine = client.post("/api/v1/wines", json={"name": "Memory wine", "quantity": 2}).json()
    saved = client.post(
        f"/api/v1/wines/{wine['id']}/consume",
        json={"memory_photo": photo(), "note": "A memory to keep"},
    )
    assert saved.status_code == 200
    album = "/api/v1/wines/tasting-archive?photos_only=true"
    assert client.get(album).json()["total"] == 1
    with harness.TestingSessionLocal() as db:
        user = db.scalar(select(User).where(User.email == "owner@example.com"))
        user.is_app_admin = plan == "admin"
        user.access_override_until = datetime.now(UTC) + timedelta(
            days=1 if plan == "subscriber" else -1
        )
        if plan == "pack":
            create_ai_credit_transaction(db, user, amount_usd=Decimal("10"), source="test_pack")
        if plan == "demo":
            db.scalar(select(Household)).is_demo = True
        db.commit()
    response = client.get(album)
    if plan in {"subscriber", "admin"}:
        assert response.status_code == 200, response.text
        assert response.json()["total"] == 1
    else:
        assert response.status_code == 403, response.text
        assert "subscription" in response.json()["detail"]
    history = client.get("/api/v1/wines/tasting-archive")
    assert history.status_code == 200
    assert history.json()["total"] == 1
    assert history.json()["items"][0]["note"] == "A memory to keep"
    if plan == "expired":
        with harness.TestingSessionLocal() as db:
            user = db.scalar(select(User).where(User.email == "owner@example.com"))
            user.access_override_until = datetime.now(UTC) + timedelta(days=1)
            db.commit()
        restored = client.get(album)
        assert restored.status_code == 200
        assert (
            restored.json()["items"][0]["memory_photo_url"]
            == history.json()["items"][0]["memory_photo_url"]
        )
