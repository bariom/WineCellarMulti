"""Wine-shop shelf scans run as short-lived background jobs with visible progress.

A crowded shelf is read in overlapping photo sections, several at a time, and the
best buys are then ranked from the recognized bottles in a text-only call. The
photos stay in memory for the job's duration only; the job and its result are
kept in this process for a short while so the app can poll them.
"""

from __future__ import annotations

import logging
import math
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
from app.prompts import wine_shelf_ranking_prompt, wine_shelf_recognition_prompt
from app.schemas.ai import (
    WineShelfBottle,
    WineShelfCellarMode,
    WineShelfRecommendation,
    WineShelfScanResponse,
    WineShelfScanStatus,
)
from app.services.wine_image_recognition import label_snapper

logger = logging.getLogger(__name__)

MAX_PARALLEL_SECTIONS = 4
MAX_BOTTLES = 120
MAX_BOTTLES_PER_SECTION = 60
SECTION_TIMEOUT_SECONDS = 120
RANKING_TIMEOUT_SECONDS = 120
JOB_RETENTION = timedelta(minutes=30)
# A finished job that nobody polls is dropped; a stuck one is reported as failed.
JOB_MAX_RUNTIME = timedelta(minutes=8)

# JPEG bytes, box (x, y, width, height) normalized to the whole photo, pixel size.
Section = tuple[bytes, tuple[float, float, float, float], tuple[int, int]]


@dataclass
class ShelfScanRequest:
    photos: list[list[Section]]
    locale: str
    occasion: str
    budget_chf: str
    wine_type: str
    ranking_size: int
    cellar_mode: str
    cellar_context: dict
    taste_context: dict
    pairing_preferences: str


@dataclass
class ShelfScanJob:
    id: uuid.UUID
    household_id: uuid.UUID
    user_id: uuid.UUID
    session_id: uuid.UUID
    created_at: datetime = field(default_factory=lambda: datetime.now(UTC))
    status: Literal["running", "done", "failed"] = "running"
    stage: Literal["reading", "ranking", "done"] = "reading"
    sections_total: int = 0
    sections_done: int = 0
    bottles_found: int = 0
    error: str = ""
    result: WineShelfScanResponse | None = None

    def snapshot(self) -> WineShelfScanStatus:
        status = self.status
        error = self.error
        if status == "running" and datetime.now(UTC) - self.created_at > JOB_MAX_RUNTIME:
            status, error = "failed", "The shelf analysis took too long. Try again."
        return WineShelfScanStatus(
            id=self.id,
            status=status,
            stage=self.stage,
            sections_total=self.sections_total,
            sections_done=self.sections_done,
            bottles_found=self.bottles_found,
            error=error,
            result=self.result if status == "done" else None,
        )


_jobs: dict[uuid.UUID, ShelfScanJob] = {}
_jobs_lock = Lock()
_executor = ThreadPoolExecutor(max_workers=2, thread_name_prefix="shelf-scan")


def submit(task: Callable[..., None], *args: Any) -> None:
    """Run a job in the background; tests replace this to run it inline."""
    _executor.submit(task, *args)


def _prune(now: datetime) -> None:
    for job_id, job in list(_jobs.items()):
        if now - job.created_at > JOB_RETENTION:
            del _jobs[job_id]


def running_job_for(user_id: uuid.UUID) -> ShelfScanJob | None:
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
    *, household_id: uuid.UUID, user_id: uuid.UUID, session_id: uuid.UUID, request: ShelfScanRequest
) -> ShelfScanJob:
    job = ShelfScanJob(
        id=uuid.uuid4(),
        household_id=household_id,
        user_id=user_id,
        session_id=session_id,
        sections_total=sum(len(sections) for sections in request.photos),
    )
    with _jobs_lock:
        _prune(datetime.now(UTC))
        _jobs[job.id] = job
    submit(run_job, job, request)
    return job


def get_job(
    job_id: uuid.UUID, *, household_id: uuid.UUID, user_id: uuid.UUID
) -> ShelfScanJob | None:
    with _jobs_lock:
        job = _jobs.get(job_id)
    if job is None or job.household_id != household_id or job.user_id != user_id:
        return None
    return job


def _clamp_unit(value: object) -> float:
    if isinstance(value, bool) or not isinstance(value, int | float) or not math.isfinite(value):
        return 0.0
    return min(max(float(value), 0.0), 1.0)


