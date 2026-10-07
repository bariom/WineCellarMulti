import json
from decimal import Decimal

import pytest
from fastapi import HTTPException
from test_sensory_agent import make_wine
from test_sensory_agent import setup as shared_setup  # noqa: F401

from app.api.routes import ai
from app.api.routes import taste_profiles as routes
from app.core.config import settings
from app.models import Household, SensoryProfileBaseline, WineSensoryProfile
from app.prompts.sensory_refinement import wine_sensory_refinement_prompt
from app.schemas.sensory_refinement import SensoryRefinementOutput
from app.schemas.taste_profile import SensoryProfileUpdate
from app.services.ai_models import select_ai_model
from app.services.openai_client import OpenAIResponse, TokenUsage
from app.services.score_sources import DocumentText
from app.services.sensory_refinement import checked_estimates
from app.services.taste_profiles import SENSORY_DIMENSIONS, infer_sensory_profile

URL = "https://producer.example/barolo-2020"
HEADING = "Producer Barolo 2020"


@pytest.fixture
def setup(request, monkeypatch):
    monkeypatch.setattr(settings, "wine_sensory_ai_enabled", True)
    return request.getfixturevalue("shared_setup")


def payload():
    proof = dict(
        excerpt="Full-bodied with bright acidity",
        attribution_excerpt=HEADING,
        source_url=URL,
        scope="exact_vintage",
        vintage="2020",
        publisher="Producer",
        role="producer",
        published_year=None,
    )
    estimate = dict(
        value=0.68,
        lower=0.55,
        upper=0.8,
        rationale="Stima del peso al palato dalla descrizione; resta un intervallo interpretativo.",
        evidence=[proof],
    )
    return dict(
        name="Barolo",
        producer="Producer",
        vintage="2020",
        identity_evidence=dict(proof, excerpt=HEADING),
        dimensions={key: estimate if key == "body" else None for key in SENSORY_DIMENSIONS},
    )


def response(data):
    return OpenAIResponse(
        text=json.dumps(data),
        usage=TokenUsage(),
        model="gpt-6-astra",
        charged_cost_usd=Decimal(".05"),
        web_search_calls=2,
        web_sources=({"url": URL, "title": "Producer"},),
    )


def source_reader(monkeypatch, text=None):
    monkeypatch.setattr(
        "app.services.score_sources.read_public_document",
        lambda *args, **kwargs: DocumentText(
            status="readable", text=text or HEADING + " Full-bodied with bright acidity"
        ),
    )


@pytest.mark.parametrize(
    "shares,expected", [([80, 20], 0.76), ([20, 80], 0.34), ([None, None], 0.55)]
)
def test_baselines_respect_blend_percentages(setup, shares, expected):
    db, _, wine = setup
    wine.grapes = [
        {"name": name, **({"percentage_from": share} if share is not None else {})}
        for name, share in zip(["A", "B"], shares, strict=True)
    ]
    for name, body in [("a", 0.9), ("b", 0.2)]:
        db.add(
            SensoryProfileBaseline(
                entity_type="grape", entity_key=name, dimensions={"body": body}, confidence=0.7
            )
        )
    db.flush()
    assert infer_sensory_profile(db, wine)[0]["body"] == pytest.approx(expected)


def test_number_of_grapes_does_not_multiply_the_family_weight(setup):
    db, _, wine = setup
    wine.appellation = "DOC"
    wine.grapes = [{"name": "A"}, {"name": "B"}, {"name": "A"}]
    for kind, name, value in [
        ("appellation", "doc", 0.8),
        ("grape", "a", 0.4),
        ("grape", "b", 0.6),
    ]:
        db.add(
            SensoryProfileBaseline(
                entity_type=kind, entity_key=name, dimensions={"body": value}, confidence=0.7
            )
        )
    db.flush()
    assert infer_sensory_profile(db, wine)[0]["body"] == 0.6875


def test_refinement_keeps_continuous_estimate_and_honest_provenance(setup, monkeypatch):
    _, _, wine = setup
    source_reader(monkeypatch)
    checked = checked_estimates(wine, response(payload()))
    assert checked["body"].value == 0.68
    assert checked["body"].origin == "ai_inference"
    assert checked["body"].sensory_support == "description"
    assert checked["body"].lower == 0.55 and "acidity" not in checked


