"""Publish technical wine metadata as reviewable shared catalog entries."""

import re

from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from app.models import Wine, WineCatalogAlias, WineCatalogEntry
from app.schemas.catalog import CatalogRecoveryResult


def matching_catalog_entries(
    db: Session, name: str, producer: str, *, approved_only: bool = True
) -> list[WineCatalogEntry]:
    """Find exact names/aliases without accepting a conflicting producer."""
    from app.api.routes.catalog import normalize_catalog_text

    name_key = normalize_catalog_text(name)
    producer_key = normalize_catalog_text(producer)
    query = (
        select(WineCatalogEntry)
        .outerjoin(WineCatalogAlias, WineCatalogAlias.catalog_entry_id == WineCatalogEntry.id)
        .where(
            or_(
                func.lower(func.trim(WineCatalogEntry.name)) == name_key,
                WineCatalogAlias.normalized_alias == name_key,
                WineCatalogAlias.normalized_alias == f"{producer_key} {name_key}",
            )
        )
        .distinct()
    )
    if approved_only:
        query = query.where(WineCatalogEntry.is_active.is_(True))
    if producer_key:
        query = query.where(func.lower(func.trim(WineCatalogEntry.producer)) == producer_key)
    return list(db.scalars(query))


def matching_catalog_entry(
    db: Session, name: str, producer: str, *, approved_only: bool = True
) -> WineCatalogEntry | None:
    entries = matching_catalog_entries(db, name, producer, approved_only=approved_only)
    return entries[0] if len(entries) == 1 else None


def inherit_catalog_metadata(db: Session, wine: Wine) -> None:
    """Fill technical gaps only; catalog data never supplies private purchase fields."""
    from app.core.wine_types import normalize_wine_type

    entry = matching_catalog_entry(db, wine.name, wine.producer)
    if entry is None:
        return
    for target, source in (
        ("producer", "producer"),
        ("region", "region"),
        ("wine_zone", "wine_zone"),
        ("vineyard_locality", "locality"),
        ("appellation", "appellation"),
        ("type", "type"),
        ("vineyard_country", "country"),
    ):
        value = getattr(entry, source)
        if value and not (getattr(wine, target) or "").strip():
            setattr(wine, target, normalize_wine_type(value) if target == "type" else value)
    if not wine.grapes and not wine.grapes_not_applicable:
        wine.grapes = [
            {"name": grape.strip()}
            for grape in re.split(r"[,;/]+", entry.grapes_text or "")
            if grape.strip()
        ]


def propose_wine_catalog_entry(
    db: Session, wine: Wine, *, source: str = "cellar_sync"
) -> WineCatalogEntry | None:
    # Import locally: the catalog routes also depend on wine-domain services.
    from app.api.routes.catalog import ensure_catalog_entry_for_wine_data

    return ensure_catalog_entry_for_wine_data(
        db,
        {
            "name": wine.name,
            "producer": wine.producer,
            "region": wine.region,
            "wine_zone": wine.wine_zone,
            "locality": wine.vineyard_locality,
            "appellation": wine.appellation,
            "type": wine.type,
            "format": wine.format,
            "country": wine.vineyard_country,
            "grapes_text": ", ".join(
                str(grape.get("name") or "").strip()
                for grape in (wine.grapes or [])
                if isinstance(grape, dict) and str(grape.get("name") or "").strip()
            ),
        },
        source=source,
    )


def recover_global_catalog(db: Session) -> CatalogRecoveryResult:
    from app.api.routes.catalog import ensure_catalog_entry_for_wine_data

    # Explicit app-admin maintenance operation: project only shareable metadata
    # across households, never load private Wine entities or household/user data.
    wines = db.execute(
        select(
            Wine.name,
            Wine.producer,
            Wine.region,
            Wine.wine_zone,
            Wine.vineyard_locality.label("locality"),
            Wine.appellation,
            Wine.type,
            Wine.format,
            Wine.vineyard_country.label("country"),
            Wine.grapes,
        ).execution_options(yield_per=200)
    ).mappings()
    known_ids = set(db.scalars(select(WineCatalogEntry.id)))
    result = CatalogRecoveryResult()
    for wine in wines:
        result.scanned += 1
        data = dict(wine)
        data["grapes_text"] = ", ".join(
            str(grape.get("name") or "").strip()
            for grape in (data.pop("grapes") or [])
            if isinstance(grape, dict) and str(grape.get("name") or "").strip()
        )
        entry = ensure_catalog_entry_for_wine_data(db, data, source="catalog_recovery")
        if entry is None:
            result.skipped += 1
        elif entry.id in known_ids:
            result.existing += 1
        else:
            result.created += 1
            known_ids.add(entry.id)
    return result
