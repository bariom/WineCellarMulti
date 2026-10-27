from __future__ import annotations

import json

# ruff: noqa: E501
from datetime import date
from decimal import Decimal
from types import SimpleNamespace

import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, event, select
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.api.routes import ai as ai_routes
from app.api.routes import taste_profiles as taste_profile_routes
from app.api.routes import wishlist as wishlist_routes
from app.core.legal import LEGAL_DOCUMENT_VERSION
from app.db.base import Base
from app.db.session import get_db
from app.main import app
from app.models import (
    ExternalWineTasting,
    Household,
    SensoryProfileBaseline,
    User,
    UserTasteProfile,
    UserTasteProfileRevision,
    UserWineRating,
    Wine,
    WineCatalogEntry,
    WineSensoryProfile,
    WineTastingEntry,
    WishlistItem,
    WishlistList,
)
from app.schemas.taste_profile import BatchEnrichmentRequest, TasteMatchBatchRequest
from app.services.shared_wine_data import resolve_shared_identity
from app.services.taste_profiles import (
    calculate_taste_match,
    calculate_taste_matches,
    calculate_wishlist_taste_match,
    claim_unassigned_tastings,
    compact_taste_context,
    confidence_level,
    generate_wine_sensory_profile,
    personal_neutral_rating,
    rating_weight,
    rebuild_user_taste_profile,
    record_user_wine_rating,
    tasting_preference_weight,
    unassigned_tasting_count,
    ranking_auc,
    validate_taste_profile_algorithms,
)

engine = create_engine(
    "sqlite+pysqlite:///:memory:", connect_args={"check_same_thread": False}, poolclass=StaticPool
)
Session = sessionmaker(bind=engine)


def setup_function() -> None:
    Base.metadata.drop_all(engine)
    Base.metadata.create_all(engine)


def make_wine(db, household, *, name="Barolo", wine_type="Red", rating=5):
    wine = Wine(
        household_id=household.id,
        name=name,
        producer="Producer",
        vintage="2020",
        type=wine_type,
        rating=rating,
    )
    db.add(wine)
    db.flush()
    resolve_shared_identity(db, wine, create=True)
    db.flush()
    return wine


def add_tasting(db, user, household, wine, rating):
    db.add(
        WineTastingEntry(
            wine_id=wine.id,
            household_id=household.id,
            created_by_user_id=user.id,
            consumed_at=date(2026, 1, 1),
            rating=rating,
        )
    )


def test_existing_shared_profile_is_reused_without_ai() -> None:
    db = Session()
    household = Household(name="Home")
    db.add(household)
    db.flush()
    wine = make_wine(db, household)
    first = generate_wine_sensory_profile(db, wine)
    assert first is not None and first.source == "metadata"
    called = False

    def ai(_wine):
        nonlocal called
        called = True
        return {"body": 0.9}, "test"

    second = generate_wine_sensory_profile(db, wine, allow_ai=True, ai_generate=ai)
    assert second is first
    assert not called


def test_admin_scope_separates_cellar_references_and_other_households(monkeypatch):
    from app.models import SharedWineFact

    db = Session()
    home, other = Household(name="Active"), Household(name="Other")
    user = User(email="scope@example.test", display_name="Admin", password_hash="x")
    db.add_all([home, other, user])
    db.flush()
    own = make_wine(db, home, name="Own wine")
    foreign = make_wine(db, other, name="Foreign wine")
    reference = make_wine(db, other, name="Reference wine")
    reference_id = reference.shared_identity_id
    db.add(SharedWineFact(identity_id=reference_id, feature="sensory_reference", payload={}))
    db.delete(reference)
    db.flush()
    context = SimpleNamespace(user=user, household=home)
    for scope, count in [("cellar", 1), ("references", 1), ("catalog", 3)]:
        assert taste_profile_routes.batch_preview(db, context, scope).missing == count
        assert (
            taste_profile_routes.sensory_profile_summary(db, context, scope)[
                "wines_without_profile"
            ]
            == count
        )
        rows = taste_profile_routes.list_sensory_profiles(
            missing=True, search=None, offset=0, limit=100, db=db, context=context, scope=scope
        )
        assert len(rows) == count
    # Global catalog can use public identities, never another household's metadata.
    candidates = taste_profile_routes._batch_candidates(db, context, "catalog")
    foreign_candidate = next(
        w for w in candidates if w.shared_identity_id == foreign.shared_identity_id
    )
    assert foreign_candidate.household_id is None and foreign_candidate.type == ""
    calls = []
    original = taste_profile_routes._generate_with_sensory_metadata

    def generate(db, wine, **kwargs):
        calls.append(wine.shared_identity_id)
        return original(db, wine, **kwargs)

    monkeypatch.setattr(taste_profile_routes, "_generate_with_sensory_metadata", generate)
    result = taste_profile_routes.enrich_missing_profiles(
        BatchEnrichmentRequest(scope="cellar", allow_ai=False), db, context
    )
    assert result["resolved"] == 1
    assert calls == [own.shared_identity_id]
    assert (
        db.scalar(select(WineSensoryProfile).where(WineSensoryProfile.identity_id == reference_id))
        is None
    )
    assert taste_profile_routes.batch_preview(db, context, "cellar").missing == 0
    assert taste_profile_routes.batch_preview(db, context, "references").missing == 1
    # A reference also held in the active cellar belongs to both scopes, once each.
    held = make_wine(db, home, name="Reference wine")
    assert held.shared_identity_id == reference_id
    assert taste_profile_routes.batch_preview(db, context, "cellar").missing == 1
    assert taste_profile_routes.batch_preview(db, context, "references").missing == 1


def test_validated_pending_profile_is_completed_instead_of_reused() -> None:
    db = Session()
    household = Household(name="Home")
    db.add(household)
    db.flush()
    wine = make_wine(db, household)
    pending = WineSensoryProfile(
        identity_id=wine.shared_identity_id,
        dimensions={},
        validated=True,
        generation_status="pending",
        source="missing",
    )
    db.add(pending)
    db.flush()

    profile = generate_wine_sensory_profile(db, wine)

    assert profile is pending
    assert profile.generation_status == "available"
    assert profile.dimensions


def test_baselines_are_blended_and_missing_dimensions_stay_missing() -> None:
    db = Session()
    household = Household(name="Home")
    db.add(household)
    db.flush()
    wine = make_wine(db, household, name="Nebbiolo", wine_type="")
    wine.grapes = [{"name": "Nebbiolo"}]
    db.add(
        SensoryProfileBaseline(
            entity_type="grape",
            entity_key="nebbiolo",
            dimensions={"body": 0.75, "tannin": 0.9},
            confidence=0.7,
        )
    )
    profile = generate_wine_sensory_profile(db, wine)
    assert profile is not None
    assert profile.source == "grape"
    assert profile.dimensions == {"body": 0.75, "tannin": 0.9}
    assert "sweetness" not in profile.dimensions


def test_ai_fallback_generates_a_profile_when_metadata_has_no_signal() -> None:
    db = Session()
    household = Household(name="Home")
    db.add(household)
    db.flush()
    wine = make_wine(db, household, name="Unknown", wine_type="")

    profile = generate_wine_sensory_profile(
        db,
        wine,
        allow_ai=True,
        ai_generate=lambda _wine: ({"body": 0.7, "fruit": 0.6}, "test-model"),
    )

    assert profile is not None
    assert profile.source == "ai"
    assert profile.dimensions == {"body": 0.7, "fruit": 0.6}
    assert profile.model == "test-model"


@pytest.mark.parametrize(
    "payload", [None, [], {}, {"body": 0.5}, "not-json", "invalid-number", "boolean"]
)
def test_ai_sensory_rejects_malformed_output(monkeypatch, payload) -> None:
    from app.services.taste_profiles import SENSORY_DIMENSIONS

    value = {key: None for key in SENSORY_DIMENSIONS}
    if payload == "invalid-number":
        value["body"] = 1.5
    elif payload == "boolean":
        value["body"] = True
    else:
        value = payload
    monkeypatch.setattr(taste_profile_routes.settings, "wine_sensory_ai_enabled", True)
    monkeypatch.setattr(
        taste_profile_routes,
        "create_response",
        lambda *args, **kwargs: SimpleNamespace(
            text="not-json" if payload == "not-json" else json.dumps(value), model="test-model"
        ),
    )
    wine = SimpleNamespace(
        name="La Luna dei Tempi",
        producer="Massucco",
        vintage="2019",
        type="",
        region="",
        appellation="",
        grapes=[],
        ai_notes="",
    )
    with pytest.raises(HTTPException) as error:
        taste_profile_routes._ai_sensory_profile(wine)
    assert error.value.status_code == 502
    assert error.value.detail == "AI returned an invalid sensory profile"


def test_all_null_sensory_output_does_not_abort_batch_or_invent_zeroes(monkeypatch) -> None:
    from app.services.taste_profiles import SENSORY_DIMENSIONS

    db = Session()
    household = Household(name="Home")
    user = User(email="admin-null@example.test", display_name="Admin", password_hash="x")
    db.add_all([household, user])
    db.flush()
    first = make_wine(db, household, name="Before abstention", wine_type="")
    unknown = make_wine(db, household, name="La Luna dei Tempi", wine_type="")
    unknown.producer = "Massucco"
    unknown.vintage = "2019"
    last = make_wine(db, household, name="After abstention", wine_type="")
    nulls = {key: None for key in SENSORY_DIMENSIONS}
    outputs = iter([{**nulls, "body": 0}, nulls, {**nulls, "body": 0.8}])
    monkeypatch.setattr(taste_profile_routes.settings, "wine_sensory_ai_enabled", True)
    monkeypatch.setattr(taste_profile_routes, "_ai_sensory_metadata", lambda _wine: ({}, ""))
    monkeypatch.setattr(
        taste_profile_routes,
        "create_response",
        lambda *args, **kwargs: SimpleNamespace(text=json.dumps(next(outputs)), model="test-model"),
    )
    result = taste_profile_routes.enrich_missing_profiles(
        BatchEnrichmentRequest(limit=3, allow_ai=True, scope="cellar"),
        db,
        SimpleNamespace(user=user, household=household),
    )
    assert result["processed"] == 3 and result["resolved"] == 2 and result["ai_generated"] == 2
    db.expire_all()
    for wine, expected in [(first, 0), (last, 0.8)]:
        profile = taste_profile_routes.sensory_profile_for_wine(db, wine)
        assert profile and profile.dimensions == {"body": expected}
        assert profile.generation_status == "available"
    missing = taste_profile_routes.sensory_profile_for_wine(db, unknown)
    assert missing is None or missing.generation_status == "pending"
    assert missing is None or not missing.dimensions


