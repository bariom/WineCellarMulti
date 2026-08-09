from __future__ import annotations

from typing import Literal, cast

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.api.deps import CurrentContext, get_current_context, require_app_admin_context
from app.db.session import get_db
from app.models import WineNewsArticle, WineNewsCollectionRun, WineNewsSource
from app.schemas.wine_news import (
    WineNewsArticleResponse,
    WineNewsCategory,
    WineNewsFeedResponse,
)
from app.services.wine_news import latest_collection_time

router = APIRouter(prefix="/wine-pulse")


def article_response(
    article: WineNewsArticle, source: WineNewsSource, locale: Literal["it", "en"]
) -> WineNewsArticleResponse:
    headline = article.headline_it if locale == "it" else article.headline_en
    summary = article.summary_it if locale == "it" else article.summary_en
    return WineNewsArticleResponse(
        id=article.id,
        source=source.name,
        source_url=source.website_url,
        article_url=article.canonical_url,
        published_at=article.source_published_at,
        source_language=article.source_language,
        original_title=article.original_title,
        headline=headline or article.original_title,
        summary=summary,
        category=cast(WineNewsCategory, article.category),
        importance_score=article.importance_score,
        image_url=article.image_url or None,
        ai_generated=bool(article.ai_processed_at),
    )


@router.get("", response_model=WineNewsFeedResponse)
def wine_pulse_feed(
    locale: Literal["it", "en"] = Query(default="it"),
    category: WineNewsCategory | None = Query(default=None),
    limit: int = Query(default=20, ge=1, le=50),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db),
    _: CurrentContext = Depends(get_current_context),
) -> WineNewsFeedResponse:
    filters = [WineNewsArticle.status == "published"]
    if category:
        filters.append(WineNewsArticle.category == category)

    total = int(db.scalar(select(func.count(WineNewsArticle.id)).where(*filters)) or 0)
    rows = db.execute(
        select(WineNewsArticle, WineNewsSource)
        .join(WineNewsSource, WineNewsSource.id == WineNewsArticle.source_id)
        .where(*filters)
        .order_by(
            WineNewsArticle.source_published_at.desc(),
            WineNewsArticle.importance_score.desc(),
        )
        .offset(offset)
        .limit(limit)
    ).all()
    next_offset = offset + len(rows) if offset + len(rows) < total else None
    return WineNewsFeedResponse(
        items=[article_response(article, source, locale) for article, source in rows],
        locale=locale,
        category=category,
        generated_at=latest_collection_time(db),
        total=total,
        offset=offset,
        next_offset=next_offset,
        has_more=next_offset is not None,
    )


@router.get("/status")
def wine_pulse_status(
    db: Session = Depends(get_db),
    _: CurrentContext = Depends(require_app_admin_context),
) -> dict[str, object]:
    latest = db.scalar(
        select(WineNewsCollectionRun).order_by(WineNewsCollectionRun.started_at.desc()).limit(1)
    )
    source_rows = db.scalars(select(WineNewsSource).order_by(WineNewsSource.name)).all()
    return {
        "latest_run": {
            "started_at": latest.started_at.isoformat(),
            "completed_at": latest.completed_at.isoformat() if latest.completed_at else None,
            "status": latest.status,
            "stats": latest.stats,
            "error": latest.error,
        }
        if latest
        else None,
        "published": int(
            db.scalar(
                select(func.count(WineNewsArticle.id)).where(WineNewsArticle.status == "published")
            )
            or 0
        ),
        "sources": [
            {
                "id": source.id,
                "name": source.name,
                "language": source.language,
                "enabled": source.enabled,
                "last_success_at": source.last_success_at.isoformat()
                if source.last_success_at
                else None,
                "last_error": source.last_error,
            }
            for source in source_rows
        ],
    }
