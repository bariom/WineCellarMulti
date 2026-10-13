import hashlib
from decimal import Decimal
from uuid import UUID, uuid4

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, Response, UploadFile
from fastapi.concurrency import run_in_threadpool
from fastapi.responses import FileResponse
from pydantic import ValidationError
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import CurrentContext, get_current_context, require_write_context
from app.core.config import settings
from app.db.session import get_db
from app.models import Household, PurchaseDocumentWine, PurchaseImport, Wine
from app.prompts.purchase_import import purchase_import_prompt
from app.schemas.purchase_import import (
    PendingPurchase,
    PurchaseConfirmation,
    PurchaseDocumentResponse,
    PurchaseExtraction,
    PurchaseMatch,
    PurchasePhotoSuggestion,
    PurchasePreview,
    PurchaseResult,
)
from app.services.ai_credits import ai_credit_balance
from app.services.free_tier import is_free_tier
from app.services.openai_client import parse_json_response
from app.services.purchase_documents import archive_document, document_path
from app.services.purchase_import import (
    MAX_DOCUMENT_BYTES,
    apply_purchase,
    fill_purchase_producers_from_catalog,
    purchase_document,
    purchase_photo_suggestions,
    scoped_purchase,
    separate_purchase_origins_from_catalog,
)

router = APIRouter(prefix="/imports/purchases")


def extraction_schema() -> dict:
    schema = PurchaseExtraction.model_json_schema()

    # OpenAI strict schemas require every field, including nullable fields.
    def strict(node):
        if isinstance(node, dict):
            # Pydantic Decimal validation schemas contain string regexes with
            # lookaheads. Use JSON numbers for provider output; keep Decimal's
            # precision/range checks on the parsed result and confirmation.
            for name, child in node.get("properties", {}).items():
                if name in {"unit_price", "line_total", "document_total", "additional_costs"}:
                    number = next(
                        value for value in child["anyOf"] if value.get("type") == "number"
                    )
                    child["anyOf"] = [number, {"type": "null"}]
            if node.get("type") == "object":
                node["additionalProperties"] = False
                node["required"] = list(node.get("properties", {}))
            for value in node.values():
                strict(value)
        elif isinstance(node, list):
            for value in node:
                strict(value)

    strict(schema)
    return {"name": "purchase_import", "schema": schema}


def preview(
    db: Session, context: CurrentContext, record: PurchaseImport, cost=Decimal("0"), *, locale="it"
):
    extraction = PurchaseExtraction.model_validate(record.draft)
    separate_purchase_origins_from_catalog(db, extraction, locale=locale)
    fill_purchase_producers_from_catalog(db, extraction)
    wines = list(db.scalars(select(Wine).where(Wine.household_id == context.household.id)))

    def key(value):
        return " ".join(value.casefold().split())

    matches = [
        [
            PurchaseMatch(
                id=w.id,
                name=w.name,
                producer=w.producer,
                vintage=w.vintage,
                format=w.format,
                currency=w.currency,
                has_photo=bool(w.photo_version),
            )
            for w in wines
            if key(w.name) == key(row.name)
            and key(w.producer) == key(row.producer)
            and w.vintage == row.vintage
        ][:10]
        for row in extraction.rows
    ]
    return PurchasePreview(
        id=record.id,
        status=record.status,
        extraction=extraction,
        matches=matches,
        estimated_cost_usd=cost,
    )


@router.get("/photo-suggestions", response_model=list[PurchasePhotoSuggestion])
def suggest_purchase_photos(
    name: str = Query(min_length=2, max_length=200),
    producer: str = Query(min_length=1, max_length=200),
    db: Session = Depends(get_db),
    _: CurrentContext = Depends(require_write_context),
):
    return purchase_photo_suggestions(db, name, producer)


def document_links(db: Session, context: CurrentContext) -> dict[UUID, set[UUID]]:
    links: dict[UUID, set[UUID]] = {}
    for purchase_id, wine_id in db.execute(
        select(PurchaseDocumentWine.purchase_import_id, PurchaseDocumentWine.wine_id)
        .join(Wine, Wine.id == PurchaseDocumentWine.wine_id)
        .where(
            PurchaseDocumentWine.household_id == context.household.id,
            Wine.household_id == context.household.id,
        )
    ):
        links.setdefault(purchase_id, set()).add(wine_id)
    return links


