import { useEffect, useState, type CSSProperties, type FormEvent } from "react";
import type { Locale, RestaurantSalesSummary, StockMovement, StockMovementType, Wine } from "../types";
import { api, extractApiErrorText } from "../services/api";
import { formatMoney } from "../components/panelSupport";
import { displayValue, translate } from "../i18n";
import { normalizeWineType } from "../domain/wineTypes";
import WineGeographyMap from "./WineGeographyMap";
import TimeSeriesChart from "../components/TimeSeriesChart";
import "./RestaurantDashboard.css";

type Period = "week" | "month" | "semester" | "year" | "custom";
type ManualStockMovementType = Extract<StockMovementType, "purchase" | "adjustment_in" | "adjustment_out" | "breakage" | "complimentary">;

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

function dateInputValue(date: string, locale: Locale) {
  const [year, month, day] = date.split("-");
  if (!year || !month || !day) return "";
  return locale === "it" ? `${day}/${month}/${year}` : `${month}/${day}/${year}`;
}

function parseDateInput(value: string, locale: Locale) {
  const parts = value.trim().match(/^(\d{1,2})[/.\-](\d{1,2})[/.\-](\d{4})$/);
  if (!parts) return null;
  const [, first, second, year] = parts;
  const day = Number(locale === "it" ? first : second);
  const month = Number(locale === "it" ? second : first);
  const parsed = new Date(Number(year), month - 1, day);
  if (parsed.getFullYear() !== Number(year) || parsed.getMonth() !== month - 1 || parsed.getDate() !== day) return null;
  return isoDate(parsed);
}

