from __future__ import annotations

import uuid
from dataclasses import dataclass
from datetime import UTC, date, datetime
from decimal import Decimal
from math import isfinite
from uuid import UUID

from sqlalchemy.orm import Session

from app.models import Wine, WineTastingEntry
from app.services.stock_ledger import remove_fifo_stock


class NoBottlesAvailableError(ValueError):
    pass


@dataclass(frozen=True)
class WineConsumptionResult:
    tasting_id: UUID
    previous_quantity: int
    previous_status: str
    previous_rating: int


def optional_tasting_score_value(value: object) -> float | None:
    if value is None or str(value).strip() == "":
        return None
    try:
        parsed = float(value)
    except (TypeError, ValueError):
        return None
    return parsed if isfinite(parsed) else None


def optional_tasting_score_scale(value: object) -> int | None:
    if value is None or str(value).strip() == "":
        return None
    try:
        return int(value)
    except (TypeError, ValueError):
        return None


def normalized_tasting_rating(value: object) -> int:
    try:
        return max(0, min(int(value or 0), 6))
    except (TypeError, ValueError):
        return 0


def normalize_tasting_history(raw_entries: list[dict]) -> list[dict]:
    entries: list[dict] = []
    for raw_entry in raw_entries or []:
        if not isinstance(raw_entry, dict):
            continue
        consumed_at = str(raw_entry.get("consumed_at") or "").strip()
        created_at = str(raw_entry.get("created_at") or "").strip()
        enjoyment = str(raw_entry.get("enjoyment") or "").strip()
        if enjoyment not in {"positive", "negative"}:
            enjoyment = ""
        if not consumed_at or not created_at:
            continue
        score_value = optional_tasting_score_value(raw_entry.get("score_value"))
        score_scale = optional_tasting_score_scale(raw_entry.get("score_scale"))
        entries.append(
            {
                "id": str(raw_entry.get("id") or uuid.uuid4()),
                "consumed_at": consumed_at,
                "note": str(raw_entry.get("note") or "").strip(),
                "rating": normalized_tasting_rating(raw_entry.get("rating")),
                "score_value": score_value,
                "score_scale": score_scale,
                "enjoyment": enjoyment,
                "occasion": str(raw_entry.get("occasion") or "").strip(),
                "pairing": str(raw_entry.get("pairing") or "").strip(),
                "companions": str(raw_entry.get("companions") or "").strip(),
                "source": str(raw_entry.get("source") or "manual").strip()[:32],
                "source_text": str(raw_entry.get("source_text") or "").strip(),
                "created_at": created_at,
            },
        )
    return entries


def record_wine_consumption(
    db: Session,
    wine: Wine,
    *,
    consumed_at: date,
    note: str = "",
    rating: int = 0,
    score_value: Decimal | None = None,
    score_scale: int | None = None,
    enjoyment: str = "",
    occasion: str = "",
    pairing: str = "",
    companions: str = "",
    source: str = "manual",
    source_text: str = "",
    created_by_user_id: UUID | None = None,
) -> WineConsumptionResult:
    if wine.quantity <= 0:
        raise NoBottlesAvailableError("No bottles left to consume")

    previous_quantity = wine.quantity
    previous_status = wine.status
    previous_rating = wine.rating
    tasting_id = uuid.uuid4()
    created_at = datetime.now(UTC)
    tasting_entry = {
        "id": str(tasting_id),
        "consumed_at": consumed_at.isoformat(),
        "note": note.strip(),
        "rating": max(0, min(int(rating), 6)),
        "score_value": float(score_value) if score_value is not None else None,
        "score_scale": score_scale,
        "enjoyment": enjoyment if enjoyment in {"positive", "negative"} else "",
        "occasion": occasion.strip(),
        "pairing": pairing.strip(),
        "companions": companions.strip(),
        "source": source.strip()[:32] or "manual",
        "source_text": source_text.strip(),
        "created_at": created_at.isoformat(),
    }
    wine.tasting_history = normalize_tasting_history([*(wine.tasting_history or []), tasting_entry])
    db.add(
        WineTastingEntry(
            id=tasting_id,
            wine_id=wine.id,
            household_id=wine.household_id,
            created_by_user_id=created_by_user_id,
            consumed_at=consumed_at,
            note=tasting_entry["note"],
            rating=tasting_entry["rating"],
            score_value=score_value,
            score_scale=score_scale,
            enjoyment=tasting_entry["enjoyment"],
            occasion=tasting_entry["occasion"],
            pairing=tasting_entry["pairing"],
            companions=tasting_entry["companions"],
            source=tasting_entry["source"],
            source_text=tasting_entry["source_text"],
            purchase_price_at_consumption=wine.price,
            market_value_at_consumption=wine.current_value,
            currency_at_consumption=wine.currency,
            created_at=created_at,
        )
    )
    remove_fifo_stock(
        db,
        wine,
        movement_type="consumption",
        quantity=1,
        occurred_on=consumed_at,
        note=tasting_entry["note"],
        user_id=created_by_user_id,
    )
    if rating > 0:
        wine.rating = max(0, min(int(rating), 6))
    if wine.quantity == 0:
        wine.status = "Consumed"
    elif wine.status.lower() not in {"delivered", "consegnato", "consumed", "bevuto"}:
        wine.status = "Delivered"
    return WineConsumptionResult(
        tasting_id=tasting_id,
        previous_quantity=previous_quantity,
        previous_status=previous_status,
        previous_rating=previous_rating,
    )
