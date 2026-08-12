import json
import logging
import math
import secrets
import string
from datetime import UTC, datetime, timedelta
from decimal import Decimal
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response, status
from fastapi.responses import RedirectResponse
from sqlalchemy import delete, func, select
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

from app.api.deps import (
    CurrentContext,
    active_entitlement_valid_until,
    build_session_response,
    get_authenticated_context,
    get_current_context,
    require_app_admin_context,
)
from app.core.config import settings
from app.core.crypto import encrypt_secret
from app.core.legal import LEGAL_DOCUMENT_VERSION
from app.core.rate_limit import enforce_rate_limit
from app.core.security import (
    hash_email_verification_token,
    hash_password,
    hash_password_reset_token,
    hash_redeem_code,
    hash_session_token,
    new_email_verification_token,
    new_password_reset_token,
    new_session_token,
    verify_password,
)
from app.db.session import get_db
from app.models import (
    AiAuditLog,
    CoOwnershipParticipant,
    Household,
    HouseholdInvite,
    Membership,
    PasskeyChallenge,
    RedeemCode,
    StripeCheckoutSession,
    User,
    UserActivityLog,
    UserEntitlement,
    UserPasskey,
    UserSession,
    Wine,
)
from app.schemas.auth import (
    AccountDeletionRequest,
    EmailVerificationRequest,
    EmailVerificationResendRequest,
    LegalAcceptanceRequest,
    LoginRequest,
    PasskeyLoginVerifyRequest,
    PasskeyRegistrationOptionsRequest,
    PasskeyRegistrationVerifyRequest,
    PasskeyResponse,
    PasswordResetConfirmRequest,
    PasswordResetRequest,
    PendingUserResponse,
    RegisterRequest,
    UserAdminResponse,
    UserAdminStatsResponse,
    UserAdminUpdate,
    UserPreferencesUpdate,
)
from app.schemas.session import SessionResponse
from app.services.ai_credits import (
    ai_credit_balance,
    configured_signup_ai_credit,
    create_ai_credit_transaction,
    set_ai_credit_balance,
)
from app.services.email import send_email
from app.services.notifications import create_user_notification
from app.services.wine_photo_library import archive_wine_photo

router = APIRouter(prefix="/auth")
logger = logging.getLogger(__name__)

PASSKEY_CHALLENGE_TTL_MINUTES = 5
TRIAL_REDEEM_KIND = "trial"
CODE_ALPHABET = string.ascii_uppercase + string.digits


def request_origin(request: Request) -> str:
    scheme = request.headers.get("x-forwarded-proto") or request.url.scheme
    return f"{scheme}://{request.headers.get('host')}"


def request_rp_id(request: Request) -> str:
    host = request.headers.get("host", "").split(":", 1)[0]
    return host or "localhost"


def delete_user_and_orphaned_households(db: Session, user: User) -> None:
    memberships = list(
        db.scalars(select(Membership).where(Membership.user_id == user.id))
    )
    household_ids = [membership.household_id for membership in memberships]
    orphaned_household_ids: set[UUID] = set()

    for membership in memberships:
        remaining_memberships = list(
            db.scalars(
                select(Membership).where(
                    Membership.household_id == membership.household_id,
                    Membership.user_id != user.id,
                )
            )
        )
        if not remaining_memberships:
            orphaned_household_ids.add(membership.household_id)
            for wine in db.scalars(
                select(Wine).where(Wine.household_id == membership.household_id)
            ):
                archive_wine_photo(db, wine)
        elif membership.role == "owner":
            replacement = min(
                remaining_memberships,
                key=lambda candidate: (
                    0 if candidate.role == "admin" else 1,
                    str(candidate.id),
                ),
            )
            replacement.role = "owner"

    normalized_email = user.email.strip().lower()
    for wine in db.scalars(
        select(Wine).where(Wine.household_id.in_(household_ids))
    ):
        filtered_owners = [
            owner
            for owner in (wine.owners or [])
            if str(owner.get("email", "")).strip().lower() != normalized_email
        ]
        if filtered_owners != (wine.owners or []):
            wine.owners = filtered_owners

    for participant in db.scalars(
        select(CoOwnershipParticipant).where(
            (CoOwnershipParticipant.user_id == user.id)
            | (func.lower(CoOwnershipParticipant.email) == normalized_email)
        )
    ):
        participant.user_id = None
        participant.name = "Utente eliminato"
        participant.email = f"deleted-{participant.id}@invalid.local"
        participant.invite_token_hash = f"deleted-{participant.id}"
        participant.invite_token_encrypted = ""
        participant.acceptance_name = ""

    for redeem_code in db.scalars(
        select(RedeemCode).where(func.lower(RedeemCode.email) == normalized_email)
    ):
        redeem_code.email = None
    db.query(HouseholdInvite).filter(
        func.lower(HouseholdInvite.email) == normalized_email
    ).delete(synchronize_session=False)

    db.query(Membership).filter(Membership.user_id == user.id).delete(synchronize_session=False)
    db.delete(user)
    db.flush()

    if not orphaned_household_ids:
        return
    orphaned_households = db.scalars(
        select(Household)
        .where(Household.id.in_(orphaned_household_ids))
        .where(~select(Membership.id).where(Membership.household_id == Household.id).exists())
    )
    for household in orphaned_households:
        db.delete(household)


