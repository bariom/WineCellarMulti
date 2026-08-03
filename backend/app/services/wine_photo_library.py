from __future__ import annotations

import shutil
import uuid
from hashlib import sha256
from pathlib import Path

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.models import Wine, WinePhotoLibraryEntry

PHOTO_FILE_NAMES = ("thumbnail", "detail")


def normalize_photo_identity(value: str) -> str:
    return " ".join(value.strip().casefold().split())[:200]


def wine_photo_path(wine: Wine, size: str) -> Path:
    return (
        Path(settings.wine_photo_storage_dir)
        / str(wine.household_id)
        / str(wine.id)
        / f"{size}.png"
    )


def library_photo_path(photo: WinePhotoLibraryEntry, size: str) -> Path:
    return (
        Path(settings.wine_photo_storage_dir)
        / "library"
        / str(photo.id)
        / f"{size}.png"
    )


def archive_wine_photo(
    db: Session,
    wine: Wine,
) -> WinePhotoLibraryEntry | None:
    source_paths = {size: wine_photo_path(wine, size) for size in PHOTO_FILE_NAMES}
    if not wine.photo_version or not all(path.is_file() for path in source_paths.values()):
        return None

    normalized_name = normalize_photo_identity(wine.name)
    normalized_producer = normalize_photo_identity(wine.producer)
    content_hash = sha256(source_paths["detail"].read_bytes()).hexdigest()
    photo = db.scalar(
        select(WinePhotoLibraryEntry).where(
            WinePhotoLibraryEntry.normalized_name == normalized_name,
            WinePhotoLibraryEntry.normalized_producer == normalized_producer,
            WinePhotoLibraryEntry.content_hash == content_hash,
        )
    )
    if photo is not None and all(
        library_photo_path(photo, size).is_file() for size in PHOTO_FILE_NAMES
    ):
        return photo

    if photo is None:
        photo = WinePhotoLibraryEntry(
            name=wine.name.strip(),
            producer=wine.producer.strip(),
            normalized_name=normalized_name,
            normalized_producer=normalized_producer,
            source_wine_id=wine.id,
            photo_version=uuid.uuid4().hex,
            content_hash=content_hash,
        )
        db.add(photo)
        db.flush()
    target_dir = library_photo_path(photo, "detail").parent
    target_dir.mkdir(parents=True, exist_ok=True)
    temporary_paths: list[Path] = []
    try:
        for size, source_path in source_paths.items():
            temporary = library_photo_path(photo, size).with_suffix(".tmp")
            shutil.copyfile(source_path, temporary)
            temporary_paths.append(temporary)
        for size, temporary in zip(PHOTO_FILE_NAMES, temporary_paths, strict=True):
            temporary.replace(library_photo_path(photo, size))
    finally:
        for temporary in temporary_paths:
            temporary.unlink(missing_ok=True)
    return photo


def copy_library_photo(photo: WinePhotoLibraryEntry, target: Wine) -> None:
    source_paths = {size: library_photo_path(photo, size) for size in PHOTO_FILE_NAMES}
    if not all(path.is_file() for path in source_paths.values()):
        raise FileNotFoundError("Bottle photo not found")

    target_dir = wine_photo_path(target, "detail").parent
    target_dir.mkdir(parents=True, exist_ok=True)
    temporary_paths: list[Path] = []
    try:
        for size, source_path in source_paths.items():
            temporary = wine_photo_path(target, size).with_suffix(".tmp")
            shutil.copyfile(source_path, temporary)
            temporary_paths.append(temporary)
        for size, temporary in zip(PHOTO_FILE_NAMES, temporary_paths, strict=True):
            temporary.replace(wine_photo_path(target, size))
    finally:
        for temporary in temporary_paths:
            temporary.unlink(missing_ok=True)
    target.photo_version = uuid.uuid4().hex
