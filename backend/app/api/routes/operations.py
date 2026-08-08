from __future__ import annotations

import hmac
import json
import math
import re
import unicodedata
from datetime import UTC, datetime, timedelta
from typing import cast
from urllib.parse import parse_qsl, unquote, urlencode, urlsplit
from uuid import UUID

from fastapi import APIRouter, Depends, Header, HTTPException, Query, Request, Response, status
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field
from sqlalchemy import case, delete, func, select
from sqlalchemy.orm import Session

from app.api.deps import CurrentContext, get_optional_context, require_app_admin_context
from app.api.routes.ai import (
    available_model_options,
    create_ai_response,
    default_model_for_field,
    effective_response_model,
    get_or_create_user_ai_settings,
    model_pricing_usd_per_million_tokens,
    record_ai_audit,
    web_search_source_entries,
    web_search_tool_cost_usd,
    wine_lookup_context,
)
from app.api.routes.wines import PHOTO_SIZES, copy_wine_photo, wine_photo_path
from app.core.config import settings
from app.core.legal import LEGAL_DOCUMENT_VERSION
from app.core.security import hash_password, hash_session_token, new_session_token
from app.db.session import get_db
from app.models import (
    AiAuditLog,
    AppAiPricing,
    CoOwnershipAgreement,
    DemoWineSelection,
    Household,
    Membership,
    OperationalAlertState,
    OperationalMetricSample,
    User,
    UserActivityLog,
    UserMonitorDeviceToken,
    Wine,
    WineNewsArticle,
    WineNewsCollectionRun,
    WineNewsSource,
    WinePhotoLibraryEntry,
    WineRecognitionLog,
    WineTastingEntry,
    WineValueHistory,
    WishlistItem,
)
from app.prompts import wine_vineyard_location_prompt
from app.services.openai_client import parse_json_response
from app.services.openai_costs import organization_cost_summary, unavailable_summary
from app.services.openai_pricing import official_standard_pricing
from app.services.operational_alerts import evaluate_operational_alerts
from app.services.operational_metrics import system_snapshot
from app.services.request_metrics import request_metrics
from app.services.wine_photo_library import archive_wine_photo, library_photo_path

router = APIRouter(prefix="/admin/operations")

SAMPLE_RETENTION = timedelta(days=14)


class ManualVineyardLocation(BaseModel):
    latitude: float = Field(ge=-90, le=90)
    longitude: float = Field(ge=-180, le=180)
    vineyard_name: str | None = Field(default=None, max_length=240)
    locality: str | None = Field(default=None, max_length=240)
    country: str | None = Field(default=None, max_length=120)
    notes: str | None = Field(default=None, max_length=1000)


def app_ai_pricing(db: Session) -> AppAiPricing | None:
    return db.get(AppAiPricing, 1)


def admin_price_book(db: Session) -> dict[str, dict[str, str]]:
    """Expose prices only for models selectable in the current deployment.

    Legacy prices can remain in the server-side fallback accounting table, but
    app admins should not need to maintain them while the GPT-5.6 family is
    enabled.
    """
    price_book = model_pricing_usd_per_million_tokens(db)
    return {
        model: {field: str(amount) for field, amount in price_book[model].items()}
        for model in available_model_options()
        if model in price_book
    }


@router.get("/ai-pricing")
def get_ai_pricing(
    db: Session = Depends(get_db),
    _: CurrentContext = Depends(require_app_admin_context),
) -> dict[str, object]:
    stored = app_ai_pricing(db)
    return {
        "price_book": admin_price_book(db),
        "custom_price_book_json": stored.price_book_json if stored else "",
        "updated_at": stored.updated_at.isoformat() if stored else None,
    }


@router.put("/ai-pricing")
def save_ai_pricing(
    payload: dict[str, object],
    db: Session = Depends(get_db),
    _: CurrentContext = Depends(require_app_admin_context),
) -> dict[str, object]:
    raw_price_book = str(payload.get("price_book_json") or "").strip()
    stored = app_ai_pricing(db)
    if stored is None:
        stored = AppAiPricing(id=1)
        db.add(stored)
    previous_value = stored.price_book_json
    stored.price_book_json = raw_price_book
    try:
        db.flush()
        model_pricing_usd_per_million_tokens(db)
    except HTTPException:
        stored.price_book_json = previous_value
        db.rollback()
        raise
    db.commit()
    db.refresh(stored)
    return {
        "price_book": admin_price_book(db),
        "custom_price_book_json": stored.price_book_json,
        "updated_at": stored.updated_at.isoformat(),
    }


@router.post("/ai-pricing/refresh-official")
def refresh_official_ai_pricing(
    db: Session = Depends(get_db),
    _: CurrentContext = Depends(require_app_admin_context),
) -> dict[str, object]:
    price_book = official_standard_pricing(list(admin_price_book(db)))
    return {
        "price_book_json": json.dumps(price_book, separators=(",", ":")),
        "source": "https://developers.openai.com/api/docs/pricing",
    }


def vineyard_identity(wine: Wine) -> tuple[str, str, str]:
    def normalize(value: object) -> str:
        return re.sub(r"\s+", " ", str(value or "").strip()).casefold()

    return normalize(wine.name), normalize(wine.producer), normalize(wine.vintage)


