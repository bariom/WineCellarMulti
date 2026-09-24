import { useEffect, useId, useRef, useState, type ReactNode } from "react";

/** A lazy, read-only rendering of the actual widget; opening never changes selection. */
export function WidgetPickerCard({ title, description, selected, onSelect, renderPreview, it }: {
  title: string; description: string; selected: boolean; onSelect: () => void;
  renderPreview: () => ReactNode; it: boolean;
}) {
  const id = useId();
  const card = useRef<HTMLDivElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>();
  const pinned = useRef(false);
  const [open, setOpen] = useState(false);
  const cancelTimer = () => clearTimeout(timer.current);
  function close() { cancelTimer(); panel.current?.hidePopover(); setOpen(false); }
  function show(pin = false) {
    cancelTimer(); pinned.current = pin;
    const element = panel.current;
    const anchor = card.current;
    if (!element || !anchor) return;
    const bounds = anchor.getBoundingClientRect();
    const width = Math.min(480, window.innerWidth - 24);
    const left = bounds.right + 12 + width <= window.innerWidth ? bounds.right + 12 : bounds.left - width - 12;
    element.style.left = `${Math.max(12, Math.min(left, window.innerWidth - width - 12))}px`;
    element.style.top = `${Math.max(12, Math.min(bounds.top, window.innerHeight - Math.min(600, window.innerHeight - 24) - 12))}px`;
    setOpen(true); element.showPopover();
  }
  function leave() { cancelTimer(); if (!pinned.current) timer.current = setTimeout(close, 250); }
  useEffect(() => {
    const element = panel.current!;
    element.setAttribute("popover", "auto");
    const sync = () => { if (!element.matches(":popover-open")) { setOpen(false); cancelTimer(); } };
    const resize = () => { element.hidePopover(); setOpen(false); };
    element.addEventListener("toggle", sync);
    window.addEventListener("resize", resize);
    return () => { cancelTimer(); element.removeEventListener("toggle", sync); window.removeEventListener("resize", resize); };
  }, []);
  return <div ref={card} className="personal-widget-choice" onPointerEnter={event => {
    if (event.pointerType === "mouse") { cancelTimer(); timer.current = setTimeout(() => show(), 400); }
  }} onPointerLeave={leave}>
    <label><input type="checkbox" checked={selected} onChange={onSelect} /><span><strong>{title}</strong><small>{description}</small></span></label>
    <button ref={trigger} type="button" className="secondary personal-preview-trigger" aria-label={`${it ? "Anteprima" : "Preview"}: ${title}`} aria-expanded={open} aria-controls={id} onClick={() => show(true)}>{it ? "Anteprima" : "Preview"}</button>
    <div ref={panel} id={id} role="region" aria-label={`${it ? "Anteprima" : "Preview"}: ${title}`} className="personal-widget-preview" onPointerEnter={cancelTimer} onPointerLeave={leave} onFocusCapture={() => { pinned.current = true; cancelTimer(); }}>
      {open && <>
        <header><div><strong>{it ? "Anteprima" : "Preview"}</strong><small>{it ? "Con i dati della tua cantina" : "With your cellar data"}</small></div><button type="button" className="secondary" aria-label={it ? "Chiudi anteprima" : "Close preview"} onClick={() => { close(); trigger.current?.focus(); }}>×</button></header>
        <p className="sr-only">{title}: {description}</p>
        <div className="personal-preview-body" tabIndex={0} aria-label={it ? "Contenuto anteprima, sola lettura" : "Preview content, read only"} onClickCapture={event => {
          // Keep external links in the editor; read-only chart controls and retry remain usable.
          if ((event.target as Element).closest("a")) { event.preventDefault(); event.stopPropagation(); }
        }}>{renderPreview()}</div>
        <footer><span>{selected ? (it ? "Già nella tua selezione" : "Already selected") : (it ? "Non ancora selezionato" : "Not selected yet")}</span><button type="button" disabled={selected} onClick={onSelect}>{selected ? (it ? "Selezionato" : "Selected") : (it ? "Aggiungi widget" : "Add widget")}</button></footer>
      </>}
    </div>
  </div>;
}
