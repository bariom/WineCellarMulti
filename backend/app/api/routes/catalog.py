from __future__ import annotations

import json
import logging
import re
import time
import uuid
from datetime import UTC, datetime
from pathlib import Path
from typing import Literal

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile, status
from sqlalchemy import delete, func, or_, select
from sqlalchemy.orm import Session

from app.api.deps import CurrentContext, get_current_context, require_write_context
from app.core.config import settings
from app.core.wine_types import CANONICAL_WINE_TYPES, normalize_wine_type
from app.db.session import get_db
from app.models import (
    SharedWineIdentity,
    Wine,
    WineCatalogAlias,
    WineCatalogEntry,
    WineRecognitionLog,
    WineSensoryProfile,
)
from app.schemas.catalog import (
    CatalogWineCreate,
    CatalogWineResponse,
    WineImageRecognitionCandidate,
    WineImageRecognitionConfirmation,
    WineImageRecognitionConfirmationResponse,
    WineImageRecognitionResponse,
)
from app.services.openai_client import OpenAIResponse
from app.services.shared_wine_data import normalize_identity_part
from app.services.taste_profiles import (
    generate_wine_sensory_profile,
    mark_wine_for_sensory_enrichment,
    sensory_profile_for_wine,
    validated_dimensions,
)
from app.services.wine_image_recognition import recognize_wine_from_image

router = APIRouter()
logger = logging.getLogger(__name__)
CATALOG_PATH = Path(__file__).resolve().parents[2] / "wine_catalog.json"


def normalize_catalog_text(value: str) -> str:
    return re.sub(r"\s+", " ", value.strip().lower())


def build_search_text(*parts: str) -> str:
    return normalize_catalog_text(" ".join(part for part in parts if part))


def ensure_app_admin(context: CurrentContext) -> None:
    if not context.user.is_app_admin:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Application admin access required")


def has_complementary_catalog_data(data: dict) -> bool:
    return any(str(data.get(field) or "").strip() for field in ("producer", "region", "appellation", "type", "country", "grapes_text"))


def session_has_catalog_alias(db: Session, normalized_alias: str) -> bool:
    return any(
        isinstance(item, WineCatalogAlias) and item.normalized_alias == normalized_alias
        for item in db.new
    )


def add_catalog_alias_if_missing(db: Session, entry: WineCatalogEntry, alias: str, *, source: str) -> None:
    normalized = normalize_catalog_text(alias)
    if not normalized or session_has_catalog_alias(db, normalized):
        return
    if db.scalar(select(WineCatalogAlias.id).where(WineCatalogAlias.normalized_alias == normalized)) is not None:
        return
    db.add(WineCatalogAlias(catalog_entry_id=entry.id, alias=alias, normalized_alias=normalized, source=source, created_at=datetime.now(UTC)))


def catalog_response(entry: WineCatalogEntry) -> CatalogWineResponse:
    return CatalogWineResponse(
        id=entry.id,
        name=entry.name,
        producer=entry.producer,
        region=entry.region,
        appellation=entry.appellation,
        type=normalize_wine_type(entry.type),
        format=entry.format,
        country=entry.country,
        grapes_text=entry.grapes_text,
        source=entry.source,
        is_active=entry.is_active,
    )


def validate_available_sensory_profiles_for_catalog_entry(
    db: Session,
    entry: WineCatalogEntry,
    *,
    modified_by_user_id: uuid.UUID,
) -> int:
    """Validate complete profiles for every vintage of an approved catalog wine."""
    normalized_name = normalize_identity_part(entry.name)
    normalized_producer = normalize_identity_part(entry.producer)
    if not normalized_name or not normalized_producer:
        return 0

    profiles = db.scalars(
        select(WineSensoryProfile)
        .join(SharedWineIdentity, SharedWineIdentity.id == WineSensoryProfile.identity_id)
        .where(
            SharedWineIdentity.normalized_name == normalized_name,
            SharedWineIdentity.normalized_producer == normalized_producer,
            WineSensoryProfile.generation_status == "available",
            WineSensoryProfile.validated.is_(False),
        )
    )
    validated = 0
    for profile in profiles:
        if not validated_dimensions(profile.dimensions):
            continue
        profile.validated = True
        profile.last_modified_by_user_id = modified_by_user_id
        validated += 1
    return validated


