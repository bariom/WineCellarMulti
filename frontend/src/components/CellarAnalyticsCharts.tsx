// Value and stock distribution charts for the cellar insight views.
// Loaded on demand from App so they stay out of the main application chunk.
import { useState } from "react";
import type { Locale, ValueBreakdownItem } from "../types";
import { formatBottleCount, formatPercentage } from "../domain/cellar";
import { displayValue, translate } from "../i18n";
import { formatMoney, wineTone } from "./panelSupport";

function breakdownColor(label: string, index: number, mode: "type" | "region") {
  if (mode === "type") {
    const tone = wineTone(label);
    if (tone === "red") return "#a52d4a";
    if (tone === "white") return "#d9b33d";
    if (tone === "sparkling") return "#c3a34e";
    if (tone === "rose") return "#d78197";
    if (tone === "sweet") return "#d98936";
    return "#5b8f7d";
  }
  // Regions have no colour of their own: categorical series from tokens.css, in fixed order.
  const palette = ["var(--chart-1)", "var(--chart-2)", "var(--chart-3)", "var(--chart-4)", "var(--chart-5)", "var(--chart-6)"];
  // Never cycle hues: the smallest regions beyond the sixth get neutral greys,
  // named by the legend, instead of repeating the first series' colours.
  if (index < palette.length) return palette[index];
  return `color-mix(in srgb, var(--text-muted) ${index === palette.length ? 75 : 45}%, var(--surface))`;
}

function breakdownDonutSegments(items: ValueBreakdownItem[], mode: "type" | "region") {
  const total = items.reduce((sum, item) => sum + item.value, 0);
  if (!total) return [];
  let start = 0;
  return items.map((item, index) => {
    const size = (item.value / total) * 100;
    const segment = {
      ...item,
      color: breakdownColor(item.label, index, mode),
      start,
      end: start + size,
      pct: size,
    };
    start += size;
    return segment;
  });
}

function BreakdownDonut({
  items,
  mode,
  locale,
}: {
  items: ValueBreakdownItem[];
  mode: "type" | "region";
  locale: Locale;
}) {
  const segments = breakdownDonutSegments(items, mode);
  if (!segments.length) return null;
  const background = `conic-gradient(${segments.map((segment) => `${segment.color} ${segment.start}% ${segment.end}%`).join(", ")})`;
  return (
    <div className="breakdown-donut-wrap">
      <div
        className="breakdown-donut"
        style={{ background }}
        role="img"
        aria-label={translate(locale, mode === "type" ? "typesLabel" : "regionsLabel")}
      >
        <div className="breakdown-donut-hole">
          <strong>{segments.length}</strong>
          <span>{translate(locale, mode === "type" ? "typesLabel" : "regionsLabel")}</span>
        </div>
      </div>
    </div>
  );
}

export function CellarDonutAnalytics({
  eyebrow,
  title,
  items,
  locale,
  metric,
  onSelect,
}: {
  eyebrow: string;
  title: string;
  items: ValueBreakdownItem[];
  locale: Locale;
  metric: "value" | "bottles";
  onSelect: (item: ValueBreakdownItem) => void;
}) {
  const total = items.reduce((sum, item) => sum + item.value, 0);
  return (
    <article className="cellar-analytics-card cellar-donut-card">
      <div className="cellar-analytics-heading"><span>{eyebrow}</span><h3>{title}</h3></div>
      <div className="cellar-donut-layout">
        <BreakdownDonut items={items} mode="type" locale={locale} />
        <div className="cellar-analytics-legend">
          {items.map((item, index) => {
            const pct = total ? (item.value / total) * 100 : 0;
            const label = displayValue(item.label, locale, "type");
            const formattedMetric = metric === "value" ? formatMoney(item.value, "CHF", locale) : formatBottleCount(item.value, locale);
            return (
              <button type="button" key={item.label} title={`${label}: ${formatPercentage(pct, locale, 1)} · ${formattedMetric}`} onClick={() => onSelect(item)}>
                <i style={{ backgroundColor: breakdownColor(item.label, index, "type") }} aria-hidden="true" />
                <span>{label}</span>
                <strong>{formatPercentage(pct, locale, 0)}</strong>
                <small>{formattedMetric}</small>
              </button>
            );
          })}
        </div>
      </div>
    </article>
  );
}