def utc_datetime(value: datetime) -> datetime:
    return value.replace(tzinfo=UTC) if value.tzinfo is None else value.astimezone(UTC)


def normalize_redeem_code(code: str) -> str:
    return "".join(character for character in code.upper() if character.isalnum())


def generate_redeem_code() -> str:
    raw = "".join(secrets.choice(CODE_ALPHABET) for _ in range(16))
    return f"WCM-{raw[:4]}-{raw[4:8]}-{raw[8:12]}-{raw[12:]}"


def user_can_receive_trial_code(user: User) -> bool:
    return user.is_approved and not user.is_app_admin and not user_requires_email_verification(user) and not user.is_blocked


def ensure_trial_redeem_code(db: Session, user: User) -> RedeemCode | None:
    if not user_can_receive_trial_code(user):
        return None
    existing_trial_entitlement = db.scalar(
        select(UserEntitlement.id)
        .where(UserEntitlement.user_id == user.id, UserEntitlement.source == TRIAL_REDEEM_KIND)
        .order_by(UserEntitlement.created_at.desc()),
    )
    if existing_trial_entitlement is not None:
        return None
    existing_trial_code = db.scalar(
        select(RedeemCode)
        .where(RedeemCode.email == user.email.lower(), RedeemCode.kind == TRIAL_REDEEM_KIND)
        .order_by(RedeemCode.created_at.desc()),
    )
    if existing_trial_code is not None:
        return existing_trial_code

    clear_code = generate_redeem_code()
    normalized = normalize_redeem_code(clear_code)
    trial_days = max(settings.trial_entitlement_days, 1)
    trial_code = RedeemCode(
        code_hash=hash_redeem_code(normalized),
        code_prefix=clear_code[:8],
        encrypted_code=encrypt_secret(clear_code),
        kind=TRIAL_REDEEM_KIND,
        label="Vinaris trial access",
        duration_days=trial_days,
        max_redemptions=1,
        email=user.email.lower(),
        expires_at=datetime.now(UTC) + timedelta(days=trial_days),
    )
    db.add(trial_code)
    create_user_notification(
        db,
        user,
        kind="trial_redeem_code",
        title="Trial Vinaris disponibile",
        message=f"E disponibile un codice trial da {trial_days} giorni per iniziare a usare Vinaris.",
        action_url="/settings/profile",
        fingerprint=f"trial-redeem-code:{user.id}",
    )
    return trial_code


def store_passkey_challenge(db: Session, challenge: bytes, purpose: str, user: User | None = None) -> None:
    db.query(PasskeyChallenge).filter(PasskeyChallenge.expires_at < datetime.now(UTC)).delete()
    db.add(
        PasskeyChallenge(
            challenge=bytes_to_base64url(challenge),
            purpose=purpose,
            user_id=user.id if user else None,
            expires_at=datetime.now(UTC) + timedelta(minutes=PASSKEY_CHALLENGE_TTL_MINUTES),
        ),
    )
    db.commit()


def consume_passkey_challenge(db: Session, challenge: str, purpose: str, user: User | None = None) -> bytes:
    stored = db.scalar(
        select(PasskeyChallenge)
        .where(PasskeyChallenge.challenge == challenge)
        .where(PasskeyChallenge.purpose == purpose),
    )
    if stored is None or utc_datetime(stored.expires_at) < datetime.now(UTC):
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
        expires_at=datetime.now(UTC) + timedelta(days=settings.session_ttl_days),
        created_at=datetime.now(UTC),
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
    if db.scalar(select(User)) is None:
        return True
    return not settings.registration_requires_approval


def user_requires_email_verification(user: User) -> bool:
    return not settings.registration_requires_approval and user.email_verified_at is None


def pending_user_response(user: User) -> PendingUserResponse:
    return PendingUserResponse(id=str(user.id), email=user.email, display_name=user.display_name)


