from fastapi import FastAPI

from app.api.router import api_router
from app.core.config import settings


app = FastAPI(title=settings.app_name, debug=settings.app_debug)
app.include_router(api_router, prefix="/api/v1")


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}
