from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, datetime
from decimal import Decimal
from io import BytesIO
from uuid import UUID

from fastapi import HTTPException
from PIL import Image, ImageOps, UnidentifiedImageError
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from app.api.deps import CurrentContext
from app.api.routes.catalog import ensure_catalog_entry_for_wine_data, normalize_catalog_text
from app.models import (
    PurchaseImport,
    Wine,
    WineCatalogAlias,
    WineCatalogEntry,
    WinePhotoLibraryEntry,
    WineStockMovement,
    WineStorageAllocation,
)
from app.schemas.purchase_import import (
    DEFAULT_BOTTLE_FORMAT,
    PurchaseConfirmation,
    PurchaseExtraction,
    PurchaseResult,
)
from app.services.free_tier import ensure_free_tier_label_capacity
from app.services.merchants import get_or_create_merchant
from app.services.pdf_sources import extract_pdf_document
from app.services.purchase_documents import link_document_wines
from app.services.stock_ledger import add_inbound_stock
from app.services.storage import add_to_storage
from app.services.wine_photo_library import (
    copy_library_photo,
    matching_reference_photos,
)

MAX_DOCUMENT_BYTES = 10_000_000


def purchase_photo_suggestions(db: Session, name: str, producer: str) -> list[dict]:
    """Read shared reference assets only, never another household's wines."""
    return [
        {
            "id": photo.id,
            "thumbnail_url": (
                f"/api/v1/wines/photo/library/{photo.id}/thumbnail?v={photo.photo_version}"
            ),
        }
        for photo in matching_reference_photos(db, name, producer)[:10]
    ]


def attach_purchase_photo(db: Session, wine: Wine, photo_id: UUID) -> bool:
    if wine.photo_version:
        return True
    photo = db.get(WinePhotoLibraryEntry, photo_id)
    if photo is None:
        return False
    if photo not in matching_reference_photos(db, wine.name, wine.producer, available_only=False):
        raise HTTPException(422, "Selected reference photo does not match the reviewed wine")
    try:
        copy_library_photo(photo, wine)
    except FileNotFoundError:
        return False
    return True


def separate_purchase_origins_from_catalog(
    db: Session, extraction: PurchaseExtraction, *, locale: str = "it"
) -> None:
    """Remove a comma suffix only when an approved matching identity proves its origin."""
    prefixes: dict[str, list[tuple[str, list[str]]]] = {}
    names = set()
    for row in extraction.rows:
        if "," not in row.name:
            continue
        variants = []
        parts = row.name.split(",")
        for index in range(1, len(parts)):
            prefix = normalize_catalog_text(",".join(parts[:index]))
            suffix = [normalize_catalog_text(part) for part in parts[index:]]
            if prefix and all(suffix):
                variants.append((prefix, suffix))
                names.add(prefix)
        prefixes[row.name] = variants
        names.add(normalize_catalog_text(row.name))
    if not names:
        return
    entries = db.execute(
        select(WineCatalogEntry, WineCatalogAlias.normalized_alias)
        .outerjoin(WineCatalogAlias, WineCatalogAlias.catalog_entry_id == WineCatalogEntry.id)
        .where(
            WineCatalogEntry.is_active.is_(True),
            or_(
                func.lower(func.trim(WineCatalogEntry.name)).in_(names),
                WineCatalogAlias.normalized_alias.in_(names),
            ),
        )
    )
    candidates: dict[str, dict[UUID, WineCatalogEntry]] = {name: {} for name in names}
    for entry, alias in entries:
        for key in {normalize_catalog_text(entry.name), alias} & names:
            candidates[key][entry.id] = entry
    for row in extraction.rows:
        variants = prefixes.get(row.name, [])
        if not variants or len(row.warnings) >= 10:
            continue
        # A full catalog name/alias takes precedence over an apparent geographic suffix.
        if candidates.get(normalize_catalog_text(row.name)):
            continue
        matches: dict[tuple[str, str], tuple[str, str]] = {}
        for prefix, suffix in variants:
            for entry in candidates[prefix].values():
                producer = normalize_catalog_text(entry.producer)
                if row.producer.strip() and producer != normalize_catalog_text(row.producer):
                    continue
                origins = {
                    normalize_catalog_text(entry.appellation),
                    normalize_catalog_text(entry.region),
                    normalize_catalog_text(entry.country),
                } - {""}
                if all(part in origins for part in suffix):
                    key = (normalize_catalog_text(entry.name), producer)
                    origin = ", ".join(part.strip() for part in row.name.split(",")[-len(suffix) :])
                    matches[key] = (entry.name.strip(), origin)
        if len(matches) == 1:
            name, origin = next(iter(matches.values()))
            row.name = name
            row.warnings.append(
                f"Origine riportata nel documento: {origin}. Non fa parte del nome del vino."
                if locale == "it"
                else f"Origin stated in the document: {origin}. It is not part of the wine name."
            )


