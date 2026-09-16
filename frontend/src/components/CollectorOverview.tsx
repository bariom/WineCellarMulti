import { CollectorCardGroup } from "./CollectorCardGroup";
import { useEffect, useState } from "react";
import type { Locale, Wine } from "../types";
import { formatBottleCount, isWinePhysicallyInCellar, isToCollectWine, isWineReadyToPrioritize, needsValueRefresh } from "../domain/cellar";
import { formatMoney } from "./panelSupport";

export function CollectorOverview({ wines, locale, now, refreshDays, onOpen }: {
  wines: Wine[]; locale: Locale; now: Date; refreshDays: number; onOpen: (wine: Wine) => void;
}) {
  const [mobile, setMobile] = useState(() => window.matchMedia("(max-width: 900px)").matches);
  useEffect(() => {
    const media = window.matchMedia("(max-width: 900px)");
    const update = () => setMobile(media.matches);
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);
  const Composition = mobile ? "details" : "section";
  const it = locale === "it";
  const year = now.getFullYear();
  const stock = wines.filter(wine => wine.quantity > 0);
  const bottles = (items: Wine[]) => items.reduce((sum, wine) => sum + wine.quantity, 0);
  const count = (items: Wine[]) => `${formatBottleCount(bottles(items), locale)} ${it ? (bottles(items) === 1 ? "bottiglia" : "bottiglie") : (bottles(items) === 1 ? "bottle" : "bottles")} · ${items.length} ${it ? (items.length === 1 ? "vino" : "vini") : (items.length === 1 ? "wine" : "wines")}`;
  const total = bottles(stock);
  const pct = (items: Wine[]) => total ? `${Math.round(bottles(items) / total * 100)}%` : "—";
  const positive = (value: string | null) => Number.isFinite(Number(value)) && Number(value) > 0;
  const valued = stock.filter(wine => positive(wine.current_value));
  const fallback = stock.filter(wine => !positive(wine.current_value) && positive(wine.price));
  const unvalued = stock.filter(wine => !positive(wine.current_value) && !positive(wine.price));
  const stale = valued.filter(wine => needsValueRefresh(wine, refreshDays, now));
  const available = stock.filter(isWinePhysicallyInCellar);
  const elsewhere = stock.filter(wine => !isWinePhysicallyInCellar(wine));
  const toCollect = elsewhere.filter(isToCollectWine);
  const hasWindow = (wine: Wine) => Boolean(wine.drink_from && wine.drink_to && wine.drink_from <= wine.drink_to);
  const known = stock.filter(hasWindow);
  const unknown = stock.filter(wine => !hasWindow(wine));
  const overdue = available.filter(wine => hasWindow(wine) && wine.drink_to! < year);
  const closing = available.filter(wine => hasWindow(wine) && wine.drink_to === year);
  const ready = available.filter(wine => hasWindow(wine) && isWineReadyToPrioritize(wine, year));
  const future = available.filter(wine => hasWindow(wine) && (wine.drink_peak_from || wine.drink_from!) > year);
  const totals = new Map<string, number>();
  for (const wine of stock) {
    const value = positive(wine.current_value) ? Number(wine.current_value) : positive(wine.price) ? Number(wine.price) : 0;
    if (value) totals.set(wine.currency, (totals.get(wine.currency) || 0) + value * wine.quantity);
  }
  const producers = new Map<string, Wine[]>();
  for (const wine of stock) {
    const key = wine.producer.trim().toLocaleLowerCase();
    if (key) producers.set(key, [...(producers.get(key) || []), wine]);
  }
  const leading = [...producers.values()].sort((a, b) => bottles(b) - bottles(a))[0] || [];

  function selection(title: string, items: Wine[]) {
    return <details className="collector-selection">
      <summary>{title}<span>{count(items)}</span></summary>
      {items.length ? <div className="collector-wine-list">{items.map(wine => <button type="button" key={wine.id} onClick={() => onOpen(wine)}>
        <span>{wine.name}<small>{[wine.producer, wine.vintage].filter(Boolean).join(" · ")}</small></span>
        <strong>{formatBottleCount(wine.quantity, locale)} {it ? "bott." : "btl."}</strong>
      </button>)}</div> : <p>{it ? "Nessun vino in questa selezione." : "No wines in this selection."}</p>}
    </details>;
  }

  return <section className="collector-overview" aria-label={it ? "Panoramica collezionista" : "Collector overview"}>
    <header><p className="eyebrow">{it ? "La tua collezione" : "Your collection"}</p>
      <h2>{it ? "La cantina, a colpo d’occhio" : "Your cellar at a glance"}</h2>
      <p>{count(stock)} · {it ? "Intera cantina, incluse le quote condivise. Disponibilità basata sullo stato registrato." : "Whole cellar, including shared ownership. Availability is based on recorded status."}</p>
    </header>
    <CollectorCardGroup className="collector-summary-grid" locale={locale} label={it ? "Indicatori della cantina" : "Cellar indicators"}>
      <article className="collector-tile collector-value"><h3>{it ? "Valore della collezione" : "Collection value"}</h3>
        <div className="collector-number">{totals.size ? [...totals].sort(([a], [b]) => a.localeCompare(b)).map(([currency, value]) => <strong key={currency}>{formatMoney(value, currency, locale)}</strong>) : <strong>—</strong>}</div>
        <p>{it ? "Valori registrati, con ripiego sul prezzo d’acquisto." : "Recorded values, falling back to purchase prices."}</p>
        <details className="collector-method"><summary>{it ? "Composizione del valore" : "Value breakdown"}</summary>
        <p>{it ? "Valute separate, senza conversione. Le bottiglie senza valore non contribuiscono al totale." : "Currencies shown separately, without conversion. Bottles without a value are excluded from the total."}</p>
        {selection(it ? "Con valutazione corrente" : "With current valuation", valued)}
        {selection(it ? "Solo prezzo d’acquisto" : "Purchase price only", fallback)}
        {selection(it ? "Senza valore" : "Without value", unvalued)}
        </details>
      </article>
      <article className="collector-tile"><h3>{it ? "Disponibilità" : "Availability"}</h3>
        <strong className="collector-number">{formatBottleCount(bottles(available), locale)} <small>{it ? "bottiglie in cantina" : "bottles in cellar"}</small></strong>
        <p>{count(elsewhere)} {it ? "non ancora in cantina" : "not yet in cellar"}</p>
        <details className="collector-method"><summary>{it ? "Vedi disponibilità" : "View availability"}</summary>
        {selection(it ? "In cantina" : "In cellar", available)}
        {selection(it ? "Non ancora in cantina" : "Not yet in cellar", elsewhere)}
        </details>
      </article>
      <article className="collector-tile"><h3>{it ? "Copertura valutazioni" : "Valuation coverage"}</h3>
        <strong className="collector-number">{pct(valued)}</strong>
        <p>{it ? "Bottiglie con valutazione corrente." : "Bottles with a current valuation."}</p>
        <details className="collector-method"><summary>{it ? "Verifica valutazioni" : "Review valuations"}</summary>
        <p>{it ? "La copertura non indica l’affidabilità della stima." : "Coverage does not measure valuation reliability."}</p>
        {selection(it ? "Valutazioni da verificare" : "Valuations to review", stale)}
        <p>{refreshDays > 0 ? (it ? `Data assente o aggiornamento di almeno ${refreshDays} giorni fa.` : `Missing date or last updated at least ${refreshDays} days ago.`) : (it ? "Promemoria di aggiornamento disattivato." : "Refresh reminders disabled.")}</p>
        </details>
      </article>
    </CollectorCardGroup>
    <section className="collector-priorities" aria-label={it ? "Da seguire adesso" : "Follow up now"}>
      <h2>{it ? "Da seguire adesso" : "Follow up now"}</h2>
      <p>{it ? "Le finestre di beva sono indicative: una finestra superata invita a verificare il vino, non prova un deterioramento." : "Drinking windows are indicative: a past window calls for a review, not an assumption of deterioration."}</p>
      <CollectorCardGroup className="collector-priority-grid" locale={locale} label={it ? "Priorità" : "Priorities"}>
        <article className={`collector-tile${overdue.length ? " collector-attention" : ""}`}><h3>{it ? "Finestra superata" : "Past drinking window"}</h3>{selection(it ? "Vini da verificare" : "Wines to review", overdue)}</article>
        <article className={`collector-tile${closing.length ? " collector-attention" : ""}`}><h3>{it ? `Finestra in chiusura nel ${year}` : `Window closing in ${year}`}</h3>{selection(it ? "Vini in chiusura" : "Closing windows", closing)}</article>
        <article className="collector-tile"><h3>{it ? "Da ritirare" : "To collect"}</h3>{selection(it ? "Organizza il ritiro" : "Arrange collection", toCollect)}</article>
      </CollectorCardGroup>
    </section>
    <Composition className="collector-composition" aria-label={it ? "Maturità e composizione" : "Maturity and composition"}>
      {mobile ? <summary>{it ? "Maturità e composizione" : "Maturity and composition"}</summary> : <h2>{it ? "Maturità e composizione" : "Maturity and composition"}</h2>}
      <CollectorCardGroup className="collector-summary-grid" locale={locale} label={it ? "Maturità e composizione" : "Maturity and composition"}>
        <article className="collector-tile"><h3>{it ? "Finestre conosciute" : "Known drinking windows"}</h3><strong className="collector-number">{pct(known)}</strong><p>{it ? "Copertura sulle bottiglie dell’intera cantina." : "Coverage across all bottles in the collection."}</p>{selection(it ? "Finestre da completare" : "Windows to complete", unknown)}</article>
        <article className="collector-tile"><h3>{it ? "Maturità in cantina" : "Maturity in cellar"}</h3><p>{it ? "Bottiglie fisicamente presenti, indipendentemente dall’obiettivo assegnato." : "Physically available bottles, regardless of assigned purpose."}</p>{selection(it ? "Nella finestra ideale o successiva" : "In or after the ideal window", ready)}{selection(it ? "Prima della finestra ideale" : "Before the ideal window", future)}</article>
        <article className="collector-tile"><h3>{it ? "Produttore principale" : "Largest producer"}</h3><strong className="collector-number">{pct(leading)}</strong><p>{it ? "Quota delle bottiglie totali. Una concentrazione descrive la collezione, non è un giudizio sulla qualità." : "Share of total bottles. Concentration describes the collection, not its quality."}</p>{selection(leading[0]?.producer || (it ? "Produttore non disponibile" : "Producer unavailable"), leading)}</article>
      </CollectorCardGroup>
    </Composition>
  </section>;
}
