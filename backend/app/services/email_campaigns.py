"""Vinaris news e-mail campaigns (docs/EMAIL_CAMPAIGNS.md).

Admin-only. The AI composes structured blocks; this module validates them and
renders the only HTML that ever leaves the server, from a fixed template with
every user-visible string escaped. Each recipient gets a personal one-click
unsubscribe link; users who opted out are skipped at send time.
"""

from __future__ import annotations

import hashlib
import hmac
import html
import io
import json
import logging
import re
from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path
from typing import Any
from uuid import UUID

from fastapi import HTTPException, status
from PIL import Image, UnidentifiedImageError
from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.models import (
    EmailAsset,
    EmailCampaign,
    EmailCampaignDelivery,
    Household,
    Membership,
    User,
)
from app.prompts.email_campaign import email_campaign_prompt
from app.services.email import send_email
from app.services.openai_client import create_response

logger = logging.getLogger(__name__)

MAX_BLOCKS = 24
MAX_TEXT = 1200
MAX_UPLOAD_BYTES = 6 * 1024 * 1024
MAX_IMAGE_EDGE = 1600

# Buttons may only open these app locations (the app reads ?open= on load).
APP_PATHS = (
    "/",
    "/?open=cellar",
    "/?open=wishlist",
    "/?open=history",
    "/?open=pulse",
    "/?open=sommelier",
    "/help",
)


@dataclass(frozen=True)
class LibraryShot:
    slug: str
    title_it: str
    title_en: str
    description: str


# Screenshots generated with demo data by frontend/e2e-screenshots (never real
# customer data), served as /email-library/<slug>-<locale>.jpg.
LIBRARY: tuple[LibraryShot, ...] = (
    LibraryShot(
        "home-showcase",
        "La vetrina in home",
        "The home showcase",
        "Home page showcase of the most valuable bottles with photo, producer and value.",
    ),
    LibraryShot(
        "wine-detail",
        "La scheda del vino",
        "The wine page",
        "Wine detail page: italic wine name, vintage, value, rating, the wine's colour "
        "lighting the card.",
    ),
    LibraryShot(
        "drinking-window",
        "La finestra di bevuta",
        "The drinking window",
        "Maturity curve with the ideal drinking period and the current year in gold.",
    ),
    LibraryShot(
        "taste-profile",
        "Il profilo di gusto",
        "The taste profile",
        "Sensory signature wheel showing the user's taste preferences, with a share button.",
    ),
    LibraryShot(
        "diary",
        "Il Diario delle bevute",
        "The tasting diary",
        "Diary of bottles drunk: summary figures, filters and the tasting list.",
    ),
    LibraryShot(
        "wishlist",
        "La wishlist",
        "The wishlist",
        "Wishlist of wines to discover and buy, with offered and maximum price.",
    ),
    LibraryShot(
        "restaurant-list",
        "La carta del ristorante",
        "The restaurant wine list",
        "Restaurant wine-list analysis with the best-fitting picks, glass and bottle prices.",
    ),
    LibraryShot(
        "cellar-stats",
        "Le statistiche della cantina",
        "Cellar statistics",
        "Cellar statistics: value by wine type and by region, bottles per type.",
    ),
    LibraryShot(
        "themes",
        "I temi d'autore",
        "Signature themes",
        "Theme picker with live previews of the four signature themes.",
    ),
)
LIBRARY_BY_SLUG = {shot.slug: shot for shot in LIBRARY}


# ---------------------------------------------------------------- recipients


def eligible_users_query():
    """Approved, unblocked users with at least one real (non-demo) cellar."""
    real_membership = (
        select(Membership.id)
        .join(Household, Household.id == Membership.household_id)
        .where(Membership.user_id == User.id, Household.is_demo.is_(False))
        .exists()
    )
    return select(User).where(
        User.is_approved.is_(True), User.is_blocked.is_(False), real_membership
    )


def search_recipients(db: Session, query: str, limit: int = 200) -> list[User]:
    statement = eligible_users_query()
    term = query.strip()
    if term:
        like = f"%{term.lower()}%"
        statement = statement.where(or_(User.email.ilike(like), User.display_name.ilike(like)))
    return list(db.scalars(statement.order_by(User.display_name, User.email).limit(limit)))


