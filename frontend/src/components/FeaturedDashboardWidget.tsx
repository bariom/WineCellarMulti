import { useState } from "react";
import type { Locale, Wine } from "../types";
import { FeaturedWineDetails, featuredCaption, type FeaturedWine } from "./FeaturedWineDetails";
import { KeyPositionBottleVisual } from "./KeyPositionCardParts";
import { wineTone } from "./panelSupport";

export default function FeaturedDashboardWidget({ items, locale, canShowPhotos, onOpen }: {
  items: FeaturedWine[]; locale: Locale; canShowPhotos: boolean; onOpen: (wine: Wine) => void;
}) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = items.find(item => item.wine.id === selectedId);
  const it = locale === "it";
  return <article className="dashboard-card personal-featured-card">
    <div className="card-heading"><div><span>{it ? "La tua collezione" : "Your collection"}</span><h2>{it ? "Bottiglie in primo piano" : "Featured bottles"}</h2></div><strong>{items.length}</strong></div>
    <div className="personal-featured-list">{items.map(item => {
      const caption = featuredCaption(item, locale);
      return <button type="button" key={item.wine.id} aria-haspopup="dialog" onClick={() => setSelectedId(item.wine.id)}>
        <KeyPositionBottleVisual photoUrl={canShowPhotos ? item.wine.photo_thumbnail_url || item.wine.photo_detail_url : ""} tone={wineTone(item.wine.type)} />
        <span><strong>{item.wine.name}</strong><small>{[item.wine.producer, item.wine.vintage].filter(Boolean).join(" · ")}</small><small>{caption.label}</small><b>{caption.metric}</b><small>{it ? "Scopri perché" : "Discover why"} →</small></span>
      </button>;
    })}</div>
    {!items.length && <p className="empty-state">{it ? "Nessun vino in questa selezione." : "No wines in this selection."}</p>}
    {selected && <FeaturedWineDetails item={selected} locale={locale} onClose={() => setSelectedId(null)} onOpen={wine => { setSelectedId(null); onOpen(wine); }} />}
  </article>;
}