@router.get("/documents", response_model=list[PurchaseDocumentResponse])
def list_purchase_documents(
    wine_id: UUID | None = None,
    unlinked_only: bool = False,
    db: Session = Depends(get_db),
    context: CurrentContext = Depends(get_current_context),
):
    if wine_id and not db.scalar(
        select(Wine.id).where(Wine.id == wine_id, Wine.household_id == context.household.id)
    ):
        raise HTTPException(404, "Wine not found")
    links = document_links(db, context)
    records = db.scalars(
        select(PurchaseImport)
        .where(
            PurchaseImport.household_id == context.household.id,
            PurchaseImport.document_size > 0,
        )
        .order_by(PurchaseImport.created_at.desc())
    )
    return [
        PurchaseDocumentResponse(
            id=r.id,
            filename=r.document_name,
            mime=r.document_mime,
            size=r.document_size,
            supplier=str(r.confirmed.get("supplier") or r.draft.get("supplier") or ""),
            reference=str(r.confirmed.get("reference") or r.draft.get("reference") or ""),
            status=r.status,
            wine_count=len(links.get(r.id, set())),
            url=f"/api/v1/imports/purchases/{r.id}/document",
        )
        for r in records
        if (not wine_id or wine_id in links.get(r.id, set()))
        and (not unlinked_only or not links.get(r.id))
        and document_path(r).is_file()
    ]


@router.get("/{import_id}/document", response_class=FileResponse)
def read_purchase_document(
    import_id: UUID,
    download: bool = False,
    db: Session = Depends(get_db),
    context: CurrentContext = Depends(get_current_context),
):
    record = scoped_purchase(db, context, import_id)
    path = document_path(record)
    if not record.document_size or not path.is_file():
        raise HTTPException(404, "Document not available")
    return FileResponse(
        path,
        media_type=record.document_mime,
        filename=record.document_name,
        content_disposition_type="attachment" if download else "inline",
        headers={"Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff"},
    )


@router.delete("/{import_id}/document", status_code=204)
def delete_purchase_document(
    import_id: UUID,
    only_unlinked: bool = False,
    db: Session = Depends(get_db),
    context: CurrentContext = Depends(require_write_context),
):
    db.scalar(select(Household.id).where(Household.id == context.household.id).with_for_update())
    record = scoped_purchase(db, context, import_id)
    if only_unlinked and document_links(db, context).get(record.id):
        raise HTTPException(409, "Document is still linked to wines")
    try:
        document_path(record).unlink(missing_ok=True)
    except OSError as exc:
        raise HTTPException(503, "Document could not be deleted; please retry") from exc
    record.document_name = ""
    record.document_mime = ""
    record.document_size = 0
    db.commit()
    return Response(status_code=204)


def analyze(content: bytes, mime: str, locale: str, db: Session, context: CurrentContext):
    from app.api.routes.ai import (
        create_ai_response,
        get_or_create_user_ai_settings,
        record_ai_audit,
    )

    document = purchase_document(content, mime)
    digest = hashlib.sha256(content).hexdigest()
    existing = db.scalar(
        select(PurchaseImport).where(
            PurchaseImport.household_id == context.household.id,
            PurchaseImport.document_hash == digest,
        )
    )
    if existing:
        return preview(db, context, existing, locale=locale)
    prompt = purchase_import_prompt(locale=locale, document_text=document.text)
    response, provider = create_ai_response(
        db,
        context,
        get_or_create_user_ai_settings(db, context),
        model=settings.openai_economy_model,
        system_prompt=prompt.system,
        user_prompt=prompt.user,
        json_schema=extraction_schema(),
        input_images=document.images,
        input_files=document.files,
        task_type="structured_extraction",
        app_funded=True,
        max_output_tokens=12000,
        timeout_seconds=90,
    )

    def audit(entity_id: UUID, summary: str) -> None:
        record_ai_audit(
            db,
            context,
            entity_type="purchase_import",
            entity_id=entity_id,
            feature=f"{prompt.id}@{prompt.version}",
            model=response.model or settings.openai_economy_model,
            summary=summary,
            usage=response.usage,
            provider_source=provider,
        )

    # Credit reconciliation may commit: acquire the lock only after the provider returns.
    db.scalar(select(Household.id).where(Household.id == context.household.id).with_for_update())
    existing = db.scalar(
        select(PurchaseImport).where(
            PurchaseImport.household_id == context.household.id,
            PurchaseImport.document_hash == digest,
        )
    )
    if existing:
        audit(existing.id, "Concurrent purchase extraction reused the existing review")
        db.commit()
        return preview(db, context, existing, response.charged_cost_usd, locale=locale)
    try:
        if response.incomplete:
            raise ValueError("Incomplete purchase")
        extraction = PurchaseExtraction.model_validate(parse_json_response(response.text))
    except (ValidationError, ValueError, HTTPException) as exc:
        audit(uuid4(), "Purchase extraction rejected: invalid or incomplete structured result")
        db.commit()
        raise HTTPException(
            422,
            "The document could not be read reliably. Try a clearer photo or a smaller document.",
        ) from exc
    record = PurchaseImport(
        household_id=context.household.id,
        created_by_user_id=context.user.id,
        document_hash=digest,
        draft=extraction.model_dump(mode="json"),
    )
    db.add(record)
    db.flush()
    audit(record.id, "Purchase document extraction for review")
    db.commit()
    charged_cost = response.charged_cost_usd if provider == "credits" else Decimal("0")
    return preview(db, context, record, charged_cost, locale=locale)


