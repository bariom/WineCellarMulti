"""Time-limited promotional access, independent of administrative roles."""

from datetime import UTC, datetime

from app.models import User


def ambassador_expiry(user: User) -> datetime | None:
    value = user.ambassador_until
    if value is None:
        return None
    return value.replace(tzinfo=UTC) if value.tzinfo is None else value.astimezone(UTC)


def ambassador_valid_until(user: User) -> datetime | None:
    value = ambassador_expiry(user)
    return value if value is not None and value > datetime.now(UTC) else None


def is_ambassador(user: User) -> bool:
    return ambassador_valid_until(user) is not None
