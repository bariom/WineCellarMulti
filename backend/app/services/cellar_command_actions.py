"""Cellar assistant actions on one wine beyond a single tasting.

Several bottles drunk together, bottles given away or broken, bottles moved to
another storage place, and a rating or note without a tasting. Each is proposed
first and runs only on confirmation; each keeps what it needs to be undone.
"""

from __future__ import annotations

import uuid
from datetime import date
from typing import Any

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import (
    CellarBin,
    CellarLocation,
    Wine,
    WineStockLot,
    WineStockMovement,
    WineStorageAllocation,
)
from app.services.stock_ledger import remove_fifo_stock
from app.services.storage import (
    normalized_storage_name,
    relocate_storage,
    sync_storage_to_wine_quantity,
)
from app.services.taste_profiles import record_user_wine_rating

# Actions that act on one matched wine and go through the same proposal flow.
WINE_ACTIONS = {"consume_wine", "remove_wine", "move_wine", "rate_wine"}
REMOVAL_MOVEMENTS = {"gift": "complimentary", "breakage": "breakage"}


def action_quantity(parsed: dict[str, Any]) -> int:
    """Bottles named in the message; one when no number was given."""
    if not bool(parsed.get("quantity_present")):
        return 1
    return max(int(parsed.get("quantity") or 1), 1)


def bottles(count: int, italian: bool) -> str:
    if italian:
        return "1 bottiglia" if count == 1 else f"{count} bottiglie"
    return "1 bottle" if count == 1 else f"{count} bottles"


def matching_location(
    db: Session, household_id: uuid.UUID, requested: str
) -> tuple[CellarLocation, CellarBin | None] | None:
    """The storage place the user named: a location, or a bin with its location."""
    wanted = normalized_storage_name(requested)
    if not wanted:
        return None
    locations = list(
        db.scalars(select(CellarLocation).where(CellarLocation.household_id == household_id))
    )
    for location in locations:
        if location.normalized_name == wanted:
            return location, None
    bins = list(
        db.scalars(
            select(CellarBin).where(CellarBin.location_id.in_([item.id for item in locations]))
        )
    )
    by_id = {location.id: location for location in locations}
    for cellar_bin in bins:
        location = by_id[cellar_bin.location_id]
        if wanted in {
            cellar_bin.normalized_name,
            f"{location.normalized_name} {cellar_bin.normalized_name}",
        }:
            return location, cellar_bin
    partial = [item for item in locations if wanted in item.normalized_name]
    if len(partial) == 1:
        return partial[0], None
    partial = [item for item in locations if item.normalized_name in wanted]
    if len(partial) == 1:
        return partial[0], None
    return None


def location_names(db: Session, household_id: uuid.UUID) -> list[str]:
    return [
        location.name
        for location in db.scalars(
            select(CellarLocation)
            .where(CellarLocation.household_id == household_id)
            .order_by(CellarLocation.name)
        )
    ]


def proposal_message(intent: str, parsed: dict[str, Any], wine: Wine, italian: bool) -> str:
    """What will change, shown before the user confirms."""
    label = f"{wine.name} {wine.vintage}".strip()
    count = action_quantity(parsed)
    if intent == "consume_wine":
        if count == 1:
            return (
                "Ho preparato la bevuta: controlla e conferma."
                if italian
                else "The tasting is ready: review it and confirm."
            )
        return (
            f"Registro la bevuta di {bottles(count, True)} di {label}: conferma."
            if italian
            else f"I will record {bottles(count, False)} of {label} as drunk: confirm."
        )
    if intent == "remove_wine":
        gift = parsed.get("removal_reason") == "gift"
        if italian:
            what = (
                ("regalata" if count == 1 else "regalate")
                if gift
                else ("rotta" if count == 1 else "rotte")
            )
            return f"Segno {bottles(count, True)} di {label} come {what}: conferma."
        outcome = "given away" if gift else "broken"
        return f"I will mark {bottles(count, False)} of {label} as {outcome}: confirm."
    if intent == "move_wine":
        destination = str(parsed.get("_move_destination") or "")
        if italian:
            amount = (
                bottles(count, True) if parsed.get("quantity_present") else "tutte le bottiglie"
            )
            return f"Sposto {amount} di {label} in «{destination}»: conferma."
        amount = bottles(count, False) if parsed.get("quantity_present") else "all bottles"
        return f"I will move {amount} of {label} to “{destination}”: confirm."
    if intent == "rate_wine":
        parts = []
        if parsed.get("score_present"):
            parts.append(
                f"voto {parsed.get('score_value')}/6"
                if italian
                else f"rating {parsed.get('score_value')}/6"
            )
        note = str(parsed.get("note") or "").strip()
        if note:
            parts.append(f"nota «{note}»" if italian else f"note “{note}”")
        details = ", ".join(parts)
        return (
            f"Aggiorno {label}: {details}. Conferma."
            if italian
            else f"I will update {label}: {details}. Confirm."
        )
    return "Conferma l’aggiornamento." if italian else "Confirm the update."


