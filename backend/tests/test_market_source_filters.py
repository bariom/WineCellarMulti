from decimal import Decimal

from app.api.routes.ai import median_retail_source_price, normalize_market_sources


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
    for url in ("", "javascript:alert(1)", "https:///missing-host", "file:///price.pdf", "https://[invalid"):
        assert normalize_market_sources([{**base, "url": url}], default_currency="EUR", require_url=True) == []
    for price in ("NaN", "Infinity", "-10", "not a price"):
        assert normalize_market_sources([{**base, "price": price, "url": "https://example.com/wine"}], default_currency="EUR", require_url=True) == []
