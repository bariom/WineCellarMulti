
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import Wine, WineStockMovement, WineStrategyAllocation

PURPOSE_ORDER_BY_MOVEMENT = {
    "consumption": ["drink", "undecided", "special_occasion", "maturation", "investment"],
    "sale": ["investment", "undecided", "maturation", "special_occasion", "drink"],
}
DEFAULT_PURPOSE_ORDER = ["undecided", "drink", "special_occasion", "maturation", "investment"]


def consume_strategy_allocations(
    db: Session,
    wine: Wine,
    movements: list[WineStockMovement],
) -> None:
    """Remove strategy quantities along with outbound stock.

    Lot-specific allocations are consumed from the matching lot first. A normal
    cellar consumption spends the Drink allocation first; a sale spends the
    Investment allocation first. Any unallocated stock needs no database update.
    """

    allocations = list(
        db.scalars(
            select(WineStrategyAllocation)
            .where(WineStrategyAllocation.wine_id == wine.id)
            .with_for_update()
        )
    )
    if not allocations:
        return
    purpose_order = PURPOSE_ORDER_BY_MOVEMENT.get(
        movements[0].movement_type if movements else "", DEFAULT_PURPOSE_ORDER
    )
    purpose_rank = {purpose: index for index, purpose in enumerate(purpose_order)}
    for movement in movements:
        remaining = abs(movement.quantity_delta)
        candidates = sorted(
            allocations,
            key=lambda item: (
                0
                if item.stock_lot_id == movement.lot_id
                else (1 if item.stock_lot_id is None else 2),
                purpose_rank.get(item.purpose, len(purpose_rank)),
                item.created_at,
            ),
        )
        for allocation in candidates:
            if remaining <= 0:
                break
            if allocation.quantity <= 0:
                continue
            consumed = min(remaining, allocation.quantity)
            allocation.quantity -= consumed
            remaining -= consumed
            if allocation.quantity == 0:
                db.delete(allocation)
                allocations.remove(allocation)