def vineyard_candidate(wine: Wine) -> dict[str, object]:
    return {
        "wine_id": str(wine.id),
        "name": wine.name,
        "producer": wine.producer,
        "vintage": wine.vintage,
        "region": wine.region,
        "appellation": wine.appellation,
        "vineyard_name": wine.vineyard_name,
        "locality": wine.vineyard_locality,
        "country": wine.vineyard_country,
        "latitude": wine.vineyard_latitude,
        "longitude": wine.vineyard_longitude,
        "precision": wine.vineyard_precision,
        "source_url": wine.vineyard_source_url,
        "source_title": wine.vineyard_source_title,
        "notes": wine.vineyard_notes,
    }


def vineyard_location_result(wine: Wine, *, updated_wines: int) -> dict[str, object]:
    found = wine.vineyard_latitude is not None and wine.vineyard_longitude is not None
    return {
        "status": "found" if found else "not_found",
        "updated_wines": updated_wines,
        "wine_id": str(wine.id),
        "vineyard_name": wine.vineyard_name,
        "locality": wine.vineyard_locality,
        "country": wine.vineyard_country,
        "latitude": wine.vineyard_latitude,
        "longitude": wine.vineyard_longitude,
        "precision": wine.vineyard_precision,
        "source_url": wine.vineyard_source_url,
        "source_title": wine.vineyard_source_title,
        "notes": wine.vineyard_notes,
    }


def canonical_source_url(value: object) -> str:
    """Normalize harmless URL variants while preserving the researched page identity."""
    raw_url = str(value or "").strip()
    if not raw_url:
        return ""
    try:
        parsed = urlsplit(raw_url)
        if parsed.scheme.casefold() not in {"http", "https"} or not parsed.hostname:
            return ""
        hostname = parsed.hostname.casefold().removeprefix("www.")
        port = parsed.port
    except ValueError:
        return ""
    authority = hostname
    if port and not (parsed.scheme.casefold() == "http" and port == 80) and not (
        parsed.scheme.casefold() == "https" and port == 443
    ):
        authority = f"{authority}:{port}"
    path = unicodedata.normalize("NFC", unquote(parsed.path)).rstrip("/") or "/"
    query_pairs = sorted(
        (key, value)
        for key, value in parse_qsl(parsed.query, keep_blank_values=True)
        if not key.casefold().startswith("utm_")
        and key.casefold() not in {"fbclid", "gclid", "mc_cid", "mc_eid"}
    )
    query = urlencode(query_pairs, doseq=True)
    return f"{authority}{path}{f'?{query}' if query else ''}"


@router.get("/vineyards")
def vineyard_research_queue(
    q: str = Query(default="", max_length=200),
    limit: int = Query(default=8, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db),
    _: CurrentContext = Depends(require_app_admin_context),
) -> dict[str, object]:
    wines = list(db.scalars(select(Wine).order_by(Wine.created_at.asc(), Wine.id.asc())))
    representatives: dict[tuple[str, str, str], Wine] = {}
    for wine in wines:
        representatives.setdefault(vineyard_identity(wine), wine)
    unique_wines = list(representatives.values())
    located = [wine for wine in unique_wines if wine.vineyard_latitude is not None and wine.vineyard_longitude is not None]
    precision_counts = {
        precision: sum(1 for wine in located if wine.vineyard_precision == precision)
        for precision in ("vineyard", "manual", "estate", "locality", "appellation")
    }
    not_found = [wine for wine in unique_wines if wine.vineyard_not_found]
    pending = [
        wine
        for wine in unique_wines
        if wine.vineyard_latitude is None and wine.vineyard_longitude is None and not wine.vineyard_not_found
    ]
    query = re.sub(r"\s+", " ", q.strip()).casefold()
    # A specific search also exposes previous no-results and located wines so an
    # administrator can retry them after research policy or source availability
    # changes. Bulk research remains limited to never-attempted wines to avoid
    # repeated costs.
    filtered = pending
    if query:
        filtered = [
            wine
            for wine in unique_wines
            if query
            in " ".join(
                (wine.name, wine.producer, wine.vintage, wine.region, wine.appellation)
            ).casefold()
        ]
    return {
        "total": len(unique_wines),
        "located": len(located),
        "precision_counts": precision_counts,
        "not_found": len(not_found),
        "pending": len(pending),
        "filtered": len(filtered),
        "limit": limit,
        "offset": offset,
        "candidates": [vineyard_candidate(wine) for wine in filtered[offset : offset + limit]],
    }


