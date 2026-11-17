"""Give the catalog's appellations and grapes a sensory baseline, so its wines get a profile.

A wine's taste profile is blended from the baselines of its appellation, grapes, region
and type; it does not depend on the vintage. Entries added to the catalog often name
appellations and grapes no baseline covers, and fall back to the generic profile of
their wine type. Here an app administrator sees that coverage, lets AI propose the
missing baselines (inactive until activated) and refreshes the estimated profiles.
"""

from __future__ import annotations

import logging
import re
import uuid
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass, field
from datetime import UTC, datetime
from decimal import Decimal
from threading import Lock, Thread
from typing import Any, Literal

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.wine_types import normalize_wine_type
from app.db.session import SessionLocal
from app.models import (
    SensoryProfileBaseline,
    SharedWineIdentity,
    Wine,
    WineCatalogEntry,
    WineSensoryProfile,
)
from app.prompts.catalog_baselines import catalog_baselines_prompt
from app.schemas.catalog_baselines import (
    CatalogBaselineJobStatus,
    CatalogBaselineMissing,
    CatalogBaselineProfileChange,
    CatalogBaselineProposal,
    CatalogBaselineRecalculation,
    CatalogBaselineStatus,
)
from app.schemas.catalog_completion import CatalogCompletionStop
from app.services import catalog_expansion
from app.services.grape_names import clean_grape_name
from app.services.shared_wine_data import normalize_identity_part
from app.services.taste_profiles import (
    BASELINE_WEIGHTS,
    SENSORY_DIMENSIONS,
    TYPE_BASELINES,
    infer_sensory_profile,
    validated_dimensions,
)

logger = logging.getLogger(__name__)

SOURCE = "ai_research"
# The AI did not recognise the item: remembered so that it is not paid for again.
UNKNOWN = "ai_unknown"
# Below the editorial baselines (0.66 to 0.82): an AI estimate weighs less.
AI_CONFIDENCE = 0.6
ITEMS_PER_CALL = 12
MAX_PARALLEL_CALLS = 2
MAX_CONSECUTIVE_FAILURES = 3
MAX_MISSING_SHOWN = 30
MAX_PROPOSALS_SHOWN = 200
MAX_CHANGES_SHOWN = 100
# Profiles computed from baselines; AI, manual and evidence-led ones are never refreshed.
ESTIMATED_SOURCES = {"metadata", "hybrid", *BASELINE_WEIGHTS}

SCHEMA = {
    "name": "catalog_sensory_baselines",
    "schema": {
        "type": "object",
        "additionalProperties": False,
        "properties": {
            "baselines": {
                "type": "array",
                "items": {
                    "type": "object",
                    "additionalProperties": False,
                    "properties": {
                        "index": {"type": "integer"},
                        "known": {"type": "boolean"},
                        **{
                            name: {"type": ["number", "null"], "minimum": 0, "maximum": 1}
                            for name in SENSORY_DIMENSIONS
                        },
                    },
                    "required": ["index", "known", *SENSORY_DIMENSIONS],
                },
            }
        },
        "required": ["baselines"],
    },
}


@dataclass(frozen=True)
class BaselineItem:
    entity_type: str
    entity_key: str
    label: str
    wine_type: str
    wines: int


@dataclass
class CatalogBaselineJob:
    id: uuid.UUID
    household_id: uuid.UUID
    user_id: uuid.UUID
    session_id: uuid.UUID
    items: list[BaselineItem]
    budget_usd: Decimal
    started_at: datetime = field(default_factory=lambda: datetime.now(UTC))
    status: Literal["running", "done"] = "running"
    stop_reason: CatalogCompletionStop = ""
    done: int = 0
    created: int = 0
    unknown: int = 0
    failed: int = 0
    cost_usd: Decimal = Decimal("0")
    error: str = ""
    cancelled: bool = False

    def snapshot(self) -> CatalogBaselineJobStatus:
        return CatalogBaselineJobStatus(
            id=self.id,
            status=self.status,
            stop_reason=self.stop_reason,
            total=len(self.items),
            done=self.done,
            created=self.created,
            unknown=self.unknown,
            failed=self.failed,
            cost_usd=self.cost_usd,
            budget_usd=self.budget_usd,
            error=self.error,
            started_at=self.started_at,
        )