def _identity(bottle: WineShelfBottle) -> str:
    text = f"{bottle.producer} {bottle.name} {bottle.vintage}"
    folded = unicodedata.normalize("NFKD", text).encode("ascii", "ignore").decode().casefold()
    return " ".join("".join(char if char.isalnum() else " " for char in folded).split())


CONFIDENCE_ORDER = {"high": 0, "medium": 1, "low": 2}

RECOGNITION_SCHEMA = {
    "name": "wine_shelf_section",
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
                        "style": {"type": "string"},
                        "region": {"type": "string"},
                        "price_text": {"type": "string"},
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
                        "style",
                        "region",
                        "price_text",
                        "confidence",
                        "center_x",
                        "center_y",
                        "label_width",
                        "label_height",
                    ],
                },
            }
        },
        "required": ["bottles"],
    },
}

RANKING_SCHEMA = {
    "name": "wine_shelf_ranking",
    "schema": {
        "type": "object",
        "additionalProperties": False,
        "properties": {
            "summary": {"type": "string"},
            "ranking": {
                "type": "array",
                "items": {
                    "type": "object",
                    "additionalProperties": False,
                    "properties": {
                        "bottle_index": {"type": "integer"},
                        "reason": {"type": "string"},
                        "taste_affinity": {"type": "integer", "minimum": 0, "maximum": 6},
                    },
                    "required": ["bottle_index", "reason", "taste_affinity"],
                },
            },
            "owned_indexes": {"type": "array", "items": {"type": "integer"}},
        },
        "required": ["summary", "ranking", "owned_indexes"],
    },
}


def _pixel_ratio(value: object, size: int) -> float:
    if isinstance(value, bool) or not isinstance(value, int | float) or not math.isfinite(value):
        return 0.0
    return _clamp_unit(value / size) if size > 0 else 0.0


def section_bottles(
    parsed: dict[str, Any],
    *,
    image_index: int,
    box: tuple[float, float, float, float],
    size: tuple[int, int],
    snap: Callable[[float, float, float, float], tuple[float, float]] | None = None,
) -> list[WineShelfBottle]:
    """Validate one section's bottles and map their label points onto the whole photo.

    The model points at the middle of each label in section pixels; the box sent to
    the app is centred on that point and kept inside the section, so the badge sits
    on the bottle. ``snap`` moves the point onto the label seen in the section image.
    """
    left, top, width, height = box
    pixel_width, pixel_height = size
    bottles: list[WineShelfBottle] = []
    raw = parsed.get("bottles")
    for item in raw if isinstance(raw, list) else []:
        if not isinstance(item, dict) or not str(item.get("name") or "").strip():
            continue
        confidence = str(item.get("confidence") or "")
        center_x = _pixel_ratio(item.get("center_x"), pixel_width)
        center_y = _pixel_ratio(item.get("center_y"), pixel_height)
        label_width = _pixel_ratio(item.get("label_width"), pixel_width)
        label_height = _pixel_ratio(item.get("label_height"), pixel_height)
        if snap is not None:
            center_x, center_y = (
                _clamp_unit(value) for value in snap(center_x, center_y, label_width, label_height)
            )
        half_width = min(label_width / 2, center_x, 1 - center_x)
        half_height = min(label_height / 2, center_y, 1 - center_y)
        bottles.append(
            WineShelfBottle(
                name=str(item.get("name") or "").strip()[:180],
                producer=str(item.get("producer") or "").strip()[:180],
                vintage=str(item.get("vintage") or "").strip()[:12],
                style=str(item.get("style") or "").strip()[:100],
                region=str(item.get("region") or "").strip()[:120],
                price_text=str(item.get("price_text") or "").strip()[:80],
                confidence=cast(
                    Literal["high", "medium", "low"],
                    confidence if confidence in CONFIDENCE_ORDER else "low",
                ),
                owned=False,
                image_index=image_index,
                x=left + (center_x - half_width) * width,
                y=top + (center_y - half_height) * height,
                width=2 * half_width * width,
                height=2 * half_height * height,
            )
        )
        if len(bottles) == MAX_BOTTLES_PER_SECTION:
            break
    return bottles