def fill_purchase_producers_from_catalog(db: Session, extraction: PurchaseExtraction) -> None:
    """Complete missing producers only when approved catalog identities agree."""
    names = {
        normalize_catalog_text(row.name)
        for row in extraction.rows
        if row.name.strip() and not row.producer.strip()
    }
    if not names:
        return
    # The central catalog is shared; private cellar wines are never searched here.
    entries = db.execute(
        select(WineCatalogEntry.name, WineCatalogEntry.producer, WineCatalogAlias.normalized_alias)
        .outerjoin(WineCatalogAlias, WineCatalogAlias.catalog_entry_id == WineCatalogEntry.id)
        .where(
            WineCatalogEntry.is_active.is_(True),
            or_(
                func.lower(func.trim(WineCatalogEntry.name)).in_(names),
                WineCatalogAlias.normalized_alias.in_(names),
            ),
        )
    )
    candidates: dict[str, dict[str, str]] = {name: {} for name in names}
    for name, producer, alias in entries:
        for key in {normalize_catalog_text(name), alias} & names:
            candidates[key][normalize_catalog_text(producer)] = producer.strip()
    for row in extraction.rows:
        if row.producer.strip():
            continue
        producers = candidates.get(normalize_catalog_text(row.name), {})
        if len(producers) == 1 and "" not in producers:
            row.producer = next(iter(producers.values()))


@dataclass(frozen=True)
class PurchaseDocument:
    images: list[tuple[str, bytes]]
    files: list[tuple[str, bytes]]
    text: str = ""


def purchase_document(content: bytes, mime: str) -> PurchaseDocument:
    """Validate content rather than trusting filename or browser MIME."""
    if not content or len(content) > MAX_DOCUMENT_BYTES:
        raise HTTPException(413, "Use a document smaller than 10 MB")
    if mime == "application/pdf":
        document = extract_pdf_document(
            content, max_pages=10, include_alternative=False, min_page_chars=80
        )
        if document.status not in {"readable", "empty", "partial"}:
            raise HTTPException(422, "Use a valid, unlocked PDF with at most 10 pages")
        if document.status == "readable":
            return PurchaseDocument([], [], document.text)
        return PurchaseDocument([], [("purchase.pdf", content)])
    if mime not in {"image/jpeg", "image/png", "image/webp"}:
        raise HTTPException(415, "Use JPG, PNG, WebP or PDF")
    try:
        with Image.open(BytesIO(content)) as source:
            if (
                source.format not in {"JPEG", "PNG", "WEBP"}
                or source.width * source.height > 40_000_000
            ):
                raise ValueError("Unsupported image")
            image = ImageOps.exif_transpose(source).convert("RGB")
            image.thumbnail((2400, 2400), Image.Resampling.LANCZOS)
            output = BytesIO()
            image.save(output, "JPEG", quality=90)
        return PurchaseDocument([("image/jpeg", output.getvalue())], [])
    except (UnidentifiedImageError, OSError, ValueError, Image.DecompressionBombError) as exc:
        raise HTTPException(422, "Invalid purchase image") from exc


def purchase_total(payload: PurchaseConfirmation) -> Decimal:
    return (
        sum((row.unit_price * row.quantity for row in payload.rows), Decimal("0"))
        + payload.additional_costs
    )


def scoped_purchase(db: Session, context: CurrentContext, import_id: UUID) -> PurchaseImport:
    record = db.scalar(
        select(PurchaseImport)
        .where(PurchaseImport.id == import_id, PurchaseImport.household_id == context.household.id)
        .with_for_update()
    )
    if record is None:
        raise HTTPException(404, "Purchase not found")
    return record


