import json
import math
from datetime import datetime, timedelta, timezone
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from sqlalchemy import select
from sqlalchemy.orm import Session
from webauthn import (
    generate_authentication_options,
    generate_registration_options,
    options_to_json,
    verify_authentication_response,
    verify_registration_response,
)
from webauthn.helpers import base64url_to_bytes, bytes_to_base64url
from webauthn.helpers.structs import (
    AuthenticatorSelectionCriteria,
    PublicKeyCredentialDescriptor,
    ResidentKeyRequirement,
    UserVerificationRequirement,
)

from app.api.deps import CurrentContext, active_entitlement_valid_until, build_session_response, get_authenticated_context, get_current_context, require_app_admin_context
from app.core.config import settings
from app.core.security import hash_password, hash_session_token, new_session_token, verify_password
from app.db.session import get_db
from app.models import Household, Membership, PasskeyChallenge, User, UserPasskey, UserSession
from app.schemas.auth import (
    LoginRequest,
    PasskeyLoginVerifyRequest,
    PasskeyRegistrationOptionsRequest,
    PasskeyRegistrationVerifyRequest,
    PasskeyResponse,
    PendingUserResponse,
    RegisterRequest,
    UserAdminResponse,
    UserAdminUpdate,
    UserPreferencesUpdate,
)
from app.schemas.session import SessionResponse
from app.services.email import send_email


router = APIRouter(prefix="/auth")

PASSKEY_CHALLENGE_TTL_MINUTES = 5


def request_origin(request: Request) -> str:
    scheme = request.headers.get("x-forwarded-proto") or request.url.scheme
    return f"{scheme}://{request.headers.get('host')}"


def request_rp_id(request: Request) -> str:
    host = request.headers.get("host", "").split(":", 1)[0]
    return host or "localhost"


def utc_datetime(value: datetime) -> datetime:
    return value.replace(tzinfo=timezone.utc) if value.tzinfo is None else value.astimezone(timezone.utc)


def store_passkey_challenge(db: Session, challenge: bytes, purpose: str, user: User | None = None) -> None:
    db.query(PasskeyChallenge).filter(PasskeyChallenge.expires_at < datetime.now(timezone.utc)).delete()
    db.add(
        PasskeyChallenge(
            challenge=bytes_to_base64url(challenge),
            purpose=purpose,
            user_id=user.id if user else None,
            expires_at=datetime.now(timezone.utc) + timedelta(minutes=PASSKEY_CHALLENGE_TTL_MINUTES),
        ),
    )
    db.commit()


def consume_passkey_challenge(db: Session, challenge: str, purpose: str, user: User | None = None) -> bytes:
    stored = db.scalar(
        select(PasskeyChallenge)
        .where(PasskeyChallenge.challenge == challenge)
        .where(PasskeyChallenge.purpose == purpose),
    )
    if stored is None or utc_datetime(stored.expires_at) < datetime.now(timezone.utc):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Passkey challenge expired")
    if user is not None and stored.user_id != user.id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Passkey challenge mismatch")
    expected = base64url_to_bytes(stored.challenge)
    db.delete(stored)
    db.flush()
    return expected


def credential_client_challenge(credential: dict) -> str:
    encoded = str(credential.get("response", {}).get("clientDataJSON", ""))
    try:
        client_data = json.loads(base64url_to_bytes(encoded).decode("utf-8"))
    except (ValueError, UnicodeDecodeError) as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid passkey response") from exc
    return str(client_data.get("challenge", ""))


def passkey_response(passkey: UserPasskey) -> PasskeyResponse:
    return PasskeyResponse(
        id=str(passkey.id),
        name=passkey.name,
        created_at=passkey.created_at.isoformat(),
        last_used_at=passkey.last_used_at.isoformat() if passkey.last_used_at else None,
    )


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


def session_response_for(db: Session, user: User, household: Household, membership: Membership, user_session: UserSession) -> SessionResponse:
    entitlement_valid_until = active_entitlement_valid_until(db, user)
    return SessionResponse(
        **build_session_response(
            CurrentContext(
                user=user,
                household=household,
                membership=membership,
                session=user_session,
                has_active_entitlement=entitlement_valid_until is not None,
                entitlement_valid_until=entitlement_valid_until,
            ),
        ),
    )


