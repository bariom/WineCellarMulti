import json
from datetime import UTC, datetime, timedelta
from decimal import Decimal
from uuid import uuid4

import pytest
from fastapi import BackgroundTasks, FastAPI, HTTPException
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, select
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.api.deps import CurrentContext, get_current_context
from app.api.routes import ai
from app.api.routes import sensory_agent as routes
from app.core.legal import LEGAL_DOCUMENT_VERSION
from app.db.base import Base
from app.db.session import get_db
from app.models import (
    Household,
    Membership,
    SensoryAgentRun,
    User,
    UserSession,
    Wine,
    WineSensoryProfile,
)
from app.prompts.sensory_agent import wine_sensory_research_prompt
from app.schemas.sensory_agent import SensoryResearchRequest
from app.services import sensory_agent as agent
from app.services.openai_client import OpenAIResponse, TokenUsage
from app.services.shared_wine_data import resolve_shared_identity


def make_wine(db, household, *, name="Barolo"):
    wine = Wine(
        household_id=household.id, name=name, producer="Producer", vintage="2020", type="Red"
    )
    db.add(wine)
    db.flush()
    resolve_shared_identity(db, wine, create=True)
    db.flush()
    return wine


@pytest.fixture
def setup(monkeypatch):
    engine = create_engine(
        "sqlite+pysqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(engine)
    factory = sessionmaker(bind=engine)
    monkeypatch.setattr(agent, "SessionLocal", factory)
    with factory() as db:
        home = Household(name="Cellar")
        user = User(
            email="agent@example.test",
            display_name="Admin",
            password_hash="unused",
            is_app_admin=True,
            privacy_policy_version=LEGAL_DOCUMENT_VERSION,
            terms_version=LEGAL_DOCUMENT_VERSION,
            privacy_policy_accepted_at=datetime.now(UTC),
            terms_accepted_at=datetime.now(UTC),
        )
        db.add_all([home, user])
        db.flush()
        membership = Membership(user_id=user.id, household_id=home.id, role="owner")
        session = UserSession(
            user_id=user.id,
            active_household_id=home.id,
            token_hash="test-hash",
            expires_at=datetime.now(UTC) + timedelta(days=1),
        )
        db.add_all([membership, session])
        db.flush()
        context = CurrentContext(user=user, household=home, membership=membership, session=session)
        wine = make_wine(db, home)
        db.commit()
        yield db, context, wine
    engine.dispose()


def output(wine):
    trait = {
        "value": 0.7,
        "basis": "documented",
        "excerpt": "Full bodied with fresh acidity and firm tannins.",
        "source_url": "https://producer.example/2020",
    }
    return {
        "name": wine.name,
        "producer": wine.producer,
        "vintage": wine.vintage,
        "identity_confirmed": True,
        "vintage_confirmed": True,
        "summary": "Un vino strutturato.",
        "limitations": "Profilo atteso.",
        "dimensions": {
            key: dict(trait) if key in {"body", "acidity", "tannin"} else None
            for key in agent.ResearchOutput.model_fields["dimensions"].annotation.model_fields
        },
        "aromas": [
            {"name": "ciliegia", "excerpt": "Cherry aromas", "source_url": trait["source_url"]}
        ],
    }


def response(payload):
    return OpenAIResponse(
        text=json.dumps(payload),
        usage=TokenUsage(),
        model="test",
        charged_cost_usd=Decimal("0.02"),
        web_sources=({"url": "https://producer.example/2020", "title": "Technical sheet 2020"},),
    )


def test_verified_proposal_preserves_evidence_and_baseline(setup):
    _, _, wine = setup
    result = agent.proposal_from_response(wine, response(output(wine)), {"body": 0.3})
    assert result.status == "ready"
    assert result.baseline == {"body": 0.3}
    assert result.dimensions["body"].value == 0.7
    assert result.sources[0]["title"] == "Technical sheet 2020"
    assert result.cost_usd == Decimal("0.02")


@pytest.mark.parametrize(
    "change,expected",
    [
        ("malformed", "failed"),
        ("mismatch", "no_evidence"),
        ("uncited", "no_evidence"),
        ("unknown_year", "incomplete"),
        ("weak", "incomplete"),
        ("invalid_value", "failed"),
        ("unknown_dimension", "failed"),
        ("not_object", "failed"),
    ],
)
def test_untrusted_and_weak_outputs_are_not_ready(setup, change, expected):
    _, _, wine = setup
    payload = output(wine)
    if change == "malformed":
        result = agent.proposal_from_response(wine, OpenAIResponse("bad json", TokenUsage()), {})
    else:
        if change == "mismatch":
            payload["producer"] = "Another producer"
        if change == "uncited":
            for trait in payload["dimensions"].values():
                if trait:
                    trait["source_url"] = "https://invented.example/"
        if change == "unknown_year":
            payload["vintage_confirmed"] = False
        if change == "weak":
            for trait in payload["dimensions"].values():
                if trait:
                    trait["basis"] = "inferred"
        if change == "invalid_value":
            payload["dimensions"]["body"]["value"] = 2
        if change == "unknown_dimension":
            payload["dimensions"]["rating"] = None
        if change == "not_object":
            payload = []
        result = agent.proposal_from_response(wine, response(payload), {})
    assert result.status == expected


@pytest.mark.parametrize(
    "url",
    [
        "http://127.0.0.1/a",
        "http://169.254.169.254/",
        "https://user:password@producer.example/a",
        "javascript:alert(1)",
        "http://localhost/a",
        "https://secret.internal/a",
    ],
)
def test_private_or_unsafe_sources_rejected(url):
    assert not agent.public_source_url(url)


def test_candidates_are_scoped_deduplicated_and_protect_manual_profiles(setup):
    db, context, wine = setup
    other = Household(name="Other")
    db.add(other)
    db.flush()
    make_wine(db, other, name="Private wine")
    make_wine(db, context.household)  # Same canonical identity.
    manual = make_wine(db, context.household, name="Manual")
    db.add(
        WineSensoryProfile(identity_id=manual.shared_identity_id, source="manual", confidence=0.1)
    )
    db.flush()
    assert [candidate.id for candidate in agent.candidate_wines(db, context, 20)] == [wine.id]


def test_budget_check_prevents_provider_call(setup, monkeypatch):
    db, context, wine = setup
    monkeypatch.setattr(ai, "get_or_create_user_ai_settings", lambda *args: object())
    monkeypatch.setattr(ai, "select_ai_provider", lambda *args: ("application", "unused"))
    monkeypatch.setattr(ai, "maximum_billable_cost_usd", lambda **kwargs: Decimal("0.2"))
    monkeypatch.setattr(ai, "reservation_pricing_model", lambda *args: "test")
    monkeypatch.setattr(
        ai,
        "create_ai_response",
        lambda *args, **kwargs: pytest.fail("Budget must block provider call"),
    )
    assert agent.research_wine(db, context, wine, Decimal("0.1")) is None


def test_research_records_no_result_cost_and_audit(setup, monkeypatch):
    db, context, wine = setup
    monkeypatch.setattr(ai, "get_or_create_user_ai_settings", lambda *args: object())
    monkeypatch.setattr(ai, "select_ai_provider", lambda *args: ("application", "unused"))
    monkeypatch.setattr(ai, "maximum_billable_cost_usd", lambda **kwargs: Decimal("0.2"))
    monkeypatch.setattr(ai, "reservation_pricing_model", lambda *args: "test")
    kwargs_seen = {}

    def fake_response(*args, **kwargs):
        kwargs_seen.update(kwargs)
        return OpenAIResponse("{}", TokenUsage(), charged_cost_usd=Decimal("0.02")), "application"

    monkeypatch.setattr(ai, "create_ai_response", fake_response)
    audits = []
    monkeypatch.setattr(ai, "record_ai_audit", lambda *args, **kwargs: audits.append(kwargs))
    result = agent.research_wine(db, context, wine, Decimal("1"))
    assert result.status == "failed" and result.cost_usd == Decimal("0.02")
    assert audits[0]["feature"] == "sensory_research"
    assert kwargs_seen["max_tool_calls"] == 3 and kwargs_seen["web_search"]
    assert '"vintage": "2020"' in kwargs_seen["user_prompt"]
    assert 'Requested vintage (annata richiesta): "2020"' in kwargs_seen["user_prompt"]


@pytest.mark.parametrize("vintage", ["", "   "])
def test_missing_vintage_does_not_call_ai(setup, monkeypatch, vintage):
    db, context, wine = setup
    wine.vintage = vintage
    monkeypatch.setattr(ai, "create_ai_response", lambda *args, **kwargs: pytest.fail("No vintage"))
    result = agent.research_wine(db, context, wine, Decimal("1"))
    assert result.status == "skipped" and result.issue == "missing_vintage"
    assert result.cost_usd == 0


def test_worker_persists_proposals_without_mutating_profiles(setup, monkeypatch):
    db, context, wine = setup
    run = SensoryAgentRun(
        household_id=context.household.id, user_id=context.user.id, wine_ids=[str(wine.id)]
    )
    db.add(run)
    db.commit()
    monkeypatch.setattr(
        agent,
        "research_wine",
        lambda _db, _ctx, w, _remaining: agent.proposal_from_response(w, response(output(w)), {}),
    )
    agent.run_sensory_research(run.id, context.household.id, context.session.id)
    db.refresh(run)
    assert run.status == "completed" and len(run.results) == 1
    assert run.cost_usd == Decimal("0.02")
    assert db.scalar(select(WineSensoryProfile)) is None


def test_worker_stops_if_session_revoked(setup, monkeypatch):
    db, context, wine = setup
    run = SensoryAgentRun(
        household_id=context.household.id, user_id=context.user.id, wine_ids=[str(wine.id)]
    )
    db.add(run)
    db.delete(context.session)
    db.commit()
    monkeypatch.setattr(
        agent, "research_wine", lambda *args: pytest.fail("Revoked session must prevent research")
    )
    agent.run_sensory_research(run.id, context.household.id, context.session.id)
    db.refresh(run)
    assert run.status == "failed" and not run.results


def test_duplicate_submission_is_rejected(setup):
    db, context, _ = setup
    first = routes.start_research(SensoryResearchRequest(), BackgroundTasks(), db, context)
    assert first.status == "queued"
    assert first.max_wines == 10 and first.selected_wines == 1
    with pytest.raises(HTTPException) as exc:
        routes.start_research(SensoryResearchRequest(), BackgroundTasks(), db, context)
    assert exc.value.status_code == 409


def ready_run(db, context, wine):
    proposal = agent.proposal_from_response(wine, response(output(wine)), {})
    run = SensoryAgentRun(
        household_id=context.household.id,
        user_id=context.user.id,
        status="completed",
        results=[proposal.model_dump(mode="json")],
    )
    db.add(run)
    db.commit()
    return run


@pytest.mark.parametrize("protected", [False, True])
def test_apply_is_explicit_and_protects_validated_profiles(setup, protected):
    db, context, wine = setup
    run = ready_run(db, context, wine)
    if protected:
        db.add(
            WineSensoryProfile(
                identity_id=wine.shared_identity_id, dimensions={"body": 0.9}, validated=True
            )
        )
        db.commit()
        with pytest.raises(HTTPException) as exc:
            routes.apply_research(run.id, wine.id, db, context)
        assert exc.value.status_code == 409
    else:
        result = routes.apply_research(run.id, wine.id, db, context)
        assert result.results[0].status == "applied"
        profile = db.scalar(select(WineSensoryProfile))
        assert (
            profile.source == "ai" and not profile.validated and profile.dimensions["body"] == 0.7
        )


def test_api_requires_admin_and_scopes_run_reads(setup):
    db, context, wine = setup
    run = ready_run(db, context, wine)
    app = FastAPI()
    app.include_router(routes.router)
    app.dependency_overrides[get_db] = lambda: db
    app.dependency_overrides[get_current_context] = lambda: context
    with TestClient(app) as client:
        prefix = "/taste-profile/admin/research-runs"
        assert client.get(f"{prefix}/{run.id}").status_code == 200
        assert client.get(f"{prefix}/{uuid4()}").status_code == 404
        other = Household(name="Other")
        db.add(other)
        db.flush()
        run.household_id = other.id
        db.commit()
        assert client.get(f"{prefix}/{run.id}").status_code == 404
        context.user.is_app_admin = False
        assert client.get(prefix).status_code == 403


def test_prompt_has_identity_grounding_language_and_no_invention():
    prompt = wine_sensory_research_prompt(wine_context={"name": "Test wine"}, locale="it")
    assert prompt.id == "wine.sensory_research" and prompt.version == "2"
    assert "Italian" in prompt.user and "Test wine" in prompt.user
    assert "Never invent" in prompt.system and "untrusted data" in prompt.system
    assert "Missing evidence means null" in prompt.system and "vintage_confirmed" in prompt.system
