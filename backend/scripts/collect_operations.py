"""Collect host metrics and submit one aggregate sample to the local Vinaris backend."""

from __future__ import annotations

import json
import os
import time
from urllib.error import URLError
from urllib.request import Request, urlopen

from app.core.config import settings
from app.services.operational_metrics import system_snapshot


def main() -> None:
    token = settings.operations_collector_token
    if not token:
        raise SystemExit("OPERATIONS_COLLECTOR_TOKEN is not configured")
    url = os.getenv("OPERATIONS_COLLECTOR_URL", "http://127.0.0.1:8000/api/v1/admin/operations/collect")
    try:
        timeout_seconds = float(os.getenv("OPERATIONS_COLLECTOR_TIMEOUT_SECONDS", "35"))
    except ValueError as error:
        raise SystemExit("OPERATIONS_COLLECTOR_TIMEOUT_SECONDS must be a number") from error
    payload = json.dumps(system_snapshot()).encode("utf-8")
    request = Request(
        url,
        data=payload,
        headers={
            "Content-Type": "application/json",
            "X-Operations-Collector-Token": token,
        },
        method="POST",
    )
    for attempt in range(6):
        try:
            # Collecting an aggregate may include the cached OpenAI cost
            # summary, which can take longer than a short localhost probe.
            with urlopen(request, timeout=timeout_seconds) as response:
                if response.status != 204:
                    raise SystemExit(f"Collector rejected with HTTP {response.status}")
            return
        except URLError:
            if attempt == 5:
                raise
            time.sleep(5)


if __name__ == "__main__":
    main()
