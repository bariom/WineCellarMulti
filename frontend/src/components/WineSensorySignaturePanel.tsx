import { useEffect, useState } from "react";
import type { Locale, WineSensorySignature } from "../types";
import { api } from "../services/api";
import "./WineSensorySignaturePanel.css";

const dimensions = [
  ["body", "Corpo", "Body"],
  ["acidity", "Acidità", "Acidity"],
  ["tannin", "Tannini", "Tannin"],
  ["sweetness", "Dolcezza", "Sweetness"],
  ["aromatic_intensity", "Intensità aromatica", "Aromatic intensity"],
  ["fruit", "Frutto", "Fruit"],
  ["wood", "Legno", "Oak"],
  ["spice", "Spezie", "Spice"],
  ["minerality", "Mineralità", "Minerality"],
] as const;

export function WineSensorySignaturePanel({ wineId, locale }: { wineId: string; locale: Locale }) {
  const [profile, setProfile] = useState<WineSensorySignature | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const it = locale === "it";
  useEffect(() => {
    let active = true;
    setProfile(null);
    setFailed(false);
    api<WineSensorySignature | null>(`/api/v1/taste-profile/wines/${wineId}/sensory`)
      .then(value => { if (active) setProfile(value); })
      .catch(() => { if (active) setFailed(true); });
    return () => { active = false; };
  }, [wineId, attempt]);

  if (failed) return <aside className="wine-sensory-signature" aria-label={it ? "Impronta sensoriale" : "Sensory signature"}>
    <p role="status">{it ? "Impronta sensoriale non caricata." : "Sensory signature could not be loaded."}</p>
    <button type="button" className="secondary compact" onClick={() => setAttempt(value => value + 1)}>{it ? "Riprova" : "Retry"}</button>
  </aside>;
  if (!profile || profile.generation_status !== "available") return null;
  const items = dimensions.map(([key, italian, english]) => {
    const raw = profile.dimensions?.[key];
    const value = typeof raw === "number" && Number.isFinite(raw) && raw >= 0 && raw <= 1 ? raw : null;
    return { key, label: it ? italian : english, value };
  });
  const number = (value: number) => new Intl.NumberFormat(it ? "it-CH" : "en-GB", { maximumFractionDigits: 1 }).format(value * 10);
  const sources: Record<string, string> = it
    ? { metadata: "Stima dai metadati", hybrid: "Stima da metadati e AI", ai: "Stima AI", manual: "Profilo manuale", grape: "Stima dai vitigni", appellation: "Stima dalla denominazione" }
    : { metadata: "Estimated from metadata", hybrid: "Estimated from metadata and AI", ai: "AI estimate", manual: "Manual profile", grape: "Estimated from grapes", appellation: "Estimated from appellation" };
  const confidence = Number.isFinite(profile.confidence) && profile.confidence >= 0 && profile.confidence <= 1 ? Math.round(profile.confidence * 100) : null;
  return <section className="wine-sensory-signature" aria-label={it ? "Impronta sensoriale" : "Sensory signature"}>
    <header><span>{it ? "IL CARATTERE DEL VINO" : "THE WINE’S CHARACTER"}</span><h3>{it ? "Impronta sensoriale" : "Sensory signature"}</h3>
      <p>{it ? "Intensità da 0 a 10: dal più delicato al più marcato. Descrive il vino, non il tuo gradimento." : "Intensity from 0 to 10: from subtle to pronounced. Describes the wine, not your liking."}</p></header>
    <dl className="wine-sensory-indicators">{items.map(({ key, label, value }) => <div className="wine-sensory-indicator" key={key}>
      <dt>{label}</dt><dd>{value === null ? (it ? "Non disponibile" : "Unavailable") : `${number(value)} / 10`}</dd>
      <div className="wine-sensory-track" aria-hidden="true"><span style={{ width: `${(value ?? 0) * 100}%` }} /></div>
    </div>)}</dl>
    <footer>{sources[profile.source] || (it ? "Profilo stimato" : "Estimated profile")}
      {confidence !== null && <span>{it ? "Affidabilità" : "Confidence"}: {confidence}%</span>}
      {profile.validated && <span>{it ? "Validato" : "Validated"}</span>}
      <p>{it ? "Un orientamento sullo stile: età, conservazione e temperatura di servizio possono cambiare la percezione." : "A guide to the style: age, storage and serving temperature can change perception."}</p>
    </footer>
  </section>;
}
