import { useId, type CSSProperties, type ReactNode } from "react";
import { translate, type TranslationKey } from "../i18n";
import { BASE_THEMES, curatedTheme, SIGNATURE_THEMES } from "../domain/themes";
import type { Locale, ThemePreference } from "../types";
import "./ThemePicker.css";

const LABELS: Partial<Record<ThemePreference, TranslationKey>> = {
  system: "themeSystem",
  light: "themeLight",
  dark: "themeDark",
  atelier: "themeAtelier",
  "pietra-vigna": "themePietraVigna",
  "maison-champagne": "themeMaisonChampagne",
  "cave-privee": "themeCavePrivee",
  "private-cellar": "themePrivateCellar",
};

/**
 * One radio group: the base appearance as a segmented row, then the four
 * signature themes as live previews painted in their own colours.
 */
export function ThemePicker({ value, locale, disabled = false, onChange }: { value: ThemePreference; locale: Locale; disabled?: boolean; onChange: (theme: ThemePreference) => void }) {
  const it = locale === "it";
  const name = useId();
  const selected = curatedTheme(value);
  const label = (theme: ThemePreference) => translate(locale, LABELS[theme] || "themeSystem");

  function radio(theme: ThemePreference, className: string, content: ReactNode, style?: CSSProperties) {
    return <label className={`${className}${selected === theme ? " is-selected" : ""}`} style={style} key={theme}>
      <input type="radio" name={name} value={theme} checked={selected === theme} disabled={disabled} onChange={() => onChange(theme)} />
      {content}
    </label>;
  }

  return <fieldset className="theme-picker">
    <legend>{translate(locale, "theme")}</legend>
    <div className="theme-picker-base">
      {BASE_THEMES.map((theme) => radio(theme, "theme-picker-base-option", <span>{label(theme)}</span>))}
    </div>
    <p className="theme-picker-kicker">{it ? "Temi d'autore" : "Signature themes"}</p>
    <div className="theme-picker-cards">
      {SIGNATURE_THEMES.map(({ value: theme, swatch }) => radio(theme, "theme-picker-card", <>
        <span className="theme-picker-preview" aria-hidden="true">
          <span className="theme-picker-surface">
            <b>Aa</b>
            <i className="theme-picker-line" />
            <i className="theme-picker-line is-short" />
            <em className="theme-picker-pill" />
          </span>
        </span>
        <span className="theme-picker-name">{label(theme)}</span>
      </>, {
        "--tp-page": swatch.page,
        "--tp-surface": swatch.surface,
        "--tp-accent": swatch.accent,
        "--tp-primary": swatch.primary,
        "--tp-text": swatch.text,
      } as CSSProperties))}
    </div>
    {selected !== value ? <small className="theme-picker-note">{it
      ? "Il tema che usavi è stato ritirato: ti mostriamo il più simile. Sceglierne uno lo salva."
      : "The theme you had chosen has been retired, so you are seeing the closest one. Pick a theme to save it."}</small> : null}
  </fieldset>;
}
