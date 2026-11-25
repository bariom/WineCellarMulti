"""Prompt context builders and AI-result cleanup shared by the AI routes.

Pure helpers: they turn wines, wishlist items and market sources into prompt
context, and validate/clean structured AI output. They make no AI calls and
run no queries of their own.
"""

from __future__ import annotations

import re
from datetime import UTC, datetime
from decimal import Decimal, InvalidOperation
from typing import Any, cast
from urllib.parse import urlsplit
from uuid import UUID

from app.models import Wine, WishlistItem
from app.schemas.ai import (
    BuyingRecommendation,
    PairingCellarMatch,
    PairingDishRecommendation,
    PairingMarketWine,
    PairingResponse,
)
from app.services.valuation_market import market_instruction, source_matches_market

PAIRING_MAX_CANDIDATES = 25


def clip_summary(value: str, limit: int = 900) -> str:
    text = " ".join(str(value or "").split())
    return text[:limit]


def wine_market_context(wine: Wine) -> str:
    """Identity and attributes needed to find an exact market listing."""
    return "\n".join(
        [
            f"Name: {wine.name}",
            f"Producer: {wine.producer}",
            f"Vintage: {wine.vintage}",
            f"Format: {wine.format}",
            f"Region: {wine.region}",
            f"Appellation: {wine.appellation}",
        ],
    )


def wine_lookup_context(wine: Wine | WishlistItem) -> str:
    """Keep web lookups focused on wine identity, not cellar metadata."""
    return "\n".join(
        [
            f"Name: {wine.name}",
            f"Producer: {wine.producer}",
            f"Vintage: {wine.vintage}",
        ],
    )


def compare_wine_context(wine: Wine) -> str:
    return "\n".join(
        [
            f"Name: {wine.name}",
            f"Producer: {wine.producer}",
            f"Vintage: {wine.vintage}",
            f"Type: {wine.type}",
            f"Format: {wine.format}",
            f"Region: {wine.region}",
            f"Appellation: {wine.appellation}",
            f"Current value: {wine.currency} {wine.current_value}"
            if wine.current_value is not None
            else "Current value: unknown",
            f"Drink window: {wine.drink_from}-{wine.drink_to}"
            if wine.drink_from or wine.drink_to
            else "Drink window: unknown",
        ],
    )


def replace_compare_placeholders(text: str, first_name: str, second_name: str) -> str:
    result = text or ""
    replacements = [
        (r"\bWINE A\b", first_name),
        (r"\bWINE B\b", second_name),
        (r"\bWine A\b", first_name),
        (r"\bWine B\b", second_name),
        (r"\bA vs B\b", f"{first_name} vs {second_name}"),
        (r"\bB vs A\b", f"{second_name} vs {first_name}"),
        (
            r"\bA(?=\s+(?:è|is|looks|seems|feels|fits|works|goes|suits|va|sembra|appare|resta|rimane|può|can|should))",
            first_name,
        ),
        (
            r"\bB(?=\s+(?:è|is|looks|seems|feels|fits|works|goes|suits|va|sembra|appare|resta|rimane|può|can|should))",
            second_name,
        ),
    ]
    for pattern, replacement in replacements:
        result = re.sub(pattern, replacement, result)
    return result


def wishlist_advice_context(item: WishlistItem) -> str:
    """Decision fields for strategy and purpose, excluding generated prose."""
    investment_amount = getattr(item, "investment_amount", None)
    return "\n".join(
        [
            f"Name: {item.name}",
            f"Producer: {item.producer}",
            f"Vintage: {item.vintage}",
            f"Type: {item.type}",
            f"Region: {item.region}",
            f"Appellation: {item.appellation}",
            f"Target price: {item.currency} {item.target_price} (maximum)"
            if item.target_price and item.target_price > 0
            else "Target price: not provided",
            f"Offer price: {item.currency} {getattr(item, 'offer_price', None)}"
            if getattr(item, "offer_price", None) is not None
            else "Offer price: not provided",
            f"Investment budget: {item.currency} {investment_amount} (total planned capital for this item)"
            if investment_amount is not None and investment_amount > 0
            else "Investment budget: not provided",
            f"Priority: {item.priority}",
            f"Purpose: {item.purpose}",
            f"Status: {item.status}",
            f"Notes: {item.notes}",
            f"AI context note: {item.ai_context_note}",
        ],
    )


