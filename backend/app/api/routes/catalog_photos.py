"""App administrators enrich the shared wine catalog from photos (docs/CATALOG_PHOTO_ENRICHMENT.md)."""

from __future__ import annotations

from typing import Literal
from uuid import UUID

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from fastapi.concurrency import run_in_threadpool
from sqlalchemy.orm import Session

from app.api.deps import CurrentContext, require_app_admin_context
from app.core.config import settings
from app.db.session import get_db
from app.schemas.catalog_photo import (
    CatalogPhotoDetailsRequest,
    CatalogPhotoSave,
    CatalogPhotoSaveResult,
    CatalogPhotoScanStatus,
)
from app.services import catalog_photo_details, catalog_photo_scan
from app.services.wine_image_recognition import model_view_image, shelf_photo_sections

router = APIRouter(prefix="/catalog-photos")


def close_up_sections(content: bytes) -> list[catalog_photo_scan.Section]:
    """A close-up photo is read whole, at the size the vision model sees it."""
    image, size = model_view_image(content)
    return [(image, (0.0, 0.0, 1.0, 1.0), size)]


@router.post("/scans", response_model=CatalogPhotoScanStatus, status_code=status.HTTP_202_ACCEPTED)
async def start_catalog_photo_scan(
    images: list[UploadFile] = File(default=[]),
    mode: Literal["shelf", "close"] = Form(default="shelf"),
    context: CurrentContext = Depends(require_app_admin_context),
) -> CatalogPhotoScanStatus:
    """Read the labels on 1-3 photos in the background, then look each wine up in the catalog."""
    if not images:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Image is empty")
    if len(images) > catalog_photo_scan.MAX_PHOTOS:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Too many photos"
        )
    if catalog_photo_scan.running_job_for(context.user.id) is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT, detail="A photo analysis is already running"
        )
    originals: list[bytes] = []
    photos: list[list[catalog_photo_scan.Section]] = []
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
        sections = shelf_photo_sections if mode == "shelf" else close_up_sections
        photos.append(await run_in_threadpool(sections, content))
        originals.append(content)
    job = catalog_photo_scan.start_job(
        household_id=context.household.id,
        user_id=context.user.id,
        session_id=context.session.id,
        mode=mode,
        originals=originals,
        photos=photos,
    )
    return job.snapshot()


@router.get("/scans/{job_id}", response_model=CatalogPhotoScanStatus)
def get_catalog_photo_scan(
    job_id: UUID,
    context: CurrentContext = Depends(require_app_admin_context),
) -> CatalogPhotoScanStatus:
    """Progress of a photo analysis started by this administrator, with its result when done."""
    return own_job(job_id, context).snapshot()


def own_job(job_id: UUID, context: CurrentContext) -> catalog_photo_scan.CatalogPhotoJob:
    job = catalog_photo_scan.get_job(job_id, user_id=context.user.id)
    if job is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Photo analysis not found"
        )
    return job


@router.post(
    "/scans/{job_id}/details",
    response_model=CatalogPhotoScanStatus,
    status_code=status.HTTP_202_ACCEPTED,
)
def research_catalog_photo_details(
    job_id: UUID,
    payload: CatalogPhotoDetailsRequest,
    context: CurrentContext = Depends(require_app_admin_context),
) -> CatalogPhotoScanStatus:
    """Research the base facts of the chosen wines on the web, a few wines per AI call."""
    job = own_job(job_id, context)
    catalog_photo_details.start_details(job, payload.bottles, locale=context.user.locale)
    return job.snapshot()


@router.post("/scans/{job_id}/bottles/{position}", response_model=CatalogPhotoSaveResult)
def save_catalog_photo_bottle(
    job_id: UUID,
    position: int,
    payload: CatalogPhotoSave,
    db: Session = Depends(get_db),
    context: CurrentContext = Depends(require_app_admin_context),
) -> CatalogPhotoSaveResult:
    """Save a reviewed wine to the catalog, its vintage facts and, if good, its bottle photo."""
    return catalog_photo_details.save_bottle(
        db,
        own_job(job_id, context),
        position,
        payload,
        user_id=context.user.id,
        locale=context.user.locale,
    )
