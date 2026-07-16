# Monitoring API

Vinaris exposes three read-only endpoints for the private monitoring dashboard:

```
GET https://vinaris.app/api/v1/monitoring/system
GET https://vinaris.app/api/v1/monitoring/application
GET https://vinaris.app/api/v1/monitoring/business
```

Every request must include the following header:

```
Authorization: Bearer <MONITORING_API_TOKEN>
```

Generate a long random value for `MONITORING_API_TOKEN` and put it in the production root `.env` when using Docker Compose, or in `backend/.env` when using the systemd service. Restart the backend after changing it. The endpoints return `401` until a token is configured, or when the token is invalid.

The dashboard must call the HTTPS URLs directly; add its origin to `CORS_ORIGINS` only if it runs as a browser application on a distinct origin. Never place the token in a public frontend bundle. A local dashboard should keep it in its server-side environment or use a local proxy.

`/system` reports CPU, memory, disk and host uptime, plus memory and CPU for the Vinaris backend process. When Vinaris runs in Docker, the values are those visible inside the backend container; the systemd production deployment reports the Linux host values.

`/application` reports requests handled since the backend process started, server errors (HTTP 5xx), mean latency in milliseconds and process uptime. These metrics reset on a backend restart and intentionally do not include calls to the monitoring endpoints.

`/business` reads live aggregate counts from PostgreSQL: users (including approved and blocked users), households, wine records and total bottles.
