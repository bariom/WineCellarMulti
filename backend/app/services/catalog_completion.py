"""Complete the approved catalog entries that lack grapes or country, in batches.

An app administrator starts a batch with a spending cap. Each AI call researches a few
wines of the same producer on the web; an entry only receives the fields it lacks, and
only from pages the search actually returned. Entries are saved call by call, so a
batch that stops (cap reached, cancelled, server restarted) loses nothing.
"""

from __future__ import annotations

import logging
import uuid
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass, field
from datetime import UTC, datetime
from decimal import Decimal
from threading import Lock, Thread
from typing import Any, Literal

from fastapi import HTTPException, status
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from app.db.session import SessionLocal
from app.models import WineCatalogEntry
from app.prompts.catalog_photo import catalog_completion_prompt
from app.schemas.catalog_completion import (
    CatalogCompletionJobStatus,
    CatalogCompletionStatus,
    CatalogCompletionStop,
)
from app.schemas.catalog_photo import CatalogPhotoBottle, CatalogPhotoDetails
from app.services import catalog_photo_details

logger = logging.getLogger(__name__)

WINES_PER_CALL = 5
MAX_PARALLEL_CALLS = 2
# Stop a batch whose calls keep failing (AI unavailable, session expired).
MAX_CONSECUTIVE_FAILURES = 3
FILLABLE_FIELDS = ("appellation", "region", "country", "type", "grapes_text", "description")


@dataclass
class CatalogCompletionJob:
    id: uuid.UUID
    household_id: uuid.UUID
    user_id: uuid.UUID
    session_id: uuid.UUID
    locale: str
    entry_ids: list[uuid.UUID]
    budget_usd: Decimal
    started_at: datetime = field(default_factory=lambda: datetime.now(UTC))
    status: Literal["running", "done"] = "running"
    stop_reason: CatalogCompletionStop = ""
    done: int = 0
    completed: int = 0
    not_found: int = 0
    failed: int = 0
    cost_usd: Decimal = Decimal("0")
    error: str = ""
    cancelled: bool = False

    def snapshot(self) -> CatalogCompletionJobStatus:
        return CatalogCompletionJobStatus(
            id=self.id,
            status=self.status,
            stop_reason=self.stop_reason,
            total=len(self.entry_ids),
            done=self.done,
            completed=self.completed,
            not_found=self.not_found,
            failed=self.failed,
            cost_usd=self.cost_usd,
            budget_usd=self.budget_usd,
            error=self.error,
            started_at=self.started_at,
        )


_job: CatalogCompletionJob | None = None
_job_lock = Lock()


def submit(task: Any, *args: Any) -> None:
    """Run a batch in the background; tests replace this to run it inline."""
    Thread(target=task, args=args, name="catalog-completion", daemon=True).start()


def _incomplete(*, untried_only: bool) -> Any:
    """Approved entries missing grapes or country."""
    statement = select(WineCatalogEntry).where(
        WineCatalogEntry.is_active.is_(True),
        func.trim(WineCatalogEntry.producer) != "",
        or_(
            func.trim(WineCatalogEntry.grapes_text) == "",
            func.trim(WineCatalogEntry.country) == "",
        ),
    )
    if untried_only:
        statement = statement.where(WineCatalogEntry.completion_attempted_at.is_(None))
    return statement


def _count(db: Session, *, untried_only: bool) -> int:
    statement = _incomplete(untried_only=untried_only).with_only_columns(func.count())
    return db.scalar(statement) or 0


def completion_status(db: Session) -> CatalogCompletionStatus:
    everything = _count(db, untried_only=False)
    untried = _count(db, untried_only=True)
    job = _job
    return CatalogCompletionStatus(
        incomplete_count=untried,
        not_found_count=everything - untried,
        job=job.snapshot() if job else None,
    )


def start(
    db: Session,
    *,
    household_id: uuid.UUID,
    user_id: uuid.UUID,
    session_id: uuid.UUID,
    locale: str,
    limit: int,
    budget_usd: Decimal,
    retry_not_found: bool,
) -> CatalogCompletionJob:
    global _job
    with _job_lock:
        if _job is not None and _job.status == "running":
            raise HTTPException(status.HTTP_409_CONFLICT, "A catalog completion is already running")
        # Wines of one producer side by side: one search often covers the whole call.
        entry_ids = list(
            db.scalars(
                _incomplete(untried_only=not retry_not_found)
                .with_only_columns(WineCatalogEntry.id)
                .order_by(
                    func.lower(WineCatalogEntry.producer),
                    func.lower(WineCatalogEntry.name),
                    WineCatalogEntry.id,
                )
                .limit(limit)
            )
        )
        if not entry_ids:
            raise HTTPException(status.HTTP_409_CONFLICT, "No catalog entry needs completing")
        job = CatalogCompletionJob(
            id=uuid.uuid4(),
            household_id=household_id,
            user_id=user_id,
            session_id=session_id,
            locale=locale,
            entry_ids=entry_ids,
            budget_usd=budget_usd,
        )
        _job = job
    submit(run, job)
    return job


