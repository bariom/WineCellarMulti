from app.models import UserTasteProfile, WineSensoryProfile
from app.services.taste_profiles import (
    _calculate_taste_match_from_data,
    reliable_sensory_dimensions,
)


def test_matching_weights_each_trait_and_excludes_unsupported_inferences():
    wine = WineSensoryProfile(
        dimensions={"body": 1, "acidity": 1, "fruit": 0, "minerality": 0},
        confidence=0.6,
        generation_status="available",
        provenance={
            "body": {"confidence": 0.8},
            "acidity": {"confidence": 0.8},
            "fruit": {"confidence": 0.2},
            "minerality": {"confidence": 0},
        },
    )
    user = UserTasteProfile(
        confidence=0.8,
        dimensions={key: {"preference": 1, "confidence": 0.8} for key in wine.dimensions},
    )
    result = _calculate_taste_match_from_data(wine, user, [])
    assert result["score"] == 0.8889
    assert "minerality" not in result["conflicting_traits"]
    assert "minerality" not in reliable_sensory_dimensions(wine)
    wine.provenance = {}
    assert _calculate_taste_match_from_data(wine, user, [])["score"] == 0.5


def test_partial_or_invalid_provenance_does_not_borrow_global_confidence():
    wine = WineSensoryProfile(
        dimensions={"body": 0.8, "fruit": 0.8, "minerality": 0.8, "spice": 0.8},
        confidence=0.9,
        provenance={
            "body": {"confidence": 0.5},
            "fruit": {"confidence": "bad"},
            "spice": {"confidence": float("nan")},
        },
    )
    assert reliable_sensory_dimensions(wine) == {"body": 0.8}
