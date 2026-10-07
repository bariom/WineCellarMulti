from concurrent.futures import ThreadPoolExecutor
from decimal import Decimal
from threading import Barrier, Event, Lock
from types import SimpleNamespace
from uuid import uuid4

import pytest
from sqlalchemy import create_engine, select
from sqlalchemy.orm import sessionmaker

from app.api.routes import ai
from app.db.base import Base
from app.models import Household, SensoryAgentRun, User, Wine
from app.schemas.sensory_agent import SensoryResearchResult
from app.services import sensory_agent as agent
from app.services import sensory_parallel as parallel


@pytest.fixture
def research_setup(tmp_path, monkeypatch):
    engine = create_engine(f"sqlite+pysqlite:///{tmp_path / 'research.db'}")
    Base.metadata.create_all(engine)
    factory = sessionmaker(bind=engine)
    monkeypatch.setattr(agent, "SessionLocal", factory)
    monkeypatch.setattr(ai, "get_or_create_user_ai_settings", lambda *args: object())
    monkeypatch.setattr(agent, "research_cost_ceiling", lambda *args: Decimal("0.4"), raising=False)

    def context(db, household_id, user_id, session_id):
        return SimpleNamespace(household=SimpleNamespace(id=household_id))

    monkeypatch.setattr(agent, "worker_context", context)
    with factory() as db:
        household = Household(name="Cellar")
        user = User(email="parallel@example.test", display_name="Admin", password_hash="unused")
        db.add_all([household, user])
        db.flush()
        wines = [
            Wine(household_id=household.id, name=name, producer="Producer", vintage="2020")
            for name in ("First", "Second", "Third")
        ]
        db.add_all(wines)
        db.flush()
        run = SensoryAgentRun(
            household_id=household.id,
            user_id=user.id,
            wine_ids=[str(wine.id) for wine in wines],
            budget_usd=Decimal("1"),
        )
        db.add(run)
        db.commit()
        yield factory, run.id, household.id, uuid4(), [wine.id for wine in wines]
    engine.dispose()


def result(wine, cost="0.1"):
    return SensoryResearchResult(
        wine_id=wine.id,
        name=wine.name,
        producer=wine.producer,
        vintage=wine.vintage,
        status="ready",
        cost_usd=Decimal(cost),
    )


def test_parallel_sessions_progress_and_selection_order(research_setup, monkeypatch):
    factory, run_id, household_id, session_id, wine_ids = research_setup
    barrier, release_first = Barrier(2), Event()
    sessions, contexts = [], []

    def research(db, context, wine, grant):
        assert grant == Decimal("0.4")
        sessions.append(db)
        contexts.append(context)
        if wine.id in wine_ids[:2]:
            barrier.wait(timeout=5)
        if wine.id == wine_ids[0]:
            assert release_first.wait(5)
        return result(wine)

    monkeypatch.setattr(agent, "research_wine", research)
    with ThreadPoolExecutor(max_workers=1) as executor:
        future = executor.submit(parallel.run_parallel_research, run_id, household_id, session_id)
        # The third worker can start only after Second has been committed.
        third_started = Event()
        original = research

        def track_third(db, context, wine, grant):
            if wine.id == wine_ids[2]:
                third_started.set()
            return original(db, context, wine, grant)

        monkeypatch.setattr(agent, "research_wine", track_third)
        try:
            assert third_started.wait(5)
            with factory() as db:
                run = db.get(SensoryAgentRun, run_id)
                assert run.status == "running"
                assert str(wine_ids[1]) in [item["wine_id"] for item in run.results]
        finally:
            release_first.set()
        future.result(timeout=5)
    assert len({id(session) for session in sessions}) == 3
    assert len({id(context) for context in contexts}) == 3
    with factory() as db:
        run = db.get(SensoryAgentRun, run_id)
        assert run.status == "completed"
        assert [item["wine_id"] for item in run.results] == [str(value) for value in wine_ids]
        assert run.cost_usd == Decimal("0.3")


