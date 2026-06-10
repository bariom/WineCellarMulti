from __future__ import annotations

import json
import mimetypes
import re
import uuid
from datetime import datetime, timezone
from html import unescape
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile, status
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from app.api.deps import CurrentContext, get_current_context, require_write_context
from app.core.config import settings
from app.db.session import get_db
from app.models import WineCatalogAlias, WineCatalogEntry, WineRecognitionLog
from app.schemas.catalog import CatalogRecognitionResponse, CatalogRecognitionSuggestion, CatalogWineCreate, CatalogWineResponse


router = APIRouter()
CATALOG_PATH = Path(__file__).resolve().parents[2] / "wine_catalog.json"
MIN_RECOGNITION_CONFIDENCE_PERCENT = 75.0


def normalize_catalog_text(value: str) -> str:
    return re.sub(r"\s+", " ", value.strip().lower())


def clean_recognition_text(value: object) -> str:
    return re.sub(r"\s+", " ", unescape(str(value or "")).strip())


def recognition_confidence_percent(value: float | None) -> float | None:
    if value is None:
        return None
    return value * 100 if value <= 1 else value


def recognition_confidence_is_acceptable(value: float | None) -> bool:
    confidence_percent = recognition_confidence_percent(value)
    return confidence_percent is None or confidence_percent >= MIN_RECOGNITION_CONFIDENCE_PERCENT


def build_search_text(*parts: str) -> str:
    return normalize_catalog_text(" ".join(part for part in parts if part))


def catalog_response(entry: WineCatalogEntry) -> CatalogWineResponse:
    return CatalogWineResponse(
        id=entry.id,
        name=entry.name,
        producer=entry.producer,
        region=entry.region,
        appellation=entry.appellation,
        type=entry.type,
        format=entry.format,
        country=entry.country,
        grapes_text=entry.grapes_text,
        source=entry.source,
    )


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
        wine_type = str(item.get("type") or "").strip()
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
            created_at=datetime.now(timezone.utc),
            updated_at=datetime.now(timezone.utc),
        )
        db.add(entry)
        db.flush()
        for alias in {name, f"{producer} {name}".strip()}:
            normalized = normalize_catalog_text(alias)
            if not normalized or normalized in seen_aliases:
                continue
            seen_aliases.add(normalized)
            db.add(WineCatalogAlias(catalog_entry_id=entry.id, alias=alias, normalized_alias=normalized, source="json_seed", created_at=datetime.now(timezone.utc)))
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


def ensure_catalog_entry_for_wine_data(db: Session, data: dict, *, source: str = "user_saved") -> WineCatalogEntry | None:
    name = str(data.get("name") or "").strip()
    if not name:
        return None
    producer = str(data.get("producer") or "").strip()
    aliases = {name, f"{producer} {name}".strip()}
    for alias in aliases:
        normalized = normalize_catalog_text(alias)
        if not normalized:
            continue
        existing = db.scalar(
            select(WineCatalogEntry)
            .join(WineCatalogAlias, WineCatalogAlias.catalog_entry_id == WineCatalogEntry.id)
            .where(WineCatalogAlias.normalized_alias == normalized),
        )
        if existing is not None:
            changed = False
            for field in ("producer", "region", "appellation", "type", "format"):
                next_value = str(data.get(field) or "").strip()
                if next_value and not getattr(existing, field):
                    setattr(existing, field, next_value)
                    changed = True
            if changed:
                existing.search_text = build_search_text(existing.name, existing.producer, existing.region, existing.appellation, existing.type, existing.country, existing.grapes_text)
                existing.updated_at = datetime.now(timezone.utc)
            return existing

    entry = WineCatalogEntry(
        name=name,
        producer=producer,
        region=str(data.get("region") or "").strip(),
        appellation=str(data.get("appellation") or "").strip(),
        type=str(data.get("type") or "").strip(),
        format=str(data.get("format") or "").strip(),
        source=source,
        search_text=build_search_text(name, producer, str(data.get("region") or ""), str(data.get("appellation") or ""), str(data.get("type") or "")),
        created_at=datetime.now(timezone.utc),
        updated_at=datetime.now(timezone.utc),
    )
    db.add(entry)
    db.flush()
    for alias in aliases:
        normalized = normalize_catalog_text(alias)
        if normalized and db.scalar(select(WineCatalogAlias.id).where(WineCatalogAlias.normalized_alias == normalized)) is None:
            db.add(WineCatalogAlias(catalog_entry_id=entry.id, alias=alias, normalized_alias=normalized, source=source, created_at=datetime.now(timezone.utc)))
    return entry