# --------------------------------------------------------------- unsubscribe


def unsubscribe_token(user_id: UUID) -> str:
    message = f"news-unsubscribe:{user_id}".encode()
    return hmac.new(settings.secret_key.encode("utf-8"), message, hashlib.sha256).hexdigest()


def unsubscribe_url(origin: str, user_id: UUID) -> str:
    return f"{origin}/api/v1/email/unsubscribe?user={user_id}&token={unsubscribe_token(user_id)}"


def apply_unsubscribe(db: Session, user_id: str, token: str) -> bool:
    try:
        parsed = UUID(user_id)
    except ValueError:
        return False
    if not hmac.compare_digest(token, unsubscribe_token(parsed)):
        return False
    user = db.get(User, parsed)
    if user is None:
        return False
    user.news_email_opt_out = True
    db.commit()
    return True


# -------------------------------------------------------------------- assets


def asset_storage() -> Path:
    path = Path(settings.email_asset_storage_dir)
    path.mkdir(parents=True, exist_ok=True)
    return path


def store_asset(db: Session, user: User, data: bytes, title: str, description: str) -> EmailAsset:
    if len(data) > MAX_UPLOAD_BYTES:
        raise HTTPException(status.HTTP_413_REQUEST_ENTITY_TOO_LARGE, "Image is too large")
    try:
        image = Image.open(io.BytesIO(data))
        image.load()
    except (UnidentifiedImageError, OSError) as exc:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Unsupported image") from exc
    # Re-encode: validates the file and drops metadata such as GPS position.
    image.thumbnail((MAX_IMAGE_EDGE, MAX_IMAGE_EDGE))
    has_alpha = image.mode in ("RGBA", "LA") or "transparency" in image.info
    output = io.BytesIO()
    if has_alpha:
        image.convert("RGBA").save(output, format="PNG", optimize=True)
        content_type = "image/png"
    else:
        image.convert("RGB").save(output, format="JPEG", quality=85, optimize=True)
        content_type = "image/jpeg"
    asset = EmailAsset(
        created_by_user_id=user.id,
        title=title.strip()[:120] or "Immagine",
        description=description.strip()[:600],
        content_type=content_type,
        width=image.width,
        height=image.height,
    )
    db.add(asset)
    db.flush()
    (asset_storage() / asset_file_name(asset)).write_bytes(output.getvalue())
    db.commit()
    return asset


def asset_file_name(asset: EmailAsset) -> str:
    return f"{asset.id}.{'png' if asset.content_type == 'image/png' else 'jpg'}"


def asset_catalog(db: Session, origin: str, locale: str) -> list[dict[str, str]]:
    shots = [
        {
            "id": f"lib:{shot.slug}",
            "kind": "library",
            "title": shot.title_it if locale == "it" else shot.title_en,
            "description": shot.description,
            "url": library_url(origin, shot.slug, locale),
        }
        for shot in LIBRARY
    ]
    uploads = [
        {
            "id": f"upl:{asset.id}",
            "kind": "upload",
            "title": asset.title,
            "description": asset.description or asset.title,
            "url": f"{origin}/api/v1/email/assets/{asset_file_name(asset)}",
        }
        for asset in db.scalars(select(EmailAsset).order_by(EmailAsset.created_at.desc()).limit(60))
    ]
    return shots + uploads


def library_url(origin: str, slug: str, locale: str) -> str:
    return f"{origin}/email-library/{slug}-{'it' if locale == 'it' else 'en'}.jpg"


# -------------------------------------------------------------------- blocks


def clean_blocks(raw: Any, known_assets: set[str]) -> list[dict[str, str]]:
    """Keep only well-formed blocks; unknown images and paths are dropped or reset."""
    if not isinstance(raw, list):
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Blocks must be a list")
    blocks: list[dict[str, str]] = []
    for item in raw[:MAX_BLOCKS]:
        if not isinstance(item, dict):
            continue
        kind = item.get("type")
        text = str(item.get("text") or "").strip()[:MAX_TEXT]
        if kind in ("heading", "paragraph") and text:
            blocks.append({"type": kind, "text": text})
        elif kind == "image":
            asset_id = str(item.get("asset_id") or "")
            if asset_id in known_assets:
                caption = str(item.get("caption") or "").strip()[:200]
                blocks.append({"type": "image", "asset_id": asset_id, "caption": caption})
        elif kind == "button" and text:
            path = str(item.get("path") or "/")
            blocks.append(
                {"type": "button", "text": text[:60], "path": path if path in APP_PATHS else "/"}
            )
    if not blocks:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "The e-mail has no content")
    return blocks


