"""Private original documents: one file per purchase, shared by its wine links."""

import re
from pathlib import Path
from uuid import UUID, uuid4

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.models import PurchaseDocumentWine, PurchaseImport, Wine


def document_path(record: PurchaseImport) -> Path:
    return (
        Path(settings.purchase_document_storage_dir)
        / str(record.household_id)
        / str(record.id)
        / "original"
    )


def link_document_wines(db: Session, record: PurchaseImport, wine_ids: list[UUID]) -> None:
    # Filter even historical JSON IDs through the active household before linking.
    wines = db.scalars(
        select(Wine.id).where(Wine.household_id == record.household_id, Wine.id.in_(wine_ids))
    )
    linked = set(
        db.scalars(
            select(PurchaseDocumentWine.wine_id).where(
                PurchaseDocumentWine.household_id == record.household_id,
                PurchaseDocumentWine.purchase_import_id == record.id,
            )
        )
    )
    for wine_id in wines:
        if wine_id not in linked:
            db.add(
                PurchaseDocumentWine(
                    purchase_import_id=record.id, wine_id=wine_id, household_id=record.household_id
                )
            )


def archive_document(
    db: Session, record: PurchaseImport, content: bytes, mime: str, filename: str
) -> None:
    path = document_path(record)
    if record.document_size and path.is_file():
        return
    path.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
    temporary = path.with_name(uuid4().hex + ".tmp")
    try:
        temporary.write_bytes(content)
        temporary.chmod(0o600)
        temporary.replace(path)
        record.document_name = (
            re.sub(r"[\x00-\x1f\x7f]", "", re.split(r"[/\\]", filename)[-1])[:200] or "document"
        )
        record.document_mime = mime
        record.document_size = len(content)
        link_document_wines(
            db, record, [UUID(value) for value in record.result.get("wine_ids", [])]
        )
        db.commit()
    except Exception:
        db.rollback()
        path.unlink(missing_ok=True)
        raise
    finally:
        temporary.unlink(missing_ok=True)
