"""Complete backup of a cellar: a ZIP with every record, bottle photo and purchase document."""

from __future__ import annotations

import re
from datetime import UTC, datetime
from typing import IO

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session
from starlette.background import BackgroundTask

from app.api.deps import CurrentContext, require_admin_context
from app.db.session import get_db
from app.schemas.backup import BackupPreviewResponse, BackupRestoreResponse
from app.services import backup_restore, backup_uploads
from app.services.backup_export import backup_to_temp_file

router = APIRouter(prefix="/backup")


def _filename(name: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-") or "cantina"
    return f"vinaris-backup-{slug}-{datetime.now(UTC).date().isoformat()}.zip"


@router.get("/export", response_class=FileResponse)
def export_backup(
    db: Session = Depends(get_db),
    context: CurrentContext = Depends(require_admin_context),
) -> FileResponse:
    path = backup_to_temp_file(db, household=context.household, user_id=context.user.id)
    return FileResponse(
        path,
        media_type="application/zip",
        filename=_filename(context.household.name),
        background=BackgroundTask(path.unlink, missing_ok=True),
        headers={"Cache-Control": "no-store"},
    )


# The upload arrives in a spooled temporary file (on disk past 1 MB), which
# zipfile reads in place: the archive is never loaded into memory whole.


@router.post("/preview", response_model=BackupPreviewResponse, response_model_by_alias=True)
def preview_backup(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    context: CurrentContext = Depends(require_admin_context),
) -> dict:
    backup_restore.use_locale(context.user.locale)
    parsed = backup_restore.read_backup(file.file)
    try:
        result = backup_restore.preview(db, context, parsed)
    finally:
        parsed.close()
    # Kept for the restore, so a slow connection uploads the backup only once.
    result["upload_token"] = backup_uploads.keep(
        file.file, user_id=context.user.id, household_id=context.household.id
    )
    return result


@router.post("/restore", response_model=BackupRestoreResponse)
def restore_backup(
    file: UploadFile | None = File(default=None),
    upload_token: str | None = Form(default=None),
    db: Session = Depends(get_db),
    context: CurrentContext = Depends(require_admin_context),
) -> dict:
    backup_restore.use_locale(context.user.locale)
    kept: IO[bytes] | None = None
    if file is not None:
        source: IO[bytes] = file.file
    else:
        path = backup_uploads.find(
            upload_token or "", user_id=context.user.id, household_id=context.household.id
        )
        if path is None:
            raise HTTPException(
                status_code=status.HTTP_410_GONE,
                detail=backup_restore.message(
                    "Il backup caricato non è più disponibile: sceglilo di nuovo.",
                    "The uploaded backup is no longer available: choose it again.",
                ),
            )
        source = kept = path.open("rb")
    try:
        parsed = backup_restore.read_backup(source)
        try:
            result = backup_restore.restore(db, context, parsed)
        finally:
            parsed.close()
    finally:
        if kept is not None:
            kept.close()
    if upload_token:
        backup_uploads.discard(upload_token)
    return result


@router.get("/target")
def backup_target(
    db: Session = Depends(get_db),
    context: CurrentContext = Depends(require_admin_context),
) -> dict[str, bool]:
    """Whether the active cellar is empty, so a restore can start, without uploading again."""
    return {"target_empty": backup_restore.target_is_empty(db, context.household.id)}
