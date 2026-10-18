import type { Wine } from "../types";
import { isWinePhysicallyInCellar } from "./cellar";

export type FeaturedReason =
  | "increase" | "owned" | "position" | "personal" | "shared" | "value"
  | "closing" | "peak" | "overdue"
  | "favorite" | "best_tasting" | "rediscover";

export const MAX_FEATURED_WINES = 8;
/** Personal stars or tasting score (0-6) from which a wine counts as loved. */
export const LOVED_RATING = 4;
/** A loved wine not opened for this long is worth rediscovering. */
export const REDISCOVER_AFTER_DAYS = 365;

const MATURITY_REASONS: ReadonlySet<FeaturedReason> = new Set(["closing", "peak", "overdue"]);
const TASTE_REASONS: ReadonlySet<FeaturedReason> = new Set(["favorite", "best_tasting", "rediscover"]);
export const isMaturityReason = (reason: FeaturedReason) => MATURITY_REASONS.has(reason);
export const isTasteReason = (reason: FeaturedReason) => TASTE_REASONS.has(reason);

export const hasDrinkWindow = (wine: Wine) => Boolean(wine.drink_from && wine.drink_to && wine.drink_from <= wine.drink_to);
export const bestTastingRating = (wine: Wine) => Number(wine.tasting_summary?.best_rating || 0);
export function daysSinceLastTasting(wine: Wine, today: Date) {
  const last = wine.tasting_summary?.last_consumed_at;
  if (!last) return null;
  const timestamp = new Date(`${last.slice(0, 10)}T00:00:00`).getTime();
  return Number.isFinite(timestamp) ? Math.floor((today.getTime() - timestamp) / 86_400_000) : null;
}

type SelectionInput = {
  wines: Wine[];
  today: Date;
  /** Bottle value of the whole position. */
  positionValue: (wine: Wine) => number;
  /** Position value attributable to the current user. */
  ownedValue: (wine: Wine) => number;
  sharePct: (wine: Wine) => number;
  /** Value change in percent, or null when not comparable. */
  increasePct: (wine: Wine) => number | null;
  limit?: number;
};

/**
 * Picks the wines of the "bottle of the day" carousel, one reason each, alternating value, maturity and
 * personal taste so the carousel covers different angles. Value reasons keep their strict "top" meaning
 * (a wine already picked is not replaced by the runner-up); maturity and taste reasons take the best
 * candidate not yet picked, since their wording never claims first place.
 */
export function selectFeaturedWines({ wines, today, positionValue, ownedValue, sharePct, increasePct, limit = MAX_FEATURED_WINES }: SelectionInput) {
  const year = today.getFullYear();
  const stock = wines.filter((wine) => wine.quantity > 0);
  const openable = stock.filter(isWinePhysicallyInCellar);
  const byValue = (first: Wine, second: Wine) => positionValue(second) - positionValue(first);
  const byOwned = (first: Wine, second: Wine) => ownedValue(second) - ownedValue(first);
  const loved = (wine: Wine) => Math.max(Number(wine.rating || 0), bestTastingRating(wine)) >= LOVED_RATING;
  const lovedFirst = (first: Wine, second: Wine) => Number(second.rating || 0) - Number(first.rating || 0) || byValue(first, second);

  const increase = stock
    .map((wine) => ({ wine, pct: increasePct(wine) }))
    .filter((item): item is { wine: Wine; pct: number } => item.pct !== null && item.pct > 0)
    .sort((first, second) => second.pct - first.pct)
    .map(({ wine }) => wine);
  const orderedOwned = [...stock].sort(byOwned);
  const dated = openable.filter(hasDrinkWindow);
  const candidates: Array<{ reason: FeaturedReason; wines: Wine[]; strict: boolean }> = [
    { reason: "increase", wines: increase, strict: true },
    { reason: "closing", wines: dated.filter((wine) => wine.drink_to === year).sort(lovedFirst), strict: false },
    { reason: "favorite", wines: openable.filter((wine) => Number(wine.rating || 0) >= LOVED_RATING).sort(lovedFirst), strict: false },
    { reason: "owned", wines: orderedOwned.slice(0, 1), strict: true },
    { reason: "peak", wines: dated.filter((wine) => (wine.drink_peak_from || wine.drink_from) === year && wine.drink_to! > year).sort(lovedFirst), strict: false },
    { reason: "best_tasting", wines: openable.filter((wine) => bestTastingRating(wine) >= LOVED_RATING).sort((first, second) => bestTastingRating(second) - bestTastingRating(first) || byValue(first, second)), strict: false },
    { reason: "position", wines: [...stock].sort(byValue).slice(0, 1), strict: true },
    {
      reason: "rediscover",
      wines: openable.filter((wine) => loved(wine) && (daysSinceLastTasting(wine, today) ?? 0) >= REDISCOVER_AFTER_DAYS)
        .sort((first, second) => (daysSinceLastTasting(second, today) ?? 0) - (daysSinceLastTasting(first, today) ?? 0)),
      strict: false,
    },
    { reason: "overdue", wines: dated.filter((wine) => wine.drink_to! < year).sort((first, second) => first.drink_to! - second.drink_to! || byValue(first, second)), strict: false },
    { reason: "personal", wines: orderedOwned.filter((wine) => sharePct(wine) >= 99.999).slice(0, 1), strict: true },
    { reason: "shared", wines: orderedOwned.filter((wine) => sharePct(wine) > 0 && sharePct(wine) < 99.999).slice(0, 1), strict: true },
  ];

  const selected: Array<{ wine: Wine; reason: FeaturedReason }> = [];
  const taken = (wine: Wine) => selected.some((item) => item.wine.id === wine.id);
  for (const { reason, wines: pool, strict } of candidates) {
    if (selected.length >= limit) break;
    const wine = strict ? (pool[0] && !taken(pool[0]) ? pool[0] : undefined) : pool.find((item) => !taken(item));
    if (wine) selected.push({ wine, reason });
  }
  for (const wine of orderedOwned) {
    if (selected.length >= limit) break;
    if (!taken(wine)) selected.push({ wine, reason: "value" });
  }
  return selected;
}
