from __future__ import annotations

import math
from datetime import UTC, date, datetime, timedelta

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import CurrentContext
from app.models import User, UserNotification, UserNotificationDismissal, Wine, WineTastingEntry

# Bottles drunk in this window without stars get a gentle "how was it?" reminder:
# from yesterday, so the evening is over, back to a week, while it is still fresh.
RATING_REMINDER_DAYS = 7

DELIVERED_STATUSES = {
    "delivered",
    "consegnato",
    "bevuto",
    "consumed",
    "cancelled",
    "canceled",
    "annullato",
}


def now_utc() -> datetime:
    return datetime.now(UTC)


def as_aware_utc(value: datetime) -> datetime:
    return value.replace(tzinfo=UTC) if value.tzinfo is None else value.astimezone(UTC)


def has_vintage_for_drink_window(wine: Wine) -> bool:
    vintage = (wine.vintage or "").strip().lower()
    if not vintage:
        return False
    if vintage in {"nv", "mv", "sans vintage", "non vintage", "multi vintage"}:
        return False
    return any(character.isdigit() for character in vintage)


def is_future_delivery_wine(wine: Wine, today: date) -> bool:
    if wine.expected_delivery is None or wine.expected_delivery < today:
        return False
    status = (wine.status or "").strip().lower()
    return not any(value in status for value in DELIVERED_STATUSES)


IN_CELLAR_STATUSES = {"delivered", "consegnato", "in_cellar", "in cellar", "in cantina"}


def is_missed_delivery_wine(wine: Wine, today: date) -> bool:
    """Expected before today but neither received, waiting for pickup nor closed.

    Mirrors the timeline's "Consegna mancata": a delivery due today is not late yet.
    """
    if wine.expected_delivery is None or wine.expected_delivery >= today:
        return False
    status = (wine.status or "").strip().lower()
    if status in IN_CELLAR_STATUSES or is_to_collect_wine(wine):
        return False
    return not any(value in status for value in DELIVERED_STATUSES)


def is_to_collect_wine(wine: Wine) -> bool:
    status = (wine.status or "").strip().lower()
    return any(value in status for value in ("collect", "pickup", "ritir"))


def to_collect_summary(wines: list[Wine]) -> tuple[str, str]:
    ordered_wines = sorted(
        wines,
        key=lambda wine: (
            (wine.merchant or "").strip().lower(),
            (wine.producer or "").strip().lower(),
            (wine.name or "").strip().lower(),
            (wine.vintage or "").strip().lower(),
        ),
    )
    preview = ordered_wines[:2]
    summary_parts: list[str] = []
    fingerprint_parts: list[str] = []
    for wine in preview:
        merchant = (wine.merchant or "").strip()
        wine_label = (
            " ".join(part for part in [wine.name.strip(), wine.vintage.strip()] if part).strip()
            or "Wine"
        )
        if merchant:
            summary_parts.append(f"{wine_label} ({merchant})")
            fingerprint_parts.append(f"{wine_label}|{merchant}")
        else:
            summary_parts.append(wine_label)
            fingerprint_parts.append(wine_label)
    remaining = max(len(ordered_wines) - len(preview), 0)
    if remaining:
        summary_parts.append(f"+{remaining}")
    return ", ".join(summary_parts), ";".join(fingerprint_parts)


def recent_unrated_tastings(
    db: Session, context: CurrentContext, today: date
) -> list[tuple[WineTastingEntry, Wine]]:
    """The user's own bottles drunk from yesterday back to a week, still without stars."""
    return [
        (tasting, wine)
        for tasting, wine in db.execute(
            select(WineTastingEntry, Wine)
            .join(Wine, Wine.id == WineTastingEntry.wine_id)
            .where(
                WineTastingEntry.household_id == context.household.id,
                Wine.household_id == context.household.id,
                WineTastingEntry.created_by_user_id == context.user.id,
                WineTastingEntry.rating <= 0,
                WineTastingEntry.consumed_at <= today - timedelta(days=1),
                WineTastingEntry.consumed_at >= today - timedelta(days=RATING_REMINDER_DAYS),
            )
            .order_by(WineTastingEntry.consumed_at.desc(), WineTastingEntry.id)
        )
    ]


