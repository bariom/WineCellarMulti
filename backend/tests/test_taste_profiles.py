from __future__ import annotations

# ruff: noqa: E501
from datetime import date
from types import SimpleNamespace

from fastapi.testclient import TestClient
from sqlalchemy import create_engine, select
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.api.routes import taste_profiles as taste_profile_routes
from app.core.legal import LEGAL_DOCUMENT_VERSION
from app.db.base import Base
from app.db.session import get_db
from app.main import app
from app.models import (
    Household,
    SensoryProfileBaseline,
    User,
    Wine,
    WineSensoryProfile,
    WineTastingEntry,
)
from app.schemas.taste_profile import BatchEnrichmentRequest
from app.services.shared_wine_data import resolve_shared_identity
from app.services.taste_profiles import (
    calculate_taste_match,
    claim_unassigned_tastings,
    generate_wine_sensory_profile,
    rating_weight,
    rebuild_user_taste_profile,
    unassigned_tasting_count,
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
        BatchEnrichmentRequest(limit=1), db, SimpleNamespace(user=user)
    )

    assert result == {
        "processed": 1,
        "resolved": 1,
        "ai_generated": 1,
        "skipped": 2,
        "ai_enabled": True,
    }
    profile = db.scalar(
        select(WineSensoryProfile).where(WineSensoryProfile.identity_id == missing.shared_identity_id)
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
    assert db.scalar(
        select(WineSensoryProfile).where(WineSensoryProfile.identity_id == wine.shared_identity_id)
    ) is None
    monkeypatch.setattr(
        taste_profile_routes,
        "_ai_sensory_profile",
        lambda _wine: ({"body": 0.8, "acidity": 0.6}, "test-model"),
    )
    monkeypatch.setattr(taste_profile_routes, "_ai_sensory_metadata", lambda _wine: ({}, ""))

    response = taste_profile_routes.regenerate_sensory_profile(
        wine.shared_identity_id, True, db, SimpleNamespace(user=user)
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
        wine.shared_identity_id, True, db, SimpleNamespace(user=user)
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
    add_tasting(db, first_user, household, white, 4)  # neutral should have no directional effect
    add_tasting(db, second_user, household, red, 1)
    db.commit()
    profiles = {
        profile.category: profile for profile in rebuild_user_taste_profile(db, first_user.id)
    }
    assert profiles["Red"].dimensions["body"]["preference"] > 0.8
    assert profiles["global"].dimensions["body"]["preference"] > 0.8
    assert "body" not in profiles["White"].dimensions  # neutral ratings are ignored directionally
    assert profiles["global"].sample_count == 2


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
    rebuild_user_taste_profile(db, user.id)
    assert (
        calculate_taste_match(db, user.id, close)["score"]
        > calculate_taste_match(db, user.id, distant)["score"]
    )


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
    assert rating_weight(4) == 0
    assert rating_weight(6) == 1
    assert rating_weight(0) == 0


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
