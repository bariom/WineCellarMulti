"""App administrators give the catalog's appellations and grapes a sensory baseline."""

from __future__ import annotations

from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session

from app.api.deps import CurrentContext, require_app_admin_context
from app.db.session import get_db
from app.schemas.catalog_baselines import (
    CatalogBaselineRecalculation,
    CatalogBaselineReview,
    CatalogBaselineStart,
    CatalogBaselineStatus,
)
from app.services import catalog_baselines

router = APIRouter(prefix="/catalog-baselines")


@router.get("", response_model=CatalogBaselineStatus)
def catalog_baseline_status(
    db: Session = Depends(get_db),
    context: CurrentContext = Depends(require_app_admin_context),
) -> CatalogBaselineStatus:
    """What the catalog's taste profiles rest on, the baselines missing and those proposed."""
    return catalog_baselines.baseline_status(db)


@router.post("", response_model=CatalogBaselineStatus, status_code=status.HTTP_202_ACCEPTED)
def start_catalog_baselines(
    payload: CatalogBaselineStart,
    db: Session = Depends(get_db),
    context: CurrentContext = Depends(require_app_admin_context),
) -> CatalogBaselineStatus:
    """Let AI propose baselines for the most used appellations and grapes lacking one."""
    catalog_baselines.start(
        db,
        household_id=context.household.id,
        user_id=context.user.id,
        session_id=context.session.id,
        limit=payload.limit,
        budget_usd=payload.budget_usd,
    )
    return catalog_baselines.baseline_status(db)


@router.post("/cancel", response_model=CatalogBaselineStatus)
def cancel_catalog_baselines(
    db: Session = Depends(get_db),
    context: CurrentContext = Depends(require_app_admin_context),
) -> CatalogBaselineStatus:
    """Stop after the calls already under way; the proposals already saved stay."""
    catalog_baselines.cancel()
    return catalog_baselines.baseline_status(db)


@router.post("/approve", response_model=CatalogBaselineStatus)
def approve_catalog_baselines(
    payload: CatalogBaselineReview,
    db: Session = Depends(get_db),
    context: CurrentContext = Depends(require_app_admin_context),
) -> CatalogBaselineStatus:
    """Activate the given proposals: profile generation uses them from now on."""
    catalog_baselines.review(db, payload.ids, approve=True, user_id=context.user.id)
    return catalog_baselines.baseline_status(db)


@router.post("/discard", response_model=CatalogBaselineStatus)
def discard_catalog_baselines(
    payload: CatalogBaselineReview,
    db: Session = Depends(get_db),
    context: CurrentContext = Depends(require_app_admin_context),
) -> CatalogBaselineStatus:
    """Delete the given proposals."""
    catalog_baselines.review(db, payload.ids, approve=False, user_id=context.user.id)
    return catalog_baselines.baseline_status(db)


@router.post("/recalculate", response_model=CatalogBaselineRecalculation)
def recalculate_estimated_profiles(
    db: Session = Depends(get_db),
    context: CurrentContext = Depends(require_app_admin_context),
) -> CatalogBaselineRecalculation:
    """Recompute, without AI, the estimated profiles from the active baselines."""
    return catalog_baselines.recalculate(
        db, household_id=context.household.id, user_id=context.user.id
    )