def ensure_catalog_seeded(db: Session) -> None:
    if db.scalar(select(WineCatalogEntry.id).limit(1)) is not None:
        return
    raw_catalog = json.loads(CATALOG_PATH.read_text(encoding="utf-8"))
    if not isinstance(raw_catalog, list):
        raise RuntimeError("Wine catalog must be a JSON list")
    seen_aliases: set[str] = set()
    for item in raw_catalog:
        if not isinstance(item, dict):
            continue
        name = str(item.get("name") or "").strip()
        if not name:
            continue
        producer = str(item.get("producer") or "").strip()
        region = str(item.get("region") or "").strip()
        appellation = str(item.get("appellation") or "").strip()
        wine_type = normalize_wine_type(str(item.get("type") or "").strip())
        bottle_format = str(item.get("format") or "").strip()
        entry = WineCatalogEntry(
            name=name,
            producer=producer,
            region=region,
            appellation=appellation,
            type=wine_type,
            format=bottle_format,
            source="json_seed",
            search_text=build_search_text(name, producer, region, appellation, wine_type),
            created_at=datetime.now(UTC),
            updated_at=datetime.now(UTC),
        )
        db.add(entry)
        db.flush()
        for alias in {name, f"{producer} {name}".strip()}:
            normalized = normalize_catalog_text(alias)
            if not normalized or normalized in seen_aliases:
                continue
            seen_aliases.add(normalized)
            db.add(WineCatalogAlias(catalog_entry_id=entry.id, alias=alias, normalized_alias=normalized, source="json_seed", created_at=datetime.now(UTC)))
    db.commit()


def search_catalog_entries(db: Session, query: str, limit: int) -> list[WineCatalogEntry]:
    ensure_catalog_seeded(db)
    normalized = normalize_catalog_text(query)
    statement = select(WineCatalogEntry).where(WineCatalogEntry.is_active.is_(True))
    if normalized:
        like = f"%{normalized}%"
        statement = (
            statement.outerjoin(WineCatalogAlias, WineCatalogAlias.catalog_entry_id == WineCatalogEntry.id)
            .where(
                or_(
                    func.lower(WineCatalogEntry.name).like(like),
                    func.lower(WineCatalogEntry.producer).like(like),
                    func.lower(WineCatalogEntry.region).like(like),
                    func.lower(WineCatalogEntry.appellation).like(like),
                    func.lower(WineCatalogEntry.search_text).like(like),
                    WineCatalogAlias.normalized_alias.like(like),
                ),
            )
            .distinct()
        )
    return list(db.scalars(statement.order_by(WineCatalogEntry.name.asc()).limit(limit)))


def search_all_catalog_entries(db: Session, query: str, limit: int) -> list[WineCatalogEntry]:
    ensure_catalog_seeded(db)
    normalized = normalize_catalog_text(query)
    statement = select(WineCatalogEntry)
    if normalized:
        like = f"%{normalized}%"
        statement = (
            statement.outerjoin(WineCatalogAlias, WineCatalogAlias.catalog_entry_id == WineCatalogEntry.id)
            .where(
                or_(
                    func.lower(WineCatalogEntry.name).like(like),
                    func.lower(WineCatalogEntry.producer).like(like),
                    func.lower(WineCatalogEntry.region).like(like),
                    func.lower(WineCatalogEntry.appellation).like(like),
                    func.lower(WineCatalogEntry.search_text).like(like),
                    WineCatalogAlias.normalized_alias.like(like),
                ),
            )
            .distinct()
        )
    return list(db.scalars(statement.order_by(WineCatalogEntry.is_active.asc(), WineCatalogEntry.name.asc()).limit(limit)))