def test_all_null_sensory_output_keeps_existing_pending_profile(monkeypatch) -> None:
    from app.services.taste_profiles import SENSORY_DIMENSIONS

    db = Session()
    household = Household(name="Home")
    db.add(household)
    db.flush()
    wine = make_wine(db, household, wine_type="")
    pending = WineSensoryProfile(
        identity_id=wine.shared_identity_id,
        dimensions={},
        source="missing",
        generation_status="pending",
    )
    db.add(pending)
    db.flush()
    monkeypatch.setattr(taste_profile_routes.settings, "wine_sensory_ai_enabled", True)
    monkeypatch.setattr(
        taste_profile_routes,
        "create_response",
        lambda *args, **kwargs: SimpleNamespace(
            text=json.dumps({key: None for key in SENSORY_DIMENSIONS}), model="test-model"
        ),
    )
    generated = generate_wine_sensory_profile(
        db, wine, allow_ai=True, ai_generate=taste_profile_routes._ai_sensory_profile
    )
    assert generated is pending and generated.generation_status == "pending"
    assert not generated.dimensions and not generated.validated


def test_batch_skips_available_profiles_before_applying_ai_limit(monkeypatch) -> None:
    db = Session()
    household = Household(name="Home")
    user = User(email="admin@example.test", display_name="Admin", password_hash="x")
    db.add_all([household, user])
    db.flush()
    for name in ("Already Profiled 1", "Already Profiled 2"):
        wine = make_wine(db, household, name=name)
        db.add(
            WineSensoryProfile(
                identity_id=wine.shared_identity_id,
                dimensions={"body": 0.5},
                generation_status="available",
            )
        )
    missing = make_wine(db, household, name="Needs AI", wine_type="")
    db.flush()
    monkeypatch.setattr(
        taste_profile_routes,
        "_ai_sensory_profile",
        lambda _wine: ({"body": 0.7}, "test-model"),
    )
    monkeypatch.setattr(taste_profile_routes, "_ai_sensory_metadata", lambda _wine: ({}, ""))
    monkeypatch.setattr(taste_profile_routes.settings, "wine_sensory_ai_enabled", True)
    monkeypatch.setattr(taste_profile_routes.settings, "wine_sensory_ai_batch_max", 1)

    result = taste_profile_routes.enrich_missing_profiles(
        BatchEnrichmentRequest(limit=1), db, SimpleNamespace(user=user, household=household)
    )

    assert result == {
        "processed": 1,
        "resolved": 1,
        "ai_generated": 1,
        "skipped": 2,
        "ai_enabled": True,
    }
    profile = db.scalar(
        select(WineSensoryProfile).where(
            WineSensoryProfile.identity_id == missing.shared_identity_id
        )
    )
    assert profile is not None and profile.source == "ai"


def test_single_regeneration_creates_a_missing_profile_with_ai(monkeypatch) -> None:
    db = Session()
    household = Household(name="Home")
    user = User(email="admin@example.test", display_name="Admin", password_hash="x")
    db.add_all([household, user])
    db.flush()
    wine = make_wine(db, household, name="Needs Single AI", wine_type="")
    db.flush()
    assert (
        db.scalar(
            select(WineSensoryProfile).where(
                WineSensoryProfile.identity_id == wine.shared_identity_id
            )
        )
        is None
    )
    monkeypatch.setattr(
        taste_profile_routes,
        "_ai_sensory_profile",
        lambda _wine: ({"body": 0.8, "acidity": 0.6}, "test-model"),
    )
    monkeypatch.setattr(taste_profile_routes, "_ai_sensory_metadata", lambda _wine: ({}, ""))

    response = taste_profile_routes.regenerate_sensory_profile(
        wine.shared_identity_id, True, db, SimpleNamespace(user=user, household=household)
    )

    assert response.source == "ai"
    assert response.generation_status == "available"
    assert response.dimensions == {"body": 0.8, "acidity": 0.6}


def test_regeneration_completes_verified_metadata_before_profile(monkeypatch) -> None:
    db = Session()
    household = Household(name="Home")
    user = User(email="admin@example.test", display_name="Admin", password_hash="x")
    db.add_all([household, user])
    db.flush()
    wine = make_wine(db, household, name="Needs Metadata", wine_type="")
    wine.region = ""
    wine.appellation = ""
    wine.grapes = []
    monkeypatch.setattr(
        taste_profile_routes,
        "_ai_sensory_metadata",
        lambda _wine: (
            {
                "type": "Red",
                "region": "Veneto",
                "appellation": "Amarone della Valpolicella",
                "grapes": [{"name": "Corvina"}],
                "source_url": "https://example.test/wine",
                "source_title": "Producer technical sheet",
            },
            "metadata-model",
        ),
    )

    response = taste_profile_routes.regenerate_sensory_profile(
        wine.shared_identity_id, True, db, SimpleNamespace(user=user, household=household)
    )

    assert wine.type == "Red"
    assert wine.region == "Veneto"
    assert wine.appellation == "Amarone della Valpolicella"
    assert wine.grapes == [{"name": "Corvina"}]
    assert response.source == "metadata"
    profile = db.scalar(
        select(WineSensoryProfile).where(WineSensoryProfile.identity_id == wine.shared_identity_id)
    )
    assert profile is not None and profile.model == "metadata-model"


def test_admin_can_complete_metadata_for_a_validated_profile(monkeypatch) -> None:
    db = Session()
    household = Household(name="Home")
    user = User(email="admin@example.test", display_name="Admin", password_hash="x")
    db.add_all([household, user])
    db.flush()
    wine = make_wine(db, household, name="Metadata Upgrade", wine_type="Red")
    db.add(
        WineSensoryProfile(
            identity_id=wine.shared_identity_id,
            dimensions={"body": 0.55},
            source="wine_type",
            confidence=0.68,
            validated=True,
            generation_status="available",
        )
    )
    db.add(
        SensoryProfileBaseline(
            entity_type="grape",
            entity_key="nebbiolo",
            dimensions={"body": 0.7, "tannin": 0.8},
            confidence=0.85,
        )
    )
    db.commit()
    monkeypatch.setattr(
        taste_profile_routes,
        "_ai_sensory_metadata",
        lambda _wine, response_factory=None: (
            {
                "type": "Red",
                "region": "Piemonte",
                "appellation": "Langhe DOC",
                "grapes": [{"name": "Nebbiolo"}],
                "source_url": "https://example.test/wine",
                "source_title": "Producer technical sheet",
            },
            "metadata-model",
        ),
    )

    response = taste_profile_routes.complete_sensory_profile_metadata(
        wine.shared_identity_id,
        db,
        SimpleNamespace(user=user, household=household, has_active_entitlement=True),
    )

    assert response.metadata_updated == ["region", "appellation", "grapes"]
    assert response.validated is False
    assert response.source == "grape"
    assert wine.region == "Piemonte"
    assert wine.appellation == "Langhe DOC"
    assert wine.grapes == [{"name": "Nebbiolo"}]


def test_orphan_identity_is_previewed_and_generated_without_creating_a_wine(monkeypatch):
    db = Session()
    household = Household(name="Home")
    user = User(email="orphan@example.test", display_name="Admin", password_hash="x")
    db.add_all([household, user])
    db.flush()
    wine = make_wine(db, household, wine_type="")
    identity_id = wine.shared_identity_id
    db.delete(wine)
    db.commit()
    context = SimpleNamespace(user=user, household=household)
    monkeypatch.setattr(taste_profile_routes, "_ai_sensory_metadata", lambda w: ({}, ""))
    calls = []

    def ai(w):
        calls.append(w.name)
        return {"body": 0.7}, "test-model"

    monkeypatch.setattr(taste_profile_routes, "_ai_sensory_profile", ai)
    preview = taste_profile_routes.batch_preview(db, context)
    assert preview.missing == preview.requires_ai == 1
    response = taste_profile_routes.regenerate_sensory_profile(identity_id, True, db, context)
    assert response.source == "ai"
    assert calls == ["Barolo"]
    assert list(db.scalars(select(Wine))) == []
    assert taste_profile_routes.batch_preview(db, context).missing == 0
    db.delete(db.scalar(select(WineSensoryProfile)))
    db.commit()
    result = taste_profile_routes.enrich_missing_profiles(BatchEnrichmentRequest(), db, context)
    assert result["resolved"] == result["ai_generated"] == 1
    assert list(db.scalars(select(Wine))) == []


def test_ai_metadata_search_uses_a_small_single_search_budget(monkeypatch) -> None:
    request_options = {}

    def response(*_args, **kwargs):
        request_options.update(kwargs)
        return SimpleNamespace(
            text=(
                '{"vintage":"2022","type":"Red","region":"Veneto","appellation":"","grapes":[],'
                '"source_url":"https://example.test/wine","source_title":"Producer"}'
            ),
            model="test-model",
            web_sources=({"url": "https://example.test/wine", "title": "Producer"},),
        )

    monkeypatch.setattr(taste_profile_routes, "create_response", response)
    metadata, _model = taste_profile_routes._ai_sensory_metadata(
        SimpleNamespace(
            name="Rosso",
            producer="Producer",
            vintage="2022",
            type="",
            region="",
            appellation="",
            grapes=[],
        )
    )

    assert metadata["type"] == "Red"
    assert metadata["vintage"] == "2022"
    assert "vintage" in request_options["json_schema"]["schema"]["required"]
    assert request_options["web_search_context_size"] == "low"
    assert request_options["max_tool_calls"] == 1
    assert request_options["max_output_tokens"] == 800
    assert request_options["web_search_use_default_location"] is False


