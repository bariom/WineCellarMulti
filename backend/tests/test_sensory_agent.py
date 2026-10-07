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
from app.schemas.sensory_agent import CompletedDimension, SensoryResearchRequest
from app.services import sensory_agent as agent
from app.services.openai_client import OpenAIResponse, TokenUsage
from app.services.shared_wine_data import resolve_shared_identity
from app.services.taste_profiles import SENSORY_DIMENSIONS


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
        "comparisons": [
            {
                "dimension": key,
                "agreement": "corroborated",
                "independent": True,
                "explanation": "Independent tasting notes agree.",
                "evidence": [
                    {"excerpt": trait["excerpt"], "source_url": trait["source_url"]},
                    {
                        "excerpt": "Full body, fresh acidity, firm tannins.",
                        "source_url": "https://critic.example/2020",
                    },
                ],
            }
            for key in ("body", "acidity", "tannin")
        ],
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
        web_sources=(
            {"url": "https://producer.example/2020", "title": "Technical sheet 2020"},
            {"url": "https://critic.example/2020", "title": "Independent review 2020"},
        ),
    )


def test_verified_proposal_preserves_evidence_and_baseline(setup):
    _, _, wine = setup
    result = agent.proposal_from_response(wine, response(output(wine)), {"body": 0.3})
    assert result.status == "ready"
    assert result.baseline == {"body": 0.3}
    assert result.dimensions["body"].value == 0.7
    assert any(source["title"] == "Technical sheet 2020" for source in result.sources)
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
            payload["comparisons"] = []
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


def test_candidates_are_scoped_deduplicated_and_include_manual_profiles(setup):
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
    assert [candidate.id for candidate in agent.candidate_wines(db, context, 20)] == [
        wine.id,
        manual.id,
    ]


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
    assert result.status == "failed" and result.cost_usd == Decimal("0.04")
    assert len(audits) == 2
    assert audits[0]["feature"] == "sensory_research"
    assert kwargs_seen["max_tool_calls"] == 4 and kwargs_seen["web_search"]
    assert '"vintage": "2020"' in kwargs_seen["user_prompt"]
    assert "verification_feedback" in kwargs_seen["user_prompt"]


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


def source_evidence(
    *,
    url="https://producer.example/2020",
    vintage="2020",
    scope="exact_vintage",
    publisher="Producer",
    excerpt="Wine 2020",
):
    return {
        "source_url": url,
        "excerpt": excerpt,
        "vintage": vintage,
        "scope": scope,
        "published_year": 2026,
        "publisher": publisher,
        "role": "producer",
    }


def complete_output(wine):
    payload = output(wine)
    descriptions = {
        "body": "Full-bodied wine",
        "acidity": "High fresh acidity",
        "tannin": "Firm tannins",
        "sweetness": "Dry wine, low sweetness",
        "aromatic_intensity": "Intense aromas",
        "fruit": "Pronounced fruit flavours",
        "wood": "Pronounced oak aromas",
        "spice": "Some spice in the finish",
        "minerality": "Pronounced mineral notes",
    }
    payload["identity_evidence"] = source_evidence(vintage=wine.vintage)
    payload["references"] = []
    payload["dimensions"] = {
        key: {
            **source_evidence(vintage=wine.vintage, excerpt=excerpt),
            "value": 0.7,
            "basis": "documented",
            "intensity_supported": True,
        }
        for key, excerpt in descriptions.items()
    }
    for comparison in payload["comparisons"]:
        key = comparison["dimension"]
        comparison["evidence"] = [
            source_evidence(vintage=wine.vintage, excerpt=descriptions[key]),
            source_evidence(
                url="https://critic.example/2020",
                vintage=wine.vintage,
                publisher="Independent critic",
                excerpt="An independent note: " + descriptions[key],
            ),
        ]
    return payload


def source_pages(payload):
    pages = {}

    def collect(item):
        if isinstance(item, dict):
            if "excerpt" in item and "source_url" in item:
                url = agent.public_source_url(item["source_url"])
                pages[url] = pages.get(url, "") + " " + item["excerpt"]
            for value in item.values():
                collect(value)
        elif isinstance(item, list):
            for value in item:
                collect(value)

    collect(payload)
    return pages


def complete_proposal(wine, payload, *, sources=(), source_texts=None):
    from dataclasses import replace

    supplied = response(payload)
    supplied = replace(supplied, web_sources=(*supplied.web_sources, *sources))
    return agent.proposal_from_response(
        wine,
        supplied,
        {"body": 0.1},
        prompt_version="4",
        source_texts=source_pages(payload) if source_texts is None else source_texts,
    )


@pytest.mark.parametrize(
    "dimension,excerpt",
    [
        ("tannin", "Tannini morbidi e vellutati"),
        ("tannin", "A full-bodied wine with soft tannins"),
        ("acidity", "buona la morbidezza in equilibrio con l'acidita"),
        ("aromatic_intensity", "Layers of complexity: cherry, sage and rosemary"),
        ("aromatic_intensity", "Cherry, sage and rosemary aromas"),
        ("wood", "Unoaked"),
        ("body", "Structured wine with a long, persistent finish"),
        ("fruit", "Cherry, raspberry and plum aromas"),
    ],
)
def test_complete_profile_rejects_known_intensity_confusions(setup, dimension, excerpt):
    _, _, wine = setup
    payload = complete_output(wine)
    payload["dimensions"][dimension]["excerpt"] = excerpt
    result = complete_proposal(wine, payload)
    assert result.complete_profile[dimension].value is None
    assert result.status == "incomplete"
    assert f"{dimension}:unsupported_intensity" in result.warnings


