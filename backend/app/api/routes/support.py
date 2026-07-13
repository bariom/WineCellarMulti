from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import CurrentContext, get_optional_context
from app.core.config import settings
from app.core.rate_limit import enforce_rate_limit
from app.db.session import get_db
from app.models import User
from app.schemas.support import ContactRequest, ContactResponse
from app.services.email import send_email


router = APIRouter(prefix="/support")


def support_recipients(db: Session) -> list[str]:
    return list(
        dict.fromkeys(
            db.scalars(
                select(User.email)
                .where(User.is_app_admin.is_(True))
                .where(User.is_approved.is_(True))
                .where(User.is_blocked.is_(False))
                .order_by(User.email.asc()),
            ),
        ),
    )


@router.post("/contact", response_model=ContactResponse, status_code=status.HTTP_202_ACCEPTED)
def contact_support(
    payload: ContactRequest,
    request: Request,
    context: CurrentContext | None = Depends(get_optional_context),
    db: Session = Depends(get_db),
) -> ContactResponse:
    enforce_rate_limit(
        request,
        scope="support:contact:ip",
        limit=settings.rate_limit_support_attempts,
        window_seconds=settings.rate_limit_support_window_seconds,
    )
    enforce_rate_limit(
        request,
        scope="support:contact:email",
        limit=settings.rate_limit_support_attempts,
        window_seconds=settings.rate_limit_support_window_seconds,
        subject=payload.email,
    )
    recipients = support_recipients(db)
    if not recipients:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="Support is unavailable")

    context_lines = []
    if context is not None:
        context_lines.extend(
            [
                f"Authenticated user: {context.user.display_name} <{context.user.email}>",
                f"Active household: {context.household.name}",
                f"Role: {context.membership.role}",
            ],
        )

    delivered = send_email(
        recipients=recipients,
        subject=f"[{settings.app_name}] Contact request: {payload.subject}",
        body="\n".join(
            [
                "A user submitted a support request.",
                "",
                f"Reply-to / contact email: {payload.email}",
                *([""] + context_lines if context_lines else []),
                "",
                "Message:",
                payload.message,
            ],
        ),
    )
    if not delivered:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail="Unable to send support request")
    return ContactResponse()
