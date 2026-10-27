import { lazy, Suspense, type ReactNode } from "react";
import { DashboardCarousel } from "../../components/AppPanels";
import { formatDisplayDate, formatMoney, wineTone } from "../../components/panelSupport";
import { formatBottleCount, wineUnitValue } from "../../domain/cellar";
import { translate, type TranslationKey } from "../../i18n";
import type { Locale, QuickWineFilter, Wine } from "../../types";

const TimeSeriesChart = lazy(() => import("../../components/TimeSeriesChart"));

type ValueDashboardProps = {
  locale: Locale;
  cellarStats: { bottles: number; totalValue: number; missingValue: number; myBottles: number; myValue: number; sharedBottles: number; sharedValue: number };
  purchaseValueDelta: number | null;
  purchaseValueDeltaPct: number | null;
  paidBottleCount: number;
  portfolioValuePoints: Array<{ recorded_at: string; timestampMs: number; numericValue: number }>;
  applyQuickWineFilter: (filter: QuickWineFilter) => void;
  valueByCanonicalType: unknown[];
  renderValueTypeWidget: () => ReactNode;
  renderTopValueWidget: () => ReactNode;
  renderValueRegionWidget: () => ReactNode;
  renderValueProducerWidget: () => ReactNode;
  topValueWines: Wine[];
  missingValueWines: Wine[];
  openWineFromDashboard: (wine: Wine) => void;
};

