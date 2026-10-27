"""Shared wine sensory data and private, deterministic user taste calculations."""
# ruff: noqa: E501

from __future__ import annotations

from collections import defaultdict
from collections.abc import Callable
from datetime import UTC, datetime
from math import exp, isfinite
from typing import Any
from uuid import UUID

from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from app.core.wine_types import normalize_wine_type
from app.models import (
    ExternalWineTasting,
    SensoryProfileBaseline,
    SharedWineIdentity,
    UserTasteProfile,
    UserTasteProfileRevision,
    UserWineRating,
    Wine,
    WineSensoryProfile,
    WineTastingEntry,
    WishlistItem,
)
from app.services.grape_names import clean_grape_name
from app.services.shared_wine_data import (
    identity_key,
    identity_parts,
    normalize_identity_part,
    resolve_shared_identity,
)

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
# Version 4 (observed only): every rating is compared with the user's own average
# instead of the fixed three stars, and a wine below that average pushes the
# preferred level away from its own. Most people rate nearly everything above
# three stars, so V2 ends up describing what they drink rather than what they
# prefer; V4 reads "4 stars from someone who usually gives 5" as lukewarm.
# Version 3 (an "ideal level" estimate on absolute ratings) ranked no better
# than chance and was retired.
TASTE_PROFILE_SHADOW_VERSION = 4
# The personal average starts from the neutral three stars as if rated this many
# times, so a handful of tastings cannot move it far, and stays in a range that
# leaves room on both sides of the scale.
PERSONAL_NEUTRAL_PRIOR_EXPERIENCES = 3.0
PERSONAL_NEUTRAL_RANGE = (2.0, 5.0)
# Favourites (producers, regions, grapes…) are ranked by average stars, shrunk
# toward the user's overall average as if each had this many extra experiences.
FAVOURITE_PRIOR_EXPERIENCES = 3.0
# Stored in a profile's attributes so readers can tell this ranking from the
# earlier "sum of experiences" one, and stale profiles can be rebuilt.
# Version 2: grapes in a blend take their share of the rating.
# Version 3: entries rated below neutral are kept as "avoided_*" for the sommelier.
FAVOURITE_SCORING_MARKER = [["average_stars", 3]]
# Stored on the global profile as attributes["validation"], so the sommelier can
# tell how much the sensory dimensions are worth: [[status, ranking_auc, tested, negatives]].
VALIDATION_ATTRIBUTE = "validation"
# Below this leave-one-out AUC the dimensions barely tell liked wines from
# disliked ones (0.5 is chance): the sommelier is told to rely on the lists.
WEAK_DIMENSIONS_AUC = 0.65
GOOD_DIMENSIONS_AUC = 0.75
# What the sommelier is told about likes and dislikes, by attribute.
SOMMELIER_FAVOURITE_KINDS = {
    "grapes": "grapes",
    "producers": "producers",
    "regions": "regions",
    "appellations": "appellations",
}


def star_equivalent(weight: float) -> float:
    """Map a preference weight (-1..1) back onto the 1..6 star scale (3 = neutral)."""
    return NEUTRAL_RATING + weight * (6 - NEUTRAL_RATING if weight >= 0 else NEUTRAL_RATING - 1)


def has_current_favourite_scoring(attributes: dict | None) -> bool:
    return isinstance(attributes, dict) and attributes.get("scoring") == FAVOURITE_SCORING_MARKER


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


def sensory_dimension_confidence(profile: WineSensoryProfile, dimension: str) -> float:
    """Use trait provenance when present; retain legacy confidence for old profiles."""
    provenance = profile.provenance or {}
    if not provenance:
        return float(profile.confidence)
    proof = provenance.get(dimension)
    if not isinstance(proof, dict):
        return 0.0
    try:
        value = float(proof.get("confidence", 0))
        return value if 0 <= value <= 1 else 0.0
    except (TypeError, ValueError):
        return 0.0


def reliable_sensory_dimensions(profile: WineSensoryProfile) -> dict[str, float]:
    return {
        key: value
        for key, value in validated_dimensions(profile.dimensions).items()
        if sensory_dimension_confidence(profile, key) > 0
    }


