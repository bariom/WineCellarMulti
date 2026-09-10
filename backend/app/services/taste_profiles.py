"""Shared wine sensory data and private, deterministic user taste calculations."""
# ruff: noqa: E501

from __future__ import annotations

from collections import defaultdict
from collections.abc import Callable
from datetime import UTC, datetime
from math import exp
from typing import Any
from uuid import UUID

from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from app.core.wine_types import normalize_wine_type
from app.models import (
    ExternalWineTasting,
    SensoryProfileBaseline,
    UserTasteProfile,
    UserWineRating,
    Wine,
    WineSensoryProfile,
    WineTastingEntry,
)
from app.services.shared_wine_data import normalize_identity_part, resolve_shared_identity

SENSORY_DIMENSIONS = (
    "body",
    "acidity",
    "tannin",
    "sweetness",
    "aromatic_intensity",
    "fruit",
    "wood",
    "spice",
    "minerality",
)
TASTE_CATEGORIES = {"Red", "White", "Rose", "Sparkling", "Sweet", "Fortified"}
NEUTRAL_RATING = 3.0  # Vinaris tastings are 1..6 stars; zero means not rated.
TASTE_PROFILE_CALCULATION_VERSION = 2

# These are deliberately small, explainable zero-cost defaults. Appellation/grape baselines in the
# database override/augment them and are maintained by app administrators.
TYPE_BASELINES: dict[str, dict[str, float]] = {
    "Red": {
        "body": 0.68,
        "acidity": 0.55,
        "tannin": 0.62,
        "sweetness": 0.08,
        "aromatic_intensity": 0.62,
        "fruit": 0.66,
        "wood": 0.35,
        "spice": 0.38,
        "minerality": 0.30,
    },
    "White": {
        "body": 0.38,
        "acidity": 0.70,
        "tannin": 0.08,
        "sweetness": 0.12,
        "aromatic_intensity": 0.58,
        "fruit": 0.55,
        "wood": 0.18,
        "spice": 0.15,
        "minerality": 0.48,
    },
    "Sparkling": {
        "body": 0.30,
        "acidity": 0.82,
        "tannin": 0.05,
        "sweetness": 0.18,
        "aromatic_intensity": 0.62,
        "fruit": 0.48,
        "wood": 0.08,
        "spice": 0.12,
        "minerality": 0.57,
    },
    "Sweet": {
        "body": 0.52,
        "acidity": 0.56,
        "tannin": 0.12,
        "sweetness": 0.82,
        "aromatic_intensity": 0.68,
        "fruit": 0.74,
        "wood": 0.18,
        "spice": 0.20,
        "minerality": 0.24,
    },
    "Rose": {
        "body": 0.36,
        "acidity": 0.65,
        "tannin": 0.15,
        "sweetness": 0.16,
        "aromatic_intensity": 0.52,
        "fruit": 0.65,
        "wood": 0.08,
        "spice": 0.12,
        "minerality": 0.35,
    },
}
BASELINE_WEIGHTS = {"appellation": 0.50, "grape": 0.30, "wine_type": 0.12, "region": 0.08}


def validated_dimensions(raw: object) -> dict[str, float]:
    if not isinstance(raw, dict):
        return {}
    result: dict[str, float] = {}
    for dimension in SENSORY_DIMENSIONS:
        value = raw.get(dimension)
        if value is None:
            continue
        try:
            parsed = float(value)
        except (TypeError, ValueError):
            continue
        if 0.0 <= parsed <= 1.0:
            result[dimension] = round(parsed, 4)
    return result


def _grape_names(wine: Wine | ExternalWineTasting) -> list[str]:
    return [
        normalize_identity_part(item.get("name"))
        for item in (getattr(wine, "grapes", []) or [])
        if isinstance(item, dict) and normalize_identity_part(item.get("name"))
    ]


def _baseline_for_value(
    db: Session, entity_type: str, entity_key: str
) -> SensoryProfileBaseline | None:
    """Find an exact baseline or the longest baseline contained in qualified metadata."""
    tokens = entity_key.split()
    candidate_keys = {
        " ".join(tokens[start:end])
        for start in range(len(tokens))
        for end in range(start + 1, len(tokens) + 1)
    }
    if not candidate_keys:
        return None
    baselines = db.scalars(
        select(SensoryProfileBaseline).where(
            SensoryProfileBaseline.entity_type == entity_type,
            SensoryProfileBaseline.entity_key.in_(candidate_keys),
            SensoryProfileBaseline.is_active.is_(True),
        )
    ).all()
    return max(baselines, key=lambda item: len(item.entity_key.split()), default=None)


