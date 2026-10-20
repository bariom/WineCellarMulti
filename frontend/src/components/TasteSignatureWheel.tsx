import { useId } from "react";
import { dimensionStrength, TASTE_DIMENSIONS, type TasteDimensionStrength } from "../domain/tasteStrength";
import type { Locale, TasteProfile } from "../types";

const axes = TASTE_DIMENSIONS;
type Strength = TasteDimensionStrength;

export default function TasteSignatureWheel({ dimensions, labels, locale }: {
  dimensions: TasteProfile["dimensions"]; labels: Record<string, string>; locale: Locale;
}) {
  const id = useId();
  const it = locale === "it";
  const point = (index: number, radius: number) => {
    const angle = index * Math.PI * 2 / axes.length - Math.PI / 2;
    return [180 + radius * Math.cos(angle), 180 + radius * Math.sin(angle)];
  };
  const values = axes.map((key, index) => {
    const raw = dimensions[key]?.preference;
    const value = typeof raw === "number" && Number.isFinite(raw) ? Math.max(0, Math.min(1, raw)) : null;
    const confidence = Number(dimensions[key]?.confidence) || 0;
    return { key, index, value, confidence, strength: value === null ? null : dimensionStrength(value, confidence) };
  });
  const strengthLabel = (strength: Strength) => ({
    strong: it ? "forte" : "strong", medium: it ? "media" : "medium", weak: it ? "debole" : "weak",
  })[strength];
  const points = values.filter(item => item.value !== null);
  // Preferences usually cluster in a narrow band, so a fixed 0–100 scale makes
  // every axis look alike. Zoom onto the observed range (in 5-point steps, four
  // rings, never under 20 points) and keep the rings labelled so the scale stays honest.
  const known = points.map(item => item.value! * 100);
  const step = known.length ? Math.min(25, Math.max(5, Math.ceil((Math.max(...known) - Math.min(...known) + 10) / 4 / 5) * 5)) : 25;
  const scaleMin = known.length ? Math.max(0, Math.min(100 - step * 4, Math.floor((Math.min(...known) - 5) / 5) * 5)) : 0;
  const scaleMax = scaleMin + step * 4;
  const innerRadius = scaleMin > 0 ? 22 : 0;
  const radiusOf = (value: number) => innerRadius + (value * 100 - scaleMin) / (scaleMax - scaleMin) * (100 - innerRadius);
  const rings = [0, 1, 2, 3, 4].filter(ring => ring > 0 || scaleMin > 0).map(ring => ({ ring, value: scaleMin + ring * (scaleMax - scaleMin) / 4 }));
  const description = values.map(({ key, value, strength }) => `${labels[key] || key}: ${value === null || strength === null ? (it ? "dati insufficienti" : "insufficient data") : `${Math.round(value * 100)}/100, ${it ? "influenza" : "influence"} ${strengthLabel(strength)}`}`).join("; ");
  return <figure className="taste-signature-wheel" aria-label={it ? "La tua firma sensoriale" : "Your sensory signature"}>
    <svg viewBox="0 0 360 360" role="img" aria-labelledby={`${id}-title ${id}-description`}>
      <title id={`${id}-title`}>{it ? "La forma delle tue preferenze" : "The shape of your preferences"}</title>
      <desc id={`${id}-description`}>{description}</desc>
      <defs><radialGradient id={`${id}-fill`}><stop offset="0" stopColor="#edc583" stopOpacity=".14" /><stop offset="1" stopColor="#edc583" stopOpacity=".55" /></radialGradient></defs>
      {rings.map(({ ring, value }) => <polygon className="taste-wheel-grid" key={ring} points={axes.map((_, index) => point(index, radiusOf(value / 100)).join(",")).join(" ")} />)}
      {values.map(({ key, index, value, strength }) => {
        const [x, y] = point(index, 100);
        const [tx, ty] = point(index, 125);
        return <g key={key} aria-hidden="true"><line className="taste-wheel-axis" x1="180" y1="180" x2={x} y2={y} /><text className={`taste-wheel-label is-${strength || "missing"}`} x={tx} y={ty - 8} textAnchor="middle" dominantBaseline="middle">{key === "aromatic_intensity" ? (it ? "Aromi" : "Aroma") : labels[key] || key}<tspan className="taste-wheel-value" x={tx} dy="17">{value === null ? "–" : `${Math.round(value * 100)}${strength === "weak" ? (it ? " · debole" : " · weak") : ""}`}</tspan></text></g>;
      })}
      {rings.map(({ ring, value }) => {
        const [x, y] = point(.5, radiusOf(value / 100));
        return <text className="taste-wheel-scale" key={`scale-${ring}`} x={x} y={y} textAnchor="middle" dominantBaseline="middle" aria-hidden="true">{Math.round(value)}</text>;
      })}
      {points.length === axes.length ? <>
        <polygon className="taste-wheel-shape" fill={`url(#${id}-fill)`} stroke="none" points={points.map(({ index, value }) => point(index, radiusOf(value!)).join(",")).join(" ")} />
        {/* Each side is solid between two telling dimensions, dashed when one of them is weak. */}
        {points.map((from, position) => {
          const to = points[(position + 1) % points.length];
          const [x1, y1] = point(from.index, radiusOf(from.value!));
          const [x2, y2] = point(to.index, radiusOf(to.value!));
          return <line key={`edge-${from.key}`} className={`taste-wheel-edge${from.strength === "weak" || to.strength === "weak" ? " is-weak" : ""}`} x1={x1} y1={y1} x2={x2} y2={y2} />;
        })}
      </> : null}
      {points.map(({ key, index, value, confidence, strength }) => {
        const [x, y] = point(index, radiusOf(value!));
        return <g key={key}><line className="taste-wheel-ray" x1="180" y1="180" x2={x} y2={y} /><circle className={`taste-wheel-point is-${strength}`} cx={x} cy={y} r={strength === "strong" ? 5 : 4}><title>{labels[key]}: {Math.round(value! * 100)}/100 · {it ? "influenza" : "influence"} {strengthLabel(strength!)} · {it ? "affidabilità" : "confidence"} {Math.round(confidence * 100)}%</title></circle></g>;
      })}
      <circle cx="180" cy="180" r="3" fill="#fff5e6" />
    </svg>
    <ul className="taste-wheel-legend" aria-hidden="true">
      <li><i className="is-strong" />{it ? "Influenza forte" : "Strong influence"}</li>
      <li><i className="is-medium" />{it ? "Media" : "Medium"}</li>
      <li><i className="is-weak" />{it ? "Debole: dato vicino a 50 o poco sostenuto" : "Weak: near 50 or little evidence"}</li>
    </ul>
    <figcaption>{it ? "La tua firma sensoriale" : "Your sensory signature"}<small>{scaleMin === 0 && scaleMax === 100
        ? (it ? "Preferenze personali · scala 0–100" : "Personal preferences · 0–100 scale")
        : (it ? `Preferenze personali · scala ingrandita ${scaleMin}–${scaleMax}` : `Personal preferences · zoomed scale ${scaleMin}–${scaleMax}`)}</small></figcaption>
  </figure>;
}