def create_user_notification(
    db: Session,
    user: User,
    *,
    kind: str,
    title: str,
    message: str,
    action_url: str | None = None,
    fingerprint: str | None = None,
) -> UserNotification | None:
    if fingerprint:
        dismissed = db.scalar(
            select(UserNotificationDismissal.id).where(
                UserNotificationDismissal.user_id == user.id,
                UserNotificationDismissal.fingerprint == fingerprint,
            )
        )
        if dismissed is not None:
            return None
        existing = db.scalar(
            select(UserNotification).where(
                UserNotification.user_id == user.id,
                UserNotification.fingerprint == fingerprint,
            )
        )
        if existing is not None:
            return existing
    notification = UserNotification(
        user_id=user.id,
        kind=kind,
        title=title,
        message=message,
        action_url=action_url,
        fingerprint=fingerprint,
    )
    db.add(notification)
    return notification


def _notification_copy(locale: str, key: str, **values: object) -> tuple[str, str]:
    italian = locale.lower().startswith("it")
    if key == "drink_now":
        if italian:
            return (
                "Promemoria cantina",
                f"Hai {values['count']} vini da bere ora in {values['household_name']}.",
            )
        return (
            "Cellar reminder",
            f"You have {values['count']} wines ready to drink in {values['household_name']}.",
        )
    if key == "past_window":
        if italian:
            return (
                "Finestra scaduta",
                f"Ci sono {values['count']} vini oltre la finestra ideale "
                f"in {values['household_name']}.",
            )
        return (
            "Past peak window",
            f"There are {values['count']} wines past their ideal window "
            f"in {values['household_name']}.",
        )
    if key == "future_deliveries":
        if italian:
            return (
                "Consegne in arrivo",
                f"Hai {values['count']} consegne future. "
                f"La prossima e prevista per il {values['next_date']}.",
            )
        return (
            "Upcoming deliveries",
            f"You have {values['count']} future deliveries. "
            f"The next one is expected on {values['next_date']}.",
        )
    if key == "rate_tastings":
        if values["count"] == 1:
            if italian:
                return (
                    "Com'era?",
                    f"Dai un voto a {values['wine_summary']}, bevuto il {values['date']}. "
                    "Anche un voto tiepido rende più precisi i consigli.",
                )
            return (
                "How was it?",
                f"Rate {values['wine_summary']}, drunk on {values['date']}. "
                "Even a lukewarm rating makes recommendations more precise.",
            )
        if italian:
            return (
                "Bevute da valutare",
                f"Hai {values['count']} bevute senza voto: {values['wine_summary']}. "
                "Anche un voto tiepido rende più precisi i consigli.",
            )
        return (
            "Bottles to rate",
            f"You have {values['count']} bottles without a rating: {values['wine_summary']}. "
            "Even a lukewarm rating makes recommendations more precise.",
        )
    if key == "missed_deliveries":
        if values["count"] == 1:
            if italian:
                return (
                    "Consegna mancata",
                    f"La consegna di {values['wine_summary']} era attesa "
                    f"per il {values['due_date']} e non risulta ancora consegnata.",
                )
            return (
                "Missed delivery",
                f"The delivery of {values['wine_summary']} was expected on {values['due_date']} "
                "and has not been delivered yet.",
            )
        if italian:
            return (
                "Consegne mancate",
                f"{values['count']} consegne previste non risultano ancora arrivate "
                f"in {values['household_name']}: {values['wine_summary']}.",
            )
        return (
            "Missed deliveries",
            f"{values['count']} expected deliveries have not arrived yet "
            f"in {values['household_name']}: {values['wine_summary']}.",
        )
    if key == "to_collect":
        if italian:
            return (
                "Bottiglie da ritirare",
                f"Hai {values['count']} vini in stato Da ritirare "
                f"in {values['household_name']}: {values['wine_summary']}.",
            )
        return (
            "Bottles to collect",
            f"You have {values['count']} wines marked To Collect "
            f"in {values['household_name']}: {values['wine_summary']}.",
        )
    if key == "entitlement_expiring":
        if italian:
            return (
                "Accesso in scadenza",
                f"Il tuo accesso scade tra {values['days']} giorni, il {values['valid_until']}.",
            )
        return (
            "Access expiring",
            f"Your access expires in {values['days']} days, on {values['valid_until']}.",
        )
    raise ValueError(f"Unsupported notification copy key: {key}")