def test_most_specific_baseline_matches_qualified_appellation() -> None:
    db = Session()
    household = Household(name="Home")
    db.add(household)
    db.flush()
    wine = make_wine(db, household, name="Riserva", wine_type="")
    wine.appellation = "Chianti Classico Riserva DOCG"
    db.add_all(
        [
            SensoryProfileBaseline(
                entity_type="appellation",
                entity_key="chianti",
                dimensions={"body": 0.55},
                confidence=0.7,
            ),
            SensoryProfileBaseline(
                entity_type="appellation",
                entity_key="chianti classico",
                dimensions={"body": 0.72},
                confidence=0.8,
            ),
        ]
    )

    profile = generate_wine_sensory_profile(db, wine)

    assert profile is not None
    assert profile.source == "appellation"
    assert profile.dimensions == {"body": 0.72}


def test_rebuild_is_private_weighted_and_category_specific() -> None:
    db = Session()
    household = Household(name="Home")
    first_user = User(email="first@example.test", display_name="First", password_hash="x")
    second_user = User(email="second@example.test", display_name="Second", password_hash="x")
    db.add_all([household, first_user, second_user])
    db.flush()
    red = make_wine(db, household, name="Red")
    white = make_wine(db, household, name="White", wine_type="White")
    for wine, dimensions in (
        (red, {"body": 0.9, "tannin": 0.9, "acidity": 0.5}),
        (white, {"body": 0.2, "acidity": 0.8, "fruit": 0.8}),
    ):
        db.add(
            WineSensoryProfile(
                identity_id=wine.shared_identity_id,
                dimensions=dimensions,
                confidence=0.9,
                generation_status="available",
            )
        )
    add_tasting(db, first_user, household, red, 6)
    add_tasting(db, first_user, household, white, 4)  # positive: a 4/6 is a satisfactory tasting
    add_tasting(db, second_user, household, red, 1)
    db.commit()
    profiles = {
        profile.category: profile
        for profile in rebuild_user_taste_profile(
            db, household_id=household.id, user_id=first_user.id
        )
    }
    assert profiles["Red"].dimensions["body"]["preference"] > 0.8
    assert profiles["global"].dimensions["body"]["preference"] > 0.8
    assert profiles["White"].dimensions["body"]["preference"] > 0.5
    assert profiles["global"].sample_count == 2


def test_rebuild_excludes_unsupported_agent_traits() -> None:
    with Session() as db:
        household = Household(name="Home")
        user = User(email="proof@example.test", display_name="Taster", password_hash="x")
        db.add_all([household, user])
        db.flush()
        wine = make_wine(db, household)
        db.add(
            WineSensoryProfile(
                identity_id=wine.shared_identity_id,
                dimensions={"body": 0.75, "minerality": 0.9},
                confidence=0.8,
                provenance={"body": {"confidence": 0.55}, "minerality": {"confidence": 0}},
                generation_status="available",
            )
        )
        add_tasting(db, user, household, wine, 6)
        add_tasting(db, user, household, wine, 5)
        db.flush()
        profiles = rebuild_user_taste_profile(db, household_id=household.id, user_id=user.id)
        for profile in profiles:
            assert "body" in profile.dimensions
            assert "minerality" not in profile.dimensions


def test_rebuild_creates_dedicated_profiles_for_rose_and_fortified_wines() -> None:
    db = Session()
    household = Household(name="Home")
    user = User(email="categories@example.test", display_name="Categories", password_hash="x")
    db.add_all([household, user])
    db.flush()
    for wine_type, dimensions in (
        ("Rose", {"fruit": 0.8, "acidity": 0.7}),
        ("Fortified", {"body": 0.8, "sweetness": 0.7}),
    ):
        wine = make_wine(db, household, name=wine_type, wine_type=wine_type)
        db.add(
            WineSensoryProfile(
                identity_id=wine.shared_identity_id,
                dimensions=dimensions,
                confidence=0.9,
                generation_status="available",
            )
        )
        add_tasting(db, user, household, wine, 6)
    db.commit()

    profiles = {
        profile.category: profile
        for profile in rebuild_user_taste_profile(db, household_id=household.id, user_id=user.id)
    }

    assert profiles["Rose"].sample_count == 1
    assert profiles["Fortified"].sample_count == 1


def test_taste_match_prefers_closer_wine_and_suppresses_thin_data() -> None:
    db = Session()
    household = Household(name="Home")
    user = User(email="taste@example.test", display_name="Taste", password_hash="x")
    db.add_all([household, user])
    db.flush()
    liked = make_wine(db, household, name="Liked")
    close = make_wine(db, household, name="Close")
    distant = make_wine(db, household, name="Distant")
    for wine, dimensions in (
        (liked, {"body": 0.9, "tannin": 0.8, "fruit": 0.7, "spice": 0.7}),
        (close, {"body": 0.85, "tannin": 0.75, "fruit": 0.7, "spice": 0.65}),
        (distant, {"body": 0.1, "tannin": 0.1, "fruit": 0.1, "spice": 0.1}),
    ):
        db.add(
            WineSensoryProfile(
                identity_id=wine.shared_identity_id,
                dimensions=dimensions,
                confidence=0.9,
                generation_status="available",
            )
        )
    for index in range(5):
        add_tasting(db, user, household, liked, 6)
        db.flush()
        db.query(WineTastingEntry).order_by(WineTastingEntry.id.desc()).first().consumed_at = date(
            2026, 1, index + 1
        )
    db.commit()
    rebuild_user_taste_profile(db, household_id=household.id, user_id=user.id)
    assert (
        calculate_taste_match(db, user.id, close)["score"]
        > calculate_taste_match(db, user.id, distant)["score"]
    )


def test_taste_matches_batch_uses_fixed_query_count() -> None:
    db = Session()
    household = Household(name="Batch home")
    user = User(email="batch@example.test", display_name="Batch", password_hash="x")
    db.add_all([household, user])
    db.flush()
    wines = [make_wine(db, household, name=f"Candidate {index}") for index in range(5)]
    dimensions = {"body": 0.8, "acidity": 0.6, "fruit": 0.7, "spice": 0.5}
    for wine in wines:
        db.add(
            WineSensoryProfile(
                identity_id=wine.shared_identity_id,
                dimensions=dimensions,
                confidence=0.8,
                generation_status="available",
            )
        )
    db.add(
        UserTasteProfile(
            user_id=user.id,
            household_id=household.id,
            category="Red",
            dimensions={
                key: {"preference": value, "confidence": 0.8} for key, value in dimensions.items()
            },
            confidence=0.8,
            sample_count=5,
        )
    )
    db.flush()

    query_count = 0

    def count_query(*_args) -> None:
        nonlocal query_count
        query_count += 1

    event.listen(engine, "before_cursor_execute", count_query)
    try:
        matches = calculate_taste_matches(db, user.id, wines)
    finally:
        event.remove(engine, "before_cursor_execute", count_query)

    assert set(matches) == {wine.id for wine in wines}
    assert all(match["score"] is not None for match in matches.values())
    assert query_count == 5


def test_taste_match_batch_route_omits_hidden_and_other_household_wines() -> None:
    db = Session()
    household = Household(name="Visible home")
    other_household = Household(name="Other home")
    user = User(email="visible@example.test", display_name="Visible", password_hash="x")
    db.add_all([household, other_household, user])
    db.flush()
    visible = make_wine(db, household, name="Visible")
    visible.created_by_user_id = user.id
    hidden = make_wine(db, household, name="Hidden")
    elsewhere = make_wine(db, other_household, name="Elsewhere")
    db.flush()
    context = SimpleNamespace(
        household=household,
        user=user,
        membership=SimpleNamespace(role="member", visibility_scope="own"),
    )

    response = taste_profile_routes.wine_taste_matches(
        TasteMatchBatchRequest(wine_ids=[visible.id, hidden.id, elsewhere.id]), db, context
    )

    assert set(response.matches) == {visible.id}


def test_wishlist_taste_match_uses_shared_sensory_profile_without_creating_stock() -> None:
    db = Session()
    household = Household(name="Home")
    user = User(email="wishlist-taste@example.test", display_name="Taste", password_hash="x")
    db.add_all([household, user])
    db.flush()
    liked = make_wine(db, household, name="Liked")
    candidate = make_wine(db, household, name="Wishlist candidate")
    for wine, dimensions in (
        (liked, {"body": 0.9, "tannin": 0.8, "fruit": 0.7, "spice": 0.7}),
        (candidate, {"body": 0.85, "tannin": 0.75, "fruit": 0.7, "spice": 0.65}),
    ):
        db.add(
            WineSensoryProfile(
                identity_id=wine.shared_identity_id,
                dimensions=dimensions,
                confidence=0.9,
                generation_status="available",
            )
        )
    for index in range(5):
        add_tasting(db, user, household, liked, 6)
        db.flush()
        db.query(WineTastingEntry).order_by(WineTastingEntry.id.desc()).first().consumed_at = date(
            2026, 1, index + 1
        )
    wishlist_list = WishlistList(
        household_id=household.id, created_by_user_id=user.id, name="Wishlist"
    )
    db.add(wishlist_list)
    db.flush()
    wishlist_item = WishlistItem(
        household_id=household.id,
        wishlist_list_id=wishlist_list.id,
        name=candidate.name,
        producer=candidate.producer,
        vintage=candidate.vintage,
        type="Red",
    )
    db.add(wishlist_item)
    db.commit()
    rebuild_user_taste_profile(db, household_id=household.id, user_id=user.id)

    match = calculate_wishlist_taste_match(db, user.id, wishlist_item)

    assert match["score"] is not None
    assert match["score"] > 0.7
    candidate_profile = db.scalar(
        select(WineSensoryProfile).where(
            WineSensoryProfile.identity_id == candidate.shared_identity_id
        )
    )
    candidate_profile.generation_status = "pending"
    candidate_profile.confidence = 0
    assert calculate_wishlist_taste_match(db, user.id, wishlist_item)["score"] is not None
    candidate_profile.generation_status = "available"
    candidate_profile.confidence = 0.9
    candidate_profile.provenance = {
        "body": {"confidence": 0.8},
        "tannin": {"confidence": 0.8},
        "fruit": {"confidence": 0.2},
        "spice": {"confidence": 0},
    }
    weighted = calculate_wishlist_taste_match(db, user.id, wishlist_item)
    assert weighted["score"] is not None
    assert "spice" not in weighted["matching_traits"]
    db.query(UserTasteProfile).filter(UserTasteProfile.user_id == user.id).delete()
    db.flush()
    unavailable = calculate_wishlist_taste_match(db, user.id, wishlist_item)
    assert unavailable["score"] is None
    assert unavailable["unavailable_reason"] == "missing_user_profile"


