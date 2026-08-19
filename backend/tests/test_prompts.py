from app.prompts import (
    ai_notes_prompt,
    cellar_command_prompt,
    grape_composition_prompt,
    wine_value_prompt,
    wine_vineyard_location_prompt,
    wishlist_value_prompt,
)


def test_cellar_command_prompt_is_bounded_and_preserves_user_facts():
    prompt = cellar_command_prompt(
        locale="it",
        command_text="Ieri ho bevuto Ornellaia 2015, 9 su 10. Aggiorna la cantina.",
        local_date="2026-08-13",
        timezone="Europe/Zurich",
        wishlist_names=["Rossi", "Wishlist"],
    )

    assert (prompt.id, prompt.version) == ("cellar.command_interpretation", "8")
    assert "never choose database IDs" in prompt.system
    assert "acquisition drafts" in prompt.system
    assert "intent ship_wine" in prompt.system
    assert "intent add_to_wishlist" in prompt.system
    assert "intent set_strategy" in prompt.system
    assert "never a completed database action" in prompt.system
    assert "Preserve tasting scores exactly" in prompt.system
    assert "case (cassa/case) means six bottles" in prompt.system
    assert "2026-08-13" in prompt.user
    assert "Europe/Zurich" in prompt.user
    assert "Ornellaia 2015" in prompt.user
    assert "Known wishlist names: Rossi, Wishlist" in prompt.user


def test_notes_prompt_is_versioned_localized_and_contains_context():
    prompt = ai_notes_prompt(locale="it", wine_context="Producer: Test winery")

    assert (prompt.id, prompt.version) == ("wine.ai_notes", "1")
    assert "Italian" in prompt.system
    assert "Do not invent exact facts" in prompt.system
    assert "Producer: Test winery" in prompt.user


def test_grape_prompt_requires_exact_source_backed_composition():
    prompt = grape_composition_prompt(locale="en", wine_context="Wine: Example 2020")

    assert prompt.id == "wine.grape_composition"
    assert "Never estimate from appellation rules" in prompt.system
    assert "Percentages must be source-supported" in prompt.user


def test_market_value_prompts_keep_currency_and_context_constraints():
    wine_prompt = wine_value_prompt(
        locale="en",
        currency_instruction="Return all values in CHF.",
        currency="CHF",
        wine_context="Wine: Example 2020",
    )
    wishlist_prompt = wishlist_value_prompt(
        locale="it",
        currency_instruction="Restituisci i valori in CHF.",
        currency="CHF",
        target_price="75.00",
        wishlist_context="Wishlist: Example",
    )

    assert wine_prompt.id == "wine.market_value"
    assert "3-8 verified market sources" in wine_prompt.system
    assert "must be CHF" in wine_prompt.user
    assert wishlist_prompt.id == "wishlist.market_value"
    assert "Italian" in wishlist_prompt.system
    assert "target price is CHF 75.00" in wishlist_prompt.user


def test_vineyard_prompt_prefers_the_physical_producer_before_a_locality():
    prompt = wine_vineyard_location_prompt(locale="it", wine_context="Wine: Example 2020")

    assert (prompt.id, prompt.version) == ("wine.vineyard_location", "4")
    assert "physical producer estate, winery, or cellar" in prompt.system
    assert "Do not choose a town centre" in prompt.system
    assert "official contact/address page" in prompt.system
    assert "source does not need to print numeric coordinates" in prompt.system
    assert "vineyard, estate, locality, or appellation" in prompt.system
    assert "representative point" in prompt.system
    assert "physical estate or winery before considering" in prompt.user
    assert "Italian" in prompt.system
    assert "Wine: Example 2020" in prompt.user