def ensure_smart_notifications(db: Session, context: CurrentContext) -> int:
    created = 0
    locale = context.user.locale or "it"
    today = now_utc().date()
    current_year = today.year

    wines = list(
        db.scalars(
            select(Wine).where(
                Wine.household_id == context.household.id,
                Wine.quantity > 0,
            )
        )
    )

    if wines:
        drink_now_count = sum(
            1
            for wine in wines
            if wine.drink_from
            and wine.drink_to
            and wine.drink_from <= current_year <= wine.drink_to
        )
        if drink_now_count:
            title, message = _notification_copy(
                locale,
                "drink_now",
                count=drink_now_count,
                household_name=context.household.name,
            )
            before = db.scalar(
                select(UserNotification.id).where(
                    UserNotification.user_id == context.user.id,
                    UserNotification.fingerprint
                    == f"smart:{context.household.id}:drink_now:{drink_now_count}",
                )
            )
            create_user_notification(
                db,
                context.user,
                kind="smart_drink_now",
                title=title,
                message=message,
                action_url="/home",
                fingerprint=f"smart:{context.household.id}:drink_now:{drink_now_count}",
            )
            created += 0 if before else 1

        past_window_count = sum(
            1
            for wine in wines
            if wine.drink_to and wine.drink_to < current_year and has_vintage_for_drink_window(wine)
        )
        if past_window_count:
            title, message = _notification_copy(
                locale,
                "past_window",
                count=past_window_count,
                household_name=context.household.name,
            )
            before = db.scalar(
                select(UserNotification.id).where(
                    UserNotification.user_id == context.user.id,
                    UserNotification.fingerprint
                    == f"smart:{context.household.id}:past_window:{past_window_count}",
                )
            )
            create_user_notification(
                db,
                context.user,
                kind="smart_past_window",
                title=title,
                message=message,
                action_url="/home",
                fingerprint=f"smart:{context.household.id}:past_window:{past_window_count}",
            )
            created += 0 if before else 1

        future_deliveries = sorted(
            [wine for wine in wines if is_future_delivery_wine(wine, today)],
            key=lambda wine: wine.expected_delivery or date.max,
        )
        if future_deliveries:
            next_delivery = future_deliveries[0].expected_delivery
            days_until_next = (next_delivery - today).days if next_delivery is not None else None
            if next_delivery is not None and days_until_next is not None and days_until_next <= 30:
                title, message = _notification_copy(
                    locale,
                    "future_deliveries",
                    count=len(future_deliveries),
                    next_date=next_delivery.strftime("%d/%m/%Y"),
                )
                fingerprint = (
                    f"smart:{context.household.id}:future_deliveries:"
                    f"{len(future_deliveries)}:{next_delivery.isoformat()}"
                )
                before = db.scalar(
                    select(UserNotification.id).where(
                        UserNotification.user_id == context.user.id,
                        UserNotification.fingerprint == fingerprint,
                    )
                )
                create_user_notification(
                    db,
                    context.user,
                    kind="smart_future_deliveries",
                    title=title,
                    message=message,
                    action_url="/home",
                    fingerprint=fingerprint,
                )
                created += 0 if before else 1

        missed_deliveries = sorted(
            [wine for wine in wines if is_missed_delivery_wine(wine, today)],
            key=lambda wine: wine.expected_delivery or date.min,
        )
        if missed_deliveries:
            latest_due = missed_deliveries[-1].expected_delivery or today
            wine_summary, _ = to_collect_summary(missed_deliveries)
            title, message = _notification_copy(
                locale,
                "missed_deliveries",
                count=len(missed_deliveries),
                household_name=context.household.name,
                wine_summary=wine_summary,
                due_date=latest_due.strftime("%d/%m/%Y"),
            )
            # A new late order (or a different set of them) notifies again; the
            # same unchanged backlog does not.
            fingerprint = (
                f"smart:{context.household.id}:missed_deliveries:"
                f"{len(missed_deliveries)}:{latest_due.isoformat()}"
            )
            before = db.scalar(
                select(UserNotification.id).where(
                    UserNotification.user_id == context.user.id,
                    UserNotification.fingerprint == fingerprint,
                )
            )
            create_user_notification(
                db,
                context.user,
                kind="smart_missed_deliveries",
                title=title,
                message=message,
                action_url="/home?focus=timeline",
                fingerprint=fingerprint,
            )
            created += 0 if before else 1

        to_collect_wines = [wine for wine in wines if is_to_collect_wine(wine)]
        if to_collect_wines:
            to_collect_count = len(to_collect_wines)
            wine_summary, fingerprint_summary = to_collect_summary(to_collect_wines)
            title, message = _notification_copy(
                locale,
                "to_collect",
                count=to_collect_count,
                household_name=context.household.name,
                wine_summary=wine_summary,
            )
            fingerprint = (
                f"smart:{context.household.id}:to_collect:{to_collect_count}:{fingerprint_summary}"
            )
            before = db.scalar(
                select(UserNotification.id).where(
                    UserNotification.user_id == context.user.id,
                    UserNotification.fingerprint == fingerprint,
                )
            )
            create_user_notification(
                db,
                context.user,
                kind="smart_to_collect",
                title=title,
                message=message,
                action_url="/cellar",
                fingerprint=fingerprint,
            )
            created += 0 if before else 1

    unrated = recent_unrated_tastings(db, context, today)
    if unrated:
        latest_tasting, _ = unrated[0]
        wine_summary = ", ".join(
            " ".join(part for part in [wine.name.strip(), wine.vintage.strip()] if part) or "Wine"
            for _, wine in unrated[:2]
        ) + (f" +{len(unrated) - 2}" if len(unrated) > 2 else "")
        title, message = _notification_copy(
            locale,
            "rate_tastings",
            count=len(unrated),
            wine_summary=wine_summary,
            date=latest_tasting.consumed_at.strftime("%d/%m/%Y"),
        )
        # A new unrated bottle produces a new reminder; the same backlog does not.
        fingerprint = (
            f"smart:{context.household.id}:rate_tastings:{len(unrated)}:{latest_tasting.id}"
        )
        before = db.scalar(
            select(UserNotification.id).where(
                UserNotification.user_id == context.user.id,
                UserNotification.fingerprint == fingerprint,
            )
        )
        create_user_notification(
            db,
            context.user,
            kind="smart_rate_tastings",
            title=title,
            message=message,
            action_url="/history?section=tastings",
            fingerprint=fingerprint,
        )
        created += 0 if before else 1

    if not context.user.is_app_admin and context.entitlement_valid_until is not None:
        valid_until = as_aware_utc(context.entitlement_valid_until)
        days_remaining = max(math.ceil((valid_until - now_utc()).total_seconds() / 86400), 0)
        if days_remaining <= 7:
            title, message = _notification_copy(
                locale,
                "entitlement_expiring",
                days=days_remaining,
                valid_until=valid_until.strftime("%d/%m/%Y"),
            )
            fingerprint = f"smart:entitlement:{valid_until.date().isoformat()}"
            before = db.scalar(
                select(UserNotification.id).where(
                    UserNotification.user_id == context.user.id,
                    UserNotification.fingerprint == fingerprint,
                )
            )
            create_user_notification(
                db,
                context.user,
                kind="smart_entitlement_expiring",
                title=title,
                message=message,
                action_url="/settings/profile",
                fingerprint=fingerprint,
            )
            created += 0 if before else 1

    return created
