import { lazy, Suspense, useState } from "react";
import type { PhotoLocation } from "../domain/photoLocation";
import type { Locale } from "../types";

const MemoryMap = lazy(() => import("./MemoryMap"));

export default function MemoryLocation({ location, locale }: { location: PhotoLocation; locale: Locale }) {
  const [open, setOpen] = useState(false);
  const it = locale === "it";
  return <div className="memory-location">
    <button type="button" className="secondary" aria-expanded={open} onClick={() => setOpen(value => !value)}>
      {open ? (it ? "Nascondi mappa" : "Hide map") : (it ? "Mostra luogo sulla mappa" : "Show place on map")}
    </button>
    {open ? <Suspense fallback={<p role="status">{it ? "Caricamento mappa…" : "Loading map…"}</p>}><MemoryMap location={location} locale={locale} /></Suspense> : null}
  </div>;
}
