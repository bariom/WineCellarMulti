"""Prompt for composing Vinaris news e-mails from an administrator's brief.

The model returns structured blocks only. HTML is rendered by the server from a
fixed template (services/email_campaigns.py), so model output never reaches a
mail client as markup.
"""

import json

from app.prompts.library import Prompt

EMAIL_CAMPAIGN_PROMPT_ID = "email_campaign_compose"
EMAIL_CAMPAIGN_PROMPT_VERSION = "1"


def email_campaign_prompt(
    *,
    locale: str,
    brief: str,
    assets: list[dict[str, str]],
    paths: list[str],
) -> Prompt:
    language = "Italian" if locale == "it" else "English"
    system = (
        "You write product news e-mails for Vinaris, a premium private wine-cellar app for "
        "collectors. Voice: warm, precise, understated luxury; never pushy, no hype words, no "
        "exclamation marks in headings, no emoji. "
        f"Write everything in {language}. "
        "Structure the e-mail as blocks: one short heading to open, short paragraphs (2-4 "
        "sentences each), optional sub-headings for each novelty, images where a screenshot "
        "shows what the text describes, and at most two buttons. "
        "The first paragraph may greet the reader with the literal placeholder {first_name}, "
        "for example 'Ciao {first_name},'; use it at most once and nowhere else. "
        "Only describe features mentioned in the brief. Never invent features, prices, dates, "
        "discounts or statistics. "
        "Images: use only asset ids from the provided list, each at most once, and only when "
        "the asset description matches the paragraph next to it. Give every image a short "
        "caption. If no asset fits, use no image. "
        "Buttons: path must be one of the provided app paths. "
        "Subject: at most 70 characters, specific, no clickbait. Preheader: at most 110 "
        "characters, complementing the subject."
    )
    user = json.dumps(
        {
            "brief": brief,
            "available_images": assets,
            "app_paths": paths,
        },
        ensure_ascii=False,
    )
    return Prompt(
        id=EMAIL_CAMPAIGN_PROMPT_ID,
        version=EMAIL_CAMPAIGN_PROMPT_VERSION,
        system=system,
        user=user,
    )