export function CellarBarAnalytics({
  eyebrow,
  title,
  items,
  locale,
  metric,
  onSelect,
}: {
  eyebrow: string;
  title: string;
  items: ValueBreakdownItem[];
  locale: Locale;
  metric: "value" | "wines";
  onSelect: (item: ValueBreakdownItem) => void;
}) {
  const total = items.reduce((sum, item) => sum + item.value, 0);
  const maximum = Math.max(...items.map((item) => item.value), 1);
  return (
    <article className="cellar-analytics-card cellar-bars-card">
      <div className="cellar-analytics-heading"><span>{eyebrow}</span><h3>{title}</h3></div>
      <div className="cellar-horizontal-bars">
        {items.map((item, index) => {
          const pct = total ? (item.value / total) * 100 : 0;
          const formattedMetric = metric === "value" ? formatMoney(item.value, "CHF", locale) : formatBottleCount(item.value, locale);
          return (
            <button type="button" key={item.label} title={`${item.label}: ${formatPercentage(pct, locale, 1)} · ${formattedMetric}`} onClick={() => onSelect(item)}>
              <span className="cellar-bar-label">{item.label}</span>
              <strong>{formatPercentage(pct, locale, 0)}</strong>
              <small>{formattedMetric}</small>
              <span className="cellar-bar-track"><i style={{ width: `${Math.max((item.value / maximum) * 100, 4)}%`, backgroundColor: breakdownColor(item.label, index, "region") }} /></span>
            </button>
          );
        })}
      </div>
    </article>
  );
}

type WineValueConstellationItem = ValueBreakdownItem & { bottles: number };

export function WineValueConstellation({
  items,
  locale,
  onOpen,
}: {
  items: WineValueConstellationItem[];
  locale: Locale;
  onOpen: (item: WineValueConstellationItem) => void;
}) {
  const [activeIndex, setActiveIndex] = useState(0);
  const total = items.reduce((sum, item) => sum + item.value, 0);
  if (!total) return null;

  const active = items[Math.min(activeIndex, items.length - 1)];
  const circumference = 2 * Math.PI * 76;
  let offset = 0;
  const segments = items.map((item, index) => {
    const share = item.value / total;
    const dash = Math.max(circumference * share - 4, 2);
    const segment = { ...item, index, share, dash, offset, color: breakdownColor(item.label, index, "type") };
    offset += circumference * share;
    return segment;
  });
  const typeLabel = (item: WineValueConstellationItem) => displayValue(item.label, locale, "type");
  const select = (index: number) => setActiveIndex(index);

  return (
    <div className="wine-value-constellation">
      <div className="wine-value-constellation-plot" role="group" aria-label={locale === "it" ? "Composizione del valore per tipologia" : "Value composition by wine type"}>
        <svg viewBox="0 0 200 200" aria-hidden="true">
          <circle className="wine-value-constellation-track" cx="100" cy="100" r="76" />
          {segments.map((segment) => (
            <circle
              key={segment.label}
              className={segment.index === activeIndex ? "active" : ""}
              cx="100"
              cy="100"
              r="76"
              stroke={segment.color}
              strokeDasharray={`${segment.dash} ${circumference}`}
              strokeDashoffset={-segment.offset}
              transform="rotate(-90 100 100)"
              onMouseEnter={() => select(segment.index)}
              onClick={() => select(segment.index)}
            />
          ))}
        </svg>
        <div className="wine-value-constellation-core">
          <span>{locale === "it" ? "Valore tipologie" : "Type value"}</span>
          <strong>{formatMoney(total, "CHF", locale)}</strong>
          <small>{items.length} {locale === "it" ? "tipologie" : "types"}</small>
        </div>
      </div>
      <div className="wine-value-constellation-detail">
        <i style={{ backgroundColor: breakdownColor(active.label, activeIndex, "type") }} aria-hidden="true" />
        <span>{typeLabel(active)}</span>
        <strong>{formatMoney(active.value, "CHF", locale)}</strong>
        <small>{formatPercentage((active.value / total) * 100, locale, 1)} · {formatBottleCount(active.bottles, locale)} {locale === "it" ? "bottiglie" : "bottles"}</small>
        <button type="button" className="secondary compact" onClick={() => onOpen(active)}>
          {locale === "it" ? "Apri in cantina" : "Open in cellar"}
        </button>
      </div>
      <div className="wine-value-constellation-legend">
        {segments.map((segment) => (
          <button
            type="button"
            className={segment.index === activeIndex ? "active" : ""}
            key={segment.label}
            onClick={() => select(segment.index)}
          >
            <i style={{ backgroundColor: segment.color }} aria-hidden="true" />
            <span>{typeLabel(segment)}</span>
            <strong>{formatPercentage(segment.share * 100, locale, 0)}</strong>
          </button>
        ))}
      </div>
      <div className="wine-value-constellation-density">
        <span>{locale === "it" ? "Densità di valore" : "Value density"}</span>
        <small>{locale === "it" ? "Valore medio per bottiglia, per tipologia" : "Average value per bottle, by type"}</small>
        <div>
          {segments.map((segment) => (
            <button
              type="button"
              className={segment.index === activeIndex ? "active" : ""}
              key={segment.label}
              onClick={() => select(segment.index)}
            >
              <i style={{ backgroundColor: segment.color }} aria-hidden="true" />
              <span>{typeLabel(segment)}</span>
              <strong>{formatMoney(segment.bottles ? segment.value / segment.bottles : 0, "CHF", locale)}</strong>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
