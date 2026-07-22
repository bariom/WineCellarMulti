import type { Locale, MaturityPhase, Session, SortMode, ValueBreakdownItem, Wine, WineCollectionFilters, WishlistItem } from "../types";
import { normalizeWineType } from "./wineTypes";

export function uniqueSorted(values: string[]) {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean))).sort((first, second) => first.localeCompare(second));
}

export function numberLocale(locale: Locale) {
  return locale === "it" ? "it-CH" : "en-CH";
}

export function wineGroupValue(wine: Wine, field: "type" | "region") {
  return wine[field] || (field === "type" ? "Other" : "Unknown region");
}

export function isWishlistReadyToBuy(status: string) {
  const normalized = status.trim().toLowerCase();
  return ["buy", "ready", "approved", "compra", "acquista", "pronto", "approvato"]
    .some((word) => normalized.includes(word));
}

export function wineUnitValue(wine: Wine) {
  return Number(wine.current_value || wine.price || 0);
}

export function hasVintageForDrinkWindow(wine: Wine) {
  const vintage = wine.vintage.trim().toLowerCase();
  if (!vintage) return false;
  if (["nv", "mv", "sans vintage", "non vintage", "multi vintage"].includes(vintage)) return false;
  return /\d{4}/.test(vintage);
}

export function wineIdealWindowStart(wine: Wine) {
  return wine.drink_peak_from || wine.drink_from || null;
}

export function winePriorityDrinkEnd(wine: Wine) {
  return wine.drink_to || wine.drink_peak_to || null;
}

export function isWineReadyToPrioritize(wine: Wine, currentYear: number) {
  const idealStart = wineIdealWindowStart(wine);
  const drinkEnd = winePriorityDrinkEnd(wine);
  return Boolean(idealStart && drinkEnd && idealStart <= currentYear && drinkEnd >= currentYear);
}

export function isWineIdealSoon(wine: Wine, currentYear: number) {
  const idealStart = wineIdealWindowStart(wine);
  return Boolean(idealStart && idealStart > currentYear && idealStart <= currentYear + 2);
}

export function isFutureDeliveryWine(wine: Wine, now: Date) {
  if (!wine.expected_delivery) return false;
  const deliveryDate = new Date(wine.expected_delivery);
  if (Number.isNaN(deliveryDate.getTime()) || deliveryDate < now) return false;
  const status = wine.status.trim().toLowerCase();
  const deliveredStatuses = ["delivered", "consegnato", "bevuto", "consumed", "cancelled", "canceled", "annullato"];
  if (deliveredStatuses.some((value) => status.includes(value))) return false;
  return true;
}

export function isToCollectWine(wine: Wine) {
  const status = wine.status.trim().toLowerCase();
  return ["collect", "pickup", "ritir"].some((value) => status.includes(value));
}

export function sumWineValue(items: Wine[]) {
  return items.reduce((total, wine) => total + wineUnitValue(wine) * wine.quantity, 0);
}

export function currentUserSharePct(wine: Wine, session: Session | null) {
  const userName = (session?.user_display_name || "").trim().toLowerCase();
  const userEmail = (session?.user_email || "").trim().toLowerCase();
  if (wine.owners.length) {
    if (!userEmail) return Math.min(Math.max(Number(wine.owner_share_pct || 100), 0), 100);
    const owner = wine.owners.find((item) => {
      const name = String(item.name || "").trim().toLowerCase();
      const email = String(item.email || "").trim().toLowerCase();
      return email ? email === userEmail : name && (name === userName || name === userEmail);
    });
    if (owner) return Math.min(Math.max(Number(owner.share_pct || 0), 0), 100);
    return 0;
  }
  return Math.min(Math.max(Number(wine.owner_share_pct || 100), 0), 100);
}

export function ownedBottleCount(wine: Wine, session: Session | null) {
  return Math.round((wine.quantity * currentUserSharePct(wine, session)) / 100);
}

export function wineQuantityLabel(wine: Wine, session: Session | null, bottlesLabel: string, locale: Locale) {
  const owned = ownedBottleCount(wine, session);
  const isShared = wine.owners.length > 0 || currentUserSharePct(wine, session) < 100;
  if (isShared) return `${formatBottleCount(owned, locale)} ${bottlesLabel} di ${formatBottleCount(wine.quantity, locale)} condivise`;
  return `${formatBottleCount(wine.quantity, locale)} ${bottlesLabel}`;
}

export function ownershipStats(items: Wine[], session: Session | null) {
  return items.reduce(
    (totals, wine) => {
      const totalBottles = wine.quantity;
      const totalValue = wineUnitValue(wine) * wine.quantity;
      const myShare = currentUserSharePct(wine, session) / 100;
      totals.totalBottles += totalBottles;
      totals.totalValue += totalValue;
      totals.myBottles += totalBottles * myShare;
      totals.myValue += totalValue * myShare;
      return totals;
    },
    { myBottles: 0, myValue: 0, totalBottles: 0, totalValue: 0 },
  );
}