/** Dashboard → Value: the portfolio over time, where the value sits, and wines still without one. */
export default function ValueDashboard({
  locale,
  cellarStats,
  purchaseValueDelta,
  purchaseValueDeltaPct,
  paidBottleCount,
  portfolioValuePoints,
  applyQuickWineFilter,
  valueByCanonicalType,
  renderValueTypeWidget,
  renderTopValueWidget,
  renderValueRegionWidget,
  renderValueProducerWidget,
  topValueWines,
  missingValueWines,
  openWineFromDashboard,
}: ValueDashboardProps) {
  const t = (key: TranslationKey) => translate(locale, key);
  const portfolioValueFirst = portfolioValuePoints[0];
  const portfolioValueLast = portfolioValuePoints[portfolioValuePoints.length - 1];
  const portfolioValueLow = portfolioValuePoints.length
    ? Math.min(...portfolioValuePoints.map((point) => point.numericValue))
    : null;
  const portfolioValueHigh = portfolioValuePoints.length
    ? Math.max(...portfolioValuePoints.map((point) => point.numericValue))
    : null;
  return (
    <>
      <DashboardCarousel locale={locale} label={t("valueFocus")} className="value-dashboard-carousel">
        <article className="dashboard-card wide-card portfolio-value-explorer">
          <div className="card-heading">
            <div>
              <span>{t("totalValue")}</span>
              <h2>{formatMoney(cellarStats.totalValue, "CHF", locale)}</h2>
            </div>
            <strong>{formatBottleCount(cellarStats.bottles, locale)}</strong>
          </div>
          <div className="portfolio-value-explorer-summary">
            <div>
              <span>{locale === "it" ? "Rendimento vs acquisto" : "Return vs purchase"}</span>
              <strong className={purchaseValueDelta !== null && purchaseValueDelta < 0 ? "negative" : "positive"}>
                {purchaseValueDelta === null ? "—" : `${purchaseValueDelta >= 0 ? "+" : ""}${formatMoney(purchaseValueDelta, "CHF", locale)}${purchaseValueDeltaPct === null ? "" : ` · ${purchaseValueDeltaPct >= 0 ? "+" : ""}${purchaseValueDeltaPct.toFixed(1)}%`}`}
              </strong>
              <small>{paidBottleCount ? (locale === "it" ? `Su ${formatBottleCount(paidBottleCount, locale)} bottiglie con prezzo d'acquisto` : `Across ${formatBottleCount(paidBottleCount, locale)} bottles with a purchase price`) : (locale === "it" ? "Nessun prezzo d'acquisto disponibile" : "No purchase price available")}</small>
            </div>
            <div className="portfolio-value-explorer-period">
              <span>{locale === "it" ? "Intervallo registrato" : "Recorded range"}</span>
              <strong>{portfolioValueFirst && portfolioValueLast ? `${formatDisplayDate(portfolioValueFirst.recorded_at)} – ${formatDisplayDate(portfolioValueLast.recorded_at)}` : "—"}</strong>
            </div>
          </div>
          {portfolioValuePoints.length >= 2 ? (
            <Suspense fallback={<div className="portfolio-value-chart-loading" aria-label={t("valueEvolution")} />}>
              <div className="portfolio-value-chart">
                <TimeSeriesChart
                  ariaLabel={t("valueEvolution")}
                  locale={locale}
                  currency="CHF"
                  height={282}
                  mobileHeight={206}
                  points={portfolioValuePoints.map((point) => ({ timestampMs: point.timestampMs, value: point.numericValue }))}
                />
              </div>
            </Suspense>
          ) : (
            <p className="portfolio-value-chart-empty">{locale === "it" ? "Servono almeno due rilevazioni per mostrare l'evoluzione del portafoglio." : "At least two records are needed to show the portfolio trend."}</p>
          )}
          <div className="portfolio-value-insights">
            <button type="button" onClick={() => applyQuickWineFilter("mine")}>
              <span>{t("myBottles")}</span>
              <strong>{formatMoney(cellarStats.myValue, "CHF", locale)}</strong>
              <small>{formatBottleCount(cellarStats.myBottles, locale)} {t("bottles").toLowerCase()}</small>
            </button>
            <button type="button" onClick={() => applyQuickWineFilter("shared")}>
              <span>{t("sharedBottles")}</span>
              <strong>{formatMoney(cellarStats.sharedValue, "CHF", locale)}</strong>
              <small>{formatBottleCount(cellarStats.sharedBottles, locale)} {t("bottles").toLowerCase()}</small>
            </button>
            <div>
              <span>{locale === "it" ? "Minimo / massimo" : "Low / high"}</span>
              <strong>{portfolioValueLow === null || portfolioValueHigh === null ? "—" : `${formatMoney(portfolioValueLow, "CHF", locale)} – ${formatMoney(portfolioValueHigh, "CHF", locale)}`}</strong>
              <small>{t("averageBottleValue")}: {formatMoney(cellarStats.bottles ? cellarStats.totalValue / cellarStats.bottles : 0, "CHF", locale)}</small>
            </div>
          </div>
        </article>
        {valueByCanonicalType.length ? renderValueTypeWidget() : null}
        {renderTopValueWidget()}
        {renderValueRegionWidget()}
        {renderValueProducerWidget()}
        <article className="dashboard-card top-value-list-mobile">
          <div className="card-heading">
            <div>
              <span>{t("valueFocus")}</span>
              <h2>{t("wines")}</h2>
            </div>
          </div>
          <div className="action-list">
            {topValueWines.map((wine) => (
              <button type="button" className="action-row" key={wine.id} onClick={() => openWineFromDashboard(wine)}>
                <span><i className={`wine-dot tone-${wineTone(wine.type)}`} />{wine.name}</span>
                <strong>{formatMoney(wineUnitValue(wine), "CHF", locale)}</strong>
              </button>
            ))}
          </div>
        </article>
        <article className="dashboard-card">
          <div className="card-heading">
            <div>
              <span>{t("missingValue")}</span>
              <h2>{t("dataQuality")}</h2>
            </div>
            <strong>{cellarStats.missingValue}</strong>
          </div>
          <div className="action-list">
            {missingValueWines.length ? missingValueWines.map((wine) => (
              <button type="button" className="action-row" key={wine.id} onClick={() => openWineFromDashboard(wine)}>
                <span><i className={`wine-dot tone-${wineTone(wine.type)}`} />{wine.name}</span>
                <strong>{t("value")}</strong>
              </button>
            )) : <p className="empty-state">{t("noActionItems")}</p>}
          </div>
        </article>
      </DashboardCarousel>
    </>
  );
}