@router.post("/vineyards/{wine_id}/research")
def research_wine_vineyard(
    wine_id: UUID,
    locale: str = Query(default="it", pattern="^(it|en)$"),
    db: Session = Depends(get_db),
    context: CurrentContext = Depends(require_app_admin_context),
) -> dict[str, object]:
    wine = db.get(Wine, wine_id)
    if wine is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Wine not found")

    prompt = wine_vineyard_location_prompt(locale=locale, wine_context=wine_lookup_context(wine))
    schema = {
        "name": "wine_vineyard_location",
        "strict": True,
        "schema": {
            "type": "object",
            "properties": {
                "status": {"type": "string", "enum": ["found", "not_found"]},
                "vineyard_name": {"type": "string"},
                "locality": {"type": "string"},
                "country": {"type": "string"},
                "latitude": {"type": ["number", "null"]},
                "longitude": {"type": ["number", "null"]},
                "precision": {"type": "string", "enum": ["vineyard", "estate", "locality", "appellation", ""]},
                "source_url": {"type": "string"},
                "source_title": {"type": "string"},
                "notes": {"type": "string"},
            },
            "required": [
                "status", "vineyard_name", "locality", "country", "latitude", "longitude",
                "precision", "source_url", "source_title", "notes",
            ],
            "additionalProperties": False,
        },
    }
    user_settings = get_or_create_user_ai_settings(db, context)
    configured_model = default_model_for_field("ai_notes_model")
    response, provider_source = create_ai_response(
        db,
        context,
        user_settings,
        model=configured_model,
        system_prompt=prompt.system,
        user_prompt=prompt.user,
        json_schema=schema,
        web_search=True,
        web_search_use_default_location=False,
        web_search_context_size="low",
        reasoning_effort="low",
        max_output_tokens=2048,
        max_tool_calls=1,
        task_type="research",
        complexity="low",
        app_funded=True,
    )
    result = parse_json_response(response.text)
    identity = vineyard_identity(wine)
    matches = [candidate for candidate in db.scalars(select(Wine)) if vineyard_identity(candidate) == identity]
    source_url = str(result.get("source_url") or "").strip()
    canonical_result_source_url = canonical_source_url(source_url)
    verified_source = next(
        (
            source
            for source in response.web_sources
            if canonical_result_source_url
            and canonical_source_url(source.get("url")) == canonical_result_source_url
        ),
        None,
    )
    found = result.get("status") == "found"
    try:
        latitude = float(result["latitude"]) if result.get("latitude") is not None else None
        longitude = float(result["longitude"]) if result.get("longitude") is not None else None
    except (TypeError, ValueError) as exc:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail="AI returned invalid vineyard coordinates") from exc
    precision = str(result.get("precision") or "")
    if found and (
        latitude is None
        or longitude is None
        or not math.isfinite(latitude)
        or not math.isfinite(longitude)
        or not -90 <= latitude <= 90
        or not -180 <= longitude <= 180
        or precision not in {"vineyard", "estate", "locality", "appellation"}
        or verified_source is None
    ):
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail="AI did not return a defensible wine origin")

    verified_at = datetime.now(UTC) if found else None
    for candidate in matches:
        candidate.vineyard_name = str(result.get("vineyard_name") or "").strip()[:240] if found else ""
        candidate.vineyard_locality = str(result.get("locality") or "").strip()[:240] if found else ""
        candidate.vineyard_country = str(result.get("country") or "").strip()[:120] if found else ""
        candidate.vineyard_latitude = latitude if found else None
        candidate.vineyard_longitude = longitude if found else None
        candidate.vineyard_precision = precision if found else ""
        candidate.vineyard_source_url = source_url[:500] if found else ""
        candidate.vineyard_source_title = str(result.get("source_title") or verified_source.get("title") or "").strip()[:240] if found and verified_source else ""
        candidate.vineyard_notes = str(result.get("notes") or "").strip()[:1000]
        candidate.vineyard_verified_at = verified_at
        candidate.vineyard_not_found = not found

    model = effective_response_model(response, configured_model)
    record_ai_audit(
        db,
        context,
        entity_type="wine",
        entity_id=wine.id,
        feature="vineyard_location",
        model=model,
        summary=(
            f"{precision} location saved for {len(matches)} matching wine records"
            if found
            else f"No verifiable vineyard location found for {len(matches)} matching wine records"
        ),
        reasoning_effort=response.reasoning_effort or "",
        sources=web_search_source_entries(response.web_sources),
        usage=response.usage,
        provider_source=provider_source,
        extra_cost_usd=web_search_tool_cost_usd(response.web_search_calls),
    )
    db.commit()
    return vineyard_location_result(wine, updated_wines=len(matches))


@router.put("/vineyards/{wine_id}/location")
def save_manual_wine_vineyard_location(
    wine_id: UUID,
    payload: ManualVineyardLocation,
    db: Session = Depends(get_db),
    _: CurrentContext = Depends(require_app_admin_context),
) -> dict[str, object]:
    wine = db.get(Wine, wine_id)
    if wine is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Wine not found")

    identity = vineyard_identity(wine)
    matches = [candidate for candidate in db.scalars(select(Wine)) if vineyard_identity(candidate) == identity]
    positioned_at = datetime.now(UTC)
    for candidate in matches:
        candidate.vineyard_latitude = payload.latitude
        candidate.vineyard_longitude = payload.longitude
        candidate.vineyard_precision = "manual"
        if payload.vineyard_name is not None:
            candidate.vineyard_name = payload.vineyard_name.strip()
        if payload.locality is not None:
            candidate.vineyard_locality = payload.locality.strip()
        if payload.country is not None:
            candidate.vineyard_country = payload.country.strip()
        candidate.vineyard_notes = (
            payload.notes.strip()
            if payload.notes is not None
            else "Posizione impostata manualmente dall'amministratore."
        )
        candidate.vineyard_source_url = ""
        candidate.vineyard_source_title = ""
        candidate.vineyard_verified_at = positioned_at
        candidate.vineyard_not_found = False
    db.commit()
    return vineyard_location_result(wine, updated_wines=len(matches))


