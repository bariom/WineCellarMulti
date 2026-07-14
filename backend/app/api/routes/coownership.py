import hashlib
import json
from datetime import datetime, timedelta, timezone
from decimal import Decimal
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import CurrentContext, get_current_context, require_write_context
from app.api.routes.wines import get_household_wine
from app.core.config import settings
from app.core.crypto import decrypt_secret, encrypt_secret
from app.core.rate_limit import enforce_rate_limit
from app.core.security import hash_coownership_invite_token, new_coownership_invite_token
from app.db.session import get_db
from app.models import CoOwnershipAgreement, CoOwnershipParticipant, User, Wine
from app.schemas.coownership import CoOwnershipAgreementCreate, CoOwnershipAgreementResponse, CoOwnershipParticipantResponse, CoOwnershipResponseRequest
from app.services.email import send_email
from app.services.notifications import create_user_notification


router = APIRouter(prefix="/co-ownership-agreements")


def now_utc() -> datetime:
    return datetime.now(timezone.utc)


def aware_utc(value: datetime) -> datetime:
    return value.replace(tzinfo=timezone.utc) if value.tzinfo is None else value.astimezone(timezone.utc)


def request_origin(request: Request) -> str:
    scheme = request.headers.get("x-forwarded-proto") or request.url.scheme
    return f"{scheme}://{request.headers.get('host')}"


def participant_rows(db: Session, agreement_id: UUID) -> list[CoOwnershipParticipant]:
    return list(db.scalars(select(CoOwnershipParticipant).where(CoOwnershipParticipant.agreement_id == agreement_id).order_by(CoOwnershipParticipant.email.asc())))


def agreement_response(db: Session, agreement: CoOwnershipAgreement, request: Request, *, expose_links: bool, responding_participant_id: UUID | None = None) -> CoOwnershipAgreementResponse:
    participants = []
    for participant in participant_rows(db, agreement.id):
        token = decrypt_secret(participant.invite_token_encrypted) if expose_links else ""
        participants.append(
            CoOwnershipParticipantResponse(
                id=participant.id,
                user_id=participant.user_id,
                name=participant.name,
                email=participant.email,
                share_pct=participant.share_pct,
                contribution=participant.contribution,
                status=participant.status,
                invited_at=participant.invited_at,
                viewed_at=participant.viewed_at,
                responded_at=participant.responded_at,
                acceptance_name=participant.acceptance_name,
                acceptance_method=participant.acceptance_method,
                delivery_channel=participant.delivery_channel,
                delivery_status=participant.delivery_status,
                invite_url=f"{request_origin(request)}/?coownership_token={token}" if token else None,
            )
        )
    return CoOwnershipAgreementResponse(
        id=agreement.id,
        wine_id=agreement.wine_id,
        version=agreement.version,
        status=agreement.status,
        ownership_mode=agreement.ownership_mode,
        custody_location=agreement.custody_location,
        terms=agreement.terms,
        wine_snapshot=agreement.wine_snapshot,
        document_hash=agreement.document_hash,
        created_at=agreement.created_at,
        finalized_at=agreement.finalized_at,
        responding_participant_id=responding_participant_id,
        can_cancel=expose_links and agreement.status in {"invalidated", "declined"},
        participants=participants,
    )


def wine_snapshot(wine: Wine) -> dict:
    return {
        "name": wine.name,
        "producer": wine.producer,
        "vintage": wine.vintage,
        "quantity": wine.quantity,
        "format": wine.format,
        "purchase_price": str(wine.price),
        "currency": wine.currency,
        "merchant": wine.merchant,
        "order_date": wine.order_date.isoformat() if wine.order_date else None,
    }


