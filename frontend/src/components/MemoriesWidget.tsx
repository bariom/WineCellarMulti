import { lazy, Suspense, useEffect, useState } from "react";
import { api } from "../services/api";
import type { Locale, TastingArchivePage } from "../types";
import { AppIcon } from "./AppIcon";
import "./DashboardSummaryWidget.css";
import "./MemoriesWidget.css";

const MemoryBook = lazy(() => import("../views/MemoryBook"));

export default function MemoriesWidget({ locale, preview = false, offline = false }: { locale: Locale; preview?: boolean; offline?: boolean }) {
  const it = locale === "it";
  const [page, setPage] = useState<TastingArchivePage | null>(null);
  const [error, setError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [photoFailed, setPhotoFailed] = useState(false);
  const [open, setOpen] = useState(false);
  const [index, setIndex] = useState(0);
  const [busy, setBusy] = useState(true);
  useEffect(() => {
    const controller = new AbortController();
    setBusy(true); setError(false); setPhotoFailed(false);
    if (!offline) void api<TastingArchivePage>(`/api/v1/wines/tasting-archive?photos_only=true&limit=1&offset=${index}`, { signal: controller.signal })
      .then(result => {
        if (controller.signal.aborted) return;
        setPage(result);
        if (index > 0 && !result.items.length) setIndex(Math.max(0, result.total - 1));
      })
      .catch(() => { if (!controller.signal.aborted) setError(true); })
      .finally(() => { if (!controller.signal.aborted) setBusy(false); });
    return () => controller.abort();
  }, [attempt, offline, index]);
  const entry = page?.items[0];
  function move(next: number) { setBusy(true); setIndex(next); }
  return <article className="dashboard-summary memories-widget">
    <header><p>{it ? "Vino, amici e storie" : "Wine, friends and stories"}</p><h3>{it ? "I miei ricordi" : "My memories"}</h3></header>
    <div className="summary-body">
    <p className="memories-widget-intro">{it ? "Le bottiglie finiscono. Le belle serate restano." : "Bottles empty. Good times stay with us."}</p>
    {offline ? <p>{it ? "Collegati per ritrovare le foto e sfogliare i ricordi." : "Connect to see your photos and browse memories."}</p>
      : error ? <div role="alert"><p>{it ? "Impossibile caricare i ricordi." : "Unable to load memories."}</p><button type="button" className="secondary" onClick={() => setAttempt(value => value + 1)}>{it ? "Riprova" : "Retry"}</button></div>
      : busy || !page ? <p role="status">{it ? "Preparazione dei ricordi…" : "Preparing your memories…"}</p>
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
    {!offline && !!page?.total && <nav className="memories-widget-navigation" aria-label={it ? "Sfoglia nel widget" : "Browse in widget"}>
      <button type="button" className="secondary" disabled={busy || index === 0} aria-label={it ? "Ricordo precedente" : "Previous memory"} onClick={() => move(index - 1)}><AppIcon name="chevron-left" size={18} /></button>
      <span role="status">{!busy && !error ? `${index + 1} / ${page.total}` : "…"}</span>
      <button type="button" className="secondary" disabled={busy || index + 1 >= page.total} aria-label={it ? "Ricordo successivo" : "Next memory"} onClick={() => move(index + 1)}><AppIcon name="chevron-right" size={18} /></button>
    </nav>}
    </div>
    <footer><button type="button" className="summary-explore" disabled={preview || offline || busy || error || !page?.total} onClick={() => setOpen(true)} aria-haspopup="dialog">{it ? "Sfoglia i ricordi" : "Browse memories"}<span aria-hidden="true">↗</span></button></footer>
    {open && <Suspense fallback={<p role="status">{it ? "Caricamento…" : "Loading…"}</p>}><MemoryBook locale={locale} initialIndex={index} onClose={() => setOpen(false)} /></Suspense>}
  </article>;
}