def require_operations_read_access(
    request: Request,
    db: Session = Depends(get_db),
    context: CurrentContext | None = Depends(get_optional_context),
) -> User:
    """Allow app-admin sessions or a revocable, read-only Monitor device token."""

    if context is not None and context.user.is_app_admin:
        return context.user
    authorization = request.headers.get("Authorization", "")
    token = authorization.removeprefix("Bearer ").strip()
    if not token:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Monitor authentication required")
    device_token = db.scalar(
        select(UserMonitorDeviceToken).where(
            UserMonitorDeviceToken.token_hash == hash_session_token(token),
            UserMonitorDeviceToken.revoked_at.is_(None),
        )
    )
    if device_token is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid monitor token")
    user = db.get(User, device_token.user_id)
    if user is None or not user.is_app_admin or user.is_blocked or not user.is_approved:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Monitor token is no longer authorised")
    return user


@router.get("/device-tokens")
def list_monitor_device_tokens(
    db: Session = Depends(get_db),
    context: CurrentContext = Depends(require_app_admin_context),
) -> list[dict[str, object]]:
    tokens = db.scalars(
        select(UserMonitorDeviceToken)
        .where(UserMonitorDeviceToken.user_id == context.user.id)
        .order_by(UserMonitorDeviceToken.created_at.desc())
    ).all()
    return [{
        "id": str(token.id), "label": token.label, "created_at": token.created_at.isoformat(),
        "last_used_at": token.last_used_at.isoformat() if token.last_used_at else None,
        "revoked_at": token.revoked_at.isoformat() if token.revoked_at else None,
    } for token in tokens]


@router.post("/device-tokens", status_code=status.HTTP_201_CREATED)
def create_monitor_device_token(
    label: str = Query(default="Vinaris Monitor", min_length=1, max_length=80),
    db: Session = Depends(get_db),
    context: CurrentContext = Depends(require_app_admin_context),
) -> dict[str, object]:
    raw_token = new_session_token()
    token = UserMonitorDeviceToken(
        user_id=context.user.id,
        token_hash=hash_session_token(raw_token),
        label=" ".join(label.split()) or "Vinaris Monitor",
    )
    db.add(token)
    db.commit()
    return {
        "id": str(token.id), "label": token.label, "token": raw_token,
        "created_at": token.created_at.isoformat(), "last_used_at": None, "revoked_at": None,
    }


@router.delete("/device-tokens/{token_id}", status_code=status.HTTP_204_NO_CONTENT)
def revoke_monitor_device_token(
    token_id: UUID,
    db: Session = Depends(get_db),
    context: CurrentContext = Depends(require_app_admin_context),
) -> Response:
    token = db.scalar(select(UserMonitorDeviceToken).where(
        UserMonitorDeviceToken.id == token_id, UserMonitorDeviceToken.user_id == context.user.id
    ))
    if token is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Monitor token not found")
    token.revoked_at = datetime.now(UTC)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/activity")
def recent_user_activity(
    limit: int = Query(default=40, ge=1, le=100),
    db: Session = Depends(get_db),
    _: User = Depends(require_operations_read_access),
) -> list[dict[str, str]]:
    entries = db.execute(
        select(UserActivityLog, User)
        .join(User, User.id == UserActivityLog.user_id)
        .order_by(UserActivityLog.created_at.desc())
        .limit(limit)
    ).all()
    return [
        {
            "id": str(entry.id),
            "action": entry.action,
            "created_at": entry.created_at.isoformat(),
            "user_display_name": user.display_name,
            "user_email": user.email,
        }
        for entry, user in entries
    ]


@router.get("/demo-activity")
def demo_activity_summary(
    db: Session = Depends(get_db),
    _: User = Depends(require_operations_read_access),
) -> dict[str, int | str | None]:
    now = datetime.now(UTC)
    demo_visit = UserActivityLog.action == "demo_cellar_visited"
    last_visit_at = db.scalar(select(func.max(UserActivityLog.created_at)).where(demo_visit))
    return {
        "total_visits": db.scalar(select(func.count()).select_from(UserActivityLog).where(demo_visit)) or 0,
        "visits_24h": db.scalar(
            select(func.count()).select_from(UserActivityLog).where(
                demo_visit, UserActivityLog.created_at >= now - timedelta(hours=24)
            )
        ) or 0,
        "visits_7d": db.scalar(
            select(func.count()).select_from(UserActivityLog).where(
                demo_visit, UserActivityLog.created_at >= now - timedelta(days=7)
            )
        ) or 0,
        "last_visit_at": last_visit_at.isoformat() if last_visit_at else None,
    }


def wine_pulse_snapshot(db: Session) -> dict[str, object]:
    latest_run = db.scalar(
        select(WineNewsCollectionRun)
        .order_by(WineNewsCollectionRun.started_at.desc())
        .limit(1)
    )
    source_counts = db.execute(
        select(
            func.coalesce(
                func.sum(case((WineNewsSource.enabled.is_(True), 1), else_=0)), 0
            ),
            func.coalesce(
                func.sum(
                    case(
                        (
                            WineNewsSource.enabled.is_(True)
                            & (WineNewsSource.last_error == ""),
                            1,
                        ),
                        else_=0,
                    )
                ),
                0,
            ),
            func.coalesce(
                func.sum(
                    case(
                        (
                            WineNewsSource.enabled.is_(True)
                            & (WineNewsSource.last_error != ""),
                            1,
                        ),
                        else_=0,
                    )
                ),
                0,
            ),
        )
    ).one()
    run_stats = latest_run.stats if latest_run and isinstance(latest_run.stats, dict) else {}

    def stat(name: str) -> int:
        value = run_stats.get(name, 0)
        return value if isinstance(value, int) else 0

    return {
        "enabled": settings.wine_pulse_enabled,
        "ai_enabled": settings.wine_pulse_ai_enabled,
        "published": db.scalar(
            select(func.count(WineNewsArticle.id)).where(WineNewsArticle.status == "published")
        )
        or 0,
        "active_sources": int(source_counts[0]),
        "healthy_sources": int(source_counts[1]),
        "failed_sources": int(source_counts[2]),
        "last_status": latest_run.status if latest_run else "not_started",
        "last_started_at": latest_run.started_at.isoformat() if latest_run else None,
        "last_completed_at": (
            latest_run.completed_at.isoformat() if latest_run and latest_run.completed_at else None
        ),
        "last_error": latest_run.error if latest_run else "",
        "last_run": {
            "fetched": stat("fetched"),
            "new": stat("new"),
            "ai_processed": stat("ai_processed"),
            "ai_errors": stat("ai_errors"),
            "published": stat("published"),
            "source_errors": stat("source_errors"),
        },
    }


