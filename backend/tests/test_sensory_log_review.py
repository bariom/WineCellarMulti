import json

import pytest
from fastapi import BackgroundTasks, HTTPException
from test_sensory_agent import setup as shared_setup  # noqa: F401
from test_sensory_refinement import payload
from test_sensory_refinement import setup as setup  # noqa: F401

from app.api.routes import ai, sensory_agent, taste_profiles
from app.core.config import Settings, settings
from app.services.score_sources import DocumentText
from app.services.sensory_relevance import describes_trait
from scripts.review_sensory_log import parse_log, render_html, review


def test_paid_research_is_disabled_by_default():
    assert Settings.model_fields["wine_sensory_research_enabled"].default is False
    assert Settings.model_fields["wine_sensory_ai_enabled"].default is True


def test_suspension_blocks_starts_and_direct_provider_path(setup, monkeypatch):
    db, context, wine = setup
    monkeypatch.setattr(settings, "wine_sensory_research_enabled", False)
    monkeypatch.setattr(ai, "select_ai_provider", lambda *args: pytest.fail("No provider access"))
    calls = [
        lambda: taste_profiles.start_sensory_refinement(
            wine.shared_identity_id, BackgroundTasks(), db, context
        ),
        lambda: taste_profiles.refine_sensory_profile(wine.shared_identity_id, db, context),
        lambda: sensory_agent.start_research(None, BackgroundTasks(), db, context),
        lambda: ai.create_ai_response(
            db,
            context,
            None,
            model="gpt-6-astra",
            system_prompt="",
            user_prompt="",
            task_type="sensory_refinement",
        ),
    ]
    for call in calls:
        with pytest.raises(HTTPException) as exc:
            call()
        assert exc.value.status_code == 503
    assert taste_profiles.sensory_profile_summary(db, context)["research_enabled"] is False


@pytest.mark.parametrize(
    "text", ["aromi di more, mirtilli", "sentori di more", "mora e ribes", "lamponi e fragole"]
)
def test_italian_fruit_terms_are_relevant(text):
    assert describes_trait("fruit", text)


def test_english_more_is_not_a_fruit_description():
    assert not describes_trait("fruit", "more intense tannins")


def test_review_keeps_verified_quote_even_when_another_source_is_blocked():
    data = payload()
    proof = data["dimensions"]["body"]["evidence"][0]
    data["dimensions"]["body"]["evidence"].append(
        dict(proof, source_url="https://blocked.example/wine")
    )
    report = review(
        parse_log("assistant\n" + json.dumps(data)),
        reader=lambda url, **kwargs: DocumentText(
            text="Producer Barolo 2020 Full-bodied with bright acidity"
            if "blocked" not in url
            else "",
            status="readable" if "blocked" not in url else "unavailable",
            http_status=200 if "blocked" not in url else 403,
        ),
    )
    assert report["identity_verified"]
    assert [item["status"] for item in report["traits"]["body"]] == ["verified", "unverified"]
    assert "value" not in json.dumps(report) and "rationale" not in json.dumps(report)
    assert "0.68" not in render_html(report)


def test_review_rejects_unverified_identity_and_escapes_html():
    data = payload()
    data["dimensions"]["body"]["evidence"][0]["publisher"] = "<script>alert(1)</script>"
    report = review(
        parse_log(json.dumps(data)),
        reader=lambda *args, **kwargs: DocumentText(
            text="Full-bodied with bright acidity", status="readable"
        ),
    )
    assert not report["identity_verified"]
    assert report["traits"]["body"][0]["status"] == "unverified"
    assert "<script>" not in render_html(report)


@pytest.mark.parametrize("text", ["", "{}", "assistant\n{bad json}"])
def test_invalid_log_is_rejected(text):
    with pytest.raises(ValueError):
        parse_log(text)