def sensory_profile_for_wine(
    db: Session, wine: Wine | ExternalWineTasting, *, create_identity: bool = False
) -> WineSensoryProfile | None:
    identity = resolve_shared_identity(db, wine, create=create_identity)
    if identity is None:
        return None
    return db.scalar(
        select(WineSensoryProfile).where(WineSensoryProfile.identity_id == identity.id)
    )


def infer_sensory_profile(
    db: Session, wine: Wine | ExternalWineTasting
) -> tuple[dict[str, float], str, float]:
    """Blend explicit reusable baselines; use type defaults only as a last free signal."""
    candidates: list[tuple[float, dict[str, float], float, str]] = []
    lookups = [
        ("appellation", normalize_identity_part(wine.appellation)),
        ("region", normalize_identity_part(wine.region)),
        ("wine_type", normalize_identity_part(normalize_wine_type(wine.type))),
    ] + [("grape", grape) for grape in _grape_names(wine)]
    for entity_type, entity_key in lookups:
        if not entity_key:
            continue
        baseline = _baseline_for_value(db, entity_type, entity_key)
        dimensions = validated_dimensions(baseline.dimensions) if baseline else {}
        if dimensions and baseline is not None:
            candidates.append(
                (
                    BASELINE_WEIGHTS.get(entity_type, 0.1),
                    dimensions,
                    baseline.confidence,
                    entity_type,
                )
            )
    wine_type = normalize_wine_type(wine.type)
    if not candidates and wine_type in TYPE_BASELINES:
        return dict(TYPE_BASELINES[wine_type]), "metadata", 0.35
    if not candidates:
        return {}, "missing", 0.0
    totals: dict[str, float] = defaultdict(float)
    weights: dict[str, float] = defaultdict(float)
    confidence_weight = 0.0
    confidence_total = 0.0
    kinds: set[str] = set()
    for weight, dimensions, confidence, kind in candidates:
        kinds.add(kind)
        confidence_weight += weight * max(0.0, min(float(confidence), 1.0))
        confidence_total += weight
        for key, value in dimensions.items():
            totals[key] += value * weight
            weights[key] += weight
    result = {key: round(totals[key] / weights[key], 4) for key in totals if weights[key]}
    source = next(iter(kinds)) if len(kinds) == 1 else "hybrid"
    coverage = len(result) / len(SENSORY_DIMENSIONS)
    confidence = round(
        min(0.85, (confidence_weight / confidence_total) * (0.55 + 0.45 * coverage)), 4
    )
    return result, source, confidence


def generate_wine_sensory_profile(
    db: Session,
    wine: Wine | ExternalWineTasting,
    *,
    allow_ai: bool = False,
    ai_generate: Callable[[Any], tuple[dict[str, float], str]] | None = None,
    modified_by_user_id: UUID | None = None,
) -> WineSensoryProfile | None:
    """Resolve once. AI is opt-in and only reached after every free source failed."""
    existing = sensory_profile_for_wine(db, wine, create_identity=True)
    if existing and existing.validated:
        return existing
    dimensions, source, confidence = infer_sensory_profile(db, wine)
    model = ""
    if not dimensions and allow_ai and ai_generate is not None:
        generated, model = ai_generate(wine)
        dimensions = validated_dimensions(generated)
        source, confidence = ("ai", 0.65) if dimensions else ("missing", 0.0)
    if not dimensions:
        if existing:
            existing.generation_status = "pending"
        return existing
    identity = resolve_shared_identity(db, wine, create=True)
    if identity is None:
        return None
    profile = existing or WineSensoryProfile(identity_id=identity.id)
    if existing is None:
        db.add(profile)
    profile.dimensions = dimensions
    profile.source = source
    profile.confidence = confidence
    profile.generation_status = "available"
    profile.model = model[:120]
    profile.generated_at = datetime.now(UTC)
    profile.last_modified_by_user_id = modified_by_user_id
    return profile


def mark_wine_for_sensory_enrichment(db: Session, wine: Wine | ExternalWineTasting) -> None:
    profile = sensory_profile_for_wine(db, wine, create_identity=True)
    if profile is None:
        identity = resolve_shared_identity(db, wine, create=True)
        if identity is not None:
            db.add(
                WineSensoryProfile(
                    identity_id=identity.id, generation_status="pending", source="missing"
                )
            )


