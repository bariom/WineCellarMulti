import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { api } from "../services/api";
import type { Locale, TastingArchiveApiItem, TastingArchivePage } from "../types";
import MemoryLocation from "../components/MemoryLocation";
import { MemoryPhotoViewer } from "../components/TastingMemoryPhoto";
import { AppIcon } from "../components/AppIcon";
import { formatMemoryMonth, memoryMonthBounds, parseMemoryMonth } from "../domain/memoryPeriod";
import "./MemoryBook.css";

const MemoryAtlas = lazy(() => import("../components/MemoryAtlas"));
const MemoryTable = lazy(() => import("../components/MemoryTable"));

function MemoryWineIdentity({ entry, locale }: { entry: TastingArchiveApiItem; locale: Locale }) {
  const [photoFailed, setPhotoFailed] = useState(false);
  const photo = !photoFailed ? entry.wine_photo_thumbnail_url : "";
  return <div className={`memory-book-identity${photo ? " has-bottle-photo" : ""}`}>
    <div className="memory-book-wine-text">
      <time dateTime={entry.consumed_at}>{new Intl.DateTimeFormat(locale, { day: "numeric", month: "long", year: "numeric" }).format(new Date(`${entry.consumed_at.slice(0, 10)}T12:00:00`))}</time>
      <h3>{entry.occasion || entry.wine_name}</h3>
      {entry.occasion ? <p>{entry.wine_name}</p> : null}
      <small>{[entry.wine_producer, entry.wine_vintage].filter(Boolean).join(" · ")}</small>
    </div>
    {photo ? <div className="memory-book-bottle-frame"><img className="memory-book-bottle-photo" src={photo} alt={locale === "it" ? `Bottiglia: ${entry.wine_name}` : `Bottle: ${entry.wine_name}`} onError={() => setPhotoFailed(true)} /></div> : null}
  </div>;
}

