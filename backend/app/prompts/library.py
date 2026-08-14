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


def cellar_command_prompt(
    *,
    locale: str,
    command_text: str,
    local_date: str,
    timezone: str,
    wishlist_names: list[str] | None = None,
) -> Prompt:
    known_wishlists = (
        ", ".join(name.strip() for name in (wishlist_names or []) if name.strip()) or "(none)"
    )
    return Prompt(
        id="cellar.command_interpretation",
        version="5",
        system=(
            "You extract one safe cellar operation from the user's text and return only the "
            "required JSON schema. You never choose database IDs and never claim that an action "
            "has already happened. Support consumption of exactly one bottle with an optional "
            "tasting, and acquisition drafts for one or more bottles. Use intent consume_wine when "
            "the user says a bottle was consumed. Use intent acquire_wine when the user says they "
            "bought or purchased wine, or asks to add wine to the cellar. Use intent ship_wine when "
            "the user says an already ordered wine has been shipped. Otherwise use unsupported. "
            "Use intent add_to_wishlist when the user asks to add a wine to a wishlist; preserve the "
            "wishlist list name exactly when stated. When the user names one of the known wishlists, return "
            "that exact name and never use the generic word 'wishlist' as the list name. For a wishlist price, extract the stated amount and "
            "currency into purchase_price and purchase_price_present: Vinaris will classify a plain price "
            "or a maximum/budget as a target price, and an offer or found price as an offer price. "
            "An acquisition is only a draft for user review and is never a completed database action. "
            "Set explicit_action true only when the user explicitly asks Vinaris to "
            "update, register, record, modify, or otherwise apply the operation. Preserve tasting "
            "scores exactly as stated, including their original scale. Do not invent a producer, "
            "format, pairing, companions, tasting descriptors, occasion, merchant, or price. Preserve "
            "an acquisition quantity, per-bottle price, currency, merchant, and purchase date only when "
            "stated. A wine case (cassa/case) means six bottles unless the user explicitly states a "
            "different bottle count per case. Convert relative dates using the supplied local date and timezone. Keep the user's "
            "factual tasting note concise without enriching it with wine knowledge."
        ),
        user=(
            f"Locale: {locale}\nLocal date: {local_date}\nTimezone: {timezone}\nKnown wishlist names: {known_wishlists}\n\n"
            f"User command:\n{command_text.strip()}"
        ),
    )


def wine_image_recognition_prompt(
    *, locale: str, known_text: str = "", known_context: str = ""
) -> Prompt:
    return Prompt(
        id="wine.image_recognition",
        version="1",
        system=(
            "You identify a wine only from visible bottle-label evidence and return the required "
            "JSON schema. Do not invent missing facts. Distinguish producer or estate, wine/cuvee "
            "name, appellation, region and country. Accept a vintage only when a four-digit year, "
            "NV or MV is clearly visible and plausibly denotes the wine vintage. If equally plausible "
            "incompatible identities remain, use status ambiguous and return at most three candidates. "
            f"{language_instruction(locale)}"
        ),
        user=(
            "Read the full-bottle image and the optional central label crop. Return visible label text "
            "in reading order. A usable recognition normally needs producer plus wine name, or producer "
            "plus appellation. Use not_recognized for insufficient evidence and invalid_image only when "
            "the image itself cannot be inspected. Always require user confirmation.\n\n"
            f"Optional user text: {known_text.strip() or '(none)'}\n"
            f"Already known context: {known_context.strip() or '(none)'}"
        ),
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


def wine_vineyard_location_prompt(*, locale: str, wine_context: str) -> Prompt:
    return Prompt(
        id="wine.vineyard_location",
        version="4",
        system=(
            "You research the geographic origin of one exact wine and return JSON only. "
            "Use your existing wine and geographic knowledge to identify the most likely place, then use the single available web search efficiently to verify the most precise physical location. "
            "Use this strict fallback order: named vineyard or parcel; physical producer estate, winery, or cellar; appellation centre; locality centre. "
            "When no exact vineyard is documented, actively search for the named producer's official contact/address page or another authoritative source locating its physical wine estate. Do not choose a town centre merely because the producer's address mentions that town. "
            "For the producer fallback, set vineyard_name to the producer estate or winery name and precision to estate. Never use a corporate office, distributor, shop, hospitality venue, or generic municipality as the producer estate. "
            "Producer identity is mandatory for an estate result: the source must identify the same producer named in the wine context, not a similarly named or neighbouring producer. If names are ambiguous or point to a different producer, never return that estate; fall back only to a supported appellation or locality. "
            "Never invent a vineyard or estate. Exact vineyard coordinates require credible evidence. Estate coordinates may be geocoded from a complete, credible street address or an unambiguous authoritative map location; the source does not need to print numeric coordinates. "
            "When a credible source identifies the origin but does not publish exact coordinates, return a representative point for the smallest supported locality or appellation instead of status=not_found. "
            "Set precision to vineyard, estate, locality, or appellation so the map never implies more accuracy than the evidence supports. "
            f"{language_instruction(locale)}"
        ),
        user=(
            "Find the best defensible map location for this wine. If the exact vineyard is unavailable, locate the producer's physical estate or winery before considering an appellation or locality centre. "
            "The source must verify the named vineyard, producer address, estate, locality, or appellation; it does not need to publish numeric coordinates when an estate point is geocoded from its verified address or when precision is locality or appellation. "
            "Do not treat a partial name match as producer verification: for example, a Fattoria, Tenuta, Villa or estate with a similar name can be a different producer. "
            "For an approximate locality or appellation point, use representative centre coordinates, set the matching lower precision, and explicitly say in notes that the point is approximate. "
            "Return status=not_found and empty location fields only when no reliable source connects this wine to any meaningful geographic area. "
            "source_url must be a concrete source used during web research. Keep notes to one short factual sentence.\n\n"
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
            + (
                (
                    f"The user target price is {currency} {target_price}"
                    if target_price is not None
                    else "The user did not set a maximum acceptable price"
                )
                + "; use a maximum price only as a secondary constraint after estimating market price independently. "
                + "If an offer price is supplied, price_advice must give a direct verdict: Opportunity, Fair price, Too expensive, or Insufficient data. When no maximum is set, compare the offer only with the market estimate and do not recommend against buying merely because the maximum is missing. "
            )
            + "For market_sources, list only concrete merchants or marketplaces with country, price, currency, and URL for the exact wine when available. "
            + "Use market_note for a short availability or confidence comment.\n\n"
            + wishlist_context
        ),
    )
