from __future__ import annotations

from uuid import UUID

from fastapi import HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.api.deps import CurrentContext
from app.core.config import settings
from app.models import Household, Membership, User, Wine

FREE_TIER_CELLAR_LIMIT = 1


def is_free_tier(context: CurrentContext) -> bool:
    return (
        not context.household.is_demo
        and not context.user.is_app_admin
        and not context.has_active_entitlement
    )


def free_tier_label_limit() -> int:
    return max(int(settings.free_tier_label_limit), 0)


def ensure_free_tier_cellar_capacity(db: Session, context: CurrentContext) -> None:
    if not is_free_tier(context):
        return

    # Lock the user so two simultaneous create/accept requests cannot both
    # pass the membership count before either one commits.
    db.scalar(select(User.id).where(User.id == context.user.id).with_for_update())
    cellar_count = int(
        db.scalar(
            select(func.count())
            .select_from(Membership)
            .where(Membership.user_id == context.user.id)
        )
        or 0
    )
    if cellar_count >= FREE_TIER_CELLAR_LIMIT:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                "Free tier supports one cellar only. Activate a subscription to add another cellar."
            ),
        )


def household_active_label_count(
    db: Session,
    context: CurrentContext,
    household_id: UUID | None = None,
) -> int:
    target_household_id = household_id or context.household.id
    labels = db.execute(
        select(
            func.lower(func.trim(Wine.producer)),
            func.lower(func.trim(Wine.name)),
            func.lower(func.trim(Wine.vintage)),
        )
        .where(Wine.household_id == target_household_id, Wine.quantity > 0)
        .distinct()
    )
    return len(labels.all())


def ensure_free_tier_label_capacity(
    db: Session,
    context: CurrentContext,
    *,
    wine: Wine | None = None,
    will_be_active: bool = True,
    household_id: UUID | None = None,
) -> None:
    if not will_be_active or not is_free_tier(context):
        return

    if wine is not None and wine.quantity > 0:
        return

    # Serialize activations per cellar so concurrent requests cannot both pass
    # the label limit check against the same starting quantity.
    target_household_id = household_id or context.household.id
    db.scalar(select(Household.id).where(Household.id == target_household_id).with_for_update())
    current = household_active_label_count(db, context, target_household_id)
    limit = free_tier_label_limit()
    if current >= limit:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                f"Free tier label limit exceeded: {current} of {limit} active labels are already "
                "in this cellar. Remove a label or activate a subscription."
            ),
        )
