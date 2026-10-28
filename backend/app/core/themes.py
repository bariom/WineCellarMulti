"""Theme preferences.

Settings offer the base appearance (system, light, dark) and four signature
themes. Twelve older themes were retired on 2026-10-28: requests may still send
them (installed apps with a cached bundle), and they are stored as the closest
signature theme. Keep in sync with frontend/src/domain/themes.ts.
"""

CURATED_THEMES = (
    "system",
    "light",
    "dark",
    "atelier",
    "maison-champagne",
    "cave-privee",
    "private-cellar",
)

RETIRED_THEMES: dict[str, str] = {
    "sepia": "maison-champagne",
    "white-wine": "maison-champagne",
    "champagne": "maison-champagne",
    "tuscany": "maison-champagne",
    "rose-wine": "maison-champagne",
    "pietra-vigna": "atelier",
    "red-wine": "private-cellar",
    "bordeaux": "private-cellar",
    "burgundy": "private-cellar",
    "ticino": "private-cellar",
    "piedmont": "private-cellar",
    "midnight-ledger": "cave-privee",
}


def curated_theme(theme: str) -> str:
    """The theme to store for a requested preference."""
    return RETIRED_THEMES.get(theme, theme)