def known_asset_ids(db: Session) -> set[str]:
    ids = {f"lib:{shot.slug}" for shot in LIBRARY}
    ids.update(f"upl:{asset_id}" for asset_id in db.scalars(select(EmailAsset.id)))
    return ids


def asset_url(db: Session, origin: str, asset_id: str, locale: str) -> str:
    kind, _, value = asset_id.partition(":")
    if kind == "lib" and value in LIBRARY_BY_SLUG:
        return library_url(origin, value, locale)
    if kind == "upl":
        try:
            asset = db.get(EmailAsset, UUID(value))
        except ValueError:
            asset = None
        if asset is not None:
            return f"{origin}/api/v1/email/assets/{asset_file_name(asset)}"
    return ""


# ------------------------------------------------------------------- compose


COMPOSE_SCHEMA: dict[str, Any] = {
    "name": "vinaris_news_email",
    "schema": {
        "type": "object",
        "additionalProperties": False,
        "properties": {
            "subject": {"type": "string"},
            "preheader": {"type": "string"},
            "blocks": {
                "type": "array",
                "items": {
                    "type": "object",
                    "additionalProperties": False,
                    "properties": {
                        "type": {
                            "type": "string",
                            "enum": ["heading", "paragraph", "image", "button"],
                        },
                        "text": {"type": "string"},
                        "asset_id": {"type": "string"},
                        "caption": {"type": "string"},
                        "path": {"type": "string"},
                    },
                    "required": ["type", "text", "asset_id", "caption", "path"],
                },
            },
        },
        "required": ["subject", "preheader", "blocks"],
    },
}


def compose_with_ai(db: Session, origin: str, brief: str, locale: str) -> dict[str, Any]:
    catalog = asset_catalog(db, origin, locale)
    prompt = email_campaign_prompt(
        locale=locale,
        brief=brief,
        assets=[{k: item[k] for k in ("id", "title", "description")} for item in catalog],
        paths=list(APP_PATHS),
    )
    response = create_response(
        "",
        prompt.system,
        prompt.user,
        json_schema=COMPOSE_SCHEMA,
        task_type="email_campaign",
        complexity="balanced",
        reasoning_effort="low",
        max_output_tokens=3000,
    )
    try:
        result = json.loads(response.text)
    except json.JSONDecodeError as exc:
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, "AI returned an invalid e-mail") from exc
    if not isinstance(result, dict):
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, "AI returned an invalid e-mail")
    return {
        "subject": str(result.get("subject") or "").strip()[:160],
        "preheader": str(result.get("preheader") or "").strip()[:200],
        "blocks": clean_blocks(result.get("blocks"), {item["id"] for item in catalog}),
        "model": response.model,
    }


# -------------------------------------------------------------------- render


FIRST_NAME = "{first_name}"

SANS = "font-family:Helvetica,Arial,sans-serif;"
SERIF = "font-family:Georgia,'Times New Roman',serif;"
CARD = (
    "width:100%;max-width:600px;background:#fffdf8;border:1px solid #e4dccb;"
    "border-radius:16px;overflow:hidden;"
)
IMAGE = (
    "display:block;width:100%;max-width:536px;height:auto;"
    "border:1px solid #e4dccb;border-radius:12px;"
)
BUTTON = (
    "display:inline-block;padding:13px 26px;border-radius:999px;background:#245142;"
    f"color:#ffffff;{SANS}font-size:15px;font-weight:bold;text-decoration:none;"
)


def first_name(user: User) -> str:
    return (user.display_name or "").strip().split(" ")[0]


def personalize(text: str, name: str) -> str:
    if FIRST_NAME not in text:
        return text
    if name:
        return text.replace(FIRST_NAME, name)
    # "Ciao {first_name}," without a name reads "Ciao,".
    return re.sub(r"\s*\{first_name\}", "", text)


