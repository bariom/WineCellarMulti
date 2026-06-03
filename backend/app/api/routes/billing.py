from __future__ import annotations

import hashlib
import hmac
import json
import secrets
import string
import time
from datetime import datetime, timedelta, timezone
from decimal import Decimal, InvalidOperation
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
from app.models import RedeemCode, RedeemRedemption, StripeCheckoutSession, StripeWebhookEvent, User, UserEntitlement, UserNotification
from app.schemas.billing import BillingPortalResponse, BillingStatusResponse, CheckoutSessionCreate, CheckoutSessionResponse, EntitlementResponse, RedeemCodeCreate, RedeemCodeResponse, RedeemRequest
from app.services.email import send_email
from app.services.ai_credits import ZERO_USD, ai_credit_balance, create_ai_credit_transaction, quantize_usd


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


def create_user_notification(db: Session, user: User, *, kind: str, title: str, message: str, action_url: str | None = None) -> UserNotification:
    notification = UserNotification(
        user_id=user.id,
        kind=kind,
        title=title,
        message=message,
        action_url=action_url,
    )
    db.add(notification)
    return notification


def notify_redeem_code_email(*, user: User, code: str, duration_days: int, label: str) -> None:
    send_email(
        recipients=[user.email],
        subject=f"[{settings.app_name}] New redeem code available",
        body=(
            "A new Vinaris redeem code has been generated for your account.\n\n"
            f"Redeem code: {code}\n"
            f"Duration: {duration_days} days\n"
            f"Reason: {label}\n\n"
            "Open the app, go to the redeem code section, and redeem it to activate or extend your access."
        ),
    )


def create_payment_redeem_code(db: Session, user: User, *, label: str, duration_days: int, checkout: StripeCheckoutSession | None = None) -> RedeemCode:
    clear_code = generate_redeem_code()
    normalized = normalize_redeem_code(clear_code)
    code = RedeemCode(
        code_hash=hash_redeem_code(normalized),
        code_prefix=clear_code[:8],
        encrypted_code=encrypt_secret(clear_code),
        label=label,
        duration_days=duration_days,
        max_redemptions=1,
        email=user.email.lower(),
    )
    db.add(code)
    db.flush()
    if checkout is not None and checkout.redeem_code_id is None:
        checkout.redeem_code_id = code.id
    create_user_notification(
        db,
        user,
        kind="redeem_code",
        title="Nuovo codice redeem disponibile",
        message=f"E stato generato un codice redeem da {duration_days} giorni.",
        action_url="/settings/profile",
    )
    notify_redeem_code_email(user=user, code=clear_code, duration_days=duration_days, label=label)
    return code


def billing_status(db: Session, user: User) -> BillingStatusResponse:
    current_time = now_utc()
    entitlements = list(db.scalars(select(UserEntitlement).where(UserEntitlement.user_id == user.id).order_by(UserEntitlement.valid_until.desc())))
    available_codes = list(
        db.scalars(
            select(RedeemCode)
            .where(
                RedeemCode.email == user.email.lower(),
                RedeemCode.revoked_at.is_(None),
                RedeemCode.redeemed_count < RedeemCode.max_redemptions,
            )
            .order_by(RedeemCode.created_at.desc()),
        ),
    )
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
        available_redeem_codes=[redeem_code_response(code) for code in available_codes if code.expires_at is None or as_aware_utc(code.expires_at) > current_time],
        ai_credit_balance_usd=ai_credit_balance(db, user),
        can_purchase_ai_credits=bool(settings.stripe_ai_credit_price_id),
    )