def ensure_catalog_entry_for_wine_data(db: Session, data: dict, *, source: str = "user_saved") -> WineCatalogEntry | None:
    name = str(data.get("name") or "").strip()
    if not name:
        return None
    if not has_complementary_catalog_data(data):
        return None
    producer = str(data.get("producer") or "").strip()
    aliases = {name, f"{producer} {name}".strip()}
    identity_aliases = [f"{producer} {name}".strip()] if producer else [name]
    for alias in identity_aliases:
        normalized = normalize_catalog_text(alias)
        if not normalized:
            continue
        existing = db.scalar(
            select(WineCatalogEntry)
            .join(WineCatalogAlias, WineCatalogAlias.catalog_entry_id == WineCatalogEntry.id)
            .where(WineCatalogAlias.normalized_alias == normalized),
        )
        if existing is not None:
            if existing.is_active and source == "confirmed_recognition":
                return existing
            changed = False
            for field in ("producer", "region", "appellation", "type", "format", "country", "grapes_text"):
                next_value = str(data.get(field) or "").strip()
                if field == "type":
                    next_value = normalize_wine_type(next_value)
                if next_value and not getattr(existing, field):
                    setattr(existing, field, next_value)
                    changed = True
            if changed:
                existing.search_text = build_search_text(existing.name, existing.producer, existing.region, existing.appellation, existing.type, existing.country, existing.grapes_text)
                existing.updated_at = datetime.now(UTC)
            return existing

    entry = WineCatalogEntry(
        name=name,
        producer=producer,
        region=str(data.get("region") or "").strip(),
        appellation=str(data.get("appellation") or "").strip(),
        type=normalize_wine_type(str(data.get("type") or "").strip()),
        format=str(data.get("format") or "").strip(),
        country=str(data.get("country") or "").strip(),
        grapes_text=str(data.get("grapes_text") or "").strip(),
        source=source,
        is_active=False,
        search_text=build_search_text(name, producer, str(data.get("region") or ""), str(data.get("appellation") or ""), normalize_wine_type(str(data.get("type") or "")), str(data.get("country") or ""), str(data.get("grapes_text") or "")),
        created_at=datetime.now(UTC),
        updated_at=datetime.now(UTC),
    )
    db.add(entry)
    db.flush()
    for alias in aliases:
        add_catalog_alias_if_missing(db, entry, alias, source=source)
    return entry


def confirmed_candidate_catalog_data(
    candidate: WineImageRecognitionCandidate,
) -> dict[str, str] | None:
    producer = (candidate.producer or candidate.estate).strip()
    cuvee = candidate.cuvee.strip()
    wine_name = candidate.wine_name.strip()
    if cuvee and cuvee.casefold() not in wine_name.casefold():
        wine_name = " ".join(part for part in (wine_name, cuvee) if part)
    name = wine_name or candidate.appellation.strip()
    if not producer or not name:
        return None
    return {
        "name": name[:200],
        "producer": producer[:200],
        "vintage": candidate.vintage.strip()[:16],
        "region": candidate.region.strip()[:120],
        "appellation": candidate.appellation.strip()[:120],
        "country": candidate.country.strip()[:120],
        "type": normalize_wine_type(candidate.wine_type),
        "format": "",
        "grapes_text": "",
    }


def create_confirmed_recognition_sensory_profile(
    db: Session,
    data: dict[str, str],
    catalog_entry: WineCatalogEntry,
    *,
    user_id: uuid.UUID,
) -> tuple[Literal["available", "pending", "skipped"], str]:
    if not data["vintage"]:
        return "skipped", ""
    wine = Wine(
        name=data["name"],
        producer=data["producer"],
        vintage=data["vintage"],
        type=catalog_entry.type,
        region=data["region"] or catalog_entry.region,
        appellation=data["appellation"] or catalog_entry.appellation,
        grapes=[
            {"name": grape.strip()}
            for grape in re.split(r"[,;/]+", catalog_entry.grapes_text)
            if grape.strip()
        ],
        shared_identity_id=None,
    )
    profile = generate_wine_sensory_profile(db, wine, modified_by_user_id=user_id)
    if profile is None:
        mark_wine_for_sensory_enrichment(db, wine)
        db.flush()
        profile = sensory_profile_for_wine(db, wine)
    if profile is None:
        return "skipped", ""
    profile_status: Literal["available", "pending"] = (
        "available" if profile.generation_status == "available" else "pending"
    )
    return profile_status, profile.source


@router.get("/catalog", response_model=list[CatalogWineResponse])
def list_wine_catalog(
    q: str = Query(default="", max_length=120),
    limit: int = Query(default=25, ge=1, le=100),
    db: Session = Depends(get_db),
    context: CurrentContext = Depends(get_current_context),
) -> list[CatalogWineResponse]:
    return [catalog_response(entry) for entry in search_catalog_entries(db, q, limit)]


