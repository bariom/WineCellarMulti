"""Add the bottles of a photo to the cellar.

The user photographs bottles on a table; each photo is read in the background
(several at a time) and each wine, with its identical bottles counted, is matched
with the cellar and the shared catalog for review. Photos stay in memory only, for
the short life of the job.
"""

from __future__ import annotations

import logging
import unicodedata
import uuid
from collections.abc import Callable
from concurrent.futures import ThreadPoolExecutor, as_completed
from dataclasses import dataclass, field
from datetime import UTC, datetime, timedelta
from decimal import Decimal
from threading import Lock
from typing import Any, Literal, cast

from fastapi import HTTPException

from app.db.session import SessionLocal
from app.prompts.bottle_photos import wine_bottles_recognition_prompt
from app.schemas.bottle_photos import (
    BottlePhotoExistingWine,
    BottlePhotoRow,
    BottlePhotoScanResult,
    BottlePhotoScanStatus,
)
from app.services.wine_image_recognition import label_snapper

logger = logging.getLogger(__name__)

MAX_PHOTOS = 3
MAX_PARALLEL_PHOTOS = 3
MAX_WINES_PER_PHOTO = 40
MAX_WINES = 120
PHOTO_TIMEOUT_SECONDS = 150
JOB_RETENTION = timedelta(minutes=30)
JOB_MAX_RUNTIME = timedelta(minutes=8)
CONFIDENCE_ORDER = {"high": 0, "medium": 1, "low": 2}

Photo = tuple[bytes, tuple[int, int]]

RECOGNITION_SCHEMA = {
    "name": "wine_bottles",
    "schema": {
        "type": "object",
        "additionalProperties": False,
        "properties": {
            "wines": {
                "type": "array",
                "items": {
                    "type": "object",
                    "additionalProperties": False,
                    "properties": {
                        "name": {"type": "string"},
                        "producer": {"type": "string"},
                        "vintage": {"type": "string"},
                        "format": {"type": "string"},
                        "style": {"type": "string"},
                        "region": {"type": "string"},
                        "bottle_count": {"type": "integer", "minimum": 1, "maximum": 100},
                        "confidence": {"type": "string", "enum": ["high", "medium", "low"]},
                        "center_x": {"type": "number"},
                        "center_y": {"type": "number"},
                        "label_width": {"type": "number"},
                        "label_height": {"type": "number"},
                    },
                    "required": [
                        "name",
                        "producer",
                        "vintage",
                        "format",
                        "style",
                        "region",
                        "bottle_count",
                        "confidence",
                        "center_x",
                        "center_y",
                        "label_width",
                        "label_height",
                    ],
                },
            }
        },
        "required": ["wines"],
    },
}


@dataclass
class BottlePhotoJob:
    id: uuid.UUID
    household_id: uuid.UUID
    user_id: uuid.UUID
    session_id: uuid.UUID
    photos_total: int
    created_at: datetime = field(default_factory=lambda: datetime.now(UTC))
    status: Literal["running", "done", "failed"] = "running"
    stage: Literal["reading", "matching", "done"] = "reading"
    photos_done: int = 0
    wines_found: int = 0
    error: str = ""
    result: BottlePhotoScanResult | None = None

    def snapshot(self) -> BottlePhotoScanStatus:
        status, error = self.status, self.error
        if status == "running" and datetime.now(UTC) - self.created_at > JOB_MAX_RUNTIME:
            status, error = "failed", "The photo analysis took too long. Try again."
        return BottlePhotoScanStatus(
            id=self.id,
            status=status,
            stage=self.stage,
            photos_total=self.photos_total,
            photos_done=self.photos_done,
            wines_found=self.wines_found,
            error=error,
            result=self.result if status == "done" else None,
        )


_jobs: dict[uuid.UUID, BottlePhotoJob] = {}
_jobs_lock = Lock()
_executor = ThreadPoolExecutor(max_workers=2, thread_name_prefix="bottle-photos")


def submit(task: Callable[..., None], *args: Any) -> None:
    """Run a job in the background; tests replace this to run it inline."""
    _executor.submit(task, *args)


def _prune(now: datetime) -> None:
    for job_id, job in list(_jobs.items()):
        if now - job.created_at > JOB_RETENTION:
            del _jobs[job_id]


def running_job_for(user_id: uuid.UUID) -> BottlePhotoJob | None:
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
    photos: list[Photo],
) -> BottlePhotoJob:
    job = BottlePhotoJob(
        id=uuid.uuid4(),
        household_id=household_id,
        user_id=user_id,
        session_id=session_id,
        photos_total=len(photos),
    )
    with _jobs_lock:
        _prune(datetime.now(UTC))
        _jobs[job.id] = job
    submit(run_job, job, photos)
    return job


