import pytest

from app.schemas.sensory_agent import SourceEvidence
from app.services.sensory_descriptors import descriptor_estimate


def evidence(excerpt: str, url: str = "https://producer.example/wine") -> SourceEvidence:
    return SourceEvidence(
        excerpt=excerpt,
        source_url=url,
        scope="wine_style",
        vintage="",
        published_year=None,
        publisher="Producer",
        role="producer",
    )


@pytest.mark.parametrize(
    ("dimension", "excerpt", "value"),
    [
        ("body", "Un vino dal corpo pieno.", 0.75),
        ("body", "A light-bodied wine.", 0.25),
        ("body", "A medium-bodied wine.", 0.5),
        ("body", "Une bouche ample.", 0.75),
        ("body", "Powerful palate.", 0.75),
        ("body", "Mouth structured broad and powerful.", 0.75),
        ("body", "Mouth structured, broad and powerful.", 0.75),
        ("body", "Full-bodied with delicate fruit notes.", 0.75),
        ("body", "Ein mittelschwerer Wein.", 0.5),
        ("acidity", "Acidità vivace e finale lungo.", 0.75),
        ("acidity", "Low acidity.", 0.25),
        ("acidity", "Une acidité modérée.", 0.5),
        ("tannin", "Tannini decisi.", 0.75),
        ("tannin", "Delicate tannins.", 0.25),
        ("tannin", "Firm tannins.", 0.75),
        ("sweetness", "Al palato secco.", 0.05),
        ("sweetness", "Moderate sweetness.", 0.5),
        ("aromatic_intensity", "Un naso molto intenso.", 0.9),
        ("aromatic_intensity", "Very intense aromas.", 0.9),
        ("fruit", "Pronounced fruit.", 0.75),
        ("fruit", "Full-bodied with delicate fruit notes.", 0.25),
        ("wood", "Subtle oak.", 0.25),
        ("spice", "Spezie intense.", 0.75),
        ("minerality", "Minéralité prononcée.", 0.75),
        ("minerality", "Mineralità spiccata.", 0.75),
        ("acidity", "Hohe Säure.", 0.75),
        ("minerality", "Strong salinity.", 0.75),
        ("minerality", "Very saline finish.", 0.9),
    ],
)
def test_explicit_descriptors_have_stable_anchors(dimension, excerpt, value):
    result = descriptor_estimate(dimension, [evidence(excerpt)])
    assert result is not None and result.value == value and not result.conflicting
    assert result.lower <= value <= result.upper
    assert result.upper - result.lower >= 0.15


@pytest.mark.parametrize(
    ("dimension", "excerpt"),
    [
        ("tannin", "Tannini morbidi, setosi ed equilibrati."),
        ("tannin", "Tannini morbidi con intensi aromi fruttati."),
        ("tannin", "Tannins, powerful aromas and ripe fruit."),
        ("acidity", "Balanced acidity and elegance."),
        ("aromatic_intensity", "Complex aromas of many fruits."),
        ("aromatic_intensity", "Intense tannins with aromas of cherry."),
        ("fruit", "Corpo pieno con delicate note fruttate."),
        ("wood", "Matured in oak barrels for 18 months."),
        ("sweetness", "Grape sugar concentrated by drying."),
        ("sweetness", "Sweet spices with an intense nose."),
        ("sweetness", "Dry fruit and raisins."),
        ("sweetness", "Note di frutta secca."),
        ("sweetness", "Arômes de fruits secs."),
        ("body", "Not full-bodied."),
        ("body", "Mouth structured and complex."),
        ("body", "Mouth not structured, broad and powerful."),
        ("fruit", "Mouth structured, broad and powerful with fruit notes."),
        ("aromatic_intensity", "Mouth structured, broad and powerful with cherry aromas."),
        ("minerality", "Not a very saline finish."),
        ("tannin", "Without firm tannins."),
        ("body", "Non ha un corpo pieno."),
        ("tannin", "Without strong tannins."),
        ("acidity", "Acidità non elevata."),
        ("unknown", "Intense fruit."),
    ],
)
def test_quality_production_negation_and_other_traits_are_not_intensity(dimension, excerpt):
    assert descriptor_estimate(dimension, [evidence(excerpt)]) is None


def test_conflicting_descriptions_are_not_averaged():
    result = descriptor_estimate("body", [evidence("Light-bodied."), evidence("Full-bodied.")])
    assert result is not None and result.conflicting and result.value is None
    assert result.lower <= 0.25 and result.upper >= 0.75
    assert len(result.evidence) == 2


def test_nearby_descriptors_share_an_interpretative_range():
    result = descriptor_estimate(
        "fruit", [evidence("Intense fruit."), evidence("Very intense fruit.")]
    )
    assert result is not None and not result.conflicting and result.value == 0.82
    assert result.lower == 0.6 and result.upper == 1


def test_copied_quotes_do_not_add_weight():
    result = descriptor_estimate(
        "fruit",
        [
            evidence("Intense fruit."),
            evidence("Intense fruit.", "https://retailer.example"),
            evidence("Very intense fruit."),
        ],
    )
    assert result is not None and result.value == 0.82 and len(result.evidence) == 2


def test_conflict_inside_single_quote_is_preserved():
    result = descriptor_estimate("acidity", [evidence("Low acidity; high acidity.")])
    assert result is not None and result.conflicting and result.value is None


def test_empty_evidence_does_not_create_a_profile():
    assert descriptor_estimate("body", []) is None
