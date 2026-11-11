"""App administrators enrich the shared wine catalog from photos (docs/CATALOG_PHOTO_ENRICHMENT.md).

A photo of a wine-shop shelf is read in overlapping sections, a close-up photo in
one reading; every label read is then looked up in the whole catalog before any
further AI is spent on it. Jobs run in the background like the shelf scanner and
keep the original photos in memory only, for the bottle photos of the next step.
"""

from __future__ import annotations

import logging
import math
import uuid
from collections.abc import Callable
from concurrent.futures import ThreadPoolExecutor, as_completed
from dataclasses import dataclass, field
from datetime import UTC, datetime, timedelta
from decimal import Decimal
from difflib import SequenceMatcher
from threading import Lock
from typing import Any, Literal, cast

from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.wine_types import normalize_wine_type
from app.db.session import SessionLocal
from app.models import WineCatalogEntry
from app.prompts.catalog_photo import catalog_photo_recognition_prompt
from app.schemas.catalog_photo import (
    CatalogPhotoBottle,
    CatalogPhotoMatchStatus,
    CatalogPhotoMode,
    CatalogPhotoScanResult,
    CatalogPhotoScanStatus,
)
from app.services.shared_wine_data import normalize_identity_part
from app.services.wine_image_recognition import label_snapper

logger = logging.getLogger(__name__)

MAX_PHOTOS = 3
MAX_PARALLEL_SECTIONS = 4
MAX_BOTTLES = 120
MAX_BOTTLES_PER_SECTION = 60
SECTION_TIMEOUT_SECONDS = 120
JOB_RETENTION = timedelta(minutes=30)
JOB_MAX_RUNTIME = timedelta(minutes=8)
# Catalog match scores (0-100): a clear match above KNOWN_SCORE is the same wine,
# anything above CANDIDATE_SCORE is shown to the admin as a possible match.
KNOWN_SCORE = 80
CANDIDATE_SCORE = 62
CLEAR_LEAD = 15
# Catalog fields an admin can complete for a wine already in the catalog.
COMPLETABLE_FIELDS = ("producer", "region", "appellation", "type", "country", "grapes_text")

# JPEG bytes, box (x, y, width, height) normalized to the whole photo, pixel size.
Section = tuple[bytes, tuple[float, float, float, float], tuple[int, int]]
CONFIDENCE_ORDER = {"high": 0, "medium": 1, "low": 2}


@dataclass
class CatalogPhotoJob:
    id: uuid.UUID
    household_id: uuid.UUID
    user_id: uuid.UUID
    session_id: uuid.UUID
    mode: CatalogPhotoMode
    # The photos as uploaded, for cutting out the bottles later; dropped with the job.
    originals: list[bytes] = field(default_factory=list)
    created_at: datetime = field(default_factory=lambda: datetime.now(UTC))
    status: Literal["running", "done", "failed"] = "running"
    stage: Literal["reading", "matching", "done"] = "reading"
    sections_total: int = 0
    sections_done: int = 0
    bottles_found: int = 0
    error: str = ""
    result: CatalogPhotoScanResult | None = None

    def snapshot(self) -> CatalogPhotoScanStatus:
        status, error = self.status, self.error
        if status == "running" and datetime.now(UTC) - self.created_at > JOB_MAX_RUNTIME:
            status, error = "failed", "The photo analysis took too long. Try again."
        return CatalogPhotoScanStatus(
            id=self.id,
            mode=self.mode,
            status=status,
            stage=self.stage,
            sections_total=self.sections_total,
            sections_done=self.sections_done,
            bottles_found=self.bottles_found,
            error=error,
            result=self.result if status == "done" else None,
        )


_jobs: dict[uuid.UUID, CatalogPhotoJob] = {}
_jobs_lock = Lock()
_executor = ThreadPoolExecutor(max_workers=2, thread_name_prefix="catalog-photo")


def submit(task: Callable[..., None], *args: Any) -> None:
    """Run a job in the background; tests replace this to run it inline."""
    _executor.submit(task, *args)


def _prune(now: datetime) -> None:
    for job_id, job in list(_jobs.items()):
        if now - job.created_at > JOB_RETENTION:
            del _jobs[job_id]


def running_job_for(user_id: uuid.UUID) -> CatalogPhotoJob | None:
    with _jobs_lock:
        _prune(datetime.now(UTC))
        return next(
            (
                job
                for job in _jobs.values()
                if job.user_id == user_id and job.snapshot().status == "running"
            ),
            None,
        )


