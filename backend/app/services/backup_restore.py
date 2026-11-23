"""Read a complete Vinaris backup (see backup_registry) and restore it into the active cellar.

The restore is table-driven: rows are inserted in ``BACKUP_TABLES`` order with fresh
IDs, and every foreign key is mapped through the IDs already inserted. Everything
happens in one transaction; files written before a failure are removed again.
"""

from __future__ import annotations

import json
import re
import shutil
import zipfile
from contextvars import ContextVar
from dataclasses import dataclass, field
from datetime import date, datetime
from decimal import Decimal, InvalidOperation
from pathlib import Path
from typing import IO, Any
from uuid import UUID, uuid4

from fastapi import HTTPException, status
from sqlalchemy import Column, Table, and_, select
from sqlalchemy.orm import Session

from app.api.deps import CurrentContext
from app.core.config import settings
from app.db.base import Base
from app.models import Household, Membership, User, Wine, WineSale, WishlistItem
from app.services.backup_registry import (
    BACKUP_TABLES,
    HOUSEHOLD_SETTINGS,
    SCHEMA,
    BackupTable,
    binary_member,
    purchase_document_member,
    wine_photo_member,
)
from app.services.free_tier import free_tier_label_limit, is_free_tier

MAX_TOTAL_UNCOMPRESSED = 2 * 1024**3
MAX_DATA_JSON = 128 * 1024**2
MAX_MANIFEST = 16 * 1024**2
MAX_PHOTO = 25 * 1024**2
MAX_BINARY = 25 * 1024**2
MAX_DOCUMENT = 200 * 1024**2
MAX_MEMBERS = 500_000

PHOTO_SIZES = ("thumbnail", "detail")
PNG_SIGNATURE = b"\x89PNG\r\n\x1a\n"

_UUID = r"[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}"
_PHOTO_MEMBER = re.compile(rf"files/wine-photos/{_UUID}/(thumbnail|detail)\.png")
_DOCUMENT_MEMBER = re.compile(rf"files/purchase-documents/{_UUID}")
_BINARY_MEMBER = re.compile(rf"files/binary/[a-z_]+/[a-z_]+/{_UUID}")

# Existing rows a restored row is merged into instead of being inserted twice: the
# unique keys of tables whose rows can survive an emptied cellar or belong to the user.
NATURAL_KEYS: dict[str, tuple[str, ...]] = {
    "cellar_locations": ("household_id", "normalized_name"),
    "cellar_bins": ("location_id", "normalized_name"),
    "merchants": ("household_id", "normalized_name"),
    "wishlist_lists": ("household_id", "name"),
    "purchase_imports": ("household_id", "document_hash"),
    "purchase_document_wines": ("purchase_import_id", "wine_id"),
    "household_regional_gap_settings": ("household_id",),
    "spreadsheet_import_maps": ("household_id", "fingerprint"),
    "coownership_participants": ("agreement_id", "email"),
    "user_tags": ("user_id", "name"),
    "user_wine_tags": ("user_id", "wine_id", "tag_id"),
    "user_wine_ratings": ("user_id", "wine_id"),
    "user_taste_profiles": ("user_id", "household_id", "category"),
    "user_taste_declarations": ("user_id",),
}


# The restoring user's language, set by the route: messages reach the UI as written.
_LOCALE: ContextVar[str] = ContextVar("backup_locale", default="en")


def use_locale(locale: str | None) -> None:
    _LOCALE.set("it" if (locale or "").lower().startswith("it") else "en")


def _t(it: str, en: str) -> str:
    return it if _LOCALE.get() == "it" else en


def _bad_backup(detail: str) -> HTTPException:
    return HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=detail)


@dataclass
class ParsedBackup:
    archive: zipfile.ZipFile
    manifest: dict[str, Any]
    tables: dict[str, list[dict[str, Any]]]
    members: set[str]
    warnings: list[str] = field(default_factory=list)

    @property
    def file_members(self) -> list[str]:
        return sorted(name for name in self.members if name.startswith("files/"))

    def size(self, member: str) -> int:
        return self.archive.getinfo(member).file_size

    def read(self, member: str, limit: int) -> bytes:
        if self.size(member) > limit:
            raise _bad_backup(
                _t(
                    f"Un file del backup è troppo grande: {member}",
                    f"A file in the backup is too large: {member}",
                )
            )
        with self.archive.open(member) as handle:
            return handle.read(limit + 1)[:limit]

    def close(self) -> None:
        self.archive.close()