def apply_purchase(
    db: Session,
    context: CurrentContext,
    record: PurchaseImport,
    payload: PurchaseConfirmation,
    *,
    receiving: bool = False,
) -> PurchaseResult:
    """Caller holds the household lock. One transaction for every row and result."""
    if not receiving and record.status != "draft":
        return PurchaseResult.model_validate(record.result)
    if receiving and record.status == "received":
        return PurchaseResult.model_validate(record.result)
    if receiving and record.status != "pending":
        raise HTTPException(409, "Purchase is not awaiting delivery")
    difference = payload.document_total is not None and abs(
        purchase_total(payload) - payload.document_total
    ) > Decimal("0.02")
    if difference and not payload.accept_total_difference:
        raise HTTPException(422, "Review and accept the difference from the document total")
    if not receiving and payload.reference and payload.supplier:
        previous = db.scalars(
            select(PurchaseImport).where(
                PurchaseImport.household_id == context.household.id,
                PurchaseImport.id != record.id,
                PurchaseImport.status.in_(["received", "pending"]),
            )
        )
        for item in previous:
            if (
                item.confirmed.get("reference", "").strip().casefold()
                == payload.reference.casefold()
                and item.confirmed.get("supplier", "").strip().casefold()
                == payload.supplier.casefold()
                and item.confirmed.get("order_date") == payload.order_date.isoformat()
            ):
                raise HTTPException(409, "This supplier document has already been imported")
    supplier = get_or_create_merchant(db, context, payload.supplier)
    wine_ids: list[UUID] = []
    selected_photos: list[tuple[Wine, UUID]] = []
    received = receiving or payload.delivery == "received"
    # Wines this import created as "Ordered" with their ordered quantity; receiving swaps that
    # placeholder for real stock instead of counting the bottles twice.
    placeholder_ids = (
        {UUID(item) for item in record.result.get("ordered_wine_ids", [])}
        if (receiving and record.result)
        else set()
    )
    ordered_wine_ids: list[UUID] = []
    for index, row in enumerate(payload.rows):
        wine_id = UUID(record.result["wine_ids"][index]) if receiving else row.existing_wine_id
        wine = None
        if wine_id:
            wine = db.scalar(
                select(Wine)
                .where(Wine.id == wine_id, Wine.household_id == context.household.id)
                .with_for_update()
            )
            if wine is None:
                raise HTTPException(404, "Selected wine not found in this cellar")
            if wine.status == "Ordered" and wine.quantity > 0 and wine.id not in placeholder_ids:
                raise HTTPException(
                    422, "Receive the existing order separately before adding another purchase"
                )
            if (
                wine.currency != payload.currency
                or (wine.format.strip() or DEFAULT_BOTTLE_FORMAT) != row.format
            ):
                raise HTTPException(
                    422, "Selected wine must have the same currency and bottle format"
                )
        if received or wine is None:
            ensure_free_tier_label_capacity(db, context, wine=wine)
        if wine is None:
            wine = Wine(
                household_id=context.household.id,
                created_by_user_id=context.user.id,
                name=row.name,
                producer=row.producer,
                vintage=row.vintage,
                format=row.format,
                currency=payload.currency,
                price=row.unit_price,
                quantity=0 if received else row.quantity,
                status="Ordered",
                merchant=supplier,
                order_date=payload.order_date,
                expected_delivery=payload.expected_delivery,
            )
            db.add(wine)
            db.flush()
            if not received:
                ordered_wine_ids.append(wine.id)
            # Use the manual-entry catalog path with reviewed identity fields only.
            ensure_catalog_entry_for_wine_data(
                db, {"name": row.name, "producer": row.producer, "format": row.format}
            )
        if row.photo_library_id and not receiving:
            selected_photos.append((wine, row.photo_library_id))
        if received:
            if wine.id in placeholder_ids:
                wine.quantity = 0
            # Preserve historical costs for legacy stock before adding a new lot.
            allocated = sum(
                db.scalars(
                    select(WineStorageAllocation.quantity).where(
                        WineStorageAllocation.wine_id == wine.id,
                        WineStorageAllocation.household_id == context.household.id,
                    )
                )
            )
            if allocated < wine.quantity:
                add_to_storage(db, wine, wine.quantity - allocated)
            count = db.scalar(
                select(WineStockMovement.id)
                .where(
                    WineStockMovement.wine_id == wine.id,
                    WineStockMovement.household_id == context.household.id,
                )
                .limit(1)
            )
            if wine.quantity and not count:
                add_inbound_stock(
                    db,
                    wine,
                    movement_type="initial_purchase",
                    quantity=wine.quantity,
                    occurred_on=wine.order_date or payload.order_date,
                    unit_cost=wine.price,
                    supplier=wine.merchant,
                    reference="",
                    note="Opening stock before receipt import",
                    user_id=context.user.id,
                    update_quantity=False,
                    update_storage=False,
                )
            add_inbound_stock(
                db,
                wine,
                movement_type="purchase",
                quantity=row.quantity,
                occurred_on=datetime.now(UTC).date() if receiving else payload.order_date,
                unit_cost=row.unit_price,
                supplier=supplier,
                reference=payload.reference,
                note="Receipt purchase " + str(record.id),
                user_id=context.user.id,
            )
            if wine.status in {"Ordered", "Sold"}:
                wine.status = "Delivered"
        wine_ids.append(wine.id)
        db.flush()
    unavailable_photos = {
        wine.id
        for wine, photo_id in selected_photos
        if not attach_purchase_photo(db, wine, photo_id)
    }
    result = PurchaseResult(
        id=record.id,
        status="received" if received else "pending",
        wine_ids=wine_ids,
        bottles=sum(row.quantity for row in payload.rows),
        unavailable_photo_wine_ids=[
            wine_id for wine_id in dict.fromkeys(wine_ids) if wine_id in unavailable_photos
        ],
    )
    record.status = result.status
    record.confirmed = payload.model_dump(mode="json")
    record.result = {
        **result.model_dump(mode="json"),
        "ordered_wine_ids": [str(wine_id) for wine_id in ordered_wine_ids],
    }
    link_document_wines(db, record, wine_ids)
    db.flush()
    return result