def test_validated_profile_is_never_overwritten_and_invalid_ai_is_rejected() -> None:
    db = Session()
    household = Household(name="Home")
    db.add(household)
    db.flush()
    wine = make_wine(db, household, name="Manual")
    profile = WineSensoryProfile(
        identity_id=wine.shared_identity_id,
        dimensions={"body": 0.33},
        source="manual",
        confidence=1,
        validated=True,
        generation_status="available",
    )
    db.add(profile)
    db.flush()
    called = False

    def invalid_ai(_wine):
        nonlocal called
        called = True
        return {"body": 3, "tannin": -1}, "test"

    assert generate_wine_sensory_profile(db, wine, allow_ai=True, ai_generate=invalid_ai) is profile
    assert not called
    unprofiled = make_wine(db, household, name="Unknown", wine_type="")
    assert (
        generate_wine_sensory_profile(db, unprofiled, allow_ai=True, ai_generate=invalid_ai) is None
    )
    assert called


def test_rating_weight_is_negative_neutral_and_positive() -> None:
    assert rating_weight(1) == -1
    assert rating_weight(3) == 0
    assert rating_weight(4) > 0
    assert rating_weight(6) == 1
    assert rating_weight(0) == 0


def test_negative_enjoyment_strengthens_a_negative_tasting_signal() -> None:
    assert tasting_preference_weight(2, "negative") < rating_weight(2)
    assert tasting_preference_weight(5, "positive") > rating_weight(5)


def test_confidence_level_requires_both_quality_and_enough_tastings() -> None:
    assert confidence_level(0.8, tasting_count=9) == "emerging"
    assert confidence_level(0.8, tasting_count=19) == "probable"
    assert confidence_level(0.8, tasting_count=30) == "established"


def test_a_single_positive_tasting_produces_an_emerging_match() -> None:
    db = Session()
    household = Household(name="Home")
    user = User(email="emerging@example.test", display_name="Emerging", password_hash="x")
    db.add_all([household, user])
    db.flush()
    tasted = make_wine(db, household, name="Tasted")
    candidate = make_wine(db, household, name="Candidate")
    for wine in (tasted, candidate):
        db.add(
            WineSensoryProfile(
                identity_id=wine.shared_identity_id,
                dimensions={"body": 0.7, "acidity": 0.6, "fruit": 0.7},
                confidence=0.7,
                generation_status="available",
            )
        )
    add_tasting(db, user, household, tasted, 4)
    db.commit()

    rebuild_user_taste_profile(db, household_id=household.id, user_id=user.id)
    match = calculate_taste_match(db, user.id, candidate)

    assert match["score"] is not None
    assert 0 < match["confidence"] < 0.3


def test_wine_sensory_read_is_scoped_and_does_not_generate_profiles() -> None:
    db = Session()
    household = Household(name="Home")
    other = Household(name="Other")
    user = User(email="sensory-read@example.test", display_name="Reader", password_hash="x")
    db.add_all([household, other, user])
    db.flush()
    wine = make_wine(db, household)
    wine.created_by_user_id = user.id
    hidden = make_wine(db, household, name="Hidden")
    elsewhere = make_wine(db, other, name="Elsewhere")
    db.commit()
    context = SimpleNamespace(
        user=user,
        household=household,
        membership=SimpleNamespace(role="member", visibility_scope="own"),
    )
    assert taste_profile_routes.wine_sensory_profile(wine.id, db, context) is None
    assert db.scalar(select(WineSensoryProfile)) is None
    profile = WineSensoryProfile(
        identity_id=wine.shared_identity_id,
        dimensions={"body": 0.8, "fruit": 0, "wood": None},
        source="metadata",
        confidence=0.6,
        validated=False,
        generation_status="available",
    )
    db.add(profile)
    db.commit()
    response = taste_profile_routes.wine_sensory_profile(wine.id, db, context)
    assert response is not None
    assert response.dimensions == {"body": 0.8, "fruit": 0, "wood": None}
    assert response.source == "metadata"
    assert not db.dirty and not db.new
    for blocked in [hidden, elsewhere]:
        with pytest.raises(HTTPException) as error:
            taste_profile_routes.wine_sensory_profile(blocked.id, db, context)
        assert error.value.status_code == 404
    profile.generation_status = "pending"
    db.commit()
    assert taste_profile_routes.wine_sensory_profile(wine.id, db, context) is None
    db.close()


def test_wine_match_does_not_rebuild_a_missing_profile_during_a_list_read() -> None:
    """A wine-list render may request many matches concurrently."""
    db = Session()
    household = Household(name="Home")
    user = User(email="match-read@example.test", display_name="Match", password_hash="x")
    db.add_all([household, user])
    db.flush()
    wine = make_wine(db, household, name="Candidate")
    db.commit()

    response = taste_profile_routes.wine_taste_match(
        wine.id,
        db,
        SimpleNamespace(
            user=user,
            household=household,
            membership=SimpleNamespace(role="owner", visibility_scope="all"),
        ),
    )

    assert response.score is None
    assert db.scalar(select(UserTasteProfile.id).where(UserTasteProfile.user_id == user.id)) is None


def test_external_tasting_contributes_to_the_private_taste_match() -> None:
    db = Session()
    household = Household(name="Home")
    user = User(email="outside@example.test", display_name="Outside", password_hash="x")
    db.add_all([household, user])
    db.flush()
    tasted = make_wine(db, household, name="Tasted outside")
    candidate = make_wine(db, household, name="Candidate")
    for wine in (tasted, candidate):
        db.add(
            WineSensoryProfile(
                identity_id=wine.shared_identity_id,
                dimensions={"body": 0.7, "acidity": 0.6, "fruit": 0.7},
                confidence=0.7,
                generation_status="available",
            )
        )
    db.add(
        ExternalWineTasting(
            household_id=household.id,
            created_by_user_id=user.id,
            shared_identity_id=tasted.shared_identity_id,
            name=tasted.name,
            producer=tasted.producer,
            vintage=tasted.vintage,
            type=tasted.type,
            region=tasted.region,
            appellation=tasted.appellation,
            consumed_at=date(2026, 1, 1),
            rating=5,
            enjoyment="positive",
        )
    )
    db.commit()

    rebuild_user_taste_profile(db, household_id=household.id, user_id=user.id)

    assert calculate_taste_match(db, user.id, candidate)["score"] is not None


def test_explicit_external_tasting_enrichment_surfaces_ai_configuration_errors(monkeypatch) -> None:
    db = Session()
    household = Household(name="Home")
    user = User(email="outside-enrichment@example.test", display_name="Outside", password_hash="x")
    db.add_all([household, user])
    db.flush()
    wine = make_wine(db, household, name="Needs a profile", wine_type="")
    db.add(
        ExternalWineTasting(
            household_id=household.id,
            created_by_user_id=user.id,
            shared_identity_id=wine.shared_identity_id,
            name=wine.name,
            producer=wine.producer,
            vintage=wine.vintage,
            type=wine.type,
            region=wine.region,
            appellation=wine.appellation,
            consumed_at=date(2026, 1, 1),
            rating=5,
            enjoyment="positive",
        )
    )
    db.commit()
    called_with_explicit_request = False

    def unavailable_enrichment(
        _db, _context, _tasting, *, raise_configuration_errors=False, **_kwargs
    ):
        nonlocal called_with_explicit_request
        called_with_explicit_request = raise_configuration_errors
        raise HTTPException(status_code=503, detail="No AI provider configured")

    monkeypatch.setattr(
        taste_profile_routes, "enrich_external_tasting_sensory_profile", unavailable_enrichment
    )
    context = SimpleNamespace(user=user, household=household)

    with pytest.raises(HTTPException, match="No AI provider configured"):
        taste_profile_routes.enrich_external_tastings(db, context)

    assert called_with_explicit_request


def test_external_tasting_enrichment_returns_the_total_ai_cost(monkeypatch) -> None:
    db = Session()
    household = Household(name="Home")
    user = User(email="outside-cost@example.test", display_name="Outside", password_hash="x")
    db.add_all([household, user])
    db.flush()
    wine = make_wine(db, household, name="Costed profile", wine_type="")
    db.add(
        ExternalWineTasting(
            household_id=household.id,
            created_by_user_id=user.id,
            shared_identity_id=wine.shared_identity_id,
            name=wine.name,
            producer=wine.producer,
            vintage=wine.vintage,
            type=wine.type,
            region=wine.region,
            appellation=wine.appellation,
            consumed_at=date(2026, 1, 1),
            rating=5,
            enjoyment="positive",
        )
    )
    db.commit()
    context = SimpleNamespace(user=user, household=household)
    preview = taste_profile_routes.external_tasting_enrichment_preview(db, context)
    assert preview.missing_count == 1
    assert [(item.producer, item.name, item.vintage) for item in preview.items] == [
        ("Producer", "Costed profile", "2020")
    ]
    monkeypatch.setattr(
        taste_profile_routes,
        "enrich_external_tasting_sensory_profile",
        lambda *_args, **_kwargs: wishlist_routes.ExternalTastingEnrichmentOutcome(
            estimated_cost_usd=Decimal("0.012345"),
            profile_available=True,
            catalog_status="pending",
        ),
    )
    result = taste_profile_routes.enrich_external_tastings(db, context)

    assert result.estimated_cost_usd == Decimal("0.012345")
    assert result.enriched_count == 1
    assert result.catalog_pending_count == 1
    assert result.results[0].profile_status == "available"


