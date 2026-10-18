import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { photoGps, withPhotoLocation, type PhotoLocation } from "../domain/photoLocation";
import MemoryLocation from "./MemoryLocation";
import type { Locale } from "../types";
import { AppIcon } from "./AppIcon";
import "./TastingMemoryPhoto.css";

const MemoryLocationPicker = lazy(() => import("./MemoryLocationPicker"));

/** `base` is the compressed JPEG without GPS, kept so a manually chosen place can be written into it. */
async function compactPhoto(file: File): Promise<{ value: string; base: string; location: PhotoLocation | null; redacted: boolean }> {
  if (file.size > 25_000_000) throw new Error("size");
  // The original-file picker deliberately accepts all files, so validate bytes
  // rather than trusting the extension or the MIME type supplied by Android.
  const header = new Uint8Array(await file.slice(0, 12).arrayBuffer());
  const jpeg = header[0] === 255 && header[1] === 216 && header[2] === 255;
  const png = [137, 80, 78, 71, 13, 10, 26, 10].every((byte, index) => header[index] === byte);
  const webp = String.fromCharCode(...header.slice(0, 4)) === "RIFF"
    && String.fromCharCode(...header.slice(8, 12)) === "WEBP";
  if (!jpeg && !png && !webp) throw new Error("format");
  const { location, redacted } = await photoGps(file);
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
      if ((value.length - value.indexOf(",") - 1) * .75 <= 199_800) return { value: withPhotoLocation(value, location), base: value, location, redacted };
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
  const original = useRef<HTMLInputElement>(null);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState("");
  // Where the memory's location comes from; null until a photo is chosen.
  const [place, setPlace] = useState<{ location: PhotoLocation | null; source: "photo" | "manual" | null; redacted: boolean; base: string } | null>(null);
  const [picking, setPicking] = useState(false);
  const preview = value === undefined ? existingUrl : value;
  async function choose(file?: File) {
    if (!file) return;
    setProcessing(true); onProcessingChange(true); setError("");
    try {
      const photo = await compactPhoto(file);
      onChange(photo.value);
      setPlace({ location: photo.location, source: photo.location ? "photo" : null, redacted: photo.redacted, base: photo.base });
      setPicking(false);
    }
    catch { setError(it ? "Foto non leggibile o troppo grande. Scegli un JPEG, PNG o WebP fino a 25 MB." : "Photo unreadable or too large. Choose a JPEG, PNG or WebP up to 25 MB."); }
    finally { setProcessing(false); onProcessingChange(false); }
  }
  function setManualPlace(location: PhotoLocation | null) {
    if (!place) return;
    // The server reads the place from the upload's EXIF GPS, exactly as for a photo that kept it.
    onChange(withPhotoLocation(place.base, location));
    setPlace({ ...place, location, source: location ? "manual" : null });
    setPicking(false);
  }
  const coordinates = (location: PhotoLocation) => `${location.latitude.toFixed(5)}, ${location.longitude.toFixed(5)}`;
  const locationUnknown = Boolean(preview && value && place && !place.location);
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
      <button type="button" className="secondary tasting-memory-original" disabled={disabled || processing} onClick={() => original.current?.click()}>{it ? "Carica da file" : "Upload from files"}</button>
    </div>
    {preview ? <div className="tasting-memory-footer"><small><AppIcon name="tasting" />{it ? "Foto allegata alla bevuta" : "Photo attached to the tasting"}</small><button type="button" className="tasting-memory-remove" disabled={disabled || processing} onClick={() => { onChange(""); setPlace(null); setPicking(false); setError(""); }}><AppIcon name="delete" />{it ? "Rimuovi foto" : "Remove photo"}</button></div> : null}
    <input ref={camera} type="file" accept="image/jpeg,image/png,image/webp" capture="environment" hidden aria-label={it ? "Scatta foto ricordo" : "Take memory photo"} onChange={event => { void choose(event.target.files?.[0]); event.target.value = ""; }} />
    <input ref={gallery} type="file" accept="image/jpeg,image/png,image/webp" hidden aria-label={it ? "Scegli foto ricordo" : "Choose memory photo"} onChange={event => { void choose(event.target.files?.[0]); event.target.value = ""; }} />
    {/* No image-only accept filter: offer the general file chooser alongside the
        Android photo picker, which can redact GPS before the browser sees it. */}
    <input ref={original} type="file" hidden aria-label={it ? "Carica file originale della foto ricordo" : "Upload original memory photo file"} onChange={event => { void choose(event.target.files?.[0]); event.target.value = ""; }} />
    {preview && place?.source === "photo" ? <small>{it ? "Posizione della foto inclusa nel ricordo. Potrai mostrarla sulla mappa." : "Photo location included in this memory. You can view it on the map."}</small> : null}
    {preview && place?.source === "manual" && place.location ? <div className="tasting-memory-place">
      <small>{it ? `Luogo indicato a mano incluso nel ricordo (${coordinates(place.location)}).` : `Manually set place included in this memory (${coordinates(place.location)}).`}</small>
      <div><button type="button" className="secondary" disabled={disabled || processing} onClick={() => setPicking(true)}>{it ? "Cambia luogo" : "Change place"}</button>
        <button type="button" className="secondary" disabled={disabled || processing} onClick={() => setManualPlace(null)}>{it ? "Rimuovi luogo" : "Remove place"}</button></div>
    </div> : null}
    {locationUnknown ? <div className="tasting-memory-place">
      <small role="status">{place!.redacted
        ? (it ? "Il telefono ha rimosso la posizione da questa foto prima di consegnarla al browser, quindi non si può leggere. Puoi indicare il luogo a mano."
          : "Your phone removed the location from this photo before handing it to the browser, so it cannot be read. You can set the place manually.")
        : (it ? "GPS non rilevato nel file ricevuto. Se la foto originale ha la posizione, prova Carica da file (su iPhone dall’app File); altrimenti indica il luogo a mano."
          : "No GPS detected in the received file. If the original photo has a location, try Upload from files (on iPhone, from the Files app); otherwise set the place manually.")}</small>
      {!picking ? <div><button type="button" className="secondary" disabled={disabled || processing} onClick={() => setPicking(true)}><AppIcon name="location" />{it ? "Indica il luogo" : "Set the place"}</button></div> : null}
    </div> : null}
    {picking && place ? <Suspense fallback={<small role="status">{it ? "Caricamento mappa…" : "Loading map…"}</small>}>
      <MemoryLocationPicker locale={locale} initial={place.location} onConfirm={setManualPlace} onCancel={() => setPicking(false)} />
    </Suspense> : null}
    {processing ? <small role="status">{it ? "Preparazione foto…" : "Preparing photo…"}</small> : null}
    {error ? <p role="alert">{error}</p> : null}
  </section>;
}

export function MemoryPhotoViewer({ url, locale, wineName, date, onClose }: {
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

export function TastingMemoryPhoto({ url, locale, wineName, consumedAt, note, location }: {
  url?: string; locale: Locale; wineName?: string; consumedAt?: string; note?: string; location?: PhotoLocation | null;
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
    {location ? <MemoryLocation location={location} locale={locale} /> : null}
    {open ? <MemoryPhotoViewer url={url} locale={locale} wineName={wineName} date={date} onClose={() => setOpen(false)} /> : null}
  </figure> : null;
}