def test_complete_profile_separates_available_exact_and_corroborated(setup):
    _, _, wine = setup
    result = complete_proposal(wine, complete_output(wine))
    assert result.status == "ready"
    assert result.coverage == {
        "available": 9,
        "total": 9,
        "exact_vintage": 9,
        "corroborated": 3,
        "estimated": 0,
        "unknown": 0,
    }
    assert result.complete_profile["body"].origin == "corroborated"
    assert result.complete_profile["wood"].origin == "single_source"
    assert result.complete_profile["body"].value == 0.7  # Old estimate is not an input.


@pytest.mark.parametrize("year", [2000, None])
def test_historical_or_undated_nv_cannot_confirm_current_bottling(setup, year):
    _, _, wine = setup
    wine.vintage = "NV"
    payload = complete_output(wine)
    payload["identity_evidence"]["published_year"] = year
    for trait in payload["dimensions"].values():
        trait["published_year"] = year
    result = complete_proposal(wine, payload)
    assert not result.vintage_confirmed and result.status != "ready"
    assert result.coverage["available"] == 0


def test_generic_style_never_counts_as_exact_vintage(setup):
    _, _, wine = setup
    payload = complete_output(wine)
    payload["dimensions"]["body"]["scope"] = "wine_style"
    payload["dimensions"]["body"]["vintage"] = ""
    result = complete_proposal(wine, payload)
    assert result.complete_profile["body"].origin == "wine_style"
    assert result.coverage["estimated"] == 1 and result.coverage["exact_vintage"] == 8


def peer_references(wine, payload, *, same_wine=False, spread=False):
    from copy import deepcopy

    refs, sources = [], []
    for index in range(3):
        url = f"https://{'critic' if index else 'producer'}.example/reference-{index}"
        traits = deepcopy(payload["dimensions"])
        for trait in traits.values():
            if trait:
                trait.update(
                    source_evidence(
                        url=url,
                        vintage="2021",
                        publisher=f"Publisher {index % 2}",
                        excerpt=trait["excerpt"],
                    )
                )
                trait["value"] = 0.4 + (index * 0.2 if spread else index * 0.02)
        refs.append(
            {
                "name": wine.name if same_wine else f"Reference {index}",
                "producer": wine.producer if same_wine else f"Producer {index}",
                "vintage": "2021",
                "wine_type": "Red",
                "appellation": "Ticino",
                "grapes": ["Merlot"],
                "identity_confirmed": True,
                "production_style_matches": True,
                "identity_evidence": source_evidence(url=url, vintage="2021"),
                "production_evidence": [
                    source_evidence(excerpt="Target matured in French oak barrels"),
                    source_evidence(
                        url=url, vintage="2021", excerpt="Reference matured in French oak barrels"
                    ),
                ],
                "dimensions": traits,
            }
        )
        sources.append({"url": url, "title": "Documented reference"})
    payload["references"] = refs
    return sources


def test_peer_completion_is_documented_deterministic_and_never_overwrites_exact(setup):
    _, _, wine = setup
    wine.appellation = "Ticino"
    wine.grapes = [{"name": "Merlot", "percentage": 100}]
    payload = complete_output(wine)
    sources = peer_references(wine, payload)
    for key in payload["dimensions"]:
        if key != "body":
            payload["dimensions"][key] = None
    result = complete_proposal(wine, payload, sources=sources)
    assert result.status == "ready" and result.coverage["available"] == 9
    assert result.complete_profile["body"].value == 0.7
    assert result.complete_profile["acidity"].value == 0.42
    assert result.complete_profile["acidity"].origin == "similar_wines"
    assert len(result.complete_profile["acidity"].references) == 3
    assert result.complete_profile["acidity"].references[0].identity_evidence is not None
    assert len(result.complete_profile["acidity"].references[0].production_evidence) == 2


@pytest.mark.parametrize(
    "case",
    [
        "missing_grapes",
        "different_type",
        "different_appellation",
        "few_references",
        "uncited",
        "different_style",
        "missing_production_evidence",
        "disagreement",
    ],
)
def test_weak_or_incompatible_reference_wines_cannot_fill_gaps(setup, case):
    _, _, wine = setup
    wine.appellation = "Ticino"
    wine.grapes = [{"name": "Merlot"}]
    payload = complete_output(wine)
    sources = peer_references(wine, payload, spread=case == "disagreement")
    payload["dimensions"]["wood"] = None
    if case == "missing_grapes":
        wine.grapes = []
    elif case == "few_references":
        payload["references"] = payload["references"][:2]
    elif case == "uncited":
        sources = []
    else:
        for reference in payload["references"]:
            if case == "different_type":
                reference["wine_type"] = "White"
            if case == "different_appellation":
                reference["appellation"] = "Bordeaux"
            if case == "different_style":
                reference["production_style_matches"] = False
            if case == "missing_production_evidence":
                reference["production_evidence"] = []
    result = complete_proposal(wine, payload, sources=sources)
    assert result.complete_profile["wood"].value is None and result.status != "ready"