def wishlist_market_context(item: WishlistItem, *, include_ai_context: bool = False) -> str:
    """Identity and target price needed for an exact wishlist market lookup."""
    return "\n".join(
        [
            f"Name: {item.name}",
            f"Producer: {item.producer}",
            f"Vintage: {item.vintage}",
            f"Format: {item.format}",
            f"Region: {item.region}",
            f"Appellation: {item.appellation}",
            f"Target price: {item.currency} {item.target_price} (maximum)"
            if item.target_price and item.target_price > 0
            else "Target price: not provided",
            f"Offer price: {item.currency} {getattr(item, 'offer_price', None)}"
            if getattr(item, "offer_price", None) is not None
            else "Offer price: not provided",
            *([f"AI context note: {item.ai_context_note}"] if include_ai_context else []),
        ],
    )


def wishlist_priority_rank(priority: str) -> int:
    normalized = str(priority or "").strip().lower()
    if "high" in normalized or "alta" in normalized:
        return 0
    if "medium" in normalized or "media" in normalized:
        return 1
    if "low" in normalized or "bassa" in normalized:
        return 2
    return 3


def wishlist_ready_to_buy(status: str) -> bool:
    normalized = str(status or "").strip().lower()
    return any(
        word in normalized
        for word in ["buy", "ready", "approved", "compra", "acquista", "pronto", "approvato"]
    )


def wishlist_portfolio_context(items: list[WishlistItem], household_name: str) -> str:
    sorted_items = sorted(
        items,
        key=lambda item: (
            wishlist_priority_rank(item.priority),
            -float(item.target_price or 0),
            item.name.lower(),
        ),
    )
    high_priority_count = sum(1 for item in items if wishlist_priority_rank(item.priority) == 0)
    ready_to_buy_count = sum(1 for item in items if wishlist_ready_to_buy(item.status))
    total_target_value = sum((Decimal(str(item.target_price or 0)) for item in items), Decimal("0"))
    investment_totals: dict[str, Decimal] = {}
    for item in items:
        investment_amount = getattr(item, "investment_amount", None)
        if investment_amount is None or investment_amount <= 0:
            continue
        currency = (item.currency or "CHF").upper()
        investment_totals[currency] = investment_totals.get(currency, Decimal("0")) + Decimal(
            str(investment_amount)
        )
    declared_investment = (
        ", ".join(
            f"{currency} {amount.quantize(Decimal('0.01'))}"
            for currency, amount in sorted(investment_totals.items())
        )
        if investment_totals
        else "not provided"
    )
    lines = [
        f"Household: {household_name}",
        f"Wishlist items: {len(items)}",
        f"High priority items: {high_priority_count}",
        f"Ready to buy items: {ready_to_buy_count}",
        f"Total target value: CHF {total_target_value.quantize(Decimal('0.01'))}",
        f"Declared investment capital: {declared_investment}",
        "",
        "Wishlist portfolio:",
    ]
    for index, item in enumerate(sorted_items[:40], start=1):
        target_ceiling = (
            f"{item.currency} {Decimal(str(item.target_price)).quantize(Decimal('0.01'))}"
            if item.target_price and item.target_price > 0
            else "not provided"
        )
        offer_price = (
            f"{item.currency} {item.offer_price}" if item.offer_price is not None else "unknown"
        )
        investment_amount = getattr(item, "investment_amount", None)
        investment_budget = (
            f"{item.currency} {Decimal(str(investment_amount)).quantize(Decimal('0.01'))}"
            if investment_amount is not None and investment_amount > 0
            else "not provided"
        )
        lines.extend(
            [
                (
                    f"{index}. {item.name} | Producer: {item.producer or 'Unknown'} | Vintage: {item.vintage or 'n/d'} | "
                    f"Target ceiling: {target_ceiling} | Offer: {offer_price} | Investment budget: {investment_budget} | "
                    f"Priority: {item.priority or 'Unknown'} | Purpose: {item.purpose or 'Unknown'} | Status: {item.status or 'Unknown'}"
                ),
                f"   Region/Appellation: {item.region or 'n/d'} / {item.appellation or 'n/d'}",
                f"   Market estimate: {item.ai_market_price_currency or item.currency} {item.ai_market_price}"
                if item.ai_market_price
                else "   Market estimate: unknown",
                f"   AI context note: {item.ai_context_note or 'none'}",
            ],
        )
    if len(sorted_items) > 40:
        lines.append(
            f"... {len(sorted_items) - 40} more items omitted from the detailed list, but included in the summary counts."
        )
    return "\n".join(lines)


