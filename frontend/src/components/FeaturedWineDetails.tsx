import { useEffect, useId, useRef } from "react";
import { createPortal } from "react-dom";
import type { Locale, Wine } from "../types";
import { formatBottleCount, numberLocale } from "../domain/cellar";
import { featuredValue } from "../domain/featuredValue";
import { bestTastingRating, isMaturityReason, isTasteReason, type FeaturedReason } from "../domain/featuredSelection";
import { formatMoney } from "./panelSupport";
import { KeyPositionTrendKpi } from "./KeyPositionCardParts";
import "./FeaturedWineDetails.css";

export type FeaturedWine = {
  wine: Wine; highlight: string; reason: FeaturedReason;
  totalValue: number; ownedValue: number; sharePct: number;
};

const score = (value: number, locale: Locale) => `${new Intl.NumberFormat(numberLocale(locale), { maximumFractionDigits: 1 }).format(value)}/6`;
const monthYear = (value: string | null | undefined, locale: Locale) => {
  const timestamp = value ? new Date(`${value.slice(0, 10)}T00:00:00`).getTime() : Number.NaN;
  return Number.isFinite(timestamp) ? new Intl.DateTimeFormat(numberLocale(locale), { month: "short", year: "numeric" }).format(timestamp) : "";
};
const drinkWindow = (wine: Wine) => wine.drink_from && wine.drink_to ? `${wine.drink_from}–${wine.drink_to}` : "";

/** Short kicker for maturity and taste reasons; value reasons keep the app's own wording. */
export function featuredHighlight(reason: FeaturedReason, locale: Locale) {
  const it = locale === "it";
  const labels: Partial<Record<FeaturedReason, string>> = {
    closing: it ? "Da bere quest’anno" : "Drink this year",
    peak: it ? "Entra nel picco" : "Entering its peak",
    overdue: it ? "Da verificare" : "To review",
    favorite: it ? "Tra i tuoi preferiti" : "One of your favourites",
    best_tasting: it ? "Degustazione memorabile" : "Memorable tasting",
    rediscover: it ? "Da riscoprire" : "Worth rediscovering",
  };
  return labels[reason] || "";
}

export function featuredCaption(item: FeaturedWine, locale: Locale) {
  const it = locale === "it";
  const { wine } = item;
  const labels: Record<FeaturedReason, string> = {
    increase: it ? "Maggiore incremento di prezzo" : "Largest price increase",
    owned: it ? "Valore della tua quota" : "Value of your share",
    position: it ? "Valore della posizione" : "Position value",
    personal: it ? "Valore tra i vini personali" : "Value among personal wines",
    shared: it ? "Valore tra i vini condivisi" : "Value among shared wines",
    value: it ? "Tra le posizioni di maggior valore" : "Among your most valuable positions",
    closing: it ? "Finestra in chiusura" : "Window closing",
    peak: it ? "Inizio del picco" : "Peak begins",
    overdue: it ? "Finestra superata" : "Window passed",
    favorite: it ? "Le tue stelle" : "Your stars",
    best_tasting: it ? "Miglior degustazione" : "Best tasting",
    rediscover: it ? "Ultima degustazione" : "Last tasting",
  };
  const change = featuredValue(wine).changePct;
  const metric = item.reason === "increase" && change !== null
    ? new Intl.NumberFormat(numberLocale(locale), { style: "percent", maximumFractionDigits: 1, signDisplay: "exceptZero" }).format(change / 100)
    : item.reason === "closing" || item.reason === "overdue" ? drinkWindow(wine)
    : item.reason === "peak" ? String(wine.drink_peak_from || wine.drink_from || "")
    : item.reason === "favorite" ? score(Number(wine.rating || 0), locale)
    : item.reason === "best_tasting" ? score(bestTastingRating(wine), locale)
    : item.reason === "rediscover" ? monthYear(wine.tasting_summary?.last_consumed_at, locale)
    : formatMoney(item.reason === "position" ? item.totalValue : item.ownedValue, wine.currency, locale);
  return { label: labels[item.reason], metric };
}