def test_conflicts_are_not_erased_by_reference_completion(setup):
    _, _, wine = setup
    payload = complete_output(wine)
    sources = peer_references(wine, payload, same_wine=True)
    payload["comparisons"][0]["agreement"] = "conflicting"
    result = complete_proposal(wine, payload, sources=sources)
    assert result.complete_profile["body"].value is None
    assert result.complete_profile["body"].issue == "conflicting_sources"
    assert len(result.complete_profile["body"].evidence) == 2
    assert (
        next(item for item in result.comparisons if item.dimension == "body").agreement
        == "conflicting"
    )
    assert result.status != "ready"


def test_same_wine_nearby_vintage_is_explicit_style_estimate(setup):
    _, _, wine = setup
    payload = complete_output(wine)
    sources = peer_references(wine, payload, same_wine=True)
    payload["dimensions"]["wood"] = None
    result = complete_proposal(wine, payload, sources=sources)
    assert result.complete_profile["wood"].origin == "wine_style"
    assert result.complete_profile["wood"].confidence <= 0.4


def test_apply_complete_profile_persists_provenance_and_legacy_generator_preserves_it(setup):
    from app.services.taste_profiles import generate_wine_sensory_profile

    db, context, wine = setup
    proposal = complete_proposal(wine, complete_output(wine))
    proposal.baseline = {}
    run = SensoryAgentRun(
        household_id=context.household.id,
        user_id=context.user.id,
        status="completed",
        results=[proposal.model_dump(mode="json")],
    )
    db.add(run)
    db.commit()
    routes.apply_research(run.id, wine.id, db, context)
    profile = db.scalar(select(WineSensoryProfile))
    assert len(profile.dimensions) == 9 and len(profile.provenance) == 9
    assert profile.provenance["body"]["origin"] == "corroborated"
    assert not profile.validated
    before = dict(profile.dimensions)
    assert generate_wine_sensory_profile(db, wine, force_refresh=True) is profile
    assert profile.dimensions == before


def test_complete_schema_requires_nullable_fields_and_forbids_extra_properties():
    from app.schemas.sensory_agent import CompleteResearchOutput

    schema = CompleteResearchOutput.model_json_schema()
    for item in [schema, *schema["$defs"].values()]:
        if item.get("type") == "object":
            assert set(item["required"]) == set(item["properties"])
            assert item["additionalProperties"] is False


@pytest.mark.parametrize("page_text", ["", "This page says nothing about this wine."])
def test_cited_url_without_verified_excerpt_cannot_support_a_profile(setup, page_text):
    _, _, wine = setup
    payload = complete_output(wine)
    pages = {url: page_text for url in source_pages(payload)}
    proposal = complete_proposal(wine, payload, source_texts=pages)
    assert not proposal.vintage_confirmed
    assert proposal.status == "no_evidence"
    assert proposal.coverage["available"] == 0
    assert any(warning.startswith("source_excerpt_unverified:") for warning in proposal.warnings)


def test_validating_preserves_provenance_but_manual_changes_clear_it(setup):
    from app.api.routes import taste_profiles
    from app.schemas.taste_profile import SensoryProfileUpdate

    db, context, wine = setup
    proposal = complete_proposal(wine, complete_output(wine))
    profile = WineSensoryProfile(
        identity_id=wine.shared_identity_id,
        dimensions={key: item.value for key, item in proposal.complete_profile.items()},
        provenance={
            key: item.model_dump(mode="json") for key, item in proposal.complete_profile.items()
        },
        source="ai",
        confidence=0.6,
        generation_status="available",
    )
    db.add(profile)
    db.commit()
    validated = taste_profiles.update_sensory_profile(
        wine.shared_identity_id,
        SensoryProfileUpdate(dimensions=profile.dimensions, validated=True),
        db,
        context,
    )
    assert len(validated.provenance) == 9 and validated.validated
    changed = taste_profiles.update_sensory_profile(
        wine.shared_identity_id,
        SensoryProfileUpdate(dimensions={**profile.dimensions, "body": 0.2}),
        db,
        context,
    )
    assert changed.provenance == {} and changed.dimensions["body"] == 0.2


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
    assert prompt.id == "wine.sensory_research" and prompt.version == "7"
    assert "Italian" in prompt.user and "Test wine" in prompt.user
    assert "Never invent" in prompt.system and "untrusted data" in prompt.system
    assert "Missing evidence means null" in prompt.system and "vintage_confirmed" in prompt.system
    assert "Research in phases" in prompt.system
    assert "reference wine's own vintage" in prompt.system
    assert "Do not paraphrase quotations" in prompt.system


def test_v4_malformed_output_is_rejected(setup):
    _, _, wine = setup
    result = agent.proposal_from_response(
        wine, OpenAIResponse("not JSON", TokenUsage()), {}, prompt_version="4", source_texts={}
    )
    assert result.status == "failed" and result.issue == "invalid_output"
    assert all(item.value is None for item in result.complete_profile.values())


