import type { Wine, WineDraft, WishlistDraft, WishlistItem } from "../types";
import { normalizeWineType } from "./wineTypes";

export function wineToDraft(wine: Wine): WineDraft {
  return {
    name: wine.name,
    producer: wine.producer,
    vintage: wine.vintage,
    quantity: String(wine.quantity),
    currency: wine.currency,
    price: String(wine.price),
    sale_price: wine.sale_price ? String(wine.sale_price) : "",
    glass_price: wine.glass_price ? String(wine.glass_price) : "",
    pour_size_ml: String(wine.pour_size_ml || 100),
    reorder_threshold: String(wine.reorder_threshold ?? 2),
    current_value: wine.current_value ? String(wine.current_value) : "",
    status: wine.status,
    format: wine.format || "",
    type: normalizeWineType(wine.type),
    region: wine.region || "",
    appellation: wine.appellation || "",
    merchant: wine.merchant || "",
    initial_stock_reference: "",
    order_date: wine.order_date || "",
    expected_delivery: wine.expected_delivery || "",
    owner_share_pct: String(wine.owner_share_pct || "100"),
    rating: String(wine.rating || 0),
    notes: wine.notes,
    owners: wine.owners.map((owner) => ({ name: owner.name || "", email: owner.email || "", share_pct: String(owner.share_pct || "") })),
    tags: wine.tags,
    grapes: wine.grapes.map((grape) => ({
      name: grape.name || "",
      percentage_from: grape.percentage_from === undefined ? "" : String(grape.percentage_from),
      percentage_to: grape.percentage_to === undefined ? "" : String(grape.percentage_to),
    })),
    scores: wine.scores.map((score) => ({ critic: score.critic || "", score: score.score || "", note: score.note || "" })),
  };
}

export function draftPayload(draft: WineDraft) {
  return {
    name: draft.name.trim(),
    producer: draft.producer.trim(),
    vintage: draft.vintage.trim(),
    quantity: Number(draft.quantity || 0),
    currency: draft.currency.trim().toUpperCase() || "CHF",
    price: Number(draft.price || 0),
    sale_price: draft.sale_price ? Number(draft.sale_price) : null,
    glass_price: draft.glass_price ? Number(draft.glass_price) : null,
    pour_size_ml: Number(draft.pour_size_ml || 100),
    reorder_threshold: Number(draft.reorder_threshold || 0),
    current_value: draft.current_value ? Number(draft.current_value) : null,
    status: draft.status,
    format: draft.format.trim(),
    type: normalizeWineType(draft.type),
    region: draft.region.trim(),
    appellation: draft.appellation.trim(),
    merchant: draft.merchant.trim(),
    initial_stock_reference: draft.initial_stock_reference.trim(),
    order_date: draft.order_date || null,
    expected_delivery: draft.expected_delivery || null,
    owner_share_pct: Number(draft.owner_share_pct || 100),
    rating: Number(draft.rating || 0),
    notes: draft.notes.trim(),
    owners: draft.owners
      .map((owner) => ({ name: owner.name.trim(), email: owner.email.trim().toLowerCase(), share_pct: Number(owner.share_pct || 0) }))
      .filter((owner) => owner.name && owner.share_pct > 0),
    tags: draft.tags,
    grapes: draft.grapes
      .map((grape) => ({
        name: grape.name.trim(),
        percentage_from: grape.percentage_from === "" ? undefined : Number(grape.percentage_from),
        percentage_to: grape.percentage_to === "" ? undefined : Number(grape.percentage_to),
      }))
      .filter((grape) => grape.name),
    scores: draft.scores
      .map((score) => ({ critic: score.critic.trim(), score: score.score.trim(), note: score.note.trim() }))
      .filter((score) => score.critic || score.score || score.note),
  };
}

export function wishlistToDraft(item: WishlistItem): WishlistDraft {
  return {
    wishlist_list_id: item.wishlist_list_id,
    name: item.name,
    producer: item.producer,
    vintage: item.vintage,
    format: item.format,
    type: normalizeWineType(item.type),
    region: item.region,
    appellation: item.appellation,
    target_price: String(item.target_price),
    offer_price: item.offer_price === null ? "" : String(item.offer_price),
    currency: item.currency,
    merchant: item.merchant,
    priority: item.priority,
    purpose: item.purpose,
    status: item.status,
    notes: item.notes,
    ai_context_note: item.ai_context_note,
  };
}

export function wishlistPayload(draft: WishlistDraft) {
  return {
    wishlist_list_id: draft.wishlist_list_id,
    name: draft.name.trim(),
    producer: draft.producer.trim(),
    vintage: draft.vintage.trim(),
    format: draft.format.trim(),
    type: normalizeWineType(draft.type),
    region: draft.region.trim(),
    appellation: draft.appellation.trim(),
    target_price: Number(draft.target_price || 0),
    offer_price: draft.offer_price === "" ? null : Number(draft.offer_price),
    currency: draft.currency.trim().toUpperCase() || "CHF",
    merchant: draft.merchant.trim(),
    priority: draft.priority,
    purpose: draft.purpose,
    status: draft.status,
    notes: draft.notes.trim(),
    ai_context_note: draft.ai_context_note.trim(),
  };
}
