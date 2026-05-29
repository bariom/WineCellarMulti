from dataclasses import dataclass

from fastapi import Depends
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.db.session import get_db
from app.models import Household, Membership, User


@dataclass(frozen=True)
class CurrentContext:
    user: User
    household: Household
    membership: Membership


def get_current_context(db: Session = Depends(get_db)) -> CurrentContext:
    user = db.scalar(select(User).where(User.email == settings.dev_user_email))
    if user is None:
        user = User(email=settings.dev_user_email, display_name=settings.dev_user_name)
        db.add(user)
        db.flush()

    household = db.scalar(select(Household).where(Household.name == settings.dev_household_name))
    if household is None:
        household = Household(name=settings.dev_household_name)
        db.add(household)
        db.flush()

    membership = db.scalar(
        select(Membership).where(
            Membership.user_id == user.id,
            Membership.household_id == household.id,
        ),
    )
    if membership is None:
        membership = Membership(user_id=user.id, household_id=household.id, role="owner")
        db.add(membership)
        db.flush()

    db.commit()
    db.refresh(user)
    db.refresh(household)
    db.refresh(membership)
    return CurrentContext(user=user, household=household, membership=membership)
