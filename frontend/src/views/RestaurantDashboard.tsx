import { useEffect, useState } from "react";
import type { Locale, RestaurantSalesSummary } from "../types";
import { api } from "../services/api";
import { formatMoney } from "../components/panelSupport";
import "./RestaurantDashboard.css";

type Period = "week" | "month" | "semester" | "year" | "custom";

function isoDate(date: Date) { return date.toISOString().slice(0, 10); }

function periodStart(period: Period) {
  const date = new Date();
  if (period === "week") date.setDate(date.getDate() - 6);
  if (period === "month") date.setMonth(date.getMonth() - 1);
  if (period === "semester") date.setMonth(date.getMonth() - 6);
  if (period === "year") date.setFullYear(date.getFullYear() - 1);
  return isoDate(date);
}

export default function RestaurantDashboard({ locale, refreshKey, onOpenWine, onChanged, mode = "restaurant" }: {
  locale: Locale;
  refreshKey: number;
  onOpenWine: (wineId: string) => void;
  onChanged: () => Promise<void>;
  mode?: "restaurant" | "private";
}) {
  const [period, setPeriod] = useState<Period>("month");
  const [fromDate, setFromDate] = useState(periodStart("month"));
  const [toDate, setToDate] = useState(isoDate(new Date()));
  const [summary, setSummary] = useState<RestaurantSalesSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (period !== "custom") setFromDate(periodStart(period));
  }, [period]);

  useEffect(() => {
    let active = true;
    setLoading(true);
    api<RestaurantSalesSummary>(`/api/v1/sales/summary?from_date=${fromDate}&to_date=${toDate}`)
      .then((result) => { if (active) { setSummary(result); setError(""); } })
      .catch((reason) => { if (active) setError(reason instanceof Error ? reason.message : "Unable to load sales"); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [fromDate, refreshKey, toDate]);

  async function voidSale(saleId: string) {
    const reason = window.prompt(locale === "it" ? "Motivo dell’annullamento" : "Reason for voiding");
    if (!reason?.trim()) return;
    await api(`/api/v1/sales/${saleId}/void`, { method: "POST", body: JSON.stringify({ reason: reason.trim() }) });
    await onChanged();
  }

  return <section className="restaurant-dashboard">
    <header className="restaurant-dashboard-head">
      <div><p className="eyebrow">{mode === "private" ? (locale === "it" ? "Cantina privata" : "Private cellar") : (locale === "it" ? "Gestione ristorante" : "Restaurant operations")}</p><h1>{mode === "private" ? (locale === "it" ? "Vendite della collezione" : "Collection sales") : (locale === "it" ? "Ricavi e margine lordo" : "Revenue and gross margin")}</h1><p>{mode === "private" ? (locale === "it" ? "Capitale recuperato e plusvalenze o minusvalenze realizzate nel periodo." : "Recovered capital and realized gains or losses for the selected period.") : (locale === "it" ? "Vendite reali, costo delle bottiglie e marginalità del periodo." : "Actual sales, bottle cost and margin for the selected period.")}</p></div>
      <div className="restaurant-periods" role="group" aria-label={locale === "it" ? "Periodo" : "Period"}>
        {(["week", "month", "semester", "year", "custom"] as Period[]).map((item) => <button type="button" className={period === item ? "" : "secondary"} key={item} onClick={() => setPeriod(item)}>{({ week: locale === "it" ? "Settimana" : "Week", month: locale === "it" ? "Mese" : "Month", semester: locale === "it" ? "6 mesi" : "6 months", year: locale === "it" ? "Anno" : "Year", custom: locale === "it" ? "Personalizzato" : "Custom" })[item]}</button>)}
      </div>
      {period === "custom" ? <div className="restaurant-custom-dates"><label>{locale === "it" ? "Dal" : "From"}<input type="date" value={fromDate} onChange={(event) => setFromDate(event.target.value)} /></label><label>{locale === "it" ? "Al" : "To"}<input type="date" value={toDate} onChange={(event) => setToDate(event.target.value)} /></label></div> : null}
    </header>
    {error ? <p className="error-banner">{error}</p> : null}
    {loading && !summary ? <p>{locale === "it" ? "Caricamento vendite…" : "Loading sales…"}</p> : null}
    {summary?.currencies.map((totals) => <section className="restaurant-currency" key={totals.currency}>
      <div className="restaurant-kpis">
        <article><span>{mode === "private" ? (locale === "it" ? "Capitale recuperato" : "Recovered capital") : (locale === "it" ? "Ricavi" : "Revenue")}</span><strong>{formatMoney(totals.revenue, totals.currency, locale)}</strong></article>
        <article><span>{mode === "private" ? (locale === "it" ? "Costo storico" : "Historical cost") : (locale === "it" ? "Costo bottiglie" : "Bottle cost")}</span><strong>{formatMoney(totals.cost, totals.currency, locale)}</strong></article>
        <article className={`accent${Number(totals.gross_margin) < 0 ? " is-negative" : ""}`}><span>{mode === "private" ? (locale === "it" ? "Plus/minusvalenza" : "Realized gain/loss") : (locale === "it" ? "Margine lordo" : "Gross margin")}</span><strong>{formatMoney(totals.gross_margin, totals.currency, locale)}</strong><small>{Number(totals.gross_margin_pct).toLocaleString(locale, { maximumFractionDigits: 1 })}%</small></article>
        <article><span>{locale === "it" ? "Bottiglie vendute" : "Bottles sold"}</span><strong>{totals.bottles}</strong><small>{locale === "it" ? `Media ${formatMoney(totals.average_sale_price, totals.currency, locale)}` : `Average ${formatMoney(totals.average_sale_price, totals.currency, locale)}`}</small></article>
      </div>
    </section>)}
    {!summary?.currencies.length && !loading ? <div className="restaurant-empty"><strong>{locale === "it" ? "Nessuna vendita nel periodo" : "No sales in this period"}</strong><span>{locale === "it" ? "Apri una bottiglia in cantina e usa “Venduta 1” per iniziare." : "Open a bottle in the cellar and use “Sell bottles” to begin."}</span></div> : null}
    {summary?.currencies.map(({ currency }) => {
      const points = summary.series.filter((point) => point.currency === currency);
      const peakRevenue = Math.max(...points.map((point) => Number(point.revenue)), 1);
      return points.length ? <section className="restaurant-panel" key={`chart-${currency}`}><header><h2>{mode === "private" ? (locale === "it" ? `Capitale recuperato · ${currency}` : `Recovered capital · ${currency}`) : (locale === "it" ? `Andamento ricavi · ${currency}` : `Revenue trend · ${currency}`)}</h2></header><div className="restaurant-chart">{points.map((point) => <div className="restaurant-chart-column" key={`${point.date}-${currency}`} title={`${point.date}: ${point.revenue} ${currency}`}><i style={{ height: `${Math.max((Number(point.revenue) / peakRevenue) * 100, 3)}%` }} /><span>{new Date(`${point.date}T00:00:00`).toLocaleDateString(locale, { day: "2-digit", month: "short" })}</span></div>)}</div></section> : null;
    })}
    <div className="restaurant-lower-grid">
      <section className="restaurant-panel"><header><h2>{mode === "private" ? (locale === "it" ? "Migliori vendite" : "Best sales") : (locale === "it" ? "Vini più redditizi" : "Top wines by margin")}</h2></header>{summary?.top_wines.length ? <div className="restaurant-ranking">{summary.top_wines.map((wine) => <button type="button" key={`${wine.wine_id}-${wine.currency}`} onClick={() => onOpenWine(wine.wine_id)}><span><strong>{wine.label}</strong><small>{wine.bottles} {locale === "it" ? "bottiglie" : "bottles"}</small></span><strong>{formatMoney(wine.gross_margin, wine.currency, locale)}</strong></button>)}</div> : <p className="empty-state">—</p>}</section>
      <section className="restaurant-panel"><header><h2>{locale === "it" ? "Registro vendite" : "Sales register"}</h2></header>{summary?.recent_sales.length ? <div className="restaurant-sales-list">{summary.recent_sales.map((sale) => <article key={sale.id}><div><strong>{sale.wine_name}</strong><span>{sale.sold_at} · {sale.quantity} × {formatMoney(sale.unit_sale_price, sale.currency, locale)}</span></div><div><strong>{formatMoney(sale.gross_margin, sale.currency, locale)}</strong><button type="button" className="secondary compact" onClick={() => void voidSale(sale.id)}>{locale === "it" ? "Annulla" : "Void"}</button></div></article>)}</div> : <p className="empty-state">—</p>}</section>
    </div>
  </section>;
}