def cancel() -> None:
    job = _job
    if job is not None and job.status == "running":
        job.cancelled = True


def apply_details(entry: WineCatalogEntry, details: CatalogPhotoDetails, now: datetime) -> bool:
    """Fill the fields the entry lacks; whatever it already holds stays untouched."""
    from app.api.routes.catalog import build_search_text

    values = {
        "appellation": details.appellation[:120],
        "region": details.region[:120],
        "country": details.country[:120],
        "type": details.wine_type[:80],
        "grapes_text": ", ".join(details.grapes)[:400],
        "description": details.description[:1500],
    }
    changed = False
    for name in FILLABLE_FIELDS:
        if values[name] and not str(getattr(entry, name) or "").strip():
            setattr(entry, name, values[name])
            changed = True
    if not changed:
        return False
    if not entry.sources:
        entry.sources = [
            {"kind": "web_search_source", "url": source.url, "title": source.title}
            for source in details.sources
        ]
    entry.enriched_at = now
    entry.updated_at = now
    entry.search_text = build_search_text(
        entry.name,
        entry.producer,
        entry.region,
        entry.appellation,
        entry.type,
        entry.country,
        entry.grapes_text,
        entry.wine_zone,
        entry.locality,
    )
    return True


def complete_group(job: CatalogCompletionJob, entry_ids: list[uuid.UUID]) -> None:
    """Research one call's worth of entries and save what was found."""
    with SessionLocal() as db:
        entries = [entry for item in entry_ids if (entry := db.get(WineCatalogEntry, item))]
        found_ids = [entry.id for entry in entries]
        wines = [
            CatalogPhotoBottle(
                name=entry.name,
                producer=entry.producer,
                appellation=entry.appellation,
                region=entry.region,
                country=entry.country,
                wine_type=entry.type,
            )
            for entry in entries
        ]
    if not wines:
        return
    details, cost = catalog_photo_details.research_group(
        job,
        wines,
        locale=job.locale,
        feature="catalog_completion",
        build_prompt=catalog_completion_prompt,
    )
    now = datetime.now(UTC)
    completed = 0
    with SessionLocal() as db:
        for position, entry_id in enumerate(found_ids):
            entry = db.get(WineCatalogEntry, entry_id)
            if entry is None:
                continue
            found = details.get(position)
            if found is not None and found.found and apply_details(entry, found, now):
                completed += 1
            entry.completion_attempted_at = now
        db.commit()
    job.cost_usd += cost
    job.completed += completed
    job.not_found += len(entry_ids) - completed


def run(job: CatalogCompletionJob) -> None:
    groups = [
        job.entry_ids[start : start + WINES_PER_CALL]
        for start in range(0, len(job.entry_ids), WINES_PER_CALL)
    ]
    calls = 0
    consecutive_failures = 0
    try:
        with ThreadPoolExecutor(max_workers=MAX_PARALLEL_CALLS) as executor:
            for start_at in range(0, len(groups), MAX_PARALLEL_CALLS):
                if job.cancelled:
                    job.stop_reason = "cancelled"
                    return
                # Leave room for the calls about to start, at the average cost so far.
                wave = groups[start_at : start_at + MAX_PARALLEL_CALLS]
                average = job.cost_usd / calls if calls else Decimal("0")
                if job.cost_usd + average * len(wave) > job.budget_usd:
                    job.stop_reason = "budget"
                    return
                futures = [(executor.submit(complete_group, job, group), group) for group in wave]
                for future, group in futures:
                    try:
                        future.result()
                    except HTTPException as exc:
                        consecutive_failures += 1
                        job.failed += len(group)
                        job.error = str(exc.detail)
                    except Exception:
                        consecutive_failures += 1
                        job.failed += len(group)
                        job.error = "The research did not answer for some wines."
                        logger.exception("Catalog completion call failed")
                    else:
                        consecutive_failures = 0
                        calls += 1
                    job.done += len(group)
                if consecutive_failures >= MAX_CONSECUTIVE_FAILURES:
                    job.stop_reason = "failed"
                    return
        job.stop_reason = "finished"
    except Exception:
        logger.exception("Catalog completion stopped")
        job.stop_reason = "failed"
        job.error = job.error or "The catalog completion stopped unexpectedly."
    finally:
        job.status = "done"