export function topWineValueGroups(items: Wine[], field: "type" | "region") {
  return uniqueSorted(items.map((wine) => wineGroupValue(wine, field)))
    .map((label) => ({
      label,
      value: sumWineValue(items.filter((wine) => wineGroupValue(wine, field) === label)),
    }))
    .filter((item) => item.value > 0)
    .sort((first, second) => second.value - first.value)
    .slice(0, 5);
}

export function topWineBottleGroups(items: Wine[], field: "type" | "region") {
  return uniqueSorted(items.map((wine) => wineGroupValue(wine, field)))
    .map((label) => ({
      label,
      value: items
        .filter((wine) => wineGroupValue(wine, field) === label)
        .reduce((total, wine) => total + wine.quantity, 0),
    }))
    .filter((item) => item.value > 0)
    .sort((first, second) => second.value - first.value)
    .slice(0, 5);
}

export function topWineCountGroups(items: Wine[], field: "type" | "region") {
  return uniqueSorted(items.map((wine) => wineGroupValue(wine, field)))
    .map((label) => ({
      label,
      value: items.filter((wine) => wineGroupValue(wine, field) === label).length,
    }))
    .filter((item) => item.value > 0)
    .sort((first, second) => second.value - first.value)
    .slice(0, 5);
}

export function topProducerGroups(items: Wine[]) {
  return uniqueSorted(items.map((wine) => wine.producer || "Unknown producer"))
    .map((label) => {
      const producerWines = items.filter((wine) => (wine.producer || "Unknown producer") === label);
      return {
        label,
        value: sumWineValue(producerWines),
        bottles: producerWines.reduce((total, wine) => total + wine.quantity, 0),
      };
    })
    .filter((item) => item.value > 0)
    .sort((first, second) => second.value - first.value)
    .slice(0, 5);
}

export function formatBottleCount(value: number, locale: Locale) {
  return new Intl.NumberFormat(numberLocale(locale), {
    useGrouping: true,
    maximumFractionDigits: 0,
  }).format(Math.round(value));
}

export function formatPercentage(value: number, locale: Locale, maximumFractionDigits = 0) {
  return `${new Intl.NumberFormat(numberLocale(locale), {
    maximumFractionDigits,
  }).format(value)}%`;
}

export function formatRecognitionConfidence(value: number | null, locale: Locale) {
  if (typeof value !== "number" || Number.isNaN(value)) return "";
  const percentage = value <= 1 ? value * 100 : value;
  return `${new Intl.NumberFormat(numberLocale(locale), {
    maximumFractionDigits: 1,
  }).format(percentage)}%`;
}

export function recognitionSuggestionLabel(label: string, confidence: number | null, locale: Locale) {
  const confidenceLabel = formatRecognitionConfidence(confidence, locale);
  return confidenceLabel ? `${label} · ${confidenceLabel}` : label;
}

export function maturityBuckets(items: Wine[], currentYear: number, locale: Locale) {
  const labels =
    locale === "it"
      ? { young: "Giovani", soon: "In arrivo", now: "Al picco", past: "Scaduti", unknown: "Sconosciuti" }
      : { young: "Young", soon: "Coming up", now: "At peak", past: "Past", unknown: "Unknown" };
  const buckets = [
    { key: "young", label: labels.young, value: items.filter((wine) => (wineIdealWindowStart(wine) || 0) > currentYear + 2).length },
    { key: "soon", label: labels.soon, value: items.filter((wine) => isWineIdealSoon(wine, currentYear)).length },
    { key: "now", label: labels.now, value: items.filter((wine) => isWineReadyToPrioritize(wine, currentYear)).length },
    { key: "past", label: labels.past, value: items.filter((wine) => wine.drink_to && wine.drink_to < currentYear).length },
    { key: "unknown", label: labels.unknown, value: items.filter((wine) => !wine.drink_from || !wine.drink_to).length },
  ];
  const max = Math.max(...buckets.map((bucket) => bucket.value), 1);
  return buckets.map((bucket) => ({ ...bucket, pct: Math.max((bucket.value / max) * 100, bucket.value ? 8 : 0) }));
}

export function maturityPhaseForYear(wine: Wine, year: number): MaturityPhase {
  if (!wine.drink_from && !wine.drink_to) return "unknown";
  const drinkStart = wine.drink_from || wine.drink_peak_from || null;
  const drinkEnd = wine.drink_to || wine.drink_peak_to || null;
  if (drinkEnd && year > drinkEnd) return "past";
  if (drinkStart && year < drinkStart) return "early";
  const peakStart = wine.drink_peak_from || drinkStart;
  const peakEnd = wine.drink_peak_to || drinkEnd;
  if (peakStart && peakEnd && year >= peakStart && year <= peakEnd) return "peak";
  if (drinkStart && drinkEnd && year >= drinkStart && year <= drinkEnd) return "drinkable";
  return "unknown";
}

