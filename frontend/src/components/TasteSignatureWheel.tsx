import { useId } from "react";
import type { Locale, TasteProfile } from "../types";

const axes = ["body", "acidity", "tannin", "sweetness", "aromatic_intensity", "fruit", "wood", "spice", "minerality"];

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
    const value = dimensions[key]?.preference;
    return { key, index, value: typeof value === "number" && Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : null };
  });
  const points = values.filter(item => item.value !== null);
  const description = values.map(({ key, value }) => `${labels[key] || key}: ${value === null ? (it ? "dati insufficienti" : "insufficient data") : `${Math.round(value * 100)}/100`}`).join("; ");
  return <figure className="taste-signature-wheel" aria-label={it ? "La tua firma sensoriale" : "Your sensory signature"}>
    <svg viewBox="0 0 360 360" role="img" aria-labelledby={`${id}-title ${id}-description`}>
      <title id={`${id}-title`}>{it ? "La forma delle tue preferenze" : "The shape of your preferences"}</title>
      <desc id={`${id}-description`}>{description}</desc>
      <defs><radialGradient id={`${id}-fill`}><stop offset="0" stopColor="#edc583" stopOpacity=".14" /><stop offset="1" stopColor="#edc583" stopOpacity=".55" /></radialGradient></defs>
      {[.25, .5, .75, 1].map(scale => <polygon className="taste-wheel-grid" key={scale} points={axes.map((_, index) => point(index, 100 * scale).join(",")).join(" ")} />)}
      {values.map(({ key, index }) => {
        const [x, y] = point(index, 100);
        const [tx, ty] = point(index, 125);
        return <g key={key} aria-hidden="true"><line className="taste-wheel-axis" x1="180" y1="180" x2={x} y2={y} /><text x={tx} y={ty} textAnchor="middle" dominantBaseline="middle">{key === "aromatic_intensity" ? (it ? "Aromi" : "Aroma") : labels[key] || key}</text></g>;
      })}
      {points.length === axes.length ? <polygon className="taste-wheel-shape" fill={`url(#${id}-fill)`} points={points.map(({ index, value }) => point(index, value! * 100).join(",")).join(" ")} /> : null}
      {points.map(({ key, index, value }) => {
        const [x, y] = point(index, value! * 100);
        return <g key={key}><line className="taste-wheel-ray" x1="180" y1="180" x2={x} y2={y} /><circle className="taste-wheel-point" cx={x} cy={y} r="4"><title>{labels[key]}: {Math.round(value! * 100)}/100</title></circle></g>;
      })}
      <circle cx="180" cy="180" r="3" fill="#fff5e6" />
    </svg>
    <figcaption>{it ? "La tua firma sensoriale" : "Your sensory signature"}<small>{it ? "Preferenze personali · scala 0–100" : "Personal preferences · 0–100 scale"}</small></figcaption>
  </figure>;
}
