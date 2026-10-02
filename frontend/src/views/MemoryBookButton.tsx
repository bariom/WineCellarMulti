import { lazy, Suspense, useState } from "react";
import type { Locale } from "../types";
import { AppIcon } from "../components/AppIcon";

const MemoryBook = lazy(() => import("./MemoryBook"));

export default function MemoryBookButton({ locale }: { locale: Locale }) {
  const [open, setOpen] = useState(false);
  return <div className="tasting-memory-book-entry">
    <button type="button" className="secondary" onClick={() => setOpen(true)}><AppIcon name="camera" />{locale === "it" ? "Momenti · Sfoglia i ricordi" : "Moments · Browse memories"}</button>
    {open ? <Suspense fallback={<p role="status">{locale === "it" ? "Caricamento…" : "Loading…"}</p>}><MemoryBook locale={locale} onClose={() => setOpen(false)} /></Suspense> : null}
  </div>;
}
