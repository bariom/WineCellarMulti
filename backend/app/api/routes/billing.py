from __future__ import annotations

import hashlib
import hmac
import json
import secrets
import string
import time
from datetime import datetime, timedelta, timezone
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen
from uuid import UUID

from fastapi import APIRouter, Depends, Header, HTTPException, Request as FastAPIRequest, Response, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import CurrentContext, active_entitlement_valid_until, get_authenticated_context, require_app_admin_context
from app.core.config import settings
from app.core.crypto import decrypt_secret, encrypt_secret
from app.core.security import hash_redeem_code
from app.db.session import get_db
from app.models import RedeemCode, RedeemRedemption, StripeCheckoutSession, User, UserEntitlement
from app.schemas.billing import BillingStatusResponse, CheckoutSessionResponse, EntitlementResponse, RedeemCodeCreate, RedeemCodeResponse, RedeemRequest


router = APIRouter(prefix="/billing")
CODE_ALPHABET = string.ascii_uppercase + string.digits


def now_utc() -> datetime:
    return datetime.now(timezone.utc)


def as_aware_utc(value: datetime) -> datetime:
    return value.replace(tzinfo=timezone.utc) if value.tzinfo is None else value.astimezone(timezone.utc)


def normalize_redeem_code(code: str) -> str:
    return "".join(character for character in code.upper() if character.isalnum())


def generate_redeem_code() -> str:
    raw = "".join(secrets.choice(CODE_ALPHABET) for _ in range(16))
    return f"WCM-{raw[:4]}-{raw[4:8]}-{raw[8:12]}-{raw[12:]}"


def redeem_code_response(code: RedeemCode, clear_code: str | None = None) -> RedeemCodeResponse:
    current_time = now_utc()
    expires_at = as_aware_utc(code.expires_at) if code.expires_at else None
    is_active = code.revoked_at is None and code.redeemed_count < code.max_redemptions and (expires_at is None or expires_at > current_time)
    return RedeemCodeResponse(
        id=code.id,
        code=clear_code or decrypt_secret(code.encrypted_code),
        code_prefix=code.code_prefix,
        label=code.label,
        duration_days=code.duration_days,
        max_redemptions=code.max_redemptions,
        redeemed_count=code.redeemed_count,
        email=code.email,
        expires_at=expires_at,
        created_at=code.created_at,
        revoked_at=code.revoked_at,
        is_active=is_active,
    )


def entitlement_response(entitlement: UserEntitlement) -> EntitlementResponse:
    return EntitlementResponse(
        id=entitlement.id,
        source=entitlement.source,
        valid_from=as_aware_utc(entitlement.valid_from),
        valid_until=as_aware_utc(entitlement.valid_until),
        created_at=as_aware_utc(entitlement.created_at),
    )


def latest_valid_from(db: Session, user: User, current_time: datetime) -> datetime:
    latest_entitlement = db.scalar(
        select(UserEntitlement)
        .where(UserEntitlement.user_id == user.id, UserEntitlement.valid_until > current_time)
        .order_by(UserEntitlement.valid_until.desc()),
    )
    return as_aware_utc(latest_entitlement.valid_until) if latest_entitlement else current_time


def create_entitlement(db: Session, user: User, *, source: str, source_id: UUID | None, duration_days: int) -> UserEntitlement:
    current_time = now_utc()
    valid_from = latest_valid_from(db, user, current_time)
    entitlement = UserEntitlement(
        user_id=user.id,
        source=source,
        source_id=source_id,
        valid_from=valid_from,
        valid_until=valid_from + timedelta(days=duration_days),
    )
    db.add(entitlement)
    return entitlement


def billing_status(db: Session, user: User) -> BillingStatusResponse:
    current_time = now_utc()
    entitlements = list(db.scalars(select(UserEntitlement).where(UserEntitlement.user_id == user.id).order_by(UserEntitlement.valid_until.desc())))
    active_valid_until = active_entitlement_valid_until(db, user)
    active_entitlement = next(
        (entitlement for entitlement in entitlements if active_valid_until is not None and as_aware_utc(entitlement.valid_until) >= active_valid_until and as_aware_utc(entitlement.valid_until) > current_time),
        None,
    )
    return BillingStatusResponse(
        has_active_entitlement=active_valid_until is not None,
        valid_until=active_valid_until,
        active_source=active_entitlement.source if active_entitlement else None,
        entitlements=[entitlement_response(entitlement) for entitlement in entitlements],
    )