def render_email(
    db: Session,
    *,
    origin: str,
    locale: str,
    subject: str,
    preheader: str,
    blocks: list[dict[str, str]],
    name: str,
    unsubscribe: str,
) -> tuple[str, str]:
    """HTML and plain text for one recipient. Every dynamic string is escaped."""
    it = locale == "it"
    esc = html.escape
    rows: list[str] = []
    text_lines: list[str] = []
    for block in blocks:
        kind = block["type"]
        if kind == "heading":
            value = personalize(block["text"], name)
            rows.append(
                f'<tr><td style="padding:22px 32px 4px;{SERIF}'
                'font-size:24px;line-height:1.25;font-style:italic;color:#17201c;">'
                f"{esc(value)}</td></tr>"
            )
            text_lines += ["", value.upper(), ""]
        elif kind == "paragraph":
            value = personalize(block["text"], name)
            paragraph = "<br>".join(esc(line) for line in value.splitlines())
            rows.append(
                f'<tr><td style="padding:8px 32px;{SANS}font-size:16px;'
                f'line-height:1.6;color:#3b4741;">{paragraph}</td></tr>'
            )
            text_lines += [value, ""]
        elif kind == "image":
            src = asset_url(db, origin, block["asset_id"], locale)
            if not src:
                continue
            caption = block.get("caption", "")
            rows.append(
                '<tr><td style="padding:14px 32px 6px;">'
                f'<img src="{esc(src, quote=True)}" alt="{esc(caption, quote=True)}" '
                f'width="536" style="{IMAGE}"></td></tr>'
            )
            if caption:
                rows.append(
                    f'<tr><td style="padding:0 32px 10px;{SANS}'
                    f'font-size:13px;color:#7a7466;text-align:center;">{esc(caption)}</td></tr>'
                )
                text_lines += [f"[{caption}]", ""]
        elif kind == "button":
            href = f"{origin}{block['path']}"
            rows.append(
                '<tr><td style="padding:16px 32px;" align="left">'
                f'<a href="{esc(href, quote=True)}" style="{BUTTON}">'
                f"{esc(block['text'])}</a></td></tr>"
            )
            text_lines += [f"{block['text']}: {href}", ""]
    footer = (
        "Ricevi questa email perché hai un account Vinaris."
        if it
        else "You receive this e-mail because you have a Vinaris account."
    )
    unsubscribe_label = (
        "Non vuoi più ricevere le novità? Disiscriviti"
        if it
        else "Don't want Vinaris news any more? Unsubscribe"
    )
    footer_style = (
        f"padding:26px 32px 30px;{SANS}font-size:12px;line-height:1.6;color:#8a8475;"
        "border-top:1px solid #efe8d8;"
    )
    masthead = (
        f"background:#10231d;padding:22px 32px;{SERIF}font-size:20px;"
        "letter-spacing:6px;color:#d7bd6d;"
    )
    document = "\n".join(
        [
            "<!doctype html>",
            f'<html lang="{"it" if it else "en"}"><head><meta charset="utf-8">',
            '<meta name="viewport" content="width=device-width, initial-scale=1">',
            f"<title>{esc(subject)}</title></head>",
            '<body style="margin:0;padding:0;background:#f4efe4;">',
            '<span style="display:none;max-height:0;overflow:hidden;opacity:0;">'
            f"{esc(preheader)}</span>",
            '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" '
            'style="background:#f4efe4;">',
            '<tr><td align="center" style="padding:24px 12px;">',
            '<table role="presentation" width="600" cellpadding="0" cellspacing="0" '
            f'style="{CARD}">',
            f'<tr><td style="{masthead}">VINARIS</td></tr>',
            '<tr><td style="height:2px;background:#c2ac66;line-height:2px;font-size:0;">'
            "&nbsp;</td></tr>",
            "".join(rows),
            f'<tr><td style="{footer_style}">{esc(footer)}<br>',
            f'<a href="{esc(unsubscribe, quote=True)}" style="color:#8a6a2c;">'
            f"{esc(unsubscribe_label)}</a></td></tr>",
            "</table></td></tr></table></body></html>",
        ]
    )
    text = "\n".join(text_lines).strip() + f"\n\n--\n{footer}\n{unsubscribe_label}: {unsubscribe}\n"
    return document, text