def rating_weight(
    rating: float,
    neutral_rating: float = NEUTRAL_RATING,
    min_rating: float = 1,
    max_rating: float = 6,
) -> float:
    if rating <= 0 or min_rating >= neutral_rating or max_rating <= neutral_rating:
        return 0.0
    denominator = (
        max_rating - neutral_rating if rating >= neutral_rating else neutral_rating - min_rating
    )
    return max(-1.0, min(1.0, (rating - neutral_rating) / denominator))


def tasting_preference_weight(rating: float, enjoyment: str = "") -> float:
    """Combine the explicit score with the optional positive/negative tasting signal."""
    enjoyment_weight = {"positive": 0.35, "negative": -0.35}.get(enjoyment, 0.0)
    return max(-1.0, min(1.0, rating_weight(rating) + enjoyment_weight))


def _category(wine: Wine | ExternalWineTasting) -> str:
    wine_type = normalize_wine_type(wine.type)
    return wine_type if wine_type in TASTE_CATEGORIES else "global"


def _attribute_values(wine: Wine | ExternalWineTasting) -> dict[str, list[str]]:
    result = {
        "preferred_countries": [getattr(wine, "vineyard_country", "")],
        "preferred_regions": [wine.region],
        "preferred_appellations": [wine.appellation],
        "preferred_producers": [wine.producer],
        "preferred_grapes": [
            item.get("name", "")
            for item in (getattr(wine, "grapes", []) or [])
            if isinstance(item, dict)
        ],
    }
    price = getattr(wine, "price", None)
    if price is not None:
        amount = float(price)
        result["preferred_price_ranges"] = [
            "under_30" if amount < 30 else "30_60" if amount <= 60 else "over_60"
        ]
    return {
        key: [str(value).strip() for value in values if str(value).strip()]
        for key, values in result.items()
    }


