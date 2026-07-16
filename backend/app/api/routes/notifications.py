from datetime import UTC, datetime
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import CurrentContext, get_authenticated_context
from app.db.session import get_db
from app.models import (
    CoOwnershipAgreement,
    Household,
    HouseholdInvite,
    User,
    UserNotification,
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
    )


@router.get("", response_model=list[NotificationResponse])
def list_notifications(
    include_read: bool = False,
    context: CurrentContext = Depends(get_authenticated_context),
    db: Session = Depends(get_db),
) -> list[NotificationResponse]:
    if ensure_smart_notifications(db, context):
        db.commit()
    query = select(UserNotification).where(UserNotification.user_id == context.user.id)
    if not include_read:
        query = query.where(UserNotification.read_at.is_(None))
    notifications = db.scalars(query.order_by(UserNotification.created_at.desc()))
    return [notification_response(db, notification) for notification in notifications]


@router.get("/center", response_model=NotificationCenterResponse)
def notification_center(
    context: CurrentContext = Depends(get_authenticated_context),
    db: Session = Depends(get_db),
) -> NotificationCenterResponse:
    if ensure_smart_notifications(db, context):
        db.commit()

    persisted = list(
        db.scalars(
            select(UserNotification)
            .where(
                UserNotification.user_id == context.user.id,
                UserNotification.read_at.is_(None),
            )
            .order_by(UserNotification.created_at.desc())
            .limit(100)
        )
    )
    items = [
        NotificationCenterItem(
            id=str(notification.id),
            source="notification",
            kind=notification.kind,
            category=notification_category(notification.kind),
            state="unread",
            title=notification.title,
            message=notification.message,
            action_url=notification_response(db, notification).action_url,
            action_kind=(
                "decide_share_revocation" if notification.kind == "share_revocation" else "open"
            ),
            created_at=notification.created_at,
            read_at=notification.read_at,
        )
        for notification in persisted
    ]

    now = datetime.now(UTC)
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
    italian = (context.user.locale or "it").lower().startswith("it")
    for invite, household, inviter in invite_rows:
        actor = inviter.display_name or inviter.email
        items.append(
            NotificationCenterItem(
                id=f"invite:{invite.id}",
                source="household_invite",
                kind="household_invite",
                category="action",
                state="pending",
                title=(
                    f"Invito a {household.name}" if italian else f"Invitation to {household.name}"
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
        items.append(
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

    items.sort(key=lambda item: item.created_at, reverse=True)
    actions = sum(item.category == "action" for item in items)
    updates = sum(item.category == "update" for item in items)
    system = sum(item.category == "system" for item in items)
    return NotificationCenterResponse(
        items=items,
        counts=NotificationCenterCounts(
            total=len(items),
            unread=sum(item.state == "unread" for item in items),
            actionable=sum(item.state == "pending" or item.category == "action" for item in items),
            actions=actions,
            updates=updates,
            system=system,
        ),
    )


@router.post("/{notification_id}/read", status_code=status.HTTP_204_NO_CONTENT)
def mark_notification_read(
    notification_id: UUID,
    context: CurrentContext = Depends(get_authenticated_context),
    db: Session = Depends(get_db),
) -> Response:
    notification = db.get(UserNotification, notification_id)
    if notification is None or notification.user_id != context.user.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Notification not found")
    notification.read_at = notification.read_at or datetime.now(UTC)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