def test_wishlist_tasting_enrichment_uses_the_current_wishlist_identity(monkeypatch) -> None:
    db = Session()
    household = Household(name="Home")
    user = User(email="wishlist-source@example.test", display_name="Wishlist", password_hash="x")
    db.add_all([household, user])
    db.flush()
    wishlist_list = WishlistList(
        household_id=household.id,
        created_by_user_id=user.id,
        name="Wishlist",
    )
    db.add(wishlist_list)
    db.flush()
    item = WishlistItem(
        household_id=household.id,
        wishlist_list_id=wishlist_list.id,
        created_by_user_id=user.id,
        name="Current wine",
        producer="Current producer",
        vintage="2021",
        type="Red",
    )
    db.add(item)
    db.flush()
    tasting = ExternalWineTasting(
        household_id=household.id,
        created_by_user_id=user.id,
        wishlist_item_id=item.id,
        name="Old wine name",
        producer="Old producer",
        vintage="2019",
        consumed_at=date(2026, 1, 1),
        rating=5,
        enjoyment="positive",
    )
    db.add(tasting)
    db.flush()
    context = SimpleNamespace(user=user, household=household)
    monkeypatch.setattr(wishlist_routes.settings, "wine_sensory_ai_enabled", True)

    wishlist_routes.enrich_external_tasting_sensory_profile(db, context, tasting)

    assert (tasting.name, tasting.producer, tasting.vintage, tasting.type) == (
        "Current wine",
        "Current producer",
        "2021",
        "Red",
    )
    profile = db.scalar(
        select(WineSensoryProfile).where(
            WineSensoryProfile.identity_id == tasting.shared_identity_id
        )
    )
    assert profile is not None and profile.generation_status == "available"


def test_verified_wishlist_data_is_proposed_to_the_central_catalog() -> None:
    db = Session()
    household = Household(name="Home")
    user = User(email="wishlist-catalog@example.test", display_name="Wishlist", password_hash="x")
    db.add_all([household, user])
    db.flush()
    wishlist_list = WishlistList(
        household_id=household.id,
        created_by_user_id=user.id,
        name="Wishlist",
    )
    db.add(wishlist_list)
    db.flush()
    item = WishlistItem(
        household_id=household.id,
        wishlist_list_id=wishlist_list.id,
        created_by_user_id=user.id,
        name="Catalog candidate",
        producer="Catalog producer",
        vintage="2021",
        type="Red",
    )
    db.add(item)
    db.flush()

    wishlist_routes.propose_wishlist_catalog_entry(db, item, grapes=[{"name": "Nebbiolo"}])

    entry = db.scalar(select(WineCatalogEntry).where(WineCatalogEntry.name == item.name))
    assert entry is not None
    assert entry.is_active is False
    assert entry.source == "wishlist_ai_research"
    assert entry.grapes_text == "Nebbiolo"


def test_verified_non_vintage_wishlist_tasting_gets_a_profile_and_catalog_entry(
    monkeypatch,
) -> None:
    db = Session()
    household = Household(name="Home")
    user = User(email="wishlist-nv@example.test", display_name="Wishlist NV", password_hash="x")
    db.add_all([household, user])
    db.flush()
    wishlist_list = WishlistList(
        household_id=household.id,
        created_by_user_id=user.id,
        name="Wishlist",
    )
    db.add(wishlist_list)
    db.flush()
    item = WishlistItem(
        household_id=household.id,
        wishlist_list_id=wishlist_list.id,
        created_by_user_id=user.id,
        name="Réflexion Brut Balthazar",
        producer="Lallier",
        vintage="",
        type="Sparkling",
        region="Champagne",
        appellation="Champagne",
    )
    db.add(item)
    db.flush()
    tasting = ExternalWineTasting(
        household_id=household.id,
        created_by_user_id=user.id,
        wishlist_item_id=item.id,
        name=item.name,
        producer=item.producer,
        vintage="",
        type=item.type,
        region=item.region,
        appellation=item.appellation,
        consumed_at=date(2026, 1, 1),
        rating=5,
        enjoyment="positive",
    )
    db.add(tasting)
    db.flush()
    source_url = "https://example.test/lallier-reflexion"
    response = SimpleNamespace(
        text=(
            '{"vintage":"NV","type":"Sparkling","region":"Champagne",'
            '"appellation":"Champagne","grapes":["Chardonnay","Pinot Noir"],'
            f'"source_url":"{source_url}","source_title":"Lallier"}}'
        ),
        model="economy-test",
        web_sources=({"url": source_url, "title": "Lallier"},),
        usage=SimpleNamespace(),
        charged_cost_usd=Decimal("0.0042"),
    )
    monkeypatch.setattr(wishlist_routes.settings, "wine_sensory_ai_enabled", True)
    monkeypatch.setattr(
        ai_routes, "get_or_create_user_ai_settings", lambda *_args: SimpleNamespace()
    )
    monkeypatch.setattr(
        ai_routes, "create_ai_response", lambda *_args, **_kwargs: (response, "application")
    )
    monkeypatch.setattr(ai_routes, "record_ai_audit", lambda *_args, **_kwargs: None)

    outcome = wishlist_routes.enrich_external_tasting_sensory_profile(
        db,
        SimpleNamespace(user=user, household=household),
        tasting,
        raise_configuration_errors=True,
        research_catalog=True,
    )

    assert tasting.vintage == item.vintage == "NV"
    assert tasting.shared_identity_id is not None
    assert outcome.profile_available is True
    assert outcome.catalog_status == "pending"
    assert outcome.issue == ""
    assert outcome.estimated_cost_usd == Decimal("0.0042")
    profile = db.scalar(
        select(WineSensoryProfile).where(
            WineSensoryProfile.identity_id == tasting.shared_identity_id
        )
    )
    assert profile is not None and profile.generation_status == "available"
    catalog_entry = db.scalar(select(WineCatalogEntry).where(WineCatalogEntry.name == item.name))
    assert catalog_entry is not None and catalog_entry.is_active is False


@pytest.mark.parametrize(
    ("response_text", "web_sources"),
    [
        ("not-json", ()),
        (
            '{"vintage":"NV","type":"Sparkling","region":"Champagne",'
            '"appellation":"Champagne","grapes":[],"source_url":"https://wrong.test/wine",'
            '"source_title":"Wrong"}',
            ({"url": "https://credible.test/wine", "title": "Credible"},),
        ),
    ],
)
def test_non_vintage_enrichment_reports_missing_vintage_without_verified_evidence(
    monkeypatch, response_text, web_sources
) -> None:
    db = Session()
    household = Household(name="Home")
    user = User(
        email="wishlist-unverified@example.test", display_name="Unverified", password_hash="x"
    )
    db.add_all([household, user])
    db.flush()
    tasting = ExternalWineTasting(
        household_id=household.id,
        created_by_user_id=user.id,
        name="Unknown cuvée",
        producer="Unknown producer",
        vintage="",
        type="Sparkling",
        consumed_at=date(2026, 1, 1),
        rating=5,
        enjoyment="positive",
    )
    db.add(tasting)
    db.flush()
    response = SimpleNamespace(
        text=response_text,
        model="economy-test",
        web_sources=web_sources,
        usage=SimpleNamespace(),
        charged_cost_usd=Decimal("0.0010"),
    )
    monkeypatch.setattr(wishlist_routes.settings, "wine_sensory_ai_enabled", True)
    monkeypatch.setattr(
        ai_routes, "get_or_create_user_ai_settings", lambda *_args: SimpleNamespace()
    )
    monkeypatch.setattr(
        ai_routes, "create_ai_response", lambda *_args, **_kwargs: (response, "application")
    )
    monkeypatch.setattr(ai_routes, "record_ai_audit", lambda *_args, **_kwargs: None)

    outcome = wishlist_routes.enrich_external_tasting_sensory_profile(
        db,
        SimpleNamespace(user=user, household=household),
        tasting,
        raise_configuration_errors=True,
        research_catalog=True,
    )

    assert outcome.profile_available is False
    assert outcome.catalog_status == "not_proposed"
    assert outcome.issue == "missing_vintage"
    assert tasting.shared_identity_id is None


def test_private_star_rating_contributes_without_becoming_another_users_signal() -> None:
    db = Session()
    household = Household(name="Home")
    first = User(email="first-rating@example.test", display_name="First", password_hash="x")
    second = User(email="second-rating@example.test", display_name="Second", password_hash="x")
    db.add_all([household, first, second])
    db.flush()
    wine = make_wine(db, household, name="Rated")
    candidate = make_wine(db, household, name="Candidate")
    for item in (wine, candidate):
        db.add(
            WineSensoryProfile(
                identity_id=item.shared_identity_id,
                dimensions={"body": 0.7, "acidity": 0.6, "fruit": 0.7},
                confidence=0.7,
                generation_status="available",
            )
        )
    record_user_wine_rating(db, user_id=first.id, wine=wine, rating=5)
    db.commit()

    assert db.scalar(select(UserWineRating).where(UserWineRating.user_id == first.id)) is not None
    assert calculate_taste_match(db, first.id, candidate)["score"] is not None
    assert calculate_taste_match(db, second.id, candidate)["score"] is None


def test_match_falls_back_to_global_when_the_wine_category_profile_has_no_dimensions() -> None:
    db = Session()
    household = Household(name="Home")
    user = User(email="fallback@example.test", display_name="Fallback", password_hash="x")
    db.add_all([household, user])
    db.flush()
    rated = make_wine(db, household, name="Rated", wine_type="White")
    candidate = make_wine(db, household, name="Candidate", wine_type="Red")
    for wine in (rated, candidate):
        db.add(
            WineSensoryProfile(
                identity_id=wine.shared_identity_id,
                dimensions={"body": 0.7, "acidity": 0.6, "fruit": 0.7},
                confidence=0.7,
                generation_status="available",
            )
        )
    add_tasting(db, user, household, rated, 5)
    db.commit()
    rebuild_user_taste_profile(db, household_id=household.id, user_id=user.id)
    db.add(
        UserTasteProfile(
            user_id=user.id,
            household_id=household.id,
            category="Red",
            dimensions={},
            attributes={},
            confidence=0,
            sample_count=1,
            calculation_version=2,
        )
    )
    db.commit()

    assert calculate_taste_match(db, user.id, candidate)["score"] is not None


def test_direct_negative_tasting_overrides_a_high_aggregate_affinity() -> None:
    db = Session()
    household = Household(name="Home")
    user = User(email="direct-negative@example.test", display_name="Direct", password_hash="x")
    db.add_all([household, user])
    db.flush()
    wine = make_wine(db, household, name="Disliked")
    dimensions = {"body": 0.7, "acidity": 0.6, "fruit": 0.7}
    db.add(
        WineSensoryProfile(
            identity_id=wine.shared_identity_id,
            dimensions=dimensions,
            confidence=0.8,
            generation_status="available",
        )
    )
    db.add(
        UserTasteProfile(
            user_id=user.id,
            household_id=household.id,
            category="Red",
            dimensions={
                key: {"preference": value, "confidence": 0.8} for key, value in dimensions.items()
            },
            attributes={},
            confidence=0.8,
            sample_count=20,
            calculation_version=2,
        )
    )
    add_tasting(db, user, household, wine, 2)
    db.flush()
    db.query(WineTastingEntry).one().enjoyment = "negative"
    db.commit()

    assert calculate_taste_match(db, user.id, wine)["score"] < 0.4


