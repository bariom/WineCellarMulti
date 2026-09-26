import { lazy, Suspense, useEffect, useState, type ReactNode } from "react";
import type { Locale, PersonalDashboardWidget, TasteProfileCollection, TastingArchivePage, Wine, WineNewsFeed, WishlistItem } from "../types";
import { translate } from "../i18n";
import { normalizeWineType } from "../domain/wineTypes";
import { isWinePhysicallyInCellar, isToCollectWine, isFutureDeliveryWine, isWineReadyToPrioritize } from "../domain/cellar";
import { formatMoney, wineTone } from "./panelSupport";
import { KeyPositionBottleVisual } from "./KeyPositionCardParts";
import { featuredCaption, type FeaturedWine } from "./FeaturedWineDetails";
import { personalDashboardCatalogue } from "./personalDashboardCatalogue";
import { groupSummary, historyChange, recordedValue, sumBottles, topSummary, useDashboardResource, validWindow, type SummarySlice } from "./dashboardSummaryData";
import { SummaryBars, SummaryMosaic, SummaryRadar, SummaryRing } from "./DashboardSummaryCharts";
import "./DashboardSummaryWidget.css";

const TimeSeriesChart = lazy(() => import("./TimeSeriesChart"));
const WineGeographyMap = lazy(() => import("../views/WineGeographyMap"));
export type SummaryDestination = "collector" | "daily" | "balanced" | "value" | "readiness" | "timeline" | "taste" | "data" | "history" | "wishlist" | "pulse" | "intelligence" | "cellar_to_collect";
type Props = {
  widget: PersonalDashboardWidget; locale: Locale; wines: Wine[]; wishlist: WishlistItem[]; featured: FeaturedWine[];
  canShowPhotos: boolean; onOpen: (wine: Wine) => void; onNavigate: (destination: SummaryDestination) => void;
  onRegion: (region: string) => void; onPairing: (wine: Wine) => void;
};

