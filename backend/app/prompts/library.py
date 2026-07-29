"""Prompt source of truth for stable Vinaris AI features.

Keep user-supplied data in the ``context`` arguments. Prompt text must remain
deterministic, reviewed, and versioned so audit logs and test cases can be
related to the behavior that produced them.
"""

from dataclasses import dataclass


@dataclass(frozen=True)
class Prompt:
    """A complete provider-ready prompt with a stable product identifier."""

    id: str
    version: str
    system: str
    user: str


def language_instruction(locale: str) -> str:
    language = "Italian" if locale == "it" else "English"
    return (
        f"Write all user-facing prose in {language}. "
        "Keep structured status/priority labels concise and localized when natural."
    )


def ai_notes_prompt(*, locale: str, wine_context: str) -> Prompt:
    return Prompt(
        id="wine.ai_notes",
        version="1",
        system=(
            "You are a concise wine expert. "
            f"{language_instruction(locale)} "
            "Do not invent exact facts; say when evidence is limited."
        ),
        user=f"Create practical cellar notes for this wine in 3-5 sentences.\n\n{wine_context}",
    )


def drink_window_prompt(*, locale: str, wine_context: str) -> Prompt:
    return Prompt(
        id="wine.drink_window",
        version="1",
        system=(
            "You are a conservative wine cellar planner. Return JSON only. "
            f"{language_instruction(locale)}"
        ),
        user=f"Estimate a drinking window for this wine. Use realistic years and concise notes.\n\n{wine_context}",
    )


def wine_value_prompt(
    *, locale: str, currency_instruction: str, currency: str, wine_context: str
) -> Prompt:
    return Prompt(
        id="wine.market_value",
        version="1",
        system=(
            "You estimate wine value cautiously. Return JSON only. "
            "Use live web search for current market prices. "
            "If verified market data is uncertain, keep close to the best verified sources and explain uncertainty. "
            "Provide 3-8 verified market sources with concrete URLs when possible, using an empty array if none can be cited reliably. "
            "Keep market_note concise and useful. "
            f"{currency_instruction} {language_instruction(locale)}"
        ),
        user=(
            f"Estimate current unit value for this exact wine. Final current_value and currency must be {currency}. "
            "For market_sources, list only concrete merchants or marketplaces with country, price, currency, and URL for the exact wine when available. "
            "Use market_note for a short availability or confidence comment.\n\n"
            f"{wine_context}"
        ),
    )


def grape_composition_prompt(*, locale: str, wine_context: str) -> Prompt:
    return Prompt(
        id="wine.grape_composition",
        version="1",
        system=(
            "You verify exact wine grape composition using web sources. Return JSON only. "
            "Never estimate from appellation rules or a typical blend. Return an empty grapes array when the exact producer and vintage are not supported by a credible source. "
            f"{language_instruction(locale)}"
        ),
        user=(
            "Search the web for the exact grape composition of this wine and vintage. "
            "Prefer the winery, technical sheet, importer, or a reputable merchant. Percentages must be source-supported.\n\n"
            f"{wine_context}"
        ),
    )


def wine_full_enrichment_prompt(
    *,
    locale: str,
    currency_instruction: str,
    currency: str,
    wine_context: str,
) -> Prompt:
    return Prompt(
        id="wine.full_enrichment",
        version="1",
        system=(
            "You enrich one cellar wine in a single pass and return JSON only. "
            "Complete practical cellar notes, a conservative drinking window, current market value, and exact grape composition. "
            "Use live web search for current market listings and grape composition. "
            "Never infer an exact blend from appellation rules or a typical regional blend: return an empty grapes array when the exact producer and vintage are not supported by a credible source. "
            "For value, use concrete listings for the exact wine and provide 3-8 verified market sources when possible. "
            "Keep the drinking window realistic and internally ordered. "
            "Write cellar notes in 3-5 practical sentences and do not invent exact facts. "
            f"{currency_instruction} {language_instruction(locale)}"
        ),
        user=(
            "Enrich this wine in one response.\n"
            f"- Final current_value and value currency must be {currency}.\n"
            "- Market sources must identify concrete merchants or marketplaces and exact product URLs.\n"
            "- The grape source URL must support the exact producer and vintage; otherwise leave the grape composition empty.\n"
            "- Keep all prose concise and useful to a cellar owner.\n\n"
            f"{wine_context}"
        ),
    )


def wine_scores_prompt(*, locale: str, wine_context: str) -> Prompt:
    return Prompt(
        id="wine.critic_scores",
        version="1",
        system=(
            "You research published wine critic scores using web sources. Return JSON only. "
            "Never invent a score: include a score only when a credible source supports the wine, vintage and critic. "
            f"{language_instruction(locale)}"
        ),
        user=(
            "Search the web for additional published critic scores for this exact wine and vintage, including en-primeur scores when relevant. "
            "Return published critic-and-score combinations for this wine; the application preserves existing scores and removes duplicates. "
            "Prefer primary critic publications or reputable wine merchants quoting named critics. "
            "In each note, include the source name and state if the score is an en-primeur range. If evidence is weak, return an empty scores array.\n\n"
            f"{wine_context}"
        ),
    )


def wishlist_advice_prompt(*, locale: str, wishlist_context: str) -> Prompt:
    return Prompt(
        id="wishlist.buying_advice",
        version="1",
        system=(
            "You are a pragmatic wine buying advisor. Return JSON only. "
            f"{language_instruction(locale)}"
        ),
        user=f"Advise whether and how to buy this wishlist wine.\n\n{wishlist_context}",
    )


def wishlist_purpose_prompt(*, locale: str, wishlist_context: str) -> Prompt:
    return Prompt(
        id="wishlist.purpose",
        version="1",
        system=(
            "You decide the best purpose for a wishlist wine. Return JSON only. "
            f"{language_instruction(locale)}"
        ),
        user=(
            "Recommend whether this wine is best for drinking, cellaring, gifting, or investment.\n\n"
            f"{wishlist_context}"
        ),
    )


def wishlist_value_prompt(
    *,
    locale: str,
    currency_instruction: str,
    currency: str,
    target_price: object,
    wishlist_context: str,
) -> Prompt:
    return Prompt(
        id="wishlist.market_value",
        version="1",
        system=(
            "You estimate a realistic market price for a wishlist wine. Return JSON only. Be conservative. "
            "Use live web search for current market prices. "
            "Provide 3-8 verified market sources with concrete URLs when possible, using an empty array if none can be cited reliably. "
            "Keep market_note concise and useful. "
            f"{currency_instruction} {language_instruction(locale)}"
        ),
        user=(
            f"Estimate the current market price for this exact wishlist item. Final market_price and market_price_currency must be {currency}. "
            f"The user's maximum acceptable price is {currency} {target_price}; use it only to evaluate opportunity after estimating market price independently. "
            "If an offer price is supplied, price_advice must give a direct verdict: Opportunity, Fair price, Too expensive, or Insufficient data, and compare the offer with both market estimate and maximum price. "
            "For market_sources, list only concrete merchants or marketplaces with country, price, currency, and URL for the exact wine when available. "
            "Use market_note for a short availability or confidence comment.\n\n"
            f"{wishlist_context}"
        ),
    )