def test_claiming_unassigned_historical_tastings_is_household_scoped() -> None:
    db = Session()
    household = Household(name="Home")
    other_household = Household(name="Other")
    user = User(email="owner@example.test", display_name="Owner", password_hash="x")
    db.add_all([household, other_household, user])
    db.flush()
    owned_wine = make_wine(db, household, name="Historical")
    other_wine = make_wine(db, other_household, name="Elsewhere")
    db.add_all(
        [
            WineTastingEntry(
                wine_id=owned_wine.id,
                household_id=household.id,
                consumed_at=date(2026, 1, 1),
                rating=5,
            ),
            WineTastingEntry(
                wine_id=other_wine.id,
                household_id=other_household.id,
                consumed_at=date(2026, 1, 1),
                rating=5,
            ),
        ]
    )
    db.flush()

    assert unassigned_tasting_count(db, household.id) == 1
    claimed, profiles = claim_unassigned_tastings(db, household_id=household.id, user_id=user.id)

    assert claimed == 1
    assert unassigned_tasting_count(db, household.id) == 0
    assert unassigned_tasting_count(db, other_household.id) == 1
    assert next(profile for profile in profiles if profile.category == "global").sample_count == 1


def test_profiles_are_isolated_per_household_for_the_same_user() -> None:
    db = Session()
    first_household = Household(name="First cellar")
    second_household = Household(name="Second cellar")
    user = User(email="multi-cellar@example.test", display_name="Collector", password_hash="x")
    db.add_all([first_household, second_household, user])
    db.flush()
    first_wine = make_wine(db, first_household, name="First red")
    second_wine = make_wine(db, second_household, name="Second white", wine_type="White")
    for wine in (first_wine, second_wine):
        db.add(
            WineSensoryProfile(
                identity_id=wine.shared_identity_id,
                dimensions={"body": 0.7, "acidity": 0.6, "fruit": 0.7},
                confidence=0.8,
                generation_status="available",
            )
        )
    add_tasting(db, user, first_household, first_wine, 6)
    add_tasting(db, user, second_household, second_wine, 1)
    db.commit()

    first_profiles = rebuild_user_taste_profile(
        db, household_id=first_household.id, user_id=user.id
    )
    second_profiles = rebuild_user_taste_profile(
        db, household_id=second_household.id, user_id=user.id
    )

    assert next(item for item in first_profiles if item.category == "global").sample_count == 1
    assert next(item for item in second_profiles if item.category == "global").sample_count == 1
    assert (
        len(
            list(
                db.scalars(
                    select(UserTasteProfile).where(
                        UserTasteProfile.user_id == user.id,
                        UserTasteProfile.category == "global",
                    )
                )
            )
        )
        == 2
    )


def test_rebuild_archives_changed_profile_and_keeps_v4_in_shadow() -> None:
    db = Session()
    household = Household(name="Home")
    user = User(email="history@example.test", display_name="History", password_hash="x")
    db.add_all([household, user])
    db.flush()
    wine = make_wine(db, household, name="Versioned")
    db.add(
        WineSensoryProfile(
            identity_id=wine.shared_identity_id,
            dimensions={"body": 0.8, "acidity": 0.4, "fruit": 0.7},
            confidence=0.8,
            generation_status="available",
        )
    )
    add_tasting(db, user, household, wine, 5)
    db.commit()
    first = rebuild_user_taste_profile(db, household_id=household.id, user_id=user.id)
    db.commit()
    first_global = next(item for item in first if item.category == "global")
    original_dimensions = dict(first_global.dimensions)
    add_tasting(db, user, household, wine, 1)
    db.commit()

    rebuilt = rebuild_user_taste_profile(db, household_id=household.id, user_id=user.id)
    db.commit()
    rebuilt_global = next(item for item in rebuilt if item.category == "global")
    revision = db.scalar(
        select(UserTasteProfileRevision).where(
            UserTasteProfileRevision.profile_id == rebuilt_global.id,
            UserTasteProfileRevision.category == "global",
        )
    )

    assert revision is not None
    assert revision.dimensions == original_dimensions
    assert rebuilt_global.calculation_version == 2
    assert rebuilt_global.shadow_calculation_version == 4
    assert rebuilt_global.shadow_dimensions["body"]
    # Two tastings (5 and 1 stars) barely move the neutral point from three stars.
    assert rebuilt_global.shadow_dimensions["neutral_rating"] == {"stars": 3.0}


def test_evidence_counts_only_personal_signals_in_the_active_household() -> None:
    db = Session()
    household = Household(name="Home")
    other_household = Household(name="Other")
    user = User(email="evidence@example.test", display_name="Evidence", password_hash="x")
    db.add_all([household, other_household, user])
    db.flush()
    wine = make_wine(db, household, name="Rated")
    other_wine = make_wine(db, other_household, name="Other rated")
    for item in (wine, other_wine):
        db.add(
            WineSensoryProfile(
                identity_id=item.shared_identity_id,
                dimensions={"body": 0.7},
                confidence=0.8,
                generation_status="available",
            )
        )
    add_tasting(db, user, household, wine, 5)
    add_tasting(db, user, other_household, other_wine, 5)
    db.add(
        UserWineRating(
            user_id=user.id,
            household_id=household.id,
            wine_id=wine.id,
            rating=5,
        )
    )
    db.commit()
    context = SimpleNamespace(user=user, household=household)

    evidence = taste_profile_routes.taste_profile_evidence(db, context)

    assert evidence.tasting_rating_count == 1
    assert evidence.direct_rating_count == 1
    assert evidence.unique_wine_count == 1
    assert evidence.sensory_covered_count == 2
    assert evidence.sensory_missing_count == 0


def test_favourites_carry_bottles_drunk_and_average_stars() -> None:
    db = Session()
    household = Household(name="Home")
    user = User(email="favourites@example.test", display_name="Fav", password_hash="x")
    db.add_all([household, user])
    db.flush()
    tunella = make_wine(db, household, name="Friulano")
    tunella.producer = "La Tunella"
    citran = make_wine(db, household, name="Citran")
    citran.producer = "Chateau Citran"
    for rating in (6, 5, 4):
        add_tasting(db, user, household, tunella, rating)
    add_tasting(db, user, household, citran, 6)
    # A personal star rating is an opinion, not a bottle drunk.
    db.add(UserWineRating(user_id=user.id, household_id=household.id, wine_id=tunella.id, rating=5))
    db.commit()

    profiles = rebuild_user_taste_profile(db, household_id=household.id, user_id=user.id)
    overall = next(profile for profile in profiles if profile.category == "global")
    producers = {entry[0]: entry for entry in overall.attributes["preferred_producers"]}

    name, score, drunk, average = producers["La Tunella"]
    assert (name, drunk, average) == ("La Tunella", 3, 5.0)
    assert producers["Chateau Citran"][2:] == [1, 6.0]
    # Ranked by average stars shrunk toward the user's own average (5.2 here):
    # four experiences averaging 5.0 sit just below it, one bottle at 6 above it.
    assert score == 5.09
    assert producers["Chateau Citran"][1] == 5.4
    assert overall.attributes["scoring"] == [["average_stars", 3]]


def test_grape_names_drop_notes_the_ai_put_in_brackets() -> None:
    from app.services.grape_names import clean_grape_entries, clean_grape_name

    assert (
        clean_grape_name("Cabernet Franc (percentuali non disponibili dalla fonte consultata)")
        == "Cabernet Franc"
    )
    assert clean_grape_name("Pinot Nero ()") == "Pinot Nero"
    assert clean_grape_name("  Merlot  [stima] ") == "Merlot"
    assert clean_grape_name("(sconosciuto)") == ""
    assert clean_grape_entries(
        [{"name": "Syrah ()", "percentage_from": 80}, {"name": "()"}, "Merlot"]
    ) == [{"name": "Syrah", "percentage_from": 80}]


def test_favourite_grapes_merge_names_that_differ_only_by_notes() -> None:
    db = Session()
    household = Household(name="Home")
    user = User(email="grapes@example.test", display_name="Grapes", password_hash="x")
    db.add_all([household, user])
    db.flush()
    first = make_wine(db, household, name="Bourgogne")
    first.grapes = [{"name": "Pinot Nero ()", "percentage_from": 100, "percentage_to": 100}]
    second = make_wine(db, household, name="Alto Adige")
    second.grapes = [{"name": "Pinot Nero", "percentage_from": 100, "percentage_to": 100}]
    add_tasting(db, user, household, first, 5)
    add_tasting(db, user, household, second, 5)
    db.commit()

    profiles = rebuild_user_taste_profile(db, household_id=household.id, user_id=user.id)
    overall = next(profile for profile in profiles if profile.category == "global")
    grapes = overall.attributes["preferred_grapes"]

    assert [entry[0] for entry in grapes] == ["Pinot Nero"]
    assert grapes[0][2] == 2


def test_grape_shares_split_a_blend_by_known_percentages() -> None:
    from app.services.taste_profiles import grape_shares

    def wine(grapes):
        return SimpleNamespace(grapes=grapes)

    assert grape_shares(wine([{"name": "Nebbiolo", "percentage_from": 100, "percentage_to": 100}])) == {"Nebbiolo": 1.0}
    blend = grape_shares(wine([
        {"name": "Merlot", "percentage_from": 85, "percentage_to": 95},
        {"name": "Cabernet Franc (percentuali non disponibili)", "percentage_from": 0, "percentage_to": 0},
    ]))
    assert blend == {"Merlot": 0.9, "Cabernet Franc": pytest.approx(0.1)}
    # Without any percentage, grapes split the wine equally.
    assert grape_shares(wine([{"name": "Cabernet Franc"}, {"name": "Merlot ()"}])) == {"Cabernet Franc": 0.5, "Merlot": 0.5}
    assert grape_shares(wine([])) == {}


