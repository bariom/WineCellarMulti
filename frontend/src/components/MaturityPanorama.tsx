import { useState } from "react";
import type { TranslationKey } from "../i18n";
import type { Locale } from "../types";
import { formatBottleCount } from "../domain/cellar";
import "./MaturityPanorama.css";

type MaturityPhase = "past" | "peak" | "ready" | "approaching" | "young";
export type MaturityPanoramaPoint = { year: number; past: number; peak: number; ready: number; approaching: number; young: number };
export type MaturityPanoramaSummary = { readyNow: number; peakSoon: number; waiting: number; past: number; mapped: number };

const phaseOrder: MaturityPhase[] = ["past", "peak", "ready", "approaching", "young"];

function bandPath(points: MaturityPanoramaPoint[], phase: MaturityPhase, before: MaturityPhase[]) {
  const left = 28;
  const right = 972;
  const baseY = 248;
  const height = 184;
  const x = (index: number) => left + (index / Math.max(points.length - 1, 1)) * (right - left);
  const total = (point: MaturityPanoramaPoint) => phaseOrder.reduce((sum, key) => sum + point[key], 0) || 1;
  const y = (point: MaturityPanoramaPoint, keys: MaturityPhase[]) => baseY - (keys.reduce((sum, key) => sum + point[key], 0) / total(point)) * height;
  const upper = points.map((point, index) => `${index ? "L" : "M"}${x(index)} ${y(point, [...before, phase])}`).join(" ");
  const lower = [...points].reverse().map((point, reverseIndex) => {
    const index = points.length - 1 - reverseIndex;
    return `L${x(index)} ${y(point, before)}`;
  }).join(" ");
  return `${upper} ${lower} Z`;
}