@pytest.mark.parametrize(
    "dimension,excerpt",
    [
        ("body", "Ett fylligt vin"),
        ("body", "Un vin ample et puissant"),
        ("body", "Ein vollmundiger Wein"),
        ("acidity", "Frisk fruktsyra"),
        ("sweetness", "Torrt vitt vin"),
        ("fruit", "Fruktig och saftig"),
        ("fruit", "Fruity with ripe strawberry flavours"),
        ("wood", "Liten fatkaraktar med vanilj"),
        ("spice", "a hint of ginger spice"),
    ],
)
def test_intensity_guards_accept_source_language_without_translating_quotes(
    setup, dimension, excerpt
):
    from app.schemas.sensory_agent import SourceTrait
    from app.services.sensory_completion import supports_intensity

    _, _, wine = setup
    data = complete_output(wine)["dimensions"][dimension]
    data["excerpt"] = excerpt
    assert supports_intensity(dimension, SourceTrait.model_validate(data))


def test_fresh_fruit_aroma_does_not_establish_acidity(setup):
    from app.schemas.sensory_agent import SourceTrait
    from app.services.sensory_completion import supports_intensity

    _, _, wine = setup
    data = complete_output(wine)["dimensions"]["acidity"]
    data["excerpt"] = "Fresh grapefruit and white flower aromas"
    assert not supports_intensity("acidity", SourceTrait.model_validate(data))


@pytest.mark.parametrize(
    "dimension,excerpt",
    [
        ("aromatic_intensity", "Il Palagio: a full-bodied wine with cherry aromas"),
        ("spice", "Full-bodied with firm tannins"),
        ("minerality", "A powerful nose of ripe cherry"),
    ],
)
def test_intensity_of_another_trait_cannot_support_the_requested_dimension(
    setup, dimension, excerpt
):
    from app.schemas.sensory_agent import SourceTrait
    from app.services.sensory_completion import supports_intensity

    _, _, wine = setup
    data = complete_output(wine)["dimensions"][dimension]
    data["excerpt"] = excerpt
    assert not supports_intensity(dimension, SourceTrait.model_validate(data))


def test_v5_reports_distinguish_failed_retrieval_from_unmatched_quotations(setup, monkeypatch):
    import app.services.sensory_completion as completion
    from app.services.score_sources import DocumentText

    _, _, wine = setup
    payload = complete_output(wine)
    monkeypatch.setattr(
        completion,
        "read_public_document",
        lambda url, **kwargs: DocumentText(status="unavailable", http_status=403),
    )
    failed = agent.proposal_from_response(wine, response(payload), {}, prompt_version="5")
    assert failed.prompt_version == "5" and failed.status == "no_evidence"
    assert failed.complete_profile["tannin"].issue == "source_unreadable"
    assert all(check.http_status == 403 for check in failed.source_checks.values())
    monkeypatch.setattr(
        completion,
        "read_public_document",
        lambda url, **kwargs: DocumentText(
            text="Different text", status="readable", http_status=200
        ),
    )
    unmatched = agent.proposal_from_response(wine, response(payload), {}, prompt_version="5")
    assert unmatched.complete_profile["tannin"].issue == "unverified_excerpt"
    assert all(check.unmatched_excerpts > 0 for check in unmatched.source_checks.values())


def test_source_page_is_read_once_per_cited_url(setup, monkeypatch):
    import app.services.sensory_completion as completion

    _, _, wine = setup
    payload = complete_output(wine)
    pages = source_pages(payload)
    calls = []

    def fetch(url):
        calls.append(url)
        return pages.get(url, "")

    from app.services.score_sources import DocumentText

    monkeypatch.setattr(
        completion,
        "read_public_document",
        lambda url, **kwargs: DocumentText(text=fetch(url), status="readable"),
    )
    result = agent.proposal_from_response(wine, response(payload), {}, prompt_version="4")
    assert result.status == "ready"
    assert len(calls) == len(set(calls)) == 2


@pytest.mark.parametrize("case", ["single", "copied", "same_host", "uncited", "conflict"])
def test_comparison_requires_independent_verified_sources(setup, case):
    _, _, wine = setup
    payload = output(wine)
    for item in payload["comparisons"]:
        if case == "single":
            item["evidence"] = item["evidence"][:1]
        elif case == "copied":
            item["independent"] = False
        elif case == "same_host":
            item["evidence"][1]["source_url"] = "https://producer.example/2020"
        elif case == "uncited":
            item["evidence"][1]["source_url"] = "https://invented.example/2020"
        else:
            item["agreement"] = "conflicting"
    result = agent.proposal_from_response(wine, response(payload), {})
    assert result.status == "incomplete"
    assert result.issue == ("conflicting_sources" if case == "conflict" else "weak_evidence")


def test_high_confidence_internal_estimates_are_researched(setup):
    db, context, wine = setup
    db.add(
        WineSensoryProfile(
            identity_id=wine.shared_identity_id,
            source="ai",
            confidence=0.95,
            generation_status="available",
        )
    )
    db.flush()
    assert [item.id for item in agent.candidate_wines(db, context, 5)] == [wine.id]


def test_prompt_requires_external_comparison_without_internal_anchoring():
    prompt = wine_sensory_research_prompt(wine_context={"vintage": "2016"}, locale="en")
    assert "independent external" in prompt.system
    assert "unvalidated" in prompt.system and "must not anchor" in prompt.system
    assert (
        "copied producer text" in prompt.system and "contradictory vintage labels" in prompt.system
    )


