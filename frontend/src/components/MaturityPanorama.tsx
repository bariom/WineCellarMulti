import { useState, type CSSProperties } from "react";
import type { TranslationKey } from "../i18n";
import type { Locale, Wine } from "../types";
import { formatBottleCount } from "../domain/cellar";
import "./MaturityPanorama.css";

type MaturityPhase = "past" | "peak" | "ready" | "approaching" | "young";
export type MaturityPanoramaPoint = { year: number; past: number; peak: number; ready: number; approaching: number; young: number };
export type MaturityPanoramaSummary = { readyNow: number; peakSoon: number; waiting: number; past: number; mapped: number };

const phaseOrder: MaturityPhase[] = ["past", "peak", "ready", "approaching", "young"];
const PAST_WINDOW_ANNUAL_SURVIVAL_RATE = 0.85;

function financialRiskForYear(wines: Wine[], year: number) {
  const estimate = wines.reduce((total, wine) => {
    if (!wine.drink_to || year <= wine.drink_to) return total;
    const probability = 1 - PAST_WINDOW_ANNUAL_SURVIVAL_RATE ** (year - wine.drink_to);
    const quantity = Math.max(Number(wine.quantity || 0), 0);
    const value = Math.max(Number(wine.current_value || wine.price || 0), 0) * quantity;
    if (!quantity || !value) return total;
    return {
      exposedValue: total.exposedValue + value,
      expectedLoss: total.expectedLoss + value * probability,
    };
  }, { exposedValue: 0, expectedLoss: 0 });
  return { ...estimate, averageRisk: estimate.exposedValue ? estimate.expectedLoss / estimate.exposedValue : 0 };
}

function financialNumberLocale(locale: Locale) {
  return locale === "it" ? "it-CH" : "en-CH";
}

function financialMoney(value: number, locale: Locale) {
  return `CHF ${new Intl.NumberFormat(financialNumberLocale(locale), { maximumFractionDigits: 0 }).format(value)}`;
}

function financialPercentage(value: number, locale: Locale) {
  return `${new Intl.NumberFormat(financialNumberLocale(locale), { maximumFractionDigits: 0 }).format(value)}%`;
}

function financialRiskLabels(locale: Locale) {
  return locale === "it" ? {
    title: "Rischio finanziario se le bottiglie restano in cantina",
    expectedLoss: "Perdita stimata",
    exposedValue: "Valore oltre finestra massima",
    averageRisk: "Rischio medio di deterioramento",
    help: "Scenario gestionale ipotizzando che le bottiglie restino in cantina e che una bottiglia deteriorata perda tutto il suo valore: il rischio parte dopo l'anno massimo di beva al 15% e cresce in modo cumulativo ogni anno successivo. Conservazione e singola bottiglia possono cambiare l'esito; non è una perizia.",
  } : {
    title: "Financial risk if bottles remain in the cellar",
    expectedLoss: "Estimated loss",
    exposedValue: "Value past maximum window",
    averageRisk: "Average deterioration risk",
    help: "Management scenario assuming the bottles remain in the cellar and a deteriorated bottle loses its full value: risk starts after the maximum drinking year at 15% and increases cumulatively each additional year. Storage conditions and the individual bottle may change the outcome; this is not an appraisal.",
  };
}

function panoramaLabels(locale: Locale) {
  return locale === "it"
    ? { approaching: "In avvicinamento", potentialCaption: "in una fase di massima espressione." }
    : { approaching: "Approaching peak", potentialCaption: "in a phase of maximum expression." };
}

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

export function MaturityPanorama({ points, currentYear, summary, riskWines, riskYears, t, locale }: { points: MaturityPanoramaPoint[]; currentYear: number; summary: MaturityPanoramaSummary; riskWines: Wine[]; riskYears: number[]; t: (key: TranslationKey) => string; locale: Locale }) {
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
  const localLabels = panoramaLabels(locale);
  const phaseLabels: Record<MaturityPhase, string> = { past: t("pastWindow"), peak: t("peakNow"), ready: t("readyToDrink"), approaching: localLabels.approaching, young: t("youngWine") };
  const financialRisk = riskYears.map((year) => ({ year, ...financialRiskForYear(riskWines, year) }));
  const currentFinancialRisk = financialRisk.find((point) => point.year === currentYear) || financialRisk[0];
  const maxExpectedLoss = Math.max(...financialRisk.map((point) => point.expectedLoss), 1);
  const riskLabels = financialRiskLabels(locale);

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
      <p className="maturity-panorama-callout"><strong>{t("peakLabel")} {potentialStart}—{potentialEnd}</strong><span>{formatBottleCount(activeAt(points[bestIndex]), locale)} {t("bottles").toLowerCase()} {localLabels.potentialCaption}</span></p>
      <section className="maturity-financial-risk" aria-label={riskLabels.title}>
        <div className="maturity-financial-risk-heading"><span>{riskLabels.title}</span><strong>{currentYear}</strong></div>
        <div className="maturity-financial-risk-timeline" style={{ "--maturity-risk-year-count": riskYears.length } as CSSProperties}>
          <div className="maturity-financial-risk-years" aria-hidden="true"><span />{riskYears.map((year) => <span key={year}>{year}</span>)}</div>
          <div className="maturity-financial-risk-row">
            <span className="maturity-financial-risk-label">{riskLabels.expectedLoss}</span>
            {financialRisk.map((point) => {
              const label = `${point.year}: ${riskLabels.expectedLoss} ${financialMoney(point.expectedLoss, locale)}; ${riskLabels.exposedValue} ${financialMoney(point.exposedValue, locale)}; ${riskLabels.averageRisk} ${financialPercentage(point.averageRisk * 100, locale)}`;
              return <span className="maturity-financial-risk-cell" key={point.year} style={{ "--financial-risk-weight": `${Math.round((point.expectedLoss / maxExpectedLoss) * 72)}%` } as CSSProperties} title={label} aria-label={label}>{point.expectedLoss ? new Intl.NumberFormat(financialNumberLocale(locale), { notation: "compact", maximumFractionDigits: 1 }).format(point.expectedLoss) : "—"}</span>;
            })}
          </div>
        </div>
        <div className="maturity-financial-risk-summary">
          <div><span>{riskLabels.exposedValue}</span><strong>{financialMoney(currentFinancialRisk.exposedValue, locale)}</strong></div>
          <div><span>{riskLabels.expectedLoss}</span><strong>{financialMoney(currentFinancialRisk.expectedLoss, locale)}</strong></div>
          <div><span>{riskLabels.averageRisk}</span><strong>{financialPercentage(currentFinancialRisk.averageRisk * 100, locale)}</strong></div>
        </div>
        <p className="maturity-financial-risk-help">{riskLabels.help}</p>
      </section>
    </section>
  );
}