def business_snapshot(db: Session) -> dict[str, object]:
    now = datetime.now(UTC)
    today = now.date()
    thirty_days_ago = now - timedelta(days=30)
    wine_status = func.lower(Wine.status)
    users = db.execute(
        select(
            func.count(User.id),
            func.coalesce(func.sum(case((User.is_approved.is_(True), 1), else_=0)), 0),
            func.coalesce(func.sum(case((User.is_blocked.is_(True), 1), else_=0)), 0),
            func.coalesce(
                func.sum(
                    case((User.is_approved.is_(True) & User.is_blocked.is_(False), 1), else_=0)
                ),
                0,
            ),
        )
    ).one()
    wines = db.execute(
        select(
            func.count(Wine.id),
            func.coalesce(func.sum(Wine.quantity), 0),
            func.coalesce(func.sum(case((wine_status == "delivered", Wine.quantity), else_=0)), 0),
            func.coalesce(func.sum(case((wine_status == "to collect", Wine.quantity), else_=0)), 0),
            func.coalesce(
                func.sum(
                    case(
                        (
                            (Wine.expected_delivery >= today)
                            & wine_status.not_in(("delivered", "consumed")),
                            Wine.quantity,
                        ),
                        else_=0,
                    )
                ),
                0,
            ),
        )
    ).one()
    tastings = db.execute(
        select(
            func.count(WineTastingEntry.id),
            func.coalesce(
                func.sum(
                    case((WineTastingEntry.consumed_at >= thirty_days_ago.date(), 1), else_=0)
                ),
                0,
            ),
        )
    ).one()
    ai_usage = db.execute(
        select(
            func.count(AiAuditLog.id),
            func.coalesce(func.sum(case((AiAuditLog.outcome == "success", 1), else_=0)), 0),
        ).where(AiAuditLog.created_at >= thirty_days_ago)
    ).one()
    wine_name_searches = db.execute(
        select(
            func.count(AiAuditLog.id),
            func.coalesce(func.sum(AiAuditLog.estimated_cost_usd), 0),
        ).where(
            AiAuditLog.created_at >= thirty_days_ago,
            AiAuditLog.feature == "wine_name_search",
            AiAuditLog.outcome == "success",
        )
    ).one()
    recognitions = db.execute(
        select(
            func.count(WineRecognitionLog.id),
            func.coalesce(
                func.sum(
                    case(
                        (WineRecognitionLog.status.in_({"success", "recognized"}), 1),
                        else_=0,
                    )
                ),
                0,
            ),
        ).where(WineRecognitionLog.created_at >= thirty_days_ago)
    ).one()
    agreements = db.execute(
        select(
            func.coalesce(
                func.sum(case((CoOwnershipAgreement.status == "accepted", 1), else_=0)), 0
            ),
            func.coalesce(
                func.sum(case((CoOwnershipAgreement.status == "pending", 1), else_=0)), 0
            ),
        )
    ).one()
    household_inventory = db.execute(
        select(
            Household.name,
            Household.is_demo,
            func.count(Wine.id),
            func.coalesce(func.sum(Wine.quantity), 0),
        )
        .select_from(Household)
        .outerjoin(Wine, Wine.household_id == Household.id)
        .group_by(Household.id, Household.name, Household.is_demo)
        .order_by(func.coalesce(func.sum(Wine.quantity), 0).desc(), Household.name.asc())
    ).all()
    return {
        "users_total": users[0],
        "users_approved": users[1],
        "users_blocked": users[2],
        "users_enabled": users[3],
        "households_total": db.scalar(select(func.count()).select_from(Household)) or 0,
        "household_inventory": [
            {
                "name": name,
                "is_demo": is_demo,
                "wine_records": wine_records,
                "bottles": bottles,
            }
            for name, is_demo, wine_records, bottles in household_inventory
        ],
        "wines_total": wines[0],
        "bottles_total": wines[1],
        "bottles_in_cellar": wines[2],
        "bottles_to_collect": wines[3],
        "bottles_in_future_deliveries": wines[4],
        "tastings_total": tastings[0],
        "tastings_30d": tastings[1],
        "wishlist_items_total": db.scalar(select(func.count()).select_from(WishlistItem)) or 0,
        "ai_requests_30d": ai_usage[0],
        "ai_successes_30d": ai_usage[1],
        "wine_name_searches_30d": wine_name_searches[0],
        "wine_name_search_cost_30d_usd": float(wine_name_searches[1]),
        "wine_photos_total": db.scalar(
            select(func.count()).select_from(Wine).where(Wine.photo_version != "")
        )
        or 0,
        "label_recognitions_30d": recognitions[0],
        "label_recognition_successes_30d": recognitions[1],
        "coownership_active": agreements[0],
        "coownership_pending": agreements[1],
        "wine_pulse": wine_pulse_snapshot(db),
    }


