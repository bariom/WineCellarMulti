from datetime import UTC, datetime

from fastapi import HTTPException
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.api.deps import CurrentContext
from app.models import AdminAnnouncement, Household, Membership, User, UserNotification
from app.schemas.announcement import AnnouncementCreate


def eligible_users():
    # Explicit global app-admin operation, not a cellar/business-data query.
    # EXISTS excludes demo-only accounts and avoids duplicate deliveries for multi-cellar users.
    real_membership = (
        select(Membership.id)
        .join(Household, Household.id == Membership.household_id)
        .where(Membership.user_id == User.id, Household.is_demo.is_(False))
        .exists()
    )
    return select(User.id).where(
        User.is_approved.is_(True), User.is_blocked.is_(False), real_membership
    )


def audience_count(db: Session) -> int:
    return db.scalar(select(func.count()).select_from(eligible_users().subquery())) or 0


def matching_retry(
    record: AdminAnnouncement, payload: AnnouncementCreate, context: CurrentContext
) -> AdminAnnouncement:
    if (
        record.created_by_user_id != context.user.id
        or record.title != payload.title
        or record.message != payload.message
        or record.action_url != payload.action_url
    ):
        raise HTTPException(status_code=409, detail="This send identifier has already been used")
    return record


def send_announcement(
    db: Session, context: CurrentContext, payload: AnnouncementCreate
) -> AdminAnnouncement:
    if not context.user.is_app_admin or context.household.is_demo:
        raise HTTPException(status_code=403, detail="Application administrator required")
    existing = db.get(AdminAnnouncement, payload.id)
    if existing is not None:
        return matching_retry(existing, payload, context)
    record = AdminAnnouncement(
        id=payload.id,
        created_by_user_id=context.user.id,
        title=payload.title,
        message=payload.message,
        action_url=payload.action_url,
        recipient_count=0,
        created_at=datetime.now(UTC),
    )
    try:
        db.add(record)
        # The primary key serializes concurrent retries before any delivery.
        db.flush()
        for batch in db.scalars(eligible_users().execution_options(yield_per=500)).partitions(500):
            db.add_all(
                [
                    UserNotification(
                        user_id=user_id,
                        kind="admin_announcement",
                        title=payload.title,
                        message=payload.message,
                        action_url=payload.action_url,
                        fingerprint=f"admin_announcement:{payload.id}",
                        created_at=record.created_at,
                    )
                    for user_id in batch
                ]
            )
            record.recipient_count += len(batch)
            db.flush()
        if not record.recipient_count:
            raise HTTPException(status_code=409, detail="No eligible recipients")
        # Audit and all notifications commit atomically; never report a partial send as success.
        db.commit()
    except IntegrityError:
        db.rollback()
        existing = db.get(AdminAnnouncement, payload.id)
        if existing is None:
            raise
        return matching_retry(existing, payload, context)
    except Exception:
        db.rollback()
        raise
    db.refresh(record)
    return record