def rebuild_user_taste_profile(db: Session, user_id: UUID) -> list[UserTasteProfile]:
    """Authoritative rebuild: only the user's own tasting entries are eligible."""
    rows = list(
        db.execute(
            select(WineTastingEntry, Wine, WineSensoryProfile)
            .join(Wine, Wine.id == WineTastingEntry.wine_id)
            .outerjoin(
                WineSensoryProfile, WineSensoryProfile.identity_id == Wine.shared_identity_id
            )
            .where(
                WineTastingEntry.created_by_user_id == user_id,
                or_(
                    WineTastingEntry.rating > 0,
                    WineTastingEntry.enjoyment.in_(("positive", "negative")),
                ),
            )
            .order_by(WineTastingEntry.consumed_at, WineTastingEntry.id)
        )
    )
    accumulators: dict[str, dict[str, list[tuple[float, float, float]]]] = defaultdict(
        lambda: defaultdict(list)
    )
    attribute_scores: dict[str, dict[str, dict[str, float]]] = defaultdict(
        lambda: defaultdict(lambda: defaultdict(float))
    )
    samples: dict[str, int] = defaultdict(int)
    for tasting, wine, profile in rows:
        categories = ["global"] + ([] if _category(wine) == "global" else [_category(wine)])
        weight = tasting_preference_weight(float(tasting.rating), tasting.enjoyment)
        for category in categories:
            samples[category] += 1
            for key, label_values in _attribute_values(wine).items():
                for value in label_values:
                    attribute_scores[category][key][value] += weight
            if not profile or profile.generation_status != "available":
                continue
            profile_dimensions = validated_dimensions(profile.dimensions)
            for dimension, value in profile_dimensions.items():
                accumulators[category][dimension].append((weight, value, profile.confidence))
    rating_rows = db.execute(
        select(UserWineRating, Wine, WineSensoryProfile)
        .join(Wine, Wine.id == UserWineRating.wine_id)
        .outerjoin(WineSensoryProfile, WineSensoryProfile.identity_id == Wine.shared_identity_id)
        .where(UserWineRating.user_id == user_id, UserWineRating.rating > 0)
    )
    for star_rating, wine, profile in rating_rows:
        weight = rating_weight(float(star_rating.rating)) * 0.5
        categories = ["global"] + ([] if _category(wine) == "global" else [_category(wine)])
        for category in categories:
            samples[category] += 1
            for key, label_values in _attribute_values(wine).items():
                for value in label_values:
                    attribute_scores[category][key][value] += weight
            if not profile or profile.generation_status != "available":
                continue
            for dimension, value in validated_dimensions(profile.dimensions).items():
                accumulators[category][dimension].append((weight, value, profile.confidence))
    external_rows = db.execute(
        select(ExternalWineTasting, WineSensoryProfile)
        .outerjoin(
            WineSensoryProfile,
            WineSensoryProfile.identity_id == ExternalWineTasting.shared_identity_id,
        )
        .where(
            ExternalWineTasting.created_by_user_id == user_id,
            or_(
                ExternalWineTasting.rating > 0,
                ExternalWineTasting.enjoyment.in_(("positive", "negative")),
            ),
        )
    )
    for tasting, profile in external_rows:
        categories = ["global"] + ([] if _category(tasting) == "global" else [_category(tasting)])
        weight = tasting_preference_weight(float(tasting.rating), tasting.enjoyment)
        for category in categories:
            samples[category] += 1
            for key, label_values in _attribute_values(tasting).items():
                for value in label_values:
                    attribute_scores[category][key][value] += weight
            if not profile or profile.generation_status != "available":
                continue
            for dimension, value in validated_dimensions(profile.dimensions).items():
                accumulators[category][dimension].append((weight, value, profile.confidence))
    db.query(UserTasteProfile).filter(UserTasteProfile.user_id == user_id).delete(
        synchronize_session=False
    )
    if not samples:
        empty = UserTasteProfile(
            user_id=user_id,
            category="global",
            dimensions={},
            attributes={},
            confidence=0.0,
            sample_count=0,
            calculation_version=TASTE_PROFILE_CALCULATION_VERSION,
            rebuilt_at=datetime.now(UTC),
        )
        db.add(empty)
        db.flush()
        return [empty]
    now = datetime.now(UTC)
    profiles: list[UserTasteProfile] = []
    for category in sorted(samples):
        dimensions: dict[str, dict] = {}
        confidence_values: list[float] = []
        for dimension, contributions in accumulators[category].items():
            total_strength = sum(abs(weight) for weight, _, _ in contributions)
            if not total_strength:
                continue
            affinity = sum(weight * value for weight, value, _ in contributions) / total_strength
            profile_confidence = (
                sum(abs(weight) * confidence for weight, _, confidence in contributions)
                / total_strength
            )
            confidence = (1 - exp(-total_strength / 6)) * profile_confidence
            dimensions[dimension] = {
                "preference": round(0.5 + affinity / 2, 4),
                "confidence": round(confidence, 4),
                "samples": len(contributions),
            }
            confidence_values.append(confidence)
        attributes = {
            key: [
                [value, round(score, 4)]
                for value, score in sorted(values.items(), key=lambda item: item[1], reverse=True)
                if score > 0
            ][:5]
            for key, values in attribute_scores[category].items()
        }
        confidence = round(
            (sum(confidence_values) / len(confidence_values)) if confidence_values else 0.0, 4
        )
        profile = UserTasteProfile(
            user_id=user_id,
            category=category,
            dimensions=dimensions,
            attributes=attributes,
            confidence=confidence,
            sample_count=samples[category],
            calculation_version=TASTE_PROFILE_CALCULATION_VERSION,
            rebuilt_at=now,
        )
        db.add(profile)
        profiles.append(profile)
    db.flush()
    return profiles


def record_user_wine_rating(db: Session, *, user_id: UUID, wine: Wine, rating: int) -> None:
    """Persist a user's private star signal and refresh only that user's derived profile."""
    personal_rating = db.scalar(
        select(UserWineRating).where(
            UserWineRating.user_id == user_id,
            UserWineRating.household_id == wine.household_id,
            UserWineRating.wine_id == wine.id,
        )
    )
    if rating <= 0:
        if personal_rating is not None:
            db.delete(personal_rating)
    elif personal_rating is None:
        db.add(
            UserWineRating(
                user_id=user_id, household_id=wine.household_id, wine_id=wine.id, rating=rating
            )
        )
    else:
        personal_rating.rating = rating
    db.flush()
    rebuild_user_taste_profile(db, user_id)


def unassigned_tasting_count(db: Session, household_id: UUID) -> int:
    return int(
        db.scalar(
            select(func.count(WineTastingEntry.id))
            .join(Wine, Wine.id == WineTastingEntry.wine_id)
            .where(
                Wine.household_id == household_id,
                WineTastingEntry.created_by_user_id.is_(None),
            )
        )
        or 0
    )


def claim_unassigned_tastings(
    db: Session, *, household_id: UUID, user_id: UUID
) -> tuple[int, list[UserTasteProfile]]:
    """Explicitly assign only unowned tasting history from the active household."""
    entries = list(
        db.scalars(
            select(WineTastingEntry)
            .join(Wine, Wine.id == WineTastingEntry.wine_id)
            .where(
                Wine.household_id == household_id,
                WineTastingEntry.created_by_user_id.is_(None),
            )
        )
    )
    for entry in entries:
        entry.created_by_user_id = user_id
    return len(entries), rebuild_user_taste_profile(db, user_id)