export function MaturityPanorama({ points, currentYear, summary, t, locale }: { points: MaturityPanoramaPoint[]; currentYear: number; summary: MaturityPanoramaSummary; t: (key: TranslationKey) => string; locale: Locale }) {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const currentIndex = Math.max(points.findIndex((point) => point.year === currentYear), 0);
  const currentPoint = points[currentIndex];
  const activeAt = (point: MaturityPanoramaPoint) => point.peak + point.ready;
  const bestIndex = points.reduce((best, point, index) => activeAt(point) > activeAt(points[best]) ? index : best, 0);
  const potentialStart = points[bestIndex]?.year || currentYear;
  const potentialEnd = points[Math.min(bestIndex + 2, points.length - 1)]?.year || potentialStart;
  const x = (index: number) => 28 + (index / Math.max(points.length - 1, 1)) * 944;
  const activeIndex = hoveredIndex ?? currentIndex;
  const activePoint = points[activeIndex] || currentPoint;
  const activeTotal = phaseOrder.reduce((sum, phase) => sum + (activePoint?.[phase] || 0), 0);
  const hoverZoneWidth = 944 / Math.max(points.length - 1, 1);
  const summaryItems = [
    { label: t("readyToDrink"), value: summary.readyNow, tone: "ready" },
    { label: `${t("peakLabel")} +2`, value: summary.peakSoon, tone: "peak" },
    { label: t("youngWine"), value: summary.waiting, tone: "young" },
    { label: t("pastWindow"), value: summary.past, tone: "past" },
  ];
  const phaseLabels: Record<MaturityPhase, string> = { past: t("pastWindow"), peak: t("peakNow"), ready: t("readyToDrink"), approaching: t("maturityApproaching"), young: t("youngWine") };

  return (
    <section className="maturity-panorama" aria-label={t("drinkingWindow")}>
      <div className="maturity-panorama-kpis">
        {summaryItems.map((item) => (
          <div className={`maturity-panorama-kpi tone-${item.tone}`} key={item.label}>
            <span>{item.label}</span>
            <strong>{formatBottleCount(item.value, locale)}</strong>
            <small>{summary.mapped ? `${Math.round((item.value / summary.mapped) * 100)}% ${t("bottles").toLowerCase()}` : "—"}</small>
          </div>
        ))}
      </div>
      <div className="maturity-stream-card">
        <div className="maturity-stream-heading">
          <span>{t("maturityMap")}</span>
          <strong>{points[0]?.year}—{points[points.length - 1]?.year}</strong>
        </div>
        <div className="maturity-stream-plot" aria-label={`${t("drinkingWindow")}: ${t("peakNow")} ${formatBottleCount(currentPoint?.peak || 0, locale)} ${t("bottles").toLowerCase()} nel ${currentYear}.`} onMouseLeave={() => setHoveredIndex(null)}>
          <svg viewBox="0 0 1000 280" preserveAspectRatio="none" aria-hidden="true">
            <defs>
              {phaseOrder.map((phase) => <linearGradient id={`maturity-stream-${phase}`} key={phase} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" /><stop offset="100%" stopOpacity="0.42" /></linearGradient>)}
            </defs>
            {phaseOrder.map((phase, index) => <path className={`maturity-stream-band maturity-stream-band-${phase}`} d={bandPath(points, phase, phaseOrder.slice(0, index))} fill={`url(#maturity-stream-${phase})`} key={phase} />)}
            <path className="maturity-stream-today" d={`M${x(currentIndex)} 18 V252`} />
            <circle className="maturity-stream-today-dot" cx={x(currentIndex)} cy="18" r="5" />
            <rect className="maturity-stream-potential" x={x(bestIndex)} y="22" width={Math.max(x(Math.min(bestIndex + 2, points.length - 1)) - x(bestIndex), 24)} height="226" rx="12" />
            <path className="maturity-stream-hover-line" d={`M${x(activeIndex)} 28 V248`} />
            {points.map((point, index) => <rect className="maturity-stream-hover-zone" key={point.year} x={Math.max(0, x(index) - hoverZoneWidth / 2)} y="0" width={hoverZoneWidth} height="252" tabIndex={0} role="button" aria-label={`${point.year}: ${formatBottleCount(phaseOrder.reduce((sum, phase) => sum + point[phase], 0), locale)} ${t("bottles").toLowerCase()}`} onMouseEnter={() => setHoveredIndex(index)} onFocus={() => setHoveredIndex(index)} onBlur={() => setHoveredIndex(null)} />)}
          </svg>
          <span className="maturity-stream-today-label" style={{ left: `${(x(currentIndex) / 1000) * 100}%` }}>{t("currentYear")}</span>
          <span className="maturity-stream-potential-label" style={{ left: `${(x(bestIndex) / 1000) * 100}%` }}>{t("peakLabel")} {potentialStart}—{potentialEnd}</span>
          <div className={`maturity-stream-tooltip${activeIndex < 2 ? " align-start" : activeIndex > points.length - 3 ? " align-end" : ""}`} style={{ left: `${(x(activeIndex) / 1000) * 100}%` }}>
            <strong>{activePoint?.year}</strong><span>{formatBottleCount(activeTotal, locale)} {t("bottles").toLowerCase()}</span>
            {phaseOrder.slice().reverse().map((phase) => <small className={`tone-${phase}`} key={phase}>{phaseLabels[phase]} <b>{formatBottleCount(activePoint?.[phase] || 0, locale)}</b><em>{activeTotal ? `${Math.round(((activePoint?.[phase] || 0) / activeTotal) * 100)}%` : "0%"}</em></small>)}
          </div>
          <div className="maturity-stream-years" aria-hidden="true">
            {points.map((point) => <span className={point.year === currentYear ? "current" : ""} key={point.year}>{point.year}</span>)}
          </div>
        </div>
        <div className="maturity-stream-legend">
          {[...phaseOrder].reverse().map((phase) => <span className={`tone-${phase}`} key={phase}>{phaseLabels[phase]}</span>)}
        </div>
      </div>
      <p className="maturity-panorama-callout"><strong>{t("peakLabel")} {potentialStart}—{potentialEnd}</strong><span>{formatBottleCount(activeAt(points[bestIndex]), locale)} {t("bottles").toLowerCase()} {t("maturityPotentialCaption")}</span></p>
    </section>
  );
}