def normalize_market_sources(
    raw_sources: Any, *, default_currency: str, require_url: bool = False
) -> list[dict]:
    if not isinstance(raw_sources, list):
        return []
    normalized: list[dict] = []
    for raw_source in raw_sources[:12]:
        if not isinstance(raw_source, dict):
            continue
        if is_hospitality_market_source(raw_source):
            continue
        merchant = str(
            raw_source.get("merchant") or raw_source.get("source") or raw_source.get("name") or ""
        ).strip()[:160]
        if not merchant:
            continue
        try:
            price = Decimal(str(raw_source.get("price"))).quantize(Decimal("0.01"))
        except (InvalidOperation, TypeError, ValueError):
            continue
        if not price.is_finite() or price < Decimal("0"):
            continue
        url = str(raw_source.get("url") or raw_source.get("link") or "").strip()[:500]
        try:
            parsed_url = urlsplit(url)
            valid_url = parsed_url.scheme.lower() in {"http", "https"} and bool(parsed_url.hostname)
        except ValueError:
            valid_url = False
        if require_url and not valid_url:
            continue
        if not valid_url:
            url = ""
        note = str(raw_source.get("note") or "").strip()[:240]
        bottle_count = market_source_lot_bottle_count(raw_source, note=note)
        listed_price = price
        if bottle_count > 1:
            price = (price / Decimal(bottle_count)).quantize(Decimal("0.01"))
        normalized_source = {
            "kind": "market_source",
            "merchant": merchant,
            "country": str(raw_source.get("country") or "").strip()[:80],
            "price": str(price),
            "currency": str(raw_source.get("currency") or default_currency or "").strip()[:8]
            or default_currency,
            "url": url,
            "note": note,
            "verified": bool(url),
        }
        if bottle_count > 1:
            normalized_source["bottle_count"] = bottle_count
            normalized_source["listed_price"] = str(listed_price)
        try:
            converted_price = Decimal(str(raw_source.get("price_in_output_currency"))).quantize(
                Decimal("0.01")
            )
        except (InvalidOperation, TypeError, ValueError):
            converted_price = None
        if converted_price is not None and converted_price.is_finite() and converted_price >= 0:
            if bottle_count > 1:
                normalized_source["listed_price_in_output_currency"] = str(converted_price)
                converted_price = (converted_price / Decimal(bottle_count)).quantize(
                    Decimal("0.01")
                )
            normalized_source["price_in_output_currency"] = str(converted_price)
        normalized.append(normalized_source)
    return normalized


def market_source_lot_bottle_count(raw_source: dict[str, Any], *, note: str) -> int:
    """Return a listing's bottle count only when the source clearly describes a lot total."""
    raw_count = raw_source.get("bottle_count")
    try:
        explicit_count = int(str(raw_count)) if raw_count is not None else 1
    except (TypeError, ValueError):
        explicit_count = 1
    if 2 <= explicit_count <= 100:
        return explicit_count

    searchable = " ".join(str(value or "") for value in (raw_source.get("title"), note)).casefold()
    bottle_word = r"(?:bottigli(?:a|e)|bottles?|bouteilles?|flaschen?)"
    lot_word = r"(?:lotto|lot|case|pack|box|carton|cassa|confezione|coffret|kiste|karton)"
    patterns = (
        rf"\b{lot_word}\s+(?:[^\d]{{0,16}})?(\d{{1,3}})\s*(?:x\s*)?{bottle_word}\b",
        rf"\b(\d{{1,3}})\s*(?:x\s*)?{bottle_word}\b[^.]{{0,80}}\b(?:total(?:e|i)?|complessiv[oi]|overall|gesamt|au total)\b",
    )
    for pattern in patterns:
        match = re.search(pattern, searchable)
        if match:
            count = int(match.group(1))
            if 2 <= count <= 100:
                return count
    return 1


def is_hospitality_market_source(raw_source: dict[str, Any]) -> bool:
    searchable = " ".join(
        str(raw_source.get(key) or "")
        for key in ("merchant", "source", "name", "title", "url", "link", "note")
    ).casefold()
    hospitality_markers = (
        "restaurant",
        "ristorante",
        "trattoria",
        "osteria",
        "brasserie",
        "room service",
        "room-service",
        "catering",
        "wine list",
        "wine-list",
        "carta dei vini",
        "carte des vins",
        "weinkarte",
        "drink menu",
        "beverage menu",
        "pairing menu",
        "menu degustazione",
        "by the glass",
        "by-the-glass",
        "al calice",
        "prix restaurant",
    )
    if any(marker in searchable for marker in hospitality_markers):
        return True
    return any(marker in searchable for marker in ("hotel", "resort")) and any(
        marker in searchable for marker in ("menu", "wine", "restaurant", "bar")
    )


