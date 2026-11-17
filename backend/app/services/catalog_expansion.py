"""Add the wines of more producers to the shared catalog, as proposals to approve.

An app administrator names producers, or a wine area whose producers the AI finds.
Each producer is one AI call with web search that lists its range; a wine is kept
only when it cites a page the search returned. New wines become pending catalog
entries (source ``ai_research``): nothing reaches the cellars before approval.
Wines the catalog already knows are left untouched.
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
from sqlalchemy import delete, func, or_, select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.wine_types import normalize_wine_type
from app.db.session import SessionLocal
from app.models import WineCatalogAlias, WineCatalogEntry
from app.prompts.catalog_expansion import catalog_producers_prompt, catalog_range_prompt
from app.prompts.library import Prompt
from app.schemas.catalog_completion import CatalogCompletionStop
from app.schemas.catalog_expansion import (
    CatalogExpansionJobStatus,
    CatalogExpansionProposal,
    CatalogExpansionStatus,
)
from app.services.catalog_photo_details import _same_wine_part, _text
from app.services.catalog_photo_scan import _worker_context
from app.services.shared_wine_data import normalize_identity_part

logger = logging.getLogger(__name__)

SOURCE = "ai_research"
MAX_PARALLEL_CALLS = 2
MAX_CONSECUTIVE_FAILURES = 3
MAX_WINES_PER_PRODUCER = 30
MAX_KNOWN_PRODUCERS = 300
MAX_PENDING_SHOWN = 300
CALL_TIMEOUT_SECONDS = 240

PRODUCERS_SCHEMA = {
    "name": "catalog_expansion_producers",
    "schema": {
        "type": "object",
        "additionalProperties": False,
        "properties": {"producers": {"type": "array", "items": {"type": "string"}}},
        "required": ["producers"],
    },
}
RANGE_SCHEMA = {
    "name": "catalog_expansion_range",
    "schema": {
        "type": "object",
        "additionalProperties": False,
        "properties": {
            "found": {"type": "boolean"},
            "producer": {"type": "string"},
            "wines": {
                "type": "array",
                "items": {
                    "type": "object",
                    "additionalProperties": False,
                    "properties": {
                        "name": {"type": "string"},
                        "appellation": {"type": "string"},
                        "region": {"type": "string"},
                        "country": {"type": "string"},
                        "wine_type": {"type": "string"},
                        "grapes": {"type": "array", "items": {"type": "string"}},
                        "description": {"type": "string"},
                        "source_urls": {"type": "array", "items": {"type": "string"}},
                    },
                    "required": [
                        "name",
                        "appellation",
                        "region",
                        "country",
                        "wine_type",
                        "grapes",
                        "description",
                        "source_urls",
                    ],
                },
            },
        },
        "required": ["found", "producer", "wines"],
    },
}


@dataclass
class CatalogExpansionJob:
    id: uuid.UUID
    household_id: uuid.UUID
    user_id: uuid.UUID
    session_id: uuid.UUID
    locale: str
    area: str
    country: str
    producers: list[str]
    producer_count: int
    budget_usd: Decimal
    started_at: datetime = field(default_factory=lambda: datetime.now(UTC))
    status: Literal["running", "done"] = "running"
    stage: Literal["discovering", "researching", "done"] = "discovering"
    stop_reason: CatalogCompletionStop = ""
    producers_done: int = 0
    producers_not_found: list[str] = field(default_factory=list)
    created: int = 0
    existing: int = 0
    unsupported: int = 0
    cost_usd: Decimal = Decimal("0")
    error: str = ""
    cancelled: bool = False

    def snapshot(self) -> CatalogExpansionJobStatus:
        return CatalogExpansionJobStatus(
            id=self.id,
            status=self.status,
            stage=self.stage,
            stop_reason=self.stop_reason,
            producers_total=len(self.producers),
            producers_done=self.producers_done,
            producers_not_found=list(self.producers_not_found),
            created=self.created,
            existing=self.existing,
            unsupported=self.unsupported,
            cost_usd=self.cost_usd,
            budget_usd=self.budget_usd,
            error=self.error,
            started_at=self.started_at,
        )


_job: CatalogExpansionJob | None = None
_job_lock = Lock()


def submit(task: Any, *args: Any) -> None:
    """Run a batch in the background; tests replace this to run it inline."""
    Thread(target=task, args=args, name="catalog-expansion", daemon=True).start()


def _pending() -> Any:
    return select(WineCatalogEntry).where(
        WineCatalogEntry.is_active.is_(False), WineCatalogEntry.source == SOURCE
    )


def expansion_status(db: Session) -> CatalogExpansionStatus:
    count = db.scalar(_pending().with_only_columns(func.count())) or 0
    entries = db.scalars(
        _pending()
        .order_by(
            func.lower(WineCatalogEntry.producer),
            func.lower(WineCatalogEntry.name),
            WineCatalogEntry.id,
        )
        .limit(MAX_PENDING_SHOWN)
    )
    job = _job
    return CatalogExpansionStatus(
        pending_count=count,
        pending=[
            CatalogExpansionProposal(
                id=entry.id,
                name=entry.name,
                producer=entry.producer,
                appellation=entry.appellation,
                region=entry.region,
                country=entry.country,
                type=normalize_wine_type(entry.type),
                grapes_text=entry.grapes_text,
                description=entry.description,
                source_url=next(
                    (
                        str(source.get("url") or "")
                        for source in entry.sources or []
                        if isinstance(source, dict)
                    ),
                    "",
                ),
            )
            for entry in entries
        ],
        job=job.snapshot() if job else None,
    )


def start(
    *,
    household_id: uuid.UUID,
    user_id: uuid.UUID,
    session_id: uuid.UUID,
    locale: str,
    area: str,
    country: str,
    producers: list[str],
    producer_count: int,
    budget_usd: Decimal,
) -> CatalogExpansionJob:
    global _job
    with _job_lock:
        if _job is not None and _job.status == "running":
            raise HTTPException(status.HTTP_409_CONFLICT, "A catalog research is already running")
        unique: dict[str, str] = {}
        for name in producers:
            unique.setdefault(normalize_identity_part(name), name)
        job = CatalogExpansionJob(
            id=uuid.uuid4(),
            household_id=household_id,
            user_id=user_id,
            session_id=session_id,
            locale=locale,
            area=area,
            country=country,
            producers=list(unique.values()),
            producer_count=producer_count,
            budget_usd=budget_usd,
        )
        _job = job
    submit(run, job)
    return job


def cancel() -> None:
    job = _job
    if job is not None and job.status == "running":
        job.cancelled = True


def review(db: Session, ids: list[uuid.UUID], *, approve: bool, user_id: uuid.UUID) -> int:
    """Approve or discard pending AI proposals; anything else is left alone."""
    from app.api.routes.catalog import validate_available_sensory_profiles_for_catalog_entry

    entries = list(db.scalars(_pending().where(WineCatalogEntry.id.in_(ids))))
    now = datetime.now(UTC)
    for entry in entries:
        if approve:
            entry.is_active = True
            entry.updated_at = now
            validate_available_sensory_profiles_for_catalog_entry(
                db, entry, modified_by_user_id=user_id
            )
        else:
            db.execute(
                delete(WineCatalogAlias).where(WineCatalogAlias.catalog_entry_id == entry.id)
            )
            db.delete(entry)
    db.commit()
    return len(entries)


def _ask(
    job: Any,
    prompt: Prompt,
    schema: dict[str, Any],
    *,
    feature: str,
    tools: int,
    web_search: bool = True,
) -> tuple[dict[str, Any], Any, Decimal]:
    """One AI call on the application's key (web search by default): answer, response, cost."""
    from app.api.routes.ai import (
        create_ai_response,
        effective_response_model,
        get_or_create_user_ai_settings,
        record_ai_audit,
        web_search_source_entries,
        web_search_tool_cost_usd,
    )
    from app.services.openai_client import parse_json_response

    with SessionLocal() as db:
        context = _worker_context(db, job)
        user_settings = get_or_create_user_ai_settings(db, context)
        model = settings.openai_economy_model
        response, provider_source = create_ai_response(
            db,
            context,
            user_settings,
            model=model,
            task_type="research",
            complexity="low",
            system_prompt=prompt.system,
            user_prompt=prompt.user,
            json_schema=schema,
            web_search=web_search,
            web_search_use_default_location=False,
            web_search_context_size="low" if web_search else None,
            reasoning_effort="low",
            max_output_tokens=9000,
            max_tool_calls=tools if web_search else None,
            timeout_seconds=CALL_TIMEOUT_SECONDS,
            app_granted=True,
        )
        try:
            parsed = parse_json_response(response.text)
        except HTTPException:
            parsed = {}
        search_cost = web_search_tool_cost_usd(response.web_search_calls)
        record_ai_audit(
            db,
            context,
            entity_type="catalog",
            entity_id=context.household.id,
            feature=feature,
            model=effective_response_model(response, model),
            reasoning_effort=response.reasoning_effort or "",
            summary="Catalog expansion research.",
            sources=web_search_source_entries(response.web_sources),
            usage=response.usage,
            provider_source=provider_source,
            extra_cost_usd=search_cost,
        )
        db.commit()
        return parsed, response, response.charged_cost_usd + search_cost


