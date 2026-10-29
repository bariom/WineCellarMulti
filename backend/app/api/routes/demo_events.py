"""Event QR codes: a guest enters without an account, tries the event's AI
features on Vinaris' credit, and may keep the account; administrators manage
the events and print their QR codes."""

import secrets
from datetime import UTC, datetime, timedelta
from decimal import Decimal
from io import BytesIO
from uuid import UUID, uuid4

import qrcode
import qrcode.image.svg
from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response, status
from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from app.api.deps import CurrentContext, get_current_context, require_app_admin_context
from app.api.routes.auth import (
    create_session,
    notify_admins_of_auto_approved_registration,
    notify_user_email_verification,
    request_origin,
    session_response_for,
    set_session_cookie,
    user_is_preapproved,
)
from app.core.config import settings
from app.core.legal import LEGAL_DOCUMENT_VERSION
from app.core.rate_limit import enforce_rate_limit
from app.core.security import (
    hash_email_verification_token,
    hash_password,
    new_email_verification_token,
)
from app.db.session import get_db
from app.models import DemoEvent, Household, Membership, User, UserActivityLog, UserSession
from app.schemas.demo_event import (
    DemoEventCreate,
    DemoEventResponse,
    DemoEventStats,
    DemoEventUpdate,
    EventClaimRequest,
)
from app.schemas.session import SessionResponse
from app.services.ai_credits import (
    configured_signup_ai_credit,
    create_ai_credit_transaction,
    quantize_usd,
)
from app.services.demo_events import (
    GRANT_SOURCE,
    VISITOR_EMAIL_DOMAIN,
    event_is_open,
    event_stats,
    granted_total_usd,
    grants_since,
    is_event_visitor,
    purge_expired_visitors,
)
from app.services.notifications import create_user_notification

router = APIRouter(prefix="/events")
admin_router = APIRouter(prefix="/admin/events")


def new_event_slug() -> str:
    return secrets.token_urlsafe(9)


def event_or_404(db: Session, slug: str) -> DemoEvent:
    event = db.scalar(select(DemoEvent).where(DemoEvent.slug == slug))
    if event is None or not event_is_open(event, datetime.now(UTC)):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Event not found")
    return event


@router.post("/{slug}/enter", response_model=SessionResponse)
def enter_event(
    slug: str,
    request: Request,
    response: Response,
    locale: str | None = Query(default=None, pattern="^(it|en)$"),
    db: Session = Depends(get_db),
) -> SessionResponse:
    """The QR code's address: a throw-away account with its own empty cellar and the event's credit."""
    enforce_rate_limit(
        request,
        scope="auth:event:ip",
        limit=settings.rate_limit_login_ip_attempts,
        window_seconds=settings.rate_limit_login_window_seconds,
    )
    event = event_or_404(db, slug)
    purge_expired_visitors(db, event.id)
    now = datetime.now(UTC)
    if grants_since(db, event, now - timedelta(days=1)) >= event.max_visitors_per_day:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="The event has welcomed all the guests it can today",
        )
    credit = quantize_usd(Decimal(event.credit_per_visitor_usd))
    if event.budget_usd and granted_total_usd(db, event) + credit > Decimal(event.budget_usd):
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="The event's budget is spent"
        )
    visitor_locale = locale or event.locale
    visitor_until = now + timedelta(hours=event.session_hours)
    # The event page tells guests that continuing accepts the privacy policy
    # and terms, so the account carries that acceptance from the start.
    user = User(
        email=f"event-{uuid4().hex}@{VISITOR_EMAIL_DOMAIN}",
        display_name="Ospite" if visitor_locale == "it" else "Guest",
        password_hash=hash_password(secrets.token_urlsafe(32)),
        locale=visitor_locale,
        photo_usage_disclaimer_accepted_at=now,
        privacy_policy_accepted_at=now,
        privacy_policy_version=LEGAL_DOCUMENT_VERSION,
        terms_accepted_at=now,
        terms_version=LEGAL_DOCUMENT_VERSION,
        legal_acceptance_locale=visitor_locale,
        is_approved=True,
        approved_at=now,
        email_verified_at=now,
        can_use_label_recognition=True,
        can_manage_wine_photos=False,
        onboarding_completed_at=now,
        event_id=event.id,
        event_visitor_until=visitor_until,
    )
    household = Household(name=f"{event.name}" + (f" · {event.place}" if event.place else ""))
    db.add_all([user, household])
    db.flush()
    db.add(Membership(user_id=user.id, household_id=household.id, role="owner"))
    create_ai_credit_transaction(
        db,
        user,
        amount_usd=credit,
        source=GRANT_SOURCE,
        source_id=event.id,
        note=f"Event credit: {event.name}",
        created_at=now,
    )
    event.visitor_count += 1
    user_session, token = create_session(db, user, household)
    user_session.expires_at = visitor_until
    db.add(UserActivityLog(user_id=user.id, household_id=household.id, action="event_visited"))
    db.commit()
    membership = db.scalar(
        select(Membership).where(
            Membership.user_id == user.id, Membership.household_id == household.id
        )
    )
    assert membership is not None
    db.refresh(user_session)
    set_session_cookie(response, token)
    return session_response_for(db, user, household, membership, user_session)