def _allowed_member(name: str) -> bool:
    if name in ("manifest.json", "data.json"):
        return True
    return any(
        pattern.fullmatch(name) for pattern in (_PHOTO_MEMBER, _DOCUMENT_MEMBER, _BINARY_MEMBER)
    )


def read_backup(file: IO[bytes]) -> ParsedBackup:
    """Open and validate a backup archive. Raises HTTP 400 when it is not a valid backup."""
    try:
        archive = zipfile.ZipFile(file)
    except (zipfile.BadZipFile, OSError, ValueError) as exc:
        raise _bad_backup(
            _t(
                "Il file non è un backup Vinaris (non è un archivio ZIP).",
                "The file is not a Vinaris backup (not a ZIP archive).",
            )
        ) from exc
    try:
        infos = archive.infolist()
        if len(infos) > MAX_MEMBERS:
            raise _bad_backup(
                _t("Il backup contiene troppi file.", "The backup holds too many files.")
            )
        names = [info.filename for info in infos]
        if len(set(names)) != len(names):
            raise _bad_backup(
                _t(
                    "Il backup contiene due volte lo stesso file.",
                    "The backup holds the same file twice.",
                )
            )
        for name in names:
            if not _allowed_member(name):
                raise _bad_backup(
                    _t(
                        f"Il backup contiene un file inatteso: {name[:200]}",
                        f"The backup holds an unexpected file: {name[:200]}",
                    )
                )
        if sum(info.file_size for info in infos) > MAX_TOTAL_UNCOMPRESSED:
            raise _bad_backup(
                _t(
                    "Il backup è troppo grande per essere ripristinato.",
                    "The backup is too large to restore.",
                )
            )
        if "manifest.json" not in names or "data.json" not in names:
            raise _bad_backup(
                _t(
                    "Il backup è incompleto: manca manifest.json o data.json.",
                    "The backup is incomplete: manifest.json or data.json is missing.",
                )
            )
        if archive.getinfo("manifest.json").file_size > MAX_MANIFEST:
            raise _bad_backup(
                _t("Il riepilogo del backup è troppo grande.", "The backup manifest is too large.")
            )
        if archive.getinfo("data.json").file_size > MAX_DATA_JSON:
            raise _bad_backup(
                _t(
                    "I dati del backup sono troppo grandi per essere ripristinati.",
                    "The backup data is too large to restore.",
                )
            )
        try:
            manifest = json.loads(archive.read("manifest.json"))
        except (ValueError, zipfile.BadZipFile) as exc:
            raise _bad_backup(
                _t(
                    "Il riepilogo del backup non si può leggere.",
                    "The backup manifest cannot be read.",
                )
            ) from exc
        found = manifest.get("schema") if isinstance(manifest, dict) else None
        if not isinstance(manifest, dict) or found != SCHEMA:
            raise _bad_backup(
                _t(
                    "Questo file non è un backup Vinaris supportato "
                    f"(atteso {SCHEMA}, trovato {str(found)[:60]}).",
                    "This file is not a supported Vinaris backup "
                    f"(expected {SCHEMA}, found {str(found)[:60]}).",
                )
            )
        try:
            data = json.loads(archive.read("data.json"))
        except (ValueError, zipfile.BadZipFile) as exc:
            raise _bad_backup(
                _t("I dati del backup non si possono leggere.", "The backup data cannot be read.")
            ) from exc
        raw_tables = data.get("tables") if isinstance(data, dict) else None
        if not isinstance(raw_tables, dict):
            raise _bad_backup(
                _t("I dati del backup non contengono tabelle.", "The backup data has no tables.")
            )
        known = {spec.name for spec in BACKUP_TABLES}
        tables: dict[str, list[dict[str, Any]]] = {}
        warnings: list[str] = []
        for name, rows in raw_tables.items():
            if name not in known:
                warnings.append(
                    _t(
                        f"Dati ignorati, non riconosciuti da questa versione di Vinaris: {name}.",
                        f"Ignored data this version of Vinaris does not know: {name}.",
                    )
                )
                continue
            if not isinstance(rows, list) or not all(isinstance(row, dict) for row in rows):
                raise _bad_backup(
                    _t(
                        f"I dati del backup per {name} non sono validi.",
                        f"The backup data for {name} is not valid.",
                    )
                )
            tables[name] = rows
        for spec in BACKUP_TABLES:
            tables.setdefault(spec.name, [])
        return ParsedBackup(
            archive=archive,
            manifest=manifest,
            tables=tables,
            members=set(names),
            warnings=warnings,
        )
    except BaseException:
        archive.close()
        raise


