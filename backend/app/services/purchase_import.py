from __future__ import annotations

from datetime import UTC, datetime
from decimal import Decimal
from io import BytesIO
from uuid import UUID

from fastapi import HTTPException
from PIL import Image, ImageOps, UnidentifiedImageError
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import CurrentContext
from app.models import PurchaseImport, Wine, WineStockMovement, WineStorageAllocation
from app.schemas.purchase_import import PurchaseConfirmation, PurchaseResult
from app.services.free_tier import ensure_free_tier_label_capacity
from app.services.merchants import get_or_create_merchant
from app.services.pdf_sources import extract_pdf_document
from app.services.stock_ledger import add_inbound_stock
from app.services.storage import add_to_storage

MAX_DOCUMENT_BYTES = 10_000_000


def purchase_document(content: bytes, mime: str) -> tuple[list, list]:
    """Validate content rather than trusting filename or browser MIME."""
    if not content or len(content) > MAX_DOCUMENT_BYTES:
        raise HTTPException(413, "Use a document smaller than 10 MB")
    if mime == "application/pdf":
        if extract_pdf_document(content, max_pages=10).status not in {"readable", "empty"}:
            raise HTTPException(422, "Use a valid, unlocked PDF with at most 10 pages")
        return [], [("purchase.pdf", content)]
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
        return [("image/jpeg", output.getvalue())], []
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
    received = receiving or payload.delivery == "received"
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
            if wine.status == "Ordered" and wine.quantity > 0:
                raise HTTPException(
                    422, "Receive the existing order separately before adding another purchase"
                )
            if wine.currency != payload.currency or wine.format != row.format:
                raise HTTPException(
                    422, "Selected wine must have the same currency and bottle format"
                )
        if received:
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
                quantity=0,
                status="Ordered",
                merchant=supplier,
                order_date=payload.order_date,
                expected_delivery=payload.expected_delivery,
            )
            db.add(wine)
            db.flush()
        if received:
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
    result = PurchaseResult(
        id=record.id,
        status="received" if received else "pending",
        wine_ids=wine_ids,
        bottles=sum(row.quantity for row in payload.rows),
    )
    record.status = result.status
    record.confirmed = payload.model_dump(mode="json")
    record.result = result.model_dump(mode="json")
    db.flush()
    return result