export default function MemoryBook({ locale, onClose, initialIndex = 0 }: { locale: Locale; onClose: () => void; initialIndex?: number }) {
  const it = locale === "it";
  const dialog = useRef<HTMLDialogElement>(null);
  const tableContainer = useRef<HTMLDivElement>(null);
  const [index, setIndex] = useState(initialIndex);
  const [page, setPage] = useState<TastingArchivePage | null>(null);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState(false);
  const [retry, setRetry] = useState(0);
  const [searchText, setSearchText] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [monthText, setMonthText] = useState("");
  const [monthQuery, setMonthQuery] = useState("");
  const [photoOpen, setPhotoOpen] = useState(false);
  const [mapOpen, setMapOpen] = useState(false);
  const [tableOpen, setTableOpen] = useState(false);
  const [tableDetail, setTableDetail] = useState(false);
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
    const params = new URLSearchParams({ photos_only: "true", limit: "1", offset: String(index) });
    if (searchQuery) params.set("q", searchQuery);
    const period = memoryMonthBounds(monthQuery);
    if (period) {
      params.set("from_date", period.from);
      params.set("to_date", period.to);
    }
    api<TastingArchivePage>(`/api/v1/wines/tasting-archive?${params}`, { signal: controller.signal })
      .then(result => { if (!controller.signal.aborted) setPage(result); })
      .catch(() => { if (!controller.signal.aborted) setError(true); })
      .finally(() => { if (!controller.signal.aborted) setBusy(false); });
    return () => controller.abort();
  }, [index, retry, searchQuery, monthQuery]);
  useEffect(() => {
    if (page && dialog.current) {
      dialog.current.scrollTop = 0;
      if (!document.activeElement?.closest(".memory-book-search")) dialog.current.focus();
    }
  }, [page]);
  const entry = page?.items[0];
  return createPortal(<dialog ref={dialog} className={`memory-book${tableOpen && !tableDetail ? " memory-book-fullscreen" : !mapOpen ? " memory-book-detail" : ""}`} tabIndex={-1} aria-label={it ? "Momenti" : "Moments"}
    onCancel={event => { event.preventDefault(); if (!photoOpen) onClose(); }}
    onKeyDown={event => {
      if (photoOpen || mapOpen || (tableOpen && !tableDetail)) return;
      if (event.target !== event.currentTarget && (event.target as HTMLElement).closest(".memory-location, .memory-book-search")) return;
      if (!busy && !error && event.key === "ArrowLeft" && index > 0) { event.preventDefault(); setIndex(index - 1); }
      if (!busy && !error && event.key === "ArrowRight" && index + 1 < (page?.total || 0)) { event.preventDefault(); setIndex(index + 1); }
    }}>
    <div className="memory-book-top"><span><AppIcon name="tasting" size={20} detailLevel="compact" />{it ? "Vino, amici e storie" : "Wine, friends and stories"}</span><button type="button" className="secondary" onClick={onClose}>{it ? "Chiudi" : "Close"}</button></div>
    <header><h2>{it ? "I miei ricordi" : "My memories"}</h2><p>{it ? "Le bottiglie finiscono. Le belle serate restano." : "Bottles empty. Good times stay with us."}</p></header>
    <form className="memory-book-search" role="search" aria-label={it ? "Cerca nei ricordi" : "Search memories"} onSubmit={event => {
      event.preventDefault();
      setIndex(0);
      setTableDetail(false);
      setSearchQuery(searchText.trim());
    }}>
      <label className="sr-only" htmlFor="memory-book-query">{it ? "Cerca nei ricordi" : "Search memories"}</label>
      <div className="memory-book-search-controls">
        <div className="memory-book-query-field"><AppIcon name="search" size={17} /><input id="memory-book-query" type="search" value={searchText} onChange={event => setSearchText(event.target.value)} placeholder={it ? "Vino, occasione, persone…" : "Wine, occasion, people…"} /></div>
        <button type="submit">{it ? "Cerca" : "Search"}</button>
      </div>
      <div className="memory-book-period">
        <label htmlFor="memory-book-month">{it ? "Periodo" : "Period"}</label>
        <input id="memory-book-month" type="month" value={monthText}
          placeholder={it ? "Mese e anno" : "Month and year"}
          title={it ? "Es. ottobre 2026. Senza anno si usa quello corrente." : "E.g. October 2026. Without a year, the current year is used."}
          onChange={event => {
            const text = event.target.value;
            const month = parseMemoryMonth(text, locale);
            setMonthText(text);
            event.target.setCustomValidity(month === null ? (it ? "Inserisci un mese valido, ad esempio ottobre 2026." : "Enter a valid month, for example October 2026.") : "");
            if (month !== null) { setMonthQuery(month); setIndex(0); setTableDetail(false); }
          }}
          onBlur={event => {
            const month = parseMemoryMonth(event.target.value, locale);
            if (event.target.type === "text" && month) setMonthText(formatMemoryMonth(month, locale));
          }} />
        <button type="button" className="secondary memory-book-view-toggle" aria-label={tableOpen ? (it ? "Sfoglia le foto" : "Browse photos") : (it ? "Polaroid" : "Polaroids")} aria-pressed={tableOpen} onClick={() => { setTableOpen(value => !value); setTableDetail(false); setMapOpen(false); }}><AppIcon name="camera" size={18} /><span className="memory-book-view-label">{tableOpen ? (it ? "Foto" : "Photos") : (it ? "Polaroid" : "Polaroids")}</span><span className="memory-book-compact-table-label" aria-hidden="true">{tableOpen ? (it ? "Foto" : "Photos") : (it ? "Polaroid" : "Polaroids")}</span></button>
        <button type="button" className="secondary memory-book-view-toggle" aria-label={mapOpen ? (it ? "Sfoglia le foto" : "Browse photos") : (it ? "Mappa dei ricordi" : "Memory map")} aria-pressed={mapOpen} onClick={() => { setMapOpen(value => !value); setTableOpen(false); setTableDetail(false); }}><AppIcon name={mapOpen ? "camera" : "location"} size={18} /><span className="memory-book-view-label">{mapOpen ? (it ? "Foto" : "Photos") : (it ? "Mappa" : "Map")}</span></button>
      </div>
      {searchQuery || monthQuery ? <div className="memory-book-search-results">
        <span role="status">{!busy && !error ? (page?.total === 1 ? (it ? "1 ricordo trovato" : "1 memory found") : (it ? `${page?.total || 0} ricordi trovati` : `${page?.total || 0} memories found`)) : ""}</span>
        <button type="button" className="secondary" onClick={() => { setSearchText(""); setSearchQuery(""); setMonthText(""); setMonthQuery(""); setTableDetail(false); dialog.current?.querySelector<HTMLInputElement>("#memory-book-month")?.setCustomValidity(""); setIndex(0); }}>{it ? "Mostra tutti i ricordi" : "Show all memories"}</button>
      </div> : null}
    </form>
    {tableOpen ? <div ref={tableContainer} className="memory-book-table-container" hidden={tableDetail}><Suspense fallback={<p role="status">{it ? "Preparazione del tavolo…" : "Preparing the table…"}</p>}><MemoryTable key={JSON.stringify([searchQuery, monthQuery])} locale={locale} query={searchQuery} month={monthQuery} onSelect={selectedIndex => { setIndex(selectedIndex); setTableDetail(true); dialog.current?.focus(); }} /></Suspense></div> : null}
    {tableOpen && tableDetail ? <button type="button" className="memory-book-return" onClick={() => { setTableDetail(false); requestAnimationFrame(() => tableContainer.current?.querySelector<HTMLButtonElement>(`[data-archive-index="${index}"]`)?.focus()); }}>{it ? "Torna alle Polaroid" : "Back to Polaroids"}</button> : null}
    {tableOpen && !tableDetail ? null : mapOpen ? <Suspense fallback={<p role="status">{it ? "Caricamento mappa…" : "Loading map…"}</p>}>
      <MemoryAtlas locale={locale} query={searchQuery} month={monthQuery} onSelect={selectedIndex => { setIndex(selectedIndex); setMapOpen(false); dialog.current?.focus(); }} />
    </Suspense> : busy ? <p role="status">{it ? "Preparazione dei ricordi…" : "Preparing your memories…"}</p> : error ? <div role="alert"><p>{it ? "Impossibile caricare i ricordi." : "Unable to load memories."}</p><button type="button" onClick={() => setRetry(value => value + 1)}>{it ? "Riprova" : "Try again"}</button></div> : entry ? <>
      <article className="memory-book-page" key={`${entry.source}-${entry.tasting_id}`}>
        <button type="button" className="memory-book-photo-open" aria-label={it ? "Apri foto ricordo" : "Open memory photo"} aria-haspopup="dialog" onClick={() => setPhotoOpen(true)}>
          <img src={entry.memory_photo_url} alt={it ? `Ricordo: ${entry.wine_name}` : `Memory: ${entry.wine_name}`} />
          <span className="memory-book-photo-hint" aria-hidden="true"><AppIcon name="search" size={16} /></span>
        </button>
        <div className="memory-book-caption">
          <MemoryWineIdentity entry={entry} locale={locale} />
          {entry.note ? <p className="memory-book-note">{entry.note}</p> : null}
          {entry.companions ? <p className="memory-book-companions"><AppIcon name="users" size={17} /><span>{it ? "Con " : "With "}{entry.companions}</span></p> : null}
          {entry.memory_photo_location ? <MemoryLocation location={entry.memory_photo_location} locale={locale} /> : null}
          {tableDetail ? <dl className="memory-book-tasting-details">
            {entry.enjoyment ? <><dt>{it ? "Gradimento" : "Enjoyment"}</dt><dd>{entry.enjoyment === "positive" ? (it ? "Mi è piaciuto" : "I enjoyed it") : (it ? "Non mi è piaciuto" : "I did not enjoy it")}</dd></> : null}
            {entry.rating > 0 && entry.score_value == null ? <><dt>{it ? "Valutazione" : "Rating"}</dt><dd>{entry.rating} / 6</dd></> : null}
            {entry.score_value != null ? <><dt>{it ? "Punteggio" : "Score"}</dt><dd>{entry.score_value}{entry.score_scale ? ` / ${entry.score_scale}` : ""}</dd></> : null}
            {entry.pairing ? <><dt>{it ? "Abbinamento" : "Pairing"}</dt><dd>{entry.pairing}</dd></> : null}
            {entry.sommelier_feedback ? <><dt>{it ? "Il sommelier" : "Sommelier"}</dt><dd>{entry.sommelier_feedback}</dd></> : null}
            {entry.sommelier_pairing_advice ? <><dt>{it ? "Consiglio sull’abbinamento" : "Pairing advice"}</dt><dd>{entry.sommelier_pairing_advice}</dd></> : null}
          </dl> : null}
        </div>
      </article>
      <nav className="memory-book-navigation" aria-label={it ? "Sfoglia ricordi" : "Browse memories"}>
        <button type="button" className="secondary" disabled={index === 0} onClick={() => setIndex(index - 1)} aria-label={it ? "Ricordo precedente" : "Previous memory"}><AppIcon name="chevron-left" size={18} /></button>
        <span aria-live="polite">{index + 1} / {page!.total}</span>
        <button type="button" className="secondary" disabled={index + 1 >= page!.total} onClick={() => setIndex(index + 1)} aria-label={it ? "Ricordo successivo" : "Next memory"}><AppIcon name="chevron-right" size={18} /></button>
      </nav>
      {photoOpen && entry.memory_photo_url ? <MemoryPhotoViewer url={entry.memory_photo_url} locale={locale} wineName={entry.wine_name}
        date={new Intl.DateTimeFormat(locale, { day: "numeric", month: "long", year: "numeric" }).format(new Date(`${entry.consumed_at.slice(0, 10)}T12:00:00`))}
        onClose={() => setPhotoOpen(false)} /> : null}
    </> : <div className="memory-book-empty"><h3>{searchQuery || monthQuery ? (it ? "Nessun ricordo trovato" : "No memories found") : (it ? "Il tuo libro aspetta il primo ricordo" : "Your book is waiting for its first memory")}</h3><p>{searchQuery || monthQuery ? (it ? "Prova con un altro periodo, vino, occasione o persona." : "Try another period, wine, occasion, or person.") : (it ? "Aggiungi una foto quando registri una bevuta. La ritroverai qui, insieme al vino e alla sua storia." : "Add a photo when recording a tasting. Find it here, together with the wine and its story.")}</p></div>}
  </dialog>, document.body);
}
