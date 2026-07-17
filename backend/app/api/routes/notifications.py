from datetime import UTC, datetime
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.api.deps import CurrentContext, get_authenticated_context
from app.db.session import get_db
from app.models import (
    CoOwnershipAgreement,
    Household,
    HouseholdInvite,
    User,
    UserNotification,
    UserNotificationDismissal,
    Wine,
    WineShareOffer,
)
from app.schemas.notification import (
    NotificationCenterCounts,
    NotificationCenterItem,
    NotificationCenterResponse,
    NotificationResponse,
)
from app.services.notifications import ensure_smart_notifications

router = APIRouter(prefix="/notifications")

ACTION_NOTIFICATION_KINDS = {
    "coownership_agreement",
    "new_user_registration",
    "payment_failed",
    "share_revocation",
    "smart_to_collect",
}
UPDATE_NOTIFICATION_KINDS = {
    "coownership_response",
    "household_invite_accepted",
    "share_offer_response",
    "share_revocation_result",
}


def notification_category(kind: str) -> str:
    if kind in ACTION_NOTIFICATION_KINDS:
        return "action"
    if kind in UPDATE_NOTIFICATION_KINDS:
        return "update"
    return "system"


def notification_response(db: Session, notification: UserNotification) -> NotificationResponse:
    action_url = notification.action_url
    if (
        notification.kind == "coownership_response"
        and "wine_id=" not in (action_url or "")
        and notification.fingerprint
    ):
        fingerprint_parts = notification.fingerprint.split(":")
        if len(fingerprint_parts) >= 2:
            try:
                agreement = db.get(CoOwnershipAgreement, UUID(fingerprint_parts[1]))
            except ValueError:
                agreement = None
            if agreement is not None:
                action_url = f"/cellar?wine_id={agreement.wine_id}&section=coownership"
    return NotificationResponse(
        id=notification.id,
        kind=notification.kind,
        title=notification.title,
        message=notification.message,
        action_url=action_url,
        created_at=notification.created_at,
        read_at=notification.read_at,
        archived_at=notification.archived_at,
    )


def permanently_delete_notification(
    db: Session,
    notification: UserNotification,
) -> None:
    if notification.fingerprint:
        dismissal = db.scalar(
            select(UserNotificationDismissal).where(
                UserNotificationDismissal.user_id == notification.user_id,
                UserNotificationDismissal.fingerprint == notification.fingerprint,
            )
        )
        if dismissal is None:
            db.add(
                UserNotificationDismissal(
                    user_id=notification.user_id,
                    fingerprint=notification.fingerprint,
                )
            )
    db.delete(notification)


@router.get("", response_model=list[NotificationResponse])
def list_notifications(
    include_read: bool = False,
    context: CurrentContext = Depends(get_authenticated_context),
    db: Session = Depends(get_db),
) -> list[NotificationResponse]:
    if ensure_smart_notifications(db, context):
        db.commit()
    query = select(UserNotification).where(
        UserNotification.user_id == context.user.id,
        UserNotification.archived_at.is_(None),
    )
    if not include_read:
        query = query.where(UserNotification.read_at.is_(None))
    notifications = db.scalars(query.order_by(UserNotification.created_at.desc(), UserNotification.id.desc()))
    return [notification_response(db, notification) for notification in notifications]