def stripe_checkout_payload(user: User) -> dict[str, str]:
    duration_days = max(settings.stripe_entitlement_days, 1)
    payload = {
        "mode": "payment",
        "client_reference_id": str(user.id),
        "customer_email": user.email,
        "success_url": settings.stripe_success_url,
        "cancel_url": settings.stripe_cancel_url,
        "metadata[user_id]": str(user.id),
        "metadata[duration_days]": str(duration_days),
        "line_items[0][quantity]": "1",
    }
    if settings.stripe_price_id:
        payload["line_items[0][price]"] = settings.stripe_price_id
    else:
        amount = settings.stripe_payment_amount_cents
        if amount <= 0:
            raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="Stripe price is not configured")
        payload.update(
            {
                "line_items[0][price_data][currency]": settings.stripe_payment_currency.lower(),
                "line_items[0][price_data][unit_amount]": str(amount),
                "line_items[0][price_data][product_data][name]": settings.stripe_payment_label,
            },
        )
    return payload


def create_stripe_checkout_session(user: User) -> dict:
    if not settings.stripe_secret_key:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="Stripe is not configured")
    payload = urlencode(stripe_checkout_payload(user)).encode("utf-8")
    request = Request(
        settings.stripe_checkout_url,
        data=payload,
        headers={
            "Authorization": f"Bearer {settings.stripe_secret_key}",
            "Content-Type": "application/x-www-form-urlencoded",
        },
        method="POST",
    )
    try:
        with urlopen(request, timeout=20) as response:
            return json.loads(response.read().decode("utf-8"))
    except HTTPError as error:
        message = error.read().decode("utf-8", errors="replace")
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=f"Stripe checkout failed: {message}") from error
    except (URLError, TimeoutError) as error:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail="Stripe checkout is unavailable") from error


def verify_stripe_signature(payload: bytes, signature_header: str | None, tolerance_seconds: int = 300) -> None:
    if not settings.stripe_webhook_secret:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="Stripe webhook is not configured")
    if not signature_header:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Missing Stripe signature")
    parts = {}
    for item in signature_header.split(","):
        key, _, value = item.partition("=")
        parts.setdefault(key, []).append(value)
    timestamp_values = parts.get("t") or []
    signatures = parts.get("v1") or []
    if not timestamp_values or not signatures:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid Stripe signature")
    timestamp = int(timestamp_values[0])
    if abs(time.time() - timestamp) > tolerance_seconds:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Expired Stripe signature")
    signed_payload = f"{timestamp}.{payload.decode('utf-8')}".encode("utf-8")
    expected = hmac.new(settings.stripe_webhook_secret.encode("utf-8"), signed_payload, hashlib.sha256).hexdigest()
    if not any(hmac.compare_digest(expected, signature) for signature in signatures):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid Stripe signature")


def complete_stripe_checkout(db: Session, session: dict) -> None:
    if session.get("payment_status") not in ("paid", "no_payment_required"):
        return
    stripe_session_id = str(session.get("id") or "")
    if not stripe_session_id:
        return
    checkout = db.scalar(select(StripeCheckoutSession).where(StripeCheckoutSession.stripe_session_id == stripe_session_id))
    if checkout is None:
        metadata = session.get("metadata") if isinstance(session.get("metadata"), dict) else {}
        user_id = metadata.get("user_id") or session.get("client_reference_id")
        if not user_id:
            return
        try:
            parsed_user_id = UUID(str(user_id))
        except ValueError:
            return
        user = db.get(User, parsed_user_id)
        if user is None:
            return
        checkout = StripeCheckoutSession(
            user_id=user.id,
            stripe_session_id=stripe_session_id,
            stripe_customer_id=session.get("customer"),
            duration_days=int(metadata.get("duration_days") or settings.stripe_entitlement_days),
            amount_total=session.get("amount_total"),
            currency=session.get("currency"),
        )
        db.add(checkout)
        db.flush()
    if checkout.completed_at is not None:
        return
    user = db.get(User, checkout.user_id)
    if user is None:
        return
    checkout.status = "completed"
    checkout.stripe_customer_id = session.get("customer") or checkout.stripe_customer_id
    checkout.amount_total = session.get("amount_total") if session.get("amount_total") is not None else checkout.amount_total
    checkout.currency = session.get("currency") or checkout.currency
    checkout.completed_at = now_utc()
    create_entitlement(db, user, source="stripe", source_id=checkout.id, duration_days=checkout.duration_days)


@router.get("/status", response_model=BillingStatusResponse)
def get_billing_status(
    context: CurrentContext = Depends(get_authenticated_context),
    db: Session = Depends(get_db),
) -> BillingStatusResponse:
    return billing_status(db, context.user)


