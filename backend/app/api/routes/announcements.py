from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import CurrentContext, require_app_admin_context
from app.db.session import get_db
from app.models import AdminAnnouncement
from app.schemas.announcement import AnnouncementAudience, AnnouncementCreate, AnnouncementResponse
from app.services.announcements import audience_count, send_announcement

router = APIRouter(prefix="/admin/announcements")


def announcement_admin(
    context: CurrentContext = Depends(require_app_admin_context),
) -> CurrentContext:
    if context.household.is_demo:
        raise HTTPException(status_code=403, detail="Unavailable in demo mode")
    return context


@router.get("/audience", response_model=AnnouncementAudience)
def audience(
    context: CurrentContext = Depends(announcement_admin),
    db: Session = Depends(get_db),
):
    return AnnouncementAudience(recipient_count=audience_count(db))


@router.get("", response_model=list[AnnouncementResponse])
def history(
    context: CurrentContext = Depends(announcement_admin),
    db: Session = Depends(get_db),
):
    # Global audit history is only accessible through the app-admin dependency above.
    return db.scalars(
        select(AdminAnnouncement)
        .order_by(AdminAnnouncement.created_at.desc(), AdminAnnouncement.id.desc())
        .limit(50)
    ).all()


@router.post("", response_model=AnnouncementResponse)
def send(
    payload: AnnouncementCreate,
    context: CurrentContext = Depends(announcement_admin),
    db: Session = Depends(get_db),
):
    return send_announcement(db, context, payload)