@router.get("/catalog/pending", response_model=list[CatalogWineResponse])
def list_pending_wine_catalog_entries(
    limit: int = Query(default=100, ge=1, le=500),
    db: Session = Depends(get_db),
    context: CurrentContext = Depends(require_write_context),
) -> list[CatalogWineResponse]:
    ensure_app_admin(context)
    ensure_catalog_seeded(db)
    entries = db.scalars(
        select(WineCatalogEntry)
        .where(WineCatalogEntry.is_active.is_(False))
        .order_by(WineCatalogEntry.updated_at.desc(), WineCatalogEntry.created_at.desc())
        .limit(limit),
    )
    return [catalog_response(entry) for entry in entries]


@router.get("/catalog/admin", response_model=list[CatalogWineResponse])
def list_admin_wine_catalog_entries(
    q: str = Query(default="", max_length=120),
    limit: int = Query(default=25, ge=1, le=100),
    db: Session = Depends(get_db),
    context: CurrentContext = Depends(require_write_context),
) -> list[CatalogWineResponse]:
    ensure_app_admin(context)
    return [catalog_response(entry) for entry in search_all_catalog_entries(db, q, limit)]


@router.post("/catalog", response_model=CatalogWineResponse, status_code=status.HTTP_201_CREATED)
def create_wine_catalog_entry(
    payload: CatalogWineCreate,
    db: Session = Depends(get_db),
    context: CurrentContext = Depends(require_write_context),
) -> CatalogWineResponse:
    ensure_catalog_seeded(db)
    normalized_name = normalize_catalog_text(f"{payload.producer} {payload.name}".strip())
    existing = db.scalar(
        select(WineCatalogEntry)
        .join(WineCatalogAlias, WineCatalogAlias.catalog_entry_id == WineCatalogEntry.id)
        .where(WineCatalogAlias.normalized_alias == normalized_name),
    )
    if existing is not None:
        changed = False
        for field in ("producer", "region", "appellation", "type", "format", "country", "grapes_text"):
            next_value = str(getattr(payload, field) or "").strip()
            if field == "type":
                next_value = normalize_wine_type(next_value)
            if next_value and not getattr(existing, field):
                setattr(existing, field, next_value)
                changed = True
        if changed:
            existing.search_text = build_search_text(
                existing.name,
                existing.producer,
                existing.region,
                existing.appellation,
                existing.type,
                existing.country,
                existing.grapes_text,
            )
            existing.updated_at = datetime.now(UTC)
            db.commit()
            db.refresh(existing)
        return catalog_response(existing)
    if not has_complementary_catalog_data(payload.model_dump()):
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, detail="Catalog entry requires complementary wine data")
    entry = ensure_catalog_entry_for_wine_data(db, payload.model_dump(), source="manual")
    if entry is None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Catalog wine name is required")
    entry.country = payload.country.strip() or entry.country
    entry.grapes_text = payload.grapes_text.strip() or entry.grapes_text
    entry.is_active = False
    entry.search_text = build_search_text(entry.name, entry.producer, entry.region, entry.appellation, entry.type, entry.country, entry.grapes_text)
    aliases = {payload.name.strip(), f"{payload.producer.strip()} {payload.name.strip()}".strip(), *[alias.strip() for alias in payload.aliases]}
    for alias in aliases:
        add_catalog_alias_if_missing(db, entry, alias, source="manual")
    db.commit()
    db.refresh(entry)
    return catalog_response(entry)


@router.delete("/catalog/{entry_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_wine_catalog_entry(
    entry_id: uuid.UUID,
    db: Session = Depends(get_db),
    context: CurrentContext = Depends(require_write_context),
) -> None:
    ensure_app_admin(context)
    entry = db.get(WineCatalogEntry, entry_id)
    if entry is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Catalog entry not found")
    db.execute(delete(WineCatalogAlias).where(WineCatalogAlias.catalog_entry_id == entry.id))
    db.delete(entry)
    db.commit()


@router.post("/catalog/{entry_id}/approve", response_model=CatalogWineResponse)
def approve_wine_catalog_entry(
    entry_id: uuid.UUID,
    db: Session = Depends(get_db),
    context: CurrentContext = Depends(require_write_context),
) -> CatalogWineResponse:
    ensure_app_admin(context)
    entry = db.get(WineCatalogEntry, entry_id)
    if entry is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Catalog entry not found")
    entry.is_active = True
    entry.updated_at = datetime.now(UTC)
    validate_available_sensory_profiles_for_catalog_entry(
        db,
        entry,
        modified_by_user_id=context.user.id,
    )
    db.commit()
    db.refresh(entry)
    return catalog_response(entry)


