import hashlib
from decimal import Decimal
from uuid import UUID, uuid4

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from fastapi.concurrency import run_in_threadpool
from pydantic import ValidationError
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import CurrentContext, require_write_context
from app.core.config import settings
from app.db.session import get_db
from app.models import Household, PurchaseImport, Wine
from app.prompts.purchase_import import purchase_import_prompt
from app.schemas.purchase_import import (
    PendingPurchase,
    PurchaseConfirmation,
    PurchaseExtraction,
    PurchaseMatch,
    PurchasePreview,
    PurchaseResult,
)
from app.services.openai_client import parse_json_response
from app.services.purchase_import import (
    MAX_DOCUMENT_BYTES,
    apply_purchase,
    purchase_document,
    scoped_purchase,
)

router = APIRouter(prefix="/imports/purchases")


def extraction_schema() -> dict:
    schema = PurchaseExtraction.model_json_schema()

    # OpenAI strict schemas require every field, including nullable fields.
    def strict(node):
        if isinstance(node, dict):
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


def preview(db: Session, context: CurrentContext, record: PurchaseImport, cost=Decimal("0")):
    extraction = PurchaseExtraction.model_validate(record.draft)
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


def analyze(content: bytes, mime: str, locale: str, db: Session, context: CurrentContext):
    from app.api.routes.ai import (
        create_ai_response,
        get_or_create_user_ai_settings,
        record_ai_audit,
    )

    images, files = purchase_document(content, mime)
    digest = hashlib.sha256(content).hexdigest()
    existing = db.scalar(
        select(PurchaseImport).where(
            PurchaseImport.household_id == context.household.id,
            PurchaseImport.document_hash == digest,
        )
    )
    if existing:
        return preview(db, context, existing)
    prompt = purchase_import_prompt(locale=locale)
    response, provider = create_ai_response(
        db,
        context,
        get_or_create_user_ai_settings(db, context),
        model=settings.openai_economy_model,
        system_prompt=prompt.system,
        user_prompt=prompt.user,
        json_schema=extraction_schema(),
        input_images=images,
        input_files=files,
        task_type="structured_extraction",
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
        return preview(db, context, existing, response.charged_cost_usd)
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
    return preview(db, context, record, response.charged_cost_usd)


@router.post("/preview", response_model=PurchasePreview)
async def analyze_purchase(
    document: UploadFile = File(...),
    locale: str = Form("it", pattern="^(it|en)$"),
    db: Session = Depends(get_db),
    context: CurrentContext = Depends(require_write_context),
):
    if not context.user.can_use_label_recognition and not context.user.is_app_admin:
        raise HTTPException(403, "Document recognition is not enabled for this user")
    content = await document.read(MAX_DOCUMENT_BYTES + 1)
    return await run_in_threadpool(
        analyze, content, document.content_type or "", locale, db, context
    )


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