def sample_response(sample: OperationalMetricSample) -> dict[str, object]:
    return {
        "collected_at": sample.collected_at.isoformat(),
        "system": sample.system,
        "application": sample.application,
        "business": sample.business,
        "openai": sample.openai or unavailable_summary(),
    }


def active_alerts_snapshot(db: Session) -> list[dict[str, object]]:
    labels = {
        "cpu": ("CPU", "%"),
        "memory": ("RAM", "%"),
        "disk": ("Disco", "%"),
        "conntrack": ("Conntrack", "%"),
        "latency": ("P95 API interattive", " ms"),
    }
    states = db.scalars(
        select(OperationalAlertState).order_by(
            OperationalAlertState.severity.asc(),
            OperationalAlertState.opened_at.asc(),
        )
    ).all()
    return [
        {
            "metric": state.metric,
            "label": labels.get(state.metric, (state.metric.replace("_", " ").title(), ""))[0],
            "value": state.last_value,
            "suffix": labels.get(state.metric, ("", ""))[1],
            "severity": state.severity,
            "opened_at": state.opened_at.isoformat(),
            "last_notified_at": (
                state.last_notified_at.isoformat() if state.last_notified_at else None
            ),
        }
        for state in states
    ]


def save_sample(db: Session, system: dict[str, object], now: datetime) -> None:
    application = cast(dict[str, object], request_metrics.snapshot())
    db.add(
        OperationalMetricSample(
            collected_at=now,
            system=system,
            application=application,
            business=business_snapshot(db),
            openai=organization_cost_summary(),
        )
    )
    db.execute(
        delete(OperationalMetricSample).where(
            OperationalMetricSample.collected_at < now - SAMPLE_RETENTION
        )
    )
    evaluate_operational_alerts(db, system=system, application=application, now=now)
    db.commit()


@router.get("/overview")
def operations_overview(
    db: Session = Depends(get_db),
    _: User = Depends(require_operations_read_access),
) -> dict[str, object]:
    latest = db.scalar(
        select(OperationalMetricSample)
        .order_by(OperationalMetricSample.collected_at.desc())
        .limit(1)
    )
    # The collector already refreshes this data every five minutes.  Reusing the
    # latest aggregate keeps this endpoint a single indexed lookup instead of
    # recalculating statistics across all operational tables on every opening.
    # A first install still gets a usable initial sample without waiting for the
    # first systemd timer run.
    if latest is None or not isinstance(latest.business, dict) or "wine_pulse" not in latest.business:
        now = datetime.now(UTC)
        save_sample(db, system_snapshot(), now)
        latest = db.scalar(
            select(OperationalMetricSample)
            .order_by(OperationalMetricSample.collected_at.desc())
            .limit(1)
        )

    assert latest is not None
    return {
        **sample_response(latest),
        "active_alerts": active_alerts_snapshot(db),
        "history_retention_days": SAMPLE_RETENTION.days,
    }


@router.get("/history")
def operations_history(
    hours: int = Query(default=1, ge=1, le=168),
    db: Session = Depends(get_db),
    _: User = Depends(require_operations_read_access),
) -> dict[str, object]:
    cutoff = datetime.now(UTC) - timedelta(hours=hours)
    samples = db.scalars(
        select(OperationalMetricSample)
        .where(OperationalMetricSample.collected_at >= cutoff)
        .order_by(OperationalMetricSample.collected_at)
        .limit(2048)
    ).all()
    return {"hours": hours, "samples": [sample_response(sample) for sample in samples]}


@router.post("/collect-now", status_code=status.HTTP_204_NO_CONTENT)
def collect_operations_sample_now(
    db: Session = Depends(get_db),
    _: User = Depends(require_operations_read_access),
) -> Response:
    """Collect a fresh sample when an authorised Monitor user explicitly refreshes."""
    save_sample(db, system_snapshot(), datetime.now(UTC))
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/photos")
def list_wine_photos(
    limit: int = Query(default=100, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db),
    _: CurrentContext = Depends(require_app_admin_context),
) -> dict[str, object]:
    rows = db.execute(
        select(WinePhotoLibraryEntry, Household.name)
        .outerjoin(Wine, Wine.id == WinePhotoLibraryEntry.source_wine_id)
        .outerjoin(Household, Household.id == Wine.household_id)
        .order_by(WinePhotoLibraryEntry.name, WinePhotoLibraryEntry.producer, WinePhotoLibraryEntry.created_at.desc())
    ).all()
    unique_rows: list[tuple[WinePhotoLibraryEntry, str | None]] = []
    seen_identities: set[tuple[str, str]] = set()
    for photo, household_name in rows:
        identity = (photo.normalized_name, photo.normalized_producer)
        if identity in seen_identities:
            continue
        seen_identities.add(identity)
        unique_rows.append((photo, household_name))
    total = len(unique_rows)
    page = unique_rows[offset:offset + limit]
    return {
        "total": total,
        "items": [
            {
                "wine_id": str(photo.id),
                "name": photo.name,
                "producer": photo.producer,
                "vintage": "",
                "household_name": household_name or "Shared photo library",
                "thumbnail_url": f"/api/v1/admin/operations/photos/{photo.id}/thumbnail?v={photo.photo_version}",
                "detail_url": f"/api/v1/admin/operations/photos/{photo.id}/detail?v={photo.photo_version}",
            }
            for photo, household_name in page
        ],
    }