def user_admin_response(user: User, db: Session) -> UserAdminResponse:
    valid_until = active_entitlement_valid_until(db, user)
    days_remaining = math.ceil((valid_until - datetime.now(UTC)).total_seconds() / 86400) if valid_until else None
    has_demo_access = db.scalar(
        select(Household.id)
        .join(Membership, Membership.household_id == Household.id)
        .where(Membership.user_id == user.id, Household.is_demo.is_(True))
        .limit(1)
    ) is not None
    subscription = db.scalar(
        select(StripeCheckoutSession)
        .where(
            StripeCheckoutSession.user_id == user.id,
            StripeCheckoutSession.status == "completed",
            StripeCheckoutSession.plan.in_(("monthly", "annual")),
            StripeCheckoutSession.stripe_subscription_id.is_not(None),
        )
        .order_by(StripeCheckoutSession.completed_at.desc())
    )
    has_active_subscription = subscription is not None and subscription.subscription_status not in {
        "canceled",
        "incomplete_expired",
        "unpaid",
    }
    return UserAdminResponse(
        id=str(user.id),
        email=user.email,
        display_name=user.display_name,
        is_approved=user.is_approved,
        is_app_admin=user.is_app_admin,
        is_blocked=user.is_blocked,
        can_use_restaurant_mode=user.can_use_restaurant_mode,
        can_use_label_recognition=user.can_use_label_recognition,
        can_manage_wine_photos=user.can_manage_wine_photos,
        has_demo_access=has_demo_access,
        has_active_subscription=has_active_subscription,
        subscription_plan=subscription.plan if has_active_subscription else None,
        subscription_cancel_at_period_end=bool(subscription and subscription.cancel_at_period_end),
        access_override_until=user.access_override_until.isoformat() if user.access_override_until else None,
        ai_credit_balance_usd=ai_credit_balance(db, user),
        approved_at=user.approved_at.isoformat() if user.approved_at else None,
        entitlement_valid_until=valid_until.isoformat() if valid_until else None,
        entitlement_days_remaining=max(days_remaining, 0) if days_remaining is not None else None,
    )


def datetime_to_iso(value: datetime | None) -> str | None:
    if value is None:
        return None
    return utc_datetime(value).isoformat()


def most_recent_iso(*values: datetime | None) -> str | None:
    candidates = [utc_datetime(value) for value in values if value is not None]
    if not candidates:
        return None
    return max(candidates).isoformat()


def user_admin_stats(db: Session, users: list[User]) -> list[UserAdminStatsResponse]:
    user_households = select(
        Membership.user_id.label("user_id"),
        Membership.household_id.label("household_id"),
    ).subquery()

    household_counts = {
        user_id: int(total)
        for user_id, total in db.execute(
            select(Membership.user_id, func.count(Membership.household_id))
            .group_by(Membership.user_id),
        ).all()
    }
    cellar_stats = {
        user_id: (int(wines_total), int(bottles_total))
        for user_id, wines_total, bottles_total in db.execute(
            select(
                user_households.c.user_id,
                func.count(Wine.id),
                func.coalesce(func.sum(Wine.quantity), 0),
            )
            .select_from(user_households.outerjoin(Wine, Wine.household_id == user_households.c.household_id))
            .group_by(user_households.c.user_id),
        ).all()
    }
    created_wine_counts = {
        user_id: int(total)
        for user_id, total in db.execute(
            select(Wine.created_by_user_id, func.count(Wine.id))
            .where(Wine.created_by_user_id.is_not(None))
            .group_by(Wine.created_by_user_id),
        ).all()
    }
    ai_stats = {
        user_id: (int(total), last_request_at)
        for user_id, total, last_request_at in db.execute(
            select(
                AiAuditLog.user_id,
                func.count(AiAuditLog.id),
                func.max(AiAuditLog.created_at),
            )
            .where(AiAuditLog.user_id.is_not(None))
            .group_by(AiAuditLog.user_id),
        ).all()
    }
    last_sign_ins = {
        user_id: last_sign_in_at
        for user_id, last_sign_in_at in db.execute(
            select(UserSession.user_id, func.max(UserSession.created_at))
            .group_by(UserSession.user_id),
        ).all()
    }

    return [
        UserAdminStatsResponse(
            id=str(user.id),
            email=user.email,
            display_name=user.display_name,
            is_approved=user.is_approved,
            is_app_admin=user.is_app_admin,
            is_blocked=user.is_blocked,
            households_total=household_counts.get(user.id, 0),
            cellar_wines_total=cellar_stats.get(user.id, (0, 0))[0],
            cellar_bottles_total=cellar_stats.get(user.id, (0, 0))[1],
            wines_created_total=created_wine_counts.get(user.id, 0),
            ai_requests_total=ai_stats.get(user.id, (0, None))[0],
            last_sign_in_at=datetime_to_iso(last_sign_ins.get(user.id)),
            last_ai_request_at=datetime_to_iso(ai_stats.get(user.id, (0, None))[1]),
            last_activity_at=most_recent_iso(last_sign_ins.get(user.id), ai_stats.get(user.id, (0, None))[1]),
        )
        for user in users
    ]


