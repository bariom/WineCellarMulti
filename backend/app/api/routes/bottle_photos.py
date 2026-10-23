"""Add the bottles of one or more photos to the cellar, after the user's review."""

from datetime import UTC, date, datetime
from decimal import Decimal
from uuid import UUID

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from fastapi.concurrency import run_in_threadpool
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import CurrentContext, require_write_context
from app.api.routes.wines import create_wine
from app.core.config import settings
from app.db.session import get_db
from app.models import Wine
from app.schemas.bottle_photos import (
    BottlePhotoConfirmation,
    BottlePhotoConfirmResult,
    BottlePhotoConfirmRow,
    BottlePhotoScanStatus,
)
from app.schemas.wine import WineCreate
from app.services import bottle_photo_import
from app.services.ai_credits import ai_credit_balance
from app.services.free_tier import ensure_free_tier_label_capacity, is_free_tier
from app.services.stock_ledger import add_inbound_stock
from app.services.wine_image_recognition import model_view_image

router = APIRouter(prefix="/bottle-photos")


@router.post("/scans", response_model=BottlePhotoScanStatus, status_code=status.HTTP_202_ACCEPTED)
async def start_bottle_photo_scan(
    images: list[UploadFile] = File(default=[]),
    db: Session = Depends(get_db),
    context: CurrentContext = Depends(require_write_context),
) -> BottlePhotoScanStatus:
    """Start reading photos of bottles in the background; poll the job for progress."""
    if not images:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Image is empty")
    if len(images) > bottle_photo_import.MAX_PHOTOS:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Too many photos"
        )
    # Open to every plan, as the way to start a cellar: the free tier spends AI credit.
    if is_free_tier(context) and ai_credit_balance(db, context.user) <= 0:
        raise HTTPException(
            status_code=status.HTTP_402_PAYMENT_REQUIRED,
            detail="An AI Pack is required on the free tier",
        )
    if bottle_photo_import.running_job_for(context.user.id) is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT, detail="A photo analysis is already running"
        )
    photos = []
    for image in images:
        if not (image.content_type or "").lower().startswith("image/"):
            raise HTTPException(
                status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
                detail="Unsupported image format",
            )
        content = await image.read(settings.wine_recognition_max_input_bytes + 1)
        if not content:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Image is empty")
        if len(content) > settings.wine_recognition_max_input_bytes:
            raise HTTPException(
                status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE, detail="Image is too large"
            )
        photos.append(await run_in_threadpool(model_view_image, content))
    job = bottle_photo_import.start_job(
        household_id=context.household.id,
        user_id=context.user.id,
        session_id=context.session.id,
        photos=photos,
    )
    return job.snapshot()


@router.get("/scans/{job_id}", response_model=BottlePhotoScanStatus)
def get_bottle_photo_scan(
    job_id: UUID,
    context: CurrentContext = Depends(require_write_context),
) -> BottlePhotoScanStatus:
    job = bottle_photo_import.get_job(
        job_id, household_id=context.household.id, user_id=context.user.id
    )
    if job is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Photo analysis not found"
        )
    return job.snapshot()


@router.post("/confirm", response_model=BottlePhotoConfirmResult)
def confirm_bottle_photos(
    payload: BottlePhotoConfirmation,
    db: Session = Depends(get_db),
    context: CurrentContext = Depends(require_write_context),
) -> BottlePhotoConfirmResult:
    """Create the reviewed wines, or add their bottles to the same wines in the cellar.

    New wines go through the normal creation, which fills them from the shared
    catalog and applies the free-tier label limit; existing ones get a new lot.
    """
    result = BottlePhotoConfirmResult()
    today = datetime.now(UTC).date()
    for row in payload.rows:
        try:
            save_row(db, context, row, today, result)
        except HTTPException as exc:
            # The free-tier label limit stops here: what is saved stays, and the app
            # keeps the remaining rows instead of sending them all again.
            if exc.status_code != status.HTTP_402_PAYMENT_REQUIRED:
                raise
            db.rollback()
            result.limit_reached = True
            break
        result.saved_rows += 1
        result.bottles += row.quantity
    return result


def save_row(
    db: Session,
    context: CurrentContext,
    row: BottlePhotoConfirmRow,
    today: date,
    result: BottlePhotoConfirmResult,
) -> None:
    if row.existing_wine_id is not None:
        wine = db.scalar(
            select(Wine)
            .where(Wine.id == row.existing_wine_id, Wine.household_id == context.household.id)
            .with_for_update()
        )
        if wine is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Wine not found")
        ensure_free_tier_label_capacity(db, context, wine=wine, will_be_active=True)
        add_inbound_stock(
            db,
            wine,
            movement_type="purchase",
            quantity=row.quantity,
            occurred_on=today,
            unit_cost=row.price,
            supplier="",
            reference="bottle_photo",
            note="Added from a photo",
            user_id=context.user.id,
        )
        if wine.status.lower() in {"consumed", "sold", "bevuto"}:
            wine.status = "Delivered"
        db.commit()
        result.updated_wine_ids.append(wine.id)
    else:
        created = create_wine(
            WineCreate(
                name=row.name,
                producer=row.producer,
                vintage=row.vintage,
                quantity=row.quantity,
                price=row.price or Decimal("0"),
                status="Delivered",
                format=row.format,
                type=row.type,
                region=row.region,
                appellation=row.appellation,
                order_date=today,
            ),
            db=db,
            context=context,
        )
        result.created_wine_ids.append(created.id)
