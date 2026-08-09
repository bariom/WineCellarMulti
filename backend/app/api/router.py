from fastapi import APIRouter

from app.api.routes import (
    ai,
    auth,
    billing,
    catalog,
    coownership,
    households,
    imports,
    map_places,
    monitoring,
    notifications,
    operations,
    sales,
    session,
    support,
    tags,
    wine_news,
    wines,
    wishlist,
)

api_router = APIRouter()
api_router.include_router(auth.router, tags=["auth"])
api_router.include_router(billing.router, tags=["billing"])
api_router.include_router(ai.router, tags=["ai"])
api_router.include_router(households.router, tags=["household"])
api_router.include_router(imports.router, tags=["imports"])
api_router.include_router(map_places.router, tags=["map"])
api_router.include_router(monitoring.router, tags=["monitoring"])
api_router.include_router(notifications.router, tags=["notifications"])
api_router.include_router(operations.router, tags=["operations"])
api_router.include_router(sales.router, tags=["sales"])
api_router.include_router(session.router, tags=["session"])
api_router.include_router(support.router, tags=["support"])
api_router.include_router(tags.router, tags=["tags"])
api_router.include_router(catalog.router, prefix="/wines", tags=["catalog"])
api_router.include_router(wines.router, prefix="/wines", tags=["wines"])
api_router.include_router(coownership.router, tags=["co-ownership"])
api_router.include_router(wishlist.router, tags=["wishlist"])
api_router.include_router(wine_news.router, tags=["wine-pulse"])
