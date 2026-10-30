"""Event guests: who they are, what they may ask the AI, and their clean-up.

A guest arrives through an event QR code, gets a throw-away account with its
own empty cellar and a little credit, and is deleted once the visit expires
unless they kept the account (see routes/demo_events.py).
"""

from __future__ import annotations

from datetime import UTC, datetime
from decimal import Decimal
from typing import TYPE_CHECKING
from uuid import UUID

from fastapi import HTTPException, status
from sqlalchemy import delete, func, select
from sqlalchemy.orm import Session

from app.models import (
    DemoEvent,
    Household,
    Membership,
    User,
    UserAiCreditTransaction,
    UserSession,
)

if TYPE_CHECKING:
    from app.api.deps import CurrentContext

VISITOR_EMAIL_DOMAIN = "visitor.vinaris.app"
GRANT_SOURCE = "event_grant"

# Each feature a guest may be offered, with the AI task types it is allowed to
# run. Everything else the AI could do is refused for guests.
EVENT_FEATURES: dict[str, frozenset[str]] = {
    "restaurant_wine_list": frozenset({"structured_extraction", "pairing"}),
    "dish_pairing": frozenset({"pairing"}),
    # Reading the labels, then "complete with AI": the full enrichment of the new wines.
    "bottle_photo": frozenset(
        {"structured_extraction", "label_enrichment", "wine_full_enrichment"}
    ),
    "assistant": frozenset({"cellar_command"}),
    "buying_advice": frozenset({"buying_advice"}),
    # Wine Pulse is read-only news, already written by the editorial job: no AI call of the guest's.
    "wine_pulse": frozenset(),
}
EVENT_LANDINGS = ("pairing-restaurant", "pairing-home", "assistant", "buying", "sommelier")


def is_event_visitor(user: User) -> bool:
    return user.event_id is not None and user.event_visitor_until is not None


def event_for_visitor(db: Session, user: User) -> DemoEvent | None:
    if user.event_id is None:
        return None
    return db.get(DemoEvent, user.event_id)


def event_task_types(event: DemoEvent) -> set[str]:
    allowed: set[str] = set()
    for feature in event.features or []:
        allowed |= EVENT_FEATURES.get(feature, frozenset())
    return allowed


def ensure_event_task_allowed(db: Session, context: CurrentContext, task_type: str) -> None:
    """Refuse AI work outside the features chosen for the guest's event."""
    if not is_event_visitor(context.user):
        return
    event = event_for_visitor(db, context.user)
    if event is None or task_type not in event_task_types(event):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="This feature is not part of the event you joined",
        )


def ensure_event_feature(db: Session, context: CurrentContext, feature: str) -> None:
    """Refuse a feature the event does not offer, before any AI call is prepared."""
    if not is_event_visitor(context.user):
        return
    event = event_for_visitor(db, context.user)
    if event is None or feature not in (event.features or []):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="This feature is not part of the event you joined",
        )


def event_is_open(event: DemoEvent, now: datetime) -> bool:
    if not event.is_active:
        return False
    starts = _aware(event.starts_at)
    ends = _aware(event.ends_at)
    return (starts is None or starts <= now) and (ends is None or now <= ends)


def grants_since(db: Session, event: DemoEvent, since: datetime) -> int:
    return int(
        db.scalar(
            select(func.count())
            .select_from(UserAiCreditTransaction)
            .where(
                UserAiCreditTransaction.source == GRANT_SOURCE,
                UserAiCreditTransaction.source_id == event.id,
                UserAiCreditTransaction.created_at >= since,
            )
        )
        or 0
    )


def granted_total_usd(db: Session, event: DemoEvent) -> Decimal:
    return Decimal(
        db.scalar(
            select(func.coalesce(func.sum(UserAiCreditTransaction.amount_usd), 0)).where(
                UserAiCreditTransaction.source == GRANT_SOURCE,
                UserAiCreditTransaction.source_id == event.id,
            )
        )
        or 0
    )


def event_stats(db: Session, event: DemoEvent) -> dict[str, object]:
    """Visitors, accounts kept, and what the event's guests cost in AI."""
    users = list(db.scalars(select(User).where(User.event_id == event.id)))
    user_ids = [user.id for user in users]
    conversions = sum(1 for user in users if user.event_visitor_until is None)
    spent = Decimal("0")
    if user_ids:
        spent = -Decimal(
            db.scalar(
                select(func.coalesce(func.sum(UserAiCreditTransaction.amount_usd), 0)).where(
                    UserAiCreditTransaction.user_id.in_(user_ids),
                    UserAiCreditTransaction.source.like("usage%"),
                )
            )
            or 0
        )
    return {
        "visitor_count": event.visitor_count,
        "active_visitors": sum(
            1
            for user in users
            if (until := _aware(user.event_visitor_until)) is not None and until > datetime.now(UTC)
        ),
        "conversions": conversions,
        "granted_usd": granted_total_usd(db, event),
        "spent_usd": max(spent, Decimal("0")).quantize(Decimal("0.01")),
    }


def purge_expired_visitors(db: Session, event_id: UUID | None = None) -> int:
    """Delete guests whose visit is over and who did not keep the account, with their cellars."""
    now = datetime.now(UTC)
    query = select(User).where(
        User.event_visitor_until.is_not(None), User.event_visitor_until < now
    )
    if event_id is not None:
        query = query.where(User.event_id == event_id)
    return _delete_visitors(db, list(db.scalars(query)))


def purge_event_visitors(db: Session, event_id: UUID) -> int:
    """End every visit of an event now, kept accounts aside: the event is going away."""
    query = select(User).where(User.event_id == event_id, User.event_visitor_until.is_not(None))
    return _delete_visitors(db, list(db.scalars(query)))


def _delete_visitors(db: Session, visitors: list[User]) -> int:
    if not visitors:
        return 0
    user_ids = [user.id for user in visitors]
    household_ids = list(
        db.scalars(select(Membership.household_id).where(Membership.user_id.in_(user_ids)))
    )
    db.execute(delete(UserSession).where(UserSession.user_id.in_(user_ids)))
    db.execute(delete(User).where(User.id.in_(user_ids)))
    if household_ids:
        # A guest's cellar is theirs alone; nobody else can have joined it.
        db.execute(delete(Household).where(Household.id.in_(household_ids)))
    return len(visitors)


def _aware(value: datetime | None) -> datetime | None:
    if value is None:
        return None
    return value.replace(tzinfo=UTC) if value.tzinfo is None else value.astimezone(UTC)
