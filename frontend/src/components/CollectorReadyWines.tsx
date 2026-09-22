import { useEffect, useState, type ReactNode } from "react";
import type { Locale, Wine } from "../types";
import { CollectorMaturity } from "./CollectorMaturity";
import { KeyPositionBottleVisual } from "./KeyPositionCardParts";
import { wineTone } from "./panelSupport";

export function CollectorReadyWines({ wines, locale, canShowPhotos, onOpen, children }: {
  wines: Wine[]; locale: Locale; canShowPhotos: boolean; onOpen: (wine: Wine) => void; children: ReactNode;
}) {
  const [desktop, setDesktop] = useState(() => window.matchMedia("(min-width: 901px)").matches);
  const [page, setPage] = useState(0);
  useEffect(() => {
    const media = window.matchMedia("(min-width: 901px)");
    const update = () => setDesktop(media.matches);
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);
  if (!desktop) return <>{children}</>;
  const currentPage = Math.min(page, Math.max(0, Math.ceil(wines.length / 2) - 1));
  const start = currentPage * 2;
  const visible = wines.slice(start, start + 2);
  const it = locale === "it";
  return <div className="collector-ready-wines" role="region" aria-label={it ? "Selezione da bere ora" : "Ready-to-drink selection"}>
    <div className={`collector-ready-grid${visible.length === 1 ? " collector-ready-single" : ""}`}>
      {visible.map(wine => <button type="button" className="collector-ready-wine" key={wine.id} onClick={() => onOpen(wine)}>
        <KeyPositionBottleVisual photoUrl={canShowPhotos ? wine.photo_thumbnail_url || wine.photo_detail_url : ""} detailUrl={canShowPhotos ? wine.photo_detail_url : undefined} sizes="107px" tone={wineTone(wine.type)} />
        <span className="collector-ready-copy"><strong>{wine.name}</strong><span>{[wine.producer, wine.vintage].filter(Boolean).join(" · ")}</span><CollectorMaturity wine={wine} locale={locale} compact /></span>
      </button>)}
    </div>
    {wines.length > 2 ? <nav className="collector-ready-controls" aria-label={it ? "Sfoglia i vini da bere" : "Browse ready wines"}>
      <button type="button" disabled={currentPage === 0} onClick={() => setPage(currentPage - 1)} aria-label={it ? "Vini precedenti" : "Previous wines"}>‹</button>
      <span aria-live="polite">{start + 1}–{start + visible.length} / {wines.length}</span>
      <button type="button" disabled={start + 2 >= wines.length} onClick={() => setPage(currentPage + 1)} aria-label={it ? "Vini successivi" : "Next wines"}>›</button>
    </nav> : null}
  </div>;
}