def contains_hospitality_market_sources(raw_sources: Any) -> bool:
    return isinstance(raw_sources, list) and any(
        isinstance(source, dict) and is_hospitality_market_source(source) for source in raw_sources
    )


def median_retail_source_price(market_sources: list[dict], *, currency: str) -> Decimal | None:
    target_currency = str(currency or "").strip().upper()
    prices = sorted(
        Decimal(str(source["price"]))
        for source in market_sources
        if str(source.get("currency") or "").strip().upper() == target_currency
    )
    if not prices:
        return None
    middle = len(prices) // 2
    if len(prices) % 2:
        return prices[middle].quantize(Decimal("0.01"))
    return ((prices[middle - 1] + prices[middle]) / Decimal("2")).quantize(Decimal("0.01"))


def local_market_source_price(
    market_sources: list[dict], *, currency: str, market_country: str
) -> Decimal | None:
    """Return the local-source median in the output currency, excluding foreign listings."""
    if not market_country:
        return None
    target_currency = str(currency or "").strip().upper()
    prices: list[Decimal] = []
    for source in market_sources:
        if not source_matches_market(str(source.get("country") or ""), market_country):
            continue
        source_currency = str(source.get("currency") or "").strip().upper()
        raw_price = (
            source.get("price")
            if source_currency == target_currency
            else source.get("price_in_output_currency")
        )
        try:
            price = Decimal(str(raw_price)).quantize(Decimal("0.01"))
        except (InvalidOperation, TypeError, ValueError):
            continue
        if price.is_finite() and price >= 0:
            prices.append(price)
    if not prices:
        return None
    prices.sort()
    middle = len(prices) // 2
    if len(prices) % 2:
        return prices[middle]
    return ((prices[middle - 1] + prices[middle]) / Decimal("2")).quantize(Decimal("0.01"))


def web_search_source_entries(web_sources: tuple[dict[str, str], ...]) -> list[dict]:
    entries: list[dict] = []
    for source in web_sources[:12]:
        url = str(source.get("url") or "").strip()[:500]
        if not url:
            continue
        entries.append(
            {
                "kind": "web_search_source",
                "url": url,
                "title": str(source.get("title") or "").strip()[:200],
            },
        )
    return entries


def value_currency_instruction(currency: str, market_country: str = "") -> str:
    target_currency = (currency or "CHF").strip().upper()[:8]
    return (
        f"Return the final estimate in {target_currency}. "
        f"If a source is listed in EUR, USD, GBP, or another currency, convert it mentally to {target_currency} before setting the final estimate and mention the conversion basis in market_note. "
        "Do not average raw prices across different currencies. "
        "Use the user's purchase or target price only as a comparison reference, never as an anchor for the market estimate. "
        "Prioritize exact matches for producer, cuvee/name, vintage, bottle format, and region/appellation. "
        "Do not use generic category comparables such as 'similar Barbaresco' unless no exact source is available; if you must use comparables, say so clearly in market_note and keep confidence lower. "
        "Use live web search. Prefer real retailer or marketplace listings with a URL; do not invent source URLs or quote source names as exact listings if you cannot identify a concrete listing. "
        + market_instruction(market_country)
    )


def market_note_source(note: Any) -> dict | None:
    text = clip_summary(str(note or ""), limit=500).strip()
    if not text:
        return None
    return {"kind": "market_note", "text": text}


def pairing_wine_context(wine: Wine) -> dict:
    grapes = [
        str(grape.get("name") or "").strip()
        for grape in wine.grapes
        if isinstance(grape, dict) and str(grape.get("name") or "").strip()
    ]
    return {
        "id": str(wine.id),
        "name": wine.name,
        "producer": wine.producer,
        "vintage": wine.vintage,
        "type": wine.type,
        "region": wine.region,
        "appellation": wine.appellation,
        "value": str(wine.current_value if wine.current_value is not None else wine.price),
        "currency": wine.currency,
        "drink_window": f"{wine.drink_from or '?'}-{wine.drink_to or '?'}",
        "peak_window": f"{wine.drink_peak_from or '?'}-{wine.drink_peak_to or '?'}",
        "grapes": grapes[:3],
        "tags": wine.tags[:3],
    }