def empty_image_candidate() -> dict[str, str]:
    return {
        "producer": "",
        "estate": "",
        "wine_name": "",
        "cuvee": "",
        "vintage": "",
        "appellation": "",
        "region": "",
        "country": "",
        "wine_type": "",
    }


@router.post("/catalog/recognize-bottle", response_model=WineImageRecognitionResponse)
async def recognize_wine_bottle(
    image: UploadFile = File(...),
    locale: str = Form(default="it", pattern="^(it|en)$"),
    known_text: str = Form(default="", max_length=260),
    db: Session = Depends(get_db),
    context: CurrentContext = Depends(require_write_context),
) -> WineImageRecognitionResponse:
    from app.api.routes.ai import (
        create_ai_response,
        effective_response_model,
        get_or_create_user_ai_settings,
        record_ai_audit,
    )

    if not context.user.can_use_label_recognition:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Wine label recognition is not enabled for this user",
        )
    request_id = uuid.uuid4().hex
    started_at = time.monotonic()
    content = await image.read(settings.wine_recognition_max_input_bytes + 1)
    if not content:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Image is empty")
    if len(content) > settings.wine_recognition_max_input_bytes:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail="Image is too large",
        )
    if not (image.content_type or "").lower().startswith("image/"):
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            detail="Unsupported image format",
        )
    if Path(image.filename or "").suffix.lower() not in {".jpg", ".jpeg", ".png", ".webp"}:
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            detail="Unsupported image format",
        )

    result: dict[str, object]
    ai_provider_source = ""
    luna_response: OpenAIResponse | None = None
    error_code = ""

    def create_billed_luna_response(
        *,
        system_prompt: str,
        user_prompt: str,
        json_schema: dict,
        input_images: list[tuple[str, bytes]],
        max_output_tokens: int,
        timeout_seconds: float,
    ) -> OpenAIResponse:
        nonlocal ai_provider_source, luna_response
        user_settings = get_or_create_user_ai_settings(db, context)
        response, provider_source = create_ai_response(
            db,
            context,
            user_settings,
            model=settings.openai_economy_model,
            system_prompt=system_prompt,
            user_prompt=user_prompt,
            json_schema=json_schema,
            max_output_tokens=max_output_tokens,
            task_type="structured_extraction",
            input_images=input_images,
            timeout_seconds=timeout_seconds,
        )
        luna_response = response
        ai_provider_source = provider_source
        return response

    try:
        result, luna_request_id = recognize_wine_from_image(
            content,
            locale=locale,
            known_text=known_text,
            response_factory=create_billed_luna_response,
        )
        request_id = luna_request_id or request_id
    except HTTPException as exc:
        if exc.status_code == status.HTTP_402_PAYMENT_REQUIRED:
            raise
        error_code = "invalid_image" if exc.status_code in {415, 422} else "provider_error"
        result = {
            "status": "invalid_image" if error_code == "invalid_image" else "error",
            **empty_image_candidate(),
            "label_text": [],
            "alternative_candidates": [],
            "needs_user_confirmation": True,
            "recognition_notes": [],
        }

    candidate = WineImageRecognitionCandidate.model_validate(result)
    recognized_name = " ".join(
        value for value in (candidate.wine_name, candidate.cuvee) if value
    )
    recognized_producer = candidate.producer or candidate.estate
    query = " ".join(
        value for value in (recognized_producer, recognized_name) if value
    ) or candidate.appellation
    matches = search_catalog_entries(db, query, 5) if query else []
    matched_wine_type = normalize_wine_type(matches[0].type) if matches else ""
    if matched_wine_type in CANONICAL_WINE_TYPES:
        candidate.wine_type = matched_wine_type
        result["wine_type"] = matched_wine_type
    recognition_id = uuid.uuid4()
    recognition_log = WineRecognitionLog(
        id=recognition_id,
        household_id=context.household.id,
        user_id=context.user.id,
        provider="luna",
        status=str(result["status"]),
        image_filename=image.filename or "",
        best_label=" ".join(
            value for value in (candidate.producer, candidate.wine_name) if value
        ),
        confidence=None,
        matched_catalog_entry_id=matches[0].id if matches else None,
        response_payload={
            "request_id": request_id,
            "provider": "luna",
            "status": result["status"],
            "candidate": candidate.model_dump(mode="json"),
            "ai_provider_source": ai_provider_source,
            "charged_cost_usd": (
                str(luna_response.charged_cost_usd) if luna_response else "0.000000"
            ),
        },
        created_at=datetime.now(UTC),
    )
    db.add(recognition_log)
    if luna_response is not None:
        record_ai_audit(
            db,
            context,
            entity_type="catalog",
            entity_id=recognition_id,
            feature="wine_image_recognition",
            model=effective_response_model(luna_response, settings.openai_economy_model),
            summary=(
                f"Bottle photo recognition: {candidate.producer} "
                f"{candidate.wine_name} {candidate.vintage}"
            ).strip(),
            usage=luna_response.usage,
            provider_source=ai_provider_source,
        )
    db.commit()
    logger.info(
        "wine_image_recognition request_id=%s provider=luna duration_ms=%s status=%s error_code=%s",
        request_id,
        round((time.monotonic() - started_at) * 1000),
        result["status"],
        error_code or None,
    )
    return WineImageRecognitionResponse.model_validate(
        {
            **result,
            "recognition_id": recognition_log.id,
            "provider": "luna",
            "matches": [catalog_response(entry) for entry in matches],
            "estimated_cost_usd": luna_response.charged_cost_usd if luna_response else "0",
        }
    )