function LocalizedDateInput({ locale, value, onChange, label }: { locale: Locale; value: string; onChange: (date: string) => void; label: string }) {
  const [draft, setDraft] = useState(() => dateInputValue(value, locale));

  useEffect(() => setDraft(dateInputValue(value, locale)), [value, locale]);

  function commit() {
    const parsed = parseDateInput(draft, locale);
    if (parsed) onChange(parsed);
    setDraft(dateInputValue(parsed || value, locale));
  }

  return <input
    type="text"
    inputMode="numeric"
    autoComplete="off"
    value={draft}
    placeholder={locale === "it" ? "gg/mm/aaaa" : "mm/dd/yyyy"}
    aria-label={label}
    onChange={(event) => setDraft(event.target.value)}
    onBlur={commit}
    onKeyDown={(event) => {
      if (event.key === "Enter") event.currentTarget.blur();
    }}
  />;
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

function stockMovementLabel(type: StockMovementType, locale: Locale) {
  const labels: Record<StockMovementType, [string, string]> = {
    opening_balance: ["Saldo iniziale", "Opening balance"],
    initial_purchase: ["Acquisto iniziale", "Initial purchase"],
    purchase: ["Acquisto", "Purchase"],
    adjustment_in: ["Rettifica in entrata", "Inbound adjustment"],
    adjustment_out: ["Rettifica in uscita", "Outbound adjustment"],
    breakage: ["Rottura", "Breakage"],
    complimentary: ["Omaggio", "Complimentary"],
    sale: ["Vendita", "Sale"],
    sale_void: ["Vendita annullata", "Voided sale"],
  };
  return labels[type]?.[locale === "it" ? 0 : 1] || type;
}

function useCompactRestaurantLayout() {
  const [compact, setCompact] = useState(() =>
    typeof window !== "undefined" && window.matchMedia("(max-width: 640px)").matches,
  );

  useEffect(() => {
    const query = window.matchMedia("(max-width: 640px)");
    const update = () => setCompact(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);

  return compact;
}

function PeriodSelector({ locale, period, setPeriod, fromDate, setFromDate, toDate, setToDate, onNavigate, canNavigateForward, onExport, exporting }: {
  locale: Locale;
  period: Period;
  setPeriod: (period: Period) => void;
  fromDate: string;
  setFromDate: (date: string) => void;
  toDate: string;
  setToDate: (date: string) => void;
  onNavigate: (direction: -1 | 1) => void;
  canNavigateForward: boolean;
  onExport: () => void;
  exporting: boolean;
}) {
  return <div className="restaurant-period-selector">
    <div className="restaurant-periods" role="group" aria-label={locale === "it" ? "Periodo del grafico" : "Chart period"}>
      {(["week", "month", "semester", "year", "custom"] as Period[]).map((item) => <button type="button" className={period === item ? "" : "secondary"} key={item} onClick={() => setPeriod(item)}>{({ week: locale === "it" ? "Settimana" : "Week", month: locale === "it" ? "Mese" : "Month", semester: locale === "it" ? "6 mesi" : "6 months", year: locale === "it" ? "Anno" : "Year", custom: locale === "it" ? "Personalizzato" : "Custom" })[item]}</button>)}
    </div>
    {period !== "custom" ? <div className="restaurant-period-actions">
      <div className="restaurant-period-navigation"><button type="button" className="secondary compact" onClick={() => onNavigate(-1)} aria-label={locale === "it" ? "Periodo precedente" : "Previous period"}>‹</button><button type="button" className="secondary compact" onClick={() => onNavigate(1)} disabled={!canNavigateForward} aria-label={locale === "it" ? "Periodo successivo" : "Next period"}>›</button></div>
      <span className="restaurant-period-range">{displayDate(fromDate, locale)} — {displayDate(toDate, locale)}</span>
      <button type="button" className="secondary compact restaurant-excel-export" disabled={exporting} onClick={onExport}>{exporting ? (locale === "it" ? "Preparo Excel…" : "Preparing Excel…") : (locale === "it" ? "Esporta Excel" : "Export Excel")}</button>
    </div> : <>
      <div className="restaurant-custom-dates"><label>{locale === "it" ? "Dal" : "From"}<LocalizedDateInput locale={locale} value={fromDate} onChange={setFromDate} label={locale === "it" ? "Data iniziale" : "Start date"} /></label><label>{locale === "it" ? "Al" : "To"}<LocalizedDateInput locale={locale} value={toDate} onChange={setToDate} label={locale === "it" ? "Data finale" : "End date"} /></label></div>
      <button type="button" className="secondary compact restaurant-excel-export" disabled={exporting} onClick={onExport}>{exporting ? (locale === "it" ? "Preparo Excel…" : "Preparing Excel…") : (locale === "it" ? "Esporta Excel" : "Export Excel")}</button>
    </>}
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
  const compactLayout = useCompactRestaurantLayout();
  const [riskOpen, setRiskOpen] = useState(true);
  const [geographyOpen, setGeographyOpen] = useState(true);
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
  const winesToFeature = peakWines
    .map((wine) => ({ wine, margin: Math.max(numberValue(wine.sale_price) - numberValue(wine.price), 0) * wine.quantity }))
    .sort((first, second) => second.margin - first.margin || second.wine.quantity - first.wine.quantity)
    .slice(0, 6);
  const lowStockWines = inventory
    .filter((wine) => wine.reorder_enabled && wine.reorder_threshold > 0 && wine.quantity <= wine.reorder_threshold)
    .sort((first, second) => first.quantity - second.quantity || first.name.localeCompare(second.name))
    .slice(0, 6);
  const incompleteWines = inventory
    .map((wine) => ({
      wine,
      missing: [
        !numberValue(wine.sale_price) ? (locale === "it" ? "prezzo di carta" : "list price") : "",
        !numberValue(wine.price) ? (locale === "it" ? "costo bottiglia" : "bottle cost") : "",
        !hasCompleteDrinkWindow(wine) ? (locale === "it" ? "finestra di beva" : "drinking window") : "",
      ].filter(Boolean),
    }))
    .filter((item) => item.missing.length)
    .sort((first, second) => second.missing.length - first.missing.length || first.wine.name.localeCompare(second.wine.name));
  const wineTypeMix = bottleDistribution(inventory, "type", locale === "it" ? "Non classificato" : "Unclassified");
  const maxTypeMix = Math.max(...wineTypeMix.map((item) => item.bottles), 1);
  const totalsByCurrency = (items: Wine[]) => [...items.reduce((totals, wine) => {
    const currency = (wine.currency || "CHF").toUpperCase();
    totals.set(currency, (totals.get(currency) || 0) + Math.max(Number(wine.sale_price ?? wine.price ?? 0), 0) * wine.quantity);
    return totals;
  }, new Map<string, number>()).entries()].map(([currency, value]) => formatMoney(value, currency, locale)).join(" · ") || "—";
  const selectedWines = [...(selectedCell
    ? heatmapRows.find((row) => row.type === selectedCell.type)?.cells.find((cell) => cell.year === selectedCell.year)?.items || []
    : [])]
    .sort((first, second) => {
      const firstAtPeak = Number(first.drink_peak_from) <= Number(selectedCell?.year) && Number(first.drink_peak_to) >= Number(selectedCell?.year);
      const secondAtPeak = Number(second.drink_peak_from) <= Number(selectedCell?.year) && Number(second.drink_peak_to) >= Number(selectedCell?.year);
      return Number(secondAtPeak) - Number(firstAtPeak)
        || Number(first.drink_to) - Number(second.drink_to)
        || Number(second.quantity) - Number(first.quantity)
        || first.name.localeCompare(second.name);
    });
  const visibleSelectedWines = selectedWines.slice(0, 5);
  const regionalWines = selectedRegion ? inventory.filter((wine) => wine.region === selectedRegion) : [];
  const t = (key: Parameters<typeof translate>[1]) => translate(locale, key);

  useEffect(() => {
    if (!compactLayout) return;
    setRiskOpen(true);
    setGeographyOpen(true);
  }, [compactLayout]);

  return <section className="restaurant-intelligence">
    <header className="restaurant-intelligence-head">
      <div><p className="eyebrow">{locale === "it" ? "Analisi della carta" : "Wine list intelligence"}</p><h2>{locale === "it" ? "Maturità, capitale e geografia" : "Maturity, capital and geography"}</h2><p>{locale === "it" ? "Una lettura strategica per trasformare le finestre di beva in decisioni di carta e di rotazione." : "A strategic view that turns drinking windows into wine-list and rotation decisions."}</p></div>
      <div className="restaurant-intelligence-kpis"><article><span>{locale === "it" ? "Nel picco oggi" : "At peak today"}</span><strong>{peakWines.reduce((total, wine) => total + wine.quantity, 0)}</strong><small>{locale === "it" ? "bottiglie da valorizzare" : "bottles to feature"}</small></article><article className={riskWines.length ? "needs-attention" : ""}><span>{locale === "it" ? "Da ruotare entro 24 mesi" : "Rotate within 24 months"}</span><strong>{riskWines.reduce((total, item) => total + item.wine.quantity, 0)}</strong><small>{totalsByCurrency(riskWines.map((item) => item.wine))}</small></article></div>
    </header>
    <details className="restaurant-intelligence-panel restaurant-maturity-heatmap restaurant-collapsible" open>
      <summary><div><span>{locale === "it" ? "Mappa di maturità" : "Maturity map"}</span><h3>{locale === "it" ? "Quando la carta è più pronta" : "When the wine list is ready"}</h3></div><small>{locale === "it" ? "Clicca una cella per vedere i vini" : "Select a cell to inspect wines"}</small></summary>
      {heatmapRows.length ? <><p className="restaurant-mobile-scroll-hint">{locale === "it" ? "Scorri la mappa per leggere tutti gli anni." : "Scroll the map to read every year."}</p><div className="restaurant-maturity-grid" style={{ "--restaurant-maturity-years": years.length } as CSSProperties}>
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
          const intensity = Math.round((point.total / maxCapitalRisk) * 78);
          return <span key={point.year} className={point.total ? "has-risk" : ""} style={{ "--restaurant-capital-risk-intensity": `${intensity}%`, color: intensity >= 48 ? "var(--surface)" : "var(--text)", textShadow: intensity >= 48 ? "0 1px 1px color-mix(in srgb, var(--primary) 30%, transparent)" : "none" } as CSSProperties} title={label} aria-label={label}>{amount || "—"}</span>;
        })}</div>
      </div></> : <p className="empty-state">{locale === "it" ? "Completa le finestre di beva per visualizzare la mappa di maturità." : "Complete drinking windows to display the maturity map."}</p>}
      {selectedCell ? <div className="restaurant-maturity-selection"><div><span>{locale === "it" ? "Selezione" : "Selection"}</span><strong>{displayValue(selectedCell.type, locale, "type")} · {selectedCell.year}</strong><small>{locale === "it" ? `${visibleSelectedWines.length} priorità su ${selectedWines.length} referenze` : `${visibleSelectedWines.length} priorities from ${selectedWines.length} labels`}</small></div><div>{visibleSelectedWines.map((wine) => { const atPeak = Number(wine.drink_peak_from) <= selectedCell.year && Number(wine.drink_peak_to) >= selectedCell.year; return <button type="button" key={wine.id} onClick={() => onOpenWine(wine.id)}>{wine.name} · {wine.vintage || "NV"}<small>{wine.quantity} {locale === "it" ? "bottiglie" : "bottles"} · {atPeak ? (locale === "it" ? "Nel picco" : "At peak") : (locale === "it" ? `Finestra fino al ${wine.drink_to}` : `Window to ${wine.drink_to}`)}</small></button>; })}</div></div> : null}
    </details>
    <div className="restaurant-intelligence-grid">
      <details className="restaurant-intelligence-panel restaurant-capital-risk restaurant-collapsible" open={riskOpen} onToggle={(event) => setRiskOpen(event.currentTarget.open)}><summary><div><span>{locale === "it" ? "Capitale da recuperare" : "Capital to recover"}</span><h3>{locale === "it" ? "Priorità prima della fine finestra" : "Priorities before the window ends"}</h3></div><small>{locale === "it" ? "Prezzo di carta × giacenza" : "List price × current stock"}</small></summary>{riskWines.length ? <div className="restaurant-risk-list">{riskWines.slice(0, 6).map(({ wine, exposure }) => <button type="button" key={wine.id} onClick={() => onOpenWine(wine.id)}><span><strong>{wine.name}</strong><small>{wine.producer} · {wine.quantity} {locale === "it" ? "bottiglie" : "bottles"}</small></span><span><strong>{formatMoney(exposure, wine.currency, locale)}</strong><small>{Number(wine.drink_to) < currentYear ? (locale === "it" ? "Finestra superata" : "Window passed") : (locale === "it" ? `Entro il ${wine.drink_to}` : `By ${wine.drink_to}`)}</small></span></button>)}</div> : <p className="empty-state">{locale === "it" ? "Nessuna rimanenza con finestra in scadenza nei prossimi due anni." : "No stock with a window ending in the next two years."}</p>}</details>
      <details className="restaurant-intelligence-panel restaurant-geography restaurant-collapsible" open={geographyOpen} onToggle={(event) => setGeographyOpen(event.currentTarget.open)}><summary><div><span>{locale === "it" ? "Geografia della carta" : "Wine list geography"}</span><h3>{locale === "it" ? "Origini da raccontare" : "Origins to tell"}</h3></div><small>{locale === "it" ? "Clicca un punto per esplorare la regione" : "Select a point to explore its region"}</small></summary><WineGeographyMap wines={inventory} locale={locale} t={t} onSelectRegion={setSelectedRegion} />{selectedRegion ? <div className="restaurant-region-selection"><strong>{selectedRegion}</strong><span>{regionalWines.length} {locale === "it" ? "vini" : "wines"} · {regionalWines.reduce((total, wine) => total + wine.quantity, 0)} {locale === "it" ? "bottiglie" : "bottles"}</span></div> : null}</details>
    </div>
    <div className="restaurant-intelligence-action-grid">
      <details className="restaurant-intelligence-panel restaurant-collapsible" open><summary><div><span>{locale === "it" ? "Da proporre ora" : "Feature now"}</span><h3>{locale === "it" ? "Vini nel picco con margine" : "Peak wines with margin"}</h3></div><small>{locale === "it" ? "Priorità per sala e carta" : "Priorities for service and list"}</small></summary>{winesToFeature.length ? <div className="restaurant-action-list">{winesToFeature.map(({ wine, margin }) => <button type="button" key={wine.id} onClick={() => onOpenWine(wine.id)}><span><strong>{wine.name}</strong><small>{wine.producer} · {wine.quantity} {locale === "it" ? "bottiglie" : "bottles"}</small></span><span><strong>{formatMoney(margin, wine.currency, locale)}</strong><small>{locale === "it" ? "margine potenziale" : "potential margin"}</small></span></button>)}</div> : <p className="empty-state">{locale === "it" ? "Aggiungi prezzi di carta e finestre di beva per ricevere proposte." : "Add list prices and drinking windows to receive recommendations."}</p>}</details>
      <details className="restaurant-intelligence-panel restaurant-collapsible" open><summary><div><span>{locale === "it" ? "Riordino" : "Reordering"}</span><h3>{locale === "it" ? "Scorte sotto soglia" : "Stock below threshold"}</h3></div><small>{locale === "it" ? "Basato sulle soglie impostate" : "Based on your set thresholds"}</small></summary>{lowStockWines.length ? <div className="restaurant-action-list">{lowStockWines.map((wine) => <button type="button" key={wine.id} onClick={() => onOpenWine(wine.id)}><span><strong>{wine.name}</strong><small>{wine.producer || wine.vintage}</small></span><span><strong>{wine.quantity} / {wine.reorder_threshold}</strong><small>{locale === "it" ? "giacenza / soglia" : "stock / threshold"}</small></span></button>)}</div> : <p className="empty-state">{locale === "it" ? "Nessuna referenza sotto la soglia impostata." : "No labels are below their set threshold."}</p>}</details>
      <details className="restaurant-intelligence-panel restaurant-collapsible" open><summary><div><span>{locale === "it" ? "Mix della carta" : "Wine list mix"}</span><h3>{locale === "it" ? "Composizione per tipologia" : "Composition by type"}</h3></div><small>{locale === "it" ? "Bottiglie disponibili" : "Bottles in stock"}</small></summary>{wineTypeMix.length ? <div className="restaurant-mix-list">{wineTypeMix.map((item) => <div key={item.label}><span>{displayValue(item.label, locale, "type")}</span><i><b style={{ width: `${Math.max(8, (item.bottles / maxTypeMix) * 100)}%` }} /></i><strong>{item.bottles}</strong></div>)}</div> : <p className="empty-state">—</p>}</details>
      <details className="restaurant-intelligence-panel restaurant-collapsible" open><summary><div><span>{locale === "it" ? "Qualità dati" : "Data quality"}</span><h3>{locale === "it" ? "Schede da completare" : "Records to complete"}</h3></div><small>{incompleteWines.length} {locale === "it" ? "referenze" : "labels"}</small></summary>{incompleteWines.length ? <div className="restaurant-action-list">{incompleteWines.slice(0, 6).map(({ wine, missing }) => <button type="button" key={wine.id} onClick={() => onOpenWine(wine.id)}><span><strong>{wine.name}</strong><small>{wine.producer || wine.vintage}</small></span><span><small>{missing.join(" · ")}</small></span></button>)}</div> : <p className="empty-state">{locale === "it" ? "Tutte le schede hanno prezzi e finestra di beva completi." : "All records have complete prices and drinking windows."}</p>}</details>
    </div>
  </section>;
}