def pairing_candidate_sort_key(wine: Wine, current_year: int) -> tuple[int, int, str, str]:
    if (
        wine.drink_peak_from
        and wine.drink_peak_to
        and wine.drink_peak_from <= current_year <= wine.drink_peak_to
    ):
        readiness = 0
    elif wine.drink_from and wine.drink_to and wine.drink_from <= current_year <= wine.drink_to:
        readiness = 1
    elif wine.drink_from and wine.drink_from <= current_year + 2:
        readiness = 2
    elif wine.drink_to and wine.drink_to < current_year:
        readiness = 4
    else:
        readiness = 3
    return (readiness, wine.drink_to or 9999, wine.type or "", wine.name or "")


def pairing_wine_is_in_ideal_window(wine: Wine, current_year: int) -> bool:
    return bool(
        wine.drink_peak_from
        and wine.drink_peak_to
        and wine.drink_peak_from <= current_year <= wine.drink_peak_to
    )


def select_pairing_candidates(wines: list[Wine], limit: int = PAIRING_MAX_CANDIDATES) -> list[Wine]:
    if len(wines) <= limit:
        return wines

    current_year = datetime.now(UTC).year
    by_type: dict[str, list[Wine]] = {}
    for wine in sorted(wines, key=lambda item: pairing_candidate_sort_key(item, current_year)):
        by_type.setdefault((wine.type or "Other").strip() or "Other", []).append(wine)

    selected: list[Wine] = []
    while len(selected) < limit and any(by_type.values()):
        for wine_type in sorted(by_type):
            candidates = by_type[wine_type]
            if candidates and len(selected) < limit:
                selected.append(candidates.pop(0))
    return selected


def pairing_budget_value_chf(wine: Wine) -> Decimal:
    reference_value = wine.current_value if wine.current_value is not None else wine.price
    if reference_value is None:
        return Decimal("0")
    return Decimal(str(reference_value))


def taste_affinity_from_score(score: float | None) -> int:
    """Convert a verified 0..1 personal taste score to Vinaris' six-heart scale."""
    if score is None:
        return 0
    return max(1, min(6, int(float(score) * 6 + 0.5)))


def clean_pairing_response(
    payload: dict,
    available_wine_ids: set[str],
    include_market: bool,
    *,
    target_wine: Wine | None = None,
    taste_profile_applied: bool = False,
) -> PairingResponse:
    matches = payload.get("cellar_matches", [])
    if not isinstance(matches, list):
        matches = []
    cleaned_matches: list[PairingCellarMatch] = []
    seen_ids: set[str] = set()
    for match in matches[:3]:
        if not isinstance(match, dict):
            continue
        wine_id = str(match.get("wine_id") or "").strip()
        if wine_id not in available_wine_ids or wine_id in seen_ids:
            continue
        seen_ids.add(wine_id)
        cleaned_matches.append(
            PairingCellarMatch(
                wine_id=UUID(wine_id),
                wine_name=str(match.get("wine_name") or "").strip(),
                producer=str(match.get("producer") or "").strip(),
                reason=str(match.get("reason") or "").strip(),
                serving_note=str(match.get("serving_note") or "").strip(),
            ),
        )

    market: dict[str, list[PairingMarketWine]] = {"low": [], "medium": [], "high": []}
    if target_wine is None and (include_market or not cleaned_matches):
        raw_market = payload.get("market_recommendations", {})
        if isinstance(raw_market, dict):
            for tier in ["low", "medium", "high"]:
                items = raw_market.get(tier, [])
                if not isinstance(items, list):
                    items = []
                market[tier] = [
                    PairingMarketWine(
                        name=str(item.get("name") or "").strip(),
                        producer=str(item.get("producer") or "").strip(),
                        price_hint=str(item.get("price_hint") or "").strip(),
                        reason=str(item.get("reason") or "").strip(),
                        taste_affinity=(
                            int(cast(int, item.get("taste_affinity")))
                            if taste_profile_applied
                            and isinstance(item.get("taste_affinity"), int)
                            and 0 <= item["taste_affinity"] <= 6
                            else 0
                        ),
                    )
                    for item in items[:2]
                    if isinstance(item, dict) and str(item.get("name") or "").strip()
                ]
    raw_dishes = payload.get("dish_recommendations", [])
    if not isinstance(raw_dishes, list):
        raw_dishes = []
    dishes = (
        [
            PairingDishRecommendation(
                name=str(item.get("name") or "").strip(),
                description=str(item.get("description") or "").strip(),
                why_it_works=str(item.get("why_it_works") or "").strip(),
                dietary_note=str(item.get("dietary_note") or "").strip(),
            )
            for item in raw_dishes[:3]
            if isinstance(item, dict) and str(item.get("name") or "").strip()
        ]
        if target_wine is not None
        else []
    )
    return PairingResponse(
        summary=str(payload.get("summary") or "").strip(),
        model="",
        taste_profile_applied=taste_profile_applied,
        cellar_matches=cleaned_matches,
        market_recommendations=market,
        dish_recommendations=dishes,
        estimated_cost_usd=Decimal("0"),
    )