def start_job(
    *,
    household_id: uuid.UUID,
    user_id: uuid.UUID,
    session_id: uuid.UUID,
    mode: CatalogPhotoMode,
    originals: list[bytes],
    photos: list[list[Section]],
) -> CatalogPhotoJob:
    job = CatalogPhotoJob(
        id=uuid.uuid4(),
        household_id=household_id,
        user_id=user_id,
        session_id=session_id,
        mode=mode,
        originals=originals,
        sections_total=sum(len(sections) for sections in photos),
    )
    with _jobs_lock:
        _prune(datetime.now(UTC))
        _jobs[job.id] = job
    submit(run_job, job, photos)
    return job


def get_job(job_id: uuid.UUID, *, user_id: uuid.UUID) -> CatalogPhotoJob | None:
    with _jobs_lock:
        job = _jobs.get(job_id)
    if job is None or job.user_id != user_id:
        return None
    return job


RECOGNITION_SCHEMA = {
    "name": "catalog_photo_labels",
    "schema": {
        "type": "object",
        "additionalProperties": False,
        "properties": {
            "bottles": {
                "type": "array",
                "items": {
                    "type": "object",
                    "additionalProperties": False,
                    "properties": {
                        "name": {"type": "string"},
                        "producer": {"type": "string"},
                        "vintage": {"type": "string"},
                        "wine_type": {"type": "string"},
                        "region": {"type": "string"},
                        "appellation": {"type": "string"},
                        "country": {"type": "string"},
                        "confidence": {"type": "string", "enum": ["high", "medium", "low"]},
                        "center_x": {"type": "number"},
                        "center_y": {"type": "number"},
                        "label_width": {"type": "number"},
                        "label_height": {"type": "number"},
                        "bottle_top": {"type": "number"},
                        "bottle_bottom": {"type": "number"},
                        "whole_bottle": {"type": "boolean"},
                    },
                    "required": [
                        "name",
                        "producer",
                        "vintage",
                        "wine_type",
                        "region",
                        "appellation",
                        "country",
                        "confidence",
                        "center_x",
                        "center_y",
                        "label_width",
                        "label_height",
                        "bottle_top",
                        "bottle_bottom",
                        "whole_bottle",
                    ],
                },
            }
        },
        "required": ["bottles"],
    },
}


def _ratio(value: object, size: int) -> float:
    if isinstance(value, bool) or not isinstance(value, int | float) or not math.isfinite(value):
        return 0.0
    return min(max(float(value) / size, 0.0), 1.0) if size > 0 else 0.0


def _text(value: object, limit: int) -> str:
    return " ".join(str(value or "").split())[:limit]


def _vintage(value: object) -> str:
    text = _text(value, 12)
    digits = "".join(char for char in text if char.isdigit())
    if len(digits) == 4 and 1800 <= int(digits) <= datetime.now(UTC).year + 1:
        return digits
    return "NV" if text.casefold() in {"nv", "n.v.", "non vintage", "sans annee"} else ""


def section_bottles(
    parsed: dict[str, Any],
    *,
    image_index: int,
    box: tuple[float, float, float, float],
    size: tuple[int, int],
    snap: Callable[[float, float, float, float], tuple[float, float]] | None = None,
) -> list[CatalogPhotoBottle]:
    """Validate one section's labels and map their positions onto the whole photo."""
    left, top, width, height = box
    pixel_width, pixel_height = size
    bottles: list[CatalogPhotoBottle] = []
    raw = parsed.get("bottles")
    for item in raw if isinstance(raw, list) else []:
        if not isinstance(item, dict) or not _text(item.get("name"), 180):
            continue
        confidence = str(item.get("confidence") or "")
        center_x = _ratio(item.get("center_x"), pixel_width)
        center_y = _ratio(item.get("center_y"), pixel_height)
        label_width = _ratio(item.get("label_width"), pixel_width)
        label_height = _ratio(item.get("label_height"), pixel_height)
        if snap is not None:
            center_x, center_y = (
                min(max(value, 0.0), 1.0)
                for value in snap(center_x, center_y, label_width, label_height)
            )
        half_width = min(label_width / 2, center_x, 1 - center_x)
        half_height = min(label_height / 2, center_y, 1 - center_y)
        bottle_top = _ratio(item.get("bottle_top"), pixel_height)
        bottle_bottom = _ratio(item.get("bottle_bottom"), pixel_height)
        # A bottle that does not contain its own label is not a usable outline.
        if not bottle_top < center_y < bottle_bottom:
            bottle_top = bottle_bottom = 0.0
        whole = item.get("whole_bottle") is True and bottle_bottom > bottle_top
        bottles.append(
            CatalogPhotoBottle(
                name=_text(item.get("name"), 180),
                producer=_text(item.get("producer"), 180),
                vintage=_vintage(item.get("vintage")),
                wine_type=normalize_wine_type(_text(item.get("wine_type"), 40)),
                region=_text(item.get("region"), 120),
                appellation=_text(item.get("appellation"), 120),
                country=_text(item.get("country"), 120),
                confidence=cast(
                    Literal["high", "medium", "low"],
                    confidence if confidence in CONFIDENCE_ORDER else "low",
                ),
                image_index=image_index,
                x=left + (center_x - half_width) * width,
                y=top + (center_y - half_height) * height,
                width=2 * half_width * width,
                height=2 * half_height * height,
                bottle_top=top + bottle_top * height if bottle_bottom else 0.0,
                bottle_bottom=top + bottle_bottom * height if bottle_bottom else 0.0,
                whole_bottle=whole,
            )
        )
        if len(bottles) == MAX_BOTTLES_PER_SECTION:
            break
    return bottles