@pytest.mark.parametrize(
    "change",
    [
        "malformed",
        "unknown",
        "wrong_wine",
        "wrong_vintage",
        "uncited",
        "unreadable",
        "narrow",
        "fabricated",
        "context",
    ],
)
def test_refinement_rejects_bad_or_weak_evidence(setup, monkeypatch, change):
    _, _, wine = setup
    source_reader(monkeypatch)
    data = payload()
    if change == "malformed":
        data = []
    elif change == "unknown":
        data["dimensions"]["body"] = None
    elif change == "wrong_wine":
        data["name"] = "Other"
    elif change == "wrong_vintage":
        data["identity_evidence"]["vintage"] = "2019"
    elif change == "uncited":
        data["identity_evidence"]["source_url"] = "https://invented.example/wine"
    elif change == "unreadable":
        source_reader(monkeypatch, "Access denied")
    elif change == "narrow":
        data["dimensions"]["body"].update(lower=0.67, upper=0.69)
    elif change == "fabricated":
        data["dimensions"]["body"]["evidence"][0]["excerpt"] = "Invented high body"
    elif change == "context":
        data["dimensions"]["body"]["evidence"][0]["excerpt"] = "100% Nebbiolo"
        source_reader(monkeypatch, HEADING + " 100% Nebbiolo")
    with pytest.raises(HTTPException) as exc:
        checked_estimates(wine, response(data))
    assert exc.value.status_code == 422


@pytest.mark.parametrize("case", ["metadata", "manual", "validated"])
def test_refinement_route_is_opt_in_billed_and_preserves_other_dimensions(setup, monkeypatch, case):
    db, context, wine = setup
    profile = WineSensoryProfile(
        identity_id=wine.shared_identity_id,
        dimensions={"body": 0.5, "fruit": 0.6},
        source="manual" if case == "manual" else "metadata",
        validated=case == "validated",
        confidence=0.35,
    )
    db.add(profile)
    db.commit()
    source_reader(monkeypatch)
    seen, audit = {}, {}

    def generate(*args, **kwargs):
        seen.update(kwargs)
        return response(payload()), "credits"

    monkeypatch.setattr(ai, "create_ai_response", generate)
    monkeypatch.setattr(ai, "get_or_create_user_ai_settings", lambda *args: object())
    monkeypatch.setattr(ai, "record_ai_audit", lambda *args, **kwargs: audit.update(kwargs))
    result = routes.refine_sensory_profile(wine.shared_identity_id, db, context)
    assert result.dimensions == {"body": 0.68, "fruit": 0.6}
    assert not result.validated and result.estimated_cost_usd == "0.05"
    assert seen["model"] == settings.openai_sensory_refinement_model
    assert seen["reasoning_effort"] == "high" and seen["max_tool_calls"] == 5
    assert audit["feature"] == "wine.sensory_refinement" and "system_prompt" not in audit
    assert result.provenance["body"].calculation_method == "contextual_research_v1"
    assert result.is_proposal and result.baseline_dimensions == {"body": 0.5, "fruit": 0.6}
    db.refresh(profile)
    assert profile.dimensions == {"body": 0.5, "fruit": 0.6}
    assert profile.validated == (case == "validated")
    assert profile.source == ("manual" if case == "manual" else "metadata")
    saved = routes.update_sensory_profile(
        wine.shared_identity_id,
        SensoryProfileUpdate(
            dimensions=result.dimensions,
            validated=False,
            expected_baseline_revision=result.baseline_revision,
        ),
        db,
        context,
    )
    assert saved.dimensions["body"] == 0.68 and not saved.validated
    with pytest.raises(HTTPException) as exc:
        routes.update_sensory_profile(
            wine.shared_identity_id,
            SensoryProfileUpdate(
                dimensions=result.dimensions,
                expected_baseline_revision=result.baseline_revision,
            ),
            db,
            context,
        )
    assert exc.value.status_code == 409


def test_foreign_profiles_do_not_make_provider_calls(setup, monkeypatch):
    db, context, wine = setup
    profile = WineSensoryProfile(
        identity_id=wine.shared_identity_id,
        dimensions={"body": 0.5},
        source="manual",
        validated=True,
    )
    db.add(profile)
    other = Household(name="Other")
    db.add(other)
    db.flush()
    wine.household_id = other.id
    db.commit()
    monkeypatch.setattr(
        ai, "create_ai_response", lambda *args, **kwargs: pytest.fail("Must not call provider")
    )
    with pytest.raises(HTTPException) as exc:
        routes.refine_sensory_profile(wine.shared_identity_id, db, context)
    assert exc.value.status_code == 404