export function isWineAtMaturityPeak(wine: Wine, year: number) {
  return maturityPhaseForYear(wine, year) === "peak";
}

export function isWineInExplicitIdealWindow(wine: Wine, year: number) {
  return Boolean(wine.drink_peak_from && wine.drink_peak_to && year >= wine.drink_peak_from && year <= wine.drink_peak_to);
}

export function daysUntil(value: string) {
  const target = new Date(value).getTime();
  if (Number.isNaN(target)) return null;
  return Math.ceil((target - Date.now()) / 86400000);
}

export function valueEstimateAgeDays(wine: Wine, now: Date) {
  if (!wine.ai_value_estimated_at) return null;
  const estimatedAt = new Date(wine.ai_value_estimated_at).getTime();
  if (Number.isNaN(estimatedAt)) return null;
  return Math.floor((now.getTime() - estimatedAt) / 86400000);
}

export function needsValueRefresh(wine: Wine, thresholdDays: number, now: Date) {
  if (!wine.current_value) return true;
  if (thresholdDays <= 0) return false;
  const ageDays = valueEstimateAgeDays(wine, now);
  return ageDays === null || ageDays >= thresholdDays;
}

export function wineSearchText(wine: Wine) {
  return [
    wine.name,
    wine.producer,
    wine.vintage,
    wine.format,
    wine.type,
    wine.region,
    wine.appellation,
    wine.merchant,
    wine.status,
    wine.notes,
    wine.ai_notes,
    wine.rating ? `${wine.rating} stars rating` : "",
    wine.tags.join(" "),
    wine.grapes.map((grape) => grape.name).join(" "),
    wine.scores.map((score) => `${score.critic} ${score.score} ${score.note}`).join(" "),
  ].join(" ").toLowerCase();
}

export function matchesQuickWineFilter(wine: Wine, quickFilter: string, currentYear: number, now: Date, session: Session | null) {
  if (!quickFilter) return true;
  const share = currentUserSharePct(wine, session);
  if (quickFilter === "mine") return share > 0;
  if (quickFilter === "shared") return share < 100;
  if (quickFilter === "drink_now") return isWineReadyToPrioritize(wine, currentYear);
  if (quickFilter === "drink_soon") return isWineIdealSoon(wine, currentYear);
  if (quickFilter === "past_window") return Boolean(wine.drink_to && wine.drink_to < currentYear);
  if (quickFilter === "future_deliveries") return isFutureDeliveryWine(wine, now);
  if (quickFilter === "to_collect") return isToCollectWine(wine);
  if (quickFilter === "missing_data") return !wine.current_value || !wine.drink_from || !wine.drink_to || (wine.scores.length === 0 && !wine.scores_not_applicable) || wine.grapes.length === 0;
  return true;
}

export function matchesWineCollectionFilters(wine: Wine, filters: WineCollectionFilters) {
  if (filters.query && !wineSearchText(wine).includes(filters.query)) return false;
  if (filters.type && normalizeWineType(wine.type) !== filters.type) return false;
  if (filters.status && wine.status !== filters.status) return false;
  const bottlePrice = Number(wine.price || 0);
  if (filters.minPrice !== null && bottlePrice < filters.minPrice) return false;
  if (filters.maxPrice !== null && bottlePrice > filters.maxPrice) return false;
  if (filters.ownership) {
    const share = currentUserSharePct(wine, filters.session);
    if (filters.ownership === "mine" && share <= 0) return false;
    if (filters.ownership === "shared" && share >= 100) return false;
  }
  if (!matchesQuickWineFilter(wine, filters.quick, filters.currentYear, filters.now, filters.session)) return false;
  if (filters.tags.length && !filters.tags.every((tag) => wine.tags.includes(tag))) return false;
  return !filters.grapes.length || filters.grapes.every((grape) => wine.grapes.some((item) => item.name === grape));
}

export function compareWines(sortMode: SortMode) {
  return (first: Wine, second: Wine) => {
    if (sortMode === "vintage") return (Number(second.vintage) || 0) - (Number(first.vintage) || 0);
    if (sortMode === "value") return Number(second.current_value || second.price || 0) - Number(first.current_value || first.price || 0);
    if (sortMode === "drink_window") return (first.drink_from || 9999) - (second.drink_from || 9999);
    return first.name.localeCompare(second.name);
  };
}

export function wishlistSearchText(item: WishlistItem) {
  return [
    item.name,
    item.producer,
    item.vintage,
    item.format,
    item.type,
    item.region,
    item.appellation,
    item.merchant,
    item.priority,
    item.purpose,
    item.status,
    item.notes,
  ].join(" ").toLowerCase();
}
