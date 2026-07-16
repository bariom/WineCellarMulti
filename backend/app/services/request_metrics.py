from __future__ import annotations

import threading
import time
from datetime import UTC, datetime


class RequestMetrics:
    """Process-local request aggregates for the monitoring dashboard."""

    def __init__(self) -> None:
        self._lock = threading.Lock()
        self.started_at = datetime.now(UTC)
        self.requests_total = 0
        self.errors_total = 0
        self.total_duration_ms = 0.0

    def record(self, status_code: int, duration_ms: float) -> None:
        with self._lock:
            self.requests_total += 1
            self.total_duration_ms += duration_ms
            if status_code >= 500:
                self.errors_total += 1

    def snapshot(self) -> dict[str, int | float | str | None]:
        with self._lock:
            average_duration_ms = (
                round(self.total_duration_ms / self.requests_total, 2)
                if self.requests_total
                else None
            )
            return {
                "started_at": self.started_at.isoformat(),
                "requests_total": self.requests_total,
                "errors_total": self.errors_total,
                "average_duration_ms": average_duration_ms,
                "uptime_seconds": round(time.time() - self.started_at.timestamp(), 2),
            }


request_metrics = RequestMetrics()
