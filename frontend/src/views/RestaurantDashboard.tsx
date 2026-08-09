import { useEffect, useState } from "react";
import type { Locale, RestaurantSalesSummary, Wine } from "../types";
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

function bottleDistribution(wines: Wine[], field: "type" | "region", fallback: string) {
  const totals = new Map<string, number>();
  for (const wine of wines) {
    const label = String(wine[field] || "").trim() || fallback;
    totals.set(label, (totals.get(label) || 0) + Math.max(wine.quantity, 0));
  }
  return [...totals.entries()]
    .map(([label, bottles]) => ({ label, bottles }))
    .sort((first, second) => second.bottles - first.bottles)
    .slice(0, 6);
}

export default function RestaurantDashboard({ locale, refreshKey, onOpenWine, onChanged, onOpenIncompleteWines, mode = "restaurant", wines = [] }: {
  locale: Locale;
  refreshKey: number;
  onOpenWine: (wineId: string) => void;
  onChanged: () => Promise<void>;
  onOpenIncompleteWines?: () => void;
  mode?: "restaurant" | "private";
  wines?: Wine[];
}) {
  const [period, setPeriod] = useState<Period>("month");
  const [fromDate, setFromDate] = useState(periodStart("month"));
  const [toDate, setToDate] = useState(isoDate(new Date()));
  const [summary, setSummary] = useState<RestaurantSalesSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [libraryPhotoUrls, setLibraryPhotoUrls] = useState<Record<string, string>>({});
  const inventoryWines = wines.filter((wine) => wine.quantity > 0);
  const inventoryBottles = inventoryWines.reduce((total, wine) => total + wine.quantity, 0);
  const missingSalePrice = inventoryWines.filter((wine) => !wine.sale_price).length;
  const lowStockWines = inventoryWines.filter((wine) => wine.quantity <= 2).length;
  const incompleteWineData = inventoryWines.filter((wine) => !wine.type || !wine.region || !wine.format || !Array.isArray(wine.grapes) || !wine.grapes.length).length;
  const types = bottleDistribution(inventoryWines, "type", locale === "it" ? "Altri" : "Other");
  const regions = bottleDistribution(inventoryWines, "region", locale === "it" ? "Non indicata" : "Not specified");
  const leadingWines = [...inventoryWines]
    .filter((wine) => Number(wine.sale_price || 0) > 0)
    .sort((first, second) => Number(second.sale_price || 0) - Number(first.sale_price || 0))
    .slice(0, 5);
  const inventoryByCurrency = [...inventoryWines.reduce((totals, wine) => {
    const currency = (wine.currency || "CHF").toUpperCase();
    const current = totals.get(currency) || { cost: 0, listValue: 0 };
    current.cost += Number(wine.price || 0) * wine.quantity;
    current.listValue += Number(wine.sale_price || 0) * wine.quantity;
    totals.set(currency, current);
    return totals;
  }, new Map<string, { cost: number; listValue: number }>()).entries()];
  const leadingPhotoLookupKey = leadingWines
    .filter((wine) => !wine.photo_thumbnail_url && !wine.photo_detail_url && wine.name && wine.producer)
    .map((wine) => `${wine.id}:${wine.name}:${wine.producer}`)
    .join("|");

  useEffect(() => {
    if (period !== "custom") setFromDate(periodStart(period));
  }, [period]);

  useEffect(() => {
    let active = true;
    setLoading(true);
    api<RestaurantSalesSummary>(`/api/v1/sales/summary?from_date=${fromDate}&to_date=${toDate}`)
      .then((result) => {
        if (!active) return;
        setSummary({
          ...result,
          currencies: Array.isArray(result.currencies) ? result.currencies : [],
          series: Array.isArray(result.series) ? result.series : [],
          top_wines: Array.isArray(result.top_wines) ? result.top_wines : [],
          least_sold_wines: Array.isArray(result.least_sold_wines) ? result.least_sold_wines : [],
          sales_by_type: Array.isArray(result.sales_by_type) ? result.sales_by_type : [],
          sales_by_region: Array.isArray(result.sales_by_region) ? result.sales_by_region : [],
          recent_sales: Array.isArray(result.recent_sales) ? result.recent_sales : [],
        });
        setError("");
      })
      .catch((reason) => { if (active) setError(reason instanceof Error ? reason.message : "Unable to load sales"); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [fromDate, refreshKey, toDate]);

  useEffect(() => {
    const targets = leadingWines.filter((wine) =>
      !wine.photo_thumbnail_url && !wine.photo_detail_url && wine.name && wine.producer
    );
    if (!targets.length) return;
    let active = true;
    Promise.all(targets.map(async (wine) => {
      try {
        const suggestions = await api<Array<{ thumbnail_url: string }>>(`/api/v1/wines/photo/suggestions?name=${encodeURIComponent(wine.name)}&producer=${encodeURIComponent(wine.producer)}`);
        return [wine.id, suggestions[0]?.thumbnail_url || ""] as const;
      } catch {
        return [wine.id, ""] as const;
      }
    })).then((entries) => {
      if (!active) return;
      setLibraryPhotoUrls((current) => ({ ...current, ...Object.fromEntries(entries.filter(([, url]) => url)) }));
    });
    return () => { active = false; };
  }, [leadingPhotoLookupKey]);

  async function voidSale(saleId: string) {
    const reason = window.prompt(locale === "it" ? "Motivo dell’annullamento" : "Reason for voiding");
    if (!reason?.trim()) return;
    await api(`/api/v1/sales/${saleId}/void`, { method: "POST", body: JSON.stringify({ reason: reason.trim() }) });
    await onChanged();
  }

  return <section className="restaurant-dashboard">
    <header className="restaurant-dashboard-head">
      <div><p className="eyebrow">{mode === "private" ? (locale === "it" ? "Cantina privata" : "Private cellar") : (locale === "it" ? "Gestione ristorante" : "Restaurant operations")}</p><h1>{mode === "private" ? (locale === "it" ? "Vendite della collezione" : "Collection sales") : (locale === "it" ? "Dashboard ristorante" : "Restaurant dashboard")}</h1><p>{mode === "private" ? (locale === "it" ? "Capitale recuperato e plusvalenze o minusvalenze realizzate nel periodo." : "Recovered capital and realized gains or losses for the selected period.") : (locale === "it" ? "Carta vini, giacenze, ricavi e marginalità in una sola visione operativa." : "Wine list, stock, revenue and margin in one operational view.")}</p></div>
      <div className="restaurant-periods" role="group" aria-label={locale === "it" ? "Periodo" : "Period"}>
        {(["week", "month", "semester", "year", "custom"] as Period[]).map((item) => <button type="button" className={period === item ? "" : "secondary"} key={item} onClick={() => setPeriod(item)}>{({ week: locale === "it" ? "Settimana" : "Week", month: locale === "it" ? "Mese" : "Month", semester: locale === "it" ? "6 mesi" : "6 months", year: locale === "it" ? "Anno" : "Year", custom: locale === "it" ? "Personalizzato" : "Custom" })[item]}</button>)}
      </div>
      {period === "custom" ? <div className="restaurant-custom-dates"><label>{locale === "it" ? "Dal" : "From"}<input type="date" value={fromDate} onChange={(event) => setFromDate(event.target.value)} /></label><label>{locale === "it" ? "Al" : "To"}<input type="date" value={toDate} onChange={(event) => setToDate(event.target.value)} /></label></div> : null}
    </header>
    {mode === "restaurant" ? <section className="restaurant-inventory-overview">
      <header className="restaurant-section-title">
        <div><p className="eyebrow">{locale === "it" ? "Carta vini" : "Wine list"}</p><h2>{locale === "it" ? "La cantina del ristorante" : "Restaurant cellar"}</h2></div>
        <span>{locale === "it" ? "Giacenza, valore potenziale e composizione" : "Stock, potential value and composition"}</span>
      </header>
      <div className="restaurant-inventory-kpis">
        <article><span>{locale === "it" ? "Referenze attive" : "Active labels"}</span><strong>{inventoryWines.length}</strong></article>
        <article><span>{locale === "it" ? "Bottiglie disponibili" : "Available bottles"}</span><strong>{inventoryBottles}</strong></article>
        <article><span>{locale === "it" ? "Scorte basse" : "Low stock"}</span><strong>{lowStockWines}</strong><small>{locale === "it" ? "Referenze con 1–2 bottiglie" : "Labels with 1–2 bottles"}</small></article>
        <article className={missingSalePrice ? "needs-attention" : ""}><span>{locale === "it" ? "Prezzo da completare" : "Missing sale price"}</span><strong>{missingSalePrice}</strong><small>{locale === "it" ? "Referenze senza prezzo di vendita" : "Labels without a sale price"}</small></article>
        <button type="button" className={incompleteWineData ? "needs-attention" : ""} disabled={!onOpenIncompleteWines} onClick={onOpenIncompleteWines}><span>{locale === "it" ? "Dati vino da completare" : "Wine data to complete"}</span><strong>{incompleteWineData}</strong><small>{locale === "it" ? "Apri le schede e usa l’arricchimento AI" : "Open records and use AI enrichment"}</small></button>
      </div>
      {inventoryByCurrency.length ? <div className="restaurant-inventory-values">
        {inventoryByCurrency.map(([currency, totals]) => <article key={currency}>
          <div><span>{locale === "it" ? `Potenziale · ${currency}` : `Potential · ${currency}`}</span><strong>{formatMoney(totals.listValue, currency, locale)}</strong></div>
          <dl><div><dt>{locale === "it" ? "Capitale a costo" : "Capital at cost"}</dt><dd>{formatMoney(totals.cost, currency, locale)}</dd></div><div><dt>{locale === "it" ? "Margine potenziale" : "Potential margin"}</dt><dd>{formatMoney(totals.listValue - totals.cost, currency, locale)}</dd></div></dl>
        </article>)}
      </div> : null}
      <div className="restaurant-inventory-grid">
        <section className="restaurant-panel restaurant-leading-wines">
          <header><div><span>{locale === "it" ? "Selezione" : "Selection"}</span><h2>{locale === "it" ? "Bottiglie di punta" : "Leading bottles"}</h2></div></header>
          {leadingWines.length ? <div>{leadingWines.map((wine, index) => <button type="button" key={wine.id} onClick={() => onOpenWine(wine.id)}>
            <span className="restaurant-leading-rank">{String(index + 1).padStart(2, "0")}</span>
            {wine.photo_thumbnail_url || wine.photo_detail_url || libraryPhotoUrls[wine.id] ? <img src={wine.photo_thumbnail_url || wine.photo_detail_url || libraryPhotoUrls[wine.id]} alt={`${wine.name} ${wine.vintage}`.trim()} loading="lazy" /> : <i className="restaurant-bottle-placeholder" aria-hidden="true" />}
            <span><strong>{wine.name}</strong><small>{[wine.producer, wine.vintage, wine.region].filter(Boolean).join(" · ")}</small></span>
            <span className="restaurant-leading-price"><strong>{formatMoney(wine.sale_price || 0, wine.currency, locale)}</strong><small>{wine.quantity} {locale === "it" ? "disponibili" : "available"}</small></span>
          </button>)}</div> : <p className="empty-state">{locale === "it" ? "Inserisci i prezzi di vendita per comporre la selezione." : "Add sale prices to build this selection."}</p>}
        </section>
        <section className="restaurant-panel restaurant-mix-panel">
          <header><div><span>{locale === "it" ? "Profilo" : "Profile"}</span><h2>{locale === "it" ? "Tipologie" : "Wine types"}</h2></div></header>
          <div className="restaurant-distribution">{types.map((item) => <div key={item.label}><div><span>{item.label}</span><strong>{item.bottles}</strong></div><i><b style={{ width: `${(item.bottles / Math.max(types[0]?.bottles || 1, 1)) * 100}%` }} /></i></div>)}</div>
        </section>
        <section className="restaurant-panel restaurant-mix-panel">
          <header><div><span>{locale === "it" ? "Provenienza" : "Origin"}</span><h2>{locale === "it" ? "Top regioni" : "Top regions"}</h2></div></header>
          <div className="restaurant-distribution">{regions.map((item) => <div key={item.label}><div><span>{item.label}</span><strong>{item.bottles}</strong></div><i><b style={{ width: `${(item.bottles / Math.max(regions[0]?.bottles || 1, 1)) * 100}%` }} /></i></div>)}</div>
        </section>
      </div>
    </section> : null}
    {error ? <p className="error-banner">{error}</p> : null}
    {mode === "restaurant" ? <header className="restaurant-section-title restaurant-sales-heading"><div><p className="eyebrow">{locale === "it" ? "Vendite" : "Sales"}</p><h2>{locale === "it" ? "Performance del periodo" : "Period performance"}</h2></div><span>{fromDate} — {toDate}</span></header> : null}
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
    {mode === "restaurant" && summary ? <div className="restaurant-sales-breakdowns">
      {([
        [locale === "it" ? "Vendite per tipologia" : "Sales by wine type", summary.sales_by_type],
        [locale === "it" ? "Vendite per regione" : "Sales by region", summary.sales_by_region],
      ] as const).map(([title, items]) => <section className="restaurant-panel restaurant-sales-breakdown" key={title}>
        <header><h2>{title}</h2><span>{locale === "it" ? "Bottiglie · ricavi · margine" : "Bottles · revenue · margin"}</span></header>
        {items.length ? <div>{items.map((item) => {
          const maxBottles = Math.max(...items.map((entry) => entry.bottles), 1);
          return <article key={`${item.label}-${item.currency}`}>
            <div><strong>{item.label}</strong><span>{item.bottles} {locale === "it" ? "vendute" : "sold"}</span></div>
            <i><b style={{ width: `${(item.bottles / maxBottles) * 100}%` }} /></i>
            <div className="restaurant-breakdown-money"><span>{formatMoney(item.revenue, item.currency, locale)}</span><strong>{formatMoney(item.gross_margin, item.currency, locale)}</strong></div>
          </article>;
        })}</div> : <p className="empty-state">—</p>}
      </section>)}
    </div> : null}
    <div className="restaurant-lower-grid">
      <section className="restaurant-panel"><header><h2>{mode === "private" ? (locale === "it" ? "Migliori vendite" : "Best sales") : (locale === "it" ? "Vini più venduti" : "Best-selling wines")}</h2></header>{summary?.top_wines.length ? <div className="restaurant-ranking">{summary.top_wines.map((wine) => <button type="button" key={`${wine.wine_id}-${wine.currency}`} onClick={() => onOpenWine(wine.wine_id)}><span><strong>{wine.label}</strong><small>{wine.current_stock} {locale === "it" ? "ancora disponibili" : "still available"}</small></span><span className="restaurant-ranking-result"><strong>{wine.bottles} {locale === "it" ? "vendute" : "sold"}</strong><small>{formatMoney(wine.revenue, wine.currency, locale)} · {locale === "it" ? "margine" : "margin"} {formatMoney(wine.gross_margin, wine.currency, locale)}</small></span></button>)}</div> : <p className="empty-state">—</p>}</section>
      <section className="restaurant-panel"><header><h2>{locale === "it" ? "Invenduti o meno venduti" : "Unsold or slow-moving"}</h2></header>{summary?.least_sold_wines.length ? <div className="restaurant-ranking restaurant-slow-movers">{summary.least_sold_wines.map((wine) => <button type="button" key={`${wine.wine_id}-${wine.currency}`} onClick={() => onOpenWine(wine.wine_id)}><span><strong>{wine.label}</strong><small>{wine.current_stock} {locale === "it" ? "in giacenza" : "in stock"}</small></span><span className="restaurant-ranking-result"><strong>{wine.bottles ? `${wine.bottles} ${locale === "it" ? "vendute" : "sold"}` : (locale === "it" ? "Invenduto" : "Unsold")}</strong><small>{wine.bottles ? formatMoney(wine.revenue, wine.currency, locale) : (locale === "it" ? "Nessuna vendita nel periodo" : "No sales in this period")}</small></span></button>)}</div> : <p className="empty-state">—</p>}</section>
    </div>
    <section className="restaurant-panel"><header><h2>{locale === "it" ? "Registro vendite" : "Sales register"}</h2></header>{summary?.recent_sales.length ? <div className="restaurant-sales-list">{summary.recent_sales.map((sale) => <article key={sale.id}><div><strong>{sale.wine_name}</strong><span>{sale.sold_at} · {sale.quantity} × {formatMoney(sale.unit_sale_price, sale.currency, locale)}</span></div><div><strong>{formatMoney(sale.gross_margin, sale.currency, locale)}</strong><button type="button" className="secondary compact" onClick={() => void voidSale(sale.id)}>{locale === "it" ? "Annulla" : "Void"}</button></div></article>)}</div> : <p className="empty-state">—</p>}</section>
  </section>;
}