def known_producers(db: Session, area: str, country: str) -> list[str]:
    """Producers the catalog already lists for the area (or the country without one)."""
    like = f"%{(area or country).lower()}%"
    statement = (
        select(WineCatalogEntry.producer)
        .where(
            func.trim(WineCatalogEntry.producer) != "",
            or_(
                func.lower(WineCatalogEntry.appellation).like(like),
                func.lower(WineCatalogEntry.region).like(like),
                func.lower(WineCatalogEntry.wine_zone).like(like),
                func.lower(WineCatalogEntry.country).like(like),
            ),
        )
        .distinct()
        .order_by(WineCatalogEntry.producer)
        .limit(MAX_KNOWN_PRODUCERS)
    )
    return list(db.scalars(statement))


def discover(job: CatalogExpansionJob) -> None:
    """Find the producers of the area the catalog does not list yet."""
    with SessionLocal() as db:
        known = known_producers(db, job.area, job.country)
    prompt = catalog_producers_prompt(
        area=job.area, country=job.country, count=job.producer_count, known=known
    )
    parsed, _, cost = _ask(
        job, prompt, PRODUCERS_SCHEMA, feature="catalog_expansion_producers", tools=3
    )
    job.cost_usd += cost
    covered = {normalize_identity_part(name) for name in known}
    found: dict[str, str] = {}
    raw = parsed.get("producers")
    for item in raw if isinstance(raw, list) else []:
        name = _text(item, 200)
        key = normalize_identity_part(name)
        if key and key not in covered:
            found.setdefault(key, name)
    job.producers = list(found.values())[: job.producer_count]


