import logging
import time
from contextlib import asynccontextmanager
from threading import Thread

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware

from app.api.router import api_router
from app.core.config import settings
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


@app.middleware("http")
async def collect_request_metrics(request: Request, call_next):
    if not is_application_request(request.url.path):
        return await call_next(request)
    started_at = time.perf_counter()
    response = await call_next(request)
    request_metrics.record(response.status_code, (time.perf_counter() - started_at) * 1000)
    return response


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}