def test_apply_does_not_save_uncorroborated_dimensions(setup):
    db, context, wine = setup
    payload = output(wine)
    payload["dimensions"]["fruit"] = dict(payload["dimensions"]["body"], value=0.8)
    proposal = agent.proposal_from_response(wine, response(payload), {})
    assert proposal.status == "ready" and "fruit" in proposal.dimensions
    run = SensoryAgentRun(
        household_id=context.household.id,
        user_id=context.user.id,
        status="completed",
        results=[proposal.model_dump(mode="json")],
    )
    db.add(run)
    db.commit()
    routes.apply_research(run.id, wine.id, db, context)
    profile = db.scalar(select(WineSensoryProfile))
    assert set(profile.dimensions) == {"body", "acidity", "tannin"}


def test_previous_reports_remain_readable():
    from app.schemas.sensory_agent import SensoryResearchResult

    old = SensoryResearchResult.model_validate(
        {
            "wine_id": str(uuid4()),
            "name": "Wine",
            "producer": "Producer",
            "vintage": "2020",
            "status": "ready",
        }
    )
    assert old.comparisons == [] and old.prompt_version == "2"


def test_explicit_selection_only_schedules_requested_wines_in_order(setup):
    db, context, wine = setup
    second = make_wine(db, context.household, name="Second wine")
    db.commit()
    run = routes.start_research(
        SensoryResearchRequest(max_wines=2, wine_ids=[second.id, wine.id]),
        BackgroundTasks(),
        db,
        context,
    )
    assert run.selected_wines == 2
    assert db.get(SensoryAgentRun, run.id).wine_ids == [str(second.id), str(wine.id)]


@pytest.mark.parametrize("case", ["foreign", "missing", "over_limit"])
def test_explicit_selection_rejects_unavailable_wines(setup, case):
    db, context, wine = setup
    target_id = wine.id
    if case == "foreign":
        other = Household(name="Other")
        db.add(other)
        db.flush()
        target_id = make_wine(db, other, name="Private").id
    elif case == "missing":
        target_id = uuid4()
    ids = [target_id]
    if case == "over_limit":
        ids.append(make_wine(db, context.household, name="Second").id)
    db.commit()
    with pytest.raises(HTTPException) as exc:
        routes.start_research(
            SensoryResearchRequest(max_wines=1, wine_ids=ids), BackgroundTasks(), db, context
        )
    assert exc.value.status_code == 422
    assert db.scalar(select(SensoryAgentRun)) is None


def test_candidate_endpoint_scopes_and_deduplicates_wines(setup):
    db, context, wine = setup
    other = Household(name="Other")
    db.add(other)
    db.flush()
    make_wine(db, other, name="Private")
    make_wine(db, context.household)
    protected = make_wine(db, context.household, name="Protected")
    db.add(WineSensoryProfile(identity_id=protected.shared_identity_id, validated=True))
    db.commit()
    app = FastAPI()
    app.include_router(routes.router)
    app.dependency_overrides[get_db] = lambda: db
    app.dependency_overrides[get_current_context] = lambda: context
    with TestClient(app) as client:
        url = "/taste-profile/admin/research-runs/candidates"
        response = client.get(url)
        assert response.status_code == 200
        assert [item["id"] for item in response.json()] == [str(wine.id), str(protected.id)]
        context.user.is_app_admin = False
        assert client.get(url).status_code == 403


@pytest.mark.parametrize("ids", [[], [uuid4() for _ in range(21)]])
def test_explicit_selection_has_bounded_nonempty_request(ids):
    from pydantic import ValidationError

    with pytest.raises(ValidationError):
        SensoryResearchRequest(wine_ids=ids)


@pytest.mark.parametrize("source,validated", [("metadata", True), ("manual", False)])
def test_worker_researches_existing_profiles_without_changing_them(
    setup, monkeypatch, source, validated
):
    db, context, wine = setup
    import app.services.sensory_completion as completion
    from app.services.score_sources import DocumentText

    monkeypatch.setattr(
        completion,
        "read_public_document",
        lambda url, **kwargs: DocumentText(
            text=source_pages(complete_output(wine)).get(url, ""), status="readable"
        ),
    )
    profile = WineSensoryProfile(
        identity_id=wine.shared_identity_id,
        source=source,
        validated=validated,
        dimensions={"body": 0.3, "wood": 0.8},
        confidence=0.9,
        generation_status="available",
    )
    db.add(profile)
    db.commit()
    started = routes.start_research(
        SensoryResearchRequest(wine_ids=[wine.id]), BackgroundTasks(), db, context
    )
    monkeypatch.setattr(ai, "get_or_create_user_ai_settings", lambda *args: object())
    monkeypatch.setattr(ai, "select_ai_provider", lambda *args: ("application", "unused"))
    monkeypatch.setattr(ai, "maximum_billable_cost_usd", lambda **kwargs: Decimal("0.2"))
    monkeypatch.setattr(ai, "reservation_pricing_model", lambda *args: "test")
    requests = []

    def fake_response(*args, **kwargs):
        requests.append(kwargs)
        return response(complete_output(wine)), "application"

    monkeypatch.setattr(ai, "create_ai_response", fake_response)
    monkeypatch.setattr(ai, "record_ai_audit", lambda *args, **kwargs: None)
    agent.run_sensory_research(started.id, context.household.id, context.session.id)
    run = db.get(SensoryAgentRun, started.id)
    db.refresh(run)
    db.refresh(profile)
    assert run.status == "completed" and len(run.results) == 1
    result = run.results[0]
    assert result["baseline"] == {"body": 0.3, "wood": 0.8}
    assert result["baseline_source"] == source and result["baseline_validated"] == validated
    assert result["baseline_confidence"] == 0.9
    assert profile.dimensions == {"body": 0.3, "wood": 0.8}
    assert profile.source == source and profile.validated == validated
    assert "baseline" not in requests[0]["user_prompt"]
    with pytest.raises(HTTPException) as exc:
        routes.apply_research(started.id, wine.id, db, context)
    assert exc.value.status_code == 409


