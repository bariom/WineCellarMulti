from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.api.deps import CurrentContext, require_app_admin_context
from app.db.session import get_db
from app.schemas.sensory_reference import ReferenceImport, ReferencePreview, WineEvidenceReview
from app.schemas.sensory_review_workflow import (
    AppliedReview,
    ApplyReview,
    ReviewProposal,
    UndoReview,
)
from app.services.sensory_references import import_references, preview_references, review_wine
from app.services.sensory_review_workflow import apply_review, proposal, undo_review

router = APIRouter(prefix="/taste-profile/admin/references")


@router.get("/profiles/{identity_id}/proposal", response_model=ReviewProposal)
def guided_proposal(
    identity_id: UUID,
    db: Session = Depends(get_db),
    context: CurrentContext = Depends(require_app_admin_context),
):
    try:
        return proposal(db, identity_id)
    except LookupError as exc:
        raise HTTPException(404, "Wine identity not found") from exc


@router.post("/profiles/{identity_id}/apply", response_model=AppliedReview)
def guided_apply(
    identity_id: UUID,
    request: ApplyReview,
    db: Session = Depends(get_db),
    context: CurrentContext = Depends(require_app_admin_context),
):
    try:
        history_id = apply_review(
            db, identity_id, request.revision, request.dimensions, context.user.id
        )
        db.commit()
        return AppliedReview(proposal=proposal(db, identity_id), history_id=history_id)
    except (ValueError, LookupError, IntegrityError) as exc:
        db.rollback()
        raise HTTPException(
            409, "Profilo o prove cambiati, oppure selezione non applicabile. Ricarica la proposta."
        ) from exc


@router.post("/profiles/{identity_id}/undo/{history_id}", response_model=ReviewProposal)
def guided_undo(
    identity_id: UUID,
    history_id: UUID,
    request: UndoReview,
    db: Session = Depends(get_db),
    context: CurrentContext = Depends(require_app_admin_context),
):
    try:
        undo_review(db, identity_id, history_id, request.revision, context.user.id)
        db.commit()
        return proposal(db, identity_id)
    except (ValueError, LookupError) as exc:
        db.rollback()
        raise HTTPException(409, "Ripristino non disponibile: ricarica il profilo.") from exc


@router.get("/profiles/{identity_id}", response_model=WineEvidenceReview)
def review_profile(
    identity_id: UUID,
    context: CurrentContext = Depends(require_app_admin_context),
    db: Session = Depends(get_db),
) -> WineEvidenceReview:
    result = review_wine(db, identity_id)
    if result is None:
        raise HTTPException(status_code=404, detail="Wine identity not found")
    return result


@router.get("", response_model=ReferencePreview)
def preview(
    context: CurrentContext = Depends(require_app_admin_context), db: Session = Depends(get_db)
) -> ReferencePreview:
    return preview_references(db)


@router.post("", response_model=ReferencePreview)
def import_selected(
    request: ReferenceImport,
    context: CurrentContext = Depends(require_app_admin_context),
    db: Session = Depends(get_db),
) -> ReferencePreview:
    try:
        import_references(db, request.revision, request.ids, str(context.user.id))
        db.commit()
    except (ValueError, IntegrityError) as exc:
        db.rollback()
        message = (
            str(exc)
            if isinstance(exc, ValueError)
            else "Catalogo modificato: ricarica l’anteprima."
        )
        raise HTTPException(status_code=409, detail=message) from exc
    return preview_references(db)
