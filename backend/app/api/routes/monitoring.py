from __future__ import annotations

import hmac
import os
from datetime import UTC, datetime

import psutil
from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.db.session import get_db
from app.models import Household, User, Wine
from app.services.request_metrics import request_metrics

router = APIRouter(prefix="/monitoring")


def require_monitoring_token(request: Request) -> None:
    expected_token = settings.monitoring_api_token
    authorization = request.headers.get("Authorization", "")
    token = authorization.removeprefix("Bearer ").strip()
    if not expected_token or not hmac.compare_digest(token, expected_token):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid monitoring token"
        )


@router.get("/system", dependencies=[Depends(require_monitoring_token)])
def system_metrics() -> dict[str, object]:
    memory = psutil.virtual_memory()
    disk = psutil.disk_usage("/")
    process = psutil.Process(os.getpid())
    return {
        "collected_at": datetime.now(UTC).isoformat(),
        "host": {
            "cpu_percent": psutil.cpu_percent(interval=None),
            "memory": {
                "total_bytes": memory.total,
                "used_bytes": memory.used,
                "percent": memory.percent,
            },
            "disk": {"total_bytes": disk.total, "used_bytes": disk.used, "percent": disk.percent},
            "uptime_seconds": round(datetime.now(UTC).timestamp() - psutil.boot_time(), 2),
        },
        "process": {
            "pid": process.pid,
            "memory_rss_bytes": process.memory_info().rss,
            "cpu_percent": process.cpu_percent(interval=None),
        },
    }


@router.get("/application", dependencies=[Depends(require_monitoring_token)])
def application_metrics() -> dict[str, int | float | str | None]:
    return request_metrics.snapshot()


@router.get("/business", dependencies=[Depends(require_monitoring_token)])
def business_metrics(db: Session = Depends(get_db)) -> dict[str, int]:
    return {
        "users_total": db.scalar(select(func.count()).select_from(User)) or 0,
        "users_approved": db.scalar(
            select(func.count()).select_from(User).where(User.is_approved.is_(True))
        )
        or 0,
        "users_blocked": db.scalar(
            select(func.count()).select_from(User).where(User.is_blocked.is_(True))
        )
        or 0,
        "households_total": db.scalar(select(func.count()).select_from(Household)) or 0,
        "wines_total": db.scalar(select(func.count()).select_from(Wine)) or 0,
        "bottles_total": db.scalar(select(func.coalesce(func.sum(Wine.quantity), 0))) or 0,
    }