def test_a_minor_blend_grape_takes_only_its_share_of_the_rating() -> None:
    db = Session()
    household = Household(name="Home")
    user = User(email="blend@example.test", display_name="Blend", password_hash="x")
    db.add_all([household, user])
    db.flush()
    bordeaux = make_wine(db, household, name="Pomerol")
    bordeaux.grapes = [
        {"name": "Merlot", "percentage_from": 90, "percentage_to": 90},
        {"name": "Cabernet Franc", "percentage_from": 10, "percentage_to": 10},
    ]
    loire = make_wine(db, household, name="Chinon")
    loire.grapes = [{"name": "Cabernet Franc", "percentage_from": 100, "percentage_to": 100}]
    add_tasting(db, user, household, bordeaux, 6)
    add_tasting(db, user, household, loire, 4)
    db.commit()

    profiles = rebuild_user_taste_profile(db, household_id=household.id, user_id=user.id)
    overall = next(profile for profile in profiles if profile.category == "global")
    grapes = {entry[0]: entry for entry in overall.attributes["preferred_grapes"]}

    # The excellent Pomerol is mostly Merlot: Cabernet Franc's 10% barely
    # lifts it, so its own 4-star Chinon decides where it stands.
    assert grapes["Merlot"][1] > grapes["Cabernet Franc"][1]
    assert grapes["Cabernet Franc"][2] == 2  # still two bottles drunk


def test_sommelier_context_lists_what_the_user_likes_and_avoids() -> None:
    db = Session()
    household = Household(name="Home")
    user = User(email="sommelier@example.test", display_name="Sommelier", password_hash="x")
    db.add_all([household, user])
    db.flush()

    def wine_with(name: str, grape: str):
        wine = make_wine(db, household, name=name)
        wine.grapes = [{"name": grape, "percentage_from": 100, "percentage_to": 100}]
        db.add(
            WineSensoryProfile(
                identity_id=wine.shared_identity_id,
                dimensions={"body": 0.7, "acidity": 0.6, "fruit": 0.6},
                confidence=0.8,
                generation_status="available",
            )
        )
        return wine

    nebbiolo = wine_with("Barolo", "Nebbiolo")
    merlot = wine_with("Merlot del Ticino", "Merlot")
    syrah = wine_with("Hermitage", "Syrah")
    for rating in (6, 6, 5, 6):
        add_tasting(db, user, household, nebbiolo, rating)
    for rating in (1, 2, 1, 2):  # disappointing again and again
        add_tasting(db, user, household, merlot, rating)
    add_tasting(db, user, household, syrah, 1)  # one bad bottle only
    db.commit()
    rebuild_user_taste_profile(db, household_id=household.id, user_id=user.id)
    db.commit()

    context = compact_taste_context(db, household_id=household.id, user_id=user.id)

    assert context["liked"]["grapes"][0] == "Nebbiolo"
    assert context["disliked"]["grapes"] == ["Merlot"]
    assert "Syrah" not in context["disliked"]["grapes"]
    assert "avoid disliked" in context["how_to_use"]


def test_favourites_follow_how_much_they_were_liked_not_how_often() -> None:
    db = Session()
    household = Household(name="Home")
    user = User(email="often@example.test", display_name="Often", password_hash="x")
    db.add_all([household, user])
    db.flush()
    often = make_wine(db, household, name="Merlot del Ticino")
    often.appellation = "Ticino DOC"
    rarely = make_wine(db, household, name="Haut-Medoc")
    rarely.appellation = "Haut-Medoc"
    for rating in (4, 3, 4, 3):  # drunk often, liked only a little
        add_tasting(db, user, household, often, rating)
    for rating in (5, 5):  # drunk twice, liked a lot
        add_tasting(db, user, household, rarely, rating)
    db.commit()

    profiles = rebuild_user_taste_profile(db, household_id=household.id, user_id=user.id)
    overall = next(profile for profile in profiles if profile.category == "global")
    ranking = [entry[0] for entry in overall.attributes["preferred_appellations"]]

    assert ranking[0] == "Haut-Medoc"
    assert "Ticino DOC" in ranking


def test_profiles_saved_with_the_earlier_favourite_ranking_are_rebuilt_on_read() -> None:
    db = Session()
    household = Household(name="Home")
    user = User(email="stale@example.test", display_name="Stale", password_hash="x")
    db.add_all([household, user])
    db.flush()
    wine = make_wine(db, household, name="Barolo")
    add_tasting(db, user, household, wine, 6)
    db.add(
        UserTasteProfile(
            user_id=user.id,
            household_id=household.id,
            category="global",
            dimensions={},
            attributes={"preferred_producers": [["Producer", 2.4]]},
            confidence=0.5,
            sample_count=1,
            calculation_version=2,
        )
    )
    db.commit()
    context = SimpleNamespace(user=user, household=household)

    response = taste_profile_routes.get_my_taste_profile(db, context)

    overall = next(profile for profile in response.profiles if profile.category == "global")
    assert overall.attributes["scoring"] == [["average_stars", 3]]
    assert overall.attributes["preferred_producers"][0][:3] == ["Producer", overall.attributes["preferred_producers"][0][1], 1]


def test_ai_context_falls_back_to_the_scoped_global_profile() -> None:
    db = Session()
    household = Household(name="Home")
    user = User(email="context@example.test", display_name="Context", password_hash="x")
    db.add_all([household, user])
    db.flush()
    db.add(
        UserTasteProfile(
            user_id=user.id,
            household_id=household.id,
            category="global",
            dimensions={"body": {"preference": 0.72, "confidence": 0.6}},
            attributes={},
            confidence=0.6,
            sample_count=12,
            calculation_version=2,
        )
    )
    db.commit()

    context = compact_taste_context(
        db, household_id=household.id, user_id=user.id, category="White"
    )

    assert context["category"] == "global"
    assert context["dimensions"] == {"body": 0.72}


def test_algorithm_validation_uses_held_out_positive_and_negative_experiences() -> None:
    db = Session()
    household = Household(name="Validation home")
    user = User(email="validation@example.test", display_name="Validation", password_hash="x")
    db.add_all([household, user])
    db.flush()
    ratings_and_levels = [
        (6, 0.82),
        (5, 0.76),
        (6, 0.88),
        (5, 0.72),
        (1, 0.18),
        (2, 0.24),
        (1, 0.12),
        (2, 0.28),
    ]
    for index, (rating, level) in enumerate(ratings_and_levels):
        wine = make_wine(db, household, name=f"Validation {index}")
        db.add(
            WineSensoryProfile(
                identity_id=wine.shared_identity_id,
                dimensions={dimension: level for dimension in ("body", "acidity", "fruit")},
                confidence=0.8,
                generation_status="available",
            )
        )
        add_tasting(db, user, household, wine, rating)
    db.commit()

    validation = validate_taste_profile_algorithms(db, household_id=household.id, user_id=user.id)

    assert validation["status"] == "ready"
    assert validation["tested_experiences"] == 8
    assert validation["positive_experiences"] == 4
    assert validation["negative_experiences"] == 4
    assert validation["v2_mean_absolute_error"] is not None
    assert validation["candidate_mean_absolute_error"] is not None
    # Liked wines share high levels and disliked ones low levels, so both
    # profiles should rank every liked experience above every disliked one.
    assert validation["v2_ranking_auc"] == 1.0
    assert validation["candidate_ranking_auc"] == 1.0
    assert validation["winner"] == "tie"


def test_candidate_profile_reads_ratings_against_the_users_own_average() -> None:
    """Someone who rates everything 4..6 stars: V2 sees only liked wines, V4 sees contrast."""
    db = Session()
    household = Household(name="Generous home")
    user = User(email="generous@example.test", display_name="Generous", password_hash="x")
    db.add_all([household, user])
    db.flush()
    # Mostly light wines, all "liked" at 4 stars; the two full-bodied ones get 6.
    ratings_and_body = [(4, 0.2)] * 6 + [(6, 0.9)] * 2
    for index, (rating, body) in enumerate(ratings_and_body):
        wine = make_wine(db, household, name=f"Generous {index}")
        db.add(
            WineSensoryProfile(
                identity_id=wine.shared_identity_id,
                dimensions={"body": body, "acidity": 0.5, "fruit": 0.5},
                confidence=0.8,
                generation_status="available",
            )
        )
        add_tasting(db, user, household, wine, rating)
    db.commit()

    profile = next(
        item
        for item in rebuild_user_taste_profile(db, household_id=household.id, user_id=user.id)
        if item.category == "global"
    )

    # (3 * 3 + 24 + 12) / 11 = 4.09 stars: the 4-star wines are below this user's average.
    assert profile.shadow_dimensions["neutral_rating"] == {"stars": 4.09}
    # V2 mirrors the cellar: its affinity (0.5 + half the signal-weighted level)
    # sits between the many light and the few full wines.
    assert profile.dimensions["body"]["preference"] == 0.775
    # V4 follows the ratings: the full-bodied wines were the ones that stood out.
    assert profile.shadow_dimensions["body"]["preference"] > 0.85


def test_personal_neutral_rating_shrinks_toward_three_stars_and_stays_in_range() -> None:
    assert personal_neutral_rating([]) == 3.0
    assert personal_neutral_rating([6]) == 3.75
    assert personal_neutral_rating([0, 0, 6]) == 3.75
    assert personal_neutral_rating([6] * 100) == 5.0
    assert personal_neutral_rating([1] * 100) == 2.0
    assert tasting_preference_weight(4, "", 4.3) < 0 < tasting_preference_weight(5, "", 4.3)


def test_ranking_auc_ignores_how_high_the_predictions_are() -> None:
    signals = [1.0, 0.8, -0.6, -1.0]
    assert ranking_auc([0.9, 0.85, 0.82, 0.8], signals) == 1.0
    # Shifting every prediction up changes the mean error but not the ranking.
    assert ranking_auc([0.4, 0.35, 0.32, 0.3], signals) == 1.0
    assert ranking_auc([0.2, 0.3, 0.8, 0.9], signals) == 0.0
    assert ranking_auc([0.5, 0.5, 0.5, 0.5], signals) == 0.5
    assert ranking_auc([0.9, 0.8], [1.0, 0.5]) is None


