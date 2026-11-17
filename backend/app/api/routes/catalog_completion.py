"""App administrators complete the shared catalog entries lacking grapes or country."""

from __future__ import annotations

from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session

from app.api.deps import CurrentContext, require_app_admin_context
from app.db.session import get_db
from app.schemas.catalog_completion import CatalogCompletionStart, CatalogCompletionStatus
from app.services import catalog_completion

router = APIRouter(prefix="/catalog-completion")


@router.get("", response_model=CatalogCompletionStatus)
def catalog_completion_status(
    db: Session = Depends(get_db),
    context: CurrentContext = Depends(require_app_admin_context),
) -> CatalogCompletionStatus:
    """How many entries need completing, and the progress of the batch under way."""
    return catalog_completion.completion_status(db)


@router.post("", response_model=CatalogCompletionStatus, status_code=status.HTTP_202_ACCEPTED)
def start_catalog_completion(
    payload: CatalogCompletionStart,
    db: Session = Depends(get_db),
    context: CurrentContext = Depends(require_app_admin_context),
) -> CatalogCompletionStatus:
    """Research a batch of incomplete entries on the web, within a spending cap."""
    catalog_completion.start(
        db,
        household_id=context.household.id,
        user_id=context.user.id,
        session_id=context.session.id,
        locale=context.user.locale,
        limit=payload.limit,
        budget_usd=payload.budget_usd,
        retry_not_found=payload.retry_not_found,
    )
    return catalog_completion.completion_status(db)


@router.post("/cancel", response_model=CatalogCompletionStatus)
def cancel_catalog_completion(
    db: Session = Depends(get_db),
    context: CurrentContext = Depends(require_app_admin_context),
) -> CatalogCompletionStatus:
    """Stop the batch after the calls already under way; saved entries stay."""
    catalog_completion.cancel()
    return catalog_completion.completion_status(db)