@router.post(
    "/catalog/recognition/confirm",
    response_model=WineImageRecognitionConfirmationResponse,
)
def confirm_wine_image_recognition(
    payload: WineImageRecognitionConfirmation,
    db: Session = Depends(get_db),
    context: CurrentContext = Depends(require_write_context),
) -> WineImageRecognitionConfirmationResponse:
    recognition = db.scalar(
        select(WineRecognitionLog).where(
            WineRecognitionLog.id == payload.recognition_id,
            WineRecognitionLog.household_id == context.household.id,
            WineRecognitionLog.user_id == context.user.id,
        )
    )
    if recognition is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Wine recognition not found",
        )
    stored_payload = recognition.response_payload or {}
    if stored_payload.get("confirmed") is True:
        return WineImageRecognitionConfirmationResponse.model_validate(
            {
                "catalog_entry_id": stored_payload.get("catalog_entry_id"),
                "catalog_status": stored_payload.get("catalog_status", "skipped"),
                "sensory_profile_status": stored_payload.get(
                    "sensory_profile_status", "skipped"
                ),
                "sensory_profile_source": stored_payload.get(
                    "sensory_profile_source", ""
                ),
            }
        )
    stored_candidate = stored_payload.get("candidate")
    candidate = payload.candidate
    if candidate is None and isinstance(stored_candidate, dict):
        candidate = WineImageRecognitionCandidate.model_validate(stored_candidate)

    catalog_entry: WineCatalogEntry | None = None
    catalog_status = "skipped"
    sensory_status = "skipped"
    sensory_source = ""
    candidate_data = confirmed_candidate_catalog_data(candidate) if candidate else None
    if candidate_data is not None:
        catalog_entry = ensure_catalog_entry_for_wine_data(
            db,
            candidate_data,
            source="confirmed_recognition",
        )
        if catalog_entry is not None:
            catalog_status = "existing" if catalog_entry.is_active else "pending"
            sensory_status, sensory_source = create_confirmed_recognition_sensory_profile(
                db,
                candidate_data,
                catalog_entry,
                user_id=context.user.id,
            )
            recognition.matched_catalog_entry_id = catalog_entry.id
    recognition.response_payload = {
        **stored_payload,
        "confirmed": True,
        "corrected": payload.corrected,
        "confirmed_candidate": candidate.model_dump(mode="json") if candidate else None,
        "catalog_entry_id": str(catalog_entry.id) if catalog_entry else None,
        "catalog_status": catalog_status,
        "sensory_profile_status": sensory_status,
        "sensory_profile_source": sensory_source,
        "confirmed_at": datetime.now(UTC).isoformat(),
    }
    db.commit()
    return WineImageRecognitionConfirmationResponse(
        catalog_entry_id=catalog_entry.id if catalog_entry else None,
        catalog_status=catalog_status,
        sensory_profile_status=sensory_status,
        sensory_profile_source=sensory_source,
    )