def unsubscribe_headers(link: str) -> dict[str, str]:
    # RFC 8058 one-click unsubscribe, required by large mailbox providers.
    return {"List-Unsubscribe": f"<{link}>", "List-Unsubscribe-Post": "List-Unsubscribe=One-Click"}


# ---------------------------------------------------------------------- send


def send_test(
    db: Session,
    *,
    admin: User,
    origin: str,
    locale: str,
    subject: str,
    preheader: str,
    blocks: list[dict[str, str]],
) -> bool:
    link = unsubscribe_url(origin, admin.id)
    document, text = render_email(
        db,
        origin=origin,
        locale=locale,
        subject=subject,
        preheader=preheader,
        blocks=blocks,
        name=first_name(admin),
        unsubscribe=link,
    )
    prefix = "[Prova] " if locale == "it" else "[Test] "
    return send_email(
        recipients=[admin.email],
        subject=prefix + subject,
        body=text,
        html=document,
        headers=unsubscribe_headers(link),
    )


def send_campaign(
    db: Session,
    *,
    admin: User,
    origin: str,
    campaign_id: UUID,
    locale: str,
    subject: str,
    preheader: str,
    blocks: list[dict[str, str]],
    recipient_ids: list[UUID],
) -> EmailCampaign:
    campaign = db.get(EmailCampaign, campaign_id)
    if campaign is None:
        campaign = EmailCampaign(
            id=campaign_id,
            created_by_user_id=admin.id,
            locale=locale,
            subject=subject,
            preheader=preheader,
            blocks=blocks,
            recipient_count=len(set(recipient_ids)),
            created_at=datetime.now(UTC),
        )
        db.add(campaign)
        db.commit()
    elif (
        campaign.created_by_user_id != admin.id
        or campaign.subject != subject
        or campaign.blocks != blocks
        or campaign.locale != locale
    ):
        raise HTTPException(status.HTTP_409_CONFLICT, "This send identifier has already been used")

    done = set(
        db.scalars(
            select(EmailCampaignDelivery.user_id).where(
                EmailCampaignDelivery.campaign_id == campaign.id,
                EmailCampaignDelivery.status.in_(("sent", "skipped")),
            )
        )
    )
    eligible = {
        user.id: user
        for user in db.scalars(eligible_users_query().where(User.id.in_(set(recipient_ids))))
    }
    for user_id in dict.fromkeys(recipient_ids):
        if user_id in done:
            continue
        user = eligible.get(user_id)
        if user is None or user.news_email_opt_out:
            outcome = "skipped"
        else:
            link = unsubscribe_url(origin, user.id)
            document, text = render_email(
                db,
                origin=origin,
                locale=locale,
                subject=subject,
                preheader=preheader,
                blocks=blocks,
                name=first_name(user),
                unsubscribe=link,
            )
            delivered = send_email(
                recipients=[user.email],
                subject=subject,
                body=text,
                html=document,
                headers=unsubscribe_headers(link),
            )
            outcome = "sent" if delivered else "failed"
        delivery = db.scalar(
            select(EmailCampaignDelivery).where(
                EmailCampaignDelivery.campaign_id == campaign.id,
                EmailCampaignDelivery.user_id == user_id,
            )
        )
        if delivery is None:
            db.add(EmailCampaignDelivery(campaign_id=campaign.id, user_id=user_id, status=outcome))
        else:
            delivery.status = outcome
        # Commit per recipient: an interrupted send resumes without duplicates.
        db.commit()

    counts = {"sent": 0, "failed": 0}
    for value in db.scalars(
        select(EmailCampaignDelivery.status).where(EmailCampaignDelivery.campaign_id == campaign.id)
    ):
        if value in counts:
            counts[value] += 1
    campaign.sent_count = counts["sent"]
    campaign.failed_count = counts["failed"]
    campaign.finished_at = datetime.now(UTC)
    db.commit()
    logger.info(
        "Email campaign sent",
        extra={"campaign_id": str(campaign.id), "sent": counts["sent"], "failed": counts["failed"]},
    )
    return campaign
