"""How a wine felt to the person tasting it: a few traits on a 1..5 scale, all optional."""

from __future__ import annotations

from typing import Annotated, Literal

from pydantic import Field

PERCEIVED_TRAITS = ("body", "acidity", "tannin", "sweetness")
PerceivedTrait = Literal["body", "acidity", "tannin", "sweetness"]
PerceivedTraits = dict[PerceivedTrait, Annotated[int, Field(ge=1, le=5)]]


def clean_perceived(raw: object) -> dict[str, int]:
    """Keep the known traits with a whole value from 1 to 5; anything else is dropped."""
    if not isinstance(raw, dict):
        return {}
    cleaned: dict[str, int] = {}
    for trait in PERCEIVED_TRAITS:
        value = raw.get(trait)
        if isinstance(value, bool):
            continue
        if isinstance(value, int | float) and float(value).is_integer() and 1 <= value <= 5:
            cleaned[trait] = int(value)
    return cleaned