def completion_output(wine, *, ambiguous=False, research=None):
    return {
        "name": wine.name,
        "producer": wine.producer,
        "vintage": wine.vintage,
        "identity_ambiguous": ambiguous,
        "summary": "Profilo atteso completo con stime dichiarate.",
        "limitations": "Intensità inferite; annata e composizione non confermate.",
        "research": research,
        "estimates": {
            key: {
                "value": 0.5,
                "lower": 0.3,
                "upper": 0.7,
                "evidence": [],
                "rationale": "Stima dello stile atteso; mancano prove sull'intensità.",
            }
            for key in SENSORY_DIMENSIONS
        },
    }


def test_completion_fills_nine_traits_without_sources_and_preserves_baseline(setup):
    _, _, wine = setup
    first = agent.proposal_from_response(wine, response({}), {"body": 0.95}, prompt_version="6")
    completed = agent.complete_with_estimates(wine, first, response(completion_output(wine)))
    assert completed.status == "ready" and completed.coverage["available"] == 9
    assert completed.coverage["inferred"] == 9 and not completed.vintage_confirmed
    assert completed.baseline == {"body": 0.95} and completed.cost_usd == Decimal("0.04")
    assert completed.confidence == 0 and completed.sources == []
    for item in completed.complete_profile.values():
        assert item.origin == "ai_inference" and item.value == 0.5 and item.rationale
        assert item.lower <= item.value <= item.upper and not item.evidence


def test_completion_retains_checked_values_conflicts_and_broadens_narrow_ranges(setup):
    _, _, wine = setup
    first = complete_proposal(wine, complete_output(wine))
    first.complete_profile["tannin"] = CompletedDimension(issue="conflicting_sources")
    payload = completion_output(wine)
    payload["estimates"]["tannin"].update(lower=0.5, upper=0.5)
    completed = agent.complete_with_estimates(wine, first, response(payload))
    assert completed.complete_profile["body"].value == 0.7
    tannin = completed.complete_profile["tannin"]
    assert tannin.origin == "ai_inference" and tannin.issue == "conflicting_sources"
    assert tannin.lower == 0.35 and tannin.upper == 0.65


@pytest.mark.parametrize(
    "invalid", ["missing_trait", "missing_premises", "out_of_range", "reversed_range", "identity"]
)
def test_completion_rejects_malformed_or_wrong_identity_without_losing_research(setup, invalid):
    _, _, wine = setup
    first = complete_proposal(wine, complete_output(wine))
    payload = completion_output(wine)
    if invalid == "missing_trait":
        del payload["estimates"]["fruit"]
    elif invalid == "missing_premises":
        del payload["estimates"]["fruit"]["evidence"]
    elif invalid == "out_of_range":
        payload["estimates"]["fruit"]["value"] = 1.5
    elif invalid == "reversed_range":
        payload["estimates"]["fruit"].update(lower=0.9, upper=0.1)
    else:
        payload["producer"] = "Another producer"
    before = first.complete_profile["body"].model_dump()
    completed = agent.complete_with_estimates(wine, first, response(payload))
    assert completed.complete_profile["body"].model_dump() == before
    assert completed.cost_usd == Decimal("0.04") and completed.warnings


@pytest.mark.parametrize("ambiguous", [False, True])
@pytest.mark.parametrize("version", ["6", "7"])
def test_estimated_profile_apply_preserves_inference_and_blocks_ambiguous_identity(
    setup, ambiguous, version
):
    db, context, wine = setup
    first = agent.proposal_from_response(wine, response({}), {}, prompt_version=version)
    result = agent.complete_with_estimates(
        wine, first, response(completion_output(wine, ambiguous=ambiguous))
    )
    run = SensoryAgentRun(
        household_id=context.household.id,
        user_id=context.user.id,
        wine_ids=[str(wine.id)],
        status="completed",
        results=[result.model_dump(mode="json")],
    )
    db.add(run)
    db.commit()
    if ambiguous:
        assert result.coverage["available"] == 9 and result.status == "incomplete"
        with pytest.raises(HTTPException) as exc:
            routes.apply_research(run.id, wine.id, db, context)
        assert exc.value.status_code == 422
        assert agent.sensory_profile_for_wine(db, wine) is None
    else:
        applied = routes.apply_research(run.id, wine.id, db, context)
        assert applied.results[0].status == "applied"
        profile = agent.sensory_profile_for_wine(db, wine)
        assert len(profile.dimensions) == 9 and not profile.validated
        assert profile.provenance["body"]["inference_basis"] == "model_knowledge"
        assert profile.provenance["body"]["origin"] == "ai_inference"
        assert profile.provenance["body"]["rationale"]
        assert profile.provenance["body"]["lower"] == 0.3