@router.post("/photos/sync-library")
def sync_wine_photo_library(
    db: Session = Depends(get_db),
    _: CurrentContext = Depends(require_app_admin_context),
) -> dict[str, int]:
    """Index legacy bottle photos from real cellars in the shared photo library."""

    before = db.scalar(select(func.count()).select_from(WinePhotoLibraryEntry)) or 0
    wines = db.scalars(
        select(Wine)
        .join(Household, Household.id == Wine.household_id)
        .where(Wine.photo_version != "", Household.is_demo.is_(False))
    )
    processed = 0
    for wine in wines:
        if archive_wine_photo(db, wine) is not None:
            processed += 1
    db.commit()
    total = db.scalar(select(func.count()).select_from(WinePhotoLibraryEntry)) or 0
    return {"processed": processed, "added": total - before, "total": total}


def demo_household(db: Session) -> Household | None:
    return db.scalar(select(Household).where(Household.is_demo.is_(True)))


def ensure_demo_principals(db: Session) -> Household:
    household = demo_household(db)
    if household is None:
        household = Household(name="Vinaris Demo · Collector Cellar", is_demo=True)
        db.add(household)
        db.flush()
    now = datetime.now(UTC)
    for locale in ("it", "en"):
        email = f"demo-{locale}@internal.vinaris.app"
        user = db.scalar(select(User).where(User.email == email))
        if user is None:
            user = User(
                email=email,
                display_name="Ospite demo" if locale == "it" else "Demo guest",
                password_hash=hash_password(new_session_token()),
                is_approved=True,
                approved_at=now,
                email_verified_at=now,
                locale=locale,
                theme_preference="atelier",
                dashboard_focus="collector",
                privacy_policy_accepted_at=now,
                privacy_policy_version=LEGAL_DOCUMENT_VERSION,
                terms_accepted_at=now,
                terms_version=LEGAL_DOCUMENT_VERSION,
                legal_acceptance_locale=locale,
            )
            db.add(user)
            db.flush()
        else:
            user.theme_preference = "atelier"
        membership = db.scalar(
            select(Membership).where(
                Membership.user_id == user.id,
                Membership.household_id == household.id,
            )
        )
        if membership is None:
            db.add(Membership(user_id=user.id, household_id=household.id, role="viewer", visibility_scope="all"))
    db.flush()
    return household


@router.get("/demo-cellar")
def get_demo_cellar(
    db: Session = Depends(get_db),
    context: CurrentContext = Depends(require_app_admin_context),
) -> dict[str, object]:
    candidates = list(db.scalars(
        select(Wine)
        .where(Wine.household_id == context.household.id, Wine.photo_version != "")
        .order_by(Wine.name, Wine.vintage.desc())
        .limit(250)
    ))
    selected_ids = set(db.scalars(
        select(DemoWineSelection.source_wine_id)
        .join(Wine, Wine.id == DemoWineSelection.source_wine_id)
        .where(Wine.household_id == context.household.id)
    ))
    household = demo_household(db)
    published_count = 0
    if household is not None:
        published_count = db.scalar(
            select(func.count()).select_from(Wine).where(Wine.household_id == household.id)
        ) or 0
    return {
        "published_count": published_count,
        "selected_wine_ids": [str(wine.id) for wine in candidates if wine.id in selected_ids],
        "candidates": [
            {
                "wine_id": str(wine.id),
                "name": wine.name,
                "producer": wine.producer,
                "vintage": wine.vintage,
                "quantity": wine.quantity,
                "type": wine.type,
                "thumbnail_url": f"/api/v1/admin/operations/photos/{wine.id}/thumbnail?v={wine.photo_version}",
            }
            for wine in candidates
        ],
    }


