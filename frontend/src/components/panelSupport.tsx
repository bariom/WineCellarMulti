import type { ConsumeWineDraft, Locale, Wine, WineTone } from "../types";
import { numberLocale } from "../domain/cellar";
export const emptyConsumeWineDraft = (): ConsumeWineDraft => ({
  consumed_at: new Date().toISOString().slice(0, 10),
  note: "",
  tasting_rating: "0",
  tasting_enjoyment: "",
  tasting_occasion: "",
  tasting_pairing: "",
  tasting_companions: "",
  storage_allocation_id: "",
});

export function consumeDraftFromTastingEntry(entry: Wine["tasting_history"][number]): ConsumeWineDraft {
  return {
    consumed_at: entry.consumed_at || new Date().toISOString().slice(0, 10),
    note: entry.note || "",
    tasting_rating: String(entry.rating || 0),
    tasting_enjoyment: entry.enjoyment || "",
    tasting_occasion: entry.occasion || "",
    tasting_pairing: entry.pairing || "",
    tasting_companions: entry.companions || "",
    storage_allocation_id: "",
  };
}

export function formatDisplayDate(value: string | null) {
  if (!value) return "";
  const date = new Date(`${value.slice(0, 10)}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("it-CH").format(date);
}

export function formatGrape(grape: Wine["grapes"][number]) {
  const from = grape.percentage_from;
  const to = grape.percentage_to;
  if (from && to && from !== to) return `${grape.name} ${from}-${to}%`;
  if (from || to) return `${grape.name} ${from || to}%`;
  return grape.name;
}

export function formatUsd(value: string | number) {
  const amount = Number(value || 0);
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: amount < 1 ? 4 : 2, maximumFractionDigits: 4 }).format(amount);
}

export function formatAiBudget(value: string | number) {
  const amount = Number(value || 0);
  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: amount < 1 ? 4 : 2,
    maximumFractionDigits: 4,
  }).format(amount);
}

export function formatMoney(
  value: string | number | null | undefined,
  currency: string,
  locale: Locale,
  minimumFractionDigits = 0,
  maximumFractionDigits = 0,
) {
  const amount = Number(value || 0);
  return `${currency} ${new Intl.NumberFormat(numberLocale(locale), {
    useGrouping: true,
    minimumFractionDigits,
    maximumFractionDigits,
  }).format(amount)}`;
}

export function clipUiText(value: string, limit = 120) {
  const trimmed = value.trim();
  if (trimmed.length <= limit) return trimmed;
  return `${trimmed.slice(0, Math.max(0, limit - 1)).trimEnd()}…`;
}

export function readableLegacyAiText(value: string, kind: "strategy" | "purpose") {
  const text = value.trim();
  if (!text.startsWith("{") && !text.startsWith("[")) return text;
  try {
    const parsed = JSON.parse(text) as Record<string, unknown>;
    if (!parsed || Array.isArray(parsed) || typeof parsed !== "object") return text;
    if (kind === "strategy") {
      const parts = [
        parsed.signal,
        parsed.reason,
        parsed.price_assessment,
      ].map((part) => String(part || "").trim()).filter(Boolean);
      if (parsed.market_price_low && parsed.market_price_high && parsed.market_price_currency) {
        parts.push(`Fascia mercato stimata: ${parsed.market_price_currency} ${parsed.market_price_low}-${parsed.market_price_high}.`);
      }
      return parts.map((part) => part.endsWith(".") ? part : `${part}.`).join(" ");
    }
    const parts = [
      parsed.recommended_purpose ? `Scopo consigliato: ${parsed.recommended_purpose}.` : "",
      parsed.signal,
      parsed.reason,
      parsed.confidence ? `Confidenza: ${parsed.confidence}.` : "",
    ].map((part) => String(part || "").trim()).filter(Boolean);
    return parts.map((part) => part.endsWith(".") ? part : `${part}.`).join(" ");
  } catch {
    return text;
  }
}

export function wineTone(type: string): WineTone {
  const normalized = type.toLowerCase();
  if (normalized.includes("red") || normalized.includes("rosso")) return "red";
  if (normalized.includes("white") || normalized.includes("bianco")) return "white";
  if (normalized.includes("sparkling") || normalized.includes("champagne") || normalized.includes("spumante")) return "sparkling";
  if (normalized.includes("ros") || normalized.includes("rose")) return "rose";
  if (normalized.includes("sweet") || normalized.includes("dolce")) return "sweet";
  return "other";
}

export function grapesSvgIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 4c1.8 0 3.2 1.3 3.2 3 0 1.4-.9 2.6-2.2 3" />
      <path d="M12 4c-1.8 0-3.2 1.3-3.2 3 0 1.4.9 2.6 2.2 3" />
      <path d="M9.3 10c1.8 0 3.2 1.3 3.2 3s-1.4 3-3.2 3-3.2-1.3-3.2-3 1.4-3 3.2-3Z" />
      <path d="M14.7 10c1.8 0 3.2 1.3 3.2 3s-1.4 3-3.2 3-3.2-1.3-3.2-3 1.4-3 3.2-3Z" />
      <path d="M12 15.2c1.8 0 3.2 1.3 3.2 3s-1.4 3-3.2 3-3.2-1.3-3.2-3 1.4-3 3.2-3Z" />
      <path d="M12 4V2.8" />
      <path d="M12 2.8c1.3 0 2.6-.5 3.5-1.5" />
    </svg>
  );
}