def _identity(bottle: CatalogPhotoBottle) -> str:
    return normalize_identity_part(f"{bottle.producer} {bottle.name} {bottle.vintage}")


def merge_bottles(readings: list[list[CatalogPhotoBottle]]) -> list[CatalogPhotoBottle]:
    """One entry per wine across sections and photos, keeping the surest reading.

    Missing fields are taken from the other readings; the position kept is the one
    of the largest label seen, which gives the best bottle photo.
    """
    merged: dict[str, CatalogPhotoBottle] = {}
    for bottles in readings:
        for bottle in bottles:
            key = _identity(bottle)
            current = merged.get(key)
            if current is None:
                merged[key] = bottle
                continue
            better = CONFIDENCE_ORDER[bottle.confidence] < CONFIDENCE_ORDER[current.confidence]
            chosen, other = (bottle, current) if better else (current, bottle)
            update: dict[str, Any] = {
                name: getattr(chosen, name) or getattr(other, name)
                for name in ("wine_type", "region", "appellation", "country")
            }
            larger = other.width * other.height > chosen.width * chosen.height
            if larger or (other.whole_bottle and not chosen.whole_bottle):
                update |= {
                    name: getattr(other, name)
                    for name in (
                        "image_index",
                        "x",
                        "y",
                        "width",
                        "height",
                        "bottle_top",
                        "bottle_bottom",
                        "whole_bottle",
                    )
                }
            merged[key] = chosen.model_copy(update=update)
    ordered = sorted(merged.values(), key=lambda item: (item.image_index, item.y, item.x))
    return ordered[:MAX_BOTTLES]


def _similarity(left: str, right: str) -> float:
    return SequenceMatcher(
        None, normalize_identity_part(left), normalize_identity_part(right)
    ).ratio()


def catalog_candidates(
    db: Session, bottle: CatalogPhotoBottle
) -> list[tuple[WineCatalogEntry, float]]:
    """Catalog entries (approved or waiting) that may be this wine, best first, scored 0-100."""
    from app.api.routes.catalog import search_all_catalog_entries

    entries: dict[uuid.UUID, WineCatalogEntry] = {}
    for query in (f"{bottle.producer} {bottle.name}".strip(), bottle.name, bottle.producer):
        if not query.strip():
            continue
        for entry in search_all_catalog_entries(db, query, 15):
            entries[entry.id] = entry
        if len(entries) >= 5:
            break
    ranked: list[tuple[WineCatalogEntry, float]] = []
    for entry in entries.values():
        # The catalog names a wine with or without its producer: compare both ways.
        name_score = max(
            _similarity(bottle.name, entry.name),
            _similarity(f"{bottle.producer} {bottle.name}", f"{entry.producer} {entry.name}"),
        )
        if bottle.producer and entry.producer:
            score = name_score * 75 + _similarity(bottle.producer, entry.producer) * 25
        else:
            score = name_score * 85
        if score >= CANDIDATE_SCORE:
            ranked.append((entry, round(score, 1)))
    return sorted(ranked, key=lambda item: (-item[1], item[0].name.casefold()))[:3]


def match_bottle(db: Session, bottle: CatalogPhotoBottle) -> CatalogPhotoBottle:
    from app.api.routes.catalog import catalog_response

    ranked = catalog_candidates(db, bottle)
    status: CatalogPhotoMatchStatus = "new"
    entry: WineCatalogEntry | None = None
    if ranked:
        best, score = ranked[0]
        clear = len(ranked) == 1 or score - ranked[1][1] >= CLEAR_LEAD
        if score >= KNOWN_SCORE and clear:
            entry = best
            status = "known" if best.is_active else "pending"
        else:
            status = "uncertain"
    return bottle.model_copy(
        update={
            "status": status,
            "entry": catalog_response(entry) if entry is not None else None,
            "candidates": [catalog_response(item) for item, _ in ranked] if entry is None else [],
            "missing_fields": (
                [name for name in COMPLETABLE_FIELDS if not str(getattr(entry, name) or "").strip()]
                if entry is not None
                else []
            ),
        }
    )