def document_hash(snapshot: dict, payload: CoOwnershipAgreementCreate, version: int) -> str:
    canonical = {
        "version": version,
        "wine": snapshot,
        "ownership_mode": payload.ownership_mode,
        "custody_location": payload.custody_location.strip(),
        "terms": payload.terms.strip(),
        "participants": sorted(
            [
                {
                    "name": item.name.strip(),
                    "email": item.email.lower(),
                    "share_pct": str(item.share_pct),
                    "contribution": str(item.contribution) if item.contribution is not None else None,
                }
                for item in payload.participants
            ],
            key=lambda item: item["email"],
        ),
    }
    encoded = json.dumps(canonical, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode("utf-8")
    return hashlib.sha256(encoded).hexdigest()


def update_agreement_status(db: Session, agreement: CoOwnershipAgreement) -> None:
    statuses = [participant.status for participant in participant_rows(db, agreement.id)]
    if statuses and all(value == "accepted" for value in statuses):
        agreement.status = "accepted"
        agreement.finalized_at = now_utc()
    elif "declined" in statuses:
        agreement.status = "invalidated"
        agreement.finalized_at = None
    else:
        agreement.status = "pending"
        agreement.finalized_at = None


def invitation_body(agreement: CoOwnershipAgreement, wine: Wine, participant: CoOwnershipParticipant, invite_url: str) -> str:
    return (
        "You have been invited to review a Vinaris wine co-ownership agreement.\n\n"
        f"Wine: {wine.name} {wine.vintage}\n"
        f"Quantity: {wine.quantity}\n"
        f"Your share: {participant.share_pct}%\n\n"
        f"Review and respond within {settings.coownership_invite_ttl_days} days:\n{invite_url}\n\n"
        "Opening the link only gives access to this agreement, not to the rest of the cellar."
    )


@router.get("/wines/{wine_id}", response_model=list[CoOwnershipAgreementResponse])
def list_wine_agreements(wine_id: UUID, request: Request, db: Session = Depends(get_db), context: CurrentContext = Depends(get_current_context)) -> list[CoOwnershipAgreementResponse]:
    get_household_wine(db, context, wine_id)
    agreements = db.scalars(select(CoOwnershipAgreement).where(CoOwnershipAgreement.wine_id == wine_id).order_by(CoOwnershipAgreement.created_at.desc()))
    return [agreement_response(db, agreement, request, expose_links=agreement.created_by_user_id == context.user.id) for agreement in agreements]


@router.post("/wines/{wine_id}", response_model=CoOwnershipAgreementResponse, status_code=status.HTTP_201_CREATED)
def create_agreement(wine_id: UUID, payload: CoOwnershipAgreementCreate, request: Request, db: Session = Depends(get_db), context: CurrentContext = Depends(require_write_context)) -> CoOwnershipAgreementResponse:
    wine = get_household_wine(db, context, wine_id)
    blocking_agreement = db.scalar(
        select(CoOwnershipAgreement).where(
            CoOwnershipAgreement.wine_id == wine.id,
            CoOwnershipAgreement.status.in_(("pending", "invalidated", "declined")),
        ),
    )
    if blocking_agreement is not None:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Cancel the current invalidated proposal before creating a new version")
    emails = [item.email.lower() for item in payload.participants]
    if len(set(emails)) != len(emails):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Participant emails must be unique")
    total_share = sum((item.share_pct for item in payload.participants), Decimal("0"))
    if abs(total_share - Decimal("100")) > Decimal("0.000001"):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Participant shares must total exactly 100%")

    previous_version = db.scalar(select(CoOwnershipAgreement.version).where(CoOwnershipAgreement.wine_id == wine.id).order_by(CoOwnershipAgreement.version.desc())) or 0
    snapshot = wine_snapshot(wine)
    agreement = CoOwnershipAgreement(
        wine_id=wine.id,
        household_id=context.household.id,
        created_by_user_id=context.user.id,
        version=previous_version + 1,
        status="pending",
        ownership_mode=payload.ownership_mode,
        custody_location=payload.custody_location.strip(),
        terms=payload.terms.strip(),
        wine_snapshot=snapshot,
        document_hash=document_hash(snapshot, payload, previous_version + 1),
    )
    db.add(agreement)
    db.flush()

    users_by_email = {
        user.email.lower(): user
        for user in db.scalars(select(User).where(User.email.in_(emails)))
    }
    for item in payload.participants:
        email = item.email.lower()
        linked_user = users_by_email.get(email)
        token = new_coownership_invite_token()
        participant = CoOwnershipParticipant(
            agreement_id=agreement.id,
            user_id=linked_user.id if linked_user else None,
            name=item.name.strip(),
            email=email,
            share_pct=item.share_pct,
            contribution=item.contribution,
            status="pending",
            invite_token_hash=hash_coownership_invite_token(token),
            invite_token_encrypted=encrypt_secret(token),
            invite_expires_at=now_utc() + timedelta(days=max(settings.coownership_invite_ttl_days, 1)),
            invited_at=now_utc(),
            delivery_channel="notification+email" if linked_user and payload.email_registered_users else ("notification" if linked_user else "email"),
            delivery_status="pending",
        )
        db.add(participant)
        db.flush()
        invite_url = f"{request_origin(request)}/?coownership_token={token}"
        if linked_user:
            create_user_notification(
                db,
                linked_user,
                kind="coownership_agreement",
                title="Accordo di comproprietà da esaminare",
                message=f"Sei stato invitato a esaminare l'accordo per {wine.name} {wine.vintage}.",
                action_url=f"/?coownership_token={token}",
                fingerprint=f"coownership:{agreement.id}:{participant.id}",
            )
        should_email = linked_user is None or payload.email_registered_users
        if should_email:
            delivered = send_email(
                recipients=[email],
                subject=f"[{settings.app_name}] Wine co-ownership agreement",
                body=invitation_body(agreement, wine, participant, invite_url),
            )
            participant.delivery_status = "sent" if delivered else "failed"
        else:
            participant.delivery_status = "sent"
    db.commit()
    db.refresh(agreement)
    return agreement_response(db, agreement, request, expose_links=True)


def public_participant(db: Session, token: str) -> tuple[CoOwnershipParticipant, CoOwnershipAgreement]:
    participant = db.scalar(select(CoOwnershipParticipant).where(CoOwnershipParticipant.invite_token_hash == hash_coownership_invite_token(token)))
    if participant is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Agreement invitation not found")
    if aware_utc(participant.invite_expires_at) < now_utc() and participant.status == "pending":
        raise HTTPException(status_code=status.HTTP_410_GONE, detail="Agreement invitation expired")
    agreement = db.get(CoOwnershipAgreement, participant.agreement_id)
    if agreement is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Agreement not found")
    return participant, agreement


@router.get("/public/{token}", response_model=CoOwnershipAgreementResponse)
def view_public_agreement(token: str, request: Request, db: Session = Depends(get_db)) -> CoOwnershipAgreementResponse:
    participant, agreement = public_participant(db, token)
    if participant.viewed_at is None:
        participant.viewed_at = now_utc()
        db.commit()
    return agreement_response(db, agreement, request, expose_links=False, responding_participant_id=participant.id)


@router.post("/public/{token}/respond", response_model=CoOwnershipAgreementResponse)
def respond_public_agreement(token: str, payload: CoOwnershipResponseRequest, request: Request, db: Session = Depends(get_db)) -> CoOwnershipAgreementResponse:
    enforce_rate_limit(
        request,
        scope="coownership:respond:ip",
        limit=settings.rate_limit_coownership_response_attempts,
        window_seconds=settings.rate_limit_coownership_response_window_seconds,
    )
    participant, agreement = public_participant(db, token)
    if agreement.status != "pending":
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="This agreement is no longer open for responses")
    if participant.status != "pending":
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="This invitation has already been answered")
    participant.status = payload.decision
    participant.acceptance_name = payload.full_name.strip()
    participant.acceptance_method = "secure_link"
    participant.responded_at = now_utc()
    update_agreement_status(db, agreement)
    if agreement.status == "invalidated":
        for other in participant_rows(db, agreement.id):
            if other.status == "pending":
                other.status = "invalidated"
                other.responded_at = now_utc()
    creator = db.get(User, agreement.created_by_user_id)
    if creator is not None:
        create_user_notification(
            db,
            creator,
            kind="coownership_response",
            title="Risposta a un accordo di comproprietà",
            message=f"{participant.name} ha {('accettato' if payload.decision == 'accepted' else 'rifiutato')} l'accordo. Stato: {agreement.status}.",
            action_url="/cellar",
            fingerprint=f"coownership-response:{agreement.id}:{participant.id}",
        )
    db.commit()
    db.refresh(agreement)
    return agreement_response(db, agreement, request, expose_links=False, responding_participant_id=participant.id)


@router.delete("/wines/{wine_id}/{agreement_id}", status_code=status.HTTP_204_NO_CONTENT)
def cancel_invalidated_agreement(
    wine_id: UUID,
    agreement_id: UUID,
    db: Session = Depends(get_db),
    context: CurrentContext = Depends(require_write_context),
) -> None:
    get_household_wine(db, context, wine_id)
    agreement = db.scalar(
        select(CoOwnershipAgreement).where(
            CoOwnershipAgreement.id == agreement_id,
            CoOwnershipAgreement.wine_id == wine_id,
            CoOwnershipAgreement.created_by_user_id == context.user.id,
            CoOwnershipAgreement.status.in_(("invalidated", "declined")),
        ),
    )
    if agreement is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Rejected agreement not found")
    db.delete(agreement)
    db.commit()
