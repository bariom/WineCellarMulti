import { ChangeEvent, FormEvent, useEffect, useState } from "react";

type Session = {
  authenticated: boolean;
  user_display_name: string | null;
  user_email: string | null;
  active_household_name: string | null;
  membership_role: string | null;
};

type Wine = {
  id: string;
  household_id: string;
  name: string;
  producer: string;
  vintage: string;
  quantity: number;
  currency: string;
  price: string;
  current_value: string | null;
  status: string;
  format: string;
  type: string;
  region: string;
  appellation: string;
  merchant: string;
  order_date: string | null;
  expected_delivery: string | null;
  owner_share_pct: string;
  notes: string;
  ai_notes: string;
  drink_from: number | null;
  drink_peak_from: number | null;
  drink_peak_to: number | null;
  drink_to: number | null;
  drink_window_notes: string;
  ai_value_notes: string;
  ai_value_estimated_at: string | null;
  rating: number;
  owners: Array<{ name: string; share_pct: number }>;
  tags: string[];
  grapes: Array<{ name: string; percentage_from?: number; percentage_to?: number }>;
  scores: Array<{ critic: string; score: string; note: string }>;
};

type WineDraft = {
  name: string;
  producer: string;
  vintage: string;
  quantity: string;
  currency: string;
  price: string;
  current_value: string;
  status: string;
  format: string;
  type: string;
  region: string;
  appellation: string;
  merchant: string;
  order_date: string;
  expected_delivery: string;
  owner_share_pct: string;
  notes: string;
};

type WishlistItem = {
  id: string;
  household_id: string;
  name: string;
  producer: string;
  vintage: string;
  format: string;
  type: string;
  region: string;
  appellation: string;
  target_price: string;
  currency: string;
  merchant: string;
  priority: string;
  purpose: string;
  status: string;
  notes: string;
  ai_strategy: string;
  ai_purpose_advice: string;
};

type WishlistDraft = {
  name: string;
  producer: string;
  vintage: string;
  format: string;
  type: string;
  region: string;
  appellation: string;
  target_price: string;
  currency: string;
  merchant: string;
  priority: string;
  purpose: string;
  status: string;
  notes: string;
};

type HouseholdMembership = {
  membership_id: string;
  household_id: string;
  household_name: string;
  role: string;
};

type Member = {
  membership_id: string;
  user_id: string;
  email: string;
  display_name: string;
  role: string;
};

type InviteDraft = {
  email: string;
  role: string;
};

type Invite = {
  id: string;
  email: string;
  role: string;
  expires_at: string;
  accepted_at: string | null;
  invite_token: string | null;
};

type AiAuditLog = {
  id: string;
  entity_type: string;
  entity_id: string;
  feature: string;
  model: string;
  outcome: string;
  summary: string;
  input_tokens: number;
  cached_input_tokens: number;
  output_tokens: number;
  total_tokens: number;
  estimated_cost_usd: string;
  created_at: string;
};

type AiUsageBucket = {
  requests: number;
  input_tokens: number;
  cached_input_tokens: number;
  output_tokens: number;
  total_tokens: number;
  estimated_cost_usd: string;
};

type AiUsage = {
  today: AiUsageBucket;
  current_month: AiUsageBucket;
  all_time: AiUsageBucket;
  currency: string;
  is_estimate: boolean;
};

type AiSettings = {
  has_openai_api_key: boolean;
  ai_notes_model: string;
  drink_window_model: string;
  value_model: string;
  grape_model: string;
  wishlist_model: string;
  model_options: string[];
};

type AiSettingsDraft = {
  openai_api_key: string;
  ai_notes_model: string;
  drink_window_model: string;
  value_model: string;
  grape_model: string;
  wishlist_model: string;
};

type AuthDraft = {
  email: string;
  display_name: string;
  household_name: string;
  password: string;
};

type SortMode = "name" | "vintage" | "value" | "drink_window";
type Locale = "en" | "it";

const emptyAiSettingsDraft: AiSettingsDraft = {
  openai_api_key: "",
  ai_notes_model: "gpt-5.4-mini",
  drink_window_model: "gpt-5.4",
  value_model: "gpt-5.4-mini",
  grape_model: "gpt-5.4-nano",
  wishlist_model: "gpt-5.4",
};

const translations = {
  en: {
    accept: "Accept",
    acceptInvite: "Accept invite",
    addWine: "Add wine",
    addWishlist: "Add wishlist",
    aiNotes: "AI notes",
    aiPurpose: "AI purpose",
    aiReadiness: "AI readiness",
    aiReadinessHelp: "Wines with AI notes or value notes. Missing data above are the first candidates for AI enrichment.",
    aiAudit: "AI audit",
    aiSettings: "AI settings",
    aiStrategy: "AI strategy",
    aiTargetPrice: "AI target price",
    aiUsage: "AI usage",
    allTime: "All time",
    allStatuses: "All statuses",
    allTags: "All tags",
    allTypes: "All types",
    appellation: "Appellation",
    bottles: "Bottles",
    cancel: "Cancel",
    cellar: "Cellar",
    clearFilters: "Clear filters",
    convert: "Convert",
    createAccount: "Create account",
    createInvite: "Create invite",
    configured: "Configured",
    createWine: "Create wine",
    createWishlist: "Create wishlist",
    currentValue: "Current value",
    currency: "Currency",
    dataQuality: "Data quality",
    delete: "Delete",
    delivery: "Delivery",
    drinkIn2Years: "Drink in 2 years",
    drinkNow: "Drink now",
    drinkWindow: "Drink window",
    drinkingWindow: "Drinking window",
    edit: "Edit",
    editSelected: "Edit selected",
    editWine: "Edit wine",
    editWishlist: "Edit wishlist",
    email: "Email",
    expires: "expires",
    format: "Format",
    futureDeliveries: "Future deliveries",
    generating: "Generating",
    grapes: "Grapes",
    highPriority: "High priority",
    household: "Household",
    importLegacy: "Import legacy export",
    importSection: "Import",
    inviteLink: "Invite link",
    inviteLinkDetected: "Invite link detected",
    inviteLinkHelp: "Login or create an account with the invited email, then accept the invite.",
    inviteMember: "Invite member",
    inviteToken: "Invite token",
    language: "Language",
    loadingData: "Loading data",
    login: "Login",
    logout: "Logout",
    merchant: "Merchant",
    missingDrinkWindow: "Missing drink window",
    missingScores: "Missing scores",
    missingValue: "Missing value",
    name: "Name",
    noInvites: "No invites",
    noAiAudit: "No AI generations yet",
    noApiKey: "No API key configured",
    noAiUsage: "No AI usage yet",
    noItemSelected: "No item selected",
    noProducer: "No producer",
    noWishlistMatch: "No wishlist items match the current filters",
    noWineMatch: "No wines match the current filters",
    notes: "Notes",
    orderDate: "Order date",
    password: "Password",
    pastWindow: "Past window",
    pendingInvites: "Pending invites",
    personalSettings: "Personal settings",
    profileSection: "Profile",
    priority: "Priority",
    producer: "Producer",
    purchasePrice: "Purchase price",
    purpose: "Purpose",
    quantity: "Quantity",
    readyToBuy: "Ready to buy",
    records: "records",
    region: "Region",
    register: "Register",
    remove: "Remove",
    revoke: "Revoke",
    role: "Role",
    saveChanges: "Save changes",
    saveSettings: "Save settings",
    saving: "Saving",
    scores: "Scores",
    search: "Search",
    searchPlaceholder: "Name, producer, region, score...",
    selectItemHelp: "Select an item from the list to see the complete detail.",
    sort: "Sort",
    settings: "Settings",
    status: "Status",
    tag: "Tag",
    tags: "Tags",
    targetPrice: "Target price",
    targetValue: "Target value",
    thisMonth: "This month",
    today: "Today",
    topRegions: "Top regions",
    totalValue: "Total value",
    type: "Type",
    value: "Value",
    valueByType: "Value by type",
    viewerReadOnly: "Viewer access: you can read this cellar, but cannot change wines.",
    vintage: "Vintage",
    wineDetail: "Wine detail",
    wines: "Wines",
    wishlist: "Wishlist",
    wishlistDetail: "Wishlist detail",
    wishlistItems: "Wishlist items",
    working: "Working",
    estimatedCost: "Estimated cost",
    sharedCellar: "Shared cellar",
    tokens: "tokens",
  },
  it: {
    accept: "Accetta",
    acceptInvite: "Accetta invito",
    addWine: "Aggiungi vino",
    addWishlist: "Aggiungi wishlist",
    aiNotes: "Note AI",
    aiPurpose: "Scopo AI",
    aiReadiness: "Prontezza AI",
    aiReadinessHelp: "Vini con note AI o note valore. I dati mancanti sopra sono i primi candidati per l'arricchimento AI.",
    aiAudit: "Audit AI",
    aiSettings: "Impostazioni AI",
    aiStrategy: "Strategia AI",
    aiTargetPrice: "Prezzo target AI",
    aiUsage: "Uso AI",
    allTime: "Totale",
    allStatuses: "Tutti gli stati",
    allTags: "Tutti i tag",
    allTypes: "Tutti i tipi",
    appellation: "Denominazione",
    bottles: "Bottiglie",
    cancel: "Annulla",
    cellar: "Cantina",
    clearFilters: "Pulisci filtri",
    convert: "Converti",
    createAccount: "Crea account",
    createInvite: "Crea invito",
    configured: "Configurata",
    createWine: "Crea vino",
    createWishlist: "Crea wishlist",
    currentValue: "Valore attuale",
    currency: "Valuta",
    dataQuality: "Qualita dati",
    delete: "Elimina",
    delivery: "Consegna",
    drinkIn2Years: "Da bere entro 2 anni",
    drinkNow: "Da bere ora",
    drinkWindow: "Finestra",
    drinkingWindow: "Finestra degustazione",
    edit: "Modifica",
    editSelected: "Modifica selezionato",
    editWine: "Modifica vino",
    editWishlist: "Modifica wishlist",
    email: "Email",
    expires: "scade",
    format: "Formato",
    futureDeliveries: "Consegne future",
    generating: "Genero",
    grapes: "Uve",
    highPriority: "Alta priorita",
    household: "Cantina condivisa",
    importLegacy: "Importa export legacy",
    importSection: "Importazione",
    inviteLink: "Link invito",
    inviteLinkDetected: "Link invito rilevato",
    inviteLinkHelp: "Accedi o crea un account con l'email invitata, poi accetta l'invito.",
    inviteMember: "Invita membro",
    inviteToken: "Token invito",
    language: "Lingua",
    loadingData: "Caricamento dati",
    login: "Accesso",
    logout: "Esci",
    merchant: "Commerciante",
    missingDrinkWindow: "Finestra mancante",
    missingScores: "Punteggi mancanti",
    missingValue: "Valore mancante",
    name: "Nome",
    noInvites: "Nessun invito",
    noAiAudit: "Nessuna generazione AI",
    noApiKey: "Nessuna chiave API configurata",
    noAiUsage: "Nessun uso AI registrato",
    noItemSelected: "Nessun elemento selezionato",
    noProducer: "Produttore assente",
    noWishlistMatch: "Nessun elemento wishlist corrisponde ai filtri",
    noWineMatch: "Nessun vino corrisponde ai filtri",
    notes: "Note",
    orderDate: "Data ordine",
    password: "Password",
    pastWindow: "Finestra scaduta",
    pendingInvites: "Inviti pendenti",
    personalSettings: "Impostazioni personali",
    profileSection: "Profilo",
    priority: "Priorita",
    producer: "Produttore",
    purchasePrice: "Prezzo acquisto",
    purpose: "Scopo",
    quantity: "Quantita",
    readyToBuy: "Pronti da comprare",
    records: "record",
    region: "Regione",
    register: "Registrati",
    remove: "Rimuovi",
    revoke: "Revoca",
    role: "Ruolo",
    saveChanges: "Salva modifiche",
    saveSettings: "Salva impostazioni",
    saving: "Salvataggio",
    scores: "Punteggi",
    search: "Cerca",
    searchPlaceholder: "Nome, produttore, regione, punteggio...",
    selectItemHelp: "Seleziona un elemento dalla lista per vedere il dettaglio completo.",
    sort: "Ordina",
    settings: "Impostazioni",
    status: "Stato",
    tag: "Tag",
    tags: "Tag",
    targetPrice: "Prezzo target",
    targetValue: "Valore target",
    thisMonth: "Questo mese",
    today: "Oggi",
    topRegions: "Top regioni",
    totalValue: "Valore totale",
    type: "Tipo",
    value: "Valore",
    valueByType: "Valore per tipo",
    viewerReadOnly: "Accesso viewer: puoi leggere questa cantina, ma non modificare i vini.",
    vintage: "Annata",
    wineDetail: "Dettaglio vino",
    wines: "Vini",
    wishlist: "Wishlist",
    wishlistDetail: "Dettaglio wishlist",
    wishlistItems: "Elementi wishlist",
    working: "Elaborazione",
    estimatedCost: "Costo stimato",
    sharedCellar: "Cantina condivisa",
    tokens: "token",
  },
} as const;