def user_is_preapproved(db: Session, email: str) -> bool:
    return db.scalar(select(User)) is None


def pending_user_response(user: User) -> PendingUserResponse:
    return PendingUserResponse(id=str(user.id), email=user.email, display_name=user.display_name)


def user_admin_response(user: User, db: Session) -> UserAdminResponse:
    valid_until = active_entitlement_valid_until(db, user)
    days_remaining = math.ceil((valid_until - datetime.now(timezone.utc)).total_seconds() / 86400) if valid_until else None
    return UserAdminResponse(
        id=str(user.id),
        email=user.email,
        display_name=user.display_name,
        is_approved=user.is_approved,
        is_app_admin=user.is_app_admin,
        is_blocked=user.is_blocked,
        approved_at=user.approved_at.isoformat() if user.approved_at else None,
        entitlement_valid_until=valid_until.isoformat() if valid_until else None,
        entitlement_days_remaining=max(days_remaining, 0) if days_remaining is not None else None,
    )


def notify_admins_of_pending_registration(db: Session, user: User, household: Household) -> None:
    admin_emails = list(
        dict.fromkeys(
            db.scalars(
                select(User.email)
                .where(User.is_app_admin.is_(True))
                .where(User.is_approved.is_(True))
                .where(User.is_blocked.is_(False))
                .order_by(User.email.asc()),
            ),
        ),
    )
    if not admin_emails:
        return
    send_email(
        recipients=admin_emails,
        subject=f"[{settings.app_name}] New user awaiting approval",
        body=(
            "A new user registration is waiting for approval.\n\n"
            f"Name: {user.display_name}\n"
            f"Email: {user.email}\n"
            f"Cellar name: {household.name}\n"
            f"Created at: {datetime.now(timezone.utc).isoformat()}\n\n"
            "Open the Vinaris admin users section to review the request."
        ),
    )


@router.post("/register", response_model=SessionResponse, status_code=status.HTTP_201_CREATED)
def register(payload: RegisterRequest, response: Response, db: Session = Depends(get_db)) -> SessionResponse:
    email = payload.email.lower()
    existing = db.scalar(select(User).where(User.email == email))
    if existing is not None:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Email already registered")

    is_first_user = db.scalar(select(User)) is None
    is_approved = user_is_preapproved(db, email)
    user = User(
        email=email,
        display_name=payload.display_name.strip(),
        password_hash=hash_password(payload.password),
        is_approved=is_approved,
        is_app_admin=is_first_user,
        approved_at=datetime.now(timezone.utc) if is_approved else None,
    )
    household = Household(name=payload.household_name.strip())
    db.add_all([user, household])
    db.flush()
    membership = Membership(user_id=user.id, household_id=household.id, role="owner")
    db.add(membership)
    db.commit()
    db.refresh(user)
    db.refresh(household)
    db.refresh(membership)
    if not user.is_approved:
        notify_admins_of_pending_registration(db, user, household)
        return SessionResponse(authenticated=False, pending_approval=True)

    user_session, token = create_session(db, user, household)
    db.commit()
    db.refresh(user_session)
    set_session_cookie(response, token)
    return session_response_for(db, user, household, membership, user_session)


@router.post("/login", response_model=SessionResponse)
def login(payload: LoginRequest, response: Response, db: Session = Depends(get_db)) -> SessionResponse:
    user = db.scalar(select(User).where(User.email == payload.email.lower()))
    if user is None or not verify_password(payload.password, user.password_hash):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid email or password")
    if not user.is_approved:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Account pending approval")
    if user.is_blocked:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Account blocked")

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
    return session_response_for(db, user, household, membership, user_session)


@router.patch("/preferences", response_model=SessionResponse)
def update_preferences(
    payload: UserPreferencesUpdate,
    context: CurrentContext = Depends(get_current_context),
    db: Session = Depends(get_db),
) -> SessionResponse:
    if payload.locale is None and payload.theme_preference is None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="No preferences provided")
    if payload.locale is not None:
        context.user.locale = payload.locale
    if payload.theme_preference is not None:
        context.user.theme_preference = payload.theme_preference
    db.commit()
    db.refresh(context.user)
    return SessionResponse(**build_session_response(context))


