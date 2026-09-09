from app.prompts import (
    ai_notes_prompt,
    buying_advice_prompt,
    cellar_command_prompt,
    cellar_intelligence_plan_prompt,
    grape_composition_prompt,
    wine_full_enrichment_prompt,
    wine_value_prompt,
    wine_vineyard_location_prompt,
    wishlist_portfolio_strategy_prompt,
    wishlist_value_prompt,
)


def test_buying_advice_prompt_applies_profile_without_overriding_filters():
    prompt = buying_advice_prompt(
        locale="it",
        purpose="drink immediately",
        pairing_with="risotto",
        preferences="poco legno",
        needed_by="delivery can take several days",
        location="Lugano",
        check_availability=True,
        min_price="CHF 20",
        max_price="CHF 60",
        wine_type="White",
        region="Ticino",
        taste_context={"category": "White", "confidence": 0.8, "dimensions": {"acidity": 74}},
    )

    assert (prompt.id, prompt.version) == ("sommelier.buying_advice", "2")
    assert "Italian" in prompt.system
    assert "must never override budget" in prompt.system
    assert "documented wine quality" in prompt.system
    assert "Wine type: White" in prompt.user
    assert "Requested region or appellation: Ticino" in prompt.user
    assert '"acidity":74' in prompt.user
    assert "Check current retail availability: yes" in prompt.user
    assert "concrete retailer product page" in prompt.system


def test_buying_advice_prompt_can_exclude_personal_profile():
    prompt = buying_advice_prompt(
        locale="en",
        purpose="hold in the cellar",
        pairing_with="",
        preferences="",
        needed_by="delivery can take several days",
        location="Zurich",
        check_availability=False,
        min_price="none",
        max_price="none",
        wine_type="",
        region="",
        taste_context={},
    )

    assert "Personal taste profile: not used" in prompt.user
    assert "Check current retail availability: no" in prompt.user
    assert "not provided or needed" in prompt.user
    assert "do not require stock or a nearby shop" in prompt.system


def test_wishlist_portfolio_prompt_balances_taste_quality_and_value():
    prompt = wishlist_portfolio_strategy_prompt(
        locale="it",
        wishlist_name="Da acquistare",
        wishlist_context="Wishlist portfolio:\n1. Sassicaia 2021",
        taste_context={"category": "global", "confidence": 0.7, "dimensions": {"body": 76}},
    )

    assert (prompt.id, prompt.version) == ("wishlist.portfolio_buying_strategy", "1")
    assert "Italian" in prompt.system
    assert "personal taste fit, wine quality, price/value" in prompt.system
    assert "Never invent ratings" in prompt.system
    assert '"body":76' in prompt.user
    assert "Sassicaia 2021" in prompt.user

    without_profile = wishlist_portfolio_strategy_prompt(
        locale="en",
        wishlist_name="Candidates",
        wishlist_context="Wishlist portfolio:\n1. Example wine",
        taste_context={},
    )
    assert "Personal taste profile: not used" in without_profile.user


def test_cellar_command_prompt_is_bounded_and_preserves_user_facts():
    prompt = cellar_command_prompt(
        locale="it",
        command_text="Ieri ho bevuto Ornellaia 2015, 9 su 10. Aggiorna la cantina.",
        local_date="2026-08-13",
        timezone="Europe/Zurich",
        wishlist_names=["Rossi", "Wishlist"],
    )

    assert (prompt.id, prompt.version) == ("cellar.command_interpretation", "11")
    assert "never choose database IDs" in prompt.system
    assert "acquisition drafts" in prompt.system
    assert "intent ship_wine" in prompt.system
    assert "intent add_to_wishlist" in prompt.system
    assert "intent set_strategy" in prompt.system
    assert "all wines from one producer" in prompt.system
    assert "gifted bottle" in prompt.system
    assert "no current value" in prompt.system
    assert "never a completed database action" in prompt.system
    assert "Preserve tasting scores exactly" in prompt.system
    assert "case (cassa/case) means six bottles" in prompt.system
    assert "reintegra 3 bottiglie" in prompt.system
    assert "segna l ordine Sassicaia 2022 come arrivato" in prompt.system
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


def test_cellar_intelligence_prompt_uses_goals_without_exposing_ids_in_prose():
    prompt = cellar_intelligence_plan_prompt(
        locale="it",
        focus="balanced",
        candidate_count=2,
        bottle_count=12,
        allocation_coverage_pct=75,
        preferences_context='{"annual_drink_target":24}',
        cellar_context='[{"wine_id":"test-id","name":"Sassicaia"}]',
    )

    assert (prompt.id, prompt.version) == ("cellar.intelligence_plan", "3")
    assert "owner preferences" in prompt.system
    assert "Never put wine_id values" in prompt.system
    assert "annual_drink_target" in prompt.user
    assert "Sassicaia" in prompt.user
    assert "Do not create an action for every wine" in prompt.system
    assert "treat purposes as current allocations" in prompt.system


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
    assert wine_prompt.version == "2"
    assert "3-8 verified market sources" in wine_prompt.system
    assert "Never use restaurant, hotel, bar" in wine_prompt.system
    assert "must be CHF" in wine_prompt.user
    assert wishlist_prompt.id == "wishlist.market_value"
    assert wishlist_prompt.version == "2"
    assert "Italian" in wishlist_prompt.system
    assert "hospitality markups" in wishlist_prompt.system
    assert "target price is CHF 75.00" in wishlist_prompt.user

    full_prompt = wine_full_enrichment_prompt(
        locale="it",
        currency_instruction="Restituisci i valori in CHF.",
        currency="CHF",
        wine_context="Wine: Example 2020",
    )
    assert (full_prompt.id, full_prompt.version) == ("wine.full_enrichment", "2")
    assert "Never use restaurant, hotel, bar" in full_prompt.system


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
