from __future__ import annotations

from datetime import datetime
from decimal import Decimal
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.models import User, UserAiCreditTransaction


ZERO_USD = Decimal("0.000000")


def quantize_usd(value: Decimal) -> Decimal:
    return value.quantize(Decimal("0.000001"))


def ai_credit_balance(db: Session, user: User) -> Decimal:
    entries = db.scalars(select(UserAiCreditTransaction).where(UserAiCreditTransaction.user_id == user.id))
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
) -> UserAiCreditTransaction:
    entry = UserAiCreditTransaction(
        user_id=user.id,
        amount_usd=quantize_usd(amount_usd),
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
) -> UserAiCreditTransaction | None:
    target = quantize_usd(target_balance_usd)
    current = ai_credit_balance(db, user)
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
    )
