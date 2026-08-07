import logging
import time

from fastapi import FastAPI, Request, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy import select

from app.api.router import api_router
from app.core.config import settings
from app.core.security import hash_session_token
from app.db.session import SessionLocal, get_db
from app.models import Household, UserActivityLog, UserSession
from app.services.request_metrics import request_metrics

logger = logging.getLogger(__name__)

app = FastAPI(title=settings.app_name, debug=settings.app_debug)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.include_router(api_router, prefix="/api/v1")

DEMO_MUTATION_EXCEPTIONS = {
    "/api/v1/auth/demo",
    "/api/v1/auth/logout",
    "/api/v1/auth/preferences",
}


TECHNICAL_METRICS_PATH_PREFIXES = (
    "/api/v1/monitoring",
    "/api/v1/admin/operations",
)

SLOW_APPLICATION_PATH_PREFIXES = (
    "/api/v1/ai/",
    "/api/v1/imports/",
    "/api/v1/wines/photo/process",
    "/api/v1/map/places",
)


def is_application_request(path: str) -> bool:
    """Return whether a request represents normal Vinaris application traffic.

    Operations collection can wait for external services such as the OpenAI
    costs API.  Including it in this average would turn an infrastructure
    collection delay into an apparent user-facing application slowdown.
    """

    return not path.startswith(TECHNICAL_METRICS_PATH_PREFIXES)


def is_interactive_application_request(path: str) -> bool:
    """Keep AI, imports and photo processing out of perceived API responsiveness."""

    return is_application_request(path) and not path.startswith(SLOW_APPLICATION_PATH_PREFIXES)


def user_activity_action(method: str, path: str) -> str | None:
    if not path.startswith("/api/v1/") or method not in {"POST", "PUT", "PATCH", "DELETE"}:
        return None
    if path.startswith("/api/v1/admin/") or path.startswith("/api/v1/monitoring"):
        return None
    if path.startswith("/api/v1/ai/wines/"):
        if path.endswith("/all"):
            return "ai_wine_complete"
        if path.endswith("/value"):
            return "ai_wine_value"
        if path.endswith("/grapes"):
            return "ai_wine_grapes"
        if path.endswith("/notes"):
            return "ai_wine_notes"
        if path.endswith("/drink-window"):
            return "ai_wine_drink_window"
        if path.endswith("/scores"):
            return "ai_wine_scores"
    if path == "/api/v1/ai/compare-wines":
        return "ai_wine_comparison"
    if path == "/api/v1/ai/pairing":
        return "ai_pairing"
    if path == "/api/v1/ai/buying-advice":
        return "ai_buying_advice"
    if path == "/api/v1/ai/wine-label/enrich":
        return "ai_label_enrichment"
    if path.startswith("/api/v1/ai/wishlist/"):
        return "ai_wishlist_analysis"
    if path == "/api/v1/ai/regional-gap-targets":
        return "ai_regional_gap_analysis"
    if path.startswith("/api/v1/ai/"):
        return "ai_generation"
    if path.startswith("/api/v1/wines"):
        if path == "/api/v1/wines/photo/warmup":
            return None
        if path == "/api/v1/wines/photo/process":
            return "wine_photo_ai_cutout"
        if path == "/api/v1/wines/catalog/recognize-bottle":
            return "wine_label_recognition"
        if "/photo/reuse/" in path:
            return "wine_photo_reused"
        if "/share-offers" in path:
            if path.endswith("/accept"):
                return "wine_share_offer_accepted"
            if path.endswith("/reject"):
                return "wine_share_offer_rejected"
            if path.endswith("/revoke"):
                return "wine_share_offer_revoked"
            return "wine_share_offer_created" if method == "POST" else "wine_share_offer_removed"
        if path.endswith("/approve") and "/catalog/" in path:
            return "wine_catalog_approved"
        if path.endswith("/consume"):
            return "wine_consumed"
        if "/tastings/" in path:
            return "tasting_updated" if method == "PATCH" else "tasting_deleted"
        if "/photo" in path:
            return "wine_photo_removed" if method == "DELETE" else "wine_photo_updated"
        if path == "/api/v1/wines" and method == "POST":
            return "wine_created"
        if method == "DELETE":
            return "wine_deleted"
        if method in {"PUT", "PATCH"}:
            return "wine_updated"
        return "wine_action"
    if path.startswith("/api/v1/wishlist"):
        if path.endswith("/convert"):
            return "wishlist_item_converted"
        if "/lists" in path:
            if method == "POST":
                return "wishlist_list_created"
            if method == "PATCH":
                return "wishlist_list_updated"
            if method == "DELETE":
                return "wishlist_list_deleted"
        if path == "/api/v1/wishlist" and method == "POST":
            return "wishlist_item_created"
        if method == "DELETE":
            return "wishlist_item_deleted"
        if method == "PATCH":
            return "wishlist_item_updated"
        return "wishlist_action"
    if path.startswith("/api/v1/household"):
        if path == "/api/v1/household/switch":
            return "household_switched"
        if "/invites" in path:
            if path.endswith("/accept"):
                return "household_invite_accepted"
            return "household_invite_sent" if method == "POST" else "household_invite_revoked"
        if "/members/" in path:
            return "household_member_removed" if method == "DELETE" else "household_member_updated"
        return "household_action"
    if path.startswith("/api/v1/auth"):
        if path == "/api/v1/auth/preferences":
            return "account_preferences_updated"
        if "/passkeys/" in path:
            return "passkey_removed" if method == "DELETE" else "passkey_configured"
        return "account_action"
    if path.startswith("/api/v1/import"):
        return "data_import"
    if path.startswith("/api/v1/co-ownership"):
        return "coownership_action"
    if path.startswith("/api/v1/tags"):
        if method == "POST":
            return "tag_created"
        if method == "PATCH":
            return "tag_updated"
        return "tag_deleted"
    if path.startswith("/api/v1/notifications"):
        if path.endswith("/read") or path.endswith("/read-all"):
            return "notification_read"
        if path.endswith("/archive"):
            return "notification_archived"
        if path.endswith("/restore"):
            return "notification_restored"
        return "notification_deleted" if method == "DELETE" else "notification_action"
    if path.startswith("/api/v1/billing"):
        if path.endswith("/checkout"):
            return "billing_checkout_started"
        if path.endswith("/portal"):
            return "billing_portal_opened"
        if path.endswith("/redeem"):
            return "billing_code_redeemed"
        return "billing_action"
    if path == "/api/v1/support/contact":
        return "support_request_sent"
    return "app_action"


