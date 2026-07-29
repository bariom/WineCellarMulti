import type { TastingEnjoyment, Wine, WishlistItem } from "../types";
import { normalizeWineType } from "../domain/wineTypes";

export function rawObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

export function rawArray(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? value.map(rawObject) : [];
}

export function rawString(value: unknown, fallback = "") {
  return value === null || value === undefined ? fallback : String(value);
}

export function rawNumber(value: unknown, fallback = 0) {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : fallback;
}

export function tastingEnjoymentValue(value: unknown): TastingEnjoyment {
  return value === "positive" || value === "negative" ? value : "";
}

export function rawNullableString(value: unknown) {
  const text = rawString(value).trim();
  return text || null;
}

export function offlineWine(raw: Record<string, unknown>, index: number): Wine {
  return {
    id: rawString(raw.id, `offline-wine-${index}`),
    details_loaded: raw.details_loaded === undefined ? true : Boolean(raw.details_loaded),
    photo_thumbnail_url: rawString(raw.photo_thumbnail_url),
    photo_detail_url: rawString(raw.photo_detail_url),
    household_id: rawString(raw.household_id, "offline"),
    name: rawString(raw.name, "Unnamed wine"),
    producer: rawString(raw.producer),
    vintage: rawString(raw.vintage),
    quantity: rawNumber(raw.quantity),
    currency: rawString(raw.currency, "CHF"),
    price: rawString(raw.price, "0"),
    current_value: raw.current_value === null || raw.current_value === undefined ? null : rawString(raw.current_value),
    value_not_found: Boolean(raw.value_not_found),
    status: rawString(raw.status, "Delivered"),
    format: rawString(raw.format),
    type: normalizeWineType(rawString(raw.type)),
    region: rawString(raw.region),
    appellation: rawString(raw.appellation),
    merchant: rawString(raw.merchant),
    order_date: rawNullableString(raw.order_date),
    expected_delivery: rawNullableString(raw.expected_delivery),
    owner_share_pct: rawString(raw.owner_share_pct, "100"),
    notes: rawString(raw.notes),
    ai_notes: rawString(raw.ai_notes),
    drink_from: raw.drink_from === null || raw.drink_from === undefined ? null : rawNumber(raw.drink_from),
    drink_peak_from: raw.drink_peak_from === null || raw.drink_peak_from === undefined ? null : rawNumber(raw.drink_peak_from),
    drink_peak_to: raw.drink_peak_to === null || raw.drink_peak_to === undefined ? null : rawNumber(raw.drink_peak_to),
    drink_to: raw.drink_to === null || raw.drink_to === undefined ? null : rawNumber(raw.drink_to),
    drink_window_notes: rawString(raw.drink_window_notes),
    ai_value_notes: rawString(raw.ai_value_notes),
    ai_value_estimated_at: rawNullableString(raw.ai_value_estimated_at),
    rating: rawNumber(raw.rating),
    owners: rawArray(raw.owners).map((owner) => ({ name: rawString(owner.name), email: rawString(owner.email), share_pct: rawNumber(owner.share_pct) })),
    tags: Array.isArray(raw.tags) ? raw.tags.map((tag) => rawString(tag)).filter(Boolean) : [],
    grapes: rawArray(raw.grapes).map((grape) => ({
      name: rawString(grape.name),
      percentage_from: grape.percentage_from === undefined ? undefined : rawNumber(grape.percentage_from),
      percentage_to: grape.percentage_to === undefined ? undefined : rawNumber(grape.percentage_to),
    })),
    grapes_source_url: rawString(raw.grapes_source_url),
    grapes_source_title: rawString(raw.grapes_source_title),
    grapes_verified_at: rawNullableString(raw.grapes_verified_at),
    grapes_not_applicable: Boolean(raw.grapes_not_applicable),
    scores: rawArray(raw.scores).map((score) => ({ critic: rawString(score.critic), score: rawString(score.score), note: rawString(score.note) })),
    scores_not_applicable: Boolean(raw.scores_not_applicable),
    tasting_history: rawArray(raw.tasting_history).map((entry, entryIndex) => ({
      id: rawString(entry.id, `offline-tasting-${index}-${entryIndex}`),
      consumed_at: rawString(entry.consumed_at),
      note: rawString(entry.note),
      rating: rawNumber(entry.rating),
      enjoyment: tastingEnjoymentValue(entry.enjoyment),
      occasion: rawString(entry.occasion),
      pairing: rawString(entry.pairing),
      companions: rawString(entry.companions),
      created_at: rawString(entry.created_at),
    })),
    value_history: rawArray(raw.value_history).map((entry, entryIndex) => ({
      id: rawString(entry.id, `offline-value-${index}-${entryIndex}`),
      value: rawString(entry.value),
      currency: rawString(entry.currency, rawString(raw.currency, "CHF")),
      source: rawString(entry.source),
      recorded_at: rawString(entry.recorded_at),
    })),
  };
}

export function offlineWishlistItem(raw: Record<string, unknown>, index: number): WishlistItem {
  return {
    id: rawString(raw.id, `offline-wishlist-${index}`),
    household_id: rawString(raw.household_id, "offline"),
    wishlist_list_id: rawString(raw.wishlist_list_id, "offline-default"),
    name: rawString(raw.name, "Unnamed wishlist item"),
    producer: rawString(raw.producer),
    vintage: rawString(raw.vintage),
    format: rawString(raw.format),
    type: normalizeWineType(rawString(raw.type)),
    region: rawString(raw.region),
    appellation: rawString(raw.appellation),
    target_price: rawString(raw.target_price, "0"),
    offer_price: raw.offer_price === null || raw.offer_price === undefined ? null : rawString(raw.offer_price),
    ai_market_price: rawString(raw.ai_market_price),
    ai_market_price_currency: rawString(raw.ai_market_price_currency),
    currency: rawString(raw.currency, "CHF"),
    merchant: rawString(raw.merchant),
    priority: rawString(raw.priority, "Medium"),
    purpose: rawString(raw.purpose, "Drink"),
    status: rawString(raw.status, "Evaluate"),
    notes: rawString(raw.notes),
    ai_context_note: rawString(raw.ai_context_note),
    ai_strategy: rawString(raw.ai_strategy),
    ai_strategy_generated_at: rawNullableString(raw.ai_strategy_generated_at),
    ai_purpose_advice: rawString(raw.ai_purpose_advice),
    ai_purpose_generated_at: rawNullableString(raw.ai_purpose_generated_at),
  };
}
