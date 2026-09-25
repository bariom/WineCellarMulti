import { useEffect, useId, useState, type ReactNode } from "react";
import type { Locale, Wine } from "../types";
import { formatBottleCount, wineIdealWindowStart, winePriorityDrinkEnd } from "../domain/cellar";
import { KeyPositionBottleVisual } from "./KeyPositionCardParts";
import { FeaturedWineCard } from "./FeaturedWineCard";
import { RiservaBanner } from "./RiservaBanner";
import { ScrollGallery } from "./HorizontalScroll";
import { wineTone } from "./panelSupport";
import { FeaturedWineDetails, type FeaturedWine } from "./FeaturedWineDetails";

export function CollectorDashboard({ children, wines, featured, ready, recent, locale, canShowPhotos, showRiserva, onExploreRiserva, onOpen }: {
  children: ReactNode; wines: Wine[]; featured: FeaturedWine[];
  ready: Wine[]; recent: Wine[]; locale: Locale; canShowPhotos: boolean; onOpen: (wine: Wine) => void;
  showRiserva: boolean; onExploreRiserva: () => void;
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
  function gallery(title: string, items: Wine[], meta: (wine: Wine) => ReactNode) {
    return <ScrollGallery key={title} title={title} locale={locale} count={items.length} className="collector-mobile-gallery collector-mobile-arrivals">
        {items.map(wine => <div role="listitem" key={wine.id}>
          <button type="button" onClick={() => onOpen(wine)}>
            <KeyPositionBottleVisual photoUrl={canShowPhotos ? wine.photo_thumbnail_url || wine.photo_detail_url : ""} detailUrl={canShowPhotos ? wine.photo_detail_url : undefined} sizes="160px" tone={wineTone(wine.type)} />
            <strong>{wine.name}</strong>
            <span>{[wine.producer, wine.vintage].filter(Boolean).join(" · ")}</span>
            <small>{meta(wine)}</small>
          </button>
        </div>)}
    </ScrollGallery>;
  }
  return <div className="collector-dashboard-layout" data-mobile-view={view}>
    <header className="collector-editorial-masthead">
      <div><p>{it ? "IL TACCUINO DEL COLLEZIONISTA" : "THE COLLECTOR’S JOURNAL"}</p><h2>{it ? "Il tempo, in bottiglia." : "Time, bottled."}</h2></div>
      <span>{formatBottleCount(wines.reduce((sum, wine) => sum + wine.quantity, 0), locale)} {it ? "bottiglie" : "bottles"}<br />{wines.length} {it ? "vini nella tua collezione" : "wines in your collection"}</span>
    </header>
    <div className="collector-mobile-navigation">
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
          <ScrollGallery title={it ? "In primo piano" : "Highlights"} locale={locale} count={featured.length} className="collector-mobile-gallery collector-mobile-highlights">
            {featured.map(item => <div role="listitem" key={item.wine.id}>
              <FeaturedWineCard item={item} locale={locale} canShowPhotos={canShowPhotos} onDiscover={() => setSelectedId(item.wine.id)} />
            </div>)}
          </ScrollGallery>
          {showRiserva ? <RiservaBanner locale={locale} onExplore={onExploreRiserva} /> : null}
          {gallery(it ? "Ultimi arrivi" : "Recent arrivals", recent, wine => wine.created_at ? new Intl.DateTimeFormat(it ? "it-CH" : "en-GB").format(new Date(wine.created_at)) : `${formatBottleCount(wine.quantity, locale)} ${it ? "bott." : "btl."}`)}
        </> : view === "priorities" ? gallery(it ? "Da bere ora" : "Ready to drink", ready, wine => `${wineIdealWindowStart(wine)}–${winePriorityDrinkEnd(wine)} · ${formatBottleCount(wine.quantity, locale)} ${it ? "bott." : "btl."}`) : null}
      </div>
      {children}
    </div>
    {mobile && selected ? <FeaturedWineDetails item={selected} locale={locale} onClose={() => setSelectedId(null)} onOpen={onOpen} /> : null}
  </div>;
}