export default function RestaurantDashboard({ locale, refreshKey, onOpenWine, onChanged, onOpenIncompleteWines, onOpenLowStockWines, onOpenMissingSalePriceWines, mode = "restaurant", wines = [] }: {
  locale: Locale;
  refreshKey: number;
  onOpenWine: (wineId: string) => void;
  onChanged: () => Promise<void>;
  onOpenIncompleteWines?: () => void;
  onOpenLowStockWines?: () => void;
  onOpenMissingSalePriceWines?: () => void;
  mode?: "restaurant" | "private";
  wines?: Wine[];
}) {
  const [period, setPeriod] = useState<Period>("month");
  const [restaurantDashboardView, setRestaurantDashboardView] = useState<"performance" | "inventory" | "stock" | "sales" | "intelligence">("performance");
  const [restaurantMenuOpen, setRestaurantMenuOpen] = useState(false);
  const [fromDate, setFromDate] = useState(periodStart("month"));
  const [toDate, setToDate] = useState(isoDate(new Date()));
  const [summary, setSummary] = useState<RestaurantSalesSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [editingSale, setEditingSale] = useState<{ id: string; sold_at: string; quantity: string; unit_sale_price: string; note: string } | null>(null);
  const [saleSaving, setSaleSaving] = useState(false);
  const [exportingExcel, setExportingExcel] = useState(false);
  const [error, setError] = useState("");
  const [libraryPhotoUrls, setLibraryPhotoUrls] = useState<Record<string, string>>({});
  const [stockMovements, setStockMovements] = useState<StockMovement[]>([]);
  const [stockMovementSaving, setStockMovementSaving] = useState(false);
  const [stockDraft, setStockDraft] = useState({
    wine_id: "",
    movement_type: "purchase" as ManualStockMovementType,
    quantity: "1",
    occurred_on: isoDate(new Date()),
    unit_cost: "",
    supplier: "",
    reference: "",
    note: "",
  });
  const stockWines = wines.filter((wine) => wine.quantity > 0);
  const inventoryWines = stockWines.filter((wine) => wine.commercial_status === "active" || wine.commercial_status === "clearing_out");
  const reorderWines = wines.filter((wine) => wine.reorder_enabled !== false && wine.commercial_status === "active" && wine.quantity <= wine.reorder_threshold);
  const clearingOutWines = wines.filter((wine) => wine.commercial_status === "clearing_out" && wine.quantity > 0);
  const inventoryBottles = stockWines.reduce((total, wine) => total + wine.quantity, 0);
  const missingSalePrice = inventoryWines.filter((wine) => !wine.sale_price).length;
  const lowStockWines = reorderWines.length;
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
  const inventoryByCurrency = [...stockWines.reduce((totals, wine) => {
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
    if (!stockDraft.wine_id && wines[0]) {
      setStockDraft((current) => ({ ...current, wine_id: wines[0].id }));
    }
  }, [stockDraft.wine_id, wines]);

  useEffect(() => {
    if (mode !== "restaurant") return;
    let active = true;
    api<StockMovement[]>("/api/v1/inventory/movements?limit=40")
      .then((result) => { if (active) setStockMovements(Array.isArray(result) ? result : []); })
      .catch(() => { if (active) setStockMovements([]); });
    return () => { active = false; };
  }, [mode, refreshKey]);

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
          sales_by_producer: Array.isArray(result.sales_by_producer) ? result.sales_by_producer : [],
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

  async function updateSale(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editingSale) return;
    const quantity = Number(editingSale.quantity);
    const unitSalePrice = Number(editingSale.unit_sale_price);
    if (!editingSale.sold_at || !Number.isInteger(quantity) || quantity < 1 || !Number.isFinite(unitSalePrice) || unitSalePrice < 0) return;
    setSaleSaving(true);
    setError("");
    try {
      const updatedSale = await api<RestaurantSalesSummary["recent_sales"][number]>(`/api/v1/sales/${editingSale.id}`, {
        method: "PUT",
        body: JSON.stringify({
          sold_at: editingSale.sold_at,
          quantity,
          unit_sale_price: unitSalePrice,
          note: editingSale.note,
        }),
      });
      setSummary((current) => current ? {
        ...current,
        recent_sales: current.recent_sales.map((sale) => sale.id === updatedSale.id ? updatedSale : sale),
      } : current);
      setEditingSale(null);
      void onChanged();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : (locale === "it" ? "Impossibile modificare la vendita" : "Unable to update sale"));
    } finally {
      setSaleSaving(false);
    }
  }

  async function exportExcel() {
    setExportingExcel(true);
    setError("");
    try {
      const query = new URLSearchParams({ from_date: fromDate, to_date: toDate, locale });
      const response = await fetch(`/api/v1/sales/export.xlsx?${query.toString()}`, { credentials: "include" });
      if (!response.ok) {
        const message = extractApiErrorText(await response.text());
        throw new Error(message || `Request failed: ${response.status}`);
      }
      const url = URL.createObjectURL(await response.blob());
      const link = document.createElement("a");
      link.href = url;
      link.download = `vinaris-ristorante-${fromDate}-${toDate}.xlsx`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : (locale === "it" ? "Impossibile esportare il file Excel" : "Unable to export Excel file"));
    } finally {
      setExportingExcel(false);
    }
  }

  async function createStockMovement(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!stockDraft.wine_id || !Number(stockDraft.quantity)) return;
    setStockMovementSaving(true);
    setError("");
    try {
      const inbound = stockDraft.movement_type === "purchase" || stockDraft.movement_type === "adjustment_in";
      const created = await api<StockMovement[]>("/api/v1/inventory/movements", {
        method: "POST",
        body: JSON.stringify({
          wine_id: stockDraft.wine_id,
          movement_type: stockDraft.movement_type,
          quantity: Number(stockDraft.quantity),
          occurred_on: stockDraft.occurred_on,
          unit_cost: inbound && stockDraft.unit_cost ? Number(stockDraft.unit_cost) : undefined,
          supplier: inbound ? stockDraft.supplier.trim() : "",
          reference: stockDraft.reference.trim(),
          note: stockDraft.note.trim(),
        }),
      });
      setStockMovements((current) => [...created, ...current].slice(0, 40));
      setStockDraft((current) => ({ ...current, quantity: "1", reference: "", note: "" }));
      await onChanged();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : (locale === "it" ? "Impossibile registrare il movimento" : "Unable to record stock movement"));
    } finally {
      setStockMovementSaving(false);
    }
  }

  return <section className={`restaurant-dashboard${mode === "restaurant" ? ` restaurant-dashboard--${restaurantDashboardView}` : ""}`}>
    {mode === "private" ? <header className="restaurant-dashboard-head">
      <div><p className="eyebrow">{locale === "it" ? "Cantina privata" : "Private cellar"}</p><h1>{locale === "it" ? "Vendite della collezione" : "Collection sales"}</h1><p>{locale === "it" ? "Capitale recuperato e plusvalenze o minusvalenze realizzate nel periodo." : "Recovered capital and realized gains or losses for the selected period."}</p></div>
    </header> : null}
    {mode === "restaurant" ? <>
      <button type="button" className="restaurant-dashboard-menu-toggle secondary" aria-expanded={restaurantMenuOpen} aria-controls="restaurant-dashboard-navigation" onClick={() => setRestaurantMenuOpen((open) => !open)}>
        <i aria-hidden="true"><b /><b /><b /></i>{locale === "it" ? "Menu" : "Menu"}
      </button>
      <nav id="restaurant-dashboard-navigation" className={`restaurant-dashboard-tabs${restaurantMenuOpen ? " is-open" : ""}`} aria-label={locale === "it" ? "Vista dashboard ristorante" : "Restaurant dashboard view"}>
        <button type="button" className={restaurantDashboardView === "performance" ? "" : "secondary"} onClick={() => { setRestaurantDashboardView("performance"); setRestaurantMenuOpen(false); }}>{locale === "it" ? "Performance" : "Performance"}</button>
        <button type="button" className={restaurantDashboardView === "inventory" ? "" : "secondary"} onClick={() => { setRestaurantDashboardView("inventory"); setRestaurantMenuOpen(false); }}>{locale === "it" ? "Carta vini" : "Wine list"}</button>
        <button type="button" className={restaurantDashboardView === "stock" ? "" : "secondary"} onClick={() => { setRestaurantDashboardView("stock"); setRestaurantMenuOpen(false); }}>{locale === "it" ? "Magazzino" : "Inventory"}</button>
        <button type="button" className={restaurantDashboardView === "sales" ? "" : "secondary"} onClick={() => { setRestaurantDashboardView("sales"); setRestaurantMenuOpen(false); }}>{locale === "it" ? "Registro vendite" : "Sales register"}</button>
        <button type="button" className={restaurantDashboardView === "intelligence" ? "" : "secondary"} onClick={() => { setRestaurantDashboardView("intelligence"); setRestaurantMenuOpen(false); }}>{locale === "it" ? "Analisi della carta" : "Wine list intelligence"}</button>
      </nav>
    </> : null}
    {mode === "restaurant" && restaurantDashboardView === "intelligence" ? <RestaurantIntelligence wines={wines} locale={locale} onOpenWine={onOpenWine} /> : null}
    <div className={`restaurant-operations${mode === "restaurant" ? " restaurant-operations--management" : ""}`}>
    {mode === "restaurant" ? <details className="restaurant-inventory-overview restaurant-collapsible" open>
      <summary className="restaurant-section-title">
        <div><p className="eyebrow">{locale === "it" ? "Carta vini" : "Wine list"}</p><h2>{locale === "it" ? "La cantina del ristorante" : "Restaurant cellar"}</h2></div>
        <span>{locale === "it" ? "Giacenza, valore potenziale e composizione" : "Stock, potential value and composition"}</span>
      </summary>
      <div className="restaurant-inventory-kpis">
        <article><span>{locale === "it" ? "Vini in carta" : "Active labels"}</span><strong>{inventoryWines.length}</strong></article>
        <article><span>{locale === "it" ? "Bottiglie disponibili" : "Available bottles"}</span><strong>{inventoryBottles}</strong></article>
        <button type="button" className={lowStockWines ? "needs-attention" : ""} disabled={!lowStockWines || !onOpenLowStockWines} onClick={onOpenLowStockWines}><span>{locale === "it" ? "Da ordinare" : "To reorder"}</span><strong>{lowStockWines}</strong><small>{locale === "it" ? "Sotto la soglia impostata per il vino" : "At or below each wine threshold"}</small></button>
        <button type="button" className={missingSalePrice ? "needs-attention" : ""} disabled={!missingSalePrice || !onOpenMissingSalePriceWines} onClick={onOpenMissingSalePriceWines}><span>{locale === "it" ? "Prezzo da completare" : "Missing sale price"}</span><strong>{missingSalePrice}</strong><small>{locale === "it" ? "Referenze senza prezzo di vendita" : "Labels without a sale price"}</small></button>
        <button type="button" className={incompleteWineData ? "needs-attention" : ""} disabled={!onOpenIncompleteWines} onClick={onOpenIncompleteWines}><span>{locale === "it" ? "Dati vino da completare" : "Wine data to complete"}</span><strong>{incompleteWineData}</strong><small>{locale === "it" ? "Apri le schede e usa l’arricchimento AI" : "Open records and use AI enrichment"}</small></button>
      </div>
      {clearingOutWines.length ? <section className="restaurant-clearing-out">
        <header><div><span>{locale === "it" ? "Fine catalogo" : "End of list"}</span><h3>{locale === "it" ? "Vini a esaurimento" : "Wines being cleared"}</h3></div><strong>{clearingOutWines.length}</strong></header>
        <div>{clearingOutWines.slice(0, 6).map((wine) => <button type="button" key={wine.id} onClick={() => onOpenWine(wine.id)}><span><strong>{wine.name}</strong><small>{[wine.producer, wine.vintage].filter(Boolean).join(" · ")}</small></span><b>{wine.quantity} {locale === "it" ? "rimaste" : "left"}</b></button>)}</div>
      </section> : null}
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
    {mode === "restaurant" ? <details className="restaurant-panel restaurant-stock-ledger restaurant-collapsible" open>
      <summary className="restaurant-section-title">
        <div><p className="eyebrow">{locale === "it" ? "Magazzino" : "Inventory"}</p><h2>{locale === "it" ? "Movimenti e lotti" : "Movements and lots"}</h2></div>
        <span>{locale === "it" ? "Carichi, rettifiche e uscite con valorizzazione FIFO" : "Receipts, adjustments and issues with FIFO costing"}</span>
      </summary>
      <div className="restaurant-stock-ledger-body">
        <form className="restaurant-stock-form" onSubmit={(event) => void createStockMovement(event)}>
          <label className="restaurant-stock-wine">{locale === "it" ? "Vino" : "Wine"}<select value={stockDraft.wine_id} onChange={(event) => setStockDraft((current) => ({ ...current, wine_id: event.target.value }))} required>{wines.map((wine) => <option key={wine.id} value={wine.id}>{wine.name} {wine.vintage} · {wine.quantity} {locale === "it" ? "disp." : "available"}</option>)}</select></label>
          <label>{locale === "it" ? "Movimento" : "Movement"}<select value={stockDraft.movement_type} onChange={(event) => setStockDraft((current) => ({ ...current, movement_type: event.target.value as ManualStockMovementType }))}>
            {(["purchase", "adjustment_in", "adjustment_out", "breakage", "complimentary"] as ManualStockMovementType[]).map((type) => <option key={type} value={type}>{stockMovementLabel(type, locale)}</option>)}
          </select></label>
          <label>{locale === "it" ? "Quantità" : "Quantity"}<input type="number" min="1" max="10000" value={stockDraft.quantity} onChange={(event) => setStockDraft((current) => ({ ...current, quantity: event.target.value }))} required /></label>
          <label>{locale === "it" ? "Data" : "Date"}<input type="date" value={stockDraft.occurred_on} onChange={(event) => setStockDraft((current) => ({ ...current, occurred_on: event.target.value }))} required /></label>
          {stockDraft.movement_type === "purchase" || stockDraft.movement_type === "adjustment_in" ? <>
            <label>{locale === "it" ? "Costo unitario" : "Unit cost"}<input type="number" min="0" step="0.01" value={stockDraft.unit_cost} onChange={(event) => setStockDraft((current) => ({ ...current, unit_cost: event.target.value }))} required={stockDraft.movement_type === "purchase"} placeholder={locale === "it" ? "Usa il costo attuale" : "Use current cost"} /></label>
            <label>{locale === "it" ? "Fornitore" : "Supplier"}<input value={stockDraft.supplier} maxLength={160} onChange={(event) => setStockDraft((current) => ({ ...current, supplier: event.target.value }))} /></label>
          </> : null}
          <label>{locale === "it" ? "Riferimento" : "Reference"}<input value={stockDraft.reference} maxLength={160} onChange={(event) => setStockDraft((current) => ({ ...current, reference: event.target.value }))} placeholder={locale === "it" ? "Fattura, ordine…" : "Invoice, order…"} /></label>
          <label className="restaurant-stock-note">{locale === "it" ? "Nota" : "Note"}<input value={stockDraft.note} maxLength={1000} onChange={(event) => setStockDraft((current) => ({ ...current, note: event.target.value }))} /></label>
          <button type="submit" disabled={stockMovementSaving || !wines.length}>{stockMovementSaving ? (locale === "it" ? "Registro…" : "Recording…") : (locale === "it" ? "Registra movimento" : "Record movement")}</button>
        </form>
        <section className="restaurant-stock-history">
          <header><div><span>{locale === "it" ? "Libro mastro" : "Ledger"}</span><h3>{locale === "it" ? "Ultimi movimenti" : "Latest movements"}</h3></div><small>{locale === "it" ? "Le vendite scaricano automaticamente i lotti più vecchi" : "Sales automatically consume the oldest lots"}</small></header>
          {stockMovements.length ? <div>{stockMovements.map((movement) => <button type="button" key={movement.id} onClick={() => onOpenWine(movement.wine_id)}>
            <span className={`restaurant-stock-delta ${movement.quantity_delta > 0 ? "is-inbound" : "is-outbound"}`}>{movement.quantity_delta > 0 ? "+" : ""}{movement.quantity_delta}</span>
            <span><strong>{movement.wine_name} {movement.wine_vintage}</strong><small>{stockMovementLabel(movement.movement_type, locale)} · {displayDate(movement.occurred_on, locale)}{movement.supplier ? ` · ${movement.supplier}` : ""}</small></span>
            <span className="restaurant-stock-cost"><strong>{formatMoney(movement.total_cost, movement.currency, locale)}</strong><small>{formatMoney(movement.unit_cost, movement.currency, locale)} / {locale === "it" ? "bt." : "btl."}</small></span>
          </button>)}</div> : <p className="empty-state">{locale === "it" ? "I nuovi movimenti di magazzino appariranno qui." : "New inventory movements will appear here."}</p>}
        </section>
      </div>
    </details> : null}
    {error ? <p className="error-banner">{error}</p> : null}
    {mode === "restaurant" ? <header className="restaurant-section-title restaurant-sales-heading"><div><p className="eyebrow">{locale === "it" ? "Vendite" : "Sales"}</p><h2>{locale === "it" ? "Performance del periodo" : "Period performance"}</h2></div><PeriodSelector locale={locale} period={period} setPeriod={setPeriod} fromDate={fromDate} setFromDate={setFromDate} toDate={toDate} setToDate={setToDate} onNavigate={navigatePeriod} canNavigateForward={toDate < isoDate(new Date())} onExport={() => void exportExcel()} exporting={exportingExcel} /></header> : null}
    {loading && !summary ? <p>{locale === "it" ? "Caricamento vendite…" : "Loading sales…"}</p> : null}
    {summary?.currencies.map((totals) => <section className="restaurant-currency" key={totals.currency}>
      <div className="restaurant-kpis">
        <article><span>{mode === "private" ? (locale === "it" ? "Capitale recuperato" : "Recovered capital") : (locale === "it" ? "Ricavi" : "Revenue")}</span><strong>{formatMoney(totals.revenue, totals.currency, locale)}</strong></article>
        <article><span>{mode === "private" ? (locale === "it" ? "Costo storico" : "Historical cost") : (locale === "it" ? "Costo bottiglie" : "Bottle cost")}</span><strong>{formatMoney(totals.cost, totals.currency, locale)}</strong></article>
        <article className={`accent${Number(totals.gross_margin) < 0 ? " is-negative" : ""}`}><span>{mode === "private" ? (locale === "it" ? "Plus/minusvalenza" : "Realized gain/loss") : (locale === "it" ? "Margine lordo" : "Gross margin")}</span><strong>{formatMoney(totals.gross_margin, totals.currency, locale)}</strong><small>{Number(totals.gross_margin_pct).toLocaleString(locale, { maximumFractionDigits: 1 })}%</small></article>
        <article><span>{locale === "it" ? "Bottiglie / calici" : "Bottles / glasses"}</span><strong>{totals.bottles} / {totals.glasses}</strong><small>{locale === "it" ? `Medie ${formatMoney(totals.average_sale_price, totals.currency, locale)} · ${formatMoney(totals.average_glass_price, totals.currency, locale)}` : `Averages ${formatMoney(totals.average_sale_price, totals.currency, locale)} · ${formatMoney(totals.average_glass_price, totals.currency, locale)}`}</small></article>
      </div>
    </section>)}
    {!summary?.currencies.length && !loading ? <div className="restaurant-empty"><strong>{locale === "it" ? "Nessuna vendita nel periodo" : "No sales in this period"}</strong><span>{locale === "it" ? "Registra una bottiglia o una mescita dal dettaglio di un vino." : "Record a bottle or a glass from a wine detail."}</span></div> : null}
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
        { title: locale === "it" ? "Vendite per tipologia" : "Sales by wine type", items: summary.sales_by_type, kind: "type" },
        { title: locale === "it" ? "Vendite per regione" : "Sales by region", items: summary.sales_by_region, kind: "region" },
        { title: locale === "it" ? "Vendite per produttore" : "Sales by producer", items: summary.sales_by_producer, kind: "producer" },
      ] as const).map(({ title, items, kind }) => <details className="restaurant-panel restaurant-sales-breakdown restaurant-collapsible" style={kind === "producer" ? { gridColumn: "1 / -1" } : undefined} key={title} open>
        <summary><h2>{title}</h2><span>{kind === "producer" ? (locale === "it" ? "Top 10 · bottiglie e calici · ricavi · margine" : "Top 10 · bottles and glasses · revenue · margin") : (locale === "it" ? "Bottiglie e calici · ricavi · margine" : "Bottles and glasses · revenue · margin")}</span></summary>
        {items.length ? <div>{items.slice(0, kind === "producer" ? 10 : undefined).map((item) => {
          const maxRevenue = Math.max(...items.map((entry) => Number(entry.revenue)), 1);
          return <article key={`${item.label}-${item.currency}`}>
            <div><strong>{kind === "type" ? (displayValue(item.label, locale, "type") || item.label) : item.label}</strong><span>{item.bottles} {locale === "it" ? "bt." : "btl."} · {item.glasses} {locale === "it" ? "calici" : "glasses"}</span></div>
            <i><b style={{ width: `${(Number(item.revenue) / maxRevenue) * 100}%` }} /></i>
            <div className="restaurant-breakdown-money"><span>{formatMoney(item.revenue, item.currency, locale)}</span><strong>{formatMoney(item.gross_margin, item.currency, locale)}</strong></div>
          </article>;
        })}</div> : <p className="empty-state">—</p>}
      </details>)}
    </div> : null}
    <div className="restaurant-lower-grid">
      <details className="restaurant-panel restaurant-collapsible" open={mode === "restaurant"}><summary><h2>{mode === "private" ? (locale === "it" ? "Migliori vendite" : "Best sales") : (locale === "it" ? "Vini più venduti" : "Best-selling wines")}</h2></summary>{summary?.top_wines.length ? <div className="restaurant-ranking">{summary.top_wines.map((wine) => <button type="button" key={`${wine.wine_id}-${wine.currency}`} onClick={() => onOpenWine(wine.wine_id)}><span><strong>{wine.label}</strong><small>{wine.current_stock} {locale === "it" ? "ancora disponibili" : "still available"}</small></span><span className="restaurant-ranking-result"><strong>{wine.bottles} {locale === "it" ? "bt." : "btl."} · {wine.glasses} {locale === "it" ? "calici" : "glasses"}</strong><small>{formatMoney(wine.revenue, wine.currency, locale)} · {locale === "it" ? "margine" : "margin"} {formatMoney(wine.gross_margin, wine.currency, locale)}</small></span></button>)}</div> : <p className="empty-state">—</p>}</details>
      <details className="restaurant-panel restaurant-collapsible" open={mode === "restaurant"}><summary><h2>{locale === "it" ? "Invenduti o meno venduti" : "Unsold or slow-moving"}</h2></summary>{summary?.least_sold_wines.length ? <div className="restaurant-ranking restaurant-slow-movers">{summary.least_sold_wines.map((wine) => <button type="button" key={`${wine.wine_id}-${wine.currency}`} onClick={() => onOpenWine(wine.wine_id)}><span><strong>{wine.label}</strong><small>{wine.current_stock} {locale === "it" ? "in giacenza" : "in stock"}</small></span><span className="restaurant-ranking-result"><strong>{wine.bottles ? `${wine.bottles} ${locale === "it" ? "vendute" : "sold"}` : (locale === "it" ? "Invenduto" : "Unsold")}</strong><small>{wine.bottles ? formatMoney(wine.revenue, wine.currency, locale) : (locale === "it" ? "Nessuna vendita nel periodo" : "No sales in this period")}</small></span></button>)}</div> : <p className="empty-state">—</p>}</details>
    </div>
    <details className="restaurant-panel restaurant-collapsible" open={mode === "restaurant"}><summary><h2>{locale === "it" ? "Registro vendite" : "Sales register"}</h2></summary>{summary?.recent_sales.length ? <div className="restaurant-sales-list">{summary.recent_sales.map((sale) => {
      const isEditing = editingSale?.id === sale.id;
      return <article key={sale.id} className={isEditing ? "is-editing" : ""}>
        {isEditing && editingSale ? <form className="restaurant-sale-edit" onSubmit={updateSale}>
          <div><strong>{sale.wine_name}</strong><small>{sale.wine_producer} {sale.wine_vintage ? `· ${sale.wine_vintage}` : ""}</small></div>
          <label>{locale === "it" ? "Data" : "Date"}<input type="date" value={editingSale.sold_at} onChange={(event) => setEditingSale((current) => current ? { ...current, sold_at: event.target.value } : current)} required /></label>
          <label>{sale.sale_kind === "glass" ? (locale === "it" ? "Calici" : "Glasses") : (locale === "it" ? "Bottiglie" : "Bottles")}<input type="number" min="1" step="1" value={editingSale.quantity} onChange={(event) => setEditingSale((current) => current ? { ...current, quantity: event.target.value } : current)} disabled={sale.sale_kind === "glass"} required /></label>
          <label>{locale === "it" ? "Prezzo unitario" : "Unit price"}<input type="number" min="0" step="0.01" value={editingSale.unit_sale_price} onChange={(event) => setEditingSale((current) => current ? { ...current, unit_sale_price: event.target.value } : current)} required /></label>
          <label className="restaurant-sale-edit-note">{locale === "it" ? "Nota" : "Note"}<input value={editingSale.note} maxLength={1000} onChange={(event) => setEditingSale((current) => current ? { ...current, note: event.target.value } : current)} /></label>
          <div className="restaurant-sale-edit-actions"><button type="button" className="secondary compact" disabled={saleSaving} onClick={() => setEditingSale(null)}>{locale === "it" ? "Annulla" : "Cancel"}</button><button type="submit" className="compact" disabled={saleSaving}>{saleSaving ? (locale === "it" ? "Salvo…" : "Saving…") : (locale === "it" ? "Salva vendita" : "Save sale")}</button></div>
        </form> : <><div><strong>{sale.wine_name}</strong><span>{displayDate(sale.sold_at, locale)} · {sale.quantity} {sale.sale_kind === "glass" ? (locale === "it" ? `calici da ${(sale.pour_size_ml / 100).toLocaleString(locale)} dl` : `${(sale.pour_size_ml / 100).toLocaleString(locale)} dl glasses`) : (locale === "it" ? "bottiglie" : "bottles")} × {formatMoney(sale.unit_sale_price, sale.currency, locale)}</span></div><div className="restaurant-sale-result"><span>{locale === "it" ? "Margine lordo" : "Gross margin"}</span><strong>{formatMoney(sale.gross_margin, sale.currency, locale)}</strong><div className="restaurant-sale-actions"><button type="button" className="secondary compact" onClick={() => setEditingSale({ id: sale.id, sold_at: sale.sold_at, quantity: String(sale.quantity), unit_sale_price: String(sale.unit_sale_price), note: sale.note || "" })}>{locale === "it" ? "Modifica" : "Edit"}</button><button type="button" className="secondary compact" onClick={() => void voidSale(sale.id)}>{locale === "it" ? "Annulla" : "Void"}</button></div></div></>}
      </article>;
    })}</div> : <p className="empty-state">—</p>}</details>
    </div>
  </section>;
}
