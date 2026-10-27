import { DashboardCountUp } from "../../components/DashboardCountUp";
import { PortfolioValueSparkline, dashboardStatSvgIcon } from "../../components/dashboardGraphics";
import { formatDisplayDate, formatMoney } from "../../components/panelSupport";
import { formatBottleCount } from "../../domain/cellar";
import { translate, type TranslationKey } from "../../i18n";
import type { DashboardFocus, Locale, Wine } from "../../types";

type DashboardHeroProps = {
  locale: Locale;
  dashboardFocus: DashboardFocus;
  dashboardFocusLabels: Record<DashboardFocus, string>;
  cellarStats: { bottles: number; totalValue: number; missingValue: number; drinkSoon: number; myBottles: number; myValue: number; sharedBottles: number; sharedValue: number };
  readyInCellarWineCount: number;
  nearestDrinkNowEnd: number | null;
  cellarDataCompleteness: number;
  purchaseValueDelta: number | null;
  purchaseValueDeltaPct: number | null;
  monitoringLabel: string;
  monitoringCaption: string;
  monitoringWines: Wine[];
  deliveryHorizonStats: { total: number; next30: number };
  firstDeliveryTimelineItem: { wine: Wine } | null;
  incompleteWineCount: number;
  cellarMissingDataCount: number;
  portfolioValueHistory: Array<{ recorded_at: string; value: string }>;
};

