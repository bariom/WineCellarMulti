import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { api } from "../services/api";
import { memoryMonthBounds } from "../domain/memoryPeriod";
import { memoryPhotoThumbnailUrl } from "../domain/memoryPhotos";
import type { Locale, TastingArchivePage } from "../types";
import "./MemoryTable.css";
import { AppIcon } from "./AppIcon";

type Position = { x: number; y: number; z: number };

function PolaroidCaption({ text }: { text: string }) {
  const caption = useRef<HTMLSpanElement>(null);
  useLayoutEffect(() => {
    const element = caption.current!;
    const card = element.parentElement!;
    let width = 0;
    let disposed = false;
    function fit() {
      if (disposed || !card.clientWidth) return;
      card.style.removeProperty("--polaroid-height");
      element.style.fontSize = "";
      const maximum = parseFloat(getComputedStyle(element).fontSize);
      let low = Math.min(11, maximum);
      let high = maximum;
      const fits = () => element.scrollHeight <= element.clientHeight && element.scrollWidth <= element.clientWidth;
      element.style.fontSize = `${low}px`;
      if (!fits()) {
        // Preserve readability and the entire caption for exceptionally long names.
        card.style.setProperty("--polaroid-height", `${204 + element.scrollHeight - element.clientHeight}px`);
        return;
      }
      while (high - low > .1) {
        const size = (low + high) / 2;
        element.style.fontSize = `${size}px`;
        if (fits()) low = size;
        else high = size;
      }
      element.style.fontSize = `${low}px`;
    }
    fit();
    const observer = new ResizeObserver(() => {
      if (card.clientWidth !== width) { width = card.clientWidth; fit(); }
    });
    observer.observe(card);
    void document.fonts.ready.then(fit);
    return () => { disposed = true; observer.disconnect(); };
  }, [text]);
  return <span ref={caption} className="memory-polaroid-caption">{text}</span>;
}

