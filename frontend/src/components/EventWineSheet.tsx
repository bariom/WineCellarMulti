import { useEffect, useRef, useState } from "react";
import type { Locale, Wine } from "../types";
import { api } from "../services/api";
import { displayValue } from "../i18n";
import { DrinkWindowMini } from "./AppPanels";
import { WineSensorySignaturePanel } from "./WineSensorySignaturePanel";
import { AiActivity } from "./AiActivity";
import "./EventWineSheet.css";

/**
 * A bottle photographed at an event, as a guest needs it tonight: when to drink
 * it, the blend, the sommelier's notes and its character. Nothing of the cellar
 * (stock, sales, storage, history) belongs here, and no price: at a restaurant
 * the market value would reveal the venue's markup.
 */
export default function EventWineSheet({ locale, wine, canComplete, onClose, onUpdated, onKeep, onRemove }: {
  locale: Locale;
  wine: Wine;
  /** The event offers bottle photos, whose AI completion covers this wine. */
  canComplete: boolean;
  onClose: () => void;
  onUpdated: (wine: Wine) => void;
  onKeep: () => void;
  onRemove: (wine: Wine) => void;
}) {
  const it = locale === "it";
  const dialog = useRef<HTMLDialogElement>(null);
  const [completing, setCompleting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const element = dialog.current;
    if (element && !element.open) element.showModal();
  }, []);

  const hasWindow = Boolean(wine.drink_from && wine.drink_to);
  const grapes = wine.grapes || [];
  const missing = !hasWindow || !grapes.length || !wine.ai_notes.trim();
  const identity = [wine.producer, wine.vintage].filter(Boolean).join(" · ");
  const origin = [wine.appellation, wine.region].filter(Boolean).filter((part, index, all) => all.indexOf(part) === index).join(" · ");
  const photo = wine.photo_detail_url || wine.photo_thumbnail_url;
  const percent = (grape: Wine["grapes"][number]) => {
    const from = grape.percentage_from;
    const to = grape.percentage_to;
    if (!from && !to) return "";
    return from && to && from !== to ? `${from}–${to}%` : `${to || from}%`;
  };

  async function complete() {
    setCompleting(true);
    setError("");
    try {
      onUpdated(await api<Wine>(`/api/v1/ai/wines/${wine.id}/all`, { method: "POST", body: JSON.stringify({ locale }) }));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : (it ? "Il sommelier non ha trovato dati utili." : "The sommelier found no useful data."));
    } finally {
      setCompleting(false);
    }
  }

  return <dialog ref={dialog} className="event-wine" aria-labelledby="event-wine-title" onClose={onClose} onCancel={(event) => { event.preventDefault(); onClose(); }}>
    <header className="event-wine-hero">
      {photo ? <img src={photo} alt="" className="event-wine-photo" /> : <span className="event-wine-photo is-empty" aria-hidden="true" />}
      <div className="event-wine-identity">
        <p className="event-wine-kicker">{it ? "Fotografata stasera" : "Photographed tonight"}{wine.type ? ` · ${displayValue(wine.type, locale, "type")}` : ""}</p>
        <h2 id="event-wine-title">{wine.name}</h2>
        {identity ? <p className="event-wine-producer">{identity}</p> : null}
        {origin ? <p className="event-wine-origin">{origin}</p> : null}
      </div>
      <button type="button" className="secondary compact event-wine-close" onClick={onClose} aria-label={it ? "Chiudi" : "Close"}>×</button>
    </header>

    <div className="event-wine-body">
      <div className="event-wine-facts">
        <section className="event-wine-card" aria-labelledby="event-wine-window">
          <h3 id="event-wine-window">{it ? "Quando berlo" : "When to drink it"}</h3>
          {hasWindow ? <>
            <DrinkWindowMini wine={wine} locale={locale} />
            {wine.drink_window_notes ? <p>{wine.drink_window_notes}</p> : null}
          </> : <p className="event-wine-empty">{it ? "Finestra di beva non ancora stimata." : "Drinking window not estimated yet."}</p>}
        </section>

        <section className="event-wine-card" aria-labelledby="event-wine-grapes">
          <h3 id="event-wine-grapes">{it ? "Uvaggio" : "Grapes"}</h3>
          {grapes.length ? <ul className="event-wine-grapes">
            {grapes.map((grape) => <li key={grape.name}><span>{grape.name}</span>{percent(grape) ? <b>{percent(grape)}</b> : null}</li>)}
          </ul> : <p className="event-wine-empty">{it ? "Uvaggio non ancora verificato." : "Blend not verified yet."}</p>}
        </section>
      </div>

      {wine.ai_notes.trim() ? <section className="event-wine-notes" aria-labelledby="event-wine-notes">
        <h3 id="event-wine-notes">{it ? "Il sommelier dice" : "The sommelier says"}</h3>
        <p>{wine.ai_notes}</p>
      </section> : null}

      <WineSensorySignaturePanel key={`${wine.id}-${wine.ai_notes.length}`} wineId={wine.id} locale={locale} />

      {missing && canComplete ? <section className="event-wine-complete">
        {completing
          ? <AiActivity locale={locale} label={it ? "Il sommelier cerca i dati del vino…" : "The sommelier is looking the wine up…"} detail={it ? "Finestra di beva, uvaggio e note: di solito meno di un minuto." : "Drinking window, blend and notes: usually under a minute."} />
          : <>
            <p>{it ? "Mancano alcuni dati: il sommelier può cercarli per te." : "Some data is missing: the sommelier can look it up for you."}</p>
            <button type="button" onClick={() => void complete()}>{it ? "Completa con AI" : "Complete with AI"}</button>
          </>}
        {error ? <p className="event-wine-error" role="alert">{error}</p> : null}
      </section> : null}
    </div>

    <footer className="event-wine-footer">
      <button type="button" className="secondary" onClick={() => onRemove(wine)} disabled={completing}>{it ? "Rimuovi" : "Remove"}</button>
      <button type="button" onClick={onKeep}>{it ? "Tienila: crea il mio account" : "Keep it: create my account"}</button>
    </footer>
  </dialog>;
}
