"""News e-mail campaigns: admin composer endpoints and public unsubscribe/assets."""

from fastapi import APIRouter, Depends, File, Form, HTTPException, Request, UploadFile
from fastapi.responses import FileResponse, HTMLResponse
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import CurrentContext, require_app_admin_context
from app.api.routes.auth import request_origin
from app.db.session import get_db
from app.models import EmailCampaign
from app.schemas.email_campaign import (
    EmailAssetItem,
    EmailCampaignSummary,
    EmailComposeRequest,
    EmailComposeResponse,
    EmailDraft,
    EmailPreviewResponse,
    EmailRecipient,
    EmailSendRequest,
    EmailTestResponse,
)
from app.services import email_campaigns as campaigns

router = APIRouter(prefix="/admin/email-campaigns")
public_router = APIRouter(prefix="/email")


def campaign_admin(context: CurrentContext = Depends(require_app_admin_context)) -> CurrentContext:
    if context.household.is_demo:
        raise HTTPException(status_code=403, detail="Unavailable in demo mode")
    return context


def draft_blocks(db: Session, draft: EmailDraft) -> list[dict[str, str]]:
    return campaigns.clean_blocks(
        [block.model_dump() for block in draft.blocks], campaigns.known_asset_ids(db)
    )


@router.get("/assets", response_model=list[EmailAssetItem])
def assets(
    request: Request,
    locale: str = "it",
    context: CurrentContext = Depends(campaign_admin),
    db: Session = Depends(get_db),
):
    return campaigns.asset_catalog(db, request_origin(request), locale)


@router.post("/assets", response_model=EmailAssetItem)
async def upload_asset(
    request: Request,
    file: UploadFile = File(...),
    title: str = Form(...),
    description: str = Form(""),
    context: CurrentContext = Depends(campaign_admin),
    db: Session = Depends(get_db),
):
    data = await file.read(campaigns.MAX_UPLOAD_BYTES + 1)
    asset = campaigns.store_asset(db, context.user, data, title, description)
    origin = request_origin(request)
    return {
        "id": f"upl:{asset.id}",
        "kind": "upload",
        "title": asset.title,
        "description": asset.description or asset.title,
        "url": f"{origin}/api/v1/email/assets/{campaigns.asset_file_name(asset)}",
    }


@router.get("/recipients", response_model=list[EmailRecipient])
def recipients(
    q: str = "",
    context: CurrentContext = Depends(campaign_admin),
    db: Session = Depends(get_db),
):
    # Global app-admin operation: account identity only, no cellar data.
    return [
        {
            "id": user.id,
            "display_name": user.display_name,
            "email": user.email,
            "locale": user.locale,
            "opted_out": user.news_email_opt_out,
        }
        for user in campaigns.search_recipients(db, q[:120])
    ]


@router.post("/compose", response_model=EmailComposeResponse)
def compose(
    payload: EmailComposeRequest,
    request: Request,
    context: CurrentContext = Depends(campaign_admin),
    db: Session = Depends(get_db),
):
    return campaigns.compose_with_ai(db, request_origin(request), payload.brief, payload.locale)


@router.post("/preview", response_model=EmailPreviewResponse)
def preview(
    payload: EmailDraft,
    request: Request,
    context: CurrentContext = Depends(campaign_admin),
    db: Session = Depends(get_db),
):
    origin = request_origin(request)
    document, text = campaigns.render_email(
        db,
        origin=origin,
        locale=payload.locale,
        subject=payload.subject,
        preheader=payload.preheader,
        blocks=draft_blocks(db, payload),
        name=campaigns.first_name(context.user),
        unsubscribe=campaigns.unsubscribe_url(origin, context.user.id),
    )
    return {"html": document, "text": text}