def range_wines(
    producer: str, parsed: dict[str, Any], web_sources: Any
) -> tuple[list[dict[str, Any]], int]:
    """The wines of the answer a searched page supports, and how many were dropped."""
    from app.api.routes.operations import canonical_source_url

    if parsed.get("found") is not True or not _same_wine_part(
        producer, _text(parsed.get("producer"), 200)
    ):
        return [], 0
    verified: dict[str, dict[str, str]] = {}
    for source in web_sources or ():
        key = canonical_source_url(source.get("url"))
        if key:
            verified.setdefault(key, source)
    wines: list[dict[str, Any]] = []
    seen: set[str] = set()
    dropped = 0
    raw = parsed.get("wines")
    for item in raw if isinstance(raw, list) else []:
        if not isinstance(item, dict):
            continue
        name = _text(item.get("name"), 200)
        key = normalize_identity_part(name)
        if not key or key in seen:
            continue
        seen.add(key)
        urls = item.get("source_urls")
        sources = []
        for url in urls if isinstance(urls, list) else []:
            source = verified.get(canonical_source_url(url))
            if source is not None and source not in sources:
                sources.append(source)
        if not sources:
            dropped += 1
            continue
        grapes: list[str] = []
        raw_grapes = item.get("grapes")
        for grape in raw_grapes if isinstance(raw_grapes, list) else []:
            text = _text(grape, 60)
            if text and text.casefold() not in {value.casefold() for value in grapes}:
                grapes.append(text)
        wines.append(
            {
                "name": name,
                "appellation": _text(item.get("appellation"), 120),
                "region": _text(item.get("region"), 120),
                "country": _text(item.get("country"), 120),
                "type": normalize_wine_type(_text(item.get("wine_type"), 40)),
                "grapes_text": ", ".join(grapes[:8])[:400],
                "description": _text(item.get("description"), 1200),
                "sources": [
                    {
                        "kind": "web_search_source",
                        "url": str(source.get("url") or "")[:500],
                        "title": _text(source.get("title"), 200),
                    }
                    for source in sources[:6]
                ],
            }
        )
        if len(wines) >= MAX_WINES_PER_PRODUCER:
            break
    return wines, dropped


