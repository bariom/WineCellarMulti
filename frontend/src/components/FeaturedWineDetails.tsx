import { useEffect, useId, useRef } from "react";
import { createPortal } from "react-dom";
import type { Locale, Wine } from "../types";
import { formatBottleCount, numberLocale } from "../domain/cellar";
import { featuredValue } from "../domain/featuredValue";
import { formatMoney } from "./panelSupport";
import { KeyPositionTrendKpi } from "./KeyPositionCardParts";
import "./FeaturedWineDetails.css";

export type FeaturedWine = {
  wine: Wine; highlight: string; reason: "increase" | "owned" | "position" | "personal" | "shared" | "value";
  totalValue: number; ownedValue: number; sharePct: number;
};

export function featuredCaption(item: FeaturedWine, locale: Locale) {
  const it = locale === "it";
  const labels = {
    increase: it ? "Maggiore incremento di prezzo" : "Largest price increase",
    owned: it ? "Valore della tua quota" : "Value of your share",
    position: it ? "Valore della posizione" : "Position value",
    personal: it ? "Valore tra i vini personali" : "Value among personal wines",
    shared: it ? "Valore tra i vini condivisi" : "Value among shared wines",
    value: it ? "Tra le posizioni di maggior valore" : "Among your most valuable positions",
  };
  const change = featuredValue(item.wine).changePct;
  const metric = item.reason === "increase" && change !== null
    ? new Intl.NumberFormat(numberLocale(locale), { style: "percent", maximumFractionDigits: 1, signDisplay: "exceptZero" }).format(change / 100)
    : formatMoney(item.reason === "position" ? item.totalValue : item.ownedValue, item.wine.currency, locale);
  return { label: labels[item.reason], metric };
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
  const explanation = item.reason === "increase"
    ? (it ? "È il vino con il maggiore incremento percentuale tra quelli confrontabili della tua cantina." : "This wine has the largest percentage increase among comparable wines in your cellar.")
    : item.reason === "position"
      ? (it ? "In evidenza per il valore complessivo delle bottiglie in questa posizione." : "Highlighted for the combined value of the bottles in this position.")
      : (it ? "In evidenza per il valore delle bottiglie attribuibile alla tua quota di proprietà." : "Highlighted for the bottle value attributable to your ownership share.");
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
