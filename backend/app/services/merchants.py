from __future__ import annotations

import unicodedata

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import CurrentContext
from app.models import Merchant


def canonical_merchant_name(value: str) -> str:
    return " ".join(value.strip().split())[:160]


def merchant_normalized_name(value: str) -> str:
    canonical = unicodedata.normalize("NFKD", canonical_merchant_name(value).casefold())
    return "".join(character for character in canonical if not unicodedata.combining(character))


def get_or_create_merchant(db: Session, context: CurrentContext, value: str) -> str:
    """Return the canonical display name and register a new merchant when needed."""
    name = canonical_merchant_name(value)
    if not name:
        return ""
    normalized_name = merchant_normalized_name(name)
    merchant = db.scalar(
        select(Merchant).where(
            Merchant.household_id == context.household.id,
            Merchant.normalized_name == normalized_name,
        )
    )
    if merchant is not None:
        return merchant.name
    db.add(
        Merchant(
            household_id=context.household.id,
            created_by_user_id=context.user.id,
            name=name,
            normalized_name=normalized_name,
        )
    )
    return name
