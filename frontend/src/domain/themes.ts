import type { ThemePreference } from "../types";

/*
 * Curated themes (docs/UI_WOW_RECIPE.md, "Themes"). The picker offers the base
 * Vinaris appearance (automatic, light, dark) and four signature themes.
 * Retired themes stay valid on the server so older clients keep working; the
 * app shows them as the closest curated theme until the user picks again.
 */

export type ThemeSwatch = { page: string; surface: string; accent: string; primary: string; text: string };

export const BASE_THEMES = ["system", "light", "dark"] as const satisfies readonly ThemePreference[];

/** Colours copied from each theme's `:root[data-theme]` block in styles.css. */
export const SIGNATURE_THEMES: ReadonlyArray<{ value: ThemePreference; swatch: ThemeSwatch }> = [
  { value: "atelier", swatch: { page: "#f3f5f0", surface: "#fffefa", accent: "#a9782a", primary: "#4b1324", text: "#171b18" } },
  // Reinstated on 2026-10-28 at the owner's request: the neutral, green light theme.
  { value: "pietra-vigna", swatch: { page: "#eeeee7", surface: "#f8f8f2", accent: "#a26048", primary: "#2f5143", text: "#243a33" } },
  { value: "maison-champagne", swatch: { page: "#f7f4ed", surface: "#fffcf6", accent: "#9a753d", primary: "#625036", text: "#282823" } },
  { value: "cave-privee", swatch: { page: "#191b1a", surface: "#232725", accent: "#c5aa76", primary: "#c5aa76", text: "#eee8dc" } },
  { value: "private-cellar", swatch: { page: "#15100d", surface: "#211915", accent: "#8d6a35", primary: "#d5b06b", text: "#f6efe4" } },
];

const RETIRED_THEMES: Partial<Record<ThemePreference, ThemePreference>> = {
  sepia: "maison-champagne",
  "white-wine": "maison-champagne",
  champagne: "maison-champagne",
  tuscany: "maison-champagne",
  "rose-wine": "maison-champagne",
  "red-wine": "private-cellar",
  bordeaux: "private-cellar",
  burgundy: "private-cellar",
  ticino: "private-cellar",
  piedmont: "private-cellar",
  "midnight-ledger": "cave-privee",
};

/** The theme actually shown for a stored preference. */
export function curatedTheme(preference: ThemePreference): ThemePreference {
  return RETIRED_THEMES[preference] || preference;
}
