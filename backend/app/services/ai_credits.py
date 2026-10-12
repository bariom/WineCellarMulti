from __future__ import annotations

from datetime import datetime
from decimal import Decimal
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.models import User, UserAiCreditTransaction
from app.services.ambassador import is_ambassador

ZERO_USD = Decimal("0.000000")


def quantize_usd(value: Decimal) -> Decimal:
    return value.quantize(Decimal("0.000001"))


def ai_credit_balance(db: Session, user: User, *, wallet: str | None = None) -> Decimal:
    wallets = [wallet] if wallet is not None else ["standard"]
    if wallet is None and is_ambassador(user) and user.ambassador_credit_wallet:
        wallets.append(user.ambassador_credit_wallet)
    entries = db.scalars(
        select(UserAiCreditTransaction).where(
            UserAiCreditTransaction.user_id == user.id, UserAiCreditTransaction.wallet.in_(wallets)
        )
    )
    total = sum((entry.amount_usd or ZERO_USD for entry in entries), ZERO_USD)
    return quantize_usd(total)


def create_ai_credit_transaction(
    db: Session,
    user: User,
    *,
    amount_usd: Decimal,
    source: str,
    source_id: UUID | None = None,
    note: str = "",
    created_at: datetime | None = None,
    wallet: str = "standard",
) -> UserAiCreditTransaction:
    entry = UserAiCreditTransaction(
        user_id=user.id,
        amount_usd=quantize_usd(amount_usd),
        wallet=wallet,
        source=source,
        source_id=source_id,
        note=note,
        created_at=created_at or datetime.utcnow(),
    )
    db.add(entry)
    return entry


def configured_signup_ai_credit() -> Decimal:
    try:
        amount = Decimal(str(settings.signup_ai_credit_usd))
    except Exception as exc:
        raise ValueError("signup_ai_credit_usd is invalid") from exc
    if amount <= ZERO_USD:
        return ZERO_USD
    return quantize_usd(amount)


def set_ai_credit_balance(
    db: Session,
    user: User,
    *,
    target_balance_usd: Decimal,
    source: str,
    source_id: UUID | None = None,
    note: str = "",
    created_at: datetime | None = None,
    wallet: str = "standard",
) -> UserAiCreditTransaction | None:
    target = quantize_usd(target_balance_usd)
    current = ai_credit_balance(db, user, wallet=wallet)
    delta = quantize_usd(target - current)
    if delta == ZERO_USD:
        return None
    return create_ai_credit_transaction(
        db,
        user,
        amount_usd=delta,
        source=source,
        source_id=source_id,
        note=note,
        created_at=created_at,
        wallet=wallet,
    )


def create_ai_usage_transaction(
    db: Session, user: User, *, amount_usd: Decimal, source: str, source_id: UUID, note: str
) -> None:
    """Spend promotional credit first; return refunds to their original wallets."""
    remaining = abs(amount_usd)
    if amount_usd < 0:
        wallets = ["standard"]
        if is_ambassador(user) and user.ambassador_credit_wallet:
            wallets.insert(0, user.ambassador_credit_wallet)
        for wallet in wallets:
            portion = min(remaining, max(ai_credit_balance(db, user, wallet=wallet), ZERO_USD))
            if portion > ZERO_USD:
                create_ai_credit_transaction(
                    db,
                    user,
                    amount_usd=-portion,
                    source=source,
                    source_id=source_id,
                    note=note,
                    wallet=wallet,
                )
                remaining -= portion
    else:
        entries = list(
            db.scalars(
                select(UserAiCreditTransaction).where(
                    UserAiCreditTransaction.user_id == user.id,
                    UserAiCreditTransaction.source_id == source_id,
                    UserAiCreditTransaction.source.in_(["usage_reservation", "usage_refund"]),
                )
            )
        )
        # Standard credit was spent last, so refund it first.
        wallets = sorted({entry.wallet for entry in entries}, key=lambda value: value != "standard")
        for wallet in wallets:
            outstanding = -sum(
                (entry.amount_usd for entry in entries if entry.wallet == wallet), ZERO_USD
            )
            portion = min(remaining, max(outstanding, ZERO_USD))
            if portion > ZERO_USD:
                create_ai_credit_transaction(
                    db,
                    user,
                    amount_usd=portion,
                    source=source,
                    source_id=source_id,
                    note=note,
                    wallet=wallet,
                )
                remaining -= portion
    if remaining > ZERO_USD:
        raise ValueError("AI usage transaction exceeds available wallet funds")
