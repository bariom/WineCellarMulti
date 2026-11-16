"""Shares of a co-owned wine when a co-owner takes their own bottles away.

The bottles a co-owner withdraws come out of their share only: what is left is
split again so every other owner keeps the same number of bottles.
"""

from __future__ import annotations

from decimal import ROUND_HALF_UP, Decimal

from fastapi import HTTPException, status

from app.models import Wine

HUNDRED = Decimal(100)
# Shares are stored with two decimals, so a share may hold a fraction of a bottle.
TOLERANCE = Decimal("0.05")


def _pct(value: Decimal) -> Decimal:
    return value.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)


def _too_many() -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_409_CONFLICT,
        detail="The co-owner holds fewer bottles than that",
    )


def withdraw_co_owner_share(wine: Wine, quantity: int, *, email: str, name: str) -> None:
    """Take `quantity` bottles off the named co-owner's share and split the rest again.

    Call it before the stock leaves, while `wine.quantity` is still the total.
    """
    total = Decimal(wine.quantity)
    remaining = total - quantity
    owners = [dict(item) for item in (wine.owners or []) if isinstance(item, dict)]
    if not owners:
        # Without named owners the household holds owner_share_pct; the rest is the co-owner's.
        mine = (
            total
            * Decimal(wine.owner_share_pct if wine.owner_share_pct is not None else 100)
            / HUNDRED
        )
        if quantity > total - mine + TOLERANCE:
            raise _too_many()
        if remaining > 0:
            wine.owner_share_pct = min(_pct(mine / remaining * HUNDRED), HUNDRED)
        return
    email = email.strip().lower()
    name = name.strip().lower()

    def matches(owner: dict) -> bool:
        owner_email = str(owner.get("email") or "").strip().lower()
        owner_name = str(owner.get("name") or "").strip().lower()
        return bool(email and owner_email == email) or bool(
            not email and name and owner_name == name
        )

    index = next((position for position, owner in enumerate(owners) if matches(owner)), None)
    if index is None:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, detail="Co-owner not found"
        )
    bottles = [total * Decimal(str(owner.get("share_pct") or 0)) / HUNDRED for owner in owners]
    if quantity > bottles[index] + TOLERANCE:
        raise _too_many()
    bottles[index] = max(bottles[index] - quantity, Decimal(0))
    if remaining <= 0:
        return
    updated = []
    for owner, held in zip(owners, bottles, strict=True):
        if held <= TOLERANCE / 2:
            continue
        updated.append({**owner, "share_pct": float(_pct(held / remaining * HUNDRED))})
    # A new list, so the JSON column notices the change.
    wine.owners = updated