export default function MemoryTable({ locale, query, month, onSelect, pageSize = 20, preview = false, surfaceHeight }: {
  locale: Locale; query: string; month: string; onSelect: (index: number) => void; pageSize?: number; preview?: boolean; surfaceHeight?: number;
}) {
  const it = locale === "it";
  const [offset, setOffset] = useState(0);
  const [page, setPage] = useState<TastingArchivePage | null>(null);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState(false);
  const [retry, setRetry] = useState(0);
  const [positions, setPositions] = useState<Record<string, Position>>({});
  const [dragging, setDragging] = useState<string | null>(null);
  const surface = useRef<HTMLDivElement>(null);
  const highest = useRef(pageSize);
  const drag = useRef<{ id: string; pointer: number; x: number; y: number; start: Position; moved: boolean } | null>(null);
  const lastDrag = useRef(0);
  const lastTap = useRef<{ id: string; time: number } | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    setBusy(true); setError(false);
    const params = new URLSearchParams({ photos_only: "true", limit: String(pageSize), offset: String(offset) });
    if (query) params.set("q", query);
    const period = memoryMonthBounds(month);
    if (period) { params.set("from_date", period.from); params.set("to_date", period.to); }
    api<TastingArchivePage>(`/api/v1/wines/tasting-archive?${params}`, { signal: controller.signal })
      .then(result => {
        if (controller.signal.aborted) return;
        setPage(result); setPositions({}); highest.current = pageSize;
      })
      .catch(() => { if (!controller.signal.aborted) setError(true); })
      .finally(() => { if (!controller.signal.aborted) setBusy(false); });
    return () => controller.abort();
  }, [query, month, offset, retry, pageSize]);

  return <section className="memory-table" aria-label={it ? "Polaroid" : "Polaroids"}>
    <p className="memory-table-hint">{it ? "Trascina le polaroid per esplorare i ricordi. Doppio clic o doppio tocco per aprire la degustazione. Con la tastiera: frecce per spostare, Invio per aprire." : "Drag the polaroids to explore your memories. Double-click or double-tap to open a tasting. Keyboard: arrows to move, Enter to open."}</p>
    {busy ? <p role="status">{it ? "Preparazione del tavolo…" : "Preparing the table…"}</p> : error ? <div role="alert"><p>{it ? "Impossibile caricare i ricordi." : "Unable to load memories."}</p><button type="button" onClick={() => setRetry(value => value + 1)}>{it ? "Riprova" : "Try again"}</button></div> : !page?.items.length ? <p role="status">{it ? "Nessun ricordo trovato. Aggiungi una foto quando registri una bevuta oppure modifica i filtri." : "No memories found. Add a photo when recording a tasting or change the filters."}</p> : <>
      <div ref={surface} className="memory-table-surface" style={{ height: `${surfaceHeight ?? Math.max(400, Math.ceil(page.items.length / 3) * 125 + 220)}px` }}>
        {page.items.map((entry, index) => {
          const id = `${entry.source}-${entry.tasting_id}`;
          const position = positions[id] || { x: .1 + (index % 3) * .39, y: (Math.floor(index / 3) * 125 + 28) / (Math.max(400, Math.ceil(page.items.length / 3) * 125 + 220) - 244), z: index + 1 };
          function move(x: number, y: number) {
            const z = ++highest.current;
            setPositions(current => ({ ...current, [id]: { x: Math.max(0, Math.min(1, x)), y: Math.max(0, Math.min(1, y)), z } }));
          }
          return <button type="button" key={id} disabled={preview} data-archive-index={offset + index} className={`memory-polaroid${dragging === id ? " is-dragging" : ""}`}
            aria-label={it ? `Apri degustazione: ${entry.occasion || entry.wine_name}` : `Open tasting: ${entry.occasion || entry.wine_name}`}
            style={{ left: `calc((100% - var(--polaroid-width) - 24px) * ${position.x} + 12px)`, top: `calc((100% - var(--polaroid-height, 204px) - 40px) * ${position.y} + 14px)`, zIndex: position.z, transform: `rotate(${[-5, 4, -3, 6, -2][index % 5]}deg)` }}
            onPointerDown={event => {
              if (!event.isPrimary || event.button !== 0) return;
              event.currentTarget.setPointerCapture(event.pointerId);
              drag.current = { id, pointer: event.pointerId, x: event.clientX, y: event.clientY, start: position, moved: false };
              setDragging(id); move(position.x, position.y);
            }}
            onPointerMove={event => {
              const active = drag.current;
              if (!active || active.id !== id || active.pointer !== event.pointerId || !surface.current) return;
              const dx = event.clientX - active.x; const dy = event.clientY - active.y;
              if (Math.hypot(dx, dy) > 5) active.moved = true;
              if (active.moved) move(active.start.x + dx / Math.max(1, surface.current.clientWidth - event.currentTarget.offsetWidth - 24), active.start.y + dy / Math.max(1, surface.current.clientHeight - event.currentTarget.offsetHeight - 40));
            }}
            onPointerUp={event => {
              const active = drag.current;
              if (!active || active.pointer !== event.pointerId) return;
              if (active.moved) { lastDrag.current = Date.now(); lastTap.current = null; }
              else if (event.pointerType === "touch") {
                const now = Date.now();
                if (lastTap.current?.id === id && now - lastTap.current.time < 350) { lastTap.current = null; onSelect(offset + index); }
                else lastTap.current = { id, time: now };
              }
              drag.current = null; setDragging(null);
              event.currentTarget.releasePointerCapture(event.pointerId);
            }}
            onLostPointerCapture={() => { drag.current = null; setDragging(null); }}
            onPointerCancel={() => { drag.current = null; setDragging(null); lastDrag.current = Date.now(); }}
            onDoubleClick={() => { if (Date.now() - lastDrag.current > 350) onSelect(offset + index); }}
            onClick={event => { if (event.detail === 0) onSelect(offset + index); }}
            onKeyDown={event => {
              const delta = { ArrowLeft: [-.05, 0], ArrowRight: [.05, 0], ArrowUp: [0, -.05], ArrowDown: [0, .05] }[event.key];
              if (delta) { event.preventDefault(); event.stopPropagation(); move(position.x + delta[0], position.y + delta[1]); }
            }}>
            <img src={memoryPhotoThumbnailUrl(entry.memory_photo_url)} alt="" draggable={false} loading="lazy" decoding="async" />
            <PolaroidCaption text={entry.occasion || entry.wine_name} />
            <time dateTime={entry.consumed_at}>{new Intl.DateTimeFormat(locale, { day: "numeric", month: "short", year: "numeric" }).format(new Date(`${entry.consumed_at.slice(0, 10)}T12:00:00`))}</time>
          </button>;
        })}
      </div>
      <nav className="memory-book-navigation" aria-label={it ? "Sfoglia le Polaroid" : "Browse Polaroids"}>
        <button type="button" disabled={!offset} onClick={() => setOffset(offset - pageSize)}><AppIcon name="chevron-left" size={16} /><span>{it ? "Precedenti" : "Previous"}</span></button>
        <span aria-live="polite">{offset + 1}–{offset + page.items.length} / {page.total}</span>
        <button type="button" disabled={offset + page.items.length >= page.total} onClick={() => setOffset(offset + pageSize)}><span>{it ? "Successivi" : "Next"}</span><AppIcon name="chevron-right" size={16} /></button>
      </nav>
    </>}
  </section>;
}