def user_admin_stat(db: Session, user: User) -> UserAdminStatsResponse:
    return user_admin_stats(db, [user])[0]


def active_app_admins(db: Session) -> list[User]:
    return list(
        db.scalars(
            select(User)
            .where(User.is_app_admin.is_(True))
            .where(User.is_approved.is_(True))
            .where(User.is_blocked.is_(False))
            .order_by(User.email.asc()),
        ),
    )


def notify_admins_of_auto_approved_registration(db: Session, user: User, household: Household) -> None:
    for admin in active_app_admins(db):
        if admin.id == user.id:
            continue
        create_user_notification(
            db,
            admin,
            kind="new_user_registration",
            title="Nuovo utente registrato",
            message=f"{user.display_name} <{user.email}> ha creato un account per {household.name}.",
            action_url="/settings/users",
            fingerprint=f"new-user-registration:{user.id}",
        )


def notify_admins_of_pending_registration(db: Session, user: User, household: Household) -> None:
    admin_emails = list(dict.fromkeys(admin.email for admin in active_app_admins(db)))
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
            f"Created at: {datetime.now(UTC).isoformat()}\n\n"
            "Open the Vinaris admin users section to review the request."
        ),
    )


def notify_user_approved(user: User) -> None:
    send_email(
        recipients=[user.email],
        subject=f"[{settings.app_name}] Account approved",
        body=(
            "Your Vinaris account has been approved.\n\n"
            f"Name: {user.display_name}\n"
            f"Email: {user.email}\n\n"
            "You can now sign in to the app. If your access period is not active yet, enter a valid redeem code or complete the subscription payment."
        ),
    )


def notify_user_pending_approval(user: User) -> None:
    send_email(
        recipients=[user.email],
        subject=f"[{settings.app_name}] Registration received",
        body=(
            "Your Vinaris registration request has been received and is awaiting approval.\n\n"
            f"Name: {user.display_name}\n"
            f"Email: {user.email}\n\n"
            "You will receive another email once an administrator approves or rejects the request."
        ),
    )


def notify_user_rejected(user: User) -> None:
    send_email(
        recipients=[user.email],
        subject=f"[{settings.app_name}] Registration not approved",
        body=(
            "Your Vinaris registration request was not approved.\n\n"
            f"Name: {user.display_name}\n"
            f"Email: {user.email}\n\n"
            "If you think this is a mistake, contact the application administrator."
        ),
    )


def notify_user_email_verification(user: User, verification_url: str) -> bool:
    return send_email(
        recipients=[user.email],
        subject=f"[{settings.app_name}] Confirm your email",
        body=(
            "Confirm your Vinaris email address to activate your account.\n\n"
            f"Name: {user.display_name}\n"
            f"Email: {user.email}\n\n"
            f"Open this link within {settings.email_verification_ttl_hours} hours:\n"
            f"{verification_url}\n\n"
            "If you did not create this account, you can ignore this message."
        ),
    )


def notify_user_password_reset(user: User, reset_url: str) -> bool:
    return send_email(
        recipients=[user.email],
        subject=f"[{settings.app_name}] Reset your password",
        body=(
            "We received a request to reset your Vinaris password.\n\n"
            f"Open this link within {settings.password_reset_ttl_minutes} minutes:\n"
            f"{reset_url}\n\n"
            "This link can be used once. If you did not request a password reset, you can ignore this email."
        ),
    )


def verify_email_token(payload: EmailVerificationRequest, db: Session) -> User:
    token_hash = hash_email_verification_token(payload.token)
    user = db.scalar(select(User).where(User.email_verification_token_hash == token_hash))
    if user is None or user.email_verification_expires_at is None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Email confirmation link is invalid")
    expires_at = utc_datetime(user.email_verification_expires_at)
    if expires_at < datetime.now(UTC):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Email confirmation link expired")
    user.email_verified_at = datetime.now(UTC)
    user.email_verification_token_hash = ""
    user.email_verification_expires_at = None
    ensure_trial_redeem_code(db, user)
    db.commit()
    db.refresh(user)
    return user


