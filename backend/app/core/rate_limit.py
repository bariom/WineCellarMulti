from __future__ import annotations

from collections import deque
from dataclasses import dataclass, field
import hashlib
import hmac
import ipaddress
import math
from threading import Lock
import time

from fastapi import HTTPException, Request, status

from app.core.config import settings


@dataclass
class RateLimitBucket:
    attempts: deque[float] = field(default_factory=deque)
    window_seconds: int = 0


class SlidingWindowRateLimiter:
    def __init__(self) -> None:
        self._buckets: dict[str, RateLimitBucket] = {}
        self._lock = Lock()
        self._last_cleanup = 0.0

    def check(self, key: str, *, limit: int, window_seconds: int, now: float | None = None) -> int:
        if limit <= 0 or window_seconds <= 0:
            return 0
        current = time.monotonic() if now is None else now
        cutoff = current - window_seconds
        with self._lock:
            bucket = self._buckets.setdefault(key, RateLimitBucket(window_seconds=window_seconds))
            bucket.window_seconds = max(bucket.window_seconds, window_seconds)
            while bucket.attempts and bucket.attempts[0] <= cutoff:
                bucket.attempts.popleft()
            if len(bucket.attempts) >= limit:
                return max(math.ceil(bucket.attempts[0] + window_seconds - current), 1)
            bucket.attempts.append(current)
            if current - self._last_cleanup >= 60:
                self._cleanup(current)
            return 0

    def clear(self) -> None:
        with self._lock:
            self._buckets.clear()
            self._last_cleanup = 0.0

    def _cleanup(self, now: float) -> None:
        expired = [
            key
            for key, bucket in self._buckets.items()
            if not bucket.attempts or bucket.attempts[-1] <= now - bucket.window_seconds
        ]
        for key in expired:
            self._buckets.pop(key, None)
        self._last_cleanup = now


rate_limiter = SlidingWindowRateLimiter()


def client_identifier(request: Request) -> str:
    # Uvicorn replaces request.client only for explicitly trusted proxies.
    # Do not parse X-Forwarded-For here: the backend port can also be reached
    # directly and trusting that header would let clients rotate spoofed IPs.
    host = request.client.host if request.client is not None else "unknown"
    try:
        return ipaddress.ip_address(host).compressed
    except ValueError:
        return host.strip().lower() or "unknown"


def private_subject_identifier(subject: str) -> str:
    normalized = subject.strip().lower().encode("utf-8")
    return hmac.new(settings.secret_key.encode("utf-8"), normalized, hashlib.sha256).hexdigest()


def enforce_rate_limit(
    request: Request,
    *,
    scope: str,
    limit: int,
    window_seconds: int,
    subject: str | None = None,
) -> None:
    if not settings.rate_limit_enabled:
        return
    identity = private_subject_identifier(subject) if subject is not None else client_identifier(request)
    retry_after = rate_limiter.check(f"{scope}:{identity}", limit=limit, window_seconds=window_seconds)
    if retry_after:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Too many requests. Try again later.",
            headers={"Retry-After": str(retry_after)},
        )