/** The headline figures of the selected dashboard view: three counts that animate in. */
export default function DashboardHero({
  locale,
  dashboardFocus,
  dashboardFocusLabels,
  cellarStats,
  readyInCellarWineCount,
  nearestDrinkNowEnd,
  cellarDataCompleteness,
  purchaseValueDelta,
  purchaseValueDeltaPct,
  monitoringLabel,
  monitoringCaption,
  monitoringWines,
  deliveryHorizonStats,
  firstDeliveryTimelineItem,
  incompleteWineCount,
  cellarMissingDataCount,
  portfolioValueHistory,
}: DashboardHeroProps) {
  const t = (key: TranslationKey) => translate(locale, key);
  return (
    <>
      <section className="hero-panel">
        <div className="hero-copy">
          <p className="eyebrow">{t("dashboard")}</p>
          <h2>{dashboardFocusLabels[dashboardFocus]}</h2>
        </div>
        <div className="hero-kpis" key={dashboardFocus} role="region" tabIndex={0} aria-label={t("cellarSnapshot")}>
          {dashboardFocus === "daily" ? (
            <>
              <div className="hero-kpi">
                <span><i className="stat-icon" aria-hidden="true">{dashboardStatSvgIcon("drink_now")}</i>{t("readyToDrink")}</span>
                <strong><DashboardCountUp value={readyInCellarWineCount} format={(value) => formatBottleCount(value, locale)} /></strong>
                <p>{t("wines")}</p>
              </div>
              <div className="hero-kpi">
                <span><i className="stat-icon" aria-hidden="true">{dashboardStatSvgIcon("past_window")}</i>{t("nearestWindowEnd")}</span>
                <strong>{nearestDrinkNowEnd || "—"}</strong>
                <p>{t("priority")}</p>
              </div>
              <div className="hero-kpi">
                <span><i className="stat-icon" aria-hidden="true">{dashboardStatSvgIcon("total")}</i>{t("bottles")}</span>
                <strong><DashboardCountUp value={cellarStats.bottles} format={(value) => formatBottleCount(value, locale)} delay={70} /></strong>
                <p>{t("dailyRotation")}</p>
              </div>
            </>
          ) : dashboardFocus === "balanced" ? (
            <>
              <div className="hero-kpi">
                <span><i className="stat-icon" aria-hidden="true">{dashboardStatSvgIcon("total")}</i>{t("bottles")}</span>
                <strong><DashboardCountUp value={cellarStats.bottles} format={(value) => formatBottleCount(value, locale)} /></strong>
                <p>{t("cellar")}</p>
              </div>
              <div className="hero-kpi">
                <span><i className="stat-icon" aria-hidden="true">{dashboardStatSvgIcon("drink_now")}</i>{t("readyToDrink")}</span>
                <strong><DashboardCountUp value={readyInCellarWineCount} format={(value) => formatBottleCount(value, locale)} delay={70} /></strong>
                <p>{t("wines")}</p>
              </div>
              <div className="hero-kpi">
                <span><i className="stat-icon" aria-hidden="true">{dashboardStatSvgIcon("missing_data")}</i>{t("dataQuality")}</span>
                <strong><DashboardCountUp value={cellarDataCompleteness} format={(value) => `${Math.round(value)}%`} delay={140} /></strong>
                <p>{t("balancedFocus")}</p>
              </div>
            </>
          ) : dashboardFocus === "value" ? (
            <>
              <div className="hero-kpi">
                <span><i className="stat-icon" aria-hidden="true">{dashboardStatSvgIcon("total")}</i>{t("totalValue")}</span>
                <strong><DashboardCountUp value={cellarStats.totalValue} format={(value) => formatMoney(value, "CHF", locale)} /></strong>
                <p>{formatBottleCount(cellarStats.bottles, locale)} {t("bottles").toLowerCase()}</p>
              </div>
              <div className="hero-kpi">
                <span><i className="stat-icon" aria-hidden="true">{dashboardStatSvgIcon("mine")}</i>{locale === "it" ? "Rendimento vs acquisto" : "Return vs purchase"}</span>
                <strong>
                  {purchaseValueDelta === null ? "—" : <DashboardCountUp value={purchaseValueDelta} format={(value) => `${value >= 0 ? "+" : ""}${formatMoney(value, "CHF", locale)}`} delay={70} />}
                </strong>
                <p>{purchaseValueDeltaPct === null ? (locale === "it" ? "Prezzi d'acquisto mancanti" : "Purchase prices missing") : `${purchaseValueDeltaPct >= 0 ? "+" : ""}${purchaseValueDeltaPct.toFixed(1)}%`}</p>
              </div>
              <div className="hero-kpi">
                <span><i className="stat-icon" aria-hidden="true">{dashboardStatSvgIcon("shared")}</i>{t("averageBottleValue")}</span>
                <strong><DashboardCountUp value={cellarStats.bottles ? cellarStats.totalValue / cellarStats.bottles : 0} format={(value) => formatMoney(value, "CHF", locale)} delay={140} /></strong>
                <p>{cellarStats.missingValue} {t("missingValue").toLowerCase()}</p>
              </div>
            </>
          ) : dashboardFocus === "readiness" ? (
            <>
              <div className="hero-kpi">
                <span><i className="stat-icon" aria-hidden="true">{dashboardStatSvgIcon("drink_now")}</i>{t("readyToDrink")}</span>
                <strong><DashboardCountUp value={readyInCellarWineCount} format={(value) => formatBottleCount(value, locale)} /></strong>
                <p>{t("wines")}</p>
              </div>
              <div className="hero-kpi">
                <span><i className="stat-icon" aria-hidden="true">{dashboardStatSvgIcon("drink_soon")}</i>{t("drinkIn2Years")}</span>
                <strong><DashboardCountUp value={cellarStats.drinkSoon} format={(value) => formatBottleCount(value, locale)} delay={70} /></strong>
                <p>{t("drinkingWindow")}</p>
              </div>
              <div className="hero-kpi">
                <span><i className="stat-icon" aria-hidden="true">{dashboardStatSvgIcon("past_window")}</i>{monitoringLabel}</span>
                <strong><DashboardCountUp value={monitoringWines.length} format={(value) => formatBottleCount(value, locale)} delay={140} /></strong>
                <p>{monitoringCaption}</p>
              </div>
            </>
          ) : dashboardFocus === "timeline" ? (
            <>
              <div className="hero-kpi">
                <span><i className="stat-icon" aria-hidden="true">{dashboardStatSvgIcon("future_deliveries")}</i>{t("futureDeliveries")}</span>
                <strong><DashboardCountUp value={deliveryHorizonStats.total} format={(value) => formatBottleCount(value, locale)} /></strong>
                <p>{t("upcomingDeliveries")}</p>
              </div>
              <div className="hero-kpi">
                <span><i className="stat-icon" aria-hidden="true">{dashboardStatSvgIcon("future_deliveries")}</i>{t("next30Days")}</span>
                <strong><DashboardCountUp value={deliveryHorizonStats.next30} format={(value) => formatBottleCount(value, locale)} delay={70} /></strong>
                <p>{t("deliveryTimeline")}</p>
              </div>
              <div className="hero-kpi">
                <span><i className="stat-icon" aria-hidden="true">{dashboardStatSvgIcon("to_collect")}</i>{locale === "it" ? "Prossima consegna" : "Next delivery"}</span>
                <strong>{firstDeliveryTimelineItem ? formatDisplayDate(firstDeliveryTimelineItem.wine.expected_delivery) : "—"}</strong>
                <p>{firstDeliveryTimelineItem?.wine.name || t("noActionItems")}</p>
              </div>
            </>
          ) : dashboardFocus === "data" ? (
            <>
              <div className="hero-kpi">
                <span><i className="stat-icon" aria-hidden="true">{dashboardStatSvgIcon("missing_data")}</i>{t("dataCompleteness")}</span>
                <strong><DashboardCountUp value={cellarDataCompleteness} format={(value) => `${Math.round(value)}%`} /></strong>
                <p>{locale === "it" ? "Copertura dati essenziali" : "Essential data coverage"}</p>
              </div>
              <div className="hero-kpi">
                <span><i className="stat-icon" aria-hidden="true">{dashboardStatSvgIcon("total")}</i>{t("incompleteData")}</span>
                <strong><DashboardCountUp value={incompleteWineCount} format={(value) => formatBottleCount(value, locale)} delay={70} /></strong>
                <p>{t("wines")}</p>
              </div>
              <div className="hero-kpi">
                <span><i className="stat-icon" aria-hidden="true">{dashboardStatSvgIcon("missing_data")}</i>{locale === "it" ? "Campi da completare" : "Fields to complete"}</span>
                <strong><DashboardCountUp value={cellarMissingDataCount} format={(value) => formatBottleCount(value, locale)} delay={140} /></strong>
                <p>{t("dataQuality")}</p>
              </div>
            </>
          ) : (
            <>
              <div className="hero-kpi">
                <span><i className="stat-icon" aria-hidden="true">{dashboardStatSvgIcon("mine")}</i>{t("myBottles")}</span>
                <strong><DashboardCountUp value={cellarStats.myBottles} format={(value) => formatBottleCount(value, locale)} /></strong>
                <p><DashboardCountUp value={cellarStats.myValue} format={(value) => formatMoney(value, "CHF", locale)} delay={120} /></p>
              </div>
              <div className="hero-kpi">
                <span><i className="stat-icon" aria-hidden="true">{dashboardStatSvgIcon("shared")}</i>{t("sharedBottles")}</span>
                <strong><DashboardCountUp value={cellarStats.sharedBottles} format={(value) => formatBottleCount(value, locale)} delay={70} /></strong>
                <p><DashboardCountUp value={cellarStats.sharedValue} format={(value) => formatMoney(value, "CHF", locale)} delay={190} /></p>
              </div>
              <div className="hero-kpi hero-kpi--value">
                <span><i className="stat-icon" aria-hidden="true">{dashboardStatSvgIcon("total")}</i>{t("totalValue")}</span>
                <strong><DashboardCountUp value={cellarStats.totalValue} format={(value) => formatMoney(value, "CHF", locale)} delay={140} /></strong>
                <div className="hero-kpi-value-trend">
                  <PortfolioValueSparkline points={portfolioValueHistory} label={t("valueEvolution")} />
                  <p><DashboardCountUp value={cellarStats.bottles} format={(value) => `${formatBottleCount(value, locale)} ${t("bottles").toLowerCase()}`} delay={230} /></p>
                </div>
              </div>
            </>
          )}
        </div>
      </section>
    </>
  );
}