@router.post("/register", response_model=SessionResponse, status_code=status.HTTP_201_CREATED)
def register(payload: RegisterRequest, request: Request, response: Response, db: Session = Depends(get_db)) -> SessionResponse:
    enforce_rate_limit(
        request,
        scope="auth:register:ip",
        limit=settings.rate_limit_register_attempts,
        window_seconds=settings.rate_limit_register_window_seconds,
    )
    email = payload.email.lower()
    existing = db.scalar(select(User).where(User.email == email))
    if existing is not None:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Email already registered")
    if payload.legal_document_version != LEGAL_DOCUMENT_VERSION:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Legal documents have changed. Review and accept the current version.",
        )

    first_user = db.scalar(select(User)) is None
    is_approved = user_is_preapproved(db, email)
    requires_email_verification = is_approved and not first_user and not settings.registration_requires_approval
    logger.info(
        "Registering user",
        extra={
            "email": email,
            "first_user": first_user,
            "registration_requires_approval": settings.registration_requires_approval,
            "is_approved": is_approved,
            "requires_email_verification": requires_email_verification,
            "email_provider": settings.email_provider,
            "email_enabled": settings.email_enabled,
            "smtp_enabled": settings.smtp_enabled,
        },
    )
    if requires_email_verification and not settings.email_enabled:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="Email verification requires email delivery configuration")
    email_verification_token = new_email_verification_token() if requires_email_verification else ""
    accepted_at = datetime.now(UTC)
    user = User(
        email=email,
        display_name=payload.display_name.strip(),
        password_hash=hash_password(payload.password),
        locale=payload.locale,
        photo_usage_disclaimer_accepted_at=accepted_at,
        privacy_policy_accepted_at=accepted_at,
        privacy_policy_version=LEGAL_DOCUMENT_VERSION,
        terms_accepted_at=accepted_at,
        terms_version=LEGAL_DOCUMENT_VERSION,
        legal_acceptance_locale=payload.locale,
        is_approved=is_approved,
        is_app_admin=first_user,
        can_use_label_recognition=True,
        can_manage_wine_photos=True,
        approved_at=datetime.now(UTC) if is_approved else None,
        email_verified_at=None if requires_email_verification else datetime.now(UTC),
        email_verification_token_hash=hash_email_verification_token(email_verification_token) if email_verification_token else "",
        email_verification_expires_at=datetime.now(UTC) + timedelta(hours=settings.email_verification_ttl_hours) if email_verification_token else None,
    )
    household = Household(name=payload.household_name.strip())
    db.add_all([user, household])
    db.flush()
    signup_ai_credit = configured_signup_ai_credit()
    if signup_ai_credit > Decimal("0"):
        signup_credit_entry = create_ai_credit_transaction(
            db,
            user,
            amount_usd=signup_ai_credit,
            source="signup_bonus",
            note=f"Signup AI credit ({signup_ai_credit} USD)",
        )
        db.flush()
        create_user_notification(
            db,
            user,
            kind="ai_credits",
            title="Credito AI disponibile",
            message=f"Hai ricevuto {signup_ai_credit} USD di credito AI di benvenuto.",
            fingerprint=f"ai-credit-signup-bonus:{signup_credit_entry.id}",
        )
    membership = Membership(user_id=user.id, household_id=household.id, role="owner")
    db.add(membership)
    ensure_trial_redeem_code(db, user)
    if requires_email_verification:
        verification_url = f"{request_origin(request)}/?email_verify_token={email_verification_token}"
        if not notify_user_email_verification(user, verification_url):
            raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="Unable to send email verification link")
    if is_approved and not first_user:
        notify_admins_of_auto_approved_registration(db, user, household)
    db.commit()
    db.refresh(user)
    db.refresh(household)
    db.refresh(membership)
    if not user.is_approved:
        notify_user_pending_approval(user)
        notify_admins_of_pending_registration(db, user, household)
        return SessionResponse(authenticated=False, pending_approval=True)
    if user_requires_email_verification(user):
        return SessionResponse(authenticated=False, pending_email_verification=True)

    user_session, token = create_session(db, user, household)
    db.commit()
    db.refresh(user_session)
    set_session_cookie(response, token)
    return session_response_for(db, user, household, membership, user_session)


@router.get("/legal-config")
def legal_config() -> dict[str, str]:
    return {
        "version": LEGAL_DOCUMENT_VERSION,
        "operator_name": settings.legal_operator_name.strip(),
        "operator_address": settings.legal_operator_address.strip(),
        "contact_email": settings.legal_contact_email.strip(),
    }