def stripe_plan_config(plan: str) -> dict[str, str | int]:
    if plan == "monthly":
        return {
            "plan": "monthly",
            "price_id": settings.stripe_monthly_price_id,
            "duration_days": max(settings.stripe_monthly_entitlement_days, 1),
            "label": "Vinaris monthly access",
        }
    if plan == "annual":
        return {
            "plan": "annual",
            "price_id": settings.stripe_annual_price_id or settings.stripe_price_id,
            "duration_days": max(settings.stripe_annual_entitlement_days or settings.stripe_entitlement_days, 1),
            "label": settings.stripe_payment_label or "Vinaris annual access",
        }
    if plan == "ai_credits":
        return {
            "plan": "ai_credits",
            "price_id": settings.stripe_ai_credit_price_id,
            "duration_days": 0,
            "label": settings.stripe_ai_credit_label or "Vinaris AI Pack",
        }
    raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid payment plan")


def stripe_ai_credit_amount() -> Decimal:
    try:
        amount = Decimal(str(settings.stripe_ai_credit_amount_usd))
    except (InvalidOperation, TypeError, ValueError) as exc:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="Stripe AI credit amount is invalid") from exc
    if amount <= ZERO_USD:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="Stripe AI credit amount is not configured")
    return quantize_usd(amount)


def stripe_checkout_payload(user: User, plan: str) -> dict[str, str]:
    plan_config = stripe_plan_config(plan)
    duration_days = int(plan_config["duration_days"])
    price_id = str(plan_config["price_id"] or "")
    ai_credit_amount = stripe_ai_credit_amount() if plan == "ai_credits" else ZERO_USD
    if plan == "ai_credits" and not price_id:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="Stripe AI credit price is not configured")
    payload = {
        "mode": "payment" if plan == "ai_credits" else ("subscription" if price_id else "payment"),
        "client_reference_id": str(user.id),
        "customer_email": user.email,
        "success_url": settings.stripe_success_url,
        "cancel_url": settings.stripe_cancel_url,
        "metadata[user_id]": str(user.id),
        "metadata[duration_days]": str(duration_days),
        "metadata[plan]": str(plan_config["plan"]),
        "metadata[ai_credit_amount_usd]": str(ai_credit_amount),
        "line_items[0][quantity]": "1",
    }
    if price_id:
        payload["line_items[0][price]"] = price_id
    else:
        if plan not in {"annual"}:
            raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="Stripe monthly price is not configured")
        amount = settings.stripe_payment_amount_cents
        if amount <= 0:
            raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="Stripe annual price is not configured")
        payload.update(
            {
                "line_items[0][price_data][currency]": settings.stripe_payment_currency.lower(),
                "line_items[0][price_data][unit_amount]": str(amount),
                "line_items[0][price_data][product_data][name]": str(plan_config["label"]),
            },
        )
    return payload


def create_stripe_checkout_session(user: User, plan: str) -> dict:
    if not settings.stripe_secret_key:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="Stripe is not configured")
    payload = urlencode(stripe_checkout_payload(user, plan)).encode("utf-8")
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


def create_stripe_portal_session(customer_id: str) -> dict:
    if not settings.stripe_secret_key:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="Stripe is not configured")
    payload = urlencode({"customer": customer_id, "return_url": settings.stripe_portal_return_url}).encode("utf-8")
    request = Request(
        settings.stripe_portal_url,
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
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=f"Stripe portal failed: {message}") from error
    except (URLError, TimeoutError) as error:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail="Stripe portal is unavailable") from error


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
    metadata = session.get("metadata") if isinstance(session.get("metadata"), dict) else {}
    plan = str(metadata.get("plan") or "annual")
    duration_days = int(metadata.get("duration_days") or stripe_plan_config(plan)["duration_days"])
    checkout = db.scalar(select(StripeCheckoutSession).where(StripeCheckoutSession.stripe_session_id == stripe_session_id))
    if checkout is None:
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
            stripe_subscription_id=session.get("subscription"),
            stripe_customer_id=session.get("customer"),
            plan=plan,
            duration_days=duration_days,
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
    checkout.plan = plan
    checkout.duration_days = duration_days
    checkout.stripe_subscription_id = session.get("subscription") or checkout.stripe_subscription_id
    checkout.stripe_customer_id = session.get("customer") or checkout.stripe_customer_id
    checkout.amount_total = session.get("amount_total") if session.get("amount_total") is not None else checkout.amount_total
    checkout.currency = session.get("currency") or checkout.currency
    checkout.completed_at = now_utc()
    if checkout.plan == "ai_credits":
        ai_credit_amount = stripe_ai_credit_amount()
        create_ai_credit_transaction(
            db,
            user,
            amount_usd=ai_credit_amount,
            source="purchase",
            source_id=checkout.id,
            note=f"Stripe AI Pack purchase ({ai_credit_amount} USD)",
        )
        create_user_notification(
            db,
            user,
            kind="ai_credits",
            title="AI Pack ricaricato",
            message=f"Sono stati aggiunti {ai_credit_amount} USD al tuo budget AI.",
            action_url="/settings/ai",
        )
    else:
        create_payment_redeem_code(db, user, label=f"Stripe {checkout.plan} access", duration_days=checkout.duration_days, checkout=checkout)


