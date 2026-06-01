from dataclasses import dataclass
from datetime import datetime, timezone

from fastapi import Cookie, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.security import hash_session_token
from app.db.session import get_db
from app.models import Household, Membership, User, UserSession


@dataclass(frozen=True)
class CurrentContext:
    user: User
    household: Household
    membership: Membership
    session: UserSession


def build_session_response(context: CurrentContext | None) -> dict[str, object | None]:
    if context is None:
        return {
            "authenticated": False,
            "user_id": None,
            "user_email": None,
            "user_display_name": None,
            "active_household_id": None,
            "active_household_name": None,
            "membership_role": None,
            "is_app_admin": False,
            "pending_approval": False,
        }
    return {
        "authenticated": True,
        "user_id": str(context.user.id),
        "user_email": context.user.email,
        "user_display_name": context.user.display_name,
        "active_household_id": str(context.household.id),
        "active_household_name": context.household.name,
        "membership_role": context.membership.role,
        "is_app_admin": context.user.is_app_admin,
        "pending_approval": False,
    }


def get_optional_context(
    db: Session = Depends(get_db),
    session_token: str | None = Cookie(default=None, alias=settings.session_cookie_name),
) -> CurrentContext | None:
    if not session_token:
        return None

    token_hash = hash_session_token(session_token)
    user_session = db.scalar(select(UserSession).where(UserSession.token_hash == token_hash))
    if user_session is None:
        return None
    if user_session.expires_at.replace(tzinfo=timezone.utc) <= datetime.now(timezone.utc):
        db.delete(user_session)
        db.commit()
        return None

    user = db.get(User, user_session.user_id)
    household = db.get(Household, user_session.active_household_id)
    if user is None or household is None:
        db.delete(user_session)
        db.commit()
        return None
    if not user.is_approved:
        db.delete(user_session)
        db.commit()
        return None

    membership = db.scalar(
        select(Membership).where(
            Membership.user_id == user.id,
            Membership.household_id == household.id,
        ),
    )
    if membership is None:
        return None

    return CurrentContext(user=user, household=household, membership=membership, session=user_session)


def get_current_context(context: CurrentContext | None = Depends(get_optional_context)) -> CurrentContext:
    if context is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Authentication required")
    return context


def require_role(context: CurrentContext, allowed_roles: set[str]) -> CurrentContext:
    if context.membership.role not in allowed_roles:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Insufficient permissions")
    return context


def require_admin_context(context: CurrentContext = Depends(get_current_context)) -> CurrentContext:
    return require_role(context, {"owner", "admin"})


def require_app_admin_context(context: CurrentContext = Depends(get_current_context)) -> CurrentContext:
    if not context.user.is_app_admin:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Application administrator required")
    return context


def require_write_context(context: CurrentContext = Depends(get_current_context)) -> CurrentContext:
    return require_role(context, {"owner", "admin", "member"})