@router.post("/legal-acceptance", response_model=SessionResponse)
def accept_legal_documents(
    payload: LegalAcceptanceRequest,
    context: CurrentContext = Depends(get_authenticated_context),
    db: Session = Depends(get_db),
) -> SessionResponse:
    if payload.legal_document_version != LEGAL_DOCUMENT_VERSION:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Legal documents have changed. Review and accept the current version.",
        )
    accepted_at = datetime.now(UTC)
    context.user.privacy_policy_accepted_at = accepted_at
    context.user.privacy_policy_version = LEGAL_DOCUMENT_VERSION
    context.user.terms_accepted_at = accepted_at
    context.user.terms_version = LEGAL_DOCUMENT_VERSION
    context.user.legal_acceptance_locale = payload.locale
    db.commit()
    db.refresh(context.user)
    return SessionResponse(**build_session_response(context))


@router.get("/verify-email")
def verify_email_link(token: str, request: Request) -> RedirectResponse:
    # Email security scanners may open GET links automatically; keep verification explicit in the UI.
    return RedirectResponse(f"{request_origin(request)}/?email_verify_token={token}", status_code=status.HTTP_303_SEE_OTHER)


@router.post("/verify-email")
def confirm_email(payload: EmailVerificationRequest, request: Request, db: Session = Depends(get_db)) -> dict[str, str]:
    enforce_rate_limit(
        request,
        scope="auth:verify-email:ip",
        limit=settings.rate_limit_verify_email_attempts,
        window_seconds=settings.rate_limit_verify_email_window_seconds,
    )
    verify_email_token(payload, db)
    return {"status": "verified"}


@router.post("/verify-email/resend", status_code=status.HTTP_204_NO_CONTENT)
def resend_email_verification(
    payload: EmailVerificationResendRequest,
    request: Request,
    db: Session = Depends(get_db),
) -> Response:
    enforce_rate_limit(
        request,
        scope="auth:resend-verification:ip",
        limit=settings.rate_limit_resend_verification_attempts,
        window_seconds=settings.rate_limit_resend_verification_window_seconds,
    )
    enforce_rate_limit(
        request,
        scope="auth:resend-verification:account",
        limit=settings.rate_limit_resend_verification_attempts,
        window_seconds=settings.rate_limit_resend_verification_window_seconds,
        subject=str(payload.email),
    )
    if not settings.email_enabled:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Email verification requires email delivery configuration",
        )
    user = db.scalar(select(User).where(User.email == str(payload.email).lower()))
    if user is None or not user.is_approved or not user_requires_email_verification(user):
        return Response(status_code=status.HTTP_204_NO_CONTENT)
    token = new_email_verification_token()
    user.email_verification_token_hash = hash_email_verification_token(token)
    user.email_verification_expires_at = datetime.now(UTC) + timedelta(
        hours=max(settings.email_verification_ttl_hours, 1)
    )
    verification_url = f"{request_origin(request)}/?email_verify_token={token}"
    if not notify_user_email_verification(user, verification_url):
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Unable to send email verification link",
        )
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/password-reset/request", status_code=status.HTTP_204_NO_CONTENT)
def request_password_reset(payload: PasswordResetRequest, request: Request, db: Session = Depends(get_db)) -> Response:
    enforce_rate_limit(
        request,
        scope="auth:password-reset:ip",
        limit=settings.rate_limit_password_reset_attempts,
        window_seconds=settings.rate_limit_password_reset_window_seconds,
    )
    enforce_rate_limit(
        request,
        scope="auth:password-reset:account",
        limit=settings.rate_limit_password_reset_attempts,
        window_seconds=settings.rate_limit_password_reset_window_seconds,
        subject=payload.email,
    )
    if not settings.email_enabled:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="Password reset requires email delivery configuration")
    user = db.scalar(select(User).where(User.email == payload.email.lower()))
    if user is None:
        return Response(status_code=status.HTTP_204_NO_CONTENT)

    reset_token = new_password_reset_token()
    user.password_reset_token_hash = hash_password_reset_token(reset_token)
    user.password_reset_expires_at = datetime.now(UTC) + timedelta(minutes=max(settings.password_reset_ttl_minutes, 1))
    reset_url = f"{request_origin(request)}/?password_reset_token={reset_token}"
    if not notify_user_password_reset(user, reset_url):
        db.rollback()
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="Unable to send password reset email")
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/password-reset/confirm", status_code=status.HTTP_204_NO_CONTENT)
def confirm_password_reset(payload: PasswordResetConfirmRequest, request: Request, db: Session = Depends(get_db)) -> Response:
    enforce_rate_limit(
        request,
        scope="auth:password-reset:confirm:ip",
        limit=settings.rate_limit_password_reset_attempts,
        window_seconds=settings.rate_limit_password_reset_window_seconds,
    )
    user = db.scalar(select(User).where(User.password_reset_token_hash == hash_password_reset_token(payload.token)))
    if user is None or user.password_reset_expires_at is None or utc_datetime(user.password_reset_expires_at) < datetime.now(UTC):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Password reset link is invalid or expired")
    user.password_hash = hash_password(payload.password)
    user.password_reset_token_hash = ""
    user.password_reset_expires_at = None
    db.query(UserSession).filter(UserSession.user_id == user.id).delete()
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/login", response_model=SessionResponse)
def login(payload: LoginRequest, request: Request, response: Response, db: Session = Depends(get_db)) -> SessionResponse:
    enforce_rate_limit(
        request,
        scope="auth:login:ip",
        limit=settings.rate_limit_login_ip_attempts,
        window_seconds=settings.rate_limit_login_window_seconds,
    )
    enforce_rate_limit(
        request,
        scope="auth:login:account",
        limit=settings.rate_limit_login_account_attempts,
        window_seconds=settings.rate_limit_login_window_seconds,
        subject=payload.email,
    )
    user = db.scalar(select(User).where(User.email == payload.email.lower()))
    if user is None or not verify_password(payload.password, user.password_hash):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid email or password")
    if not user.is_approved:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Account pending approval")
    if user_requires_email_verification(user):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Email verification required")
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


