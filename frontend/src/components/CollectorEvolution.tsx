import { lazy, Suspense, useEffect, useState } from "react";
import type { Locale, StockMovement, Wine } from "../types";
import { api } from "../services/api";
import { formatBottleCount } from "../domain/cellar";
import { formatMoney } from "./panelSupport";
import "./CollectorEvolution.css";

const TimeSeriesChart = lazy(() => import("./TimeSeriesChart"));
type Movement = Omit<StockMovement, "movement_type"> & { movement_type: string };
function useHistory<T>(url: string) {
  const [attempt, retry] = useState(0);
  const [state, setState] = useState<{ url: string; data?: T; error?: boolean }>({ url });
  useEffect(() => {
    const controller = new AbortController();
    setState({ url });
    api<T>(url, { signal: controller.signal }).then(data => { if (!controller.signal.aborted) setState({ url, data }); })
      .catch(() => { if (!controller.signal.aborted) setState({ url, error: true }); });
    return () => controller.abort();
  }, [url, attempt]);
  return { ...(state.url === url ? state : { url }), retry: () => retry(value => value + 1) };
}

export default function CollectorEvolution({ wines, locale, now, onOpen }: { wines: Wine[]; locale: Locale; now: Date; onOpen: (wine: Wine) => void }) {
  const it = locale === "it";
  const count = (value: number) => formatBottleCount(value || 0, locale);
  const currencies = [...new Set(wines.filter(w => w.quantity > 0).map(w => w.currency))].sort();
  const [selectedCurrency, setCurrency] = useState("");
  const currency = currencies.includes(selectedCurrency) ? selectedCurrency : currencies[0] || "CHF";
  const history = useHistory<Array<{ recorded_at: string; value: string }>>(`/api/v1/wines/value-history/portfolio?currency=${encodeURIComponent(currency)}`);
  const movements = useHistory<Movement[]>("/api/v1/inventory/movements?limit=500");
  const start = new Date(now.getFullYear(), now.getMonth() - 11, 1);
  const points = (Array.isArray(history.data) ? history.data : []).map(p => ({ timestampMs: Date.parse(p.recorded_at), value: Number(p.value) }))
    .filter(p => Number.isFinite(p.timestampMs) && Number.isFinite(p.value) && p.timestampMs >= start.getTime() && p.timestampMs <= now.getTime()).sort((a, b) => a.timestampMs - b.timestampMs);
  const delta = points.length > 1 ? points[points.length - 1].value - points[0].value : null;
  const rows = Array.isArray(movements.data) ? movements.data : [];
  const inPeriod = rows.filter(row => Date.parse(row.occurred_on) >= start.getTime() && Date.parse(row.occurred_on) <= now.getTime());
  const types = [
    { label: it ? "Aggiunte" : "Added", types: ["purchase", "initial_purchase"], tone: "in" },
    { label: it ? "Bevute" : "Drunk", types: ["consumption"], tone: "drunk" },
    { label: it ? "Vendite nette" : "Net sales", types: ["sale", "sale_void"], tone: "out" },
    { label: it ? "Altre uscite" : "Other outflows", types: ["breakage", "complimentary", "adjustment_out"], tone: "other" },
  ].map(group => ({ ...group, value: (group.tone === "in" ? 1 : -1) * inPeriod.filter(row => group.types.includes(row.movement_type)).reduce((sum, row) => sum + row.quantity_delta, 0) }));
  const maxMovement = Math.max(1, ...types.map(group => Math.abs(group.value)));
  const year = now.getFullYear();
  const stock = wines.filter(w => w.quantity > 0);
  const known = stock.filter(w => w.drink_from && w.drink_to && w.drink_from <= w.drink_to);
  const bins = [
    { label: it ? "Superata" : "Past", items: known.filter(w => w.drink_to! < year) },
    ...Array.from({ length: 5 }, (_, i) => ({ label: String(year + i), items: known.filter(w => w.drink_to === year + i) })),
    { label: `${year + 5}+`, items: known.filter(w => w.drink_to! >= year + 5) },
  ].map(bin => ({ ...bin, value: bin.items.reduce((sum, w) => sum + w.quantity, 0) }));
  const maxWindow = Math.max(1, ...bins.map(bin => bin.value));
  const [selectedYear, setYear] = useState<string | null>(null);
  const selected = bins.find(bin => bin.label === selectedYear);
  function status(resource: { error?: boolean; retry: () => void }) {
    return resource.error ? <div role="alert"><p>{it ? "Storico non caricato." : "History could not be loaded."}</p><button className="secondary" type="button" onClick={resource.retry}>{it ? "Riprova" : "Retry"}</button></div> : <p role="status">{it ? "Caricamento…" : "Loading…"}</p>;
  }
  return <section className="collector-evolution" aria-label={it ? "Come sta cambiando la tua cantina" : "How your cellar is changing"}>
    <h2>{it ? "Come sta cambiando la tua cantina" : "How your cellar is changing"}</h2>
    <div className="collector-evolution-grid">
      <article><header><h3>{it ? "Valutazioni nel tempo" : "Valuations over time"}</h3><select aria-label={it ? "Valuta dello storico" : "History currency"} value={currency} onChange={e => setCurrency(e.target.value)}>{(currencies.length ? currencies : [currency]).map(c => <option key={c}>{c}</option>)}</select></header>
        {delta !== null && <strong className="evolution-metric">{delta > 0 ? "+" : ""}{formatMoney(delta, currency, locale)}</strong>}
        <small>{it ? "Ultimi 12 mesi · quantità attuali" : "Last 12 months · current quantities"}</small>
        {!history.data ? status(history) : points.length < 2 ? <p>{it ? "Servono due rilevazioni per mostrare l’andamento." : "Two observations are needed to show a trend."}</p> : <Suspense fallback={<p>…</p>}><TimeSeriesChart compact points={points} locale={locale} currency={currency} ariaLabel={it ? "Andamento delle valutazioni" : "Valuation trend"} height={180} /></Suspense>}
        <small>{it ? "Ricostruzione sulle bottiglie attuali, non rendimento." : "Reconstructed for current holdings, not investment returns."}</small>
      </article>
      <article><header><h3>{it ? "Entrate e uscite" : "In and out"}</h3><small>{it ? "12 mesi" : "12 months"}</small></header>
        {!movements.data ? status(movements) : !inPeriod.length ? <p>{it ? "Nessun movimento registrato nel periodo." : "No recorded movements in this period."}</p> : <div className="evolution-movements">{types.map(group => <div key={group.tone}><span>{group.label}</span><strong>{count(group.value)}</strong><div className="evolution-track"><i className={`evolution-tone-${group.tone}`} style={{ width: `${Math.abs(group.value) / maxMovement * 100}%` }} /></div></div>)}</div>}
        <small>{it ? "Bottiglie · movimenti registrati" : "Bottles · recorded movements"}{rows.length === 500 ? (it ? " · ultimi 500: dati parziali" : " · latest 500: partial data") : ""}</small>
        {inPeriod.some(row => ["opening_balance", "adjustment_in"].includes(row.movement_type)) && <small>{it ? "Giacenze iniziali e rettifiche in entrata escluse." : "Opening balances and inbound adjustments excluded."}</small>}
      </article>
      <article className="evolution-horizon"><header><h3>{it ? "Orizzonte di beva" : "Drinking horizon"}</h3><small>{it ? "Fine finestra · bottiglie" : "Window end · bottles"}</small></header>
        <div className="evolution-columns">{bins.map(bin => <button type="button" key={bin.label} aria-label={`${bin.label}: ${count(bin.value)} ${it ? "bottiglie" : "bottles"}`} aria-pressed={selectedYear === bin.label} disabled={!bin.value} onClick={() => setYear(selectedYear === bin.label ? null : bin.label)}><strong>{count(bin.value)}</strong><span className="evolution-column"><i style={{ height: `${bin.value / maxWindow * 100}%` }} /></span><span>{bin.label}</span></button>)}</div>
        <small>{it ? "L’anno indica l’ultimo anno della finestra di beva stimata; dal successivo è superata. Seleziona una colonna per vedere i vini." : "The year is the last year of the estimated drinking window; it is past from the following year. Select a column to see the wines."}</small>
        {selected && <div className="collector-wine-list">{selected.items.map(w => <button type="button" key={w.id} onClick={() => onOpen(w)}><span>{w.name}<small>{w.producer} · {w.vintage}</small></span><strong>{count(w.quantity)}</strong></button>)}</div>}
      </article>
    </div>
  </section>;
}
