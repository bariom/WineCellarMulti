import { ChangeEvent, Children, FormEvent, MouseEvent, ReactNode, UIEvent, useEffect, useState } from "react";

type Session = {
  authenticated: boolean;
  user_display_name: string | null;
  user_email: string | null;
  active_household_id: string | null;
  active_household_name: string | null;
  membership_role: string | null;
  is_app_admin: boolean;
  pending_approval: boolean;
  locale: Locale;
  theme_preference: ThemePreference;
  has_active_entitlement: boolean;
  entitlement_valid_until: string | null;
  entitlement_days_remaining: number | null;
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
  owners: Array<{ name: string; email?: string; share_pct: number }>;
  tags: string[];
  grapes: Array<{ name: string; percentage_from?: number; percentage_to?: number }>;
  scores: Array<{ critic: string; score: string; note: string }>;
  value_history: Array<{ id: string; value: string; currency: string; source: string; recorded_at: string }>;
};

type CatalogWine = {
  name: string;
  producer: string;
  region: string;
  appellation: string;
  type: string;
  format: string;
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
  rating: string;
  notes: string;
  owners: Array<{ name: string; email: string; share_pct: string }>;
  tags: string[];
  scores: Array<{ critic: string; score: string; note: string }>;
};

type UserTag = {
  id: string;
  name: string;
  color: string;
};

type Passkey = {
  id: string;
  name: string;
  created_at: string;
  last_used_at: string | null;
};

type ImportMode = "add_all" | "skip_duplicates" | "update_existing" | "replace_all";

type ImportPreview = {
  wines_total: number;
  wishlist_total: number;
  wine_duplicates: number;
  wishlist_duplicates: number;
  wine_new: number;
  wishlist_new: number;
  sample_wine_duplicates: string[];
  sample_wishlist_duplicates: string[];
};

type ImportResult = {
  wines_imported: number;
  wishlist_imported: number;
  wines_skipped: number;
  wishlist_skipped: number;
  wines_updated: number;
  wishlist_updated: number;
  wines_deleted: number;
  wishlist_deleted: number;
};

type WineShareOffer = {
  id: string;
  wine_id: string;
  wine_name: string;
  wine_vintage: string;
  created_by_email: string;
  recipient_email: string;
  share_pct: string;
  message: string;
  status: string;
  created_at: string;
  decided_at: string | null;
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
  ai_market_price: string;
  ai_market_price_currency: string;
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
  visibility_scope: "all" | "shared";
};

type InviteDraft = {
  email: string;
  role: string;
  visibility_scope: "all" | "shared";
};

type PendingUser = {
  id: string;
  email: string;
  display_name: string;
};

type AppUser = PendingUser & {
  is_approved: boolean;
  is_app_admin: boolean;
  is_blocked: boolean;
  approved_at: string | null;
  entitlement_valid_until: string | null;
  entitlement_days_remaining: number | null;
};

type RedeemCode = {
  id: string;
  code: string | null;
  code_prefix: string;
  label: string;
  duration_days: number;
  max_redemptions: number;
  redeemed_count: number;
  email: string | null;
  expires_at: string | null;
  created_at: string;
  revoked_at: string | null;
  is_active: boolean;
};

type UserNotification = {
  id: string;
  kind: string;
  title: string;
  message: string;
  action_url: string | null;
  created_at: string;
  read_at: string | null;
};

type BillingStatus = {
  has_active_entitlement: boolean;
  valid_until: string | null;
  active_source: string | null;
  entitlements: Array<{
    id: string;
    source: string;
    valid_from: string;
    valid_until: string;
    created_at: string;
  }>;
  available_redeem_codes: RedeemCode[];
};

type PaymentPlan = "monthly" | "annual";

type CheckoutSession = {
  checkout_url: string;
  stripe_session_id: string;
  plan: PaymentPlan;
};

type BillingPortalSession = {
  portal_url: string;
};

type RedeemCodeDraft = {
  label: string;
  duration_days: string;
  max_redemptions: string;
  email: string;
  expires_at: string;
};

type Invite = {
  id: string;
  household_id?: string | null;
  household_name?: string | null;
  email: string;
  role: string;
  visibility_scope?: string;
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
  pairing_model: string;
  model_options: string[];
};

type AiSettingsDraft = {
  openai_api_key: string;
  ai_notes_model: string;
  drink_window_model: string;
  value_model: string;
  grape_model: string;
  wishlist_model: string;
  pairing_model: string;
};

type PairingResult = {
  summary: string;
  model: string;
  cellar_matches: Array<{ wine_id: string; wine_name: string; producer: string; reason: string; serving_note: string }>;
  market_recommendations: Record<string, Array<{ name: string; producer: string; price_hint: string; reason: string }>>;
};

type AuthDraft = {
  email: string;
  display_name: string;
  household_name: string;
  password: string;
};

type ContactSupportDraft = {
  email: string;
  subject: string;
  message: string;
};

type SortMode = "name" | "vintage" | "value" | "drink_window" | "priority";
type Locale = "en" | "it";
type DashboardFocus = "collector" | "value" | "readiness" | "timeline" | "data";
type SettingsTab = "profile" | "ai" | "sharing" | "users" | "data";
type ViewName = "home" | "cellar" | "history" | "wishlist" | "pairing" | "help" | "settings";
type QuickWineFilter = "" | "mine" | "shared" | "drink_now" | "drink_soon" | "past_window" | "future_deliveries" | "missing_data";
type WineAiFeature = "notes" | "drink-window" | "value" | "grapes" | "scores";
type ThemePreference =
  | "system"
  | "light"
  | "dark"
  | "sepia"
  | "white-wine"
  | "red-wine"
  | "rose-wine"
  | "champagne"
  | "bordeaux"
  | "burgundy"
  | "tuscany"
  | "piedmont"
  | "ticino";

const emptyAiSettingsDraft: AiSettingsDraft = {
  openai_api_key: "",
  ai_notes_model: "gpt-5.4-mini",
  drink_window_model: "gpt-5.4",
  value_model: "gpt-5.4-mini",
  grape_model: "gpt-5.4-nano",
  wishlist_model: "gpt-5.4",
  pairing_model: "gpt-5.4",
};

const emptyRedeemCodeDraft: RedeemCodeDraft = {
  label: "",
  duration_days: "30",
  max_redemptions: "1",
  email: "",
  expires_at: "",
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
    aiMarketPrice: "AI market price",
    aiTargetPrice: "AI target price",
    aiUsage: "AI usage",
    allTime: "All time",
    allBottles: "All bottles",
    allStatuses: "All statuses",
    allTags: "All tags",
    allTypes: "All types",
    appellation: "Appellation",
    billing: "Billing",
    buyAccess: "Pay with card",
    buyAnnual: "Annual access",
    buyMonthly: "Monthly access",
    bottles: "Bottles",
    cancel: "Cancel",
    cellar: "Cellar",
    cellarName: "Cellar name",
    renameCellar: "Rename cellar",
    clearFilters: "Clear filters",
    convert: "Convert",
    create: "Create",
    createAccount: "Create account",
    createInvite: "Create invite",
    createRedeemCode: "Create redeem code",
    critic: "Critic",
    configured: "Configured",
    contactSupport: "Contact support",
    contactSupportHelp: "Use this form if you have trouble with login, payments, invitations, or data.",
    createWine: "Create wine",
    createWishlist: "Create wishlist",
    currentYear: "Current year",
    currentValue: "Current value",
    currency: "Currency",
    valueEvolution: "Value evolution",
    dataQuality: "Data quality",
    dataFocus: "Data quality",
    delete: "Delete",
    delivery: "Delivery",
    deliveryTimeline: "Delivery timeline",
    daysRemaining: "days remaining",
    durationDays: "Duration days",
    drinkIn2Years: "Drink in 2 years",
    drinkNow: "Drink now",
    drinkWindow: "Drink window",
    drinkingWindow: "Drinking window",
    peakLabel: "Peak",
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
    generateAll: "Generate all",
    highPriority: "High priority",
    history: "History",
    help: "Help",
    home: "Home",
    dashboard: "Dashboard",
    priorityActions: "Priority actions",
    openWine: "Open wine",
    noActionItems: "No urgent action items",
    atRiskWines: "At risk",
    upcomingDeliveries: "Upcoming deliveries",
    incompleteData: "Incomplete data",
    maturityMap: "Maturity map",
    peakNow: "At peak now",
    valueByProducer: "Value by producer",
    investedMore: "Where you invested more",
    collectorFocus: "Collector focus",
    cellarSnapshot: "Cellar snapshot",
    cellarStats: "Cellar stats",
    household: "Household",
    importLegacy: "Import legacy export",
    importMode: "Import mode",
    importModeAdd: "Add everything",
    importModeReplace: "Replace everything",
    importModeSkip: "Skip likely duplicates",
    importModeUpdate: "Update existing wines",
    importPreview: "Preview import",
    importReady: "Import ready",
    importRun: "Run import",
    importSection: "Import",
    importSummary: "Import summary",
    idealWindow: "Ideal window",
    emptyCellar: "Empty cellar",
    emptyCellarWarning: "Deletes all wines and wishlist items in the active cellar.",
    inviteLink: "Invite link",
    inviteLinkDetected: "Invite link detected",
    inviteLinkHelp: "Login or create an account with the invited email, then accept the invite.",
    inviteMember: "Invite member",
    inviteToken: "Invite token",
    visibility: "Visibility",
    visibilityAll: "All wines",
    visibilityShared: "Only shared positions",
    language: "Language",
    loadingData: "Loading data",
    login: "Login",
    redeemRequired: "A valid redeem code is required to use the application.",
    paymentHelp: "Pay securely with Stripe to activate your service period.",
    logout: "Logout",
    merchant: "Merchant",
    message: "Message",
    manageSubscription: "Manage subscription",
    markRead: "Mark read",
    multiOwnership: "Multi ownership",
    missingDrinkWindow: "Missing drink window",
    missingScores: "Missing scores",
    missingValue: "Missing value",
    myBottles: "My bottles",
    name: "Name",
    noInvites: "No invites",
    noNotifications: "No notifications",
    entitlementValidity: "Service validity",
    offlineBackup: "Offline backup",
    offlineBackupHelp: "No network? Load a local JSON backup and browse it in read-only mode.",
    offlineMode: "Offline read-only",
    loadBackup: "Load local JSON backup",
    noAiAudit: "No AI generations yet",
    noApiKey: "No API key configured",
    noAiUsage: "No AI usage yet",
    noTags: "No tags defined yet",
    noItemSelected: "No item selected",
    notSpecified: "Not specified",
    noProducer: "No producer",
    newItems: "new",
    next12Months: "Next 12 months",
    next30Days: "Next 30 days",
    next90Days: "Next 90 days",
    beyond12Months: "Beyond 12 months",
    blockAccess: "Block access",
    blocked: "Blocked",
    noWishlistMatch: "No wishlist items match the current filters",
    noWineMatch: "No wines match the current filters",
    noHistoryMatch: "No consumed wines match the current filters",
    noPasskeys: "No passkeys registered yet",
    notes: "Notes",
    ownerShare: "Owner share",
    ownerEmail: "Owner email",
    orderDate: "Order date",
    open: "Open",
    of: "of",
    ownership: "Ownership",
    pairing: "Pairing",
    pairingCellarMatches: "From your cellar",
    pairingDish: "Dish or food",
    pairingEmptyDish: "Enter a dish first.",
    pairingIncludeMarket: "Also show 2 bottles outside my cellar",
    pairingMarketFallback: "Suggested bottles to buy",
    pairingMarketOnly: "Restaurant mode: ignore my cellar",
    pairingModelUsed: "Model used",
    pairingNoCellarMatch: "No ideal bottle found in your cellar.",
    pairingPlaceholder: "E.g. mushroom risotto, braised beef, sushi",
    pairingSubmit: "Find pairing",
    pairingWhy: "Why",
    password: "Password",
    passkey: "Passkey",
    passkeyLogin: "Login with passkey",
    passkeyName: "Passkey name",
    passkeys: "Passkeys",
    pastWindow: "Past window",
    pendingInvites: "Pending invites",
    pendingApproval: "Account pending approval",
    pendingApprovalHelp: "Your account was created, but it must be approved by an administrator before login.",
    pendingUsers: "Users pending approval",
    redeem: "Redeem",
    redeemCode: "Redeem code",
    redeemCodes: "Redeem codes",
    redeemed: "Redeemed",
    notifications: "Notifications",
    reviewUsers: "Review users",
    personalSettings: "Personal settings",
    profileSection: "Profile",
    priority: "Priority",
    probableDuplicates: "likely duplicates",
    producer: "Producer",
    purchasePrice: "Purchase price",
    purpose: "Purpose",
    quantity: "Quantity",
    rating: "Rating",
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
    scoreValue: "Score",
    search: "Search",
    searchPlaceholder: "Name, producer, region, score...",
    sendSupportRequest: "Send request",
    selectItemHelp: "Select an item from the list to see the complete detail.",
    consumedWines: "Consumed wines",
    sort: "Sort",
    settings: "Settings",
    settingsAi: "AI",
    settingsData: "Data",
    settingsProfile: "Profile",
    settingsSharing: "Sharing",
    settingsUsers: "Users",
    status: "Status",
    subject: "Subject",
    tag: "Tag",
    tagName: "Tag name",
    tags: "Tags",
    targetPrice: "Target price",
    marketEstimate: "Market estimate",
    targetValue: "Target value",
    theme: "Theme",
    themeSystem: "System",
    themeLight: "Light",
    themeDark: "Dark",
    themeSepia: "Warm cellar",
    themeWhiteWine: "White wine",
    themeRedWine: "Red wine",
    themeRoseWine: "Rose wine",
    themeChampagne: "Champagne",
    themeBordeaux: "Bordeaux",
    themeBurgundy: "Burgundy",
    themeTuscany: "Tuscany",
    themePiedmont: "Piedmont",
    themeTicino: "Ticino",
    unblockAccess: "Unblock access",
    thisMonth: "This month",
    timeline: "Timeline",
    today: "Today",
    topRegions: "Top regions",
    totalValue: "Total value",
    type: "Type",
    updatedItems: "updated",
    value: "Value",
    valueFocus: "Value",
    valueByType: "Value by type",
    valueOlderThanDays: "Value older than days",
    valueToRefresh: "Value to refresh",
    viewerReadOnly: "Viewer access: you can read this cellar, but cannot change wines.",
    vintage: "Vintage",
    wineDetail: "Wine detail",
    wines: "Wines",
    wishlist: "Wishlist",
    wishlistDetail: "Wishlist detail",
    wishlistItems: "Wishlist items",
    exportData: "Export data",
    exportJson: "Export JSON",
    generatedCode: "Generated code",
    paidRedeemCode: "Paid redeem code",
    working: "Working",
    youngWine: "Young",
    estimatedCost: "Estimated cost",
    sharedCellar: "Shared cellar",
    sharedBottles: "Shared",
    sharePct: "Share %",
    shareWine: "Push co-ownership",
    shareWineHelp: "The recipient must already be a registered user. Accepted positions are copied to their own cellar.",
    pendingShareOffers: "Pending share offers",
    decline: "Decline",
    skipped: "skipped",
    tokens: "tokens",
    manageTags: "Manage tags",
    createTag: "Create tag",
    color: "Color",
    addTagHere: "Add tag here",
    saveTag: "Save tag",
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
    aiMarketPrice: "Prezzo mercato AI",
    aiTargetPrice: "Prezzo target AI",
    aiUsage: "Uso AI",
    allTime: "Totale",
    allBottles: "Tutte le bottiglie",
    allStatuses: "Tutti gli stati",
    allTags: "Tutti i tag",
    allTypes: "Tutti i tipi",
    appellation: "Denominazione",
    billing: "Iscrizione",
    buyAccess: "Paga con carta",
    buyAnnual: "Accesso annuale",
    buyMonthly: "Accesso mensile",
    bottles: "Bottiglie",
    cancel: "Annulla",
    cellar: "Cantina",
    cellarName: "Nome cantina",
    renameCellar: "Rinomina cantina",
    clearFilters: "Pulisci filtri",
    convert: "Converti",
    create: "Crea",
    createAccount: "Crea account",
    createInvite: "Crea invito",
    createRedeemCode: "Crea codice redeem",
    critic: "Critico",
    configured: "Configurata",
    contactSupport: "Contatta supporto",
    contactSupportHelp: "Usa questo modulo se hai problemi con accesso, pagamenti, inviti o dati.",
    createWine: "Crea vino",
    createWishlist: "Crea wishlist",
    currentYear: "Anno corrente",
    currentValue: "Valore attuale",
    currency: "Valuta",
    valueEvolution: "Evoluzione valore",
    dataQuality: "Qualita dati",
    dataFocus: "Qualita dati",
    delete: "Elimina",
    delivery: "Consegna",
    deliveryTimeline: "Timeline consegne",
    daysRemaining: "giorni residui",
    durationDays: "Durata giorni",
    drinkIn2Years: "Da bere entro 2 anni",
    drinkNow: "Da bere ora",
    drinkWindow: "Finestra",
    drinkingWindow: "Finestra degustazione",
    peakLabel: "Picco",
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
    generateAll: "Genera tutti",
    highPriority: "Alta priorita",
    history: "Storico",
    help: "Guida",
    home: "Home",
    dashboard: "Dashboard",
    priorityActions: "Azioni prioritarie",
    openWine: "Apri vino",
    noActionItems: "Nessuna azione urgente",
    atRiskWines: "A rischio",
    upcomingDeliveries: "Consegne in arrivo",
    incompleteData: "Dati incompleti",
    maturityMap: "Mappa maturita",
    peakNow: "Al picco ora",
    valueByProducer: "Valore per produttore",
    investedMore: "Dove hai investito di piu",
    collectorFocus: "Focus collezionista",
    cellarSnapshot: "Sintesi cantina",
    cellarStats: "Statistiche cantina",
    household: "Cantina condivisa",
    importLegacy: "Importa export legacy",
    importMode: "Modalità import",
    importModeAdd: "Aggiungi tutto",
    importModeReplace: "Sostituisci tutto",
    importModeSkip: "Salta duplicati probabili",
    importModeUpdate: "Aggiorna esistenti",
    importPreview: "Anteprima import",
    importReady: "Import pronto",
    importRun: "Esegui import",
    importSection: "Importazione",
    importSummary: "Riepilogo import",
    idealWindow: "Periodo ideale",
    emptyCellar: "Svuota cantina",
    emptyCellarWarning: "Cancella tutti i vini e gli elementi wishlist della cantina attiva.",
    inviteLink: "Link invito",
    inviteLinkDetected: "Link invito rilevato",
    inviteLinkHelp: "Accedi o crea un account con l'email invitata, poi accetta l'invito.",
    inviteMember: "Invita membro",
    inviteToken: "Token invito",
    visibility: "Visibilita",
    visibilityAll: "Tutti i vini",
    visibilityShared: "Solo posizioni condivise",
    language: "Lingua",
    loadingData: "Caricamento dati",
    login: "Accesso",
    redeemRequired: "Serve un codice redeem valido per usare l'applicativo.",
    paymentHelp: "Paga in modo sicuro con Stripe per attivare il periodo di servizio.",
    logout: "Esci",
    merchant: "Commerciante",
    message: "Messaggio",
    manageSubscription: "Gestisci abbonamento",
    markRead: "Segna letta",
    multiOwnership: "Multiproprieta",
    missingDrinkWindow: "Finestra mancante",
    missingScores: "Punteggi mancanti",
    missingValue: "Valore mancante",
    myBottles: "Mie bottiglie",
    name: "Nome",
    noInvites: "Nessun invito",
    noNotifications: "Nessuna notifica",
    entitlementValidity: "Validita servizio",
    offlineBackup: "Backup offline",
    offlineBackupHelp: "Senza rete puoi caricare un backup JSON locale e consultarlo in sola lettura.",
    offlineMode: "Offline sola lettura",
    loadBackup: "Carica backup JSON locale",
    noAiAudit: "Nessuna generazione AI",
    noApiKey: "Nessuna chiave API configurata",
    noAiUsage: "Nessun uso AI registrato",
    noTags: "Nessun tag definito",
    noItemSelected: "Nessun elemento selezionato",
    notSpecified: "Non specificato",
    noProducer: "Produttore assente",
    newItems: "nuovi",
    next12Months: "Prossimi 12 mesi",
    next30Days: "Prossimi 30 giorni",
    next90Days: "Prossimi 90 giorni",
    beyond12Months: "Oltre 12 mesi",
    blockAccess: "Blocca accesso",
    blocked: "Bloccato",
    noWishlistMatch: "Nessun elemento wishlist corrisponde ai filtri",
    noWineMatch: "Nessun vino corrisponde ai filtri",
    noHistoryMatch: "Nessun vino consumato corrisponde ai filtri",
    noPasskeys: "Nessuna passkey registrata",
    notes: "Note",
    ownerShare: "Quota proprietario",
    ownerEmail: "Email proprietario",
    orderDate: "Data ordine",
    open: "Apri",
    of: "su",
    ownership: "Proprieta",
    pairing: "Abbinamento",
    pairingCellarMatches: "Dalla tua cantina",
    pairingDish: "Piatto o pietanza",
    pairingEmptyDish: "Inserisci prima un piatto.",
    pairingIncludeMarket: "Mostra anche 2 proposte fuori cantina",
    pairingMarketFallback: "Bottiglie suggerite da acquistare",
    pairingMarketOnly: "Sono al ristorante: ignora la mia cantina",
    pairingModelUsed: "Modello usato",
    pairingNoCellarMatch: "Nessuna bottiglia ideale trovata in cantina.",
    pairingPlaceholder: "Es. risotto ai funghi, brasato, sushi",
    pairingSubmit: "Trova abbinamento",
    pairingWhy: "Perché",
    password: "Password",
    passkey: "Passkey",
    passkeyLogin: "Accedi con passkey",
    passkeyName: "Nome passkey",
    passkeys: "Passkey",
    pastWindow: "Finestra scaduta",
    pendingInvites: "Inviti pendenti",
    pendingApproval: "Account in attesa di approvazione",
    pendingApprovalHelp: "Il tuo account e stato creato, ma deve essere approvato da un amministratore prima dell'accesso.",
    pendingUsers: "Utenti in attesa di approvazione",
    redeem: "Riscatta",
    redeemCode: "Codice redeem",
    redeemCodes: "Codici redeem",
    redeemed: "Riscattati",
    notifications: "Notifiche",
    reviewUsers: "Rivedi utenti",
    personalSettings: "Impostazioni personali",
    profileSection: "Profilo",
    priority: "Priorita",
    probableDuplicates: "duplicati probabili",
    producer: "Produttore",
    purchasePrice: "Prezzo acquisto",
    purpose: "Scopo",
    quantity: "Quantita",
    rating: "Valutazione",
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
    scoreValue: "Punteggio",
    search: "Cerca",
    searchPlaceholder: "Nome, produttore, regione, punteggio...",
    sendSupportRequest: "Invia richiesta",
    selectItemHelp: "Seleziona un elemento dalla lista per vedere il dettaglio completo.",
    consumedWines: "Vini consumati",
    sort: "Ordina",
    settings: "Impostazioni",
    settingsAi: "AI",
    settingsData: "Dati",
    settingsProfile: "Profilo",
    settingsSharing: "Condivisione",
    settingsUsers: "Utenti",
    status: "Stato",
    subject: "Oggetto",
    tag: "Tag",
    tagName: "Nome tag",
    tags: "Tag",
    targetPrice: "Prezzo target",
    marketEstimate: "Stima di mercato",
    targetValue: "Valore target",
    theme: "Tema",
    themeSystem: "Sistema",
    themeLight: "Chiaro",
    themeDark: "Scuro",
    themeSepia: "Cantina calda",
    themeWhiteWine: "Vino bianco",
    themeRedWine: "Vino rosso",
    themeRoseWine: "Rose",
    themeChampagne: "Champagne",
    themeBordeaux: "Bordeaux",
    themeBurgundy: "Borgogna",
    themeTuscany: "Toscana",
    themePiedmont: "Piemonte",
    themeTicino: "Ticino",
    unblockAccess: "Sblocca accesso",
    thisMonth: "Questo mese",
    timeline: "Timeline",
    today: "Oggi",
    topRegions: "Top regioni",
    totalValue: "Valore totale",
    type: "Tipo",
    updatedItems: "aggiornati",
    value: "Valore",
    valueFocus: "Valore",
    valueByType: "Valore per tipo",
    valueOlderThanDays: "Valore piu vecchio di giorni",
    valueToRefresh: "Valori da aggiornare",
    viewerReadOnly: "Accesso viewer: puoi leggere questa cantina, ma non modificare i vini.",
    vintage: "Annata",
    wineDetail: "Dettaglio vino",
    wines: "Vini",
    wishlist: "Wishlist",
    wishlistDetail: "Dettaglio wishlist",
    wishlistItems: "Elementi wishlist",
    exportData: "Esportazione dati",
    exportJson: "Esporta JSON",
    generatedCode: "Codice generato",
    paidRedeemCode: "Codice redeem acquistato",
    working: "Elaborazione",
    youngWine: "Giovane",
    estimatedCost: "Costo stimato",
    sharedCellar: "Cantina condivisa",
    sharedBottles: "Condivise",
    sharePct: "Quota %",
    shareWine: "Invia comproprieta",
    shareWineHelp: "Il destinatario deve essere gia registrato. Le posizioni accettate entrano nella sua cantina.",
    pendingShareOffers: "Proposte di comproprieta",
    decline: "Rifiuta",
    skipped: "saltati",
    tokens: "token",
    manageTags: "Gestisci tag",
    createTag: "Crea tag",
    color: "Colore",
    addTagHere: "Aggiungi tag qui",
    saveTag: "Salva tag",
  },
} as const;

type TranslationKey = keyof typeof translations.en;

const themeOptions: Array<{ value: ThemePreference; label: TranslationKey }> = [
  { value: "system", label: "themeSystem" },
  { value: "light", label: "themeLight" },
  { value: "dark", label: "themeDark" },
  { value: "sepia", label: "themeSepia" },
  { value: "white-wine", label: "themeWhiteWine" },
  { value: "red-wine", label: "themeRedWine" },
  { value: "rose-wine", label: "themeRoseWine" },
  { value: "champagne", label: "themeChampagne" },
  { value: "bordeaux", label: "themeBordeaux" },
  { value: "burgundy", label: "themeBurgundy" },
  { value: "tuscany", label: "themeTuscany" },
  { value: "piedmont", label: "themePiedmont" },
  { value: "ticino", label: "themeTicino" },
];

function translate(locale: Locale, key: TranslationKey) {
  return (translations[locale] as Record<TranslationKey, string>)[key] || translations.en[key];
}