def _grape_names(wine: Wine | ExternalWineTasting | WishlistItem) -> list[str]:
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
    db: Session, wine: Wine | ExternalWineTasting | WishlistItem
) -> tuple[dict[str, float], str, float]:
    """Blend explicit reusable baselines; use type defaults only as a last free signal."""
    candidates: list[tuple[float, dict[str, float], float, str]] = []
    grapes = {
        normalize_identity_part(item.get("name")): item
        for item in (getattr(wine, "grapes", []) or [])
        if isinstance(item, dict) and normalize_identity_part(item.get("name"))
    }
    shares: dict[str, float] = {}
    for name, item in grapes.items():
        try:
            lower = float(item["percentage_from"])
            upper = float(item.get("percentage_to", lower))
            if not (isfinite(lower) and isfinite(upper) and 0 <= lower <= upper <= 100):
                break
            shares[name] = (lower + upper) / 200
        except (KeyError, TypeError, ValueError):
            break
    if len(shares) != len(grapes) or abs(sum(shares.values()) - 1) > 0.005:
        shares = {name: 1 / len(grapes) for name in grapes}
    lookups = [
        ("appellation", normalize_identity_part(wine.appellation), 1.0),
        ("region", normalize_identity_part(wine.region), 1.0),
        ("wine_type", normalize_identity_part(normalize_wine_type(wine.type)), 1.0),
    ] + [("grape", name, share) for name, share in shares.items()]
    for entity_type, entity_key, share in lookups:
        if not entity_key:
            continue
        baseline = _baseline_for_value(db, entity_type, entity_key)
        dimensions = validated_dimensions(baseline.dimensions) if baseline else {}
        if dimensions and baseline is not None and baseline.confidence > 0 and share > 0:
            candidates.append(
                (
                    BASELINE_WEIGHTS.get(entity_type, 0.1) * share,
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
    force_refresh: bool = False,
) -> WineSensoryProfile | None:
    """Resolve once. AI is opt-in and only reached after every free source failed."""
    existing = sensory_profile_for_wine(db, wine, create_identity=True)
    if existing and existing.provenance:
        return existing  # Legacy metadata inference must not replace an evidence-led profile.
    if (
        existing
        and existing.validated
        and existing.generation_status == "available"
        and validated_dimensions(existing.dimensions)
        and not force_refresh
    ):
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
    profile.provenance = {}
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


def tasting_preference_weight(
    rating: float, enjoyment: str = "", neutral_rating: float = NEUTRAL_RATING
) -> float:
    """Combine the explicit score with the optional positive/negative tasting signal."""
    enjoyment_weight = {"positive": 0.35, "negative": -0.35}.get(enjoyment, 0.0)
    return max(-1.0, min(1.0, rating_weight(rating, neutral_rating) + enjoyment_weight))


def personal_neutral_rating(ratings: list[float]) -> float:
    """The star rating that counts as neither liked nor disliked for this user (V4)."""
    rated = [rating for rating in ratings if rating > 0]
    average = (PERSONAL_NEUTRAL_PRIOR_EXPERIENCES * NEUTRAL_RATING + sum(rated)) / (
        PERSONAL_NEUTRAL_PRIOR_EXPERIENCES + len(rated)
    )
    low, high = PERSONAL_NEUTRAL_RANGE
    return max(low, min(high, average))


# One experience with sensory data: (rating, enjoyment, weight, level, source confidence).
# The weight tempers direct star ratings (0.5) against recorded tastings (1).
Experience = tuple[float, str, float, float, float]


def experience_signal(experience: Experience, neutral_rating: float = NEUTRAL_RATING) -> float:
    rating, enjoyment, weight, _, _ = experience
    return tasting_preference_weight(rating, enjoyment, neutral_rating) * weight


def _dimension_contributions(
    experiences: list[Experience], neutral_rating: float = NEUTRAL_RATING
) -> list[tuple[float, float, float]]:
    return [
        (experience_signal(experience, neutral_rating), experience[3], experience[4])
        for experience in experiences
    ]


def _category(wine: Wine | ExternalWineTasting | WishlistItem) -> str:
    wine_type = normalize_wine_type(wine.type)
    return wine_type if wine_type in TASTE_CATEGORIES else "global"


def _attribute_values(wine: Wine | ExternalWineTasting) -> dict[str, list[str]]:
    result = {
        "preferred_countries": [getattr(wine, "vineyard_country", "")],
        "preferred_regions": [wine.region],
        "preferred_appellations": [wine.appellation],
        "preferred_producers": [wine.producer],
        "preferred_grapes": [
            clean_grape_name(item.get("name", ""))
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


def grape_shares(wine: Wine | ExternalWineTasting) -> dict[str, float]:
    """Each grape's share of the wine (summing to 1), to split a rating across a blend.

    Known percentages are used (the middle of a range); grapes without one share
    what the known ones leave, or split the wine equally when none is known.
    """
    known: dict[str, float] = {}
    unknown: list[str] = []
    for item in getattr(wine, "grapes", []) or []:
        if not isinstance(item, dict):
            continue
        name = clean_grape_name(item.get("name", ""))
        if not name or name in known or name in unknown:
            continue
        values = [
            float(value)
            for value in (item.get("percentage_from"), item.get("percentage_to"))
            if isinstance(value, int | float) and not isinstance(value, bool) and value > 0
        ]
        if values:
            known[name] = sum(values) / len(values)
        else:
            unknown.append(name)
    if not known and not unknown:
        return {}
    shares = {name: percent / 100 for name, percent in known.items()}
    remaining = max(0.0, 1 - sum(shares.values()))
    if unknown:
        # With no percentage at all the grapes split the wine equally.
        each = (remaining if known else 1.0) / len(unknown)
        shares.update({name: each for name in unknown})
    total = sum(shares.values())
    if total <= 0:
        return {name: 1 / len(shares) for name in shares}
    return {name: share / total for name, share in shares.items()}


def _active_dimension(
    contributions: list[tuple[float, float, float]],
) -> tuple[dict[str, float | int], float] | None:
    total_strength = sum(abs(signal) for signal, _, _ in contributions)
    if not total_strength:
        return None
    affinity = sum(signal * value for signal, value, _ in contributions) / total_strength
    source_confidence = (
        sum(abs(signal) * confidence for signal, _, confidence in contributions) / total_strength
    )
    confidence = (1 - exp(-total_strength / 6)) * source_confidence
    return (
        {
            "preference": round(0.5 + affinity / 2, 4),
            "confidence": round(confidence, 4),
            "samples": len(contributions),
        },
        confidence,
    )


def _candidate_dimension(
    contributions: list[tuple[float, float, float]],
) -> tuple[dict[str, float | int], float] | None:
    """V4: the level of the wines rated above the user's average, away from the others.

    An experience below the personal neutral pushes the preferred level toward
    the opposite side of the scale; in V2 it could only dilute the liked wines.
    """
    total_strength = sum(abs(signal) for signal, _, _ in contributions)
    if not total_strength:
        return None
    preference = (
        sum(
            abs(signal) * (value if signal > 0 else 1 - value) for signal, value, _ in contributions
        )
        / total_strength
    )
    source_confidence = (
        sum(abs(signal) * confidence for signal, _, confidence in contributions) / total_strength
    )
    confidence = (1 - exp(-total_strength / 6)) * source_confidence
    return (
        {
            "preference": round(preference, 4),
            "confidence": round(confidence, 4),
            "samples": len(contributions),
        },
        confidence,
    )


def ranking_auc(scores: list[float], signals: list[float]) -> float | None:
    """Probability that a liked experience scores above a disliked one (ties count half).

    Unlike the mean error, it does not reward a model for predicting high values
    when most experiences are positive: it only asks whether liked wines rank first.
    """
    positives = [score for score, signal in zip(scores, signals, strict=True) if signal > 0]
    negatives = [score for score, signal in zip(scores, signals, strict=True) if signal < 0]
    if not positives or not negatives:
        return None
    wins = sum(
        1.0 if positive > negative else 0.5 if positive == negative else 0.0
        for positive in positives
        for negative in negatives
    )
    return wins / (len(positives) * len(negatives))


def validate_taste_profile_algorithms(
    db: Session, *, household_id: UUID, user_id: UUID
) -> dict[str, object]:
    """Compare V2 and the V4 candidate against held-out experiences without changing either profile."""
    observations: list[tuple[Experience, dict[str, float]]] = []

    def append_observation(
        rating: float, enjoyment: str, weight: float, sensory_profile: WineSensoryProfile | None
    ) -> None:
        if (
            not tasting_preference_weight(rating, enjoyment)
            or sensory_profile is None
            or sensory_profile.generation_status != "available"
        ):
            return
        dimensions = reliable_sensory_dimensions(sensory_profile)
        if len(dimensions) < 3:
            return
        confidence = float(sensory_profile.confidence)
        observations.append(((rating, enjoyment, weight, 0.0, confidence), dimensions))

    tasting_rows = db.execute(
        select(WineTastingEntry, WineSensoryProfile)
        .join(Wine, Wine.id == WineTastingEntry.wine_id)
        .outerjoin(WineSensoryProfile, WineSensoryProfile.identity_id == Wine.shared_identity_id)
        .where(
            WineTastingEntry.household_id == household_id,
            WineTastingEntry.created_by_user_id == user_id,
            Wine.household_id == household_id,
            or_(
                WineTastingEntry.rating > 0,
                WineTastingEntry.enjoyment.in_(("positive", "negative")),
            ),
        )
    )
    for tasting, sensory_profile in tasting_rows:
        append_observation(float(tasting.rating), tasting.enjoyment, 1.0, sensory_profile)

    rating_rows = db.execute(
        select(UserWineRating, WineSensoryProfile)
        .join(Wine, Wine.id == UserWineRating.wine_id)
        .outerjoin(WineSensoryProfile, WineSensoryProfile.identity_id == Wine.shared_identity_id)
        .where(
            UserWineRating.user_id == user_id,
            UserWineRating.household_id == household_id,
            Wine.household_id == household_id,
            UserWineRating.rating > 0,
        )
    )
    for rating, sensory_profile in rating_rows:
        append_observation(float(rating.rating), "", 0.5, sensory_profile)

    external_rows = db.execute(
        select(ExternalWineTasting, WineSensoryProfile)
        .outerjoin(
            WineSensoryProfile,
            WineSensoryProfile.identity_id == ExternalWineTasting.shared_identity_id,
        )
        .where(
            ExternalWineTasting.household_id == household_id,
            ExternalWineTasting.created_by_user_id == user_id,
            or_(
                ExternalWineTasting.rating > 0,
                ExternalWineTasting.enjoyment.in_(("positive", "negative")),
            ),
        )
    )
    for tasting, sensory_profile in external_rows:
        append_observation(float(tasting.rating), tasting.enjoyment, 1.0, sensory_profile)

    def prediction(targets: dict[str, float], held_out: dict[str, float]) -> float | None:
        common = [dimension for dimension in held_out if dimension in targets]
        if len(common) < 3:
            return None
        return sum(1 - abs(held_out[dimension] - targets[dimension]) for dimension in common) / len(
            common
        )

    v2_errors: list[float] = []
    candidate_errors: list[float] = []
    v2_scores: list[float] = []
    candidate_scores: list[float] = []
    tested_signals: list[float] = []
    for held_out_index, (held_out, held_out_dimensions) in enumerate(observations):
        training = [
            observation for index, observation in enumerate(observations) if index != held_out_index
        ]
        # The candidate's neutral point is learnt from the training experiences only.
        neutral = personal_neutral_rating([experience[0] for experience, _ in training])
        v2_targets: dict[str, float] = {}
        candidate_targets: dict[str, float] = {}
        per_dimension: dict[str, list[Experience]] = defaultdict(list)
        for experience, dimensions in training:
            for dimension, value in dimensions.items():
                per_dimension[dimension].append(experience[:3] + (value, experience[4]))
        for dimension, experiences in per_dimension.items():
            active = _active_dimension(_dimension_contributions(experiences))
            candidate = _candidate_dimension(_dimension_contributions(experiences, neutral))
            if active is not None:
                v2_targets[dimension] = float(active[0]["preference"])
            if candidate is not None:
                candidate_targets[dimension] = float(candidate[0]["preference"])
        v2_prediction = prediction(v2_targets, held_out_dimensions)
        candidate_prediction = prediction(candidate_targets, held_out_dimensions)
        if v2_prediction is None or candidate_prediction is None:
            continue
        # Liked or disliked is the user's own absolute verdict (above or below
        # three stars) for both algorithms, so the rankings are comparable.
        held_out_signal = experience_signal(held_out)
        v2_errors.append(abs(v2_prediction - (0.5 + held_out_signal / 2)))
        candidate_errors.append(
            abs(candidate_prediction - (0.5 + experience_signal(held_out, neutral) / 2))
        )
        v2_scores.append(v2_prediction)
        candidate_scores.append(candidate_prediction)
        tested_signals.append(held_out_signal)

    positive_count = sum(signal > 0 for signal in tested_signals)
    negative_count = sum(signal < 0 for signal in tested_signals)
    sufficient = len(tested_signals) >= 8 and positive_count >= 2 and negative_count >= 2
    if not sufficient:
        return {
            "status": "insufficient",
            "tested_experiences": len(tested_signals),
            "positive_experiences": positive_count,
            "negative_experiences": negative_count,
            "v2_mean_absolute_error": None,
            "candidate_mean_absolute_error": None,
            "v2_ranking_auc": None,
            "candidate_ranking_auc": None,
            "winner": "insufficient",
        }
    v2_mae = sum(v2_errors) / len(v2_errors)
    candidate_mae = sum(candidate_errors) / len(candidate_errors)
    # The sufficiency check guarantees both classes; 0.5 (chance) is only a guard.
    v2_ranking = ranking_auc(v2_scores, tested_signals)
    candidate_ranking = ranking_auc(candidate_scores, tested_signals)
    v2_auc = 0.5 if v2_ranking is None else v2_ranking
    candidate_auc = 0.5 if candidate_ranking is None else candidate_ranking
    # The verdict follows the ranking: telling liked wines from disliked ones is
    # what recommendations need. The mean error is kept as a calibration hint.
    difference = candidate_auc - v2_auc
    winner = "candidate" if difference >= 0.03 else "v2" if difference <= -0.03 else "tie"
    return {
        "status": "ready",
        "tested_experiences": len(tested_signals),
        "positive_experiences": positive_count,
        "negative_experiences": negative_count,
        "v2_mean_absolute_error": round(v2_mae, 4),
        "candidate_mean_absolute_error": round(candidate_mae, 4),
        "v2_ranking_auc": round(v2_auc, 4),
        "candidate_ranking_auc": round(candidate_auc, 4),
        "winner": winner,
    }


def _archive_profile(db: Session, profile: UserTasteProfile, *, reason: str = "rebuild") -> None:
    db.add(
        UserTasteProfileRevision(
            profile_id=profile.id,
            user_id=profile.user_id,
            household_id=profile.household_id,
            category=profile.category,
            dimensions=dict(profile.dimensions or {}),
            attributes=dict(profile.attributes or {}),
            confidence=profile.confidence,
            sample_count=profile.sample_count,
            calculation_version=profile.calculation_version,
            rebuilt_at=profile.rebuilt_at,
            archived_at=datetime.now(UTC),
            archive_reason=reason,
        )
    )


def rebuild_user_taste_profile(
    db: Session, *, household_id: UUID, user_id: UUID
) -> list[UserTasteProfile]:
    """Authoritative rebuild: only the user's own tasting entries are eligible."""
    rows = list(
        db.execute(
            select(WineTastingEntry, Wine, WineSensoryProfile)
            .join(Wine, Wine.id == WineTastingEntry.wine_id)
            .outerjoin(
                WineSensoryProfile, WineSensoryProfile.identity_id == Wine.shared_identity_id
            )
            .where(
                Wine.household_id == household_id,
                WineTastingEntry.household_id == household_id,
                WineTastingEntry.created_by_user_id == user_id,
                or_(
                    WineTastingEntry.rating > 0,
                    WineTastingEntry.enjoyment.in_(("positive", "negative")),
                ),
            )
            .order_by(WineTastingEntry.consumed_at, WineTastingEntry.id)
        )
    )
    accumulators: dict[str, dict[str, list[Experience]]] = defaultdict(lambda: defaultdict(list))
    # Every star rating per category: the V4 candidate's neutral point.
    category_stars: dict[str, list[float]] = defaultdict(list)
    # Star-equivalent of every experience per favourite with its weight (a grape's
    # share of a blend, otherwise 1), used for the ranking; the category totals
    # give the user's own average, the starting point of each one.
    attribute_scores: dict[str, dict[str, dict[str, list[tuple[float, float]]]]] = defaultdict(
        lambda: defaultdict(lambda: defaultdict(list))
    )
    category_scores: dict[str, list[float]] = defaultdict(list)
    # Shown beside each favourite so its score can be read: how many times it was
    # drunk and how it was rated on average (stars, 1..6).
    attribute_drinks: dict[str, dict[str, dict[str, int]]] = defaultdict(
        lambda: defaultdict(lambda: defaultdict(int))
    )
    attribute_ratings: dict[str, dict[str, dict[str, list[float]]]] = defaultdict(
        lambda: defaultdict(lambda: defaultdict(list))
    )

    def record_attribute(
        category: str,
        source: Wine | ExternalWineTasting,
        score: float,
        *,
        drink: bool,
        stars: float,
    ) -> None:
        category_scores[category].append(score)
        shares = grape_shares(source)
        for key, label_values in _attribute_values(source).items():
            for value in label_values:
                # In a blend each grape takes only its share of the rating.
                weight = shares.get(value, 1.0) if key == "preferred_grapes" else 1.0
                attribute_scores[category][key][value].append((score, weight))
                if drink:
                    attribute_drinks[category][key][value] += 1
                if stars > 0:
                    attribute_ratings[category][key][value].append(stars)

    samples: dict[str, int] = defaultdict(int)
    for tasting, wine, profile in rows:
        categories = ["global"] + ([] if _category(wine) == "global" else [_category(wine)])
        weight = tasting_preference_weight(float(tasting.rating), tasting.enjoyment)
        for category in categories:
            samples[category] += 1
            category_stars[category].append(float(tasting.rating))
            record_attribute(
                category, wine, star_equivalent(weight), drink=True, stars=float(tasting.rating)
            )
            if not profile or profile.generation_status != "available":
                continue
            profile_dimensions = reliable_sensory_dimensions(profile)
            for dimension, value in profile_dimensions.items():
                accumulators[category][dimension].append(
                    (
                        float(tasting.rating),
                        tasting.enjoyment,
                        1.0,
                        value,
                        sensory_dimension_confidence(profile, dimension),
                    )
                )
    rating_rows = db.execute(
        select(UserWineRating, Wine, WineSensoryProfile)
        .join(Wine, Wine.id == UserWineRating.wine_id)
        .outerjoin(WineSensoryProfile, WineSensoryProfile.identity_id == Wine.shared_identity_id)
        .where(
            UserWineRating.user_id == user_id,
            UserWineRating.household_id == household_id,
            Wine.household_id == household_id,
            UserWineRating.rating > 0,
        )
    )
    for star_rating, wine, profile in rating_rows:
        categories = ["global"] + ([] if _category(wine) == "global" else [_category(wine)])
        for category in categories:
            samples[category] += 1
            category_stars[category].append(float(star_rating.rating))
            # The stars themselves: the halved weight only tempers the sensory profile.
            record_attribute(
                category,
                wine,
                float(star_rating.rating),
                drink=False,
                stars=float(star_rating.rating),
            )
            if not profile or profile.generation_status != "available":
                continue
            for dimension, value in reliable_sensory_dimensions(profile).items():
                accumulators[category][dimension].append(
                    (
                        float(star_rating.rating),
                        "",
                        0.5,
                        value,
                        sensory_dimension_confidence(profile, dimension),
                    )
                )
    external_rows = db.execute(
        select(ExternalWineTasting, WineSensoryProfile)
        .outerjoin(
            WineSensoryProfile,
            WineSensoryProfile.identity_id == ExternalWineTasting.shared_identity_id,
        )
        .where(
            ExternalWineTasting.household_id == household_id,
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
            category_stars[category].append(float(tasting.rating))
            record_attribute(
                category, tasting, star_equivalent(weight), drink=True, stars=float(tasting.rating)
            )
            if not profile or profile.generation_status != "available":
                continue
            for dimension, value in reliable_sensory_dimensions(profile).items():
                accumulators[category][dimension].append(
                    (
                        float(tasting.rating),
                        tasting.enjoyment,
                        1.0,
                        value,
                        sensory_dimension_confidence(profile, dimension),
                    )
                )
    existing_profiles = {
        profile.category: profile
        for profile in db.scalars(
            select(UserTasteProfile).where(
                UserTasteProfile.user_id == user_id,
                UserTasteProfile.household_id == household_id,
            )
        )
    }
    if not samples:
        samples["global"] = 0
    validation = validate_taste_profile_algorithms(db, household_id=household_id, user_id=user_id)
    now = datetime.now(UTC)
    profiles: list[UserTasteProfile] = []
    for category in sorted(samples):
        dimensions: dict[str, dict] = {}
        confidence_values: list[float] = []
        shadow_dimensions: dict[str, dict] = {}
        shadow_confidence_values: list[float] = []
        neutral = personal_neutral_rating(category_stars[category])
        for dimension, experiences in accumulators[category].items():
            active = _active_dimension(_dimension_contributions(experiences))
            if active is None:
                continue
            active_value, confidence = active
            dimensions[dimension] = active_value
            confidence_values.append(confidence)
            shadow = _candidate_dimension(_dimension_contributions(experiences, neutral))
            if shadow is not None:
                shadow_value, shadow_confidence = shadow
                shadow_dimensions[dimension] = shadow_value
                shadow_confidence_values.append(shadow_confidence)
        experiences = category_scores[category]
        user_average = sum(experiences) / len(experiences) if experiences else NEUTRAL_RATING

        def favourite_score(scores: list[tuple[float, float]], prior: float) -> float:
            # A few excellent bottles can lead, but one bottle cannot outweigh many.
            return (
                FAVOURITE_PRIOR_EXPERIENCES * prior
                + sum(score * weight for score, weight in scores)
            ) / (FAVOURITE_PRIOR_EXPERIENCES + sum(weight for _, weight in scores))

        def attribute_entry(category: str, key: str, value: str, score: float) -> list[object]:
            stars = attribute_ratings[category][key][value]
            # [name, adjusted stars, bottles drunk, plain average stars or None];
            # readers that only need the first two items keep working unchanged.
            return [
                value,
                round(score, 2),
                attribute_drinks[category][key][value],
                round(sum(stars) / len(stars), 2) if stars else None,
            ]

        attributes: dict[str, list[list[object]]] = {
            key: [
                attribute_entry(category, key, value, score)
                for value, score in sorted(
                    (
                        (value, favourite_score(scores, user_average))
                        for value, scores in values.items()
                    ),
                    key=lambda item: (item[1], len(values[item[0]])),
                    reverse=True,
                )
                # Only what was liked: above the neutral three stars.
                if score > NEUTRAL_RATING
            ][:5]
            for key, values in attribute_scores[category].items()
        }
        # Rated below neutral, and by at least two experiences: a single
        # disappointing bottle says more about that wine than about the grape.
        for key, values in attribute_scores[category].items():
            if not key.startswith("preferred_"):
                continue
            avoided = sorted(
                (
                    (value, favourite_score(scores, user_average))
                    for value, scores in values.items()
                ),
                key=lambda item: item[1],
            )
            attributes[key.replace("preferred_", "avoided_", 1)] = [
                attribute_entry(category, key, value, score)
                for value, score in avoided
                if score < NEUTRAL_RATING and len(values[value]) >= 2
            ][:5]
        attributes["scoring"] = FAVOURITE_SCORING_MARKER
        if category == "global":
            attributes[VALIDATION_ATTRIBUTE] = [
                [
                    validation["status"],
                    validation["v2_ranking_auc"],
                    validation["tested_experiences"],
                    validation["negative_experiences"],
                ]
            ]
        confidence = round(
            (sum(confidence_values) / len(confidence_values)) if confidence_values else 0.0, 4
        )
        shadow_confidence = round(
            (sum(shadow_confidence_values) / len(shadow_confidence_values))
            if shadow_confidence_values
            else 0.0,
            4,
        )
        # Kept beside the candidate's dimensions so the diagnostics can show
        # which rating it treated as neutral.
        shadow_dimensions["neutral_rating"] = {"stars": round(neutral, 2)}
        profile = existing_profiles.pop(category, None)
        if profile is None:
            profile = UserTasteProfile(
                user_id=user_id,
                household_id=household_id,
                category=category,
            )
            db.add(profile)
        elif (
            profile.dimensions != dimensions
            or profile.attributes != attributes
            or profile.confidence != confidence
            or profile.sample_count != samples[category]
            or profile.calculation_version != TASTE_PROFILE_CALCULATION_VERSION
        ):
            _archive_profile(db, profile)
        profile.dimensions = dimensions
        profile.attributes = attributes
        profile.confidence = confidence
        profile.sample_count = samples[category]
        profile.calculation_version = TASTE_PROFILE_CALCULATION_VERSION
        profile.shadow_dimensions = shadow_dimensions
        profile.shadow_confidence = shadow_confidence
        profile.shadow_calculation_version = TASTE_PROFILE_SHADOW_VERSION
        profile.rebuilt_at = now
        profiles.append(profile)
    for stale_profile in existing_profiles.values():
        _archive_profile(db, stale_profile, reason="category_removed")
        db.delete(stale_profile)
    db.flush()
    return profiles


def record_user_wine_rating(db: Session, *, user_id: UUID, wine: Wine, rating: float) -> None:
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
    rebuild_user_taste_profile(db, household_id=wine.household_id, user_id=user_id)


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
    return len(entries), rebuild_user_taste_profile(db, household_id=household_id, user_id=user_id)


def calculate_taste_match(
    db: Session, user_id: UUID, wine: Wine, *, category: str | None = None
) -> dict:
    return calculate_taste_matches(db, user_id, [wine], category=category)[wine.id]


def _profile_has_dimensions(profile: UserTasteProfile | None) -> bool:
    return bool(
        profile
        and isinstance(profile.dimensions, dict)
        and any(
            isinstance(value, dict) and value.get("confidence", 0) > 0
            for value in profile.dimensions.values()
        )
    )


def _calculate_taste_match_from_data(
    sensory: WineSensoryProfile | None,
    profile: UserTasteProfile | None,
    direct_weights: list[float],
) -> dict:
    dimensions = (
        reliable_sensory_dimensions(sensory)
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
    weights = {key: sensory_dimension_confidence(sensory, key) for key, _ in closeness}
    profile_score = sum(value * weights[key] for key, value in closeness) / sum(weights.values())
    direct_score = 0.5 + (sum(direct_weights) / len(direct_weights)) / 2 if direct_weights else None
    score = profile_score if direct_score is None else (profile_score * 0.25 + direct_score * 0.75)
    return {
        "score": round(score, 4),
        "confidence": round(confidence, 4),
        "matching_traits": matching,
        "conflicting_traits": conflicting,
    }


def calculate_taste_matches(
    db: Session,
    user_id: UUID,
    wines: list[Wine],
    *,
    category: str | None = None,
) -> dict[UUID, dict]:
    """Calculate multiple private matches without repeating profile and signal queries per wine."""
    if not wines:
        return {}
    household_ids = {wine.household_id for wine in wines}
    if len(household_ids) != 1:
        raise ValueError("Taste matches must belong to one household")
    household_id = next(iter(household_ids))
    wine_ids = [wine.id for wine in wines]

    identity_keys_by_wine = {
        wine.id: identity_key(parts)
        for wine in wines
        if (parts := identity_parts(wine)) is not None
    }
    identity_ids_by_wine: dict[UUID, UUID] = {}
    if identity_keys_by_wine:
        identities = list(
            db.scalars(
                select(SharedWineIdentity).where(
                    SharedWineIdentity.identity_key.in_(set(identity_keys_by_wine.values()))
                )
            )
        )
        identity_ids_by_key = {identity.identity_key: identity.id for identity in identities}
        identity_ids_by_wine = {
            wine_id: identity_ids_by_key[key]
            for wine_id, key in identity_keys_by_wine.items()
            if key in identity_ids_by_key
        }

    identity_ids = set(identity_ids_by_wine.values())
    sensory_by_identity = (
        {
            sensory.identity_id: sensory
            for sensory in db.scalars(
                select(WineSensoryProfile).where(WineSensoryProfile.identity_id.in_(identity_ids))
            )
        }
        if identity_ids
        else {}
    )

    target_categories = {category or _category(wine) for wine in wines}
    profiles = list(
        db.scalars(
            select(UserTasteProfile).where(
                UserTasteProfile.user_id == user_id,
                UserTasteProfile.household_id == household_id,
                UserTasteProfile.category.in_(target_categories | {"global"}),
            )
        )
    )
    profiles_by_category = {profile.category: profile for profile in profiles}

    direct_weights_by_wine: dict[UUID, list[float]] = defaultdict(list)
    tastings = db.scalars(
        select(WineTastingEntry).where(
            WineTastingEntry.created_by_user_id == user_id,
            WineTastingEntry.household_id == household_id,
            WineTastingEntry.wine_id.in_(wine_ids),
            or_(
                WineTastingEntry.rating > 0,
                WineTastingEntry.enjoyment.in_(("positive", "negative")),
            ),
        )
    )
    for tasting in tastings:
        direct_weights_by_wine[tasting.wine_id].append(
            tasting_preference_weight(float(tasting.rating), tasting.enjoyment)
        )
    ratings = db.scalars(
        select(UserWineRating).where(
            UserWineRating.user_id == user_id,
            UserWineRating.household_id == household_id,
            UserWineRating.wine_id.in_(wine_ids),
        )
    )
    for personal_rating in ratings:
        direct_weights_by_wine[personal_rating.wine_id].append(
            rating_weight(float(personal_rating.rating))
        )

    matches: dict[UUID, dict] = {}
    for wine in wines:
        target_category = category or _category(wine)
        profile = profiles_by_category.get(target_category)
        if not _profile_has_dimensions(profile) and target_category != "global":
            profile = profiles_by_category.get("global")
        identity_id = identity_ids_by_wine.get(wine.id)
        sensory = sensory_by_identity.get(identity_id) if identity_id is not None else None
        matches[wine.id] = _calculate_taste_match_from_data(
            sensory,
            profile,
            direct_weights_by_wine[wine.id],
        )
    return matches


def calculate_wishlist_taste_match(db: Session, user_id: UUID, item: WishlistItem) -> dict:
    """Estimate fit for a saved wine without adding it to the user's cellar or history."""
    parts = identity_parts(item)
    identity = (
        db.scalar(
            select(SharedWineIdentity).where(SharedWineIdentity.identity_key == identity_key(parts))
        )
        if parts
        else None
    )
    sensory = (
        db.scalar(select(WineSensoryProfile).where(WineSensoryProfile.identity_id == identity.id))
        if identity is not None
        else None
    )
    if sensory is not None and sensory.generation_status == "available":
        dimensions = reliable_sensory_dimensions(sensory)
        sensory_confidence = float(sensory.confidence)
    else:
        dimensions, _source, sensory_confidence = infer_sensory_profile(db, item)

    target_category = _category(item)
    profile = db.scalar(
        select(UserTasteProfile).where(
            UserTasteProfile.user_id == user_id,
            UserTasteProfile.household_id == item.household_id,
            UserTasteProfile.category == target_category,
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
                UserTasteProfile.user_id == user_id,
                UserTasteProfile.household_id == item.household_id,
                UserTasteProfile.category == "global",
            )
        )
    has_preferences = bool(
        profile
        and isinstance(profile.dimensions, dict)
        and any(
            isinstance(value, dict) and value.get("confidence", 0) > 0
            for value in profile.dimensions.values()
        )
    )
    if not has_preferences or not dimensions:
        reason = (
            "missing_both_profiles"
            if not has_preferences and not dimensions
            else "missing_user_profile"
            if not has_preferences
            else "missing_wine_profile"
        )
        return {
            "score": None,
            "confidence": 0.0,
            "matching_traits": [],
            "conflicting_traits": [],
            "unavailable_reason": reason,
        }

    assert profile is not None
    compared: list[tuple[str, float, float]] = []
    for key, wine_value in dimensions.items():
        preference = profile.dimensions.get(key, {}) if isinstance(profile.dimensions, dict) else {}
        if isinstance(preference, dict) and preference.get("confidence", 0) > 0:
            compared.append((key, wine_value, float(preference["preference"])))
    confidence = min(sensory_confidence, float(profile.confidence)) * min(1.0, len(compared) / 4)
    if len(compared) < 3 or confidence <= 0:
        return {
            "score": None,
            "confidence": round(confidence, 4),
            "unavailable_reason": "insufficient_comparison",
            "matching_traits": [],
            "conflicting_traits": [],
        }
    closeness = [
        (key, 1 - abs(wine_value - preference)) for key, wine_value, preference in compared
    ]
    weights = {
        key: (
            sensory_dimension_confidence(sensory, key)
            if sensory and sensory.generation_status == "available"
            else sensory_confidence
        )
        for key, _ in closeness
    }
    return {
        "score": round(
            sum(value * weights[key] for key, value in closeness) / sum(weights.values()), 4
        ),
        "confidence": round(confidence, 4),
        "matching_traits": [
            key.replace("_", " ")
            for key, value in sorted(closeness, key=lambda item: item[1], reverse=True)[:3]
            if value >= 0.65
        ],
        "conflicting_traits": [
            key.replace("_", " ")
            for key, value in sorted(closeness, key=lambda item: item[1])[:2]
            if value < 0.45
        ],
    }


def confidence_level(confidence: float, *, tasting_count: int) -> str:
    """Describe evidence conservatively: a stable profile needs both quality and volume."""
    if confidence >= 0.6 and tasting_count >= 30:
        return "established"
    if confidence >= 0.3 and tasting_count >= 10:
        return "probable"
    return "emerging"


def compact_taste_context(
    db: Session, *, household_id: UUID, user_id: UUID, category: str | None = None
) -> dict:
    """Small, non-identifying context safe to pass to the sommelier prompt."""
    selected = category if category in TASTE_CATEGORIES else "global"
    profile = db.scalar(
        select(UserTasteProfile).where(
            UserTasteProfile.user_id == user_id,
            UserTasteProfile.household_id == household_id,
            UserTasteProfile.category == selected,
        )
    )
    if (profile is None or profile.confidence < 0.2) and selected != "global":
        profile = db.scalar(
            select(UserTasteProfile).where(
                UserTasteProfile.user_id == user_id,
                UserTasteProfile.household_id == household_id,
                UserTasteProfile.category == "global",
            )
        )
    if profile is None or profile.confidence < 0.2:
        return {}
    dimensions = {
        key: value.get("preference")
        for key, value in (profile.dimensions or {}).items()
        if isinstance(value, dict) and value.get("confidence", 0) >= 0.2
    }
    context: dict = {
        "category": profile.category,
        "confidence": round(profile.confidence, 2),
        "dimensions": dimensions,
        "dimensions_reliability": dimensions_reliability(
            db, household_id=household_id, user_id=user_id
        ),
    }
    # Likes and dislikes from the user's own ratings, so recommendations stop
    # proposing what the user drinks often but does not really enjoy.
    attributes = profile.attributes if has_current_favourite_scoring(profile.attributes) else {}
    liked = {
        label: [str(entry[0]) for entry in attributes.get(f"preferred_{kind}", [])[:3]]
        for kind, label in SOMMELIER_FAVOURITE_KINDS.items()
    }
    disliked = {
        label: [str(entry[0]) for entry in attributes.get(f"avoided_{kind}", [])[:3]]
        for kind, label in SOMMELIER_FAVOURITE_KINDS.items()
    }
    liked = {label: names for label, names in liked.items() if names}
    disliked = {label: names for label, names in disliked.items() if names}
    if liked:
        context["liked"] = liked
    if disliked:
        context["disliked"] = disliked
    guidance = []
    if liked or disliked:
        guidance.append(
            "liked and disliked come from the user's own ratings: favour liked grapes, "
            "producers and origins, and avoid disliked ones unless the user asks for them."
        )
    if context["dimensions_reliability"] == "weak":
        guidance.append(
            "dimensions did not predict which wines this user liked when checked against "
            "their own tastings: treat them as a faint hint only, rely on liked and "
            "disliked instead, and do not describe the user's sensory taste from them."
        )
    if guidance:
        context["how_to_use"] = " ".join(guidance)
    return context


def dimensions_reliability(db: Session, *, household_id: UUID, user_id: UUID) -> str:
    """How much the sensory dimensions are worth: "weak", "fair" or "good".

    Read from the validation stored at the last rebuild of the global profile;
    a profile without one (rebuilt before it existed) counts as weak.
    """
    attributes = db.scalar(
        select(UserTasteProfile.attributes).where(
            UserTasteProfile.user_id == user_id,
            UserTasteProfile.household_id == household_id,
            UserTasteProfile.category == "global",
        )
    )
    stored = (attributes or {}).get(VALIDATION_ATTRIBUTE) if isinstance(attributes, dict) else None
    if not stored or not isinstance(stored[0], list) or len(stored[0]) < 2:
        return "weak"
    status, auc = stored[0][0], stored[0][1]
    if status != "ready" or not isinstance(auc, int | float) or auc < WEAK_DIMENSIONS_AUC:
        return "weak"
    return "good" if auc >= GOOD_DIMENSIONS_AUC else "fair"