def get_job(
    job_id: uuid.UUID, *, household_id: uuid.UUID, user_id: uuid.UUID
) -> BottlePhotoJob | None:
    with _jobs_lock:
        job = _jobs.get(job_id)
    if job is None or job.household_id != household_id or job.user_id != user_id:
        return None
    return job


def _ratio(value: object, size: int) -> float:
    if isinstance(value, bool) or not isinstance(value, int | float) or size <= 0:
        return 0.0
    return min(max(float(value) / size, 0.0), 1.0)


def photo_rows(
    parsed: dict[str, Any], *, image_index: int, image: bytes, size: tuple[int, int]
) -> list[BottlePhotoRow]:
    """Validate the wines read in one photo; their label boxes sit on the label."""
    snap = label_snapper(image)
    rows: list[BottlePhotoRow] = []
    raw = parsed.get("wines")
    for item in raw if isinstance(raw, list) else []:
        if not isinstance(item, dict) or not str(item.get("name") or "").strip():
            continue
        confidence = str(item.get("confidence") or "")
        center_x = _ratio(item.get("center_x"), size[0])
        center_y = _ratio(item.get("center_y"), size[1])
        label_width = _ratio(item.get("label_width"), size[0])
        label_height = _ratio(item.get("label_height"), size[1])
        center_x, center_y = snap(center_x, center_y, label_width, label_height)
        half_width = min(max(label_width, 0.04) / 2, center_x, 1 - center_x)
        half_height = min(max(label_height, 0.06) / 2, center_y, 1 - center_y)
        count = item.get("bottle_count")
        rows.append(
            BottlePhotoRow(
                name=str(item.get("name") or "").strip()[:200],
                producer=str(item.get("producer") or "").strip()[:200],
                vintage=str(item.get("vintage") or "").strip()[:16],
                format=str(item.get("format") or "").strip()[:80],
                style=str(item.get("style") or "").strip()[:40],
                region=str(item.get("region") or "").strip()[:120],
                quantity=min(max(count, 1), 100) if isinstance(count, int) else 1,
                confidence=cast(
                    Literal["high", "medium", "low"],
                    confidence if confidence in CONFIDENCE_ORDER else "low",
                ),
                image_index=image_index,
                x=center_x - half_width,
                y=center_y - half_height,
                width=2 * half_width,
                height=2 * half_height,
            )
        )
        if len(rows) == MAX_WINES_PER_PHOTO:
            break
    return rows


def _identity(row: BottlePhotoRow) -> str:
    text = f"{row.producer} {row.name} {row.vintage} {row.format}"
    folded = unicodedata.normalize("NFKD", text).encode("ascii", "ignore").decode().casefold()
    return " ".join("".join(char if char.isalnum() else " " for char in folded).split())


def merge_rows(readings: list[list[BottlePhotoRow]]) -> list[BottlePhotoRow]:
    """One row per wine: bottles of the same wine in different photos add up."""
    merged: dict[str, BottlePhotoRow] = {}
    for rows in readings:
        for row in rows:
            key = _identity(row)
            current = merged.get(key)
            if current is None:
                merged[key] = row
                continue
            surer = (
                row
                if CONFIDENCE_ORDER[row.confidence] < CONFIDENCE_ORDER[current.confidence]
                else current
            )
            merged[key] = surer.model_copy(
                update={
                    "quantity": min(current.quantity + row.quantity, 10000),
                    "style": surer.style or current.style or row.style,
                    "region": surer.region or current.region or row.region,
                }
            )
    ordered = sorted(merged.values(), key=lambda item: (item.image_index, item.y, item.x))
    return ordered[:MAX_WINES]


def _worker_context(db: Any, job: BottlePhotoJob) -> Any:
    from app.services.sensory_agent import worker_context

    try:
        return worker_context(
            db, job.household_id, job.user_id, job.session_id, app_admin_only=False
        )
    except PermissionError as exc:
        raise HTTPException(401, "Session expired during the photo analysis") from exc