export function featuredExplanation(item: FeaturedWine, locale: Locale) {
  const it = locale === "it";
  const year = new Date().getFullYear();
  switch (item.reason) {
    case "closing":
      return it ? `La sua finestra di consumo si chiude nel ${year}: è il momento di stapparlo.` : `Its drinking window closes in ${year}: now is the time to open it.`;
    case "peak":
      return it ? `Dal ${year} entra nella fase migliore della sua finestra di consumo.` : `From ${year} it enters the best phase of its drinking window.`;
    case "overdue":
      return it ? "La finestra indicata è già superata: vale la pena verificarlo, non indica per forza un deterioramento." : "Its indicated window has passed: worth checking, not necessarily a sign of decline.";
    case "favorite":
      return it ? "Gli hai dato tra le stelle più alte della tua cantina, e ne hai ancora in casa." : "You gave it some of the highest stars in your cellar, and you still have some at home.";
    case "best_tasting":
      return it ? "Una delle tue degustazioni meglio valutate, con bottiglie ancora disponibili." : "One of your best-rated tastings, with bottles still available.";
    case "rediscover":
      return it ? "Un vino che ti è piaciuto molto e che non apri da oltre un anno." : "A wine you loved and have not opened for over a year.";
    case "increase":
      return it ? "È il vino con il maggiore incremento percentuale tra quelli confrontabili della tua cantina." : "This wine has the largest percentage increase among comparable wines in your cellar.";
    case "position":
      return it ? "In evidenza per il valore complessivo delle bottiglie in questa posizione." : "Highlighted for the combined value of the bottles in this position.";
    case "personal":
      return it ? "In evidenza come il vino di maggior valore tra quelli di tua esclusiva proprietà." : "Highlighted as the most valuable wine among those you own outright.";
    case "shared":
      return it ? "In evidenza come il vino di maggior valore tra quelli in comproprietà." : "Highlighted as the most valuable wine among those you own jointly.";
    case "value":
      return it ? "In evidenza tra le posizioni di maggior valore della tua cantina." : "Highlighted among the most valuable positions in your cellar.";
    default:
      return it ? "In evidenza per il valore delle bottiglie attribuibile alla tua quota di proprietà." : "Highlighted for the bottle value attributable to your ownership share.";
  }
}

