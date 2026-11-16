import { lazy, Suspense, useEffect, useState, type ReactNode } from "react";
import { WineValueConstellation } from "../../components/CellarAnalyticsCharts";
import { formatDisplayDate, formatMoney, wineTone } from "../../components/panelSupport";
import { formatBottleCount, formatPercentage, type CellarValueParts, type CellarValueSplit } from "../../domain/cellar";
import { localizeRegion } from "../../domain/places";
import { LOSS_EXIT_TYPES } from "../../domain/stockExits";
import { api } from "../../services/api";
import { translate, type TranslationKey } from "../../i18n";
import type { Locale, QuickWineFilter, StockMovement, Wine } from "../../types";

const TimeSeriesChart = lazy(() => import("../../components/TimeSeriesChart"));

type ValueGroup = { label: string; value: number; bottles?: number };

type ValueDashboardProps = {
  locale: Locale;
  cellarStats: { missingValue: number; sharedBottles: number; valueSplit: CellarValueSplit };
  portfolioValuePoints: Array<{ recorded_at: string; timestampMs: number; numericValue: number }>;
  applyQuickWineFilter: (filter: QuickWineFilter) => void;
  valueByCanonicalType: Array<ValueGroup & { bottles: number }>;
  valueByRegion: ValueGroup[];
  valueByProducer: ValueGroup[];
  onOpenType: (label: string) => void;
  onOpenRegion: (label: string) => void;
  renderTopValueWidget: () => ReactNode;
  /** The most valuable wines with the user's bottles of each, for the compact list on phones. */
  topValueWines: Array<{ wine: Wine; unitValue: number; bottles: number }>;
  missingValueWines: Wine[];
  openWineFromDashboard: (wine: Wine) => void;
  /** The user's share of the value of these bottles of a wine, at today's value. */
  lossValue: (wineId: string, bottles: number) => number;
  onOpenExits: () => void;
};

type Basis = "mine" | "all";
type Period = "3" | "6" | "all";
type Dimension = "type" | "region" | "producer";

/**
 * Dashboard → Value. The hero above carries the headline (the user's shares); this page
 * answers, in order: where the value sits, how it moved, what it is made of, what to do.
 */