def stock_movement_ids(db: Session, wine: Wine) -> set[uuid.UUID]:
    db.flush()
    return set(db.scalars(select(WineStockMovement.id).where(WineStockMovement.wine_id == wine.id)))


def remove_more_bottles(
    db: Session,
    wine: Wine,
    *,
    quantity: int,
    movement_type: str,
    occurred_on: date,
    note: str,
    user_id: uuid.UUID | None,
) -> None:
    if quantity <= 0:
        return
    if quantity > wine.quantity:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Not enough bottles in stock",
        )
    remove_fifo_stock(
        db,
        wine,
        movement_type=movement_type,
        quantity=quantity,
        occurred_on=occurred_on,
        note=note,
        user_id=user_id,
    )
    if wine.quantity == 0:
        wine.status = "Consumed"


def restore_removed_bottles(
    db: Session, wine: Wine, movement_ids: list[str], *, quantity: int, previous_status: str
) -> None:
    """Undo bottles taken out: back into their purchase lots, the record and storage."""
    for movement_id in movement_ids:
        movement = db.get(WineStockMovement, uuid.UUID(movement_id))
        if movement is None or movement.wine_id != wine.id:
            continue
        lot = db.get(WineStockLot, movement.lot_id) if movement.lot_id else None
        if lot is not None:
            lot.quantity_remaining += abs(movement.quantity_delta)
        db.delete(movement)
    wine.quantity += quantity
    wine.status = previous_status or wine.status
    db.flush()
    sync_storage_to_wine_quantity(db, wine)


def storage_snapshot(db: Session, wine: Wine) -> list[dict[str, Any]]:
    return [
        {
            "location_id": str(item.location_id) if item.location_id else None,
            "bin_id": str(item.bin_id) if item.bin_id else None,
            "quantity": item.quantity,
        }
        for item in db.scalars(
            select(WineStorageAllocation).where(WineStorageAllocation.wine_id == wine.id)
        )
    ]


def move_bottles(
    db: Session,
    wine: Wine,
    *,
    quantity: int,
    location_id: uuid.UUID,
    bin_id: uuid.UUID | None,
    user_id: uuid.UUID | None,
    note: str,
) -> int:
    """Move bottles from their other places to the destination; returns how many moved."""
    sync_storage_to_wine_quantity(db, wine)
    db.flush()
    sources = [
        item
        for item in db.scalars(
            select(WineStorageAllocation).where(WineStorageAllocation.wine_id == wine.id)
        )
        if item.quantity > 0 and not (item.location_id == location_id and item.bin_id == bin_id)
    ]
    # Bottles not yet placed move first, then the others in a stable order.
    sources.sort(
        key=lambda item: (item.location_id is not None, str(item.location_id), str(item.bin_id))
    )
    remaining = quantity
    for source in sources:
        if remaining <= 0:
            break
        moved = min(source.quantity, remaining)
        relocate_storage(
            db,
            wine,
            source_allocation_id=source.id,
            quantity=moved,
            location_id=location_id,
            bin_id=bin_id,
            user_id=user_id,
            note=note,
        )
        remaining -= moved
        db.flush()
    return quantity - remaining


def restore_storage(db: Session, wine: Wine, snapshot: list[dict[str, Any]]) -> None:
    for item in db.scalars(
        select(WineStorageAllocation).where(WineStorageAllocation.wine_id == wine.id)
    ):
        db.delete(item)
    db.flush()
    for item in snapshot:
        db.add(
            WineStorageAllocation(
                household_id=wine.household_id,
                wine_id=wine.id,
                location_id=uuid.UUID(item["location_id"]) if item.get("location_id") else None,
                bin_id=uuid.UUID(item["bin_id"]) if item.get("bin_id") else None,
                quantity=int(item["quantity"]),
            )
        )


def apply_rating(
    db: Session,
    wine: Wine,
    *,
    rating: float | None,
    note: str,
    user_id: uuid.UUID,
    noted_on: date,
) -> None:
    if rating is not None:
        wine.rating = rating
        record_user_wine_rating(db, user_id=user_id, wine=wine, rating=rating)
    if note:
        entry = f"{noted_on.isoformat()}: {note}"
        wine.notes = f"{wine.notes.rstrip()}\n{entry}" if (wine.notes or "").strip() else entry