def complete_stripe_invoice(db: Session, invoice: dict) -> None:
    if invoice.get("paid") is False or invoice.get("status") not in (None, "paid"):
        return
    if invoice.get("billing_reason") == "subscription_create":
        return
    subscription_id = str(invoice.get("subscription") or "")
    if not subscription_id:
        return
    checkout = db.scalar(select(StripeCheckoutSession).where(StripeCheckoutSession.stripe_subscription_id == subscription_id))
    if checkout is None:
        return
    user = db.get(User, checkout.user_id)
    if user is None:
        return
    checkout.amount_total = invoice.get("amount_paid") if invoice.get("amount_paid") is not None else checkout.amount_total
    checkout.currency = invoice.get("currency") or checkout.currency
    create_payment_redeem_code(db, user, label=f"Stripe {checkout.plan} renewal", duration_days=checkout.duration_days)


def checkout_for_subscription(db: Session, subscription_id: str) -> StripeCheckoutSession | None:
    if not subscription_id:
        return None
    return db.scalar(
        select(StripeCheckoutSession)
        .where(StripeCheckoutSession.stripe_subscription_id == subscription_id)
        .order_by(StripeCheckoutSession.created_at.desc()),
    )


def notify_subscription_updated(db: Session, subscription: dict) -> None:
    checkout = checkout_for_subscription(db, str(subscription.get("id") or ""))
    if checkout is None:
        return
    checkout.subscription_status = subscription.get("status") or checkout.subscription_status
    checkout.cancel_at_period_end = bool(subscription.get("cancel_at_period_end"))
    user = db.get(User, checkout.user_id)
    if user is None:
        return
    if checkout.cancel_at_period_end:
        create_user_notification(
            db,
            user,
            kind="subscription",
            title="Abbonamento in disdetta",
            message="L'abbonamento restera attivo fino alla fine del periodo gia pagato.",
            action_url="/settings/profile",
        )


def notify_subscription_deleted(db: Session, subscription: dict) -> None:
    checkout = checkout_for_subscription(db, str(subscription.get("id") or ""))
    if checkout is None:
        return
    checkout.subscription_status = "canceled"
    checkout.cancel_at_period_end = False
    user = db.get(User, checkout.user_id)
    if user is None:
        return
    create_user_notification(
        db,
        user,
        kind="subscription",
        title="Abbonamento terminato",
        message="L'abbonamento Stripe e stato cancellato. I codici gia riscattati restano validi fino alla loro scadenza.",
        action_url="/settings/profile",
    )


def notify_payment_failed(db: Session, invoice: dict) -> None:
    subscription_id = str(invoice.get("subscription") or "")
    checkout = checkout_for_subscription(db, subscription_id)
    if checkout is None:
        return
    user = db.get(User, checkout.user_id)
    if user is None:
        return
    create_user_notification(
        db,
        user,
        kind="payment_failed",
        title="Pagamento non riuscito",
        message="Stripe non ha potuto incassare il rinnovo. Verifica il metodo di pagamento.",
        action_url="/settings/profile",
    )


