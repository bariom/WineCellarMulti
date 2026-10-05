import { lazy, Suspense, useEffect, useState } from "react";
import { api } from "../services/api";
import type { Locale, TastingArchivePage } from "../types";
import { AppIcon } from "./AppIcon";
import "./MemoriesWidget.css";

const MemoryBook = lazy(() => import("../views/MemoryBook"));

export default function MemoriesWidget({ locale, preview = false, offline = false }: { locale: Locale; preview?: boolean; offline?: boolean }) {
  const it = locale === "it";
  const [page, setPage] = useState<TastingArchivePage | null>(null);
  const [error, setError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [photoFailed, setPhotoFailed] = useState(false);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    setPage(null); setError(false); setPhotoFailed(false);
    if (!offline) void api<TastingArchivePage>("/api/v1/wines/tasting-archive?photos_only=true&limit=1&offset=0", { signal: controller.signal })
      .then(result => { if (!controller.signal.aborted) setPage(result); })
      .catch(() => { if (!controller.signal.aborted) setError(true); });
    return () => controller.abort();
  }, [attempt, offline]);
  const entry = page?.items[0];
  return <article className="dashboard-card memories-widget">
    <header><span className="memories-widget-kicker"><AppIcon name="camera" size={18} />{it ? "Vino, amici e storie" : "Wine, friends and stories"}</span><h3>{it ? "I miei ricordi" : "My memories"}</h3><p>{it ? "Le bottiglie finiscono. Le belle serate restano." : "Bottles empty. Good times stay with us."}</p></header>
    {offline ? <p>{it ? "Collegati per ritrovare le foto e sfogliare i ricordi." : "Connect to see your photos and browse memories."}</p>
      : error ? <div role="alert"><p>{it ? "Impossibile caricare i ricordi." : "Unable to load memories."}</p><button type="button" className="secondary" onClick={() => setAttempt(value => value + 1)}>{it ? "Riprova" : "Retry"}</button></div>
      : !page ? <p role="status">{it ? "Preparazione dei ricordi…" : "Preparing your memories…"}</p>
      : entry ? <figure>
        {!photoFailed ? <img src={entry.memory_photo_url} alt={it ? `Ricordo: ${entry.occasion || entry.wine_name}` : `Memory: ${entry.occasion || entry.wine_name}`} onError={() => setPhotoFailed(true)} /> : <p className="memories-widget-photo-fallback">{it ? "La foto non è disponibile, il ricordo resta." : "The photo is unavailable, but the memory remains."}</p>}
        <figcaption>
          <time dateTime={entry.consumed_at}>{new Intl.DateTimeFormat(locale, { day: "numeric", month: "long", year: "numeric" }).format(new Date(`${entry.consumed_at.slice(0, 10)}T12:00:00`))}</time>
          <h4>{entry.occasion || entry.wine_name}</h4>
          {entry.occasion && <p>{entry.wine_name}</p>}
          <small>{[entry.wine_producer, entry.wine_vintage].filter(Boolean).join(" · ")}</small>
          {entry.note && <blockquote>{entry.note}</blockquote>}
          {entry.companions && <p className="memories-widget-companions"><AppIcon name="users" size={18} /><span>{it ? "Con " : "With "}{entry.companions}</span></p>}
        </figcaption>
      </figure> : <p className="memories-widget-empty">{it ? "Il tuo album aspetta la prima serata da ricordare. Aggiungi una foto quando registri una bevuta." : "Your album is waiting for its first evening to remember. Add a photo when you record a tasting."}</p>}
    {!offline && page && !error && <footer><span>{it ? `${page.total} ${page.total === 1 ? "ricordo" : "ricordi"}` : `${page.total} ${page.total === 1 ? "memory" : "memories"}`}</span><button type="button" disabled={preview} onClick={() => setOpen(true)} aria-haspopup="dialog">{it ? "Sfoglia i ricordi" : "Browse memories"}</button></footer>}
    {open && <Suspense fallback={<p role="status">{it ? "Caricamento…" : "Loading…"}</p>}><MemoryBook locale={locale} onClose={() => setOpen(false)} /></Suspense>}
  </article>;
}
