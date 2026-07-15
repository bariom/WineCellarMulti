from datetime import UTC, datetime
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import CurrentContext, get_authenticated_context
from app.db.session import get_db
from app.models import CoOwnershipAgreement, UserNotification
from app.schemas.notification import NotificationResponse
from app.services.notifications import ensure_smart_notifications

router = APIRouter(prefix="/notifications")


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
                action_url = (
                    f"/cellar?wine_id={agreement.wine_id}&section=coownership"
                )
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
