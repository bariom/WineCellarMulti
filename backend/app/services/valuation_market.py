"""Explicit market selection, independent of display language and currency."""

MARKET_COUNTRIES = {
    "CH": "Switzerland",
    "IT": "Italy",
    "DE": "Germany",
    "US": "United States",
    "AT": "Austria",
    "BE": "Belgium",
    "FR": "France",
    "ES": "Spain",
    "PT": "Portugal",
    "GB": "United Kingdom",
    "IE": "Ireland",
    "NL": "Netherlands",
    "LU": "Luxembourg",
    "DK": "Denmark",
    "SE": "Sweden",
    "NO": "Norway",
    "FI": "Finland",
    "PL": "Poland",
    "CZ": "Czechia",
    "GR": "Greece",
    "HU": "Hungary",
    "RO": "Romania",
    "HR": "Croatia",
    "SI": "Slovenia",
    "CA": "Canada",
    "AU": "Australia",
    "NZ": "New Zealand",
    "JP": "Japan",
    "SG": "Singapore",
    "HK": "Hong Kong",
    "CN": "China",
    "BR": "Brazil",
    "ZA": "South Africa",
    "AR": "Argentina",
    "CL": "Chile",
    "AE": "United Arab Emirates",
}


def market_instruction(country: str) -> str:
    name = MARKET_COUNTRIES.get(country)
    if not name:
        return (
            "The user has not selected a reference market. Do not infer residence from language "
            "or currency. Search internationally and identify each source's country. "
            "Explain that this is an international estimate, not a local market valuation."
        )
    return (
        f"User reference market: {name} ({country}). This is separate from the output currency. "
        "Prioritize exact retail bottle listings from retailers in this market or explicitly "
        "delivering to it. Use final consumer prices including local taxes when stated; never "
        "invent taxes, shipping or import charges. If local exact-match evidence is unavailable, "
        "use foreign sources only as a clearly identified fallback: state their countries and "
        "explain in market_note that these are foreign prices "
        "and local availability is unverified. "
        "Do not mix foreign and local prices silently."
    )