const localizedDisplayValues: Record<Locale, Record<string, Record<string, string>>> = {
  en: {},
  it: {
    format: {
      "Bottle (750ml)": "Bottiglia (750ml)",
      "Half bottle (375ml)": "Mezza bottiglia (375ml)",
      "Magnum (1.5L)": "Magnum (1.5L)",
      "Double Magnum (3L)": "Doppio Magnum (3L)",
      "Jeroboam (3L)": "Jeroboam (3L)",
      "Imperial (6L)": "Imperial (6L)",
    },
    type: {
      Red: "Rosso",
      White: "Bianco",
      Rose: "Rose",
      "Ros\u00e9": "Rose",
      Sparkling: "Spumante",
      Sweet: "Dolce",
      Fortified: "Fortificato",
      Other: "Altro",
    },
    status: {
      Ordered: "Ordinato",
      Shipped: "Spedito",
      Delivered: "Consegnato",
      Consumed: "Bevuto",
      Cancelled: "Annullato",
    },
    priority: {
      High: "Alta",
      Medium: "Media",
      Low: "Bassa",
    },
    purpose: {
      Cellar: "Cantina",
      Drink: "Bere",
      Gift: "Regalo",
      Investment: "Investimento",
      Other: "Altro",
    },
  },
};

function displayValue(value: string | null | undefined, locale: Locale, group: string) {
  if (!value) return "";
  return localizedDisplayValues[locale]?.[group]?.[value] || value;
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
  rating: "0",
  notes: "",
  owners: [],
  tags: [],
  scores: [],
};

const emptyAuthDraft: AuthDraft = {
  email: "",
  display_name: "",
  household_name: "Main Cellar",
  password: "",
};

const emptyContactSupportDraft: ContactSupportDraft = {
  email: "",
  subject: "",
  message: "",
};

const landingContent: Record<
  Locale,
  {
    headline: string;
    subheadline: string;
    description: string;
    primaryCta: string;
    secondaryCta: string;
    storyEyebrow: string;
    storyTitle: string;
    storyBody: string;
    founderQuote: string;
    founderName: string;
    founderRole: string;
    principlesTitle: string;
    principles: Array<{ title: string; body: string }>;
    collectorTitle: string;
    collectorBody: string;
    pricesTitle: string;
    monthlyLabel: string;
    annualLabel: string;
    savingsNote: string;
    features: Array<{ title: string; body: string; highlight?: boolean }>;
  }
> = {
  en: {
    headline: "A private wine cellar built for collectors.",
    subheadline: "Track bottles, maturity, value, deliveries, and wishlists in one shared experience.",
    description:
      "Vinaris helps private collectors manage everyday drinking bottles and long-term allocations with a clean workflow designed around what to buy, what to drink, and what to monitor next.",
    primaryCta: "Login",
    secondaryCta: "Create account",
    storyEyebrow: "Why Vinaris exists",
    storyTitle: "Created by a collector who wanted a serious cellar tool, not another generic inventory app.",
    storyBody:
      "Vinaris was shaped around a real collector workflow: futures, shared positions, drinking windows, value tracking, and the daily question of what deserves attention now. The goal was to replace scattered spreadsheets, notes, and memory with one system that feels elegant enough to use every week.",
    founderQuote:
      "I built Vinaris because I wanted a cellar app that thinks like a collector: structured, calm, and genuinely useful when decisions matter.",
    founderName: "Omar Bariffi",
    founderRole: "Founder, collector, and product promoter",
    principlesTitle: "Built around practical collector decisions",
    principles: [
      {
        title: "Clarity before clutter",
        body: "The interface is designed to surface drinking readiness, deliveries, value, and missing data without burying the collector in noise.",
      },
      {
        title: "A cellar, not just a list",
        body: "Vinaris understands ownership, shared positions, price history, maturity, and wishlist flow as one connected system.",
      },
      {
        title: "AI only when it helps",
        body: "The platform works without AI, but becomes more powerful when collectors choose to connect their own OpenAI token.",
      },
    ],
    collectorTitle: "What Vinaris helps you do",
    collectorBody:
      "Built for collectors with 20 to 1000+ bottles who want clarity on their cellar without spreadsheets or scattered notes.",
    pricesTitle: "Simple pricing",
    monthlyLabel: "CHF 6 / month",
    annualLabel: "CHF 60 / year",
    savingsNote: "Annual plan saves CHF 12 compared with monthly billing.",
    features: [
      {
        title: "Catalog bottles and allocations",
        body: "Register producers, vintages, formats, delivery status, shared ownership, and personal notes.",
      },
      {
        title: "Monitor drinking windows",
        body: "See which wines are too young, at peak, or drifting past their ideal window.",
      },
      {
        title: "Follow cellar value",
        body: "Track purchase price, current value, and price history to understand where your cellar is appreciating.",
      },
      {
        title: "Handle futures and deliveries",
        body: "Manage ordered and en primeur wines, expected arrivals, and the delivery timeline from one place.",
      },
      {
        title: "Keep a focused wishlist",
        body: "Capture target bottles, target prices, buying priorities, and conversion from wishlist to cellar.",
      },
      {
        title: "Decide what to drink next",
        body: "Use readiness views, filters, pairings, and collector-focused insights to choose bottles with confidence.",
      },
      {
        title: "AI-assisted if you want it",
        body: "If you configure your own OpenAI token, Vinaris can help orchestrate notes, drinking windows, value checks, pairings, and other cellar workflows. Tokens are encrypted and stored securely.",
        highlight: true,
      },
    ],
  },
  it: {
    headline: "La cantina privata pensata per chi colleziona vino.",
    subheadline: "Tieni sotto controllo bottiglie, maturazione, valore, consegne e wishlist in un'unica esperienza condivisa.",
    description:
      "Vinaris aiuta i collezionisti privati a gestire sia i vini da bere nel quotidiano sia le allocazioni di lungo periodo, con un flusso chiaro su cosa comprare, cosa bere e cosa monitorare.",
    primaryCta: "Accedi",
    secondaryCta: "Crea account",
    storyEyebrow: "Perche nasce Vinaris",
    storyTitle: "Creato da un collezionista che voleva uno strumento serio di cantina, non l'ennesima app generica di inventario.",
    storyBody:
      "Vinaris nasce da un flusso reale da collezionista: futures, quote condivise, finestre di beva, controllo del valore e la domanda quotidiana su cosa merita attenzione adesso. L'obiettivo era sostituire fogli sparsi, note e memoria con un sistema unico, abbastanza elegante da volerlo usare ogni settimana.",
    founderQuote:
      "Ho creato Vinaris perche volevo un'app di cantina che ragionasse da collezionista: strutturata, sobria e davvero utile quando bisogna decidere.",
    founderName: "Omar Bariffi",
    founderRole: "Fondatore, collezionista e promotore dell'applicazione",
    principlesTitle: "Progettato intorno a decisioni reali da collezionista",
    principles: [
      {
        title: "Chiarezza prima del rumore",
        body: "L'interfaccia mette in evidenza beva, consegne, valore e dati mancanti senza sommergere il collezionista di informazioni inutili.",
      },
      {
        title: "Una cantina, non solo una lista",
        body: "Vinaris gestisce proprieta, quote condivise, storico prezzi, maturazione e wishlist come un sistema unico.",
      },
      {
        title: "AI solo quando serve",
        body: "La piattaforma funziona anche senza AI, ma diventa piu potente quando il collezionista sceglie di collegare il proprio token OpenAI.",
      },
    ],
    collectorTitle: "Che cosa puoi fare con Vinaris",
    collectorBody:
      "Pensato per collezionisti con 20 fino a oltre 1000 bottiglie che vogliono chiarezza in cantina senza fogli di calcolo o note sparse.",
    pricesTitle: "Prezzi semplici",
    monthlyLabel: "CHF 6 / mese",
    annualLabel: "CHF 60 / anno",
    savingsNote: "Il piano annuale ti fa risparmiare CHF 12 rispetto al mensile.",
    features: [
      {
        title: "Catalogare bottiglie e quote",
        body: "Registra produttori, annate, formati, stato consegna, multiproprietà e note personali.",
      },
      {
        title: "Monitorare la finestra di beva",
        body: "Vedi subito quali vini sono troppo giovani, al picco o oltre la fase ideale.",
      },
      {
        title: "Seguire il valore della cantina",
        body: "Controlla prezzo di acquisto, valore attuale e storico per capire dove la cantina cresce.",
      },
      {
        title: "Gestire futures e consegne",
        body: "Organizza vini ordinati ed en primeur, arrivi attesi e timeline delle consegne in un solo posto.",
      },
      {
        title: "Tenere una wishlist utile",
        body: "Salva bottiglie target, prezzi desiderati, priorità di acquisto e conversione rapida in cantina.",
      },
      {
        title: "Decidere cosa bere",
        body: "Usa viste di prontezza, filtri, abbinamenti e insight da collezionista per scegliere meglio.",
      },
      {
        title: "Supporto AI quando vuoi",
        body: "Se configuri il tuo token OpenAI, Vinaris puo aiutarti a orchestrare note, finestre di beva, controlli di valore, abbinamenti e altri flussi della cantina. I token vengono criptati e archiviati in modo sicuro.",
        highlight: true,
      },
    ],
  },
};

const helpGuideContent: Record<
  Locale,
  {
    eyebrow: string;
    title: string;
    intro: string;
    sections: Array<{
      title: string;
      body: string;
      bullets: string[];
    }>;
  }
> = {
  en: {
    eyebrow: "Guide",
    title: "How to use Vinaris",
    intro:
      "This guide is designed for new collectors. Start from the first section, then use the rest as a quick reference whenever you need to find a feature again.",
    sections: [
      {
        title: "1. Start with your cellar",
        body: "The Cellar view is where your real collection lives. Add delivered bottles first, then ordered and future deliveries.",
        bullets: [
          "Use Add wine to register producer, vintage, quantity, format, status, and purchase price.",
          "For shared bottles, define ownership and percentages directly in the wine record.",
          "If you already have data from the previous app, import it from Settings > Data.",
        ],
      },
      {
        title: "2. Use the dashboard to decide what matters now",
        body: "Home is not just a summary. It is your operational screen for drinking decisions, upcoming deliveries, and data cleanup.",
        bullets: [
          "Collector focus shows what to drink now, risky bottles, deliveries, and missing data.",
          "Timeline helps you track futures and expected arrivals over time.",
          "Click the statistic cards to jump directly to filtered wines.",
        ],
      },
      {
        title: "3. Build a buying workflow with Wishlist",
        body: "Wishlist keeps future purchases separate from the active cellar until you are ready to convert them.",
        bullets: [
          "Add target prices, priority, purpose, and merchant notes.",
          "Convert wishlist items into cellar positions when you buy them.",
          "Use AI suggestions, if configured, to refine strategy and target price.",
        ],
      },
      {
        title: "4. Check details before opening a bottle",
        body: "Open any wine to see the full card with value, drinking window, notes, ownership, and value history.",
        bullets: [
          "The drinking window shows young, ideal, and past-window periods with the current year marker.",
          "Value evolution tracks the historical pricing points you record over time.",
          "Edit mode is the place to update scores, tags, quantities, and delivery state.",
        ],
      },
      {
        title: "5. Add AI only if you want it",
        body: "Vinaris works without AI, but it can become much more powerful if you configure your own OpenAI token.",
        bullets: [
          "AI can help with tasting notes, drinking windows, price checks, grapes, wishlist strategy, and pairings.",
          "Your token is encrypted and stored securely.",
          "All AI settings live in Settings > AI and stay under your own control.",
        ],
      },
      {
        title: "6. Manage access, invitations, and notifications",
        body: "Vinaris supports shared cellars, shared positions, and app notifications for key events.",
        bullets: [
          "Use Settings > Sharing to invite people to your cellar.",
          "Anyone you invite to a cellar must already have their own Vinaris account.",
          "Notifications help you track invites, redeem codes, approvals, and incoming shared positions.",
        ],
      },
      {
        title: "7. Advanced workflows for shared wines",
        body: "Shared wines work best when each collector keeps their own cellar and Vinaris is used to mirror the shared position correctly.",
        bullets: [
          "First invite the other person into your cellar with visibility limited to shared bottles only. This lets them see the shared positions without exposing the rest of your cellar.",
          "Then use the shared wine detail to send the shared position to the other person's cellar.",
          "After the recipient accepts, the shared quota appears in their own cellar and both collectors can follow the position from their respective accounts.",
        ],
      },
    ],
  },
  it: {
    eyebrow: "Guida",
    title: "Come usare Vinaris",
    intro:
      "Questa guida è pensata per chi entra per la prima volta nell'app. Parti dalla prima sezione e poi usa il resto come riferimento rapido quando vuoi ritrovare una funzione.",
    sections: [
      {
        title: "1. Parti dalla tua cantina",
        body: "La vista Cantina è il luogo dove vive la collezione reale. Inserisci prima i vini consegnati, poi ordini e consegne future.",
        bullets: [
          "Usa Aggiungi vino per registrare produttore, annata, quantità, formato, stato e prezzo di acquisto.",
          "Per le bottiglie condivise, definisci proprietà e percentuali direttamente nella scheda vino.",
          "Se hai già dati dalla vecchia app, importali da Impostazioni > Data.",
        ],
      },
      {
        title: "2. Usa la dashboard per capire cosa conta adesso",
        body: "La Home non è solo un riepilogo. È la schermata operativa per decidere cosa bere, cosa arriverà e quali dati completare.",
        bullets: [
          "Collector focus mostra cosa bere ora, bottiglie a rischio, consegne e dati mancanti.",
          "Timeline ti aiuta a seguire futures ed arrivi attesi nel tempo.",
          "Clicca le card statistiche per aprire subito la lista filtrata dei vini.",
        ],
      },
      {
        title: "3. Costruisci il flusso acquisti con la Wishlist",
        body: "La Wishlist tiene separate le bottiglie future dalla cantina attiva finché non decidi di comprarle o convertirle.",
        bullets: [
          "Aggiungi prezzi target, priorità, scopo e note sul merchant.",
          "Converti gli elementi wishlist in posizioni di cantina quando acquisti.",
          "Usa i suggerimenti AI, se configurati, per affinare strategia e prezzo target.",
        ],
      },
      {
        title: "4. Controlla il dettaglio prima di aprire una bottiglia",
        body: "Apri un vino per vedere la scheda completa con valore, finestra di beva, note, proprietà e storico del valore.",
        bullets: [
          "La finestra di beva evidenzia il periodo giovane, ideale e oltre finestra con l'indicatore dell'anno corrente.",
          "L'evoluzione valore tiene traccia dei punti prezzo che registri nel tempo.",
          "La modalità modifica è il posto giusto per aggiornare punteggi, tag, quantità e stato consegna.",
        ],
      },
      {
        title: "5. Attiva l'AI solo se ti serve",
        body: "Vinaris funziona anche senza AI, ma può diventare molto più potente se configuri il tuo token OpenAI.",
        bullets: [
          "L'AI può aiutarti con note degustative, finestre di beva, controlli di valore, uvaggi, strategia wishlist e abbinamenti.",
          "Il tuo token viene criptato e archiviato in modo sicuro.",
          "Tutte le impostazioni AI vivono in Impostazioni > AI e restano sotto il tuo controllo.",
        ],
      },
      {
        title: "6. Gestisci accessi, inviti e notifiche",
        body: "Vinaris supporta cantine condivise, posizioni condivise e notifiche in-app per gli eventi importanti.",
        bullets: [
          "Usa Impostazioni > Sharing per invitare persone nella tua cantina.",
          "Chi inviti in una cantina deve comunque essere già titolare di un account Vinaris.",
          "Le notifiche ti aiutano a seguire inviti, codici redeem, approvazioni e posizioni condivise in arrivo.",
        ],
      },
      {
        title: "7. Funzionalità avanzate per i vini condivisi",
        body: "I vini condivisi funzionano al meglio quando ogni collezionista mantiene la propria cantina e Vinaris viene usato per rispecchiare correttamente la posizione condivisa.",
        bullets: [
          "Per prima cosa invita l'altra persona nella tua cantina con visibilità limitata alle sole bottiglie condivise. In questo modo vedrà le posizioni condivise senza accedere al resto della tua cantina.",
          "Poi usa il dettaglio del vino condiviso per inviare quella posizione alla cantina dell'altro condividente.",
          "Dopo l'accettazione, la quota condivisa compare nella sua cantina personale e entrambi i collezionisti possono seguire la posizione dai rispettivi account.",
        ],
      },
    ],
  },
};

