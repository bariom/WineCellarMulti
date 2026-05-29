from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import CurrentContext, build_session_response, get_current_context
from app.core.config import settings
from app.core.security import hash_password, hash_session_token, new_session_token, verify_password
from app.db.session import get_db
from app.models import Household, Membership, User, UserSession
from app.schemas.auth import LoginRequest, RegisterRequest
from app.schemas.session import SessionResponse


router = APIRouter(prefix="/auth")


def set_session_cookie(response: Response, token: str) -> None:
    response.set_cookie(
        settings.session_cookie_name,
        token,
        max_age=settings.session_ttl_days * 86400,
        httponly=True,
        secure=settings.session_cookie_secure,
        samesite="lax",
    )


def create_session(db: Session, user: User, household: Household) -> tuple[UserSession, str]:
    token = new_session_token()
    user_session = UserSession(
        user_id=user.id,
        active_household_id=household.id,
        token_hash=hash_session_token(token),
        expires_at=datetime.now(timezone.utc) + timedelta(days=settings.session_ttl_days),
        created_at=datetime.now(timezone.utc),
    )
    db.add(user_session)
    db.flush()
    return user_session, token


@router.post("/register", response_model=SessionResponse, status_code=status.HTTP_201_CREATED)
def register(payload: RegisterRequest, response: Response, db: Session = Depends(get_db)) -> SessionResponse:
    email = payload.email.lower()
    existing = db.scalar(select(User).where(User.email == email))
    if existing is not None:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Email already registered")

    user = User(email=email, display_name=payload.display_name.strip(), password_hash=hash_password(payload.password))
    household = Household(name=payload.household_name.strip())
    db.add_all([user, household])
    db.flush()
    membership = Membership(user_id=user.id, household_id=household.id, role="owner")
    db.add(membership)
    user_session, token = create_session(db, user, household)
    db.commit()
    db.refresh(user)
    db.refresh(household)
    db.refresh(membership)
    db.refresh(user_session)
    set_session_cookie(response, token)
    return SessionResponse(**build_session_response(CurrentContext(user=user, household=household, membership=membership, session=user_session)))


@router.post("/login", response_model=SessionResponse)
def login(payload: LoginRequest, response: Response, db: Session = Depends(get_db)) -> SessionResponse:
    user = db.scalar(select(User).where(User.email == payload.email.lower()))
    if user is None or not verify_password(payload.password, user.password_hash):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid email or password")

    membership = db.scalar(select(Membership).where(Membership.user_id == user.id).order_by(Membership.role.asc()))
    if membership is None:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="No household membership")
    household = db.get(Household, membership.household_id)
    if household is None:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Household unavailable")

    user_session, token = create_session(db, user, household)
    db.commit()
    db.refresh(user_session)
    set_session_cookie(response, token)
    return SessionResponse(**build_session_response(CurrentContext(user=user, household=household, membership=membership, session=user_session)))


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
def logout(response: Response, context: CurrentContext = Depends(get_current_context), db: Session = Depends(get_db)) -> Response:
    db.delete(context.session)
    db.commit()
    response.delete_cookie(settings.session_cookie_name)
    response.status_code = status.HTTP_204_NO_CONTENT
    return response
