import { lazy, Suspense, useState } from "react";
import type { Locale } from "../types";
import { AppIcon } from "../components/AppIcon";
import "./MemoryBookButton.css";
import PremiumMemoriesNotice from "../components/PremiumMemoriesNotice";

const MemoryBook = lazy(() => import("./MemoryBook"));

export default function MemoryBookButton({ locale, home = false, onRecord, canAccess, onActivate }: { locale: Locale; home?: boolean; onRecord?: () => void; canAccess: boolean; onActivate: () => void }) {
  const [open, setOpen] = useState(false);
  const it = locale === "it";
  if (!canAccess) return <section className={home ? "home-moments-entry is-premium-locked" : "tasting-memory-book-entry"} aria-label={it ? "Momenti" : "Moments"}>
    <PremiumMemoriesNotice locale={locale} onActivate={onActivate} />
    {home && onRecord ? <div className="home-moments-actions"><button type="button" aria-haspopup="dialog" onClick={onRecord}><AppIcon name="tasting" />{it ? "Registra una bevuta" : "Record a tasting"}</button></div> : null}
  </section>;
  const browse = <button type="button" className="secondary" aria-haspopup="dialog" onClick={() => setOpen(true)}><AppIcon name="camera" />{home ? (it ? "Sfoglia i ricordi" : "Browse memories") : (it ? "Momenti · Sfoglia i ricordi" : "Moments · Browse memories")}</button>;
  return <section className={home ? "home-moments-entry" : "tasting-memory-book-entry"} aria-label={it ? "Momenti" : "Moments"}>
    {home ? <>
      <div className="home-moments-copy">
        <p className="home-moments-kicker">{it ? "Vino, amici e storie" : "Wine, friends and stories"}</p>
        <h2>{it ? "Momenti" : "Moments"}</h2>
        <p>{it ? "Ogni bevuta ha una storia. Conservala con una foto, le persone e l’occasione." : "Every tasting has a story. Keep it with a photo, the people and the occasion."}</p>
      </div>
      <div className="home-moments-actions">
        {onRecord ? <button type="button" aria-haspopup="dialog" onClick={onRecord}><AppIcon name="tasting" />{it ? "Registra una bevuta" : "Record a tasting"}</button> : null}
        {browse}
      </div>
    </> : browse}
    {open ? <Suspense fallback={<p role="status">{locale === "it" ? "Caricamento…" : "Loading…"}</p>}><MemoryBook locale={locale} onClose={() => setOpen(false)} /></Suspense> : null}
  </section>;
}