def save_user_activity(request: Request, action: str) -> None:
    session_token = request.cookies.get(settings.session_cookie_name)
    if not session_token:
        return
    override = request.app.dependency_overrides.get(get_db)
    db_generator = override() if override is not None else None
    db = next(db_generator) if db_generator is not None else SessionLocal()
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
        if db_generator is not None:
            db_generator.close()
        else:
            db.close()


def request_uses_demo_session(request: Request) -> bool:
    session_token = request.cookies.get(settings.session_cookie_name)
    if not session_token:
        return False
    override = request.app.dependency_overrides.get(get_db)
    db_generator = override() if override is not None else None
    db = next(db_generator) if db_generator is not None else SessionLocal()
    try:
        user_session = db.scalar(
            select(UserSession).where(UserSession.token_hash == hash_session_token(session_token))
        )
        if user_session is None:
            return False
        household = db.get(Household, user_session.active_household_id)
        return bool(household and household.is_demo)
    finally:
        if db_generator is not None:
            db_generator.close()
        else:
            db.close()


@app.middleware("http")
async def enforce_demo_read_only(request: Request, call_next):
    if (
        request.method not in {"GET", "HEAD", "OPTIONS"}
        and request.url.path not in DEMO_MUTATION_EXCEPTIONS
        and request_uses_demo_session(request)
    ):
        return JSONResponse(
            status_code=status.HTTP_403_FORBIDDEN,
            content={"detail": "Demo cellar is read-only"},
        )
    return await call_next(request)


@app.middleware("http")
async def collect_request_metrics(request: Request, call_next):
    if not is_application_request(request.url.path):
        return await call_next(request)
    started_at = time.perf_counter()
    response = await call_next(request)
    request_metrics.record(
        response.status_code,
        (time.perf_counter() - started_at) * 1000,
        interactive=is_interactive_application_request(request.url.path),
    )
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