def calculate_taste_match(
    db: Session, user_id: UUID, wine: Wine, *, category: str | None = None
) -> dict:
    sensory = sensory_profile_for_wine(db, wine)
    target_category = category or _category(wine)
    profile = db.scalar(
        select(UserTasteProfile).where(
            UserTasteProfile.user_id == user_id, UserTasteProfile.category == target_category
        )
    )
    profile_has_dimensions = bool(
        profile
        and isinstance(profile.dimensions, dict)
        and any(
            isinstance(value, dict) and value.get("confidence", 0) > 0
            for value in profile.dimensions.values()
        )
    )
    if not profile_has_dimensions and target_category != "global":
        profile = db.scalar(
            select(UserTasteProfile).where(
                UserTasteProfile.user_id == user_id, UserTasteProfile.category == "global"
            )
        )
    dimensions = (
        validated_dimensions(sensory.dimensions)
        if sensory and sensory.generation_status == "available"
        else {}
    )
    if not profile or not dimensions:
        return {"score": None, "confidence": 0.0, "matching_traits": [], "conflicting_traits": []}
    assert sensory is not None
    compared: list[tuple[str, float, float]] = []
    for key, wine_value in dimensions.items():
        preference = profile.dimensions.get(key, {}) if isinstance(profile.dimensions, dict) else {}
        if not isinstance(preference, dict) or preference.get("confidence", 0) <= 0:
            continue
        compared.append((key, wine_value, float(preference["preference"])))
    confidence = min(float(sensory.confidence), float(profile.confidence)) * min(
        1.0, len(compared) / 4
    )
    if len(compared) < 3 or confidence <= 0:
        return {
            "score": None,
            "confidence": round(confidence, 4),
            "matching_traits": [],
            "conflicting_traits": [],
        }
    closeness = [
        (key, 1 - abs(wine_value - preference)) for key, wine_value, preference in compared
    ]
    matching = [
        key.replace("_", " ")
        for key, value in sorted(closeness, key=lambda item: item[1], reverse=True)[:3]
        if value >= 0.65
    ]
    conflicting = [
        key.replace("_", " ")
        for key, value in sorted(closeness, key=lambda item: item[1])[:2]
        if value < 0.45
    ]
    profile_score = sum(value for _, value in closeness) / len(closeness)
    direct_weights = [
        tasting_preference_weight(float(tasting.rating), tasting.enjoyment)
        for tasting in db.scalars(
            select(WineTastingEntry).where(
                WineTastingEntry.created_by_user_id == user_id,
                WineTastingEntry.household_id == wine.household_id,
                WineTastingEntry.wine_id == wine.id,
                or_(
                    WineTastingEntry.rating > 0,
                    WineTastingEntry.enjoyment.in_(("positive", "negative")),
                ),
            )
        )
    ]
    personal_rating = db.scalar(
        select(UserWineRating).where(
            UserWineRating.user_id == user_id,
            UserWineRating.household_id == wine.household_id,
            UserWineRating.wine_id == wine.id,
        )
    )
    if personal_rating is not None:
        direct_weights.append(rating_weight(float(personal_rating.rating)))
    direct_score = 0.5 + (sum(direct_weights) / len(direct_weights)) / 2 if direct_weights else None
    score = profile_score if direct_score is None else (profile_score * 0.25 + direct_score * 0.75)
    return {
        "score": round(score, 4),
        "confidence": round(confidence, 4),
        "matching_traits": matching,
        "conflicting_traits": conflicting,
    }


def confidence_level(confidence: float) -> str:
    return "established" if confidence >= 0.6 else "probable" if confidence >= 0.3 else "emerging"


def compact_taste_context(db: Session, user_id: UUID, *, category: str | None = None) -> dict:
    """Small, non-identifying context safe to pass to the sommelier prompt."""
    selected = category if category in TASTE_CATEGORIES else "global"
    profile = db.scalar(
        select(UserTasteProfile).where(
            UserTasteProfile.user_id == user_id, UserTasteProfile.category == selected
        )
    )
    if profile is None or profile.confidence < 0.2:
        return {}
    dimensions = {
        key: value.get("preference")
        for key, value in (profile.dimensions or {}).items()
        if isinstance(value, dict) and value.get("confidence", 0) >= 0.2
    }
    return {
        "category": profile.category,
        "confidence": round(profile.confidence, 2),
        "dimensions": dimensions,
    }
