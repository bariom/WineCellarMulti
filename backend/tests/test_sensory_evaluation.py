import pytest
from pydantic import ValidationError

from app.services.sensory_evaluation import EvaluationCase, evaluate
from app.services.taste_profiles import SENSORY_DIMENSIONS


def case(index=0, *, reviewed=True, category="Red", agent_value=0.7):
    values = {key: 0.7 for key in SENSORY_DIMENSIONS}
    return EvaluationCase.model_validate(
        {
            "case_id": str(index),
            "category": category,
            "experts": [
                {"reviewer_id": str(i), "profile": {"dimensions": values}} for i in range(2)
            ]
            if reviewed
            else [],
            "predictions": {
                "baseline": [{"dimensions": {key: 0.5 for key in values}}] * 3,
                "agent": [
                    {
                        "dimensions": {key: agent_value for key in values},
                        "ranges": {key: [min(0.3, agent_value), 0.9] for key in values},
                    }
                ]
                * 3,
                "assisted": [{"dimensions": {key: agent_value for key in values}}] * 3,
            },
        }
    )


def test_no_experts_is_insufficient_even_with_complete_model_profiles():
    report = evaluate([case(reviewed=False)])
    assert report["status"] == "insufficient" and not report["automatic_rollout"]
    assert report["metrics"]["agent"]["paired_mae"] is None


def test_paired_error_and_ranges_are_measured_without_claiming_calibration():
    report = evaluate([case()])
    assert report["metrics"]["baseline"]["paired_mae"] == 0.2
    assert report["metrics"]["agent"]["paired_mae"] == 0
    assert report["metrics"]["agent"]["interpretative_range_coverage"] == 1
    assert report["status"] == "insufficient"


@pytest.mark.parametrize("agent_value,status", [(0.7, "passed"), (0.1, "failed")])
def test_gate_requires_coverage_repeats_and_improvement(agent_value, status):
    categories = ["Red", "White", "Rose", "Sparkling", "Sweet", "Fortified"]
    report = evaluate(
        [case(i, category=categories[i % 6], agent_value=agent_value) for i in range(60)]
    )
    assert report["status"] == status and not report["automatic_rollout"]


def test_duplicate_cases_and_reviewers_are_rejected():
    with pytest.raises(ValueError, match="Duplicate"):
        evaluate([case(), case()])
    raw = case().model_dump()
    raw["experts"][1]["reviewer_id"] = raw["experts"][0]["reviewer_id"]
    with pytest.raises(ValidationError):
        EvaluationCase.model_validate(raw)