@router.post("/checkout", response_model=CheckoutSessionResponse)
def create_checkout_session(
    context: CurrentContext = Depends(get_authenticated_context),
    db: Session = Depends(get_db),
) -> CheckoutSessionResponse:
    session = create_stripe_checkout_session(context.user)
    stripe_session_id = str(session.get("id") or "")
    checkout_url = str(session.get("url") or "")
    if not stripe_session_id or not checkout_url:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail="Stripe did not return a checkout URL")
    existing = db.scalar(select(StripeCheckoutSession).where(StripeCheckoutSession.stripe_session_id == stripe_session_id))
    if existing is None:
        db.add(
            StripeCheckoutSession(
                user_id=context.user.id,
                stripe_session_id=stripe_session_id,
                stripe_customer_id=session.get("customer"),
                duration_days=max(settings.stripe_entitlement_days, 1),
                amount_total=session.get("amount_total"),
                currency=session.get("currency"),
            ),
        )
        db.commit()
    return CheckoutSessionResponse(checkout_url=checkout_url, stripe_session_id=stripe_session_id)


@router.post("/stripe/webhook", status_code=status.HTTP_204_NO_CONTENT)
async def stripe_webhook(
    request: FastAPIRequest,
    stripe_signature: str | None = Header(default=None, alias="Stripe-Signature"),
    db: Session = Depends(get_db),
) -> Response:
    payload = await request.body()
    verify_stripe_signature(payload, stripe_signature)
    event = json.loads(payload.decode("utf-8"))
    if event.get("type") == "checkout.session.completed":
        session = event.get("data", {}).get("object", {})
        if isinstance(session, dict):
            complete_stripe_checkout(db, session)
            db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/redeem-codes", response_model=list[RedeemCodeResponse])
def list_redeem_codes(
    _: CurrentContext = Depends(require_app_admin_context),
    db: Session = Depends(get_db),
) -> list[RedeemCodeResponse]:
    codes = db.scalars(select(RedeemCode).order_by(RedeemCode.created_at.desc()))
    return [redeem_code_response(code) for code in codes]


@router.post("/redeem-codes", response_model=RedeemCodeResponse, status_code=status.HTTP_201_CREATED)
def create_redeem_code(
    payload: RedeemCodeCreate,
    context: CurrentContext = Depends(require_app_admin_context),
    db: Session = Depends(get_db),
) -> RedeemCodeResponse:
    clear_code = generate_redeem_code()
    normalized = normalize_redeem_code(clear_code)
    code = RedeemCode(
        code_hash=hash_redeem_code(normalized),
        code_prefix=clear_code[:8],
        encrypted_code=encrypt_secret(clear_code),
        label=payload.label.strip(),
        duration_days=payload.duration_days,
        max_redemptions=payload.max_redemptions,
        email=payload.email.lower() if payload.email else None,
        expires_at=payload.expires_at,
        created_by_user_id=context.user.id,
    )
    db.add(code)
    db.commit()
    db.refresh(code)
    return redeem_code_response(code, clear_code=clear_code)


@router.delete("/redeem-codes/{code_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_redeem_code(
    code_id: UUID,
    force: bool = False,
    _: CurrentContext = Depends(require_app_admin_context),
    db: Session = Depends(get_db),
) -> Response:
    code = db.get(RedeemCode, code_id)
    if code is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Redeem code not found")
    if code.redeemed_count > 0 and not force:
        code.revoked_at = code.revoked_at or now_utc()
    else:
        db.delete(code)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/redeem", response_model=BillingStatusResponse)
def redeem_code(
    payload: RedeemRequest,
    context: CurrentContext = Depends(get_authenticated_context),
    db: Session = Depends(get_db),
) -> BillingStatusResponse:
    normalized = normalize_redeem_code(payload.code)
    if len(normalized) < 6:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid redeem code")

    code = db.scalar(select(RedeemCode).where(RedeemCode.code_hash == hash_redeem_code(normalized)))
    current_time = now_utc()
    if code is None or code.revoked_at is not None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Redeem code not found")
    if code.expires_at is not None and as_aware_utc(code.expires_at) <= current_time:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Redeem code expired")
    if code.redeemed_count >= code.max_redemptions:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Redeem code already used")
    if code.email and code.email.lower() != context.user.email.lower():
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Redeem code is reserved for another email")
    existing_redemption = db.scalar(select(RedeemRedemption).where(RedeemRedemption.redeem_code_id == code.id, RedeemRedemption.user_id == context.user.id))
    if existing_redemption is not None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Redeem code already redeemed by this user")

    latest_entitlement = db.scalar(
        select(UserEntitlement)
        .where(UserEntitlement.user_id == context.user.id, UserEntitlement.valid_until > current_time)
        .order_by(UserEntitlement.valid_until.desc()),
    )
    valid_from = as_aware_utc(latest_entitlement.valid_until) if latest_entitlement else current_time
    entitlement = UserEntitlement(
        user_id=context.user.id,
        source="redeem",
        source_id=code.id,
        valid_from=valid_from,
        valid_until=valid_from + timedelta(days=code.duration_days),
    )
    redemption = RedeemRedemption(redeem_code_id=code.id, user_id=context.user.id)
    code.redeemed_count += 1
    db.add(entitlement)
    db.add(redemption)
    db.commit()
    return billing_status(db, context.user)