def test_admin_baselines_filters_and_historical_batch_endpoint() -> None:
    def override_db():
        db = Session()
        try:
            yield db
        finally:
            db.close()

    app.dependency_overrides[get_db] = override_db
    try:
        client = TestClient(app)
        registered = client.post(
            "/api/v1/auth/register",
            json={
                "email": "admin@vinaris.ch",
                "display_name": "Admin",
                "password": "strong-password-1",
                "household_name": "Home",
                "locale": "it",
                "legal_document_version": LEGAL_DOCUMENT_VERSION,
                "privacy_policy_accepted": True,
                "terms_accepted": True,
                "photo_usage_disclaimer_accepted": True,
            },
        )
        assert registered.status_code == 201, registered.text
        with Session() as db:
            user = db.query(User).filter(User.email == "admin@vinaris.ch").one()
            user.is_app_admin = True
            active_household = db.query(Household).filter(Household.name == "Home").one()
            other_household = Household(name="Other home")
            db.add(other_household)
            db.flush()
            db.add_all(
                [
                    UserTasteProfile(
                        user_id=user.id,
                        household_id=active_household.id,
                        category="global",
                        dimensions={"body": {"preference": 0.6, "confidence": 0.5, "samples": 4}},
                        attributes={},
                        confidence=0.5,
                        sample_count=4,
                        calculation_version=2,
                        shadow_dimensions={
                            "body": {"preference": 0.72, "confidence": 0.4, "samples": 4},
                            "neutral_rating": {"stars": 4.6},
                        },
                        shadow_confidence=0.4,
                        shadow_calculation_version=4,
                    ),
                    UserTasteProfile(
                        user_id=user.id,
                        household_id=other_household.id,
                        category="White",
                        dimensions={"body": {"preference": 0.2, "confidence": 0.2}},
                        attributes={},
                        confidence=0.2,
                        sample_count=2,
                        calculation_version=2,
                        shadow_dimensions={"body": {"preference": 0.9, "confidence": 0.2}},
                        shadow_confidence=0.2,
                        shadow_calculation_version=4,
                    ),
                ]
            )
            db.commit()
        diagnostics = client.get("/api/v1/taste-profile/me/algorithm-diagnostics")
        assert diagnostics.status_code == 200, diagnostics.text
        assert diagnostics.json()["mode"] == "shadow"
        assert diagnostics.json()["candidate_version"] == 4
        assert [item["category"] for item in diagnostics.json()["categories"]] == ["global"]
        assert diagnostics.json()["categories"][0]["candidate_neutral_rating"] == 4.6
        # The neutral rating is stored beside the dimensions but is not one of them.
        assert [item["dimension"] for item in diagnostics.json()["categories"][0]["dimensions"]] == ["body"]
        body = diagnostics.json()["categories"][0]["dimensions"][0]
        assert body == {
            "dimension": "body",
            "v2_preference": 0.6,
            "v2_confidence": 0.5,
            "candidate_preference": 0.72,
            "candidate_confidence": 0.4,
            "scale_gap": 0.12,
        }
        assert diagnostics.json()["validation"] == {
            "status": "insufficient",
            "method": "leave_one_experience_out",
            "tested_experiences": 0,
            "positive_experiences": 0,
            "negative_experiences": 0,
            "v2_mean_absolute_error": None,
            "candidate_mean_absolute_error": None,
            "v2_ranking_auc": None,
            "candidate_ranking_auc": None,
            "winner": "insufficient",
        }
        with Session() as db:
            user = db.query(User).filter(User.email == "admin@vinaris.ch").one()
            user.is_app_admin = False
            db.commit()
        denied_diagnostics = client.get("/api/v1/taste-profile/me/algorithm-diagnostics")
        assert denied_diagnostics.status_code == 403
        with Session() as db:
            user = db.query(User).filter(User.email == "admin@vinaris.ch").one()
            user.is_app_admin = True
            db.commit()
        wine = client.post(
            "/api/v1/wines",
            json={
                "name": "API Barolo",
                "producer": "API Estate",
                "vintage": "2021",
                "type": "Red",
                "region": "Piemonte",
            },
        )
        assert wine.status_code == 201, wine.text
        preview = client.post("/api/v1/taste-profile/admin/batch-preview")
        assert preview.status_code == 200 and preview.json()["deterministic"] == 1
        enriched = client.post(
            "/api/v1/taste-profile/admin/enrich-missing", json={"limit": 10, "allow_ai": False}
        )
        assert enriched.status_code == 200 and enriched.json()["resolved"] == 1
        profile = client.get("/api/v1/taste-profile/admin/profiles?region=piemonte").json()[0]
        assert profile["name"] == "API Barolo"
        assert profile["validated"] is False
        approved = client.post("/api/v1/taste-profile/admin/profiles/approve-pending")
        assert approved.status_code == 200, approved.text
        assert approved.json() == {"approved": 1}
        assert (
            client.get("/api/v1/taste-profile/admin/profiles?region=piemonte").json()[0][
                "validated"
            ]
            is True
        )
        baseline = client.post(
            "/api/v1/taste-profile/admin/baselines",
            json={
                "entity_type": "grape",
                "entity_key": "Nebbiolo",
                "dimensions": {"tannin": 0.9},
                "confidence": 0.8,
            },
        )
        assert baseline.status_code == 200, baseline.text
        assert (
            client.delete(
                f"/api/v1/taste-profile/admin/baselines/{baseline.json()['id']}"
            ).status_code
            == 204
        )
    finally:
        app.dependency_overrides.clear()


def test_external_tasting_metadata_correction_rebuilds_categories_without_ai(monkeypatch):
    from app.schemas.wishlist import ExternalWineTastingUpdate

    db = Session()
    household = Household(name="Home")
    user = User(email="correction@example.test", display_name="Taster", password_hash="x")
    db.add_all([household, user])
    db.flush()
    tasting = ExternalWineTasting(
        household_id=household.id, created_by_user_id=user.id,
        name="Lambrusco dolce", producer="Producer", vintage="2023", type="Sweet",
        consumed_at=date(2026, 10, 1), rating=5, enjoyment="positive", note="Friends",
        occasion="Dinner", pairing="Cheese", companions="Alex",
        memory_photo=b"existing-photo", memory_photo_version="photo-version",
    )
    db.add(tasting)
    resolve_shared_identity(db, tasting, create=True)
    original_identity = tasting.shared_identity_id
    db.add(WineSensoryProfile(
        identity_id=original_identity, dimensions={"sweetness": 0.8},
        confidence=0.8, generation_status="available",
    ))
    db.commit()
    rebuild_user_taste_profile(db, household_id=household.id, user_id=user.id)
    db.commit()
    assert db.scalar(select(UserTasteProfile).where(UserTasteProfile.category == "Sweet"))

    def unexpected_ai(*args, **kwargs):
        raise AssertionError("Manual correction must not invoke AI")

    monkeypatch.setattr(wishlist_routes, "enrich_external_tasting_sensory_profile", unexpected_ai)
    context = SimpleNamespace(user=user, household=household)
    response = wishlist_routes.update_wishlist_tasting(
        tasting.id, ExternalWineTastingUpdate(wine={
            "name": " Lambrusco dolce ", "producer": "Producer", "vintage": "2023",
            "type": "Red", "format": "750ml", "region": "Emilia-Romagna",
            "appellation": "Lambrusco",
        }), db, context,
    )
    assert tasting.type == "Red"
    assert tasting.shared_identity_id == original_identity
    assert (response.rating, response.note, response.enjoyment) == (5, "Friends", "positive")
    assert (response.occasion, response.pairing, response.companions) == ("Dinner", "Cheese", "Alex")
    assert response.consumed_at == date(2026, 10, 1)
    assert tasting.memory_photo == b"existing-photo"
    assert "photo-version" in response.memory_photo_url
    profiles = {p.category: p for p in db.scalars(select(UserTasteProfile))}
    assert set(profiles) == {"global", "Red"}
    assert profiles["Red"].sample_count == 1
    assert db.scalar(select(Wine.id)) is None
    assert db.scalar(select(WineSensoryProfile)).dimensions == {"sweetness": 0.8}

    # Changing identity must detach the old wine's sensory profile.
    wishlist_routes.update_wishlist_tasting(
        tasting.id, ExternalWineTastingUpdate(wine={"name": "Different wine", "type": "White"}),
        db, context,
    )
    assert tasting.shared_identity_id is None
    assert db.scalar(select(WineSensoryProfile)).identity_id == original_identity
    wishlist_routes.update_wishlist_tasting(
        tasting.id, ExternalWineTastingUpdate(wine={
            "name": "Different wine", "producer": "Producer", "vintage": "2024", "type": "White",
        }), db, context,
    )
    assert tasting.shared_identity_id != original_identity
    new_profile = db.scalar(select(WineSensoryProfile).where(
        WineSensoryProfile.identity_id == tasting.shared_identity_id,
    ))
    assert new_profile.generation_status == "pending"
    assert not new_profile.dimensions


@pytest.mark.parametrize("foreign_scope", ["household", "user"])
def test_external_tasting_metadata_correction_is_private(foreign_scope):
    from app.schemas.wishlist import ExternalWineTastingUpdate

    db = Session()
    home = Household(name="Home")
    other_home = Household(name="Other")
    owner = User(email="owner@example.test", display_name="Owner", password_hash="x")
    other = User(email="other@example.test", display_name="Other", password_hash="x")
    db.add_all([home, other_home, owner, other])
    db.flush()
    tasting = ExternalWineTasting(
        household_id=home.id, created_by_user_id=owner.id,
        name="Private tasting", type="Sweet", consumed_at=date(2026, 10, 1),
    )
    db.add(tasting)
    db.commit()
    context = SimpleNamespace(
        user=owner if foreign_scope == "household" else other,
        household=other_home if foreign_scope == "household" else home,
    )
    with pytest.raises(HTTPException) as error:
        wishlist_routes.update_wishlist_tasting(
            tasting.id, ExternalWineTastingUpdate(wine={"name": "Private tasting", "type": "Red"}),
            db, context,
        )
    assert error.value.status_code == 404
    assert tasting.type == "Sweet"


@pytest.mark.parametrize("wine", [
    {"name": "   "}, {"name": "Wine", "type": "invalid"},
    {"name": "Wine", "region": "x" * 121}, {"name": "Wine", "household_id": "spoofed"},
])
def test_external_tasting_metadata_validation(wine):
    from pydantic import ValidationError

    from app.schemas.wishlist import ExternalWineTastingUpdate

    with pytest.raises(ValidationError):
        ExternalWineTastingUpdate(wine=wine)