def merge_bottles(readings: list[list[WineShelfBottle]]) -> list[WineShelfBottle]:
    """One entry per wine across overlapping sections and photos, keeping the surest reading."""
    merged: dict[str, WineShelfBottle] = {}
    for bottles in readings:
        for bottle in bottles:
            key = _identity(bottle)
            current = merged.get(key)
            if current is None:
                merged[key] = bottle
                continue
            better = CONFIDENCE_ORDER[bottle.confidence] < CONFIDENCE_ORDER[current.confidence]
            chosen = bottle if better else current
            other = current if better else bottle
            merged[key] = chosen.model_copy(
                update={
                    field_name: getattr(chosen, field_name) or getattr(other, field_name)
                    for field_name in ("style", "region", "price_text")
                }
            )
    ordered = sorted(merged.values(), key=lambda item: (item.image_index, item.y, item.x))
    return ordered[:MAX_BOTTLES]


def run_job(job: ShelfScanJob, request: ShelfScanRequest) -> None:
    try:
        job.result = scan(job, request)
        job.stage = "done"
        job.status = "done"
    except HTTPException as exc:
        job.error = str(exc.detail)
        job.status = "failed"
    except Exception:
        logger.exception("Wine shelf scan failed")
        job.error = "The shelf could not be analysed. Try again."
        job.status = "failed"
    finally:
        # The photos are not needed any more.
        request.photos.clear()


def _worker_context(db: Any, job: ShelfScanJob) -> Any:
    from app.services.sensory_agent import worker_context

    try:
        return worker_context(
            db, job.household_id, job.user_id, job.session_id, app_admin_only=False
        )
    except PermissionError as exc:
        raise HTTPException(401, "Session expired during the shelf analysis") from exc


def read_section(
    job: ShelfScanJob,
    image: bytes,
    *,
    image_index: int,
    box: tuple[float, float, float, float],
    size: tuple[int, int],
    number: int,
) -> tuple[list[WineShelfBottle] | None, Decimal]:
    """Read one section; the bottles are None when the answer could not be used.

    The call is audited and its cost returned before the answer is parsed: the
    provider bills an unusable answer (e.g. JSON cut short) like any other.
    """
    from app.api.routes.ai import (
        create_ai_response,
        effective_response_model,
        get_or_create_user_ai_settings,
        record_ai_audit,
    )
    from app.services.openai_client import parse_json_response

    prompt = wine_shelf_recognition_prompt(
        section=number, sections=job.sections_total, width=size[0], height=size[1]
    )
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
            timeout_seconds=SECTION_TIMEOUT_SECONDS,
        )
        bottles: list[WineShelfBottle] | None
        try:
            bottles = section_bottles(
                parse_json_response(response.text),
                image_index=image_index,
                box=box,
                size=size,
                snap=label_snapper(image),
            )
        except HTTPException:
            bottles = None
        record_ai_audit(
            db,
            context,
            entity_type="pairing",
            entity_id=context.household.id,
            feature="wine_shelf_scan",
            model=effective_response_model(response, model),
            reasoning_effort=response.reasoning_effort or "",
            summary=(
                f"Wine shelf section {number}/{job.sections_total} read: {len(bottles)} bottles."
                if bottles is not None
                else f"Wine shelf section {number}/{job.sections_total}: unusable answer."
            ),
            usage=response.usage,
            provider_source=provider_source,
        )
        db.commit()
        return bottles, response.charged_cost_usd


def rank(
    job: ShelfScanJob, request: ShelfScanRequest, bottles: list[WineShelfBottle]
) -> tuple[dict[str, Any], str, str, Decimal]:
    from app.api.routes.ai import (
        create_ai_response,
        effective_response_model,
        get_or_create_user_ai_settings,
        record_ai_audit,
    )
    from app.services.openai_client import parse_json_response

    prompt = wine_shelf_ranking_prompt(
        locale=request.locale,
        bottles=[
            {
                "index": index,
                **bottle.model_dump(
                    include={
                        "name",
                        "producer",
                        "vintage",
                        "style",
                        "region",
                        "price_text",
                        "confidence",
                    }
                ),
            }
            for index, bottle in enumerate(bottles)
        ],
        occasion=request.occasion,
        budget_chf=request.budget_chf,
        wine_type=request.wine_type,
        ranking_size=request.ranking_size,
        cellar_mode=request.cellar_mode,
        cellar_context=request.cellar_context,
        taste_context=request.taste_context,
        pairing_preferences=request.pairing_preferences,
    )
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
            json_schema=RANKING_SCHEMA,
            max_output_tokens=3000,
            timeout_seconds=RANKING_TIMEOUT_SECONDS,
        )
        effective_model = effective_response_model(response, model)
        record_ai_audit(
            db,
            context,
            entity_type="pairing",
            entity_id=context.household.id,
            feature="wine_shelf_scan",
            model=effective_model,
            reasoning_effort=response.reasoning_effort or "",
            summary=f"Wine shelf ranked: {len(bottles)} bottles considered.",
            usage=response.usage,
            provider_source=provider_source,
        )
        db.commit()
        return (
            parse_json_response(response.text),
            effective_model,
            response.reasoning_effort or "",
            response.charged_cost_usd,
        )


