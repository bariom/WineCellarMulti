from fastapi import APIRouter

from app.api.routes import session, wines


api_router = APIRouter()
api_router.include_router(session.router, tags=["session"])
api_router.include_router(wines.router, prefix="/wines", tags=["wines"])
