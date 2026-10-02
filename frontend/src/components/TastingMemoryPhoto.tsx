import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { Locale } from "../types";
import { AppIcon } from "./AppIcon";
import "./TastingMemoryPhoto.css";

async function compactPhoto(file: File): Promise<string> {
  if (file.size > 25_000_000) throw new Error("size");
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    const scale = Math.min(1, 1280 / Math.max(image.naturalWidth, image.naturalHeight));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
    const context = canvas.getContext("2d");
    if (!context) throw new Error("decode");
    context.fillStyle = "white";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    for (const quality of [.82, .72, .60, .45]) {
      const value = canvas.toDataURL("image/jpeg", quality);
      if ((value.length - value.indexOf(",") - 1) * .75 <= 200_000) return value;
    }
    throw new Error("size");
  } finally { URL.revokeObjectURL(url); }
}

export function TastingMemoryPhotoInput({ locale, value, existingUrl, disabled, onChange, onProcessingChange }: {
  locale: Locale; value?: string; existingUrl?: string; disabled?: boolean;
  onChange: (value: string) => void; onProcessingChange: (busy: boolean) => void;
}) {
  const it = locale === "it";
  const camera = useRef<HTMLInputElement>(null);
  const gallery = useRef<HTMLInputElement>(null);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState("");
  const preview = value === undefined ? existingUrl : value;
  async function choose(file?: File) {
    if (!file) return;
    setProcessing(true); onProcessingChange(true); setError("");
    try { onChange(await compactPhoto(file)); }
    catch { setError(it ? "Foto non leggibile o troppo grande. Scegli un JPEG, PNG o WebP fino a 25 MB." : "Photo unreadable or too large. Choose a JPEG, PNG or WebP up to 25 MB."); }
    finally { setProcessing(false); onProcessingChange(false); }
  }
  return <section className={`tasting-memory-photo tasting-memory-input${preview ? " has-photo" : ""}`} aria-label={it ? "Foto ricordo" : "Memory photo"} aria-busy={processing}>
    <div className="tasting-memory-heading">
      <span className="tasting-memory-kicker"><AppIcon name="camera" />{it ? "Il tuo ricordo" : "Your memory"}</span>
      <span className="tasting-memory-optional">{it ? "Facoltativa" : "Optional"}</span>
    </div>
    <div className="tasting-memory-intro">
      <strong>{it ? "Il momento, oltre il vino." : "The moment, beyond the wine."}</strong>
      <p>{it ? "Un volto, un brindisi, un luogo. Una foto per ritrovare questa bevuta." : "A face, a toast, a place. A photo to remember this tasting."}</p>
    </div>
    {preview ? <div className="tasting-memory-frame"><img className="tasting-memory-image" src={preview} alt={it ? "Foto ricordo della bevuta" : "Tasting memory photo"} /></div> : null}
    <div className="tasting-memory-actions">
      <button type="button" className="tasting-memory-camera" disabled={disabled || processing} onClick={() => camera.current?.click()}><AppIcon name="camera" />{it ? "Scatta foto" : "Take photo"}</button>
      <button type="button" className="secondary" disabled={disabled || processing} onClick={() => gallery.current?.click()}><AppIcon name="dashboard-cards" />{it ? "Scegli foto" : "Choose photo"}</button>
    </div>
    {preview ? <div className="tasting-memory-footer"><small><AppIcon name="tasting" />{it ? "Foto allegata alla bevuta" : "Photo attached to the tasting"}</small><button type="button" className="tasting-memory-remove" disabled={disabled || processing} onClick={() => { onChange(""); setError(""); }}><AppIcon name="delete" />{it ? "Rimuovi foto" : "Remove photo"}</button></div> : null}
    <input ref={camera} type="file" accept="image/jpeg,image/png,image/webp" capture="environment" hidden aria-label={it ? "Scatta foto ricordo" : "Take memory photo"} onChange={event => { void choose(event.target.files?.[0]); event.target.value = ""; }} />
    <input ref={gallery} type="file" accept="image/jpeg,image/png,image/webp" hidden aria-label={it ? "Scegli foto ricordo" : "Choose memory photo"} onChange={event => { void choose(event.target.files?.[0]); event.target.value = ""; }} />
    {processing ? <small role="status">{it ? "Preparazione foto…" : "Preparing photo…"}</small> : null}
    {error ? <p role="alert">{error}</p> : null}
  </section>;
}

function MemoryPhotoViewer({ url, locale, wineName, date, onClose }: {
  url: string; locale: Locale; wineName?: string; date: string; onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const it = locale === "it";
  useEffect(() => {
    const element = dialog.current!;
    const trigger = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    element.showModal();
    document.body.style.overflow = "hidden";
    return () => { element.close(); document.body.style.overflow = overflow; trigger?.focus(); };
  }, []);
  return createPortal(<dialog ref={dialog} className="tasting-memory-viewer" aria-label={it ? "Foto ricordo" : "Memory photo"} onCancel={event => { event.preventDefault(); onClose(); }}>
    <div className="tasting-memory-viewer-heading">
      <div><span className="tasting-memory-kicker">{it ? "Il tuo ricordo" : "Your memory"}</span><h2>{wineName || (it ? "Un momento da ricordare" : "A moment to remember")}</h2>{date ? <p>{date}</p> : null}</div>
      <button type="button" className="secondary" onClick={onClose}>{it ? "Chiudi" : "Close"}</button>
    </div>
    <img src={url} alt={it ? "Foto ricordo della bevuta" : "Tasting memory photo"} />
  </dialog>, document.body);
}

export function TastingMemoryPhoto({ url, locale, wineName, consumedAt, note }: {
  url?: string; locale: Locale; wineName?: string; consumedAt?: string; note?: string;
}) {
  const [open, setOpen] = useState(false);
  const it = locale === "it";
  const date = consumedAt && Number.isFinite(Date.parse(consumedAt))
    ? new Intl.DateTimeFormat(locale, { day: "numeric", month: "long", year: "numeric" }).format(new Date(`${consumedAt.slice(0, 10)}T12:00:00`)) : "";
  return url ? <figure className="tasting-memory-photo tasting-memory-story">
    <button type="button" className="tasting-memory-open" aria-label={it ? "Apri foto ricordo" : "Open memory photo"} aria-haspopup="dialog" onClick={() => setOpen(true)}>
      <span className="tasting-memory-frame"><img className="tasting-memory-image" src={url} loading="lazy" alt={it ? "Foto ricordo della bevuta" : "Tasting memory photo"} /></span>
      <span className="tasting-memory-view-hint"><AppIcon name="search" />{it ? "Guarda il ricordo" : "View the memory"}</span>
    </button>
    <figcaption>
      <div className="tasting-memory-caption-heading"><span className="tasting-memory-kicker">{it ? "Un momento da ricordare" : "A moment to remember"}</span>{date ? <time dateTime={consumedAt?.slice(0, 10)}>{date}</time> : null}</div>
      {note ? <p className="tasting-memory-note">{note}</p> : null}
    </figcaption>
    {open ? <MemoryPhotoViewer url={url} locale={locale} wineName={wineName} date={date} onClose={() => setOpen(false)} /> : null}
  </figure> : null;
}
