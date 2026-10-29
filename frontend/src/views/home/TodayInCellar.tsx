import { useEffect, useState } from "react";
import { AppIcon, type AppIconName } from "../../components/AppIcon";
import { formatMoney, wineTone } from "../../components/panelSupport";
import { winePriorityDrinkEnd, wineUnitValue } from "../../domain/cellar";
import { tasteTraitLabel } from "../../domain/tasteStrength";
import { api } from "../../services/api";
import type { Locale, TasteMatch, TasteMatchBatchResponse, TasteProfileCollection, TastePreferenceEntry, Wine } from "../../types";
import "../../components/DashboardSummaryWidget.css";
import "./TodayInCellar.css";

type TodayInCellarProps = {
  locale: Locale;
  householdId: string | undefined;
  currentYear: number;
  /** Ready to drink, least recently drunk first, then by closing window. */
  readyWines: Wine[];
  /** Every wine with bottles in the cellar, to see which favourites ran out. */
  availableWines: Wine[];
  bottleCount: (wine: Wine) => number;
  budgetChf: number | null;
  canShowPhotos: boolean;
  canGenerateAi: boolean;
  /** Shown when there is nothing to suggest today. */
  emptyLabel: string;
  footerLabel: string;
  reasonFor: (wine: Wine) => string;
  onOpenWine: (wine: Wine) => void;
  onPairing: (wine: Wine) => void;
  onOpenBuying: () => void;
};

type FavouriteKind = "producers" | "regions" | "appellations" | "countries" | "grapes";

// How many ready wines are scored against the taste profile: enough to find a
// good match, few enough for one request.
const TONIGHT_POOL = 40;

const FAVOURITE_BONUS: Record<FavouriteKind, number> = {
  producers: 0.06, appellations: 0.05, regions: 0.04, grapes: 0.03, countries: 0.02,
};

const normalized = (value: string | null | undefined) => (value || "").replace(/\s*[([][^)\]]*[)\]]/g, "").trim().toLocaleLowerCase();

function favouriteValues(wine: Wine, kind: FavouriteKind): string[] {
  if (kind === "grapes") return (wine.grapes || []).map((grape) => normalized(grape.name)).filter(Boolean);
  const value = kind === "producers" ? wine.producer : kind === "regions" ? wine.region : kind === "appellations" ? wine.appellation : wine.vineyard_country;
  return value ? [normalized(value)] : [];
}

/** Closeness to the taste profile (0..1), pulled toward neutral while the estimate is uncertain. */
function affinity(match: TasteMatch | undefined) {
  if (!match || match.score === null) return 0.5;
  return 0.5 + (match.score - 0.5) * Math.min(1, match.confidence / 0.5);
}

/** The bottle photo when there is one, otherwise a small silhouette in the wine's colour. */
function BottleThumbnail({ wine, canShowPhotos }: { wine: Wine; canShowPhotos: boolean }) {
  const [failed, setFailed] = useState(false);
  const photo = canShowPhotos && !failed ? wine.photo_thumbnail_url || wine.photo_detail_url : "";
  return (
    <div className={`today-in-cellar-bottle tone-${wineTone(wine.type)}`} aria-hidden="true">
      {photo ? <img src={photo} alt="" loading="lazy" decoding="async" onError={() => setFailed(true)} /> : (
        <svg viewBox="0 0 24 64">
          <path d="M9 2h6v14c0 3 5 6 5 12v32a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V28c0-6 5-9 5-12Z" />
          <rect x="6" y="34" width="12" height="14" rx="1" />
        </svg>
      )}
    </div>
  );
}

