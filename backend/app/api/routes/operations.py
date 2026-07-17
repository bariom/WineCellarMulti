from __future__ import annotations

from datetime import UTC, datetime, timedelta

from fastapi import APIRouter, Depends, Query
from sqlalchemy import delete, func, select
from sqlalchemy.orm import Session

from app.api.deps import CurrentContext, require_app_admin_context
from app.db.session import get_db
from app.models import Household, OperationalMetricSample, User, Wine
from app.services.operational_metrics import system_snapshot
from app.services.request_metrics import request_metrics

router = APIRouter(prefix="/admin/operations")

SAMPLE_INTERVAL = timedelta(minutes=5)
SAMPLE_RETENTION = timedelta(days=14)


def business_snapshot(db: Session) -> dict[str, int]:
    return {
        "users_total": db.scalar(select(func.count()).select_from(User)) or 0,
        "users_approved": db.scalar(select(func.count()).select_from(User).where(User.is_approved.is_(True))) or 0,
        "users_blocked": db.scalar(select(func.count()).select_from(User).where(User.is_blocked.is_(True))) or 0,
        "households_total": db.scalar(select(func.count()).select_from(Household)) or 0,
        "wines_total": db.scalar(select(func.count()).select_from(Wine)) or 0,
        "bottles_total": db.scalar(select(func.coalesce(func.sum(Wine.quantity), 0))) or 0,
    }


def sample_response(sample: OperationalMetricSample) -> dict[str, object]:
    return {
        "collected_at": sample.collected_at.isoformat(),
        "system": sample.system,
        "application": sample.application,
        "business": sample.business,
    }


@router.get("/overview")
def operations_overview(
    db: Session = Depends(get_db),
    _: CurrentContext = Depends(require_app_admin_context),
) -> dict[str, object]:
    now = datetime.now(UTC)
    system = system_snapshot()
    application = request_metrics.snapshot()
    business = business_snapshot(db)
    latest = db.scalar(select(OperationalMetricSample).order_by(OperationalMetricSample.collected_at.desc()).limit(1))
    if latest is None or latest.collected_at.replace(tzinfo=UTC) <= now - SAMPLE_INTERVAL:
        latest = OperationalMetricSample(
            collected_at=now,
            system=system,
            application=application,
            business=business,
        )
        db.add(latest)
        db.execute(delete(OperationalMetricSample).where(OperationalMetricSample.collected_at < now - SAMPLE_RETENTION))
        db.commit()
    return {
        "collected_at": system["collected_at"],
        "system": system,
        "application": application,
        "business": business,
        "history_retention_days": SAMPLE_RETENTION.days,
    }


@router.get("/history")
def operations_history(
    hours: int = Query(default=24, ge=1, le=168),
    db: Session = Depends(get_db),
    _: CurrentContext = Depends(require_app_admin_context),
) -> dict[str, object]:
    cutoff = datetime.now(UTC) - timedelta(hours=hours)
    samples = db.scalars(
        select(OperationalMetricSample)
        .where(OperationalMetricSample.collected_at >= cutoff)
        .order_by(OperationalMetricSample.collected_at)
        .limit(2048)
    ).all()
    return {"hours": hours, "samples": [sample_response(sample) for sample in samples]}
