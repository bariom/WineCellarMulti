"""Publish technical wine metadata as reviewable shared catalog entries."""

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import Wine, WineCatalogEntry
from app.schemas.catalog import CatalogRecoveryResult


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