def _python_type(column: Column) -> type | None:
    try:
        return column.type.python_type
    except NotImplementedError:
        return None


def _coerce(table_name: str, column: Column, value: Any) -> Any:
    if value is None:
        return None
    kind = _python_type(column)
    try:
        if kind is None or kind in (dict, list):
            return value
        if kind is UUID:
            return value if isinstance(value, UUID) else UUID(str(value))
        if kind is Decimal:
            if isinstance(value, bool):
                raise ValueError
            return Decimal(str(value))
        if kind is datetime:
            if not isinstance(value, str):
                raise ValueError
            return datetime.fromisoformat(value)
        if kind is date:
            if not isinstance(value, str):
                raise ValueError
            return date.fromisoformat(value)
        if kind is bool:
            if not isinstance(value, bool):
                raise ValueError
            return value
        if kind is int:
            if isinstance(value, bool) or isinstance(value, float) and not value.is_integer():
                raise ValueError
            return int(value)
        if kind is float:
            if isinstance(value, bool):
                raise ValueError
            return float(value)
        if kind is str:
            if not isinstance(value, str):
                raise ValueError
            return value
    except (ValueError, TypeError, InvalidOperation) as exc:
        raise _bad_backup(
            _t(
                f"Il backup contiene un valore non valido in {table_name}.{column.name}.",
                f"The backup holds an invalid value in {table_name}.{column.name}.",
            )
        ) from exc
    return value


def _target_is_empty(db: Session, household_id: UUID) -> bool:
    for model in (Wine, WishlistItem, WineSale):
        found = db.scalar(select(model.id).where(model.household_id == household_id).limit(1))
        if found is not None:
            return False
    return True


def _label_count(rows: list[dict[str, Any]]) -> int:
    labels = set()
    for row in rows:
        try:
            active = int(row.get("quantity") or 0) > 0
        except (TypeError, ValueError):
            active = False
        if active:
            labels.add(
                tuple(
                    str(row.get(key) or "").strip().lower()
                    for key in ("producer", "name", "vintage")
                )
            )
    return len(labels)


def _free_tier_problem(context: CurrentContext, parsed: ParsedBackup) -> str | None:
    """Same rule as the JSON import: a free cellar keeps at most the free label limit."""
    if not is_free_tier(context):
        return None
    labels = _label_count(parsed.tables["wines"])
    limit = free_tier_label_limit()
    if labels > limit:
        return _t(
            f"Il backup contiene {labels} etichette in cantina e il piano gratuito ne "
            f"consente {limit}. Attiva un abbonamento per ripristinarlo.",
            f"Free tier label limit exceeded: the backup holds {labels} labels in stock and "
            f"the free tier allows {limit}. Activate a subscription to restore it.",
        )
    return None


def preview(db: Session, context: CurrentContext, parsed: ParsedBackup) -> dict[str, Any]:
    household = parsed.manifest.get("household")
    household = household if isinstance(household, dict) else {}
    target_empty = _target_is_empty(db, context.household.id)
    warnings = list(parsed.warnings)
    if not target_empty:
        warnings.append(
            _t(
                "Questa cantina non è vuota: svuotala prima di ripristinare il backup.",
                "This cellar is not empty: empty it before restoring the backup.",
            )
        )
    problem = _free_tier_problem(context, parsed)
    if problem:
        warnings.append(problem)
    return {
        "schema": SCHEMA,
        "exported_at": str(parsed.manifest.get("exported_at") or ""),
        "household_name": str(household.get("name") or ""),
        "counts": {spec.name: len(parsed.tables[spec.name]) for spec in BACKUP_TABLES},
        "file_count": len(parsed.file_members),
        "target_empty": target_empty,
        "warnings": warnings,
    }


