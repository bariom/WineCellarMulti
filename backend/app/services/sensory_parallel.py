"""Bounded wine research with isolated database sessions and reserved run budgets."""

from concurrent.futures import FIRST_COMPLETED, Future, ThreadPoolExecutor, wait
from decimal import Decimal
from threading import BoundedSemaphore
from uuid import UUID

from sqlalchemy import select

from app.models import SensoryAgentRun, Wine
from app.schemas.sensory_agent import SensoryResearchResult

MAX_WORKERS = 2
_PROVIDER_SLOTS = BoundedSemaphore(MAX_WORKERS)


def _research_one(
    household_id: UUID, user_id: UUID, session_id: UUID, wine_id: UUID, grant: Decimal
) -> tuple[SensoryResearchResult | None, bool]:
    from app.services import sensory_agent as agent

    with _PROVIDER_SLOTS, agent.SessionLocal() as db:
        context = agent.worker_context(db, household_id, user_id, session_id)
        wine = db.scalar(select(Wine).where(Wine.id == wine_id, Wine.household_id == household_id))
        if wine is None:
            return None, False
        result = agent.research_wine(db, context, wine, grant)
        db.commit()
        return result, result is None


def run_parallel_research(run_id: UUID, household_id: UUID, session_id: UUID) -> None:
    from app.api.routes.ai import get_or_create_user_ai_settings
    from app.services import sensory_agent as agent

    with agent.SessionLocal() as db:
        run = db.scalar(
            select(SensoryAgentRun)
            .where(SensoryAgentRun.id == run_id, SensoryAgentRun.household_id == household_id)
            .with_for_update()
        )
        if run is None or run.status != "queued":
            return
        run.status = "running"
        db.commit()
        pending: dict[Future, Decimal] = {}
        reserved = Decimal("0")
        failed = False
        stopped = False
        next_index = 0
        order = {str(value): index for index, value in enumerate(run.wine_ids)}
        try:
            context = agent.worker_context(db, household_id, run.user_id, session_id)
            # Avoid concurrent first-use INSERTs of the same settings row.
            get_or_create_user_ai_settings(db, context)
            db.commit()
            with ThreadPoolExecutor(max_workers=MAX_WORKERS) as executor:
                while pending or (not stopped and next_index < len(run.wine_ids)):
                    try:
                        db.refresh(run)
                        if run.status != "running":
                            stopped = True
                        while (
                            not stopped
                            and len(pending) < MAX_WORKERS
                            and next_index < len(run.wine_ids)
                            and not any(future.done() for future in pending)
                        ):
                            context = agent.worker_context(
                                db, household_id, run.user_id, session_id
                            )
                            wine_id = UUID(run.wine_ids[next_index])
                            wine = db.scalar(
                                select(Wine).where(
                                    Wine.id == wine_id, Wine.household_id == household_id
                                )
                            )
                            if wine is None:
                                next_index += 1
                                continue
                            grant = (
                                agent.research_cost_ceiling(db, context, wine)
                                if wine.vintage.strip()
                                else Decimal("0")
                            )
                            if grant > run.budget_usd - run.cost_usd - reserved:
                                if not pending:
                                    run.issue = "budget_limit"
                                    stopped = True
                                break
                            future = executor.submit(
                                _research_one,
                                household_id,
                                run.user_id,
                                session_id,
                                wine_id,
                                grant,
                            )
                            pending[future] = grant
                            reserved += grant
                            next_index += 1
                        # Release the coordinator's read transaction before worker writes.
                        db.commit()
                    except Exception:
                        db.rollback()
                        db.refresh(run)
                        failed = stopped = True
                    if not pending:
                        break
                    completed, _ = wait(pending, return_when=FIRST_COMPLETED)
                    for future in completed:
                        reserved -= pending.pop(future)
                        try:
                            result, budget_limited = future.result()
                            if budget_limited:
                                run.issue = "budget_limit"
                                stopped = True
                            if result is not None:
                                run.results = sorted(
                                    [*run.results, result.model_dump(mode="json")],
                                    key=lambda item: order[item["wine_id"]],
                                )
                                run.cost_usd += result.cost_usd
                                db.commit()
                        except Exception:
                            db.rollback()
                            db.refresh(run)
                            failed = stopped = True
                    # Drain already-started work even after an error, retaining paid results.
                if failed:
                    run.status, run.issue = "failed", "research_failed"
                elif run.status == "running":
                    run.status = "completed"
                db.commit()
        except Exception:
            db.rollback()
            db.refresh(run)
            run.status, run.issue = "failed", "research_failed"
            db.commit()
