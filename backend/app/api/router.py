from fastapi import APIRouter

from app.api.routes import ai, auth, households, imports, session, wines, wishlist


api_router = APIRouter()
api_router.include_router(auth.router, tags=["auth"])
api_router.include_router(ai.router, tags=["ai"])
api_router.include_router(households.router, tags=["household"])
api_router.include_router(imports.router, tags=["imports"])
api_router.include_router(session.router, tags=["session"])
api_router.include_router(wines.router, prefix="/wines", tags=["wines"])
api_router.include_router(wishlist.router, tags=["wishlist"])
