from types import SimpleNamespace
from uuid import uuid4

import pytest

from app.schemas.sensory_agent import SourceEvidence
from app.services.score_sources import DocumentText
from app.services.sensory_application import application_preview
from app.services.sensory_autonomous import WineResearchTools
from app.services.sensory_descriptors import descriptor_estimate
from scripts.probe_sensory_agent import controlled_source_payload


def test_testamatta_source_fixture_keeps_useful_traits_and_real_disagreements():
    fixture, payload = controlled_source_payload()
    wine = SimpleNamespace(
        id=uuid4(),
        name="Testamatta",
        producer="Bibi Graetz",
        vintage="2018",
        shared_identity_id=None,
    )
    runtime = WineResearchTools(wine, {"body": 0.64, "fruit": 0.67})
    for source in fixture["sources"]:
        # Short source fragments with actual PDF typography and labelled review dates.
        page = (
            source["heading"]
            + " Published 20th Aug 2020 Drinking Window 2024 - 2045 "
            + " ".join(item["quote"] for item in source["observations"])
        )
        runtime.sources[source["url"]] = {"url": source["url"]}
        runtime.documents[source["url"]] = DocumentText(text=page, status="readable")
    feedback = runtime.review(payload)
    assert feedback["identity_confirmed"] and feedback["vintage_confirmed"]
    result = runtime.last_review
    assert result is not None
    assert result.complete_profile["acidity"].value == 0.75
    assert result.complete_profile["fruit"].value == 0.75
    assert result.complete_profile["minerality"].value == 0.25
    for key in ["body", "aromatic_intensity"]:
        assert result.complete_profile[key].value is None
        assert result.complete_profile[key].issue == "conflicting_sources"
    assert result.complete_profile["tannin"].sensory_support == "description"
    preview = application_preview(result, {}, 0)
    assert set(preview.candidates) == {"acidity", "fruit", "minerality"}
    assert preview.eligible
    assert all(check.unmatched_excerpts == 0 for check in result.source_checks.values())


@pytest.mark.parametrize("change", ["misspelled_producer", "wrong_vintage", "intervening_vintage"])
def test_typographic_identity_repair_still_rejects_wrong_wines(change):
    fixture, payload = controlled_source_payload()
    source = fixture["sources"][0]
    wine = SimpleNamespace(
        id=uuid4(),
        name="Testamatta",
        producer="Bibi Graetz",
        vintage="2018",
        shared_identity_id=None,
    )
    runtime = WineResearchTools(wine, {})
    page = source["heading"] + " " + " ".join(item["quote"] for item in source["observations"])
    if change == "misspelled_producer":
        page = page.replace("GRAETZ", "GRAETS")
    if change == "wrong_vintage":
        page = page.replace("2018", "2019")
    if change == "intervening_vintage":
        page = page.replace("rich of", "Testamatta 2019 rich of")
    runtime.sources[source["url"]] = {"url": source["url"]}
    runtime.documents[source["url"]] = DocumentText(text=page, status="readable")
    runtime.review(payload)
    assert runtime.last_review.complete_profile["fruit"].value is None


def test_exact_trait_heading_recovers_separate_bad_identity_quote():
    fixture, payload = controlled_source_payload()
    source = fixture["sources"][0]
    payload["identity_evidence"]["excerpt"] = "Invented identity quote"
    wine = SimpleNamespace(
        id=uuid4(),
        name="Testamatta",
        producer="Bibi Graetz",
        vintage="2018",
        shared_identity_id=None,
    )
    runtime = WineResearchTools(wine, {})
    runtime.sources[source["url"]] = {"url": source["url"]}
    runtime.documents[source["url"]] = DocumentText(
        text=source["heading"] + " rich of blackberries and blueberries", status="readable"
    )
    feedback = runtime.review(payload)
    assert feedback["identity_confirmed"] and feedback["vintage_confirmed"]
    assert runtime.last_review.identity_evidence.excerpt == source["heading"]


@pytest.mark.parametrize(
    "dimension,quote",
    [
        ("aromatic_intensity", "pronounced intensity"),
        ("tannin", "silky and important tannins"),
        ("fruit", "rich history of cherry production"),
        ("body", "light mineral undertone"),
        ("wood", "aged in old barriques"),
    ],
)
def test_new_descriptor_anchors_do_not_convert_quality_or_production(dimension, quote):
    _, payload = controlled_source_payload()
    proof = SourceEvidence.model_validate(dict(payload["identity_evidence"], excerpt=quote))
    assert descriptor_estimate(dimension, [proof], strict=True) is None