@router.post("/test", response_model=EmailTestResponse)
def send_test(
    payload: EmailDraft,
    request: Request,
    context: CurrentContext = Depends(campaign_admin),
    db: Session = Depends(get_db),
):
    delivered = campaigns.send_test(
        db,
        admin=context.user,
        origin=request_origin(request),
        locale=payload.locale,
        subject=payload.subject,
        preheader=payload.preheader,
        blocks=draft_blocks(db, payload),
    )
    return {"delivered": delivered, "email": context.user.email}


@router.post("", response_model=EmailCampaignSummary)
def send(
    payload: EmailSendRequest,
    request: Request,
    context: CurrentContext = Depends(campaign_admin),
    db: Session = Depends(get_db),
):
    return campaigns.send_campaign(
        db,
        admin=context.user,
        origin=request_origin(request),
        campaign_id=payload.id,
        locale=payload.locale,
        subject=payload.subject,
        preheader=payload.preheader,
        blocks=draft_blocks(db, payload),
        recipient_ids=payload.recipient_ids,
    )


@router.get("", response_model=list[EmailCampaignSummary])
def history(
    context: CurrentContext = Depends(campaign_admin),
    db: Session = Depends(get_db),
):
    return db.scalars(
        select(EmailCampaign).order_by(EmailCampaign.created_at.desc()).limit(30)
    ).all()


UNSUBSCRIBED_PAGE = """<!doctype html><html lang="it"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1"><title>Vinaris</title></head>
<body style="margin:0;background:#f4efe4;font-family:Helvetica,Arial,sans-serif;color:#3b4741;">
<div style="max-width:480px;margin:12vh auto;padding:32px;background:#fffdf8;
border:1px solid #e4dccb;border-radius:16px;text-align:center;">
<p style="font-family:Georgia,serif;letter-spacing:6px;color:#8a6a2c;">VINARIS</p>
<h1 style="font-family:Georgia,serif;font-weight:normal;font-style:italic;color:#17201c;">{title}</h1>
<p>{body}</p></div></body></html>"""


def unsubscribe_page(ok: bool) -> HTMLResponse:
    if ok:
        title = "Disiscrizione completata · Unsubscribed"
        body = (
            "Non riceverai più le email con le novità di Vinaris. Puoi riattivarle dalle "
            "Impostazioni. · You will no longer receive Vinaris news e-mails; you can turn "
            "them back on in Settings."
        )
    else:
        title = "Link non valido · Invalid link"
        body = (
            "Il link non è valido. Puoi disattivare le email dalle Impostazioni di Vinaris. · "
            "The link is not valid; you can turn the e-mails off in Vinaris Settings."
        )
    return HTMLResponse(
        UNSUBSCRIBED_PAGE.format(title=title, body=body),
        status_code=200 if ok else 400,
    )


@public_router.get("/unsubscribe", response_class=HTMLResponse)
def unsubscribe(user: str = "", token: str = "", db: Session = Depends(get_db)):
    return unsubscribe_page(campaigns.apply_unsubscribe(db, user, token))


@public_router.post("/unsubscribe", response_class=HTMLResponse)
def unsubscribe_one_click(user: str = "", token: str = "", db: Session = Depends(get_db)):
    # RFC 8058: mailbox providers POST to the List-Unsubscribe URL.
    return unsubscribe_page(campaigns.apply_unsubscribe(db, user, token))


@public_router.get("/assets/{file_name}")
def asset_file(file_name: str):
    # Random UUID names; public so mail clients can load campaign images.
    stem, _, extension = file_name.partition(".")
    if (
        extension not in ("jpg", "png")
        or len(stem) != 36
        or not all(char in "0123456789abcdef-" for char in stem)
    ):
        raise HTTPException(status_code=404, detail="Not found")
    path = campaigns.asset_storage() / file_name
    if not path.is_file():
        raise HTTPException(status_code=404, detail="Not found")
    return FileResponse(
        path,
        media_type="image/png" if extension == "png" else "image/jpeg",
        headers={"Cache-Control": "public, max-age=31536000, immutable"},
    )