def test_missing_profile_is_created_only_when_proposal_is_applied(setup, monkeypatch):
    from sqlalchemy import select

    db, context, wine = setup
    source_reader(monkeypatch)
    monkeypatch.setattr(
        ai, "create_ai_response", lambda *args, **kwargs: (response(payload()), "credits")
    )
    monkeypatch.setattr(ai, "get_or_create_user_ai_settings", lambda *args: object())
    monkeypatch.setattr(ai, "record_ai_audit", lambda *args, **kwargs: None)
    result = routes.refine_sensory_profile(wine.shared_identity_id, db, context)
    assert result.is_proposal and result.baseline_dimensions == {}
    assert db.scalar(select(WineSensoryProfile)) is None
    saved = routes.update_sensory_profile(
        wine.shared_identity_id,
        SensoryProfileUpdate(
            dimensions=result.dimensions,
            validated=True,
            expected_baseline_revision=result.baseline_revision,
        ),
        db,
        context,
    )
    assert saved.validated and saved.dimensions["body"] == 0.68


@pytest.mark.parametrize("case", ["invalid_result", "concurrent_validation"])
def test_failed_research_retains_profile_and_audits_usage(setup, monkeypatch, case):
    db, context, wine = setup
    profile = WineSensoryProfile(
        identity_id=wine.shared_identity_id,
        dimensions={"body": 0.5},
        source="metadata",
    )
    db.add(profile)
    db.commit()
    source_reader(monkeypatch)
    audit = {}

    def generate(*args, **kwargs):
        if case == "concurrent_validation":
            profile.validated = True
            db.commit()
        return response([] if case == "invalid_result" else payload()), "credits"

    monkeypatch.setattr(ai, "create_ai_response", generate)
    monkeypatch.setattr(ai, "get_or_create_user_ai_settings", lambda *args: object())
    monkeypatch.setattr(ai, "record_ai_audit", lambda *args, **kwargs: audit.update(kwargs))
    with pytest.raises(HTTPException) as exc:
        routes.refine_sensory_profile(wine.shared_identity_id, db, context)
    assert exc.value.status_code == (422 if case == "invalid_result" else 409)
    db.refresh(profile)
    assert profile.dimensions == {"body": 0.5}
    assert profile.validated == (case == "concurrent_validation")
    assert audit["feature"] == "wine.sensory_refinement"


def test_astra_selection_and_prompt_contract(monkeypatch):
    monkeypatch.setattr(settings, "openai_enable_gpt56", False)
    assert (
        select_ai_model(
            "sensory_refinement", requested_model=settings.openai_sensory_refinement_model
        ).model
        == "gpt-6-astra"
    )
    for locale, language in [("it", "Italian"), ("en", "English")]:
        prompt = wine_sensory_refinement_prompt(wine_context={"name": "Testamatta"}, locale=locale)
        assert prompt.id == "wine.sensory_refinement" and prompt.version == "1"
        assert language in prompt.system and "untrusted" in prompt.system
        assert "not the numerical estimate" in prompt.system
    schema = SensoryRefinementOutput.model_json_schema()
    for definition in [schema, *schema["$defs"].values()]:
        if definition.get("type") == "object":
            assert definition["additionalProperties"] is False
            assert set(definition["required"]) == set(definition["properties"])


def test_profile_search_and_pagination_include_missing_identities(setup):
    db, context, wine = setup
    for index in range(32):
        item = make_wine(db, context.household, name=f"Search wine {index:02}")
        db.add(WineSensoryProfile(identity_id=item.shared_identity_id, dimensions={"body": 0.5}))
    db.commit()

    def listing(**kwargs):
        return routes.list_sensory_profiles(
            db=db,
            context=context,
            search=kwargs.pop("search", None),
            offset=kwargs.pop("offset", 0),
            limit=kwargs.pop("limit", 30),
            **kwargs,
        )

    first = listing(search="search WINE")
    second = listing(search="search WINE", offset=30)
    assert len(first) == 30 and len(second) == 2
    assert not {item["identity_id"] for item in first} & {item["identity_id"] for item in second}
    assert len(listing(search="Producer", limit=50)) == 32
    assert len(listing(search="2020", limit=50)) == 32
    assert [item["name"] for item in listing(search="Barolo", missing=True)] == [wine.name]
    assert not listing(search="absent", missing=True)
    assert not listing(search="Barolo", missing=True, producer="Other")
