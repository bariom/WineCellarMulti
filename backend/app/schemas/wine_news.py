from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, Field

WineNewsCategory = Literal[
    "wine_world",
    "regions_vintages",
    "producers",
    "market",
    "climate_vineyards",
    "events_awards",
]


class WineNewsArticleResponse(BaseModel):
    id: UUID
    source: str
    source_url: str
    article_url: str
    published_at: datetime
    source_language: str
    original_title: str
    headline: str
    summary: str
    category: WineNewsCategory
    importance_score: int = Field(ge=0, le=100)
    image_url: str | None = None
    ai_generated: bool = True


class WineNewsFeedResponse(BaseModel):
    items: list[WineNewsArticleResponse]
    locale: Literal["it", "en"]
    category: WineNewsCategory | None = None
    generated_at: datetime | None = None
    total: int = 0
    offset: int = 0
    next_offset: int | None = None
    has_more: bool = False
