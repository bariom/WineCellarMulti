import type { Locale, Wine } from "../types";
import { lazy, Suspense } from "react";
import { formatBottleCount, isWinePhysicallyInCellar, isToCollectWine } from "../domain/cellar";
import { formatMoney } from "./panelSupport";
import { AppIcon, type AppIconName } from "./AppIcon";
const CollectorEvolution = lazy(() => import("./CollectorEvolution"));

function heading(icon: AppIconName, label: string) {
  return <span className="collector-heading-content"><AppIcon name={icon} variant="feature" /><span>{label}</span></span>;
}

export function CollectorOverview({ wines, locale, now, onOpen }: {
  wines: Wine[]; locale: Locale; now: Date; onOpen: (wine: Wine) => void;
}) {
  const it = locale === "it";
  const year = now.getFullYear();
  const stock = wines.filter(wine => wine.quantity > 0);
  const bottles = (items: Wine[]) => items.reduce((sum, wine) => sum + wine.quantity, 0);
  const count = (items: Wine[]) => `${formatBottleCount(bottles(items), locale)} ${it ? (bottles(items) === 1 ? "bottiglia" : "bottiglie") : (bottles(items) === 1 ? "bottle" : "bottles")} · ${items.length} ${it ? (items.length === 1 ? "vino" : "vini") : (items.length === 1 ? "wine" : "wines")}`;
  const total = bottles(stock);
  const positive = (value: string | null) => Number.isFinite(Number(value)) && Number(value) > 0;
  const available = stock.filter(isWinePhysicallyInCellar);
  const elsewhere = stock.filter(wine => !isWinePhysicallyInCellar(wine));
  const toCollect = elsewhere.filter(isToCollectWine);
  const hasWindow = (wine: Wine) => Boolean(wine.drink_from && wine.drink_to && wine.drink_from <= wine.drink_to);
  const overdue = available.filter(wine => hasWindow(wine) && wine.drink_to! < year);
  const closing = available.filter(wine => hasWindow(wine) && wine.drink_to === year);
  const totals = new Map<string, number>();
  for (const wine of stock) {
    const value = positive(wine.current_value) ? Number(wine.current_value) : positive(wine.price) ? Number(wine.price) : 0;
    if (value) totals.set(wine.currency, (totals.get(wine.currency) || 0) + value * wine.quantity);
  }
  const currencyTotals = [...totals].sort(([a], [b]) => a.localeCompare(b));
  function selection(title: string, items: Wine[]) {
    return <details className="collector-selection">
      <summary>{title}<span>{count(items)}</span></summary>
      {items.length ? <div className="collector-wine-list">{items.map(wine => <button type="button" key={wine.id} onClick={() => onOpen(wine)}>
        <span>{wine.name}<small>{[wine.producer, wine.vintage].filter(Boolean).join(" · ")}</small></span>
        <strong>{formatBottleCount(wine.quantity, locale)} {it ? "bott." : "btl."}</strong>
      </button>)}</div> : <p>{it ? "Nessun vino in questa selezione." : "No wines in this selection."}</p>}
    </details>;
  }

  function valueFigures() {
    return <div className="collector-number collector-currency-values">{currencyTotals.length ? currencyTotals.map(([currency, value]) =>
      <span className="collector-currency-total" key={currency}><strong><small>{currency}</small>{formatMoney(value, currency, locale).replace(`${currency} `, "")}</strong></span>
    ) : <strong>—</strong>}</div>;
  }
  type Segment = { key: string; label: string; items: Wine[] };
  function distribution(title: string, segments: Segment[], denominator: number, caption?: string) {
    return <article className="collector-distribution" aria-label={title}>
      <h3>{title}</h3>
      {caption && <p>{caption}</p>}
      {denominator > 0 ? <div className="collector-distribution-bar" role="img" aria-label={segments.map(segment => `${segment.label}: ${formatBottleCount(bottles(segment.items), locale)}`).join("; ")}>
        {segments.filter(segment => bottles(segment.items) > 0).map(segment => <span key={segment.key} className={`collector-tone-${segment.key}`} style={{ flex: bottles(segment.items) }} />)}
      </div> : <p>{it ? "Nessuna bottiglia da riepilogare." : "No bottles to summarise."}</p>}
      <div className="collector-distribution-legend">{segments.map(segment => <div key={segment.key} className="collector-distribution-entry">
        <span className={`collector-distribution-dot collector-tone-${segment.key}`} aria-hidden="true" />
        {selection(segment.label, segment.items)}
      </div>)}</div>
    </article>;
  }
  const maturity: Segment[] = [
    { key: "waiting", label: it ? "Da attendere" : "To wait for", items: available.filter(w => hasWindow(w) && w.drink_to! > year && (w.drink_peak_from || w.drink_from!) > year) },
    { key: "ready", label: it ? "Pronte da bere" : "Ready to drink", items: available.filter(w => hasWindow(w) && w.drink_to! > year && (w.drink_peak_from || w.drink_from!) <= year) },
    { key: "closing", label: it ? "In chiusura quest’anno" : "Closing this year", items: closing },
    { key: "overdue", label: it ? "Oltre la finestra" : "Past the window", items: overdue },
    { key: "unknown", label: it ? "Senza finestra" : "Without a window", items: available.filter(w => !hasWindow(w)) },
  ];
  return <section className="collector-overview collector-glance" aria-label={it ? "Panoramica collezionista" : "Collector overview"}>
      <header><h2>{heading("cellar", it ? "La cantina, a colpo d’occhio" : "Your cellar at a glance")}</h2></header>
      <div className="collector-glance-numbers">
        <div><span>{it ? "Bottiglie" : "Bottles"}</span><strong>{formatBottleCount(total, locale)}</strong></div>
        <div><span>{it ? "Vini" : "Wines"}</span><strong>{stock.length}</strong></div>
        <article><h3>{it ? "Valore della collezione" : "Collection value"}</h3>{valueFigures()}</article>
      </div>
      <div className="collector-glance-distributions">
        {distribution(it ? "Disponibilità" : "Availability", [
          { key: "ready", label: it ? "In cantina" : "In cellar", items: available },
          { key: "waiting", label: it ? "Non ancora in cantina" : "Not yet in cellar", items: elsewhere },
        ], total)}
        {distribution(it ? "Maturità in cantina" : "Maturity in cellar", maturity, bottles(available), it ? "Solo le bottiglie presenti · finestre indicative" : "Physically present bottles only · indicative windows")}
      </div>
      <section className="collector-priorities" aria-label={it ? "Da seguire adesso" : "Follow up now"}>
        <h2>{heading("bell", it ? "Da seguire adesso" : "Follow up now")}</h2>
        <div className="collector-glance-alerts">
          {overdue.length > 0 && selection(it ? "Finestra superata: verifica i vini" : "Past window: review the wines", overdue)}
          {closing.length > 0 && selection(it ? `Finestra in chiusura nel ${year}` : `Window closing in ${year}`, closing)}
          {toCollect.length > 0 && selection(it ? "Da ritirare" : "To collect", toCollect)}
        </div>
        {!overdue.length && !closing.length && !toCollect.length && <p>{it ? "Nessuna attenzione da segnalare in base ai dati disponibili." : "Nothing to flag based on the available data."}</p>}
        {overdue.length > 0 && <p>{it ? "Una finestra superata invita a verificare il vino, non indica un deterioramento." : "A past window calls for a review, not an assumption of deterioration."}</p>}
      </section>
      <Suspense fallback={<p role="status">{it ? "Caricamento grafici…" : "Loading charts…"}</p>}><CollectorEvolution wines={wines} locale={locale} now={now} onOpen={onOpen} /></Suspense>

  </section>;
}