def test_budget_grants_reuse_residue_without_oversubscription(research_setup, monkeypatch):
    factory, run_id, household_id, session_id, _ = research_setup
    with factory() as db:
        run = db.get(SensoryAgentRun, run_id)
        run.budget_usd = Decimal("0.6")
        db.commit()
    lock = Lock()
    active = 0
    calls = []

    def research(db, context, wine, grant):
        nonlocal active
        with lock:
            active += 1
            assert active == 1
            with factory() as check_db:
                assert check_db.get(SensoryAgentRun, run_id).cost_usd == Decimal("0.1") * len(calls)
            calls.append(grant)
            active -= 1
        return result(wine)

    monkeypatch.setattr(agent, "research_wine", research)
    parallel.run_parallel_research(run_id, household_id, session_id)
    assert calls == [Decimal("0.4")] * 3
    with factory() as db:
        run = db.get(SensoryAgentRun, run_id)
        assert run.status == "completed" and not run.issue
        assert run.cost_usd == Decimal("0.3")


def test_error_drains_paid_results_and_stops_new_work(research_setup, monkeypatch):
    factory, run_id, household_id, session_id, wine_ids = research_setup
    barrier = Barrier(2)
    calls = []
    failure_observed = Event()
    original_wait = parallel.wait

    def observe_failure(futures, **kwargs):
        completed, pending = original_wait(futures, **kwargs)
        if any(future.exception() is not None for future in completed):
            failure_observed.set()
        return completed, pending

    monkeypatch.setattr(parallel, "wait", observe_failure)

    def research(db, context, wine, grant):
        calls.append(wine.id)
        barrier.wait(timeout=5)
        if wine.id == wine_ids[0]:
            raise RuntimeError("private provider detail")
        assert failure_observed.wait(5)
        return result(wine)

    monkeypatch.setattr(agent, "research_wine", research)
    parallel.run_parallel_research(run_id, household_id, session_id)
    with factory() as db:
        run = db.get(SensoryAgentRun, run_id)
        assert run.status == "failed" and run.issue == "research_failed"
        assert run.cost_usd == Decimal("0.1")
        assert [item["wine_id"] for item in run.results] == [str(wine_ids[1])]
    assert set(calls) == set(wine_ids[:2])


def test_revoked_context_prevents_provider(research_setup, monkeypatch):
    factory, run_id, household_id, session_id, _ = research_setup

    def revoked(*args):
        raise PermissionError()

    monkeypatch.setattr(agent, "worker_context", revoked)
    monkeypatch.setattr(agent, "research_wine", lambda *args: pytest.fail("No authorization"))
    parallel.run_parallel_research(run_id, household_id, session_id)
    with factory() as db:
        run = db.get(SensoryAgentRun, run_id)
        assert run.status == "failed" and not run.results


def test_other_household_cannot_claim_run(research_setup, monkeypatch):
    factory, run_id, _, session_id, _ = research_setup
    monkeypatch.setattr(agent, "research_wine", lambda *args: pytest.fail("Wrong household"))
    parallel.run_parallel_research(run_id, uuid4(), session_id)
    with factory() as db:
        assert (
            db.scalar(select(SensoryAgentRun).where(SensoryAgentRun.id == run_id)).status
            == "queued"
        )


def test_unaffordable_grant_does_not_call_provider(research_setup, monkeypatch):
    factory, run_id, household_id, session_id, _ = research_setup
    with factory() as db:
        run = db.get(SensoryAgentRun, run_id)
        run.budget_usd = Decimal("0.3")
        db.commit()
    monkeypatch.setattr(agent, "research_wine", lambda *args: pytest.fail("Insufficient budget"))
    parallel.run_parallel_research(run_id, household_id, session_id)
    with factory() as db:
        run = db.get(SensoryAgentRun, run_id)
        assert run.status == "completed" and run.issue == "budget_limit"
        assert run.cost_usd == 0 and not run.results


def test_missing_vintage_uses_zero_grant(research_setup, monkeypatch):
    factory, run_id, household_id, session_id, wine_ids = research_setup
    with factory() as db:
        run = db.get(SensoryAgentRun, run_id)
        run.wine_ids = [str(wine_ids[0])]
        db.get(Wine, wine_ids[0]).vintage = ""
        db.commit()

    def research(db, context, wine, grant):
        assert grant == 0
        proposal = result(wine, "0")
        proposal.status, proposal.issue = "skipped", "missing_vintage"
        return proposal

    monkeypatch.setattr(agent, "research_wine", research)
    monkeypatch.setattr(
        agent, "research_cost_ceiling", lambda *args: pytest.fail("No paid research needed")
    )
    parallel.run_parallel_research(run_id, household_id, session_id)
    with factory() as db:
        run = db.get(SensoryAgentRun, run_id)
        assert run.status == "completed" and run.cost_usd == 0
        assert run.results[0]["status"] == "skipped"
