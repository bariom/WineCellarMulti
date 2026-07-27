import logging
import time
from contextlib import asynccontextmanager
from threading import Thread

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import select

from app.api.router import api_router
from app.core.config import settings
from app.core.security import hash_session_token
from app.db.session import SessionLocal
from app.models import UserActivityLog, UserSession
from app.services.bottle_photo_ai import BottlePhotoAiUnavailable, warm_bottle_photo_model
from app.services.request_metrics import request_metrics

logger = logging.getLogger(__name__)


def warm_photo_ai() -> None:
    try:
        warm_bottle_photo_model(settings.wine_photo_ai_model)
    except BottlePhotoAiUnavailable:
        logger.exception("Bottle photo AI warm-up failed")


@asynccontextmanager
async def lifespan(_: FastAPI):
    if settings.app_env == "production" and settings.wine_photo_ai_enabled:
        Thread(target=warm_photo_ai, name="bottle-photo-ai-warmup", daemon=True).start()
    yield


app = FastAPI(title=settings.app_name, debug=settings.app_debug, lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.include_router(api_router, prefix="/api/v1")


TECHNICAL_METRICS_PATH_PREFIXES = (
    "/api/v1/monitoring",
    "/api/v1/admin/operations",
)


def is_application_request(path: str) -> bool:
    """Return whether a request represents normal Vinaris application traffic.

    Operations collection can wait for external services such as the OpenAI
    costs API.  Including it in this average would turn an infrastructure
    collection delay into an apparent user-facing application slowdown.
    """

    return not path.startswith(TECHNICAL_METRICS_PATH_PREFIXES)


def user_activity_action(method: str, path: str) -> str | None:
    if not path.startswith("/api/v1/") or method not in {"POST", "PUT", "PATCH", "DELETE"}:
        return None
    if path.startswith("/api/v1/admin/") or path.startswith("/api/v1/monitoring"):
        return None
    if path.startswith("/api/v1/ai/"):
        return "ai_generation"
    if path.startswith("/api/v1/wines"):
        return "wine_updated" if method in {"PUT", "PATCH"} else "wine_action"
    if path.startswith("/api/v1/wishlist"):
        return "wishlist_action"
    if path.startswith("/api/v1/household"):
        return "household_action"
    if path.startswith("/api/v1/auth"):
        return "account_action"
    if path.startswith("/api/v1/import"):
        return "data_import"
    if path.startswith("/api/v1/co-ownership"):
        return "coownership_action"
    if path.startswith("/api/v1/tags"):
        return "tag_action"
    return "app_action"


def save_user_activity(request: Request, action: str) -> None:
    session_token = request.cookies.get(settings.session_cookie_name)
    if not session_token:
        return
    db = SessionLocal()
    try:
        user_session = db.scalar(
            select(UserSession).where(UserSession.token_hash == hash_session_token(session_token))
        )
        if user_session is None:
            return
        db.add(
            UserActivityLog(
                user_id=user_session.user_id,
                household_id=user_session.active_household_id,
                action=action,
            )
        )
        db.commit()
    finally:
        db.close()


@app.middleware("http")
async def collect_request_metrics(request: Request, call_next):
    if not is_application_request(request.url.path):
        return await call_next(request)
    started_at = time.perf_counter()
    response = await call_next(request)
    request_metrics.record(response.status_code, (time.perf_counter() - started_at) * 1000)
    return response


@app.middleware("http")
async def collect_user_activity(request: Request, call_next):
    response = await call_next(request)
    action = user_activity_action(request.method, request.url.path)
    if action and 200 <= response.status_code < 300:
        save_user_activity(request, action)
    return response


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}
