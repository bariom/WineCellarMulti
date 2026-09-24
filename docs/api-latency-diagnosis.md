# Investigating simultaneous API latency spikes

The monitor sample collected on 2026-09-23 at 17:02:57 UTC includes five thumbnail
requests completing at approximately 16:59:39 UTC, each after about 150 seconds.
Those requests return local files after household authorization. Similar durations
and completion times suggest a shared wait; they do not prove that image decoding,
an AI timeout, or database contention caused this particular incident.

The request metrics middleware measures time until response headers are available,
not completion of the image download. The later CPU/RAM snapshot cannot exclude
an earlier stall.

Two synchronous database helpers previously ran directly on the event loop:
the demo mutation guard and user activity persistence. A database wait in either
helper could stall unrelated requests in that worker. Both helpers now run in
Starlette's thread pool, with session creation, use and cleanup inside each helper.
Authorization decisions and activity writes are still awaited. This removes these
two event-loop blocking paths; it does not eliminate database or thread-pool waits.

Regression validation from `backend/`:

```powershell
.\.venv\Scripts\python.exe -m pytest tests/test_middleware_concurrency.py tests/test_monitoring.py tests/test_auth_and_wines.py -q
```

The concurrency regression holds each helper behind a simulated database wait and
verifies that an independent request completes before releasing it. It fails with
the original middleware and passes with the offloaded helpers.

To establish the production incident's root cause, correlate backend and database
logs around 16:57:09–16:59:40 UTC (18:57:09–18:59:40 Europe/Zurich), including slow
mutations/AI requests, pool timeouts and lock waits. Do not log session cookies,
API keys, prompts or database connection strings. After deployment, observe a new
15-minute window: the monitor retains old slow samples until they expire.