@dataclass
class _Scan:
    entries: int = 0
    specific: int = 0
    generic: int = 0
    without: int = 0
    missing: list[BaselineItem] = field(default_factory=list)
    # Approved wines naming exactly this appellation or grape.
    usage: dict[tuple[str, str], int] = field(default_factory=dict)


_job: CatalogBaselineJob | None = None
_job_lock = Lock()


def submit(task: Any, *args: Any) -> None:
    """Run a batch in the background; tests replace this to run it inline."""
    Thread(target=task, args=args, name="catalog-baselines", daemon=True).start()


def _covered(key: str, keys: set[str]) -> bool:
    """Whether a baseline matches the value or a run of its words, as profile inference does."""
    if not key or not keys:
        return False
    tokens = key.split()
    return any(
        " ".join(tokens[start:end]) in keys
        for start in range(len(tokens))
        for end in range(start + 1, len(tokens) + 1)
    )


def _grapes(text: str) -> dict[str, str]:
    """Normalized grape key -> name as written, without percentages or remarks."""
    grapes: dict[str, str] = {}
    for part in re.split(r"[,;/]+", text or ""):
        label = clean_grape_name(re.sub(r"\d+(?:[.,]\d+)?\s*%?", " ", part))
        key = normalize_identity_part(label)
        if 3 <= len(key) <= 60:
            grapes.setdefault(key, label)
    return grapes


def _scan(db: Session) -> _Scan:
    active: dict[str, set[str]] = {}
    known: dict[str, set[str]] = {}
    for kind, key, is_active in db.execute(
        select(
            SensoryProfileBaseline.entity_type,
            SensoryProfileBaseline.entity_key,
            SensoryProfileBaseline.is_active,
        )
    ):
        known.setdefault(kind, set()).add(key)
        if is_active:
            active.setdefault(kind, set()).add(key)
    scan = _Scan()
    labels: dict[tuple[str, str], str] = {}
    types: dict[str, set[str]] = {}
    for appellation, region, wine_type, grapes_text in db.execute(
        select(
            WineCatalogEntry.appellation,
            WineCatalogEntry.region,
            WineCatalogEntry.type,
            WineCatalogEntry.grapes_text,
        ).where(WineCatalogEntry.is_active.is_(True))
    ):
        scan.entries += 1
        canonical_type = normalize_wine_type(wine_type)
        appellation_key = normalize_identity_part(appellation)
        grapes = _grapes(grapes_text)
        values = [("grape", key, label) for key, label in grapes.items()]
        if 3 <= len(appellation_key) <= 60:
            values.append(("appellation", appellation_key, " ".join(appellation.split())))
            types.setdefault(appellation_key, set()).add(canonical_type)
        for kind, key, label in values:
            scan.usage[(kind, key)] = scan.usage.get((kind, key), 0) + 1
            labels.setdefault((kind, key), label)
        if (
            _covered(appellation_key, active.get("appellation", set()))
            or _covered(normalize_identity_part(region), active.get("region", set()))
            or any(_covered(key, active.get("grape", set())) for key in grapes)
        ):
            scan.specific += 1
        elif canonical_type in TYPE_BASELINES or _covered(
            normalize_identity_part(canonical_type), active.get("wine_type", set())
        ):
            scan.generic += 1
        else:
            scan.without += 1
    for (kind, key), wines in scan.usage.items():
        if _covered(key, known.get(kind, set())):
            continue
        wine_type = ""
        if kind == "appellation":
            # One baseline cannot describe an appellation whose wines differ in colour.
            styles = types.get(key, set())
            if len(styles) != 1 or not next(iter(styles)):
                continue
            wine_type = next(iter(styles))
        scan.missing.append(BaselineItem(kind, key, labels[(kind, key)], wine_type, wines))
    scan.missing.sort(key=lambda item: (-item.wines, item.entity_type, item.entity_key))
    return scan


def _proposals() -> Any:
    return select(SensoryProfileBaseline).where(
        SensoryProfileBaseline.source == SOURCE, SensoryProfileBaseline.is_active.is_(False)
    )