export default function ValueDashboard({
  locale,
  cellarStats,
  portfolioValuePoints,
  applyQuickWineFilter,
  valueByCanonicalType,
  valueByRegion,
  valueByProducer,
  onOpenType,
  onOpenRegion,
  renderTopValueWidget,
  topValueWines,
  missingValueWines,
  openWineFromDashboard,
  lossValue,
  onOpenExits,
}: ValueDashboardProps) {
  const t = (key: TranslationKey) => translate(locale, key);
  const it = locale === "it";
  const [basis, setBasis] = useState<Basis>("mine");
  const [period, setPeriod] = useState<Period>("all");
  const [dimension, setDimension] = useState<Dimension>("type");
  const { valueSplit } = cellarStats;
  const [movements, setMovements] = useState<StockMovement[]>([]);
  useEffect(() => {
    let active = true;
    api<StockMovement[]>("/api/v1/inventory/movements?limit=500")
      .then((items) => { if (active) setMovements(items); })
      .catch(() => undefined);
    return () => { active = false; };
  }, []);
  // Losses: bottles broken or faulty in the last twelve months, on the user's share at today's value.
  const lossesSince = (() => {
    const date = new Date();
    date.setFullYear(date.getFullYear() - 1);
    return date.toISOString().slice(0, 10);
  })();
  const losses = movements
    .filter((movement) => (LOSS_EXIT_TYPES as string[]).includes(movement.movement_type) && movement.occurred_on >= lossesSince)
    .reduce((sum, movement) => ({ bottles: sum.bottles - movement.quantity_delta, value: sum.value + lossValue(movement.wine_id, -movement.quantity_delta) }), { bottles: 0, value: 0 });
  const parts: CellarValueParts = basis === "mine" || !valueSplit.shared ? valueSplit.mine : valueSplit.total;
  const bottlesLabel = (count: number) => `${formatBottleCount(count, locale)} ${t("bottles").toLowerCase()}`;
  const signedMoney = (value: number) => `${value >= 0 ? "+" : ""}${formatMoney(value, "CHF", locale)}`;

  // Where the value sits: one bar, in the cellar and awaiting delivery, en primeur hatched.
  const whereTotal = parts.cellarValue + parts.incomingValue;
  const pct = (value: number) => (whereTotal > 0 ? (value / whereTotal) * 100 : 0);
  const primeurDelta = parts.primeurCost > 0 ? parts.primeurPricedValue - parts.primeurCost : null;
  const primeurDeltaPct = primeurDelta !== null ? (primeurDelta / parts.primeurCost) * 100 : null;

  // The trend over the chosen period; the recorded range becomes the chart's caption.
  const since = period === "all" ? null : (() => {
    const date = new Date();
    date.setMonth(date.getMonth() - Number(period));
    return date.getTime();
  })();
  const trendPoints = portfolioValuePoints.filter((point) => since === null || point.timestampMs >= since);
  const trendFirst = trendPoints[0];
  const trendLast = trendPoints[trendPoints.length - 1];
  const trendDelta = trendFirst && trendLast && trendPoints.length >= 2 ? trendLast.numericValue - trendFirst.numericValue : null;

  const groups: ValueGroup[] = dimension === "region" ? valueByRegion : valueByProducer;
  const groupsTotal = groups.reduce((sum, item) => sum + item.value, 0);
  const groupsMax = Math.max(...groups.map((item) => item.value), 1);
  const groupLabel = (label: string) => (dimension === "region" ? localizeRegion(label, locale) || label : label);

  const basisButton = (value: Basis, label: string) => (
    <button type="button" aria-pressed={basis === value} className={basis === value ? "active" : ""} onClick={() => setBasis(value)}>{label}</button>
  );
  const periodButton = (value: Period, label: string) => (
    <button type="button" aria-pressed={period === value} className={period === value ? "active" : ""} onClick={() => setPeriod(value)}>{label}</button>
  );
  const dimensionTab = (value: Dimension, label: string) => (
    <button type="button" role="tab" aria-selected={dimension === value} className={dimension === value ? "active" : ""} onClick={() => setDimension(value)}>{label}</button>
  );

  return (
    <div className="value-dashboard">
      <section className="dashboard-card value-where" aria-label={it ? "Dove si trova il valore" : "Where the value sits"}>
        <div className="value-section-head">
          <h2>{it ? "Dove si trova il valore" : "Where the value sits"}</h2>
          {valueSplit.shared ? (
            <div className="value-segmented" role="group" aria-label={it ? "Base di calcolo" : "Basis"}>
              {basisButton("mine", it ? "Mie quote" : "My shares")}
              {basisButton("all", it ? "Complessivo" : "Overall")}
            </div>
          ) : null}
        </div>
        <div className="value-where-bar" role="img" aria-label={`${it ? "In cantina" : "In the cellar"} ${formatPercentage(pct(parts.cellarValue), locale)}, ${it ? "in arrivo" : "awaiting delivery"} ${formatPercentage(pct(parts.incomingValue), locale)}`}>
          <span className="is-cellar" style={{ width: `${pct(parts.cellarValue)}%` }} />
          <span className="is-incoming" style={{ width: `${pct(parts.incomingValue - parts.primeurValue)}%` }} />
          <span className="is-primeur" style={{ width: `${pct(parts.primeurValue)}%` }} />
        </div>
        <ul className="value-where-legend">
          <li><i className="is-cellar" aria-hidden="true" />{it ? "In cantina" : "In the cellar"}</li>
          <li><i className="is-incoming" aria-hidden="true" />{it ? "In arrivo" : "Awaiting delivery"}</li>
          {parts.primeurBottles > 0 ? <li><i className="is-primeur" aria-hidden="true" />{it ? "di cui en primeur" : "of which en primeur"}</li> : null}
        </ul>
        <div className="value-where-cards">
          <div>
            <span>{it ? "In cantina" : "In the cellar"}</span>
            <strong>{formatMoney(parts.cellarValue, "CHF", locale)}</strong>
            <small>{bottlesLabel(parts.cellarBottles)}</small>
          </div>
          <div>
            <span>{it ? "In arrivo" : "Awaiting delivery"}</span>
            <strong>{formatMoney(parts.incomingValue, "CHF", locale)}</strong>
            <small>{parts.incomingBottles > 0 ? bottlesLabel(parts.incomingBottles) : (it ? "Nessuna bottiglia in arrivo" : "No bottles on the way")}</small>
          </div>
        </div>
        {parts.primeurBottles > 0 ? (
          <div className="value-primeur">
            <div className="value-primeur-head">
              <span>{it ? "Capitale en primeur in arrivo" : "En primeur capital awaiting delivery"}</span>
              <small>{bottlesLabel(parts.primeurBottles)}</small>
            </div>
            <div className="value-primeur-body">
              <div><small>{it ? "Pagato" : "Paid"}</small><strong>{parts.primeurCost > 0 ? formatMoney(parts.primeurCost, "CHF", locale) : "—"}</strong></div>
              <span aria-hidden="true">→</span>
              <div><small>{it ? "Vale oggi" : "Worth today"}</small><strong>{formatMoney(parts.primeurValue, "CHF", locale)}</strong></div>
              {primeurDelta !== null ? (
                <b className={primeurDelta < 0 ? "negative" : "positive"}>
                  {signedMoney(primeurDelta)}{primeurDeltaPct === null ? "" : ` · ${primeurDeltaPct >= 0 ? "+" : ""}${primeurDeltaPct.toFixed(1)}%`}
                </b>
              ) : null}
            </div>
          </div>
        ) : null}
        {losses.bottles > 0 ? (
          <button type="button" className="value-losses" onClick={onOpenExits}>
            <span>{it ? "Perdite negli ultimi 12 mesi" : "Losses in the last 12 months"}</span>
            <strong>−{formatMoney(losses.value, "CHF", locale)}</strong>
            <small>{bottlesLabel(losses.bottles)} {it ? "rotte o difettose" : "broken or faulty"} <span aria-hidden="true">→</span></small>
          </button>
        ) : null}
        {valueSplit.shared && cellarStats.sharedBottles > 0 ? (
          <button type="button" className="value-link" onClick={() => applyQuickWineFilter("shared")}>
            {it ? "Vedi i vini in comproprietà" : "See co-owned wines"} <span aria-hidden="true">→</span>
          </button>
        ) : null}
      </section>

      <section className="dashboard-card value-trend" aria-label={t("valueEvolution")}>
        <div className="value-section-head">
          <div>
            <h2>{it ? "Andamento nel tempo" : "Over time"}</h2>
            {trendDelta !== null ? <strong className={trendDelta < 0 ? "negative" : "positive"}>{signedMoney(trendDelta)} {it ? "nel periodo" : "over the period"}</strong> : null}
          </div>
          <div className="value-segmented" role="group" aria-label={it ? "Periodo" : "Period"}>
            {periodButton("3", it ? "3 mesi" : "3 months")}
            {periodButton("6", it ? "6 mesi" : "6 months")}
            {periodButton("all", it ? "Tutto" : "All")}
          </div>
        </div>
        {trendPoints.length >= 2 ? (
          <Suspense fallback={<div className="portfolio-value-chart-loading" aria-label={t("valueEvolution")} />}>
            <div className="portfolio-value-chart">
              <TimeSeriesChart
                ariaLabel={t("valueEvolution")}
                locale={locale}
                currency="CHF"
                height={282}
                mobileHeight={206}
                points={trendPoints.map((point) => ({ timestampMs: point.timestampMs, value: point.numericValue }))}
              />
            </div>
          </Suspense>
        ) : (
          <p className="portfolio-value-chart-empty">{it ? "Servono almeno due rilevazioni nel periodo per mostrare l'andamento." : "At least two records in the period are needed to show the trend."}</p>
        )}
        <small className="value-caption">
          {trendFirst && trendLast ? `${it ? "Rilevazioni dal" : "Records from"} ${formatDisplayDate(trendFirst.recorded_at)} ${it ? "al" : "to"} ${formatDisplayDate(trendLast.recorded_at)} · ` : ""}
          {it ? "sulle tue quote, con le quantità attuali" : "on your shares, at current quantities"}
        </small>
      </section>

      <section className="dashboard-card value-composition" aria-label={it ? "Come si compone" : "What it is made of"}>
        <div className="value-section-head">
          <h2>{it ? "Come si compone" : "What it is made of"}</h2>
          <div className="value-segmented" role="tablist" aria-label={it ? "Dimensione" : "Dimension"}>
            {dimensionTab("type", it ? "Tipologia" : "Type")}
            {dimensionTab("region", it ? "Regione" : "Region")}
            {dimensionTab("producer", it ? "Produttore" : "Producer")}
          </div>
        </div>
        {dimension === "type" ? (
          valueByCanonicalType.length ? (
            <WineValueConstellation items={valueByCanonicalType} locale={locale} onOpen={(item) => onOpenType(item.label)} />
          ) : <p className="empty-state">{t("noActionItems")}</p>
        ) : groups.length ? (
          <ol className="value-ranking">
            {groups.map((item) => {
              const row = (
                <>
                  <span className="value-ranking-label">{groupLabel(item.label)}</span>
                  <span className="value-ranking-track" aria-hidden="true"><i style={{ width: `${Math.max((item.value / groupsMax) * 100, 3)}%` }} /></span>
                  <strong>{formatMoney(item.value, "CHF", locale)}</strong>
                  <small>{formatPercentage(groupsTotal ? (item.value / groupsTotal) * 100 : 0, locale)}</small>
                </>
              );
              return (
                <li key={item.label}>
                  {dimension === "region"
                    ? <button type="button" onClick={() => onOpenRegion(item.label)} aria-label={`${groupLabel(item.label)}: ${formatMoney(item.value, "CHF", locale)} · ${it ? "apri in cantina" : "open in cellar"}`}>{row}</button>
                    : <div>{row}</div>}
                </li>
              );
            })}
          </ol>
        ) : <p className="empty-state">{t("noActionItems")}</p>}
      </section>

      <div className="value-bottom">
        {renderTopValueWidget()}
        <section className="dashboard-card top-value-list-mobile" aria-label={it ? "I vini più preziosi" : "The most valuable wines"}>
          <div className="value-section-head">
            <h2>{it ? "I vini più preziosi" : "The most valuable wines"}</h2>
          </div>
          <div className="action-list">
            {topValueWines.map(({ wine, unitValue, bottles }) => (
              <button type="button" className="action-row" key={wine.id} onClick={() => openWineFromDashboard(wine)}>
                <span>
                  <i className={`wine-dot tone-${wineTone(wine.type)}`} />
                  <span className="chart-drilldown-row-text">
                    <span>{wine.name}</span>
                    <small>{bottlesLabel(bottles)}</small>
                  </span>
                </span>
                <strong>{formatMoney(unitValue, wine.currency, locale)}</strong>
              </button>
            ))}
          </div>
        </section>
        <section className="dashboard-card value-missing" aria-label={it ? "Valori da completare" : "Values to complete"}>
          <div className="value-section-head">
            <h2>{it ? "Valori da completare" : "Values to complete"}</h2>
            {cellarStats.missingValue ? <strong>{cellarStats.missingValue}</strong> : null}
          </div>
          {missingValueWines.length ? (
            <div className="action-list">
              {missingValueWines.map((wine) => (
                <button type="button" className="action-row" key={wine.id} onClick={() => openWineFromDashboard(wine)}>
                  <span><i className={`wine-dot tone-${wineTone(wine.type)}`} />{wine.name}</span>
                  <strong>{t("value")}</strong>
                </button>
              ))}
            </div>
          ) : <p className="empty-state">{it ? "Tutti i vini hanno un valore." : "Every wine has a value."}</p>}
        </section>
      </div>
    </div>
  );
}