class _Restore:
    def __init__(self, db: Session, context: CurrentContext, parsed: ParsedBackup) -> None:
        self.db = db
        self.context = context
        self.parsed = parsed
        self.household_id: UUID = context.household.id
        self.user_id: UUID = context.user.id
        self.maps: dict[str, dict[str, UUID]] = {}
        self.inserted: dict[str, set[UUID]] = {}
        self.all_inserted: set[UUID] = set()
        self.present: dict[str, set[str]] = {}
        self.restored: dict[str, int] = {spec.name: 0 for spec in BACKUP_TABLES}
        self.skipped: dict[str, int] = {spec.name: 0 for spec in BACKUP_TABLES}
        self.kept = 0
        self.warnings: list[str] = list(parsed.warnings)
        self.written: list[Path] = []
        self.file_count = 0
        self.deferred: list[tuple[str, UUID, str, str]] = []
        self.exists_cache: dict[tuple[str, str, UUID], bool] = {}
        self.member_ids: set[UUID] = set(
            db.scalars(
                select(Membership.user_id).where(Membership.household_id == self.household_id)
            ).all()
        ) | {self.user_id}
        self.backup_tables = {spec.name for spec in BACKUP_TABLES}

    # --- references -------------------------------------------------------------

    def _exists(self, table: Table, column: str, value: UUID) -> bool:
        key = (table.name, column, value)
        if key not in self.exists_cache:
            found = self.db.scalar(select(table.c[column]).where(table.c[column] == value).limit(1))
            self.exists_cache[key] = found is not None
        return self.exists_cache[key]

    def _user(self, spec: BackupTable, column: Column, value: UUID | None) -> UUID | None:
        if column.name == "user_id" and spec.scope in ("user", "user_household"):
            return self.user_id
        if value is not None and value in self.member_ids:
            return value
        return None if column.nullable else self.user_id

    def _share_offer_recipient(self, values: dict[str, Any]) -> bool:
        """Offers to other people's cellars survive only if the recipient still exists."""
        recipient = values.get("recipient_user_id")
        if recipient is None:
            return False
        user = self.db.get(User, recipient)
        if (
            user is None
            or user.email.strip().lower()
            != str(values.get("recipient_email") or "").strip().lower()
        ):
            return False
        recipient_wine = values.get("recipient_wine_id")
        if recipient_wine is not None:
            # Keep the accepted copy only when it is still in one of the recipient's cellars.
            found = self.db.scalar(
                select(Wine.id)
                .join(Membership, Membership.household_id == Wine.household_id)
                .where(Wine.id == recipient_wine, Membership.user_id == recipient)
                .limit(1)
            )
            if found is None:
                values["recipient_wine_id"] = None
        return True

    def _old_id_anywhere(self, value: UUID) -> UUID | None:
        key = str(value)
        for mapping in self.maps.values():
            if key in mapping:
                return mapping[key]
        return None

    # --- rows -------------------------------------------------------------------

    def _values(
        self, spec: BackupTable, table: Table, raw: dict[str, Any]
    ) -> dict[str, Any] | None:
        """The row ready for insert, or None when it cannot be restored."""
        old_id = str(raw.get("id") or "")
        values: dict[str, Any] = {}
        for column in table.c:
            if column.name == "id" or column.name not in raw:
                continue
            if _python_type(column) is bytes:
                values[column.name] = self._binary(spec, table, column, raw[column.name], old_id)
                continue
            value = _coerce(spec.name, column, raw[column.name])
            fks = list(column.foreign_keys)
            if not fks:
                values[column.name] = value
                continue
            target = fks[0].column.table
            if target.name == "households":
                value = self.household_id if value is not None or not column.nullable else None
            elif target.name == "users":
                if spec.name == "wine_share_offers" and column.name == "recipient_user_id":
                    pass
                else:
                    value = self._user(spec, column, value)
            elif spec.name == "wine_share_offers" and column.name == "recipient_wine_id":
                pass
            elif column.name in spec.deferred:
                if value is not None:
                    self.deferred.append((spec.name, UUID(int=0), column.name, str(value)))
                value = None
            elif target.name in self.backup_tables:
                if value is not None:
                    mapped = self.maps.get(target.name, {}).get(str(value))
                    if mapped is None and not column.nullable:
                        return None
                    value = mapped
            elif value is not None and not self._exists(target, fks[0].column.name, value):
                if not column.nullable:
                    return None
                value = None
            values[column.name] = value
        if spec.name == "wine_share_offers" and not self._share_offer_recipient(values):
            return None
        if spec.name == "ai_audit_log" and values.get("entity_id") is not None:
            values["entity_id"] = self._old_id_anywhere(values["entity_id"]) or values["entity_id"]
        if spec.name == "coownership_participants":
            values["invite_token_encrypted"] = ""
        if spec.scope in ("user", "user_household") and "user_id" in table.c:
            values["user_id"] = self.user_id
        if "household_id" in table.c and spec.scope == "household":
            values["household_id"] = self.household_id
        return values

    def _binary(
        self, spec: BackupTable, table: Table, column: Column, value: Any, old_id: str
    ) -> bytes | None:
        if value is None:
            return None
        member = binary_member(spec.name, column.name, old_id)
        if value != member or member not in self.parsed.members:
            if column.name == "memory_photo":
                self.warnings.append(
                    _t(
                        f"Una foto ricordo mancava nel backup ({spec.name}).",
                        f"A memory photo was missing from the backup ({spec.name}).",
                    )
                )
            return None
        self.file_count += 1
        return self.parsed.read(member, MAX_BINARY)

    def _scope_filter(self, spec: BackupTable, table: Table, values: dict[str, Any]) -> list[Any]:
        conditions = []
        if "household_id" in table.c and values.get("household_id") is not None:
            conditions.append(table.c.household_id == values["household_id"])
        if spec.scope in ("user", "user_household"):
            conditions.append(table.c.user_id == self.user_id)
        if spec.parent is not None:
            column = spec.parent[0]
            conditions.append(table.c[column] == values.get(column))
        return conditions

    def _existing(
        self, spec: BackupTable, table: Table, old_id: str, values: dict[str, Any]
    ) -> dict[str, Any] | None:
        conditions = self._scope_filter(spec, table, values)
        if "id" in table.c and old_id in self.present.get(spec.name, set()) and conditions:
            row = (
                self.db.execute(select(table).where(table.c.id == UUID(old_id), *conditions))
                .mappings()
                .first()
            )
            if row is not None:
                return dict(row)
        keys = NATURAL_KEYS.get(spec.name)
        if not keys or any(key not in values for key in keys):
            return None
        if any(values[key] in self.all_inserted for key in keys):
            # Refers to a row this restore just created: nothing can match yet.
            return None
        match = [
            table.c[key].is_(None) if values[key] is None else table.c[key] == values[key]
            for key in keys
        ]
        row = self.db.execute(select(table).where(and_(*match))).mappings().first()
        return dict(row) if row is not None else None

    def _repair(
        self, spec: BackupTable, table: Table, existing: dict[str, Any], values: dict[str, Any]
    ) -> None:
        """Fill references an emptied cellar cleared (ON DELETE SET NULL) on a kept row."""
        updates = {}
        for column in table.c:
            fks = list(column.foreign_keys)
            if (
                fks
                and fks[0].column.table.name in self.backup_tables
                and column.name not in spec.deferred
                and existing.get(column.name) is None
                and values.get(column.name) is not None
            ):
                updates[column.name] = values[column.name]
        if spec.name == "ai_audit_log" and values.get("entity_id") != existing.get("entity_id"):
            updates["entity_id"] = values["entity_id"]
        if not updates:
            return
        pk = [column for column in table.primary_key.columns]
        self.db.execute(
            table.update()
            .where(*(column == existing[column.name] for column in pk))
            .values(**updates)
        )

    def _present_ids(self, spec: BackupTable, table: Table) -> set[str]:
        """Backup IDs of this table that already exist in the database (in any cellar:
        _existing checks the scope), fetched in chunks instead of row by row."""
        if "id" not in table.c:
            return set()
        ids: list[UUID] = []
        for raw in self.parsed.tables[spec.name]:
            try:
                ids.append(UUID(str(raw.get("id"))))
            except ValueError as exc:
                raise _bad_backup(
                    _t(
                        f"Il backup contiene un identificativo non valido in {spec.name}.",
                        f"The backup holds an invalid id in {spec.name}.",
                    )
                ) from exc
        present: set[str] = set()
        for start in range(0, len(ids), 500):
            chunk = ids[start : start + 500]
            present.update(
                str(value)
                for value in self.db.scalars(select(table.c.id).where(table.c.id.in_(chunk)))
            )
        return present

    def restore_table(self, spec: BackupTable) -> None:
        table = Base.metadata.tables[spec.name]
        mapping = self.maps.setdefault(spec.name, {})
        inserted = self.inserted.setdefault(spec.name, set())
        self.present[spec.name] = self._present_ids(spec, table)
        has_default_location = (
            spec.name == "cellar_locations"
            and self.db.scalar(
                select(table.c.id)
                .where(table.c.household_id == self.household_id, table.c.is_default.is_(True))
                .limit(1)
            )
            is not None
        )
        for raw in self.parsed.tables[spec.name]:
            old_id = str(raw.get("id") or "")
            deferred_before = len(self.deferred)
            values = self._values(spec, table, raw)
            if values is None:
                del self.deferred[deferred_before:]
                self.skipped[spec.name] += 1
                continue
            existing = self._existing(spec, table, old_id, values)
            if existing is not None:
                del self.deferred[deferred_before:]
                self._repair(spec, table, existing, values)
                if "id" in table.c and old_id:
                    mapping[old_id] = existing["id"]
                self.restored[spec.name] += 1
                self.kept += 1
                continue
            if "id" in table.c:
                new_id = uuid4()
                values["id"] = new_id
                if old_id:
                    mapping[old_id] = new_id
                inserted.add(new_id)
                self.all_inserted.add(new_id)
                for index in range(deferred_before, len(self.deferred)):
                    name, _, column, old_value = self.deferred[index]
                    self.deferred[index] = (name, new_id, column, old_value)
            if spec.name == "coownership_participants":
                values["invite_token_hash"] = f"restored-{values['id']}"
            if spec.name == "cellar_locations" and values.get("is_default"):
                if has_default_location:
                    values["is_default"] = False
                has_default_location = True
            self.db.execute(table.insert().values(**values))
            self.restored[spec.name] += 1

    def apply_deferred(self) -> None:
        for name, new_id, column, old_value in self.deferred:
            table = Base.metadata.tables[name]
            target = next(iter(table.c[column].foreign_keys)).column.table.name
            mapped = self.maps.get(target, {}).get(old_value)
            if mapped is not None:
                self.db.execute(table.update().where(table.c.id == new_id).values({column: mapped}))

    # --- files ------------------------------------------------------------------

    def _copy(self, member: str, path: Path, limit: int, *, png: bool = False) -> bool:
        if member not in self.parsed.members or self.parsed.size(member) > limit:
            return False
        if png:
            with self.parsed.archive.open(member) as handle:
                if handle.read(len(PNG_SIGNATURE)) != PNG_SIGNATURE:
                    return False
        path.parent.mkdir(parents=True, exist_ok=True)
        existed = path.exists()
        with self.parsed.archive.open(member) as source, path.open("wb") as target:
            if not existed:
                self.written.append(path)
            shutil.copyfileobj(source, target, length=1024 * 1024)
        self.file_count += 1
        return True

    def restore_files(self) -> None:
        wines = Base.metadata.tables["wines"]
        photo_root = Path(settings.wine_photo_storage_dir) / str(self.household_id)
        restored_wines = self.inserted.get("wines", set())
        missing_photos = 0
        for raw in self.parsed.tables["wines"]:
            old_id = str(raw.get("id") or "")
            new_id = self.maps.get("wines", {}).get(old_id)
            if new_id is None or new_id not in restored_wines or not raw.get("photo_version"):
                continue
            members = [wine_photo_member(old_id, size) for size in PHOTO_SIZES]
            valid = all(
                member in self.parsed.members
                and self.parsed.size(member) <= MAX_PHOTO
                and self._is_png(member)
                for member in members
            )
            if valid:
                for size, member in zip(PHOTO_SIZES, members, strict=True):
                    self._copy(
                        member, photo_root / str(new_id) / f"{size}.png", MAX_PHOTO, png=True
                    )
            else:
                missing_photos += 1
                self.db.execute(wines.update().where(wines.c.id == new_id).values(photo_version=""))
        if missing_photos:
            self.warnings.append(
                _t(
                    f"{missing_photos} foto di bottiglie mancavano nel backup "
                    "e non sono state ripristinate.",
                    f"{missing_photos} bottle photos were missing from the backup "
                    "and were left out.",
                )
            )

        document_root = Path(settings.purchase_document_storage_dir) / str(self.household_id)
        for raw in self.parsed.tables["purchase_imports"]:
            old_id = str(raw.get("id") or "")
            new_id = self.maps.get("purchase_imports", {}).get(old_id)
            if new_id is None:
                continue
            path = document_root / str(new_id) / "original"
            if path.is_file():
                continue
            member = purchase_document_member(old_id)
            if member in self.parsed.members:
                self._copy(member, path, MAX_DOCUMENT)

    def _is_png(self, member: str) -> bool:
        with self.parsed.archive.open(member) as handle:
            return handle.read(len(PNG_SIGNATURE)) == PNG_SIGNATURE

    # --- household ----------------------------------------------------------------

    def apply_household_settings(self) -> None:
        from app.api.routes.households import ensure_restaurant_mode_available

        saved = self.parsed.manifest.get("household")
        if not isinstance(saved, dict):
            return
        household = self.context.household
        columns = Base.metadata.tables["households"].c
        for key in HOUSEHOLD_SETTINGS:
            if key not in saved or key not in columns:
                continue
            value = _coerce("households", columns[key], saved[key])
            if value is None and not columns[key].nullable:
                continue
            if key == "operating_mode":
                if value not in ("private", "restaurant"):
                    continue
                try:
                    ensure_restaurant_mode_available(self.context, value)
                except HTTPException:
                    self.warnings.append(
                        _t(
                            "Il backup usava la modalità ristorante, non disponibile su questo "
                            "account: la cantina resta in modalità privata.",
                            "The backup used restaurant mode, which is not available on this "
                            "account: the cellar stays in private mode.",
                        )
                    )
                    continue
            setattr(household, key, value)

    def cleanup_files(self) -> None:
        for path in reversed(self.written):
            path.unlink(missing_ok=True)
            for parent in (path.parent, path.parent.parent):
                try:
                    parent.rmdir()
                except OSError:
                    break