def baseline_status(db: Session) -> CatalogBaselineStatus:
    scan = _scan(db)
    proposals = sorted(
        db.scalars(_proposals()),
        key=lambda item: (
            -scan.usage.get((item.entity_type, item.entity_key), 0),
            item.entity_type,
            item.entity_key,
        ),
    )
    job = _job
    return CatalogBaselineStatus(
        entries=scan.entries,
        specific=scan.specific,
        generic=scan.generic,
        without=scan.without,
        missing_count=len(scan.missing),
        missing=[
            CatalogBaselineMissing(
                entity_type=item.entity_type,  # type: ignore[arg-type]
                label=item.label,
                wines=item.wines,
            )
            for item in scan.missing[:MAX_MISSING_SHOWN]
        ],
        proposal_count=len(proposals),
        proposals=[
            CatalogBaselineProposal(
                id=item.id,
                entity_type=item.entity_type,
                entity_key=item.entity_key,
                dimensions=validated_dimensions(item.dimensions),
                confidence=item.confidence,
                wines=scan.usage.get((item.entity_type, item.entity_key), 0),
            )
            for item in proposals[:MAX_PROPOSALS_SHOWN]
        ],
        job=job.snapshot() if job else None,
    )


def start(
    db: Session,
    *,
    household_id: uuid.UUID,
    user_id: uuid.UUID,
    session_id: uuid.UUID,
    limit: int,
    budget_usd: Decimal,
) -> CatalogBaselineJob:
    global _job
    with _job_lock:
        if _job is not None and _job.status == "running":
            raise HTTPException(status.HTTP_409_CONFLICT, "A baseline research is already running")
        items = _scan(db).missing[:limit]
        if not items:
            raise HTTPException(status.HTTP_409_CONFLICT, "No catalog value lacks a baseline")
        job = CatalogBaselineJob(
            id=uuid.uuid4(),
            household_id=household_id,
            user_id=user_id,
            session_id=session_id,
            items=items,
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
    """Activate or delete the given AI proposals; any other baseline is left alone."""
    baselines = list(db.scalars(_proposals().where(SensoryProfileBaseline.id.in_(ids))))
    for baseline in baselines:
        if approve:
            baseline.is_active = True
            baseline.last_modified_by_user_id = user_id
        else:
            db.delete(baseline)
    db.commit()
    return len(baselines)


def propose_group(job: CatalogBaselineJob, items: list[BaselineItem]) -> None:
    """Ask for one call's worth of baselines and save them as inactive proposals."""
    prompt = catalog_baselines_prompt(
        items=[
            {
                "index": index,
                "kind": item.entity_type,
                "name": item.label,
                "wine_type": item.wine_type,
            }
            for index, item in enumerate(items)
        ]
    )
    parsed, _, cost = catalog_expansion._ask(
        job, prompt, SCHEMA, feature="catalog_baselines", tools=0, web_search=False
    )
    job.cost_usd += cost
    raw = parsed.get("baselines") if isinstance(parsed, dict) else None
    answers = {
        answer["index"]: answer
        for answer in (raw if isinstance(raw, list) else [])
        if isinstance(answer, dict) and isinstance(answer.get("index"), int)
    }
    if not answers:
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, "AI returned no sensory baseline")
    created = unknown = 0
    with SessionLocal() as db:
        for index, item in enumerate(items):
            answer = answers.get(index)
            if answer is None:
                continue  # Not answered: asked again by a later batch.
            dimensions = validated_dimensions(answer) if answer.get("known") is True else {}
            complete = len(dimensions) == len(SENSORY_DIMENSIONS)
            exists = db.scalar(
                select(SensoryProfileBaseline.id).where(
                    SensoryProfileBaseline.entity_type == item.entity_type,
                    SensoryProfileBaseline.entity_key == item.entity_key,
                )
            )
            if exists is not None:
                continue
            db.add(
                SensoryProfileBaseline(
                    entity_type=item.entity_type,
                    entity_key=item.entity_key,
                    dimensions=dimensions if complete else {},
                    confidence=AI_CONFIDENCE if complete else 0.0,
                    is_active=False,
                    source=SOURCE if complete else UNKNOWN,
                    last_modified_by_user_id=job.user_id,
                )
            )
            created += complete
            unknown += not complete
        db.commit()
    job.created += created
    job.unknown += unknown
    job.failed += sum(index not in answers for index in range(len(items)))