/** "La tua cantina oggi" (a personal dashboard widget): three reasoned suggestions, each one tap from acting on it. */
export default function TodayInCellar({
  locale, householdId, currentYear, readyWines, availableWines, bottleCount, budgetChf,
  canShowPhotos, canGenerateAi, emptyLabel, footerLabel, reasonFor, onOpenWine, onPairing, onOpenBuying,
}: TodayInCellarProps) {
  const it = locale === "it";
  const [favourites, setFavourites] = useState<Partial<Record<FavouriteKind, TastePreferenceEntry[]>>>({});
  const [matches, setMatches] = useState<Record<string, TasteMatch>>({});

  // Past its window or closing within a year: the bottle that should not wait.
  const watchWine = [...readyWines]
    .filter((wine) => {
      const end = winePriorityDrinkEnd(wine);
      return Boolean(end && end <= currentYear + 1);
    })
    .sort((first, second) => (winePriorityDrinkEnd(first) || 9999) - (winePriorityDrinkEnd(second) || 9999))[0];
  const tonightPool = readyWines
    .filter((wine) => wine.id !== watchWine?.id)
    .filter((wine) => !budgetChf || wineUnitValue(wine) <= budgetChf)
    .slice(0, TONIGHT_POOL);
  const poolKey = tonightPool.map((wine) => wine.id).join(",");

  useEffect(() => {
    let cancelled = false;
    api<TasteProfileCollection>("/api/v1/taste-profile/me")
      .then((collection) => {
        if (cancelled) return;
        const attributes = collection.profiles.find((profile) => profile.category === "global")?.attributes ?? {};
        setFavourites({
          producers: attributes.preferred_producers, regions: attributes.preferred_regions,
          appellations: attributes.preferred_appellations, countries: attributes.preferred_countries,
          grapes: attributes.preferred_grapes,
        });
      })
      .catch(() => undefined);
    return () => { cancelled = true; };
  }, [householdId]);

  useEffect(() => {
    if (!poolKey) return;
    let cancelled = false;
    api<TasteMatchBatchResponse>("/api/v1/taste-profile/wines/matches", {
      method: "POST",
      body: JSON.stringify({ wine_ids: poolKey.split(",") }),
    })
      .then((response) => { if (!cancelled) setMatches(response.matches); })
      .catch(() => undefined);
    return () => { cancelled = true; };
  }, [poolKey]);

  const favouriteHit = (wine: Wine) => {
    for (const kind of Object.keys(FAVOURITE_BONUS) as FavouriteKind[]) {
      const values = favouriteValues(wine, kind);
      const entry = (favourites[kind] || []).find(([name]) => values.includes(normalized(name)));
      if (entry) return { kind, name: entry[0] };
    }
    return null;
  };
  const tonightScore = (wine: Wine, index: number) => {
    const hit = favouriteHit(wine);
    // The ready list already favours rotation and urgency: keep a little of that order.
    return affinity(matches[wine.id]) + (hit ? FAVOURITE_BONUS[hit.kind] : 0) - index * 0.002;
  };
  const tonightWine = tonightPool
    .map((wine, index) => ({ wine, score: tonightScore(wine, index) }))
    .sort((first, second) => second.score - first.score)[0]?.wine;

  const favouriteLabel = (kind: FavouriteKind) => ({
    producers: it ? "tra i tuoi produttori preferiti" : "one of your favourite producers",
    regions: it ? "tra le tue regioni preferite" : "one of your favourite regions",
    appellations: it ? "tra le tue denominazioni preferite" : "one of your favourite appellations",
    countries: it ? "tra i tuoi paesi preferiti" : "one of your favourite countries",
    grapes: it ? "tra i tuoi vitigni preferiti" : "one of your favourite grapes",
  })[kind];

  const favouriteTitle = (kind: FavouriteKind) => ({
    producers: it ? "Produttore preferito" : "Favourite producer",
    regions: it ? "Regione preferita" : "Favourite region",
    appellations: it ? "Denominazione preferita" : "Favourite appellation",
    countries: it ? "Paese preferito" : "Favourite country",
    grapes: it ? "Vitigno preferito" : "Favourite grape",
  })[kind];

  const tonightReason = (wine: Wine) => {
    const match = matches[wine.id];
    const hit = favouriteHit(wine);
    const parts: string[] = [];
    if (match?.score != null && match.confidence >= 0.3 && match.matching_traits.length) {
      const traits = match.matching_traits.slice(0, 2).map((trait) => tasteTraitLabel(trait, locale)).join(it ? " e " : " and ");
      parts.push(it ? `In sintonia con il tuo gusto per ${traits}` : `In tune with your taste for ${traits}`);
    } else if (hit) {
      parts.push(`${hit.name}, ${favouriteLabel(hit.kind)}`);
    } else {
      parts.push(reasonFor(wine));
    }
    if (budgetChf) parts.push(it ? `entro il tuo budget di ${formatMoney(budgetChf, "CHF", locale)}` : `within your ${formatMoney(budgetChf, "CHF", locale)} budget`);
    return parts.join(" · ");
  };

  const watchReason = (wine: Wine) => {
    const end = winePriorityDrinkEnd(wine) || currentYear;
    const bottles = bottleCount(wine);
    const left = bottles > 1 ? (it ? ` · ${bottles} bottiglie da godere` : ` · ${bottles} bottles to enjoy`) : "";
    if (end < currentYear) return (it ? `Finestra di beva chiusa nel ${end}: meglio aprirlo presto` : `Drinking window closed in ${end}: best opened soon`) + left;
    if (end === currentYear) return (it ? "La finestra di beva si chiude quest'anno" : "Its drinking window closes this year") + left;
    return (it ? `Finestra di beva fino al ${end}` : `Drinking window until ${end}`) + left;
  };

  // A favourite with at least two bottles behind it that the cellar has run out of, or nearly.
  const collection = (() => {
    const kinds: FavouriteKind[] = ["regions", "producers", "appellations", "countries"];
    const candidates = kinds.flatMap((kind) => (favourites[kind] || [])
      .filter((entry) => Number(entry[2] || 0) >= 2)
      .map((entry) => ({
        kind, entry,
        left: availableWines
          .filter((wine) => favouriteValues(wine, kind).includes(normalized(entry[0])))
          .reduce((total, wine) => total + bottleCount(wine), 0),
      })));
    return candidates.find((candidate) => candidate.left === 0) ?? candidates.find((candidate) => candidate.left === 1) ?? null;
  })();

  const cards: Array<{ key: string; icon: AppIconName; kicker: string; wine?: Wine; title: string; subtitle: string; reason: string; actions: Array<{ label: string; onClick: () => void; primary?: boolean }> }> = [];
  const wineSubtitle = (wine: Wine) => [wine.producer, wine.vintage].filter(Boolean).join(" · ");
  if (tonightWine) cards.push({
    key: "tonight", icon: "glass-sparkle", kicker: it ? "Per stasera" : "For tonight", wine: tonightWine,
    title: tonightWine.name, subtitle: wineSubtitle(tonightWine), reason: tonightReason(tonightWine),
    actions: [
      { label: it ? "Apri la scheda" : "Open the wine", onClick: () => onOpenWine(tonightWine), primary: true },
      ...(canGenerateAi ? [{ label: it ? "Abbina un piatto" : "Pair a dish", onClick: () => onPairing(tonightWine) }] : []),
    ],
  });
  if (watchWine) cards.push({
    key: "watch", icon: "calendar", kicker: it ? "Da tenere d'occhio" : "Keep an eye on", wine: watchWine,
    title: watchWine.name, subtitle: wineSubtitle(watchWine), reason: watchReason(watchWine),
    actions: [{ label: it ? "Apri la scheda" : "Open the wine", onClick: () => onOpenWine(watchWine), primary: true }],
  });
  if (collection) {
    const [name, , drunk, average] = collection.entry;
    const record = it
      ? `${drunk} bevute${average ? `, media ${average.toLocaleString("it-CH", { maximumFractionDigits: 1 })}/6` : ""}`
      : `${drunk} drunk${average ? `, ${average.toLocaleString("en-GB", { maximumFractionDigits: 1 })}/6 on average` : ""}`;
    cards.push({
      key: "collection", icon: "buying", kicker: it ? "Per la tua collezione" : "For your collection",
      title: name, subtitle: favouriteTitle(collection.kind),
      reason: collection.left === 0
        ? (it ? `Ti è piaciuto spesso (${record}) e in cantina non ne resta nessuna` : `You have often enjoyed it (${record}) and none is left in the cellar`)
        : (it ? `Ti è piaciuto spesso (${record}) e resta una sola bottiglia` : `You have often enjoyed it (${record}) and only one bottle is left`),
      actions: [{ label: it ? "Cerca cosa comprare" : "Find what to buy", onClick: onOpenBuying, primary: true }],
    });
  }
  const today = new Date().toLocaleDateString(it ? "it-CH" : "en-GB", { weekday: "long", day: "numeric", month: "long" });
  return (
    <section className="dashboard-summary today-in-cellar" aria-labelledby="today-in-cellar-title">
      <header>
        <p>{today}</p>
        <h3 id="today-in-cellar-title">{it ? "La tua cantina oggi" : "Your cellar today"}</h3>
      </header>
      <div className="summary-body">
      {!cards.length ? <p className="today-in-cellar-empty">{emptyLabel}</p> : <div className="today-in-cellar-cards">
        {cards.map((card) => (
          <article key={card.key} className={`today-in-cellar-card today-in-cellar-card--${card.key}${card.wine ? " has-bottle" : ""}`}>
            {card.wine ? <BottleThumbnail wine={card.wine} canShowPhotos={canShowPhotos} /> : null}
            <p className="today-in-cellar-kicker"><AppIcon name={card.icon} variant="feature" tone="accent" size="1rem" />{card.kicker}</p>
            <div className="today-in-cellar-identity">
              <h3>{card.title}</h3>
              {card.subtitle ? <small>{card.subtitle}</small> : null}
              <p>{card.reason}</p>
            </div>
            <div className="today-in-cellar-actions">
              {card.actions.map((action) => (
                <button key={action.label} type="button" className={action.primary ? "" : "secondary"} onClick={action.onClick}>{action.label}</button>
              ))}
            </div>
          </article>
        ))}
      </div>}
      </div>
      <footer><p>{footerLabel}</p></footer>
    </section>
  );
}