type TranslationKey = keyof typeof translations.en;

function translate(locale: Locale, key: TranslationKey) {
  return (translations[locale] as Record<TranslationKey, string>)[key] || translations.en[key];
}

const emptyDraft: WineDraft = {
  name: "",
  producer: "",
  vintage: "",
  quantity: "1",
  currency: "CHF",
  price: "0",
  current_value: "",
  status: "Ordered",
  format: "",
  type: "",
  region: "",
  appellation: "",
  merchant: "",
  order_date: "",
  expected_delivery: "",
  owner_share_pct: "100",
  notes: "",
};

const emptyAuthDraft: AuthDraft = {
  email: "",
  display_name: "",
  household_name: "Main Cellar",
  password: "",
};

const emptyInviteDraft: InviteDraft = {
  email: "",
  role: "viewer",
};

const emptyWishlistDraft: WishlistDraft = {
  name: "",
  producer: "",
  vintage: "",
  format: "",
  type: "",
  region: "",
  appellation: "",
  target_price: "0",
  currency: "CHF",
  merchant: "",
  priority: "Medium",
  purpose: "Drink",
  status: "Evaluate",
  notes: "",
};

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    credentials: "include",
    headers: { "Content-Type": "application/json", ...init?.headers },
    ...init,
  });
  if (!response.ok) {
    const message = await response.text();
    throw new Error(message || `Request failed: ${response.status}`);
  }
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

function wineToDraft(wine: Wine): WineDraft {
  return {
    name: wine.name,
    producer: wine.producer,
    vintage: wine.vintage,
    quantity: String(wine.quantity),
    currency: wine.currency,
    price: String(wine.price),
    current_value: wine.current_value ? String(wine.current_value) : "",
    status: wine.status,
    format: wine.format || "",
    type: wine.type || "",
    region: wine.region || "",
    appellation: wine.appellation || "",
    merchant: wine.merchant || "",
    order_date: wine.order_date || "",
    expected_delivery: wine.expected_delivery || "",
    owner_share_pct: String(wine.owner_share_pct || "100"),
    notes: wine.notes,
  };
}

function draftPayload(draft: WineDraft) {
  return {
    name: draft.name.trim(),
    producer: draft.producer.trim(),
    vintage: draft.vintage.trim(),
    quantity: Number(draft.quantity || 0),
    currency: draft.currency.trim().toUpperCase() || "CHF",
    price: Number(draft.price || 0),
    current_value: draft.current_value ? Number(draft.current_value) : null,
    status: draft.status,
    format: draft.format.trim(),
    type: draft.type.trim(),
    region: draft.region.trim(),
    appellation: draft.appellation.trim(),
    merchant: draft.merchant.trim(),
    order_date: draft.order_date || null,
    expected_delivery: draft.expected_delivery || null,
    owner_share_pct: Number(draft.owner_share_pct || 100),
    notes: draft.notes.trim(),
  };
}

function wishlistToDraft(item: WishlistItem): WishlistDraft {
  return {
    name: item.name,
    producer: item.producer,
    vintage: item.vintage,
    format: item.format,
    type: item.type,
    region: item.region,
    appellation: item.appellation,
    target_price: String(item.target_price),
    currency: item.currency,
    merchant: item.merchant,
    priority: item.priority,
    purpose: item.purpose,
    status: item.status,
    notes: item.notes,
  };
}

function wishlistPayload(draft: WishlistDraft) {
  return {
    name: draft.name.trim(),
    producer: draft.producer.trim(),
    vintage: draft.vintage.trim(),
    format: draft.format.trim(),
    type: draft.type.trim(),
    region: draft.region.trim(),
    appellation: draft.appellation.trim(),
    target_price: Number(draft.target_price || 0),
    currency: draft.currency.trim().toUpperCase() || "CHF",
    merchant: draft.merchant.trim(),
    priority: draft.priority,
    purpose: draft.purpose,
    status: draft.status,
    notes: draft.notes.trim(),
  };
}

function tokenFromUrl() {
  const params = new URLSearchParams(window.location.search);
  return params.get("invite") || params.get("token") || "";
}

function inviteLink(token: string) {
  const url = new URL(window.location.href);
  url.search = "";
  url.hash = "";
  url.searchParams.set("invite", token);
  return url.toString();
}

