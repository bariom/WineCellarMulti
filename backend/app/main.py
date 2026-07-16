import time

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware

from app.api.router import api_router
from app.core.config import settings
from app.services.request_metrics import request_metrics

app = FastAPI(title=settings.app_name, debug=settings.app_debug)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.include_router(api_router, prefix="/api/v1")


@app.middleware("http")
async def collect_request_metrics(request: Request, call_next):
    if request.url.path.startswith("/api/v1/monitoring"):
        return await call_next(request)
    started_at = time.perf_counter()
    response = await call_next(request)
    request_metrics.record(response.status_code, (time.perf_counter() - started_at) * 1000)
    return response


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}
