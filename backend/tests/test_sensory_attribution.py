import pytest

from app.schemas.sensory_agent import SourceEvidence
from app.services.sensory_attribution import attributable, edition_number


def evidence(**overrides):
    fields = dict(
        attribution_excerpt="Argiolas Turriga 2007",
        excerpt="Full-bodied",
        source_url="https://example.test/wine",
        vintage="2007",
        scope="exact_vintage",
        publisher="Argiolas",
        role="producer",
        published_year=2014,
    )
    return SourceEvidence(**(fields | overrides))


@pytest.mark.parametrize(
    "page,accepted",
    [
        ("Argiolas Turriga 2007 Full-bodied", True),
        ("Argiolas Turriga 2007 Turriga 2008 Full-bodied", False),
        ("Argiolas Turriga 2008 Full-bodied", False),
        ("Full-bodied Argiolas Turriga 2007", False),
        ("Argiolas Turriga 2007 " + "padding " * 500 + "Full-bodied", False),
    ],
)
def test_quote_must_belong_to_attributed_vintage_section(page, accepted):
    assert attributable(evidence(), page, "Turriga", "Argiolas") is accepted


def test_identity_witness_cannot_be_fabricated_or_name_a_different_wine():
    page = "Argiolas Turriga 2007 Full-bodied"
    assert not attributable(
        evidence(attribution_excerpt="Argiolas ... Turriga 2007"), page, "Turriga", "Argiolas"
    )
    assert not attributable(evidence(), page, "Costera", "Argiolas")


def test_edition_is_identifiable_without_claiming_a_base_harvest_vintage():
    name = "Krug Grande Cuvée ed.170"
    heading = "Krug Grande Cuvée 170ème Édition"
    assert edition_number(name) == edition_number(heading) == "170"
    proof = evidence(attribution_excerpt=heading, vintage="NV", scope="wine_style")
    assert attributable(proof, heading + " Full-bodied", name, "Krug")
    assert not attributable(proof, heading + " 171ème Édition Full-bodied", name, "Krug")
    assert not attributable(
        proof.model_copy(update={"scope": "exact_vintage", "vintage": "2014"}),
        heading + " 2014 Full-bodied",
        name,
        "Krug",
    )