def scan(job: ShelfScanJob, request: ShelfScanRequest) -> WineShelfScanResponse:
    tasks = [
        (image_index, section, box, size)
        for image_index, sections in enumerate(request.photos)
        for section, box, size in sections
    ]
    readings: list[list[WineShelfBottle]] = []
    total_cost = Decimal("0")
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
                bottles, cost = future.result()
            except Exception as exc:
                failures.append(exc)
                logger.warning("Wine shelf section failed: %s", type(exc).__name__)
            else:
                total_cost += cost
                if bottles is None:
                    failures.append(ValueError("unusable section answer"))
                else:
                    readings.append(bottles)
            job.sections_done += 1
            job.bottles_found = len(merge_bottles(readings))
    if not readings:
        # Every section failed: report the provider's own reason (credit, key, outage).
        first = failures[0] if failures else None
        if isinstance(first, HTTPException):
            raise first
        raise HTTPException(502, "The shelf photos could not be read. Try again.")
    bottles = merge_bottles(readings)
    job.bottles_found = len(bottles)
    it = request.locale == "it"
    if not bottles:
        return WineShelfScanResponse(
            summary=(
                "Non riesco a leggere le etichette. Avvicinati allo scaffale e scatta con più "
                "luce, tenendo il telefono dritto."
                if it
                else "I cannot read the labels. Move closer to the shelf and shoot with more "
                "light, holding the phone straight."
            ),
            photo_count=len(request.photos),
            taste_profile_applied=bool(request.taste_context),
            cellar_mode=cast(WineShelfCellarMode, request.cellar_mode),
            model="",
            estimated_cost_usd=total_cost,
        )
    job.stage = "ranking"
    parsed, model, reasoning_effort, cost = rank(job, request, bottles)
    total_cost += cost
    owned = {
        index
        for index in parsed.get("owned_indexes") or []
        if isinstance(index, int) and request.cellar_mode != "ignore"
    }
    bottles = [
        bottle.model_copy(update={"owned": index in owned}) for index, bottle in enumerate(bottles)
    ]
    recommendations: list[WineShelfRecommendation] = []
    seen: set[int] = set()
    raw_ranking = parsed.get("ranking")
    for item in raw_ranking if isinstance(raw_ranking, list) else []:
        index = item.get("bottle_index") if isinstance(item, dict) else None
        if not isinstance(index, int) or index in seen or not 0 <= index < len(bottles):
            continue
        seen.add(index)
        affinity = item.get("taste_affinity")
        recommendations.append(
            WineShelfRecommendation(
                bottle_index=index,
                rank=len(recommendations) + 1,
                reason=str(item.get("reason") or "").strip()[:600],
                taste_affinity=(
                    affinity
                    if request.taste_context and isinstance(affinity, int) and 0 <= affinity <= 6
                    else 0
                ),
            )
        )
        if len(recommendations) == request.ranking_size:
            break
    summary = str(parsed.get("summary") or "").strip()[:800]
    if failures:
        summary = (
            f"{summary} "
            + (
                f"(Sezioni della foto non lette: {len(failures)}; "
                "alcune bottiglie potrebbero mancare.)"
                if it
                else f"(Photo sections not read: {len(failures)}; some bottles may be missing.)"
            )
        ).strip()
    return WineShelfScanResponse(
        summary=summary,
        bottles=bottles,
        recommendations=recommendations,
        photo_count=len(request.photos),
        taste_profile_applied=bool(request.taste_context),
        cellar_mode=cast(WineShelfCellarMode, request.cellar_mode),
        model=model,
        reasoning_effort=reasoning_effort,
        estimated_cost_usd=total_cost,
    )