export default function DashboardSummaryWidget({ widget, locale, wines, wishlist, featured, canShowPhotos, onOpen, onNavigate, onRegion, onPairing }: Props) {
  const it = locale === "it";
  const { id } = widget;
  const stock = wines.filter(wine => wine.quantity > 0);
  const available = stock.filter(isWinePhysicallyInCellar);
  const now = new Date();
  const year = now.getFullYear();
  const count = (value: number) => new Intl.NumberFormat(it ? "it-CH" : "en-GB", { maximumFractionDigits: 1 }).format(value);
  const unknown = it ? "Non indicato" : "Unspecified";
  const typeLabel = (value: string) => {
    const normalized = normalizeWineType(value);
    const labels: Record<string, string> = it ? { Red: "Rossi", White: "Bianchi", Rose: "Rosé", Sparkling: "Spumanti", Sweet: "Dolci", Fortified: "Fortificati", Other: "Altri" } : { Red: "Red", White: "White", Rose: "Rosé", Sparkling: "Sparkling", Sweet: "Sweet", Fortified: "Fortified", Other: "Other" };
    return labels[normalized] || normalized || unknown;
  };
  const other = it ? "Altri" : "Other";
  const currencies = [...new Set(stock.map(wine => wine.currency))].sort();
  const [selectedCurrency, setCurrency] = useState("");
  const currency = currencies.includes(selectedCurrency) ? selectedCurrency : currencies[0] || "CHF";
  const valuedStock = stock.filter(wine => wine.currency === currency);
  const money = (value: number) => formatMoney(value, currency, locale);
  const [period, setPeriod] = useState("365");
  const [selectedGroup, setGroup] = useState<string | null>(null);
  useEffect(() => setGroup(null), [widget.group_by]);
  const group = selectedGroup ?? widget.group_by ?? "region";
  const title = personalDashboardCatalogue.find(item => item.id === id)?.[locale][0] ?? id;
  const isTaste = id === "taste" || id === "taste_origins";
  const isTastings = ["best_tastings", "recent_tastings", "tasting_rhythm"].includes(id);
  const from = new Date(year, now.getMonth() - 11, 1);
  const fromDate = `${from.getFullYear()}-${String(from.getMonth() + 1).padStart(2, "0")}-01`;
  const taste = useDashboardResource<TasteProfileCollection>(isTaste ? "/api/v1/taste-profile/me" : null);
  const tastings = useDashboardResource<TastingArchivePage>(isTastings ? `/api/v1/wines/tasting-archive?limit=200&offset=0&from_date=${fromDate}` : null);
  const news = useDashboardResource<WineNewsFeed>(id === "news" ? `/api/v1/wine-pulse?locale=${locale}&limit=1` : null);
  const history = useDashboardResource<Array<{ recorded_at: string; value: string }>>(id === "collection_value" && stock.length ? `/api/v1/wines/value-history/portfolio?currency=${encodeURIComponent(currency)}` : null);
  const empty = (message = it ? "Qui prenderanno forma i dati della tua cantina." : "Your cellar data will take shape here.") => <p className="summary-empty">{message}</p>;
  const loading = <p className="summary-empty" role="status">{it ? "Caricamento…" : "Loading…"}</p>;
  const status = (resource: { data?: unknown; error?: boolean; status?: number; retry: () => void }) => {
    if (!resource.error) return loading;
    const code = resource.status;
    const message = code === 401 ? (it ? "Sessione scaduta. Accedi nuovamente per caricare i dati." : "Session expired. Sign in again to load data.")
      : code === 403 ? (it ? "Il tuo account non ha accesso a questi dati." : "Your account cannot access this data.")
      : code === 404 ? (it ? "Il servizio richiesto non è disponibile sul server." : "The requested service is not available on the server.")
      : code === 429 ? (it ? "Troppe richieste. Attendi qualche istante e riprova." : "Too many requests. Wait a moment and retry.")
      : code && code >= 500 ? (it ? "Il server non riesce a caricare questi dati. Riprova tra poco." : "The server could not load this data. Please retry shortly.")
      : (it ? "Caricamento non riuscito. Verifica la connessione e riprova." : "Loading failed. Check your connection and retry.");
    return <div className="summary-empty" role="alert"><p>{message}</p>{code && <small>{it ? "Codice risposta" : "Response code"}: {code}</small>}<button type="button" className="secondary" onClick={resource.retry}>{it ? "Riprova" : "Retry"}</button></div>;
  };
  const currencyPicker = currencies.length > 1 ? <label className="summary-control">{it ? "Valuta" : "Currency"}<select aria-label={it ? "Valuta" : "Currency"} value={currency} onChange={event => setCurrency(event.target.value)}>{currencies.map(value => <option key={value}>{value}</option>)}</select></label> : null;
  const wineLabel = (wine: Wine) => [wine.producer, wine.vintage].filter(Boolean).join(" · ");
  const date = (value?: string | null) => value && Number.isFinite(Date.parse(value)) ? new Intl.DateTimeFormat(locale, { day: "numeric", month: "short", year: "numeric" }).format(new Date(value)) : unknown;
  function gallery(items: Wine[], caption: (wine: Wine) => ReactNode, one = false) {
    const single = one || items.length === 1;
    return items.length ? <div className={`summary-bottles${single ? " summary-bottles-single" : ""}`} style={single ? undefined : { gridTemplateColumns: `repeat(${Math.min(3, items.length)}, minmax(0, 1fr))` }}>
      {items.slice(0, 3).map(wine => <button type="button" className="summary-bottle" key={wine.id} onClick={() => onOpen(wine)}>
        <KeyPositionBottleVisual photoUrl={canShowPhotos ? wine.photo_thumbnail_url || wine.photo_detail_url : ""} tone={wineTone(wine.type)} />
        <span className="summary-bottle-copy"><strong>{wine.name}</strong><small>{wineLabel(wine)}</small><span>{caption(wine)}</span></span>
      </button>)}
    </div> : empty();
  }
  function ring(items: SummarySlice[], label = it ? "bottiglie" : "bottles") { return items.length ? <SummaryRing items={topSummary(items, other)} label={label} format={count} /> : empty(); }
  function bars(items: SummarySlice[], columns = false) { return items.length ? <SummaryBars items={topSummary(items, other, columns ? 11 : 5)} format={count} columns={columns} /> : empty(); }
  function windowCaption(wine: Wine) { return <><b>{wine.drink_peak_from || wine.drink_from}–{wine.drink_peak_to || wine.drink_to}</b><span className="summary-window" aria-label={it ? "Finestra di beva" : "Drinking window"}><i style={{ width: `${Math.max(0, Math.min(100, (year - (wine.drink_from || year)) / Math.max(1, (wine.drink_to || year) - (wine.drink_from || year)) * 100))}%` }} /></span></>; }
  let content: ReactNode;
  let destination: SummaryDestination | null = null;
  let kicker = it ? "La collezione" : "The collection";
  let note: ReactNode;
  const ready = available.filter(wine => validWindow(wine) && year >= wine.drink_from! && year <= wine.drink_to!).sort((a, b) => Number(isWineReadyToPrioritize(b, year)) - Number(isWineReadyToPrioritize(a, year)) || a.drink_to! - b.drink_to!);
  switch (id) {
    case "overview":
      destination = "collector";
      content = <div className="summary-numbers">{[[sumBottles(stock), it ? "bottiglie" : "bottles"], [stock.length, it ? "etichette" : "labels"], [new Set(stock.map(wine => wine.producer.trim().toLocaleLowerCase()).filter(Boolean)).size, it ? "produttori" : "producers"]].map(([value, label]) => <div key={String(label)}><strong>{count(Number(value))}</strong><span>{label}</span></div>)}</div>;
      note = it ? "Intera cantina, incluse le quote condivise." : "Whole cellar, including shared holdings.";
      break;
    case "collection_value": {
      destination = "value"; kicker = it ? "Nel tempo" : "Over time";
      const points = (history.data || []).map(point => ({ timestampMs: Date.parse(point.recorded_at), value: Number(point.value) })).filter(point => Number.isFinite(point.timestampMs) && Number.isFinite(point.value) && point.timestampMs >= now.getTime() - Number(period) * 86400000);
      const delta = points.length > 1 ? points[points.length - 1].value - points[0].value : null;
      content = <>{currencyPicker}<div className="summary-value"><strong>{money(valuedStock.reduce((sum, wine) => sum + recordedValue(wine) * wine.quantity, 0))}</strong>{delta !== null && <span>{delta > 0 ? "+" : ""}{money(delta)} {it ? "nel periodo" : "over period"}</span>}</div><label className="summary-control">{it ? "Periodo" : "Period"}<select aria-label={it ? "Periodo" : "Period"} value={period} onChange={event => setPeriod(event.target.value)}><option value="90">90 {it ? "giorni" : "days"}</option><option value="365">12 {it ? "mesi" : "months"}</option></select></label>{!stock.length ? empty() : !history.data ? status(history) : points.length < 2 ? empty(it ? "Servono almeno due rilevazioni nel periodo." : "At least two observations are needed in this period.") : <TimeSeriesChart compact points={points} locale={locale} currency={currency} ariaLabel={title} height={190} />}</>;
      note = it ? "Valutazioni registrate, ricostruite sulle quantità attuali. Non è un rendimento finanziario; i valori mancanti non sono stimati." : "Recorded valuations reconstructed using current quantities. Not an investment return; missing values are not estimated.";
      break;
    }
    case "purchase_value": {
      destination = "value";
      const comparable = valuedStock.filter(wine => Number(wine.price) > 0 && Number(wine.current_value) > 0);
      const cost = comparable.reduce((sum, wine) => sum + Number(wine.price) * wine.quantity, 0);
      const value = comparable.reduce((sum, wine) => sum + Number(wine.current_value) * wine.quantity, 0);
      content = <>{currencyPicker}{cost ? <><div className="summary-value"><strong>{money(value - cost)}</strong><span>{value >= cost ? "+" : ""}{count((value / cost - 1) * 100)}%</span></div><SummaryBars items={[{ label: it ? "Acquisto" : "Purchase", value: cost }, { label: it ? "Valutazione" : "Valuation", value }]} format={money} /></> : empty()}</>;
      note = `${sumBottles(comparable)} / ${sumBottles(valuedStock)} ${it ? "bottiglie confrontabili nella valuta selezionata." : "comparable bottles in the selected currency."}`;
      break;
    }
    case "featured": {
      destination = "collector";
      const items = featured.filter((item, index, all) => all.findIndex(other => other.wine.id === item.wine.id) === index).slice(0, 3);
      content = gallery(items.map(item => item.wine), wine => { const caption = featuredCaption(items.find(item => item.wine.id === wine.id)!, locale); return <><small>{caption.label}</small><b>{caption.metric}</b></>; });
      break;
    }
    case "top_value":
      destination = "value";
      content = <>{currencyPicker}{gallery([...valuedStock].filter(wine => recordedValue(wine) > 0).sort((a, b) => recordedValue(b) - recordedValue(a)), wine => <b>{money(recordedValue(wine))}</b>)}</>;
      note = it ? "Valore per bottiglia; prezzo d’acquisto se manca una valutazione." : "Value per bottle; purchase price when no valuation is available.";
      break;
    case "value_changes": {
      destination = "value";
      const ranked = stock.flatMap(wine => { const change = historyChange(wine); return change ? [{ wine, ...change }] : []; }).sort((a, b) => Math.abs(b.percent) - Math.abs(a.percent)).slice(0, 3);
      content = ranked.length ? <div className="summary-trends">{ranked.map(item => <div key={item.wine.id}><button type="button" onClick={() => onOpen(item.wine)}><strong>{item.wine.name}</strong><b>{item.percent > 0 ? "+" : ""}{count(item.percent)}%</b></button><TimeSeriesChart compact points={item.points.map(point => ({ timestampMs: Date.parse(point.recorded_at), value: Number(point.value) }))} locale={locale} currency={item.wine.currency} ariaLabel={item.wine.name} height={95} /><small>{date(item.points[0].recorded_at)} – {date(item.points[item.points.length - 1].recorded_at)}</small></div>)}</div> : empty(it ? "Servono almeno due valutazioni nella stessa valuta per vino." : "Each wine needs at least two valuations in the same currency.");
      break;
    }
    case "value_distribution": {
      destination = "value";
      const items = groupSummary(valuedStock, wine => (group === "type" ? typeLabel(wine.type) : group === "producer" ? wine.producer : wine.region) || unknown, wine => recordedValue(wine) * wine.quantity);
      content = <><div className="summary-controls">{currencyPicker}<label className="summary-control">{it ? "Distribuzione" : "Distribution"}<select aria-label={it ? "Distribuzione" : "Distribution"} value={group} onChange={event => setGroup(event.target.value)}><option value="region">{it ? "Regione" : "Region"}</option><option value="producer">{it ? "Produttore" : "Producer"}</option><option value="type">{it ? "Tipologia" : "Style"}</option></select></label></div>{items.length ? <SummaryMosaic items={topSummary(items, other)} format={money} /> : empty()}</>;
      note = it ? "Valutazione o prezzo d’acquisto; importi senza valore esclusi. Imposta il raggruppamento iniziale in Personalizza." : "Valuation or purchase price; unvalued bottles excluded. Set the default grouping in Customize.";
      break;
    }
    case "recent":
      destination = "collector";
      content = gallery([...stock].sort((a, b) => (Date.parse(b.created_at || "") || 0) - (Date.parse(a.created_at || "") || 0)), wine => <><b>{count(wine.quantity)} {it ? "bott." : "btl."}</b><small>{date(wine.created_at)}</small></>);
      break;
    case "regions":
      destination = "collector";
      content = stock.length ? <WineGeographyMap wines={stock} locale={locale} t={key => translate(locale, key)} onSelectRegion={onRegion} /> : empty();
      note = it ? "Seleziona una regione per esplorare le sue bottiglie." : "Select a region to explore its bottles.";
      break;
    case "styles": destination = "balanced"; content = ring(groupSummary(stock, wine => typeLabel(wine.type))); break;
    case "vintages": content = bars(groupSummary(stock, wine => wine.vintage || unknown).sort((a, b) => a.label.localeCompare(b.label)), true); break;
    case "producers": content = bars(groupSummary(stock, wine => wine.producer || unknown)); break;
    case "grapes": {
      const groups = new Map<string, number>();
      stock.forEach(wine => new Set(wine.grapes.map(grape => grape.name.trim()).filter(Boolean)).forEach(name => groups.set(name, (groups.get(name) || 0) + wine.quantity)));
      content = bars([...groups].map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value));
      note = it ? "Bottiglie che contengono ciascun vitigno: gli assemblaggi contano in più gruppi. Uve non note escluse." : "Bottles containing each grape: blends appear in multiple groups. Unknown grapes excluded.";
      break;
    }
    case "formats": {
      const items = topSummary(groupSummary(stock, wine => wine.format || unknown), other, 3);
      content = items.length ? <div className="summary-formats">{items.map(item => <div key={item.label}><svg viewBox="0 0 50 115" aria-hidden="true"><path d="M19 5h12v28c0 10 11 14 11 26v47H8V59c0-12 11-16 11-26Z" fill="#426b5a" /><path d="M10 63h30v25H10Z" fill="#e8d9b9" /></svg><strong>{count(item.value)}</strong><span>{item.label}</span></div>)}</div> : empty();
      break;
    }
    case "maturity": {
      destination = "readiness"; kicker = it ? "Il tempo in bottiglia" : "Time in the bottle";
      const known = stock.filter(validWindow);
      const years = Array.from({ length: 8 }, (_, index) => year + index);
      const rows = [it ? "In attesa" : "Waiting", it ? "Nella finestra" : "In window", it ? "Oltre finestra" : "Past window"];
      content = known.length ? <div className="summary-maturity">{years.map(value => {
        const slices = [known.filter(wine => value < wine.drink_from!), known.filter(wine => value >= wine.drink_from! && value <= wine.drink_to!), known.filter(wine => value > wine.drink_to!)].map(sumBottles);
        const total = sumBottles(known);
        return <div key={value}><span>{value}</span><div className="summary-maturity-stack" role="img" aria-label={rows.map((label, i) => `${label}: ${slices[i]}`).join(", ")}>{slices.map((quantity, index) => <i key={index} style={{ height: `${quantity / total * 100}%`, background: ["#ad9155", "#426b5a", "#a85e72"][index] }} />)}</div><small>{count(slices[1])}</small></div>;
      })}<p className="summary-maturity-legend">{rows.map((label, index) => <span key={label}><i style={{ background: ["#ad9155", "#426b5a", "#a85e72"][index] }} />{label}</span>)}</p></div> : empty();
      note = `${sumBottles(known)} / ${sumBottles(stock)} ${it ? "bottiglie con finestra nota. Quantità attuali; numero sotto ogni anno = bottiglie nella finestra." : "bottles with known windows. Current quantities; number below each year = bottles in window."}`;
      break;
    }
    case "ready": destination = "readiness"; content = gallery(ready, windowCaption); break;
    case "past_window": {
      destination = "readiness";
      const urgent = available.filter(wine => validWindow(wine) && wine.drink_to! <= year).sort((a, b) => a.drink_to! - b.drink_to!);
      content = <><div className="summary-value"><strong>{count(sumBottles(urgent))}</strong><span>{it ? "bottiglie da verificare" : "bottles to review"}</span></div>{gallery(urgent, wine => <b>{wine.drink_to! < year ? (it ? "Finestra superata" : "Past window") : (it ? "In chiusura" : "Closing")} · {wine.drink_to}</b>)}</>;
      break;
    }
    case "next_peak": {
      destination = "readiness";
      const next = available.filter(wine => validWindow(wine) && (wine.drink_peak_from || wine.drink_from!) > year).sort((a, b) => (a.drink_peak_from || a.drink_from!) - (b.drink_peak_from || b.drink_from!));
      content = <div className="summary-timeline">{gallery(next, wine => <b>→ {wine.drink_peak_from || wine.drink_from}</b>)}</div>;
      note = it ? "Inizio della finestra ideale; se il picco non è noto, inizio della finestra di beva." : "Start of the ideal window; if the peak is unknown, start of the drinking window.";
      break;
    }
    case "tonight": {
      destination = "daily";
      content = ready.length ? <>{gallery(ready.slice(0, 1), wine => <>{windowCaption(wine)}<small>{it ? "Già disponibile; tra le finestre che chiudono prima." : "Available now; among the earliest closing windows."}</small></>, true)}<button type="button" className="secondary" onClick={() => onPairing(ready[0])}>{it ? "Trova un abbinamento" : "Find a pairing"}</button></> : empty(it ? "Nessuna bottiglia disponibile con finestra attuale nota." : "No available bottle with a known current drinking window.");
      break;
    }
    case "taste":
    case "taste_origins": {
      destination = "taste"; kicker = it ? "Il tuo palato" : "Your palate";
      const profile = taste.data?.profiles.find(profile => profile.category === "global");
      if (!taste.data) { content = status(taste); break; }
      if (!profile?.sample_count) { content = empty(it ? "Registra qualche degustazione per scoprire la tua firma." : "Record a few tastings to discover your signature."); break; }
      const labels: Record<string, string> = it ? { body: "Corpo", acidity: "Acidità", tannin: "Tannini", sweetness: "Dolcezza", aromatic_intensity: "Aromi", fruit: "Frutto", wood: "Legno", spice: "Spezie", minerality: "Mineralità" } : { body: "Body", acidity: "Acidity", tannin: "Tannin", sweetness: "Sweetness", aromatic_intensity: "Aromas", fruit: "Fruit", wood: "Oak", spice: "Spice", minerality: "Minerality" };
      const items = Object.keys(labels).flatMap(key => profile.dimensions[key] && Number.isFinite(profile.dimensions[key].preference) ? [{ label: labels[key], value: Math.max(0, Math.min(100, profile.dimensions[key].preference * 100)) }] : []);
      const origins = [...(profile.attributes.preferred_regions || []).map(([name]) => [name, "region"] as const), ...(profile.attributes.preferred_countries || []).map(([name]) => [name, "country"] as const)];
      content = id === "taste" ? items.length >= 3 ? <><SummaryRadar items={items} label={title} /><div className="summary-chips">{[...items].sort((a, b) => b.value - a.value).slice(0, 3).map(item => <span key={item.label}>{item.label} <b>{Math.round(item.value)}</b></span>)}</div></> : empty() : origins.length ? <WineGeographyMap wines={[]} preferredOrigins={origins.map(([name]) => name)} preferredOriginKinds={Object.fromEntries(origins)} locale={locale} t={key => translate(locale, key)} onSelectRegion={() => onNavigate("taste")} /> : empty();
      note = <>{profile.sample_count} {it ? "esperienze" : "experiences"} · {it ? "affidabilità evidenze" : "evidence confidence"} {Math.round(profile.confidence * 100)}%. {profile.confidence_level === "emerging" && (it ? "Profilo ancora in scoperta. " : "Profile still emerging. ")}{id === "taste" && (it ? "Affinità 0–100; 50 neutro. Non intensità sensoriali ideali." : "Affinity 0–100; 50 neutral. Not ideal sensory intensities.")}</>;
      break;
    }
    case "recent_tastings":
    case "best_tastings":
    case "tasting_rhythm": {
      destination = "history"; kicker = it ? "Il diario" : "The journal";
      if (!tastings.data) { content = status(tastings); break; }
      const entries = tastings.data.items;
      const score = (entry: typeof entries[number]) => Number(entry.score_scale) > 0 && Number(entry.score_value) >= 0 && entry.score_value !== null && entry.score_value !== undefined ? Number(entry.score_value) / Number(entry.score_scale) * 100 : entry.rating > 0 ? entry.rating * 20 : null;
      if (id === "tasting_rhythm") {
        const months = Array.from({ length: 12 }, (_, index) => new Date(from.getFullYear(), from.getMonth() + index, 1));
        content = entries.length ? <SummaryBars items={months.map(month => ({ label: new Intl.DateTimeFormat(locale, { month: "short" }).format(month), value: entries.filter(entry => { const when = new Date(entry.consumed_at); return when.getFullYear() === month.getFullYear() && when.getMonth() === month.getMonth(); }).length }))} format={count} columns /> : empty();
      } else {
        const selected = id === "best_tastings" ? [...entries].filter(entry => score(entry) !== null || entry.enjoyment === "positive").sort((a, b) => (score(b) ?? -1) - (score(a) ?? -1)) : [...entries].sort((a, b) => Date.parse(b.consumed_at) - Date.parse(a.consumed_at));
        content = selected.length ? <div className="summary-tastings">{selected.slice(0, 3).map(entry => {
          const wine = wines.find(wine => wine.id === entry.wine_id);
          return <button type="button" key={entry.tasting_id} onClick={() => onNavigate("history")}><KeyPositionBottleVisual photoUrl={canShowPhotos && wine ? wine.photo_thumbnail_url || wine.photo_detail_url : ""} tone={wineTone(entry.wine_type)} /><span><strong>{entry.wine_name}</strong><small>{entry.wine_vintage} · {date(entry.consumed_at)}</small><b>{score(entry) !== null ? `${Math.round(score(entry)!)} / 100` : entry.enjoyment === "positive" ? (it ? "Apprezzato" : "Enjoyed") : entry.enjoyment === "negative" ? (it ? "Non apprezzato" : "Not enjoyed") : (it ? "Senza voto" : "Unrated")}</b></span></button>;
        })}</div> : empty();
      }
      note = id === "tasting_rhythm" ? (it ? "Esperienze registrate negli ultimi 12 mesi, incluse quelle senza voto." : "Recorded experiences over the last 12 months, including unrated tastings.") : (it ? "Ultimi 12 mesi. I voti numerici sono riportati su scala 100." : "Last 12 months. Numeric ratings are displayed on a 100-point scale.");
      break;
    }
    case "deliveries": {
      destination = "timeline";
      const incoming = stock.filter(wine => isFutureDeliveryWine(wine, now)).sort((a, b) => (a.expected_delivery || "9999").localeCompare(b.expected_delivery || "9999"));
      content = <div className="summary-timeline">{gallery(incoming, wine => <><b>{date(wine.expected_delivery)}</b><small>{count(wine.quantity)} {it ? "bottiglie attese" : "bottles expected"}</small></>)}</div>;
      break;
    }
    case "to_collect": {
      destination = "cellar_to_collect";
      const items = stock.filter(isToCollectWine);
      content = <><div className="summary-value"><strong>{count(sumBottles(items))}</strong><span>{it ? "bottiglie da ritirare" : "bottles awaiting collection"}</span></div>{gallery(items, wine => wine.merchant || `${count(wine.quantity)} ${it ? "bottiglie" : "bottles"}`)}</>;
      break;
    }
    case "storage": {
      const groups = new Map<string, number>();
      available.forEach(wine => {
        let left = wine.quantity;
        for (const allocation of wine.storage_allocations || []) {
          const label = allocation.location_name ? [allocation.location_name, allocation.bin_name].filter(Boolean).join(" · ") : (it ? "Da collocare" : "Unplaced");
          const quantity = Math.min(left, Math.max(0, allocation.quantity));
          groups.set(label, (groups.get(label) || 0) + quantity); left -= quantity;
        }
        if (left > 0) { const label = it ? "Da collocare" : "Unplaced"; groups.set(label, (groups.get(label) || 0) + left); }
      });
      content = bars([...groups].map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value));
      note = it ? "Solo bottiglie fisicamente in cantina." : "Only bottles physically in the cellar.";
      break;
    }
    case "wishlist": {
      destination = "wishlist";
      const priority: Record<string, number> = { high: 3, medium: 2, low: 1 };
      const selected = [...wishlist].sort((a, b) => (priority[b.priority.toLowerCase()] || 0) - (priority[a.priority.toLowerCase()] || 0)).slice(0, 3);
      content = selected.length ? <div className="summary-wishes">{selected.map((item, index) => <button type="button" key={item.id} onClick={() => onNavigate("wishlist")}><span className="summary-rank">0{index + 1}</span><span><strong>{item.name}</strong><small>{item.producer} · {item.vintage}</small><b>{Number(item.target_price) > 0 ? formatMoney(Number(item.target_price), item.currency, locale) : (it ? "Prezzo da definire" : "Price to set")}</b></span></button>)}</div> : empty();
      note = it ? "Prezzi obiettivo, non offerte correnti." : "Target prices, not current offers.";
      break;
    }
    case "purposes": {
      destination = "intelligence";
      const labels: Record<string, string> = it ? { drink: "Consumo", maturation: "Maturazione", investment: "Investimento", special_occasion: "Occasioni speciali", undecided: "Da decidere" } : { drink: "Drinking", maturation: "Maturing", investment: "Investment", special_occasion: "Special occasions", undecided: "Undecided" };
      const groups = new Map<string, number>();
      stock.forEach(wine => {
        const purposes = wine.strategy_purposes || [];
        if (!purposes.length) { groups.set(unknown, (groups.get(unknown) || 0) + wine.quantity); return; }
        purposes.forEach(purpose => { const label = labels[purpose] || purpose; groups.set(label, (groups.get(label) || 0) + (wine.strategy_purpose_quantities?.[purpose] ?? wine.quantity)); });
      });
      content = bars([...groups].map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value));
      note = it ? "Le finalità possono sovrapporsi quando non sono ripartite in quantità." : "Purposes can overlap when quantities are not allocated.";
      break;
    }
    case "data_quality": {
      destination = "data";
      const checks = [
        { label: it ? "Finestre di beva" : "Drinking windows", count: stock.filter(wine => !validWindow(wine)).length },
        { label: it ? "Valutazioni" : "Valuations", count: stock.filter(wine => !(Number(wine.current_value) > 0)).length },
        { label: it ? "Origini" : "Origins", count: stock.filter(wine => !wine.region.trim()).length },
        { label: it ? "Fotografie" : "Photos", count: stock.filter(wine => !wine.photo_thumbnail_url && !wine.photo_detail_url).length },
      ];
      const missing = checks.reduce((sum, item) => sum + item.count, 0);
      content = stock.length ? <><SummaryRing items={[{ label: it ? "Compilati" : "Complete", value: stock.length * checks.length - missing }, { label: it ? "Mancanti" : "Missing", value: missing }]} label={it ? "campi" : "fields"} format={count} /><div className="summary-chips">{checks.filter(item => item.count).sort((a, b) => b.count - a.count).slice(0, 2).map(item => <span key={item.label}>{item.label}: <b>{item.count}</b></span>)}</div></> : empty();
      note = it ? "Quattro campi per etichetta. Misura la presenza, non l’affidabilità dei dati." : "Four fields per label. Measures presence, not data reliability.";
      break;
    }
    case "news": {
      destination = "pulse"; kicker = it ? "Dal mondo del vino" : "From the wine world";
      const article = news.data?.items[0];
      content = !news.data ? status(news) : article ? <div className="summary-news">{article.image_url && <img src={article.image_url} alt="" loading="lazy" onError={event => { event.currentTarget.hidden = true; }} />}<small>{article.source} · {date(article.published_at)}</small><h3>{article.headline}</h3><a href={/^https?:\/\//i.test(article.article_url) ? article.article_url : undefined} target="_blank" rel="noopener noreferrer">{it ? "Leggi alla fonte" : "Read at source"} ↗</a></div> : empty(it ? "Nessuna notizia disponibile." : "No stories available.");
      break;
    }
    default: content = empty();
  }
  return <article className={`dashboard-summary summary-widget-${id}`}>
    <header><p>{kicker}</p><h3>{title}</h3></header>
    <div className="summary-body"><Suspense fallback={loading}>{content}</Suspense></div>
    <footer>{note && <p>{note}</p>}{destination && <button type="button" className="summary-explore" onClick={() => onNavigate(destination)}>{destination === "cellar_to_collect" ? (it ? "Apri cantina filtrata" : "Open filtered cellar") : (it ? "Approfondisci" : "Explore")}<span aria-hidden="true">↗</span></button>}</footer>
  </article>;
}