def read_photo(
    job: BottlePhotoJob, image: bytes, *, size: tuple[int, int], image_index: int
) -> tuple[list[BottlePhotoRow] | None, Decimal, str]:
    """Read one photo; the rows are None when the answer could not be used."""
    from app.api.routes.ai import (
        create_ai_response,
        effective_response_model,
        get_or_create_user_ai_settings,
        record_ai_audit,
    )
    from app.services.openai_client import parse_json_response

    prompt = wine_bottles_recognition_prompt(width=size[0], height=size[1])
    with SessionLocal() as db:
        context = _worker_context(db, job)
        user_settings = get_or_create_user_ai_settings(db, context)
        model = user_settings.pairing_model
        response, provider_source = create_ai_response(
            db,
            context,
            user_settings,
            model=model,
            task_type="pairing",
            system_prompt=prompt.system,
            user_prompt=prompt.user,
            json_schema=RECOGNITION_SCHEMA,
            input_images=[("image/jpeg", image)],
            reasoning_effort="low",
            max_output_tokens=6000,
            timeout_seconds=PHOTO_TIMEOUT_SECONDS,
        )
        rows: list[BottlePhotoRow] | None
        try:
            rows = photo_rows(
                parse_json_response(response.text), image_index=image_index, image=image, size=size
            )
        except HTTPException:
            rows = None
        effective_model = effective_response_model(response, model)
        record_ai_audit(
            db,
            context,
            entity_type="household",
            entity_id=context.household.id,
            feature="bottle_photo_import",
            model=effective_model,
            reasoning_effort=response.reasoning_effort or "",
            summary=(
                f"Bottle photo {image_index + 1}/{job.photos_total}: "
                + (f"{len(rows)} wines." if rows is not None else "unusable answer.")
            ),
            usage=response.usage,
            provider_source=provider_source,
        )
        db.commit()
        return rows, response.charged_cost_usd, effective_model


def match_rows(job: BottlePhotoJob, rows: list[BottlePhotoRow]) -> list[BottlePhotoRow]:
    """Point each wine to the same wine already in the cellar, or to the catalog."""
    from app.api.routes.ai import (
        acquisition_catalog_matches,
        cellar_command_catalog_candidate,
        matching_cellar_command_wines,
    )

    matched: list[BottlePhotoRow] = []
    with SessionLocal() as db:
        context = _worker_context(db, job)
        for row in rows:
            parsed = {"wine_name": row.name, "producer": row.producer, "vintage": row.vintage}
            update: dict[str, Any] = {}
            ranked = matching_cellar_command_wines(db, context, parsed, include_finished=True)
            if ranked:
                wine, score = ranked[0]
                clear = len(ranked) == 1 or score - ranked[1][1] >= 20
                # Without a legible vintage, only a wine that has none is the same wine.
                same_vintage = bool(row.vintage) or not wine.vintage.strip()
                if score >= 100 and clear and same_vintage:
                    update["existing_wine"] = BottlePhotoExistingWine(
                        wine_id=wine.id,
                        name=wine.name,
                        producer=wine.producer,
                        vintage=wine.vintage,
                        quantity=wine.quantity,
                    )
            catalog = acquisition_catalog_matches(db, parsed)
            if catalog:
                entry, score = catalog[0]
                clear = len(catalog) == 1 or score - catalog[1][1] >= 15
                if score >= 80 and clear:
                    update["catalog"] = cellar_command_catalog_candidate(entry)
            matched.append(row.model_copy(update=update))
    return matched


def run_job(job: BottlePhotoJob, photos: list[Photo]) -> None:
    try:
        job.result = scan(job, photos)
        job.stage = "done"
        job.status = "done"
    except HTTPException as exc:
        job.error = str(exc.detail)
        job.status = "failed"
    except Exception:
        logger.exception("Bottle photo import failed")
        job.error = "The photos could not be analysed. Try again."
        job.status = "failed"
    finally:
        photos.clear()


def scan(job: BottlePhotoJob, photos: list[Photo]) -> BottlePhotoScanResult:
    readings: list[list[BottlePhotoRow]] = []
    failures: list[BaseException] = []
    total_cost = Decimal("0")
    model = ""
    with ThreadPoolExecutor(max_workers=MAX_PARALLEL_PHOTOS) as executor:
        futures = [
            executor.submit(read_photo, job, image, size=size, image_index=index)
            for index, (image, size) in enumerate(photos)
        ]
        for future in as_completed(futures):
            try:
                rows, cost, model = future.result()
            except Exception as exc:
                failures.append(exc)
                logger.warning("Bottle photo failed: %s", type(exc).__name__)
            else:
                total_cost += cost
                if rows is None:
                    failures.append(ValueError("unusable photo answer"))
                else:
                    readings.append(rows)
            job.photos_done += 1
            job.wines_found = len(merge_rows(readings))
    if not readings:
        first = failures[0] if failures else None
        if isinstance(first, HTTPException):
            raise first
        raise HTTPException(502, "The photos could not be read. Try again.")
    job.stage = "matching"
    rows = match_rows(job, merge_rows(readings))
    job.wines_found = len(rows)
    return BottlePhotoScanResult(
        rows=rows, photo_count=len(photos), model=model, estimated_cost_usd=total_cost
    )