def extract_recognition_suggestions(payload: object) -> list[CatalogRecognitionSuggestion]:
    suggestions: list[CatalogRecognitionSuggestion] = []

    def visit(value: object) -> None:
        if isinstance(value, dict):
            classes = value.get("classes")
            if isinstance(classes, dict):
                for label, confidence in classes.items():
                    clean_label = clean_recognition_text(label)
                    if not clean_label:
                        continue
                    try:
                        confidence_value = float(confidence) if confidence is not None else None
                    except (TypeError, ValueError):
                        confidence_value = None
                    suggestions.append(CatalogRecognitionSuggestion(label=clean_label, confidence=confidence_value))
                return
            label = value.get("label") or value.get("class") or value.get("wine")
            clean_label = clean_recognition_text(label)
            if clean_label:
                confidence = value.get("confidence") or value.get("score") or value.get("probability")
                try:
                    confidence_value = float(confidence) if confidence is not None else None
                except (TypeError, ValueError):
                    confidence_value = None
                suggestions.append(
                    CatalogRecognitionSuggestion(
                        label=clean_label,
                        confidence=confidence_value,
                        vintage=clean_recognition_text(value.get("vintage")),
                        producer=clean_recognition_text(value.get("producer") or value.get("winery")),
                        region=clean_recognition_text(value.get("region")),
                        appellation=clean_recognition_text(value.get("appellation") or value.get("denomination") or value.get("appellation_name")),
                        type=clean_recognition_text(value.get("type")),
                    ),
                )
            for child in value.values():
                visit(child)
        elif isinstance(value, list):
            for child in value:
                visit(child)

    visit(payload)
    unique: dict[str, CatalogRecognitionSuggestion] = {}
    for suggestion in suggestions:
        if not recognition_confidence_is_acceptable(suggestion.confidence):
            continue
        key = normalize_catalog_text(suggestion.label)
        if key and key not in unique:
            unique[key] = suggestion
    return list(unique.values())[:5]


def call_api4ai_wine_recognition(filename: str, content_type: str, content: bytes) -> dict:
    if not settings.api4ai_api_key:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="Wine recognition is not configured")
    boundary = f"----vinaris-{uuid.uuid4().hex}"
    field_name = "image"
    mime_type = content_type or mimetypes.guess_type(filename)[0] or "application/octet-stream"
    body = (
        f"--{boundary}\r\n"
        f'Content-Disposition: form-data; name="{field_name}"; filename="{filename}"\r\n'
        f"Content-Type: {mime_type}\r\n\r\n"
    ).encode("utf-8") + content + f"\r\n--{boundary}--\r\n".encode("utf-8")
    request = Request(
        settings.api4ai_wine_recognition_url,
        data=body,
        method="POST",
        headers={
            "Content-Type": f"multipart/form-data; boundary={boundary}",
            "Content-Length": str(len(body)),
            "X-API-KEY": settings.api4ai_api_key,
        },
    )
    try:
        with urlopen(request, timeout=45) as response:
            return json.loads(response.read().decode("utf-8"))
    except HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="replace")
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=f"Wine recognition failed: {detail}") from exc
    except (URLError, TimeoutError, json.JSONDecodeError) as exc:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=f"Wine recognition failed: {exc}") from exc


@router.get("/catalog", response_model=list[CatalogWineResponse])
def list_wine_catalog(
    q: str = Query(default="", max_length=120),
    limit: int = Query(default=25, ge=1, le=100),
    db: Session = Depends(get_db),
    context: CurrentContext = Depends(get_current_context),
) -> list[CatalogWineResponse]:
    return [catalog_response(entry) for entry in search_catalog_entries(db, q, limit)]


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
            existing.updated_at = datetime.now(timezone.utc)
            db.commit()
            db.refresh(existing)
        return catalog_response(existing)
    entry = ensure_catalog_entry_for_wine_data(db, payload.model_dump(), source="manual")
    if entry is None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Catalog wine name is required")
    entry.country = payload.country.strip() or entry.country
    entry.grapes_text = payload.grapes_text.strip() or entry.grapes_text
    entry.search_text = build_search_text(entry.name, entry.producer, entry.region, entry.appellation, entry.type, entry.country, entry.grapes_text)
    aliases = {payload.name.strip(), f"{payload.producer.strip()} {payload.name.strip()}".strip(), *[alias.strip() for alias in payload.aliases]}
    for alias in aliases:
        normalized = normalize_catalog_text(alias)
        if normalized and db.scalar(select(WineCatalogAlias.id).where(WineCatalogAlias.normalized_alias == normalized)) is None:
            db.add(WineCatalogAlias(catalog_entry_id=entry.id, alias=alias, normalized_alias=normalized, source="manual", created_at=datetime.now(timezone.utc)))
    db.commit()
    db.refresh(entry)
    return catalog_response(entry)


@router.post("/catalog/recognize", response_model=CatalogRecognitionResponse)
async def recognize_wine_label(
    image: UploadFile = File(...),
    db: Session = Depends(get_db),
    context: CurrentContext = Depends(require_write_context),
) -> CatalogRecognitionResponse:
    content = await image.read()
    if not content:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Image is empty")
    if len(content) > 16 * 1024 * 1024:
        raise HTTPException(status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE, detail="Image is too large")
    payload = call_api4ai_wine_recognition(image.filename or "wine.jpg", image.content_type or "image/jpeg", content)
    suggestions = extract_recognition_suggestions(payload)
    matches: list[WineCatalogEntry] = []
    for suggestion in suggestions:
        matches.extend(search_catalog_entries(db, " ".join([suggestion.producer, suggestion.label, suggestion.vintage]).strip(), 5))
    unique_matches: dict[uuid.UUID, WineCatalogEntry] = {}
    for match in matches:
        unique_matches.setdefault(match.id, match)
    best = suggestions[0] if suggestions else None
    db.add(
        WineRecognitionLog(
            household_id=context.household.id,
            user_id=context.user.id,
            status="success" if suggestions else "no_result",
            image_filename=image.filename or "",
            best_label=best.label if best else "",
            confidence=best.confidence if best else None,
            matched_catalog_entry_id=next(iter(unique_matches.values())).id if unique_matches else None,
            response_payload=payload,
            created_at=datetime.now(timezone.utc),
        ),
    )
    db.commit()
    return CatalogRecognitionResponse(
        suggestions=suggestions,
        matches=[catalog_response(entry) for entry in list(unique_matches.values())[:5]],
        raw_best_label=best.label if best else "",
    )
