import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { api } from "../services/api";
import type { Locale, TastingArchivePage } from "../types";
import MemoryLocation from "../components/MemoryLocation";
import "./MemoryBook.css";

export default function MemoryBook({ locale, onClose }: { locale: Locale; onClose: () => void }) {
  const it = locale === "it";
  const dialog = useRef<HTMLDialogElement>(null);
  const [index, setIndex] = useState(0);
  const [page, setPage] = useState<TastingArchivePage | null>(null);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState(false);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    const element = dialog.current!;
    const trigger = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    element.showModal(); document.body.style.overflow = "hidden";
    return () => { element.close(); document.body.style.overflow = overflow; trigger?.focus(); };
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    setBusy(true); setError(false);
    api<TastingArchivePage>(`/api/v1/wines/tasting-archive?photos_only=true&limit=1&offset=${index}`, { signal: controller.signal })
      .then(result => { if (!controller.signal.aborted) setPage(result); })
      .catch(() => { if (!controller.signal.aborted) setError(true); })
      .finally(() => { if (!controller.signal.aborted) setBusy(false); });
    return () => controller.abort();
  }, [index, retry]);
  useEffect(() => { if (page && dialog.current) { dialog.current.scrollTop = 0; dialog.current.focus(); } }, [page]);
  const entry = page?.items[0];
  return createPortal(<dialog ref={dialog} className="memory-book" tabIndex={-1} aria-label={it ? "Momenti" : "Moments"}
    onCancel={event => { event.preventDefault(); onClose(); }}
    onKeyDown={event => {
      if (event.target !== event.currentTarget && (event.target as HTMLElement).closest(".memory-location")) return;
      if (!busy && !error && event.key === "ArrowLeft" && index > 0) { event.preventDefault(); setIndex(index - 1); }
      if (!busy && !error && event.key === "ArrowRight" && index + 1 < (page?.total || 0)) { event.preventDefault(); setIndex(index + 1); }
    }}>
    <div className="memory-book-top"><span>{it ? "Vinaris · Momenti" : "Vinaris · Moments"}</span><button type="button" className="secondary" onClick={onClose}>{it ? "Chiudi" : "Close"}</button></div>
    <header><h2>{it ? "Rivivi i tuoi momenti" : "Relive your moments"}</h2><p>{it ? "Ogni bottiglia, una storia. Sfoglia i ricordi che hai condiviso." : "Every bottle, a story. Browse the memories you have shared."}</p></header>
    {busy ? <p role="status">{it ? "Preparazione dei ricordi…" : "Preparing your memories…"}</p> : error ? <div role="alert"><p>{it ? "Impossibile caricare i ricordi." : "Unable to load memories."}</p><button type="button" onClick={() => setRetry(value => value + 1)}>{it ? "Riprova" : "Try again"}</button></div> : entry ? <>
      <article className="memory-book-page" key={`${entry.source}-${entry.tasting_id}`}>
        <img src={entry.memory_photo_url} alt={it ? `Ricordo: ${entry.wine_name}` : `Memory: ${entry.wine_name}`} />
        <div className="memory-book-caption">
          <time dateTime={entry.consumed_at}>{new Intl.DateTimeFormat(locale, { day: "numeric", month: "long", year: "numeric" }).format(new Date(`${entry.consumed_at.slice(0, 10)}T12:00:00`))}</time>
          <h3>{entry.occasion || entry.wine_name}</h3>
          {entry.occasion ? <p>{entry.wine_name}</p> : null}
          <small>{[entry.wine_producer, entry.wine_vintage].filter(Boolean).join(" · ")}</small>
          {entry.note ? <p className="memory-book-note">{entry.note}</p> : null}
          {entry.companions ? <p>{it ? "Con " : "With "}{entry.companions}</p> : null}
          {entry.memory_photo_location ? <MemoryLocation location={entry.memory_photo_location} locale={locale} /> : null}
        </div>
      </article>
      <nav className="memory-book-navigation" aria-label={it ? "Sfoglia ricordi" : "Browse memories"}>
        <button type="button" className="secondary" disabled={index === 0} onClick={() => setIndex(index - 1)} aria-label={it ? "Ricordo precedente" : "Previous memory"}>←</button>
        <span aria-live="polite">{index + 1} / {page!.total}</span>
        <button type="button" className="secondary" disabled={index + 1 >= page!.total} onClick={() => setIndex(index + 1)} aria-label={it ? "Ricordo successivo" : "Next memory"}>→</button>
      </nav>
    </> : <div className="memory-book-empty"><h3>{it ? "Il tuo libro aspetta il primo ricordo" : "Your book is waiting for its first memory"}</h3><p>{it ? "Aggiungi una foto quando registri una bevuta. La ritroverai qui, insieme al vino e alla sua storia." : "Add a photo when recording a tasting. Find it here, together with the wine and its story."}</p></div>}
  </dialog>, document.body);
}