@router.get("/status", response_model=BillingStatusResponse)
def get_billing_status(
    context: CurrentContext = Depends(get_authenticated_context),
    db: Session = Depends(get_db),
) -> BillingStatusResponse:
    return billing_status(db, context.user)


@router.post("/checkout", response_model=CheckoutSessionResponse)
def create_checkout_session(
    payload: CheckoutSessionCreate,
    context: CurrentContext = Depends(get_authenticated_context),
    db: Session = Depends(get_db),
) -> CheckoutSessionResponse:
    plan_config = stripe_plan_config(payload.plan)
    session = create_stripe_checkout_session(context.user, payload.plan)
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
                stripe_subscription_id=session.get("subscription"),
                stripe_customer_id=session.get("customer"),
                plan=payload.plan,
                duration_days=int(plan_config["duration_days"]),
                amount_total=session.get("amount_total"),
                currency=session.get("currency"),
            ),
        )
        db.commit()
    return CheckoutSessionResponse(checkout_url=checkout_url, stripe_session_id=stripe_session_id, plan=payload.plan)


@router.post("/portal", response_model=BillingPortalResponse)
def create_billing_portal_session(
    context: CurrentContext = Depends(get_authenticated_context),
    db: Session = Depends(get_db),
) -> BillingPortalResponse:
    checkout = db.scalar(
        select(StripeCheckoutSession)
        .where(
            StripeCheckoutSession.user_id == context.user.id,
            StripeCheckoutSession.stripe_customer_id.is_not(None),
        )
        .order_by(StripeCheckoutSession.created_at.desc()),
    )
    if checkout is None or not checkout.stripe_customer_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="No Stripe customer found for this user")
    portal = create_stripe_portal_session(checkout.stripe_customer_id)
    portal_url = str(portal.get("url") or "")
    if not portal_url:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail="Stripe did not return a portal URL")
    return BillingPortalResponse(portal_url=portal_url)


@router.post("/stripe/webhook", status_code=status.HTTP_204_NO_CONTENT)
async def stripe_webhook(
    request: FastAPIRequest,
    stripe_signature: str | None = Header(default=None, alias="Stripe-Signature"),
    db: Session = Depends(get_db),
) -> Response:
    payload = await request.body()
    verify_stripe_signature(payload, stripe_signature)
    event = json.loads(payload.decode("utf-8"))
    event_id = str(event.get("id") or "")
    if not event_id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Missing Stripe event id")
    if db.scalar(select(StripeWebhookEvent).where(StripeWebhookEvent.stripe_event_id == event_id)) is not None:
        return Response(status_code=status.HTTP_204_NO_CONTENT)
    db.add(StripeWebhookEvent(stripe_event_id=event_id, event_type=str(event.get("type") or "")))
    event_type = event.get("type")
    if event_type == "checkout.session.completed":
        session = event.get("data", {}).get("object", {})
        if isinstance(session, dict):
            complete_stripe_checkout(db, session)
    elif event_type == "invoice.paid":
        invoice = event.get("data", {}).get("object", {})
        if isinstance(invoice, dict):
            complete_stripe_invoice(db, invoice)
    elif event_type == "invoice.payment_failed":
        invoice = event.get("data", {}).get("object", {})
        if isinstance(invoice, dict):
            notify_payment_failed(db, invoice)
    elif event_type == "customer.subscription.updated":
        subscription = event.get("data", {}).get("object", {})
        if isinstance(subscription, dict):
            notify_subscription_updated(db, subscription)
    elif event_type == "customer.subscription.deleted":
        subscription = event.get("data", {}).get("object", {})
        if isinstance(subscription, dict):
            notify_subscription_deleted(db, subscription)
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
