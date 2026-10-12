import { useEffect, useRef, useState } from "react";
import type { Locale } from "../types";

export default function PurchaseImagePreview({ url, file, locale }: { url: string; file: File; locale: Locale }) {
  const it = locale === "it";
  const scroller = useRef<HTMLDivElement>(null);
  const [zoom, setZoom] = useState(100);
  const [failed, setFailed] = useState(false);

  useEffect(() => { if (zoom === 100) scroller.current?.scrollTo(0, 0); }, [zoom]);

  return <div className="purchase-image-preview purchase-pdf-preview">
    <div className="purchase-pdf-toolbar">
      <strong>{it ? "Immagine" : "Image"} &middot; {file.name}</strong>
      {!failed ? <div className="purchase-pdf-zoom" role="group" aria-label={it ? "Zoom documento" : "Document zoom"}>
        <button type="button" className="secondary" disabled={zoom <= 100} onClick={() => setZoom(value => Math.max(100, value - 25))} aria-label={it ? "Riduci zoom" : "Zoom out"}>−</button>
        <span aria-live="polite">{zoom}%</span>
        <button type="button" className="secondary" disabled={zoom >= 300} onClick={() => setZoom(value => Math.min(300, value + 25))} aria-label={it ? "Aumenta zoom" : "Zoom in"}>+</button>
        <button type="button" className="secondary" disabled={zoom === 100} onClick={() => setZoom(100)}>{it ? "Adatta" : "Fit"}</button>
      </div> : null}
    </div>
    {failed ? <p role="status">{it ? "Anteprima non disponibile." : "Preview unavailable."}</p> : <div ref={scroller} className="purchase-pdf-viewport" role="region" aria-label={it ? "Anteprima documento scorrevole" : "Scrollable document preview"} tabIndex={0}>
      <img src={url} alt={it ? "Ricevuta originale" : "Original receipt"} style={{ width: `${zoom}%` }} onError={() => setFailed(true)} />
    </div>}
  </div>;
}