def restore(db: Session, context: CurrentContext, parsed: ParsedBackup) -> dict[str, Any]:
    """Restore the backup into the active cellar, which must be empty. Commits."""
    # Two restores into the same cellar at once would both find it empty.
    db.scalar(select(Household.id).where(Household.id == context.household.id).with_for_update())
    if not _target_is_empty(db, context.household.id):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=_t(
                "Questa cantina non è vuota. Svuotala, poi ripristina il backup.",
                "This cellar is not empty. Empty the cellar first, then restore the backup.",
            ),
        )
    problem = _free_tier_problem(context, parsed)
    if problem:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=problem)
    job = _Restore(db, context, parsed)
    try:
        for spec in BACKUP_TABLES:
            job.restore_table(spec)
        job.apply_deferred()
        job.restore_files()
        job.apply_household_settings()
        db.commit()
    except BaseException:
        db.rollback()
        job.cleanup_files()
        raise
    skipped = {name: count for name, count in job.skipped.items() if count}
    if skipped:
        job.warnings.append(
            _t(
                f"{sum(skipped.values())} elementi non sono stati ripristinati perché ciò a cui "
                "si riferivano non esiste più.",
                f"{sum(skipped.values())} records could not be restored because what they refer "
                "to no longer exists.",
            )
        )
    if job.kept:
        job.warnings.append(
            _t(
                f"{job.kept} elementi erano già in questa cantina e sono stati lasciati com'erano.",
                f"{job.kept} records were already in this cellar and were kept as they are.",
            )
        )
    return {
        "restored": job.restored,
        "skipped": job.skipped,
        "file_count": job.file_count,
        "warnings": job.warnings,
    }