const emptyInviteDraft: InviteDraft = {
  email: "",
  role: "viewer",
  visibility_scope: "shared",
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

function rawObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function rawArray(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? value.map(rawObject) : [];
}

function rawString(value: unknown, fallback = "") {
  return value === null || value === undefined ? fallback : String(value);
}

function rawNumber(value: unknown, fallback = 0) {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : fallback;
}

function rawNullableString(value: unknown) {
  const text = rawString(value).trim();
  return text || null;
}

function offlineWine(raw: Record<string, unknown>, index: number): Wine {
  return {
    id: rawString(raw.id, `offline-wine-${index}`),
    household_id: rawString(raw.household_id, "offline"),
    name: rawString(raw.name, "Unnamed wine"),
    producer: rawString(raw.producer),
    vintage: rawString(raw.vintage),
    quantity: rawNumber(raw.quantity),
    currency: rawString(raw.currency, "CHF"),
    price: rawString(raw.price, "0"),
    current_value: raw.current_value === null || raw.current_value === undefined ? null : rawString(raw.current_value),
    status: rawString(raw.status, "Delivered"),
    format: rawString(raw.format),
    type: rawString(raw.type),
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
    scores: rawArray(raw.scores).map((score) => ({ critic: rawString(score.critic), score: rawString(score.score), note: rawString(score.note) })),
    value_history: rawArray(raw.value_history).map((entry, entryIndex) => ({
      id: rawString(entry.id, `offline-value-${index}-${entryIndex}`),
      value: rawString(entry.value),
      currency: rawString(entry.currency, rawString(raw.currency, "CHF")),
      source: rawString(entry.source),
      recorded_at: rawString(entry.recorded_at),
    })),
  };
}

function offlineWishlistItem(raw: Record<string, unknown>, index: number): WishlistItem {
  return {
    id: rawString(raw.id, `offline-wishlist-${index}`),
    household_id: rawString(raw.household_id, "offline"),
    name: rawString(raw.name, "Unnamed wishlist item"),
    producer: rawString(raw.producer),
    vintage: rawString(raw.vintage),
    format: rawString(raw.format),
    type: rawString(raw.type),
    region: rawString(raw.region),
    appellation: rawString(raw.appellation),
    target_price: rawString(raw.target_price, "0"),
    ai_market_price: rawString(raw.ai_market_price),
    ai_market_price_currency: rawString(raw.ai_market_price_currency),
    currency: rawString(raw.currency, "CHF"),
    merchant: rawString(raw.merchant),
    priority: rawString(raw.priority, "Medium"),
    purpose: rawString(raw.purpose, "Drink"),
    status: rawString(raw.status, "Evaluate"),
    notes: rawString(raw.notes),
    ai_strategy: rawString(raw.ai_strategy),
    ai_purpose_advice: rawString(raw.ai_purpose_advice),
  };
}

function base64UrlToBuffer(value: string) {
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes.buffer;
}

function bufferToBase64Url(value: ArrayBuffer) {
  const bytes = new Uint8Array(value);
  let binary = "";
  bytes.forEach((byte) => { binary += String.fromCharCode(byte); });
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function prepareCreationOptions(options: PublicKeyCredentialCreationOptions) {
  return {
    ...options,
    challenge: base64UrlToBuffer(options.challenge as unknown as string),
    user: { ...options.user, id: base64UrlToBuffer(options.user.id as unknown as string) },
    excludeCredentials: options.excludeCredentials?.map((credential) => ({ ...credential, id: base64UrlToBuffer(credential.id as unknown as string) })),
  } as PublicKeyCredentialCreationOptions;
}

function prepareRequestOptions(options: PublicKeyCredentialRequestOptions) {
  return {
    ...options,
    challenge: base64UrlToBuffer(options.challenge as unknown as string),
    allowCredentials: options.allowCredentials?.map((credential) => ({ ...credential, id: base64UrlToBuffer(credential.id as unknown as string) })),
  } as PublicKeyCredentialRequestOptions;
}

function credentialToJson(credential: PublicKeyCredential) {
  const response = credential.response;
  const base = {
    id: credential.id,
    rawId: bufferToBase64Url(credential.rawId),
    type: credential.type,
    clientExtensionResults: credential.getClientExtensionResults(),
  };
  if (response instanceof AuthenticatorAttestationResponse) {
    const attestation = response as AuthenticatorAttestationResponse & { getTransports?: () => string[] };
    return {
      ...base,
      response: {
        clientDataJSON: bufferToBase64Url(response.clientDataJSON),
        attestationObject: bufferToBase64Url(response.attestationObject),
        transports: attestation.getTransports?.() || [],
      },
    };
  }
  const assertion = response as AuthenticatorAssertionResponse;
  return {
    ...base,
    response: {
      clientDataJSON: bufferToBase64Url(assertion.clientDataJSON),
      authenticatorData: bufferToBase64Url(assertion.authenticatorData),
      signature: bufferToBase64Url(assertion.signature),
      userHandle: assertion.userHandle ? bufferToBase64Url(assertion.userHandle) : null,
    },
  };
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
    rating: String(wine.rating || 0),
    notes: wine.notes,
    owners: wine.owners.map((owner) => ({ name: owner.name || "", email: owner.email || "", share_pct: String(owner.share_pct || "") })),
    tags: wine.tags,
    scores: wine.scores.map((score) => ({ critic: score.critic || "", score: score.score || "", note: score.note || "" })),
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
    rating: Number(draft.rating || 0),
    notes: draft.notes.trim(),
    owners: draft.owners
      .map((owner) => ({ name: owner.name.trim(), email: owner.email.trim().toLowerCase(), share_pct: Number(owner.share_pct || 0) }))
      .filter((owner) => owner.name && owner.share_pct > 0),
    tags: draft.tags,
    scores: draft.scores
      .map((score) => ({ critic: score.critic.trim(), score: score.score.trim(), note: score.note.trim() }))
      .filter((score) => score.critic || score.score || score.note),
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

function stripeCheckoutResultFromUrl() {
  const params = new URLSearchParams(window.location.search);
  const result = params.get("stripe_checkout");
  return result === "success" || result === "cancelled" ? result : "";
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

function toggleListValue(values: string[], value: string) {
  return values.includes(value) ? values.filter((item) => item !== value) : [...values, value].sort((first, second) => first.localeCompare(second));
}

function rgbaFromHex(color: string, alpha: number) {
  const hex = color.trim();
  const normalized = hex.startsWith("#") ? hex.slice(1) : hex;
  if (!/^[0-9a-fA-F]{6}$/.test(normalized) && !/^[0-9a-fA-F]{3}$/.test(normalized)) return "";
  const expanded = normalized.length === 3
    ? normalized.split("").map((char) => `${char}${char}`).join("")
    : normalized;
  const red = Number.parseInt(expanded.slice(0, 2), 16);
  const green = Number.parseInt(expanded.slice(2, 4), 16);
  const blue = Number.parseInt(expanded.slice(4, 6), 16);
  return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
}

function tagColorStyle(tagName: string, userTags: UserTag[]) {
  const color = userTags.find((tag) => tag.name === tagName)?.color || "";
  const backgroundColor = rgbaFromHex(color, 0.22);
  const insetBorder = rgbaFromHex(color, 0.28);
  return color
    ? {
        borderColor: color,
        color: "var(--text)",
        backgroundColor: backgroundColor || `var(--surface-subtle)`,
        boxShadow: insetBorder ? `inset 0 0 0 1px ${insetBorder}` : undefined,
      }
    : undefined;
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

function priorityTone(priority: string) {
  const normalized = priority.toLowerCase();
  if (normalized.includes("high") || normalized.includes("alta")) return "high";
  if (normalized.includes("low") || normalized.includes("bassa")) return "low";
  return "medium";
}

function prioritySortValue(priority: string) {
  const tone = priorityTone(priority);
  if (tone === "high") return 0;
  if (tone === "medium") return 1;
  return 2;
}

function isWishlistReadyToBuy(status: string) {
  const normalized = status.trim().toLowerCase();
  return ["buy", "ready", "approved", "compra", "acquista", "pronto", "approvato"]
    .some((word) => normalized.includes(word));
}

function wineUnitValue(wine: Wine) {
  return Number(wine.current_value || wine.price || 0);
}

function isFutureDeliveryWine(wine: Wine, now: Date) {
  if (!wine.expected_delivery) return false;
  const deliveryDate = new Date(wine.expected_delivery);
  if (Number.isNaN(deliveryDate.getTime()) || deliveryDate < now) return false;
  const status = wine.status.trim().toLowerCase();
  const deliveredStatuses = ["delivered", "consegnato", "bevuto", "consumed", "cancelled", "canceled", "annullato"];
  if (deliveredStatuses.some((value) => status.includes(value))) return false;
  return true;
}

function sumWineValue(items: Wine[]) {
  return items.reduce((total, wine) => total + wineUnitValue(wine) * wine.quantity, 0);
}

function currentUserSharePct(wine: Wine, session: Session | null) {
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

function ownedBottleCount(wine: Wine, session: Session | null) {
  return Math.round((wine.quantity * currentUserSharePct(wine, session)) / 100);
}

function wineQuantityLabel(wine: Wine, session: Session | null, bottlesLabel: string) {
  const owned = ownedBottleCount(wine, session);
  const isShared = wine.owners.length > 0 || currentUserSharePct(wine, session) < 100;
  if (isShared) return `${owned} ${bottlesLabel} di ${wine.quantity} condivise`;
  return `${wine.quantity} ${bottlesLabel}`;
}

function ownershipStats(items: Wine[], session: Session | null) {
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

function topProducerGroups(items: Wine[]) {
  return uniqueSorted(items.map((wine) => wine.producer || "Unknown producer"))
    .map((label) => ({
      label,
      value: sumWineValue(items.filter((wine) => (wine.producer || "Unknown producer") === label)),
    }))
    .filter((item) => item.value > 0)
    .sort((first, second) => second.value - first.value)
    .slice(0, 5);
}

function formatBottleCount(value: number) {
  return String(Math.round(value));
}

function maturityBuckets(items: Wine[], currentYear: number, locale: Locale) {
  const labels =
    locale === "it"
      ? { young: "Giovani", soon: "In arrivo", now: "Al picco", past: "Scaduti", unknown: "Sconosciuti" }
      : { young: "Young", soon: "Coming up", now: "At peak", past: "Past", unknown: "Unknown" };
  const buckets = [
    { key: "young", label: labels.young, value: items.filter((wine) => wine.drink_from && wine.drink_from > currentYear + 2).length },
    { key: "soon", label: labels.soon, value: items.filter((wine) => wine.drink_from && wine.drink_from > currentYear && wine.drink_from <= currentYear + 2).length },
    { key: "now", label: labels.now, value: items.filter((wine) => wine.drink_from && wine.drink_to && wine.drink_from <= currentYear && wine.drink_to >= currentYear).length },
    { key: "past", label: labels.past, value: items.filter((wine) => wine.drink_to && wine.drink_to < currentYear).length },
    { key: "unknown", label: labels.unknown, value: items.filter((wine) => !wine.drink_from || !wine.drink_to).length },
  ];
  const max = Math.max(...buckets.map((bucket) => bucket.value), 1);
  return buckets.map((bucket) => ({ ...bucket, pct: Math.max((bucket.value / max) * 100, bucket.value ? 8 : 0) }));
}

function daysUntil(value: string) {
  const target = new Date(value).getTime();
  if (Number.isNaN(target)) return null;
  return Math.ceil((target - Date.now()) / 86400000);
}

function valueEstimateAgeDays(wine: Wine, now: Date) {
  if (!wine.ai_value_estimated_at) return null;
  const estimatedAt = new Date(wine.ai_value_estimated_at).getTime();
  if (Number.isNaN(estimatedAt)) return null;
  return Math.floor((now.getTime() - estimatedAt) / 86400000);
}

function needsValueRefresh(wine: Wine, thresholdDays: number, now: Date) {
  if (!wine.current_value) return true;
  if (thresholdDays <= 0) return false;
  const ageDays = valueEstimateAgeDays(wine, now);
  return ageDays === null || ageDays >= thresholdDays;
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
    wine.rating ? `${wine.rating} stars rating` : "",
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

function DetailField({
  label,
  value,
  emptyLabel,
}: {
  label: string;
  value: ReactNode;
  emptyLabel: string;
}) {
  return (
    <div className="detail-field">
      <span>{label}</span>
      <strong>{value || emptyLabel}</strong>
    </div>
  );
}

function wineStatusTone(status: string) {
  const normalized = status.trim().toLowerCase();
  if (normalized.includes("deliver") || normalized.includes("consegn")) return "delivered";
  if (normalized.includes("shipp") || normalized.includes("spedit")) return "shipped";
  if (normalized.includes("order") || normalized.includes("ordin")) return "ordered";
  return "neutral";
}

function wineStatusIcon(status: string) {
  const tone = wineStatusTone(status);
  if (tone === "delivered") return "●";
  if (tone === "shipped") return "◔";
  if (tone === "ordered") return "○";
  return "•";
}

function WineStatusBadge({ status, locale, compact = false }: { status: string; locale: Locale; compact?: boolean }) {
  const tone = wineStatusTone(status);
  return (
    <span className={`wine-status-badge wine-status-${tone}${compact ? " compact" : ""}`}>
      <i aria-hidden="true">{wineStatusIcon(status)}</i>
      <strong>{displayValue(status, locale, "status") || status}</strong>
    </span>
  );
}

function StarRating({ value, label }: { value: number; label: string }) {
  const rating = Math.min(Math.max(Math.round(Number(value || 0)), 0), 6);
  return (
    <span className="star-rating" aria-label={`${label}: ${rating}/6`}>
      {Array.from({ length: 6 }, (_, index) => (
        <span key={index} className={index < rating ? "filled" : ""} aria-hidden="true">★</span>
      ))}
    </span>
  );
}

function RatingInput({
  value,
  disabled,
  label,
  onChange,
}: {
  value: string;
  disabled: boolean;
  label: string;
  onChange: (value: string) => void;
}) {
  const rating = Math.min(Math.max(Number(value || 0), 0), 6);
  return (
    <div className="rating-input" role="radiogroup" aria-label={label}>
      {[1, 2, 3, 4, 5, 6].map((star) => (
        <button
          type="button"
          key={star}
          className={star <= rating ? "filled" : ""}
          disabled={disabled}
          aria-checked={rating === star}
          role="radio"
          onClick={() => onChange(rating === star ? "0" : String(star))}
        >
          ★
        </button>
      ))}
      <button type="button" className="secondary compact clear-rating" disabled={disabled || rating === 0} onClick={() => onChange("0")}>
        0
      </button>
    </div>
  );
}

function DrinkWindowMini({ wine }: { wine: Wine }) {
  if (!wine.drink_from || !wine.drink_to) return null;
  const drinkStart = wine.drink_from;
  const drinkEnd = wine.drink_to;
  const peakStart = wine.drink_peak_from || drinkStart;
  const peakEnd = wine.drink_peak_to || drinkEnd;
  const span = Math.max(drinkEnd - drinkStart, 1);
  const peakLeft = Math.min(Math.max(((peakStart - drinkStart) / span) * 100, 0), 96);
  const peakWidth = Math.max(((peakEnd - peakStart) / span) * 100, 4);
  const peakRightBound = Math.max(100 - peakLeft, 4);
  const currentYear = new Date().getFullYear();
  const currentYearInWindow = currentYear >= drinkStart && currentYear <= drinkEnd;
  const currentYearLeft = Math.min(Math.max(((currentYear - drinkStart) / span) * 100, 0), 100);

  return (
    <div className="mini-drink-window" aria-label={`${drinkStart}-${drinkEnd}`}>
      <div className="mini-window-labels">
        <span>{drinkStart}</span>
        <span>{peakStart}-{peakEnd}</span>
        <span>{drinkEnd}</span>
      </div>
      <div className="mini-window-track">
        <span className="mini-window-peak" style={{ left: `${peakLeft}%`, width: `${Math.min(peakWidth, peakRightBound)}%` }} />
        {currentYearInWindow ? <span className="mini-window-current" style={{ left: `${currentYearLeft}%` }} /> : null}
      </div>
    </div>
  );
}

function ValueHistoryChart({ wine, t }: { wine: Wine; t: (key: TranslationKey) => string }) {
  const entries = (wine.value_history || [])
    .filter((entry) => entry.value && entry.recorded_at)
    .map((entry) => ({ ...entry, numericValue: Number(entry.value), dateMs: new Date(entry.recorded_at).getTime() }))
    .filter((entry) => Number.isFinite(entry.numericValue) && Number.isFinite(entry.dateMs))
    .sort((first, second) => first.dateMs - second.dateMs);

  if (entries.length === 0) return null;

  const values = entries.map((entry) => entry.numericValue);
  const minValue = Math.min(...values);
  const maxValue = Math.max(...values);
  const startDate = entries[0].dateMs;
  const endDate = entries[entries.length - 1].dateMs;
  const dateSpan = Math.max(endDate - startDate, 1);
  const valueSpan = Math.max(maxValue - minValue, 1);
  const points = entries
    .map((entry) => {
      const x = entries.length === 1 ? 50 : 8 + ((entry.dateMs - startDate) / dateSpan) * 84;
      const y = minValue === maxValue ? 50 : 82 - ((entry.numericValue - minValue) / valueSpan) * 64;
      return `${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .join(" ");
  const first = entries[0];
  const last = entries[entries.length - 1];
  const sourceLabels: Record<string, string> = {
    ai: "AI",
    imported: "Import",
    manual: "Manual",
    shared: "Share",
  };

  return (
    <div className="value-history-card">
      <div className="section-heading">
        <h3>{t("valueEvolution")}</h3>
        <span>{entries.length} {t("records")}</span>
      </div>
      <svg className="value-history-chart" viewBox="0 0 100 90" role="img" aria-label={t("valueEvolution")}>
        <line x1="8" y1="82" x2="92" y2="82" />
        <line x1="8" y1="18" x2="8" y2="82" />
        <polyline points={points} />
        {entries.map((entry) => {
          const x = entries.length === 1 ? 50 : 8 + ((entry.dateMs - startDate) / dateSpan) * 84;
          const y = minValue === maxValue ? 50 : 82 - ((entry.numericValue - minValue) / valueSpan) * 64;
          return <circle key={entry.id} cx={x} cy={y} r="2.4" />;
        })}
      </svg>
      <div className="value-history-meta">
        <span>{formatDisplayDate(first.recorded_at)}: {first.currency} {first.numericValue.toFixed(0)}</span>
        <strong>{last.currency} {last.numericValue.toFixed(0)}</strong>
        <span>{formatDisplayDate(last.recorded_at)} - {sourceLabels[last.source] || last.source}</span>
      </div>
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

function ownershipRows(wine: Wine) {
  if (wine.owners.length) return wine.owners;
  const share = Number(wine.owner_share_pct || 0);
  return share > 0 && share < 100 ? [{ name: "Owner", share_pct: share }] : [];
}

function hasSharedOwnership(wine: Wine) {
  return wine.owners.length > 0 || Number(wine.owner_share_pct || 100) < 100;
}

function WineDetail({
  wine,
  session,
  auditEntries,
  canGenerate,
  generating,
  onGenerate,
  t,
  locale,
}: {
  wine: Wine;
  session: Session | null;
  auditEntries: AiAuditLog[];
  canGenerate: boolean;
  generating: string;
  onGenerate: (feature: WineAiFeature) => void;
  t: (key: TranslationKey) => string;
  locale: Locale;
}) {
  const drinkStart = wine.drink_from || Number(wine.vintage) || new Date().getFullYear();
  const drinkEnd = wine.drink_to || drinkStart;
  const peakStart = wine.drink_peak_from || drinkStart;
  const peakEnd = wine.drink_peak_to || drinkEnd;
  const span = Math.max(drinkEnd - drinkStart, 1);
  const peakLeft = Math.min(Math.max(((peakStart - drinkStart) / span) * 100, 0), 96);
  const peakWidth = Math.max(((peakEnd - peakStart) / span) * 100, 4);
  const peakRightBound = Math.max(100 - peakLeft, 4);
  const currentYear = new Date().getFullYear();
  const currentYearInWindow = currentYear >= drinkStart && currentYear <= drinkEnd;
  const currentYearLeft = Math.min(Math.max(((currentYear - drinkStart) / span) * 100, 0), 100);

  return (
    <section className={`wine-detail tone-${wineTone(wine.type)}`}>
      <div className="detail-title">
        <div>
          <p className="eyebrow">{t("wineDetail")}</p>
          <h2><i className={`wine-dot tone-${wineTone(wine.type)}`} />{wine.name}</h2>
          {wine.rating ? <StarRating value={wine.rating} label={t("rating")} /> : null}
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
        <button type="button" className="secondary compact" disabled={!canGenerate || Boolean(generating)} onClick={() => onGenerate("scores")}>
          {generating === "scores" ? t("generating") : t("scores")}
        </button>
      </div>

      <div className="detail-grid">
        <DetailField label={t("format")} value={displayValue(wine.format, locale, "format")} emptyLabel={t("notSpecified")} />
        <DetailField label={t("type")} value={displayValue(wine.type, locale, "type")} emptyLabel={t("notSpecified")} />
        <DetailField label={t("rating")} value={wine.rating ? `${wine.rating}/6` : ""} emptyLabel={t("notSpecified")} />
        <DetailField label={t("status")} value={<WineStatusBadge status={wine.status} locale={locale} />} emptyLabel={t("notSpecified")} />
        <DetailField label={t("quantity")} value={wineQuantityLabel(wine, session, t("bottles").toLowerCase())} emptyLabel={t("notSpecified")} />
        <DetailField label={t("purchasePrice")} value={`${wine.currency} ${Number(wine.price).toFixed(0)}`} emptyLabel={t("notSpecified")} />
        <DetailField label={t("currentValue")} value={wine.current_value ? `${wine.currency} ${Number(wine.current_value).toFixed(0)}` : ""} emptyLabel={t("notSpecified")} />
        <DetailField label={t("merchant")} value={wine.merchant} emptyLabel={t("notSpecified")} />
        <DetailField label={t("delivery")} value={formatDisplayDate(wine.expected_delivery)} emptyLabel={t("notSpecified")} />
      </div>

      <ValueHistoryChart wine={wine} t={t} />

      {(wine.drink_from || wine.drink_to) ? (
        <div className="drink-window">
          <div className="section-heading">
            <h3>{t("drinkingWindow")}</h3>
            <span>{drinkStart}-{drinkEnd}</span>
          </div>
          <div className="window-track">
            <span className="window-peak" style={{ left: `${peakLeft}%`, width: `${Math.min(peakWidth, peakRightBound)}%` }} />
            {currentYearInWindow ? (
              <span
                className="window-current-year"
                style={{ left: `${currentYearLeft}%` }}
                aria-label={`${t("currentYear")}: ${currentYear}`}
              >
                <span>{currentYear}</span>
              </span>
            ) : null}
          </div>
          <div className="window-legend">
            <span className="legend-young">{t("youngWine")}</span>
            <span className="legend-ideal">{t("idealWindow")}</span>
            <span className="legend-past">{t("pastWindow")}</span>
          </div>
          <div className="window-labels">
            <span>{drinkStart}</span>
            <span>{t("peakLabel")} {peakStart}-{peakEnd}</span>
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

      {ownershipRows(wine).length ? (
        <div className="detail-section">
          <h3>{t("multiOwnership")}</h3>
          <div className="ownership-list">
            {ownershipRows(wine).map((owner, index) => (
              <div className="ownership-row" key={`${owner.email || owner.name}-${index}`}>
                <span>{owner.name}{owner.email ? ` - ${owner.email}` : ""}</span>
                <strong>{Number(owner.share_pct).toFixed(0)}%</strong>
              </div>
            ))}
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

      <details className="detail-section ai-audit-detail">
        <summary>
          <span>{t("aiAudit")}</span>
          <strong>{auditEntries.length}</strong>
        </summary>
        {auditEntries.length ? (
          <div className="audit-list">
            {auditEntries.map((entry) => (
              <div className="audit-row" key={entry.id}>
                <strong>{entry.feature.replace(/_/g, " ")}</strong>
                <span>{entry.model} - {formatDisplayDate(entry.created_at)} - {entry.total_tokens.toLocaleString()} {t("tokens")} - {formatUsd(entry.estimated_cost_usd)}</span>
                <p>{entry.summary}</p>
              </div>
            ))}
          </div>
        ) : (
          <p className="empty-state">{t("noAiAudit")}</p>
        )}
      </details>
    </section>
  );
}

function WishlistDetail({
  item,
  auditEntries,
  canGenerate,
  generating,
  onGenerate,
  t,
  locale,
}: {
  item: WishlistItem;
  auditEntries: AiAuditLog[];
  canGenerate: boolean;
  generating: string;
  onGenerate: (feature: "strategy" | "purpose" | "target-price") => void;
  t: (key: TranslationKey) => string;
  locale: Locale;
}) {
  const aiMarketPrice = item.ai_market_price ? `${item.ai_market_price_currency || item.currency} ${Number(item.ai_market_price).toFixed(0)}` : "";
  return (
    <section className={`wine-detail tone-${wineTone(item.type)}`}>
      <div className="detail-title">
        <div>
          <p className="eyebrow">{t("wishlistDetail")}</p>
          <h2><i className={`wine-dot tone-${wineTone(item.type)}`} />{item.name}</h2>
          <span>{[item.producer, item.vintage, item.region, item.appellation].filter(Boolean).join(" - ")}</span>
        </div>
        <div className="wishlist-price-block">
          <span>{t("targetPrice")}</span>
          <strong className="wishlist-price">{item.currency} {Number(item.target_price).toFixed(0)}</strong>
        </div>
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
        <DetailField label={t("format")} value={displayValue(item.format, locale, "format")} emptyLabel={t("notSpecified")} />
        <DetailField label={t("type")} value={displayValue(item.type, locale, "type")} emptyLabel={t("notSpecified")} />
        <DetailField label={t("priority")} value={displayValue(item.priority, locale, "priority")} emptyLabel={t("notSpecified")} />
        <DetailField label={t("purpose")} value={displayValue(item.purpose, locale, "purpose")} emptyLabel={t("notSpecified")} />
        <DetailField label={t("status")} value={displayValue(item.status, locale, "status")} emptyLabel={t("notSpecified")} />
        <DetailField label={t("targetPrice")} value={`${item.currency} ${Number(item.target_price).toFixed(0)}`} emptyLabel={t("notSpecified")} />
        <DetailField label={t("aiMarketPrice")} value={aiMarketPrice} emptyLabel={t("notSpecified")} />
        <DetailField label={t("merchant")} value={item.merchant} emptyLabel={t("notSpecified")} />
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

      <details className="detail-section ai-audit-detail">
        <summary>
          <span>{t("aiAudit")}</span>
          <strong>{auditEntries.length}</strong>
        </summary>
        {auditEntries.length ? (
          <div className="audit-list">
            {auditEntries.map((entry) => (
              <div className="audit-row" key={entry.id}>
                <strong>{entry.feature.replace(/_/g, " ")}</strong>
                <span>{entry.model} - {formatDisplayDate(entry.created_at)} - {entry.total_tokens.toLocaleString()} {t("tokens")} - {formatUsd(entry.estimated_cost_usd)}</span>
                <p>{entry.summary}</p>
              </div>
            ))}
          </div>
        ) : (
          <p className="empty-state">{t("noAiAudit")}</p>
        )}
      </details>
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

function ContactSupportPanel({
  t,
  draft,
  setDraft,
  saving,
  onSubmit,
}: {
  t: (key: TranslationKey) => string;
  draft: ContactSupportDraft;
  setDraft: (draft: ContactSupportDraft) => void;
  saving: boolean;
  onSubmit: (event: FormEvent<HTMLFormElement>) => Promise<void>;
}) {
  return (
    <details className="support-panel">
      <summary>
        <strong>{t("contactSupport")}</strong>
        <span>{t("contactSupportHelp")}</span>
      </summary>
      <form className="support-form" onSubmit={onSubmit}>
        <label>
          <span>{t("email")}</span>
          <input type="email" value={draft.email} onChange={(event) => setDraft({ ...draft, email: event.target.value })} required />
        </label>
        <label>
          <span>{t("subject")}</span>
          <input value={draft.subject} onChange={(event) => setDraft({ ...draft, subject: event.target.value })} minLength={3} required />
        </label>
        <label>
          <span>{t("message")}</span>
          <textarea value={draft.message} onChange={(event) => setDraft({ ...draft, message: event.target.value })} rows={5} minLength={10} required />
        </label>
        <button type="submit" disabled={saving}>
          {saving ? t("working") : t("sendSupportRequest")}
        </button>
      </form>
    </details>
  );
}

function DashboardCarousel({ label, children }: { label: string; children: ReactNode }) {
  const cards = Children.toArray(children);
  const [activeIndex, setActiveIndex] = useState(0);

  function updateActiveIndex(event: UIEvent<HTMLElement>) {
    const container = event.currentTarget;
    const items = Array.from(container.children) as HTMLElement[];
    if (!items.length) return;
    const scrollLeft = container.scrollLeft;
    let nearestIndex = 0;
    let nearestDistance = Number.POSITIVE_INFINITY;
    items.forEach((item, index) => {
      const distance = Math.abs(item.offsetLeft - scrollLeft);
      if (distance < nearestDistance) {
        nearestDistance = distance;
        nearestIndex = index;
      }
    });
    setActiveIndex(nearestIndex);
  }

  return (
    <div className="dashboard-carousel-shell">
      <section className="dashboard-grid" aria-label={label} onScroll={updateActiveIndex}>
        {children}
      </section>
      {cards.length > 1 ? (
        <div className="dashboard-dots" aria-hidden="true">
          {cards.map((_, index) => (
            <span className={index === activeIndex ? "active" : ""} key={index} />
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [wines, setWines] = useState<Wine[]>([]);
  const [wineCatalog, setWineCatalog] = useState<CatalogWine[]>([]);
  const [wishlist, setWishlist] = useState<WishlistItem[]>([]);
  const [userTags, setUserTags] = useState<UserTag[]>([]);
  const [shareOffers, setShareOffers] = useState<WineShareOffer[]>([]);
  const [passkeys, setPasskeys] = useState<Passkey[]>([]);
  const [householdMemberships, setHouseholdMemberships] = useState<HouseholdMembership[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [pendingUsers, setPendingUsers] = useState<PendingUser[]>([]);
  const [appUsers, setAppUsers] = useState<AppUser[]>([]);
  const [redeemCodes, setRedeemCodes] = useState<RedeemCode[]>([]);
  const [billingStatus, setBillingStatus] = useState<BillingStatus | null>(null);
  const [invites, setInvites] = useState<Invite[]>([]);
  const [receivedInvites, setReceivedInvites] = useState<Invite[]>([]);
  const [userNotifications, setUserNotifications] = useState<UserNotification[]>([]);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [aiAudit, setAiAudit] = useState<AiAuditLog[]>([]);
  const [aiUsage, setAiUsage] = useState<AiUsage | null>(null);
  const [aiSettings, setAiSettings] = useState<AiSettings | null>(null);
  const [aiSettingsDraft, setAiSettingsDraft] = useState<AiSettingsDraft>(emptyAiSettingsDraft);
  const [draft, setDraft] = useState<WineDraft>(emptyDraft);
  const [wishlistDraft, setWishlistDraft] = useState<WishlistDraft>(emptyWishlistDraft);
  const [authDraft, setAuthDraft] = useState<AuthDraft>(emptyAuthDraft);
  const [contactSupportDraft, setContactSupportDraft] = useState<ContactSupportDraft>(emptyContactSupportDraft);
  const [inviteDraft, setInviteDraft] = useState<InviteDraft>(emptyInviteDraft);
  const [pairingDish, setPairingDish] = useState("");
  const [pairingIncludeMarket, setPairingIncludeMarket] = useState(false);
  const [pairingMarketOnly, setPairingMarketOnly] = useState(false);
  const [pairingResult, setPairingResult] = useState<PairingResult | null>(null);
  const [tagDraft, setTagDraft] = useState("");
  const [tagDraftColor, setTagDraftColor] = useState("#245142");
  const [quickTagDraft, setQuickTagDraft] = useState("");
  const [quickTagColor, setQuickTagColor] = useState("#245142");
  const [tagEdits, setTagEdits] = useState<Record<string, { name: string; color: string }>>({});
  const [acceptToken, setAcceptToken] = useState("");
  const [inviteToken, setInviteToken] = useState("");
  const [generatedInviteLink, setGeneratedInviteLink] = useState("");
  const [redeemCodeDraft, setRedeemCodeDraft] = useState<RedeemCodeDraft>(emptyRedeemCodeDraft);
  const [redeemInput, setRedeemInput] = useState("");
  const [generatedRedeemCode, setGeneratedRedeemCode] = useState("");
  const [householdNameDraft, setHouseholdNameDraft] = useState("");
  const [shareDraft, setShareDraft] = useState({ email: "", share_pct: "50", message: "" });
  const [passkeyName, setPasskeyName] = useState("Vinaris");
  const [importPayload, setImportPayload] = useState<Record<string, unknown> | null>(null);
  const [importFileName, setImportFileName] = useState("");
  const [importMode, setImportMode] = useState<ImportMode>("skip_duplicates");
  const [importPreview, setImportPreview] = useState<ImportPreview | null>(null);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [offlineMode, setOfflineMode] = useState(false);
  const [offlineFileName, setOfflineFileName] = useState("");
  const [authMode, setAuthMode] = useState<"login" | "register">("login");
  const [activeView, setActiveView] = useState<ViewName>("home");
  const [dashboardFocus, setDashboardFocus] = useState<DashboardFocus>("collector");
  const [settingsTab, setSettingsTab] = useState<SettingsTab>("profile");
  const [selectedWineId, setSelectedWineId] = useState<string | null>(null);
  const [selectedWishlistId, setSelectedWishlistId] = useState<string | null>(null);
  const [pendingWineScrollId, setPendingWineScrollId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingWishlistId, setEditingWishlistId] = useState<string | null>(null);
  const [wineFormOpen, setWineFormOpen] = useState(false);
  const [wishlistFormOpen, setWishlistFormOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [ownershipFilter, setOwnershipFilter] = useState("");
  const [quickWineFilter, setQuickWineFilter] = useState<QuickWineFilter>("");
  const [valueRefreshDays, setValueRefreshDays] = useState("30");
  const [tagFilter, setTagFilter] = useState<string[]>([]);
  const [sortMode, setSortMode] = useState<SortMode>("name");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [generatingAi, setGeneratingAi] = useState("");
  const [error, setError] = useState("");
  const [locale, setLocale] = useState<Locale>(() => (navigator.language.toLowerCase().startsWith("it") ? "it" : "en"));
  const [themePreference, setThemePreference] = useState<ThemePreference>("system");
  const t = (key: TranslationKey) => translate(locale, key);
  const landing = landingContent[locale];
  const helpGuide = helpGuideContent[locale];
  const wineTemplateSuggestions = [...wines, ...wineCatalog]
    .filter((wine, index, items) => wine.name.trim() && items.findIndex((item) => item.name.trim().toLowerCase() === wine.name.trim().toLowerCase()) === index)
    .sort((first, second) => first.name.localeCompare(second.name));

  function matchingWineTemplate(name: string): Wine | CatalogWine | null {
    const normalized = name.trim().toLowerCase();
    if (!normalized) return null;
    return (
      wines.find((wine) => wine.name.trim().toLowerCase() === normalized) ||
      wineCatalog.find((wine) => wine.name.trim().toLowerCase() === normalized) ||
      null
    );
  }

  function updateWineDraftName(name: string) {
    const baseDraft = { ...draft, name };
    if (editingId) {
      setDraft(baseDraft);
      return;
    }
    const template = matchingWineTemplate(name);
    if (!template) {
      setDraft(baseDraft);
      return;
    }
    setDraft({
      ...baseDraft,
      producer: template.producer || baseDraft.producer,
      region: template.region || baseDraft.region,
      appellation: template.appellation || baseDraft.appellation,
      format: template.format || baseDraft.format,
      type: template.type || baseDraft.type,
      currency: "currency" in template ? template.currency || baseDraft.currency : baseDraft.currency,
      current_value: "current_value" in template && template.current_value ? String(template.current_value) : baseDraft.current_value,
      owner_share_pct: "owner_share_pct" in template ? String(template.owner_share_pct || baseDraft.owner_share_pct) : baseDraft.owner_share_pct,
    });
  }

  function updateWishlistDraftName(name: string) {
    const baseDraft = { ...wishlistDraft, name };
    if (editingWishlistId) {
      setWishlistDraft(baseDraft);
      return;
    }
    const template = matchingWineTemplate(name);
    if (!template) {
      setWishlistDraft(baseDraft);
      return;
    }
    setWishlistDraft({
      ...baseDraft,
      producer: template.producer || baseDraft.producer,
      region: template.region || baseDraft.region,
      appellation: template.appellation || baseDraft.appellation,
      format: template.format || baseDraft.format,
      type: template.type || baseDraft.type,
      currency: "currency" in template ? template.currency || baseDraft.currency : baseDraft.currency,
    });
  }

  function applySessionPreferences(nextSession: Session) {
    setLocale(nextSession.locale || "it");
    setThemePreference(nextSession.theme_preference || "system");
  }

  async function changeLocale(nextLocale: Locale) {
    setLocale(nextLocale);
    if (!session?.authenticated) return;
    try {
      const nextSession = await api<Session>("/api/v1/auth/preferences", {
        method: "PATCH",
        body: JSON.stringify({ locale: nextLocale }),
      });
      setSession(nextSession);
      applySessionPreferences(nextSession);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Unable to update language");
    }
  }

  async function changeTheme(nextTheme: ThemePreference) {
    setThemePreference(nextTheme);
    if (!session?.authenticated) return;
    try {
      const nextSession = await api<Session>("/api/v1/auth/preferences", {
        method: "PATCH",
        body: JSON.stringify({ theme_preference: nextTheme }),
      });
      setSession(nextSession);
      applySessionPreferences(nextSession);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Unable to update theme");
    }
  }

  async function loadSession() {
    const nextSession = await api<Session>("/api/v1/session");
    setSession(nextSession);
    if (nextSession.authenticated) {
      applySessionPreferences(nextSession);
    }
    setHouseholdNameDraft(nextSession.active_household_name || "");
    return nextSession;
  }

  async function loadWines() {
    const nextWines = await api<Wine[]>("/api/v1/wines");
    setWines(nextWines);
    setSelectedWineId((currentId) => (currentId && nextWines.some((wine) => wine.id === currentId) ? currentId : null));
  }

  async function loadWineCatalog() {
    setWineCatalog(await api<CatalogWine[]>("/api/v1/wines/catalog"));
  }

  async function loadWishlist() {
    const nextWishlist = await api<WishlistItem[]>("/api/v1/wishlist");
    setWishlist(nextWishlist);
    setSelectedWishlistId((currentId) => (currentId && nextWishlist.some((item) => item.id === currentId) ? currentId : null));
  }

  async function loadTags(role = session?.membership_role) {
    if (role === "owner" || role === "admin" || role === "member") {
      const nextTags = await api<UserTag[]>("/api/v1/tags");
      setUserTags(nextTags);
      setTagEdits(Object.fromEntries(nextTags.map((tag) => [tag.id, { name: tag.name, color: tag.color || "#245142" }])));
    } else {
      setUserTags([]);
      setTagEdits({});
    }
  }

  async function loadShareOffers(authenticated = session?.authenticated) {
    if (authenticated) {
      setShareOffers(await api<WineShareOffer[]>("/api/v1/wines/share-offers"));
    } else {
      setShareOffers([]);
    }
  }

  async function loadReceivedInvites(authenticated = session?.authenticated) {
    if (authenticated) {
      setReceivedInvites(await api<Invite[]>("/api/v1/household/invites/received"));
    } else {
      setReceivedInvites([]);
    }
  }

  async function loadPasskeys(authenticated = session?.authenticated) {
    if (authenticated) {
      setPasskeys(await api<Passkey[]>("/api/v1/auth/passkeys"));
    } else {
      setPasskeys([]);
    }
  }

  async function loadHouseholdData(role = session?.membership_role) {
    const [nextMemberships, nextMembers] = await Promise.all([
      api<HouseholdMembership[]>("/api/v1/household/memberships"),
      api<Member[]>("/api/v1/household/members"),
    ]);
    setHouseholdMemberships(nextMemberships);
    setMembers(nextMembers);
    if (role === "owner" || role === "admin") {
      const nextInvites = await api<Invite[]>("/api/v1/household/invites");
      setInvites(nextInvites);
    } else {
      setInvites([]);
    }
  }

  async function loadAppUsers(isAppAdmin = session?.is_app_admin) {
    if (isAppAdmin) {
      const [nextUsers, nextPendingUsers] = await Promise.all([
        api<AppUser[]>("/api/v1/auth/users"),
        api<PendingUser[]>("/api/v1/auth/pending-users"),
      ]);
      const mergedUsers = [
        ...nextUsers,
        ...nextPendingUsers
          .filter((pendingUser) => !nextUsers.some((user) => user.id === pendingUser.id))
          .map((pendingUser) => ({ ...pendingUser, is_approved: false, is_app_admin: false, is_blocked: false, approved_at: null, entitlement_valid_until: null, entitlement_days_remaining: null })),
      ].sort((first, second) => Number(first.is_approved) - Number(second.is_approved) || first.email.localeCompare(second.email));
      setAppUsers(mergedUsers);
      setPendingUsers(mergedUsers.filter((user) => !user.is_approved));
    } else {
      setAppUsers([]);
      setPendingUsers([]);
    }
  }

  function openAuthPanel(mode: "login" | "register") {
    setAuthMode(mode);
    window.requestAnimationFrame(() => {
      document.getElementById("auth-panel")?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }

  async function submitContactSupport(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError("");
    try {
      await api<{ accepted: boolean }>("/api/v1/support/contact", {
        method: "POST",
        body: JSON.stringify({
          email: contactSupportDraft.email.trim() || session?.user_email || "",
          subject: contactSupportDraft.subject.trim(),
          message: contactSupportDraft.message.trim(),
        }),
      });
      setContactSupportDraft({
        email: session?.user_email || "",
        subject: "",
        message: "",
      });
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Unable to send support request");
    } finally {
      setSaving(false);
    }
  }

  async function loadBilling(authenticated = session?.authenticated, isAppAdmin = session?.is_app_admin) {
    if (!authenticated) {
      setBillingStatus(null);
      setRedeemCodes([]);
      return;
    }
    const [nextStatus, nextCodes] = await Promise.all([
      api<BillingStatus>("/api/v1/billing/status"),
      isAppAdmin ? api<RedeemCode[]>("/api/v1/billing/redeem-codes") : Promise.resolve([]),
    ]);
    setBillingStatus(nextStatus);
    setRedeemCodes(nextCodes);
  }

  async function loadNotifications(authenticated = session?.authenticated) {
    if (authenticated) {
      setUserNotifications(await api<UserNotification[]>("/api/v1/notifications"));
    } else {
      setUserNotifications([]);
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
        pairing_model: nextSettings.pairing_model,
      });
    } else {
      setAiSettings(null);
      setAiSettingsDraft(emptyAiSettingsDraft);
    }
  }

  async function loadAuthenticatedSessionData(nextSession: Session) {
    if (!nextSession.is_app_admin && !nextSession.has_active_entitlement) {
      await Promise.all([loadBilling(nextSession.authenticated, nextSession.is_app_admin), loadNotifications(nextSession.authenticated)]);
      return;
    }
    await Promise.all([loadWines(), loadWineCatalog(), loadWishlist(), loadShareOffers(nextSession.authenticated), loadReceivedInvites(nextSession.authenticated), loadNotifications(nextSession.authenticated), loadTags(nextSession.membership_role), loadPasskeys(nextSession.authenticated), loadHouseholdData(nextSession.membership_role), loadAppUsers(nextSession.is_app_admin), loadBilling(nextSession.authenticated, nextSession.is_app_admin), loadAiAudit(nextSession.membership_role), loadAiUsage(nextSession.membership_role), loadAiSettings(nextSession.membership_role)]);
  }

  async function loadData() {
    if (offlineMode) return;
    setError("");
    const nextSession = await loadSession();
    if (nextSession.authenticated) {
      if (!nextSession.is_app_admin && !nextSession.has_active_entitlement) {
        setWines([]);
        setWineCatalog([]);
        setWishlist([]);
        setShareOffers([]);
        setReceivedInvites([]);
        setUserNotifications([]);
        setUserTags([]);
        setPasskeys([]);
        setHouseholdMemberships([]);
        setMembers([]);
        setInvites([]);
        setPendingUsers([]);
        setAppUsers([]);
        setAiAudit([]);
        setAiUsage(null);
        setAiSettings(null);
        setAiSettingsDraft(emptyAiSettingsDraft);
        await loadAuthenticatedSessionData(nextSession);
      } else {
        await loadAuthenticatedSessionData(nextSession);
      }
    } else {
      setWines([]);
      setWineCatalog([]);
      setWishlist([]);
      setShareOffers([]);
      setReceivedInvites([]);
      setUserNotifications([]);
      setUserTags([]);
      setPasskeys([]);
      setHouseholdMemberships([]);
      setMembers([]);
      setInvites([]);
      setPendingUsers([]);
      setAppUsers([]);
      setAiAudit([]);
      setAiUsage(null);
      setAiSettings(null);
      setAiSettingsDraft(emptyAiSettingsDraft);
      setBillingStatus(null);
      setRedeemCodes([]);
    }
  }

  async function refreshAfterStripeCheckout() {
    for (let attempt = 0; attempt < 8; attempt += 1) {
      const nextSession = await loadSession();
      if (nextSession.authenticated) {
        const nextStatus = await api<BillingStatus>("/api/v1/billing/status");
        setBillingStatus(nextStatus);
        if (nextStatus.available_redeem_codes.length || nextStatus.has_active_entitlement) {
          await loadData();
          window.history.replaceState(null, "", window.location.pathname);
          return;
        }
      }
      if (nextSession.is_app_admin) {
        window.history.replaceState(null, "", window.location.pathname);
        return;
      }
      await new Promise((resolve) => window.setTimeout(resolve, 1500));
    }
    await loadData();
  }

  useEffect(() => {
    const urlToken = tokenFromUrl();
    if (urlToken) {
      setAcceptToken(urlToken);
    }
    const stripeCheckoutResult = stripeCheckoutResultFromUrl();
    const loader = stripeCheckoutResult === "success" ? refreshAfterStripeCheckout() : loadData();
    loader
      .catch((nextError) => setError(nextError instanceof Error ? nextError.message : "Unable to load data"))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    const darkQuery = window.matchMedia("(prefers-color-scheme: dark)");
    const applyTheme = () => {
      const resolvedTheme = themePreference === "system" ? (darkQuery.matches ? "dark" : "light") : themePreference;
      document.documentElement.dataset.theme = resolvedTheme;
      document.documentElement.dataset.themePreference = themePreference;
    };
    applyTheme();
    darkQuery.addEventListener("change", applyTheme);
    return () => darkQuery.removeEventListener("change", applyTheme);
  }, [themePreference]);

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
      if (nextSession.authenticated) {
        applySessionPreferences(nextSession);
      }
      setAuthDraft(emptyAuthDraft);
      if (nextSession.authenticated) {
        await loadAuthenticatedSessionData(nextSession);
      }
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Unable to authenticate");
    } finally {
      setSaving(false);
    }
  }

  async function loginWithPasskey() {
    if (!window.PublicKeyCredential) {
      setError("Passkey not supported by this browser");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const options = await api<PublicKeyCredentialRequestOptions>("/api/v1/auth/passkeys/login/options", { method: "POST" });
      const credential = await navigator.credentials.get({ publicKey: prepareRequestOptions(options) }) as PublicKeyCredential | null;
      if (!credential) return;
      const nextSession = await api<Session>("/api/v1/auth/passkeys/login/verify", {
        method: "POST",
        body: JSON.stringify({ credential: credentialToJson(credential) }),
      });
      setSession(nextSession);
      applySessionPreferences(nextSession);
      setAuthDraft(emptyAuthDraft);
      await loadAuthenticatedSessionData(nextSession);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Unable to login with passkey");
    } finally {
      setSaving(false);
    }
  }

  async function registerPasskey() {
    if (!window.PublicKeyCredential) {
      setError("Passkey not supported by this browser");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const name = passkeyName.trim() || "Vinaris";
      const options = await api<PublicKeyCredentialCreationOptions>("/api/v1/auth/passkeys/register/options", {
        method: "POST",
        body: JSON.stringify({ name }),
      });
      const credential = await navigator.credentials.create({ publicKey: prepareCreationOptions(options) }) as PublicKeyCredential | null;
      if (!credential) return;
      const passkey = await api<Passkey>("/api/v1/auth/passkeys/register/verify", {
        method: "POST",
        body: JSON.stringify({ name, credential: credentialToJson(credential) }),
      });
      setPasskeys((current) => [passkey, ...current]);
      setPasskeyName("Vinaris");
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Unable to register passkey");
    } finally {
      setSaving(false);
    }
  }

  async function deletePasskey(passkey: Passkey) {
    if (!window.confirm(`Delete passkey ${passkey.name}?`)) return;
    setSaving(true);
    setError("");
    try {
      await api<void>(`/api/v1/auth/passkeys/${passkey.id}`, { method: "DELETE" });
      setPasskeys((current) => current.filter((item) => item.id !== passkey.id));
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Unable to delete passkey");
    } finally {
      setSaving(false);
    }
  }

  async function logout() {
    setError("");
    if (!offlineMode) {
      await api<void>("/api/v1/auth/logout", { method: "POST" });
    }
    setOfflineMode(false);
    setOfflineFileName("");
    setSession({
      authenticated: false,
      user_display_name: null,
      user_email: null,
      active_household_id: null,
      active_household_name: null,
      membership_role: null,
      is_app_admin: false,
      pending_approval: false,
      locale: navigator.language.toLowerCase().startsWith("it") ? "it" : "en",
      theme_preference: "system",
      has_active_entitlement: false,
      entitlement_valid_until: null,
      entitlement_days_remaining: null,
    });
    setLocale(navigator.language.toLowerCase().startsWith("it") ? "it" : "en");
    setThemePreference("system");
    setWines([]);
    setWineCatalog([]);
    setWishlist([]);
    setShareOffers([]);
    setReceivedInvites([]);
    setUserNotifications([]);
    setUserTags([]);
    setPasskeys([]);
    setHouseholdMemberships([]);
    setHouseholdNameDraft("");
    setMembers([]);
    setPendingUsers([]);
    setAppUsers([]);
    setRedeemCodes([]);
    setBillingStatus(null);
    setRedeemInput("");
    setGeneratedRedeemCode("");
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

  async function updateHouseholdName(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextName = householdNameDraft.trim();
    if (!nextName) return;
    setSaving(true);
    setError("");
    try {
      const updatedMembership = await api<HouseholdMembership>("/api/v1/household", {
        method: "PATCH",
        body: JSON.stringify({ name: nextName }),
      });
      setHouseholdMemberships((current) =>
        current.map((membership) =>
          membership.household_id === updatedMembership.household_id ? updatedMembership : membership,
        ),
      );
      setSession((current) =>
        current
          ? {
              ...current,
              active_household_id: updatedMembership.household_id,
              active_household_name: updatedMembership.household_name,
              membership_role: updatedMembership.role,
            }
          : current,
      );
      setHouseholdNameDraft(updatedMembership.household_name);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Unable to update cellar name");
    } finally {
      setSaving(false);
    }
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
        body: JSON.stringify({ role, visibility_scope: member.visibility_scope }),
      });
      await loadData();
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Unable to update member");
    } finally {
      setSaving(false);
    }
  }

  async function updateMemberVisibility(member: Member, visibilityScope: "all" | "shared") {
    setSaving(true);
    setError("");
    try {
      await api<Member>(`/api/v1/household/members/${member.membership_id}`, {
        method: "PATCH",
        body: JSON.stringify({ visibility_scope: visibilityScope }),
      });
      await loadData();
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Unable to update member visibility");
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

  async function approveUser(user: PendingUser) {
    setSaving(true);
    setError("");
    try {
      await api<PendingUser>(`/api/v1/auth/pending-users/${user.id}/approve`, { method: "POST" });
      await loadAppUsers();
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Unable to approve user");
    } finally {
      setSaving(false);
    }
  }

  async function rejectUser(user: PendingUser) {
    if (!window.confirm(`Reject ${user.email}?`)) return;
    setSaving(true);
    setError("");
    try {
      await api<void>(`/api/v1/auth/pending-users/${user.id}`, { method: "DELETE" });
      await loadAppUsers();
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Unable to reject user");
    } finally {
      setSaving(false);
    }
  }

  async function toggleAppAdmin(user: AppUser) {
    setSaving(true);
    setError("");
    try {
      await api<AppUser>(`/api/v1/auth/users/${user.id}`, { method: "PATCH", body: JSON.stringify({ is_app_admin: !user.is_app_admin }) });
      await loadAppUsers();
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Unable to update user");
    } finally {
      setSaving(false);
    }
  }

  async function toggleUserBlocked(user: AppUser) {
    setSaving(true);
    setError("");
    try {
      await api<AppUser>(`/api/v1/auth/users/${user.id}`, { method: "PATCH", body: JSON.stringify({ is_blocked: !user.is_blocked }) });
      await loadAppUsers();
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Unable to update user");
    } finally {
      setSaving(false);
    }
  }

  async function deleteAppUser(user: AppUser) {
    if (!window.confirm(`Delete ${user.email}?`)) return;
    if (!window.confirm(`This permanently removes ${user.email}. Continue?`)) return;
    setSaving(true);
    setError("");
    try {
      await api<void>(`/api/v1/auth/users/${user.id}`, { method: "DELETE" });
      await loadAppUsers();
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Unable to delete user");
    } finally {
      setSaving(false);
    }
  }

  async function createRedeemCode(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError("");
    setGeneratedRedeemCode("");
    try {
      const created = await api<RedeemCode>("/api/v1/billing/redeem-codes", {
        method: "POST",
        body: JSON.stringify({
          label: redeemCodeDraft.label.trim(),
          duration_days: Number(redeemCodeDraft.duration_days || 0),
          max_redemptions: Number(redeemCodeDraft.max_redemptions || 1),
          email: redeemCodeDraft.email.trim() || null,
          expires_at: redeemCodeDraft.expires_at ? new Date(redeemCodeDraft.expires_at).toISOString() : null,
        }),
      });
      setGeneratedRedeemCode(created.code || "");
      setRedeemCodeDraft(emptyRedeemCodeDraft);
      await loadBilling(true, true);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Unable to create redeem code");
    } finally {
      setSaving(false);
    }
  }

  async function deleteRedeemCode(code: RedeemCode, force = false) {
    const codeLabel = code.code || code.code_prefix;
    if (!window.confirm(`${force ? "Permanently delete" : "Delete"} redeem code ${codeLabel}?`)) return;
    if (force && !window.confirm(`This also removes redemption history for ${codeLabel}. Continue?`)) return;
    setSaving(true);
    setError("");
    try {
      await api<void>(`/api/v1/billing/redeem-codes/${code.id}${force ? "?force=true" : ""}`, { method: "DELETE" });
      setRedeemCodes((currentCodes) =>
        currentCodes
          .filter((item) => item.id !== code.id || (item.redeemed_count > 0 && !force))
          .map((item) => (item.id === code.id ? { ...item, revoked_at: new Date().toISOString(), is_active: false } : item)),
      );
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Unable to delete redeem code");
    } finally {
      setSaving(false);
    }
  }

  async function redeemCodeValue(code: string) {
    if (!code.trim()) return;
    setSaving(true);
    setError("");
    try {
      const nextStatus = await api<BillingStatus>("/api/v1/billing/redeem", {
        method: "POST",
        body: JSON.stringify({ code: code.trim() }),
      });
      setBillingStatus(nextStatus);
      setRedeemInput("");
      await loadData();
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Unable to redeem code");
    } finally {
      setSaving(false);
    }
  }

  async function redeemCode(event: FormEvent) {
    event.preventDefault();
    await redeemCodeValue(redeemInput);
  }

  async function startCheckout(plan: PaymentPlan) {
    setSaving(true);
    setError("");
    try {
      const checkout = await api<CheckoutSession>("/api/v1/billing/checkout", { method: "POST", body: JSON.stringify({ plan }) });
      window.location.assign(checkout.checkout_url);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Unable to start checkout");
      setSaving(false);
    }
  }

  async function startBillingPortal() {
    setSaving(true);
    setError("");
    try {
      const portal = await api<BillingPortalSession>("/api/v1/billing/portal", { method: "POST" });
      window.location.assign(portal.portal_url);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Unable to open billing portal");
      setSaving(false);
    }
  }

  async function markNotificationRead(notification: UserNotification) {
    setError("");
    try {
      await api<void>(`/api/v1/notifications/${notification.id}/read`, { method: "POST" });
      setUserNotifications((current) => current.filter((item) => item.id !== notification.id));
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Unable to update notification");
    }
  }

  async function openNotification(notification: UserNotification) {
    if (notification.action_url?.includes("/settings/profile")) {
      setActiveView("settings");
      setSettingsTab("profile");
    }
    setNotificationsOpen(false);
    await markNotificationRead(notification);
  }

  async function createWineShareOffer(wine: Wine) {
    if (!shareDraft.email.trim()) return;
    setSaving(true);
    setError("");
    try {
      await api<WineShareOffer>(`/api/v1/wines/${wine.id}/share-offers`, {
        method: "POST",
        body: JSON.stringify({
          email: shareDraft.email.trim(),
          share_pct: Number(shareDraft.share_pct || 0),
          message: shareDraft.message.trim(),
        }),
      });
      setShareDraft({ email: "", share_pct: "50", message: "" });
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Unable to share wine");
    } finally {
      setSaving(false);
    }
  }

  async function decideShareOffer(offer: WineShareOffer, decision: "accept" | "decline") {
    setSaving(true);
    setError("");
    try {
      await api<Wine | WineShareOffer>(`/api/v1/wines/share-offers/${offer.id}/${decision}`, { method: "POST" });
      setShareOffers((current) => current.filter((item) => item.id !== offer.id));
      await loadWines();
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Unable to update share offer");
    } finally {
      setSaving(false);
    }
  }

  async function loadOfflineBackup(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setSaving(true);
    setError("");
    try {
      const payload = rawObject(JSON.parse(await file.text()));
      const household = rawObject(payload.household);
      const nextWines = rawArray(payload.wines).map(offlineWine);
      const nextWishlist = rawArray(payload.wishlist).map(offlineWishlistItem);
      setOfflineMode(true);
      setOfflineFileName(file.name);
      setSession({
        authenticated: true,
        user_display_name: "Offline",
        user_email: null,
        active_household_id: rawString(household.id, "offline"),
        active_household_name: rawString(household.name, file.name.replace(/\.json$/i, "")),
        membership_role: "offline",
        is_app_admin: false,
        pending_approval: false,
        locale,
        theme_preference: themePreference,
        has_active_entitlement: true,
        entitlement_valid_until: null,
        entitlement_days_remaining: null,
      });
      setWines(nextWines);
      setWishlist(nextWishlist);
      setSelectedWineId(null);
      setSelectedWishlistId(null);
      setShareOffers([]);
      setReceivedInvites([]);
      setUserNotifications([]);
      setUserTags([]);
      setPasskeys([]);
      setHouseholdMemberships([]);
      setMembers([]);
      setInvites([]);
      setPendingUsers([]);
      setAppUsers([]);
      setRedeemCodes([]);
      setBillingStatus(null);
      setAiAudit([]);
      setAiUsage(null);
      setAiSettings(null);
      setAiSettingsDraft(emptyAiSettingsDraft);
      setActiveView("cellar");
      setWineFormOpen(false);
      setWishlistFormOpen(false);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Unable to load local backup");
    } finally {
      setSaving(false);
      event.target.value = "";
    }
  }

  async function acceptReceivedInvite(invite: Invite) {
    setSaving(true);
    setError("");
    try {
      await api<Member>(`/api/v1/household/invites/${invite.id}/accept`, { method: "POST" });
      setReceivedInvites((current) => current.filter((item) => item.id !== invite.id));
      await loadData();
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Unable to accept invite");
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
        pairing_model: nextSettings.pairing_model,
      });
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Unable to save AI settings");
    } finally {
      setSaving(false);
    }
  }

  async function submitTag(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!tagDraft.trim()) return;
    setSaving(true);
    setError("");
    try {
      await api<UserTag>("/api/v1/tags", { method: "POST", body: JSON.stringify({ name: tagDraft.trim(), color: tagDraftColor }) });
      setTagDraft("");
      await loadTags();
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Unable to create tag");
    } finally {
      setSaving(false);
    }
  }

  async function createQuickTag() {
    if (!quickTagDraft.trim()) return;
    setSaving(true);
    setError("");
    try {
      const tag = await api<UserTag>("/api/v1/tags", { method: "POST", body: JSON.stringify({ name: quickTagDraft.trim(), color: quickTagColor }) });
      setDraft((current) => ({ ...current, tags: toggleListValue(current.tags, tag.name) }));
      setQuickTagDraft("");
      await loadTags();
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Unable to create tag");
    } finally {
      setSaving(false);
    }
  }

  async function updateTag(tag: UserTag) {
    const edit = tagEdits[tag.id];
    if (!edit?.name.trim()) return;
    setSaving(true);
    setError("");
    try {
      await api<UserTag>(`/api/v1/tags/${tag.id}`, { method: "PATCH", body: JSON.stringify({ name: edit.name.trim(), color: edit.color }) });
      await Promise.all([loadTags(), loadWines()]);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Unable to update tag");
    } finally {
      setSaving(false);
    }
  }

  async function deleteTag(tag: UserTag) {
    if (!window.confirm(`Delete tag ${tag.name}?`)) return;
    setSaving(true);
    setError("");
    try {
      await api<void>(`/api/v1/tags/${tag.id}`, { method: "DELETE" });
      await Promise.all([loadTags(), loadWines()]);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Unable to delete tag");
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
      const preview = await api<ImportPreview>("/api/v1/imports/legacy-json/preview", {
        method: "POST",
        body: JSON.stringify(payload),
      });
      setImportPayload(payload);
      setImportFileName(file.name);
      setImportPreview(preview);
      setImportResult(null);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Unable to import legacy export");
    } finally {
      setSaving(false);
      event.target.value = "";
    }
  }

  async function runLegacyImport() {
    if (!importPayload) return;
    if (importMode === "replace_all") {
      const firstConfirm = window.confirm("Questa operazione cancella prima tutti i vini e la wishlist della cantina attiva. Continuare?");
      if (!firstConfirm) return;
      const secondConfirm = window.confirm("Conferma definitiva: sostituire completamente la cantina con il JSON selezionato?");
      if (!secondConfirm) return;
    }
    setSaving(true);
    setError("");
    try {
      const result = await api<ImportResult>(`/api/v1/imports/legacy-json?mode=${importMode}`, {
        method: "POST",
        body: JSON.stringify(importPayload),
      });
      setImportResult(result);
      setImportPreview(null);
      setImportPayload(null);
      setImportFileName("");
      await Promise.all([loadWines(), loadWishlist()]);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Unable to import legacy export");
    } finally {
      setSaving(false);
    }
  }

  async function emptyCellar() {
    const firstConfirm = window.confirm("Questa operazione cancella tutti i vini e tutta la wishlist della cantina attiva. Continuare?");
    if (!firstConfirm) return;
    const secondConfirm = window.confirm("Conferma definitiva: svuotare la cantina? L'operazione non e reversibile senza backup/export.");
    if (!secondConfirm) return;
    setSaving(true);
    setError("");
    try {
      const result = await api<ImportResult>("/api/v1/imports/cellar", { method: "DELETE" });
      setImportResult(result);
      setImportPreview(null);
      setImportPayload(null);
      setImportFileName("");
      setSelectedWineId(null);
      setSelectedWishlistId(null);
      await Promise.all([loadWines(), loadWishlist()]);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Unable to empty cellar");
    } finally {
      setSaving(false);
    }
  }

  async function exportJson() {
    setSaving(true);
    setError("");
    try {
      const payload = await api<Record<string, unknown>>("/api/v1/imports/export-json");
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `winecellarmulti-export-${new Date().toISOString().slice(0, 10)}.json`;
      link.click();
      URL.revokeObjectURL(url);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Unable to export data");
    } finally {
      setSaving(false);
    }
  }

  async function deleteWine(wine: Wine) {
    if (!window.confirm(`Delete ${wine.name}?`)) return;
    setSaving(true);
    setError("");
    try {
      await api<void>(`/api/v1/wines/${wine.id}`, { method: "DELETE" });
      if (editingId === wine.id) {
        setEditingId(null);
        setDraft(emptyDraft);
        setWineFormOpen(false);
      }
      if (selectedWineId === wine.id) {
        setSelectedWineId(null);
      }
      await loadWines();
    } finally {
      setSaving(false);
    }
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

  async function generateWineAi(wine: Wine, feature: WineAiFeature) {
    setGeneratingAi(feature);
    setError("");
    try {
      const updated = await api<Wine>(`/api/v1/ai/wines/${wine.id}/${feature}`, {
        method: "POST",
        body: JSON.stringify({ locale }),
      });
      setWines((current) => current.map((item) => (item.id === updated.id ? updated : item)));
      setSelectedWineId(updated.id);
      await Promise.all([loadAiAudit(), loadAiUsage()]);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Unable to generate AI content");
    } finally {
      setGeneratingAi("");
    }
  }

  async function generateMissingWineAi(feature: WineAiFeature, items: Wine[]) {
    if (!items.length) return;
    setGeneratingAi(`batch-${feature}`);
    setError("");
    try {
      for (const wine of items) {
        const updated = await api<Wine>(`/api/v1/ai/wines/${wine.id}/${feature}`, {
          method: "POST",
          body: JSON.stringify({ locale }),
        });
        setWines((current) => current.map((item) => (item.id === updated.id ? updated : item)));
        setSelectedWineId(updated.id);
      }
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
      const updated = await api<WishlistItem>(`/api/v1/ai/wishlist/${item.id}/${feature}`, {
        method: "POST",
        body: JSON.stringify({ locale }),
      });
      setWishlist((current) => current.map((nextItem) => (nextItem.id === updated.id ? updated : nextItem)));
      setSelectedWishlistId(updated.id);
      await Promise.all([loadAiAudit(), loadAiUsage()]);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Unable to generate wishlist strategy");
    } finally {
      setGeneratingAi("");
    }
  }

  async function generatePairing(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!pairingDish.trim()) {
      setError(t("pairingEmptyDish"));
      return;
    }
    setGeneratingAi("pairing");
    setError("");
    try {
      const result = await api<PairingResult>("/api/v1/ai/pairing", {
        method: "POST",
        body: JSON.stringify({
          dish: pairingDish.trim(),
          include_market: pairingIncludeMarket,
          market_only: pairingMarketOnly,
          locale,
        }),
      });
      setPairingResult(result);
      await Promise.all([loadAiAudit(), loadAiUsage()]);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Unable to generate pairing");
    } finally {
      setGeneratingAi("");
    }
  }

  const authenticated = Boolean(session?.authenticated);
  const needsRedeem = authenticated && !session?.is_app_admin && !session?.has_active_entitlement;
  const activeMembership =
    householdMemberships.find((membership) => membership.household_id === session?.active_household_id) ||
    householdMemberships.find((membership) => membership.household_name === session?.active_household_name);
  const canAdmin = !offlineMode && (session?.membership_role === "owner" || session?.membership_role === "admin");
  const canAppAdmin = !offlineMode && Boolean(session?.is_app_admin);
  const canWriteWine = !offlineMode && (canAdmin || session?.membership_role === "member");
  const canGenerateAi = canWriteWine && Boolean(aiSettings?.has_openai_api_key);
  const currentUserEmail = session?.user_email?.toLowerCase();
  const selectedWine = wines.find((wine) => wine.id === selectedWineId) || null;
  const selectedWishlistItem = wishlist.find((item) => item.id === selectedWishlistId) || null;
  const normalizedQuery = searchQuery.trim().toLowerCase();
  const cellarWines = wines.filter((wine) => wine.quantity > 0);
  const historyWines = wines.filter((wine) => wine.quantity <= 0);
  const isWineCollectionView = activeView === "cellar" || activeView === "history";
  const activeWineCollection = activeView === "history" ? historyWines : cellarWines;
  const selectedVisibleWine = selectedWine && activeWineCollection.some((wine) => wine.id === selectedWine.id) ? selectedWine : null;
  const wineTypeOptions = uniqueSorted(activeWineCollection.map((wine) => wine.type));
  const wishlistTypeOptions = uniqueSorted(wishlist.map((item) => item.type));
  const wineStatusOptions = uniqueSorted(activeWineCollection.map((wine) => wine.status));
  const wishlistStatusOptions = uniqueSorted(wishlist.map((item) => item.status));
  const tagOptions = uniqueSorted(activeWineCollection.flatMap((wine) => wine.tags));
  const wineFormTagOptions = uniqueSorted([...userTags.map((tag) => tag.name), ...draft.tags]);
  const activeTypeOptions = isWineCollectionView ? wineTypeOptions : wishlistTypeOptions;
  const activeStatusOptions = isWineCollectionView ? wineStatusOptions : wishlistStatusOptions;
  const currentYear = new Date().getFullYear();
  const now = new Date();
  const filteredWines = activeWineCollection
    .filter((wine) => !normalizedQuery || wineSearchText(wine).includes(normalizedQuery))
    .filter((wine) => !typeFilter || wine.type === typeFilter)
    .filter((wine) => !statusFilter || wine.status === statusFilter)
    .filter((wine) => {
      if (!ownershipFilter) return true;
      const share = currentUserSharePct(wine, session);
      if (ownershipFilter === "mine") return share > 0;
      if (ownershipFilter === "shared") return share < 100;
      return true;
    })
    .filter((wine) => {
      if (!quickWineFilter) return true;
      const share = currentUserSharePct(wine, session);
      if (quickWineFilter === "mine") return share > 0;
      if (quickWineFilter === "shared") return share < 100;
      if (quickWineFilter === "drink_now") return Boolean(wine.drink_from && wine.drink_to && wine.drink_from <= currentYear && wine.drink_to >= currentYear);
      if (quickWineFilter === "drink_soon") return Boolean(wine.drink_from && wine.drink_from > currentYear && wine.drink_from <= currentYear + 2);
      if (quickWineFilter === "past_window") return Boolean(wine.drink_to && wine.drink_to < currentYear);
      if (quickWineFilter === "future_deliveries") return isFutureDeliveryWine(wine, now);
      if (quickWineFilter === "missing_data") return !wine.current_value || !wine.drink_from || !wine.drink_to || wine.scores.length === 0;
      return true;
    })
    .filter((wine) => tagFilter.length === 0 || tagFilter.every((tag) => wine.tags.includes(tag)))
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
      if (sortMode === "priority") {
        return prioritySortValue(first.priority) - prioritySortValue(second.priority) || first.name.localeCompare(second.name);
      }
      if (sortMode === "vintage") return (Number(second.vintage) || 0) - (Number(first.vintage) || 0);
      if (sortMode === "value") return Number(second.target_price || 0) - Number(first.target_price || 0);
      return first.name.localeCompare(second.name);
    });
  const visibleCount = isWineCollectionView ? filteredWines.length : filteredWishlist.length;

  useEffect(() => {
    if (activeView !== "cellar" || !pendingWineScrollId) return;
    const targetIsVisible = filteredWines.some((wine) => wine.id === pendingWineScrollId);
    if (!targetIsVisible) return;

    const timer = window.setTimeout(() => {
      const target = document.querySelector<HTMLElement>(`[data-wine-row-id="${pendingWineScrollId}"]`);
      if (!target) return;
      target.scrollIntoView({ behavior: "smooth", block: "start" });
      setPendingWineScrollId(null);
    }, 80);

    return () => window.clearTimeout(timer);
  }, [activeView, filteredWines, pendingWineScrollId]);

  useEffect(() => {
    if (session?.user_email) {
      setContactSupportDraft((current) => (current.email ? current : { ...current, email: session.user_email || "" }));
      return;
    }
    if (!authenticated && authDraft.email && !contactSupportDraft.email) {
      setContactSupportDraft((current) => (current.email ? current : { ...current, email: authDraft.email }));
    }
  }, [session?.user_email, authenticated, authDraft.email, contactSupportDraft.email]);

  const cellarOwnership = ownershipStats(cellarWines, session);
  const parsedValueRefreshDays = Number(valueRefreshDays);
  const valueRefreshDaysNumber = Number.isFinite(parsedValueRefreshDays) ? Math.max(parsedValueRefreshDays, 0) : 0;
  const sharedBottles = Math.max(cellarOwnership.totalBottles - cellarOwnership.myBottles, 0);
  const sharedValue = Math.max(cellarOwnership.totalValue - cellarOwnership.myValue, 0);
  const cellarStats = {
    bottles: cellarOwnership.totalBottles,
    totalValue: cellarOwnership.totalValue,
    myBottles: cellarOwnership.myBottles,
    myValue: cellarOwnership.myValue,
    sharedBottles,
    sharedValue,
    drinkNow: cellarWines.filter((wine) => wine.drink_from && wine.drink_to && wine.drink_from <= currentYear && wine.drink_to >= currentYear).length,
    drinkSoon: cellarWines.filter((wine) => wine.drink_from && wine.drink_from > currentYear && wine.drink_from <= currentYear + 2).length,
    pastWindow: cellarWines.filter((wine) => wine.drink_to && wine.drink_to < currentYear).length,
    futureDeliveries: cellarWines.filter((wine) => isFutureDeliveryWine(wine, now)).length,
    nextDelivery: cellarWines
      .map((wine) => (isFutureDeliveryWine(wine, now) ? { wine, days: daysUntil(wine.expected_delivery || "") } : null))
      .filter((item): item is { wine: Wine; days: number } => Boolean(item && item.days !== null && item.days >= 0))
      .sort((first, second) => first.days - second.days)[0],
    missingValue: cellarWines.filter((wine) => !wine.current_value).length,
    missingDrinkWindow: cellarWines.filter((wine) => !wine.drink_from || !wine.drink_to).length,
    missingScores: cellarWines.filter((wine) => wine.scores.length === 0).length,
    aiNotes: cellarWines.filter((wine) => wine.ai_notes || wine.ai_value_notes).length,
  };
  const wishlistStats = {
    count: wishlist.length,
    targetValue: wishlist.reduce((total, item) => total + Number(item.target_price || 0), 0),
    highPriority: wishlist.filter((item) => item.priority.toLowerCase() === "high").length,
    readyToBuy: wishlist.filter((item) => isWishlistReadyToBuy(item.status)).length,
  };
  const valueByType = topWineValueGroups(cellarWines, "type");
  const valueByRegion = topWineValueGroups(cellarWines, "region");
  const valueByProducer = topProducerGroups(cellarWines);
  const maturity = maturityBuckets(cellarWines, currentYear, locale);
  const drinkNowWines = cellarWines
    .filter((wine) => wine.drink_from && wine.drink_to && wine.drink_from <= currentYear && wine.drink_to >= currentYear)
    .sort((first, second) => wineUnitValue(second) - wineUnitValue(first))
    .slice(0, 5);
  const atRiskWines = cellarWines
    .filter((wine) => wine.drink_to && wine.drink_to < currentYear)
    .sort((first, second) => (first.drink_to || 9999) - (second.drink_to || 9999))
    .slice(0, 5);
  const upcomingDeliveries = cellarWines
    .map((wine) => (isFutureDeliveryWine(wine, now) ? { wine, days: daysUntil(wine.expected_delivery || "") } : null))
    .filter((item): item is { wine: Wine; days: number } => Boolean(item && item.days !== null && item.days >= 0))
    .sort((first, second) => first.days - second.days)
    .slice(0, 5);
  const deliveryTimelineItems = cellarWines
    .map((wine) => {
      if (!isFutureDeliveryWine(wine, now)) return null;
      const dateMs = new Date(wine.expected_delivery || "").getTime();
      const days = daysUntil(wine.expected_delivery || "");
      return Number.isNaN(dateMs) || days === null || days < 0 ? null : { wine, days, dateMs };
    })
    .filter((item): item is { wine: Wine; days: number; dateMs: number } => Boolean(item))
    .sort((first, second) => first.dateMs - second.dateMs);
  const deliveryTimelineStart = deliveryTimelineItems[0]?.dateMs || now.getTime();
  const deliveryTimelineEnd = deliveryTimelineItems[deliveryTimelineItems.length - 1]?.dateMs || deliveryTimelineStart + 365 * 86400000;
  const deliveryTimelineRange = Math.max(deliveryTimelineEnd - deliveryTimelineStart, 1);
  const firstDeliveryTimelineItem = deliveryTimelineItems[0] || null;
  const lastDeliveryTimelineItem = deliveryTimelineItems[deliveryTimelineItems.length - 1] || null;
  const deliveryHorizonStats = {
    next30: deliveryTimelineItems.filter((item) => item.days <= 30).length,
    next90: deliveryTimelineItems.filter((item) => item.days <= 90).length,
    next365: deliveryTimelineItems.filter((item) => item.days <= 365).length,
    beyond365: deliveryTimelineItems.filter((item) => item.days > 365).length,
    total: deliveryTimelineItems.length,
  };
  const incompleteWines = cellarWines
    .filter((wine) => !wine.current_value || !wine.drink_from || !wine.drink_to || wine.scores.length === 0)
    .sort((first, second) => {
      const firstMissing = Number(!first.current_value) + Number(!first.drink_from || !first.drink_to) + Number(first.scores.length === 0);
      const secondMissing = Number(!second.current_value) + Number(!second.drink_from || !second.drink_to) + Number(second.scores.length === 0);
      return secondMissing - firstMissing;
    })
    .slice(0, 5);
  const peakNowWines = cellarWines
    .filter((wine) => wine.drink_peak_from && wine.drink_peak_to && wine.drink_peak_from <= currentYear && wine.drink_peak_to >= currentYear)
    .sort((first, second) => wineUnitValue(second) - wineUnitValue(first))
    .slice(0, 5);
  const drinkSoonWines = cellarWines
    .filter((wine) => wine.drink_from && wine.drink_from > currentYear && wine.drink_from <= currentYear + 2)
    .sort((first, second) => (first.drink_from || 9999) - (second.drink_from || 9999))
    .slice(0, 5);
  const topValueWines = [...cellarWines]
    .sort((first, second) => wineUnitValue(second) - wineUnitValue(first))
    .slice(0, 5);
  const allMissingValueWines = cellarWines.filter((wine) => !wine.current_value);
  const allValueRefreshWines = cellarWines.filter((wine) => needsValueRefresh(wine, valueRefreshDaysNumber, now));
  const allMissingDrinkWindowWines = cellarWines.filter((wine) => !wine.drink_from || !wine.drink_to);
  const allMissingScoresWines = cellarWines.filter((wine) => wine.scores.length === 0);
  const missingValueWines = allMissingValueWines.slice(0, 5);
  const valueRefreshWines = allValueRefreshWines.slice(0, 5);
  const missingDrinkWindowWines = allMissingDrinkWindowWines.slice(0, 5);
  const missingScoresWines = allMissingScoresWines.slice(0, 5);
  const maxRegionValue = Math.max(...valueByRegion.map((item) => item.value), 1);
  const maxProducerValue = Math.max(...valueByProducer.map((item) => item.value), 1);
  const isCollectionView = isWineCollectionView || activeView === "wishlist";
  const dashboardFocusLabels: Record<DashboardFocus, string> = {
    collector: t("collectorFocus"),
    value: t("valueFocus"),
    readiness: t("drinkingWindow"),
    timeline: t("timeline"),
    data: t("dataFocus"),
  };
  const settingsTabLabels: Record<SettingsTab, string> = {
    profile: t("settingsProfile"),
    ai: t("settingsAi"),
    sharing: t("settingsSharing"),
    users: t("settingsUsers"),
    data: t("settingsData"),
  };
  const settingsTabs = (Object.keys(settingsTabLabels) as SettingsTab[]).filter((tab) => tab !== "users" || canAppAdmin);
  const entitlementNotificationCount = authenticated && !session?.is_app_admin ? 1 : 0;
  const notificationCount = userNotifications.length + (canAppAdmin ? pendingUsers.length : 0) + receivedInvites.length + shareOffers.length + entitlementNotificationCount;
  const quickWineFilterLabels: Record<QuickWineFilter, string> = {
    "": t("totalValue"),
    mine: t("myBottles"),
    shared: t("sharedBottles"),
    drink_now: t("drinkNow"),
    drink_soon: t("drinkIn2Years"),
    past_window: t("pastWindow"),
    future_deliveries: t("futureDeliveries"),
    missing_data: t("dataQuality"),
  };

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

  function isInteractiveRowClick(event: MouseEvent<HTMLElement>) {
    return Boolean((event.target as HTMLElement).closest("button, input, select, textarea, label, a, summary"));
  }

  function toggleSelectedWine(wine: Wine) {
    setSelectedWineId((current) => current === wine.id ? null : wine.id);
  }

  function toggleSelectedWishlistItem(item: WishlistItem) {
    setSelectedWishlistId((current) => current === item.id ? null : item.id);
  }

  function renderSharePanel(wine: Wine) {
    if (!canWriteWine || !hasSharedOwnership(wine)) return null;
    return (
      <details className="wine-form share-panel collapsible-panel">
        <summary>{t("shareWine")}</summary>
        <p className="empty-state">{t("shareWineHelp")}</p>
        <label>
          <span>{t("email")}</span>
          <input type="email" value={shareDraft.email} onChange={(event) => setShareDraft({ ...shareDraft, email: event.target.value })} />
        </label>
        <div className="form-row">
          <label>
            <span>{t("sharePct")}</span>
            <input type="number" min="0" max="100" step="0.01" value={shareDraft.share_pct} onChange={(event) => setShareDraft({ ...shareDraft, share_pct: event.target.value })} />
          </label>
        </div>
        <label>
          <span>{t("message")}</span>
          <textarea rows={2} value={shareDraft.message} onChange={(event) => setShareDraft({ ...shareDraft, message: event.target.value })} />
        </label>
        <button type="button" disabled={saving || !shareDraft.email.trim()} onClick={() => createWineShareOffer(wine)}>
          {t("shareWine")}
        </button>
      </details>
    );
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

  function clearFilters(nextView: ViewName = activeView) {
    setSearchQuery("");
    setTypeFilter("");
    setStatusFilter("");
    setOwnershipFilter("");
    setQuickWineFilter("");
    setTagFilter([]);
    setSortMode(nextView === "wishlist" ? "priority" : "name");
  }

  function applyQuickWineFilter(filter: QuickWineFilter) {
    setActiveView("cellar");
    setSearchQuery("");
    setTypeFilter("");
    setStatusFilter("");
    setOwnershipFilter("");
    setTagFilter([]);
    setSortMode("name");
    setQuickWineFilter((current) => current === filter ? "" : filter);
    setWineFormOpen(false);
    setWishlistFormOpen(false);
  }

  function aiEntityName(entry: AiAuditLog) {
    if (entry.entity_type === "wine") return wines.find((wine) => wine.id === entry.entity_id)?.name || entry.entity_type;
    if (entry.entity_type === "wishlist") return wishlist.find((item) => item.id === entry.entity_id)?.name || entry.entity_type;
    return entry.entity_type;
  }

  function openWineFromDashboard(wine: Wine) {
    setActiveView("cellar");
    setSearchQuery("");
    setTypeFilter("");
    setStatusFilter("");
    setOwnershipFilter("");
    setTagFilter([]);
    setQuickWineFilter("");
    setSortMode("name");
    setSelectedWineId(wine.id);
    setPendingWineScrollId(wine.id);
    setWineFormOpen(false);
    setWishlistFormOpen(false);
  }

  function renderPairingSection() {
    return (
      <section className="pairing-card">
        <div className="card-heading">
          <div>
            <span>{t("pairing")}</span>
            <h2>{t("pairingSubmit")}</h2>
          </div>
          {pairingResult?.model ? <strong>{pairingResult.model}</strong> : null}
        </div>
        <form className="pairing-form" onSubmit={generatePairing}>
          <label>
            <span>{t("pairingDish")}</span>
            <textarea value={pairingDish} onChange={(event) => setPairingDish(event.target.value)} placeholder={t("pairingPlaceholder")} rows={3} disabled={!canGenerateAi || generatingAi === "pairing"} />
          </label>
          <label className="pairing-option">
            <input type="checkbox" checked={pairingIncludeMarket} onChange={(event) => setPairingIncludeMarket(event.target.checked)} disabled={!canGenerateAi || pairingMarketOnly || generatingAi === "pairing"} />
            <span>{t("pairingIncludeMarket")}</span>
          </label>
          <label className="pairing-option">
            <input type="checkbox" checked={pairingMarketOnly} onChange={(event) => setPairingMarketOnly(event.target.checked)} disabled={!canGenerateAi || generatingAi === "pairing"} />
            <span>{t("pairingMarketOnly")}</span>
          </label>
          <button type="submit" disabled={!canGenerateAi || generatingAi === "pairing"}>
            {generatingAi === "pairing" ? t("generating") : t("pairingSubmit")}
          </button>
          {!canGenerateAi ? <p className="empty-state">{t("noApiKey")}</p> : null}
        </form>
        {pairingResult ? (
          <div className="pairing-result">
            {pairingResult.summary ? <p className="pairing-summary">{pairingResult.summary}</p> : null}
            {pairingResult.cellar_matches.length ? (
              <section>
                <h3>{t("pairingCellarMatches")}</h3>
                <div className="pairing-match-list">
                  {pairingResult.cellar_matches.map((match) => (
                    <button type="button" className="pairing-match" key={match.wine_id} onClick={() => {
                      const wine = wines.find((item) => item.id === match.wine_id);
                      if (wine) openWineFromDashboard(wine);
                    }}>
                      <strong>{match.wine_name}</strong>
                      <span>{match.producer}</span>
                      <span><b>{t("pairingWhy")}:</b> {match.reason}</span>
                      {match.serving_note ? <span>{match.serving_note}</span> : null}
                    </button>
                  ))}
                </div>
              </section>
            ) : <p className="pairing-summary">{t("pairingNoCellarMatch")}</p>}
            {Object.values(pairingResult.market_recommendations).some((items) => items.length > 0) ? (
              <section>
                <h3>{t("pairingMarketFallback")}</h3>
                <div className="pairing-market-grid">
                  {(["low", "medium", "high"] as const).map((tier) => pairingResult.market_recommendations[tier]?.length ? (
                    <div className="pairing-market-tier" key={tier}>
                      <h4>{tier}</h4>
                      {pairingResult.market_recommendations[tier].map((item) => (
                        <article key={`${tier}-${item.name}-${item.producer}`}>
                          <strong>{item.name}</strong>
                          {item.producer ? <span>{item.producer}</span> : null}
                          {item.price_hint ? <span>{item.price_hint}</span> : null}
                          <p>{item.reason}</p>
                        </article>
                      ))}
                    </div>
                  ) : null)}
                </div>
              </section>
            ) : null}
            {pairingResult.model ? <p className="pairing-model-used">{t("pairingModelUsed")}: {pairingResult.model}</p> : null}
          </div>
        ) : null}
      </section>
    );
  }

  return (
    <main className="app-shell">
      <datalist id="wine-catalog-suggestions">
        {wineTemplateSuggestions.map((wine) => (
          <option
            key={`${wine.producer}-${wine.name}`}
            value={wine.name}
            label={[wine.name, wine.producer, wine.region].filter(Boolean).join(" - ")}
          />
        ))}
      </datalist>
      <header className="topbar">
        <div>
          <p className="eyebrow">Vinaris</p>
          <h1>{authenticated ? session?.active_household_name || "Vinaris" : "Vinaris"}</h1>
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
            {offlineMode ? <span>{t("offlineMode")}: {offlineFileName}</span> : null}
            {!offlineMode ? <div className="notification-wrap">
              <button type="button" className="secondary compact notification-button" onClick={() => setNotificationsOpen((open) => !open)}>
                {t("notifications")}
                {notificationCount ? <strong>{notificationCount}</strong> : null}
              </button>
              {notificationsOpen ? (
                <div className="notification-panel">
                  <div className="notification-heading">
                    <strong>{t("notifications")}</strong>
                    <span>{notificationCount}</span>
                  </div>
                  {authenticated && !session?.is_app_admin ? (
                    <button type="button" className="notification-item" onClick={() => { setActiveView("settings"); setSettingsTab("profile"); setNotificationsOpen(false); }}>
                      <strong>{t("entitlementValidity")}</strong>
                      <span>
                        {session?.has_active_entitlement && session.entitlement_days_remaining !== null
                          ? `${session.entitlement_days_remaining} ${t("daysRemaining")} - ${formatDisplayDate(session.entitlement_valid_until || "")}`
                        : t("redeemRequired")}
                      </span>
                    </button>
                  ) : null}
                  {userNotifications.map((notification) => (
                    <div className="notification-item" key={notification.id}>
                      <strong>{notification.title}</strong>
                      <span>{notification.message}</span>
                      <div className="member-actions">
                        <button type="button" className="compact" disabled={saving} onClick={() => openNotification(notification)}>
                          {notification.action_url ? t("open") : t("markRead")}
                        </button>
                        <button type="button" className="secondary compact" disabled={saving} onClick={() => markNotificationRead(notification)}>
                          {t("markRead")}
                        </button>
                      </div>
                    </div>
                  ))}
                  {canAppAdmin && pendingUsers.length ? (
                    <button type="button" className="notification-item" onClick={() => { setActiveView("settings"); setSettingsTab("users"); setNotificationsOpen(false); }}>
                      <strong>{pendingUsers.length} {t("pendingUsers")}</strong>
                      <span>{t("reviewUsers")}</span>
                    </button>
                  ) : null}
                  {receivedInvites.map((invite) => (
                    <div className="notification-item" key={invite.id}>
                      <strong>{invite.household_name || t("sharedCellar")}</strong>
                      <span>{t("acceptInvite")} - {invite.role}</span>
                      <button type="button" className="compact" disabled={saving} onClick={() => acceptReceivedInvite(invite)}>
                        {t("accept")}
                      </button>
                    </div>
                  ))}
                  {shareOffers.map((offer) => (
                    <div className="notification-item" key={offer.id}>
                      <strong>{offer.wine_name} {offer.wine_vintage}</strong>
                      <span>{offer.share_pct}% - {offer.created_by_email}</span>
                      <div className="member-actions">
                        <button type="button" className="compact" disabled={saving} onClick={() => decideShareOffer(offer, "accept")}>{t("accept")}</button>
                        <button type="button" className="secondary compact" disabled={saving} onClick={() => decideShareOffer(offer, "decline")}>{t("decline")}</button>
                      </div>
                    </div>
                  ))}
                  {!notificationCount ? <p className="empty-state">{t("noNotifications")}</p> : null}
                </div>
              ) : null}
            </div> : null}
            <button type="button" className="secondary compact" onClick={() => logout().catch((nextError) => setError(nextError instanceof Error ? nextError.message : "Unable to logout"))}>
              {t("logout")}
            </button>
          </div>
        ) : (
          <div className="session-pill">
            <label className="language-switch public-language-switch">
              <span>{t("language")}</span>
              <select value={locale} onChange={(event) => changeLocale(event.target.value as Locale)}>
                <option value="it">IT</option>
                <option value="en">EN</option>
              </select>
            </label>
            <button type="button" className="secondary compact" onClick={() => openAuthPanel("login")}>
              {t("login")}
            </button>
            <button type="button" className="compact" onClick={() => openAuthPanel("register")}>
              {t("register")}
            </button>
          </div>
        )}
      </header>

      {error ? <p className="error-banner">{error}</p> : null}

      {!authenticated ? (
        <>
          <section className="public-landing">
            <div className="public-hero">
              <div className="public-hero-copy">
                <p className="eyebrow">Vinaris</p>
                <h2>{landing.headline}</h2>
                <strong>{landing.subheadline}</strong>
                <p>{landing.description}</p>
                <div className="public-hero-actions">
                  <button type="button" onClick={() => openAuthPanel("login")}>
                    {landing.primaryCta}
                  </button>
                  <button type="button" className="secondary" onClick={() => openAuthPanel("register")}>
                    {landing.secondaryCta}
                  </button>
                </div>
              </div>
              <aside className="public-pricing-card">
                <p className="eyebrow">{landing.pricesTitle}</p>
                <div className="public-price-grid">
                  <div className="public-price-tile">
                    <strong>{landing.monthlyLabel}</strong>
                    <span>{locale === "it" ? "Accesso flessibile per mese" : "Flexible month-to-month access"}</span>
                  </div>
                  <div className="public-price-tile public-price-tile-highlight">
                    <strong>{landing.annualLabel}</strong>
                    <span>{locale === "it" ? "La scelta migliore per collezionisti attivi" : "Best value for active collectors"}</span>
                  </div>
                </div>
                <p className="public-pricing-note">{landing.savingsNote}</p>
              </aside>
            </div>

            <section className="public-features-card">
              <div className="public-section-heading">
                <p className="eyebrow">{landing.collectorTitle}</p>
                <h3>{landing.collectorBody}</h3>
              </div>
              <div className="public-feature-grid">
                {landing.features.map((feature) => (
                  <article className={feature.highlight ? "public-feature public-feature-highlight" : "public-feature"} key={feature.title}>
                    <h4>{feature.title}</h4>
                    <p>{feature.body}</p>
                  </article>
                ))}
              </div>
            </section>

            <section className="public-story-card">
              <div className="public-story-copy">
                <div className="public-section-heading">
                  <p className="eyebrow">{landing.storyEyebrow}</p>
                  <h3>{landing.storyTitle}</h3>
                </div>
                <p>{landing.storyBody}</p>
                <div className="public-principles-grid">
                  {landing.principles.map((principle) => (
                    <article className="public-principle" key={principle.title}>
                      <h4>{principle.title}</h4>
                      <p>{principle.body}</p>
                    </article>
                  ))}
                </div>
              </div>
              <aside className="public-founder-card">
                <p className="eyebrow">{landing.principlesTitle}</p>
                <blockquote>{landing.founderQuote}</blockquote>
                <div className="public-founder-meta">
                  <strong>{landing.founderName}</strong>
                  <span>{landing.founderRole}</span>
                </div>
              </aside>
            </section>

            <section className="public-showcase-card">
              <div className="public-section-heading">
                <p className="eyebrow">{locale === "it" ? "Anteprima applicazione" : "Application preview"}</p>
                <h3>
                  {locale === "it"
                    ? "Tre viste chiave per capire subito come lavora Vinaris."
                    : "Three key views that show how Vinaris works in practice."}
                </h3>
              </div>
              <div className="public-showcase-grid">
                <article className="showcase-frame showcase-frame-wide">
                  <div className="showcase-window">
                    <div className="showcase-bar">
                      <span className="showcase-tab active">Home</span>
                      <span className="showcase-tab">Cellar (45)</span>
                      <span className="showcase-tab">Wishlist (10)</span>
                      <span className="showcase-tab">Pairing</span>
                    </div>
                    <div className="showcase-hero">
                      <div>
                        <p className="eyebrow">Dashboard</p>
                        <h4>Collector focus</h4>
                        <span>Omar Bariffi Cellar: 45 wines, 10 wishlist.</span>
                      </div>
                      <div className="showcase-kpis">
                        <div><strong>97</strong><span>My bottles</span></div>
                        <div><strong>6</strong><span>Shared</span></div>
                        <div><strong>CHF 4769</strong><span>Total value</span></div>
                      </div>
                    </div>
                    <div className="showcase-dashboard-grid">
                      <div className="showcase-card">
                        <span>Priority actions</span>
                        <strong>Drink now</strong>
                        <ul>
                          <li>Krug Grande Cuvée</li>
                          <li>Dom Pérignon</li>
                          <li>Tignanello</li>
                        </ul>
                      </div>
                      <div className="showcase-card">
                        <span>At risk</span>
                        <strong>Past window</strong>
                        <ul>
                          <li>Sassi Grossi</li>
                          <li>Bidibi</li>
                        </ul>
                      </div>
                      <div className="showcase-card">
                        <span>Data quality</span>
                        <strong>39 items</strong>
                        <ul>
                          <li>Arzo · Value</li>
                          <li>Sirio · Value</li>
                          <li>Blanc de Blancs · Drink window</li>
                        </ul>
                      </div>
                    </div>
                  </div>
                  <div className="showcase-caption">
                    <strong>{locale === "it" ? "Dashboard da collezionista" : "Collector dashboard"}</strong>
                    <span>
                      {locale === "it"
                        ? "Priorità, rischi, consegne e qualità dei dati in una schermata leggibile."
                        : "Priorities, risks, deliveries, and data quality in one readable screen."}
                    </span>
                  </div>
                </article>

                <article className="showcase-frame">
                  <div className="showcase-window">
                    <div className="showcase-bar">
                      <span className="showcase-tab">Collector focus</span>
                      <span className="showcase-tab active">Timeline</span>
                      <span className="showcase-tab">Data quality</span>
                    </div>
                    <div className="showcase-timeline">
                      <div className="showcase-timeline-head">
                        <strong>27/06/2026 - 31/07/2028</strong>
                        <span>3 future deliveries</span>
                      </div>
                      <div className="showcase-timeline-track">
                        <div className="showcase-track-line" />
                        <span className="showcase-track-dot left" />
                        <span className="showcase-track-dot mid" />
                        <span className="showcase-track-dot right" />
                      </div>
                      <div className="showcase-timeline-list">
                        <div><strong>Le C des Carmes Haut-Brion</strong><span>25d</span></div>
                        <div><strong>Testamatta</strong><span>28d</span></div>
                        <div><strong>Chateau Pontet-Canet</strong><span>790d</span></div>
                      </div>
                    </div>
                  </div>
                  <div className="showcase-caption">
                    <strong>{locale === "it" ? "Timeline consegne" : "Delivery timeline"}</strong>
                    <span>
                      {locale === "it"
                        ? "Perfetta per futures, en primeur e arrivi da monitorare."
                        : "Ideal for futures, en primeur positions, and incoming deliveries."}
                    </span>
                  </div>
                </article>

                <article className="showcase-frame">
                  <div className="showcase-window">
                    <div className="showcase-detail-layout">
                      <div className="showcase-list">
                        <div className="showcase-list-row"><strong>Blanc De Blancs 2022</strong><span>CHF 32</span></div>
                        <div className="showcase-list-row active"><strong>Bourgogne blanc les Setilles 2022</strong><span>CHF 28</span></div>
                        <div className="showcase-list-row"><strong>Bourgogne Chardonnay 2022</strong><span>CHF 28</span></div>
                      </div>
                      <div className="showcase-detail-panel">
                        <div className="showcase-detail-grid">
                          <div><span>Format</span><strong>Bottle (750ml)</strong></div>
                          <div><span>Type</span><strong>White</strong></div>
                          <div><span>Quantity</span><strong>2 bottles</strong></div>
                          <div><span>Value</span><strong>CHF 28</strong></div>
                        </div>
                        <div className="showcase-micro-chart">
                          <span>Value evolution</span>
                          <div className="showcase-chart-line" />
                        </div>
                        <div className="showcase-drink-strip">
                          <span>2024</span>
                          <div className="showcase-drink-track"><strong /></div>
                          <span>2031</span>
                        </div>
                      </div>
                    </div>
                  </div>
                  <div className="showcase-caption">
                    <strong>{locale === "it" ? "Dettaglio vino" : "Wine detail view"}</strong>
                    <span>
                      {locale === "it"
                        ? "Scheda completa con quantità, valore, cronologia prezzo e finestra di beva."
                        : "Complete record with quantity, value, price history, and drinking window."}
                    </span>
                  </div>
                </article>
              </div>
            </section>
          </section>

        <section className="auth-panel" id="auth-panel">
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
            {session?.pending_approval ? (
              <div className="invite-notice">
                <strong>{t("pendingApproval")}</strong>
                <span>{t("pendingApprovalHelp")}</span>
              </div>
            ) : null}
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
                  <span>{t("cellarName")}</span>
                  <input value={authDraft.household_name} onChange={(event) => setAuthDraft({ ...authDraft, household_name: event.target.value })} required />
                </label>
              </>
            ) : null}
            <label>
              <span>{t("password")}</span>
              <input type="password" value={authDraft.password} onChange={(event) => setAuthDraft({ ...authDraft, password: event.target.value })} minLength={authMode === "register" ? 8 : 1} required />
            </label>
            <button type="submit" disabled={saving}>{saving ? t("working") : authMode === "register" ? t("createAccount") : t("login")}</button>
            {authMode === "login" ? (
              <button type="button" className="secondary" disabled={saving} onClick={() => loginWithPasskey()}>
                {t("passkeyLogin")}
              </button>
            ) : null}
          </form>
          <section className="wine-form">
            <h2>{t("offlineBackup")}</h2>
            <p className="empty-state">{t("offlineBackupHelp")}</p>
            <label>
              <span>{t("loadBackup")}</span>
              <input type="file" accept="application/json,.json" onChange={loadOfflineBackup} disabled={saving} />
            </label>
          </section>
          <ContactSupportPanel
            t={t}
            draft={contactSupportDraft}
            setDraft={setContactSupportDraft}
            saving={saving}
            onSubmit={submitContactSupport}
          />
        </section>
        </>
      ) : needsRedeem ? (
        <section className="auth-panel">
          <section className="wine-form">
            <h2>{t("redeemCode")}</h2>
            <div className="invite-notice">
              <strong>{t("redeemRequired")}</strong>
              <span>{session?.user_email}</span>
            </div>
            <div className="form-actions">
              <button type="button" onClick={() => startCheckout("monthly")} disabled={saving}>
                {saving ? t("working") : t("buyMonthly")}
              </button>
              <button type="button" className="secondary" onClick={() => startCheckout("annual")} disabled={saving}>
                {saving ? t("working") : t("buyAnnual")}
              </button>
              <button type="button" className="secondary" onClick={() => startBillingPortal()} disabled={saving}>
                {t("manageSubscription")}
              </button>
            </div>
            <p className="empty-state">{t("paymentHelp")}</p>
            {billingStatus?.available_redeem_codes.length ? (
              <div className="member-list">
                {billingStatus.available_redeem_codes.map((code) => (
                  <div className="member-row" key={code.id}>
                    <div>
                      <strong>{t("paidRedeemCode")}</strong>
                      <span>{code.code || code.code_prefix} - {code.duration_days}d</span>
                    </div>
                    {code.code ? (
                      <button type="button" className="secondary compact" onClick={() => navigator.clipboard?.writeText(code.code || "")}>
                        Copy
                      </button>
                    ) : null}
                    <button type="button" className="compact" disabled={saving || !code.code} onClick={() => code.code && redeemCodeValue(code.code)}>
                      {t("redeem")}
                    </button>
                  </div>
                ))}
              </div>
            ) : null}
            <form className="inline-form" onSubmit={redeemCode}>
              <label>
                <span>{t("redeemCode")}</span>
                <input value={redeemInput} onChange={(event) => setRedeemInput(event.target.value)} placeholder="WCM-XXXX-XXXX-XXXX-XXXX" />
              </label>
              <button type="submit" disabled={saving || !redeemInput.trim()}>
                {saving ? t("working") : t("redeem")}
              </button>
            </form>
          </section>
          <ContactSupportPanel
            t={t}
            draft={contactSupportDraft}
            setDraft={setContactSupportDraft}
            saving={saving}
            onSubmit={submitContactSupport}
          />
        </section>
      ) : (
        <section className={`workspace ${activeView === "settings" ? "settings-workspace" : activeView === "home" || activeView === "pairing" || activeView === "help" ? "home-workspace" : "content-workspace"}`}>
          <div className="view-tabs">
            <button type="button" className={activeView === "home" ? "" : "secondary"} onClick={() => { setActiveView("home"); setWineFormOpen(false); setWishlistFormOpen(false); clearFilters("home"); }}>
              {t("home")}
            </button>
            <button type="button" className={activeView === "cellar" ? "" : "secondary"} onClick={() => { setActiveView("cellar"); setWishlistFormOpen(false); setWineFormOpen(false); setSelectedWineId(null); clearFilters("cellar"); }}>
              {t("cellar")} ({cellarWines.length})
            </button>
            <button type="button" className={activeView === "history" ? "" : "secondary"} onClick={() => { setActiveView("history"); setWishlistFormOpen(false); setWineFormOpen(false); setSelectedWineId(null); clearFilters("history"); }}>
              {t("history")} ({historyWines.length})
            </button>
            <button type="button" className={activeView === "wishlist" ? "" : "secondary"} onClick={() => { setActiveView("wishlist"); setWineFormOpen(false); clearFilters("wishlist"); }}>
              {t("wishlist")} ({wishlist.length})
            </button>
            <button type="button" className={activeView === "pairing" ? "" : "secondary"} onClick={() => { setActiveView("pairing"); setWineFormOpen(false); setWishlistFormOpen(false); clearFilters("pairing"); }}>
              {t("pairing")}
            </button>
            <button type="button" className={activeView === "help" ? "" : "secondary"} onClick={() => { setActiveView("help"); setWineFormOpen(false); setWishlistFormOpen(false); clearFilters("help"); }}>
              {t("help")}
            </button>
            <button type="button" className={activeView === "settings" ? "" : "secondary"} onClick={() => { setActiveView("settings"); setWineFormOpen(false); setWishlistFormOpen(false); clearFilters("settings"); }}>
              {t("settings")}
            </button>
          </div>
          {activeView === "home" ? (
            <section className="home-dashboard">
              <section className="hero-panel">
                <div className="hero-copy">
                  <p className="eyebrow">{t("dashboard")}</p>
                  <h2>{dashboardFocusLabels[dashboardFocus]}</h2>
                  <p>{session?.active_household_name || "Wine Cellar"}: {cellarWines.length} {t("wines").toLowerCase()}, {wishlist.length} {t("wishlist").toLowerCase()}.</p>
                </div>
                <div className="hero-kpis" aria-label={t("cellarSnapshot")}>
                  <div className="hero-kpi">
                    <span>{t("myBottles")}</span>
                    <strong>{formatBottleCount(cellarStats.myBottles)}</strong>
                    <p>CHF {cellarStats.myValue.toFixed(0)}</p>
                  </div>
                  <div className="hero-kpi">
                    <span>{t("sharedBottles")}</span>
                    <strong>{formatBottleCount(cellarStats.sharedBottles)}</strong>
                    <p>CHF {cellarStats.sharedValue.toFixed(0)}</p>
                  </div>
                  <div className="hero-kpi">
                    <span>{t("totalValue")}</span>
                    <strong>CHF {cellarStats.totalValue.toFixed(0)}</strong>
                    <p>{cellarStats.bottles} {t("bottles").toLowerCase()}</p>
                  </div>
                </div>
              </section>

              <div className="focus-switcher" role="tablist" aria-label={t("dashboard")}>
                {(["collector", "value", "readiness", "timeline", "data"] as DashboardFocus[]).map((focus) => (
                  <button
                    type="button"
                    role="tab"
                    aria-selected={dashboardFocus === focus}
                    className={dashboardFocus === focus ? "" : "secondary"}
                    key={focus}
                    onClick={() => setDashboardFocus(focus)}
                  >
                    {dashboardFocusLabels[focus]}
                  </button>
                ))}
              </div>

              {dashboardFocus === "collector" ? (
              <DashboardCarousel label={t("priorityActions")}>
                <article className="dashboard-card priority-card">
                  <div className="card-heading">
                    <div>
                      <span>{t("priorityActions")}</span>
                      <h2>{t("drinkNow")}</h2>
                    </div>
                    <strong>{cellarStats.drinkNow}</strong>
                  </div>
                  <div className="action-list">
                    {drinkNowWines.length ? drinkNowWines.map((wine) => (
                      <button type="button" className="action-row" key={wine.id} onClick={() => openWineFromDashboard(wine)}>
                        <span><i className={`wine-dot tone-${wineTone(wine.type)}`} />{wine.name}</span>
                        <strong>{wine.vintage || wine.drink_from}-{wine.drink_to}</strong>
                      </button>
                    )) : <p className="empty-state">{t("noActionItems")}</p>}
                  </div>
                </article>

                <article className="dashboard-card">
                  <div className="card-heading">
                    <div>
                      <span>{t("atRiskWines")}</span>
                      <h2>{t("pastWindow")}</h2>
                    </div>
                    <strong>{cellarStats.pastWindow}</strong>
                  </div>
                  <div className="action-list">
                    {atRiskWines.length ? atRiskWines.map((wine) => (
                      <button type="button" className="action-row" key={wine.id} onClick={() => openWineFromDashboard(wine)}>
                        <span><i className={`wine-dot tone-${wineTone(wine.type)}`} />{wine.name}</span>
                        <strong>{wine.drink_to}</strong>
                      </button>
                    )) : <p className="empty-state">{t("noActionItems")}</p>}
                  </div>
                </article>

                <article className="dashboard-card">
                  <button type="button" className="card-heading card-heading-button" onClick={() => setDashboardFocus("timeline")}>
                    <div>
                      <span>{t("upcomingDeliveries")}</span>
                      <h2>{t("futureDeliveries")}</h2>
                    </div>
                    <strong>{cellarStats.futureDeliveries}</strong>
                  </button>
                  <div className="action-list">
                    {upcomingDeliveries.length ? upcomingDeliveries.map(({ wine, days }) => (
                      <button type="button" className="action-row" key={wine.id} onClick={() => openWineFromDashboard(wine)}>
                        <span><i className={`wine-dot tone-${wineTone(wine.type)}`} />{wine.name}</span>
                        <strong>{days}d</strong>
                      </button>
                    )) : <p className="empty-state">{t("noActionItems")}</p>}
                  </div>
                </article>

                <article className="dashboard-card">
                  <div className="card-heading">
                    <div>
                      <span>{t("incompleteData")}</span>
                      <h2>{t("dataQuality")}</h2>
                    </div>
                    <strong>{cellarStats.missingValue + cellarStats.missingDrinkWindow + cellarStats.missingScores}</strong>
                  </div>
                  <div className="action-list">
                    {incompleteWines.length ? incompleteWines.map((wine) => (
                      <button type="button" className="action-row" key={wine.id} onClick={() => openWineFromDashboard(wine)}>
                        <span><i className={`wine-dot tone-${wineTone(wine.type)}`} />{wine.name}</span>
                        <strong>{!wine.current_value ? t("value") : !wine.drink_from || !wine.drink_to ? t("drinkWindow") : t("scores")}</strong>
                      </button>
                    )) : <p className="empty-state">{t("noActionItems")}</p>}
                  </div>
                </article>

                <article className="dashboard-card wide-card">
                  <div className="card-heading">
                    <div>
                      <span>{t("maturityMap")}</span>
                      <h2>{t("drinkingWindow")}</h2>
                    </div>
                  </div>
                  <div className="maturity-grid">
                    {maturity.map((bucket) => (
                      <div className="maturity-item" key={bucket.key}>
                        <div>
                          <span>{bucket.label}</span>
                          <strong>{bucket.value}</strong>
                        </div>
                        <div className="maturity-track"><span style={{ width: `${bucket.pct}%` }} /></div>
                      </div>
                    ))}
                  </div>
                </article>

                <article className="dashboard-card">
                  <div className="card-heading">
                    <div>
                      <span>{t("investedMore")}</span>
                      <h2>{t("topRegions")}</h2>
                    </div>
                  </div>
                  <div className="bar-list">
                    {valueByRegion.map((item) => (
                      <div className="bar-row" key={item.label}>
                        <div><span>{item.label}</span><strong>CHF {item.value.toFixed(0)}</strong></div>
                        <div className="bar-track"><span style={{ width: `${Math.max((item.value / maxRegionValue) * 100, 5)}%` }} /></div>
                      </div>
                    ))}
                  </div>
                </article>

                <article className="dashboard-card">
                  <div className="card-heading">
                    <div>
                      <span>{t("valueByProducer")}</span>
                      <h2>{t("producer")}</h2>
                    </div>
                  </div>
                  <div className="bar-list">
                    {valueByProducer.map((item) => (
                      <div className="bar-row" key={item.label}>
                        <div><span>{item.label}</span><strong>CHF {item.value.toFixed(0)}</strong></div>
                        <div className="bar-track"><span style={{ width: `${Math.max((item.value / maxProducerValue) * 100, 5)}%` }} /></div>
                      </div>
                    ))}
                  </div>
                </article>
              </DashboardCarousel>
              ) : null}

              {dashboardFocus === "value" ? (
                <DashboardCarousel label={t("valueFocus")}>
                  <article className="dashboard-card priority-card">
                    <div className="card-heading">
                      <div>
                        <span>{t("totalValue")}</span>
                        <h2>CHF {cellarStats.totalValue.toFixed(0)}</h2>
                      </div>
                      <strong>{formatBottleCount(cellarStats.bottles)}</strong>
                    </div>
                    <p>{t("myBottles")}: CHF {cellarStats.myValue.toFixed(0)} · {t("sharedBottles")}: CHF {cellarStats.sharedValue.toFixed(0)}</p>
                  </article>
                  <article className="dashboard-card">
                    <div className="card-heading">
                      <div>
                        <span>{t("missingValue")}</span>
                        <h2>{t("dataQuality")}</h2>
                      </div>
                      <strong>{cellarStats.missingValue}</strong>
                    </div>
                    <div className="action-list">
                      {missingValueWines.length ? missingValueWines.map((wine) => (
                        <button type="button" className="action-row" key={wine.id} onClick={() => openWineFromDashboard(wine)}>
                          <span><i className={`wine-dot tone-${wineTone(wine.type)}`} />{wine.name}</span>
                          <strong>{t("value")}</strong>
                        </button>
                      )) : <p className="empty-state">{t("noActionItems")}</p>}
                    </div>
                  </article>
                  <article className="dashboard-card wide-card">
                    <div className="card-heading">
                      <div>
                        <span>{t("investedMore")}</span>
                        <h2>{t("topRegions")}</h2>
                      </div>
                    </div>
                    <div className="bar-list">
                      {valueByRegion.map((item) => (
                        <div className="bar-row" key={item.label}>
                          <div><span>{item.label}</span><strong>CHF {item.value.toFixed(0)}</strong></div>
                          <div className="bar-track"><span style={{ width: `${Math.max((item.value / maxRegionValue) * 100, 5)}%` }} /></div>
                        </div>
                      ))}
                    </div>
                  </article>
                  <article className="dashboard-card">
                    <div className="card-heading">
                      <div>
                        <span>{t("valueByProducer")}</span>
                        <h2>{t("producer")}</h2>
                      </div>
                    </div>
                    <div className="bar-list">
                      {valueByProducer.map((item) => (
                        <div className="bar-row" key={item.label}>
                          <div><span>{item.label}</span><strong>CHF {item.value.toFixed(0)}</strong></div>
                          <div className="bar-track"><span style={{ width: `${Math.max((item.value / maxProducerValue) * 100, 5)}%` }} /></div>
                        </div>
                      ))}
                    </div>
                  </article>
                  <article className="dashboard-card">
                    <div className="card-heading">
                      <div>
                        <span>{t("valueFocus")}</span>
                        <h2>{t("wines")}</h2>
                      </div>
                    </div>
                    <div className="action-list">
                      {topValueWines.map((wine) => (
                        <button type="button" className="action-row" key={wine.id} onClick={() => openWineFromDashboard(wine)}>
                          <span><i className={`wine-dot tone-${wineTone(wine.type)}`} />{wine.name}</span>
                          <strong>CHF {wineUnitValue(wine).toFixed(0)}</strong>
                        </button>
                      ))}
                    </div>
                  </article>
                </DashboardCarousel>
              ) : null}

              {dashboardFocus === "readiness" ? (
                <DashboardCarousel label={t("drinkingWindow")}>
                  <article className="dashboard-card priority-card">
                    <div className="card-heading">
                      <div>
                        <span>{t("peakNow")}</span>
                        <h2>{t("drinkNow")}</h2>
                      </div>
                      <strong>{peakNowWines.length}</strong>
                    </div>
                    <div className="action-list">
                      {peakNowWines.length ? peakNowWines.map((wine) => (
                        <button type="button" className="action-row" key={wine.id} onClick={() => openWineFromDashboard(wine)}>
                          <span><i className={`wine-dot tone-${wineTone(wine.type)}`} />{wine.name}</span>
                          <strong>{wine.drink_peak_from}-{wine.drink_peak_to}</strong>
                        </button>
                      )) : <p className="empty-state">{t("noActionItems")}</p>}
                    </div>
                  </article>
                  <article className="dashboard-card">
                    <div className="card-heading">
                      <div>
                        <span>{t("drinkIn2Years")}</span>
                        <h2>{t("drinkingWindow")}</h2>
                      </div>
                      <strong>{cellarStats.drinkSoon}</strong>
                    </div>
                    <div className="action-list">
                      {drinkSoonWines.length ? drinkSoonWines.map((wine) => (
                        <button type="button" className="action-row" key={wine.id} onClick={() => openWineFromDashboard(wine)}>
                          <span><i className={`wine-dot tone-${wineTone(wine.type)}`} />{wine.name}</span>
                          <strong>{wine.drink_from}</strong>
                        </button>
                      )) : <p className="empty-state">{t("noActionItems")}</p>}
                    </div>
                  </article>
                  <article className="dashboard-card">
                    <div className="card-heading">
                      <div>
                        <span>{t("atRiskWines")}</span>
                        <h2>{t("pastWindow")}</h2>
                      </div>
                      <strong>{cellarStats.pastWindow}</strong>
                    </div>
                    <div className="action-list">
                      {atRiskWines.length ? atRiskWines.map((wine) => (
                        <button type="button" className="action-row" key={wine.id} onClick={() => openWineFromDashboard(wine)}>
                          <span><i className={`wine-dot tone-${wineTone(wine.type)}`} />{wine.name}</span>
                          <strong>{wine.drink_to}</strong>
                        </button>
                      )) : <p className="empty-state">{t("noActionItems")}</p>}
                    </div>
                  </article>
                  <article className="dashboard-card wide-card">
                    <div className="card-heading">
                      <div>
                        <span>{t("maturityMap")}</span>
                        <h2>{t("drinkingWindow")}</h2>
                      </div>
                    </div>
                    <div className="maturity-grid">
                      {maturity.map((bucket) => (
                        <div className="maturity-item" key={bucket.key}>
                          <div>
                            <span>{bucket.label}</span>
                            <strong>{bucket.value}</strong>
                          </div>
                          <div className="maturity-track"><span style={{ width: `${bucket.pct}%` }} /></div>
                        </div>
                      ))}
                    </div>
                  </article>
                </DashboardCarousel>
              ) : null}

              {dashboardFocus === "timeline" ? (
                <DashboardCarousel label={t("deliveryTimeline")}>
                  <article className="dashboard-card priority-card">
                    <div className="card-heading">
                      <div>
                        <span>{t("upcomingDeliveries")}</span>
                        <h2>{t("deliveryTimeline")}</h2>
                      </div>
                      <strong>{cellarStats.futureDeliveries}</strong>
                    </div>
                    <div className="timeline-kpis">
                      <div><span>{t("next30Days")}</span><strong>{deliveryHorizonStats.next30}</strong></div>
                      <div><span>{t("next90Days")}</span><strong>{deliveryHorizonStats.next90}</strong></div>
                      <div><span>{t("next12Months")}</span><strong>{deliveryHorizonStats.next365}</strong></div>
                      <div><span>{t("beyond12Months")}</span><strong>{deliveryHorizonStats.beyond365}</strong></div>
                      <div><span>{t("totalValue")}</span><strong>{deliveryHorizonStats.total}</strong></div>
                    </div>
                  </article>

                  <article className="dashboard-card wide-card timeline-card">
                    <div className="card-heading">
                      <div>
                        <span>{t("futureDeliveries")}</span>
                        <h2>{t("timeline")}</h2>
                      </div>
                      {firstDeliveryTimelineItem && lastDeliveryTimelineItem ? (
                        <strong>{formatDisplayDate(firstDeliveryTimelineItem.wine.expected_delivery)} - {formatDisplayDate(lastDeliveryTimelineItem.wine.expected_delivery)}</strong>
                      ) : null}
                    </div>
                    {firstDeliveryTimelineItem && lastDeliveryTimelineItem ? (
                      <div className="delivery-timeline">
                        <div className="delivery-axis">
                          <span>{formatDisplayDate(firstDeliveryTimelineItem.wine.expected_delivery)}</span>
                          <span>{formatDisplayDate(lastDeliveryTimelineItem.wine.expected_delivery)}</span>
                        </div>
                        <div className="delivery-track" aria-hidden="true">
                          {deliveryTimelineItems.map(({ wine, dateMs }) => (
                            <span
                              className={`delivery-marker tone-${wineTone(wine.type)}`}
                              key={wine.id}
                              style={{ left: `${Math.min(Math.max(((dateMs - deliveryTimelineStart) / deliveryTimelineRange) * 100, 0), 100)}%` }}
                            />
                          ))}
                        </div>
                        <div className="delivery-events">
                          {deliveryTimelineItems.map(({ wine, days, dateMs }) => (
                            <button type="button" className="delivery-event" key={wine.id} onClick={() => openWineFromDashboard(wine)}>
                              <span className="delivery-date">{formatDisplayDate(wine.expected_delivery)}</span>
                              <span className="delivery-name"><i className={`wine-dot tone-${wineTone(wine.type)}`} />{wine.name}</span>
                              <span>{wine.producer || t("noProducer")}</span>
                              <strong>{days}d</strong>
                              <span className="delivery-event-position" style={{ left: `${Math.min(Math.max(((dateMs - deliveryTimelineStart) / deliveryTimelineRange) * 100, 0), 100)}%` }} />
                            </button>
                          ))}
                        </div>
                      </div>
                    ) : (
                      <p className="empty-state">{t("noActionItems")}</p>
                    )}
                  </article>
                </DashboardCarousel>
              ) : null}

              {dashboardFocus === "data" ? (
                <DashboardCarousel label={t("dataFocus")}>
                  <article className="dashboard-card priority-card">
                    <div className="card-heading">
                      <div>
                        <span>{t("incompleteData")}</span>
                        <h2>{t("dataQuality")}</h2>
                      </div>
                      <strong>{allValueRefreshWines.length + cellarStats.missingDrinkWindow + cellarStats.missingScores}</strong>
                    </div>
                    <p>{t("aiReadinessHelp")}</p>
                  </article>
                  <article className="dashboard-card">
                    <div className="card-heading">
                      <div>
                        <span>{t("valueToRefresh")}</span>
                        <h2>{t("value")}</h2>
                      </div>
                      <strong>{allValueRefreshWines.length}</strong>
                    </div>
                    <label className="compact-field">
                      <span>{t("valueOlderThanDays")}</span>
                      <input type="number" min="0" value={valueRefreshDays} onChange={(event) => setValueRefreshDays(event.target.value)} />
                    </label>
                    <button type="button" className="secondary compact" disabled={!canGenerateAi || Boolean(generatingAi) || allValueRefreshWines.length === 0} onClick={() => generateMissingWineAi("value", allValueRefreshWines)}>
                      {generatingAi === "batch-value" ? t("generating") : t("generateAll")}
                    </button>
                    <div className="action-list">
                      {valueRefreshWines.length ? valueRefreshWines.map((wine) => (
                        <div className="action-row data-quality-row" key={wine.id}>
                          <button type="button" className="row-open-action" onClick={() => openWineFromDashboard(wine)}>
                            <i className={`wine-dot tone-${wineTone(wine.type)}`} />{wine.name}
                          </button>
                          <button type="button" className="secondary compact" disabled={!canGenerateAi || Boolean(generatingAi)} onClick={() => generateWineAi(wine, "value")}>
                            {generatingAi === "value" && selectedWineId === wine.id ? t("generating") : t("value")}
                          </button>
                        </div>
                      )) : <p className="empty-state">{t("noActionItems")}</p>}
                    </div>
                  </article>
                  <article className="dashboard-card">
                    <div className="card-heading">
                      <div>
                        <span>{t("missingDrinkWindow")}</span>
                        <h2>{t("drinkWindow")}</h2>
                      </div>
                      <strong>{cellarStats.missingDrinkWindow}</strong>
                    </div>
                    <button type="button" className="secondary compact" disabled={!canGenerateAi || Boolean(generatingAi) || allMissingDrinkWindowWines.length === 0} onClick={() => generateMissingWineAi("drink-window", allMissingDrinkWindowWines)}>
                      {generatingAi === "batch-drink-window" ? t("generating") : t("generateAll")}
                    </button>
                    <div className="action-list">
                      {missingDrinkWindowWines.length ? missingDrinkWindowWines.map((wine) => (
                        <div className="action-row data-quality-row" key={wine.id}>
                          <button type="button" className="row-open-action" onClick={() => openWineFromDashboard(wine)}>
                            <i className={`wine-dot tone-${wineTone(wine.type)}`} />{wine.name}
                          </button>
                          <button type="button" className="secondary compact" disabled={!canGenerateAi || Boolean(generatingAi)} onClick={() => generateWineAi(wine, "drink-window")}>
                            {generatingAi === "drink-window" && selectedWineId === wine.id ? t("generating") : t("drinkWindow")}
                          </button>
                        </div>
                      )) : <p className="empty-state">{t("noActionItems")}</p>}
                    </div>
                  </article>
                  <article className="dashboard-card">
                    <div className="card-heading">
                      <div>
                        <span>{t("missingScores")}</span>
                        <h2>{t("scores")}</h2>
                      </div>
                      <strong>{cellarStats.missingScores}</strong>
                    </div>
                    <button type="button" className="secondary compact" disabled={!canGenerateAi || Boolean(generatingAi) || allMissingScoresWines.length === 0} onClick={() => generateMissingWineAi("scores", allMissingScoresWines)}>
                      {generatingAi === "batch-scores" ? t("generating") : t("generateAll")}
                    </button>
                    <div className="action-list">
                      {missingScoresWines.length ? missingScoresWines.map((wine) => (
                        <div className="action-row data-quality-row" key={wine.id}>
                          <button type="button" className="row-open-action" onClick={() => openWineFromDashboard(wine)}>
                            <i className={`wine-dot tone-${wineTone(wine.type)}`} />{wine.name}
                          </button>
                          <button type="button" className="secondary compact" disabled={!canGenerateAi || Boolean(generatingAi)} onClick={() => generateWineAi(wine, "scores")}>
                            {generatingAi === "scores" && selectedWineId === wine.id ? t("generating") : t("scores")}
                          </button>
                        </div>
                      )) : <p className="empty-state">{t("noActionItems")}</p>}
                    </div>
                  </article>
                </DashboardCarousel>
              ) : null}
            </section>
          ) : null}

          {activeView === "pairing" ? (
            <section className="pairing-view">
              {renderPairingSection()}
            </section>
          ) : null}

          {activeView === "help" ? (
            <section className="help-center">
              <div className="help-hero">
                <p className="eyebrow">{helpGuide.eyebrow}</p>
                <h2>{helpGuide.title}</h2>
                <p>{helpGuide.intro}</p>
              </div>
              <div className="help-grid">
                {helpGuide.sections.map((section) => (
                  <article className="help-card" key={section.title}>
                    <h3>{section.title}</h3>
                    <p>{section.body}</p>
                    <ul>
                      {section.bullets.map((bullet) => (
                        <li key={bullet}>{bullet}</li>
                      ))}
                    </ul>
                  </article>
                ))}
              </div>
            </section>
          ) : null}

          {isCollectionView ? (
          <aside className="wine-side-panel">
            {isWineCollectionView ? (
              <div className="side-panel-actions">
                {activeView === "cellar" ? (
                  <button type="button" onClick={startAddWine} disabled={!canWriteWine}>
                    {t("addWine")}
                  </button>
                ) : null}
                {selectedVisibleWine && !wineFormOpen ? (
                  <button type="button" className="secondary" onClick={() => startEditWine(selectedVisibleWine)} disabled={!canWriteWine}>
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
            {isWineCollectionView && wineFormOpen ? (
              <form className="wine-form" onSubmit={submitWine}>
                <h2>{editingId ? t("editWine") : t("addWine")}</h2>
                {!canWriteWine ? <p className="empty-state">{t("viewerReadOnly")}</p> : null}
                <label>
                  <span>{t("name")}</span>
                  <input list="wine-catalog-suggestions" value={draft.name} onChange={(event) => updateWineDraftName(event.target.value)} required disabled={!canWriteWine} />
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
                <label>
                  <span>{t("rating")}</span>
                  <RatingInput value={draft.rating} disabled={!canWriteWine} label={t("rating")} onChange={(value) => setDraft({ ...draft, rating: value })} />
                </label>
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
                      <option value="Ordered">{displayValue("Ordered", locale, "status")}</option>
                      <option value="Shipped">{displayValue("Shipped", locale, "status")}</option>
                      <option value="Delivered">{displayValue("Delivered", locale, "status")}</option>
                      <option value="Consumed">{displayValue("Consumed", locale, "status")}</option>
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
                <div className="ownership-editor">
                  <div className="section-heading">
                    <h3>{t("scores")}</h3>
                    <button
                      type="button"
                      className="secondary compact"
                      disabled={!canWriteWine}
                      onClick={() => setDraft({ ...draft, scores: [...draft.scores, { critic: "", score: "", note: "" }] })}
                    >
                      +
                    </button>
                  </div>
                  {draft.scores.length ? draft.scores.map((score, index) => (
                    <div className="score-edit-row" key={index}>
                      <input value={score.critic} onChange={(event) => setDraft({ ...draft, scores: draft.scores.map((item, itemIndex) => itemIndex === index ? { ...item, critic: event.target.value } : item) })} placeholder={t("critic")} disabled={!canWriteWine} />
                      <input value={score.score} onChange={(event) => setDraft({ ...draft, scores: draft.scores.map((item, itemIndex) => itemIndex === index ? { ...item, score: event.target.value } : item) })} placeholder={t("scoreValue")} disabled={!canWriteWine} />
                      <textarea value={score.note} onChange={(event) => setDraft({ ...draft, scores: draft.scores.map((item, itemIndex) => itemIndex === index ? { ...item, note: event.target.value } : item) })} placeholder={t("notes")} rows={2} disabled={!canWriteWine} />
                      <button type="button" className="danger compact" disabled={!canWriteWine} onClick={() => setDraft({ ...draft, scores: draft.scores.filter((_, itemIndex) => itemIndex !== index) })}>
                        {t("delete")}
                      </button>
                    </div>
                  )) : (
                    <p className="empty-state">{t("missingScores")}</p>
                  )}
                </div>
                <div className="ownership-editor">
                  <div className="section-heading">
                    <h3>{t("multiOwnership")}</h3>
                    <button
                      type="button"
                      className="secondary compact"
                      disabled={!canWriteWine}
                      onClick={() => setDraft({ ...draft, owners: [...draft.owners, { name: "", email: "", share_pct: "" }] })}
                    >
                      +
                    </button>
                  </div>
                  <label>
                    <span>{t("ownerShare")}</span>
                    <input type="number" min="0" max="100" step="0.01" value={draft.owner_share_pct} onChange={(event) => setDraft({ ...draft, owner_share_pct: event.target.value })} disabled={!canWriteWine} />
                  </label>
                  {draft.owners.map((owner, index) => (
                    <div className="ownership-edit-row" key={index}>
                      <input value={owner.name} onChange={(event) => setDraft({ ...draft, owners: draft.owners.map((item, itemIndex) => itemIndex === index ? { ...item, name: event.target.value } : item) })} placeholder={t("name")} disabled={!canWriteWine} />
                      <input type="email" value={owner.email} onChange={(event) => setDraft({ ...draft, owners: draft.owners.map((item, itemIndex) => itemIndex === index ? { ...item, email: event.target.value } : item) })} placeholder={t("ownerEmail")} disabled={!canWriteWine} />
                      <input type="number" min="0" max="100" step="0.01" value={owner.share_pct} onChange={(event) => setDraft({ ...draft, owners: draft.owners.map((item, itemIndex) => itemIndex === index ? { ...item, share_pct: event.target.value } : item) })} placeholder="%" disabled={!canWriteWine} />
                      <button type="button" className="danger compact" disabled={!canWriteWine} onClick={() => setDraft({ ...draft, owners: draft.owners.filter((_, itemIndex) => itemIndex !== index) })}>
                        {t("delete")}
                      </button>
                    </div>
                  ))}
                </div>
                <div className="tag-picker">
                  <span>{t("tags")}</span>
                  {wineFormTagOptions.length ? (
                    <div className="tag-choice-list">
                      {wineFormTagOptions.map((tag) => (
                        <label key={tag} style={draft.tags.includes(tag) ? tagColorStyle(tag, userTags) : undefined}>
                          <input
                            type="checkbox"
                            checked={draft.tags.includes(tag)}
                            onChange={() => setDraft({ ...draft, tags: toggleListValue(draft.tags, tag) })}
                            disabled={!canWriteWine}
                          />
                          <span>{tag}</span>
                        </label>
                      ))}
                    </div>
                  ) : (
                    <p className="empty-state">{t("noTags")}</p>
                  )}
                  <div className="inline-row-form">
                    <input value={quickTagDraft} onChange={(event) => setQuickTagDraft(event.target.value)} placeholder={t("tagName")} disabled={!canWriteWine} />
                    <input type="color" value={quickTagColor} onChange={(event) => setQuickTagColor(event.target.value)} disabled={!canWriteWine} />
                    <button type="button" className="secondary" onClick={createQuickTag} disabled={!canWriteWine || saving || !quickTagDraft.trim()}>
                      {t("addTagHere")}
                    </button>
                  </div>
                </div>
                <div className="form-actions">
                  <button type="submit" disabled={saving || !canWriteWine}>{saving ? t("saving") : editingId ? t("saveChanges") : t("createWine")}</button>
                  {editingId && selectedWine ? (
                    <button
                      type="button"
                      className="danger"
                      disabled={saving || !canAdmin}
                      onClick={() => deleteWine(selectedWine).catch((nextError) => setError(nextError instanceof Error ? nextError.message : "Unable to delete wine"))}
                    >
                      {t("delete")}
                    </button>
                  ) : null}
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
                  <input list="wine-catalog-suggestions" value={wishlistDraft.name} onChange={(event) => updateWishlistDraftName(event.target.value)} required disabled={!canWriteWine} />
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
            ) : isWineCollectionView && selectedVisibleWine ? (
              <>
                <WineDetail
                  wine={selectedVisibleWine}
                  session={session}
                  auditEntries={aiAudit.filter((entry) => entry.entity_type === "wine" && entry.entity_id === selectedVisibleWine.id)}
                  canGenerate={canGenerateAi}
                  generating={generatingAi}
                  onGenerate={(feature) => generateWineAi(selectedVisibleWine, feature)}
                  t={t}
                  locale={locale}
                />
                {renderSharePanel(selectedVisibleWine)}
              </>
            ) : activeView === "wishlist" && selectedWishlistItem ? (
                <WishlistDetail
                  item={selectedWishlistItem}
                  auditEntries={aiAudit.filter((entry) => entry.entity_type === "wishlist" && entry.entity_id === selectedWishlistItem.id)}
                  canGenerate={canGenerateAi}
                  generating={generatingAi.startsWith("wishlist-") ? generatingAi.replace("wishlist-", "") : ""}
                  onGenerate={(feature) => generateWishlistAi(selectedWishlistItem, feature)}
                  t={t}
                  locale={locale}
                />
            ) : (
              <div className="wine-detail empty-detail">
                <h2>{t("noItemSelected")}</h2>
                <p>{t("selectItemHelp")}</p>
              </div>
            )}
          </aside>
          ) : null}

          {isCollectionView ? (
          <section className="wine-list" aria-busy={loading}>
            {activeView === "cellar" ? (
            <details className="stats-panel-wrapper" open>
              <summary>
                {t("cellarStats")}
                {quickWineFilter ? <span>{quickWineFilterLabels[quickWineFilter]}</span> : null}
              </summary>
              <section className="stats-panel">
                <button type="button" className={`stat-card ownership-stat ${quickWineFilter === "mine" ? "active" : ""}`} onClick={() => applyQuickWineFilter("mine")}>
                  <span>{t("myBottles")}</span>
                  <strong>{formatBottleCount(cellarStats.myBottles)}</strong>
                  <p>CHF {cellarStats.myValue.toFixed(0)}</p>
                </button>
                <button type="button" className={`stat-card ownership-stat ${quickWineFilter === "shared" ? "active" : ""}`} onClick={() => applyQuickWineFilter("shared")}>
                  <span>{t("sharedBottles")}</span>
                  <strong>{formatBottleCount(cellarStats.sharedBottles)}</strong>
                  <p>CHF {cellarStats.sharedValue.toFixed(0)}</p>
                </button>
                <button type="button" className={`stat-card ownership-stat ${quickWineFilter === "" ? "active" : ""}`} onClick={() => applyQuickWineFilter("")}>
                  <span>{t("totalValue")}</span>
                  <strong>{formatBottleCount(cellarStats.bottles)}</strong>
                  <p>CHF {cellarStats.totalValue.toFixed(0)}</p>
                </button>
                <button type="button" className={`stat-card ${quickWineFilter === "drink_now" ? "active" : ""}`} onClick={() => applyQuickWineFilter("drink_now")}>
                  <span>{t("drinkNow")}</span>
                  <strong>{cellarStats.drinkNow}</strong>
                </button>
                <button type="button" className={`stat-card ${quickWineFilter === "drink_soon" ? "active" : ""}`} onClick={() => applyQuickWineFilter("drink_soon")}>
                  <span>{t("drinkIn2Years")}</span>
                  <strong>{cellarStats.drinkSoon}</strong>
                </button>
                <button type="button" className={`stat-card ${quickWineFilter === "past_window" ? "active" : ""}`} onClick={() => applyQuickWineFilter("past_window")}>
                  <span>{t("pastWindow")}</span>
                  <strong>{cellarStats.pastWindow}</strong>
                </button>
                <button type="button" className={`stat-card ${quickWineFilter === "future_deliveries" ? "active" : ""}`} onClick={() => applyQuickWineFilter("future_deliveries")}>
                  <span>{t("futureDeliveries")}</span>
                  <strong>{cellarStats.futureDeliveries}</strong>
                  {cellarStats.nextDelivery ? <p>{cellarStats.nextDelivery.wine.name}: {cellarStats.nextDelivery.days} days</p> : null}
                </button>
                <button type="button" className={`stat-card compact-list ${quickWineFilter === "missing_data" ? "active" : ""}`} onClick={() => applyQuickWineFilter("missing_data")}>
                  <span>{t("dataQuality")}</span>
                  <p>{t("missingValue")}: <strong>{cellarStats.missingValue}</strong></p>
                  <p>{t("missingDrinkWindow")}: <strong>{cellarStats.missingDrinkWindow}</strong></p>
                  <p>{t("missingScores")}: <strong>{cellarStats.missingScores}</strong></p>
                </button>
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
                  <strong>{cellarStats.aiNotes} / {cellarWines.length}</strong>
                  <p>{t("aiReadinessHelp")}</p>
                </div>
              </section>
            </details>
            ) : (
            <details className="stats-panel-wrapper" open>
              <summary>{t("wishlistItems")}</summary>
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
            </details>
            )}
            <details className="filter-panel">
              <summary>{t("search")} / {t("sort")}</summary>
              <label>
                <span>{t("search")}</span>
                <input value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} placeholder={t("searchPlaceholder")} />
              </label>
              <div className="filter-row">
                <label>
                  <span>{t("type")}</span>
                  <select value={typeFilter} onChange={(event) => setTypeFilter(event.target.value)}>
                    <option value="">{t("allTypes")}</option>
                    {activeTypeOptions.map((type) => <option key={type} value={type}>{displayValue(type, locale, "type")}</option>)}
                  </select>
                </label>
                <label>
                  <span>{t("status")}</span>
                  <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
                    <option value="">{t("allStatuses")}</option>
                    {activeStatusOptions.map((status) => <option key={status} value={status}>{displayValue(status, locale, "status")}</option>)}
                  </select>
                </label>
              </div>
              <div className="filter-row">
                {isWineCollectionView ? (
                  <div className="filter-choice-group">
                    <span>{t("tag")}</span>
                    <div className="tag-choice-list compact">
                      {tagOptions.length ? tagOptions.map((tag) => (
                        <label key={tag} style={tagFilter.includes(tag) ? tagColorStyle(tag, userTags) : undefined}>
                          <input type="checkbox" checked={tagFilter.includes(tag)} onChange={() => setTagFilter((current) => toggleListValue(current, tag))} />
                          <span>{tag}</span>
                        </label>
                      )) : <span className="empty-state">{t("allTags")}</span>}
                    </div>
                  </div>
                ) : null}
                {isWineCollectionView ? (
                  <label>
                    <span>{t("ownership")}</span>
                    <select value={ownershipFilter} onChange={(event) => setOwnershipFilter(event.target.value)}>
                      <option value="">{t("allBottles")}</option>
                      <option value="mine">{t("myBottles")}</option>
                      <option value="shared">{t("sharedBottles")}</option>
                    </select>
                  </label>
                ) : null}
                <label>
                  <span>{t("sort")}</span>
                  <select value={sortMode} onChange={(event) => setSortMode(event.target.value as SortMode)}>
                    <option value="name">{t("name")}</option>
                    <option value="vintage">{t("vintage")}</option>
                    <option value="value">{t("value")}</option>
                    {activeView === "wishlist" ? <option value="priority">{t("priority")}</option> : null}
                    {isWineCollectionView ? <option value="drink_window">{t("drinkWindow")}</option> : null}
                  </select>
                </label>
              </div>
              <button type="button" className="secondary compact" onClick={() => clearFilters(activeView)}>
                {t("clearFilters")}
              </button>
            </details>
            <div className="list-header">
              <h2>{activeView === "wishlist" ? t("wishlist") : activeView === "history" ? t("consumedWines") : t("wines")}</h2>
              <span>{visibleCount} / {isWineCollectionView ? activeWineCollection.length : wishlist.length} {t("records")}</span>
            </div>
            {loading ? <p className="empty-state">{t("loadingData")}</p> : null}
            {!loading && activeView === "cellar" && filteredWines.length === 0 ? <p className="empty-state">{t("noWineMatch")}</p> : null}
            {!loading && activeView === "history" && filteredWines.length === 0 ? <p className="empty-state">{t("noHistoryMatch")}</p> : null}
            {!loading && activeView === "wishlist" && filteredWishlist.length === 0 ? <p className="empty-state">{t("noWishlistMatch")}</p> : null}
            {isWineCollectionView ? filteredWines.map((wine) => (
              <div className="list-item-block" key={wine.id} data-wine-row-id={wine.id}>
                <article className={`${selectedWineId === wine.id ? "wine-row selected" : "wine-row"} tone-${wineTone(wine.type)}`} onClick={(event) => { if (!isInteractiveRowClick(event)) toggleSelectedWine(wine); }}>
                  <div className="wine-row-main">
                    <h3>
                      <i className={`wine-dot tone-${wineTone(wine.type)}`} />
                      {wine.name}
                      {wine.notes ? <span className="note-indicator" title={t("notes")} aria-label={t("notes")}>✎</span> : null}
                      <small>{wine.vintage}</small>
                    </h3>
                    <p className="row-primary">
                      <span>{wine.producer || t("noProducer")} - {wineQuantityLabel(wine, session, t("bottles").toLowerCase())}</span>
                      <WineStatusBadge status={wine.status} locale={locale} compact />
                    </p>
                    <p className="row-secondary">{[displayValue(wine.format, locale, "format"), displayValue(wine.type, locale, "type"), wine.region, wine.appellation].filter(Boolean).join(" - ")}</p>
                    {wine.rating || wine.tags.length || wine.scores.length ? (
                      <div className="row-meta-stack">
                        {wine.rating || wine.tags.length ? (
                          <div className="row-meta-group row-meta-group-primary">
                            {wine.rating ? <span className="row-chip row-rating-chip"><StarRating value={wine.rating} label={t("rating")} /></span> : null}
                            {wine.tags.slice(0, 3).map((tag) => <span className="row-chip row-tag-chip" key={tag} style={tagColorStyle(tag, userTags)}>{tag}</span>)}
                          </div>
                        ) : null}
                        {wine.scores.length ? (
                          <div className="row-meta-group row-meta-group-secondary">
                            {wine.scores.slice(0, 3).map((score) => <span className="row-chip row-score-chip" key={`${score.critic}-${score.score}`}>{score.critic} {score.score}</span>)}
                          </div>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                  <DrinkWindowMini wine={wine} />
                  <strong>{wine.currency} {Number(wine.current_value || wine.price).toFixed(0)}</strong>
                  <div className="row-actions">
                    <button type="button" className="secondary" disabled={!canWriteWine} onClick={(event) => { event.stopPropagation(); startEditWine(wine); }}>
                      {t("edit")}
                    </button>
                  </div>
                </article>
                {selectedWineId === wine.id && !wineFormOpen ? (
                  <div className="mobile-inline-detail">
                    <WineDetail
                      wine={wine}
                      session={session}
                      auditEntries={aiAudit.filter((entry) => entry.entity_type === "wine" && entry.entity_id === wine.id)}
                      canGenerate={canGenerateAi}
                      generating={generatingAi}
                      onGenerate={(feature) => generateWineAi(wine, feature)}
                      t={t}
                      locale={locale}
                    />
                    {renderSharePanel(wine)}
                  </div>
                ) : null}
              </div>
            )) : filteredWishlist.map((item) => {
              const targetPriceValue = `${item.currency} ${Number(item.target_price).toFixed(0)}`;
              const aiMarketPriceValue = item.ai_market_price ? `${item.ai_market_price_currency || item.currency} ${Number(item.ai_market_price).toFixed(0)}` : "";
              const readyToBuy = isWishlistReadyToBuy(item.status);
              return (
              <div className="list-item-block" key={item.id}>
                <article className={`${selectedWishlistId === item.id ? "wine-row selected" : "wine-row"}${readyToBuy ? " wishlist-buy-row" : ""} tone-${wineTone(item.type)}`} onClick={(event) => { if (!isInteractiveRowClick(event)) toggleSelectedWishlistItem(item); }}>
                  <div className="wine-row-main">
                    <h3><i className={`wine-dot tone-${wineTone(item.type)}`} />{item.name} <small>{item.vintage}</small></h3>
                    <p className="row-primary">{item.producer || t("noProducer")} - {displayValue(item.purpose, locale, "purpose")}</p>
                    <p className="row-secondary">{[displayValue(item.format, locale, "format"), displayValue(item.type, locale, "type"), item.region, item.appellation].filter(Boolean).join(" - ")}</p>
                    <div className="wishlist-signal-strip">
                      <span className={`priority-chip priority-${priorityTone(item.priority)}`}>
                        <small>{t("priority")}</small>
                        {displayValue(item.priority, locale, "priority")}
                      </span>
                      <span className={`status-chip${readyToBuy ? " status-chip-buy" : ""}`}>
                        <small>{t("status")}</small>
                        {displayValue(item.status, locale, "status")}
                      </span>
                      {aiMarketPriceValue ? (
                        <span className="target-chip ai-market-chip">
                          <small>{t("marketEstimate")}</small>
                          {aiMarketPriceValue}
                        </span>
                      ) : null}
                    </div>
                    <div className="row-meta">
                      {item.merchant ? <span>{item.merchant}</span> : null}
                      {item.notes ? <span>{item.notes}</span> : null}
                    </div>
                  </div>
                  <div className="wishlist-price-block">
                    <span>{t("targetPrice")}</span>
                    <strong className="wishlist-price">{targetPriceValue}</strong>
                  </div>
                  <div className="row-actions">
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
                {selectedWishlistId === item.id && !wishlistFormOpen ? (
                  <div className="mobile-inline-detail">
                    <WishlistDetail
                      item={item}
                      auditEntries={aiAudit.filter((entry) => entry.entity_type === "wishlist" && entry.entity_id === item.id)}
                      canGenerate={canGenerateAi}
                      generating={generatingAi.startsWith("wishlist-") ? generatingAi.replace("wishlist-", "") : ""}
                      onGenerate={(feature) => generateWishlistAi(item, feature)}
                      t={t}
                      locale={locale}
                    />
                  </div>
                ) : null}
              </div>
            )})}
          </section>
          ) : null}

          {activeView === "settings" ? (
          <section className="settings-page">
            <div className="settings-heading">
              <p className="eyebrow">{t("settings")}</p>
              <h2>{t("personalSettings")}</h2>
            </div>

            <div className="settings-tabs" role="tablist" aria-label={t("settings")}>
              {settingsTabs.map((tab) => (
                <button
                  key={tab}
                  type="button"
                  role="tab"
                  aria-selected={settingsTab === tab}
                  className={settingsTab === tab ? "" : "secondary"}
                  onClick={() => {
                    setSettingsTab(tab);
                    if (tab === "users") {
                      loadAppUsers(true).catch((nextError) => setError(nextError instanceof Error ? nextError.message : "Unable to load users"));
                      loadBilling(true, true).catch((nextError) => setError(nextError instanceof Error ? nextError.message : "Unable to load billing"));
                    }
                  }}
                >
                  {settingsTabLabels[tab]}
                </button>
              ))}
            </div>

            <div className="settings-grid">
              {settingsTab === "profile" ? (
              <section className="settings-card settings-card-compact">
                <div className="settings-card-heading">
                  <div>
                    <span>{t("profileSection")}</span>
                    <h3>{t("personalSettings")}</h3>
                  </div>
                </div>
                <div className="inline-form">
                  <label>
                    <span>{t("language")}</span>
                    <select value={locale} onChange={(event) => void changeLocale(event.target.value as Locale)}>
                      <option value="en">EN</option>
                      <option value="it">IT</option>
                    </select>
                  </label>
                  <label>
                    <span>{t("theme")}</span>
                    <select value={themePreference} onChange={(event) => void changeTheme(event.target.value as ThemePreference)}>
                      {themeOptions.map((option) => (
                        <option key={option.value} value={option.value}>{t(option.label)}</option>
                      ))}
                    </select>
                  </label>
                </div>
              </section>
              ) : null}

              {settingsTab === "profile" ? (
              <section className="settings-card settings-card-compact">
                <div className="settings-card-heading">
                  <div>
                    <span>{t("passkeys")}</span>
                    <h3>{t("passkey")}</h3>
                  </div>
                </div>
                <div className="inline-form">
                  <label>
                    <span>{t("passkeyName")}</span>
                    <input value={passkeyName} onChange={(event) => setPasskeyName(event.target.value)} />
                  </label>
                  <button type="button" disabled={saving} onClick={() => registerPasskey()}>
                    {t("create")}
                  </button>
                </div>
                {passkeys.length ? (
                  <div className="passkey-list">
                    {passkeys.map((passkey) => (
                      <div className="passkey-row" key={passkey.id}>
                        <div>
                          <strong>{passkey.name}</strong>
                          <span>{formatDisplayDate(passkey.created_at)}</span>
                        </div>
                        <button type="button" className="danger compact" disabled={saving} onClick={() => deletePasskey(passkey)}>
                          {t("delete")}
                        </button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="empty-state">{t("noPasskeys")}</p>
                )}
              </section>
              ) : null}

              {settingsTab === "profile" ? (
              <section className="settings-card settings-card-compact">
                <div className="settings-card-heading">
                  <div>
                    <span>{t("billing")}</span>
                    <h3>{t("redeemCode")}</h3>
                  </div>
                  {billingStatus?.valid_until ? <strong>{formatDisplayDate(billingStatus.valid_until)}</strong> : null}
                </div>
                <form className="inline-form" onSubmit={redeemCode}>
                  <label>
                    <span>{t("redeemCode")}</span>
                    <input value={redeemInput} onChange={(event) => setRedeemInput(event.target.value)} placeholder="WCM-XXXX-XXXX-XXXX-XXXX" />
                  </label>
                  <button type="submit" disabled={saving || !redeemInput.trim()}>
                    {t("redeem")}
                  </button>
                  <button type="button" className="secondary" onClick={() => startCheckout("monthly")} disabled={saving}>
                    {t("buyMonthly")}
                  </button>
                  <button type="button" className="secondary" onClick={() => startCheckout("annual")} disabled={saving}>
                    {t("buyAnnual")}
                  </button>
                  <button type="button" className="secondary" onClick={() => startBillingPortal()} disabled={saving}>
                    {t("manageSubscription")}
                  </button>
                </form>
                {billingStatus?.available_redeem_codes.length ? (
                  <div className="member-list">
                    {billingStatus.available_redeem_codes.map((code) => (
                      <div className="member-row" key={code.id}>
                        <div>
                          <strong>{t("paidRedeemCode")}</strong>
                          <span>{code.code || code.code_prefix} - {code.duration_days}d</span>
                        </div>
                        {code.code ? (
                          <button type="button" className="secondary compact" onClick={() => navigator.clipboard?.writeText(code.code || "")}>
                            Copy
                          </button>
                        ) : null}
                        <button type="button" className="compact" disabled={saving || !code.code} onClick={() => code.code && redeemCodeValue(code.code)}>
                          {t("redeem")}
                        </button>
                      </div>
                    ))}
                  </div>
                ) : null}
                {billingStatus?.has_active_entitlement ? (
                  <p className="empty-state">{t("billing")}: {billingStatus.active_source} - {formatDisplayDate(billingStatus.valid_until)}</p>
                ) : (
                  <p className="empty-state">{t("notSpecified")}</p>
                )}
              </section>
              ) : null}

              {settingsTab === "ai" && canWriteWine ? (
                <form className="settings-card settings-card-wide" onSubmit={submitAiSettings}>
                  <div className="settings-card-heading">
                    <div>
                      <span>{t("aiSettings")}</span>
                      <h3>OpenAI</h3>
                    </div>
                    <strong className={aiSettings?.has_openai_api_key ? "status-pill configured" : "status-pill"}>
                      {aiSettings?.has_openai_api_key ? t("configured") : t("noApiKey")}
                    </strong>
                  </div>
                  <label>
                    <span>OpenAI API key</span>
                    <input
                      type="password"
                      value={aiSettingsDraft.openai_api_key}
                      onChange={(event) => setAiSettingsDraft({ ...aiSettingsDraft, openai_api_key: event.target.value })}
                      placeholder={aiSettings?.has_openai_api_key ? t("configured") : "sk-..."}
                    />
                  </label>
                  <div className="settings-model-grid">
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
                    <label>
                      <span>{t("wishlist")}</span>
                      <select value={aiSettingsDraft.wishlist_model} onChange={(event) => setAiSettingsDraft({ ...aiSettingsDraft, wishlist_model: event.target.value })}>
                        {(aiSettings?.model_options || []).map((model) => <option key={model} value={model}>{model}</option>)}
                      </select>
                    </label>
                    <label>
                      <span>{t("pairing")}</span>
                      <select value={aiSettingsDraft.pairing_model} onChange={(event) => setAiSettingsDraft({ ...aiSettingsDraft, pairing_model: event.target.value })}>
                        {(aiSettings?.model_options || []).map((model) => <option key={model} value={model}>{model}</option>)}
                      </select>
                    </label>
                  </div>
                  <button type="submit" disabled={saving}>{saving ? t("saving") : t("saveSettings")}</button>
                </form>
              ) : null}

              {settingsTab === "ai" && canWriteWine ? (
                <section className="settings-card">
                  <div className="settings-card-heading">
                    <div>
                      <span>{t("aiUsage")}</span>
                      <h3>{t("estimatedCost")}</h3>
                    </div>
                    <strong>{aiUsage ? formatUsd(aiUsage.all_time.estimated_cost_usd) : formatUsd(0)}</strong>
                  </div>
                  {aiUsage && aiUsage.all_time.requests > 0 ? (
                    <div className="usage-list">
                      <AiUsageRow label={t("today")} bucket={aiUsage.today} />
                      <AiUsageRow label={t("thisMonth")} bucket={aiUsage.current_month} />
                      <AiUsageRow label={t("allTime")} bucket={aiUsage.all_time} />
                    </div>
                  ) : (
                    <p className="empty-state">{t("noAiUsage")}</p>
                  )}
                </section>
              ) : null}

              {settingsTab === "data" && canWriteWine ? (
                <section className="settings-card settings-card-wide">
                  <details className="collapsible-panel">
                    <summary>{t("manageTags")}</summary>
                    <form className="inline-row-form" onSubmit={submitTag}>
                      <input value={tagDraft} onChange={(event) => setTagDraft(event.target.value)} placeholder={t("tagName")} />
                      <input type="color" value={tagDraftColor} onChange={(event) => setTagDraftColor(event.target.value)} title={t("color")} />
                      <button type="submit" disabled={saving || !tagDraft.trim()}>{t("createTag")}</button>
                    </form>
                    {userTags.length ? (
                      <div className="tag-admin-list">
                        {userTags.map((tag) => (
                          <div className="tag-admin-row" key={tag.id}>
                            <input value={tagEdits[tag.id]?.name || tag.name} onChange={(event) => setTagEdits({ ...tagEdits, [tag.id]: { ...(tagEdits[tag.id] || { name: tag.name, color: tag.color }), name: event.target.value } })} />
                            <input type="color" value={tagEdits[tag.id]?.color || tag.color || "#245142"} onChange={(event) => setTagEdits({ ...tagEdits, [tag.id]: { ...(tagEdits[tag.id] || { name: tag.name, color: tag.color }), color: event.target.value } })} title={t("color")} />
                            <button type="button" className="secondary compact" disabled={saving} onClick={() => updateTag(tag)}>
                              {t("saveTag")}
                            </button>
                            <button type="button" className="danger compact" disabled={saving} onClick={() => deleteTag(tag)}>
                              {t("delete")}
                            </button>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="empty-state">{t("noTags")}</p>
                    )}
                  </details>
                </section>
              ) : null}

              {settingsTab === "sharing" ? (
              <section className="settings-card settings-card-wide">
                <div className="settings-card-heading">
                  <div>
                    <span>{t("sharedCellar")}</span>
                    <h3>{t("household")}</h3>
                  </div>
                </div>
                <form className="inline-form" onSubmit={updateHouseholdName}>
                  <label>
                    <span>{t("cellarName")}</span>
                    <input
                      value={householdNameDraft}
                      disabled={!canAdmin || saving}
                      onChange={(event) => setHouseholdNameDraft(event.target.value)}
                      required
                    />
                  </label>
                  <button type="submit" disabled={!canAdmin || saving || !householdNameDraft.trim()}>
                    {saving ? t("saving") : t("renameCellar")}
                  </button>
                </form>
                {!canAdmin ? <p className="empty-state">{t("viewerReadOnly")}</p> : null}
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
                          {member.role === "admin" ? (
                            <small>{t("visibilityAll")}</small>
                          ) : (
                            <select
                              value={member.visibility_scope}
                              disabled={saving}
                              onChange={(event) => updateMemberVisibility(member, event.target.value as "all" | "shared")}
                            >
                              <option value="shared">{t("visibilityShared")}</option>
                              <option value="all">{t("visibilityAll")}</option>
                            </select>
                          )}
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
              </section>
              ) : null}

              {settingsTab === "users" && canAppAdmin ? (
                <section className="settings-card settings-card-wide">
                  <div className="settings-card-heading">
                    <div>
                      <span>{t("billing")}</span>
                      <h3>{t("redeemCodes")}</h3>
                    </div>
                    <button type="button" className="secondary compact" disabled={saving} onClick={() => loadBilling(true, true).catch((nextError) => setError(nextError instanceof Error ? nextError.message : "Unable to load billing"))}>
                      {t("loadingData")}
                    </button>
                  </div>
                  <form className="inline-form" onSubmit={createRedeemCode}>
                    <label>
                      <span>{t("message")}</span>
                      <input value={redeemCodeDraft.label} onChange={(event) => setRedeemCodeDraft({ ...redeemCodeDraft, label: event.target.value })} placeholder="Promo 30 giorni" />
                    </label>
                    <label>
                      <span>{t("durationDays")}</span>
                      <input type="number" min="1" max="3650" value={redeemCodeDraft.duration_days} onChange={(event) => setRedeemCodeDraft({ ...redeemCodeDraft, duration_days: event.target.value })} />
                    </label>
                    <label>
                      <span>{t("records")}</span>
                      <input type="number" min="1" max="10000" value={redeemCodeDraft.max_redemptions} onChange={(event) => setRedeemCodeDraft({ ...redeemCodeDraft, max_redemptions: event.target.value })} />
                    </label>
                    <label>
                      <span>{t("email")}</span>
                      <input type="email" value={redeemCodeDraft.email} onChange={(event) => setRedeemCodeDraft({ ...redeemCodeDraft, email: event.target.value })} placeholder="opzionale" />
                    </label>
                    <label>
                      <span>{t("expires")}</span>
                      <input type="datetime-local" value={redeemCodeDraft.expires_at} onChange={(event) => setRedeemCodeDraft({ ...redeemCodeDraft, expires_at: event.target.value })} />
                    </label>
                    <button type="submit" disabled={saving || !Number(redeemCodeDraft.duration_days)}>
                      {t("createRedeemCode")}
                    </button>
                  </form>
                  {generatedRedeemCode ? (
                    <div className="invite-row">
                      <div>
                        <strong>{t("generatedCode")}</strong>
                        <span>{generatedRedeemCode}</span>
                      </div>
                      <button type="button" className="secondary compact" onClick={() => navigator.clipboard?.writeText(generatedRedeemCode)}>
                        Copy
                      </button>
                    </div>
                  ) : null}
                  {redeemCodes.length ? (
                    <div className="member-list">
                      {redeemCodes.map((code) => (
                        <div className="member-row" key={code.id}>
                          <div>
                            <strong>{code.label || code.code_prefix}</strong>
                            <span>{code.code || code.code_prefix} - {code.duration_days}d - {t("redeemed")}: {code.redeemed_count}/{code.max_redemptions}</span>
                            {code.email ? <span>{code.email}</span> : null}
                            {code.expires_at ? <span>{t("expires")}: {formatDisplayDate(code.expires_at)}</span> : null}
                          </div>
                          {code.code ? (
                            <button type="button" className="secondary compact" onClick={() => navigator.clipboard?.writeText(code.code || "")}>
                              Copy
                            </button>
                          ) : null}
                          <button type="button" className="danger compact" disabled={saving} onClick={() => deleteRedeemCode(code)}>
                            {t("delete")}
                          </button>
                          {code.redeemed_count > 0 ? (
                            <button type="button" className="danger compact" disabled={saving} onClick={() => deleteRedeemCode(code, true)}>
                              Force delete
                            </button>
                          ) : null}
                          <span className={code.is_active ? "status-pill configured" : "status-pill"}>{code.is_active ? "active" : "inactive"}</span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="empty-state">{t("noActionItems")}</p>
                  )}
                </section>
              ) : null}

              {settingsTab === "users" && canAppAdmin ? (
                <section className="settings-card settings-card-wide">
                  <div className="settings-card-heading">
                    <div>
                      <span>{t("pendingApproval")}</span>
                      <h3>{t("settingsUsers")}</h3>
                    </div>
                    <div className="member-actions">
                      <strong>{pendingUsers.length}</strong>
                      <button type="button" className="secondary compact" disabled={saving} onClick={() => loadAppUsers(true).catch((nextError) => setError(nextError instanceof Error ? nextError.message : "Unable to load users"))}>
                        {t("loadingData")}
                      </button>
                    </div>
                  </div>
                  {appUsers.length ? (
                    <div className="member-list">
                      {appUsers.map((user) => (
                        <div className="member-row" key={user.id}>
                          <div>
                            <strong>{user.display_name}</strong>
                            <span>{user.email} - {user.is_approved ? "approved" : "pending"}{user.is_blocked ? ` - ${t("blocked")}` : ""}</span>
                            {user.entitlement_days_remaining !== null ? (
                              <span>{user.entitlement_days_remaining} {t("daysRemaining")} - {formatDisplayDate(user.entitlement_valid_until || "")}</span>
                            ) : null}
                          </div>
                          <div className="member-actions">
                            {!user.is_approved ? (
                              <>
                                <button type="button" className="compact" disabled={saving} onClick={() => approveUser(user)}>
                                  {t("accept")}
                                </button>
                                <button type="button" className="danger compact" disabled={saving} onClick={() => rejectUser(user)}>
                                  {t("decline")}
                                </button>
                              </>
                            ) : null}
                            <button type="button" className={user.is_app_admin ? "compact" : "secondary compact"} disabled={saving} onClick={() => toggleAppAdmin(user)}>
                              {user.is_app_admin ? "App admin" : "Make app admin"}
                            </button>
                            {user.is_approved ? (
                              <button type="button" className={user.is_blocked ? "compact" : "secondary compact"} disabled={saving} onClick={() => toggleUserBlocked(user)}>
                                {user.is_blocked ? t("unblockAccess") : t("blockAccess")}
                              </button>
                            ) : null}
                            <button type="button" className="danger compact" disabled={saving} onClick={() => deleteAppUser(user)}>
                              {t("delete")}
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="empty-state">{t("noActionItems")}</p>
                  )}
                </section>
              ) : null}

              {settingsTab === "sharing" ? (
              <section className="settings-card">
                <div className="settings-card-heading">
                  <div>
                    <span>{t("ownership")}</span>
                    <h3>{t("pendingShareOffers")}</h3>
                  </div>
                </div>
                {shareOffers.length ? (
                  <div className="invite-list">
                    {shareOffers.map((offer) => (
                      <div className="invite-row" key={offer.id}>
                        <div>
                          <strong>{offer.wine_name} {offer.wine_vintage}</strong>
                          <span>{offer.share_pct}% - {offer.created_by_email}</span>
                          {offer.message ? <span>{offer.message}</span> : null}
                        </div>
                        <div className="member-actions">
                          <button type="button" className="compact" disabled={saving} onClick={() => decideShareOffer(offer, "accept")}>
                            {t("accept")}
                          </button>
                          <button type="button" className="secondary compact" disabled={saving} onClick={() => decideShareOffer(offer, "decline")}>
                            {t("decline")}
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="empty-state">{t("noActionItems")}</p>
                )}
              </section>
              ) : null}

              {settingsTab === "data" && canAdmin ? (
                <section className="settings-card">
                  <div className="settings-card-heading">
                    <div>
                      <span>{t("importLegacy")}</span>
                      <h3>{t("importSection")}</h3>
                    </div>
                  </div>
                  <label>
                    <span>{t("importMode")}</span>
                    <select value={importMode} onChange={(event) => setImportMode(event.target.value as ImportMode)} disabled={saving}>
                      <option value="skip_duplicates">{t("importModeSkip")}</option>
                      <option value="update_existing">{t("importModeUpdate")}</option>
                      <option value="add_all">{t("importModeAdd")}</option>
                      <option value="replace_all">{t("importModeReplace")}</option>
                    </select>
                  </label>
                  <label>
                    <span>WineCellar JSON</span>
                    <input type="file" accept="application/json,.json" onChange={importLegacyFile} disabled={saving} />
                  </label>
                  {importPreview ? (
                    <div className="token-box">
                      <strong>{t("importReady")}: {importFileName}</strong>
                      <span>{t("wines")}: {importPreview.wine_new} {t("newItems")}, {importPreview.wine_duplicates} {t("probableDuplicates")} {t("of")} {importPreview.wines_total}</span>
                      <span>{t("wishlist")}: {importPreview.wishlist_new} {t("newItems")}, {importPreview.wishlist_duplicates} {t("probableDuplicates")} {t("of")} {importPreview.wishlist_total}</span>
                      {[...importPreview.sample_wine_duplicates, ...importPreview.sample_wishlist_duplicates].length ? (
                        <small>{[...importPreview.sample_wine_duplicates, ...importPreview.sample_wishlist_duplicates].join(", ")}</small>
                      ) : null}
                    </div>
                  ) : null}
                  {importResult ? (
                    <div className="token-box">
                      <strong>{t("importSummary")}</strong>
                      {(importResult.wines_deleted || importResult.wishlist_deleted) ? <span>{t("emptyCellar")}: {importResult.wines_deleted} {t("wines").toLowerCase()}, {importResult.wishlist_deleted} {t("wishlist").toLowerCase()}</span> : null}
                      <span>{t("wines")}: +{importResult.wines_imported}, {t("updatedItems")} {importResult.wines_updated}, {t("skipped")} {importResult.wines_skipped}</span>
                      <span>{t("wishlist")}: +{importResult.wishlist_imported}, {t("updatedItems")} {importResult.wishlist_updated}, {t("skipped")} {importResult.wishlist_skipped}</span>
                    </div>
                  ) : null}
                  <div className="inline-form">
                    <button type="button" disabled={saving || !importPayload} onClick={runLegacyImport}>
                      {t("importRun")}
                    </button>
                    <button type="button" className="secondary" disabled={saving} onClick={exportJson}>
                      {t("exportJson")}
                    </button>
                  </div>
                  <div className="error-banner">
                    <strong>{t("emptyCellar")}</strong>
                    <span>{t("emptyCellarWarning")}</span>
                    <button type="button" className="danger compact" disabled={saving} onClick={emptyCellar}>
                      {t("emptyCellar")}
                    </button>
                  </div>
                </section>
              ) : null}

              {settingsTab === "sharing" && canAdmin ? (
                <section className="settings-card">
                  <div className="settings-card-heading">
                    <div>
                      <span>{t("inviteMember")}</span>
                      <h3>{t("sharedCellar")}</h3>
                    </div>
                  </div>
                  <form className="inline-form" onSubmit={createInvite}>
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
                    <label>
                      <span>{t("visibility")}</span>
                      <select
                        value={inviteDraft.role === "admin" ? "all" : inviteDraft.visibility_scope}
                        disabled={inviteDraft.role === "admin"}
                        onChange={(event) => setInviteDraft({ ...inviteDraft, visibility_scope: event.target.value as "all" | "shared" })}
                      >
                        <option value="shared">{t("visibilityShared")}</option>
                        <option value="all">{t("visibilityAll")}</option>
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
                </section>
              ) : null}

              {settingsTab === "sharing" && canAdmin ? (
                <section className="settings-card">
                  <div className="settings-card-heading">
                    <div>
                      <span>{t("pendingInvites")}</span>
                      <h3>{t("inviteMember")}</h3>
                    </div>
                  </div>
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
                </section>
              ) : null}

              {settingsTab === "ai" && canWriteWine ? (
              <section className="settings-card settings-card-wide">
                <div className="settings-card-heading">
                  <div>
                    <span>{t("aiAudit")}</span>
                    <h3>{t("aiUsage")}</h3>
                  </div>
                </div>
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
              </section>
              ) : null}

              {settingsTab === "sharing" ? (
              <form className="settings-card" onSubmit={acceptInvite}>
                <div className="settings-card-heading">
                  <div>
                    <span>{t("acceptInvite")}</span>
                    <h3>{t("inviteToken")}</h3>
                  </div>
                </div>
                <label>
                  <span>{t("inviteToken")}</span>
                  <input value={acceptToken} onChange={(event) => setAcceptToken(event.target.value)} />
                </label>
                <button type="submit" className="secondary" disabled={saving || !acceptToken.trim()}>
                  {t("accept")}
                </button>
              </form>
              ) : null}
            </div>
          </section>
          ) : null}
        </section>
      )}
    </main>
  );
}