def research_producer(job: CatalogExpansionJob, producer: str) -> None:
    """List one producer's range and save the wines the catalog does not know."""
    from app.api.routes.catalog import ensure_catalog_entry_for_wine_data
    from app.services.catalog_sync import matching_catalog_entries

    prompt = catalog_range_prompt(
        locale=job.locale, producer=producer, area=job.area, country=job.country
    )
    parsed, response, cost = _ask(
        job, prompt, RANGE_SCHEMA, feature="catalog_expansion_range", tools=4
    )
    wines, dropped = range_wines(producer, parsed, response.web_sources)
    created = existing = 0
    now = datetime.now(UTC)
    with SessionLocal() as db:
        for wine in wines:
            if matching_catalog_entries(db, wine["name"], producer, approved_only=False):
                existing += 1
                continue
            entry = ensure_catalog_entry_for_wine_data(
                db, {**wine, "producer": producer}, source=SOURCE
            )
            if entry is None:
                continue
            entry.description = wine["description"]
            entry.sources = wine["sources"]
            entry.enriched_at = now
            created += 1
        db.commit()
    job.cost_usd += cost
    job.created += created
    job.existing += existing
    job.unsupported += dropped
    if not wines:
        job.producers_not_found.append(producer)


def run(job: CatalogExpansionJob) -> None:
    calls = 0
    consecutive_failures = 0
    try:
        if not job.producers:
            try:
                discover(job)
            except HTTPException as exc:
                job.stop_reason, job.error = "failed", str(exc.detail)
                return
            if not job.producers:
                job.stop_reason = "finished"
                job.error = "No new producer was found for this area."
                return
        job.stage = "researching"
        with ThreadPoolExecutor(max_workers=MAX_PARALLEL_CALLS) as executor:
            for start_at in range(0, len(job.producers), MAX_PARALLEL_CALLS):
                if job.cancelled:
                    job.stop_reason = "cancelled"
                    return
                # Leave room for the calls about to start, at the average cost so far.
                wave = job.producers[start_at : start_at + MAX_PARALLEL_CALLS]
                average = job.cost_usd / calls if calls else Decimal("0")
                if job.cost_usd + average * len(wave) > job.budget_usd:
                    job.stop_reason = "budget"
                    return
                futures = [executor.submit(research_producer, job, name) for name in wave]
                for future in futures:
                    try:
                        future.result()
                    except HTTPException as exc:
                        consecutive_failures += 1
                        job.error = str(exc.detail)
                    except Exception:
                        consecutive_failures += 1
                        job.error = "The research did not answer for some producers."
                        logger.exception("Catalog expansion call failed")
                    else:
                        consecutive_failures = 0
                        calls += 1
                    job.producers_done += 1
                if consecutive_failures >= MAX_CONSECUTIVE_FAILURES:
                    job.stop_reason = "failed"
                    return
        job.stop_reason = "finished"
    except Exception:
        logger.exception("Catalog expansion stopped")
        job.stop_reason = "failed"
        job.error = job.error or "The catalog research stopped unexpectedly."
    finally:
        job.stage = "done"
        job.status = "done"
