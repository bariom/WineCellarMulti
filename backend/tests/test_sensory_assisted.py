import pytest
from fastapi import HTTPException

from test_sensory_agent import (
    assisted_proposal,
    attributed_output,
    completion_output,
    response,
    source_pages,
    setup,  # noqa: F401 - shared database fixture
)
from app.api.routes import sensory_agent as routes
from app.models import SensoryAgentRun, WineSensoryProfile
from app.services import sensory_agent as agent
from app.services.sensory_application import application_preview


@pytest.mark.parametrize("change", ["identity", "vintage_section", "missing_attribution"])
def test_v11_rejects_quotes_from_the_wrong_wine_section(setup, change):
    _, _, wine = setup
    payload = attributed_output(wine)
    pages = source_pages(payload)
    if change == "identity":
        pages = {url: page.replace("Producer Barolo", "Other Wine") for url, page in pages.items()}
    elif change == "vintage_section":
        pages = {
            url: page.replace("Full-bodied wine", "2019 Full-bodied wine")
            for url, page in pages.items()
        }
    else:
        payload["dimensions"]["body"]["attribution_excerpt"] = ""
        for comparison in payload["comparisons"]:
            if comparison["dimension"] == "body":
                for proof in comparison["evidence"]:
                    proof["attribution_excerpt"] = ""
    result = agent.proposal_from_response(
        wine, response(payload), {}, prompt_version="11", source_texts=pages
    )
    assert result.complete_profile["body"].value is None
    assert any(w.startswith("source_attribution_unverified:") for w in result.warnings)


def test_large_single_source_change_and_conflict_retain_baseline(setup):
    db, _, wine = setup
    proposal = assisted_proposal(db, wine)
    assert proposal.application.eligible
    assert "wood" in proposal.application.review_required
    assert proposal.application.dimensions["wood"].value == 0.35
    assert proposal.application.dimensions["body"].value == 0.75
    assert proposal.application.dimensions["body"].origin == "agent"
    assert proposal.application.dimensions["spice"].value == 0.38
    proposal.complete_profile["body"].issue = "conflicting_sources"
    preview = application_preview(proposal, {"body": 0.4}, 0.35)
    assert preview.dimensions["body"].value == 0.4
    assert "body" in preview.review_required


def test_fallback_does_not_assign_global_confidence_to_missing_provenance(setup):
    db, _, wine = setup
    proposal = assisted_proposal(db, wine)
    preview = application_preview(
        proposal,
        {"spice": 0.38, "minerality": 0.0},
        0.9,
        baseline_provenance={"spice": {"confidence": "bad"}},
    )
    assert preview.dimensions["spice"].confidence == 0
    # Large unsupported replacement keeps the baseline, but not another trait's confidence.
    assert preview.dimensions["minerality"].confidence == 0


def test_preview_is_rechecked_at_apply_and_preserves_prior_provenance(setup):
    db, context, wine = setup
    profile = WineSensoryProfile(
        identity_id=wine.shared_identity_id,
        source="metadata",
        dimensions={"body": 0.68, "spice": 0.38},
        confidence=0.35,
        provenance={"spice": {"origin": "baseline", "confidence": 0.2}},
    )
    db.add(profile)
    db.commit()
    proposal = assisted_proposal(db, wine)
    run = SensoryAgentRun(
        household_id=context.household.id,
        user_id=context.user.id,
        status="completed",
        results=[proposal.model_dump(mode="json")],
    )
    db.add(run)
    db.commit()
    previous = dict(profile.provenance)
    profile.provenance = {"spice": {"origin": "baseline", "confidence": 0.9}}
    db.commit()
    with pytest.raises(HTTPException) as exc:
        routes.apply_research(run.id, wine.id, db, context)
    assert exc.value.status_code == 409
    profile.provenance = previous
    db.commit()
    routes.apply_research(run.id, wine.id, db, context)
    assert profile.provenance["spice"] == previous["spice"]
    assert profile.provenance["body"]["calculation_method"] == "verified_descriptor_v2"


def test_no_sources_cannot_apply_even_with_nine_estimates(setup):
    _, _, wine = setup
    result = agent.proposal_from_response(wine, response({}), {}, prompt_version="11")
    result = agent.complete_with_estimates(wine, result, response(completion_output(wine)))
    assert result.coverage["available"] == 9
    preview = application_preview(result, {"body": 0.68}, 0.35)
    assert not preview.eligible and preview.reason == "identity_unverified"
    assert preview.dimensions["body"].value == 0.68


def test_malformed_completion_cannot_create_applicable_model_guesses(setup):
    _, _, wine = setup
    result = agent.proposal_from_response(wine, response({}), {}, prompt_version="11")
    result = agent.complete_with_estimates(wine, result, response({"estimates": {}}))
    assert "completion_invalid_output" in result.warnings
    assert not application_preview(result, {}, 0).eligible


def test_checked_quote_cache_cannot_relabel_a_vintage_or_drop_attribution(setup):
    from app.services.sensory_completion import SensoryEvidenceVerifier

    _, _, wine = setup
    payload = attributed_output(wine)
    pages = source_pages(payload)
    result = agent.proposal_from_response(
        wine, response(payload), {}, prompt_version="11", source_texts=pages
    )
    verifier = SensoryEvidenceVerifier(
        {url: {"url": url} for url in pages}, result, source_texts=pages
    )
    proof = result.complete_profile["body"].evidence[0]
    assert verifier.verified(proof)
    assert not verifier.verified(proof.model_copy(update={"vintage": "2019"}))
    assert not verifier.verified(proof.model_copy(update={"attribution_excerpt": ""}))


def test_prompts_require_attribution_and_keep_inferences_out_of_application():
    from app.prompts.sensory_agent import (
        wine_sensory_completion_prompt,
        wine_sensory_research_prompt,
    )

    for prompt in (
        wine_sensory_research_prompt(wine_context={"name": "Krug", "vintage": "2014"}, locale="it"),
        wine_sensory_completion_prompt(wine_context={}, feedback={}, locale="it"),
    ):
        assert "attribution_excerpt" in prompt.system and "base harvest" in prompt.system
        assert "baseline" in prompt.system
        assert "untrusted" in prompt.system and "Italian" in prompt.user
