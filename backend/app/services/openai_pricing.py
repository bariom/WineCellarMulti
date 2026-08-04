from __future__ import annotations

import urllib.request
from decimal import Decimal, InvalidOperation

from fastapi import HTTPException, status

OPENAI_PRICING_URL = "https://developers.openai.com/api/docs/pricing.md"


def official_standard_pricing(models: list[str]) -> dict[str, dict[str, str]]:
    """Read the current short-context standard price table from OpenAI docs."""
    try:
        request = urllib.request.Request(OPENAI_PRICING_URL, headers={"User-Agent": "Vinaris/1.0"})
        with urllib.request.urlopen(request, timeout=15) as response:
            document = response.read().decode("utf-8")
    except (OSError, TimeoutError) as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Official OpenAI pricing is temporarily unavailable",
        ) from exc

    standard_table = document.split("### Standard pricing data", 1)
    if len(standard_table) != 2:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Official OpenAI pricing format changed",
        )
    standard_table = standard_table[1].split("### Batch pricing data", 1)[0]
    pricing: dict[str, dict[str, str]] = {}
    for line in standard_table.splitlines():
        columns = [column.strip() for column in line.split("|")]
        if len(columns) < 6 or columns[1] not in models:
            continue
        try:
            input_price = Decimal(columns[2].removeprefix("$"))
            cached_price = Decimal(columns[3].removeprefix("$"))
            output_price = Decimal(columns[5].removeprefix("$"))
        except (InvalidOperation, ValueError) as exc:
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail="Official OpenAI pricing format changed",
            ) from exc
        pricing[columns[1]] = {
            "input": str(input_price),
            "cached_input": str(cached_price),
            "output": str(output_price),
        }
    missing_models = set(models) - set(pricing)
    if missing_models:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Official OpenAI pricing does not include every active model",
        )
    return pricing