@router.get("/passkeys", response_model=list[PasskeyResponse])
def list_passkeys(
    context: CurrentContext = Depends(get_current_context),
    db: Session = Depends(get_db),
) -> list[PasskeyResponse]:
    passkeys = db.scalars(select(UserPasskey).where(UserPasskey.user_id == context.user.id).order_by(UserPasskey.created_at.desc()))
    return [passkey_response(passkey) for passkey in passkeys]


@router.post("/passkeys/register/options")
def passkey_registration_options(
    payload: PasskeyRegistrationOptionsRequest,
    request: Request,
    context: CurrentContext = Depends(get_current_context),
    db: Session = Depends(get_db),
) -> dict:
    existing = list(db.scalars(select(UserPasskey).where(UserPasskey.user_id == context.user.id)))
    options = generate_registration_options(
        rp_id=request_rp_id(request),
        rp_name=settings.app_name,
        user_id=str(context.user.id).encode("utf-8"),
        user_name=context.user.email,
        user_display_name=context.user.display_name,
        authenticator_selection=AuthenticatorSelectionCriteria(
            resident_key=ResidentKeyRequirement.REQUIRED,
            user_verification=UserVerificationRequirement.PREFERRED,
        ),
        exclude_credentials=[PublicKeyCredentialDescriptor(id=base64url_to_bytes(passkey.credential_id)) for passkey in existing],
    )
    store_passkey_challenge(db, options.challenge, "registration", context.user)
    return json.loads(options_to_json(options)) | {"passkey_name": payload.name}


@router.post("/passkeys/register/verify", response_model=PasskeyResponse)
def verify_passkey_registration(
    payload: PasskeyRegistrationVerifyRequest,
    request: Request,
    context: CurrentContext = Depends(get_current_context),
    db: Session = Depends(get_db),
) -> PasskeyResponse:
    expected_challenge = consume_passkey_challenge(db, credential_client_challenge(payload.credential), "registration", context.user)
    verified = verify_registration_response(
        credential=payload.credential,
        expected_challenge=expected_challenge,
        expected_rp_id=request_rp_id(request),
        expected_origin=request_origin(request),
        require_user_verification=False,
    )
    credential_id = bytes_to_base64url(verified.credential_id)
    existing = db.scalar(select(UserPasskey).where(UserPasskey.credential_id == credential_id))
    if existing is not None:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Passkey already registered")
    passkey = UserPasskey(
        user_id=context.user.id,
        credential_id=credential_id,
        public_key=verified.credential_public_key,
        sign_count=verified.sign_count,
        name=payload.name.strip()[:120] or "Passkey",
    )
    db.add(passkey)
    db.commit()
    db.refresh(passkey)
    return passkey_response(passkey)


@router.post("/passkeys/login/options")
def passkey_login_options(request: Request, db: Session = Depends(get_db)) -> dict:
    options = generate_authentication_options(
        rp_id=request_rp_id(request),
        user_verification=UserVerificationRequirement.PREFERRED,
    )
    store_passkey_challenge(db, options.challenge, "authentication")
    return json.loads(options_to_json(options))


@router.post("/passkeys/login/verify", response_model=SessionResponse)
def verify_passkey_login(
    payload: PasskeyLoginVerifyRequest,
    request: Request,
    response: Response,
    db: Session = Depends(get_db),
) -> SessionResponse:
    credential_id = str(payload.credential.get("id") or payload.credential.get("rawId") or "")
    passkey = db.scalar(select(UserPasskey).where(UserPasskey.credential_id == credential_id))
    if passkey is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Unknown passkey")
    expected_challenge = consume_passkey_challenge(db, credential_client_challenge(payload.credential), "authentication")
    verified = verify_authentication_response(
        credential=payload.credential,
        expected_challenge=expected_challenge,
        expected_rp_id=request_rp_id(request),
        expected_origin=request_origin(request),
        credential_public_key=passkey.public_key,
        credential_current_sign_count=passkey.sign_count,
        require_user_verification=False,
    )
    passkey.sign_count = verified.new_sign_count
    passkey.last_used_at = datetime.now(timezone.utc)
    user = db.get(User, passkey.user_id)
    if user is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User unavailable")
    if not user.is_approved:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Account pending approval")
    if user.is_blocked:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Account blocked")
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
    return session_response_for(db, user, household, membership, user_session)


