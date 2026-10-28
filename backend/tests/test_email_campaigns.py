import io
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from uuid import uuid4

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from PIL import Image
from sqlalchemy import create_engine, select
from sqlalchemy.orm import Session
from sqlalchemy.pool import StaticPool

from app.api.deps import CurrentContext, get_authenticated_context, get_current_context
from app.api.routes import email_campaigns
from app.core.config import settings
from app.db.base import Base
from app.db.session import get_db
from app.models import EmailCampaignDelivery, Household, Membership, User, UserSession
from app.services import email_campaigns as service


@dataclass
class Env:
    db: Session
    client: TestClient
    admin: User
    reader: User
    opted_out: User
    blocked: User
    demo_only: User
    sent: list[dict]


@pytest.fixture
def env(monkeypatch, tmp_path):
    monkeypatch.setattr(settings, "email_asset_storage_dir", str(tmp_path / "assets"))
    sent: list[dict] = []

    def fake_send_email(**kwargs):
        sent.append(kwargs)
        return True

    monkeypatch.setattr(service, "send_email", fake_send_email)
    engine = create_engine(
        "sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool
    )
    Base.metadata.create_all(engine)
    with Session(engine, expire_on_commit=False) as db:
        cellar = Household(name="Real cellar")
        demo = Household(name="Demo", is_demo=True)

        def user(email: str, name: str, **extra) -> User:
            return User(email=email, display_name=name, password_hash="unused", **extra)

        admin = user("admin@example.test", "Omar Admin", is_app_admin=True)
        reader = user("anna@example.test", "Anna Rossi")
        opted_out = user("luca@example.test", "Luca Verdi", news_email_opt_out=True)
        blocked = user("blocked@example.test", "Blocked", is_blocked=True)
        demo_only = user("demo@example.test", "Demo Only")
        db.add_all([cellar, demo, admin, reader, opted_out, blocked, demo_only])
        db.flush()
        memberships = [
            Membership(user_id=member.id, household_id=cellar.id, role="owner")
            for member in (admin, reader, opted_out, blocked)
        ] + [Membership(user_id=demo_only.id, household_id=demo.id, role="viewer")]
        db.add_all(memberships)
        db.commit()
        context = CurrentContext(
            user=admin,
            household=cellar,
            membership=memberships[0],
            session=UserSession(
                user_id=admin.id,
                active_household_id=cellar.id,
                token_hash="test",
                expires_at=datetime.now(UTC) + timedelta(days=1),
            ),
        )
        app = FastAPI()
        app.include_router(email_campaigns.router, prefix="/api/v1")
        app.include_router(email_campaigns.public_router, prefix="/api/v1")
        app.dependency_overrides[get_db] = lambda: db
        app.dependency_overrides[get_current_context] = lambda: context
        app.dependency_overrides[get_authenticated_context] = lambda: context
        with TestClient(app, base_url="https://vinaris.example") as client:
            yield Env(db, client, admin, reader, opted_out, blocked, demo_only, sent)
    engine.dispose()


def draft(**overrides):
    payload = {
        "locale": "it",
        "subject": "Novità di ottobre",
        "preheader": "Vetrina, temi e Diario",
        "blocks": [
            {"type": "heading", "text": "Una cantina più luminosa"},
            {
                "type": "paragraph",
                "text": "Ciao {first_name}, <script>alert(1)</script> ecco le novità.",
            },
            {"type": "image", "asset_id": "lib:home-showcase", "caption": "La vetrina"},
            {"type": "button", "text": "Apri la cantina", "path": "/?open=cellar"},
        ],
    }
    payload.update(overrides)
    return payload


def test_recipients_exclude_blocked_and_demo_only_accounts(env):
    response = env.client.get("/api/v1/admin/email-campaigns/recipients")
    assert response.status_code == 200
    emails = {item["email"]: item["opted_out"] for item in response.json()}
    assert emails == {
        "admin@example.test": False,
        "anna@example.test": False,
        "luca@example.test": True,
    }
    found = env.client.get("/api/v1/admin/email-campaigns/recipients", params={"q": "ann"}).json()
    assert [item["email"] for item in found] == ["anna@example.test"]


