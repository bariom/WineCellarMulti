import { useEffect, useId, useState, type ReactNode } from "react";
import type { Locale, Wine } from "../types";
import { formatBottleCount, wineIdealWindowStart, winePriorityDrinkEnd } from "../domain/cellar";
import { KeyPositionBottleVisual } from "./KeyPositionCardParts";
import { CollectorMaturity } from "./CollectorMaturity";
import { wineTone } from "./panelSupport";
import { FeaturedWineDetails, featuredCaption, type FeaturedWine } from "./FeaturedWineDetails";

export function CollectorDashboard({ children, wines, featured, ready, recent, locale, canShowPhotos, onOpen }: {
  children: ReactNode; wines: Wine[]; featured: FeaturedWine[];
  ready: Wine[]; recent: Wine[]; locale: Locale; canShowPhotos: boolean; onOpen: (wine: Wine) => void;
}) {
  const [view, setView] = useState("wines");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = featured.find(item => item.wine.id === selectedId);
  const [mobile, setMobile] = useState(() => window.matchMedia("(max-width: 900px)").matches);
  useEffect(() => {
    const media = window.matchMedia("(max-width: 900px)");
    const update = () => { setMobile(media.matches); if (!media.matches) setSelectedId(null); };
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);
  const id = useId();
  const it = locale === "it";
  const tabs = [{ id: "wines", label: it ? "Vini" : "Wines" }, { id: "priorities", label: it ? "Priorità" : "Priorities" }, { id: "collection", label: it ? "Collezione" : "Collection" }];
  function gallery(title: string, items: Wine[], meta: (wine: Wine) => string, highlights = false) {
    return <section className="collector-mobile-gallery" aria-label={title}>
      <header><h2>{title}</h2><span>{items.length} {it ? "vini" : "wines"}</span></header>
      {items.length ? <div className="collector-photo-rail" role="list" aria-label={title}>
        {items.map(wine => <div role="listitem" key={wine.id}>
          <button type="button" aria-haspopup={highlights ? "dialog" : undefined} onClick={() => highlights ? setSelectedId(wine.id) : onOpen(wine)}>
            <KeyPositionBottleVisual photoUrl={canShowPhotos ? wine.photo_thumbnail_url || wine.photo_detail_url : ""} detailUrl={canShowPhotos ? wine.photo_detail_url : undefined} sizes="147px" tone={wineTone(wine.type)} />
            <strong>{wine.name}</strong>
            <span>{[wine.producer, wine.vintage].filter(Boolean).join(" · ")}</span>
            <small>{meta(wine)}</small>
            {highlights ? <CollectorMaturity wine={wine} locale={locale} compact /> : null}
            {highlights ? <span className="featured-wine-discover">{it ? "Scopri perché" : "Discover why"} →</span> : null}
          </button>
        </div>)}
      </div> : <p>{it ? "Nessun vino in questa selezione." : "No wines in this selection."}</p>}
    </section>;
  }
  return <div className="collector-dashboard-layout" data-mobile-view={view}>
    <header className="collector-editorial-masthead">
      <div><p>{it ? "IL TACCUINO DEL COLLEZIONISTA" : "THE COLLECTOR’S JOURNAL"}</p><h2>{it ? "Il tempo, in bottiglia." : "Time, bottled."}</h2></div>
      <span>{formatBottleCount(wines.reduce((sum, wine) => sum + wine.quantity, 0), locale)} {it ? "bottiglie" : "bottles"}<br />{wines.length} {it ? "vini nella tua collezione" : "wines in your collection"}</span>
    </header>
    <div className="collector-mobile-navigation">
      <p className="eyebrow">{it ? "La tua collezione" : "Your collection"}</p>
      <div className="collector-mobile-heading"><h2>{it ? "La mia cantina" : "My cellar"}</h2><span>{formatBottleCount(wines.reduce((sum, wine) => sum + wine.quantity, 0), locale)} {it ? "bott." : "btl."} · {wines.length} {it ? "vini" : "wines"}</span></div>
      <div role="tablist" aria-label={it ? "Dashboard collezionista" : "Collector dashboard"}>
        {tabs.map((tab, index) => <button type="button" role="tab" key={tab.id} id={`${id}-${tab.id}`} aria-controls={`${id}-panel`} aria-selected={view === tab.id} tabIndex={view === tab.id ? 0 : -1}
          onClick={() => setView(tab.id)} onKeyDown={event => {
            const next = event.key === "ArrowRight" ? (index + 1) % tabs.length : event.key === "ArrowLeft" ? (index + tabs.length - 1) % tabs.length : event.key === "Home" ? 0 : event.key === "End" ? tabs.length - 1 : null;
            if (next === null) return;
            event.preventDefault(); setView(tabs[next].id); document.getElementById(`${id}-${tabs[next].id}`)?.focus();
          }}>{tab.label}</button>)}
      </div>
    </div>
    <div className="collector-dashboard-content" id={`${id}-panel`} role={mobile ? "tabpanel" : undefined} aria-labelledby={mobile ? `${id}-${view}` : undefined}>
      <div className="collector-mobile-photos">
        {view === "wines" ? <>
          {gallery(it ? "In primo piano" : "Highlights", featured.map(item => item.wine), wine => {
            const item = featured.find(item => item.wine.id === wine.id)!;
            const caption = featuredCaption(item, locale);
            return `${caption.label} · ${caption.metric}`;
          }, true)}
          {gallery(it ? "Da bere ora" : "Ready to drink", ready, wine => `${wineIdealWindowStart(wine)}–${winePriorityDrinkEnd(wine)} · ${formatBottleCount(wine.quantity, locale)} ${it ? "bott." : "btl."}`)}
          {gallery(it ? "Ultimi arrivi" : "Recent arrivals", recent, wine => wine.created_at ? new Intl.DateTimeFormat(it ? "it-CH" : "en-GB").format(new Date(wine.created_at)) : `${formatBottleCount(wine.quantity, locale)} ${it ? "bott." : "btl."}`)}
        </> : view === "priorities" ? gallery(it ? "Da bere ora" : "Ready to drink", ready, wine => `${wineIdealWindowStart(wine)}–${winePriorityDrinkEnd(wine)} · ${formatBottleCount(wine.quantity, locale)} ${it ? "bott." : "btl."}`) : null}
      </div>
      {children}
    </div>
    {mobile && selected ? <FeaturedWineDetails item={selected} locale={locale} onClose={() => setSelectedId(null)} onOpen={onOpen} /> : null}
  </div>;
}