@router.get("/center", response_model=NotificationCenterResponse)
def notification_center(
    category: str | None = Query(default=None, pattern="^(action|update|system)$"),
    view: str = Query(default="active", pattern="^(active|archived)$"),
    item_state: str = Query(default="all", pattern="^(all|unread|read)$"),
    offset: int = Query(default=0, ge=0),
    limit: int = Query(default=20, ge=1, le=50),
    context: CurrentContext = Depends(get_authenticated_context),
    db: Session = Depends(get_db),
) -> NotificationCenterResponse:
    if view == "active" and ensure_smart_notifications(db, context):
        db.commit()

    categorized_kinds = ACTION_NOTIFICATION_KINDS | UPDATE_NOTIFICATION_KINDS

    def category_conditions(value: str | None) -> list[object]:
        if value == "action":
            return [UserNotification.kind.in_(ACTION_NOTIFICATION_KINDS)]
        if value == "update":
            return [UserNotification.kind.in_(UPDATE_NOTIFICATION_KINDS)]
        if value == "system":
            return [UserNotification.kind.not_in(categorized_kinds)]
        return []

    base_conditions = [UserNotification.user_id == context.user.id]
    base_conditions.append(
        UserNotification.archived_at.is_not(None)
        if view == "archived"
        else UserNotification.archived_at.is_(None)
    )
    if item_state == "unread":
        base_conditions.append(UserNotification.read_at.is_(None))
    elif item_state == "read":
        base_conditions.append(UserNotification.read_at.is_not(None))

    virtual_items: list[NotificationCenterItem] = []
    pending_total = 0
    if view == "active" and item_state != "read":
        pending_total = int(
            db.scalar(
                select(func.count())
                .select_from(HouseholdInvite)
                .where(
                    HouseholdInvite.email == context.user.email.lower(),
                    HouseholdInvite.accepted_at.is_(None),
                    HouseholdInvite.expires_at > datetime.now(UTC),
                )
            )
            or 0
        ) + int(
            db.scalar(
                select(func.count())
                .select_from(WineShareOffer)
                .where(
                    WineShareOffer.recipient_user_id == context.user.id,
                    WineShareOffer.status == "pending",
                )
            )
            or 0
        )
    include_pending = (
        view == "active" and item_state != "read" and category in (None, "action") and offset == 0
    )
    now = datetime.now(UTC)
    italian = (context.user.locale or "it").lower().startswith("it")
    if include_pending:
        invite_rows = db.execute(
            select(HouseholdInvite, Household, User)
            .join(Household, Household.id == HouseholdInvite.household_id)
            .join(User, User.id == HouseholdInvite.invited_by_user_id)
            .where(
                HouseholdInvite.email == context.user.email.lower(),
                HouseholdInvite.accepted_at.is_(None),
                HouseholdInvite.expires_at > now,
            )
        ).all()
        for invite, household, inviter in invite_rows:
            actor = inviter.display_name or inviter.email
            virtual_items.append(
                NotificationCenterItem(
                    id=f"invite:{invite.id}",
                    source="household_invite",
                    kind="household_invite",
                    category="action",
                    state="pending",
                    title=(
                        f"Invito a {household.name}"
                        if italian
                        else f"Invitation to {household.name}"
                    ),
                    message=(
                        f"{actor} ti invita con ruolo {invite.role}."
                        if italian
                        else f"{actor} invited you with the {invite.role} role."
                    ),
                    action_kind="accept_invite",
                    resource_id=invite.id,
                    actor_label=actor,
                    created_at=invite.created_at,
                    metadata={
                        "household_name": household.name,
                        "role": invite.role,
                        "visibility_scope": invite.visibility_scope,
                        "expires_at": invite.expires_at.isoformat(),
                    },
                )
            )

        share_rows = db.execute(
            select(WineShareOffer, Wine, User)
            .join(Wine, Wine.id == WineShareOffer.wine_id)
            .join(User, User.id == WineShareOffer.created_by_user_id)
            .where(
                WineShareOffer.recipient_user_id == context.user.id,
                WineShareOffer.status == "pending",
            )
        ).all()
        for offer, wine, sender in share_rows:
            actor = sender.display_name or sender.email
            wine_label = " ".join(part for part in (wine.name, wine.vintage) if part).strip()
            virtual_items.append(
                NotificationCenterItem(
                    id=f"share-offer:{offer.id}",
                    source="share_offer",
                    kind="share_offer",
                    category="action",
                    state="pending",
                    title=wine_label,
                    message=(
                        f"{actor} propone una condivisione del {offer.share_pct}%."
                        if italian
                        else f"{actor} proposes a {offer.share_pct}% shared position."
                    ),
                    action_kind="decide_share_offer",
                    resource_id=offer.id,
                    actor_label=actor,
                    created_at=offer.created_at,
                    metadata={
                        "wine_id": str(wine.id),
                        "wine_name": wine.name,
                        "wine_vintage": wine.vintage,
                        "share_pct": str(offer.share_pct),
                        "sender_email": sender.email,
                        "message": offer.message,
                    },
                )
            )

    virtual_items.sort(key=lambda item: item.created_at, reverse=True)
    virtual_items = virtual_items[:limit]
    persisted_limit = max(limit - len(virtual_items), 0)
    persisted_query = (
        select(UserNotification)
        .where(*base_conditions, *category_conditions(category))
        .order_by(UserNotification.created_at.desc(), UserNotification.id.desc())
        .offset(offset)
        .limit(persisted_limit + 1)
    )
    persisted_rows = list(db.scalars(persisted_query)) if persisted_limit else []
    has_more = len(persisted_rows) > persisted_limit
    persisted = persisted_rows[:persisted_limit]
    persisted_items = [
        NotificationCenterItem(
            id=str(notification.id),
            source="notification",
            kind=notification.kind,
            category=notification_category(notification.kind),
            state=(
                "archived"
                if notification.archived_at is not None
                else "read"
                if notification.read_at is not None
                else "unread"
            ),
            title=notification.title,
            message=notification.message,
            action_url=notification_response(db, notification).action_url,
            action_kind=(
                "decide_share_revocation" if notification.kind == "share_revocation" else "open"
            ),
            created_at=notification.created_at,
            read_at=notification.read_at,
            archived_at=notification.archived_at,
        )
        for notification in persisted
    ]
    items = sorted(
        [*virtual_items, *persisted_items],
        key=lambda item: item.created_at,
        reverse=True,
    )

    def persisted_count(value: str | None, *, unread_only: bool = False) -> int:
        conditions = [*base_conditions, *category_conditions(value)]
        if unread_only and item_state == "all":
            conditions.append(UserNotification.read_at.is_(None))
        return int(
            db.scalar(select(func.count()).select_from(UserNotification).where(*conditions)) or 0
        )

    actions = persisted_count("action") + pending_total
    updates = persisted_count("update")
    system = persisted_count("system")
    unread = persisted_count(None, unread_only=True)
    attention = (
        actions
        + persisted_count("update", unread_only=True)
        + persisted_count("system", unread_only=True)
    )
    return NotificationCenterResponse(
        items=items,
        counts=NotificationCenterCounts(
            total=actions + updates + system,
            unread=unread,
            actionable=actions if view == "active" else 0,
            attention=attention if view == "active" else 0,
            actions=actions,
            updates=updates,
            system=system,
        ),
        offset=offset,
        next_offset=offset + len(persisted) if has_more else None,
        has_more=has_more,
    )


