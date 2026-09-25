import type { Locale } from "../types";
import { AppIcon } from "./AppIcon";
import { CollectorMaturity } from "./CollectorMaturity";
import { featuredCaption, featuredExplanation, type FeaturedWine } from "./FeaturedWineDetails";
import { KeyPositionBottleVisual } from "./KeyPositionCardParts";
import { wineTone } from "./panelSupport";

export function FeaturedWineCard({ item, locale, canShowPhotos, onDiscover }: {
  item: FeaturedWine; locale: Locale; canShowPhotos: boolean; onDiscover: () => void;
}) {
  const { wine } = item;
  const caption = featuredCaption(item, locale);
  return <button type="button" className="cellar-featured-wine" aria-haspopup="dialog" onClick={onDiscover}>
    <KeyPositionBottleVisual photoUrl={canShowPhotos ? wine.photo_thumbnail_url || wine.photo_detail_url : ""}
      detailUrl={canShowPhotos ? wine.photo_detail_url : undefined} sizes="(max-width: 480px) 140px, 220px" tone={wineTone(wine.type)} />
    <span className="cellar-featured-identity">
      <span className="cellar-featured-origin">{[wine.appellation, wine.region].filter(Boolean).join(" · ")}</span>
      <strong>{wine.name}</strong>
      <span className="cellar-featured-producer">{wine.producer}</span>
      <span className="cellar-featured-vintage">{wine.vintage || (locale === "it" ? "Senza annata" : "Non-vintage")}</span>
    </span>
    <small className="cellar-featured-metric"><span className="collector-highlight-label">{caption.label}</span><span className="collector-highlight-value">{caption.metric}</span></small>
    <CollectorMaturity wine={wine} locale={locale} compact />
    <span className="cellar-wine-insight">
      <AppIcon name="star" detailLevel="compact" />
      <span>{featuredExplanation(item, locale)}</span>
      <span className="featured-wine-discover">{locale === "it" ? "Scopri perché" : "Discover why"} <span aria-hidden="true">→</span></span>
    </span>
  </button>;
}