@router.post("/claim", response_model=SessionResponse)
def claim_event_account(
    payload: EventClaimRequest,
    request: Request,
    context: CurrentContext = Depends(get_current_context),
    db: Session = Depends(get_db),
) -> SessionResponse:
    """A guest keeps what they did tonight as a real account: nothing starts over."""
    if not is_event_visitor(context.user):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Only an event guest can keep the account",
        )
    if payload.legal_document_version != LEGAL_DOCUMENT_VERSION:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Legal documents have changed. Review and accept the current version.",
        )
    email = payload.email.lower()
    if db.scalar(select(User).where(User.email == email)) is not None:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Email already registered")
    user = db.scalar(select(User).where(User.id == context.user.id).with_for_update())
    assert user is not None
    now = datetime.now(UTC)
    is_approved = user_is_preapproved(db, email)
    requires_email_verification = is_approved and not settings.registration_requires_approval
    if requires_email_verification and not settings.email_enabled:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Email verification requires email delivery configuration",
        )
    verification_token = new_email_verification_token() if requires_email_verification else ""
    user.email = email
    user.display_name = payload.display_name.strip()
    user.password_hash = hash_password(payload.password)
    user.locale = payload.locale
    user.legal_acceptance_locale = payload.locale
    user.privacy_policy_accepted_at = now
    user.privacy_policy_version = LEGAL_DOCUMENT_VERSION
    user.terms_accepted_at = now
    user.terms_version = LEGAL_DOCUMENT_VERSION
    user.photo_usage_disclaimer_accepted_at = now
    user.can_manage_wine_photos = True
    user.is_approved = is_approved
    user.approved_at = now if is_approved else None
    user.email_verified_at = None if requires_email_verification else now
    user.email_verification_token_hash = (
        hash_email_verification_token(verification_token) if verification_token else ""
    )
    user.email_verification_expires_at = (
        now + timedelta(hours=settings.email_verification_ttl_hours) if verification_token else None
    )
    user.event_visitor_until = None
    context.household.name = payload.household_name.strip()
    # The visit's session would have ended with the event; a kept account lasts like any other.
    context.session.expires_at = now + timedelta(days=settings.session_ttl_days)
    signup_ai_credit = configured_signup_ai_credit()
    if signup_ai_credit > Decimal("0"):
        entry = create_ai_credit_transaction(
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
            fingerprint=f"ai-credit-signup-bonus:{entry.id}",
        )
    db.add(
        UserActivityLog(
            user_id=user.id, household_id=context.household.id, action="event_converted"
        )
    )
    if requires_email_verification:
        verification_url = f"{request_origin(request)}/?email_verify_token={verification_token}"
        if not notify_user_email_verification(user, verification_url):
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="Unable to send email verification link",
            )
        db.execute(delete(UserSession).where(UserSession.user_id == user.id))
    if is_approved:
        notify_admins_of_auto_approved_registration(db, user, context.household)
    db.commit()
    if not is_approved:
        return SessionResponse(authenticated=False, pending_approval=True)
    if requires_email_verification:
        return SessionResponse(authenticated=False, pending_email_verification=True)
    db.refresh(user)
    db.refresh(context.session)
    return session_response_for(db, user, context.household, context.membership, context.session)


def event_admin(context: CurrentContext = Depends(require_app_admin_context)) -> CurrentContext:
    if context.household.is_demo:
        raise HTTPException(status_code=403, detail="Unavailable in demo mode")
    return context


