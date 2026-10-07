"""Offline, paired sensory evaluation. Never use model output as expert truth.

Run: python -m app.services.sensory_evaluation dataset.json
No database writes, provider calls, credits or personal data are required.
"""

import argparse
import json
from pathlib import Path
from statistics import mean
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator

from app.services.taste_profiles import SENSORY_DIMENSIONS

METHODS = ("baseline", "agent", "assisted")
CATEGORIES = ("Red", "White", "Rose", "Sparkling", "Sweet", "Fortified")


class Prediction(BaseModel):
    model_config = ConfigDict(extra="forbid")
    dimensions: dict[str, float]
    ranges: dict[str, tuple[float, float]] = Field(default_factory=dict)

    @model_validator(mode="after")
    def valid_dimensions(self):
        if any(
            key not in SENSORY_DIMENSIONS or not 0 <= value <= 1
            for key, value in self.dimensions.items()
        ):
            raise ValueError("Unknown dimension or invalid intensity")
        for key, (lower, upper) in self.ranges.items():
            if key not in self.dimensions or not 0 <= lower <= self.dimensions[key] <= upper <= 1:
                raise ValueError("Invalid interpretative range")
        return self


class ExpertRating(BaseModel):
    model_config = ConfigDict(extra="forbid")
    reviewer_id: str = Field(min_length=1)
    profile: Prediction


class EvaluationCase(BaseModel):
    model_config = ConfigDict(extra="forbid")
    case_id: str = Field(min_length=1)
    category: Literal["Red", "White", "Rose", "Sparkling", "Sweet", "Fortified"]
    target: Literal["expected_at_release"] = "expected_at_release"
    experts: list[ExpertRating] = Field(default_factory=list)
    predictions: dict[str, list[Prediction]]

    @model_validator(mode="after")
    def unique_reviewers(self):
        if len({r.reviewer_id for r in self.experts}) != len(self.experts):
            raise ValueError("Independent reviewer IDs must be unique")
        if set(self.predictions) != set(METHODS) or any(
            not runs for runs in self.predictions.values()
        ):
            raise ValueError("All three methods need at least one prediction")
        return self


def evaluate(cases: list[EvaluationCase]) -> dict:
    if len({c.case_id for c in cases}) != len(cases):
        raise ValueError("Duplicate wine case IDs")
    errors: dict[str, dict[str, list[float]]] = {
        method: {key: [] for key in SENSORY_DIMENSIONS} for method in METHODS
    }
    category_errors: dict[str, dict[str, list[float]]] = {
        method: {category: [] for category in CATEGORIES} for method in METHODS
    }
    interval_hits: dict[str, list[bool]] = {method: [] for method in METHODS}
    spread: dict[str, list[float]] = {method: [] for method in METHODS}
    coverage = {method: 0 for method in METHODS}
    expert_spreads: list[float] = []
    reviewed = {category: 0 for category in CATEGORIES}
    reference_traits = 0
    repeated = 0
    for case in cases:
        if len(case.experts) < 2:
            continue
        reviewed[case.category] += 1
        repeated += int(
            all(
                len(case.predictions[m]) >= 3
                and all(
                    set(run.dimensions) == set(case.predictions[m][0].dimensions)
                    for run in case.predictions[m]
                )
                for m in METHODS
            )
        )
        for key in SENSORY_DIMENSIONS:
            ratings = [
                e.profile.dimensions[key] for e in case.experts if key in e.profile.dimensions
            ]
            if len(ratings) < 2:
                continue
            reference_traits += 1
            reference = mean(ratings)
            expert_spreads.append(max(ratings) - min(ratings))
            paired = all(key in case.predictions[m][0].dimensions for m in METHODS)
            for method in METHODS:
                first = case.predictions[method][0]
                coverage[method] += int(key in first.dimensions)
                if paired:
                    error = abs(first.dimensions[key] - reference)
                    errors[method][key].append(error)
                    category_errors[method][case.category].append(error)
                values = [
                    run.dimensions[key] for run in case.predictions[method] if key in run.dimensions
                ]
                if len(values) >= 3:
                    spread[method].append(max(values) - min(values))
                if key in first.ranges:
                    low, high = first.ranges[key]
                    interval_hits[method].append(low <= reference <= high)
    metrics = {}
    for method in METHODS:
        all_errors = [value for values in errors[method].values() for value in values]
        metrics[method] = {
            "paired_mae": round(mean(all_errors), 4) if all_errors else None,
            "large_error_rate": round(mean(e >= 0.25 for e in all_errors), 4)
            if all_errors
            else None,
            "reference_coverage": round(coverage[method] / reference_traits, 4)
            if reference_traits
            else None,
            "mean_repeat_spread": round(mean(spread[method]), 4) if spread[method] else None,
            "interpretative_range_coverage": round(mean(interval_hits[method]), 4)
            if interval_hits[method]
            else None,
            "traits": {
                key: {"count": len(values), "mae": round(mean(values), 4) if values else None}
                for key, values in errors[method].items()
            },
            "categories": {
                key: round(mean(values), 4) if values else None
                for key, values in category_errors[method].items()
            },
        }
    reasons = []
    if sum(reviewed.values()) < 50:
        reasons.append("fewer_than_50_independently_reviewed_wines")
    if any(count < 5 for count in reviewed.values()):
        reasons.append("fewer_than_5_wines_in_a_category")
    if any(len(errors["assisted"][key]) < 30 for key in SENSORY_DIMENSIONS):
        reasons.append("insufficient_paired_trait_coverage")
    if repeated < 50:
        reasons.append("fewer_than_50_wines_with_three_runs_per_method")
    if not reasons:
        baseline_mae = metrics["baseline"]["paired_mae"]
        assisted_mae = metrics["assisted"]["paired_mae"]
        if baseline_mae - assisted_mae < 0.02:
            reasons.append("assisted_mae_improvement_below_0_02")
        if metrics["assisted"]["large_error_rate"] > metrics["baseline"]["large_error_rate"]:
            reasons.append("large_errors_regressed")
        if metrics["assisted"]["reference_coverage"] < metrics["baseline"]["reference_coverage"]:
            reasons.append("coverage_regressed")
        if metrics["assisted"]["mean_repeat_spread"] > 0.10:
            reasons.append("repeat_spread_exceeds_0_10")
        for category in CATEGORIES:
            if (
                metrics["assisted"]["categories"][category]
                > metrics["baseline"]["categories"][category] + 0.02
            ):
                reasons.append("category_regressed:" + category)
        for key in SENSORY_DIMENSIONS:
            if (
                metrics["assisted"]["traits"][key]["mae"]
                > metrics["baseline"]["traits"][key]["mae"] + 0.02
            ):
                reasons.append("trait_regressed:" + key)
    return {
        "evaluation_version": "1",
        "target": "expected_at_release",
        "status": "insufficient"
        if any(r.startswith(("fewer", "insufficient")) for r in reasons)
        else "passed"
        if not reasons
        else "failed",
        "reasons": reasons,
        "reviewed_wines": sum(reviewed.values()),
        "categories": reviewed,
        "expert_mean_spread": round(mean(expert_spreads), 4) if expert_spreads else None,
        "metrics": metrics,
        # Sensory evaluation alone does not validate recommendation quality.
        "automatic_rollout": False,
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("dataset", type=Path)
    arguments = parser.parse_args()
    raw = json.loads(arguments.dataset.read_text(encoding="utf-8"))
    print(json.dumps(evaluate([EvaluationCase.model_validate(item) for item in raw]), indent=2))


if __name__ == "__main__":
    main()
