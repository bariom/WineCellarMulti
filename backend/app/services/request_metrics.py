from __future__ import annotations

import threading
import time
from collections import deque
from datetime import UTC, datetime
from math import ceil


class RequestMetrics:
    """Process-local request aggregates for the monitoring dashboard."""

    def __init__(self) -> None:
        self._lock = threading.Lock()
        self.started_at = datetime.now(UTC)
        self.requests_total = 0
        self.errors_total = 0
        self.total_duration_ms = 0.0
        self._recent_window_seconds = 15 * 60
        self._recent_interactive: deque[tuple[float, float]] = deque()
        self._recent_slow: deque[float] = deque()

    def record(self, status_code: int, duration_ms: float, *, interactive: bool) -> None:
        with self._lock:
            self.requests_total += 1
            self.total_duration_ms += duration_ms
            if status_code >= 500:
                self.errors_total += 1
            now = time.monotonic()
            if interactive:
                self._recent_interactive.append((now, duration_ms))
            else:
                self._recent_slow.append(now)
            self._discard_expired(now)

    def _discard_expired(self, now: float) -> None:
        cutoff = now - self._recent_window_seconds
        while self._recent_interactive and self._recent_interactive[0][0] < cutoff:
            self._recent_interactive.popleft()
        while self._recent_slow and self._recent_slow[0] < cutoff:
            self._recent_slow.popleft()

    @staticmethod
    def _percentile(values: list[float], percentile: float) -> float | None:
        if not values:
            return None
        ordered = sorted(values)
        index = max(0, min(len(ordered) - 1, ceil((percentile / 100) * len(ordered)) - 1))
        return round(ordered[index], 2)

    def snapshot(self) -> dict[str, int | float | str | None]:
        with self._lock:
            self._discard_expired(time.monotonic())
            interactive_durations = [duration for _, duration in self._recent_interactive]
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
                "interactive_window_seconds": self._recent_window_seconds,
                "interactive_requests_recent": len(interactive_durations),
                "interactive_p50_duration_ms": self._percentile(interactive_durations, 50),
                "interactive_p95_duration_ms": self._percentile(interactive_durations, 95),
                "slow_requests_recent": len(self._recent_slow),
                "uptime_seconds": round(time.time() - self.started_at.timestamp(), 2),
            }


request_metrics = RequestMetrics()
