import type { CSSProperties } from "react";
import type { Locale, PerceivedTrait, PerceivedTraits } from "../types";
import "./PerceivedTraitsInput.css";

type Scale = { trait: PerceivedTrait; it: string; en: string; levels: { it: string[]; en: string[] } };

const SCALES: Scale[] = [
  { trait: "body", it: "Corpo", en: "Body", levels: {
    it: ["Molto leggero", "Leggero", "Medio", "Pieno", "Molto pieno"],
    en: ["Very light", "Light", "Medium", "Full", "Very full"],
  } },
  { trait: "acidity", it: "Acidità", en: "Acidity", levels: {
    it: ["Molto morbida", "Morbida", "Media", "Fresca", "Molto vivace"],
    en: ["Very soft", "Soft", "Medium", "Fresh", "Very crisp"],
  } },
  { trait: "tannin", it: "Tannino", en: "Tannin", levels: {
    it: ["Impercettibile", "Setoso", "Medio", "Deciso", "Astringente"],
    en: ["Imperceptible", "Silky", "Medium", "Firm", "Astringent"],
  } },
  { trait: "sweetness", it: "Dolcezza", en: "Sweetness", levels: {
    it: ["Secco", "Quasi secco", "Amabile", "Dolce", "Molto dolce"],
    en: ["Dry", "Off-dry", "Medium sweet", "Sweet", "Very sweet"],
  } },
];

/** Wines whose tannin is not worth asking about. */
const WITHOUT_TANNIN = new Set(["White", "Sparkling"]);

export function perceivedLabel(locale: Locale, trait: PerceivedTrait, value: number) {
  const scale = SCALES.find((item) => item.trait === trait);
  return scale ? `${locale === "it" ? scale.it : scale.en}: ${scale.levels[locale === "it" ? "it" : "en"][value - 1] ?? value}` : "";
}

/** A short line such as "Corpo: Pieno · Acidità: Fresca" for the traits recorded. */
export function perceivedSummary(locale: Locale, perceived: PerceivedTraits | null | undefined) {
  return SCALES.filter((scale) => perceived?.[scale.trait]).map((scale) => perceivedLabel(locale, scale.trait, perceived![scale.trait]!)).join(" · ");
}

/**
 * Four optional sliders, one tap each. A slider never touched records nothing;
 * a trait already recorded can be cleared.
 */
export default function PerceivedTraitsInput({ locale, value, wineType = "", disabled = false, onChange }: {
  locale: Locale;
  value: PerceivedTraits | undefined;
  wineType?: string;
  disabled?: boolean;
  onChange: (value: PerceivedTraits) => void;
}) {
  const it = locale === "it";
  const current = value ?? {};
  const scales = SCALES.filter((scale) => scale.trait !== "tannin" || !WITHOUT_TANNIN.has(wineType) || current.tannin);
  function set(trait: PerceivedTrait, level: number | null) {
    const next = { ...current };
    if (level === null) delete next[trait];
    else next[trait] = level;
    onChange(next);
  }
  return <fieldset className="perceived-traits" disabled={disabled}>
    <legend>{it ? "Com’era in bocca?" : "How did it taste?"} <small>{it ? "facoltativo" : "optional"}</small></legend>
    <p>{it ? "Tocca una barra per indicarlo; quelle che lasci vuote non contano." : "Tap a bar to set it; the ones left empty do not count."}</p>
    {scales.map((scale) => {
      const level = current[scale.trait];
      const words = scale.levels[it ? "it" : "en"];
      const name = it ? scale.it : scale.en;
      return <div key={scale.trait} className={`perceived-trait${level ? "" : " unset"}`}>
        <div className="perceived-trait-head">
          <span id={`perceived-${scale.trait}`}>{name}</span>
          <strong>{level ? words[level - 1] : "—"}</strong>
          {level ? <button type="button" className="perceived-trait-clear" aria-label={it ? `Togli ${name.toLowerCase()}` : `Clear ${name.toLowerCase()}`} onClick={() => set(scale.trait, null)}>×</button> : null}
        </div>
        <input
          type="range"
          min={1}
          max={5}
          step={1}
          value={level ?? 3}
          style={{ "--fill": level ? `${(level - 1) * 25}%` : "0%" } as CSSProperties}
          aria-labelledby={`perceived-${scale.trait}`}
          aria-valuetext={level ? words[level - 1] : (it ? "Non indicato" : "Not set")}
          // Phones do not move the focus to a slider on touch: a text field typed in
          // before keeps it, and every update scrolls back to it with the keyboard.
          onPointerDown={(event) => event.currentTarget.focus({ preventScroll: true })}
          onChange={(event) => set(scale.trait, Number(event.currentTarget.value))}
          // A tap on the middle of an empty bar changes no value: it still records it.
          // Touch screens send no click to a slider, so the lifted finger counts too.
          onClick={(event) => { if (!level) set(scale.trait, Number(event.currentTarget.value)); }}
          onPointerUp={(event) => { if (!level) set(scale.trait, Number(event.currentTarget.value)); }}
        />
        <div className="perceived-trait-ends" aria-hidden="true"><span>{words[0]}</span><span>{words[4]}</span></div>
      </div>;
    })}
  </fieldset>;
}