DISALLOWED_BUYING_SOURCE_TERMS = ("smood",)


def is_disallowed_buying_source(merchant: str, source_url: str) -> bool:
    haystack = f"{merchant} {source_url}".lower()
    return any(term in haystack for term in DISALLOWED_BUYING_SOURCE_TERMS)


def buying_price_amount(value: str) -> Decimal | None:
    match = re.search(r"\d+(?:[.,]\d+)?", value.replace("'", ""))
    if not match:
        return None
    try:
        return Decimal(match.group(0).replace(",", "."))
    except InvalidOperation:
        return None


def clean_recommendation_vintage(value: str) -> str:
    vintage = value.strip()
    lowered = vintage.lower()
    if any(
        term in lowered
        for term in ("non conferm", "not confirm", "non indic", "not indic", "pagina", "unknown")
    ):
        return ""
    return vintage[:24]


def clean_buying_recommendations(
    payload: dict,
    verified_urls: set[str],
    min_price_chf: Decimal | None = None,
    max_price_chf: Decimal | None = None,
    *,
    require_availability: bool = True,
) -> list[BuyingRecommendation]:
    raw_items = payload.get("recommendations", [])
    if not isinstance(raw_items, list):
        return []
    recommendations: list[BuyingRecommendation] = []
    seen_urls: set[str] = set()
    merchant_counts: dict[str, int] = {}
    coop_count = 0
    for item in raw_items[:6]:
        if not isinstance(item, dict):
            continue
        name = str(item.get("name") or "").strip()
        merchant = str(item.get("merchant") or "").strip()
        source_url = str(item.get("source_url") or "").strip()
        if (
            not name
            or not source_url.startswith(("https://", "http://"))
            or source_url not in verified_urls
            or is_disallowed_buying_source(merchant, source_url)
            or source_url in seen_urls
            or (require_availability and not merchant)
        ):
            continue
        seen_urls.add(source_url)
        merchant_type = str(item.get("merchant_type") or "online").strip().lower()
        confidence = str(item.get("confidence") or "medium").strip().lower()
        price = str(item.get("price") or "").strip()
        price_amount = buying_price_amount(price)
        if (
            min_price_chf is not None and price_amount is not None and price_amount < min_price_chf
        ) or (
            max_price_chf is not None and price_amount is not None and price_amount > max_price_chf
        ):
            continue
        merchant_key = merchant.lower()
        is_coop = "coop" in merchant_key or "mondovino" in merchant_key
        if merchant and (
            merchant_counts.get(merchant_key, 0) >= 2 or (is_coop and coop_count >= 1)
        ):
            continue
        recommendations.append(
            BuyingRecommendation(
                name=name[:180],
                producer=str(item.get("producer") or "").strip()[:160],
                vintage=clean_recommendation_vintage(str(item.get("vintage") or "")),
                merchant=merchant[:160],
                merchant_type=merchant_type
                if merchant_type in {"local_shop", "online"}
                else "online",
                price=price[:40],
                currency=str(item.get("currency") or "CHF").strip().upper()[:8] or "CHF",
                availability=str(item.get("availability") or "").strip()[:240],
                delivery_estimate=str(item.get("delivery_estimate") or "").strip()[:160],
                source_url=source_url[:500],
                reason=str(item.get("reason") or "").strip()[:800],
                local=bool(item.get("local")),
                confidence=confidence if confidence in {"high", "medium", "low"} else "medium",
            ),
        )
        if merchant:
            merchant_counts[merchant_key] = merchant_counts.get(merchant_key, 0) + 1
        if is_coop:
            coop_count += 1
    return recommendations