@router.post("/preview", response_model=PurchasePreview)
async def analyze_purchase(
    document: UploadFile = File(...),
    locale: str = Form("it", pattern="^(it|en)$"),
    db: Session = Depends(get_db),
    context: CurrentContext = Depends(require_write_context),
):
    content = await document.read(MAX_DOCUMENT_BYTES + 1)
    if is_free_tier(context) and ai_credit_balance(db, context.user) <= 0:
        previous = db.scalar(
            select(PurchaseImport.id).where(
                PurchaseImport.household_id == context.household.id,
                PurchaseImport.document_hash == hashlib.sha256(content).hexdigest(),
            )
        )
        if not previous:
            raise HTTPException(402, "An AI Pack is required on the free tier")
    result = await run_in_threadpool(
        analyze, content, document.content_type or "", locale, db, context
    )
    try:
        archive_document(
            db,
            scoped_purchase(db, context, result.id),
            content,
            document.content_type or "",
            document.filename or "document",
        )
    except OSError as exc:
        raise HTTPException(
            503,
            "Document could not be archived; retry the same upload without repeating AI analysis",
        ) from exc
    return result


@router.get("/pending", response_model=list[PendingPurchase])
def pending_purchases(
    db: Session = Depends(get_db), context: CurrentContext = Depends(require_write_context)
):
    records = db.scalars(
        select(PurchaseImport)
        .where(
            PurchaseImport.household_id == context.household.id, PurchaseImport.status == "pending"
        )
        .order_by(PurchaseImport.created_at.desc())
    )
    return [
        PendingPurchase(
            id=r.id,
            supplier=r.confirmed["supplier"],
            reference=r.confirmed["reference"],
            expected_delivery=r.confirmed.get("expected_delivery"),
            bottles=r.result["bottles"],
        )
        for r in records
    ]


@router.post("/{import_id}/confirm", response_model=PurchaseResult)
def confirm_purchase(
    import_id: UUID,
    payload: PurchaseConfirmation,
    db: Session = Depends(get_db),
    context: CurrentContext = Depends(require_write_context),
):
    try:
        db.scalar(
            select(Household.id).where(Household.id == context.household.id).with_for_update()
        )
        result = apply_purchase(db, context, scoped_purchase(db, context, import_id), payload)
        db.commit()
        return result
    except Exception:
        db.rollback()
        raise


@router.post("/{import_id}/receive", response_model=PurchaseResult)
def receive_purchase(
    import_id: UUID,
    db: Session = Depends(get_db),
    context: CurrentContext = Depends(require_write_context),
):
    try:
        db.scalar(
            select(Household.id).where(Household.id == context.household.id).with_for_update()
        )
        record = scoped_purchase(db, context, import_id)
        if record.status == "draft":
            raise HTTPException(409, "Confirm the purchase first")
        result = apply_purchase(
            db,
            context,
            record,
            PurchaseConfirmation.model_validate(record.confirmed),
            receiving=True,
        )
        db.commit()
        return result
    except Exception:
        db.rollback()
        raise