def event_response(db: Session, request: Request, event: DemoEvent) -> DemoEventResponse:
    origin = request_origin(request)
    return DemoEventResponse(
        id=str(event.id),
        slug=event.slug,
        url=f"{origin}/e/{event.slug}",
        qr_url=f"/api/v1/admin/events/{event.id}/qr.svg",
        name=event.name,
        place=event.place,
        locale=event.locale,  # type: ignore[arg-type]
        is_active=event.is_active,
        starts_at=event.starts_at,
        ends_at=event.ends_at,
        features=list(event.features or []),  # type: ignore[arg-type]
        landing=event.landing,  # type: ignore[arg-type]
        credit_per_visitor_usd=Decimal(event.credit_per_visitor_usd),
        budget_usd=Decimal(event.budget_usd),
        max_visitors_per_day=event.max_visitors_per_day,
        session_hours=event.session_hours,
        created_at=event.created_at,
        stats=DemoEventStats(**event_stats(db, event)),  # type: ignore[arg-type]
    )


@admin_router.get("", response_model=list[DemoEventResponse])
def list_events(
    request: Request,
    context: CurrentContext = Depends(event_admin),
    db: Session = Depends(get_db),
) -> list[DemoEventResponse]:
    purge_expired_visitors(db)
    db.commit()
    events = db.scalars(select(DemoEvent).order_by(DemoEvent.created_at.desc()))
    return [event_response(db, request, event) for event in events]


@admin_router.post("", response_model=DemoEventResponse, status_code=status.HTTP_201_CREATED)
def create_event(
    payload: DemoEventCreate,
    request: Request,
    context: CurrentContext = Depends(event_admin),
    db: Session = Depends(get_db),
) -> DemoEventResponse:
    event = DemoEvent(
        slug=new_event_slug(),
        name=payload.name.strip(),
        place=payload.place.strip(),
        locale=payload.locale,
        is_active=payload.is_active,
        starts_at=payload.starts_at,
        ends_at=payload.ends_at,
        features=list(payload.features),
        landing=payload.landing,
        credit_per_visitor_usd=payload.credit_per_visitor_usd,
        budget_usd=payload.budget_usd,
        max_visitors_per_day=payload.max_visitors_per_day,
        session_hours=payload.session_hours,
        created_by_user_id=context.user.id,
        created_at=datetime.now(UTC),
    )
    db.add(event)
    db.commit()
    db.refresh(event)
    return event_response(db, request, event)


@admin_router.patch("/{event_id}", response_model=DemoEventResponse)
def update_event(
    event_id: UUID,
    payload: DemoEventUpdate,
    request: Request,
    context: CurrentContext = Depends(event_admin),
    db: Session = Depends(get_db),
) -> DemoEventResponse:
    event = db.get(DemoEvent, event_id)
    if event is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Event not found")
    changes = payload.model_dump(exclude_unset=True)
    if "name" in changes and payload.name is not None:
        event.name = payload.name.strip()
    if "place" in changes and payload.place is not None:
        event.place = payload.place.strip()
    for field in (
        "locale",
        "is_active",
        "landing",
        "credit_per_visitor_usd",
        "budget_usd",
        "max_visitors_per_day",
        "session_hours",
    ):
        if field in changes and changes[field] is not None:
            setattr(event, field, changes[field])
    if "features" in changes and payload.features is not None:
        event.features = list(payload.features)
    if payload.clear_dates:
        event.starts_at = None
        event.ends_at = None
    else:
        if "starts_at" in changes:
            event.starts_at = payload.starts_at
        if "ends_at" in changes:
            event.ends_at = payload.ends_at
    if payload.rotate_slug:
        event.slug = new_event_slug()
    db.commit()
    db.refresh(event)
    return event_response(db, request, event)


@admin_router.get("/{event_id}/qr.svg", response_class=Response)
def event_qr(
    event_id: UUID,
    request: Request,
    context: CurrentContext = Depends(event_admin),
    db: Session = Depends(get_db),
) -> Response:
    event = db.get(DemoEvent, event_id)
    if event is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Event not found")
    image = qrcode.make(
        f"{request_origin(request)}/e/{event.slug}", image_factory=qrcode.image.svg.SvgPathImage
    )
    output = BytesIO()
    image.save(output)
    return Response(content=output.getvalue(), media_type="image/svg+xml")
