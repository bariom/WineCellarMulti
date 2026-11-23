"""Write a complete backup of one household as a ZIP archive (see backup_registry)."""

from __future__ import annotations

import json
import tempfile
import zipfile
from datetime import UTC, date, datetime
from decimal import Decimal
from pathlib import Path
from typing import IO, Any
from uuid import UUID

from sqlalchemy import Table, select, text
from sqlalchemy.orm import Session

from app.core.config import settings
from app.db.base import Base
from app.models import Household
from app.services.backup_registry import (
    BACKUP_TABLES,
    HOUSEHOLD_SETTINGS,
    SCHEMA,
    SECRET_COLUMNS,
    BackupTable,
    binary_member,
    purchase_document_member,
    wine_photo_member,
)

PHOTO_SIZES = ("thumbnail", "detail")


def _plain(value: Any) -> Any:
    if isinstance(value, UUID | Decimal):
        return str(value)
    if isinstance(value, datetime | date):
        return value.isoformat()
    return value


def _table(name: str) -> Table:
    return Base.metadata.tables[name]


def _rows(
    db: Session,
    spec: BackupTable,
    *,
    household_id: UUID,
    user_id: UUID,
    exported_ids: dict[str, set[str]],
    blobs: dict[str, bytes],
) -> list[dict[str, Any]]:
    tbl = _table(spec.name)
    query = select(tbl)
    if spec.scope == "household":
        query = query.where(tbl.c.household_id == household_id)
    elif spec.scope == "user":
        query = query.where(tbl.c.user_id == user_id)
    elif spec.scope == "user_household":
        query = query.where(tbl.c.user_id == user_id, tbl.c.household_id == household_id)
    else:
        assert spec.parent is not None
        column, parent = spec.parent
        parent_ids = [UUID(value) for value in exported_ids.get(parent, set())]
        if not parent_ids:
            return []
        query = query.where(tbl.c[column].in_(parent_ids))
    if spec.name == "user_wine_tags":
        wine_ids = [UUID(value) for value in exported_ids.get("wines", set())]
        if not wine_ids:
            return []
        query = query.where(tbl.c.wine_id.in_(wine_ids))
    order = [column for column in ("created_at", "id") if column in tbl.c]
    if order:
        query = query.order_by(*(tbl.c[column] for column in order))
    hidden = SECRET_COLUMNS.get(spec.name, frozenset())
    rows = []
    for row in db.execute(query).mappings():
        item: dict[str, Any] = {}
        for key, value in row.items():
            if key in hidden:
                item[key] = None
            elif isinstance(value, bytes):
                # Memory photos travel as files next to data.json.
                member = binary_member(spec.name, key, str(row["id"]))
                blobs[member] = value
                item[key] = member
            else:
                item[key] = _plain(value)
        rows.append(item)
    return rows


def collect(
    db: Session, *, household_id: UUID, user_id: UUID
) -> tuple[dict[str, list[dict[str, Any]]], dict[str, bytes]]:
    """Every backed-up row of the household and of the exporting user, by table, and
    the bytes of its binary columns by archive member."""
    tables: dict[str, list[dict[str, Any]]] = {}
    blobs: dict[str, bytes] = {}
    exported_ids: dict[str, set[str]] = {}
    for spec in BACKUP_TABLES:
        rows = _rows(
            db,
            spec,
            household_id=household_id,
            user_id=user_id,
            exported_ids=exported_ids,
            blobs=blobs,
        )
        tables[spec.name] = rows
        if "id" in _table(spec.name).c:
            exported_ids[spec.name] = {str(row["id"]) for row in rows}
    return tables, blobs


def _alembic_revision(db: Session) -> str:
    try:
        return str(db.execute(text("SELECT version_num FROM alembic_version")).scalar() or "")
    except Exception:  # noqa: BLE001 - tests run without alembic_version
        db.rollback()
        return ""


def _files(household: Household, tables: dict[str, list[dict[str, Any]]]):
    """(archive member, file on disk) for every photo and document in the backup."""
    photo_root = Path(settings.wine_photo_storage_dir) / str(household.id)
    for wine in tables["wines"]:
        if not wine.get("photo_version"):
            continue
        for size in PHOTO_SIZES:
            path = photo_root / wine["id"] / f"{size}.png"
            if path.is_file():
                yield wine_photo_member(wine["id"], size), path
    document_root = Path(settings.purchase_document_storage_dir) / str(household.id)
    for record in tables["purchase_imports"]:
        path = document_root / record["id"] / "original"
        if path.is_file():
            yield purchase_document_member(record["id"]), path


def write_backup(db: Session, *, household: Household, user_id: UUID, target: IO[bytes]) -> dict:
    """Write the ZIP archive to ``target`` and return its manifest."""
    tables, blobs = collect(db, household_id=household.id, user_id=user_id)
    files = list(_files(household, tables))
    manifest = {
        "schema": SCHEMA,
        "exported_at": datetime.now(UTC).isoformat(),
        "alembic_revision": _alembic_revision(db),
        "household": {
            "id": str(household.id),
            "name": household.name,
            **{key: _plain(getattr(household, key)) for key in HOUSEHOLD_SETTINGS},
        },
        "counts": {name: len(rows) for name, rows in tables.items()},
        "files": [member for member, _ in files] + sorted(blobs),
    }
    with zipfile.ZipFile(target, "w", compression=zipfile.ZIP_DEFLATED) as archive:
        archive.writestr("manifest.json", json.dumps(manifest, ensure_ascii=False, indent=2))
        archive.writestr("data.json", json.dumps({"tables": tables}, ensure_ascii=False))
        for member, path in files:
            # Photos and PDFs are already compressed.
            archive.write(path, member, compress_type=zipfile.ZIP_STORED)
        for member, content in blobs.items():
            archive.writestr(member, content, compress_type=zipfile.ZIP_STORED)
    return manifest


def backup_to_temp_file(db: Session, *, household: Household, user_id: UUID) -> Path:
    """The backup written to a temporary file; the caller deletes it once sent."""
    handle = tempfile.NamedTemporaryFile(prefix="vinaris-backup-", suffix=".zip", delete=False)
    try:
        with handle:
            write_backup(db, household=household, user_id=user_id, target=handle)
    except Exception:
        Path(handle.name).unlink(missing_ok=True)
        raise
    return Path(handle.name)
