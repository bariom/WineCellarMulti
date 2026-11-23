"""Keep a previewed backup on the server for a while, so the restore does not upload it again.

A backup can weigh tens of megabytes and a home connection uploads it in minutes:
the preview stores the file and returns a token, the restore uses the token. Each
file belongs to one user and one cellar and expires after ``TTL``.
"""

from __future__ import annotations

import hashlib
import json
import secrets
import shutil
import tempfile
import time
from pathlib import Path
from typing import IO
from uuid import UUID

TTL_SECONDS = 30 * 60


def _root() -> Path:
    root = Path(tempfile.gettempdir()) / "vinaris-backup-uploads"
    root.mkdir(parents=True, exist_ok=True)
    return root


def _paths(token: str) -> tuple[Path, Path]:
    # The token never becomes a path: only its hash does.
    digest = hashlib.sha256(token.encode()).hexdigest()
    return _root() / f"{digest}.zip", _root() / f"{digest}.json"


def purge_expired(now: float | None = None) -> None:
    limit = (now or time.time()) - TTL_SECONDS
    for path in _root().glob("*"):
        try:
            if path.stat().st_mtime < limit:
                path.unlink(missing_ok=True)
        except OSError:
            continue


def keep(source: IO[bytes], *, user_id: UUID, household_id: UUID) -> str:
    """Copy the uploaded backup aside and return the token that finds it again."""
    purge_expired()
    token = secrets.token_urlsafe(32)
    archive, meta = _paths(token)
    source.seek(0)
    with archive.open("wb") as target:
        shutil.copyfileobj(source, target, length=1024 * 1024)
    meta.write_text(
        json.dumps({"user_id": str(user_id), "household_id": str(household_id)}),
        encoding="utf-8",
    )
    return token


def find(token: str, *, user_id: UUID, household_id: UUID) -> Path | None:
    """The kept backup, if the token is valid, fresh and belongs to this user and cellar."""
    if not token or len(token) > 128:
        return None
    archive, meta = _paths(token)
    try:
        owner = json.loads(meta.read_text(encoding="utf-8"))
        fresh = time.time() - archive.stat().st_mtime <= TTL_SECONDS
    except (OSError, ValueError):
        return None
    if not fresh or owner != {"user_id": str(user_id), "household_id": str(household_id)}:
        return None
    return archive


def discard(token: str) -> None:
    for path in _paths(token):
        path.unlink(missing_ok=True)
