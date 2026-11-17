"""App administrators add the wines of more producers to the shared catalog."""

from __future__ import annotations

from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session

from app.api.deps import CurrentContext, require_app_admin_context
from app.db.session import get_db
from app.schemas.catalog_expansion import (
    CatalogExpansionReview,
    CatalogExpansionStart,
    CatalogExpansionStatus,
)
from app.services import catalog_expansion

router = APIRouter(prefix="/catalog-expansion")


@router.get("", response_model=CatalogExpansionStatus)
def catalog_expansion_status(
    db: Session = Depends(get_db),
    context: CurrentContext = Depends(require_app_admin_context),
) -> CatalogExpansionStatus:
    """The wines researched by AI awaiting approval, and the research under way."""
    return catalog_expansion.expansion_status(db)


@router.post("", response_model=CatalogExpansionStatus, status_code=status.HTTP_202_ACCEPTED)
def start_catalog_expansion(
    payload: CatalogExpansionStart,
    db: Session = Depends(get_db),
    context: CurrentContext = Depends(require_app_admin_context),
) -> CatalogExpansionStatus:
    """Research the range of the named producers, or of a wine area's producers."""
    catalog_expansion.start(
        household_id=context.household.id,
        user_id=context.user.id,
        session_id=context.session.id,
        locale=context.user.locale,
        area=payload.area,
        country=payload.country,
        producers=payload.producers,
        producer_count=payload.producer_count,
        budget_usd=payload.budget_usd,
    )
    return catalog_expansion.expansion_status(db)


@router.post("/cancel", response_model=CatalogExpansionStatus)
def cancel_catalog_expansion(
    db: Session = Depends(get_db),
    context: CurrentContext = Depends(require_app_admin_context),
) -> CatalogExpansionStatus:
    """Stop after the calls already under way; the proposals already saved stay."""
    catalog_expansion.cancel()
    return catalog_expansion.expansion_status(db)


@router.post("/approve", response_model=CatalogExpansionStatus)
def approve_catalog_expansion(
    payload: CatalogExpansionReview,
    db: Session = Depends(get_db),
    context: CurrentContext = Depends(require_app_admin_context),
) -> CatalogExpansionStatus:
    """Approve the given AI proposals: they become catalog suggestions for every cellar."""
    catalog_expansion.review(db, payload.ids, approve=True, user_id=context.user.id)
    return catalog_expansion.expansion_status(db)


@router.post("/discard", response_model=CatalogExpansionStatus)
def discard_catalog_expansion(
    payload: CatalogExpansionReview,
    db: Session = Depends(get_db),
    context: CurrentContext = Depends(require_app_admin_context),
) -> CatalogExpansionStatus:
    """Delete the given AI proposals."""
    catalog_expansion.review(db, payload.ids, approve=False, user_id=context.user.id)
    return catalog_expansion.expansion_status(db)