export function FeaturedWineDetails({ item, locale, onClose, onOpen }: {
  item: FeaturedWine; locale: Locale; onClose: () => void; onOpen: (wine: Wine) => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const it = locale === "it";
  const { wine } = item;
  const caption = featuredCaption(item, locale);
  const evidence = featuredValue(wine);
  const money = (value: number | null) => value === null ? "—" : formatMoney(value, wine.currency, locale, 0, 2);
  const date = (timestamp: number | undefined) => timestamp !== undefined && Number.isFinite(timestamp)
    ? new Intl.DateTimeFormat(numberLocale(locale), { day: "numeric", month: "short", year: "numeric" }).format(timestamp) : (it ? "Data non disponibile" : "Date unavailable");
  useEffect(() => {
    const element = dialog.current!;
    const previousFocus = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    element.showModal();
    document.body.style.overflow = "hidden";
    return () => {
      element.close();
      document.body.style.overflow = previousOverflow;
      if (previousFocus?.isConnected) previousFocus.focus({ preventScroll: true });
    };
  }, []);
  const explanation = featuredExplanation(item, locale);
  return createPortal(<dialog ref={dialog} className="featured-wine-dialog" aria-labelledby={titleId}
    onKeyDown={event => {
      if (event.key !== "Tab") return;
      const buttons = event.currentTarget.querySelectorAll<HTMLButtonElement>("button");
      const first = buttons[0];
      const last = buttons[buttons.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    }}
    onCancel={event => { event.preventDefault(); onClose(); }}
    onClick={event => { if (event.target === event.currentTarget) {
      const box = event.currentTarget.getBoundingClientRect();
      if (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom) onClose();
    } }}>
    <div className="featured-wine-sheet">
      <header><div><p>{it ? "Perché è in primo piano" : "Why it is highlighted"}</p>
        <h2 id={titleId}>{wine.name}</h2><p>{[wine.producer, wine.vintage].filter(Boolean).join(" · ")}</p></div>
        <button type="button" autoFocus onClick={onClose} aria-label={it ? "Chiudi approfondimento" : "Close insight"}>×</button>
      </header>
      <section className="featured-wine-reason"><h3>{caption.label}</h3><strong>{caption.metric}</strong><p>{explanation}</p></section>
      {item.reason === "increase" ? <>
        <dl className="featured-wine-facts">
          <div><dt>{evidence.fromPurchase ? (it ? "Acquisto / bottiglia" : "Purchase / bottle") : (it ? "Prima valutazione / bottiglia" : "First valuation / bottle")}</dt><dd>{money(evidence.baseline)}</dd><dd className="featured-wine-date">{date(evidence.baselineTimestamp)}</dd></div>
          <div><dt>{it ? "Valore attuale / bottiglia" : "Current value / bottle"}</dt><dd>{money(evidence.current)}</dd><dd className="featured-wine-date">{date(evidence.currentTimestamp)}</dd></div>
        </dl>
        {evidence.points.length >= 2 ? <KeyPositionTrendKpi label={it ? "Andamento del valore per bottiglia" : "Value per bottle over time"}
          points={evidence.points.map(point => ({ ...point, label: date(point.timestamp) }))} changeLabel={caption.metric}
          rangeLabel={`${date(evidence.baselineTimestamp)} – ${date(evidence.currentTimestamp)}`} unavailableLabel="—" />
          : <p>{it ? "Dati datati insufficienti per mostrare il grafico. Il confronto usa i valori disponibili." : "Insufficient dated data for a chart. The comparison uses available values."}</p>}
        <p className="featured-wine-method">{evidence.fromPurchase
          ? (it ? "Variazione rispetto al prezzo di acquisto. Il valore attuale è una stima, non un ricavo di vendita." : "Change relative to purchase price. Current value is an estimate, not sale proceeds.")
          : (it ? "Variazione rispetto alla prima valutazione disponibile nella stessa valuta. Prezzi di acquisto inferiori a 1 sono esclusi dal confronto." : "Change relative to the first available valuation in the same currency. Purchase prices below 1 are excluded from the comparison.")}</p>
      </> : isMaturityReason(item.reason) || isTasteReason(item.reason) ? <>
        <dl className="featured-wine-facts">
          <div><dt>{it ? "Bottiglie" : "Bottles"}</dt><dd>{formatBottleCount(wine.quantity, locale)}</dd></div>
          <div><dt>{it ? "Finestra di consumo" : "Drinking window"}</dt><dd>{drinkWindow(wine) || "—"}</dd></div>
          {wine.drink_peak_from && wine.drink_peak_to ? <div><dt>{it ? "Picco" : "Peak"}</dt><dd>{wine.drink_peak_from}–{wine.drink_peak_to}</dd></div> : null}
          <div><dt>{it ? "Le tue stelle" : "Your stars"}</dt><dd>{Number(wine.rating || 0) > 0 ? score(Number(wine.rating), locale) : "—"}</dd></div>
          <div><dt>{it ? "Degustazioni" : "Tastings"}</dt><dd>{wine.tasting_summary?.count || 0}</dd></div>
          {bestTastingRating(wine) > 0 ? <div><dt>{it ? "Miglior voto in degustazione" : "Best tasting score"}</dt><dd>{score(bestTastingRating(wine), locale)}</dd></div> : null}
          {wine.tasting_summary?.last_consumed_at ? <div><dt>{it ? "Ultima degustazione" : "Last tasting"}</dt><dd>{date(new Date(`${wine.tasting_summary.last_consumed_at.slice(0, 10)}T00:00:00`).getTime())}</dd></div> : null}
        </dl>
        <p className="featured-wine-method">{isMaturityReason(item.reason)
          ? (it ? "Le finestre di consumo sono indicative e considerano solo le bottiglie presenti in cantina." : "Drinking windows are indicative and consider only bottles physically in the cellar.")
          : (it ? "Basato sulle tue stelle personali e sui voti delle tue degustazioni (scala 0–6)." : "Based on your personal stars and your tasting scores (0–6 scale).")}</p>
      </> : <>
        <dl className="featured-wine-facts">
          <div><dt>{it ? "Bottiglie" : "Bottles"}</dt><dd>{formatBottleCount(wine.quantity, locale)}</dd></div>
          <div><dt>{it ? "Valore unitario" : "Unit value"}</dt><dd>{money(wine.quantity > 0 ? item.totalValue / wine.quantity : null)}</dd></div>
          <div><dt>{it ? "Valore posizione" : "Position value"}</dt><dd>{money(item.totalValue)}</dd></div>
          <div><dt>{it ? "La tua quota" : "Your share"} · {new Intl.NumberFormat(numberLocale(locale), { maximumFractionDigits: 1 }).format(item.sharePct)}%</dt><dd>{money(item.ownedValue)}</dd></div>
        </dl>
        <p className="featured-wine-method">{it ? "Valore posizione = bottiglie × valore unitario. La tua quota considera la percentuale di proprietà. Importi nella valuta del vino." : "Position value = bottles × unit value. Your share accounts for ownership percentage. Amounts are in the wine’s currency."}</p>
      </>}
      <button type="button" className="featured-wine-open" onClick={() => { onClose(); onOpen(wine); }}>{it ? "Apri scheda vino" : "Open wine details"}</button>
    </div>
  </dialog>, document.body);
}