def run_job(job: CatalogPhotoJob, photos: list[list[Section]]) -> None:
    try:
        job.result = scan(job, photos)
        job.stage = "done"
        job.status = "done"
    except HTTPException as exc:
        job.error = str(exc.detail)
        job.status = "failed"
    except Exception:
        logger.exception("Catalog photo scan failed")
        job.error = "The photos could not be analysed. Try again."
        job.status = "failed"
    finally:
        photos.clear()


def _worker_context(db: Session, job: CatalogPhotoJob) -> Any:
    from app.services.sensory_agent import worker_context

    try:
        return worker_context(
            db, job.household_id, job.user_id, job.session_id, app_admin_only=True
        )
    except (PermissionError, HTTPException) as exc:
        raise HTTPException(401, "Session expired during the photo analysis") from exc


def read_section(
    job: CatalogPhotoJob,
    image: bytes,
    *,
    image_index: int,
    box: tuple[float, float, float, float],
    size: tuple[int, int],
    number: int,
) -> tuple[list[CatalogPhotoBottle] | None, Decimal, str]:
    """Read one section on the application's key; None when the answer is unusable."""
    from app.api.routes.ai import (
        create_ai_response,
        effective_response_model,
        get_or_create_user_ai_settings,
        record_ai_audit,
    )
    from app.services.openai_client import parse_json_response

    prompt = catalog_photo_recognition_prompt(
        section=number, sections=job.sections_total, width=size[0], height=size[1]
    )
    with SessionLocal() as db:
        context = _worker_context(db, job)
        user_settings = get_or_create_user_ai_settings(db, context)
        model = settings.openai_economy_model
        response, provider_source = create_ai_response(
            db,
            context,
            user_settings,
            model=model,
            task_type="structured_extraction",
            system_prompt=prompt.system,
            user_prompt=prompt.user,
            json_schema=RECOGNITION_SCHEMA,
            input_images=[("image/jpeg", image)],
            reasoning_effort="low",
            max_output_tokens=6000,
            timeout_seconds=SECTION_TIMEOUT_SECONDS,
            app_granted=True,
        )
        bottles: list[CatalogPhotoBottle] | None
        try:
            bottles = section_bottles(
                parse_json_response(response.text),
                image_index=image_index,
                box=box,
                size=size,
                snap=label_snapper(image) if job.mode == "shelf" else None,
            )
        except HTTPException:
            bottles = None
        effective_model = effective_response_model(response, model)
        record_ai_audit(
            db,
            context,
            entity_type="catalog",
            entity_id=context.household.id,
            feature="catalog_photo_scan",
            model=effective_model,
            reasoning_effort=response.reasoning_effort or "",
            summary=(
                f"Catalog photo section {number}/{job.sections_total} read: {len(bottles)} labels."
                if bottles is not None
                else f"Catalog photo section {number}/{job.sections_total}: unusable answer."
            ),
            usage=response.usage,
            provider_source=provider_source,
        )
        db.commit()
        return bottles, response.charged_cost_usd, effective_model


def scan(job: CatalogPhotoJob, photos: list[list[Section]]) -> CatalogPhotoScanResult:
    tasks = [
        (image_index, section, box, size)
        for image_index, sections in enumerate(photos)
        for section, box, size in sections
    ]
    readings: list[list[CatalogPhotoBottle]] = []
    total_cost = Decimal("0")
    model = ""
    failures: list[BaseException] = []
    with ThreadPoolExecutor(max_workers=MAX_PARALLEL_SECTIONS) as executor:
        futures = [
            executor.submit(
                read_section, job, image, image_index=image_index, box=box, size=size, number=number
            )
            for number, (image_index, image, box, size) in enumerate(tasks, start=1)
        ]
        for future in as_completed(futures):
            try:
                bottles, cost, model = future.result()
            except Exception as exc:
                failures.append(exc)
                logger.warning("Catalog photo section failed: %s", type(exc).__name__)
            else:
                total_cost += cost
                if bottles is None:
                    failures.append(ValueError("unusable section answer"))
                else:
                    readings.append(bottles)
            job.sections_done += 1
            job.bottles_found = len(merge_bottles(readings))
    if not readings:
        first = failures[0] if failures else None
        if isinstance(first, HTTPException):
            raise first
        raise HTTPException(502, "The photos could not be read. Try again.")
    bottles = merge_bottles(readings)
    job.bottles_found = len(bottles)
    job.stage = "matching"
    with SessionLocal() as db:
        _worker_context(db, job)
        bottles = [match_bottle(db, bottle) for bottle in bottles]
    return CatalogPhotoScanResult(
        bottles=bottles,
        photo_count=len(photos),
        unread_sections=len(failures),
        model=model,
        estimated_cost_usd=total_cost,
    )