@pytest.mark.parametrize("failed_completion", [False, True])
def test_research_feedback_loop_accounts_cost_and_keeps_paid_first_pass(
    setup, monkeypatch, failed_completion
):
    db, context, wine = setup
    import app.services.sensory_completion as completion
    from app.services.score_sources import DocumentText

    monkeypatch.setattr(
        completion,
        "read_public_document",
        lambda *args, **kwargs: DocumentText(status="cloudflare_challenge", http_status=403),
    )
    monkeypatch.setattr(ai, "get_or_create_user_ai_settings", lambda *args: object())
    monkeypatch.setattr(ai, "select_ai_provider", lambda *args: ("application", "unused"))
    monkeypatch.setattr(ai, "maximum_billable_cost_usd", lambda **kwargs: Decimal("0.2"))
    monkeypatch.setattr(ai, "reservation_pricing_model", lambda *args: "test")
    calls, audits = [], []

    def fake_response(*args, **kwargs):
        calls.append(kwargs)
        if len(calls) == 1:
            return response(complete_output(wine)), "application"
        if failed_completion:
            raise RuntimeError("Provider unavailable")
        return response(completion_output(wine)), "application"

    monkeypatch.setattr(ai, "create_ai_response", fake_response)
    monkeypatch.setattr(ai, "record_ai_audit", lambda *args, **kwargs: audits.append(kwargs))
    # A budget covering research alone must prevent spending before completion is affordable.
    assert agent.research_wine(db, context, wine, Decimal("0.3")) is None and not calls
    result = agent.research_wine(db, context, wine, Decimal("1"))
    assert [c["max_tool_calls"] for c in calls] == [6, 4]
    assert "cloudflare_challenge" in calls[1]["user_prompt"]
    assert "baseline" not in calls[1]["user_prompt"]
    if failed_completion:
        assert result.cost_usd == Decimal("0.02") and len(audits) == 1
        assert "completion_failed" in result.warnings
    else:
        assert result.cost_usd == Decimal("0.04") and len(audits) == 2
        assert result.coverage["available"] == 9 and result.status == "ready"


def test_refinement_verifies_alternative_sources_without_reopening_blocked_pages(
    setup, monkeypatch
):
    _, _, wine = setup
    from dataclasses import replace

    import app.services.sensory_completion as completion
    from app.services.score_sources import DocumentText

    payload = complete_output(wine)
    alternative = json.loads(
        json.dumps(payload)
        .replace("producer.example", "alternative.example")
        .replace("critic.example", "reviewer.example")
    )
    pages = source_pages(alternative)
    reads = []

    def read(url, **kwargs):
        reads.append(url)
        if url in pages:
            return DocumentText(text=pages[url], status="readable")
        return DocumentText(status="cloudflare_challenge", http_status=403)

    monkeypatch.setattr(completion, "read_public_document", read)
    cache = {}
    first = agent.proposal_from_response(
        wine, response(payload), {}, prompt_version="6", document_cache=cache
    )
    assert first.coverage["available"] == 0
    revised = replace(
        response(completion_output(wine, research=alternative)),
        web_sources=tuple({"url": url, "title": "Accessible alternative"} for url in pages),
    )
    completed = agent.complete_with_estimates(
        wine, first, revised, previous_sources=response(payload).web_sources, document_cache=cache
    )
    assert completed.status == "ready" and completed.vintage_confirmed
    assert completed.coverage["inferred"] == 0
    assert completed.complete_profile["body"].origin == "corroborated"
    assert completed.complete_profile["body"].value == 0.7
    assert len(reads) == len(set(reads))
    assert any(check.status == "cloudflare_challenge" for check in completed.source_checks.values())


def test_refinement_uncited_sources_never_become_verified_intensities(setup):
    _, _, wine = setup
    from dataclasses import replace

    first = agent.proposal_from_response(wine, response({}), {}, prompt_version="6")
    supplied = replace(
        response(completion_output(wine, research=complete_output(wine))), web_sources=()
    )
    completed = agent.complete_with_estimates(wine, first, supplied)
    assert completed.status == "ready" and completed.coverage["inferred"] == 9
    assert completed.coverage["exact_vintage"] == 0 and not completed.vintage_confirmed
    assert not completed.sources and not completed.dimensions


def test_completion_prompt_and_strict_schema():
    from app.prompts.sensory_agent import wine_sensory_completion_prompt
    from app.schemas.sensory_agent import SensoryCompletionOutput

    prompt = wine_sensory_completion_prompt(
        wine_context={"vintage": "2016"}, feedback={"issue": "source_unreadable"}, locale="it"
    )
    assert prompt.id == "wine.sensory_completion" and prompt.version == "3"
    assert "Italian" in prompt.user and "2016" in prompt.user
    assert "untrusted data" in prompt.system and "must not anchor" in prompt.system
    assert "ALL nine estimates" in prompt.system and "Do not retry Cloudflare" in prompt.system
    assert "not a statistical confidence interval" in prompt.system
    assert "evidence must list verbatim source excerpts" in prompt.system
    assert "including analytical values and production methods" in prompt.system
    assert "Follow vintage_verified" in prompt.system
    assert "Grape sugar concentration" in prompt.system
    assert "fermentation can consume it" in prompt.system
    schema = SensoryCompletionOutput.model_json_schema()
    for item in [schema, *schema["$defs"].values()]:
        if item.get("type") == "object":
            assert item["additionalProperties"] is False
            assert set(item["required"]) == set(item["properties"])


