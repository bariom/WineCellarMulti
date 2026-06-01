from __future__ import annotations

import secrets
import string
from datetime import datetime, timedelta, timezone
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import CurrentContext, active_entitlement_valid_until, get_authenticated_context, require_app_admin_context
from app.core.crypto import decrypt_secret, encrypt_secret
from app.core.security import hash_redeem_code
from app.db.session import get_db
from app.models import RedeemCode, RedeemRedemption, User, UserEntitlement
from app.schemas.billing import BillingStatusResponse, EntitlementResponse, RedeemCodeCreate, RedeemCodeResponse, RedeemRequest


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


@router.get("/status", response_model=BillingStatusResponse)
def get_billing_status(
    context: CurrentContext = Depends(get_authenticated_context),
    db: Session = Depends(get_db),
) -> BillingStatusResponse:
    return billing_status(db, context.user)


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
    _: CurrentContext = Depends(require_app_admin_context),
    db: Session = Depends(get_db),
) -> Response:
    code = db.get(RedeemCode, code_id)
    if code is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Redeem code not found")
    if code.redeemed_count > 0:
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
