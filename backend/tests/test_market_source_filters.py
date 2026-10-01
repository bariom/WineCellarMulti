from decimal import Decimal

from app.api.routes.ai import (
    local_market_source_price,
    median_retail_source_price,
    normalize_market_sources,
)


def test_market_sources_exclude_hospitality_prices_and_recalculate_retail_median():
    sources = normalize_market_sources(
        [
            {
                "merchant": "Bellevue",
                "title": "Restaurant wine list",
                "country": "Switzerland",
                "price": 145,
                "currency": "CHF",
                "url": "https://example.com/list.pdf",
                "note": "Selection",
            },
            {
                "merchant": "Enoteca Uno",
                "country": "Switzerland",
                "price": 48,
                "currency": "CHF",
                "url": "https://shop.example.com/wine",
                "note": "750 ml bottle",
            },
            {
                "merchant": "Enoteca Due",
                "country": "Switzerland",
                "price": 52,
                "currency": "CHF",
                "url": "https://retail.example.com/wine",
                "note": "In stock",
            },
        ],
        default_currency="CHF",
        require_url=True,
    )

    assert [source["merchant"] for source in sources] == ["Enoteca Uno", "Enoteca Due"]
    assert median_retail_source_price(sources, currency="CHF") == Decimal("50.00")


def test_market_sources_require_web_urls_and_finite_prices():
    base = {"merchant": "Retail shop", "price": 48, "currency": "EUR", "country": "Italy"}
    for url in (
        "",
        "javascript:alert(1)",
        "https:///missing-host",
        "file:///price.pdf",
        "https://[invalid",
    ):
        assert (
            normalize_market_sources(
                [{**base, "url": url}], default_currency="EUR", require_url=True
            )
            == []
        )
    for price in ("NaN", "Infinity", "-10", "not a price"):
        assert (
            normalize_market_sources(
                [{**base, "price": price, "url": "https://example.com/wine"}],
                default_currency="EUR",
                require_url=True,
            )
            == []
        )


def test_local_market_price_excludes_foreign_sources_and_uses_converted_price():
    sources = normalize_market_sources(
        [
            {
                "merchant": "Swiss",
                "country": "Switzerland",
                "price": 53,
                "currency": "CHF",
                "price_in_output_currency": 56.2,
                "url": "https://example.ch/wine",
            },
            {
                "merchant": "Belgian",
                "country": "Belgium",
                "price": 75,
                "currency": "EUR",
                "price_in_output_currency": 75,
                "url": "https://example.be/wine",
            },
            {
                "merchant": "German",
                "country": "Germany",
                "price": 74.36,
                "currency": "EUR",
                "price_in_output_currency": 74.36,
                "url": "https://example.de/wine",
            },
            {
                "merchant": "Italian",
                "country": "Italy",
                "price": 53,
                "currency": "EUR",
                "price_in_output_currency": 53,
                "url": "https://example.it/wine",
            },
        ],
        default_currency="EUR",
        require_url=True,
    )

    assert local_market_source_price(sources, currency="EUR", market_country="CH") == Decimal(
        "56.20"
    )


def test_local_market_price_accepts_localized_country_and_same_currency():
    sources = normalize_market_sources(
        [
            {
                "merchant": "Enoteca locale",
                "country": "Svizzera",
                "price": 53,
                "currency": "CHF",
                "url": "https://example.ch/wine",
            }
        ],
        default_currency="CHF",
        require_url=True,
    )

    assert local_market_source_price(sources, currency="CHF", market_country="CH") == Decimal(
        "53.00"
    )


def test_market_source_lot_total_is_normalized_to_unit_price():
    sources = normalize_market_sources(
        [
            {
                "merchant": "Coop",
                "country": "Switzerland",
                "price": 24.95,
                "currency": "CHF",
                "price_in_output_currency": 24.95,
                "url": "https://example.ch/bottle",
                "note": "75 cl bottle",
            },
            {
                "merchant": "Ricardo",
                "country": "Switzerland",
                "price": 95,
                "currency": "CHF",
                "price_in_output_currency": 95,
                "url": "https://example.ch/lot",
                "note": (
                    "Lotto esatto di 3 bottiglie nuove; CHF 95 complessivi, "
                    "equivalente a CHF 31.67 per bottiglia."
                ),
            },
        ],
        default_currency="CHF",
        require_url=True,
    )

    assert sources[1]["price"] == "31.67"
    assert sources[1]["price_in_output_currency"] == "31.67"
    assert sources[1]["bottle_count"] == 3
    assert sources[1]["listed_price"] == "95.00"
    assert sources[1]["listed_price_in_output_currency"] == "95.00"
    assert local_market_source_price(sources, currency="CHF", market_country="CH") == Decimal(
        "28.31"
    )


def test_market_source_minimum_order_does_not_change_unit_price():
    sources = normalize_market_sources(
        [
            {
                "merchant": "Retail shop",
                "country": "Switzerland",
                "price": 24.95,
                "currency": "CHF",
                "url": "https://example.ch/bottle",
                "note": "CHF 24.95 per bottle; minimum order 3 bottles.",
            }
        ],
        default_currency="CHF",
        require_url=True,
    )

    assert sources[0]["price"] == "24.95"
    assert "bottle_count" not in sources[0]