@router.put("/demo-cellar")
def publish_demo_cellar(
    payload: dict[str, object],
    db: Session = Depends(get_db),
    context: CurrentContext = Depends(require_app_admin_context),
) -> dict[str, object]:
    raw_ids = payload.get("wine_ids")
    if not isinstance(raw_ids, list) or not 1 <= len(raw_ids) <= 75:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, detail="Select between 1 and 75 demo wines")
    try:
        requested_ids = list(dict.fromkeys(UUID(str(value)) for value in raw_ids))
    except (TypeError, ValueError) as error:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, detail="Invalid demo wine selection") from error
    sources = list(db.scalars(
        select(Wine).where(
            Wine.id.in_(requested_ids),
            Wine.household_id == context.household.id,
            Wine.photo_version != "",
        )
    ))
    source_by_id = {wine.id: wine for wine in sources}
    if len(source_by_id) != len(requested_ids):
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, detail="Every demo wine must belong to the active cellar and have a photograph")
    for source in sources:
        if not all(wine_photo_path(source, size).is_file() for size in PHOTO_SIZES):
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, detail=f"Bottle photo files are missing for {source.name}")

    household = ensure_demo_principals(db)
    old_demo_wines = list(db.scalars(select(Wine).where(Wine.household_id == household.id)))
    db.execute(delete(DemoWineSelection))
    for wine in old_demo_wines:
        for size in PHOTO_SIZES:
            wine_photo_path(wine, size).unlink(missing_ok=True)
        db.delete(wine)
    db.flush()

    demo_user = db.scalar(
        select(User)
        .join(Membership, Membership.user_id == User.id)
        .where(Membership.household_id == household.id, User.email == "demo-it@internal.vinaris.app")
    )
    if demo_user is None:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Unable to prepare demo cellar")

    for source_id in requested_ids:
        source = source_by_id[source_id]
        demo_wine = Wine(
            household_id=household.id,
            created_by_user_id=demo_user.id,
            name=source.name,
            producer=source.producer,
            vintage=source.vintage,
            quantity=source.quantity,
            currency=source.currency,
            price=source.price,
            current_value=source.current_value,
            value_not_found=source.value_not_found,
            status=source.status,
            format=source.format,
            type=source.type,
            region=source.region,
            appellation=source.appellation,
            order_date=source.order_date,
            expected_delivery=source.expected_delivery,
            owner_share_pct=100,
            drink_from=source.drink_from,
            drink_peak_from=source.drink_peak_from,
            drink_peak_to=source.drink_peak_to,
            drink_to=source.drink_to,
            rating=source.rating,
            grapes=source.grapes,
            grapes_source_url=source.grapes_source_url,
            grapes_source_title=source.grapes_source_title,
            grapes_verified_at=source.grapes_verified_at,
            grapes_not_applicable=source.grapes_not_applicable,
            scores=source.scores,
            scores_not_applicable=source.scores_not_applicable,
            vineyard_name=source.vineyard_name,
            vineyard_locality=source.vineyard_locality,
            vineyard_country=source.vineyard_country,
            vineyard_latitude=source.vineyard_latitude,
            vineyard_longitude=source.vineyard_longitude,
            vineyard_precision=source.vineyard_precision,
            vineyard_source_url=source.vineyard_source_url,
            vineyard_source_title=source.vineyard_source_title,
            vineyard_notes=source.vineyard_notes,
            vineyard_verified_at=source.vineyard_verified_at,
            vineyard_not_found=source.vineyard_not_found,
            owners=[],
            tags=[],
            notes="",
            ai_notes="",
            drink_window_notes="",
            ai_value_notes="",
            tasting_history=[],
            created_at=source.created_at,
        )
        db.add(demo_wine)
        db.flush()
        copy_wine_photo(source, demo_wine)
        db.add(DemoWineSelection(source_wine_id=source.id, demo_wine_id=demo_wine.id))
        histories = db.scalars(
            select(WineValueHistory).where(WineValueHistory.wine_id == source.id).order_by(WineValueHistory.recorded_at)
        )
        for history in histories:
            db.add(WineValueHistory(
                wine_id=demo_wine.id,
                value=history.value,
                currency=history.currency,
                source="demo",
                recorded_at=history.recorded_at,
            ))
    db.commit()
    return {"published_count": len(requested_ids), "selected_wine_ids": [str(value) for value in requested_ids]}


@router.get("/photos/{wine_id}/{size}", response_class=FileResponse)
def get_wine_photo(
    wine_id: UUID,
    size: str,
    db: Session = Depends(get_db),
    _: CurrentContext = Depends(require_app_admin_context),
) -> FileResponse:
    if size not in PHOTO_SIZES:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Bottle photo not found")
    library_photo = db.get(WinePhotoLibraryEntry, wine_id)
    if library_photo is not None:
        path = library_photo_path(library_photo, size)
        if not path.is_file():
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Bottle photo not found")
        return FileResponse(
            path,
            media_type="image/png",
            headers={"Cache-Control": "private, max-age=31536000, immutable"},
        )
    wine = db.get(Wine, wine_id)
    if wine is None or not wine.photo_version:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Bottle photo not found")
    path = wine_photo_path(wine, size)
    if not path.is_file():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Bottle photo not found")
    return FileResponse(
        path,
        media_type="image/png",
        headers={"Cache-Control": "private, max-age=31536000, immutable"},
    )


@router.delete("/photos/{wine_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_wine_photo(
    wine_id: UUID,
    db: Session = Depends(get_db),
    _: CurrentContext = Depends(require_app_admin_context),
) -> Response:
    library_photo = db.get(WinePhotoLibraryEntry, wine_id)
    if library_photo is not None:
        matching_photos = list(db.scalars(
            select(WinePhotoLibraryEntry).where(
                WinePhotoLibraryEntry.normalized_name == library_photo.normalized_name,
                WinePhotoLibraryEntry.normalized_producer == library_photo.normalized_producer,
            )
        ))
        for photo in matching_photos:
            for size in PHOTO_SIZES:
                library_photo_path(photo, size).unlink(missing_ok=True)
            db.delete(photo)
        db.commit()
        return Response(status_code=status.HTTP_204_NO_CONTENT)
    wine = db.get(Wine, wine_id)
    if wine is None or not wine.photo_version:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Bottle photo not found")
    for size in PHOTO_SIZES:
        wine_photo_path(wine, size).unlink(missing_ok=True)
    wine.photo_version = ""
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/collect", status_code=status.HTTP_204_NO_CONTENT)
def collect_operations_sample(
    payload: dict[str, object],
    x_operations_collector_token: str = Header(default=""),
    db: Session = Depends(get_db),
) -> Response:
    expected = settings.operations_collector_token
    if not expected or not hmac.compare_digest(x_operations_collector_token, expected):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid operations collector token"
        )
    save_sample(db, payload, datetime.now(UTC))
    return Response(status_code=status.HTTP_204_NO_CONTENT)
