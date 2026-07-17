from __future__ import annotations

import hmac
from datetime import UTC, datetime, timedelta

from fastapi import APIRouter, Depends, Header, HTTPException, Query, Response, status
from sqlalchemy import delete, func, select
from sqlalchemy.orm import Session

from app.api.deps import CurrentContext, require_app_admin_context
from app.core.config import settings
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


def save_sample(db: Session, system: dict[str, object], now: datetime) -> None:
    db.add(
        OperationalMetricSample(
            collected_at=now,
            system=system,
            application=request_metrics.snapshot(),
            business=business_snapshot(db),
        )
    )
    db.execute(delete(OperationalMetricSample).where(OperationalMetricSample.collected_at < now - SAMPLE_RETENTION))
    db.commit()


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
        save_sample(db, system, now)
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


@router.post("/collect", status_code=status.HTTP_204_NO_CONTENT)
def collect_operations_sample(
    payload: dict[str, object],
    x_operations_collector_token: str = Header(default=""),
    db: Session = Depends(get_db),
) -> Response:
    expected = settings.operations_collector_token
    if not expected or not hmac.compare_digest(x_operations_collector_token, expected):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid operations collector token")
    save_sample(db, payload, datetime.now(UTC))
    return Response(status_code=status.HTTP_204_NO_CONTENT)