@router.get("/pending-users", response_model=list[PendingUserResponse])
def list_pending_users(
    _: CurrentContext = Depends(require_app_admin_context),
    db: Session = Depends(get_db),
) -> list[PendingUserResponse]:
    users = db.scalars(select(User).where(User.is_approved.is_(False)).order_by(User.email.asc()))
    return [pending_user_response(user) for user in users]


@router.post("/pending-users/{user_id}/approve", response_model=PendingUserResponse)
def approve_pending_user(
    user_id: UUID,
    _: CurrentContext = Depends(require_app_admin_context),
    db: Session = Depends(get_db),
) -> PendingUserResponse:
    user = db.get(User, user_id)
    if user is None or user.is_approved:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Pending user not found")
    user.is_approved = True
    user.approved_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(user)
    return pending_user_response(user)


@router.delete("/pending-users/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
def reject_pending_user(
    user_id: UUID,
    _: CurrentContext = Depends(require_app_admin_context),
    db: Session = Depends(get_db),
) -> Response:
    user = db.get(User, user_id)
    if user is None or user.is_approved:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Pending user not found")
    db.delete(user)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/users", response_model=list[UserAdminResponse])
def list_users(
    _: CurrentContext = Depends(require_app_admin_context),
    db: Session = Depends(get_db),
) -> list[UserAdminResponse]:
    users = db.scalars(select(User).order_by(User.email.asc()))
    return [user_admin_response(user, db) for user in users]


@router.patch("/users/{user_id}", response_model=UserAdminResponse)
def update_user_admin(
    user_id: UUID,
    payload: UserAdminUpdate,
    context: CurrentContext = Depends(require_app_admin_context),
    db: Session = Depends(get_db),
) -> UserAdminResponse:
    user = db.get(User, user_id)
    if user is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    if payload.is_app_admin is None and payload.is_blocked is None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="No user changes provided")
    if payload.is_app_admin is not None:
        if user.id == context.user.id and not payload.is_app_admin:
            other_admin = db.scalar(select(User).where(User.is_app_admin.is_(True), User.id != user.id, User.is_blocked.is_(False)))
            if other_admin is None:
                raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="At least one active application administrator is required")
        user.is_app_admin = payload.is_app_admin
    if payload.is_blocked is not None:
        if user.id == context.user.id and payload.is_blocked:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="You cannot block your own account")
        if user.is_app_admin and payload.is_blocked:
            other_admin = db.scalar(select(User).where(User.is_app_admin.is_(True), User.id != user.id, User.is_blocked.is_(False)))
            if other_admin is None:
                raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="At least one active application administrator is required")
        user.is_blocked = payload.is_blocked
        if payload.is_blocked:
            db.query(UserSession).filter(UserSession.user_id == user.id).delete()
    db.commit()
    db.refresh(user)
    return user_admin_response(user, db)


@router.delete("/users/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_user_admin(
    user_id: UUID,
    context: CurrentContext = Depends(require_app_admin_context),
    db: Session = Depends(get_db),
) -> Response:
    user = db.get(User, user_id)
    if user is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    if user.id == context.user.id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="You cannot delete your own account")
    if user.is_app_admin:
        other_admin = db.scalar(select(User).where(User.is_app_admin.is_(True), User.id != user.id, User.is_blocked.is_(False)))
        if other_admin is None:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="At least one active application administrator is required")
    db.delete(user)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.delete("/passkeys/{passkey_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_passkey(
    passkey_id: UUID,
    context: CurrentContext = Depends(get_current_context),
    db: Session = Depends(get_db),
) -> Response:
    passkey = db.scalar(select(UserPasskey).where(UserPasskey.id == passkey_id, UserPasskey.user_id == context.user.id))
    if passkey is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Passkey not found")
    db.delete(passkey)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
def logout(response: Response, context: CurrentContext = Depends(get_authenticated_context), db: Session = Depends(get_db)) -> Response:
    db.delete(context.session)
    db.commit()
    response.delete_cookie(settings.session_cookie_name)
    response.status_code = status.HTTP_204_NO_CONTENT
    return response
