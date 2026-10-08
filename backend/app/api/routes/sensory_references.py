from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.api.deps import CurrentContext, require_app_admin_context
from app.db.session import get_db
from app.schemas.sensory_reference import ReferenceImport, ReferencePreview, WineEvidenceReview
from app.services.sensory_references import import_references, preview_references, review_wine

router = APIRouter(prefix="/taste-profile/admin/references")


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