function formatDisplayDate(value: string | null) {
  if (!value) return "";
  const date = new Date(`${value.slice(0, 10)}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("it-CH").format(date);
}

function formatGrape(grape: Wine["grapes"][number]) {
  const from = grape.percentage_from;
  const to = grape.percentage_to;
  if (from && to && from !== to) return `${grape.name} ${from}-${to}%`;
  if (from || to) return `${grape.name} ${from || to}%`;
  return grape.name;
}

function formatUsd(value: string | number) {
  const amount = Number(value || 0);
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: amount < 1 ? 4 : 2, maximumFractionDigits: 4 }).format(amount);
}

function readableLegacyAiText(value: string, kind: "strategy" | "purpose") {
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

function uniqueSorted(values: string[]) {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean))).sort((first, second) => first.localeCompare(second));
}

function wineTone(type: string) {
  const normalized = type.toLowerCase();
  if (normalized.includes("red") || normalized.includes("rosso")) return "red";
  if (normalized.includes("white") || normalized.includes("bianco")) return "white";
  if (normalized.includes("sparkling") || normalized.includes("champagne") || normalized.includes("spumante")) return "sparkling";
  if (normalized.includes("ros") || normalized.includes("rose")) return "rose";
  if (normalized.includes("sweet") || normalized.includes("dolce")) return "sweet";
  return "other";
}

function wineUnitValue(wine: Wine) {
  return Number(wine.current_value || wine.price || 0);
}

function sumWineValue(items: Wine[]) {
  return items.reduce((total, wine) => total + wineUnitValue(wine) * wine.quantity, 0);
}

function topWineValueGroups(items: Wine[], field: "type" | "region") {
  return uniqueSorted(items.map((wine) => wine[field] || (field === "type" ? "Other" : "Unknown region")))
    .map((label) => ({
      label,
      value: sumWineValue(items.filter((wine) => (wine[field] || (field === "type" ? "Other" : "Unknown region")) === label)),
    }))
    .filter((item) => item.value > 0)
    .sort((first, second) => second.value - first.value)
    .slice(0, 5);
}

function daysUntil(value: string) {
  const target = new Date(value).getTime();
  if (Number.isNaN(target)) return null;
  return Math.ceil((target - Date.now()) / 86400000);
}

function wineSearchText(wine: Wine) {
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
    wine.tags.join(" "),
    wine.scores.map((score) => `${score.critic} ${score.score} ${score.note}`).join(" "),
  ].join(" ").toLowerCase();
}

function wishlistSearchText(item: WishlistItem) {
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

function DetailField({ label, value }: { label: string; value: string | number | null | undefined }) {
  return (
    <div className="detail-field">
      <span>{label}</span>
      <strong>{value || "Not specified"}</strong>
    </div>
  );
}

function DetailNote({ title, children }: { title: string; children: string }) {
  return (
    <article className="detail-note">
      <h3>{title}</h3>
      <p>{children}</p>
    </article>
  );
}

function WineDetail({
  wine,
  canGenerate,
  generating,
  onGenerate,
  t,
}: {
  wine: Wine;
  canGenerate: boolean;
  generating: string;
  onGenerate: (feature: "notes" | "drink-window" | "value" | "grapes") => void;
  t: (key: TranslationKey) => string;
}) {
  const drinkStart = wine.drink_from || Number(wine.vintage) || new Date().getFullYear();
  const drinkEnd = wine.drink_to || drinkStart;
  const peakStart = wine.drink_peak_from || drinkStart;
  const peakEnd = wine.drink_peak_to || drinkEnd;
  const span = Math.max(drinkEnd - drinkStart, 1);
  const peakLeft = Math.min(Math.max(((peakStart - drinkStart) / span) * 100, 0), 96);
  const peakWidth = Math.max(((peakEnd - peakStart) / span) * 100, 4);
  const peakRightBound = Math.max(100 - peakLeft, 4);

  return (
    <section className={`wine-detail tone-${wineTone(wine.type)}`}>
      <div className="detail-title">
        <div>
          <p className="eyebrow">{t("wineDetail")}</p>
          <h2><i className={`wine-dot tone-${wineTone(wine.type)}`} />{wine.name}</h2>
          <span>{[wine.producer, wine.vintage, wine.region, wine.appellation].filter(Boolean).join(" - ")}</span>
        </div>
        <strong>{wine.currency} {Number(wine.current_value || wine.price).toFixed(0)}</strong>
      </div>

      <div className="ai-actions">
        <button type="button" className="secondary compact" disabled={!canGenerate || Boolean(generating)} onClick={() => onGenerate("notes")}>
          {generating === "notes" ? t("generating") : t("aiNotes")}
        </button>
        <button type="button" className="secondary compact" disabled={!canGenerate || Boolean(generating)} onClick={() => onGenerate("drink-window")}>
          {generating === "drink-window" ? t("generating") : t("drinkWindow")}
        </button>
        <button type="button" className="secondary compact" disabled={!canGenerate || Boolean(generating)} onClick={() => onGenerate("value")}>
          {generating === "value" ? t("generating") : t("value")}
        </button>
        <button type="button" className="secondary compact" disabled={!canGenerate || Boolean(generating)} onClick={() => onGenerate("grapes")}>
          {generating === "grapes" ? t("generating") : t("grapes")}
        </button>
      </div>

      <div className="detail-grid">
        <DetailField label={t("format")} value={wine.format} />
        <DetailField label={t("type")} value={wine.type} />
        <DetailField label={t("status")} value={wine.status} />
        <DetailField label={t("quantity")} value={`${wine.quantity} ${t("bottles").toLowerCase()}`} />
        <DetailField label={t("purchasePrice")} value={`${wine.currency} ${Number(wine.price).toFixed(0)}`} />
        <DetailField label={t("currentValue")} value={wine.current_value ? `${wine.currency} ${Number(wine.current_value).toFixed(0)}` : ""} />
        <DetailField label={t("merchant")} value={wine.merchant} />
        <DetailField label={t("delivery")} value={formatDisplayDate(wine.expected_delivery)} />
      </div>

      {(wine.drink_from || wine.drink_to) ? (
        <div className="drink-window">
          <div className="section-heading">
            <h3>{t("drinkingWindow")}</h3>
            <span>{drinkStart}-{drinkEnd}</span>
          </div>
          <div className="window-track">
            <span className="window-peak" style={{ left: `${peakLeft}%`, width: `${Math.min(peakWidth, peakRightBound)}%` }} />
          </div>
          <div className="window-labels">
            <span>{drinkStart}</span>
            <span>Peak {peakStart}-{peakEnd}</span>
            <span>{drinkEnd}</span>
          </div>
          {wine.drink_window_notes ? <p>{wine.drink_window_notes}</p> : null}
        </div>
      ) : null}

      {wine.scores.length ? (
        <div className="detail-section">
          <h3>{t("scores")}</h3>
          <ul>
            {wine.scores.map((score, index) => (
              <li key={`${score.critic}-${index}`}>
                <strong>{score.critic} {score.score}</strong>
                {score.note ? <span>{score.note}</span> : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {wine.grapes.length ? (
        <div className="detail-section">
          <h3>{t("grapes")}</h3>
          <div className="chip-list">
            {wine.grapes.map((grape, index) => <span key={`${grape.name}-${index}`}>{formatGrape(grape)}</span>)}
          </div>
        </div>
      ) : null}

      {wine.tags.length ? (
        <div className="detail-section">
          <h3>{t("tags")}</h3>
          <div className="chip-list">
            {wine.tags.map((tag) => <span key={tag}>{tag}</span>)}
          </div>
        </div>
      ) : null}

      {wine.ai_notes || wine.ai_value_notes || wine.notes ? (
        <div className="notes-grid">
          {wine.notes ? <DetailNote title={t("notes")}>{wine.notes}</DetailNote> : null}
          {wine.ai_notes ? <DetailNote title={t("aiNotes")}>{wine.ai_notes}</DetailNote> : null}
          {wine.ai_value_notes ? <DetailNote title={t("value")}>{wine.ai_value_notes}</DetailNote> : null}
        </div>
      ) : null}
    </section>
  );
}

function WishlistDetail({
  item,
  canGenerate,
  generating,
  onGenerate,
  t,
}: {
  item: WishlistItem;
  canGenerate: boolean;
  generating: string;
  onGenerate: (feature: "strategy" | "purpose" | "target-price") => void;
  t: (key: TranslationKey) => string;
}) {
  return (
    <section className={`wine-detail tone-${wineTone(item.type)}`}>
      <div className="detail-title">
        <div>
          <p className="eyebrow">{t("wishlistDetail")}</p>
          <h2><i className={`wine-dot tone-${wineTone(item.type)}`} />{item.name}</h2>
          <span>{[item.producer, item.vintage, item.region, item.appellation].filter(Boolean).join(" - ")}</span>
        </div>
        <strong>{item.currency} {Number(item.target_price).toFixed(0)}</strong>
      </div>
      <div className="ai-actions">
        <button type="button" className="secondary compact" disabled={!canGenerate || Boolean(generating)} onClick={() => onGenerate("strategy")}>
          {generating === "strategy" ? t("generating") : t("aiStrategy")}
        </button>
        <button type="button" className="secondary compact" disabled={!canGenerate || Boolean(generating)} onClick={() => onGenerate("purpose")}>
          {generating === "purpose" ? t("generating") : t("aiPurpose")}
        </button>
        <button type="button" className="secondary compact" disabled={!canGenerate || Boolean(generating)} onClick={() => onGenerate("target-price")}>
          {generating === "target-price" ? t("generating") : t("aiTargetPrice")}
        </button>
      </div>
      <div className="detail-grid">
        <DetailField label={t("format")} value={item.format} />
        <DetailField label={t("type")} value={item.type} />
        <DetailField label={t("priority")} value={item.priority} />
        <DetailField label={t("purpose")} value={item.purpose} />
        <DetailField label={t("status")} value={item.status} />
        <DetailField label={t("merchant")} value={item.merchant} />
      </div>
      {item.notes ? (
        <div className="notes-grid">
          <DetailNote title={t("notes")}>{item.notes}</DetailNote>
        </div>
      ) : null}
      {item.ai_strategy || item.ai_purpose_advice ? (
        <div className="notes-grid">
          {item.ai_strategy ? <DetailNote title={t("aiStrategy")}>{readableLegacyAiText(item.ai_strategy, "strategy")}</DetailNote> : null}
          {item.ai_purpose_advice ? <DetailNote title={t("aiPurpose")}>{readableLegacyAiText(item.ai_purpose_advice, "purpose")}</DetailNote> : null}
        </div>
      ) : null}
    </section>
  );
}

function AiUsageRow({ label, bucket }: { label: string; bucket: AiUsageBucket }) {
  return (
    <div className="usage-row">
      <strong>{label}</strong>
      <span>{bucket.requests} req</span>
      <span>{bucket.total_tokens.toLocaleString()} tokens</span>
      <span>{formatUsd(bucket.estimated_cost_usd)}</span>
    </div>
  );
}

export function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [wines, setWines] = useState<Wine[]>([]);
  const [wishlist, setWishlist] = useState<WishlistItem[]>([]);
  const [householdMemberships, setHouseholdMemberships] = useState<HouseholdMembership[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [invites, setInvites] = useState<Invite[]>([]);
  const [aiAudit, setAiAudit] = useState<AiAuditLog[]>([]);
  const [aiUsage, setAiUsage] = useState<AiUsage | null>(null);
  const [aiSettings, setAiSettings] = useState<AiSettings | null>(null);
  const [aiSettingsDraft, setAiSettingsDraft] = useState<AiSettingsDraft>(emptyAiSettingsDraft);
  const [draft, setDraft] = useState<WineDraft>(emptyDraft);
  const [wishlistDraft, setWishlistDraft] = useState<WishlistDraft>(emptyWishlistDraft);
  const [authDraft, setAuthDraft] = useState<AuthDraft>(emptyAuthDraft);
  const [inviteDraft, setInviteDraft] = useState<InviteDraft>(emptyInviteDraft);
  const [acceptToken, setAcceptToken] = useState("");
  const [inviteToken, setInviteToken] = useState("");
  const [generatedInviteLink, setGeneratedInviteLink] = useState("");
  const [authMode, setAuthMode] = useState<"login" | "register">("login");
  const [activeView, setActiveView] = useState<"cellar" | "wishlist" | "settings">("cellar");
  const [selectedWineId, setSelectedWineId] = useState<string | null>(null);
  const [selectedWishlistId, setSelectedWishlistId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingWishlistId, setEditingWishlistId] = useState<string | null>(null);
  const [wineFormOpen, setWineFormOpen] = useState(false);
  const [wishlistFormOpen, setWishlistFormOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [tagFilter, setTagFilter] = useState("");
  const [sortMode, setSortMode] = useState<SortMode>("name");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [generatingAi, setGeneratingAi] = useState("");
  const [error, setError] = useState("");
  const [locale, setLocale] = useState<Locale>(() => (localStorage.getItem("winecellar_locale") === "it" ? "it" : "en"));
  const t = (key: TranslationKey) => translate(locale, key);

  function changeLocale(nextLocale: Locale) {
    setLocale(nextLocale);
    localStorage.setItem("winecellar_locale", nextLocale);
  }

  async function loadSession() {
    const nextSession = await api<Session>("/api/v1/session");
    setSession(nextSession);
    return nextSession;
  }

  async function loadWines() {
    const nextWines = await api<Wine[]>("/api/v1/wines");
    setWines(nextWines);
    setSelectedWineId((currentId) => (currentId && nextWines.some((wine) => wine.id === currentId) ? currentId : nextWines[0]?.id || null));
  }

  async function loadWishlist() {
    const nextWishlist = await api<WishlistItem[]>("/api/v1/wishlist");
    setWishlist(nextWishlist);
    setSelectedWishlistId((currentId) => (currentId && nextWishlist.some((item) => item.id === currentId) ? currentId : nextWishlist[0]?.id || null));
  }

  async function loadHouseholdData(role = session?.membership_role) {
    const [nextMemberships, nextMembers] = await Promise.all([
      api<HouseholdMembership[]>("/api/v1/household/memberships"),
      api<Member[]>("/api/v1/household/members"),
    ]);
    setHouseholdMemberships(nextMemberships);
    setMembers(nextMembers);
    if (role === "owner" || role === "admin") {
      setInvites(await api<Invite[]>("/api/v1/household/invites"));
    } else {
      setInvites([]);
    }
  }

  async function loadAiAudit(role = session?.membership_role) {
    if (role === "owner" || role === "admin" || role === "member") {
      setAiAudit(await api<AiAuditLog[]>("/api/v1/ai/audit"));
    } else {
      setAiAudit([]);
    }
  }

  async function loadAiUsage(role = session?.membership_role) {
    if (role === "owner" || role === "admin" || role === "member") {
      setAiUsage(await api<AiUsage>("/api/v1/ai/usage"));
    } else {
      setAiUsage(null);
    }
  }

  async function loadAiSettings(role = session?.membership_role) {
    if (role === "owner" || role === "admin" || role === "member") {
      const nextSettings = await api<AiSettings>("/api/v1/ai/settings");
      setAiSettings(nextSettings);
      setAiSettingsDraft({
        openai_api_key: "",
        ai_notes_model: nextSettings.ai_notes_model,
        drink_window_model: nextSettings.drink_window_model,
        value_model: nextSettings.value_model,
        grape_model: nextSettings.grape_model,
        wishlist_model: nextSettings.wishlist_model,
      });
    } else {
      setAiSettings(null);
      setAiSettingsDraft(emptyAiSettingsDraft);
    }
  }

  async function loadData() {
    setError("");
    const nextSession = await loadSession();
    if (nextSession.authenticated) {
      await Promise.all([loadWines(), loadWishlist(), loadHouseholdData(nextSession.membership_role), loadAiAudit(nextSession.membership_role), loadAiUsage(nextSession.membership_role), loadAiSettings(nextSession.membership_role)]);
    } else {
      setWines([]);
      setWishlist([]);
      setHouseholdMemberships([]);
      setMembers([]);
      setInvites([]);
      setAiAudit([]);
      setAiUsage(null);
      setAiSettings(null);
      setAiSettingsDraft(emptyAiSettingsDraft);
    }
  }

  useEffect(() => {
    const urlToken = tokenFromUrl();
    if (urlToken) {
      setAcceptToken(urlToken);
    }
    loadData()
      .catch((nextError) => setError(nextError instanceof Error ? nextError.message : "Unable to load data"))
      .finally(() => setLoading(false));
  }, []);

  async function submitAuth(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError("");
    try {
      const path = authMode === "register" ? "/api/v1/auth/register" : "/api/v1/auth/login";
      const payload =
        authMode === "register"
          ? authDraft
          : { email: authDraft.email, password: authDraft.password };
      const nextSession = await api<Session>(path, { method: "POST", body: JSON.stringify(payload) });
      setSession(nextSession);
      setAuthDraft(emptyAuthDraft);
      await Promise.all([loadWines(), loadWishlist(), loadHouseholdData(nextSession.membership_role), loadAiAudit(nextSession.membership_role), loadAiUsage(nextSession.membership_role), loadAiSettings(nextSession.membership_role)]);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Unable to authenticate");
    } finally {
      setSaving(false);
    }
  }

  async function logout() {
    setError("");
    await api<void>("/api/v1/auth/logout", { method: "POST" });
    setSession({ authenticated: false, user_display_name: null, user_email: null, active_household_name: null, membership_role: null });
    setWines([]);
    setWishlist([]);
    setHouseholdMemberships([]);
    setMembers([]);
    setDraft(emptyDraft);
    setWishlistDraft(emptyWishlistDraft);
    setEditingId(null);
    setEditingWishlistId(null);
    setSelectedWineId(null);
    setSelectedWishlistId(null);
    setWineFormOpen(false);
    setWishlistFormOpen(false);
    setAiAudit([]);
    setAiUsage(null);
    setAiSettings(null);
    setAiSettingsDraft(emptyAiSettingsDraft);
  }

  async function switchHousehold(householdId: string) {
    setError("");
    await api<Session>("/api/v1/household/switch", { method: "POST", body: JSON.stringify({ household_id: householdId }) });
    setDraft(emptyDraft);
    setWishlistDraft(emptyWishlistDraft);
    setEditingId(null);
    setEditingWishlistId(null);
    setSelectedWineId(null);
    setSelectedWishlistId(null);
    setWineFormOpen(false);
    setWishlistFormOpen(false);
    await loadData();
  }

  async function createInvite(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError("");
    setInviteToken("");
    setGeneratedInviteLink("");
    try {
      const invite = await api<{ invite_token: string }>("/api/v1/household/invites", {
        method: "POST",
        body: JSON.stringify(inviteDraft),
      });
      setInviteDraft(emptyInviteDraft);
      setInviteToken(invite.invite_token);
      setGeneratedInviteLink(inviteLink(invite.invite_token));
      await loadHouseholdData();
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Unable to create invite");
    } finally {
      setSaving(false);
    }
  }

  async function acceptInvite(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!acceptToken.trim()) return;
    setSaving(true);
    setError("");
    try {
      await api<void>("/api/v1/household/invites/accept", { method: "POST", body: JSON.stringify({ token: acceptToken.trim() }) });
      setAcceptToken("");
      window.history.replaceState(null, "", window.location.pathname);
      await loadData();
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Unable to accept invite");
    } finally {
      setSaving(false);
    }
  }

  async function updateMemberRole(member: Member, role: string) {
    setSaving(true);
    setError("");
    try {
      await api<Member>(`/api/v1/household/members/${member.membership_id}`, {
        method: "PATCH",
        body: JSON.stringify({ role }),
      });
      await loadData();
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Unable to update member");
    } finally {
      setSaving(false);
    }
  }

  async function removeMember(member: Member) {
    if (!window.confirm(`Remove ${member.display_name || member.email} from this household?`)) return;
    setSaving(true);
    setError("");
    try {
      await api<void>(`/api/v1/household/members/${member.membership_id}`, { method: "DELETE" });
      await loadHouseholdData();
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Unable to remove member");
    } finally {
      setSaving(false);
    }
  }

  async function revokeInvite(invite: Invite) {
    if (!window.confirm(`Revoke invite for ${invite.email}?`)) return;
    setSaving(true);
    setError("");
    try {
      await api<void>(`/api/v1/household/invites/${invite.id}`, { method: "DELETE" });
      await loadHouseholdData();
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Unable to revoke invite");
    } finally {
      setSaving(false);
    }
  }

  async function submitAiSettings(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError("");
    try {
      const payload = {
        ...aiSettingsDraft,
        openai_api_key: aiSettingsDraft.openai_api_key.trim() || undefined,
      };
      const nextSettings = await api<AiSettings>("/api/v1/ai/settings", { method: "PATCH", body: JSON.stringify(payload) });
      setAiSettings(nextSettings);
      setAiSettingsDraft({
        openai_api_key: "",
        ai_notes_model: nextSettings.ai_notes_model,
        drink_window_model: nextSettings.drink_window_model,
        value_model: nextSettings.value_model,
        grape_model: nextSettings.grape_model,
        wishlist_model: nextSettings.wishlist_model,
      });
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Unable to save AI settings");
    } finally {
      setSaving(false);
    }
  }

  async function submitWine(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!draft.name.trim()) return;
    setSaving(true);
    setError("");
    try {
      const payload = draftPayload(draft);
      if (editingId) {
        await api<Wine>(`/api/v1/wines/${editingId}`, { method: "PATCH", body: JSON.stringify(payload) });
      } else {
        await api<Wine>("/api/v1/wines", { method: "POST", body: JSON.stringify(payload) });
      }
      setDraft(emptyDraft);
      setEditingId(null);
      setSelectedWineId(null);
      setWineFormOpen(false);
      await loadWines();
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Unable to save wine");
    } finally {
      setSaving(false);
    }
  }

  async function submitWishlist(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!wishlistDraft.name.trim()) return;
    setSaving(true);
    setError("");
    try {
      const payload = wishlistPayload(wishlistDraft);
      if (editingWishlistId) {
        await api<WishlistItem>(`/api/v1/wishlist/${editingWishlistId}`, { method: "PATCH", body: JSON.stringify(payload) });
      } else {
        await api<WishlistItem>("/api/v1/wishlist", { method: "POST", body: JSON.stringify(payload) });
      }
      setWishlistDraft(emptyWishlistDraft);
      setEditingWishlistId(null);
      setWishlistFormOpen(false);
      await loadWishlist();
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Unable to save wishlist item");
    } finally {
      setSaving(false);
    }
  }

  async function importLegacyFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setSaving(true);
    setError("");
    try {
      const payload = JSON.parse(await file.text());
      await api<{ wines_imported: number; wishlist_imported: number }>("/api/v1/imports/legacy-json", {
        method: "POST",
        body: JSON.stringify(payload),
      });
      await Promise.all([loadWines(), loadWishlist()]);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Unable to import legacy export");
    } finally {
      setSaving(false);
      event.target.value = "";
    }
  }

  async function deleteWine(wine: Wine) {
    setError("");
    await api<void>(`/api/v1/wines/${wine.id}`, { method: "DELETE" });
    if (editingId === wine.id) {
      setEditingId(null);
      setDraft(emptyDraft);
    }
    await loadWines();
  }

  async function deleteWishlistItem(item: WishlistItem) {
    if (!window.confirm(`Delete ${item.name} from wishlist?`)) return;
    setError("");
    await api<void>(`/api/v1/wishlist/${item.id}`, { method: "DELETE" });
    if (editingWishlistId === item.id) {
      setEditingWishlistId(null);
      setWishlistDraft(emptyWishlistDraft);
      setWishlistFormOpen(false);
    }
    await loadWishlist();
  }

  async function convertWishlistItem(item: WishlistItem) {
    if (!window.confirm(`Convert ${item.name} to an ordered wine?`)) return;
    setSaving(true);
    setError("");
    try {
      await api<{ wine_id: string }>(`/api/v1/wishlist/${item.id}/convert`, { method: "POST" });
      setWishlistFormOpen(false);
      setEditingWishlistId(null);
      await Promise.all([loadWines(), loadWishlist()]);
      setActiveView("cellar");
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Unable to convert wishlist item");
    } finally {
      setSaving(false);
    }
  }

  async function generateWineAi(wine: Wine, feature: "notes" | "drink-window" | "value" | "grapes") {
    setGeneratingAi(feature);
    setError("");
    try {
      const updated = await api<Wine>(`/api/v1/ai/wines/${wine.id}/${feature}`, { method: "POST" });
      setWines((current) => current.map((item) => (item.id === updated.id ? updated : item)));
      setSelectedWineId(updated.id);
      await Promise.all([loadAiAudit(), loadAiUsage()]);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Unable to generate AI content");
    } finally {
      setGeneratingAi("");
    }
  }

  async function generateWishlistAi(item: WishlistItem, feature: "strategy" | "purpose" | "target-price") {
    setGeneratingAi(`wishlist-${feature}`);
    setError("");
    try {
      const updated = await api<WishlistItem>(`/api/v1/ai/wishlist/${item.id}/${feature}`, { method: "POST" });
      setWishlist((current) => current.map((nextItem) => (nextItem.id === updated.id ? updated : nextItem)));
      setSelectedWishlistId(updated.id);
      await Promise.all([loadAiAudit(), loadAiUsage()]);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Unable to generate wishlist strategy");
    } finally {
      setGeneratingAi("");
    }
  }

  const authenticated = Boolean(session?.authenticated);
  const activeMembership = householdMemberships.find((membership) => membership.household_name === session?.active_household_name);
  const canAdmin = session?.membership_role === "owner" || session?.membership_role === "admin";
  const canWriteWine = canAdmin || session?.membership_role === "member";
  const canGenerateAi = canWriteWine && Boolean(aiSettings?.has_openai_api_key);
  const currentUserEmail = session?.user_email?.toLowerCase();
  const selectedWine = wines.find((wine) => wine.id === selectedWineId) || null;
  const selectedWishlistItem = wishlist.find((item) => item.id === selectedWishlistId) || null;
  const normalizedQuery = searchQuery.trim().toLowerCase();
  const wineTypeOptions = uniqueSorted(wines.map((wine) => wine.type));
  const wishlistTypeOptions = uniqueSorted(wishlist.map((item) => item.type));
  const wineStatusOptions = uniqueSorted(wines.map((wine) => wine.status));
  const wishlistStatusOptions = uniqueSorted(wishlist.map((item) => item.status));
  const tagOptions = uniqueSorted(wines.flatMap((wine) => wine.tags));
  const activeTypeOptions = activeView === "cellar" ? wineTypeOptions : wishlistTypeOptions;
  const activeStatusOptions = activeView === "cellar" ? wineStatusOptions : wishlistStatusOptions;
  const filteredWines = wines
    .filter((wine) => !normalizedQuery || wineSearchText(wine).includes(normalizedQuery))
    .filter((wine) => !typeFilter || wine.type === typeFilter)
    .filter((wine) => !statusFilter || wine.status === statusFilter)
    .filter((wine) => !tagFilter || wine.tags.includes(tagFilter))
    .sort((first, second) => {
      if (sortMode === "vintage") return (Number(second.vintage) || 0) - (Number(first.vintage) || 0);
      if (sortMode === "value") return Number(second.current_value || second.price || 0) - Number(first.current_value || first.price || 0);
      if (sortMode === "drink_window") return (first.drink_from || 9999) - (second.drink_from || 9999);
      return first.name.localeCompare(second.name);
    });
  const filteredWishlist = wishlist
    .filter((item) => !normalizedQuery || wishlistSearchText(item).includes(normalizedQuery))
    .filter((item) => !typeFilter || item.type === typeFilter)
    .filter((item) => !statusFilter || item.status === statusFilter)
    .sort((first, second) => {
      if (sortMode === "vintage") return (Number(second.vintage) || 0) - (Number(first.vintage) || 0);
      if (sortMode === "value") return Number(second.target_price || 0) - Number(first.target_price || 0);
      return first.name.localeCompare(second.name);
    });
  const visibleCount = activeView === "cellar" ? filteredWines.length : filteredWishlist.length;
  const currentYear = new Date().getFullYear();
  const now = new Date();
  const cellarStats = {
    bottles: wines.reduce((total, wine) => total + wine.quantity, 0),
    totalValue: sumWineValue(wines),
    drinkNow: wines.filter((wine) => wine.drink_from && wine.drink_to && wine.drink_from <= currentYear && wine.drink_to >= currentYear).length,
    drinkSoon: wines.filter((wine) => wine.drink_from && wine.drink_from > currentYear && wine.drink_from <= currentYear + 2).length,
    pastWindow: wines.filter((wine) => wine.drink_to && wine.drink_to < currentYear).length,
    futureDeliveries: wines.filter((wine) => wine.expected_delivery && new Date(wine.expected_delivery) >= now).length,
    nextDelivery: wines
      .map((wine) => (wine.expected_delivery ? { wine, days: daysUntil(wine.expected_delivery) } : null))
      .filter((item): item is { wine: Wine; days: number } => Boolean(item && item.days !== null && item.days >= 0))
      .sort((first, second) => first.days - second.days)[0],
    missingValue: wines.filter((wine) => !wine.current_value).length,
    missingDrinkWindow: wines.filter((wine) => !wine.drink_from || !wine.drink_to).length,
    missingScores: wines.filter((wine) => wine.scores.length === 0).length,
    aiNotes: wines.filter((wine) => wine.ai_notes || wine.ai_value_notes).length,
  };
  const wishlistStats = {
    count: wishlist.length,
    targetValue: wishlist.reduce((total, item) => total + Number(item.target_price || 0), 0),
    highPriority: wishlist.filter((item) => item.priority.toLowerCase() === "high").length,
    readyToBuy: wishlist.filter((item) => ["buy", "approved", "ready"].some((word) => item.status.toLowerCase().includes(word))).length,
  };
  const valueByType = topWineValueGroups(wines, "type");
  const valueByRegion = topWineValueGroups(wines, "region");

  function startAddWine() {
    setDraft(emptyDraft);
    setEditingId(null);
    setWineFormOpen(true);
  }

  function startAddWishlistItem() {
    setWishlistDraft(emptyWishlistDraft);
    setEditingWishlistId(null);
    setWishlistFormOpen(true);
  }

  function startEditWine(wine: Wine) {
    setSelectedWineId(wine.id);
    setEditingId(wine.id);
    setDraft(wineToDraft(wine));
    setWineFormOpen(true);
  }

  function startEditWishlistItem(item: WishlistItem) {
    setSelectedWishlistId(item.id);
    setEditingWishlistId(item.id);
    setWishlistDraft(wishlistToDraft(item));
    setWishlistFormOpen(true);
  }

  function closeWineForm() {
    setEditingId(null);
    setDraft(emptyDraft);
    setWineFormOpen(false);
  }

  function closeWishlistForm() {
    setEditingWishlistId(null);
    setWishlistDraft(emptyWishlistDraft);
    setWishlistFormOpen(false);
  }

  function clearFilters() {
    setSearchQuery("");
    setTypeFilter("");
    setStatusFilter("");
    setTagFilter("");
    setSortMode("name");
  }

  function aiEntityName(entry: AiAuditLog) {
    if (entry.entity_type === "wine") return wines.find((wine) => wine.id === entry.entity_id)?.name || entry.entity_type;
    if (entry.entity_type === "wishlist") return wishlist.find((item) => item.id === entry.entity_id)?.name || entry.entity_type;
    return entry.entity_type;
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">WineCellarMulti</p>
          <h1>{session?.active_household_name || "Wine Cellar"}</h1>
        </div>
        {authenticated ? (
          <div className="session-pill">
            <strong>{session?.user_display_name || session?.user_email}</strong>
            {householdMemberships.length > 1 ? (
              <select
                value={activeMembership?.household_id || ""}
                onChange={(event) => switchHousehold(event.target.value).catch((nextError) => setError(nextError instanceof Error ? nextError.message : "Unable to switch household"))}
              >
                {householdMemberships.map((membership) => (
                  <option key={membership.membership_id} value={membership.household_id}>
                    {membership.household_name}
                  </option>
                ))}
              </select>
            ) : null}
            <span>{session?.membership_role}</span>
            <label className="language-switch">
              <span>{t("language")}</span>
              <select value={locale} onChange={(event) => changeLocale(event.target.value as Locale)}>
                <option value="en">EN</option>
                <option value="it">IT</option>
              </select>
            </label>
            <button type="button" className="secondary compact" onClick={() => logout().catch((nextError) => setError(nextError instanceof Error ? nextError.message : "Unable to logout"))}>
              {t("logout")}
            </button>
          </div>
        ) : (
          <label className="language-switch">
            <span>{t("language")}</span>
            <select value={locale} onChange={(event) => changeLocale(event.target.value as Locale)}>
              <option value="en">EN</option>
              <option value="it">IT</option>
            </select>
          </label>
        )}
      </header>

      {error ? <p className="error-banner">{error}</p> : null}

      {!authenticated ? (
        <section className="auth-panel">
          {acceptToken ? (
            <div className="invite-notice">
              <strong>{t("inviteLinkDetected")}</strong>
              <span>{t("inviteLinkHelp")}</span>
            </div>
          ) : null}
          <div className="auth-tabs">
            <button type="button" className={authMode === "login" ? "" : "secondary"} onClick={() => setAuthMode("login")}>{t("login")}</button>
            <button type="button" className={authMode === "register" ? "" : "secondary"} onClick={() => setAuthMode("register")}>{t("register")}</button>
          </div>
          <form className="wine-form" onSubmit={submitAuth}>
            <h2>{authMode === "register" ? t("createAccount") : t("login")}</h2>
            <label>
              <span>{t("email")}</span>
              <input type="email" value={authDraft.email} onChange={(event) => setAuthDraft({ ...authDraft, email: event.target.value })} required />
            </label>
            {authMode === "register" ? (
              <>
                <label>
                  <span>{t("name")}</span>
                  <input value={authDraft.display_name} onChange={(event) => setAuthDraft({ ...authDraft, display_name: event.target.value })} required />
                </label>
                <label>
                  <span>{t("household")}</span>
                  <input value={authDraft.household_name} onChange={(event) => setAuthDraft({ ...authDraft, household_name: event.target.value })} required />
                </label>
              </>
            ) : null}
            <label>
              <span>{t("password")}</span>
              <input type="password" value={authDraft.password} onChange={(event) => setAuthDraft({ ...authDraft, password: event.target.value })} minLength={authMode === "register" ? 8 : 1} required />
            </label>
            <button type="submit" disabled={saving}>{saving ? t("working") : authMode === "register" ? t("createAccount") : t("login")}</button>
          </form>
        </section>
      ) : (
        <section className={`workspace ${activeView === "settings" ? "settings-workspace" : "content-workspace"}`}>
          <div className="view-tabs">
            <button type="button" className={activeView === "cellar" ? "" : "secondary"} onClick={() => { setActiveView("cellar"); setWishlistFormOpen(false); clearFilters(); }}>
              {t("cellar")} ({wines.length})
            </button>
            <button type="button" className={activeView === "wishlist" ? "" : "secondary"} onClick={() => { setActiveView("wishlist"); setWineFormOpen(false); clearFilters(); }}>
              {t("wishlist")} ({wishlist.length})
            </button>
            <button type="button" className={activeView === "settings" ? "" : "secondary"} onClick={() => { setActiveView("settings"); setWineFormOpen(false); setWishlistFormOpen(false); clearFilters(); }}>
              {t("settings")}
            </button>
          </div>
          {activeView !== "settings" ? (
          <aside className="wine-side-panel">
            {activeView === "cellar" ? (
              <div className="side-panel-actions">
                <button type="button" onClick={startAddWine} disabled={!canWriteWine}>
                  {t("addWine")}
                </button>
                {selectedWine && !wineFormOpen ? (
                  <button type="button" className="secondary" onClick={() => startEditWine(selectedWine)} disabled={!canWriteWine}>
                    {t("editSelected")}
                  </button>
                ) : null}
              </div>
            ) : (
              <div className="side-panel-actions">
                <button type="button" onClick={startAddWishlistItem} disabled={!canWriteWine}>
                  {t("addWishlist")}
                </button>
                {selectedWishlistItem && !wishlistFormOpen ? (
                  <>
                    <button type="button" className="secondary" onClick={() => startEditWishlistItem(selectedWishlistItem)} disabled={!canWriteWine}>
                      {t("editSelected")}
                    </button>
                    <button type="button" onClick={() => convertWishlistItem(selectedWishlistItem)} disabled={!canWriteWine || saving}>
                      {t("convert")}
                    </button>
                  </>
                ) : null}
              </div>
            )}
            {activeView === "cellar" && wineFormOpen ? (
              <form className="wine-form" onSubmit={submitWine}>
                <h2>{editingId ? t("editWine") : t("addWine")}</h2>
                {!canWriteWine ? <p className="empty-state">{t("viewerReadOnly")}</p> : null}
                <label>
                  <span>{t("name")}</span>
                  <input value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} required disabled={!canWriteWine} />
                </label>
                <label>
                  <span>{t("producer")}</span>
                  <input value={draft.producer} onChange={(event) => setDraft({ ...draft, producer: event.target.value })} disabled={!canWriteWine} />
                </label>
                <div className="form-row">
                  <label>
                    <span>{t("format")}</span>
                    <input value={draft.format} onChange={(event) => setDraft({ ...draft, format: event.target.value })} disabled={!canWriteWine} />
                  </label>
                  <label>
                    <span>{t("type")}</span>
                    <input value={draft.type} onChange={(event) => setDraft({ ...draft, type: event.target.value })} disabled={!canWriteWine} />
                  </label>
                </div>
                <div className="form-row">
                  <label>
                    <span>{t("region")}</span>
                    <input value={draft.region} onChange={(event) => setDraft({ ...draft, region: event.target.value })} disabled={!canWriteWine} />
                  </label>
                  <label>
                    <span>{t("appellation")}</span>
                    <input value={draft.appellation} onChange={(event) => setDraft({ ...draft, appellation: event.target.value })} disabled={!canWriteWine} />
                  </label>
                </div>
                <div className="form-row">
                  <label>
                    <span>{t("vintage")}</span>
                    <input value={draft.vintage} onChange={(event) => setDraft({ ...draft, vintage: event.target.value })} disabled={!canWriteWine} />
                  </label>
                  <label>
                    <span>{t("quantity")}</span>
                    <input type="number" min="0" value={draft.quantity} onChange={(event) => setDraft({ ...draft, quantity: event.target.value })} disabled={!canWriteWine} />
                  </label>
                </div>
                <div className="form-row">
                  <label>
                    <span>{t("purchasePrice")}</span>
                    <input type="number" min="0" step="0.01" value={draft.price} onChange={(event) => setDraft({ ...draft, price: event.target.value })} disabled={!canWriteWine} />
                  </label>
                  <label>
                    <span>{t("currentValue")}</span>
                    <input type="number" min="0" step="0.01" value={draft.current_value} onChange={(event) => setDraft({ ...draft, current_value: event.target.value })} disabled={!canWriteWine} />
                  </label>
                </div>
                <div className="form-row">
                  <label>
                    <span>{t("currency")}</span>
                    <input value={draft.currency} onChange={(event) => setDraft({ ...draft, currency: event.target.value })} disabled={!canWriteWine} />
                  </label>
                  <label>
                    <span>{t("merchant")}</span>
                    <input value={draft.merchant} onChange={(event) => setDraft({ ...draft, merchant: event.target.value })} disabled={!canWriteWine} />
                  </label>
                </div>
                <div className="form-row">
                  <label>
                    <span>{t("status")}</span>
                    <select value={draft.status} onChange={(event) => setDraft({ ...draft, status: event.target.value })} disabled={!canWriteWine}>
                      <option>Ordered</option>
                      <option>Shipped</option>
                      <option>Delivered</option>
                      <option>Consumed</option>
                    </select>
                  </label>
                  <label>
                    <span>{t("orderDate")}</span>
                    <input type="date" value={draft.order_date} onChange={(event) => setDraft({ ...draft, order_date: event.target.value })} disabled={!canWriteWine} />
                  </label>
                  <label>
                    <span>{t("delivery")}</span>
                    <input type="date" value={draft.expected_delivery} onChange={(event) => setDraft({ ...draft, expected_delivery: event.target.value })} disabled={!canWriteWine} />
                  </label>
                </div>
                <label>
                  <span>{t("notes")}</span>
                  <textarea value={draft.notes} onChange={(event) => setDraft({ ...draft, notes: event.target.value })} rows={3} disabled={!canWriteWine} />
                </label>
                <div className="form-actions">
                  <button type="submit" disabled={saving || !canWriteWine}>{saving ? t("saving") : editingId ? t("saveChanges") : t("createWine")}</button>
                  <button type="button" className="secondary" onClick={closeWineForm}>
                    {t("cancel")}
                  </button>
                </div>
              </form>
            ) : activeView === "wishlist" && wishlistFormOpen ? (
              <form className="wine-form" onSubmit={submitWishlist}>
                <h2>{editingWishlistId ? t("editWishlist") : t("addWishlist")}</h2>
                <label>
                  <span>{t("name")}</span>
                  <input value={wishlistDraft.name} onChange={(event) => setWishlistDraft({ ...wishlistDraft, name: event.target.value })} required disabled={!canWriteWine} />
                </label>
                <label>
                  <span>{t("producer")}</span>
                  <input value={wishlistDraft.producer} onChange={(event) => setWishlistDraft({ ...wishlistDraft, producer: event.target.value })} disabled={!canWriteWine} />
                </label>
                <div className="form-row">
                  <label>
                    <span>{t("vintage")}</span>
                    <input value={wishlistDraft.vintage} onChange={(event) => setWishlistDraft({ ...wishlistDraft, vintage: event.target.value })} disabled={!canWriteWine} />
                  </label>
                  <label>
                    <span>{t("targetPrice")}</span>
                    <input type="number" min="0" step="0.01" value={wishlistDraft.target_price} onChange={(event) => setWishlistDraft({ ...wishlistDraft, target_price: event.target.value })} disabled={!canWriteWine} />
                  </label>
                </div>
                <div className="form-row">
                  <label>
                    <span>{t("format")}</span>
                    <input value={wishlistDraft.format} onChange={(event) => setWishlistDraft({ ...wishlistDraft, format: event.target.value })} disabled={!canWriteWine} />
                  </label>
                  <label>
                    <span>{t("type")}</span>
                    <input value={wishlistDraft.type} onChange={(event) => setWishlistDraft({ ...wishlistDraft, type: event.target.value })} disabled={!canWriteWine} />
                  </label>
                </div>
                <div className="form-row">
                  <label>
                    <span>{t("region")}</span>
                    <input value={wishlistDraft.region} onChange={(event) => setWishlistDraft({ ...wishlistDraft, region: event.target.value })} disabled={!canWriteWine} />
                  </label>
                  <label>
                    <span>{t("appellation")}</span>
                    <input value={wishlistDraft.appellation} onChange={(event) => setWishlistDraft({ ...wishlistDraft, appellation: event.target.value })} disabled={!canWriteWine} />
                  </label>
                </div>
                <div className="form-row">
                  <label>
                    <span>{t("currency")}</span>
                    <input value={wishlistDraft.currency} onChange={(event) => setWishlistDraft({ ...wishlistDraft, currency: event.target.value })} disabled={!canWriteWine} />
                  </label>
                  <label>
                    <span>{t("merchant")}</span>
                    <input value={wishlistDraft.merchant} onChange={(event) => setWishlistDraft({ ...wishlistDraft, merchant: event.target.value })} disabled={!canWriteWine} />
                  </label>
                </div>
                <div className="form-row">
                  <label>
                    <span>{t("priority")}</span>
                    <select value={wishlistDraft.priority} onChange={(event) => setWishlistDraft({ ...wishlistDraft, priority: event.target.value })} disabled={!canWriteWine}>
                      <option>High</option>
                      <option>Medium</option>
                      <option>Low</option>
                    </select>
                  </label>
                  <label>
                    <span>{t("purpose")}</span>
                    <select value={wishlistDraft.purpose} onChange={(event) => setWishlistDraft({ ...wishlistDraft, purpose: event.target.value })} disabled={!canWriteWine}>
                      <option>Drink</option>
                      <option>Cellar</option>
                      <option>Invest</option>
                      <option>Gift</option>
                      <option>Compare</option>
                    </select>
                  </label>
                </div>
                <label>
                  <span>{t("status")}</span>
                  <select value={wishlistDraft.status} onChange={(event) => setWishlistDraft({ ...wishlistDraft, status: event.target.value })} disabled={!canWriteWine}>
                    <option>Evaluate</option>
                    <option>Monitor</option>
                    <option>Buy</option>
                    <option>GoodPrice</option>
                    <option>Skipped</option>
                  </select>
                </label>
                <label>
                  <span>{t("notes")}</span>
                  <textarea value={wishlistDraft.notes} onChange={(event) => setWishlistDraft({ ...wishlistDraft, notes: event.target.value })} rows={3} disabled={!canWriteWine} />
                </label>
                <div className="form-actions">
                  <button type="submit" disabled={saving || !canWriteWine}>{saving ? t("saving") : editingWishlistId ? t("saveChanges") : t("createWishlist")}</button>
                  <button type="button" className="secondary" onClick={closeWishlistForm}>
                    {t("cancel")}
                  </button>
                </div>
              </form>
            ) : activeView === "cellar" && selectedWine ? (
              <WineDetail
                wine={selectedWine}
                canGenerate={canGenerateAi}
                generating={generatingAi}
                onGenerate={(feature) => generateWineAi(selectedWine, feature)}
                t={t}
              />
            ) : activeView === "wishlist" && selectedWishlistItem ? (
                <WishlistDetail
                  item={selectedWishlistItem}
                  canGenerate={canGenerateAi}
                  generating={generatingAi.startsWith("wishlist-") ? generatingAi.replace("wishlist-", "") : ""}
                  onGenerate={(feature) => generateWishlistAi(selectedWishlistItem, feature)}
                  t={t}
                />
            ) : (
              <div className="wine-detail empty-detail">
                <h2>{t("noItemSelected")}</h2>
                <p>{t("selectItemHelp")}</p>
              </div>
            )}
          </aside>
          ) : null}

          {activeView !== "settings" ? (
          <section className="wine-list" aria-busy={loading}>
            {activeView === "cellar" ? (
              <section className="stats-panel">
                <div className="stat-card">
                  <span>{t("totalValue")}</span>
                  <strong>CHF {cellarStats.totalValue.toFixed(0)}</strong>
                </div>
                <div className="stat-card">
                  <span>{t("bottles")}</span>
                  <strong>{cellarStats.bottles}</strong>
                </div>
                <div className="stat-card">
                  <span>{t("drinkNow")}</span>
                  <strong>{cellarStats.drinkNow}</strong>
                </div>
                <div className="stat-card">
                  <span>{t("drinkIn2Years")}</span>
                  <strong>{cellarStats.drinkSoon}</strong>
                </div>
                <div className="stat-card">
                  <span>{t("pastWindow")}</span>
                  <strong>{cellarStats.pastWindow}</strong>
                </div>
                <div className="stat-card">
                  <span>{t("futureDeliveries")}</span>
                  <strong>{cellarStats.futureDeliveries}</strong>
                  {cellarStats.nextDelivery ? <p>{cellarStats.nextDelivery.wine.name}: {cellarStats.nextDelivery.days} days</p> : null}
                </div>
                <div className="stat-card compact-list">
                  <span>{t("dataQuality")}</span>
                  <p>{t("missingValue")}: <strong>{cellarStats.missingValue}</strong></p>
                  <p>{t("missingDrinkWindow")}: <strong>{cellarStats.missingDrinkWindow}</strong></p>
                  <p>{t("missingScores")}: <strong>{cellarStats.missingScores}</strong></p>
                </div>
                {valueByType.length ? (
                  <div className="stat-card compact-list type-breakdown">
                    <span>{t("valueByType")}</span>
                    {valueByType.map((item) => (
                      <p key={item.label}>
                        <i className={`wine-dot tone-${wineTone(item.label)}`} />
                        {item.label}: CHF {item.value.toFixed(0)}
                      </p>
                    ))}
                  </div>
                ) : null}
                {valueByRegion.length ? (
                  <div className="stat-card compact-list type-breakdown">
                    <span>{t("topRegions")}</span>
                    {valueByRegion.map((item) => (
                      <p key={item.label}>{item.label}: CHF {item.value.toFixed(0)}</p>
                    ))}
                  </div>
                ) : null}
                <div className="stat-card compact-list ai-card">
                  <span>{t("aiReadiness")}</span>
                  <strong>{cellarStats.aiNotes} / {wines.length}</strong>
                  <p>{t("aiReadinessHelp")}</p>
                </div>
              </section>
            ) : (
              <section className="stats-panel">
                <div className="stat-card">
                  <span>{t("wishlistItems")}</span>
                  <strong>{wishlistStats.count}</strong>
                </div>
                <div className="stat-card">
                  <span>{t("targetValue")}</span>
                  <strong>CHF {wishlistStats.targetValue.toFixed(0)}</strong>
                </div>
                <div className="stat-card">
                  <span>{t("highPriority")}</span>
                  <strong>{wishlistStats.highPriority}</strong>
                </div>
                <div className="stat-card">
                  <span>{t("readyToBuy")}</span>
                  <strong>{wishlistStats.readyToBuy}</strong>
                </div>
              </section>
            )}
            <div className="filter-panel">
              <label>
                <span>{t("search")}</span>
                <input value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} placeholder={t("searchPlaceholder")} />
              </label>
              <div className="filter-row">
                <label>
                  <span>{t("type")}</span>
                  <select value={typeFilter} onChange={(event) => setTypeFilter(event.target.value)}>
                    <option value="">{t("allTypes")}</option>
                    {activeTypeOptions.map((type) => <option key={type} value={type}>{type}</option>)}
                  </select>
                </label>
                <label>
                  <span>{t("status")}</span>
                  <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
                    <option value="">{t("allStatuses")}</option>
                    {activeStatusOptions.map((status) => <option key={status} value={status}>{status}</option>)}
                  </select>
                </label>
              </div>
              <div className="filter-row">
                {activeView === "cellar" ? (
                  <label>
                    <span>{t("tag")}</span>
                    <select value={tagFilter} onChange={(event) => setTagFilter(event.target.value)}>
                      <option value="">{t("allTags")}</option>
                      {tagOptions.map((tag) => <option key={tag} value={tag}>{tag}</option>)}
                    </select>
                  </label>
                ) : null}
                <label>
                  <span>{t("sort")}</span>
                  <select value={sortMode} onChange={(event) => setSortMode(event.target.value as SortMode)}>
                    <option value="name">{t("name")}</option>
                    <option value="vintage">{t("vintage")}</option>
                    <option value="value">{t("value")}</option>
                    {activeView === "cellar" ? <option value="drink_window">{t("drinkWindow")}</option> : null}
                  </select>
                </label>
              </div>
              <button type="button" className="secondary compact" onClick={clearFilters}>
                {t("clearFilters")}
              </button>
            </div>
            <div className="list-header">
              <h2>{activeView === "cellar" ? t("wines") : t("wishlist")}</h2>
              <span>{visibleCount} / {activeView === "cellar" ? wines.length : wishlist.length} {t("records")}</span>
            </div>
            {loading ? <p className="empty-state">{t("loadingData")}</p> : null}
            {!loading && activeView === "cellar" && filteredWines.length === 0 ? <p className="empty-state">{t("noWineMatch")}</p> : null}
            {!loading && activeView === "wishlist" && filteredWishlist.length === 0 ? <p className="empty-state">{t("noWishlistMatch")}</p> : null}
            {activeView === "cellar" ? filteredWines.map((wine) => (
              <article className={`${selectedWineId === wine.id ? "wine-row selected" : "wine-row"} tone-${wineTone(wine.type)}`} key={wine.id} onClick={() => setSelectedWineId(wine.id)}>
                <div>
                  <h3><i className={`wine-dot tone-${wineTone(wine.type)}`} />{wine.name} <small>{wine.vintage}</small></h3>
                  <p className="row-primary">{wine.producer || t("noProducer")} - {wine.quantity}x - {wine.status}</p>
                  <p className="row-secondary">{[wine.format, wine.type, wine.region, wine.appellation].filter(Boolean).join(" - ")}</p>
                  <div className="row-meta">
                    {wine.tags.slice(0, 2).map((tag) => <span key={tag}>{tag}</span>)}
                    {wine.scores.slice(0, 2).map((score) => <span key={`${score.critic}-${score.score}`}>{score.critic} {score.score}</span>)}
                    {wine.drink_from && wine.drink_to ? <span>{wine.drink_from}-{wine.drink_to}</span> : null}
                  </div>
                </div>
                <strong>{wine.currency} {Number(wine.current_value || wine.price).toFixed(0)}</strong>
                <div className="row-actions">
                  <button type="button" className="secondary" disabled={!canWriteWine} onClick={(event) => { event.stopPropagation(); startEditWine(wine); }}>
                    {t("edit")}
                  </button>
                  <button type="button" className="danger" disabled={!canAdmin} onClick={(event) => { event.stopPropagation(); deleteWine(wine).catch((nextError) => setError(nextError instanceof Error ? nextError.message : "Unable to delete wine")); }}>
                    {t("delete")}
                  </button>
                </div>
              </article>
            )) : filteredWishlist.map((item) => (
              <article className={`${selectedWishlistId === item.id ? "wine-row selected" : "wine-row"} tone-${wineTone(item.type)}`} key={item.id} onClick={() => setSelectedWishlistId(item.id)}>
                <div>
                  <h3><i className={`wine-dot tone-${wineTone(item.type)}`} />{item.name} <small>{item.vintage}</small></h3>
                  <p className="row-primary">{item.producer || t("noProducer")} - {item.purpose} - {item.status}</p>
                  <p className="row-secondary">{[item.format, item.type, item.region, item.appellation].filter(Boolean).join(" - ")}</p>
                  <div className="row-meta">
                    {item.merchant ? <span>{item.merchant}</span> : null}
                    {item.notes ? <span>{item.notes}</span> : null}
                  </div>
                </div>
                <strong>{item.currency} {Number(item.target_price).toFixed(0)}</strong>
                <div className="row-actions">
                  <span className="priority-chip">{item.priority}</span>
                  <button type="button" className="secondary" disabled={!canWriteWine} onClick={(event) => { event.stopPropagation(); startEditWishlistItem(item); }}>
                    {t("edit")}
                  </button>
                  <button type="button" disabled={!canWriteWine || saving} onClick={(event) => { event.stopPropagation(); convertWishlistItem(item); }}>
                    {t("convert")}
                  </button>
                  <button type="button" className="danger" disabled={!canAdmin} onClick={(event) => { event.stopPropagation(); deleteWishlistItem(item).catch((nextError) => setError(nextError instanceof Error ? nextError.message : "Unable to delete wishlist item")); }}>
                    {t("delete")}
                  </button>
                </div>
              </article>
            ))}
          </section>
          ) : null}

          {activeView === "settings" ? (
          <aside className="team-panel">
            <div className="inline-form">
              <h2>{t("profileSection")}</h2>
              <label>
                <span>{t("language")}</span>
                <select value={locale} onChange={(event) => changeLocale(event.target.value as Locale)}>
                  <option value="en">EN</option>
                  <option value="it">IT</option>
                </select>
              </label>
            </div>

            {canWriteWine ? (
              <form className="inline-form" onSubmit={submitAiSettings}>
                <h2>{t("aiSettings")}</h2>
                <p className="empty-state">{aiSettings?.has_openai_api_key ? t("configured") : t("noApiKey")}</p>
                <label>
                  <span>OpenAI API key</span>
                  <input
                    type="password"
                    value={aiSettingsDraft.openai_api_key}
                    onChange={(event) => setAiSettingsDraft({ ...aiSettingsDraft, openai_api_key: event.target.value })}
                    placeholder={aiSettings?.has_openai_api_key ? t("configured") : "sk-..."}
                  />
                </label>
                <div className="form-row">
                  <label>
                    <span>{t("aiNotes")}</span>
                    <select value={aiSettingsDraft.ai_notes_model} onChange={(event) => setAiSettingsDraft({ ...aiSettingsDraft, ai_notes_model: event.target.value })}>
                      {(aiSettings?.model_options || []).map((model) => <option key={model} value={model}>{model}</option>)}
                    </select>
                  </label>
                  <label>
                    <span>{t("drinkWindow")}</span>
                    <select value={aiSettingsDraft.drink_window_model} onChange={(event) => setAiSettingsDraft({ ...aiSettingsDraft, drink_window_model: event.target.value })}>
                      {(aiSettings?.model_options || []).map((model) => <option key={model} value={model}>{model}</option>)}
                    </select>
                  </label>
                </div>
                <div className="form-row">
                  <label>
                    <span>{t("value")}</span>
                    <select value={aiSettingsDraft.value_model} onChange={(event) => setAiSettingsDraft({ ...aiSettingsDraft, value_model: event.target.value })}>
                      {(aiSettings?.model_options || []).map((model) => <option key={model} value={model}>{model}</option>)}
                    </select>
                  </label>
                  <label>
                    <span>{t("grapes")}</span>
                    <select value={aiSettingsDraft.grape_model} onChange={(event) => setAiSettingsDraft({ ...aiSettingsDraft, grape_model: event.target.value })}>
                      {(aiSettings?.model_options || []).map((model) => <option key={model} value={model}>{model}</option>)}
                    </select>
                  </label>
                </div>
                <label>
                  <span>{t("wishlist")}</span>
                  <select value={aiSettingsDraft.wishlist_model} onChange={(event) => setAiSettingsDraft({ ...aiSettingsDraft, wishlist_model: event.target.value })}>
                    {(aiSettings?.model_options || []).map((model) => <option key={model} value={model}>{model}</option>)}
                  </select>
                </label>
                <button type="submit" disabled={saving}>{saving ? t("saving") : t("saveSettings")}</button>
              </form>
            ) : null}

            {canWriteWine ? (
              <div className="inline-form">
                <h2>{t("aiUsage")}</h2>
                <p className="empty-state">{t("estimatedCost")}: {aiUsage ? formatUsd(aiUsage.all_time.estimated_cost_usd) : formatUsd(0)}</p>
                {aiUsage && aiUsage.all_time.requests > 0 ? (
                  <div className="usage-list">
                    <AiUsageRow label={t("today")} bucket={aiUsage.today} />
                    <AiUsageRow label={t("thisMonth")} bucket={aiUsage.current_month} />
                    <AiUsageRow label={t("allTime")} bucket={aiUsage.all_time} />
                  </div>
                ) : (
                  <p className="empty-state">{t("noAiUsage")}</p>
                )}
              </div>
            ) : null}

            <h2>{t("sharedCellar")}</h2>
            <div className="member-list">
              {members.map((member) => (
                <div className="member-row" key={member.membership_id}>
                  <div>
                    <strong>{member.display_name || member.email}</strong>
                    <span>{member.email}</span>
                  </div>
                  {canAdmin && member.role !== "owner" ? (
                    <div className="member-actions">
                      <select
                        value={member.role}
                        disabled={saving}
                        onChange={(event) => updateMemberRole(member, event.target.value)}
                      >
                        <option value="viewer">Viewer</option>
                        <option value="member">Member</option>
                        <option value="admin">Admin</option>
                      </select>
                      <button
                        type="button"
                        className="danger compact"
                        disabled={saving || member.email.toLowerCase() === currentUserEmail}
                        onClick={() => removeMember(member)}
                      >
                        {t("remove")}
                      </button>
                    </div>
                  ) : (
                    <small>{member.role}</small>
                  )}
                </div>
              ))}
            </div>

            {canAdmin ? (
              <>
                <div className="inline-form">
                  <h3>{t("importSection")}</h3>
                  <label>
                    <span>WineCellar JSON</span>
                    <input type="file" accept="application/json,.json" onChange={importLegacyFile} disabled={saving} />
                  </label>
                </div>
                <form className="inline-form" onSubmit={createInvite}>
                  <h3>{t("inviteMember")}</h3>
                  <label>
                    <span>{t("email")}</span>
                    <input type="email" value={inviteDraft.email} onChange={(event) => setInviteDraft({ ...inviteDraft, email: event.target.value })} required />
                  </label>
                  <label>
                    <span>{t("role")}</span>
                    <select value={inviteDraft.role} onChange={(event) => setInviteDraft({ ...inviteDraft, role: event.target.value })}>
                      <option value="viewer">Viewer</option>
                      <option value="member">Member</option>
                      <option value="admin">Admin</option>
                    </select>
                  </label>
                  <button type="submit" disabled={saving}>{saving ? t("working") : t("createInvite")}</button>
                  {inviteToken ? (
                    <div className="token-box">
                      <span>{t("inviteToken")}</span>
                      <code>{inviteToken}</code>
                      <span>{t("inviteLink")}</span>
                      <a href={generatedInviteLink}>{generatedInviteLink}</a>
                    </div>
                  ) : null}
                </form>
                <div className="inline-form">
                  <h3>{t("pendingInvites")}</h3>
                  {invites.length ? (
                    <div className="invite-list">
                      {invites.map((invite) => {
                        const expired = new Date(invite.expires_at) <= new Date();
                        const accepted = Boolean(invite.accepted_at);
                        return (
                          <div className="invite-row" key={invite.id}>
                            <div>
                              <strong>{invite.email}</strong>
                              <span>{invite.role} - {accepted ? "accepted" : expired ? "expired" : `${t("expires")} ${formatDisplayDate(invite.expires_at)}`}</span>
                            </div>
                            <button type="button" className="danger compact" disabled={saving} onClick={() => revokeInvite(invite)}>
                              {t("revoke")}
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <p className="empty-state">{t("noInvites")}</p>
                  )}
                </div>
              </>
            ) : null}

            <div className="inline-form">
              <h3>{t("aiAudit")}</h3>
              {aiAudit.length ? (
                <div className="audit-list">
                  {aiAudit.slice(0, 8).map((entry) => (
                    <div className="audit-row" key={entry.id}>
                      <strong>{entry.feature.replace(/_/g, " ")} - {aiEntityName(entry)}</strong>
                      <span>{entry.model} - {formatDisplayDate(entry.created_at)} - {entry.total_tokens.toLocaleString()} {t("tokens")} - {formatUsd(entry.estimated_cost_usd)}</span>
                      <p>{entry.summary}</p>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="empty-state">{t("noAiAudit")}</p>
              )}
            </div>

            <form className="inline-form" onSubmit={acceptInvite}>
              <h3>{t("acceptInvite")}</h3>
              <label>
                <span>{t("inviteToken")}</span>
                <input value={acceptToken} onChange={(event) => setAcceptToken(event.target.value)} />
              </label>
              <button type="submit" className="secondary" disabled={saving || !acceptToken.trim()}>
                {t("accept")}
              </button>
            </form>
          </aside>
          ) : null}
        </section>
      )}
    </main>
  );
}