@router.post("/demo", response_model=SessionResponse)
def enter_demo(
    request: Request,
    response: Response,
    locale: str = Query(default="it", pattern="^(it|en)$"),
    db: Session = Depends(get_db),
) -> SessionResponse:
    enforce_rate_limit(
        request,
        scope="auth:demo:ip",
        limit=settings.rate_limit_login_ip_attempts,
        window_seconds=settings.rate_limit_login_window_seconds,
    )
    household = db.scalar(select(Household).where(Household.is_demo.is_(True)))
    if household is None or db.scalar(select(func.count()).select_from(Wine).where(Wine.household_id == household.id)) == 0:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Demo cellar is not available yet")
    membership = db.scalar(
        select(Membership)
        .join(User, User.id == Membership.user_id)
        .where(
            Membership.household_id == household.id,
            Membership.role == "viewer",
            User.email == f"demo-{locale}@internal.vinaris.app",
        )
    )
    if membership is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Demo cellar is not available yet")
    user = db.get(User, membership.user_id)
    if user is None or user.is_blocked:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Demo cellar is not available yet")
    user.theme_preference = "atelier"
    db.execute(
        delete(UserSession).where(
            UserSession.user_id == user.id,
            UserSession.expires_at <= datetime.now(UTC),
        )
    )
    user_session, token = create_session(db, user, household)
    user_session.expires_at = datetime.now(UTC) + timedelta(hours=2)
    db.add(UserActivityLog(user_id=user.id, household_id=household.id, action="demo_cellar_visited"))
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
    if context.household.is_demo and (
        payload.dashboard_focus is not None or "daily_wine_budget_chf" in payload.model_fields_set
    ):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Demo preferences are limited to language and theme")
    daily_budget_provided = "daily_wine_budget_chf" in payload.model_fields_set
    if (
        payload.locale is None
        and payload.theme_preference is None
        and payload.dashboard_focus is None
        and not daily_budget_provided
    ):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="No preferences provided")
    if payload.locale is not None:
        context.user.locale = payload.locale
    if payload.theme_preference is not None:
        context.user.theme_preference = payload.theme_preference
    if payload.dashboard_focus is not None:
        context.user.dashboard_focus = payload.dashboard_focus
    if daily_budget_provided:
        context.user.daily_wine_budget_chf = payload.daily_wine_budget_chf
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
    enforce_rate_limit(
        request,
        scope="auth:passkey-register:options",
        limit=settings.rate_limit_passkey_options_attempts,
        window_seconds=settings.rate_limit_passkey_window_seconds,
        subject=str(context.user.id),
    )
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
    enforce_rate_limit(
        request,
        scope="auth:passkey-register:verify",
        limit=settings.rate_limit_passkey_verify_attempts,
        window_seconds=settings.rate_limit_passkey_window_seconds,
        subject=str(context.user.id),
    )
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
    enforce_rate_limit(
        request,
        scope="auth:passkey-login:options",
        limit=settings.rate_limit_passkey_options_attempts,
        window_seconds=settings.rate_limit_passkey_window_seconds,
    )
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
    enforce_rate_limit(
        request,
        scope="auth:passkey-login:verify",
        limit=settings.rate_limit_passkey_verify_attempts,
        window_seconds=settings.rate_limit_passkey_window_seconds,
    )
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
    passkey.last_used_at = datetime.now(UTC)
    user = db.get(User, passkey.user_id)
    if user is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User unavailable")
    if not user.is_approved:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Account pending approval")
    if user_requires_email_verification(user):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Email verification required")
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
    user.approved_at = datetime.now(UTC)
    ensure_trial_redeem_code(db, user)
    db.commit()
    db.refresh(user)
    notify_user_approved(user)
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
    notify_user_rejected(user)
    delete_user_and_orphaned_households(db, user)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/users", response_model=list[UserAdminResponse])