@router.post("/read-all", status_code=status.HTTP_204_NO_CONTENT)
def mark_all_notifications_read(
    context: CurrentContext = Depends(get_authenticated_context),
    db: Session = Depends(get_db),
) -> Response:
    notifications = list(
        db.scalars(
            select(UserNotification).where(
                UserNotification.user_id == context.user.id,
                UserNotification.archived_at.is_(None),
                UserNotification.read_at.is_(None),
            )
        )
    )
    for notification in notifications:
        permanently_delete_notification(db, notification)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/{notification_id}/read", status_code=status.HTTP_204_NO_CONTENT)
def mark_notification_read(
    notification_id: UUID,
    context: CurrentContext = Depends(get_authenticated_context),
    db: Session = Depends(get_db),
) -> Response:
    notification = db.get(UserNotification, notification_id)
    if notification is None or notification.user_id != context.user.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Notification not found")
    permanently_delete_notification(db, notification)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/{notification_id}/archive", status_code=status.HTTP_204_NO_CONTENT)
def archive_notification(
    notification_id: UUID,
    context: CurrentContext = Depends(get_authenticated_context),
    db: Session = Depends(get_db),
) -> Response:
    notification = db.get(UserNotification, notification_id)
    if notification is None or notification.user_id != context.user.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Notification not found")
    now = datetime.now(UTC)
    notification.read_at = notification.read_at or now
    notification.archived_at = notification.archived_at or now
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/{notification_id}/restore", status_code=status.HTTP_204_NO_CONTENT)
def restore_notification(
    notification_id: UUID,
    context: CurrentContext = Depends(get_authenticated_context),
    db: Session = Depends(get_db),
) -> Response:
    notification = db.get(UserNotification, notification_id)
    if notification is None or notification.user_id != context.user.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Notification not found")
    notification.archived_at = None
    notification.read_at = None
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.delete("/{notification_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_notification(
    notification_id: UUID,
    context: CurrentContext = Depends(get_authenticated_context),
    db: Session = Depends(get_db),
) -> Response:
    notification = db.get(UserNotification, notification_id)
    if notification is None or notification.user_id != context.user.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Notification not found")
    permanently_delete_notification(db, notification)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
