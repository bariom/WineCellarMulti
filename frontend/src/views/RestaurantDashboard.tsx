import { useEffect, useState, type CSSProperties } from "react";
import type { Locale, RestaurantSalesSummary, Wine } from "../types";
import { api } from "../services/api";
import { formatMoney } from "../components/panelSupport";
import { displayValue, translate } from "../i18n";
import { normalizeWineType } from "../domain/wineTypes";
import WineGeographyMap from "./WineGeographyMap";
import TimeSeriesChart from "../components/TimeSeriesChart";
import "./RestaurantDashboard.css";

type Period = "week" | "month" | "semester" | "year" | "custom";

function isoDate(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function displayDate(date: string, locale: Locale) {
  const value = new Date(`${date}T12:00:00`);
  if (Number.isNaN(value.getTime())) return date;
  return value.toLocaleDateString(locale === "it" ? "it-CH" : "en-US", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function periodStart(period: Exclude<Period, "custom">) {
  return periodRange(period).fromDate;
}

function periodRange(period: Exclude<Period, "custom">, reference = new Date()) {
  const date = new Date(reference);
  date.setHours(0, 0, 0, 0);
  const end = new Date(date);
  if (period === "week") {
    const day = date.getDay();
    date.setDate(date.getDate() - (day === 0 ? 6 : day - 1));
    end.setTime(date.getTime());
    end.setDate(end.getDate() + 6);
  }
  if (period === "month") {
    date.setDate(1);
    end.setMonth(date.getMonth() + 1, 0);
  }
  if (period === "semester") {
    date.setMonth(date.getMonth() - 5, 1);
    end.setMonth(date.getMonth() + 6, 0);
  }
  if (period === "year") {
    date.setMonth(0, 1);
    end.setFullYear(date.getFullYear(), 11, 31);
  }
  const today = isoDate(new Date());
  const toDate = isoDate(end);
  return { fromDate: isoDate(date), toDate: toDate > today ? today : toDate };
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

function numberValue(value: string | number | null | undefined) {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function hasCompleteDrinkWindow(wine: Wine) {
  return [wine.drink_from, wine.drink_peak_from, wine.drink_peak_to, wine.drink_to]
    .every((value) => typeof value === "number");
}

function PeriodSelector({ locale, period, setPeriod, fromDate, setFromDate, toDate, setToDate, onNavigate, canNavigateForward }: {
  locale: Locale;
  period: Period;
  setPeriod: (period: Period) => void;
  fromDate: string;
  setFromDate: (date: string) => void;
  toDate: string;
  setToDate: (date: string) => void;
  onNavigate: (direction: -1 | 1) => void;
  canNavigateForward: boolean;
}) {
  return <div className="restaurant-period-selector">
    <div className="restaurant-periods" role="group" aria-label={locale === "it" ? "Periodo del grafico" : "Chart period"}>
      {(["week", "month", "semester", "year", "custom"] as Period[]).map((item) => <button type="button" className={period === item ? "" : "secondary"} key={item} onClick={() => setPeriod(item)}>{({ week: locale === "it" ? "Settimana" : "Week", month: locale === "it" ? "Mese" : "Month", semester: locale === "it" ? "6 mesi" : "6 months", year: locale === "it" ? "Anno" : "Year", custom: locale === "it" ? "Personalizzato" : "Custom" })[item]}</button>)}
    </div>
    {period !== "custom" ? <div className="restaurant-period-navigation"><button type="button" className="secondary compact" onClick={() => onNavigate(-1)} aria-label={locale === "it" ? "Periodo precedente" : "Previous period"}>‹</button><button type="button" className="secondary compact" onClick={() => onNavigate(1)} disabled={!canNavigateForward} aria-label={locale === "it" ? "Periodo successivo" : "Next period"}>›</button></div> : null}
    {period === "custom" ? <div className="restaurant-custom-dates"><label>{locale === "it" ? "Dal" : "From"}<input type="date" lang={locale === "it" ? "it-CH" : "en-US"} value={fromDate} onChange={(event) => setFromDate(event.target.value)} /></label><label>{locale === "it" ? "Al" : "To"}<input type="date" lang={locale === "it" ? "it-CH" : "en-US"} value={toDate} onChange={(event) => setToDate(event.target.value)} /></label></div> : null}
  </div>;
}

function RevenueLineChart({ points, locale, currency }: {
  points: RestaurantSalesSummary["series"];
  locale: Locale;
  currency: string;
}) {
  const values = points.map((point) => numberValue(point.revenue));
  const peak = Math.max(...values, 1);
  const width = 720;
  const height = 228;
  const padding = { top: 22, right: 18, bottom: 34, left: 48 };
  const innerWidth = width - padding.left - padding.right;
  const innerHeight = height - padding.top - padding.bottom;
  const coordinates = values.map((value, index) => ({
    x: padding.left + (values.length === 1 ? innerWidth / 2 : (index / (values.length - 1)) * innerWidth),
    y: padding.top + innerHeight - (value / peak) * innerHeight,
  }));
  const line = coordinates.map((point, index) => `${index ? "L" : "M"}${point.x.toFixed(1)},${point.y.toFixed(1)}`).join(" ");
  const lastCoordinate = coordinates[coordinates.length - 1];
  const area = coordinates.length ? `${line} L${lastCoordinate.x},${padding.top + innerHeight} L${coordinates[0].x},${padding.top + innerHeight} Z` : "";
  const ticks = [...new Set([0, Math.floor((points.length - 1) / 2), Math.max(points.length - 1, 0)])];
  const formatDate = (date: string) => new Date(`${date}T00:00:00`).toLocaleDateString(locale, { day: "2-digit", month: "short" });

  return <div className="restaurant-line-chart" aria-label={locale === "it" ? `Andamento ricavi in ${currency}` : `Revenue trend in ${currency}`}>
    <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" role="img">
      <defs><linearGradient id={`revenue-area-${currency}`} x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stopColor="var(--accent)" stopOpacity=".32" /><stop offset="100%" stopColor="var(--accent)" stopOpacity="0" /></linearGradient></defs>
      {[0, .5, 1].map((ratio) => <line key={ratio} x1={padding.left} x2={width - padding.right} y1={padding.top + innerHeight * ratio} y2={padding.top + innerHeight * ratio} className="restaurant-chart-gridline" />)}
      <text x="0" y={padding.top + 4} className="restaurant-chart-axis">{formatMoney(peak, currency, locale)}</text><text x="0" y={padding.top + innerHeight + 4} className="restaurant-chart-axis">0</text>
      {area ? <path d={area} fill={`url(#revenue-area-${currency})`} /> : null}{line ? <path d={line} className="restaurant-chart-line" /> : null}
      {coordinates.map((point, index) => <circle key={points[index].date} cx={point.x} cy={point.y} r="4.5" className="restaurant-chart-point"><title>{`${formatDate(points[index].date)} · ${formatMoney(values[index], currency, locale)}`}</title></circle>)}
      {ticks.map((index) => points[index] ? <text key={index} x={coordinates[index].x} y={height - 7} textAnchor="middle" className="restaurant-chart-axis">{formatDate(points[index].date)}</text> : null)}
    </svg>
  </div>;
}

function InteractiveRevenueLineChart({ points, locale, currency }: {
  points: RestaurantSalesSummary["series"];
  locale: Locale;
  currency: string;
}) {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const values = points.map((point) => numberValue(point.revenue));
  const peak = Math.max(...values, 1);
  const width = 720;
  const height = 228;
  const padding = { top: 22, right: 18, bottom: 34, left: 48 };
  const innerWidth = width - padding.left - padding.right;
  const innerHeight = height - padding.top - padding.bottom;
  const coordinates = values.map((value, index) => ({
    x: padding.left + (values.length === 1 ? innerWidth / 2 : (index / (values.length - 1)) * innerWidth),
    y: padding.top + innerHeight - (value / peak) * innerHeight,
  }));
  const line = coordinates.map((point, index) => `${index ? "L" : "M"}${point.x.toFixed(1)},${point.y.toFixed(1)}`).join(" ");
  const lastCoordinate = coordinates[coordinates.length - 1];
  const area = coordinates.length ? `${line} L${lastCoordinate.x},${padding.top + innerHeight} L${coordinates[0].x},${padding.top + innerHeight} Z` : "";
  const ticks = [...new Set([0, Math.floor((points.length - 1) / 2), Math.max(points.length - 1, 0)])];
  const formatDate = (date: string) => new Date(`${date}T00:00:00`).toLocaleDateString(locale, { day: "2-digit", month: "short" });
  const pinnedIndex = selectedIndex !== null && selectedIndex < points.length ? selectedIndex : null;
  const activeIndex = hoveredIndex ?? pinnedIndex;
  const activePoint = activeIndex === null ? null : points[activeIndex];
  const activeCoordinate = activeIndex === null ? null : coordinates[activeIndex];

  return <div className="restaurant-line-chart is-interactive" aria-label={locale === "it" ? `Andamento ricavi in ${currency}` : `Revenue trend in ${currency}`} onMouseLeave={() => setHoveredIndex(null)}>
    <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" role="img">
      <defs><linearGradient id={`interactive-revenue-area-${currency}`} x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stopColor="var(--accent)" stopOpacity=".32" /><stop offset="100%" stopColor="var(--accent)" stopOpacity="0" /></linearGradient></defs>
      {[0, .5, 1].map((ratio) => <line key={ratio} x1={padding.left} x2={width - padding.right} y1={padding.top + innerHeight * ratio} y2={padding.top + innerHeight * ratio} className="restaurant-chart-gridline" />)}
      <text x="0" y={padding.top + 4} className="restaurant-chart-axis">{formatMoney(peak, currency, locale)}</text><text x="0" y={padding.top + innerHeight + 4} className="restaurant-chart-axis">0</text>
      {area ? <path d={area} fill={`url(#interactive-revenue-area-${currency})`} /> : null}{line ? <path d={line} className="restaurant-chart-line" /> : null}
      {coordinates.map((point, index) => <circle key={points[index].date} cx={point.x} cy={point.y} r={activeIndex === index ? "7" : "4.5"} className={`restaurant-chart-point${activeIndex === index ? " is-active" : ""}`} tabIndex={0} role="button" aria-label={`${formatDate(points[index].date)}: ${formatMoney(values[index], currency, locale)}`} onMouseEnter={() => setHoveredIndex(index)} onFocus={() => setHoveredIndex(index)} onBlur={() => setHoveredIndex(null)} onClick={() => setSelectedIndex((current) => current === index ? null : index)} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); setSelectedIndex((current) => current === index ? null : index); } }} />)}
      {ticks.map((index) => points[index] ? <text key={index} x={coordinates[index].x} y={height - 7} textAnchor="middle" className="restaurant-chart-axis">{formatDate(points[index].date)}</text> : null)}
    </svg>
    {activePoint && activeCoordinate ? <div className="restaurant-chart-tooltip" role="status" style={{ "--restaurant-chart-tooltip-left": `${(activeCoordinate.x / width) * 100}%`, "--restaurant-chart-tooltip-top": `${(activeCoordinate.y / height) * 100}%` } as CSSProperties}><strong>{formatDate(activePoint.date)}</strong><span>{locale === "it" ? "Ricavi" : "Revenue"}<b>{formatMoney(activePoint.revenue, currency, locale)}</b></span><span>{locale === "it" ? "Bottiglie" : "Bottles"}<b>{activePoint.bottles}</b></span><span>{locale === "it" ? "Margine" : "Margin"}<b>{formatMoney(activePoint.gross_margin, currency, locale)}</b></span></div> : null}
  </div>;
}

function RestaurantIntelligence({ wines, locale, onOpenWine }: { wines: Wine[]; locale: Locale; onOpenWine: (wineId: string) => void }) {
  const [selectedCell, setSelectedCell] = useState<{ type: string; year: number } | null>(null);
  const [selectedRegion, setSelectedRegion] = useState("");
  const currentYear = new Date().getFullYear();
  const inventory = wines.filter((wine) => wine.quantity > 0);
  const mapped = inventory.filter(hasCompleteDrinkWindow);
  const years = Array.from({ length: 9 }, (_, index) => currentYear + index);
  const types = ["Red", "White", "Rose", "Sparkling", "Sweet", "Fortified", "Other"]
    .filter((type) => mapped.some((wine) => normalizeWineType(wine.type) === type));
  const heatmapRows = types.map((type) => ({
    type,
    cells: years.map((year) => {
      const items = mapped.filter((wine) => normalizeWineType(wine.type) === type && Number(wine.drink_from) <= year && Number(wine.drink_to) >= year);
      return { year, items, bottles: items.reduce((total, wine) => total + wine.quantity, 0) };
    }),
  }));
  const maxHeatmapBottles = Math.max(...heatmapRows.flatMap((row) => row.cells.map((cell) => cell.bottles)), 1);
  const capitalRiskByYear = years.map((year) => {
    const totals = inventory.reduce((byCurrency, wine) => {
      if (!wine.drink_to || year <= Number(wine.drink_to)) return byCurrency;
      const valuePerBottle = Math.max(Number(wine.sale_price || wine.current_value || wine.price || 0), 0);
      const probability = 1 - 0.85 ** (year - Number(wine.drink_to));
      const expectedLoss = valuePerBottle * Math.max(Number(wine.quantity || 0), 0) * probability;
      if (!expectedLoss) return byCurrency;
      const currency = (wine.currency || "CHF").toUpperCase();
      byCurrency.set(currency, (byCurrency.get(currency) || 0) + expectedLoss);
      return byCurrency;
    }, new Map<string, number>());
    return { year, totals, total: [...totals.values()].reduce((sum, value) => sum + value, 0) };
  });
  const maxCapitalRisk = Math.max(...capitalRiskByYear.map((point) => point.total), 1);
  const peakWines = mapped.filter((wine) => Number(wine.drink_peak_from) <= currentYear && Number(wine.drink_peak_to) >= currentYear);
  const riskWines = mapped
    .filter((wine) => Number(wine.drink_to) <= currentYear + 2)
    .map((wine) => ({ wine, exposure: Math.max(Number(wine.sale_price ?? wine.price ?? 0), 0) * wine.quantity }))
    .sort((first, second) => Number(first.wine.drink_to) - Number(second.wine.drink_to) || second.exposure - first.exposure);
  const totalsByCurrency = (items: Wine[]) => [...items.reduce((totals, wine) => {
    const currency = (wine.currency || "CHF").toUpperCase();
    totals.set(currency, (totals.get(currency) || 0) + Math.max(Number(wine.sale_price ?? wine.price ?? 0), 0) * wine.quantity);
    return totals;
  }, new Map<string, number>()).entries()].map(([currency, value]) => formatMoney(value, currency, locale)).join(" · ") || "—";
  const selectedWines = selectedCell
    ? heatmapRows.find((row) => row.type === selectedCell.type)?.cells.find((cell) => cell.year === selectedCell.year)?.items || []
    : [];
  const regionalWines = selectedRegion ? inventory.filter((wine) => wine.region === selectedRegion) : [];
  const t = (key: Parameters<typeof translate>[1]) => translate(locale, key);

  return <section className="restaurant-intelligence">
    <header className="restaurant-intelligence-head">
      <div><p className="eyebrow">{locale === "it" ? "Intelligence di carta" : "Wine list intelligence"}</p><h2>{locale === "it" ? "Maturità, capitale e geografia" : "Maturity, capital and geography"}</h2><p>{locale === "it" ? "Una lettura strategica per trasformare le finestre di beva in decisioni di carta e di rotazione." : "A strategic view that turns drinking windows into wine-list and rotation decisions."}</p></div>
      <div className="restaurant-intelligence-kpis"><article><span>{locale === "it" ? "Nel picco oggi" : "At peak today"}</span><strong>{peakWines.reduce((total, wine) => total + wine.quantity, 0)}</strong><small>{locale === "it" ? "bottiglie da valorizzare" : "bottles to feature"}</small></article><article className={riskWines.length ? "needs-attention" : ""}><span>{locale === "it" ? "Da ruotare entro 24 mesi" : "Rotate within 24 months"}</span><strong>{riskWines.reduce((total, item) => total + item.wine.quantity, 0)}</strong><small>{totalsByCurrency(riskWines.map((item) => item.wine))}</small></article></div>
    </header>
    <details className="restaurant-intelligence-panel restaurant-maturity-heatmap restaurant-collapsible" open>
      <summary><div><span>{locale === "it" ? "Mappa di maturità" : "Maturity map"}</span><h3>{locale === "it" ? "Quando la carta è più pronta" : "When the wine list is ready"}</h3></div><small>{locale === "it" ? "Clicca una cella per vedere i vini" : "Select a cell to inspect wines"}</small></summary>
      {heatmapRows.length ? <div className="restaurant-maturity-grid" style={{ "--restaurant-maturity-years": years.length } as CSSProperties}>
        <div className="restaurant-maturity-years"><span />{years.map((year) => <span key={year} className={year === currentYear ? "is-current" : ""}>{year}</span>)}</div>
        {heatmapRows.map((row) => <div className="restaurant-maturity-row" key={row.type}><span>{displayValue(row.type, locale, "type")}</span>{row.cells.map((cell) => {
          const selected = selectedCell?.type === row.type && selectedCell.year === cell.year;
          const title = `${displayValue(row.type, locale, "type")} ${cell.year}: ${cell.bottles} ${locale === "it" ? "bottiglie" : "bottles"}`;
          const intensity = cell.bottles ? Math.round(18 + (cell.bottles / maxHeatmapBottles) * 70) : 0;
          return <button type="button" key={cell.year} className={`${selected ? "is-selected " : ""}${intensity >= 58 ? "is-high" : ""}`} disabled={!cell.bottles} title={title} aria-label={title} style={{ "--restaurant-maturity-intensity": `${intensity}%` } as CSSProperties} onClick={() => setSelectedCell({ type: row.type, year: cell.year })}>{cell.bottles || ""}</button>;
        })}</div>)}
        <div className="restaurant-capital-risk-years"><span>{locale === "it" ? "Rischio capitale" : "Capital at risk"}</span>{capitalRiskByYear.map((point) => {
          const amount = [...point.totals.entries()].map(([currency, value]) => formatMoney(value, currency, locale)).join(" · ");
          const label = `${point.year}: ${locale === "it" ? "rischio capitale stimato" : "estimated capital at risk"} ${amount || "—"}`;
          return <span key={point.year} className={point.total ? "has-risk" : ""} style={{ "--restaurant-capital-risk-intensity": `${Math.round((point.total / maxCapitalRisk) * 78)}%` } as CSSProperties} title={label} aria-label={label}>{amount || "—"}</span>;
        })}</div>
      </div> : <p className="empty-state">{locale === "it" ? "Completa le finestre di beva per visualizzare la mappa di maturità." : "Complete drinking windows to display the maturity map."}</p>}
      {selectedCell ? <div className="restaurant-maturity-selection"><div><span>{locale === "it" ? "Selezione" : "Selection"}</span><strong>{displayValue(selectedCell.type, locale, "type")} · {selectedCell.year}</strong></div><div>{selectedWines.slice(0, 5).map((wine) => <button type="button" key={wine.id} onClick={() => onOpenWine(wine.id)}>{wine.name}<small>{wine.quantity} {locale === "it" ? "bottiglie" : "bottles"}</small></button>)}</div></div> : null}
    </details>
    <div className="restaurant-intelligence-grid">
      <details className="restaurant-intelligence-panel restaurant-capital-risk restaurant-collapsible"><summary><div><span>{locale === "it" ? "Capitale da recuperare" : "Capital to recover"}</span><h3>{locale === "it" ? "Priorità prima della fine finestra" : "Priorities before the window ends"}</h3></div><small>{locale === "it" ? "Prezzo di carta × giacenza" : "List price × current stock"}</small></summary>{riskWines.length ? <div className="restaurant-risk-list">{riskWines.slice(0, 6).map(({ wine, exposure }) => <button type="button" key={wine.id} onClick={() => onOpenWine(wine.id)}><span><strong>{wine.name}</strong><small>{wine.producer} · {wine.quantity} {locale === "it" ? "bottiglie" : "bottles"}</small></span><span><strong>{formatMoney(exposure, wine.currency, locale)}</strong><small>{Number(wine.drink_to) < currentYear ? (locale === "it" ? "Finestra superata" : "Window passed") : (locale === "it" ? `Entro il ${wine.drink_to}` : `By ${wine.drink_to}`)}</small></span></button>)}</div> : <p className="empty-state">{locale === "it" ? "Nessuna rimanenza con finestra in scadenza nei prossimi due anni." : "No stock with a window ending in the next two years."}</p>}</details>
      <details className="restaurant-intelligence-panel restaurant-geography restaurant-collapsible"><summary><div><span>{locale === "it" ? "Geografia della carta" : "Wine list geography"}</span><h3>{locale === "it" ? "Origini da raccontare" : "Origins to tell"}</h3></div><small>{locale === "it" ? "Clicca un punto per esplorare la regione" : "Select a point to explore its region"}</small></summary><WineGeographyMap wines={inventory} locale={locale} t={t} onSelectRegion={setSelectedRegion} />{selectedRegion ? <div className="restaurant-region-selection"><strong>{selectedRegion}</strong><span>{regionalWines.length} {locale === "it" ? "vini" : "wines"} · {regionalWines.reduce((total, wine) => total + wine.quantity, 0)} {locale === "it" ? "bottiglie" : "bottles"}</span></div> : null}</details>
    </div>
  </section>;
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
  const [restaurantDashboardView, setRestaurantDashboardView] = useState<"operations" | "intelligence">("operations");
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
  const maxTypeBottles = Math.max(...types.map((item) => item.bottles), 1);
  const maxRegionBottles = Math.max(...regions.map((item) => item.bottles), 1);
  const currentYear = new Date().getFullYear();
  const winesWithDrinkWindow = inventoryWines.filter(hasCompleteDrinkWindow);
  const peakWines = [...winesWithDrinkWindow]
    .filter((wine) => Number(wine.drink_peak_to) >= currentYear && Number(wine.drink_peak_from) <= currentYear + 1)
    .sort((first, second) => {
      const firstIsPeak = Number(first.drink_peak_from) <= currentYear ? 0 : 1;
      const secondIsPeak = Number(second.drink_peak_from) <= currentYear ? 0 : 1;
      return firstIsPeak - secondIsPeak || Number(first.drink_peak_to) - Number(second.drink_peak_to) || second.quantity - first.quantity;
    })
    .slice(0, 4);
  const atRiskWines = [...winesWithDrinkWindow]
    .filter((wine) => Number(wine.drink_to) <= currentYear + 2)
    .sort((first, second) => Number(first.drink_to) - Number(second.drink_to) || second.quantity - first.quantity)
    .slice(0, 4);
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
    if (period !== "custom") {
      const range = periodRange(period);
      setFromDate(range.fromDate);
      setToDate(range.toDate);
    }
  }, [period]);

  function navigatePeriod(direction: -1 | 1) {
    if (period === "custom") return;
    const reference = new Date(`${fromDate}T12:00:00`);
    if (period === "week") reference.setDate(reference.getDate() + direction * 7);
    if (period === "month") reference.setMonth(reference.getMonth() + direction);
    if (period === "semester") reference.setMonth(reference.getMonth() + direction * 6);
    if (period === "year") reference.setFullYear(reference.getFullYear() + direction);
    const range = periodRange(period, reference);
    setFromDate(range.fromDate);
    setToDate(range.toDate);
  }

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

  return <section className={`restaurant-dashboard${mode === "restaurant" && restaurantDashboardView === "intelligence" ? " is-intelligence" : ""}`}>
    <header className="restaurant-dashboard-head">
      <div><p className="eyebrow">{mode === "private" ? (locale === "it" ? "Cantina privata" : "Private cellar") : (locale === "it" ? "Gestione ristorante" : "Restaurant operations")}</p><h1>{mode === "private" ? (locale === "it" ? "Vendite della collezione" : "Collection sales") : (locale === "it" ? "Dashboard ristorante" : "Restaurant dashboard")}</h1><p>{mode === "private" ? (locale === "it" ? "Capitale recuperato e plusvalenze o minusvalenze realizzate nel periodo." : "Recovered capital and realized gains or losses for the selected period.") : (locale === "it" ? "Carta vini, giacenze, ricavi e marginalità in una sola visione operativa." : "Wine list, stock, revenue and margin in one operational view.")}</p></div>
    </header>
    {mode === "restaurant" ? <nav className="restaurant-dashboard-tabs" aria-label={locale === "it" ? "Vista dashboard ristorante" : "Restaurant dashboard view"}>
      <button type="button" className={restaurantDashboardView === "operations" ? "" : "secondary"} onClick={() => setRestaurantDashboardView("operations")}>{locale === "it" ? "Operatività" : "Operations"}</button>
      <button type="button" className={restaurantDashboardView === "intelligence" ? "" : "secondary"} onClick={() => setRestaurantDashboardView("intelligence")}>{locale === "it" ? "Intelligence di carta" : "Wine list intelligence"}</button>
    </nav> : null}
    {mode === "restaurant" && restaurantDashboardView === "intelligence" ? <RestaurantIntelligence wines={wines} locale={locale} onOpenWine={onOpenWine} /> : null}
    <div className="restaurant-operations">
    {mode === "restaurant" ? <details className="restaurant-inventory-overview restaurant-collapsible" open>
      <summary className="restaurant-section-title">
        <div><p className="eyebrow">{locale === "it" ? "Carta vini" : "Wine list"}</p><h2>{locale === "it" ? "La cantina del ristorante" : "Restaurant cellar"}</h2></div>
        <span>{locale === "it" ? "Giacenza, valore potenziale e composizione" : "Stock, potential value and composition"}</span>
      </summary>
      <div className="restaurant-inventory-kpis">
        <article><span>{locale === "it" ? "Vini in carta" : "Active labels"}</span><strong>{inventoryWines.length}</strong></article>
        <article><span>{locale === "it" ? "Bottiglie disponibili" : "Available bottles"}</span><strong>{inventoryBottles}</strong></article>
        <article><span>{locale === "it" ? "Scorte basse" : "Low stock"}</span><strong>{lowStockWines}</strong><small>{locale === "it" ? "Referenze con 1–2 bottiglie" : "Labels with 1–2 bottles"}</small></article>
        <article className={missingSalePrice ? "needs-attention" : ""}><span>{locale === "it" ? "Prezzo da completare" : "Missing sale price"}</span><strong>{missingSalePrice}</strong><small>{locale === "it" ? "Referenze senza prezzo di vendita" : "Labels without a sale price"}</small></article>
        <button type="button" className={incompleteWineData ? "needs-attention" : ""} disabled={!onOpenIncompleteWines} onClick={onOpenIncompleteWines}><span>{locale === "it" ? "Dati vino da completare" : "Wine data to complete"}</span><strong>{incompleteWineData}</strong><small>{locale === "it" ? "Apri le schede e usa l’arricchimento AI" : "Open records and use AI enrichment"}</small></button>
      </div>
      {inventoryByCurrency.length ? <div className="restaurant-inventory-values">
        {inventoryByCurrency.map(([currency, totals]) => <article key={currency}>
          <header><span>{locale === "it" ? `Valore potenziale di vendita · ${currency}` : `Potential sale value · ${currency}`}</span><strong>{formatMoney(totals.listValue, currency, locale)}</strong><small>{locale === "it" ? "Se tutte le bottiglie fossero vendute al prezzo di carta attuale." : "If every bottle sold at its current wine-list price."}</small></header>
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
          <div className="restaurant-distribution">{types.map((item) => <div key={item.label}><div><span>{displayValue(item.label, locale, "type") || item.label}</span><strong>{item.bottles}</strong></div><div className="restaurant-distribution-track" aria-label={`${item.bottles} ${locale === "it" ? "bottiglie" : "bottles"}`}><span className="restaurant-distribution-fill" style={{ width: `${Math.round((item.bottles / maxTypeBottles) * 100)}%` }} /></div></div>)}</div>
        </section>
        <section className="restaurant-panel restaurant-mix-panel">
          <header><div><span>{locale === "it" ? "Provenienza" : "Origin"}</span><h2>{locale === "it" ? "Top regioni" : "Top regions"}</h2></div></header>
          <div className="restaurant-distribution">{regions.map((item) => <div key={item.label}><div><span>{item.label}</span><strong>{item.bottles}</strong></div><div className="restaurant-distribution-track" aria-label={`${item.bottles} ${locale === "it" ? "bottiglie" : "bottles"}`}><span className="restaurant-distribution-fill" style={{ width: `${Math.round((item.bottles / maxRegionBottles) * 100)}%` }} /></div></div>)}</div>
        </section>
      </div>
      <section className="restaurant-proposals">
        <header className="restaurant-section-title"><div><p className="eyebrow">{locale === "it" ? "Suggerimenti di carta" : "Wine list suggestions"}</p><h2>{locale === "it" ? "Vini da proporre" : "Wines to feature"}</h2></div><span>{locale === "it" ? "Basati sulla finestra di beva, senza AI" : "Based on drinking windows, no AI"}</span></header>
        <div className="restaurant-proposals-grid">
          <section className="restaurant-proposal-card is-peak">
            <header><div><span>{locale === "it" ? "Nel momento giusto" : "At the right moment"}</span><h3>{locale === "it" ? "Valorizza il picco" : "Feature at peak"}</h3></div><strong>{peakWines.length}</strong></header>
            <p>{locale === "it" ? "Vini nel loro apice o a un anno dal picco: pronti per una proposta mirata in carta." : "Wines at peak or within a year of it, ready for a focused feature."}</p>
            {peakWines.length ? <div className="restaurant-proposal-list">{peakWines.map((wine) => <button type="button" key={wine.id} onClick={() => onOpenWine(wine.id)}>
              <span><strong>{wine.name}</strong><small>{wine.producer || wine.vintage}</small></span>
              <span className="restaurant-proposal-meta"><strong>{wine.quantity} {locale === "it" ? "in carta" : "in stock"}</strong><small>{locale === "it" ? `Picco ${wine.drink_peak_from}–${wine.drink_peak_to}` : `Peak ${wine.drink_peak_from}–${wine.drink_peak_to}`}</small></span>
            </button>)}</div> : <p className="restaurant-proposal-empty">{locale === "it" ? "Nessun vino nel picco nel prossimo anno." : "No wines at peak in the next year."}</p>}
          </section>
          <section className="restaurant-proposal-card is-risk">
            <header><div><span>{locale === "it" ? "Priorità di rotazione" : "Rotation priority"}</span><h3>{locale === "it" ? "Evita rimanenze mature" : "Avoid mature stock"}</h3></div><strong>{atRiskWines.length}</strong></header>
            <p>{locale === "it" ? "Bottiglie con finestra in scadenza o già superata: rendile visibili prima che perdano rilevanza in carta." : "Wines nearing or past their window: make them visible before they lose relevance on the list."}</p>
            {atRiskWines.length ? <div className="restaurant-proposal-list">{atRiskWines.map((wine) => <button type="button" key={wine.id} onClick={() => onOpenWine(wine.id)}>
              <span><strong>{wine.name}</strong><small>{wine.producer || wine.vintage}</small></span>
              <span className="restaurant-proposal-meta"><strong>{wine.quantity} {locale === "it" ? "in carta" : "in stock"}</strong><small>{Number(wine.drink_to) < currentYear ? (locale === "it" ? "Finestra superata" : "Window passed") : (locale === "it" ? `Entro il ${wine.drink_to}` : `By ${wine.drink_to}`)}</small></span>
            </button>)}</div> : <p className="restaurant-proposal-empty">{locale === "it" ? "Nessuna finestra a rischio nei prossimi due anni." : "No windows at risk in the next two years."}</p>}
          </section>
        </div>
      </section>
    </details> : null}
    {error ? <p className="error-banner">{error}</p> : null}
    {mode === "restaurant" ? <header className="restaurant-section-title restaurant-sales-heading"><div><p className="eyebrow">{locale === "it" ? "Vendite" : "Sales"}</p><h2>{locale === "it" ? "Performance del periodo" : "Period performance"}</h2></div><PeriodSelector locale={locale} period={period} setPeriod={setPeriod} fromDate={fromDate} setFromDate={setFromDate} toDate={toDate} setToDate={setToDate} onNavigate={navigatePeriod} canNavigateForward={toDate < isoDate(new Date())} /><span>{displayDate(fromDate, locale)} — {displayDate(toDate, locale)}</span></header> : null}
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
      const totals = summary.currencies.find((item) => item.currency === currency);
      if (!points.length || !totals) return null;
      const grossMargin = numberValue(totals.gross_margin);
      const bottles = Math.max(totals.bottles, 1);
      const stockInCurrency = inventoryWines
        .filter((wine) => (wine.currency || "CHF").toUpperCase() === currency)
        .reduce((total, wine) => total + wine.quantity, 0);
      const sellThrough = totals.bottles + stockInCurrency ? (totals.bottles / (totals.bottles + stockInCurrency)) * 100 : 0;
      return <details className="restaurant-performance-panel restaurant-collapsible" key={`chart-${currency}`} open>
        <summary className="restaurant-performance-head">
          <div><p className="eyebrow">{locale === "it" ? "Andamento" : "Performance"}</p><h2>{mode === "private" ? (locale === "it" ? `Capitale recuperato · ${currency}` : `Recovered capital · ${currency}`) : (locale === "it" ? `Ricavi e ritmo di vendita · ${currency}` : `Revenue and sales pace · ${currency}`)}</h2></div>
          <span>{locale === "it" ? `${points.length} giorni con vendite` : `${points.length} sales days`}</span>
        </summary>
        <div className="restaurant-performance-body">
          <TimeSeriesChart
            points={points.map((point) => ({ timestampMs: new Date(`${point.date}T12:00:00`).getTime(), value: numberValue(point.revenue) }))}
            ariaLabel={locale === "it" ? `Andamento ricavi in ${currency}` : `Revenue trend in ${currency}`}
            locale={locale}
            currency={currency}
            height={250}
            mobileHeight={210}
          />
          <aside className="restaurant-insights">
            <div><span>{locale === "it" ? "Margine per bottiglia" : "Margin per bottle"}</span><strong>{formatMoney(grossMargin / bottles, currency, locale)}</strong><small>{locale === "it" ? "media realizzata" : "realized average"}</small></div>
            <div><span>{locale === "it" ? "Rotazione del periodo" : "Period sell-through"}</span><strong>{sellThrough.toLocaleString(locale, { maximumFractionDigits: 1 })}%</strong><small>{locale === "it" ? `${totals.bottles} vendute · ${stockInCurrency} in carta` : `${totals.bottles} sold · ${stockInCurrency} on list`}</small></div>
            <div className={lowStockWines ? "needs-attention" : ""}><span>{locale === "it" ? "Scorte da controllare" : "Stock to review"}</span><strong>{lowStockWines}</strong><small>{locale === "it" ? "referenze con 1–2 bottiglie" : "labels with 1–2 bottles"}</small></div>
          </aside>
        </div>
      </details>;
    })}
    {mode === "restaurant" && summary ? <div className="restaurant-sales-breakdowns">
      {([
        [locale === "it" ? "Vendite per tipologia" : "Sales by wine type", summary.sales_by_type],
        [locale === "it" ? "Vendite per regione" : "Sales by region", summary.sales_by_region],
      ] as const).map(([title, items]) => <details className="restaurant-panel restaurant-sales-breakdown restaurant-collapsible" key={title}>
        <summary><h2>{title}</h2><span>{locale === "it" ? "Bottiglie · ricavi · margine" : "Bottles · revenue · margin"}</span></summary>
        {items.length ? <div>{items.map((item) => {
          const maxBottles = Math.max(...items.map((entry) => entry.bottles), 1);
          return <article key={`${item.label}-${item.currency}`}>
            <div><strong>{title === (locale === "it" ? "Vendite per tipologia" : "Sales by wine type") ? (displayValue(item.label, locale, "type") || item.label) : item.label}</strong><span>{item.bottles} {locale === "it" ? "vendute" : "sold"}</span></div>
            <i><b style={{ width: `${(item.bottles / maxBottles) * 100}%` }} /></i>
            <div className="restaurant-breakdown-money"><span>{formatMoney(item.revenue, item.currency, locale)}</span><strong>{formatMoney(item.gross_margin, item.currency, locale)}</strong></div>
          </article>;
        })}</div> : <p className="empty-state">—</p>}
      </details>)}
    </div> : null}
    <div className="restaurant-lower-grid">
      <details className="restaurant-panel restaurant-collapsible"><summary><h2>{mode === "private" ? (locale === "it" ? "Migliori vendite" : "Best sales") : (locale === "it" ? "Vini più venduti" : "Best-selling wines")}</h2></summary>{summary?.top_wines.length ? <div className="restaurant-ranking">{summary.top_wines.map((wine) => <button type="button" key={`${wine.wine_id}-${wine.currency}`} onClick={() => onOpenWine(wine.wine_id)}><span><strong>{wine.label}</strong><small>{wine.current_stock} {locale === "it" ? "ancora disponibili" : "still available"}</small></span><span className="restaurant-ranking-result"><strong>{wine.bottles} {locale === "it" ? "vendute" : "sold"}</strong><small>{formatMoney(wine.revenue, wine.currency, locale)} · {locale === "it" ? "margine" : "margin"} {formatMoney(wine.gross_margin, wine.currency, locale)}</small></span></button>)}</div> : <p className="empty-state">—</p>}</details>
      <details className="restaurant-panel restaurant-collapsible"><summary><h2>{locale === "it" ? "Invenduti o meno venduti" : "Unsold or slow-moving"}</h2></summary>{summary?.least_sold_wines.length ? <div className="restaurant-ranking restaurant-slow-movers">{summary.least_sold_wines.map((wine) => <button type="button" key={`${wine.wine_id}-${wine.currency}`} onClick={() => onOpenWine(wine.wine_id)}><span><strong>{wine.label}</strong><small>{wine.current_stock} {locale === "it" ? "in giacenza" : "in stock"}</small></span><span className="restaurant-ranking-result"><strong>{wine.bottles ? `${wine.bottles} ${locale === "it" ? "vendute" : "sold"}` : (locale === "it" ? "Invenduto" : "Unsold")}</strong><small>{wine.bottles ? formatMoney(wine.revenue, wine.currency, locale) : (locale === "it" ? "Nessuna vendita nel periodo" : "No sales in this period")}</small></span></button>)}</div> : <p className="empty-state">—</p>}</details>
    </div>
    <details className="restaurant-panel restaurant-collapsible"><summary><h2>{locale === "it" ? "Registro vendite" : "Sales register"}</h2></summary>{summary?.recent_sales.length ? <div className="restaurant-sales-list">{summary.recent_sales.map((sale) => <article key={sale.id}><div><strong>{sale.wine_name}</strong><span>{sale.sold_at} · {sale.quantity} × {formatMoney(sale.unit_sale_price, sale.currency, locale)}</span></div><div><strong>{formatMoney(sale.gross_margin, sale.currency, locale)}</strong><button type="button" className="secondary compact" onClick={() => void voidSale(sale.id)}>{locale === "it" ? "Annulla" : "Void"}</button></div></article>)}</div> : <p className="empty-state">—</p>}</details>
    </div>
  </section>;
}
