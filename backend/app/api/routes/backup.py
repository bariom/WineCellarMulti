"""Complete backup of a cellar: a ZIP with every record, bottle photo and purchase document."""

from __future__ import annotations

import re
from datetime import UTC, datetime

from fastapi import APIRouter, Depends, File, UploadFile
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session
from starlette.background import BackgroundTask

from app.api.deps import CurrentContext, require_admin_context
from app.db.session import get_db
from app.schemas.backup import BackupPreviewResponse, BackupRestoreResponse
from app.services import backup_restore
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
        return backup_restore.preview(db, context, parsed)
    finally:
        parsed.close()


@router.post("/restore", response_model=BackupRestoreResponse)
def restore_backup(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    context: CurrentContext = Depends(require_admin_context),
) -> dict:
    backup_restore.use_locale(context.user.locale)
    parsed = backup_restore.read_backup(file.file)
    try:
        return backup_restore.restore(db, context, parsed)
    finally:
        parsed.close()
