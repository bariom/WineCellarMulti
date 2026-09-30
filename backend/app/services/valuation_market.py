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

MARKET_COUNTRY_ALIASES = {
    "CH": {"ch", "switzerland", "svizzera", "schweiz", "suisse", "swiss"},
    "IT": {"it", "italy", "italia"},
    "DE": {"de", "germany", "germania", "deutschland"},
    "BE": {"be", "belgium", "belgio"},
    "FR": {"fr", "france", "francia"},
    "ES": {"es", "spain", "spagna"},
    "PT": {"pt", "portugal", "portogallo"},
    "US": {"us", "usa", "united states", "united states of america", "stati uniti"},
    "GB": {"gb", "uk", "united kingdom", "great britain", "regno unito"},
    "IE": {"ie", "ireland", "irlanda"},
    "NL": {"nl", "netherlands", "paesi bassi"},
    "LU": {"lu", "luxembourg", "lussemburgo"},
    "DK": {"dk", "denmark", "danimarca"},
    "SE": {"se", "sweden", "svezia"},
    "NO": {"no", "norway", "norvegia"},
    "FI": {"fi", "finland", "finlandia"},
    "PL": {"pl", "poland", "polonia"},
    "CZ": {"cz", "czechia", "cechia"},
    "GR": {"gr", "greece", "grecia"},
    "HU": {"hu", "hungary", "ungheria"},
    "HR": {"hr", "croatia", "croazia"},
    "SI": {"si", "slovenia"},
    "CA": {"ca", "canada"},
    "AU": {"au", "australia"},
    "NZ": {"nz", "new zealand", "nuova zelanda"},
    "JP": {"jp", "japan", "giappone"},
    "CN": {"cn", "china", "cina"},
    "BR": {"br", "brazil", "brasile"},
    "ZA": {"za", "south africa", "sudafrica"},
    "AR": {"ar", "argentina"},
    "AE": {"ae", "united arab emirates", "emirati arabi uniti"},
}


def source_matches_market(source_country: str, market_country: str) -> bool:
    """Match an AI-provided country label to the selected ISO market."""
    country_code = str(market_country or "").strip().upper()
    source_label = str(source_country or "").strip().casefold()
    if not country_code or not source_label:
        return False
    aliases = {country_code.casefold()}
    market_name = MARKET_COUNTRIES.get(country_code)
    if market_name:
        aliases.add(market_name.casefold())
    aliases.update(MARKET_COUNTRY_ALIASES.get(country_code, set()))
    return source_label in aliases


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
        "When at least one exact-match local listing is available, base the final estimate on "
        "local listings only; foreign listings may corroborate the result but must not pull "
        "the estimate "
        "up or down. For every source, return price_in_output_currency after converting its listed "
        "price to the requested output currency. Do not mix foreign and local prices silently."
    )