def run(job: CatalogBaselineJob) -> None:
    groups = [
        job.items[start : start + ITEMS_PER_CALL]
        for start in range(0, len(job.items), ITEMS_PER_CALL)
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
                futures = [(executor.submit(propose_group, job, group), group) for group in wave]
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
                        job.error = "The AI did not answer for some baselines."
                        logger.exception("Catalog baseline call failed")
                    else:
                        consecutive_failures = 0
                        calls += 1
                    job.done += len(group)
                if consecutive_failures >= MAX_CONSECUTIVE_FAILURES:
                    job.stop_reason = "failed"
                    return
        job.stop_reason = "finished"
    except Exception:
        logger.exception("Catalog baseline research stopped")
        job.stop_reason = "failed"
        job.error = job.error or "The baseline research stopped unexpectedly."
    finally:
        job.status = "done"


def recalculate(
    db: Session, *, household_id: uuid.UUID, user_id: uuid.UUID, apply: bool
) -> CatalogBaselineRecalculation:
    """Recompute the estimated profiles from today's baselines and catalog facts, for free.

    Without `apply` nothing is saved: the result only compares before and after.

    Validated, manual, AI and evidence-led profiles stay as they are, and a profile is
    never replaced by a less reliable estimate. Metadata comes from the administrator's
    own cellar or from the approved catalog, never from another household's wines.
    """
    from app.api.routes.taste_profiles import _identity_metadata

    rows = db.execute(
        select(WineSensoryProfile, SharedWineIdentity)
        .join(SharedWineIdentity, WineSensoryProfile.identity_id == SharedWineIdentity.id)
        .where(
            WineSensoryProfile.generation_status == "available",
            WineSensoryProfile.validated.is_(False),
            WineSensoryProfile.source.in_(ESTIMATED_SOURCES),
        )
    ).all()
    own_wines = {
        wine.shared_identity_id: wine
        for wine in db.scalars(
            select(Wine)
            .where(Wine.household_id == household_id, Wine.shared_identity_id.is_not(None))
            .order_by(Wine.created_at)
        )
    }
    catalog: dict[tuple[str, str], list[WineCatalogEntry]] = {}
    for entry in db.scalars(select(WineCatalogEntry).where(WineCatalogEntry.is_active.is_(True))):
        key = (entry.name.strip().lower(), entry.producer.strip().lower())
        catalog.setdefault(key, []).append(entry)
    now = datetime.now(UTC)
    result = CatalogBaselineRecalculation()
    for profile, identity in rows:
        if profile.provenance:
            continue
        result.checked += 1
        carrier = own_wines.get(identity.id) or _identity_metadata(identity, db, catalog)
        dimensions, source, confidence = infer_sensory_profile(db, carrier)
        if not dimensions or source == "metadata" or confidence < profile.confidence:
            continue
        if dimensions == validated_dimensions(profile.dimensions) and source == profile.source:
            continue
        result.changes.append(
            CatalogBaselineProfileChange(
                name=identity.name,
                producer=identity.producer,
                vintage=identity.vintage,
                before=validated_dimensions(profile.dimensions),
                after=dimensions,
                source_before=profile.source,
                source_after=source,
                confidence_before=profile.confidence,
                confidence_after=confidence,
            )
        )
        result.updated += 1
        if apply:
            profile.dimensions = dimensions
            profile.source = source
            profile.confidence = confidence
            profile.model = ""
            profile.generated_at = now
            profile.last_modified_by_user_id = user_id
    if apply:
        db.commit()
    result.changes.sort(
        key=lambda change: (
            -sum(abs(value - change.before.get(key, value)) for key, value in change.after.items()),
            change.producer.lower(),
            change.name.lower(),
            change.vintage,
        )
    )
    del result.changes[MAX_CHANGES_SHOWN:]
    return result