def test_compose_keeps_only_known_images_and_app_paths(env, monkeypatch):
    @dataclass
    class FakeResponse:
        text: str
        model: str = "test-model"

    captured = {}

    def fake_create_response(model, system, user, **kwargs):
        captured["user"] = user
        return FakeResponse(
            text=(
                '{"subject":"Novità","preheader":"Due cose nuove","blocks":['
                '{"type":"paragraph","text":"Ciao {first_name},","asset_id":"",'
                '"caption":"","path":""},'
                '{"type":"image","text":"","asset_id":"lib:does-not-exist","caption":"x","path":""},'
                '{"type":"image","text":"","asset_id":"lib:diary","caption":"Il Diario","path":""},'
                '{"type":"button","text":"Apri","asset_id":"","caption":"",'
                '"path":"https://evil.example"}]}'
            )
        )

    monkeypatch.setattr(service, "create_response", fake_create_response)
    response = env.client.post(
        "/api/v1/admin/email-campaigns/compose",
        json={"locale": "it", "brief": "Racconta il nuovo Diario compatto"},
    )
    assert response.status_code == 200
    body = response.json()
    assert [block["type"] for block in body["blocks"]] == ["paragraph", "image", "button"]
    assert body["blocks"][1]["asset_id"] == "lib:diary"
    assert body["blocks"][2]["path"] == "/"
    assert "Racconta il nuovo Diario compatto" in captured["user"]


def test_preview_escapes_text_and_greets_by_first_name(env):
    response = env.client.post("/api/v1/admin/email-campaigns/preview", json=draft())
    assert response.status_code == 200
    html = response.json()["html"]
    assert "<script>" not in html
    assert "&lt;script&gt;" in html
    assert "Ciao Omar," in html
    assert "https://vinaris.example/email-library/home-showcase-it.jpg" in html
    assert 'href="https://vinaris.example/?open=cellar"' in html
    assert "/api/v1/email/unsubscribe?user=" in html


def test_send_skips_opted_out_and_never_mails_twice(env):
    campaign_id = str(uuid4())
    payload = draft(
        id=campaign_id,
        confirm=True,
        recipient_ids=[str(env.reader.id), str(env.opted_out.id), str(env.blocked.id)],
    )
    response = env.client.post("/api/v1/admin/email-campaigns", json=payload)
    assert response.status_code == 200
    assert response.json()["sent_count"] == 1
    assert [mail["recipients"] for mail in env.sent] == [["anna@example.test"]]
    mail = env.sent[0]
    assert mail["headers"]["List-Unsubscribe-Post"] == "List-Unsubscribe=One-Click"
    assert "Ciao Anna," in mail["html"]
    assert "Ciao Anna," in mail["body"]
    statuses = {row.user_id: row.status for row in env.db.scalars(select(EmailCampaignDelivery))}
    assert statuses == {
        env.reader.id: "sent",
        env.opted_out.id: "skipped",
        env.blocked.id: "skipped",
    }

    # A retry with the same identifier resumes without sending again.
    assert env.client.post("/api/v1/admin/email-campaigns", json=payload).status_code == 200
    assert len(env.sent) == 1
    # The same identifier with other content is refused.
    changed = dict(payload, subject="Altro oggetto")
    assert env.client.post("/api/v1/admin/email-campaigns", json=changed).status_code == 409


def test_test_send_goes_only_to_the_admin(env):
    response = env.client.post("/api/v1/admin/email-campaigns/test", json=draft())
    assert response.status_code == 200
    assert response.json() == {"delivered": True, "email": "admin@example.test"}
    assert [mail["recipients"] for mail in env.sent] == [["admin@example.test"]]
    assert env.sent[0]["subject"].startswith("[Prova] ")


def test_unsubscribe_link_requires_a_valid_token(env):
    bad = env.client.get(
        "/api/v1/email/unsubscribe", params={"user": str(env.reader.id), "token": "x" * 64}
    )
    assert bad.status_code == 400
    env.db.refresh(env.reader)
    assert env.reader.news_email_opt_out is False
    good = env.client.post(
        "/api/v1/email/unsubscribe",
        params={"user": str(env.reader.id), "token": service.unsubscribe_token(env.reader.id)},
    )
    assert good.status_code == 200
    env.db.refresh(env.reader)
    assert env.reader.news_email_opt_out is True


def test_uploaded_images_are_reencoded_and_served(env):
    buffer = io.BytesIO()
    Image.new("RGB", (2400, 1200), (180, 40, 70)).save(buffer, format="JPEG")
    response = env.client.post(
        "/api/v1/admin/email-campaigns/assets",
        data={"title": "Nuova vetrina", "description": "La home"},
        files={"file": ("shot.jpg", buffer.getvalue(), "image/jpeg")},
    )
    assert response.status_code == 200
    item = response.json()
    assert item["id"].startswith("upl:")
    served = env.client.get(item["url"].replace("https://vinaris.example", ""))
    assert served.status_code == 200
    assert served.headers["content-type"] == "image/jpeg"
    assert Image.open(io.BytesIO(served.content)).size == (1600, 800)
    rejected = env.client.post(
        "/api/v1/admin/email-campaigns/assets",
        data={"title": "Non immagine"},
        files={"file": ("note.txt", b"not an image", "text/plain")},
    )
    assert rejected.status_code == 422
    assert env.client.get("/api/v1/email/assets/..%2F..%2Fsecret.jpg").status_code == 404