def list_users(
    _: CurrentContext = Depends(require_app_admin_context),
    db: Session = Depends(get_db),
) -> list[UserAdminResponse]:
    users = db.scalars(select(User).order_by(User.email.asc()))
    return [user_admin_response(user, db) for user in users]


@router.get("/users/stats", response_model=list[UserAdminStatsResponse])
def list_user_stats(
    _: CurrentContext = Depends(require_app_admin_context),
    db: Session = Depends(get_db),
) -> list[UserAdminStatsResponse]:
    users = list(db.scalars(select(User).order_by(User.email.asc())))
    return user_admin_stats(db, users)


@router.get("/users/{user_id}/stats", response_model=UserAdminStatsResponse)
def get_user_stats(
    user_id: UUID,
    _: CurrentContext = Depends(require_app_admin_context),
    db: Session = Depends(get_db),
) -> UserAdminStatsResponse:
    user = db.get(User, user_id)
    if user is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    return user_admin_stat(db, user)


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
    if (
        payload.is_app_admin is None
        and payload.is_blocked is None
        and payload.can_use_restaurant_mode is None
        and payload.can_use_label_recognition is None
        and payload.can_manage_wine_photos is None
        and payload.ai_credit_balance_target_usd is None
        and payload.access_override_days is None
        and not payload.clear_access_override
    ):
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
    if payload.can_use_restaurant_mode is not None:
        user.can_use_restaurant_mode = payload.can_use_restaurant_mode
    if payload.can_use_label_recognition is not None:
        user.can_use_label_recognition = payload.can_use_label_recognition
    if payload.can_manage_wine_photos is not None:
        user.can_manage_wine_photos = payload.can_manage_wine_photos
    if payload.clear_access_override:
        user.access_override_until = None
    elif payload.access_override_days is not None:
        user.access_override_until = datetime.now(UTC) + timedelta(days=payload.access_override_days)
    if payload.ai_credit_balance_target_usd is not None:
        if payload.ai_credit_balance_target_usd < Decimal("0"):
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="AI credit balance cannot be negative")
        credit_entry = set_ai_credit_balance(
            db,
            user,
            target_balance_usd=payload.ai_credit_balance_target_usd,
            source="admin_adjustment",
            note=(
                f"Admin AI credit adjustment by {context.user.email}"
                + (f": {payload.ai_credit_note.strip()}" if payload.ai_credit_note and payload.ai_credit_note.strip() else "")
            ),
        )
        if credit_entry is not None:
            db.flush()
            balance_now = ai_credit_balance(db, user)
            admin_note = payload.ai_credit_note.strip() if payload.ai_credit_note and payload.ai_credit_note.strip() else ""
            create_user_notification(
                db,
                user,
                kind="ai_credits",
                title="Credito AI aggiornato",
                message=(
                    f"Il tuo saldo AI ora è {balance_now} USD."
                    + (f" Messaggio admin: {admin_note}" if admin_note else "")
                ),
                fingerprint=f"ai-credit-admin-adjustment:{credit_entry.id}",
            )
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
    delete_user_and_orphaned_households(db, user)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.delete("/account", status_code=status.HTTP_204_NO_CONTENT)
def delete_own_account(
    payload: AccountDeletionRequest,
    response: Response,
    context: CurrentContext = Depends(get_authenticated_context),
    db: Session = Depends(get_db),
) -> Response:
    user = context.user
    if payload.confirmation_email.lower() != user.email.lower():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Confirmation email does not match the current account",
        )
    if not verify_password(payload.password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Current password is not valid",
        )
    if user.is_app_admin:
        other_admin = db.scalar(
            select(User).where(
                User.is_app_admin.is_(True),
                User.id != user.id,
                User.is_blocked.is_(False),
            )
        )
        if other_admin is None:
            replacement_admin = db.scalar(
                select(User)
                .where(
                    User.id != user.id,
                    User.is_approved.is_(True),
                    User.is_blocked.is_(False),
                )
                .order_by(User.email.asc())
            )
            if replacement_admin is not None:
                replacement_admin.is_app_admin = True
            elif db.scalar(select(User.id).where(User.id != user.id)) is not None:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=(
                        "Approve an active replacement administrator before deleting "
                        "this account"
                    ),
                )

    delete_user_and_orphaned_households(db, user)
    db.commit()
    response.delete_cookie(settings.session_cookie_name)
    response.status_code = status.HTTP_204_NO_CONTENT
    return response


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
