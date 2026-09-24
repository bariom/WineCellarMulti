import asyncio
import threading

import httpx
import pytest
from fastapi import FastAPI

import app.main as main


@pytest.mark.parametrize(
    ("middleware", "helper"),
    [
        (main.enforce_demo_read_only, "request_uses_demo_session"),
        (main.collect_user_activity, "save_user_activity"),
    ],
)
def test_database_wait_in_middleware_does_not_block_other_requests(monkeypatch, middleware, helper):
    async def scenario():
        loop = asyncio.get_running_loop()
        entered = asyncio.Event()
        release = threading.Event()
        timed_out = []

        def waiting_database_operation(*_args):
            loop.call_soon_threadsafe(entered.set)
            # Bounded guard also lets the regression fail without hanging the suite.
            timed_out.append(not release.wait(timeout=2))
            return False

        monkeypatch.setattr(main, helper, waiting_database_operation)
        application = FastAPI()
        application.middleware("http")(middleware)

        @application.post("/api/v1/wines")
        async def mutation():
            return {"ok": True}

        @application.get("/api/v1/wines/example/photo/thumbnail")
        async def independent_request():
            return {"ok": True}

        async with httpx.AsyncClient(
            transport=httpx.ASGITransport(app=application), base_url="http://test"
        ) as client:
            pending = asyncio.create_task(client.post("/api/v1/wines"))
            try:
                await asyncio.wait_for(entered.wait(), timeout=5)
                response = await asyncio.wait_for(
                    client.get("/api/v1/wines/example/photo/thumbnail"), timeout=1
                )
                assert response.status_code == 200
                assert timed_out == [], "The DB wait blocked independent request processing"
            finally:
                release.set()
                await pending
            assert timed_out == [False]

    asyncio.run(scenario())