@pytest.mark.parametrize("locale", ["it", "en"])
def test_checked_report_does_not_repeat_unverified_identity_claims(setup, locale):
    _, _, wine = setup
    first = agent.proposal_from_response(wine, response({}), {}, prompt_version="7")
    payload = completion_output(wine)
    payload["summary"] = "Identity and vintage confirmed; 100% Merlot."
    completed = agent.complete_with_estimates(wine, first, response(payload), locale=locale)
    assert completed.status == "ready" and completed.coverage["available"] == 9
    assert not completed.identity_confirmed and not completed.vintage_confirmed
    assert "100% Merlot" not in completed.summary
    assert "100% Merlot" in completed.agent_summary
    assert (
        "Annata non confermata" if locale == "it" else "Vintage not confirmed"
    ) in completed.summary
    assert completed.coverage["qualitative"] == 0
    assert all(i.inference_basis == "model_knowledge" for i in completed.complete_profile.values())


@pytest.mark.parametrize("status", ["readable", "cloudflare_challenge", "http_error", "uncited"])
def test_completion_checks_qualitative_premises_without_validating_intensity(
    setup, monkeypatch, status
):
    _, _, wine = setup
    from dataclasses import replace

    import app.services.sensory_completion as completion
    from app.services.score_sources import DocumentText

    premise = source_evidence(vintage=wine.vintage, excerpt="Notes of oak and spice")
    reads = []

    def read(url, **kwargs):
        reads.append(url)
        return DocumentText(
            text=premise["excerpt"] if status == "readable" else "",
            status=status,
            http_status=429 if status == "http_error" else None,
        )

    monkeypatch.setattr(completion, "read_public_document", read)
    first = agent.proposal_from_response(wine, response({}), {}, prompt_version="7")
    payload = completion_output(wine)
    payload["estimates"]["wood"]["evidence"] = [premise]
    payload["estimates"]["spice"]["evidence"] = [premise]
    supplied = response(payload)
    if status == "uncited":
        supplied = replace(supplied, web_sources=())
    completed = agent.complete_with_estimates(wine, first, supplied, document_cache={})
    item = completed.complete_profile["wood"]
    assert item.value == 0.5 and item.origin == "ai_inference" and item.confidence == 0
    assert completed.confidence == 0 and not completed.vintage_confirmed
    if status == "readable":
        assert item.inference_basis == "verified_description" and item.evidence
        assert item.issue == "unsupported_intensity"
        assert not item.unverified_evidence and completed.coverage["qualitative"] == 2
        assert completed.source_checks[premise["source_url"]].matched_excerpts == 1
    else:
        assert item.inference_basis == "unverified_source" and not item.evidence
        assert item.unverified_evidence and completed.coverage["qualitative"] == 0
    assert len(reads) == (0 if status == "uncited" else 1)


def test_refinement_keeps_new_qualitative_evidence_when_intensity_is_unknown(setup, monkeypatch):
    _, _, wine = setup
    import app.services.sensory_completion as completion
    from app.services.score_sources import DocumentText

    payload = complete_output(wine)
    payload["dimensions"] = {key: None for key in SENSORY_DIMENSIONS}
    payload["comparisons"] = []
    payload["dimensions"]["wood"] = {
        **source_evidence(vintage=wine.vintage, excerpt="Notes of oak"),
        "value": 0.5,
        "basis": "inferred",
        "intensity_supported": False,
    }
    pages = source_pages(payload)
    monkeypatch.setattr(
        completion,
        "read_public_document",
        lambda url, **kwargs: DocumentText(text=pages.get(url, ""), status="readable"),
    )
    first = agent.proposal_from_response(wine, response({}), {}, prompt_version="7")
    completed = agent.complete_with_estimates(
        wine, first, response(completion_output(wine, research=payload)), document_cache={}
    )
    assert completed.complete_profile["wood"].inference_basis == "verified_description"
    assert completed.complete_profile["wood"].issue == "unsupported_intensity"
    assert completed.complete_profile["wood"].evidence[0].excerpt == "Notes of oak"
    assert completed.coverage["qualitative"] == 1 and completed.confidence == 0


@pytest.mark.parametrize("verified_quotes", [0, 1])
def test_unreadable_comparison_does_not_create_source_conflict(setup, verified_quotes):
    _, _, wine = setup
    payload = complete_output(wine)
    comparison = payload["comparisons"][0]
    comparison["agreement"] = "conflicting"
    pages = source_pages(payload) if verified_quotes else {}
    pages.pop("https://critic.example/2020", None)
    checked = complete_proposal(wine, payload, source_texts=pages)
    assert checked.complete_profile["body"].issue != "conflicting_sources"
    assert "body:unverified_conflict" in checked.warnings
