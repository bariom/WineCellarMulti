import { CSSProperties, ChangeEvent, Children, Dispatch, FormEvent, MouseEvent, ReactNode, SetStateAction, UIEvent, useEffect, useRef, useState } from "react";

type Session = {
  authenticated: boolean;
  user_display_name: string | null;
  user_email: string | null;
  active_household_id: string | null;
  active_household_name: string | null;
  membership_role: string | null;
  is_app_admin: boolean;
  pending_approval: boolean;
  pending_email_verification: boolean;
  locale: Locale;
  theme_preference: ThemePreference;
  can_use_label_recognition: boolean;
  has_active_entitlement: boolean;
  entitlement_valid_until: string | null;
  entitlement_days_remaining: number | null;
};

type Wine = {
  id: string;
  details_loaded: boolean;
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
  tasting_history: Array<{
    id: string;
    consumed_at: string;
    note: string;
    rating: number;
    occasion: string;
    pairing: string;
    companions: string;
    created_at: string;
  }>;
  value_history: Array<{ id: string; value: string; currency: string; source: string; recorded_at: string }>;
};

type ConsumeWineDraft = {
  consumed_at: string;
  note: string;
  tasting_rating: string;
  tasting_occasion: string;
  tasting_pairing: string;
  tasting_companions: string;
};

type CatalogWine = {
  id?: string;
  name: string;
  producer: string;
  region: string;
  appellation: string;
  type: string;
  format: string;
  country?: string;
  grapes_text?: string;
  source?: string;
  is_active?: boolean;
};

type WineRecognitionResult = {
  suggestions: Array<{ label: string; confidence: number | null; vintage: string; producer: string; region: string; appellation: string; type: string }>;
  matches: CatalogWine[];
  raw_best_label: string;
};

type WineLabelEnrichment = {
  name: string;
  producer: string;
  vintage: string;
  type: string;
  region: string;
  appellation: string;
  country: string;
  grapes_text: string;
  confidence: string;
  notes: string;
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
  grapes: Array<{ name: string; percentage_from: string; percentage_to: string }>;
  scores: Array<{ critic: string; score: string; note: string }>;
};

type WineTone = "red" | "white" | "sparkling" | "rose" | "sweet" | "other";

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
  format: string;
  included_blocks: string[];
  wines_total: number;
  wishlist_total: number;
  wine_duplicates: number;
  wishlist_duplicates: number;
  wine_new: number;
  wishlist_new: number;
  sample_wine_duplicates: string[];
  sample_wishlist_duplicates: string[];
  members_total: number;
  invites_total: number;
  share_offers_total: number;
  user_tags_total: number;
  ai_audit_total: number;
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
  members_imported: number;
  members_skipped: number;
  members_updated: number;
  invites_imported: number;
  invites_skipped: number;
  invites_updated: number;
  share_offers_imported: number;
  share_offers_skipped: number;
  share_offers_updated: number;
  user_tags_imported: number;
  user_tags_skipped: number;
  user_tags_updated: number;
  ai_audit_imported: number;
  ai_audit_skipped: number;
  ai_audit_updated: number;
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

const helpGuideContentV2: typeof helpGuideContent = {
  en: {
    eyebrow: "Guide",
    title: "How to use Vinaris",
    intro:
      "This guide is designed as a practical operating manual for collectors. Start with setup, then use the later sections as a working reference for cellar routines, buying decisions, AI, and shared workflows.",
    sections: [
      {
        title: "1. Start with your cellar",
        body: "The Cellar view is where your real collection lives. Add delivered bottles first, then ordered bottles, future deliveries, and shared positions.",
        bullets: [
          "Use Add wine to register producer, vintage, quantity, bottle format, status, and purchase price.",
          "Vintage supports classic years plus NV or MV for non-vintage cuvees.",
          "For shared bottles, define ownership and percentages directly in the wine record.",
          "If you already have structured data, import it from Settings > Data.",
        ],
      },
      {
        title: "2. Use the dashboard to decide what matters now",
        body: "Home is not just a summary. It is your operational screen for drinking decisions, upcoming deliveries, and data cleanup.",
        bullets: [
          "Collector focus shows priority actions, risky wines, key position, deliveries, and missing data.",
          "Timeline helps you track futures and expected arrivals over time.",
          "Value and data views help you spot concentration, missing fields, and stale pricing faster.",
        ],
      },
      {
        title: "3. Build a buying workflow with Wishlist",
        body: "Wishlist keeps future purchases separate from the active cellar until you are ready to convert them into real positions.",
        bullets: [
          "Create multiple wishlist lists when you want to separate themes such as reds, Champagne, restaurant buys, or short-term opportunities.",
          "Add target prices, priority, purpose, merchant notes, and optional AI context notes.",
          "[AI] Use AI suggestions, if configured, to refine buying strategy, purpose, and live market price.",
          "Convert wishlist items into cellar positions when you buy them, or delete a whole list knowing its items are deleted with it.",
        ],
      },
      {
        title: "4. Use wine details as your decision screen",
        body: "Open any wine to see the full card with value, drinking window, notes, ownership, grapes, scores, and value history.",
        bullets: [
          "[AI] The drinking window shows young, ideal, and past-window periods with the current year marker when AI window data has been generated.",
          "[AI] Market price checks can enrich the wine card with AI-assisted live pricing and source-backed value context.",
          "Value evolution tracks the historical pricing points you record over time.",
          "Edit mode is the place to update scores, tags, grapes, quantities, format, and delivery state.",
        ],
      },
      {
        title: "5. Record consumption and preserve tasting memory",
        body: "When a bottle is consumed, Vinaris reduces the cellar quantity and stores the tasting information in History.",
        bullets: [
          "Use Bottle consumed from the wine detail to register date, note, occasion, pairing, companions, and tasting rating.",
          "Once the last bottle is gone, the wine moves out of the active cellar and remains available in History.",
          "History is your long-term tasting archive, not just a deleted-bottles list.",
          "Consumed entries can be edited later if you want to add details you forgot during the first tasting registration.",
        ],
      },
      {
        title: "6. Activate AI only if you want it",
        body: "Vinaris works without AI, but it becomes more powerful when you connect your own OpenAI key or use an in-app AI Pack.",
        bullets: [
          "AI can help with tasting notes, drinking windows, price checks, grapes, wishlist strategy, pairings, and direct wine comparisons.",
          "If you do not want to use your own key, buy an AI Pack directly in the app and let Vinaris handle the AI usage.",
          "Your own token is encrypted and stored securely, while AI Pack usage is tracked inside your account budget.",
          "All AI settings live in Settings > AI and remain under your control.",
        ],
      },
      {
        title: "7. Use the sommelier and comparison tools",
        body: "Vinaris is not only a cellar ledger. It also helps you decide what to open, what to buy, and how two bottles differ.",
        bullets: [
          "[AI] Pairing lets you enter a dish and ask the AI sommelier for the best matches from your cellar or from the market.",
          "You can save personal pairing preferences and optionally ignore them for a single request when you want a neutral recommendation.",
          "Set a max pairing budget when you want a good match under a price ceiling, not necessarily the best bottle in the cellar.",
          "Wine comparison helps you place two to four wines side by side before opening or buying.",
          "[AI] AI comparison works best on two wines and returns style, readiness, occasion, and cellar-value judgment.",
        ],
      },
      {
        title: "8. Manage cellars, access, and shared workflows",
        body: "Vinaris supports multiple cellars per user, cellar invitations, and mirrored shared positions between collectors.",
        bullets: [
          "Use Settings > Cellars to rename the active cellar, create a new one, or switch between existing cellars.",
          "Anyone you invite to a cellar must already have their own Vinaris account.",
          "For shared wines, first grant visibility to shared bottles, then send the shared position so it appears in the other collector's cellar too.",
        ],
      },
      {
        title: "9. Follow notifications and data quality",
        body: "Notifications and data-quality views help you keep the cellar operational instead of slowly drifting out of date.",
        bullets: [
          "Notifications help you track invites, redeem codes, approvals, expiring access, incoming shared positions, future deliveries, and wines waiting to be collected.",
          "Data Quality highlights missing value, drink window, grapes, and scores so you know what to complete next.",
          "Wines without a usable vintage such as NV or MV are excluded from drink-window missing-data checks where appropriate.",
        ],
      },
      {
        title: "10. Import, export, and move data safely",
        body: "Vinaris supports structured export and import so each cellar can be backed up or restored with intent.",
        bullets: [
          "Use Settings > Data to export the active cellar and choose which blocks to include.",
          "Vinaris JSON import is meant for Vinaris exports and can restore more than wines alone depending on the selected blocks.",
          "Be careful when importing shared data such as members, invites, and ownership because those blocks can grant access to other accounts.",
          "Offline backup loading appears when you are without network, or after a failed login caused by missing connectivity, so you can still browse a cellar snapshot in read-only mode.",
        ],
      },
    ],
  },
  it: {
    eyebrow: "Guida",
    title: "Come usare Vinaris",
    intro:
      "Questa guida e pensata come manuale operativo per il collezionista. Parti dalla configurazione iniziale e poi usa le sezioni successive come riferimento pratico per routine di cantina, acquisti, AI e condivisioni.",
    sections: [
      {
        title: "1. Parti dalla tua cantina",
        body: "La vista Cantina e il luogo dove vive la collezione reale. Inserisci prima i vini consegnati, poi ordini, consegne future e posizioni condivise.",
        bullets: [
          "Usa Aggiungi vino per registrare produttore, annata, quantita, formato bottiglia, stato e prezzo di acquisto.",
          "L'annata supporta gli anni classici ma anche NV o MV per cuvee non millesimate.",
          "Per le bottiglie condivise, definisci proprieta e percentuali direttamente nella scheda vino.",
          "Se hai gia dati strutturati, importali da Impostazioni > Data.",
        ],
      },
      {
        title: "2. Usa la dashboard per capire cosa conta adesso",
        body: "La Home non e solo un riepilogo. E la schermata operativa per decidere cosa bere, cosa arrivera e quali dati completare.",
        bullets: [
          "Collector focus mostra azioni prioritarie, bottiglie a rischio, posizione chiave, consegne e dati mancanti.",
          "Timeline ti aiuta a seguire futures ed arrivi attesi nel tempo.",
          "Le viste valore e qualita dati ti aiutano a vedere piu rapidamente concentrazione, campi mancanti e prezzi da aggiornare.",
        ],
      },
      {
        title: "3. Costruisci il flusso acquisti con la Wishlist",
        body: "La Wishlist tiene separate le bottiglie future dalla cantina attiva finche non decidi di comprarle o convertirle in posizioni reali.",
        bullets: [
          "Crea piu liste wishlist quando vuoi separare temi diversi, come rossi, Champagne, acquisti da ristorante o opportunita di breve periodo.",
          "Aggiungi prezzi target, priorita, scopo, note merchant e, se utile, una nota contesto AI.",
          "[AI] Usa i suggerimenti AI, se configurati, per affinare strategia di acquisto, scopo e prezzo di mercato live.",
          "Converti gli elementi wishlist in posizioni di cantina quando acquisti, oppure elimina una lista sapendo che anche i suoi elementi verranno eliminati.",
        ],
      },
      {
        title: "4. Usa il dettaglio vino come schermo decisionale",
        body: "Apri un vino per vedere la scheda completa con valore, finestra di beva, note, proprieta, uve, punteggi e storico del valore.",
        bullets: [
          "[AI] La finestra di beva evidenzia il periodo giovane, ideale e oltre finestra con l'indicatore dell'anno corrente quando hai generato i dati AI della finestra.",
          "[AI] I controlli di prezzo possono arricchire la scheda vino con valore di mercato live assistito da AI e fonti verificate.",
          "L'evoluzione valore tiene traccia dei punti prezzo che registri nel tempo.",
          "La modalita modifica e il posto giusto per aggiornare punteggi, tag, uve, quantita, formato e stato consegna.",
        ],
      },
      {
        title: "5. Registra il consumo e conserva la memoria degustativa",
        body: "Quando una bottiglia viene bevuta, Vinaris scala la quantita in cantina e salva i dati della degustazione nello Storico.",
        bullets: [
          "Usa Bevuta 1 dal dettaglio vino per registrare data, nota, occasione, abbinamento, compagni e voto degustativo.",
          "Quando finisce l'ultima bottiglia, il vino esce dalla cantina attiva ma resta consultabile nello Storico.",
          "Lo Storico e il tuo archivio degustativo di lungo periodo, non solo una lista di bottiglie eliminate.",
          "Le bevute registrate possono essere modificate in un secondo momento se vuoi completare note o dettagli dimenticati.",
        ],
      },
      {
        title: "6. Attiva l'AI solo se ti serve",
        body: "Vinaris funziona anche senza AI, ma diventa piu potente quando colleghi la tua chiave OpenAI oppure usi un AI Pack in-app.",
        bullets: [
          "L'AI puo aiutarti con note degustative, finestre di beva, controlli di valore, uvaggi, strategia wishlist, abbinamenti e confronti diretti tra vini.",
          "Se non vuoi usare una chiave personale, puoi acquistare un AI Pack direttamente nell'app e lasciare a Vinaris la gestione dell'uso AI.",
          "Il tuo token personale viene criptato e archiviato in modo sicuro, mentre l'AI Pack usa il budget interno del tuo account.",
          "Tutte le impostazioni AI vivono in Impostazioni > AI e restano sotto il tuo controllo.",
        ],
      },
      {
        title: "7. Usa sommelier AI e confronto vini",
        body: "Vinaris non e solo un registro di cantina. Ti aiuta anche a decidere cosa aprire, cosa comprare e come due bottiglie si differenziano.",
        bullets: [
          "[AI] Abbinamento ti permette di inserire un piatto e chiedere al sommelier AI i match migliori dalla tua cantina o dal mercato.",
          "Puoi salvare i tuoi gusti personali per gli abbinamenti e ignorarli su una singola richiesta quando vuoi un responso piu neutro.",
          "Puoi fissare un budget massimo per ottenere un abbinamento buono entro una certa soglia di prezzo, non per forza la bottiglia migliore in assoluto.",
          "Confronto vini ti aiuta a mettere due fino a quattro bottiglie fianco a fianco prima di aprirle o comprarle.",
          "[AI] Il confronto AI funziona al meglio su due vini e restituisce stile, prontezza, occasione ideale e giudizio cantina/valore.",
        ],
      },
      {
        title: "8. Gestisci cantine, accessi e flussi condivisi",
        body: "Vinaris supporta piu cantine per utente, inviti in cantina e rispecchiamento delle posizioni condivise tra collezionisti.",
        bullets: [
          "Usa Impostazioni > Cantine per rinominare la cantina attiva, crearne una nuova o passare da una cantina all'altra.",
          "Chi inviti in una cantina deve comunque essere gia titolare di un account Vinaris.",
          "Per i vini condivisi, prima concedi visibilita alle sole bottiglie condivise e poi invia la posizione cosi comparira anche nella cantina dell'altro collezionista.",
        ],
      },
      {
        title: "9. Segui notifiche e qualita dati",
        body: "Notifiche e controlli qualita dati servono a mantenere la cantina operativa, non semplicemente popolata.",
        bullets: [
          "Le notifiche ti aiutano a seguire inviti, codici redeem, approvazioni, accessi in scadenza, posizioni condivise in arrivo, consegne future e vini da ritirare.",
          "Qualita dati evidenzia valori mancanti, finestre di beva assenti, uve mancanti e punteggi non ancora censiti.",
          "I vini senza annata utile, come NV o MV, vengono esclusi dai controlli sulla finestra di beva quando non e sensato richiederla.",
        ],
      },
      {
        title: "10. Importa, esporta e sposta i dati con criterio",
        body: "Vinaris supporta export e import strutturati cosi ogni cantina puo essere salvata o ripristinata in modo intenzionale.",
        bullets: [
          "Usa Impostazioni > Data per esportare la cantina attiva e scegliere quali blocchi includere.",
          "L'import JSON Vinaris e pensato per gli export Vinaris e puo ripristinare piu elementi dei soli vini, a seconda dei blocchi selezionati.",
          "Fai attenzione ai dati condivisi come membri, inviti e proprieta perche quei blocchi possono dare accesso anche ad altri account.",
          "Il backup offline compare quando sei senza rete, oppure dopo un login fallito per assenza di connessione, cosi puoi comunque consultare uno snapshot in sola lettura.",
        ],
      },
    ],
  },
};

type TastingArchiveApiItem = {
  tasting_id: string;
  wine_id: string;
  wine_name: string;
  wine_producer: string;
  wine_vintage: string;
  wine_format: string;
  wine_type: string;
  wine_region: string;
  wine_appellation: string;
  wine_status: string;
  consumed_at: string;
  note: string;
  rating: number;
  occasion: string;
  pairing: string;
  companions: string;
  created_at: string;
};

type TastingArchivePage = {
  total: number;
  limit: number;
  offset: number;
  rated_count: number;
  notes_count: number;
  latest_consumed_at: string | null;
  items: TastingArchiveApiItem[];
};

type WishlistItem = {
  id: string;
  household_id: string;
  wishlist_list_id: string;
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
  ai_context_note: string;
  ai_strategy: string;
  ai_strategy_generated_at: string | null;
  ai_purpose_advice: string;
  ai_purpose_generated_at: string | null;
};

type WishlistList = {
  id: string;
  household_id: string;
  name: string;
  description: string;
  item_count: number;
};

type WishlistDraft = {
  wishlist_list_id: string;
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
  ai_context_note: string;
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
  can_use_label_recognition: boolean;
  ai_credit_balance_usd: string;
  approved_at: string | null;
  entitlement_valid_until: string | null;
  entitlement_days_remaining: number | null;
};

type RedeemCode = {
  id: string;
  code: string | null;
  code_prefix: string;
  kind: string;
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

type OperationalActionSnooze = {
  signature: string;
  until: number;
};

type OperationalActionSnoozes = Record<string, OperationalActionSnooze>;

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
  ai_credit_balance_usd: string;
  ai_credit_pack_size_usd: string;
  can_purchase_ai_credits: boolean;
};

type PaymentPlan = "monthly" | "annual" | "ai_credits";

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
  sources: Array<Record<string, unknown>>;
};

type MarketViewContext =
  | { kind: "wine"; wine: Wine; entry: AiAuditLog }
  | { kind: "wishlist"; item: WishlistItem; entry: AiAuditLog };

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
  provider_mode: "auto" | "user_key" | "credits";
  provider_options: string[];
  app_credit_balance_usd: string;
  ai_credit_pack_size_usd: string;
  can_use_app_credits: boolean;
  ai_notes_model: string;
  drink_window_model: string;
  value_model: string;
  grape_model: string;
  wishlist_model: string;
  pairing_model: string;
  pairing_preferences: string;
  model_options: string[];
};

type AiSettingsDraft = {
  openai_api_key: string;
  provider_mode: "auto" | "user_key" | "credits";
  ai_notes_model: string;
  drink_window_model: string;
  value_model: string;
  grape_model: string;
  wishlist_model: string;
  pairing_model: string;
  pairing_preferences: string;
};

type PairingResult = {
  summary: string;
  model: string;
  cellar_matches: Array<{ wine_id: string; wine_name: string; producer: string; reason: string; serving_note: string }>;
  market_recommendations: Record<string, Array<{ name: string; producer: string; price_hint: string; reason: string }>>;
  estimated_cost_usd: string;
};

type WineCompareAiResult = {
  model: string;
  style_profile: string;
  readiness: string;
  occasion: string;
  cellar_value: string;
  verdict: string;
  estimated_cost_usd: string;
};

type WishlistPortfolioStrategy = {
  model: string;
  overview: string;
  buy_now: string;
  wait_watch: string;
  allocation: string;
  next_step: string;
  wishlist_list_id: string;
  wishlist_list_name: string;
  item_count: number;
  generated_at: string | null;
  estimated_cost_usd: string;
};

type AuthDraft = {
  email: string;
  display_name: string;
  household_name: string;
  password: string;
  password_confirm: string;
};

type ContactSupportDraft = {
  email: string;
  subject: string;
  message: string;
};

type ExportSelection = {
  wines: boolean;
  wishlist: boolean;
  members: boolean;
  invites: boolean;
  share_offers: boolean;
  user_tags: boolean;
  ai_audit: boolean;
};

type ImportSelection = ExportSelection;

type SortMode = "name" | "vintage" | "value" | "drink_window" | "priority";
type Locale = "en" | "it";
type DashboardFocus = "collector" | "value" | "readiness" | "timeline" | "data";
type SettingsTab = "profile" | "ai" | "tags" | "sharing" | "users" | "data";
type ViewName = "home" | "cellar" | "history" | "wishlist" | "pairing" | "help" | "settings";
type HistorySection = "tastings" | "wines";
type QuickWineFilter = "" | "mine" | "shared" | "drink_now" | "drink_soon" | "past_window" | "future_deliveries" | "missing_data";
type OperationalActionItem = {
  id: string;
  kind: string;
  title: string;
  detail: string;
  count: number;
  signature: string;
  onOpen: () => void;
};
type WineAiFeature = "notes" | "drink-window" | "value" | "grapes" | "scores";
type ThemePreference =
  | "system"
  | "light"
  | "dark"
  | "private-cellar"
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

type TastingArchiveEntry = {
  id: string;
  wine: Wine;
  consumed_at: string;
  note: string;
  rating: number;
  occasion: string;
  pairing: string;
  companions: string;
  created_at: string;
};

const TASTING_ARCHIVE_PAGE_SIZE = 50;
const OPERATIONAL_ACTION_SNOOZE_DAYS = 14;
const OPERATIONAL_ACTION_SNOOZE_STORAGE_KEY = "vinaris.operationalActionSnoozes.v1";

function readOperationalActionSnoozes(): OperationalActionSnoozes {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(OPERATIONAL_ACTION_SNOOZE_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as OperationalActionSnoozes;
    if (!parsed || typeof parsed !== "object") return {};
    return parsed;
  } catch {
    return {};
  }
}

function writeOperationalActionSnoozes(snoozes: OperationalActionSnoozes) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(OPERATIONAL_ACTION_SNOOZE_STORAGE_KEY, JSON.stringify(snoozes));
  } catch {
    // Snoozing is a convenience layer; blocked storage must not break the app.
  }
}

const emptyAiSettingsDraft: AiSettingsDraft = {
  openai_api_key: "",
  provider_mode: "auto",
  ai_notes_model: "gpt-5.4-mini",
  drink_window_model: "gpt-5.4",
  value_model: "gpt-5.4-mini",
  grape_model: "gpt-5.4-nano",
  wishlist_model: "gpt-5.4",
  pairing_model: "gpt-5.4",
  pairing_preferences: "",
};

const emptyRedeemCodeDraft: RedeemCodeDraft = {
  label: "",
  duration_days: "30",
  max_redemptions: "1",
  email: "",
  expires_at: "",
};

const emptyConsumeWineDraft = (): ConsumeWineDraft => ({
  consumed_at: new Date().toISOString().slice(0, 10),
  note: "",
  tasting_rating: "0",
  tasting_occasion: "",
  tasting_pairing: "",
  tasting_companions: "",
});

function consumeDraftFromTastingEntry(entry: Wine["tasting_history"][number]): ConsumeWineDraft {
  return {
    consumed_at: entry.consumed_at || new Date().toISOString().slice(0, 10),
    note: entry.note || "",
    tasting_rating: String(entry.rating || 0),
    tasting_occasion: entry.occasion || "",
    tasting_pairing: entry.pairing || "",
    tasting_companions: entry.companions || "",
  };
}

const defaultExportSelection: ExportSelection = {
  wines: true,
  wishlist: true,
  members: true,
  invites: true,
  share_offers: true,
  user_tags: true,
  ai_audit: true,
};

function importSelectionFromBlocks(blocks: string[]): ImportSelection {
  const enabled = new Set(blocks);
  return {
    wines: enabled.has("wines"),
    wishlist: enabled.has("wishlist"),
    members: false,
    invites: false,
    share_offers: false,
    user_tags: enabled.has("user_tags"),
    ai_audit: enabled.has("ai_audit"),
  };
}

const translations = {
  en: {
    accept: "Accept",
    acceptInvite: "Accept invite",
    addWine: "Add wine",
    addWishlist: "Add to wishlist",
    recognizeWine: "Recognize from photo",
    recognizingWine: "Recognizing...",
    choosePhotoFile: "Choose file",
    takeLabelPhoto: "Take label photo",
    recognitionBetaNotice: "Beta test service. Results below 75% confidence are ignored.",
    recognitionSuggestions: "Recognition suggestions",
    recognitionNoMatch: "No catalog match yet. Apply a suggestion and the catalog can be enriched.",
    labelRecognitionAccess: "Label recognition",
    labelRecognitionEnabled: "Label recognition enabled",
    labelRecognitionDisabled: "Label recognition disabled",
    searchWineDataWithAi: "Search wine data with AI",
    searchWineDataWithAiHelp: "No exact catalog match. Use AI to fill producer, region, appellation, type, and vintage from the name you entered.",
    pendingCatalogEntries: "Catalog entries pending approval",
    approveCatalogEntry: "Approve catalog entry",
    rejectCatalogEntry: "Reject catalog entry",
    noPendingCatalogEntries: "No catalog entries pending approval",
    catalogAdminSearch: "Search catalog entries",
    catalogAdminSearchHelp: "Search active and pending catalog entries by name, producer, region, or alias.",
    deleteCatalogEntry: "Delete catalog entry",
    noCatalogAdminResults: "No catalog entries found",
    useSuggestion: "Use suggestion",
    aiNotes: "AI notes",
    aiProvider: "AI source",
    aiProviderAuto: "Automatic",
    aiProviderUserKey: "My OpenAI key",
    aiProviderCredits: "Vinaris AI Pack",
    aiCredits: "AI Pack",
    aiCreditBalance: "AI budget",
    targetAiCreditBalance: "Target AI budget (USD)",
    aiCreditAdminNote: "Note or gift reason",
    saveAiCreditBalance: "Update AI budget",
    aiCreditAdminHelp: "Set the final AI budget for this user. Vinaris records only the adjustment needed to reach that balance.",
    aiBudgetUsage: "Usage",
    aiCreditsHelp: "If no personal OpenAI key is configured, Vinaris can use an app-managed AI Pack purchased through Stripe. This budget is tracked internally against estimated OpenAI usage.",
    buyAiCredits: "Buy AI Pack",
    noAiProvider: "No AI source available",
    appAiReady: "App AI ready",
    appAiKeyMissing: "App AI key missing",
    saveAiSourceHint: "Save AI settings to apply the selected source.",
    searchTags: "Search tags",
    searchGrapes: "Search grapes",
    aiPurpose: "AI purpose",
    aiReadiness: "AI readiness",
    aiReadinessHelp: "Wines with AI notes or value notes. Missing data above are the first candidates for AI enrichment.",
    aiAudit: "AI audit",
    showLatest: "Show latest",
    auditDateFrom: "From date",
    auditDateTo: "To date",
    auditResetFilters: "Reset filters",
    auditResultsCount: "matching actions",
    aiSettings: "AI settings",
    aiStrategy: "AI strategy",
    wishlistPortfolioStrategy: "Wishlist buying strategy",
    wishlistPortfolioStrategyHelp: "Review the full wishlist as a collector portfolio and decide what to prioritize now versus monitor.",
    wishlistList: "Wishlist list",
    wishlistLists: "Wishlists",
    createWishlistList: "New list",
    renameWishlistList: "Rename list",
    deleteWishlistList: "Delete list",
    wishlistListName: "List name",
    wishlistListDeleteHelp: "Items in this list will be deleted together with the list.",
    generateWishlistPortfolioStrategy: "Generate buying strategy",
    refreshWishlistPortfolioStrategy: "Refresh buying strategy",
    noWishlistPortfolioStrategy: "No wishlist-wide buying strategy generated yet.",
    generatedAt: "Generated",
    wishlistStrategyOverview: "Overview",
    wishlistStrategyBuyNow: "Buy now",
    wishlistStrategyWaitWatch: "Wait / watch",
    wishlistStrategyAllocation: "Capital allocation",
    wishlistStrategyNextStep: "Next step",
    aiMarketPrice: "AI market price",
    aiTargetPrice: "AI market price",
    marketValueView: "Market value",
    viewMarketSources: "View market sources",
    averageMarketPrice: "Average market price",
    marketSources: "Sources",
    webSources: "Web sources checked",
    marketSourcesUnavailable: "No market sources available for this estimate.",
    marketAvailability: "Market note",
    close: "Close",
    backToTop: "Back to top",
    winesLabel: "wines",
    groupedByColor: "Grouped by color",
    aiContextNote: "AI context note",
    aiContextNoteHelp: "Optional note used by AI as extra context for wishlist strategy, purpose, and market price.",
    aiUsage: "AI usage",
    allTime: "All time",
    allBottles: "All bottles",
    allStatuses: "All statuses",
    allTags: "All tags",
    allTypes: "All types",
    bottlePrice: "Bottle price",
    minPrice: "Min price",
    maxPrice: "Max price",
    appellation: "Appellation",
    billing: "Subscription management",
    buyAccess: "Pay with card",
    buyAnnual: "Buy annual subscription",
    buyMonthly: "Buy monthly subscription",
    resetPriceRange: "Reset",
    bottles: "Bottles",
    cancel: "Cancel",
    cellar: "Cellar",
    cellarName: "Cellar name",
    createCellar: "Create cellar",
    createCellarHelp: "Create a separate cellar for another collection, place, or project. You will switch to it immediately after creation.",
    deleteCellar: "Delete cellar",
    deleteCellarHelp: "Delete this cellar and all its wines, wishlist items, shares, invites, and AI audit entries. Every member must already have another cellar.",
    deleteCellarConfirm: "Delete this cellar permanently? All cellar data inside it will be removed.",
    deleteCellarTypeName: "Type the cellar name to confirm",
    deleteCellarMismatch: "The typed name does not match the active cellar.",
    renameCellar: "Rename cellar",
    clearFilters: "Clear filters",
    convert: "Convert",
    compare: "Compare",
    compareSelection: "Wine comparison",
    compareSelected: "Selected for comparison",
    openCompare: "Open comparison",
    clearCompare: "Clear comparison",
    compareLimit: "You can compare up to 4 wines.",
    compareNeedTwo: "Select at least 2 wines to compare them.",
    aiCompare: "AI comparison",
    aiCompareOnlyTwo: "AI comparison is available for 2 wines.",
    aiRequestCost: "AI request cost",
    styleProfile: "Style and profile",
    compareReadiness: "Readiness",
    compareOccasion: "Best occasion",
    compareCellarValue: "Cellar and value",
    compareVerdict: "Verdict",
    create: "Create",
    createAccount: "Create account",
    confirmPassword: "Confirm password",
    finalBetaPromo: "Final beta promo",
    promoNote: "Promo pricing during final beta. Early users lock in the current launch rate while the platform is still being refined.",
    registerPromoHelp: "Current pricing is promotional during final beta.",
    promoMonthlyPrice: "Monthly access promo: CHF 6 / month.",
    promoAnnualPrice: "Annual access promo: CHF 60 / year.",
    createInvite: "Create invite",
    createRedeemCode: "Create redeem code",
    consumeBottle: "Bottle consumed",
    consumeBottleHelp: "Decrease the cellar quantity by one and store tasting details in history.",
    tastingHistory: "Tasting history",
    tastingDate: "Tasting date",
    tastingNote: "Tasting note",
    tastingOccasion: "Occasion",
    tastingPairing: "Pairing",
    tastingCompanions: "With",
    tastingRating: "Tasting rating",
    saveTasting: "Save tasting",
    noTastingHistory: "No tasting notes recorded yet.",
    historyTastings: "Consumed bottles",
    historyArchivedWines: "Archived wines",
    latestConsumedBottles: "Latest consumed bottles",
    tastingEntries: "Tasting entries",
    ratedTastings: "Rated tastings",
    tastingNotesSaved: "Tasting notes saved",
    latestTasted: "Latest tasting",
    showingResults: "Showing",
    previousPage: "Previous",
    nextPage: "Next",
    noTastingArchiveMatch: "No consumed bottles match the current filters",
    critic: "Critic",
    grapeName: "Grape",
    fromPercent: "From %",
    toPercent: "To %",
    configured: "Configured",
    contactSupport: "Contact support",
    contactSupportHelp: "Use this form if you have trouble with login, payments, invitations, or data.",
    createWine: "Create wine",
    createWishlist: "Add wine",
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
    operationalActions: "Operational actions",
    operationalActionsHelp: "Open items that need a decision or data cleanup.",
    showActions: "Show",
    hideActions: "Hide",
    snoozeAction: "Hide 14 days",
    openWishlistActions: "Open wishlist actions",
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
    keyPosition: "Key position",
    action: "Action",
    hold: "Hold",
    monitor: "Monitor",
    completeData: "Complete data",
    collectorFocus: "Collector focus",
    cellarSnapshot: "Cellar snapshot",
    cellarStats: "Cellar stats",
    household: "Household",
    importLegacy: "Import JSON backup",
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
    importSupports: "Supports Vinaris exports and legacy WineCellar JSON.",
    importSelection: "Import selection",
    importSelectionHelp: "Choose which blocks to restore. Members, invites, and shared positions can grant other users access to this cellar.",
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
    passwordMismatch: "Passwords do not match",
    logout: "Logout",
    merchant: "Merchant",
    message: "Message",
    manageSubscription: "Manage subscription",
    markRead: "Mark read",
    multiOwnership: "Multi ownership",
    missingDrinkWindow: "Missing drink window",
    missingGrapes: "Missing grapes",
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
    pairingMaxPrice: "Max budget (CHF)",
    pairingMaxPriceHelp: "Optional. Use it when you want a good match within a spending limit, not necessarily the best bottle overall.",
    pairingNoBudget: "No limit",
    pairingPreferences: "My pairing tastes",
    pairingPreferencesHelp: "Describe your preferences once and Vinaris will use them by default during pairing.",
    pairingPreferencesPlaceholder: "E.g. I prefer fresh, precise wines, low oak, little sweetness, and I usually avoid heavy tannins with spicy dishes.",
    pairingIgnorePreferences: "Ignore my tastes for this request",
    pairingLocalHelp: "When restaurant mode is active, ask AI to favor bottles from the place where you are.",
    pairingLocalOrigin: "Where are you?",
    pairingLocalOriginHelp: "Enter a region, area, city, or country. Example: Tuscany, Piedmont, Burgundy, Switzerland.",
    pairingPreferLocal: "Prefer local wines",
    savePairingPreferences: "Save tastes",
    pairingEmptyDish: "Enter a dish first.",
    pairingIncludeMarket: "Also show 2 bottles outside my cellar",
    pairingMarketFallback: "Suggested bottles to buy",
    pairingMarketOnly: "Restaurant mode: ignore my cellar",
    pairingModelUsed: "Model used",
    pairingWithinBudget: "Within budget",
    pairingAboveBudget: "Above budget, exception",
    pairingBestValue: "Best value",
    pairingNoCellarMatch: "No ideal bottle found in your cellar.",
    pairingPlaceholder: "E.g. mushroom risotto, braised beef, sushi",
    pairingSubmit: "Find pairing",
    pairingWhy: "Why",
    password: "Password",
    passkey: "Passkey",
    passkeyHelpBody: "A passkey lets you sign in without typing your password. Instead, your device confirms that it is really you using Face ID, fingerprint, screen PIN, or the unlock method you already use every day.",
    passkeyHelpLabel: "What is a passkey?",
    passkeyHelpPrerequisiteAccount: "You must create the passkey on a device where you are already logged in to Vinaris.",
    passkeyHelpPrerequisiteBrowser: "Use a recent browser that supports passkeys, such as current Safari, Chrome, Edge, or Firefox.",
    passkeyHelpPrerequisiteDevice: "Your device must have a screen lock configured: Face ID, Touch ID, fingerprint, PIN, or another secure unlock method.",
    passkeyHelpPrerequisiteSync: "To use it on more than one device, the passkey must be synced through your Apple, Google, or Microsoft account, or saved on a password manager that supports passkeys.",
    passkeyHelpPrerequisitesTitle: "Prerequisites",
    passkeyHelpTitle: "Passwordless login",
    passkeyLogin: "Login with passkey",
    passkeyName: "Passkey name",
    passkeys: "Passkeys",
    pastWindow: "Past window",
    pendingInvites: "Pending invites",
    pendingApproval: "Account pending approval",
    pendingApprovalHelp: "Your account was created, but it must be approved by an administrator before login.",
    pendingEmailVerification: "A confirmation email is on the way",
    pendingEmailVerificationHelp: "You will receive an email shortly. Open the confirmation link to activate your account before signing in. It can take up to a minute to arrive; also check your spam folder if you do not see it.",
    emailVerificationReady: "Email confirmation ready",
    emailVerificationReadyHelp: "Confirm this email address now to activate your account. This prevents automatic email scanners from activating accounts.",
    confirmEmail: "Confirm email",
    emailVerificationSuccess: "Email confirmed. You can now sign in.",
    emailVerificationExpired: "Email confirmation link expired. Register again or contact support.",
    emailVerificationInvalid: "Email confirmation link is invalid.",
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
    settingsSharing: "Cellars",
    settingsTags: "Tags",
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
    themePrivateCellar: "Private cellar",
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
    bottlesByType: "Bottles by type",
    bottlesByRegion: "Bottles by region",
    winesByRegion: "Wines by region",
    chartDrilldown: "Chart detail",
    openFilteredCellar: "Open filtered cellar",
    topWines: "Top wines",
    topProducers: "Top producers",
    averageBottleValue: "Average bottle value",
    distinctWines: "Distinct wines",
    noDrilldownWines: "No wines in this segment",
    totalValue: "Total value",
    type: "Type",
    typesLabel: "Types",
    regionsLabel: "Regions",
    updatedItems: "updated",
    value: "Value",
    valueFocus: "Value",
    valueByType: "Value by type",
    valueOlderThanDays: "Value older than days",
    valueToRefresh: "Value to refresh",
    viewerReadOnly: "Viewer access: you can read this cellar, but cannot change wines.",
    vintage: "Vintage",
    vintageHelp: "For cuvées use MV for multi vintage, or NV if the vintage is unknown.",
    wineDetail: "Wine detail",
    wines: "Wines",
    wishlist: "Wishlist",
    wishlistDetail: "Wishlist detail",
    wishlistItems: "Wishlist items",
    exportData: "Export data",
    exportJson: "Export JSON",
    exportFullCellarHelp: "Today export can include the full cellar backup. Choose which blocks to include before downloading the JSON.",
    exportHistoryIncluded: "Tasting history is stored inside wines and is included when Wines is selected.",
    exportIncludesWines: "Wines",
    exportIncludesWishlist: "Wishlist",
    exportIncludesMembers: "Members",
    exportIncludesInvites: "Invites",
    exportIncludesShareOffers: "Shared positions",
    exportIncludesTags: "My tags",
    exportIncludesAiAudit: "AI audit",
    members: "Members",
    invites: "Invites",
    exportSensitiveNote: "Passwords, API keys, billing secrets, sessions and passkeys are never exported.",
    generatedCode: "Generated code",
    paidRedeemCode: "Paid redeem code",
    trialRedeemCode: "Trial redeem code",
    trialRedeemCodeDuration: "Trial duration",
    useTrialRedeemCodeNow: "Use this code now",
    trialRedeemCodeHelp: "Copy or redeem the trial access code below before choosing a paid plan.",
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
    addWishlist: "Aggiungi a wishlist",
    recognizeWine: "Riconosci da foto",
    recognizingWine: "Riconoscimento...",
    choosePhotoFile: "Scegli file",
    takeLabelPhoto: "Scatta foto etichetta",
    recognitionBetaNotice: "Servizio in beta test. I risultati sotto il 75% di confidenza vengono ignorati.",
    recognitionSuggestions: "Suggerimenti riconoscimento",
    recognitionNoMatch: "Nessuna corrispondenza nel catalogo. Applica un suggerimento e il catalogo potrà essere arricchito.",
    labelRecognitionAccess: "Riconoscimento etichette",
    labelRecognitionEnabled: "Riconoscimento etichette attivo",
    labelRecognitionDisabled: "Riconoscimento etichette disattivo",
    searchWineDataWithAi: "Cerca dati vino con AI",
    searchWineDataWithAiHelp: "Nessuna corrispondenza esatta nel catalogo. Usa l'AI per compilare produttore, regione, denominazione, tipo e annata dal nome inserito.",
    pendingCatalogEntries: "Vini in catalogo da approvare",
    approveCatalogEntry: "Approva entry catalogo",
    rejectCatalogEntry: "Rifiuta entry catalogo",
    noPendingCatalogEntries: "Nessuna entry catalogo da approvare",
    catalogAdminSearch: "Cerca entry catalogo",
    catalogAdminSearchHelp: "Cerca entry attive e pending per nome, produttore, regione o alias.",
    deleteCatalogEntry: "Elimina entry catalogo",
    noCatalogAdminResults: "Nessuna entry catalogo trovata",
    useSuggestion: "Usa suggerimento",
    aiNotes: "Note AI",
    aiProvider: "Sorgente AI",
    aiProviderAuto: "Automatica",
    aiProviderUserKey: "Mia chiave OpenAI",
    aiProviderCredits: "Vinaris AI Pack",
    aiCredits: "AI Pack",
    aiCreditBalance: "Budget AI",
    targetAiCreditBalance: "Saldo AI finale (USD)",
    aiCreditAdminNote: "Nota o motivo del regalo",
    saveAiCreditBalance: "Aggiorna budget AI",
    aiCreditAdminHelp: "Imposta il saldo AI finale per questo utente. Vinaris registra solo l'aggiustamento necessario per arrivare a quel valore.",
    aiBudgetUsage: "Consumo",
    aiCreditsHelp: "Se non configuri una tua chiave OpenAI, Vinaris può usare un AI Pack gestito dall'app e acquistato tramite Stripe. Questo budget viene scalato internamente in base al consumo AI stimato.",
    buyAiCredits: "Acquista AI Pack",
    noAiProvider: "Nessuna sorgente AI disponibile",
    appAiReady: "AI app pronta",
    appAiKeyMissing: "Chiave AI app mancante",
    saveAiSourceHint: "Salva le impostazioni AI per applicare la sorgente selezionata.",
    searchTags: "Cerca tag",
    searchGrapes: "Cerca uve",
    aiPurpose: "Scopo AI",
    aiReadiness: "Prontezza AI",
    aiReadinessHelp: "Vini con note AI o note valore. I dati mancanti sopra sono i primi candidati per l'arricchimento AI.",
    aiAudit: "Audit AI",
    showLatest: "Mostra ultime",
    auditDateFrom: "Da data",
    auditDateTo: "A data",
    auditResetFilters: "Azzera filtri",
    auditResultsCount: "azioni trovate",
    aiSettings: "Impostazioni AI",
    aiStrategy: "Strategia AI",
    wishlistPortfolioStrategy: "Strategia d'acquisto wishlist",
    wishlistPortfolioStrategyHelp: "Valuta l'intera wishlist come portafoglio da collezionista e capisci cosa prioritizzare ora rispetto a cosa monitorare.",
    wishlistList: "Lista wishlist",
    wishlistLists: "Wishlist",
    createWishlistList: "Nuova lista",
    renameWishlistList: "Rinomina lista",
    deleteWishlistList: "Elimina lista",
    wishlistListName: "Nome lista",
    wishlistListDeleteHelp: "Gli elementi presenti verranno eliminati insieme alla lista.",
    generateWishlistPortfolioStrategy: "Genera strategia d'acquisto",
    refreshWishlistPortfolioStrategy: "Aggiorna strategia d'acquisto",
    noWishlistPortfolioStrategy: "Nessuna strategia d'acquisto complessiva generata finora.",
    generatedAt: "Generata",
    wishlistStrategyOverview: "Quadro generale",
    wishlistStrategyBuyNow: "Da comprare ora",
    wishlistStrategyWaitWatch: "Attendere / monitorare",
    wishlistStrategyAllocation: "Allocazione capitale",
    wishlistStrategyNextStep: "Prossimo passo",
    aiMarketPrice: "Prezzo mercato AI",
    aiTargetPrice: "Prezzo mercato AI",
    marketValueView: "Valore di mercato",
    viewMarketSources: "Vedi fonti mercato",
    averageMarketPrice: "Prezzo medio di mercato",
    marketSources: "Fonti",
    webSources: "Fonti web verificate",
    marketSourcesUnavailable: "Nessuna fonte di mercato disponibile per questa stima.",
    marketAvailability: "Nota mercato",
    close: "Chiudi",
    backToTop: "Torna in cima",
    winesLabel: "vini",
    groupedByColor: "Raggruppati per colore",
    aiContextNote: "Nota contesto AI",
    aiContextNoteHelp: "Nota opzionale usata dall'AI come contesto aggiuntivo per strategia, scopo e prezzo di mercato della wishlist.",
    aiUsage: "Uso AI",
    allTime: "Totale",
    allBottles: "Tutte le bottiglie",
    allStatuses: "Tutti gli stati",
    allTags: "Tutti i tag",
    allTypes: "Tutti i tipi",
    bottlePrice: "Prezzo bottiglia",
    minPrice: "Prezzo min",
    maxPrice: "Prezzo max",
    appellation: "Denominazione",
    billing: "Gestione iscrizione",
    buyAccess: "Paga con carta",
    buyAnnual: "Acquista abbonamento annuale",
    buyMonthly: "Acquista abbonamento mensile",
    resetPriceRange: "Reset",
    bottles: "Bottiglie",
    cancel: "Annulla",
    cellar: "Cantina",
    cellarName: "Nome cantina",
    createCellar: "Crea cantina",
    createCellarHelp: "Crea una cantina separata per un'altra collezione, luogo o progetto. Dopo la creazione passerai subito a quella nuova.",
    deleteCellar: "Elimina cantina",
    deleteCellarHelp: "Elimina questa cantina con tutti i suoi vini, wishlist, condivisioni, inviti e audit AI. Ogni membro deve già avere almeno un'altra cantina.",
    deleteCellarConfirm: "Eliminare definitivamente questa cantina? Tutti i dati contenuti verranno rimossi.",
    deleteCellarTypeName: "Scrivi il nome della cantina per confermare",
    deleteCellarMismatch: "Il nome inserito non corrisponde alla cantina attiva.",
    renameCellar: "Rinomina cantina",
    clearFilters: "Pulisci filtri",
    convert: "Converti",
    compare: "Confronta",
    compareSelection: "Confronto vini",
    compareSelected: "Selezionati per confronto",
    openCompare: "Apri confronto",
    clearCompare: "Pulisci confronto",
    compareLimit: "Puoi confrontare al massimo 4 vini.",
    compareNeedTwo: "Seleziona almeno 2 vini per confrontarli.",
    aiCompare: "Confronto AI",
    aiCompareOnlyTwo: "Il confronto AI è disponibile per 2 vini.",
    aiRequestCost: "Costo richiesta AI",
    styleProfile: "Stile e profilo",
    compareReadiness: "Prontezza",
    compareOccasion: "Occasione ideale",
    compareCellarValue: "Cantina e valore",
    compareVerdict: "Verdetto",
    create: "Crea",
    createAccount: "Crea account",
    confirmPassword: "Conferma password",
    finalBetaPromo: "Promo beta finale",
    promoNote: "Prezzi promozionali durante la beta finale. Chi entra ora blocca la tariffa di lancio mentre la piattaforma viene ancora rifinita.",
    registerPromoHelp: "I prezzi attuali sono promozionali durante la beta finale.",
    promoMonthlyPrice: "Promo accesso mensile: CHF 6 / mese.",
    promoAnnualPrice: "Promo accesso annuale: CHF 60 / anno.",
    createInvite: "Crea invito",
    createRedeemCode: "Crea codice redeem",
    consumeBottle: "Bevuta 1",
    consumeBottleHelp: "Scala di una bottiglia la cantina e registra i dati di degustazione nello storico.",
    tastingHistory: "Storico degustazioni",
    tastingDate: "Data degustazione",
    tastingNote: "Nota degustazione",
    tastingOccasion: "Occasione",
    tastingPairing: "Abbinamento",
    tastingCompanions: "Con chi",
    tastingRating: "Voto degustazione",
    saveTasting: "Salva degustazione",
    noTastingHistory: "Nessuna degustazione registrata.",
    historyTastings: "Bottiglie bevute",
    historyArchivedWines: "Vini archiviati",
    latestConsumedBottles: "Ultime bottiglie bevute",
    tastingEntries: "Degustazioni",
    ratedTastings: "Degustazioni valutate",
    tastingNotesSaved: "Note degustazione salvate",
    latestTasted: "Ultima degustazione",
    showingResults: "Visualizzati",
    previousPage: "Precedente",
    nextPage: "Successivo",
    noTastingArchiveMatch: "Nessuna bottiglia bevuta corrisponde ai filtri",
    critic: "Critico",
    grapeName: "Uva",
    fromPercent: "Da %",
    toPercent: "A %",
    configured: "Configurata",
    contactSupport: "Contatta supporto",
    contactSupportHelp: "Usa questo modulo se hai problemi con accesso, pagamenti, inviti o dati.",
    createWine: "Crea vino",
    createWishlist: "Aggiungi vino",
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
    operationalActions: "Azioni operative",
    operationalActionsHelp: "Interventi che richiedono una decisione o un dato da completare.",
    showActions: "Mostra",
    hideActions: "Nascondi",
    snoozeAction: "Nascondi 14 giorni",
    openWishlistActions: "Apri azioni wishlist",
    priorityActions: "Azioni prioritarie",
    openWine: "Apri vino",
    noActionItems: "Nessuna azione urgente",
    atRiskWines: "A rischio",
    upcomingDeliveries: "Consegne in arrivo",
    incompleteData: "Dati incompleti",
    maturityMap: "Mappa maturita",
    peakNow: "Al picco ora",
    valueByProducer: "Valore per produttore",
    investedMore: "Dove hai investito di più",
    keyPosition: "Posizione chiave",
    action: "Azione",
    hold: "Tenere",
    monitor: "Monitorare",
    completeData: "Completa dati",
    collectorFocus: "Focus collezionista",
    cellarSnapshot: "Sintesi cantina",
    cellarStats: "Statistiche cantina",
    household: "Cantina condivisa",
    importLegacy: "Importa backup JSON",
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
    importSupports: "Supporta export Vinaris e JSON legacy WineCellar.",
    importSelection: "Selezione import",
    importSelectionHelp: "Scegli quali blocchi ripristinare. Membri, inviti e posizioni condivise possono dare ad altri utenti accesso a questa cantina.",
    idealWindow: "Periodo ideale",
    emptyCellar: "Svuota cantina",
    emptyCellarWarning: "Cancella tutti i vini e gli elementi wishlist della cantina attiva.",
    inviteLink: "Link invito",
    inviteLinkDetected: "Link invito rilevato",
    inviteLinkHelp: "Accedi o crea un account con l'email invitata, poi accetta l'invito.",
    inviteMember: "Invita membro",
    inviteToken: "Token invito",
    visibility: "Visibilità",
    visibilityAll: "Tutti i vini",
    visibilityShared: "Solo posizioni condivise",
    language: "Lingua",
    loadingData: "Caricamento dati",
    login: "Accesso",
    redeemRequired: "Serve un codice redeem valido per usare l'applicativo.",
    paymentHelp: "Paga in modo sicuro con Stripe per attivare il periodo di servizio.",
    passwordMismatch: "Le password non coincidono",
    logout: "Esci",
    merchant: "Commerciante",
    message: "Messaggio",
    manageSubscription: "Gestisci abbonamento",
    markRead: "Segna letta",
    multiOwnership: "Multiproprietà",
    missingDrinkWindow: "Finestra mancante",
    missingGrapes: "Uve mancanti",
    missingScores: "Punteggi mancanti",
    missingValue: "Valore mancante",
    myBottles: "Mie bottiglie",
    name: "Nome",
    noInvites: "Nessun invito",
    noNotifications: "Nessuna notifica",
    entitlementValidity: "Validità servizio",
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
    ownership: "Proprietà",
    pairing: "Abbinamento",
    pairingCellarMatches: "Dalla tua cantina",
    pairingDish: "Piatto o pietanza",
    pairingMaxPrice: "Budget massimo (CHF)",
    pairingMaxPriceHelp: "Facoltativo. Usalo quando vuoi un buon abbinamento entro una soglia di spesa, non per forza la bottiglia migliore in assoluto.",
    pairingNoBudget: "Nessun limite",
    pairingPreferences: "I miei gusti per gli abbinamenti",
    pairingPreferencesHelp: "Descrivi una volta le tue preferenze e Vinaris le userà di default negli abbinamenti.",
    pairingPreferencesPlaceholder: "Es. Preferisco vini freschi e precisi, poco legno, poca dolcezza ed evito tannini aggressivi con piatti speziati.",
    pairingIgnorePreferences: "Ignora i miei gusti per questa richiesta",
    pairingLocalHelp: "Quando la modalita ristorante e attiva, chiedi all'AI di privilegiare bottiglie del luogo in cui ti trovi.",
    pairingLocalOrigin: "Dove ti trovi?",
    pairingLocalOriginHelp: "Inserisci una regione, zona, citta o nazione. Esempio: Toscana, Piemonte, Borgogna, Svizzera.",
    pairingPreferLocal: "Prediligi vini locali",
    savePairingPreferences: "Salva gusti",
    pairingEmptyDish: "Inserisci prima un piatto.",
    pairingIncludeMarket: "Mostra anche 2 proposte fuori cantina",
    pairingMarketFallback: "Bottiglie suggerite da acquistare",
    pairingMarketOnly: "Sono al ristorante: ignora la mia cantina",
    pairingModelUsed: "Modello usato",
    pairingWithinBudget: "Entro budget",
    pairingAboveBudget: "Fuori budget, eccezione",
    pairingBestValue: "Miglior valore",
    pairingNoCellarMatch: "Nessuna bottiglia ideale trovata in cantina.",
    pairingPlaceholder: "Es. risotto ai funghi, brasato, sushi",
    pairingSubmit: "Trova abbinamento",
    pairingWhy: "Perché",
    password: "Password",
    passkey: "Passkey",
    passkeyHelpBody: "Una passkey ti permette di accedere senza digitare la password. Al suo posto, il tuo dispositivo conferma che sei davvero tu usando Face ID, impronta, PIN del telefono o lo sblocco schermo che usi gia ogni giorno.",
    passkeyHelpLabel: "Cos'e una passkey?",
    passkeyHelpPrerequisiteAccount: "Devi creare la passkey da un dispositivo su cui sei gia autenticato in Vinaris.",
    passkeyHelpPrerequisiteBrowser: "Serve un browser recente che supporti le passkey, ad esempio Safari, Chrome, Edge o Firefox aggiornati.",
    passkeyHelpPrerequisiteDevice: "Il dispositivo deve avere uno sblocco schermo configurato: Face ID, Touch ID, impronta, PIN o un altro metodo sicuro.",
    passkeyHelpPrerequisiteSync: "Per usarla su piu dispositivi, la passkey deve essere sincronizzata tramite account Apple, Google o Microsoft, oppure salvata in un password manager compatibile.",
    passkeyHelpPrerequisitesTitle: "Prerequisiti",
    passkeyHelpTitle: "Accesso senza password",
    passkeyLogin: "Accedi con passkey",
    passkeyName: "Nome passkey",
    passkeys: "Passkey",
    pastWindow: "Finestra scaduta",
    pendingInvites: "Inviti pendenti",
    pendingApproval: "Account in attesa di approvazione",
    pendingApprovalHelp: "Il tuo account è stato creato, ma deve essere approvato da un amministratore prima dell'accesso.",
    pendingEmailVerification: "A breve riceverai un'email",
    pendingEmailVerificationHelp: "Il tuo account è stato creato. Apri il link di conferma che riceverai via email per attivarlo prima di accedere. L'email può impiegare fino a un minuto ad arrivare; se non la vedi, controlla anche la cartella spam.",
    emailVerificationReady: "Conferma email pronta",
    emailVerificationReadyHelp: "Conferma ora questo indirizzo email per attivare l'account. Questo evita che gli scanner automatici delle email attivino account al posto tuo.",
    confirmEmail: "Conferma email",
    emailVerificationSuccess: "Email confermata. Ora puoi accedere.",
    emailVerificationExpired: "Il link di conferma email è scaduto. Registrati di nuovo o contatta il supporto.",
    emailVerificationInvalid: "Il link di conferma email non è valido.",
    pendingUsers: "Utenti in attesa di approvazione",
    redeem: "Riscatta",
    redeemCode: "Codice redeem",
    redeemCodes: "Codici redeem",
    redeemed: "Riscattati",
    notifications: "Notifiche",
    reviewUsers: "Rivedi utenti",
    personalSettings: "Impostazioni personali",
    profileSection: "Profilo",
    priority: "Priorità",
    probableDuplicates: "duplicati probabili",
    producer: "Produttore",
    purchasePrice: "Prezzo acquisto",
    purpose: "Scopo",
    quantity: "Quantità",
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
    settingsSharing: "Cantine",
    settingsTags: "Tag",
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
    themePrivateCellar: "Cantina privata",
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
    bottlesByType: "Bottiglie per tipo",
    bottlesByRegion: "Bottiglie per regione",
    winesByRegion: "Vini per regione",
    chartDrilldown: "Dettaglio grafico",
    openFilteredCellar: "Apri cantina filtrata",
    topWines: "Top vini",
    topProducers: "Top produttori",
    averageBottleValue: "Valore medio bottiglia",
    distinctWines: "Vini distinti",
    noDrilldownWines: "Nessun vino in questo segmento",
    totalValue: "Valore totale",
    type: "Tipo",
    typesLabel: "Tipi",
    regionsLabel: "Regioni",
    updatedItems: "aggiornati",
    value: "Valore",
    valueFocus: "Valore",
    valueByType: "Valore per tipo",
    valueOlderThanDays: "Valore più vecchio di giorni",
    valueToRefresh: "Valori da aggiornare",
    viewerReadOnly: "Accesso viewer: puoi leggere questa cantina, ma non modificare i vini.",
    vintage: "Annata",
    vintageHelp: "Per le cuvée usa MV per multi vintage, oppure NV se l'annata non è nota.",
    wineDetail: "Dettaglio vino",
    wines: "Vini",
    wishlist: "Wishlist",
    wishlistDetail: "Dettaglio wishlist",
    wishlistItems: "Elementi wishlist",
    exportData: "Esportazione dati",
    exportJson: "Esporta JSON",
    exportFullCellarHelp: "Ora l'export può includere il backup completo della cantina. Scegli quali blocchi inserire prima di scaricare il JSON.",
    exportHistoryIncluded: "Lo storico degustazioni è salvato dentro i vini ed è incluso quando selezioni Vini.",
    exportIncludesWines: "Vini",
    exportIncludesWishlist: "Wishlist",
    exportIncludesMembers: "Membri",
    exportIncludesInvites: "Inviti",
    exportIncludesShareOffers: "Posizioni condivise",
    exportIncludesTags: "Miei tag",
    exportIncludesAiAudit: "Audit AI",
    members: "Membri",
    invites: "Inviti",
    exportSensitiveNote: "Password, chiavi API, segreti billing, sessioni e passkey non vengono mai esportati.",
    generatedCode: "Codice generato",
    paidRedeemCode: "Codice redeem acquistato",
    trialRedeemCode: "Codice trial",
    trialRedeemCodeDuration: "Durata trial",
    useTrialRedeemCodeNow: "Usa subito questo codice",
    trialRedeemCodeHelp: "Copia o riscatta prima il codice di accesso trial qui sotto, poi valuta un piano a pagamento.",
    working: "Elaborazione",
    youngWine: "Giovane",
    estimatedCost: "Costo stimato",
    sharedCellar: "Cantina condivisa",
    sharedBottles: "Condivise",
    sharePct: "Quota %",
    shareWine: "Invia comproprietà",
    shareWineHelp: "Il destinatario deve essere già registrato. Le posizioni accettate entrano nella sua cantina.",
    pendingShareOffers: "Proposte di comproprietà",
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
  { value: "private-cellar", label: "themePrivateCellar" },
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
      "Bottle (1L)": "Bottiglia (1L)",
      "Half bottle (375ml)": "Mezza bottiglia (375ml)",
      "Magnum (1.5L)": "Magnum (1.5L)",
      "Double Magnum (3L)": "Doppio Magnum (3L)",
      "Jeroboam (3L)": "Jeroboam (3L)",
      "Rehoboam (4.5L)": "Rehoboam (4.5L)",
      "Methuselah (6L)": "Mathusalem (6L)",
      "Imperial (6L)": "Imperial (6L)",
      "Salmanazar (9L)": "Salmanazar (9L)",
      "Balthazar (12L)": "Balthazar (12L)",
      "Nebuchadnezzar (15L)": "Nabucodonosor (15L)",
      "Melchior (18L)": "Melchior (18L)",
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
      "To Collect": "Da ritirare",
      Delivered: "Consegnato",
      Consumed: "Bevuto",
      Cancelled: "Annullato",
      Evaluate: "Valutare",
      Monitor: "Monitorare",
      Buy: "Comprare",
      GoodPrice: "Buon prezzo",
      Skipped: "Scartato",
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
      Invest: "Investimento",
      Investment: "Investimento",
      Compare: "Confronto",
      Other: "Altro",
    },
  },
};

const canonicalWineFormats = [
  "Half bottle (375ml)",
  "Bottle (750ml)",
  "Bottle (1L)",
  "Magnum (1.5L)",
  "Jeroboam (3L)",
  "Rehoboam (4.5L)",
  "Methuselah (6L)",
  "Salmanazar (9L)",
  "Balthazar (12L)",
  "Nebuchadnezzar (15L)",
  "Melchior (18L)",
  "Imperial (6L)",
] as const;

const canonicalWineTypes = ["Red", "White", "Rose", "Sparkling", "Sweet", "Fortified", "Other"] as const;
const canonicalWishlistPriorities = ["High", "Medium", "Low"] as const;
const canonicalWishlistPurposes = ["Drink", "Cellar", "Invest", "Gift", "Compare"] as const;
const canonicalWishlistStatuses = ["Evaluate", "Monitor", "Buy", "GoodPrice", "Skipped"] as const;

function normalizeWineType(value: string | null | undefined) {
  const trimmed = (value || "").trim();
  if (!trimmed) return "";
  const normalized = trimmed
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
  if (["red", "rosso"].includes(normalized) || normalized.includes("vino rosso")) return "Red";
  if (["white", "bianco"].includes(normalized) || normalized.includes("vino bianco")) return "White";
  if (["rose", "rosato"].includes(normalized)) return "Rose";
  if (["sparkling", "spumante", "champagne"].includes(normalized)) return "Sparkling";
  if (["sweet", "dolce"].includes(normalized)) return "Sweet";
  if (["fortified", "fortificato"].includes(normalized)) return "Fortified";
  if (["other", "altro"].includes(normalized)) return "Other";
  const canonical = canonicalWineTypes.find((type) => type.toLowerCase() === normalized);
  return canonical || trimmed;
}

function selectOptionsWithCurrent(currentValue: string, canonicalOptions: readonly string[]) {
  const trimmedCurrentValue = currentValue.trim();
  return trimmedCurrentValue && !canonicalOptions.includes(trimmedCurrentValue)
    ? [trimmedCurrentValue, ...canonicalOptions]
    : [...canonicalOptions];
}

function wineFormatOptions(currentFormat: string) {
  const trimmedCurrentFormat = currentFormat.trim();
  return trimmedCurrentFormat && !canonicalWineFormats.includes(trimmedCurrentFormat as (typeof canonicalWineFormats)[number])
    ? [trimmedCurrentFormat, ...canonicalWineFormats]
    : [...canonicalWineFormats];
}

function wineTypeSelectOptions(currentType: string) {
  const normalizedCurrentType = normalizeWineType(currentType);
  return normalizedCurrentType && !canonicalWineTypes.includes(normalizedCurrentType as (typeof canonicalWineTypes)[number])
    ? [normalizedCurrentType, ...canonicalWineTypes]
    : [...canonicalWineTypes];
}

function wishlistPrioritySelectOptions(currentPriority: string) {
  return selectOptionsWithCurrent(currentPriority, canonicalWishlistPriorities);
}

function wishlistPurposeSelectOptions(currentPurpose: string) {
  return selectOptionsWithCurrent(currentPurpose, canonicalWishlistPurposes);
}

function wishlistStatusSelectOptions(currentStatus: string) {
  return selectOptionsWithCurrent(currentStatus, canonicalWishlistStatuses);
}

function displayValue(value: string | null | undefined, locale: Locale, group: string) {
  if (!value) return "";
  const displaySource = group === "type" ? normalizeWineType(value) : value;
  return localizedDisplayValues[locale]?.[group]?.[displaySource] || displaySource;
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
  grapes: [],
  scores: [],
};

const emptyAuthDraft: AuthDraft = {
  email: "",
  display_name: "",
  household_name: "Main Cellar",
  password: "",
  password_confirm: "",
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
      founderSupport: string;
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
      features: Array<{ title: string; body: string; highlight?: boolean; ai?: boolean }>;
  }
> = {
  en: {
    headline: "Manage your wine collection like a professional.",
    subheadline: "Know what you own, what it is worth, and what deserves attention next.",
    description:
      "Vinaris is a private cellar intelligence platform for collectors who want discipline, memory, and sharper decisions around bottles that matter.",
    primaryCta: "Login",
    secondaryCta: "Create account",
    storyEyebrow: "Private Cellar Intelligence",
    storyTitle: "Finally, a place to manage a wine collection seriously.",
    storyBody:
      "Vinaris was designed around the real collector workflow: what is ready, what is appreciating, what needs monitoring, what is still arriving, and what deserves a place in the long memory of the cellar.",
     founderQuote:
        "I built Vinaris because I wanted a cellar app that thinks like a collector: structured, calm, and genuinely useful when decisions matter.",
      founderSupport:
        "It is meant to help collectors move from instinct and scattered notes to a clearer routine: what to drink, what to buy, what to wait on, and what to remember after the bottle is gone.",
     founderName: "Omar Bariffi",
     founderRole: "Founder, collector, and product promoter",
    principlesTitle: "Built around practical collector decisions",
    principles: [
      {
        title: "Decision first",
        body: "The interface surfaces what matters now: cellar value, wines at peak, bottles to watch, and deliveries still pending.",
      },
      {
        title: "A collection, not a record list",
        body: "Bottles, vintages, shared positions, value history, tasting memory, and buying intent are treated as pieces of one collector system.",
      },
        {
          title: "Analysis behind the scenes",
          body: "Market analysis, buying strategy, and pairings can work in the background through a personal key or AI Pack, without turning the product into an AI showcase.",
        },
    ],
    collectorTitle: "Collector edition",
    collectorBody:
      "For collectors with 20 to 1000+ bottles who want a private, structured, and decision-oriented view of the cellar.",
    pricesTitle: "Simple pricing",
    monthlyLabel: "CHF 6 / month",
    annualLabel: "CHF 60 / year",
    savingsNote: "Annual plan saves CHF 12 compared with monthly billing.",
    features: [
      {
        title: "Build a serious cellar record",
        body: "Track producers, vintages, formats, delivery status, shared ownership, and personal notes in one coherent archive.",
      },
        {
          title: "Monitor drinking windows",
          body: "See which wines are still too young, which are peaking now, and which bottles need quicker decisions.",
          ai: true,
        },
        {
          title: "Read the market around the cellar",
          body: "Follow purchase price, current value, and price history so the cellar feels managed, not guessed.",
          ai: true,
        },
      {
        title: "Stay on top of futures and deliveries",
        body: "Manage ordered and en primeur wines, expected arrivals, and delivery timelines without losing track of capital already committed.",
      },
      {
        title: "Preserve a tasting archive",
        body: "When a bottle is gone, keep the note, score, value trail, and occasion in a lasting cellar memory.",
      },
        {
          title: "Keep a disciplined wishlist",
          body: "Capture target bottles, price goals, buying priorities, and move quickly from idea to cellar position when the time is right.",
          ai: true,
        },
        {
          title: "Decide what to open next",
          body: "Use readiness views, filters, pairings, and market context to choose what to drink now, what to hold, and what deserves patience.",
          ai: true,
        },
        {
          title: "Ask an AI sommelier for pairings",
          body: "Enter a dish and Vinaris can suggest the best bottles from your cellar, or propose market alternatives when you are planning a dinner or choosing at a restaurant.",
          ai: true,
        },
        {
          title: "Market analysis, buying strategy, and pairings when you need them",
          body: "Vinaris can work with your own OpenAI key or an in-app AI Pack to enrich pricing, strategy, drinking windows, and pairings. The analysis stays behind the scenes so the experience remains calm, collector-focused, and useful.",
          highlight: true,
        },
    ],
  },
  it: {
    headline: "Gestisci la tua collezione come un professionista.",
    subheadline: "Sapere cosa possiedi, quanto vale e che cosa merita attenzione cambia il modo di collezionare.",
    description:
      "Vinaris è una piattaforma di private cellar intelligence per collezionisti che vogliono disciplina, memoria e decisioni più lucide sulle bottiglie che contano.",
    primaryCta: "Accedi",
    secondaryCta: "Crea account",
    storyEyebrow: "Private Cellar Intelligence",
    storyTitle: "Finalmente un posto dove gestire seriamente la propria collezione di vino.",
    storyBody:
      "Vinaris nasce da un flusso reale da collezionista: che cosa è pronto, che cosa si sta rivalutando, che cosa va monitorato, che cosa deve ancora arrivare e che cosa merita di restare nella memoria lunga della cantina.",
     founderQuote:
        "Ho creato Vinaris perché volevo un'app di cantina che ragionasse da collezionista: strutturata, sobria e davvero utile quando bisogna decidere.",
      founderSupport:
        "L'idea è trasformare memoria, intuito e fogli sparsi in un rito più chiaro: capire cosa bere, cosa comprare, cosa aspettare e che cosa vale la pena ricordare anche dopo l'ultima bottiglia.",
     founderName: "Omar Bariffi",
     founderRole: "Fondatore, collezionista e promotore dell'applicazione",
    principlesTitle: "Progettato intorno a decisioni reali da collezionista",
    principles: [
      {
        title: "Prima la decisione",
        body: "L'interfaccia mette in evidenza valore cantina, vini al picco, bottiglie da monitorare e consegne in sospeso.",
      },
      {
        title: "Una collezione, non un elenco",
          body: "Bottiglie, annate, quote condivise, storico valori, memoria degustativa e intenzioni di acquisto vivono nello stesso sistema da collezionista.",
      },
        {
          title: "Analisi dietro le quinte",
          body: "Analisi mercato, strategia di acquisto e abbinamenti possono lavorare in background con chiave personale o AI Pack, senza trasformare il prodotto in una vetrina sull'AI.",
        },
    ],
    collectorTitle: "Collector edition",
    collectorBody:
      "Pensato per collezionisti con 20 fino a oltre 1000 bottiglie che vogliono una visione privata, strutturata e decisionale della propria cantina.",
    pricesTitle: "Prezzi semplici",
    monthlyLabel: "CHF 6 / mese",
    annualLabel: "CHF 60 / anno",
    savingsNote: "Il piano annuale ti fa risparmiare CHF 12 rispetto al mensile.",
    features: [
      {
        title: "Costruire un archivio di cantina serio",
        body: "Registra produttori, annate, formati, stato consegna, multiproprietà e note personali in un archivio coerente.",
      },
        {
          title: "Monitorare la finestra di beva",
          body: "Capisci subito quali vini sono ancora troppo giovani, quali sono al picco e quali chiedono decisioni più rapide.",
          ai: true,
        },
        {
          title: "Leggere il mercato intorno alla cantina",
          body: "Controlla prezzo di acquisto, valore attuale e storico così la cantina viene gestita, non intuita.",
          ai: true,
        },
      {
        title: "Tenere sotto controllo futures e consegne",
        body: "Organizza vini ordinati ed en primeur, arrivi attesi e timeline delle consegne senza perdere di vista il capitale già impegnato.",
      },
      {
        title: "Conservare uno storico degustativo",
        body: "Quando una bottiglia finisce, conserva nota, punteggio, traccia di valore e occasione in una memoria durevole della cantina.",
      },
        {
          title: "Tenere una wishlist disciplinata",
          body: "Salva bottiglie target, obiettivi di prezzo, priorità di acquisto e passa velocemente dall'idea alla cantina quando serve.",
          ai: true,
        },
        {
          title: "Decidere cosa bere",
          body: "Usa viste di prontezza, filtri, abbinamenti e contesto di mercato per capire cosa aprire adesso, che cosa lasciare in cantina e dove conviene avere pazienza.",
          ai: true,
        },
        {
          title: "Chiedere abbinamenti a un sommelier AI",
          body: "Inserisci un piatto e Vinaris può suggerire le bottiglie più adatte dalla tua cantina, oppure proporre alternative di mercato quando organizzi una cena o scegli al ristorante.",
          ai: true,
        },
        {
          title: "Analisi mercato, strategia di acquisto e abbinamenti quando servono",
          body: "Vinaris può lavorare con la tua chiave OpenAI oppure con un AI Pack in-app per arricchire prezzi, strategia, finestre di beva e abbinamenti. L'analisi resta dietro le quinte, così l'esperienza rimane sobria, utile e da collezionista.",
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
      "This guide is designed as a practical operating manual for collectors. Start with setup, then use the later sections as a working reference for cellar routines, buying decisions, AI, and shared workflows.",
    sections: [
      {
        title: "1. Start with your cellar",
        body: "The Cellar view is where your real collection lives. Add delivered bottles first, then ordered bottles, future deliveries, and shared positions.",
        bullets: [
          "Use Add wine to register producer, vintage, quantity, bottle format, status, and purchase price.",
          "Vintage supports classic years plus NV or MV for non-vintage cuvees.",
          "For shared bottles, define ownership and percentages directly in the wine record.",
          "If you already have structured data, import it from Settings > Data.",
        ],
      },
      {
        title: "2. Use the dashboard to decide what matters now",
        body: "Home is not just a summary. It is your operational screen for drinking decisions, upcoming deliveries, and data cleanup.",
        bullets: [
          "Collector focus shows priority actions, risky wines, key position, deliveries, and missing data.",
          "Timeline helps you track futures and expected arrivals over time.",
          "Value and data views help you spot concentration, missing fields, and stale pricing faster.",
        ],
      },
      {
        title: "3. Build a buying workflow with Wishlist",
        body: "Wishlist keeps future purchases separate from the active cellar until you are ready to convert them into real positions.",
        bullets: [
          "Create multiple wishlist lists when you want to separate themes such as reds, Champagne, restaurant buys, or short-term opportunities.",
          "Add target prices, priority, purpose, merchant notes, and optional AI context notes.",
          "Use AI suggestions, if configured, to refine buying strategy, purpose, and live market price.",
          "Convert wishlist items into cellar positions when you buy them, or delete a whole list knowing its items are deleted with it.",
        ],
      },
      {
        title: "4. Use wine details as your decision screen",
        body: "Open any wine to see the full card with value, drinking window, notes, ownership, grapes, scores, and value history.",
        bullets: [
          "The drinking window shows young, ideal, and past-window periods with the current year marker.",
          "Value evolution tracks the historical pricing points you record over time.",
          "Edit mode is the place to update scores, tags, grapes, quantities, format, and delivery state.",
        ],
      },
      {
        title: "5. Record consumption and preserve tasting memory",
        body: "When a bottle is consumed, Vinaris reduces the cellar quantity and stores the tasting information in History.",
        bullets: [
          "Use Bottle consumed from the wine detail to register date, note, occasion, pairing, companions, and tasting rating.",
          "Once the last bottle is gone, the wine moves out of the active cellar and remains available in History.",
          "History is your long-term tasting archive, not just a deleted-bottles list.",
          "Consumed entries can be edited later if you want to add details you forgot during the first tasting registration.",
        ],
      },
      {
        title: "6. Activate AI only if you want it",
        body: "Vinaris works without AI, but it becomes more powerful when you connect your own OpenAI key or use an in-app AI Pack.",
        bullets: [
          "AI can help with tasting notes, drinking windows, price checks, grapes, wishlist strategy, pairings, and direct wine comparisons.",
          "If you do not want to use your own key, buy an AI Pack directly in the app and let Vinaris handle the AI usage.",
          "Your own token is encrypted and stored securely, while AI Pack usage is tracked inside your account budget.",
          "All AI settings live in Settings > AI and remain under your control.",
        ],
      },
      {
        title: "7. Use the sommelier and comparison tools",
        body: "Vinaris is not only a cellar ledger. It also helps you decide what to open, what to buy, and how two bottles differ.",
        bullets: [
          "Pairing lets you enter a dish and ask the AI sommelier for the best matches from your cellar or from the market.",
          "You can save personal pairing preferences and optionally ignore them for a single request when you want a neutral recommendation.",
          "Set a max pairing budget when you want a good match under a price ceiling, not necessarily the best bottle in the cellar.",
          "Wine comparison helps you place two to four wines side by side before opening or buying.",
          "AI comparison works best on two wines and returns style, readiness, occasion, and cellar-value judgment.",
        ],
      },
      {
        title: "8. Manage cellars, access, and shared workflows",
        body: "Vinaris supports multiple cellars per user, cellar invitations, and mirrored shared positions between collectors.",
        bullets: [
          "Use Settings > Cellars to rename the active cellar, create a new one, or switch between existing cellars.",
          "Anyone you invite to a cellar must already have their own Vinaris account.",
          "For shared wines, first grant visibility to shared bottles, then send the shared position so it appears in the other collector's cellar too.",
        ],
      },
      {
        title: "9. Follow notifications and data quality",
        body: "Notifications and data-quality views help you keep the cellar operational instead of slowly drifting out of date.",
        bullets: [
          "Notifications help you track invites, redeem codes, approvals, expiring access, incoming shared positions, future deliveries, and wines waiting to be collected.",
          "Data Quality highlights missing value, drink window, grapes, and scores so you know what to complete next.",
          "Wines without a usable vintage such as NV or MV are excluded from drink-window missing-data checks where appropriate.",
        ],
      },
      {
        title: "10. Import, export, and move data safely",
        body: "Vinaris supports structured export and import so each cellar can be backed up or restored with intent.",
        bullets: [
          "Use Settings > Data to export the active cellar and choose which blocks to include.",
          "Vinaris JSON import is meant for Vinaris exports and can restore more than wines alone depending on the selected blocks.",
          "Be careful when importing shared data such as members, invites, and ownership because those blocks can grant access to other accounts.",
          "Offline backup loading appears when you are without network, or after a failed login caused by missing connectivity, so you can still browse a cellar snapshot in read-only mode.",
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
        body: "La vista Cantina è il luogo dove vive la collezione reale. Inserisci prima i vini consegnati, poi ordini, consegne future e posizioni condivise.",
        bullets: [
          "Usa Aggiungi vino per registrare produttore, annata, quantità, formato bottiglia, stato e prezzo di acquisto.",
          "L'annata supporta gli anni classici ma anche NV o MV per cuvée non millesimate.",
          "Per le bottiglie condivise, definisci proprietà e percentuali direttamente nella scheda vino.",
          "Se hai già dati strutturati, importali da Impostazioni > Data.",
        ],
      },
      {
        title: "2. Usa la dashboard per capire cosa conta adesso",
        body: "La Home non è solo un riepilogo. È la schermata operativa per decidere cosa bere, cosa arriverà e quali dati completare.",
        bullets: [
          "Collector focus mostra azioni prioritarie, bottiglie a rischio, posizione chiave, consegne e dati mancanti.",
          "Timeline ti aiuta a seguire futures ed arrivi attesi nel tempo.",
          "Le viste valore e qualità dati ti aiutano a vedere più rapidamente concentrazione, campi mancanti e prezzi da aggiornare.",
        ],
      },
      {
        title: "3. Costruisci il flusso acquisti con la Wishlist",
        body: "La Wishlist tiene separate le bottiglie future dalla cantina attiva finché non decidi di comprarle o convertirle in posizioni reali.",
        bullets: [
          "Aggiungi prezzi target, priorità, scopo, note merchant e, se utile, una nota contesto AI.",
          "Converti gli elementi wishlist in posizioni di cantina quando acquisti.",
          "Usa i suggerimenti AI, se configurati, per affinare strategia di acquisto, scopo e prezzo di mercato.",
        ],
      },
      {
        title: "4. Usa il dettaglio vino come schermo decisionale",
        body: "Apri un vino per vedere la scheda completa con valore, finestra di beva, note, proprietà, uve, punteggi e storico del valore.",
        bullets: [
          "La finestra di beva evidenzia il periodo giovane, ideale e oltre finestra con l'indicatore dell'anno corrente.",
          "L'evoluzione valore tiene traccia dei punti prezzo che registri nel tempo.",
          "La modalità modifica è il posto giusto per aggiornare punteggi, tag, uve, quantità, formato e stato consegna.",
        ],
      },
      {
        title: "5. Registra il consumo e conserva la memoria degustativa",
        body: "Quando una bottiglia viene bevuta, Vinaris scala la quantità in cantina e salva i dati della degustazione nello Storico.",
        bullets: [
          "Usa Bevuta 1 dal dettaglio vino per registrare data, nota, occasione, abbinamento, compagni e voto degustativo.",
          "Quando finisce l'ultima bottiglia, il vino esce dalla cantina attiva ma resta consultabile nello Storico.",
          "Lo Storico è il tuo archivio degustativo di lungo periodo, non solo una lista di bottiglie eliminate.",
        ],
      },
      {
        title: "6. Attiva l'AI solo se ti serve",
        body: "Vinaris funziona anche senza AI, ma diventa più potente quando colleghi la tua chiave OpenAI oppure usi un AI Pack in-app.",
        bullets: [
          "L'AI può aiutarti con note degustative, finestre di beva, controlli di valore, uvaggi, strategia wishlist, abbinamenti e confronti diretti tra vini.",
          "Se non vuoi usare una chiave personale, puoi acquistare un AI Pack direttamente nell'app e lasciare a Vinaris la gestione dell'uso AI.",
          "Il tuo token personale viene criptato e archiviato in modo sicuro, mentre l'AI Pack usa il budget interno del tuo account.",
          "Tutte le impostazioni AI vivono in Impostazioni > AI e restano sotto il tuo controllo.",
        ],
      },
      {
        title: "7. Usa sommelier AI e confronto vini",
        body: "Vinaris non è solo un registro di cantina. Ti aiuta anche a decidere cosa aprire, cosa comprare e come due bottiglie si differenziano.",
        bullets: [
          "Abbinamento ti permette di inserire un piatto e chiedere al sommelier AI i match migliori dalla tua cantina o dal mercato.",
          "Confronto vini ti aiuta a mettere due fino a quattro bottiglie fianco a fianco prima di aprirle o comprarle.",
          "Il confronto AI funziona al meglio su due vini e restituisce stile, prontezza, occasione ideale e giudizio cantina/valore.",
        ],
      },
      {
        title: "8. Gestisci cantine, accessi e flussi condivisi",
        body: "Vinaris supporta più cantine per utente, inviti in cantina e rispecchiamento delle posizioni condivise tra collezionisti.",
        bullets: [
          "Usa Impostazioni > Cantine per rinominare la cantina attiva, crearne una nuova o passare da una cantina all'altra.",
          "Chi inviti in una cantina deve comunque essere già titolare di un account Vinaris.",
          "Per i vini condivisi, prima concedi visibilità alle sole bottiglie condivise e poi invia la posizione così comparirà anche nella cantina dell'altro collezionista.",
        ],
      },
      {
        title: "9. Segui notifiche e qualità dati",
        body: "Notifiche e controlli qualità dati servono a mantenere la cantina operativa, non semplicemente popolata.",
        bullets: [
          "Le notifiche ti aiutano a seguire inviti, codici redeem, approvazioni, accessi in scadenza e posizioni condivise in arrivo.",
          "Qualità dati evidenzia valori mancanti, finestre di beva assenti, uve mancanti e punteggi non ancora censiti.",
          "I vini senza annata utile, come NV o MV, vengono esclusi dai controlli sulla finestra di beva quando non è sensato richiederla.",
        ],
      },
      {
        title: "10. Importa, esporta e sposta i dati con criterio",
        body: "Vinaris supporta export e import strutturati così ogni cantina può essere salvata o ripristinata in modo intenzionale.",
        bullets: [
          "Usa Impostazioni > Data per esportare la cantina attiva e scegliere quali blocchi includere.",
          "L'import JSON Vinaris è pensato per gli export Vinaris e può ripristinare più elementi dei soli vini, a seconda dei blocchi selezionati.",
          "Fai attenzione ai dati condivisi come membri, inviti e proprietà perché quei blocchi possono dare accesso anche ad altri account.",
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
  wishlist_list_id: "",
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
  ai_context_note: "",
};

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const isFormData = init?.body instanceof FormData;
  const response = await fetch(path, {
    credentials: "include",
    headers: { ...(isFormData ? {} : { "Content-Type": "application/json" }), ...init?.headers },
    ...init,
  });
  if (!response.ok) {
    const message = await response.text();
    throw new Error(extractApiErrorText(message) || `Request failed: ${response.status}`);
  }
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

function extractApiErrorText(message: string) {
  const trimmedMessage = String(message || "").trim();
  if (!trimmedMessage) return "";
  if (trimmedMessage.startsWith("<")) {
    const titleMatch = trimmedMessage.match(/<title>(.*?)<\/title>/i);
    const headingMatch = trimmedMessage.match(/<h1[^>]*>(.*?)<\/h1>/i);
    const htmlSummary = titleMatch?.[1] || headingMatch?.[1] || trimmedMessage.replace(/<[^>]+>/g, " ");
    return htmlSummary.replace(/\s+/g, " ").trim();
  }
  try {
    const parsed = JSON.parse(trimmedMessage) as { detail?: unknown; message?: unknown };
    if (parsed && typeof parsed === "object") {
      if (typeof parsed.detail === "string" && parsed.detail.trim()) return parsed.detail.trim();
      if (Array.isArray(parsed.detail) && parsed.detail.length) {
        const firstDetail = parsed.detail[0] as { msg?: unknown };
        if (typeof firstDetail?.msg === "string" && firstDetail.msg.trim()) return firstDetail.msg.trim();
      }
      if (typeof parsed.message === "string" && parsed.message.trim()) return parsed.message.trim();
    }
  } catch {
    return trimmedMessage;
  }
  return trimmedMessage;
}

function formatUserErrorMessage(message: string, locale: Locale) {
  const text = String(message || "").trim();
  if (!text) return "";
  const normalized = text.toLowerCase();

  if (normalized.includes("413 request entity too large") || normalized.includes("request entity too large")) {
    return locale === "it"
      ? "Il file di backup e' troppo grande per essere caricato in una sola richiesta. Riduci la dimensione del file oppure aumenta ulteriormente il limite di upload del server."
      : "The backup file is too large to upload in a single request. Reduce the file size or increase the server upload limit.";
  }

  if (isConnectivityError(text)) {
    return locale === "it"
      ? "Connessione non disponibile. Puoi riprovare il login quando torni online oppure caricare un backup offline in sola lettura."
      : "No network connection is available. You can try logging in again when you are back online or load an offline backup in read-only mode.";
  }

  if (normalized.includes("email verification required")) {
    return locale === "it"
      ? "Devi confermare il tuo indirizzo email prima di accedere. Controlla la posta e apri il link di conferma."
      : "You must confirm your email address before signing in. Check your inbox and open the confirmation link.";
  }

  if (normalized.includes("openai request failed")) {
    if (
      normalized.includes("timeout")
      || normalized.includes("timed out")
      || normalized.includes("disconnect/reset before headers")
      || normalized.includes("upstream connect error")
    ) {
      return locale === "it"
        ? "La richiesta AI ha impiegato troppo tempo. Riprova tra qualche secondo."
        : "The AI request took too long. Please try again in a few seconds.";
    }
    return locale === "it"
      ? "Il servizio AI non ha risposto correttamente. Riprova tra poco."
      : "The AI service did not respond correctly. Please try again shortly.";
  }

  if (normalized.includes("no verified live market price sources found")) {
    return locale === "it"
      ? "Non sono state trovate fonti di mercato live sufficientemente affidabili per questo vino. Verifica nome, produttore e annata, poi riprova."
      : "No sufficiently reliable live market sources were found for this wine. Check name, producer, and vintage, then try again.";
  }

  if (normalized.includes("ai credits exhausted")) {
    return locale === "it"
      ? "Il saldo AI Pack e' esaurito. Acquista un nuovo AI Pack oppure usa la tua chiave OpenAI."
      : "Your AI Pack balance is exhausted. Buy a new AI Pack or use your personal OpenAI key.";
  }

  if (normalized.includes("no personal openai api key configured")) {
    return locale === "it"
      ? "Non hai configurato una chiave OpenAI personale."
      : "You have not configured a personal OpenAI key.";
  }

  if (normalized.includes("no ai provider configured") || normalized.includes("application openai api key is not configured")) {
    return locale === "it"
      ? "L'AI non e' configurata correttamente in questo momento."
      : "AI is not configured correctly at the moment.";
  }

  return text;
}

function isConnectivityError(message: string) {
  const normalized = String(message || "").trim().toLowerCase();
  if (!normalized) return false;
  return (
    normalized.includes("failed to fetch")
    || normalized.includes("networkerror")
    || normalized.includes("load failed")
    || normalized.includes("network request failed")
    || normalized.includes("fetch failed")
    || normalized.includes("offline")
    || normalized.includes("internet")
    || normalized.includes("connection")
  );
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
    details_loaded: raw.details_loaded === undefined ? true : Boolean(raw.details_loaded),
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
    scores: rawArray(raw.scores).map((score) => ({ critic: rawString(score.critic), score: rawString(score.score), note: rawString(score.note) })),
    tasting_history: rawArray(raw.tasting_history).map((entry, entryIndex) => ({
      id: rawString(entry.id, `offline-tasting-${index}-${entryIndex}`),
      consumed_at: rawString(entry.consumed_at),
      note: rawString(entry.note),
      rating: rawNumber(entry.rating),
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

function offlineWishlistItem(raw: Record<string, unknown>, index: number): WishlistItem {
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
    type: normalizeWineType(wine.type),
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
    grapes: wine.grapes.map((grape) => ({
      name: grape.name || "",
      percentage_from: grape.percentage_from === undefined ? "" : String(grape.percentage_from),
      percentage_to: grape.percentage_to === undefined ? "" : String(grape.percentage_to),
    })),
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
    type: normalizeWineType(draft.type),
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

function wishlistToDraft(item: WishlistItem): WishlistDraft {
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
    currency: item.currency,
    merchant: item.merchant,
    priority: item.priority,
    purpose: item.purpose,
    status: item.status,
    notes: item.notes,
    ai_context_note: item.ai_context_note,
  };
}

function wishlistPayload(draft: WishlistDraft) {
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
    currency: draft.currency.trim().toUpperCase() || "CHF",
    merchant: draft.merchant.trim(),
    priority: draft.priority,
    purpose: draft.purpose,
    status: draft.status,
    notes: draft.notes.trim(),
    ai_context_note: draft.ai_context_note.trim(),
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

function emailVerificationResultFromUrl() {
  const params = new URLSearchParams(window.location.search);
  const result = params.get("email_verified");
  return result === "success" || result === "expired" || result === "invalid" ? result : "";
}

function emailVerificationTokenFromUrl() {
  const params = new URLSearchParams(window.location.search);
  return params.get("email_verify_token") || "";
}

const STRIPE_CHECKOUT_PLAN_KEY = "vinaris_stripe_checkout_plan";
const STRIPE_CHECKOUT_BALANCE_KEY = "vinaris_stripe_checkout_balance";

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

function grapesFromText(value: string): WineDraft["grapes"] {
  return value
    .split(/[,;/+&]|\band\b|\be\b/i)
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const percentMatch = part.match(/(\d+(?:[.,]\d+)?)\s*%/);
      const name = part.replace(/\d+(?:[.,]\d+)?\s*%/g, "").trim();
      const percentage = percentMatch?.[1]?.replace(",", ".") || "";
      return { name, percentage_from: percentage, percentage_to: percentage };
    })
    .filter((grape) => grape.name.length > 1)
    .slice(0, 8);
}

function formatUsd(value: string | number) {
  const amount = Number(value || 0);
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: amount < 1 ? 4 : 2, maximumFractionDigits: 4 }).format(amount);
}

function formatAiBudget(value: string | number) {
  const amount = Number(value || 0);
  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: amount < 1 ? 4 : 2,
    maximumFractionDigits: 4,
  }).format(amount);
}

function numberLocale(locale: Locale) {
  return locale === "it" ? "it-CH" : "en-CH";
}

function formatMoney(
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

function parsePriceHintAmount(value: string) {
  const match = value.match(/(\d+(?:[.,]\d+)?)/);
  if (!match) return null;
  const amount = Number(match[1].replace(",", "."));
  return Number.isFinite(amount) ? amount : null;
}

function parseHelpBullet(value: string) {
  const marker = "[AI] ";
  if (value.startsWith(marker)) {
    return { isAi: true, text: value.slice(marker.length) };
  }
  return { isAi: false, text: value };
}

function clipUiText(value: string, limit = 120) {
  const trimmed = value.trim();
  if (trimmed.length <= limit) return trimmed;
  return `${trimmed.slice(0, Math.max(0, limit - 1)).trimEnd()}…`;
}

function aiBudgetFillRatio(balance: string | number, packSize: string | number) {
  const current = Number(balance || 0);
  const unit = Number(packSize || 0);
  if (!Number.isFinite(current) || !Number.isFinite(unit) || unit <= 0) return 0;
  return Math.max(0, Math.min(current / unit, 1));
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

function wineTone(type: string): WineTone {
  const normalized = type.toLowerCase();
  if (normalized.includes("red") || normalized.includes("rosso")) return "red";
  if (normalized.includes("white") || normalized.includes("bianco")) return "white";
  if (normalized.includes("sparkling") || normalized.includes("champagne") || normalized.includes("spumante")) return "sparkling";
  if (normalized.includes("ros") || normalized.includes("rose")) return "rose";
  if (normalized.includes("sweet") || normalized.includes("dolce")) return "sweet";
  return "other";
}

const wineToneOrder: WineTone[] = ["red", "white", "sparkling", "rose", "sweet", "other"];

function wineToneLabel(tone: WineTone, locale: Locale) {
  if (tone === "red") return displayValue("Red", locale, "type") || "Red";
  if (tone === "white") return displayValue("White", locale, "type") || "White";
  if (tone === "sparkling") return displayValue("Sparkling", locale, "type") || "Sparkling";
  if (tone === "rose") return displayValue("Rosé", locale, "type") || "Rosé";
  if (tone === "sweet") return displayValue("Sweet", locale, "type") || "Sweet";
  return displayValue("Other", locale, "type") || "Other";
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

type ValueBreakdownItem = { label: string; value: number };
type BreakdownMetric = "value" | "bottles" | "wines";
type BreakdownDrilldown = {
  title: TranslationKey;
  dimension: "type" | "region";
  metric: BreakdownMetric;
  label: string;
} | null;

function wineGroupValue(wine: Wine, field: "type" | "region") {
  return wine[field] || (field === "type" ? "Other" : "Unknown region");
}

function breakdownColor(label: string, index: number, mode: "type" | "region") {
  if (mode === "type") {
    const tone = wineTone(label);
    if (tone === "red") return "#a52d4a";
    if (tone === "white") return "#d9b33d";
    if (tone === "sparkling") return "#c3a34e";
    if (tone === "rose") return "#d78197";
    if (tone === "sweet") return "#d98936";
    return "#5b8f7d";
  }
  const palette = ["#2f6f5e", "#9a8549", "#b55d5d", "#6f8ea8", "#8c6cb5", "#5b8f7d"];
  return palette[index % palette.length];
}

function breakdownDonutSegments(items: ValueBreakdownItem[], mode: "type" | "region") {
  const total = items.reduce((sum, item) => sum + item.value, 0);
  if (!total) return [];
  let start = 0;
  return items.map((item, index) => {
    const size = (item.value / total) * 100;
    const segment = {
      ...item,
      color: breakdownColor(item.label, index, mode),
      start,
      end: start + size,
      pct: size,
    };
    start += size;
    return segment;
  });
}

function BreakdownDonut({
  items,
  mode,
  locale,
  onSelect,
}: {
  items: ValueBreakdownItem[];
  mode: "type" | "region";
  locale: Locale;
  onSelect?: (item: ValueBreakdownItem) => void;
}) {
  const segments = breakdownDonutSegments(items, mode);
  if (!segments.length) return null;
  const background = `conic-gradient(${segments.map((segment) => `${segment.color} ${segment.start}% ${segment.end}%`).join(", ")})`;
  return (
    <div className="breakdown-donut-wrap">
      <button
        type="button"
        className="breakdown-donut"
        style={{ background }}
        onClick={() => onSelect?.(segments[0])}
        aria-label={`${segments[0].label} drill-down`}
      >
        <div className="breakdown-donut-hole">
          <strong>{segments.length}</strong>
          <span>{translate(locale, mode === "type" ? "typesLabel" : "regionsLabel")}</span>
        </div>
      </button>
    </div>
  );
}

function collectorFocusSvgIcon(kind: "drink_now" | "past_window" | "future_deliveries" | "missing_data" | "maturity" | "regions" | "producer") {
  if (kind === "drink_now") return dashboardStatSvgIcon("drink_now");
  if (kind === "past_window") return dashboardStatSvgIcon("past_window");
  if (kind === "future_deliveries") return dashboardStatSvgIcon("future_deliveries");
  if (kind === "missing_data") return dashboardStatSvgIcon("missing_data");
  if (kind === "maturity") {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M5 18h14" />
        <path d="M7 18V9" />
        <path d="M12 18V5" />
        <path d="M17 18v-6" />
        <path d="M4 6h3" />
        <path d="M10 3h4" />
        <path d="M16 9h3" />
      </svg>
    );
  }
  if (kind === "regions") {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <circle cx="12" cy="12" r="8" />
        <path d="M4 12h16" />
        <path d="M12 4a12 12 0 0 1 0 16" />
        <path d="M12 4a12 12 0 0 0 0 16" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M6 18V8" />
      <path d="M12 18V5" />
      <path d="M18 18v-9" />
      <path d="M4 18h16" />
    </svg>
  );
}

function isWishlistReadyToBuy(status: string) {
  const normalized = status.trim().toLowerCase();
  return ["buy", "ready", "approved", "compra", "acquista", "pronto", "approvato"]
    .some((word) => normalized.includes(word));
}

function wineUnitValue(wine: Wine) {
  return Number(wine.current_value || wine.price || 0);
}

function hasVintageForDrinkWindow(wine: Wine) {
  const vintage = wine.vintage.trim().toLowerCase();
  if (!vintage) return false;
  if (["nv", "mv", "sans vintage", "non vintage", "multi vintage"].includes(vintage)) return false;
  return /\d{4}/.test(vintage);
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

function wineQuantityLabel(wine: Wine, session: Session | null, bottlesLabel: string, locale: Locale) {
  const owned = ownedBottleCount(wine, session);
  const isShared = wine.owners.length > 0 || currentUserSharePct(wine, session) < 100;
  if (isShared) return `${formatBottleCount(owned, locale)} ${bottlesLabel} di ${formatBottleCount(wine.quantity, locale)} condivise`;
  return `${formatBottleCount(wine.quantity, locale)} ${bottlesLabel}`;
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
  return uniqueSorted(items.map((wine) => wineGroupValue(wine, field)))
    .map((label) => ({
      label,
      value: sumWineValue(items.filter((wine) => wineGroupValue(wine, field) === label)),
    }))
    .filter((item) => item.value > 0)
    .sort((first, second) => second.value - first.value)
    .slice(0, 5);
}

function topWineBottleGroups(items: Wine[], field: "type" | "region") {
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

function topWineCountGroups(items: Wine[], field: "type" | "region") {
  return uniqueSorted(items.map((wine) => wineGroupValue(wine, field)))
    .map((label) => ({
      label,
      value: items.filter((wine) => wineGroupValue(wine, field) === label).length,
    }))
    .filter((item) => item.value > 0)
    .sort((first, second) => second.value - first.value)
    .slice(0, 5);
}

function topProducerGroups(items: Wine[]) {
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

function formatBottleCount(value: number, locale: Locale) {
  return new Intl.NumberFormat(numberLocale(locale), {
    useGrouping: true,
    maximumFractionDigits: 0,
  }).format(Math.round(value));
}

function formatRecognitionConfidence(value: number | null, locale: Locale) {
  if (typeof value !== "number" || Number.isNaN(value)) return "";
  const percentage = value <= 1 ? value * 100 : value;
  return `${new Intl.NumberFormat(numberLocale(locale), {
    maximumFractionDigits: 1,
  }).format(percentage)}%`;
}

function recognitionSuggestionLabel(label: string, confidence: number | null, locale: Locale) {
  const confidenceLabel = formatRecognitionConfidence(confidence, locale);
  return confidenceLabel ? `${label} · ${confidenceLabel}` : label;
}

function dashboardStatSvgIcon(kind: "mine" | "shared" | "total" | "drink_now" | "drink_soon" | "past_window" | "future_deliveries" | "to_collect" | "missing_data") {
  if (kind === "mine") {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M10 3h4" />
        <path d="M11 3v4l-3.5 5.2A4.5 4.5 0 0 0 7 14.7V18a3 3 0 0 0 3 3h4a3 3 0 0 0 3-3v-3.3a4.5 4.5 0 0 0-.5-2.5L13 7V3" />
        <path d="M8.5 13h7" />
      </svg>
    );
  }
  if (kind === "shared") {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <circle cx="8" cy="8" r="3" />
        <circle cx="16" cy="9" r="3" />
        <path d="M3.5 19a4.5 4.5 0 0 1 9 0" />
        <path d="M11.5 19a4.5 4.5 0 0 1 9 0" />
      </svg>
    );
  }
  if (kind === "drink_now") {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M6 4h12" />
        <path d="M8 4v5a4 4 0 0 0 8 0V4" />
        <path d="M12 13v7" />
        <path d="M9 20h6" />
        <circle cx="18" cy="6" r="2.5" />
      </svg>
    );
  }
  if (kind === "drink_soon") {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <circle cx="12" cy="12" r="8" />
        <path d="M12 8v5l3 2" />
      </svg>
    );
  }
  if (kind === "past_window") {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M12 4v8" />
        <path d="M12 16h.01" />
        <path d="M10.3 4.8 4.9 14.2A2 2 0 0 0 6.7 17h10.6a2 2 0 0 0 1.8-2.8l-5.4-9.4a2 2 0 0 0-3.4 0Z" />
      </svg>
    );
  }
  if (kind === "future_deliveries") {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M3 7h11v8H3z" />
        <path d="M14 10h3l3 3v2h-6z" />
        <circle cx="7" cy="17" r="2" />
        <circle cx="17" cy="17" r="2" />
      </svg>
    );
  }
  if (kind === "to_collect") {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M4 7h12v9H4z" />
        <path d="M16 10h2.5l1.5 2v4H16z" />
        <path d="M8 7V5.5A1.5 1.5 0 0 1 9.5 4h1A1.5 1.5 0 0 1 12 5.5V7" />
        <path d="m9 12 2 2 4-4" />
      </svg>
    );
  }
  if (kind === "missing_data") {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M8 6h10" />
        <path d="M8 12h10" />
        <path d="M8 18h10" />
        <path d="M4 6h.01" />
        <path d="M4 12h.01" />
        <path d="M4 18h.01" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 7h16" />
      <path d="M6 7V5.5A1.5 1.5 0 0 1 7.5 4h9A1.5 1.5 0 0 1 18 5.5V7" />
      <path d="M5 7v10.5A2.5 2.5 0 0 0 7.5 20h9a2.5 2.5 0 0 0 2.5-2.5V7" />
      <path d="M9 12h6" />
      <path d="M12 9v6" />
    </svg>
  );
}

function dashboardStatIcon(kind: "mine" | "shared" | "total") {
  if (kind === "mine") return "◉";
  if (kind === "shared") return "◌";
  return "◈";
}

function grapesSvgIcon() {
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

function notificationSvgIcon(kind: string) {
  if (kind === "smart_drink_now") return dashboardStatSvgIcon("drink_now");
  if (kind === "smart_past_window") return dashboardStatSvgIcon("past_window");
  if (kind === "smart_future_deliveries") return dashboardStatSvgIcon("future_deliveries");
  if (kind === "smart_to_collect") return dashboardStatSvgIcon("to_collect");
  if (kind === "smart_entitlement_expiring") return dashboardStatSvgIcon("missing_data");
  if (kind === "pending_users") return dashboardStatSvgIcon("shared");
  if (kind === "invite") return dashboardStatSvgIcon("shared");
  if (kind === "share_offer") return dashboardStatSvgIcon("shared");
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M6 10a6 6 0 1 1 12 0c0 4-6 10-6 10S6 14 6 10Z" />
      <circle cx="12" cy="10" r="2.5" />
    </svg>
  );
}

function wishlistActionSvgIcon(kind: "edit" | "convert" | "delete") {
  if (kind === "edit") {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M12 20h9" />
        <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5Z" />
      </svg>
    );
  }
  if (kind === "convert") {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M7 7h10" />
        <path d="m13 3 4 4-4 4" />
        <path d="M17 17H7" />
        <path d="m11 21-4-4 4-4" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3 6h18" />
      <path d="M8 6V4h8v2" />
      <path d="M19 6l-1 14H6L5 6" />
      <path d="M10 11v6" />
      <path d="M14 11v6" />
    </svg>
  );
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
    wine.grapes.map((grape) => grape.name).join(" "),
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
  if (normalized.includes("collect") || normalized.includes("pickup") || normalized.includes("ritir")) return "pickup";
  if (normalized.includes("shipp") || normalized.includes("spedit")) return "shipped";
  if (normalized.includes("order") || normalized.includes("ordin")) return "ordered";
  return "neutral";
}

function wineStatusIcon(status: string) {
  const tone = wineStatusTone(status);
  if (tone === "pickup") return "\u25D1";
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

function LoadingSpinner({ size = "md" }: { size?: "sm" | "md" }) {
  return (
    <span className={`loading-spinner loading-spinner-${size}`} aria-hidden="true">
      <span />
      <span />
      <span />
    </span>
  );
}

function notificationBellIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M7 9a5 5 0 1 1 10 0c0 5 2 6 2 6H5s2-1 2-6" />
      <path d="M10 19a2.4 2.4 0 0 0 4 0" />
    </svg>
  );
}

function settingsGearIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 15.2a3.2 3.2 0 1 0 0-6.4 3.2 3.2 0 0 0 0 6.4Z" />
      <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 0 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 0 1-4 0v-.1a1.7 1.7 0 0 0-1-1.5 1.7 1.7 0 0 0-1.9.3l-.1.1A2 2 0 0 1 4.2 17l.1-.1a1.7 1.7 0 0 0 .3-1.9 1.7 1.7 0 0 0-1.5-1H3a2 2 0 0 1 0-4h.1a1.7 1.7 0 0 0 1.5-1 1.7 1.7 0 0 0-.3-1.9l-.1-.1A2 2 0 0 1 7 4.2l.1.1a1.7 1.7 0 0 0 1.9.3 1.7 1.7 0 0 0 1-1.5V3a2 2 0 0 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.9-.3l.1-.1A2 2 0 0 1 19.8 7l-.1.1a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 1.5 1h.1a2 2 0 0 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z" />
    </svg>
  );
}

function logoutIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M10 17l5-5-5-5" />
      <path d="M15 12H3" />
      <path d="M21 19V5a2 2 0 0 0-2-2h-5" />
      <path d="M14 21h5a2 2 0 0 0 2-2" />
    </svg>
  );
}

function SommelierAiIllustration() {
  return <img src="/images/sommelier_ai.png" alt="Sommelier AI" loading="lazy" />;
}

function LoadingState({ label, compact = false }: { label: string; compact?: boolean }) {
  return (
    <div className={`loading-state${compact ? " compact" : ""}`} role="status" aria-live="polite">
      <LoadingSpinner size={compact ? "sm" : "md"} />
      <span>{label}</span>
    </div>
  );
}

function GlobalLoadingOverlay({ label }: { label: string }) {
  return (
    <div className="global-loading-overlay" role="status" aria-live="polite" aria-busy="true">
      <div className="global-loading-card">
        <LoadingSpinner size="md" />
        <strong>{label}</strong>
        <span>Vinaris</span>
      </div>
    </div>
  );
}

function ButtonBusyContent({
  busy,
  idleLabel,
  busyLabel,
}: {
  busy: boolean;
  idleLabel: string;
  busyLabel: string;
}) {
  return (
    <span className={`button-busy-label${busy ? " is-busy" : ""}`}>
      {busy ? <LoadingSpinner size="sm" /> : null}
      <span>{busy ? busyLabel : idleLabel}</span>
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

function auditMarketSources(entry: AiAuditLog) {
  return (entry.sources || [])
    .filter((source) => source && typeof source === "object" && source.kind === "market_source")
    .map((source) => ({
      merchant: rawString(source.merchant),
      country: rawString(source.country),
      currency: rawString(source.currency),
      url: rawString(source.url),
      note: rawString(source.note),
      price: Number(source.price),
    }))
    .filter((source) => source.merchant && Number.isFinite(source.price));
}

function auditWebSearchSources(entry: AiAuditLog) {
  return (entry.sources || [])
    .filter((source) => source && typeof source === "object" && source.kind === "web_search_source")
    .map((source) => ({
      title: rawString(source.title),
      url: rawString(source.url),
    }))
    .filter((source) => source.url);
}

function auditMarketNote(entry: AiAuditLog) {
  const noteEntry = (entry.sources || []).find((source) => source && typeof source === "object" && source.kind === "market_note");
  return noteEntry ? rawString(noteEntry.text) : "";
}

function auditWishlistPortfolioStrategy(entry: AiAuditLog): WishlistPortfolioStrategy | null {
  const strategyEntry = (entry.sources || []).find((source) => source && typeof source === "object" && source.kind === "wishlist_portfolio_strategy");
  if (!strategyEntry) return null;
  return {
    model: entry.model,
    overview: rawString(strategyEntry.overview),
    buy_now: rawString(strategyEntry.buy_now),
    wait_watch: rawString(strategyEntry.wait_watch),
    allocation: rawString(strategyEntry.allocation),
    next_step: rawString(strategyEntry.next_step),
    wishlist_list_id: rawString(strategyEntry.wishlist_list_id),
    wishlist_list_name: rawString(strategyEntry.wishlist_list_name),
    item_count: rawNumber(strategyEntry.item_count),
    generated_at: rawNullableString(entry.created_at),
    estimated_cost_usd: rawString(entry.estimated_cost_usd),
  };
}

function averageMarketPrice(sources: ReturnType<typeof auditMarketSources>) {
  if (!sources.length) return null;
  return sources.reduce((sum, source) => sum + source.price, 0) / sources.length;
}

function compareDrinkWindowLabel(wine: Wine, t: (key: TranslationKey) => string) {
  if (!wine.drink_from && !wine.drink_to) return t("notSpecified");
  if (wine.drink_from && wine.drink_to) return `${wine.drink_from}-${wine.drink_to}`;
  if (wine.drink_from) return `${wine.drink_from}-...`;
  return `...-${wine.drink_to}`;
}

function compareScoresLabel(wine: Wine, t: (key: TranslationKey) => string) {
  if (!wine.scores.length) return t("notSpecified");
  return wine.scores.slice(0, 2).map((score) => `${score.critic} ${score.score}`.trim()).join(" • ");
}

function compareGrapesLabel(wine: Wine, t: (key: TranslationKey) => string) {
  if (!wine.grapes.length) return t("notSpecified");
  return wine.grapes.slice(0, 4).map((grape) => formatGrape(grape)).join(" • ");
}

function compareTagsLabel(wine: Wine, t: (key: TranslationKey) => string) {
  if (!wine.tags.length) return t("notSpecified");
  return wine.tags.slice(0, 4).join(" • ");
}

function CompareWinesModal({
  wines,
  session,
  t,
  locale,
  canGenerateAi,
  aiResult,
  aiLoading,
  onRunAiCompare,
  onClose,
  onRemove,
}: {
  wines: Wine[];
  session: Session | null;
  t: (key: TranslationKey) => string;
  locale: Locale;
  canGenerateAi: boolean;
  aiResult: WineCompareAiResult | null;
  aiLoading: boolean;
  onRunAiCompare: () => void;
  onClose: () => void;
  onRemove: (wineId: string) => void;
}) {
  const aiResultRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!aiResult || !aiResultRef.current) return;
    aiResultRef.current.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [aiResult]);

  return (
    <div className="compare-modal-overlay" onClick={onClose}>
      <div className="compare-modal-card" onClick={(event) => event.stopPropagation()}>
        <div className="compare-modal-head">
          <div>
            <h2>{t("compareSelection")}</h2>
            <span>{wines.length} {t("winesLabel")}</span>
          </div>
          <button type="button" className="secondary compact" onClick={onClose}>
            {t("close")}
          </button>
        </div>
        <div className="compare-ai-toolbar">
          {wines.length === 2 ? (
            <button type="button" className="secondary" disabled={!canGenerateAi || aiLoading} onClick={onRunAiCompare}>
              <ButtonBusyContent busy={aiLoading} idleLabel={t("aiCompare")} busyLabel={t("generating")} />
            </button>
          ) : (
            <p className="empty-state">{t("aiCompareOnlyTwo")}</p>
          )}
        </div>
        {aiLoading ? <LoadingState label={t("generating")} compact /> : null}
        {aiResult ? (
          <section className="compare-ai-panel" ref={aiResultRef}>
            <div className="compare-ai-grid">
              <div className="compare-section">
                <strong>{t("styleProfile")}</strong>
                <p>{aiResult.style_profile}</p>
              </div>
              <div className="compare-section">
                <strong>{t("compareReadiness")}</strong>
                <p>{aiResult.readiness}</p>
              </div>
              <div className="compare-section">
                <strong>{t("compareOccasion")}</strong>
                <p>{aiResult.occasion}</p>
              </div>
              <div className="compare-section">
                <strong>{t("compareCellarValue")}</strong>
                <p>{aiResult.cellar_value}</p>
              </div>
            </div>
            <div className="compare-section compare-verdict">
              <strong>{t("compareVerdict")}</strong>
              <p>{aiResult.verdict}</p>
            </div>
            <div className="compare-ai-cost">
              <strong>{t("aiRequestCost")}</strong>
              <span>{formatAiBudget(aiResult.estimated_cost_usd)}</span>
            </div>
          </section>
        ) : null}
        <div className="compare-columns">
          {wines.map((wine) => (
            <article className={`compare-wine-card tone-${wineTone(wine.type)}`} key={wine.id}>
              <div className="compare-wine-head">
                <div>
                  <h3>
                    <i className={`wine-dot tone-${wineTone(wine.type)}`} />
                    {wine.name}
                  </h3>
                  <span>{[wine.producer, wine.vintage].filter(Boolean).join(" • ")}</span>
                </div>
                <button type="button" className="secondary compact" onClick={() => onRemove(wine.id)}>
                  {t("remove")}
                </button>
              </div>
              <div className="compare-field-grid">
                <DetailField label={t("purchasePrice")} value={formatMoney(wine.price, wine.currency, locale)} emptyLabel={t("notSpecified")} />
                <DetailField label={t("currentValue")} value={wine.current_value ? formatMoney(wine.current_value, wine.currency, locale) : ""} emptyLabel={t("notSpecified")} />
                <DetailField label={t("drinkWindow")} value={compareDrinkWindowLabel(wine, t)} emptyLabel={t("notSpecified")} />
                <DetailField label={t("region")} value={wine.region} emptyLabel={t("notSpecified")} />
              </div>
              <div className="compare-section">
                <strong>{t("grapes")}</strong>
                <p>{compareGrapesLabel(wine, t)}</p>
              </div>
            </article>
          ))}
        </div>
      </div>
    </div>
  );
}

function MarketValueModal({
  context,
  t,
  locale,
  onClose,
}: {
  context: MarketViewContext;
  t: (key: TranslationKey) => string;
  locale: Locale;
  onClose: () => void;
}) {
  const isWine = context.kind === "wine";
  const title = isWine ? context.wine.name : context.item.name;
  const producer = isWine ? context.wine.producer : context.item.producer;
  const vintage = isWine ? context.wine.vintage : context.item.vintage;
  const entry = context.entry;
  const sources = auditMarketSources(entry);
  const webSources = auditWebSearchSources(entry);
  const note = auditMarketNote(entry);
  const marketCurrency = isWine ? context.wine.currency : (context.item.ai_market_price_currency || context.item.currency);
  const storedMarketPrice = isWine ? Number(context.wine.current_value || 0) : Number(context.item.ai_market_price || 0);
  const marketPrice = storedMarketPrice > 0 ? storedMarketPrice : (averageMarketPrice(sources) || 0);
  const referenceLabel = isWine ? t("purchasePrice") : t("targetPrice");
  const referenceCurrency = isWine ? context.wine.currency : context.item.currency;
  const referencePrice = isWine ? Number(context.wine.price || 0) : Number(context.item.target_price || 0);
  const deltaPct = referencePrice > 0 && marketPrice > 0 ? ((marketPrice - referencePrice) / referencePrice) * 100 : null;
  const deltaPositive = deltaPct !== null && deltaPct >= 0;

  return (
    <div className="market-modal-overlay" onClick={onClose}>
      <div className="market-modal-card" onClick={(event) => event.stopPropagation()}>
        <div className="market-modal-head">
          <div>
            <h2>{t("marketValueView")}</h2>
            <strong>{title}</strong>
            <span>{[producer, vintage].filter(Boolean).join(" • ")}</span>
          </div>
          <button type="button" className="secondary compact" onClick={onClose}>
            {t("close")}
          </button>
        </div>

        <div className="market-summary-panel">
          <span>{t("averageMarketPrice")}</span>
          <strong>{formatMoney(marketPrice, marketCurrency, locale, 2, 2)}</strong>
          {deltaPct !== null ? (
            <p className={deltaPositive ? "positive" : "negative"}>
              {deltaPositive ? "↗" : "↘"} {deltaPct > 0 ? "+" : ""}{deltaPct.toFixed(1)}%
            </p>
          ) : null}
          {referencePrice > 0 ? <small>{referenceLabel}: {formatMoney(referencePrice, referenceCurrency, locale, 2, 2)}</small> : null}
        </div>

        <div className="market-sources-section">
          <div className="section-heading">
            <h3>{t("marketSources")}</h3>
            <span>{sources.length}</span>
          </div>
          {sources.length ? (
            <div className="market-source-list">
              {sources.map((source, index) => (
                <a
                  key={`${source.merchant}-${index}`}
                  className="market-source-row"
                  href={source.url || undefined}
                  target={source.url ? "_blank" : undefined}
                  rel={source.url ? "noreferrer" : undefined}
                >
                  <div>
                    <strong>{source.merchant}{source.country ? ` (${source.country})` : ""}</strong>
                    {source.note ? <span>{source.note}</span> : null}
                  </div>
                  <b>{formatMoney(source.price, source.currency, locale, 2, 2)}</b>
                </a>
              ))}
            </div>
          ) : !webSources.length ? (
            <p className="empty-state">{t("marketSourcesUnavailable")}</p>
          ) : null}
          {webSources.length ? (
            <div className="market-web-sources">
              <strong>{t("webSources")}</strong>
              <div className="market-source-list">
                {webSources.map((source, index) => (
                  <a
                    key={`${source.url}-${index}`}
                    className="market-source-row market-source-row-web"
                    href={source.url}
                    target="_blank"
                    rel="noreferrer"
                  >
                    <div>
                      <strong>{source.title || source.url}</strong>
                      <span>{source.url}</span>
                    </div>
                  </a>
                ))}
              </div>
            </div>
          ) : null}
          {note ? (
            <div className="market-note-block">
              <strong>{t("marketAvailability")}</strong>
              <p>{note}</p>
            </div>
          ) : null}
        </div>
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

function TastingEntryEditor({
  draft,
  setDraft,
  saving,
  t,
  onSave,
  onCancel,
  onDelete,
}: {
  draft: ConsumeWineDraft;
  setDraft: Dispatch<SetStateAction<ConsumeWineDraft>>;
  saving: boolean;
  t: (key: TranslationKey) => string;
  onSave: () => Promise<void>;
  onCancel: () => void;
  onDelete: () => Promise<void>;
}) {
  return (
    <div className="tasting-entry-editor">
      <div className="detail-grid consume-grid">
        <label>
          <span>{t("tastingDate")}</span>
          <input
            type="date"
            value={draft.consumed_at}
            onChange={(event) => setDraft((current) => ({ ...current, consumed_at: event.target.value }))}
            disabled={saving}
          />
        </label>
        <label>
          <span>{t("tastingRating")}</span>
          <select
            value={draft.tasting_rating}
            onChange={(event) => setDraft((current) => ({ ...current, tasting_rating: event.target.value }))}
            disabled={saving}
          >
            {Array.from({ length: 7 }).map((_, index) => (
              <option key={index} value={String(index)}>
                {index === 0 ? t("notSpecified") : `${index}/6`}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>{t("tastingOccasion")}</span>
          <input
            value={draft.tasting_occasion}
            onChange={(event) => setDraft((current) => ({ ...current, tasting_occasion: event.target.value }))}
            disabled={saving}
          />
        </label>
        <label>
          <span>{t("tastingPairing")}</span>
          <input
            value={draft.tasting_pairing}
            onChange={(event) => setDraft((current) => ({ ...current, tasting_pairing: event.target.value }))}
            disabled={saving}
          />
        </label>
      </div>
      <label>
        <span>{t("tastingCompanions")}</span>
        <input
          value={draft.tasting_companions}
          onChange={(event) => setDraft((current) => ({ ...current, tasting_companions: event.target.value }))}
          disabled={saving}
        />
      </label>
      <label>
        <span>{t("notes")}</span>
        <textarea
          rows={3}
          value={draft.note}
          onChange={(event) => setDraft((current) => ({ ...current, note: event.target.value }))}
          disabled={saving}
        />
      </label>
      <div className="tasting-entry-actions">
        <button type="button" disabled={saving} onClick={() => onSave().catch(() => undefined)}>
          {saving ? t("saving") : t("saveChanges")}
        </button>
        <button type="button" className="secondary compact" disabled={saving} onClick={onCancel}>
          {t("cancel")}
        </button>
        <button type="button" className="danger compact" disabled={saving} onClick={() => onDelete().catch(() => undefined)}>
          {t("delete")}
        </button>
      </div>
    </div>
  );
}

function TastingEntryMeta({
  note,
  occasion,
  pairing,
  companions,
  t,
}: {
  note: string;
  occasion: string;
  pairing: string;
  companions: string;
  t: (key: TranslationKey) => string;
}) {
  const indicators = [
    note ? t("notes") : "",
    occasion ? t("tastingOccasion") : "",
    pairing ? t("tastingPairing") : "",
    companions ? t("tastingCompanions") : "",
  ].filter(Boolean);

  if (!indicators.length) return null;

  return (
    <div className="tasting-entry-meta">
      {indicators.map((indicator) => (
        <span key={indicator}>{indicator}</span>
      ))}
    </div>
  );
}

function TastingHistorySection({
  wine,
  entries,
  canWrite,
  saving,
  onUpdateEntry,
  onDeleteEntry,
  t,
}: {
  wine: Wine;
  entries: Wine["tasting_history"];
  canWrite: boolean;
  saving: boolean;
  onUpdateEntry: (wine: Wine, entryId: string, payload: ConsumeWineDraft) => Promise<void>;
  onDeleteEntry: (wine: Wine, entryId: string) => Promise<void>;
  t: (key: TranslationKey) => string;
}) {
  const orderedEntries = [...entries].sort((first, second) => second.consumed_at.localeCompare(first.consumed_at));
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<ConsumeWineDraft>(emptyConsumeWineDraft);

  useEffect(() => {
    if (!editingId) return;
    const matchingEntry = entries.find((entry) => entry.id === editingId);
    if (!matchingEntry) {
      setEditingId(null);
      setEditDraft(emptyConsumeWineDraft());
    }
  }, [entries, editingId]);

  return (
    <div className="detail-section">
      <h3>{t("tastingHistory")}</h3>
      {orderedEntries.length ? (
        <div className="tasting-history-list">
          {orderedEntries.map((entry) => (
            <article className="tasting-history-entry" key={entry.id}>
              <div className="section-heading tasting-history-head">
                <div>
                  <strong>{formatDisplayDate(entry.consumed_at)}</strong>
                  {entry.rating ? <span>{t("tastingRating")}: {entry.rating}/6</span> : null}
                </div>
                {canWrite ? (
                  <div className="tasting-history-actions">
                    <button
                      type="button"
                      className="secondary compact"
                      disabled={saving}
                      onClick={() => {
                        setEditingId(entry.id);
                        setEditDraft(consumeDraftFromTastingEntry(entry));
                      }}
                    >
                      {t("edit")}
                    </button>
                  </div>
                ) : null}
              </div>
              {editingId === entry.id ? (
                <TastingEntryEditor
                  draft={editDraft}
                  setDraft={setEditDraft}
                  saving={saving}
                  t={t}
                  onSave={async () => {
                    await onUpdateEntry(wine, entry.id, editDraft);
                    setEditingId(null);
                    setEditDraft(emptyConsumeWineDraft());
                  }}
                  onCancel={() => {
                    setEditingId(null);
                    setEditDraft(emptyConsumeWineDraft());
                  }}
                  onDelete={async () => {
                    if (!window.confirm(t("delete"))) return;
                    await onDeleteEntry(wine, entry.id);
                    setEditingId(null);
                    setEditDraft(emptyConsumeWineDraft());
                  }}
                />
              ) : (
                <>
                  <TastingEntryMeta
                    note={entry.note}
                    occasion={entry.occasion}
                    pairing={entry.pairing}
                    companions={entry.companions}
                    t={t}
                  />
                  {entry.note ? <p>{entry.note}</p> : null}
                  {entry.occasion || entry.pairing || entry.companions ? (
                    <div className="chip-list">
                      {entry.occasion ? <span>{t("tastingOccasion")}: {entry.occasion}</span> : null}
                      {entry.pairing ? <span>{t("tastingPairing")}: {entry.pairing}</span> : null}
                      {entry.companions ? <span>{t("tastingCompanions")}: {entry.companions}</span> : null}
                    </div>
                  ) : null}
                </>
              )}
            </article>
          ))}
        </div>
      ) : (
        <p className="empty-state">{t("noTastingHistory")}</p>
      )}
    </div>
  );
}

function tastingArchiveSearchText(entry: TastingArchiveEntry) {
  return [
    entry.note,
    entry.occasion,
    entry.pairing,
    entry.companions,
  ]
    .join(" ")
    .toLowerCase();
}

function tastingArchiveItemToWine(item: TastingArchiveApiItem): Wine {
  return {
    id: item.wine_id,
    details_loaded: false,
    household_id: "",
    name: item.wine_name,
    producer: item.wine_producer,
    vintage: item.wine_vintage,
    quantity: 0,
    currency: "CHF",
    price: "0",
    current_value: null,
    status: item.wine_status,
    format: item.wine_format,
    type: item.wine_type,
    region: item.wine_region,
    appellation: item.wine_appellation,
    merchant: "",
    order_date: null,
    expected_delivery: null,
    owner_share_pct: "100",
    notes: "",
    ai_notes: "",
    drink_from: null,
    drink_peak_from: null,
    drink_peak_to: null,
    drink_to: null,
    drink_window_notes: "",
    ai_value_notes: "",
    ai_value_estimated_at: null,
    rating: 0,
    owners: [],
    tags: [],
    grapes: [],
    scores: [],
    tasting_history: [],
    value_history: [],
  };
}

function TastingArchiveSection({
  entries,
  saving,
  t,
  locale,
  onOpenWine,
  onUpdateEntry,
  onDeleteEntry,
}: {
  entries: TastingArchiveEntry[];
  saving: boolean;
  t: (key: TranslationKey) => string;
  locale: Locale;
  onOpenWine: (wine: Wine) => void;
  onUpdateEntry: (wine: Wine, entryId: string, payload: ConsumeWineDraft) => Promise<void>;
  onDeleteEntry: (wine: Wine, entryId: string) => Promise<void>;
}) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<ConsumeWineDraft>(emptyConsumeWineDraft);

  useEffect(() => {
    if (!editingId) return;
    const matchingEntry = entries.find((entry) => entry.id === editingId);
    if (!matchingEntry) {
      setEditingId(null);
      setEditDraft(emptyConsumeWineDraft());
    }
  }, [entries, editingId]);

  return (
    <div className="tasting-archive-list">
      {entries.map((entry) => (
        <article className={`tasting-archive-entry tone-${wineTone(entry.wine.type)}`} key={entry.id}>
          <div className="tasting-archive-head">
            <div>
              <strong>{entry.wine.name}</strong>
              <span>{[entry.wine.producer, entry.wine.vintage, entry.wine.region].filter(Boolean).join(" - ")}</span>
            </div>
            <div className="tasting-archive-summary">
              <span>{formatDisplayDate(entry.consumed_at)}</span>
              {entry.rating ? <strong>{entry.rating}/6</strong> : null}
            </div>
          </div>
          <p className="tasting-archive-meta">
            {[displayValue(entry.wine.format, locale, "format"), displayValue(entry.wine.type, locale, "type"), entry.wine.appellation].filter(Boolean).join(" - ")}
          </p>
          {editingId === entry.id ? (
            <TastingEntryEditor
              draft={editDraft}
              setDraft={setEditDraft}
              saving={saving}
              t={t}
              onSave={async () => {
                await onUpdateEntry(entry.wine, entry.id, editDraft);
                setEditingId(null);
                setEditDraft(emptyConsumeWineDraft());
              }}
              onCancel={() => {
                setEditingId(null);
                setEditDraft(emptyConsumeWineDraft());
              }}
              onDelete={async () => {
                if (!window.confirm(t("delete"))) return;
                await onDeleteEntry(entry.wine, entry.id);
                setEditingId(null);
                setEditDraft(emptyConsumeWineDraft());
              }}
            />
          ) : (
            <>
              <TastingEntryMeta
                note={entry.note}
                occasion={entry.occasion}
                pairing={entry.pairing}
                companions={entry.companions}
                t={t}
              />
              {entry.note ? <p className="tasting-archive-note">{entry.note}</p> : null}
              {entry.occasion || entry.pairing || entry.companions ? (
                <div className="chip-list">
                  {entry.occasion ? <span>{t("tastingOccasion")}: {entry.occasion}</span> : null}
                  {entry.pairing ? <span>{t("tastingPairing")}: {entry.pairing}</span> : null}
                  {entry.companions ? <span>{t("tastingCompanions")}: {entry.companions}</span> : null}
                </div>
              ) : null}
              <div className="tasting-archive-actions">
                <button type="button" className="secondary compact" onClick={() => onOpenWine(entry.wine)}>
                  {t("openWine")}
                </button>
                <button
                  type="button"
                  className="secondary compact"
                  disabled={saving}
                  onClick={() => {
                    setEditingId(entry.id);
                    setEditDraft(consumeDraftFromTastingEntry(entry));
                  }}
                >
                  {t("edit")}
                </button>
              </div>
            </>
          )}
        </article>
      ))}
    </div>
  );
}

function WineDetail({
  wine,
  session,
  auditEntries,
  canGenerate,
  canWrite,
  saving,
  generating,
  onGenerate,
  onConsume,
  onUpdateTastingEntry,
  onDeleteTastingEntry,
  marketAuditEntry,
  onOpenMarketView,
  t,
  locale,
}: {
  wine: Wine;
  session: Session | null;
  auditEntries: AiAuditLog[];
  canGenerate: boolean;
  canWrite: boolean;
  saving: boolean;
  generating: string;
  onGenerate: (feature: WineAiFeature) => void;
  onConsume: (payload: ConsumeWineDraft) => Promise<void>;
  onUpdateTastingEntry: (wine: Wine, entryId: string, payload: ConsumeWineDraft) => Promise<void>;
  onDeleteTastingEntry: (wine: Wine, entryId: string) => Promise<void>;
  marketAuditEntry: AiAuditLog | null;
  onOpenMarketView: (entry: AiAuditLog) => void;
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
  const [consumeDraft, setConsumeDraft] = useState<ConsumeWineDraft>(emptyConsumeWineDraft);
  const hasMarketEvidence = marketAuditEntry ? auditMarketSources(marketAuditEntry).length > 0 || Boolean(auditMarketNote(marketAuditEntry)) : false;

  useEffect(() => {
    setConsumeDraft(emptyConsumeWineDraft());
  }, [wine.id]);

  async function submitConsume(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await onConsume(consumeDraft);
    setConsumeDraft(emptyConsumeWineDraft());
  }

  return (
    <section className={`wine-detail tone-${wineTone(wine.type)}`}>
      <div className="detail-title">
        <div>
          <p className="eyebrow">{t("wineDetail")}</p>
          <h2><i className={`wine-dot tone-${wineTone(wine.type)}`} />{wine.name}</h2>
          {wine.rating ? <StarRating value={wine.rating} label={t("rating")} /> : null}
          <span>{[wine.producer, wine.vintage, wine.region, wine.appellation].filter(Boolean).join(" - ")}</span>
        </div>
        <strong>{formatMoney(wine.current_value || wine.price, wine.currency, locale)}</strong>
      </div>

      <div className="ai-actions">
        <button type="button" className="secondary compact" disabled={!canGenerate || Boolean(generating)} onClick={() => onGenerate("notes")}>
          <ButtonBusyContent busy={generating === "notes"} idleLabel={t("aiNotes")} busyLabel={t("generating")} />
        </button>
        <button type="button" className="secondary compact" disabled={!canGenerate || Boolean(generating)} onClick={() => onGenerate("drink-window")}>
          <ButtonBusyContent busy={generating === "drink-window"} idleLabel={t("drinkWindow")} busyLabel={t("generating")} />
        </button>
        <button type="button" className="secondary compact" disabled={!canGenerate || Boolean(generating)} onClick={() => onGenerate("value")}>
          <ButtonBusyContent busy={generating === "value"} idleLabel={t("value")} busyLabel={t("generating")} />
        </button>
        <button type="button" className="secondary compact" disabled={!canGenerate || Boolean(generating)} onClick={() => onGenerate("grapes")}>
          <ButtonBusyContent busy={generating === "grapes"} idleLabel={t("grapes")} busyLabel={t("generating")} />
        </button>
        <button type="button" className="secondary compact" disabled={!canGenerate || Boolean(generating)} onClick={() => onGenerate("scores")}>
          <ButtonBusyContent busy={generating === "scores"} idleLabel={t("scores")} busyLabel={t("generating")} />
        </button>
      </div>
      {generating ? <LoadingState label={t("generating")} compact /> : null}

      <div className="detail-grid">
        <DetailField label={t("format")} value={displayValue(wine.format, locale, "format")} emptyLabel={t("notSpecified")} />
        <DetailField label={t("type")} value={displayValue(wine.type, locale, "type")} emptyLabel={t("notSpecified")} />
        <DetailField label={t("rating")} value={wine.rating ? `${wine.rating}/6` : ""} emptyLabel={t("notSpecified")} />
        <DetailField label={t("status")} value={<WineStatusBadge status={wine.status} locale={locale} />} emptyLabel={t("notSpecified")} />
        <DetailField label={t("quantity")} value={wineQuantityLabel(wine, session, t("bottles").toLowerCase(), locale)} emptyLabel={t("notSpecified")} />
        <DetailField label={t("purchasePrice")} value={formatMoney(wine.price, wine.currency, locale)} emptyLabel={t("notSpecified")} />
        <DetailField label={t("currentValue")} value={wine.current_value ? formatMoney(wine.current_value, wine.currency, locale) : ""} emptyLabel={t("notSpecified")} />
        <DetailField label={t("merchant")} value={wine.merchant} emptyLabel={t("notSpecified")} />
        <DetailField label={t("delivery")} value={formatDisplayDate(wine.expected_delivery)} emptyLabel={t("notSpecified")} />
      </div>

      <ValueHistoryChart wine={wine} t={t} />
      {marketAuditEntry && hasMarketEvidence ? (
        <div className="market-view-bar">
          <button type="button" className="secondary compact" onClick={() => onOpenMarketView(marketAuditEntry)}>
            {t("viewMarketSources")}
          </button>
        </div>
      ) : null}

      {canWrite && wine.quantity > 0 ? (
        <details className="detail-section consume-panel">
          <summary>
            <span>{t("consumeBottle")}</span>
          </summary>
          <p className="consume-help">{t("consumeBottleHelp")}</p>
          <form className="consume-form" onSubmit={submitConsume}>
            <div className="detail-grid consume-grid">
              <label>
                <span>{t("tastingDate")}</span>
                <input
                  type="date"
                  value={consumeDraft.consumed_at}
                  onChange={(event) => setConsumeDraft({ ...consumeDraft, consumed_at: event.target.value })}
                  disabled={saving}
                />
              </label>
              <label>
                <span>{t("tastingRating")}</span>
                <select
                  value={consumeDraft.tasting_rating}
                  onChange={(event) => setConsumeDraft({ ...consumeDraft, tasting_rating: event.target.value })}
                  disabled={saving}
                >
                  {Array.from({ length: 7 }).map((_, index) => (
                    <option key={index} value={String(index)}>
                      {index === 0 ? t("notSpecified") : `${index}/6`}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span>{t("tastingOccasion")}</span>
                <input
                  value={consumeDraft.tasting_occasion}
                  onChange={(event) => setConsumeDraft({ ...consumeDraft, tasting_occasion: event.target.value })}
                  disabled={saving}
                />
              </label>
              <label>
                <span>{t("tastingPairing")}</span>
                <input
                  value={consumeDraft.tasting_pairing}
                  onChange={(event) => setConsumeDraft({ ...consumeDraft, tasting_pairing: event.target.value })}
                  disabled={saving}
                />
              </label>
            </div>
            <label>
              <span>{t("tastingCompanions")}</span>
              <input
                value={consumeDraft.tasting_companions}
                onChange={(event) => setConsumeDraft({ ...consumeDraft, tasting_companions: event.target.value })}
                disabled={saving}
              />
            </label>
            <label>
              <span>{t("tastingNote")}</span>
              <textarea
                rows={3}
                value={consumeDraft.note}
                onChange={(event) => setConsumeDraft({ ...consumeDraft, note: event.target.value })}
                disabled={saving}
              />
            </label>
            <div className="form-actions">
              <button type="submit" disabled={saving}>
                <ButtonBusyContent busy={saving} idleLabel={t("saveTasting")} busyLabel={t("working")} />
              </button>
            </div>
          </form>
        </details>
      ) : null}

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
          <h3><i className="dashboard-section-icon" aria-hidden="true">{grapesSvgIcon()}</i>{t("grapes")}</h3>
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

      <TastingHistorySection
        wine={wine}
        entries={wine.tasting_history || []}
        canWrite={canWrite}
        saving={saving}
        onUpdateEntry={onUpdateTastingEntry}
        onDeleteEntry={onDeleteTastingEntry}
        t={t}
      />

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
  marketAuditEntry,
  onOpenMarketView,
  t,
  locale,
}: {
  item: WishlistItem;
  auditEntries: AiAuditLog[];
  canGenerate: boolean;
  generating: string;
  onGenerate: (feature: "strategy" | "purpose" | "target-price") => void;
  marketAuditEntry: AiAuditLog | null;
  onOpenMarketView: (entry: AiAuditLog) => void;
  t: (key: TranslationKey) => string;
  locale: Locale;
}) {
  const aiMarketPrice = item.ai_market_price ? formatMoney(item.ai_market_price, item.ai_market_price_currency || item.currency, locale) : "";
  const hasMarketEvidence = marketAuditEntry ? auditMarketSources(marketAuditEntry).length > 0 || Boolean(auditMarketNote(marketAuditEntry)) : false;
  const latestStrategyAudit = auditEntries
    .filter((entry) => entry.feature === "wishlist_strategy")
    .sort((first, second) => second.created_at.localeCompare(first.created_at))[0];
  const latestPurposeAudit = auditEntries
    .filter((entry) => entry.feature === "wishlist_purpose")
    .sort((first, second) => second.created_at.localeCompare(first.created_at))[0];
  const strategyGeneratedAt = item.ai_strategy_generated_at || latestStrategyAudit?.created_at || "";
  const purposeGeneratedAt = item.ai_purpose_generated_at || latestPurposeAudit?.created_at || "";
  const strategyTitle = strategyGeneratedAt ? `${t("aiStrategy")} - ${t("generatedAt")} ${formatDisplayDate(strategyGeneratedAt)}` : t("aiStrategy");
  const purposeTitle = purposeGeneratedAt ? `${t("aiPurpose")} - ${t("generatedAt")} ${formatDisplayDate(purposeGeneratedAt)}` : t("aiPurpose");
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
          <strong className="wishlist-price">{formatMoney(item.target_price, item.currency, locale)}</strong>
        </div>
      </div>
      <div className="ai-actions">
        <button type="button" className="secondary compact" disabled={!canGenerate || Boolean(generating)} onClick={() => onGenerate("strategy")}>
          <ButtonBusyContent busy={generating === "strategy"} idleLabel={t("aiStrategy")} busyLabel={t("generating")} />
        </button>
        <button type="button" className="secondary compact" disabled={!canGenerate || Boolean(generating)} onClick={() => onGenerate("purpose")}>
          <ButtonBusyContent busy={generating === "purpose"} idleLabel={t("aiPurpose")} busyLabel={t("generating")} />
        </button>
        <button type="button" className="secondary compact" disabled={!canGenerate || Boolean(generating)} onClick={() => onGenerate("target-price")}>
          <ButtonBusyContent busy={generating === "target-price"} idleLabel={t("aiTargetPrice")} busyLabel={t("generating")} />
        </button>
      </div>
      {generating ? <LoadingState label={t("generating")} compact /> : null}
      {item.ai_strategy || item.ai_purpose_advice ? (
        <div className="notes-grid wishlist-ai-summary">
          {item.ai_strategy ? <DetailNote title={strategyTitle}>{readableLegacyAiText(item.ai_strategy, "strategy")}</DetailNote> : null}
          {item.ai_purpose_advice ? <DetailNote title={purposeTitle}>{readableLegacyAiText(item.ai_purpose_advice, "purpose")}</DetailNote> : null}
        </div>
      ) : null}
      <div className="detail-grid">
        <DetailField label={t("format")} value={displayValue(item.format, locale, "format")} emptyLabel={t("notSpecified")} />
        <DetailField label={t("type")} value={displayValue(item.type, locale, "type")} emptyLabel={t("notSpecified")} />
        <DetailField label={t("priority")} value={displayValue(item.priority, locale, "priority")} emptyLabel={t("notSpecified")} />
        <DetailField label={t("purpose")} value={displayValue(item.purpose, locale, "purpose")} emptyLabel={t("notSpecified")} />
        <DetailField label={t("status")} value={displayValue(item.status, locale, "status")} emptyLabel={t("notSpecified")} />
        <DetailField label={t("targetPrice")} value={formatMoney(item.target_price, item.currency, locale)} emptyLabel={t("notSpecified")} />
        <DetailField label={t("aiMarketPrice")} value={aiMarketPrice} emptyLabel={t("notSpecified")} />
        <DetailField label={t("merchant")} value={item.merchant} emptyLabel={t("notSpecified")} />
      </div>
      {marketAuditEntry && hasMarketEvidence ? (
        <div className="market-view-bar">
          <button type="button" className="secondary compact" onClick={() => onOpenMarketView(marketAuditEntry)}>
            {t("viewMarketSources")}
          </button>
        </div>
      ) : null}
      {item.notes || item.ai_context_note ? (
        <div className="notes-grid">
          {item.notes ? <DetailNote title={t("notes")}>{item.notes}</DetailNote> : null}
          {item.ai_context_note ? <DetailNote title={t("aiContextNote")}>{item.ai_context_note}</DetailNote> : null}
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

function WishlistPortfolioStrategyPanel({
  strategy,
  canGenerate,
  generating,
  onGenerate,
  open,
  onToggle,
  t,
}: {
  strategy: WishlistPortfolioStrategy | null;
  canGenerate: boolean;
  generating: boolean;
  onGenerate: () => void;
  open: boolean;
  onToggle: (open: boolean) => void;
  t: (key: TranslationKey) => string;
}) {
  const generatedAtLabel = strategy?.generated_at ? `${t("generatedAt")} ${formatDisplayDate(strategy.generated_at)}` : "";
  return (
    <details className="wine-detail wishlist-portfolio-panel wishlist-strategy-details" open={open} onToggle={(event) => onToggle((event.currentTarget as HTMLDetailsElement).open)}>
      <summary className="wishlist-strategy-summary">
        <div className="detail-title">
          <div>
            <p className="eyebrow">{t("wishlist")}</p>
            <h2>{t("wishlistPortfolioStrategy")}</h2>
            <span>{t("wishlistPortfolioStrategyHelp")}</span>
            {strategy && !open ? (
              <div className="wishlist-strategy-preview">
                <div className="wishlist-strategy-preview-meta">
                  <strong>{strategy.item_count}</strong>
                  <span>{t("records")}</span>
                  <strong>{formatAiBudget(strategy.estimated_cost_usd)}</strong>
                  {generatedAtLabel ? <span>{generatedAtLabel}</span> : null}
                </div>
                <p>{clipUiText(strategy.buy_now || strategy.overview, 168)}</p>
              </div>
            ) : null}
          </div>
          <button type="button" className="secondary compact wishlist-strategy-cta" disabled={!canGenerate || generating} onClick={(event) => { event.preventDefault(); onGenerate(); }}>
            <ButtonBusyContent
              busy={generating}
              idleLabel={strategy ? t("refreshWishlistPortfolioStrategy") : t("generateWishlistPortfolioStrategy")}
              busyLabel={t("generating")}
            />
          </button>
        </div>
      </summary>
      {generating ? <LoadingState label={t("generating")} compact /> : null}
      {strategy ? (
        <>
          <div className="notes-grid">
            <DetailNote title={t("wishlistStrategyOverview")}>{strategy.overview}</DetailNote>
            <DetailNote title={t("wishlistStrategyBuyNow")}>{strategy.buy_now}</DetailNote>
            <DetailNote title={t("wishlistStrategyWaitWatch")}>{strategy.wait_watch}</DetailNote>
            <DetailNote title={t("wishlistStrategyAllocation")}>{strategy.allocation}</DetailNote>
            <DetailNote title={t("wishlistStrategyNextStep")}>{strategy.next_step}</DetailNote>
          </div>
          <div className="compare-ai-cost">
            <strong>{t("aiRequestCost")}</strong>
            <span>{formatAiBudget(strategy.estimated_cost_usd)}</span>
            {generatedAtLabel ? <span>{generatedAtLabel}</span> : null}
          </div>
        </>
      ) : (
        <p className="empty-state">{t("noWishlistPortfolioStrategy")}</p>
      )}
    </details>
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
  const [wineRecognitionResult, setWineRecognitionResult] = useState<WineRecognitionResult | null>(null);
  const [wineRecognitionTarget, setWineRecognitionTarget] = useState<"wine" | "wishlist">("wine");
  const [wineRecognitionLoading, setWineRecognitionLoading] = useState(false);
  const [wineEnrichmentLoading, setWineEnrichmentLoading] = useState(false);
  const [wishlist, setWishlist] = useState<WishlistItem[]>([]);
  const [wishlistLists, setWishlistLists] = useState<WishlistList[]>([]);
  const [userTags, setUserTags] = useState<UserTag[]>([]);
  const [shareOffers, setShareOffers] = useState<WineShareOffer[]>([]);
  const [passkeys, setPasskeys] = useState<Passkey[]>([]);
  const [householdMemberships, setHouseholdMemberships] = useState<HouseholdMembership[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [pendingUsers, setPendingUsers] = useState<PendingUser[]>([]);
  const [appUsers, setAppUsers] = useState<AppUser[]>([]);
  const [pendingCatalogEntries, setPendingCatalogEntries] = useState<CatalogWine[]>([]);
  const [catalogAdminQuery, setCatalogAdminQuery] = useState("");
  const [catalogAdminResults, setCatalogAdminResults] = useState<CatalogWine[]>([]);
  const [redeemCodes, setRedeemCodes] = useState<RedeemCode[]>([]);
  const [billingStatus, setBillingStatus] = useState<BillingStatus | null>(null);
  const [invites, setInvites] = useState<Invite[]>([]);
  const [receivedInvites, setReceivedInvites] = useState<Invite[]>([]);
  const [userNotifications, setUserNotifications] = useState<UserNotification[]>([]);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [operationalActionsExpanded, setOperationalActionsExpanded] = useState(false);
  const [operationalActionSnoozes, setOperationalActionSnoozes] = useState<OperationalActionSnoozes>(() => readOperationalActionSnoozes());
  const [aiAudit, setAiAudit] = useState<AiAuditLog[]>([]);
  const [aiAuditLimit, setAiAuditLimit] = useState("10");
  const [aiAuditDateFrom, setAiAuditDateFrom] = useState("");
  const [aiAuditDateTo, setAiAuditDateTo] = useState("");
  const [aiUsage, setAiUsage] = useState<AiUsage | null>(null);
  const [aiSettings, setAiSettings] = useState<AiSettings | null>(null);
  const [aiSettingsDraft, setAiSettingsDraft] = useState<AiSettingsDraft>(emptyAiSettingsDraft);
  const [draft, setDraft] = useState<WineDraft>(emptyDraft);
  const [wishlistDraft, setWishlistDraft] = useState<WishlistDraft>(emptyWishlistDraft);
  const [authDraft, setAuthDraft] = useState<AuthDraft>(emptyAuthDraft);
  const [contactSupportDraft, setContactSupportDraft] = useState<ContactSupportDraft>(emptyContactSupportDraft);
  const [inviteDraft, setInviteDraft] = useState<InviteDraft>(emptyInviteDraft);
  const [pairingDish, setPairingDish] = useState("");
  const [pairingMaxPrice, setPairingMaxPrice] = useState("");
  const [pairingIncludeMarket, setPairingIncludeMarket] = useState(false);
  const [pairingMarketOnly, setPairingMarketOnly] = useState(false);
  const [pairingIgnorePreferences, setPairingIgnorePreferences] = useState(false);
  const [pairingPreferLocal, setPairingPreferLocal] = useState(false);
  const [pairingLocalOrigin, setPairingLocalOrigin] = useState("");
  const [pairingResult, setPairingResult] = useState<PairingResult | null>(null);
  const [historySection, setHistorySection] = useState<HistorySection>("tastings");
  const [tastingArchivePage, setTastingArchivePage] = useState<TastingArchivePage | null>(null);
  const [tastingArchiveOverview, setTastingArchiveOverview] = useState<TastingArchivePage | null>(null);
  const [tastingArchiveOffset, setTastingArchiveOffset] = useState(0);
  const [tastingArchiveLoading, setTastingArchiveLoading] = useState(false);
  const [tagDraft, setTagDraft] = useState("");
  const [tagDraftColor, setTagDraftColor] = useState("#245142");
  const [quickTagDraft, setQuickTagDraft] = useState("");
  const [quickTagColor, setQuickTagColor] = useState("#245142");
  const [tagEdits, setTagEdits] = useState<Record<string, { name: string; color: string }>>({});
  const [acceptToken, setAcceptToken] = useState("");
  const [emailVerificationToken, setEmailVerificationToken] = useState("");
  const [emailVerificationConfirmed, setEmailVerificationConfirmed] = useState(false);
  const [inviteToken, setInviteToken] = useState("");
  const [generatedInviteLink, setGeneratedInviteLink] = useState("");
  const [redeemCodeDraft, setRedeemCodeDraft] = useState<RedeemCodeDraft>(emptyRedeemCodeDraft);
  const [redeemInput, setRedeemInput] = useState("");
  const [generatedRedeemCode, setGeneratedRedeemCode] = useState("");
  const [exportSelection, setExportSelection] = useState<ExportSelection>(defaultExportSelection);
  const [importSelection, setImportSelection] = useState<ImportSelection>(importSelectionFromBlocks(["wines", "wishlist"]));
  const [householdNameDraft, setHouseholdNameDraft] = useState("");
  const [newHouseholdNameDraft, setNewHouseholdNameDraft] = useState("");
  const [deleteHouseholdConfirmDraft, setDeleteHouseholdConfirmDraft] = useState("");
  const [userAiBalanceDrafts, setUserAiBalanceDrafts] = useState<Record<string, string>>({});
  const [userAiNoteDrafts, setUserAiNoteDrafts] = useState<Record<string, string>>({});
  const [shareDraft, setShareDraft] = useState({ email: "", share_pct: "50", message: "" });
  const [passkeyName, setPasskeyName] = useState("Vinaris");
  const [passkeyHelpOpen, setPasskeyHelpOpen] = useState(false);
  const [importPayload, setImportPayload] = useState<Record<string, unknown> | null>(null);
  const [importFileName, setImportFileName] = useState("");
  const [importMode, setImportMode] = useState<ImportMode>("skip_duplicates");
  const [importPreview, setImportPreview] = useState<ImportPreview | null>(null);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [offlineMode, setOfflineMode] = useState(false);
  const [offlineFileName, setOfflineFileName] = useState("");
  const [authMode, setAuthMode] = useState<"login" | "register">("login");
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [marketViewContext, setMarketViewContext] = useState<MarketViewContext | null>(null);
  const [compareWineIds, setCompareWineIds] = useState<string[]>([]);
  const [compareModalOpen, setCompareModalOpen] = useState(false);
  const [compareAiResult, setCompareAiResult] = useState<WineCompareAiResult | null>(null);
  const [wishlistPortfolioStrategy, setWishlistPortfolioStrategy] = useState<WishlistPortfolioStrategy | null>(null);
  const [wishlistPortfolioStrategyOpen, setWishlistPortfolioStrategyOpen] = useState(false);
  const [compareAiLoading, setCompareAiLoading] = useState(false);
  const [showBackToTop, setShowBackToTop] = useState(false);
  const [isOnline, setIsOnline] = useState(() => navigator.onLine);
  const [showOfflineBackupPanel, setShowOfflineBackupPanel] = useState(() => !navigator.onLine);
  const [openWineToneGroups, setOpenWineToneGroups] = useState<Record<WineTone, boolean>>({
    red: false,
    white: false,
    sparkling: false,
    rose: false,
    sweet: false,
    other: false,
  });
  const [isMobileViewport, setIsMobileViewport] = useState(() => window.innerWidth <= 820);
  const [activeView, setActiveView] = useState<ViewName>("home");
  const [dashboardFocus, setDashboardFocus] = useState<DashboardFocus>("collector");
  const [breakdownDrilldown, setBreakdownDrilldown] = useState<BreakdownDrilldown>(null);
  const [settingsTab, setSettingsTab] = useState<SettingsTab>("profile");
  const [selectedWineId, setSelectedWineId] = useState<string | null>(null);
  const [selectedWishlistId, setSelectedWishlistId] = useState<string | null>(null);
  const [selectedWishlistListId, setSelectedWishlistListId] = useState<string>("");
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
  const [grapeFilter, setGrapeFilter] = useState<string[]>([]);
  const [minBottlePriceFilter, setMinBottlePriceFilter] = useState("");
  const [maxBottlePriceFilter, setMaxBottlePriceFilter] = useState("");
  const [tagOptionQuery, setTagOptionQuery] = useState("");
  const [grapeOptionQuery, setGrapeOptionQuery] = useState("");
  const [sortMode, setSortMode] = useState<SortMode>("name");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [generatingAi, setGeneratingAi] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const errorBannerRef = useRef<HTMLDivElement | null>(null);
  const [locale, setLocale] = useState<Locale>(() => (navigator.language.toLowerCase().startsWith("it") ? "it" : "en"));
  const [themePreference, setThemePreference] = useState<ThemePreference>("system");
  const t = (key: TranslationKey) => translate(locale, key);
  const visibleError = formatUserErrorMessage(error, locale);
  const landing = landingContent[locale];
  const helpGuide = helpGuideContentV2[locale];
  const exportBlocks = [
    { key: "wines", label: t("exportIncludesWines") },
    { key: "wishlist", label: t("exportIncludesWishlist") },
    { key: "members", label: t("exportIncludesMembers") },
    { key: "invites", label: t("exportIncludesInvites") },
    { key: "share_offers", label: t("exportIncludesShareOffers") },
    { key: "user_tags", label: t("exportIncludesTags") },
    { key: "ai_audit", label: t("exportIncludesAiAudit") },
  ] as const;
  const hasSelectedExportBlock = exportBlocks.some(({ key }) => exportSelection[key]);
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
      type: normalizeWineType(template.type || baseDraft.type),
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
      type: normalizeWineType(template.type || baseDraft.type),
      currency: "currency" in template ? template.currency || baseDraft.currency : baseDraft.currency,
    });
  }

  function applyCatalogWineToDraft(item: CatalogWine, target: "wine" | "wishlist") {
    if (target === "wishlist") {
      setWishlistDraft((current) => ({
        ...current,
        name: item.name || current.name,
        producer: item.producer || current.producer,
        region: item.region || current.region,
        appellation: item.appellation || current.appellation,
        format: item.format || current.format,
        type: normalizeWineType(item.type || current.type),
      }));
      return;
    }
    setDraft((current) => ({
      ...current,
      name: item.name || current.name,
      producer: item.producer || current.producer,
      region: item.region || current.region,
      appellation: item.appellation || current.appellation,
      format: item.format || current.format,
      type: normalizeWineType(item.type || current.type),
      grapes: current.grapes.length || !item.grapes_text ? current.grapes : grapesFromText(item.grapes_text),
    }));
  }

  function needsWineLabelEnrichment(item: CatalogWine) {
    return !item.producer?.trim() || !item.type?.trim() || !item.region?.trim() || !item.appellation?.trim();
  }

  function hasCatalogComplementaryData(item: CatalogWine) {
    return Boolean(item.producer?.trim() || item.type?.trim() || item.region?.trim() || item.appellation?.trim() || item.country?.trim() || item.grapes_text?.trim());
  }

  function safeEnrichedWineName(inputLabel: string, enrichedName: string) {
    const label = inputLabel.trim();
    const enriched = enrichedName.trim();
    if (!enriched) return label;
    const labelWithoutTrailingVintage = label.replace(/\s+(?:19|20)\d{2}\s*$/i, "").replace(/\s+(?:NV|MV)\s*$/i, "").trim();
    const comparisonLabel = labelWithoutTrailingVintage || label;
    if (comparisonLabel.includes("'") && !enriched.includes("'") && comparisonLabel.toLowerCase().startsWith(enriched.toLowerCase())) {
      return comparisonLabel;
    }
    return enriched;
  }

  function clearWineRecognitionState() {
    setWineRecognitionResult(null);
    setWineEnrichmentLoading(false);
  }

  async function enrichCatalogSuggestionIfNeeded(catalogItem: CatalogWine, label: string, target: "wine" | "wishlist") {
    if (!needsWineLabelEnrichment(catalogItem)) return catalogItem;
    setWineEnrichmentLoading(true);
    try {
      const enrichment = await api<WineLabelEnrichment>("/api/v1/ai/wine-label/enrich", {
        method: "POST",
        body: JSON.stringify({ label, locale }),
      });
      if (target === "wine" && enrichment.vintage) {
        setDraft((current) => ({ ...current, vintage: current.vintage || enrichment.vintage }));
      }
      if (target === "wishlist" && enrichment.vintage) {
        setWishlistDraft((current) => ({ ...current, vintage: current.vintage || enrichment.vintage }));
      }
      return {
        ...catalogItem,
        name: safeEnrichedWineName(label, enrichment.name || catalogItem.name),
        producer: enrichment.producer || catalogItem.producer,
        region: enrichment.region || catalogItem.region,
        appellation: enrichment.appellation || catalogItem.appellation,
        type: normalizeWineType(enrichment.type || catalogItem.type),
        country: enrichment.country || catalogItem.country,
        grapes_text: enrichment.grapes_text || catalogItem.grapes_text,
      };
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Unable to enrich recognized wine");
      return catalogItem;
    } finally {
      setWineEnrichmentLoading(false);
    }
  }

  async function applyRecognizedCatalogItem(item: CatalogWine, label: string, target: "wine" | "wishlist") {
    const catalogItem = await enrichCatalogSuggestionIfNeeded(item, label, target);
    applyCatalogWineToDraft(catalogItem, target);
    if (!hasCatalogComplementaryData(catalogItem)) {
      clearWineRecognitionState();
      return;
    }
    try {
      const created = await api<CatalogWine>("/api/v1/wines/catalog", {
        method: "POST",
        body: JSON.stringify({ ...catalogItem, aliases: [label] }),
      });
      if (created.is_active) {
        setWineCatalog((current) => [created, ...current.filter((currentItem) => currentItem.id !== created.id)]);
      } else if (session?.is_app_admin) {
        await loadPendingCatalogEntries(true);
      }
    } catch {
      // The draft is still useful even if catalog enrichment is denied or already exists.
    } finally {
      clearWineRecognitionState();
    }
  }

  async function applyRecognitionSuggestion(suggestion: WineRecognitionResult["suggestions"][number], target: "wine" | "wishlist") {
    const catalogItem: CatalogWine = {
      name: suggestion.label,
      producer: suggestion.producer,
      region: suggestion.region,
      appellation: suggestion.appellation,
      type: normalizeWineType(suggestion.type),
      format: "Bottle (750ml)",
    };
    await applyRecognizedCatalogItem(catalogItem, suggestion.label, target);
  }

  async function enrichManualWineDraft() {
    const label = draft.name.trim();
    if (!label) return;
    setWineEnrichmentLoading(true);
    try {
      const enrichment = await api<WineLabelEnrichment>("/api/v1/ai/wine-label/enrich", {
        method: "POST",
        body: JSON.stringify({ label, locale, source: "manual" }),
      });
      const catalogItem: CatalogWine = {
        name: safeEnrichedWineName(label, enrichment.name),
        producer: enrichment.producer,
        region: enrichment.region,
        appellation: enrichment.appellation,
        type: normalizeWineType(enrichment.type),
        country: enrichment.country,
        grapes_text: enrichment.grapes_text,
        format: draft.format || "Bottle (750ml)",
      };
      applyCatalogWineToDraft(catalogItem, "wine");
      if (enrichment.vintage) {
        setDraft((current) => ({ ...current, vintage: current.vintage || enrichment.vintage }));
      }
      if (enrichment.grapes_text) {
        const grapes = grapesFromText(enrichment.grapes_text);
        if (grapes.length) {
          setDraft((current) => ({ ...current, grapes: current.grapes.length ? current.grapes : grapes }));
        }
      }
      if (hasCatalogComplementaryData(catalogItem)) {
        try {
          const created = await api<CatalogWine>("/api/v1/wines/catalog", {
            method: "POST",
            body: JSON.stringify({ ...catalogItem, aliases: [label] }),
          });
          if (created.is_active) {
            setWineCatalog((current) => [created, ...current.filter((currentItem) => currentItem.id !== created.id)]);
          } else if (session?.is_app_admin) {
            await loadPendingCatalogEntries(true);
          }
        } catch {
          // The AI-filled draft is still useful even if catalog creation is denied or duplicated.
        }
      }
      await Promise.all([loadAiSettings(), loadAiUsage(), loadBilling()]);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Unable to search wine data with AI");
    } finally {
      setWineEnrichmentLoading(false);
    }
  }

  async function recognizeWineImage(file: File, target: "wine" | "wishlist") {
    const formData = new FormData();
    formData.append("image", file);
    setWineRecognitionLoading(true);
    setWineRecognitionTarget(target);
    setWineRecognitionResult(null);
    try {
      const result = await api<WineRecognitionResult>("/api/v1/wines/catalog/recognize", {
        method: "POST",
        body: formData,
      });
      setWineRecognitionResult(result);
      const resultCount = result.matches.length || result.suggestions.length;
      if (result.matches.length === 1 && resultCount === 1) {
        await applyRecognizedCatalogItem(result.matches[0], result.raw_best_label || result.matches[0].name, target);
      } else if (!result.matches.length && result.suggestions.length === 1) {
        await applyRecognitionSuggestion(result.suggestions[0], target);
      }
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Unable to recognize wine");
    } finally {
      setWineRecognitionLoading(false);
    }
  }

  function handleWineRecognitionInput(event: ChangeEvent<HTMLInputElement>, target: "wine" | "wishlist") {
    const file = event.target.files?.[0];
    if (file) void recognizeWineImage(file, target);
    event.currentTarget.value = "";
  }

  function applySessionPreferences(nextSession: Session) {
    setLocale(nextSession.locale || "it");
    setThemePreference(nextSession.theme_preference || "system");
  }

  useEffect(() => {
    if (!visibleError) return;
    errorBannerRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [visibleError]);

  useEffect(() => {
    if (!session?.authenticated) return;
    const query = (wineFormOpen ? draft.name : wishlistFormOpen ? wishlistDraft.name : "").trim();
    if (query.length < 2) {
      setWineCatalog([]);
      return;
    }
    const abortController = new AbortController();
    const timer = window.setTimeout(() => {
      api<CatalogWine[]>(`/api/v1/wines/catalog?q=${encodeURIComponent(query)}&limit=20`, { signal: abortController.signal })
        .then(setWineCatalog)
        .catch((nextError) => {
          if ((nextError as Error).name !== "AbortError") setWineCatalog([]);
        });
    }, 180);
    return () => {
      window.clearTimeout(timer);
      abortController.abort();
    };
  }, [draft.name, wishlistDraft.name, wineFormOpen, wishlistFormOpen, session?.authenticated]);

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

  async function loadTastingArchive(offset = tastingArchiveOffset) {
    if (offlineMode || !session?.authenticated) {
      setTastingArchivePage(null);
      return;
    }
    setTastingArchiveLoading(true);
    try {
      const query = new URLSearchParams();
      if (searchQuery.trim()) query.set("q", searchQuery.trim());
      if (typeFilter) query.set("type", typeFilter);
      if (statusFilter) query.set("status", statusFilter);
      query.set("limit", String(TASTING_ARCHIVE_PAGE_SIZE));
      query.set("offset", String(offset));
      const nextPage = await api<TastingArchivePage>(`/api/v1/wines/tasting-archive?${query.toString()}`);
      setTastingArchivePage(nextPage);
      setTastingArchiveOffset(nextPage.offset);
    } finally {
      setTastingArchiveLoading(false);
    }
  }

  async function loadTastingArchiveOverview(authenticated = session?.authenticated) {
    if (offlineMode || !authenticated) {
      setTastingArchiveOverview(null);
      return;
    }
    const query = new URLSearchParams();
    query.set("limit", "5");
    query.set("offset", "0");
    const nextPage = await api<TastingArchivePage>(`/api/v1/wines/tasting-archive?${query.toString()}`);
    setTastingArchiveOverview(nextPage);
  }

  async function loadWineDetail(wineId: string) {
    const detailedWine = await api<Wine>(`/api/v1/wines/${wineId}`);
    setWines((current) => current.map((wine) => (wine.id === detailedWine.id ? detailedWine : wine)));
    return detailedWine;
  }

  async function loadWishlistLists() {
    const nextLists = await api<WishlistList[]>("/api/v1/wishlist/lists");
    setWishlistLists(nextLists);
    setSelectedWishlistListId((currentId) => {
      if (currentId && nextLists.some((item) => item.id === currentId)) return currentId;
      return nextLists[0]?.id || "";
    });
    return nextLists;
  }

  async function loadWishlist(listId = selectedWishlistListId) {
    const query = listId ? `?wishlist_list_id=${encodeURIComponent(listId)}` : "";
    const nextWishlist = await api<WishlistItem[]>(`/api/v1/wishlist${query}`);
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
          .map((pendingUser) => ({
            ...pendingUser,
            is_approved: false,
            is_app_admin: false,
            is_blocked: false,
            can_use_label_recognition: false,
            ai_credit_balance_usd: "0.000000",
            approved_at: null,
            entitlement_valid_until: null,
            entitlement_days_remaining: null,
          })),
      ].sort((first, second) => Number(first.is_approved) - Number(second.is_approved) || first.email.localeCompare(second.email));
      setAppUsers(mergedUsers);
      setPendingUsers(mergedUsers.filter((user) => !user.is_approved));
      setUserAiBalanceDrafts(Object.fromEntries(mergedUsers.map((user) => [user.id, String(Number(user.ai_credit_balance_usd || 0).toFixed(2))])));
      setUserAiNoteDrafts((current) => Object.fromEntries(mergedUsers.map((user) => [user.id, current[user.id] || ""])));
    } else {
      setAppUsers([]);
      setPendingUsers([]);
      setPendingCatalogEntries([]);
      setCatalogAdminResults([]);
      setUserAiBalanceDrafts({});
      setUserAiNoteDrafts({});
    }
  }

  async function loadPendingCatalogEntries(isAppAdmin = session?.is_app_admin) {
    if (isAppAdmin) {
      setPendingCatalogEntries(await api<CatalogWine[]>("/api/v1/wines/catalog/pending"));
    } else {
      setPendingCatalogEntries([]);
      setCatalogAdminResults([]);
    }
  }

  async function searchCatalogAdminEntries(query = catalogAdminQuery) {
    if (!session?.is_app_admin || !query.trim()) {
      setCatalogAdminResults([]);
      return;
    }
    const results = await api<CatalogWine[]>(`/api/v1/wines/catalog/admin?q=${encodeURIComponent(query.trim())}&limit=50`);
    setCatalogAdminResults(results);
  }

  function openAuthPanel(mode: "login" | "register") {
    setAuthMode(mode);
    setAuthModalOpen(true);
    if (!isMobileViewport) {
      return;
    }
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
      const nextAudit = await api<AiAuditLog[]>("/api/v1/ai/audit");
      setAiAudit(nextAudit);
      return nextAudit;
    } else {
      setAiAudit([]);
      return [];
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
        provider_mode: nextSettings.provider_mode,
        ai_notes_model: nextSettings.ai_notes_model,
        drink_window_model: nextSettings.drink_window_model,
        value_model: nextSettings.value_model,
        grape_model: nextSettings.grape_model,
        wishlist_model: nextSettings.wishlist_model,
        pairing_model: nextSettings.pairing_model,
        pairing_preferences: nextSettings.pairing_preferences || "",
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
    const nextLists = await loadWishlistLists();
    const activeWishlistListId = selectedWishlistListId && nextLists.some((item) => item.id === selectedWishlistListId)
      ? selectedWishlistListId
      : nextLists[0]?.id || "";
    await Promise.all([loadWines(), loadWishlist(activeWishlistListId), loadShareOffers(nextSession.authenticated), loadReceivedInvites(nextSession.authenticated), loadNotifications(nextSession.authenticated), loadTags(nextSession.membership_role), loadPasskeys(nextSession.authenticated), loadHouseholdData(nextSession.membership_role), loadAppUsers(nextSession.is_app_admin), loadPendingCatalogEntries(nextSession.is_app_admin), loadBilling(nextSession.authenticated, nextSession.is_app_admin), loadAiAudit(nextSession.membership_role), loadAiUsage(nextSession.membership_role), loadAiSettings(nextSession.membership_role), loadTastingArchiveOverview(nextSession.authenticated)]);
  }

  async function loadData() {
    if (offlineMode) return;
    setLoading(true);
    setError("");
    try {
      const nextSession = await loadSession();
      if (nextSession.authenticated) {
        if (!nextSession.is_app_admin && !nextSession.has_active_entitlement) {
          setWines([]);
          setWineCatalog([]);
          setWishlist([]);
          setWishlistLists([]);
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
          setPendingCatalogEntries([]);
          setCatalogAdminResults([]);
          setAiAudit([]);
          setAiUsage(null);
          setAiSettings(null);
          setAiSettingsDraft(emptyAiSettingsDraft);
          setTastingArchiveOverview(null);
          await loadAuthenticatedSessionData(nextSession);
        } else {
          await loadAuthenticatedSessionData(nextSession);
        }
      } else {
        setWines([]);
        setWineCatalog([]);
        setWishlist([]);
        setWishlistLists([]);
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
        setPendingCatalogEntries([]);
        setCatalogAdminResults([]);
        setAiAudit([]);
        setAiUsage(null);
        setAiSettings(null);
        setAiSettingsDraft(emptyAiSettingsDraft);
        setTastingArchiveOverview(null);
        setBillingStatus(null);
        setRedeemCodes([]);
      }
    } finally {
      setLoading(false);
    }
  }

  async function refreshAfterStripeCheckout() {
    const pendingPlan = window.sessionStorage.getItem(STRIPE_CHECKOUT_PLAN_KEY) as PaymentPlan | null;
    const previousAiBalance = Number(window.sessionStorage.getItem(STRIPE_CHECKOUT_BALANCE_KEY) || "0");
    for (let attempt = 0; attempt < 8; attempt += 1) {
      const nextSession = await loadSession();
      if (nextSession.authenticated) {
        const nextStatus = await api<BillingStatus>("/api/v1/billing/status");
        setBillingStatus(nextStatus);
        const nextAiBalance = Number(nextStatus.ai_credit_balance_usd || 0);
        const checkoutApplied =
          pendingPlan === "ai_credits"
            ? nextAiBalance > previousAiBalance
            : (nextStatus.available_redeem_codes.length > 0 || nextStatus.has_active_entitlement);
        if (checkoutApplied) {
          await loadData();
          window.sessionStorage.removeItem(STRIPE_CHECKOUT_PLAN_KEY);
          window.sessionStorage.removeItem(STRIPE_CHECKOUT_BALANCE_KEY);
          window.history.replaceState(null, "", window.location.pathname);
          return;
        }
      }
      if (nextSession.is_app_admin) {
        window.sessionStorage.removeItem(STRIPE_CHECKOUT_PLAN_KEY);
        window.sessionStorage.removeItem(STRIPE_CHECKOUT_BALANCE_KEY);
        window.history.replaceState(null, "", window.location.pathname);
        return;
      }
      await new Promise((resolve) => window.setTimeout(resolve, 1500));
    }
    window.sessionStorage.removeItem(STRIPE_CHECKOUT_PLAN_KEY);
    window.sessionStorage.removeItem(STRIPE_CHECKOUT_BALANCE_KEY);
    await loadData();
  }

  useEffect(() => {
    const urlToken = tokenFromUrl();
    if (urlToken) {
      setAcceptToken(urlToken);
    }
    const stripeCheckoutResult = stripeCheckoutResultFromUrl();
    const emailVerificationResult = emailVerificationResultFromUrl();
    const emailVerificationToken = emailVerificationTokenFromUrl();
    if (emailVerificationToken) {
      setEmailVerificationToken(emailVerificationToken);
      setEmailVerificationConfirmed(false);
      setAuthMode("login");
      setAuthModalOpen(true);
      window.history.replaceState(null, "", window.location.pathname);
    }
    if (emailVerificationResult === "success") {
      setNotice(t("emailVerificationSuccess"));
      window.history.replaceState(null, "", window.location.pathname);
    } else if (emailVerificationResult === "expired") {
      setError(t("emailVerificationExpired"));
      window.history.replaceState(null, "", window.location.pathname);
    } else if (emailVerificationResult === "invalid") {
      setError(t("emailVerificationInvalid"));
      window.history.replaceState(null, "", window.location.pathname);
    }
    if (stripeCheckoutResult === "cancelled") {
      window.sessionStorage.removeItem(STRIPE_CHECKOUT_PLAN_KEY);
      window.sessionStorage.removeItem(STRIPE_CHECKOUT_BALANCE_KEY);
    }
    const loader = stripeCheckoutResult === "success" ? refreshAfterStripeCheckout() : loadData();
    loader.catch((nextError) => setError(nextError instanceof Error ? nextError.message : "Unable to load data"));
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

  useEffect(() => {
    const mediaQuery = window.matchMedia("(max-width: 820px)");
    const syncViewport = () => {
      const mobile = mediaQuery.matches;
      setIsMobileViewport(mobile);
      if (mobile) {
        setAuthModalOpen(false);
      }
    };
    syncViewport();
    mediaQuery.addEventListener("change", syncViewport);
    return () => mediaQuery.removeEventListener("change", syncViewport);
  }, []);

  useEffect(() => {
    const syncScrollState = () => setShowBackToTop(window.scrollY > 520);
    syncScrollState();
    window.addEventListener("scroll", syncScrollState, { passive: true });
    return () => window.removeEventListener("scroll", syncScrollState);
  }, []);

  useEffect(() => {
    const syncOnlineState = () => {
      const nextOnline = navigator.onLine;
      setIsOnline(nextOnline);
      setShowOfflineBackupPanel(!nextOnline);
    };
    window.addEventListener("online", syncOnlineState);
    window.addEventListener("offline", syncOnlineState);
    return () => {
      window.removeEventListener("online", syncOnlineState);
      window.removeEventListener("offline", syncOnlineState);
    };
  }, []);

  async function submitAuth(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError("");
    if (authMode === "register" && authDraft.password !== authDraft.password_confirm) {
      setError(t("passwordMismatch"));
      setSaving(false);
      return;
    }
    try {
      const path = authMode === "register" ? "/api/v1/auth/register" : "/api/v1/auth/login";
      const payload =
        authMode === "register"
          ? { email: authDraft.email, display_name: authDraft.display_name, household_name: authDraft.household_name, password: authDraft.password }
          : { email: authDraft.email, password: authDraft.password };
      const nextSession = await api<Session>(path, { method: "POST", body: JSON.stringify(payload) });
      setSession(nextSession);
      if (authMode === "register") {
        setEmailVerificationConfirmed(false);
      }
      if (nextSession.authenticated) {
        applySessionPreferences(nextSession);
      }
      setShowOfflineBackupPanel(false);
      setAuthDraft(emptyAuthDraft);
      if (nextSession.authenticated) {
        setLoading(true);
        try {
          await loadAuthenticatedSessionData(nextSession);
        } finally {
          setLoading(false);
        }
      }
    } catch (nextError) {
      const nextMessage = nextError instanceof Error ? nextError.message : "Unable to authenticate";
      if (isConnectivityError(nextMessage)) {
        setShowOfflineBackupPanel(true);
      }
      setError(nextMessage);
    } finally {
      setSaving(false);
    }
  }

  async function confirmEmailVerification() {
    if (!emailVerificationToken) return;
    setSaving(true);
    setError("");
    setNotice("");
    try {
      await api<{ status: string }>("/api/v1/auth/verify-email", {
        method: "POST",
        body: JSON.stringify({ token: emailVerificationToken }),
      });
      setEmailVerificationToken("");
      setEmailVerificationConfirmed(true);
      setSession((current) => (current ? { ...current, pending_email_verification: false } : current));
      setNotice(t("emailVerificationSuccess"));
      setAuthMode("login");
      setAuthModalOpen(true);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Unable to confirm email");
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
      setShowOfflineBackupPanel(false);
      setLoading(true);
      try {
        await loadAuthenticatedSessionData(nextSession);
      } finally {
        setLoading(false);
      }
    } catch (nextError) {
      const nextMessage = nextError instanceof Error ? nextError.message : "Unable to login with passkey";
      if (isConnectivityError(nextMessage)) {
        setShowOfflineBackupPanel(true);
      }
      setError(nextMessage);
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
      pending_email_verification: false,
      locale: navigator.language.toLowerCase().startsWith("it") ? "it" : "en",
      theme_preference: "system",
      can_use_label_recognition: false,
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
    setNewHouseholdNameDraft("");
    setDeleteHouseholdConfirmDraft("");
    setMembers([]);
    setPendingUsers([]);
    setAppUsers([]);
    setPendingCatalogEntries([]);
    setCatalogAdminResults([]);
    setCatalogAdminQuery("");
    setRedeemCodes([]);
    setBillingStatus(null);
    setRedeemInput("");
    setGeneratedRedeemCode("");
    setDraft(emptyDraft);
    setWishlistDraft({ ...emptyWishlistDraft, wishlist_list_id: "" });
    setEditingId(null);
    setEditingWishlistId(null);
    setSelectedWineId(null);
    setSelectedWishlistId(null);
    setSelectedWishlistListId("");
    setWineFormOpen(false);
    setWishlistFormOpen(false);
    setAiAudit([]);
    setAiUsage(null);
    setAiSettings(null);
    setAiSettingsDraft(emptyAiSettingsDraft);
    setTastingArchivePage(null);
    setTastingArchiveOverview(null);
    setTastingArchiveOffset(0);
    setWishlistPortfolioStrategy(null);
  }

  async function switchHousehold(householdId: string) {
    setError("");
    await api<Session>("/api/v1/household/switch", { method: "POST", body: JSON.stringify({ household_id: householdId }) });
    setDraft(emptyDraft);
    setWishlistDraft({ ...emptyWishlistDraft, wishlist_list_id: "" });
    setEditingId(null);
    setEditingWishlistId(null);
    setSelectedWineId(null);
    setSelectedWishlistId(null);
    setSelectedWishlistListId("");
    setTastingArchivePage(null);
    setTastingArchiveOverview(null);
    setTastingArchiveOffset(0);
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

  async function createHousehold(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextName = newHouseholdNameDraft.trim();
    if (!nextName) return;
    setSaving(true);
    setError("");
    try {
      await api<HouseholdMembership>("/api/v1/household", {
        method: "POST",
        body: JSON.stringify({ name: nextName }),
      });
      setNewHouseholdNameDraft("");
      await loadData();
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Unable to create cellar");
    } finally {
      setSaving(false);
    }
  }

  async function deleteActiveHousehold() {
    const expectedName = session?.active_household_name?.trim() || "";
    if (!expectedName || deleteHouseholdConfirmDraft.trim() !== expectedName) {
      setError(t("deleteCellarMismatch"));
      return;
    }
    if (!window.confirm(t("deleteCellarConfirm"))) return;
    setSaving(true);
    setError("");
    try {
      await api("/api/v1/household", { method: "DELETE" });
      setHouseholdNameDraft("");
      setNewHouseholdNameDraft("");
      setDeleteHouseholdConfirmDraft("");
      await loadData();
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Unable to delete cellar");
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

  async function toggleLabelRecognition(user: AppUser) {
    setSaving(true);
    setError("");
    try {
      await api<AppUser>(`/api/v1/auth/users/${user.id}`, { method: "PATCH", body: JSON.stringify({ can_use_label_recognition: !user.can_use_label_recognition }) });
      await loadAppUsers();
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Unable to update user");
    } finally {
      setSaving(false);
    }
  }

  async function updateUserAiCreditBalance(user: AppUser) {
    const targetValue = (userAiBalanceDrafts[user.id] || "").trim();
    if (!targetValue) return;
    setSaving(true);
    setError("");
    try {
      await api<AppUser>(`/api/v1/auth/users/${user.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          ai_credit_balance_target_usd: targetValue,
          ai_credit_note: (userAiNoteDrafts[user.id] || "").trim(),
        }),
      });
      await loadAppUsers();
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Unable to update AI budget");
    } finally {
      setSaving(false);
    }
  }

  async function approveCatalogEntry(entry: CatalogWine) {
    if (!entry.id) return;
    setSaving(true);
    setError("");
    try {
      const approved = await api<CatalogWine>(`/api/v1/wines/catalog/${entry.id}/approve`, { method: "POST" });
      setPendingCatalogEntries((current) => current.filter((item) => item.id !== approved.id));
      setWineCatalog((current) => [approved, ...current.filter((item) => item.id !== approved.id)]);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Unable to approve catalog entry");
    } finally {
      setSaving(false);
    }
  }

  async function deleteCatalogEntry(entry: CatalogWine) {
    if (!entry.id || !window.confirm(`${t("deleteCatalogEntry")}: ${[entry.producer, entry.name].filter(Boolean).join(" - ") || entry.name}?`)) return;
    setSaving(true);
    setError("");
    try {
      await api<void>(`/api/v1/wines/catalog/${entry.id}`, { method: "DELETE" });
      setPendingCatalogEntries((current) => current.filter((item) => item.id !== entry.id));
      setCatalogAdminResults((current) => current.filter((item) => item.id !== entry.id));
      setWineCatalog((current) => current.filter((item) => item.id !== entry.id));
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Unable to delete catalog entry");
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
      window.sessionStorage.setItem(STRIPE_CHECKOUT_PLAN_KEY, plan);
      window.sessionStorage.setItem(STRIPE_CHECKOUT_BALANCE_KEY, String(Number(billingStatus?.ai_credit_balance_usd || aiSettings?.app_credit_balance_usd || 0)));
      const checkout = await api<CheckoutSession>("/api/v1/billing/checkout", { method: "POST", body: JSON.stringify({ plan }) });
      window.location.assign(checkout.checkout_url);
    } catch (nextError) {
      window.sessionStorage.removeItem(STRIPE_CHECKOUT_PLAN_KEY);
      window.sessionStorage.removeItem(STRIPE_CHECKOUT_BALANCE_KEY);
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
    } else if (notification.action_url?.includes("/settings/ai")) {
      setActiveView("settings");
      setSettingsTab("ai");
    } else if (notification.action_url?.includes("/home")) {
      setActiveView("home");
    } else if (notification.action_url?.includes("/cellar")) {
      setActiveView("cellar");
    } else if (notification.action_url?.includes("/wishlist")) {
      setActiveView("wishlist");
    } else if (notification.action_url?.includes("/history")) {
      setActiveView("history");
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
      const nextWishlistLists = rawArray(payload.wishlist_lists).map((item, index) => ({
        id: rawString(item.id, `offline-wishlist-list-${index}`),
        household_id: rawString(item.household_id, rawString(household.id, "offline")),
        name: rawString(item.name, `Wishlist ${index + 1}`),
        description: rawString(item.description),
        item_count: nextWishlist.filter((wishlistItem) => wishlistItem.wishlist_list_id === rawString(item.id, `offline-wishlist-list-${index}`)).length,
      }));
      const derivedWishlistLists = nextWishlistLists.length
        ? nextWishlistLists
        : [{
            id: "offline-default",
            household_id: rawString(household.id, "offline"),
            name: "Wishlist",
            description: "",
            item_count: nextWishlist.length,
          }];
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
        pending_email_verification: false,
        locale,
        theme_preference: themePreference,
        can_use_label_recognition: false,
        has_active_entitlement: true,
        entitlement_valid_until: null,
        entitlement_days_remaining: null,
      });
      setWines(nextWines);
      setWishlist(nextWishlist);
      setWishlistLists(derivedWishlistLists);
      setSelectedWishlistListId(derivedWishlistLists[0]?.id || "");
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
      setPendingCatalogEntries([]);
      setCatalogAdminResults([]);
      setCatalogAdminQuery("");
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
        provider_mode: nextSettings.provider_mode,
        ai_notes_model: nextSettings.ai_notes_model,
        drink_window_model: nextSettings.drink_window_model,
        value_model: nextSettings.value_model,
        grape_model: nextSettings.grape_model,
        wishlist_model: nextSettings.wishlist_model,
        pairing_model: nextSettings.pairing_model,
        pairing_preferences: nextSettings.pairing_preferences || "",
      });
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Unable to save AI settings");
    } finally {
      setSaving(false);
    }
  }

  async function savePairingPreferences() {
    setSaving(true);
    setError("");
    setNotice("");
    try {
      const nextSettings = await api<AiSettings>("/api/v1/ai/settings", {
        method: "PATCH",
        body: JSON.stringify({ pairing_preferences: aiSettingsDraft.pairing_preferences }),
      });
      setAiSettings(nextSettings);
      setAiSettingsDraft((current) => ({
        ...current,
        pairing_preferences: nextSettings.pairing_preferences || "",
      }));
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Unable to save pairing preferences");
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
      setWishlistDraft({ ...emptyWishlistDraft, wishlist_list_id: selectedWishlistListId });
      setEditingWishlistId(null);
      setWishlistFormOpen(false);
      await Promise.all([loadWishlist(), loadWishlistLists()]);
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
      const preview = await api<ImportPreview>("/api/v1/imports/json/preview", {
        method: "POST",
        body: JSON.stringify(payload),
      });
      setImportPayload(payload);
      setImportFileName(file.name);
      setImportPreview(preview);
      setImportSelection(importSelectionFromBlocks(preview.included_blocks));
      setImportResult(null);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Unable to import JSON backup");
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
      const result = await api<ImportResult>(`/api/v1/imports/json?mode=${importMode}`, {
        method: "POST",
        body: JSON.stringify({
          ...importPayload,
          import_blocks: exportBlocks.filter(({ key }) => importSelection[key]).map(({ key }) => key),
        }),
      });
      setImportResult(result);
      setImportPreview(null);
      setImportPayload(null);
      setImportFileName("");
      await Promise.all([loadWines(), loadWishlist(), loadWishlistLists(), loadHouseholdData(), loadTags(), loadAiAudit(session?.membership_role)]);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Unable to import JSON backup");
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
      await Promise.all([loadWines(), loadWishlist(), loadWishlistLists()]);
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
      const query = new URLSearchParams();
      for (const [key, value] of Object.entries(exportSelection)) {
        query.set(`include_${key}`, value ? "true" : "false");
      }
      const payload = await api<Record<string, unknown>>(`/api/v1/imports/export-json?${query.toString()}`);
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `vinaris-cellar-export-${new Date().toISOString().slice(0, 10)}.json`;
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
      setWishlistDraft({ ...emptyWishlistDraft, wishlist_list_id: selectedWishlistListId });
      setWishlistFormOpen(false);
    }
    await Promise.all([loadWishlist(), loadWishlistLists()]);
  }

  async function convertWishlistItem(item: WishlistItem) {
    if (!window.confirm(`Convert ${item.name} to an ordered wine?`)) return;
    setSaving(true);
    setError("");
    try {
      await api<{ wine_id: string }>(`/api/v1/wishlist/${item.id}/convert`, { method: "POST" });
      setWishlistFormOpen(false);
      setEditingWishlistId(null);
      await Promise.all([loadWines(), loadWishlist(), loadWishlistLists()]);
      setActiveView("cellar");
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Unable to convert wishlist item");
    } finally {
      setSaving(false);
    }
  }

  async function generateWineAi(wine: Wine, feature: WineAiFeature, options?: { openMarketModal?: boolean }) {
    const openMarketModal = options?.openMarketModal ?? true;
    setGeneratingAi(feature);
    setError("");
    try {
      const updated = await api<Wine>(`/api/v1/ai/wines/${wine.id}/${feature}`, {
        method: "POST",
        body: JSON.stringify({ locale }),
      });
      setWines((current) => current.map((item) => (item.id === updated.id ? updated : item)));
      setSelectedWineId(updated.id);
      const [nextAudit] = await Promise.all([loadAiAudit(), loadAiUsage()]);
      if (feature === "value" && openMarketModal) {
        const marketEntry = nextAudit.find((entry) => entry.entity_type === "wine" && entry.entity_id === updated.id && entry.feature === "ai_value");
        if (marketEntry && auditMarketSources(marketEntry).length) {
          setMarketViewContext({ kind: "wine", wine: updated, entry: marketEntry });
        }
      }
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Unable to generate AI content");
    } finally {
      setGeneratingAi("");
    }
  }

  async function generateCompareAi() {
    if (compareWineIds.length !== 2) {
      setError(t("aiCompareOnlyTwo"));
      return;
    }
    setCompareAiLoading(true);
    setError("");
    try {
      const result = await api<WineCompareAiResult>("/api/v1/ai/compare-wines", {
        method: "POST",
        body: JSON.stringify({ wine_ids: compareWineIds, locale }),
      });
      setCompareAiResult(result);
      await Promise.all([loadAiAudit(), loadAiUsage(), loadBilling()]);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Unable to generate AI comparison");
    } finally {
      setCompareAiLoading(false);
    }
  }

  async function consumeWineBottle(wine: Wine, payload: ConsumeWineDraft) {
    setSaving(true);
    setError("");
    try {
      const updated = await api<Wine>(`/api/v1/wines/${wine.id}/consume`, {
        method: "POST",
        body: JSON.stringify({
          consumed_at: payload.consumed_at || undefined,
          note: payload.note.trim(),
          tasting_rating: Number(payload.tasting_rating || 0),
          tasting_occasion: payload.tasting_occasion.trim(),
          tasting_pairing: payload.tasting_pairing.trim(),
          tasting_companions: payload.tasting_companions.trim(),
        }),
      });
      setWines((current) => current.map((item) => (item.id === updated.id ? updated : item)));
      setSelectedWineId(updated.id);
      await loadTastingArchiveOverview();
      if (!offlineMode && activeView === "history" && historySection === "tastings") {
        await loadTastingArchive(tastingArchiveOffset);
      }
      setHistorySection("tastings");
      if (activeView === "cellar") {
        setActiveView("history");
        clearFilters("history");
      }
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Unable to register tasting");
    } finally {
      setSaving(false);
    }
  }

  async function updateWineTastingEntry(wine: Wine, entryId: string, payload: ConsumeWineDraft) {
    setSaving(true);
    setError("");
    try {
      const updated = await api<Wine>(`/api/v1/wines/${wine.id}/tastings/${entryId}`, {
        method: "PATCH",
        body: JSON.stringify({
          consumed_at: payload.consumed_at,
          note: payload.note.trim(),
          tasting_rating: Number(payload.tasting_rating || 0),
          tasting_occasion: payload.tasting_occasion.trim(),
          tasting_pairing: payload.tasting_pairing.trim(),
          tasting_companions: payload.tasting_companions.trim(),
        }),
      });
      setWines((current) => current.map((item) => (item.id === updated.id ? updated : item)));
      setSelectedWineId(updated.id);
      await loadTastingArchiveOverview();
      if (!offlineMode && activeView === "history" && historySection === "tastings") {
        await loadTastingArchive(tastingArchiveOffset);
      }
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Unable to update tasting");
      throw nextError;
    } finally {
      setSaving(false);
    }
  }

  async function deleteWineTastingEntry(wine: Wine, entryId: string) {
    setSaving(true);
    setError("");
    try {
      const updated = await api<Wine>(`/api/v1/wines/${wine.id}/tastings/${entryId}`, {
        method: "DELETE",
      });
      setWines((current) => current.map((item) => (item.id === updated.id ? updated : item)));
      setSelectedWineId(updated.id);
      await loadTastingArchiveOverview();
      if (!offlineMode && activeView === "history" && historySection === "tastings") {
        await loadTastingArchive(tastingArchiveOffset);
      }
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Unable to delete tasting");
      throw nextError;
    } finally {
      setSaving(false);
    }
  }

  function toggleExportSelection(key: keyof ExportSelection) {
    setExportSelection((current) => ({ ...current, [key]: !current[key] }));
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
      const [nextAudit] = await Promise.all([loadAiAudit(), loadAiUsage()]);
      if (feature === "target-price") {
        const marketEntry = nextAudit.find((entry) => entry.entity_type === "wishlist" && entry.entity_id === updated.id && entry.feature === "wishlist_target_price");
        if (marketEntry && auditMarketSources(marketEntry).length) {
          setMarketViewContext({ kind: "wishlist", item: updated, entry: marketEntry });
        }
      }
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Unable to generate wishlist strategy");
    } finally {
      setGeneratingAi("");
    }
  }

  async function generateWishlistPortfolioStrategy() {
    if (!selectedWishlistListId) return;
    setGeneratingAi("wishlist-portfolio-strategy");
    setError("");
    try {
      const result = await api<WishlistPortfolioStrategy>("/api/v1/ai/wishlist/portfolio-strategy", {
        method: "POST",
        body: JSON.stringify({ locale, wishlist_list_id: selectedWishlistListId }),
      });
      setWishlistPortfolioStrategy(result);
      setWishlistPortfolioStrategyOpen(true);
      await Promise.all([loadAiAudit(), loadAiUsage()]);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Unable to generate wishlist buying strategy");
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
          max_price_chf: pairingMaxPrice.trim() ? Number(pairingMaxPrice.trim()) : null,
          include_market: pairingIncludeMarket,
          market_only: pairingMarketOnly,
          ignore_preferences: pairingIgnorePreferences,
          prefer_local_wines: pairingMarketOnly && pairingPreferLocal,
          local_origin: pairingMarketOnly ? pairingLocalOrigin.trim() : "",
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
  const canUseLabelRecognition = canWriteWine && Boolean(session?.can_use_label_recognition);
  const canGenerateAi =
    canWriteWine &&
    Boolean(
      aiSettings &&
      (
        (aiSettings.provider_mode === "auto" && (aiSettings.has_openai_api_key || aiSettings.can_use_app_credits)) ||
        (aiSettings.provider_mode === "user_key" && aiSettings.has_openai_api_key) ||
        (aiSettings.provider_mode === "credits" && aiSettings.can_use_app_credits)
      ),
    );
  const showManualWineAiSearch =
    (activeView === "cellar" || activeView === "history") &&
    wineFormOpen &&
    !editingId &&
    canGenerateAi &&
    draft.name.trim().length >= 2 &&
    !matchingWineTemplate(draft.name);
  const hasAiDraftChanges = Boolean(
    aiSettings &&
    (
      aiSettingsDraft.provider_mode !== aiSettings.provider_mode ||
      aiSettingsDraft.openai_api_key.trim() ||
      aiSettingsDraft.ai_notes_model !== aiSettings.ai_notes_model ||
      aiSettingsDraft.drink_window_model !== aiSettings.drink_window_model ||
      aiSettingsDraft.value_model !== aiSettings.value_model ||
      aiSettingsDraft.grape_model !== aiSettings.grape_model ||
      aiSettingsDraft.wishlist_model !== aiSettings.wishlist_model ||
      aiSettingsDraft.pairing_model !== aiSettings.pairing_model ||
      aiSettingsDraft.pairing_preferences !== aiSettings.pairing_preferences
    ),
  );
  const aiStatusLabel = !aiSettings
    ? t("loadingData")
    : aiSettings.provider_mode === "credits"
      ? (aiSettings.can_use_app_credits ? t("appAiReady") : t("appAiKeyMissing"))
      : aiSettings.has_openai_api_key
        ? t("configured")
        : aiSettings.can_use_app_credits
          ? t("appAiReady")
          : t("noApiKey");
  const aiSettingsBalance = Number(aiSettings?.app_credit_balance_usd || 0);
  const billingAiBalance = Number(billingStatus?.ai_credit_balance_usd || 0);
  const showAiBudgetPanel =
    Boolean(aiSettings && !aiSettings.has_openai_api_key) ||
    aiSettingsBalance > 0 ||
    billingAiBalance > 0 ||
    aiSettingsDraft.provider_mode === "credits";
  const canShowOfflineBackupPanel = !isOnline || showOfflineBackupPanel;
  const availableRedeemCodes = billingStatus?.available_redeem_codes || [];
  const trialRedeemCodes = availableRedeemCodes.filter((code) => code.kind === "trial");
  const standardRedeemCodes = availableRedeemCodes.filter((code) => code.kind !== "trial");
  const shouldPrioritizeEmailVerification = !authenticated && Boolean(emailVerificationToken);
  const showInlineAuthError = Boolean(visibleError) && !authenticated && (isMobileViewport || authModalOpen);
  const showMobileAuthPanel =
    isMobileViewport &&
    !shouldPrioritizeEmailVerification &&
    (authModalOpen || Boolean(acceptToken) || Boolean(emailVerificationToken) || emailVerificationConfirmed || canShowOfflineBackupPanel);
  const renderRedeemCodeRow = (code: RedeemCode, highlighted = false) => (
    <div className={highlighted ? "trial-redeem-card" : "member-row"} key={code.id}>
      <div>
        {highlighted ? <span className="trial-redeem-kicker">{t("useTrialRedeemCodeNow")}</span> : null}
        <strong>{code.kind === "trial" ? t("trialRedeemCode") : t("paidRedeemCode")}</strong>
        <span>{highlighted ? `${t("trialRedeemCodeHelp")} ${t("trialRedeemCodeDuration")}: ${code.duration_days}d.` : `${code.label} - ${code.duration_days}d`}</span>
        {highlighted ? (
          <code className="trial-redeem-token">{code.code || code.code_prefix}</code>
        ) : (
          <div className="token-box">
            <span>{t("redeemCode")}</span>
            <code>{code.code || code.code_prefix}</code>
          </div>
        )}
      </div>
      <div className="inline-actions">
        {code.code ? (
          <button type="button" className="secondary compact" onClick={() => navigator.clipboard?.writeText(code.code || "")}>
            Copy
          </button>
        ) : null}
        <button type="button" className="compact" disabled={saving || !code.code} onClick={() => code.code && redeemCodeValue(code.code)}>
          {t("redeem")}
        </button>
      </div>
    </div>
  );
  const publicAuthPanel = (
    <section className="auth-panel" id="auth-panel">
      {showInlineAuthError ? (
        <div ref={errorBannerRef} className="error-banner app-error-banner auth-error-banner" role="alert" aria-live="assertive">
          <div className="app-error-copy">
            <strong>{locale === "it" ? "Attenzione" : "Attention"}</strong>
            <span>{visibleError}</span>
          </div>
          <button type="button" className="secondary compact app-error-close" onClick={() => setError("")}>
            {t("close")}
          </button>
        </div>
      ) : null}
      {acceptToken ? (
        <div className="invite-notice">
          <strong>{t("inviteLinkDetected")}</strong>
          <span>{t("inviteLinkHelp")}</span>
        </div>
      ) : null}
      {emailVerificationToken ? (
        <div className="invite-notice email-verification-notice">
          <strong>{t("emailVerificationReady")}</strong>
          <span>{t("emailVerificationReadyHelp")}</span>
          <button type="button" onClick={confirmEmailVerification} disabled={saving}>
            {saving ? t("working") : t("confirmEmail")}
          </button>
        </div>
      ) : null}
      {emailVerificationConfirmed ? (
        <div className="invite-notice">
          <strong>{t("emailVerificationSuccess")}</strong>
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
        {session?.pending_email_verification ? (
          <div className="invite-notice email-verification-notice">
            <strong>{t("pendingEmailVerification")}</strong>
            <span>{t("pendingEmailVerificationHelp")}</span>
          </div>
        ) : null}
        <label>
          <span>{t("email")}</span>
          <input type="email" value={authDraft.email} onChange={(event) => setAuthDraft({ ...authDraft, email: event.target.value })} required />
        </label>
        {authMode === "register" ? (
          <>
            <div className="invite-notice promo-notice">
              <strong>{t("finalBetaPromo")}</strong>
              <span>{t("registerPromoHelp")}</span>
            </div>
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
        {authMode === "register" ? (
          <label>
            <span>{t("confirmPassword")}</span>
            <input type="password" value={authDraft.password_confirm} onChange={(event) => setAuthDraft({ ...authDraft, password_confirm: event.target.value })} minLength={8} required />
          </label>
        ) : null}
        <button type="submit" disabled={saving}>{saving ? t("working") : authMode === "register" ? t("createAccount") : t("login")}</button>
        {authMode === "login" ? (
          <button type="button" className="secondary" disabled={saving} onClick={() => loginWithPasskey()}>
            {t("passkeyLogin")}
          </button>
        ) : null}
      </form>
      {canShowOfflineBackupPanel ? (
        <section className="wine-form">
          <h2>{t("offlineBackup")}</h2>
          <p className="empty-state">{t("offlineBackupHelp")}</p>
          <label>
            <span>{t("loadBackup")}</span>
            <input type="file" accept="application/json,.json" onChange={loadOfflineBackup} disabled={saving} />
          </label>
        </section>
      ) : null}
      <ContactSupportPanel
        t={t}
        draft={contactSupportDraft}
        setDraft={setContactSupportDraft}
        saving={saving}
        onSubmit={submitContactSupport}
      />
    </section>
  );

  useEffect(() => {
    if (!authenticated && acceptToken && !isMobileViewport) {
      setAuthModalOpen(true);
    }
  }, [authenticated, acceptToken, isMobileViewport]);

  const currentUserEmail = session?.user_email?.toLowerCase();
  const sortedAiAudit = [...aiAudit].sort((first, second) => second.created_at.localeCompare(first.created_at));
  const aiAuditFromBoundary = aiAuditDateFrom ? `${aiAuditDateFrom}T00:00:00` : "";
  const aiAuditToBoundary = aiAuditDateTo ? `${aiAuditDateTo}T23:59:59` : "";
  const filteredAiAudit = sortedAiAudit.filter((entry) => {
    if (aiAuditFromBoundary && entry.created_at < aiAuditFromBoundary) return false;
    if (aiAuditToBoundary && entry.created_at > aiAuditToBoundary) return false;
    return true;
  });
  const parsedAiAuditLimit = Number(aiAuditLimit);
  const visibleAiAudit = Number.isFinite(parsedAiAuditLimit) && parsedAiAuditLimit > 0
    ? filteredAiAudit.slice(0, parsedAiAuditLimit)
    : filteredAiAudit;
  const selectedWine = wines.find((wine) => wine.id === selectedWineId) || null;
  const selectedWishlistItem = wishlist.find((item) => item.id === selectedWishlistId) || null;
  const selectedWishlistList = wishlistLists.find((item) => item.id === selectedWishlistListId) || null;
  const totalWishlistItemCount = wishlistLists.reduce((sum, item) => sum + item.item_count, 0);
  const normalizedQuery = searchQuery.trim().toLowerCase();
  const cellarWines = wines.filter((wine) => wine.quantity > 0);
  const historyWines = wines.filter((wine) => wine.quantity <= 0);
  const isWineCollectionView = activeView === "cellar" || activeView === "history";
  const isCollectionView = isWineCollectionView || activeView === "wishlist";
  const activeWineCollection = activeView === "history"
    ? historySection === "tastings"
      ? wines
      : historyWines
    : cellarWines;
  const selectedVisibleWine = selectedWine
    ? activeView === "history" && historySection === "tastings"
      ? selectedWine
      : activeWineCollection.some((wine) => wine.id === selectedWine.id)
        ? selectedWine
        : null
    : null;
  const comparedWines = compareWineIds
    .map((wineId) => wines.find((wine) => wine.id === wineId) || null)
    .filter((wine): wine is Wine => Boolean(wine));
  const selectedWineMarketAudit = selectedVisibleWine
    ? aiAudit.find((entry) => entry.entity_type === "wine" && entry.entity_id === selectedVisibleWine.id && entry.feature === "ai_value") || null
    : null;
  const selectedWishlistMarketAudit = selectedWishlistItem
    ? aiAudit.find((entry) => entry.entity_type === "wishlist" && entry.entity_id === selectedWishlistItem.id && entry.feature === "wishlist_target_price") || null
    : null;
  const latestWishlistPortfolioAudit =
    aiAudit.find(
      (entry) =>
        entry.entity_type === "household" &&
        entry.entity_id === session?.active_household_id &&
        entry.feature === "wishlist_portfolio_strategy" &&
        rawString((entry.sources || []).find((source) => source && typeof source === "object" && source.kind === "wishlist_portfolio_strategy")?.wishlist_list_id) === selectedWishlistListId,
    ) || null;
  const visibleWishlistPortfolioStrategy =
    wishlistPortfolioStrategy || (latestWishlistPortfolioAudit ? auditWishlistPortfolioStrategy(latestWishlistPortfolioAudit) : null);
  const previousWishlistListIdRef = useRef(selectedWishlistListId);
  useEffect(() => {
    if (previousWishlistListIdRef.current !== selectedWishlistListId) {
      previousWishlistListIdRef.current = selectedWishlistListId;
      setWishlistPortfolioStrategyOpen(!visibleWishlistPortfolioStrategy);
      return;
    }
    if (!visibleWishlistPortfolioStrategy) {
      setWishlistPortfolioStrategyOpen(true);
    }
  }, [selectedWishlistListId, visibleWishlistPortfolioStrategy]);
  const wineTypeOptions = uniqueSorted(activeWineCollection.map((wine) => normalizeWineType(wine.type)));
  const wishlistTypeOptions = uniqueSorted(wishlist.map((item) => normalizeWineType(item.type)));
  const wineStatusOptions = uniqueSorted(activeWineCollection.map((wine) => wine.status));
  const wishlistStatusOptions = uniqueSorted(wishlist.map((item) => item.status));
  const tagOptions = uniqueSorted(activeWineCollection.flatMap((wine) => wine.tags));
  const grapeOptions = uniqueSorted(activeWineCollection.flatMap((wine) => wine.grapes.map((grape) => grape.name)));
  const filteredTagOptions = tagOptions.filter((tag) => tag.toLowerCase().includes(tagOptionQuery.trim().toLowerCase()));
  const filteredGrapeOptions = grapeOptions.filter((grape) => grape.toLowerCase().includes(grapeOptionQuery.trim().toLowerCase()));
  const wineFormTagOptions = uniqueSorted([...userTags.map((tag) => tag.name), ...draft.tags]);
  const activeTypeOptions = isWineCollectionView ? wineTypeOptions : wishlistTypeOptions;
  const activeStatusOptions = isWineCollectionView ? wineStatusOptions : wishlistStatusOptions;
  const currentYear = new Date().getFullYear();
  const now = new Date();
  const bottlePriceSamples = activeWineCollection
    .map((wine) => Number(wine.price || 0))
    .filter((price) => Number.isFinite(price) && price > 0);
  const bottlePriceRangeMin = bottlePriceSamples.length ? Math.floor(Math.min(...bottlePriceSamples)) : 0;
  const bottlePriceRangeMaxBase = bottlePriceSamples.length ? Math.ceil(Math.max(...bottlePriceSamples)) : 500;
  const bottlePriceRangeMax = bottlePriceRangeMaxBase > bottlePriceRangeMin ? bottlePriceRangeMaxBase : bottlePriceRangeMin + 1;
  const minBottlePrice = Number(minBottlePriceFilter);
  const maxBottlePrice = Number(maxBottlePriceFilter);
  const hasMinBottlePrice = minBottlePriceFilter.trim() !== "" && Number.isFinite(minBottlePrice);
  const hasMaxBottlePrice = maxBottlePriceFilter.trim() !== "" && Number.isFinite(maxBottlePrice);
  const sliderMinBottlePrice = hasMinBottlePrice
    ? Math.min(Math.max(minBottlePrice, bottlePriceRangeMin), bottlePriceRangeMax)
    : bottlePriceRangeMin;
  const sliderMaxBottlePrice = hasMaxBottlePrice
    ? Math.max(Math.min(maxBottlePrice, bottlePriceRangeMax), sliderMinBottlePrice)
    : bottlePriceRangeMax;
  const bottlePriceSpan = Math.max(bottlePriceRangeMax - bottlePriceRangeMin, 1);
  const bottlePriceSelectionLeft = ((sliderMinBottlePrice - bottlePriceRangeMin) / bottlePriceSpan) * 100;
  const bottlePriceSelectionRight = ((sliderMaxBottlePrice - bottlePriceRangeMin) / bottlePriceSpan) * 100;
  const priceHistogramBins = 12;
  const priceHistogram = Array.from({ length: priceHistogramBins }, (_, index) => {
    if (!bottlePriceSamples.length) return 0;
    const start = bottlePriceRangeMin + (bottlePriceSpan / priceHistogramBins) * index;
    const end = index === priceHistogramBins - 1
      ? bottlePriceRangeMax + 1
      : bottlePriceRangeMin + (bottlePriceSpan / priceHistogramBins) * (index + 1);
    return bottlePriceSamples.filter((price) => price >= start && price < end).length;
  });
  const maxHistogramCount = Math.max(...priceHistogram, 1);
  const filteredWines = activeWineCollection
    .filter((wine) => !normalizedQuery || wineSearchText(wine).includes(normalizedQuery))
    .filter((wine) => !typeFilter || normalizeWineType(wine.type) === typeFilter)
    .filter((wine) => !statusFilter || wine.status === statusFilter)
    .filter((wine) => {
      const bottlePrice = Number(wine.price || 0);
      if (hasMinBottlePrice && bottlePrice < minBottlePrice) return false;
      if (hasMaxBottlePrice && bottlePrice > maxBottlePrice) return false;
      return true;
    })
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
      if (quickWineFilter === "missing_data") return !wine.current_value || !wine.drink_from || !wine.drink_to || wine.scores.length === 0 || wine.grapes.length === 0;
      return true;
    })
    .filter((wine) => tagFilter.length === 0 || tagFilter.every((tag) => wine.tags.includes(tag)))
    .filter((wine) => grapeFilter.length === 0 || grapeFilter.every((grape) => wine.grapes.some((item) => item.name === grape)))
    .sort((first, second) => {
      if (sortMode === "vintage") return (Number(second.vintage) || 0) - (Number(first.vintage) || 0);
      if (sortMode === "value") return Number(second.current_value || second.price || 0) - Number(first.current_value || first.price || 0);
      if (sortMode === "drink_window") return (first.drink_from || 9999) - (second.drink_from || 9999);
      return first.name.localeCompare(second.name);
    });
  const tastingFilterWineIds = new Set(
    activeWineCollection
      .filter((wine) => !typeFilter || normalizeWineType(wine.type) === typeFilter)
      .filter((wine) => !statusFilter || wine.status === statusFilter)
      .filter((wine) => {
        const bottlePrice = Number(wine.price || 0);
        if (hasMinBottlePrice && bottlePrice < minBottlePrice) return false;
        if (hasMaxBottlePrice && bottlePrice > maxBottlePrice) return false;
        return true;
      })
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
        if (quickWineFilter === "missing_data") return !wine.current_value || !wine.drink_from || !wine.drink_to || wine.scores.length === 0 || wine.grapes.length === 0;
        return true;
      })
      .filter((wine) => tagFilter.length === 0 || tagFilter.every((tag) => wine.tags.includes(tag)))
      .filter((wine) => grapeFilter.length === 0 || grapeFilter.every((grape) => wine.grapes.some((item) => item.name === grape)))
      .map((wine) => wine.id),
  );
  const historyTastingEntries = wines.flatMap((wine) =>
    (wine.tasting_history || []).map(
      (entry): TastingArchiveEntry => ({
        id: entry.id,
        wine,
        consumed_at: entry.consumed_at,
        note: entry.note,
        rating: entry.rating,
        occasion: entry.occasion,
        pairing: entry.pairing,
        companions: entry.companions,
        created_at: entry.created_at,
      }),
    ),
  );
  const filteredTastingEntries = historyTastingEntries
    .filter((entry) => tastingFilterWineIds.has(entry.wine.id))
    .filter((entry) => !normalizedQuery || tastingArchiveSearchText(entry).includes(normalizedQuery) || wineSearchText(entry.wine).includes(normalizedQuery))
    .sort((first, second) => second.consumed_at.localeCompare(first.consumed_at) || second.created_at.localeCompare(first.created_at));
  const usingPagedTastingArchive = !offlineMode && activeView === "history" && historySection === "tastings";
  const pagedTastingEntries = (tastingArchivePage?.items || []).map((item): TastingArchiveEntry => {
    const wine = wines.find((candidate) => candidate.id === item.wine_id) || tastingArchiveItemToWine(item);
    return {
      id: item.tasting_id,
      wine,
      consumed_at: item.consumed_at,
      note: item.note,
      rating: item.rating,
      occasion: item.occasion,
      pairing: item.pairing,
      companions: item.companions,
      created_at: item.created_at,
    };
  });
  const visibleTastingEntries = usingPagedTastingArchive ? pagedTastingEntries : filteredTastingEntries;
  const tastingArchiveTotalCount = usingPagedTastingArchive ? tastingArchivePage?.total || 0 : historyTastingEntries.length;
  const groupedFilteredWines = wineToneOrder
    .map((tone) => {
      const items = filteredWines.filter((wine) => wineTone(wine.type) === tone);
      return {
        tone,
        label: wineToneLabel(tone, locale),
        items,
        wineCount: items.length,
        bottleCount: items.reduce(
          (sum, wine) => sum + (activeView === "history" ? Math.max(wine.tasting_history.length, 1) : Number(wine.quantity || 0)),
          0,
        ),
      };
    })
    .filter((group) => group.items.length > 0);
  const filteredWishlist = wishlist
    .filter((item) => !normalizedQuery || wishlistSearchText(item).includes(normalizedQuery))
    .filter((item) => !typeFilter || normalizeWineType(item.type) === typeFilter)
    .filter((item) => !statusFilter || item.status === statusFilter)
    .sort((first, second) => {
      if (sortMode === "priority") {
        return prioritySortValue(first.priority) - prioritySortValue(second.priority) || first.name.localeCompare(second.name);
      }
      if (sortMode === "vintage") return (Number(second.vintage) || 0) - (Number(first.vintage) || 0);
      if (sortMode === "value") return Number(second.target_price || 0) - Number(first.target_price || 0);
      return first.name.localeCompare(second.name);
    });
  const visibleCount =
    activeView === "history" && historySection === "tastings"
      ? visibleTastingEntries.length
      : isWineCollectionView
        ? filteredWines.length
        : filteredWishlist.length;

  useEffect(() => {
    setCompareWineIds((current) => current.filter((wineId) => wines.some((wine) => wine.id === wineId)));
  }, [wines]);

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
    if (!selectedWineId || !isWineCollectionView) return;
    const selectedWine = filteredWines.find((wine) => wine.id === selectedWineId);
    if (!selectedWine) return;
    const tone = wineTone(selectedWine.type);
    setOpenWineToneGroups((current) => (current[tone] ? current : { ...current, [tone]: true }));
  }, [selectedWineId, isWineCollectionView, wines]);

  useEffect(() => {
    setWishlistPortfolioStrategy(null);
  }, [session?.active_household_id]);

  useEffect(() => {
    if (offlineMode || activeView !== "history" || historySection !== "tastings") return;
    setTastingArchiveOffset(0);
  }, [offlineMode, activeView, historySection, searchQuery, typeFilter, statusFilter, session?.active_household_id]);

  useEffect(() => {
    if (offlineMode || !session?.authenticated || !selectedWishlistListId) return;
    loadWishlist(selectedWishlistListId).catch((nextError) => {
      setError(nextError instanceof Error ? nextError.message : "Unable to load wishlist");
    });
    setSelectedWishlistId(null);
    setWishlistPortfolioStrategy(null);
  }, [selectedWishlistListId]);

  useEffect(() => {
    if (!selectedWishlistListId) return;
    setWishlistDraft((current) => current.wishlist_list_id ? current : { ...current, wishlist_list_id: selectedWishlistListId });
  }, [selectedWishlistListId]);

  useEffect(() => {
    if (session?.user_email) {
      setContactSupportDraft((current) => (current.email ? current : { ...current, email: session.user_email || "" }));
      return;
    }
    if (!authenticated && authDraft.email && !contactSupportDraft.email) {
      setContactSupportDraft((current) => (current.email ? current : { ...current, email: authDraft.email }));
    }
  }, [session?.user_email, authenticated, authDraft.email, contactSupportDraft.email]);

  useEffect(() => {
    if (offlineMode || !session?.authenticated) {
      setTastingArchivePage(null);
      return;
    }
    if (activeView !== "history" || historySection !== "tastings") return;
    loadTastingArchive(tastingArchiveOffset).catch((nextError) => {
      setError(nextError instanceof Error ? nextError.message : "Unable to load tasting archive");
    });
  }, [offlineMode, session?.authenticated, session?.active_household_id, activeView, historySection, searchQuery, typeFilter, statusFilter, tastingArchiveOffset]);

  useEffect(() => {
    if (offlineMode || !session?.authenticated || !selectedWineId) return;
    const wine = wines.find((item) => item.id === selectedWineId);
    if (!wine || wine.details_loaded) return;
    loadWineDetail(selectedWineId).catch((nextError) => {
      setError(nextError instanceof Error ? nextError.message : "Unable to load wine details");
    });
  }, [offlineMode, session?.authenticated, selectedWineId, wines]);

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
    missingDrinkWindow: cellarWines.filter((wine) => hasVintageForDrinkWindow(wine) && (!wine.drink_from || !wine.drink_to)).length,
    missingGrapes: cellarWines.filter((wine) => wine.grapes.length === 0).length,
    missingScores: cellarWines.filter((wine) => wine.scores.length === 0).length,
    aiNotes: cellarWines.filter((wine) => wine.ai_notes || wine.ai_value_notes).length,
  };
  const wishlistStats = {
    count: wishlist.length,
    targetValue: wishlist.reduce((total, item) => total + Number(item.target_price || 0), 0),
    highPriority: wishlist.filter((item) => item.priority.toLowerCase() === "high").length,
    readyToBuy: wishlist.filter((item) => isWishlistReadyToBuy(item.status)).length,
  };
  const historyStats = {
    count: historyWines.length,
    shared: historyWines.filter((wine) => wine.owners.length > 1).length,
    notes: historyWines.filter((wine) => wine.notes.trim().length > 0).length,
    scores: historyWines.filter((wine) => wine.rating > 0 || wine.scores.length > 0).length,
    aiNotes: historyWines.filter((wine) => wine.ai_notes || wine.ai_value_notes).length,
  };
  const tastingStats = {
    count: offlineMode ? historyTastingEntries.length : tastingArchiveOverview?.total || 0,
    rated: offlineMode ? historyTastingEntries.filter((entry) => entry.rating > 0).length : tastingArchiveOverview?.rated_count || 0,
    notes: offlineMode ? historyTastingEntries.filter((entry) => entry.note.trim().length > 0).length : tastingArchiveOverview?.notes_count || 0,
    latest: offlineMode ? "" : tastingArchiveOverview?.latest_consumed_at || "",
  };
  const valueByType = topWineValueGroups(cellarWines, "type");
  const valueByRegion = topWineValueGroups(cellarWines, "region");
  const bottlesByType = topWineBottleGroups(cellarWines, "type");
  const bottlesByRegion = topWineBottleGroups(cellarWines, "region");
  const winesByRegion = topWineCountGroups(cellarWines, "region");
  const breakdownWines = breakdownDrilldown
    ? cellarWines.filter((wine) => wineGroupValue(wine, breakdownDrilldown.dimension) === breakdownDrilldown.label)
    : [];
  const breakdownTotalValue = sumWineValue(breakdownWines);
  const breakdownBottleCount = breakdownWines.reduce((sum, wine) => sum + wine.quantity, 0);
  const breakdownTopWines = [...breakdownWines]
    .sort((first, second) => (wineUnitValue(second) * second.quantity) - (wineUnitValue(first) * first.quantity))
    .slice(0, 5);
  const breakdownTopProducers = topProducerGroups(breakdownWines).slice(0, 4);
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
    .filter((wine) => !wine.current_value || !wine.drink_from || !wine.drink_to || wine.scores.length === 0 || wine.grapes.length === 0)
    .sort((first, second) => {
      const firstMissing = Number(!first.current_value) + Number(!first.drink_from || !first.drink_to) + Number(first.scores.length === 0) + Number(first.grapes.length === 0);
      const secondMissing = Number(!second.current_value) + Number(!second.drink_from || !second.drink_to) + Number(second.scores.length === 0) + Number(second.grapes.length === 0);
      return secondMissing - firstMissing;
    })
    .slice(0, 5);
  const peakNowWines = cellarWines
    .filter((wine) => wine.drink_peak_from && wine.drink_peak_to && wine.drink_peak_from <= currentYear && wine.drink_peak_to >= currentYear)
    .sort((first, second) => wineUnitValue(second) - wineUnitValue(first))
    .slice(0, 5);
  const latestConsumedEntries = offlineMode
    ? [...historyTastingEntries]
        .sort((first, second) => second.consumed_at.localeCompare(first.consumed_at) || second.created_at.localeCompare(first.created_at))
        .slice(0, 5)
    : (tastingArchiveOverview?.items || []).map((item): TastingArchiveEntry => {
        const wine = wines.find((candidate) => candidate.id === item.wine_id) || tastingArchiveItemToWine(item);
        return {
          id: item.tasting_id,
          wine,
          consumed_at: item.consumed_at,
          note: item.note,
          rating: item.rating,
          occasion: item.occasion,
          pairing: item.pairing,
          companions: item.companions,
          created_at: item.created_at,
        };
      });
  if (offlineMode) {
    tastingStats.latest = latestConsumedEntries[0]?.consumed_at || "";
  }
  const drinkSoonWines = cellarWines
    .filter((wine) => wine.drink_from && wine.drink_from > currentYear && wine.drink_from <= currentYear + 2)
    .sort((first, second) => (first.drink_from || 9999) - (second.drink_from || 9999))
    .slice(0, 5);
  const topValueWines = [...cellarWines]
    .sort((first, second) => wineUnitValue(second) - wineUnitValue(first))
    .slice(0, 5);
  const keyPositionWine = (
    [...cellarWines].sort((first, second) => (wineUnitValue(second) * second.quantity) - (wineUnitValue(first) * first.quantity))[0]
  ) || null;
  const keyPositionAction = keyPositionWine
    ? !keyPositionWine.drink_from || !keyPositionWine.drink_to
      ? t("completeData")
      : keyPositionWine.drink_to < currentYear
        ? t("monitor")
        : keyPositionWine.drink_from <= currentYear && keyPositionWine.drink_to >= currentYear
          ? t("drinkNow")
          : t("hold")
    : "";
  const allMissingValueWines = cellarWines.filter((wine) => !wine.current_value);
  const allValueRefreshWines = cellarWines.filter((wine) => needsValueRefresh(wine, valueRefreshDaysNumber, now));
  const allMissingDrinkWindowWines = cellarWines.filter((wine) => hasVintageForDrinkWindow(wine) && (!wine.drink_from || !wine.drink_to));
  const allMissingGrapesWines = cellarWines.filter((wine) => wine.grapes.length === 0);
  const allMissingScoresWines = cellarWines.filter((wine) => wine.scores.length === 0);
  const missingValueWines = allMissingValueWines.slice(0, 5);
  const valueRefreshWines = allValueRefreshWines.slice(0, 5);
  const missingDrinkWindowWines = allMissingDrinkWindowWines.slice(0, 5);
  const missingGrapesWines = allMissingGrapesWines.slice(0, 5);
  const missingScoresWines = allMissingScoresWines;
  const maxRegionValue = Math.max(...valueByRegion.map((item) => item.value), 1);
  const maxProducerValue = Math.max(...valueByProducer.map((item) => item.value), 1);
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
    tags: t("settingsTags"),
    sharing: t("settingsSharing"),
    users: t("settingsUsers"),
    data: t("settingsData"),
  };
  const settingsTabs = (Object.keys(settingsTabLabels) as SettingsTab[]).filter(
    (tab) => (!needsRedeem || tab === "profile") && (tab !== "users" || canAppAdmin) && (tab !== "tags" || canWriteWine),
  );
  const operationalActionScope = `${session?.user_email || "anonymous"}:${session?.active_household_id || "offline"}`;
  const operationalActionCandidates: OperationalActionItem[] = [
    cellarStats.pastWindow ? {
      id: "past-window",
      kind: "smart_past_window",
      title: t("pastWindow"),
      detail: atRiskWines[0] ? `${atRiskWines[0].name}${atRiskWines[0].drink_to ? ` - ${atRiskWines[0].drink_to}` : ""}` : t("openFilteredCellar"),
      count: cellarStats.pastWindow,
      signature: `${cellarStats.pastWindow}:${atRiskWines[0]?.id || atRiskWines[0]?.name || ""}:${atRiskWines[0]?.drink_to || ""}`,
      onOpen: () => openOperationalCellarFilter("past_window"),
    } : null,
    cellarStats.drinkNow ? {
      id: "drink-now",
      kind: "smart_drink_now",
      title: t("drinkNow"),
      detail: drinkNowWines[0] ? drinkNowWines[0].name : t("openFilteredCellar"),
      count: cellarStats.drinkNow,
      signature: `${cellarStats.drinkNow}:${drinkNowWines[0]?.id || drinkNowWines[0]?.name || ""}:${drinkNowWines[0]?.drink_from || ""}:${drinkNowWines[0]?.drink_to || ""}`,
      onOpen: () => openOperationalCellarFilter("drink_now"),
    } : null,
    cellarStats.futureDeliveries ? {
      id: "future-deliveries",
      kind: "smart_future_deliveries",
      title: t("futureDeliveries"),
      detail: upcomingDeliveries[0] ? `${upcomingDeliveries[0].wine.name} - ${upcomingDeliveries[0].days}d` : t("deliveryTimeline"),
      count: cellarStats.futureDeliveries,
      signature: `${cellarStats.futureDeliveries}:${upcomingDeliveries[0]?.wine.id || upcomingDeliveries[0]?.wine.name || ""}:${upcomingDeliveries[0]?.wine.expected_delivery || ""}`,
      onOpen: () => openOperationalCellarFilter("future_deliveries"),
    } : null,
    allValueRefreshWines.length ? {
      id: "value-refresh",
      kind: "smart_to_collect",
      title: t("valueToRefresh"),
      detail: valueRefreshWines[0] ? valueRefreshWines[0].name : t("openFilteredCellar"),
      count: allValueRefreshWines.length,
      signature: `${allValueRefreshWines.length}:${valueRefreshWines[0]?.id || valueRefreshWines[0]?.name || ""}:${valueRefreshWines[0]?.ai_value_estimated_at || ""}`,
      onOpen: () => {
        setActiveView("home");
        setDashboardFocus("value");
        setNotificationsOpen(false);
      },
    } : null,
    cellarStats.missingValue ? {
      id: "missing-value",
      kind: "smart_entitlement_expiring",
      title: t("missingValue"),
      detail: missingValueWines[0] ? missingValueWines[0].name : t("openFilteredCellar"),
      count: cellarStats.missingValue,
      signature: `${cellarStats.missingValue}:${missingValueWines[0]?.id || missingValueWines[0]?.name || ""}`,
      onOpen: () => openOperationalCellarFilter("missing_data"),
    } : null,
    cellarStats.missingDrinkWindow ? {
      id: "missing-drink-window",
      kind: "smart_past_window",
      title: t("missingDrinkWindow"),
      detail: missingDrinkWindowWines[0] ? missingDrinkWindowWines[0].name : t("openFilteredCellar"),
      count: cellarStats.missingDrinkWindow,
      signature: `${cellarStats.missingDrinkWindow}:${missingDrinkWindowWines[0]?.id || missingDrinkWindowWines[0]?.name || ""}:${missingDrinkWindowWines[0]?.vintage || ""}`,
      onOpen: () => {
        setActiveView("home");
        setDashboardFocus("data");
        setNotificationsOpen(false);
      },
    } : null,
    cellarStats.missingGrapes ? {
      id: "missing-grapes",
      kind: "ai_audit",
      title: t("missingGrapes"),
      detail: missingGrapesWines[0] ? missingGrapesWines[0].name : t("openFilteredCellar"),
      count: cellarStats.missingGrapes,
      signature: `${cellarStats.missingGrapes}:${missingGrapesWines[0]?.id || missingGrapesWines[0]?.name || ""}`,
      onOpen: () => {
        setActiveView("home");
        setDashboardFocus("data");
        setNotificationsOpen(false);
      },
    } : null,
    cellarStats.missingScores ? {
      id: "missing-scores",
      kind: "ai_audit",
      title: t("missingScores"),
      detail: missingScoresWines[0] ? missingScoresWines[0].name : t("openFilteredCellar"),
      count: cellarStats.missingScores,
      signature: `${cellarStats.missingScores}:${missingScoresWines[0]?.id || missingScoresWines[0]?.name || ""}`,
      onOpen: () => {
        setActiveView("home");
        setDashboardFocus("data");
        setNotificationsOpen(false);
      },
    } : null,
    wishlistStats.readyToBuy ? {
      id: "wishlist-ready",
      kind: "smart_to_collect",
      title: t("readyToBuy"),
      detail: t("openWishlistActions"),
      count: wishlistStats.readyToBuy,
      signature: `${wishlistStats.readyToBuy}:${selectedWishlistListId}`,
      onOpen: () => {
        setActiveView("wishlist");
        setNotificationsOpen(false);
      },
    } : null,
    wishlistStats.highPriority ? {
      id: "wishlist-priority",
      kind: "smart_to_collect",
      title: t("highPriority"),
      detail: t("openWishlistActions"),
      count: wishlistStats.highPriority,
      signature: `${wishlistStats.highPriority}:${selectedWishlistListId}`,
      onOpen: () => {
        setActiveView("wishlist");
        setNotificationsOpen(false);
      },
    } : null,
  ].filter((item): item is OperationalActionItem => Boolean(item));
  const operationalActionItems = operationalActionCandidates
    .filter((item) => {
      const snooze = operationalActionSnoozes[`${operationalActionScope}:${item.id}`];
      return !snooze || snooze.signature !== item.signature || snooze.until <= now.getTime();
    })
    .slice(0, 6);
  const operationalActionCount = operationalActionItems.length;
  const entitlementNotificationCount = authenticated && !session?.is_app_admin ? 1 : 0;
  const notificationCount = userNotifications.length + (canAppAdmin ? pendingUsers.length + pendingCatalogEntries.length : 0) + receivedInvites.length + shareOffers.length + entitlementNotificationCount;
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
    clearWineRecognitionState();
    setWineRecognitionTarget("wine");
    setDraft(emptyDraft);
    setEditingId(null);
    setWineFormOpen(true);
  }

  function startAddWishlistItem() {
    clearWineRecognitionState();
    setWineRecognitionTarget("wishlist");
    setWishlistDraft({ ...emptyWishlistDraft, wishlist_list_id: selectedWishlistListId });
    setEditingWishlistId(null);
    setWishlistFormOpen(true);
  }

  async function createWishlistList() {
    const name = window.prompt(t("wishlistListName"), "");
    if (!name || !name.trim()) return;
    setSaving(true);
    setError("");
    try {
      const created = await api<WishlistList>("/api/v1/wishlist/lists", {
        method: "POST",
        body: JSON.stringify({ name: name.trim(), description: "" }),
      });
      const nextLists = await loadWishlistLists();
      setSelectedWishlistListId(created.id || nextLists[0]?.id || "");
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Unable to create wishlist list");
    } finally {
      setSaving(false);
    }
  }

  async function renameWishlistList() {
    if (!selectedWishlistList) return;
    const name = window.prompt(t("wishlistListName"), selectedWishlistList.name);
    if (!name || !name.trim() || name.trim() === selectedWishlistList.name) return;
    setSaving(true);
    setError("");
    try {
      await api<WishlistList>(`/api/v1/wishlist/lists/${selectedWishlistList.id}`, {
        method: "PATCH",
        body: JSON.stringify({ name: name.trim() }),
      });
      await loadWishlistLists();
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Unable to rename wishlist list");
    } finally {
      setSaving(false);
    }
  }

  async function deleteWishlistList() {
    if (!selectedWishlistList) return;
    if (!window.confirm(`${t("deleteWishlistList")}: ${selectedWishlistList.name}\n\n${t("wishlistListDeleteHelp")}`)) return;
    setSaving(true);
    setError("");
    try {
      const destination = await api<WishlistList>(`/api/v1/wishlist/lists/${selectedWishlistList.id}`, { method: "DELETE" });
      const nextLists = await loadWishlistLists();
      setSelectedWishlistListId(destination.id || nextLists[0]?.id || "");
      setSelectedWishlistId(null);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Unable to delete wishlist list");
    } finally {
      setSaving(false);
    }
  }

  function startEditWine(wine: Wine) {
    clearWineRecognitionState();
    setSelectedWineId(wine.id);
    setEditingId(wine.id);
    setDraft(wineToDraft(wine));
    setWineFormOpen(true);
  }

  function startEditWishlistItem(item: WishlistItem) {
    clearWineRecognitionState();
    setSelectedWishlistId(item.id);
    setEditingWishlistId(item.id);
    setWishlistDraft(wishlistToDraft(item));
    setWishlistFormOpen(true);
  }

  function isInteractiveRowClick(event: MouseEvent<HTMLElement>) {
    return Boolean((event.target as HTMLElement).closest("button, input, select, textarea, label, a, summary"));
  }

  function toggleSelectedWine(wine: Wine) {
    const tone = wineTone(wine.type);
    if (selectedWineId !== wine.id) {
      setOpenWineToneGroups((groups) => ({ ...groups, [tone]: true }));
    }
    setSelectedWineId((current) => current === wine.id ? null : wine.id);
  }

  function toggleSelectedWishlistItem(item: WishlistItem) {
    setSelectedWishlistId((current) => current === item.id ? null : item.id);
  }

  function toggleCompareWine(wine: Wine) {
    setCompareWineIds((current) => {
      if (current.includes(wine.id)) {
        return current.filter((wineId) => wineId !== wine.id);
      }
      if (current.length >= 4) {
        setError(t("compareLimit"));
        return current;
      }
      setError("");
      return [...current, wine.id];
    });
  }

  function clearComparedWines() {
    setCompareWineIds([]);
    setCompareModalOpen(false);
    setCompareAiResult(null);
  }

  function openCompareModal() {
    if (compareWineIds.length < 2) {
      setError(t("compareNeedTwo"));
      return;
    }
    setError("");
    setCompareAiResult(null);
    setCompareModalOpen(true);
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
    clearWineRecognitionState();
    setEditingId(null);
    setDraft(emptyDraft);
    setWineFormOpen(false);
  }

  function closeWishlistForm() {
    clearWineRecognitionState();
    setEditingWishlistId(null);
    setWishlistDraft({ ...emptyWishlistDraft, wishlist_list_id: selectedWishlistListId });
    setWishlistFormOpen(false);
  }

  function clearFilters(nextView: ViewName = activeView) {
    setSearchQuery("");
    setTypeFilter("");
    setStatusFilter("");
    setOwnershipFilter("");
    setQuickWineFilter("");
    setTagFilter([]);
    setGrapeFilter([]);
    setMinBottlePriceFilter("");
    setMaxBottlePriceFilter("");
    setTagOptionQuery("");
    setGrapeOptionQuery("");
    setSortMode(nextView === "wishlist" ? "priority" : "name");
  }

  function updateMinBottlePrice(nextValue: string) {
    if (nextValue === "") {
      setMinBottlePriceFilter("");
      return;
    }
    const parsed = Number(nextValue);
    if (!Number.isFinite(parsed)) return;
    const clamped = Math.min(Math.max(parsed, bottlePriceRangeMin), sliderMaxBottlePrice);
    setMinBottlePriceFilter(String(clamped));
  }

  function updateMaxBottlePrice(nextValue: string) {
    if (nextValue === "") {
      setMaxBottlePriceFilter("");
      return;
    }
    const parsed = Number(nextValue);
    if (!Number.isFinite(parsed)) return;
    const clamped = Math.max(Math.min(parsed, bottlePriceRangeMax), sliderMinBottlePrice);
    setMaxBottlePriceFilter(String(clamped));
  }

  function applyQuickWineFilter(filter: QuickWineFilter) {
    setActiveView("cellar");
    setSearchQuery("");
    setTypeFilter("");
    setStatusFilter("");
    setOwnershipFilter("");
    setTagFilter([]);
    setGrapeFilter([]);
    setMinBottlePriceFilter("");
    setMaxBottlePriceFilter("");
    setTagOptionQuery("");
    setGrapeOptionQuery("");
    setSortMode("name");
    setQuickWineFilter((current) => current === filter ? "" : filter);
    setWineFormOpen(false);
    setWishlistFormOpen(false);
  }

  function openOperationalCellarFilter(filter: QuickWineFilter) {
    setActiveView("cellar");
    setSearchQuery("");
    setTypeFilter("");
    setStatusFilter("");
    setOwnershipFilter("");
    setTagFilter([]);
    setGrapeFilter([]);
    setMinBottlePriceFilter("");
    setMaxBottlePriceFilter("");
    setTagOptionQuery("");
    setGrapeOptionQuery("");
    setSortMode("name");
    setQuickWineFilter(filter);
    setWineFormOpen(false);
    setWishlistFormOpen(false);
    setNotificationsOpen(false);
  }

  function snoozeOperationalAction(item: OperationalActionItem) {
    const snoozeUntil = Date.now() + OPERATIONAL_ACTION_SNOOZE_DAYS * 86400000;
    const actionKey = `${operationalActionScope}:${item.id}`;
    setOperationalActionSnoozes((current) => {
      const next = Object.fromEntries(
        Object.entries(current).filter(([, snooze]) => snooze.until > Date.now()),
      ) as OperationalActionSnoozes;
      next[actionKey] = { signature: item.signature, until: snoozeUntil };
      writeOperationalActionSnoozes(next);
      return next;
    });
  }

  function toggleSettingsView() {
    const nextView: ViewName = activeView === "settings" ? "home" : "settings";
    setActiveView(nextView);
    setWineFormOpen(false);
    setWishlistFormOpen(false);
    clearFilters(nextView);
  }

  function openBreakdownDrilldown(title: TranslationKey, dimension: "type" | "region", metric: BreakdownMetric, label: string) {
    setBreakdownDrilldown({ title, dimension, metric, label });
  }

  function openBreakdownInCellar() {
    if (!breakdownDrilldown) return;
    setActiveView("cellar");
    setSearchQuery("");
    setStatusFilter("");
    setOwnershipFilter("");
    setTagFilter([]);
    setGrapeFilter([]);
    setMinBottlePriceFilter("");
    setMaxBottlePriceFilter("");
    setTagOptionQuery("");
    setGrapeOptionQuery("");
    setQuickWineFilter("");
    setSortMode(breakdownDrilldown.metric === "value" ? "value" : "name");
    setTypeFilter(breakdownDrilldown.dimension === "type" ? breakdownDrilldown.label : "");
    if (breakdownDrilldown.dimension === "region") {
      setSearchQuery(breakdownDrilldown.label === "Unknown region" ? "" : breakdownDrilldown.label);
    }
    setWineFormOpen(false);
    setWishlistFormOpen(false);
  }

  function renderBreakdownDrilldown(title: TranslationKey) {
    if (!breakdownDrilldown || breakdownDrilldown.title !== title) return null;
    return (
      <section className="chart-drilldown-panel">
        <div className="chart-drilldown-head">
          <div>
            <span>{t("chartDrilldown")}</span>
            <h3>{t(breakdownDrilldown.title)} - {displayValue(breakdownDrilldown.label, locale, breakdownDrilldown.dimension)}</h3>
          </div>
          <button type="button" className="secondary compact" onClick={() => setBreakdownDrilldown(null)}>
            {t("cancel")}
          </button>
        </div>
        <div className="chart-drilldown-kpis">
          <div><span>{t("totalValue")}</span><strong>{formatMoney(breakdownTotalValue, "CHF", locale)}</strong></div>
          <div><span>{t("bottles")}</span><strong>{formatBottleCount(breakdownBottleCount, locale)}</strong></div>
          <div><span>{t("distinctWines")}</span><strong>{formatBottleCount(breakdownWines.length, locale)}</strong></div>
          <div><span>{t("averageBottleValue")}</span><strong>{formatMoney(breakdownBottleCount ? breakdownTotalValue / breakdownBottleCount : 0, "CHF", locale)}</strong></div>
        </div>
        <div className="chart-drilldown-grid">
          <div>
            <strong>{t("topWines")}</strong>
            <div className="action-list">
              {breakdownTopWines.length ? breakdownTopWines.map((wine) => (
                <button type="button" className="action-row" key={wine.id} onClick={() => openWineFromDashboard(wine)}>
                  <span>
                    <i className={`wine-dot tone-${wineTone(wine.type)}`} />
                    <span className="chart-drilldown-row-text">
                      <span>{wine.name}</span>
                      <small>{formatBottleCount(wine.quantity, locale)} {t("bottles").toLowerCase()}</small>
                    </span>
                  </span>
                  <strong>{formatMoney(wineUnitValue(wine) * wine.quantity, wine.currency, locale)}</strong>
                </button>
              )) : <p className="empty-state">{t("noDrilldownWines")}</p>}
            </div>
          </div>
          <div>
            <strong>{t("topProducers")}</strong>
            <div className="bar-list">
              {breakdownTopProducers.length ? breakdownTopProducers.map((item) => (
                <div className="bar-row" key={item.label}>
                  <div>
                    <span className="chart-drilldown-row-text">
                      <span>{item.label}</span>
                      <small>{formatBottleCount(item.bottles, locale)} {t("bottles").toLowerCase()}</small>
                    </span>
                    <strong>{formatMoney(item.value, "CHF", locale)}</strong>
                  </div>
                  <div className="bar-track"><span style={{ width: `${Math.max((item.value / Math.max(breakdownTotalValue, 1)) * 100, 5)}%` }} /></div>
                </div>
              )) : <p className="empty-state">{t("noDrilldownWines")}</p>}
            </div>
          </div>
        </div>
        <button type="button" onClick={openBreakdownInCellar}>
          {t("openFilteredCellar")}
        </button>
      </section>
    );
  }

  function aiEntityName(entry: AiAuditLog) {
    if (entry.entity_type === "wine") return wines.find((wine) => wine.id === entry.entity_id)?.name || entry.entity_type;
    if (entry.entity_type === "wishlist") return wishlist.find((item) => item.id === entry.entity_id)?.name || entry.entity_type;
    return entry.entity_type;
  }

  function openWineInView(wine: Wine, view: "cellar" | "history", nextHistorySection: HistorySection = "wines") {
    setActiveView(view);
    if (view === "history") {
      setHistorySection(nextHistorySection);
    }
    setSearchQuery("");
    setTypeFilter("");
    setStatusFilter("");
    setOwnershipFilter("");
    setTagFilter([]);
    setGrapeFilter([]);
    setTagOptionQuery("");
    setGrapeOptionQuery("");
    setQuickWineFilter("");
    setSortMode("name");
    setOpenWineToneGroups((current) => ({ ...current, [wineTone(wine.type)]: true }));
    setSelectedWineId(wine.id);
    setPendingWineScrollId(view === "cellar" ? wine.id : null);
    setWineFormOpen(false);
    setWishlistFormOpen(false);
  }

  function openWineFromDashboard(wine: Wine) {
    openWineInView(wine, "cellar");
  }

  function openWineFromTastingArchive(wine: Wine) {
    openWineInView(wine, "history", "tastings");
  }

  function renderPairingSection() {
    const activePairingBudget = Number(pairingMaxPrice || 0);
    const hasPairingBudget = Number.isFinite(activePairingBudget) && activePairingBudget > 0;
    const pairingPreviewLimit = 3;
    const cellarBottleValues = wines
      .map((wine) => Number(wine.current_value || wine.price || 0))
      .filter((value) => Number.isFinite(value) && value > 0);
    const pairingBudgetSliderMax = Math.max(250, Math.ceil(Math.max(...cellarBottleValues, 250) / 50) * 50);
    const pairingBudgetSliderValue = hasPairingBudget ? Math.min(activePairingBudget, pairingBudgetSliderMax) : 0;
    const pairingBudgetPresets = [40, 80, 150].filter((value) => value < pairingBudgetSliderMax);
    const cellarMatchBudgetValues = pairingResult?.cellar_matches
      .map((match) => {
        const wine = wines.find((item) => item.id === match.wine_id);
        if (!wine) return null;
        return Number(wine.current_value || wine.price || 0);
      })
      .filter((value): value is number => value !== null && Number.isFinite(value) && value > 0) || [];
    const cheapestCellarMatch = cellarMatchBudgetValues.length ? Math.min(...cellarMatchBudgetValues) : null;
    const pairingPreviewCandidates = [
      ...(pairingResult?.cellar_matches.map((match, index) => {
        const wine = wines.find((item) => item.id === match.wine_id);
        const referenceValue = Number(wine?.current_value || wine?.price || 0);
        const hasReferenceValue = Number.isFinite(referenceValue) && referenceValue > 0;
        return {
          key: `cellar-${match.wine_id}`,
          name: match.wine_name,
          producer: match.producer,
          sourceRank: 0,
          originalRank: index,
          withinBudget: hasPairingBudget && hasReferenceValue ? referenceValue <= activePairingBudget : !hasPairingBudget,
        };
      }) || []),
      ...(["low", "medium", "high"] as const).flatMap((tier, tierIndex) =>
        (pairingResult?.market_recommendations[tier] || []).map((item, index) => {
          const hintAmount = parsePriceHintAmount(item.price_hint);
          return {
            key: `${tier}-${item.name}-${index}`,
            name: item.name,
            producer: item.producer,
            sourceRank: tierIndex + 1,
            originalRank: index,
            withinBudget: hasPairingBudget && hintAmount !== null ? hintAmount <= activePairingBudget : !hasPairingBudget,
          };
        }),
      ),
    ];
    const pairingPreviewItems = pairingPreviewCandidates
      .sort((first, second) => {
        if (first.withinBudget !== second.withinBudget) return first.withinBudget ? -1 : 1;
        if (first.sourceRank !== second.sourceRank) return first.sourceRank - second.sourceRank;
        return first.originalRank - second.originalRank;
      })
      .slice(0, pairingPreviewLimit);
    const pairingResultCount = pairingPreviewItems.length;
    return (
      <section className="pairing-card">
        <div className="card-heading">
          <div>
            <span>{t("pairing")}</span>
            <h2>{t("pairingSubmit")}</h2>
          </div>
          {pairingResult?.estimated_cost_usd ? (
            <small className="pairing-request-cost">
              {t("aiRequestCost")}: {formatAiBudget(pairingResult.estimated_cost_usd)}
            </small>
          ) : null}
        </div>
        <div className="pairing-layout">
          <div className="pairing-main">
            <form className="pairing-form" onSubmit={generatePairing}>
              <label>
                <span>{t("pairingDish")}</span>
                <textarea value={pairingDish} onChange={(event) => setPairingDish(event.target.value)} placeholder={t("pairingPlaceholder")} rows={3} disabled={!canGenerateAi || generatingAi === "pairing"} />
              </label>
              <div className="pairing-budget-control">
                <div className="pairing-budget-head">
                  <span>{t("pairingMaxPrice")}</span>
                  <strong>{hasPairingBudget ? `CHF ${activePairingBudget.toFixed(0)}` : t("pairingNoBudget")}</strong>
                </div>
                <input
                  type="range"
                  min="0"
                  max={pairingBudgetSliderMax}
                  step="5"
                  value={pairingBudgetSliderValue}
                  onChange={(event) => {
                    const value = Number(event.target.value);
                    setPairingMaxPrice(value > 0 ? String(value) : "");
                  }}
                  disabled={!canGenerateAi || generatingAi === "pairing"}
                  aria-label={t("pairingMaxPrice")}
                />
                <div className="pairing-budget-fields">
                  <label>
                    <span>CHF</span>
                    <input
                      type="number"
                      min="1"
                      step="1"
                      inputMode="numeric"
                      value={pairingMaxPrice}
                      onChange={(event) => setPairingMaxPrice(event.target.value)}
                      placeholder="60"
                      disabled={!canGenerateAi || generatingAi === "pairing"}
                    />
                  </label>
                  <div className="pairing-budget-presets">
                    <button type="button" className={!hasPairingBudget ? "selected" : ""} disabled={!canGenerateAi || generatingAi === "pairing"} onClick={() => setPairingMaxPrice("")}>
                      {t("pairingNoBudget")}
                    </button>
                    {pairingBudgetPresets.map((preset) => (
                      <button
                        type="button"
                        className={activePairingBudget === preset ? "selected" : ""}
                        disabled={!canGenerateAi || generatingAi === "pairing"}
                        key={preset}
                        onClick={() => setPairingMaxPrice(String(preset))}
                      >
                        CHF {preset}
                      </button>
                    ))}
                  </div>
                </div>
                <small>{t("pairingMaxPriceHelp")}</small>
              </div>
              <label className="pairing-preferences-field">
                <span>{t("pairingPreferences")}</span>
                <textarea
                  value={aiSettingsDraft.pairing_preferences}
                  onChange={(event) => setAiSettingsDraft({ ...aiSettingsDraft, pairing_preferences: event.target.value })}
                  placeholder={t("pairingPreferencesPlaceholder")}
                  rows={4}
                  disabled={!canWriteWine || saving}
                />
                <small>{t("pairingPreferencesHelp")}</small>
              </label>
              <div className="pairing-preferences-actions">
                <button
                  type="button"
                  className="secondary compact"
                  disabled={!canWriteWine || saving || (aiSettings?.pairing_preferences || "") === aiSettingsDraft.pairing_preferences}
                  onClick={() => savePairingPreferences()}
                >
                  {t("savePairingPreferences")}
                </button>
              </div>
              <label className="pairing-option">
                <input type="checkbox" checked={pairingIgnorePreferences} onChange={(event) => setPairingIgnorePreferences(event.target.checked)} disabled={!canGenerateAi || generatingAi === "pairing"} />
                <span>{t("pairingIgnorePreferences")}</span>
              </label>
              <label className="pairing-option">
                <input type="checkbox" checked={pairingIncludeMarket} onChange={(event) => setPairingIncludeMarket(event.target.checked)} disabled={!canGenerateAi || pairingMarketOnly || generatingAi === "pairing"} />
                <span>{t("pairingIncludeMarket")}</span>
              </label>
              <label className="pairing-option">
                <input
                  type="checkbox"
                  checked={pairingMarketOnly}
                  onChange={(event) => {
                    const nextChecked = event.target.checked;
                    setPairingMarketOnly(nextChecked);
                    if (!nextChecked) {
                      setPairingPreferLocal(false);
                      setPairingLocalOrigin("");
                    }
                  }}
                  disabled={!canGenerateAi || generatingAi === "pairing"}
                />
                <span>{t("pairingMarketOnly")}</span>
              </label>
              {pairingMarketOnly ? (
                <>
                  <label className="pairing-option">
                    <input
                      type="checkbox"
                      checked={pairingPreferLocal}
                      onChange={(event) => setPairingPreferLocal(event.target.checked)}
                      disabled={!canGenerateAi || generatingAi === "pairing"}
                    />
                    <span>{t("pairingPreferLocal")}</span>
                  </label>
                  {pairingPreferLocal ? (
                    <>
                      <label className="pairing-local-field">
                        <span>{t("pairingLocalOrigin")}</span>
                        <input
                          value={pairingLocalOrigin}
                          onChange={(event) => setPairingLocalOrigin(event.target.value)}
                          placeholder={locale === "it" ? "Es. Toscana, Piemonte, Svizzera" : "E.g. Tuscany, Piedmont, Switzerland"}
                          disabled={!canGenerateAi || generatingAi === "pairing"}
                        />
                        <small>{t("pairingLocalOriginHelp")}</small>
                      </label>
                      <small className="pairing-local-help">{t("pairingLocalHelp")}</small>
                    </>
                  ) : null}
                </>
              ) : null}
              <button type="submit" disabled={!canGenerateAi || generatingAi === "pairing"}>
                <ButtonBusyContent busy={generatingAi === "pairing"} idleLabel={t("pairingSubmit")} busyLabel={t("generating")} />
              </button>
              {generatingAi === "pairing" ? <LoadingState label={t("generating")} compact /> : null}
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
                          {(() => {
                            const wine = wines.find((item) => item.id === match.wine_id);
                            const referenceValue = Number(wine?.current_value || wine?.price || 0);
                            const withinBudget = hasPairingBudget && Number.isFinite(referenceValue) && referenceValue > 0 && referenceValue <= activePairingBudget;
                            const bestValue = hasPairingBudget && withinBudget && cheapestCellarMatch !== null && Math.abs(referenceValue - cheapestCellarMatch) < 0.0001;
                            if (!hasPairingBudget) return null;
                            return (
                              <div className="pairing-badge-row">
                                <span className={`pairing-budget-badge ${withinBudget ? "within" : "over"}`}>{withinBudget ? t("pairingWithinBudget") : t("pairingAboveBudget")}</span>
                                {bestValue ? <span className="pairing-budget-badge value">{t("pairingBestValue")}</span> : null}
                              </div>
                            );
                          })()}
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
                              {(() => {
                                if (!hasPairingBudget) return null;
                                const hintAmount = parsePriceHintAmount(item.price_hint);
                                const withinBudget = hintAmount !== null && hintAmount <= activePairingBudget;
                                return (
                                  <div className="pairing-badge-row">
                                    <span className={`pairing-budget-badge ${withinBudget ? "within" : "over"}`}>{withinBudget ? t("pairingWithinBudget") : t("pairingAboveBudget")}</span>
                                    {tier === "low" && withinBudget ? <span className="pairing-budget-badge value">{t("pairingBestValue")}</span> : null}
                                  </div>
                                );
                              })()}
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
          </div>
          <aside className="pairing-sidekick" aria-hidden={isMobileViewport}>
            <div className="pairing-sidekick-card">
              <div className="pairing-sidekick-heading">
                <span>{locale === "it" ? "Sommelier AI" : "AI Sommelier"}</span>
                <strong>{locale === "it" ? "Il tuo sommelier AI integrato" : "Your integrated AI sommelier"}</strong>
              </div>
              <div className="pairing-sidekick-illustration">
                <SommelierAiIllustration />
              </div>
            </div>
            <div className="pairing-sidekick-card">
              <div className="pairing-sidekick-heading">
                <span>{locale === "it" ? "Proposte consigliate" : "Suggested matches"}</span>
                <strong>{pairingResultCount ? `${pairingResultCount}` : (locale === "it" ? "In attesa di una richiesta" : "Waiting for a request")}</strong>
              </div>
              {pairingPreviewItems.length ? (
                <div className="pairing-sidekick-list">
                  {pairingPreviewItems.map((item) => (
                    <article key={item.key} className="pairing-sidekick-item">
                      <strong>{item.name}</strong>
                      {item.producer ? <span>{item.producer}</span> : null}
                    </article>
                  ))}
                </div>
              ) : (
                <p className="pairing-sidekick-empty">
                  {locale === "it"
                    ? "Inserisci un piatto e un eventuale budget per ricevere suggerimenti contestualizzati dalla tua cantina."
                    : "Enter a dish and an optional budget to receive contextual suggestions from your cellar."}
                </p>
              )}
            </div>
          </aside>
        </div>
      </section>
    );
  }

  const publicBrandLockup = (
    <div className="public-brand-lockup">
      <img className="public-brand-mark" src="/icons/logo.png" alt="Vinaris" />
      <div className="public-brand-copy">
        <strong>Vinaris</strong>
        <span>{locale === "it" ? "Private cellar intelligence" : "Private cellar intelligence"}</span>
      </div>
    </div>
  );

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
        <div className="topbar-brand">
          {authenticated ? (
            <>
              <img className="topbar-brand-mark" src="/icons/logo.png" alt="Vinaris" />
              <div>
                <p className="eyebrow">Vinaris</p>
                <h1>{session?.active_household_name || "Vinaris"}</h1>
              </div>
            </>
          ) : (
            publicBrandLockup
          )}
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
              <button type="button" className="secondary compact notification-button" aria-label={t("notifications")} title={t("notifications")} onClick={() => setNotificationsOpen((open) => !open)}>
                <span className="notification-button-icon" aria-hidden="true">{notificationBellIcon()}</span>
                {notificationCount ? <strong>{notificationCount}</strong> : null}
              </button>
              {notificationsOpen ? (
                <>
                  <button
                    type="button"
                    className="notification-backdrop"
                    aria-label={t("cancel")}
                    onClick={() => setNotificationsOpen(false)}
                  />
                  <div className="notification-panel" role="dialog" aria-modal="true" aria-label={t("notifications")} onClick={(event) => event.stopPropagation()}>
                    <div className="notification-heading">
                      <strong>{t("notifications")}</strong>
                      <div className="notification-heading-actions">
                        <span>{notificationCount}</span>
                        <button
                          type="button"
                          className="secondary compact notification-close-button"
                          aria-label={t("cancel")}
                          onClick={() => setNotificationsOpen(false)}
                        >
                          ×
                        </button>
                      </div>
                    </div>
                    {operationalActionCount ? (
                      <section className="operational-actions-section" aria-label={t("operationalActions")}>
                        <div className="operational-actions-head">
                          <div>
                            <strong>{t("operationalActions")}</strong>
                          </div>
                          <button
                            type="button"
                            className="secondary compact operational-actions-toggle"
                            aria-expanded={operationalActionsExpanded}
                            onClick={() => setOperationalActionsExpanded((expanded) => !expanded)}
                          >
                            {operationalActionsExpanded ? t("hideActions") : `${t("showActions")} ${operationalActionCount}`}
                          </button>
                        </div>
                        {operationalActionsExpanded ? (
                          operationalActionItems.map((item) => (
                            <div className="notification-item operational-action-item" key={item.id}>
                              <button type="button" className="operational-action-open" onClick={item.onOpen}>
                                <strong className="notification-title">
                                  <i className="notification-icon" aria-hidden="true">{notificationSvgIcon(item.kind)}</i>
                                  {item.title}
                                </strong>
                                <span>{item.detail}</span>
                                <b>{formatBottleCount(item.count, locale)}</b>
                              </button>
                              <button type="button" className="secondary compact operational-action-snooze" onClick={() => snoozeOperationalAction(item)}>
                                {t("snoozeAction")}
                              </button>
                            </div>
                          ))
                        ) : null}
                      </section>
                    ) : null}
                    {authenticated && !session?.is_app_admin ? (
                      <button type="button" className="notification-item" onClick={() => { setActiveView("settings"); setSettingsTab("profile"); setNotificationsOpen(false); }}>
                        <strong className="notification-title"><i className="notification-icon" aria-hidden="true">{notificationSvgIcon("smart_entitlement_expiring")}</i>{t("entitlementValidity")}</strong>
                        <span>
                          {session?.has_active_entitlement && session.entitlement_days_remaining !== null
                            ? `${session.entitlement_days_remaining} ${t("daysRemaining")} - ${formatDisplayDate(session.entitlement_valid_until || "")}`
                          : t("redeemRequired")}
                        </span>
                      </button>
                    ) : null}
                    {userNotifications.map((notification) => (
                      <div className="notification-item" key={notification.id}>
                        <strong className="notification-title"><i className="notification-icon" aria-hidden="true">{notificationSvgIcon(notification.kind)}</i>{notification.title}</strong>
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
                        <strong className="notification-title"><i className="notification-icon" aria-hidden="true">{notificationSvgIcon("pending_users")}</i>{pendingUsers.length} {t("pendingUsers")}</strong>
                        <span>{t("reviewUsers")}</span>
                      </button>
                    ) : null}
                    {canAppAdmin && pendingCatalogEntries.length ? (
                      <button type="button" className="notification-item" onClick={() => { setActiveView("settings"); setSettingsTab("users"); setNotificationsOpen(false); }}>
                        <strong className="notification-title"><i className="notification-icon" aria-hidden="true">{notificationSvgIcon("ai_audit")}</i>{pendingCatalogEntries.length} {t("pendingCatalogEntries")}</strong>
                        <span>{t("approveCatalogEntry")}</span>
                      </button>
                    ) : null}
                    {receivedInvites.map((invite) => (
                      <div className="notification-item" key={invite.id}>
                        <strong className="notification-title"><i className="notification-icon" aria-hidden="true">{notificationSvgIcon("invite")}</i>{invite.household_name || t("sharedCellar")}</strong>
                        <span>{t("acceptInvite")} - {invite.role}</span>
                        <button type="button" className="compact" disabled={saving} onClick={() => acceptReceivedInvite(invite)}>
                          {t("accept")}
                        </button>
                      </div>
                    ))}
                    {shareOffers.map((offer) => (
                      <div className="notification-item" key={offer.id}>
                        <strong className="notification-title"><i className="notification-icon" aria-hidden="true">{notificationSvgIcon("share_offer")}</i>{offer.wine_name} {offer.wine_vintage}</strong>
                        <span>{offer.share_pct}% - {offer.created_by_email}</span>
                        <div className="member-actions">
                          <button type="button" className="compact" disabled={saving} onClick={() => decideShareOffer(offer, "accept")}>{t("accept")}</button>
                          <button type="button" className="secondary compact" disabled={saving} onClick={() => decideShareOffer(offer, "decline")}>{t("decline")}</button>
                        </div>
                      </div>
                    ))}
                    {!notificationCount && !operationalActionCount ? <p className="empty-state">{t("noNotifications")}</p> : null}
                  </div>
                </>
              ) : null}
            </div> : null}
            <button
              type="button"
              className={`secondary compact topbar-icon-button topbar-settings-button${activeView === "settings" ? " active" : ""}`}
              aria-label={t("settings")}
              title={t("settings")}
              onClick={toggleSettingsView}
            >
              {settingsGearIcon()}
            </button>
            <button
              type="button"
              className="secondary compact topbar-icon-button topbar-logout-button"
              aria-label={t("logout")}
              title={t("logout")}
              onClick={() => logout().catch((nextError) => setError(nextError instanceof Error ? nextError.message : "Unable to logout"))}
            >
              {logoutIcon()}
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

      {visibleError && !showInlineAuthError ? (
        <div ref={errorBannerRef} className="error-banner app-error-banner" role="alert" aria-live="assertive">
          <div className="app-error-copy">
            <strong>{locale === "it" ? "Attenzione" : "Attention"}</strong>
            <span>{visibleError}</span>
          </div>
          <button type="button" className="secondary compact app-error-close" onClick={() => setError("")}>
            {t("close")}
          </button>
        </div>
      ) : null}

      {notice ? (
        <div className="invite-notice app-notice-banner" role="status" aria-live="polite">
          <span>{notice}</span>
          <button type="button" className="secondary compact" onClick={() => setNotice("")}>
            {t("close")}
          </button>
        </div>
      ) : null}

      {!authenticated ? shouldPrioritizeEmailVerification ? (
        publicAuthPanel
      ) : (
        <>
          <section className="mobile-public-landing" aria-labelledby="mobile-public-title">
            <div className="mobile-public-brand">
              <img src="/icons/logo.png" alt="Vinaris" />
              <span>Vinaris</span>
            </div>
            <p className="eyebrow">{locale === "it" ? "Private cellar intelligence" : "Private cellar intelligence"}</p>
            <h2 id="mobile-public-title">
              {locale === "it" ? "La tua cantina, finalmente sotto controllo." : "Your cellar, finally under control."}
            </h2>
            <p>
              {locale === "it"
                ? "Valore, finestre di beva, wishlist e memoria degustativa in una sola app pensata per collezionisti."
                : "Value, drinking windows, wishlist, and tasting memory in one app built for collectors."}
            </p>
            <div className="mobile-public-signals" aria-label={locale === "it" ? "Funzioni principali" : "Key features"}>
              <span>{locale === "it" ? "Valore" : "Value"}</span>
              <span>{locale === "it" ? "Beva" : "Drinking"}</span>
              <span>Wishlist</span>
            </div>
            <div className="mobile-public-actions">
              <button type="button" onClick={() => openAuthPanel("register")}>
                {landing.secondaryCta}
              </button>
              <button type="button" className="secondary" onClick={() => openAuthPanel("login")}>
                {landing.primaryCta}
              </button>
            </div>
          </section>
          <section className="public-landing">
            <div className="public-hero">
              <div className="public-hero-copy">
                <p className="eyebrow">{locale === "it" ? "Collector edition" : "Collector edition"}</p>
                <h2>{landing.headline}</h2>
                <strong>{landing.subheadline}</strong>
                <p>{landing.description}</p>
                <div className="public-collector-strip" aria-label={locale === "it" ? "Indicatori collezionista" : "Collector signals"}>
                  <span>{locale === "it" ? "Valore" : "Value"}</span>
                  <span>{locale === "it" ? "Maturità" : "Maturity"}</span>
                  <span>{locale === "it" ? "Mercato" : "Market"}</span>
                  <span>{locale === "it" ? "Memoria" : "Memory"}</span>
                </div>
                <div className="public-proof-grid">
                  <article className="public-proof-tile">
                    <span>{locale === "it" ? "Valore cantina" : "Cellar value"}</span>
                    <strong>CHF 4'769</strong>
                  </article>
                  <article className="public-proof-tile">
                    <span>{locale === "it" ? "Finestra ideale" : "Ideal window"}</span>
                    <strong>{locale === "it" ? "12 vini" : "12 wines"}</strong>
                  </article>
                  <article className="public-proof-tile">
                    <span>{locale === "it" ? "Da monitorare" : "Watch closely"}</span>
                    <strong>{locale === "it" ? "3 vini" : "3 wines"}</strong>
                  </article>
                </div>
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
                <div className="public-bottle-card" aria-hidden="true">
                  <div>
                    <span>{locale === "it" ? "Posizione chiave" : "Key position"}</span>
                    <strong>Tignanello</strong>
                    <small>Antinori · 2021</small>
                  </div>
                  <div className="public-vintage-seal">2021</div>
                  <dl>
                    <div><dt>{locale === "it" ? "Valore" : "Value"}</dt><dd>CHF 720</dd></div>
                    <div><dt>{locale === "it" ? "Finestra" : "Window"}</dt><dd>2027-2042</dd></div>
                    <div><dt>{locale === "it" ? "Azione" : "Action"}</dt><dd>{locale === "it" ? "Tenere" : "Hold"}</dd></div>
                  </dl>
                </div>
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
                <div className="invite-notice promo-notice">
                  <strong>{t("finalBetaPromo")}</strong>
                  <span>{t("promoNote")}</span>
                </div>
              </aside>
            </div>

            <section className="public-features-card">
              <div className="public-section-heading">
                <p className="eyebrow">{landing.collectorTitle}</p>
                <h3>{landing.collectorBody}</h3>
              </div>
              <div className="public-feature-grid">
                {landing.features.map((feature) => (
                  <article className={`${feature.highlight ? "public-feature public-feature-highlight" : "public-feature"}${feature.ai && !feature.highlight ? " public-feature-ai" : ""}`} key={feature.title}>
                    {feature.ai && !feature.highlight ? <span className="public-feature-pill">AI</span> : null}
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
                  <p className="public-founder-support">{landing.founderSupport}</p>
                  <div className="public-founder-meta">
                    <strong>{landing.founderName}</strong>
                    <span>{landing.founderRole}</span>
                  </div>
                </aside>
            </section>

            <section className="public-showcase-card">
                <div className="public-section-heading">
                  <p className="eyebrow">{locale === "it" ? "Dentro l'applicazione" : "Inside the application"}</p>
                  <h3>
                    {locale === "it"
                      ? "Un percorso semplice: decidere, controllare, ricordare."
                      : "A simple workflow: decide, inspect, remember."}
                  </h3>
                  <span>
                    {locale === "it"
                      ? "Vinaris mette in ordine il lavoro quotidiano del collezionista: priorita, valore, maturita, wishlist e memoria degustativa."
                      : "Vinaris keeps the collector's daily work organized: priorities, value, maturity, wishlist, and tasting memory."}
                  </span>
                </div>
                <div className="public-showcase-path" aria-label={locale === "it" ? "Percorso applicazione" : "Application workflow"}>
                  <article>
                    <span>01</span>
                    <strong>{locale === "it" ? "Decidi cosa fare" : "Decide what to do"}</strong>
                    <p>{locale === "it" ? "Dashboard, finestre di beva e priorita operative in apertura." : "Dashboard, drinking windows, and operational priorities at a glance."}</p>
                  </article>
                  <article>
                    <span>02</span>
                    <strong>{locale === "it" ? "Controlla la cantina" : "Inspect the cellar"}</strong>
                    <p>{locale === "it" ? "Statistiche, qualita dati, valore e consegne future in una lettura unica." : "Stats, data quality, value, and future deliveries in one reading."}</p>
                  </article>
                  <article>
                    <span>03</span>
                    <strong>{locale === "it" ? "Conserva memoria" : "Preserve memory"}</strong>
                    <p>{locale === "it" ? "Schede vino, wishlist e storico degustativo restano collegati alle decisioni." : "Wine records, wishlist, and tasting history stay connected to decisions."}</p>
                  </article>
                </div>
                <div className="public-showcase-grid">
                <article className="showcase-frame showcase-frame-wide">
                  <div className="showcase-window">
                    <div className="showcase-bar">
                      <span className="showcase-tab active">Home</span>
                      <span className="showcase-tab">Cellar (45)</span>
                      <span className="showcase-tab">Wishlist (10)</span>
                      <span className="showcase-tab">{locale === "it" ? "Mercato" : "Market"}</span>
                    </div>
                    <div className="showcase-hero">
                      <div>
                        <p className="eyebrow">Dashboard</p>
                        <h4>{locale === "it" ? "Vista collezionista" : "Collector view"}</h4>
                        <span>{locale === "it" ? "Una dashboard che suggerisce cosa fare, non solo che cosa possiedi." : "A dashboard that suggests what to do, not only what you own."}</span>
                      </div>
                      <div className="showcase-kpis">
                        <div><strong>CHF 4'769</strong><span>{locale === "it" ? "Valore cantina" : "Cellar value"}</span></div>
                        <div><strong>{locale === "it" ? "12 vini" : "12 wines"}</strong><span>{locale === "it" ? "Finestra ideale" : "Ideal window"}</span></div>
                        <div><strong>4</strong><span>{locale === "it" ? "Consegne attese" : "Expected deliveries"}</span></div>
                      </div>
                    </div>
                    <div className="showcase-dashboard-grid">
                      <div className="showcase-card">
                        <span>{locale === "it" ? "Decisioni immediate" : "Immediate decisions"}</span>
                        <strong>{locale === "it" ? "Da aprire ora" : "Open now"}</strong>
                        <ul>
                          <li>Krug Grande Cuvée</li>
                          <li>Dom Pérignon</li>
                          <li>Tignanello</li>
                        </ul>
                      </div>
                      <div className="showcase-card">
                        <span>{locale === "it" ? "Da monitorare" : "Watch closely"}</span>
                        <strong>{locale === "it" ? "Finestra delicata" : "Narrow window"}</strong>
                        <ul>
                          <li>Sassi Grossi</li>
                          <li>Bidibi</li>
                        </ul>
                      </div>
                      <div className="showcase-card">
                        <span>{locale === "it" ? "Analisi mercato" : "Market analysis"}</span>
                        <strong>{locale === "it" ? "3 vini da rileggere" : "3 wines to review"}</strong>
                        <ul>
                          <li>Arzo · {locale === "it" ? "Valore" : "Value"}</li>
                          <li>Sirio · {locale === "it" ? "Valore" : "Value"}</li>
                          <li>Blanc de Blancs · {locale === "it" ? "Finestra" : "Window"}</li>
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

                <article className="showcase-frame showcase-frame-wide">
                  <div className="showcase-window showcase-stats-window">
                    <div className="showcase-stats-head">
                      <strong>{locale === "it" ? "Statistiche cantina" : "Cellar stats"}</strong>
                      <span>{locale === "it" ? "Qualita dati, valore e finestre di beva" : "Data quality, value, and drinking windows"}</span>
                    </div>
                    <div className="showcase-stats-board">
                      <div className="showcase-stat-tile showcase-stat-tile-highlight">
                        <span>{locale === "it" ? "Le mie bottiglie" : "My bottles"}</span>
                        <strong>112</strong>
                        <small>CHF 4'830</small>
                      </div>
                      <div className="showcase-stat-tile">
                        <span>{locale === "it" ? "Condivise" : "Shared"}</span>
                        <strong>4</strong>
                        <small>CHF 312</small>
                      </div>
                      <div className="showcase-stat-tile">
                        <span>{locale === "it" ? "Valore totale" : "Total value"}</span>
                        <strong>116</strong>
                        <small>CHF 5'142</small>
                      </div>
                      <div className="showcase-stat-tile">
                        <span>{locale === "it" ? "Da bere ora" : "Drink now"}</span>
                        <strong>38</strong>
                      </div>
                      <div className="showcase-stat-tile">
                        <span>{locale === "it" ? "Da bere in 2 anni" : "Drink in 2 years"}</span>
                        <strong>1</strong>
                      </div>
                      <div className="showcase-stat-tile">
                        <span>{locale === "it" ? "Oltre finestra" : "Past window"}</span>
                        <strong>2</strong>
                      </div>
                      <div className="showcase-stat-tile">
                        <span>{locale === "it" ? "Consegne future" : "Future deliveries"}</span>
                        <strong>5</strong>
                        <small>Le C des Carmes Haut-Brion · 12d</small>
                      </div>
                      <div className="showcase-stat-tile showcase-stat-quality">
                        <span>{locale === "it" ? "Qualita dati" : "Data quality"}</span>
                        <small>{locale === "it" ? "Valore mancante" : "Missing value"}: <strong>4</strong></small>
                        <small>{locale === "it" ? "Finestra mancante" : "Missing drink window"}: <strong>7</strong></small>
                        <small>{locale === "it" ? "Uvaggi mancanti" : "Missing grapes"}: <strong>4</strong></small>
                        <small>{locale === "it" ? "Punteggi mancanti" : "Missing scores"}: <strong>22</strong></small>
                      </div>
                      <div className="showcase-breakdown-card">
                        <div>
                          <span>{locale === "it" ? "Valore per tipo" : "Value by type"}</span>
                          <p><i className="tone-red" /> {displayValue("Red", locale, "type")}: CHF 2'986</p>
                          <p><i className="tone-sparkling" /> {displayValue("Sparkling", locale, "type")}: CHF 1'437</p>
                          <p><i className="tone-white" /> {displayValue("White", locale, "type")}: CHF 685</p>
                          <p><i className="tone-rose" /> {displayValue("Rose", locale, "type")}: CHF 34</p>
                        </div>
                        <div className="showcase-donut showcase-donut-type"><strong>4</strong><small>{t("typesLabel")}</small></div>
                      </div>
                      <div className="showcase-breakdown-card">
                        <div>
                          <span>{locale === "it" ? "Top regioni" : "Top regions"}</span>
                          <p><i className="tone-region-a" /> Champagne: CHF 1'105</p>
                          <p><i className="tone-region-b" /> Bordeaux: CHF 1'017</p>
                          <p><i className="tone-region-c" /> Toscana: CHF 975</p>
                          <p><i className="tone-region-d" /> Ticino: CHF 786</p>
                        </div>
                        <div className="showcase-donut showcase-donut-region"><strong>5</strong><small>{t("regionsLabel")}</small></div>
                      </div>
                    </div>
                  </div>
                  <div className="showcase-caption">
                    <strong>{locale === "it" ? "Statistiche operative della cantina" : "Operational cellar statistics"}</strong>
                    <span>
                      {locale === "it"
                        ? "Una vista compatta per leggere valore, bottiglie condivise, finestre di beva, consegne e dati mancanti."
                        : "A compact view for value, shared bottles, drinking windows, deliveries, and missing data."}
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
                        ? "Scheda completa con quantità, valore, cronologia prezzi e finestra di beva."
                        : "Complete record with quantity, value, price history, and drinking window."}
                      </span>
                    </div>
                  </article>

                  <article className="showcase-frame">
                    <div className="showcase-window">
                      <div className="showcase-bar">
                        <span className="showcase-tab">Wishlist</span>
                        <span className="showcase-tab active">{locale === "it" ? "Strategia di acquisto" : "Buying strategy"}</span>
                        <span className="showcase-tab">{locale === "it" ? "Analisi mercato" : "Market analysis"}</span>
                      </div>
                      <div className="showcase-dashboard-grid showcase-dashboard-grid-wishlist">
                        <div className="showcase-card">
                          <span>{locale === "it" ? "Priorità" : "Priority"}</span>
                          <strong>High · {locale === "it" ? "Compra" : "Buy now"}</strong>
                          <ul>
                            <li>Sassicaia 2021 · CHF 235</li>
                            <li>Tignanello 2021 · CHF 118</li>
                            <li>Krug Grande Cuvée · CHF 178</li>
                          </ul>
                        </div>
                        <div className="showcase-card">
                          <span>{locale === "it" ? "Analisi mercato" : "Market analysis"}</span>
                          <strong>{locale === "it" ? "Stima vs target" : "Estimate vs target"}</strong>
                          <ul>
                            <li>{locale === "it" ? "Target utente CHF 118" : "User target CHF 118"}</li>
                            <li>{locale === "it" ? "Stima mercato CHF 132" : "Market estimate CHF 132"}</li>
                            <li>{locale === "it" ? "Azione: comprare ora" : "Action: buy now"}</li>
                          </ul>
                        </div>
                      </div>
                    </div>
                    <div className="showcase-caption">
                      <strong>{locale === "it" ? "Wishlist e strategia di acquisto" : "Wishlist and buying strategy"}</strong>
                      <span>
                        {locale === "it"
                          ? "Priorità, target di prezzo, stima mercato e decisione finale nello stesso punto."
                          : "Priority, price target, market estimate, and next decision in one place."}
                      </span>
                    </div>
                  </article>

                  <article className="showcase-frame">
                    <div className="showcase-window">
                      <div className="showcase-bar">
                        <span className="showcase-tab">Cellar</span>
                        <span className="showcase-tab active">{locale === "it" ? "Storico" : "History"}</span>
                        <span className="showcase-tab">{locale === "it" ? "Degustazioni" : "Tastings"}</span>
                      </div>
                      <div className="showcase-detail-layout">
                        <div className="showcase-list">
                          <div className="showcase-list-row active"><strong>Castello Luigi Rosso 2011</strong><span>{locale === "it" ? "Bevuto" : "Consumed"}</span></div>
                          <div className="showcase-list-row"><strong>Blanc de Blancs NV</strong><span>{locale === "it" ? "Bevuto" : "Consumed"}</span></div>
                          <div className="showcase-list-row"><strong>Sassicaia 2015</strong><span>{locale === "it" ? "Archivio" : "Archived"}</span></div>
                        </div>
                        <div className="showcase-detail-panel">
                          <div className="showcase-detail-grid">
                            <div><span>{locale === "it" ? "Degustato il" : "Tasted on"}</span><strong>01/06/2026</strong></div>
                            <div><span>{locale === "it" ? "Voto" : "Rating"}</span><strong>5 / 6</strong></div>
                            <div><span>{locale === "it" ? "Occasione" : "Occasion"}</span><strong>{locale === "it" ? "Cena tra amici" : "Dinner with friends"}</strong></div>
                            <div><span>{locale === "it" ? "Abbinamento" : "Pairing"}</span><strong>{locale === "it" ? "Brasato" : "Braised beef"}</strong></div>
                          </div>
                          <div className="showcase-note-block">
                            <span>{locale === "it" ? "Note degustazione" : "Tasting notes"}</span>
                            <p>
                              {locale === "it"
                                ? "Rosso profondo, tannino risolto e finale balsamico. Bottiglia al picco, perfetta per una cena lenta."
                                : "Deep red, resolved tannins, and a balsamic finish. At peak maturity and ideal for a long dinner."}
                            </p>
                          </div>
                        </div>
                      </div>
                    </div>
                    <div className="showcase-caption">
                      <strong>{locale === "it" ? "Storico degustativo" : "Tasting archive"}</strong>
                      <span>
                        {locale === "it"
                        ? "Ogni bottiglia bevuta può diventare memoria utile per confronti e decisioni future."
                          : "Every consumed bottle becomes usable memory for future comparisons and decisions."}
                      </span>
                    </div>
                  </article>
                </div>
              </section>
            </section>

        {showMobileAuthPanel ? publicAuthPanel : null}
        {!isMobileViewport && authModalOpen ? (
          <div className="auth-modal-overlay" onClick={() => setAuthModalOpen(false)}>
            <div className="auth-modal-card" onClick={(event) => event.stopPropagation()}>
              <div className="auth-modal-head">
                <strong>{authMode === "register" ? t("createAccount") : t("login")}</strong>
                <button type="button" className="secondary compact" onClick={() => setAuthModalOpen(false)}>
                  {t("cancel")}
                </button>
              </div>
              {publicAuthPanel}
            </div>
          </div>
        ) : null}
        </>
      ) : needsRedeem && activeView !== "settings" ? (
        <section className="auth-panel">
          <section className="wine-form">
            <h2>{t("redeemCode")}</h2>
            <div className="invite-notice">
              <strong>{t("redeemRequired")}</strong>
              <span>{session?.user_email}</span>
            </div>
            {trialRedeemCodes.length ? (
              <div className="trial-redeem-list">
                {trialRedeemCodes.map((code) => renderRedeemCodeRow(code, true))}
              </div>
            ) : null}
            <div className="invite-notice promo-notice">
              <strong>{t("finalBetaPromo")}</strong>
              <span>{t("promoMonthlyPrice")}</span>
              <span>{t("promoAnnualPrice")}</span>
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
            {standardRedeemCodes.length ? (
              <div className="member-list">
                {standardRedeemCodes.map((code) => renderRedeemCodeRow(code))}
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
          {!needsRedeem ? (
          <div className="view-tabs">
            <button type="button" className={activeView === "home" ? "" : "secondary"} onClick={() => { setActiveView("home"); setWineFormOpen(false); setWishlistFormOpen(false); clearFilters("home"); }}>
              {t("home")}
            </button>
            <button type="button" className={activeView === "cellar" ? "" : "secondary"} onClick={() => { setActiveView("cellar"); setWishlistFormOpen(false); setWineFormOpen(false); setSelectedWineId(null); clearFilters("cellar"); }}>
              {t("cellar")} ({cellarWines.length})
            </button>
            <button type="button" className={activeView === "history" ? "" : "secondary"} onClick={() => { setActiveView("history"); setWishlistFormOpen(false); setWineFormOpen(false); setSelectedWineId(null); clearFilters("history"); }}>
              {t("history")}
            </button>
            <button type="button" className={activeView === "wishlist" ? "" : "secondary"} onClick={() => { setActiveView("wishlist"); setWineFormOpen(false); clearFilters("wishlist"); }}>
              {t("wishlist")} ({totalWishlistItemCount})
            </button>
            <button type="button" className={activeView === "pairing" ? "" : "secondary"} onClick={() => { setActiveView("pairing"); setWineFormOpen(false); setWishlistFormOpen(false); clearFilters("pairing"); }}>
              {t("pairing")}
            </button>
            <button type="button" className={activeView === "help" ? "" : "secondary"} onClick={() => { setActiveView("help"); setWineFormOpen(false); setWishlistFormOpen(false); clearFilters("help"); }}>
              {t("help")}
            </button>
          </div>
          ) : null}
          {activeView === "home" ? (
            <section className="home-dashboard">
              <section className="hero-panel">
                <div className="hero-copy">
                  <p className="eyebrow">{t("dashboard")}</p>
                  <h2>{dashboardFocusLabels[dashboardFocus]}</h2>
                  <p>{session?.active_household_name || "Wine Cellar"}: {cellarWines.length} {t("wines").toLowerCase()}, {totalWishlistItemCount} {t("wishlist").toLowerCase()}.</p>
                </div>
                <div className="hero-kpis" aria-label={t("cellarSnapshot")}>
                  <div className="hero-kpi">
                    <span><i className="stat-icon" aria-hidden="true">{dashboardStatSvgIcon("mine")}</i>{t("myBottles")}</span>
                    <strong>{formatBottleCount(cellarStats.myBottles, locale)}</strong>
                    <p>{formatMoney(cellarStats.myValue, "CHF", locale)}</p>
                  </div>
                  <div className="hero-kpi">
                    <span><i className="stat-icon" aria-hidden="true">{dashboardStatSvgIcon("shared")}</i>{t("sharedBottles")}</span>
                    <strong>{formatBottleCount(cellarStats.sharedBottles, locale)}</strong>
                    <p>{formatMoney(cellarStats.sharedValue, "CHF", locale)}</p>
                  </div>
                  <div className="hero-kpi">
                    <span><i className="stat-icon" aria-hidden="true">{dashboardStatSvgIcon("total")}</i>{t("totalValue")}</span>
                    <strong>{formatMoney(cellarStats.totalValue, "CHF", locale)}</strong>
                    <p>{formatBottleCount(cellarStats.bottles, locale)} {t("bottles").toLowerCase()}</p>
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
                <article className="dashboard-card key-position-card">
                  {keyPositionWine ? (
                    <button type="button" className="key-position-button" onClick={() => openWineFromDashboard(keyPositionWine)}>
                      <div className="key-position-head">
                        <div>
                          <span>{t("keyPosition")}</span>
                          <h2><i className={`wine-dot tone-${wineTone(keyPositionWine.type)}`} />{keyPositionWine.name}</h2>
                          <p>{[keyPositionWine.producer, keyPositionWine.vintage].filter(Boolean).join(" - ")}</p>
                        </div>
                        {keyPositionWine.vintage ? <div className="key-position-vintage"><span>{keyPositionWine.vintage}</span></div> : null}
                      </div>
                      <div className="key-position-metrics">
                        <div><span>{t("value")}</span><strong>{formatMoney(wineUnitValue(keyPositionWine) * keyPositionWine.quantity, keyPositionWine.currency, locale)}</strong></div>
                        <div><span>{t("drinkWindow")}</span><strong>{keyPositionWine.drink_from && keyPositionWine.drink_to ? `${keyPositionWine.drink_from}-${keyPositionWine.drink_to}` : t("notSpecified")}</strong></div>
                        <div><span>{t("action")}</span><strong>{keyPositionAction}</strong></div>
                      </div>
                    </button>
                  ) : (
                    <div className="empty-state">{t("noActionItems")}</div>
                  )}
                </article>

                <article className="dashboard-card priority-card">
                  <div className="card-heading">
                    <div>
                      <span>{t("priorityActions")}</span>
                      <h2><i className="dashboard-section-icon" aria-hidden="true">{collectorFocusSvgIcon("drink_now")}</i>{t("drinkNow")}</h2>
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
                      <h2><i className="dashboard-section-icon" aria-hidden="true">{collectorFocusSvgIcon("past_window")}</i>{t("pastWindow")}</h2>
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
                      <h2><i className="dashboard-section-icon" aria-hidden="true">{collectorFocusSvgIcon("future_deliveries")}</i>{t("futureDeliveries")}</h2>
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
                  <button type="button" className="card-heading card-heading-button" onClick={() => { setActiveView("history"); setHistorySection("tastings"); clearFilters("history"); }}>
                    <div>
                      <span>{t("tastingEntries")}</span>
                      <h2><i className="dashboard-section-icon" aria-hidden="true">{collectorFocusSvgIcon("drink_now")}</i>{t("latestConsumedBottles")}</h2>
                    </div>
                    <strong>{formatBottleCount(tastingStats.count, locale)}</strong>
                  </button>
                  <div className="action-list">
                    {latestConsumedEntries.length ? latestConsumedEntries.map((entry) => (
                      <button type="button" className="action-row" key={entry.id} onClick={() => openWineFromTastingArchive(entry.wine)}>
                        <div>
                          <span><i className={`wine-dot tone-${wineTone(entry.wine.type)}`} />{entry.wine.name}</span>
                          <strong>{formatDisplayDate(entry.consumed_at)}</strong>
                        </div>
                        <strong>{entry.rating ? `${entry.rating}/6` : entry.occasion || entry.pairing || "-"}</strong>
                      </button>
                    )) : <p className="empty-state">{t("noTastingHistory")}</p>}
                  </div>
                </article>

                <article className="dashboard-card">
                  <div className="card-heading">
                    <div>
                      <span>{t("incompleteData")}</span>
                      <h2><i className="dashboard-section-icon" aria-hidden="true">{collectorFocusSvgIcon("missing_data")}</i>{t("dataQuality")}</h2>
                    </div>
                      <strong>{cellarStats.missingValue + cellarStats.missingDrinkWindow + cellarStats.missingGrapes + cellarStats.missingScores}</strong>
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
                      <h2><i className="dashboard-section-icon" aria-hidden="true">{collectorFocusSvgIcon("maturity")}</i>{t("drinkingWindow")}</h2>
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
                      <h2><i className="dashboard-section-icon" aria-hidden="true">{collectorFocusSvgIcon("regions")}</i>{t("topRegions")}</h2>
                    </div>
                  </div>
                  <div className="bar-list">
                    {valueByRegion.map((item) => (
                      <div className="bar-row" key={item.label}>
                        <div><span>{item.label}</span><strong>{formatMoney(item.value, "CHF", locale)}</strong></div>
                        <div className="bar-track"><span style={{ width: `${Math.max((item.value / maxRegionValue) * 100, 5)}%` }} /></div>
                      </div>
                    ))}
                  </div>
                </article>

                <article className="dashboard-card">
                  <div className="card-heading">
                    <div>
                      <span>{t("valueByProducer")}</span>
                      <h2><i className="dashboard-section-icon" aria-hidden="true">{collectorFocusSvgIcon("producer")}</i>{t("producer")}</h2>
                    </div>
                  </div>
                  <div className="bar-list">
                    {valueByProducer.map((item) => (
                      <div className="bar-row" key={item.label}>
                        <div><span>{item.label}</span><strong>{formatMoney(item.value, "CHF", locale)}</strong></div>
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
                        <h2>{formatMoney(cellarStats.totalValue, "CHF", locale)}</h2>
                      </div>
                      <strong>{formatBottleCount(cellarStats.bottles, locale)}</strong>
                    </div>
                    <p>{t("myBottles")}: {formatMoney(cellarStats.myValue, "CHF", locale)} · {t("sharedBottles")}: {formatMoney(cellarStats.sharedValue, "CHF", locale)}</p>
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
                          <div><span>{item.label}</span><strong>{formatMoney(item.value, "CHF", locale)}</strong></div>
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
                          <div><span>{item.label}</span><strong>{formatMoney(item.value, "CHF", locale)}</strong></div>
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
                          <strong>{formatMoney(wineUnitValue(wine), "CHF", locale)}</strong>
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
                      <strong>{allValueRefreshWines.length + cellarStats.missingDrinkWindow + cellarStats.missingGrapes + cellarStats.missingScores}</strong>
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
                        <span>{t("missingGrapes")}</span>
                        <h2><i className="dashboard-section-icon" aria-hidden="true">{grapesSvgIcon()}</i>{t("grapes")}</h2>
                      </div>
                      <strong>{cellarStats.missingGrapes}</strong>
                    </div>
                    <button type="button" className="secondary compact" disabled={!canGenerateAi || Boolean(generatingAi) || allMissingGrapesWines.length === 0} onClick={() => generateMissingWineAi("grapes", allMissingGrapesWines)}>
                      {generatingAi === "batch-grapes" ? t("generating") : t("generateAll")}
                    </button>
                    <div className="action-list">
                      {missingGrapesWines.length ? missingGrapesWines.map((wine) => (
                        <div className="action-row data-quality-row" key={wine.id}>
                          <button type="button" className="row-open-action" onClick={() => openWineFromDashboard(wine)}>
                            <i className={`wine-dot tone-${wineTone(wine.type)}`} />{wine.name}
                          </button>
                          <button type="button" className="secondary compact" disabled={!canGenerateAi || Boolean(generatingAi)} onClick={() => generateWineAi(wine, "grapes")}>
                            {generatingAi === "grapes" && selectedWineId === wine.id ? t("generating") : t("grapes")}
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
                    <div className="action-list scrollable-action-list">
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
                      {section.bullets.map((bullet) => {
                        const parsedBullet = parseHelpBullet(bullet);
                        return (
                          <li key={bullet}>
                            {parsedBullet.isAi ? <span className="help-ai-badge">AI</span> : null}
                            <span>{parsedBullet.text}</span>
                          </li>
                        );
                      })}
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
                  <>
                    <button type="button" className={compareWineIds.includes(selectedVisibleWine.id) ? "" : "secondary"} onClick={() => toggleCompareWine(selectedVisibleWine)}>
                      {compareWineIds.includes(selectedVisibleWine.id) ? t("compareSelected") : t("compare")}
                    </button>
                    <button type="button" className="secondary" onClick={() => startEditWine(selectedVisibleWine)} disabled={!canWriteWine}>
                      {t("editSelected")}
                    </button>
                  </>
                ) : null}
                {compareWineIds.length ? (
                  <>
                    <button type="button" className="secondary" onClick={openCompareModal}>
                      {t("openCompare")} ({compareWineIds.length}/4)
                    </button>
                    <button type="button" className="secondary" onClick={clearComparedWines}>
                      {t("clearCompare")}
                    </button>
                  </>
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
                {!editingId && canUseLabelRecognition ? (
                  <div className="recognition-box">
                    <span className="recognition-box-title">{wineRecognitionLoading && wineRecognitionTarget === "wine" ? t("recognizingWine") : t("recognizeWine")}</span>
                    <span className="recognition-beta-note">{t("recognitionBetaNotice")}</span>
                    <div className="recognition-actions">
                      <label className="recognition-upload-button secondary compact">
                        <span>{t("choosePhotoFile")}</span>
                        <input type="file" accept="image/*" disabled={!canUseLabelRecognition || wineRecognitionLoading} onChange={(event) => handleWineRecognitionInput(event, "wine")} />
                      </label>
                      <label className="recognition-camera-button compact" title={t("takeLabelPhoto")} aria-label={t("takeLabelPhoto")}>
                        <svg viewBox="0 0 24 24" aria-hidden="true">
                          <path d="M7 7l1.4-2h7.2L17 7h2.5A2.5 2.5 0 0 1 22 9.5v7A2.5 2.5 0 0 1 19.5 19h-15A2.5 2.5 0 0 1 2 16.5v-7A2.5 2.5 0 0 1 4.5 7H7Z" />
                          <circle cx="12" cy="13" r="4" />
                        </svg>
                        <input type="file" accept="image/*" capture="environment" disabled={!canUseLabelRecognition || wineRecognitionLoading} onChange={(event) => handleWineRecognitionInput(event, "wine")} />
                      </label>
                    </div>
                    {wineRecognitionResult && wineRecognitionTarget === "wine" ? (
                      <div className="recognition-results">
                        <strong>{t("recognitionSuggestions")}</strong>
                        {wineEnrichmentLoading ? <span>{t("generating")}</span> : null}
                        {wineRecognitionResult.matches.length ? wineRecognitionResult.matches.map((match) => (
                          <button key={match.id || `${match.producer}-${match.name}`} type="button" className="secondary compact" onClick={() => void applyRecognizedCatalogItem(match, wineRecognitionResult.raw_best_label || match.name, "wine")}>
                            {recognitionSuggestionLabel([match.name, match.producer, match.region].filter(Boolean).join(" - "), wineRecognitionResult.suggestions[0]?.confidence ?? null, locale)}
                          </button>
                        )) : (
                          <>
                            <span>{t("recognitionNoMatch")}</span>
                            {wineRecognitionResult.suggestions.map((suggestion) => (
                              <button key={suggestion.label} type="button" className="secondary compact" onClick={() => void applyRecognitionSuggestion(suggestion, "wine")}>
                                {t("useSuggestion")}: {recognitionSuggestionLabel(suggestion.label, suggestion.confidence, locale)}
                              </button>
                            ))}
                          </>
                        )}
                      </div>
                    ) : null}
                  </div>
                ) : null}
                <label>
                  <span>{t("name")}</span>
                  <input list="wine-catalog-suggestions" value={draft.name} onChange={(event) => updateWineDraftName(event.target.value)} required disabled={!canWriteWine} />
                </label>
                {showManualWineAiSearch ? (
                  <div className="manual-ai-search">
                    <button type="button" className="secondary compact" disabled={wineEnrichmentLoading} onClick={() => void enrichManualWineDraft()}>
                      {wineEnrichmentLoading ? t("generating") : t("searchWineDataWithAi")}
                    </button>
                    <small className="form-hint">{t("searchWineDataWithAiHelp")}</small>
                  </div>
                ) : null}
                <label>
                  <span>{t("producer")}</span>
                  <input value={draft.producer} onChange={(event) => setDraft({ ...draft, producer: event.target.value })} disabled={!canWriteWine} />
                </label>
                <div className="form-row">
                  <label>
                    <span>{t("format")}</span>
                    <select value={draft.format} onChange={(event) => setDraft({ ...draft, format: event.target.value })} disabled={!canWriteWine}>
                      <option value="">-</option>
                      {wineFormatOptions(draft.format).map((format) => (
                        <option key={format} value={format}>
                          {displayValue(format, locale, "format")}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    <span>{t("type")}</span>
                    <select value={draft.type} onChange={(event) => setDraft({ ...draft, type: event.target.value })} disabled={!canWriteWine}>
                      <option value="">-</option>
                      {wineTypeSelectOptions(draft.type).map((type) => (
                        <option key={type} value={type}>
                          {displayValue(type, locale, "type")}
                        </option>
                      ))}
                    </select>
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
                      <small className="form-hint">{t("vintageHelp")}</small>
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
                      <option value="To Collect">{displayValue("To Collect", locale, "status")}</option>
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
                    <h3><i className="dashboard-section-icon" aria-hidden="true">{grapesSvgIcon()}</i>{t("grapes")}</h3>
                    <button
                      type="button"
                      className="secondary compact"
                      disabled={!canWriteWine}
                      onClick={() => setDraft({ ...draft, grapes: [...draft.grapes, { name: "", percentage_from: "", percentage_to: "" }] })}
                    >
                      +
                    </button>
                  </div>
                  {draft.grapes.length ? draft.grapes.map((grape, index) => (
                    <div className="grape-edit-row" key={index}>
                      <input
                        value={grape.name}
                        onChange={(event) => setDraft({
                          ...draft,
                          grapes: draft.grapes.map((item, itemIndex) => itemIndex === index ? { ...item, name: event.target.value } : item),
                        })}
                        placeholder={t("grapeName")}
                        disabled={!canWriteWine}
                      />
                      <input
                        type="number"
                        min="0"
                        max="100"
                        step="0.01"
                        value={grape.percentage_from}
                        onChange={(event) => setDraft({
                          ...draft,
                          grapes: draft.grapes.map((item, itemIndex) => itemIndex === index ? { ...item, percentage_from: event.target.value } : item),
                        })}
                        placeholder={t("fromPercent")}
                        disabled={!canWriteWine}
                      />
                      <input
                        type="number"
                        min="0"
                        max="100"
                        step="0.01"
                        value={grape.percentage_to}
                        onChange={(event) => setDraft({
                          ...draft,
                          grapes: draft.grapes.map((item, itemIndex) => itemIndex === index ? { ...item, percentage_to: event.target.value } : item),
                        })}
                        placeholder={t("toPercent")}
                        disabled={!canWriteWine}
                      />
                      <button
                        type="button"
                        className="danger compact"
                        disabled={!canWriteWine}
                        onClick={() => setDraft({ ...draft, grapes: draft.grapes.filter((_, itemIndex) => itemIndex !== index) })}
                      >
                        {t("delete")}
                      </button>
                    </div>
                  )) : (
                    <p className="empty-state">{t("missingGrapes")}</p>
                  )}
                </div>
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
                {!editingWishlistId && canUseLabelRecognition ? (
                  <div className="recognition-box">
                    <span className="recognition-box-title">{wineRecognitionLoading && wineRecognitionTarget === "wishlist" ? t("recognizingWine") : t("recognizeWine")}</span>
                    <span className="recognition-beta-note">{t("recognitionBetaNotice")}</span>
                    <div className="recognition-actions">
                      <label className="recognition-upload-button secondary compact">
                        <span>{t("choosePhotoFile")}</span>
                        <input type="file" accept="image/*" disabled={!canUseLabelRecognition || wineRecognitionLoading} onChange={(event) => handleWineRecognitionInput(event, "wishlist")} />
                      </label>
                      <label className="recognition-camera-button compact" title={t("takeLabelPhoto")} aria-label={t("takeLabelPhoto")}>
                        <svg viewBox="0 0 24 24" aria-hidden="true">
                          <path d="M7 7l1.4-2h7.2L17 7h2.5A2.5 2.5 0 0 1 22 9.5v7A2.5 2.5 0 0 1 19.5 19h-15A2.5 2.5 0 0 1 2 16.5v-7A2.5 2.5 0 0 1 4.5 7H7Z" />
                          <circle cx="12" cy="13" r="4" />
                        </svg>
                        <input type="file" accept="image/*" capture="environment" disabled={!canUseLabelRecognition || wineRecognitionLoading} onChange={(event) => handleWineRecognitionInput(event, "wishlist")} />
                      </label>
                    </div>
                    {wineRecognitionResult && wineRecognitionTarget === "wishlist" ? (
                      <div className="recognition-results">
                        <strong>{t("recognitionSuggestions")}</strong>
                        {wineEnrichmentLoading ? <span>{t("generating")}</span> : null}
                        {wineRecognitionResult.matches.length ? wineRecognitionResult.matches.map((match) => (
                          <button key={match.id || `${match.producer}-${match.name}`} type="button" className="secondary compact" onClick={() => void applyRecognizedCatalogItem(match, wineRecognitionResult.raw_best_label || match.name, "wishlist")}>
                            {recognitionSuggestionLabel([match.name, match.producer, match.region].filter(Boolean).join(" - "), wineRecognitionResult.suggestions[0]?.confidence ?? null, locale)}
                          </button>
                        )) : (
                          <>
                            <span>{t("recognitionNoMatch")}</span>
                            {wineRecognitionResult.suggestions.map((suggestion) => (
                              <button key={suggestion.label} type="button" className="secondary compact" onClick={() => void applyRecognitionSuggestion(suggestion, "wishlist")}>
                                {t("useSuggestion")}: {recognitionSuggestionLabel(suggestion.label, suggestion.confidence, locale)}
                              </button>
                            ))}
                          </>
                        )}
                      </div>
                    ) : null}
                  </div>
                ) : null}
                <label>
                  <span>{t("wishlistList")}</span>
                  <select value={wishlistDraft.wishlist_list_id} onChange={(event) => setWishlistDraft({ ...wishlistDraft, wishlist_list_id: event.target.value })} required disabled={!canWriteWine}>
                    {wishlistLists.map((wishlistList) => (
                      <option key={wishlistList.id} value={wishlistList.id}>{wishlistList.name}</option>
                    ))}
                  </select>
                </label>
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
                    <select value={wishlistDraft.type} onChange={(event) => setWishlistDraft({ ...wishlistDraft, type: event.target.value })} disabled={!canWriteWine}>
                      <option value="">-</option>
                      {wineTypeSelectOptions(wishlistDraft.type).map((type) => (
                        <option key={type} value={type}>
                          {displayValue(type, locale, "type")}
                        </option>
                      ))}
                    </select>
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
                      {wishlistPrioritySelectOptions(wishlistDraft.priority).map((priority) => (
                        <option key={priority} value={priority}>
                          {displayValue(priority, locale, "priority")}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    <span>{t("purpose")}</span>
                    <select value={wishlistDraft.purpose} onChange={(event) => setWishlistDraft({ ...wishlistDraft, purpose: event.target.value })} disabled={!canWriteWine}>
                      {wishlistPurposeSelectOptions(wishlistDraft.purpose).map((purpose) => (
                        <option key={purpose} value={purpose}>
                          {displayValue(purpose, locale, "purpose")}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
                <label>
                  <span>{t("status")}</span>
                  <select value={wishlistDraft.status} onChange={(event) => setWishlistDraft({ ...wishlistDraft, status: event.target.value })} disabled={!canWriteWine}>
                    {wishlistStatusSelectOptions(wishlistDraft.status).map((status) => (
                      <option key={status} value={status}>
                        {displayValue(status, locale, "status")}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  <span>{t("notes")}</span>
                  <textarea value={wishlistDraft.notes} onChange={(event) => setWishlistDraft({ ...wishlistDraft, notes: event.target.value })} rows={3} disabled={!canWriteWine} />
                </label>
                <label>
                  <span>{t("aiContextNote")}</span>
                  <textarea value={wishlistDraft.ai_context_note} onChange={(event) => setWishlistDraft({ ...wishlistDraft, ai_context_note: event.target.value })} rows={3} disabled={!canWriteWine} />
                  <small>{t("aiContextNoteHelp")}</small>
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
                  canWrite={canWriteWine}
                  saving={saving}
                  generating={generatingAi}
                  onGenerate={(feature) => generateWineAi(selectedVisibleWine, feature)}
                  onConsume={(payload) => consumeWineBottle(selectedVisibleWine, payload)}
                  onUpdateTastingEntry={updateWineTastingEntry}
                  onDeleteTastingEntry={deleteWineTastingEntry}
                  marketAuditEntry={selectedWineMarketAudit}
                  onOpenMarketView={(entry) => setMarketViewContext({ kind: "wine", wine: selectedVisibleWine, entry })}
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
                  marketAuditEntry={selectedWishlistMarketAudit}
                  onOpenMarketView={(entry) => setMarketViewContext({ kind: "wishlist", item: selectedWishlistItem, entry })}
                  t={t}
                  locale={locale}
                />
            ) : activeView === "wishlist" ? (
                <WishlistPortfolioStrategyPanel
                  strategy={visibleWishlistPortfolioStrategy}
                  canGenerate={canGenerateAi && wishlist.length > 0}
                  generating={generatingAi === "wishlist-portfolio-strategy"}
                  onGenerate={generateWishlistPortfolioStrategy}
                  open={wishlistPortfolioStrategyOpen}
                  onToggle={setWishlistPortfolioStrategyOpen}
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
                  <span><i className="stat-icon" aria-hidden="true">{dashboardStatSvgIcon("mine")}</i>{t("myBottles")}</span>
                  <strong>{formatBottleCount(cellarStats.myBottles, locale)}</strong>
                  <p>{formatMoney(cellarStats.myValue, "CHF", locale)}</p>
                </button>
                <button type="button" className={`stat-card ownership-stat ${quickWineFilter === "shared" ? "active" : ""}`} onClick={() => applyQuickWineFilter("shared")}>
                  <span><i className="stat-icon" aria-hidden="true">{dashboardStatSvgIcon("shared")}</i>{t("sharedBottles")}</span>
                  <strong>{formatBottleCount(cellarStats.sharedBottles, locale)}</strong>
                  <p>{formatMoney(cellarStats.sharedValue, "CHF", locale)}</p>
                </button>
                <button type="button" className={`stat-card ownership-stat ${quickWineFilter === "" ? "active" : ""}`} onClick={() => applyQuickWineFilter("")}>
                  <span><i className="stat-icon" aria-hidden="true">{dashboardStatSvgIcon("total")}</i>{t("totalValue")}</span>
                  <strong>{formatBottleCount(cellarStats.bottles, locale)}</strong>
                  <p>{formatMoney(cellarStats.totalValue, "CHF", locale)}</p>
                </button>
                <button type="button" className={`stat-card ${quickWineFilter === "drink_now" ? "active" : ""}`} onClick={() => applyQuickWineFilter("drink_now")}>
                  <span><i className="stat-icon" aria-hidden="true">{dashboardStatSvgIcon("drink_now")}</i>{t("drinkNow")}</span>
                  <strong>{cellarStats.drinkNow}</strong>
                </button>
                <button type="button" className={`stat-card ${quickWineFilter === "drink_soon" ? "active" : ""}`} onClick={() => applyQuickWineFilter("drink_soon")}>
                  <span><i className="stat-icon" aria-hidden="true">{dashboardStatSvgIcon("drink_soon")}</i>{t("drinkIn2Years")}</span>
                  <strong>{cellarStats.drinkSoon}</strong>
                </button>
                <button type="button" className={`stat-card ${quickWineFilter === "past_window" ? "active" : ""}`} onClick={() => applyQuickWineFilter("past_window")}>
                  <span><i className="stat-icon" aria-hidden="true">{dashboardStatSvgIcon("past_window")}</i>{t("pastWindow")}</span>
                  <strong>{cellarStats.pastWindow}</strong>
                </button>
                <button type="button" className={`stat-card ${quickWineFilter === "future_deliveries" ? "active" : ""}`} onClick={() => applyQuickWineFilter("future_deliveries")}>
                  <span><i className="stat-icon" aria-hidden="true">{dashboardStatSvgIcon("future_deliveries")}</i>{t("futureDeliveries")}</span>
                  <strong>{cellarStats.futureDeliveries}</strong>
                  {cellarStats.nextDelivery ? <p>{cellarStats.nextDelivery.wine.name}: {cellarStats.nextDelivery.days} days</p> : null}
                </button>
                <button type="button" className={`stat-card compact-list ${quickWineFilter === "missing_data" ? "active" : ""}`} onClick={() => applyQuickWineFilter("missing_data")}>
                  <span><i className="stat-icon" aria-hidden="true">{dashboardStatSvgIcon("missing_data")}</i>{t("dataQuality")}</span>
                  <p>{t("missingValue")}: <strong>{cellarStats.missingValue}</strong></p>
                  <p>{t("missingDrinkWindow")}: <strong>{cellarStats.missingDrinkWindow}</strong></p>
                  <p>{t("missingGrapes")}: <strong>{cellarStats.missingGrapes}</strong></p>
                  <p>{t("missingScores")}: <strong>{cellarStats.missingScores}</strong></p>
                </button>
                {valueByType.length ? (
                  <>
                  <div className="stat-card compact-list type-breakdown">
                    <span>{t("valueByType")}</span>
                    <div className="breakdown-layout">
                      <div className="breakdown-list">
                        {valueByType.map((item) => (
                          <button type="button" className="breakdown-list-item" key={item.label} onClick={() => openBreakdownDrilldown("valueByType", "type", "value", item.label)}>
                            <i className={`wine-dot tone-${wineTone(item.label)}`} />
                            {displayValue(item.label, locale, "type")}: {formatMoney(item.value, "CHF", locale)}
                          </button>
                        ))}
                      </div>
                      <BreakdownDonut items={valueByType} mode="type" locale={locale} onSelect={(item) => openBreakdownDrilldown("valueByType", "type", "value", item.label)} />
                    </div>
                  </div>
                  {renderBreakdownDrilldown("valueByType")}
                  </>
                ) : null}
                {valueByRegion.length ? (
                  <>
                  <div className="stat-card compact-list type-breakdown">
                    <span>{t("topRegions")}</span>
                    <div className="breakdown-layout">
                      <div className="breakdown-list">
                        {valueByRegion.map((item, index) => (
                          <button type="button" className="breakdown-list-item" key={item.label} onClick={() => openBreakdownDrilldown("topRegions", "region", "value", item.label)}>
                            <i className="breakdown-marker" style={{ backgroundColor: breakdownColor(item.label, index, "region") } as CSSProperties} />
                            {item.label}: {formatMoney(item.value, "CHF", locale)}
                          </button>
                        ))}
                      </div>
                      <BreakdownDonut items={valueByRegion} mode="region" locale={locale} onSelect={(item) => openBreakdownDrilldown("topRegions", "region", "value", item.label)} />
                    </div>
                  </div>
                  {renderBreakdownDrilldown("topRegions")}
                  </>
                ) : null}
                {bottlesByType.length ? (
                  <>
                  <div className="stat-card compact-list type-breakdown">
                    <span>{t("bottlesByType")}</span>
                    <div className="breakdown-layout">
                      <div className="breakdown-list">
                        {bottlesByType.map((item) => (
                          <button type="button" className="breakdown-list-item" key={item.label} onClick={() => openBreakdownDrilldown("bottlesByType", "type", "bottles", item.label)}>
                            <i className={`wine-dot tone-${wineTone(item.label)}`} />
                            {displayValue(item.label, locale, "type")}: {formatBottleCount(item.value, locale)}
                          </button>
                        ))}
                      </div>
                      <BreakdownDonut items={bottlesByType} mode="type" locale={locale} onSelect={(item) => openBreakdownDrilldown("bottlesByType", "type", "bottles", item.label)} />
                    </div>
                  </div>
                  {renderBreakdownDrilldown("bottlesByType")}
                  </>
                ) : null}
                {bottlesByRegion.length ? (
                  <>
                  <div className="stat-card compact-list type-breakdown">
                    <span>{t("bottlesByRegion")}</span>
                    <div className="breakdown-layout">
                      <div className="breakdown-list">
                        {bottlesByRegion.map((item, index) => (
                          <button type="button" className="breakdown-list-item" key={item.label} onClick={() => openBreakdownDrilldown("bottlesByRegion", "region", "bottles", item.label)}>
                            <i className="breakdown-marker" style={{ backgroundColor: breakdownColor(item.label, index, "region") } as CSSProperties} />
                            {item.label}: {formatBottleCount(item.value, locale)}
                          </button>
                        ))}
                      </div>
                      <BreakdownDonut items={bottlesByRegion} mode="region" locale={locale} onSelect={(item) => openBreakdownDrilldown("bottlesByRegion", "region", "bottles", item.label)} />
                    </div>
                  </div>
                  {renderBreakdownDrilldown("bottlesByRegion")}
                  </>
                ) : null}
                {winesByRegion.length ? (
                  <>
                  <div className="stat-card compact-list type-breakdown">
                    <span>{t("winesByRegion")}</span>
                    <div className="breakdown-layout">
                      <div className="breakdown-list">
                        {winesByRegion.map((item, index) => (
                          <button type="button" className="breakdown-list-item" key={item.label} onClick={() => openBreakdownDrilldown("winesByRegion", "region", "wines", item.label)}>
                            <i className="breakdown-marker" style={{ backgroundColor: breakdownColor(item.label, index, "region") } as CSSProperties} />
                            {item.label}: {formatBottleCount(item.value, locale)}
                          </button>
                        ))}
                      </div>
                      <BreakdownDonut items={winesByRegion} mode="region" locale={locale} onSelect={(item) => openBreakdownDrilldown("winesByRegion", "region", "wines", item.label)} />
                    </div>
                  </div>
                  {renderBreakdownDrilldown("winesByRegion")}
                  </>
                ) : null}
                <div className="stat-card compact-list ai-card">
                  <span>{t("aiReadiness")}</span>
                  <strong>{cellarStats.aiNotes} / {cellarWines.length}</strong>
                  <p>{t("aiReadinessHelp")}</p>
                </div>
              </section>
            </details>
            ) : activeView === "history" ? (
            <>
            <div className="history-section-tabs" role="tablist" aria-label={t("history")}>
              <button
                type="button"
                role="tab"
                aria-selected={historySection === "tastings"}
                className={historySection === "tastings" ? "" : "secondary"}
                onClick={() => setHistorySection("tastings")}
              >
                {t("historyTastings")}
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={historySection === "wines"}
                className={historySection === "wines" ? "" : "secondary"}
                onClick={() => setHistorySection("wines")}
              >
                {t("historyArchivedWines")}
              </button>
            </div>
            <details className="stats-panel-wrapper" open>
              <summary>{historySection === "tastings" ? t("historyTastings") : t("consumedWines")}</summary>
              <section className="stats-panel">
                {historySection === "tastings" ? (
                  <>
                    <div className="stat-card">
                      <span>{t("tastingEntries")}</span>
                      <strong>{formatBottleCount(tastingStats.count, locale)}</strong>
                    </div>
                    <div className="stat-card">
                      <span>{t("ratedTastings")}</span>
                      <strong>{formatBottleCount(tastingStats.rated, locale)}</strong>
                    </div>
                    <div className="stat-card">
                      <span>{t("tastingNotesSaved")}</span>
                      <strong>{formatBottleCount(tastingStats.notes, locale)}</strong>
                    </div>
                    <div className="stat-card compact-list ai-card">
                      <span>{t("latestTasted")}</span>
                      <strong>{tastingStats.latest ? formatDisplayDate(tastingStats.latest) : "-"}</strong>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="stat-card">
                      <span>{t("consumedWines")}</span>
                      <strong>{formatBottleCount(historyStats.count, locale)}</strong>
                    </div>
                    <div className="stat-card">
                      <span>{t("sharedBottles")}</span>
                      <strong>{formatBottleCount(historyStats.shared, locale)}</strong>
                    </div>
                    <div className="stat-card">
                      <span>{t("notes")}</span>
                      <strong>{historyStats.notes}</strong>
                    </div>
                    <div className="stat-card">
                      <span>{t("scores")}</span>
                      <strong>{historyStats.scores}</strong>
                    </div>
                    <div className="stat-card compact-list ai-card">
                      <span>{t("aiReadiness")}</span>
                      <strong>{historyStats.aiNotes} / {historyWines.length}</strong>
                      <p>{t("aiReadinessHelp")}</p>
                    </div>
                  </>
                )}
              </section>
            </details>
            </>
            ) : (
            <details className="stats-panel-wrapper" open>
              <summary>{t("wishlistItems")}</summary>
              <div className="stats-panel-actions wishlist-list-toolbar">
                <label className="wishlist-list-select">
                  <span>{t("wishlistList")}</span>
                  <select value={selectedWishlistListId} onChange={(event) => setSelectedWishlistListId(event.target.value)} disabled={saving || wishlistLists.length === 0}>
                    {wishlistLists.map((wishlistList) => (
                      <option key={wishlistList.id} value={wishlistList.id}>
                        {wishlistList.name} ({wishlistList.item_count})
                      </option>
                    ))}
                  </select>
                </label>
                <div className="inline-actions">
                  <button type="button" className="secondary compact" disabled={!canWriteWine || saving} onClick={createWishlistList}>{t("createWishlistList")}</button>
                  <button type="button" className="secondary compact" disabled={!canWriteWine || saving || !selectedWishlistList} onClick={renameWishlistList}>{t("renameWishlistList")}</button>
                  <button type="button" className="danger compact" disabled={!canAdmin || saving || wishlistLists.length <= 1 || !selectedWishlistList} onClick={deleteWishlistList}>{t("deleteWishlistList")}</button>
                </div>
              </div>
              <section className="stats-panel">
                <div className="stat-card">
                  <span>{t("wishlistItems")}</span>
                  <strong>{formatBottleCount(wishlistStats.count, locale)}</strong>
                </div>
                <div className="stat-card">
                  <span>{t("targetValue")}</span>
                  <strong>{formatMoney(wishlistStats.targetValue, "CHF", locale)}</strong>
                </div>
                <div className="stat-card">
                  <span>{t("highPriority")}</span>
                  <strong>{formatBottleCount(wishlistStats.highPriority, locale)}</strong>
                </div>
                <div className="stat-card">
                  <span>{t("readyToBuy")}</span>
                  <strong>{formatBottleCount(wishlistStats.readyToBuy, locale)}</strong>
                </div>
              </section>
              <div className="stats-panel-actions">
                <button
                  type="button"
                  className="secondary compact"
                  disabled={!canGenerateAi || generatingAi === "wishlist-portfolio-strategy" || wishlist.length === 0}
                  onClick={() => generateWishlistPortfolioStrategy()}
                >
                  {generatingAi === "wishlist-portfolio-strategy"
                    ? t("generating")
                    : visibleWishlistPortfolioStrategy
                      ? t("refreshWishlistPortfolioStrategy")
                      : t("generateWishlistPortfolioStrategy")}
                </button>
              </div>
              {isMobileViewport && !selectedWishlistItem ? (
                <WishlistPortfolioStrategyPanel
                  strategy={visibleWishlistPortfolioStrategy}
                  canGenerate={canGenerateAi && wishlist.length > 0}
                  generating={generatingAi === "wishlist-portfolio-strategy"}
                  onGenerate={generateWishlistPortfolioStrategy}
                  open={wishlistPortfolioStrategyOpen}
                  onToggle={setWishlistPortfolioStrategyOpen}
                  t={t}
                />
              ) : null}
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
              {isWineCollectionView ? (
                <div className="price-filter-panel">
                  <div className="price-filter-head">
                    <span>{t("bottlePrice")}</span>
                    <button type="button" className="secondary compact" onClick={() => { setMinBottlePriceFilter(""); setMaxBottlePriceFilter(""); }}>
                      {t("resetPriceRange")}
                    </button>
                  </div>
                  <div className="price-filter-chart" aria-hidden="true">
                    {priceHistogram.map((count, index) => (
                      <span
                        key={index}
                        className="price-filter-bar"
                        style={{ height: `${(count / maxHistogramCount) * 100}%` }}
                      />
                    ))}
                  </div>
                  <div className="price-filter-slider">
                    <div
                      className="price-filter-selection"
                      style={{
                        left: `${bottlePriceSelectionLeft}%`,
                        width: `${Math.max(bottlePriceSelectionRight - bottlePriceSelectionLeft, 0)}%`,
                      }}
                    />
                    <input
                      type="range"
                      min={bottlePriceRangeMin}
                      max={bottlePriceRangeMax}
                      step="1"
                      value={sliderMinBottlePrice}
                      onChange={(event) => updateMinBottlePrice(event.target.value)}
                      aria-label={t("minPrice")}
                    />
                    <input
                      type="range"
                      min={bottlePriceRangeMin}
                      max={bottlePriceRangeMax}
                      step="1"
                      value={sliderMaxBottlePrice}
                      onChange={(event) => updateMaxBottlePrice(event.target.value)}
                      aria-label={t("maxPrice")}
                    />
                  </div>
                  <div className="price-filter-inputs">
                    <label>
                      <span>{t("minPrice")}</span>
                      <div className="price-filter-input-shell">
                        <strong>CHF</strong>
                        <input
                          type="number"
                          min={bottlePriceRangeMin}
                          max={sliderMaxBottlePrice}
                          step="0.01"
                          value={minBottlePriceFilter}
                          onChange={(event) => updateMinBottlePrice(event.target.value)}
                          placeholder={String(bottlePriceRangeMin)}
                        />
                      </div>
                    </label>
                    <label>
                      <span>{t("maxPrice")}</span>
                      <div className="price-filter-input-shell">
                        <strong>CHF</strong>
                        <input
                          type="number"
                          min={sliderMinBottlePrice}
                          max={bottlePriceRangeMax}
                          step="0.01"
                          value={maxBottlePriceFilter}
                          onChange={(event) => updateMaxBottlePrice(event.target.value)}
                          placeholder={String(bottlePriceRangeMax)}
                        />
                      </div>
                    </label>
                  </div>
                </div>
              ) : null}
              <div className="filter-row">
                {isWineCollectionView ? (
                  <div className="filter-choice-group">
                    <span>{t("tag")}</span>
                    {tagOptions.length > 6 ? (
                      <input
                        className="filter-choice-search"
                        value={tagOptionQuery}
                        onChange={(event) => setTagOptionQuery(event.target.value)}
                        placeholder={t("searchTags")}
                      />
                    ) : null}
                    <div className="tag-choice-list compact roomy">
                      {filteredTagOptions.length ? filteredTagOptions.map((tag) => (
                        <label key={tag} style={tagFilter.includes(tag) ? tagColorStyle(tag, userTags) : undefined}>
                          <input type="checkbox" checked={tagFilter.includes(tag)} onChange={() => setTagFilter((current) => toggleListValue(current, tag))} />
                          <span>{tag}</span>
                        </label>
                      )) : <span className="empty-state">{tagOptions.length ? t("searchTags") : t("allTags")}</span>}
                    </div>
                  </div>
                ) : null}
                {isWineCollectionView ? (
                  <div className="filter-choice-group">
                    <span>{t("grapes")}</span>
                    {grapeOptions.length > 6 ? (
                      <input
                        className="filter-choice-search"
                        value={grapeOptionQuery}
                        onChange={(event) => setGrapeOptionQuery(event.target.value)}
                        placeholder={t("searchGrapes")}
                      />
                    ) : null}
                    <div className="tag-choice-list compact roomy grapes-list">
                      {filteredGrapeOptions.length ? filteredGrapeOptions.map((grape) => (
                        <label key={grape} className={grapeFilter.includes(grape) ? "selected-filter-chip" : undefined}>
                          <input type="checkbox" checked={grapeFilter.includes(grape)} onChange={() => setGrapeFilter((current) => toggleListValue(current, grape))} />
                          <span>{grape}</span>
                        </label>
                      )) : <span className="empty-state">{grapeOptions.length ? t("searchGrapes") : t("grapes")}</span>}
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
              <h2>
                {activeView === "wishlist"
                  ? t("wishlist")
                  : activeView === "history"
                    ? historySection === "tastings"
                      ? t("historyTastings")
                      : t("historyArchivedWines")
                    : t("wines")}
              </h2>
              <span>
                {visibleCount} / {
                  activeView === "history" && historySection === "tastings"
                    ? tastingArchiveTotalCount
                    : isWineCollectionView
                      ? activeWineCollection.length
                      : wishlist.length
                } {t("records")}
              </span>
            </div>
            {isWineCollectionView && !(activeView === "history" && historySection === "tastings") && compareWineIds.length ? (
              <div className="compare-summary-bar">
                <div>
                  <strong>{t("compareSelection")}</strong>
                  <span>{compareWineIds.length}/4 {t("compareSelected").toLowerCase()}</span>
                </div>
                <div className="compare-summary-actions">
                  <button type="button" className="secondary compact" onClick={openCompareModal}>
                    {t("openCompare")}
                  </button>
                  <button type="button" className="secondary compact" onClick={clearComparedWines}>
                    {t("clearCompare")}
                  </button>
                </div>
              </div>
            ) : null}
            {loading || tastingArchiveLoading ? <LoadingState label={t("loadingData")} /> : null}
            {!loading && activeView === "cellar" && filteredWines.length === 0 ? <p className="empty-state">{t("noWineMatch")}</p> : null}
            {!loading && activeView === "history" && historySection === "wines" && filteredWines.length === 0 ? <p className="empty-state">{t("noHistoryMatch")}</p> : null}
            {!loading && !tastingArchiveLoading && activeView === "history" && historySection === "tastings" && visibleTastingEntries.length === 0 ? <p className="empty-state">{t("noTastingArchiveMatch")}</p> : null}
            {!loading && activeView === "wishlist" && filteredWishlist.length === 0 ? <p className="empty-state">{t("noWishlistMatch")}</p> : null}
            {activeView === "history" && historySection === "tastings" && visibleTastingEntries.length ? (
              <>
                {usingPagedTastingArchive ? (
                  <div className="pagination-bar">
                    <span>
                      {t("showingResults")} {tastingArchiveOffset + 1}-{Math.min(tastingArchiveOffset + visibleTastingEntries.length, tastingArchiveTotalCount)} / {tastingArchiveTotalCount}
                    </span>
                    <div className="pagination-actions">
                      <button
                        type="button"
                        className="secondary compact"
                        disabled={tastingArchiveLoading || tastingArchiveOffset <= 0}
                        onClick={() => setTastingArchiveOffset((current) => Math.max(current - TASTING_ARCHIVE_PAGE_SIZE, 0))}
                      >
                        {t("previousPage")}
                      </button>
                      <button
                        type="button"
                        className="secondary compact"
                        disabled={tastingArchiveLoading || tastingArchiveOffset + visibleTastingEntries.length >= tastingArchiveTotalCount}
                        onClick={() => setTastingArchiveOffset((current) => current + TASTING_ARCHIVE_PAGE_SIZE)}
                      >
                        {t("nextPage")}
                      </button>
                    </div>
                  </div>
                ) : null}
                <TastingArchiveSection
                  entries={visibleTastingEntries}
                  saving={saving}
                  t={t}
                  locale={locale}
                  onOpenWine={openWineFromTastingArchive}
                  onUpdateEntry={updateWineTastingEntry}
                  onDeleteEntry={deleteWineTastingEntry}
                />
              </>
            ) : null}
            {isWineCollectionView && !(activeView === "history" && historySection === "tastings") && groupedFilteredWines.length ? (
              <div className="wine-tone-groups">
                <p className="list-header list-header-inline">{t("groupedByColor")}</p>
                {groupedFilteredWines.map((group) => (
                  <section
                    className={`wine-tone-group tone-${group.tone}${openWineToneGroups[group.tone] ? " open" : ""}`}
                    key={group.tone}
                  >
                    <button
                      type="button"
                      className="wine-tone-group-toggle"
                      aria-expanded={openWineToneGroups[group.tone]}
                      onClick={() => setOpenWineToneGroups((current) => ({ ...current, [group.tone]: !current[group.tone] }))}
                    >
                      <span className={`wine-tone-pill tone-${group.tone}`}>{group.label}</span>
                      <span className="wine-tone-group-summary">
                        {formatBottleCount(group.wineCount, locale)} {t("winesLabel")} • {formatBottleCount(group.bottleCount, locale)} {t("bottles").toLowerCase()}
                      </span>
                      <span className="wine-tone-group-chevron" aria-hidden="true">›</span>
                    </button>
                    {openWineToneGroups[group.tone] ? group.items.map((wine) => (
              <div className="list-item-block" key={wine.id} data-wine-row-id={wine.id}>
                <article className={`${selectedWineId === wine.id ? "wine-row selected" : "wine-row"} tone-${wineTone(wine.type)}`} onClick={(event) => { if (!isInteractiveRowClick(event)) toggleSelectedWine(wine); }}>
                  <div className="wine-row-main">
                    <h3>
                      <i className={`wine-dot tone-${wineTone(wine.type)}`} />
                      <span className="wine-title-row">
                        <span className="wine-title">{wine.name}</span>
                        {wine.vintage ? <span className="vintage-label vintage-label--small"><span>{wine.vintage}</span></span> : null}
                      </span>
                      {wine.notes ? <span className="note-indicator" title={t("notes")} aria-label={t("notes")}>✎</span> : null}
                    </h3>
                    <p className="row-primary">
                      <span>{wine.producer || t("noProducer")} - {wineQuantityLabel(wine, session, t("bottles").toLowerCase(), locale)}</span>
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
                  <strong className="row-value">{formatMoney(wine.current_value || wine.price, wine.currency, locale)}</strong>
                  <div className="row-actions">
                    <button type="button" className={compareWineIds.includes(wine.id) ? "" : "secondary"} onClick={(event) => { event.stopPropagation(); toggleCompareWine(wine); }}>
                      {t("compare")}
                    </button>
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
                      canWrite={canWriteWine}
                      saving={saving}
                      generating={generatingAi}
                      onGenerate={(feature) => generateWineAi(wine, feature)}
                      onConsume={(payload) => consumeWineBottle(wine, payload)}
                      onUpdateTastingEntry={updateWineTastingEntry}
                      onDeleteTastingEntry={deleteWineTastingEntry}
                      marketAuditEntry={aiAudit.find((entry) => entry.entity_type === "wine" && entry.entity_id === wine.id && entry.feature === "ai_value") || null}
                      onOpenMarketView={(entry) => setMarketViewContext({ kind: "wine", wine, entry })}
                      t={t}
                      locale={locale}
                    />
                    {renderSharePanel(wine)}
                  </div>
                ) : null}
              </div>
                    )) : null}
                  </section>
                ))}
              </div>
            ) : null}
            {!isWineCollectionView ? filteredWishlist.map((item) => {
              const targetPriceValue = formatMoney(item.target_price, item.currency, locale);
              const aiMarketPriceValue = item.ai_market_price ? formatMoney(item.ai_market_price, item.ai_market_price_currency || item.currency, locale) : "";
              const readyToBuy = isWishlistReadyToBuy(item.status);
              return (
              <div className="list-item-block" key={item.id}>
                <article className={`${selectedWishlistId === item.id ? "wine-row selected" : "wine-row"} wishlist-row${readyToBuy ? " wishlist-buy-row" : ""} tone-${wineTone(item.type)}`} onClick={(event) => { if (!isInteractiveRowClick(event)) toggleSelectedWishlistItem(item); }}>
                  <div className="wine-row-main">
                    <h3>
                      <i className={`wine-dot tone-${wineTone(item.type)}`} />
                      <span className="wine-title-row">
                        <span className="wine-title">{item.name}</span>
                        {item.vintage ? <span className="vintage-label vintage-label--small"><span>{item.vintage}</span></span> : null}
                      </span>
                    </h3>
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
                    </div>
                    <div className="row-meta">
                      {item.merchant ? <span>{item.merchant}</span> : null}
                      {item.notes ? <span>{item.notes}</span> : null}
                    </div>
                    {selectedWishlistId === item.id && (item.ai_strategy || item.ai_purpose_advice) ? (
                      <div className="wishlist-mobile-ai-preview">
                        {item.ai_strategy ? (
                          <div className="wishlist-mobile-ai-preview-note">
                            <strong>{item.ai_strategy_generated_at ? `${t("aiStrategy")} - ${t("generatedAt")} ${formatDisplayDate(item.ai_strategy_generated_at)}` : t("aiStrategy")}</strong>
                            <p>{readableLegacyAiText(item.ai_strategy, "strategy")}</p>
                          </div>
                        ) : null}
                        {item.ai_purpose_advice ? (
                          <div className="wishlist-mobile-ai-preview-note">
                            <strong>{item.ai_purpose_generated_at ? `${t("aiPurpose")} - ${t("generatedAt")} ${formatDisplayDate(item.ai_purpose_generated_at)}` : t("aiPurpose")}</strong>
                            <p>{readableLegacyAiText(item.ai_purpose_advice, "purpose")}</p>
                          </div>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                  <div className="wishlist-price-block">
                    <div className="wishlist-target-price">
                      <span>{t("targetPrice")}</span>
                      <strong className="wishlist-price">{targetPriceValue}</strong>
                    </div>
                    {aiMarketPriceValue ? (
                      <div className="wishlist-market-estimate">
                        <small>{t("marketEstimate")}</small>
                        <strong>{aiMarketPriceValue}</strong>
                      </div>
                    ) : null}
                  </div>
                  <div className="row-actions wishlist-row-actions">
                    <button type="button" className="secondary wishlist-action-button" disabled={!canWriteWine} onClick={(event) => { event.stopPropagation(); startEditWishlistItem(item); }} aria-label={t("edit")} title={t("edit")}>
                      <span className="action-icon">{wishlistActionSvgIcon("edit")}</span>
                      <span className="action-label">{t("edit")}</span>
                    </button>
                    <button type="button" className="wishlist-action-button" disabled={!canWriteWine || saving} onClick={(event) => { event.stopPropagation(); convertWishlistItem(item); }} aria-label={t("convert")} title={t("convert")}>
                      <span className="action-icon">{wishlistActionSvgIcon("convert")}</span>
                      <span className="action-label">{t("convert")}</span>
                    </button>
                    <button type="button" className="danger wishlist-action-button" disabled={!canAdmin} onClick={(event) => { event.stopPropagation(); deleteWishlistItem(item).catch((nextError) => setError(nextError instanceof Error ? nextError.message : "Unable to delete wishlist item")); }} aria-label={t("delete")} title={t("delete")}>
                      <span className="action-icon">{wishlistActionSvgIcon("delete")}</span>
                      <span className="action-label">{t("delete")}</span>
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
                      marketAuditEntry={aiAudit.find((entry) => entry.entity_type === "wishlist" && entry.entity_id === item.id && entry.feature === "wishlist_target_price") || null}
                      onOpenMarketView={(entry) => setMarketViewContext({ kind: "wishlist", item, entry })}
                      t={t}
                      locale={locale}
                    />
                  </div>
                ) : null}
              </div>
            )}) : null}
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
                  <button
                    type="button"
                    className="help-icon-button"
                    aria-expanded={passkeyHelpOpen}
                    aria-controls="passkey-help-panel"
                    aria-label={t("passkeyHelpLabel")}
                    onClick={() => setPasskeyHelpOpen((current) => !current)}
                  >
                    ?
                  </button>
                </div>
                {passkeyHelpOpen ? (
                  <div className="settings-help-panel" id="passkey-help-panel">
                    <strong>{t("passkeyHelpTitle")}</strong>
                    <p>{t("passkeyHelpBody")}</p>
                    <strong>{t("passkeyHelpPrerequisitesTitle")}</strong>
                    <ul>
                      <li>{t("passkeyHelpPrerequisiteAccount")}</li>
                      <li>{t("passkeyHelpPrerequisiteBrowser")}</li>
                      <li>{t("passkeyHelpPrerequisiteDevice")}</li>
                      <li>{t("passkeyHelpPrerequisiteSync")}</li>
                    </ul>
                  </div>
                ) : null}
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
                {trialRedeemCodes.length ? (
                  <div className="trial-redeem-list">
                    {trialRedeemCodes.map((code) => renderRedeemCodeRow(code, true))}
                  </div>
                ) : null}
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
                  {billingStatus?.can_purchase_ai_credits ? (
                    <button type="button" className="secondary" onClick={() => startCheckout("ai_credits")} disabled={saving}>
                      {t("buyAiCredits")}
                    </button>
                  ) : null}
                </form>
                {standardRedeemCodes.length ? (
                  <div className="member-list">
                    {standardRedeemCodes.map((code) => renderRedeemCodeRow(code))}
                  </div>
                ) : null}
                {billingStatus?.has_active_entitlement ? (
                  <p className="empty-state">{t("billing")}: {billingStatus.active_source} - {formatDisplayDate(billingStatus.valid_until)}</p>
                ) : null}
                  {showAiBudgetPanel ? (
                    <div className="ai-budget-panel">
                      <div className="ai-budget-head">
                        <strong>{t("aiCreditBalance")}</strong>
                        <span>{formatAiBudget(billingStatus?.ai_credit_balance_usd || 0)}</span>
                      </div>
                      <div className="ai-budget-bar" aria-hidden="true">
                        <div
                          className="ai-budget-fill"
                          style={{ width: `${aiBudgetFillRatio(billingStatus?.ai_credit_balance_usd || 0, billingStatus?.ai_credit_pack_size_usd || 0) * 100}%` }}
                        />
                      </div>
                      <small>{t("aiBudgetUsage")}</small>
                    </div>
                  ) : null}
              </section>
              ) : null}

              {settingsTab === "ai" && canWriteWine ? (
                <form className="settings-card settings-card-wide" onSubmit={submitAiSettings}>
                  <div className="settings-card-heading">
                    <div>
                      <span>{t("aiSettings")}</span>
                      <h3>OpenAI</h3>
                    </div>
                    <strong className={(aiSettings?.has_openai_api_key || aiSettings?.can_use_app_credits) ? "status-pill configured" : "status-pill"}>
                      {aiStatusLabel}
                    </strong>
                  </div>
                  <label>
                    <span>{t("aiProvider")}</span>
                    <select value={aiSettingsDraft.provider_mode} onChange={(event) => setAiSettingsDraft({ ...aiSettingsDraft, provider_mode: event.target.value as AiSettingsDraft["provider_mode"] })}>
                      <option value="auto">{t("aiProviderAuto")}</option>
                      <option value="user_key">{t("aiProviderUserKey")}</option>
                      <option value="credits">{t("aiProviderCredits")}</option>
                    </select>
                  </label>
                  <label>
                    <span>OpenAI API key</span>
                    <input
                      type="password"
                      value={aiSettingsDraft.openai_api_key}
                      onChange={(event) => setAiSettingsDraft({ ...aiSettingsDraft, openai_api_key: event.target.value })}
                      placeholder={aiSettings?.has_openai_api_key ? t("configured") : "sk-..."}
                    />
                  </label>
                  <label>
                    <span>{t("pairingPreferences")}</span>
                    <textarea
                      value={aiSettingsDraft.pairing_preferences}
                      onChange={(event) => setAiSettingsDraft({ ...aiSettingsDraft, pairing_preferences: event.target.value })}
                      placeholder={t("pairingPreferencesPlaceholder")}
                      rows={4}
                    />
                    <small>{t("pairingPreferencesHelp")}</small>
                  </label>
                    {showAiBudgetPanel ? (
                      <div className="token-box">
                        <strong>{t("aiCreditBalance")}</strong>
                        <span>{formatAiBudget(aiSettings?.app_credit_balance_usd || 0)}</span>
                        <div className="ai-budget-bar" aria-hidden="true">
                          <div
                            className="ai-budget-fill"
                            style={{ width: `${aiBudgetFillRatio(aiSettings?.app_credit_balance_usd || 0, aiSettings?.ai_credit_pack_size_usd || 0) * 100}%` }}
                          />
                        </div>
                        <small>{t("aiBudgetUsage")}</small>
                        <small>{t("aiCreditsHelp")}</small>
                        {aiSettingsDraft.provider_mode === "credits" && !aiSettings?.can_use_app_credits ? (
                          <small>{t("appAiKeyMissing")}</small>
                        ) : null}
                        {hasAiDraftChanges ? (
                          <small>{t("saveAiSourceHint")}</small>
                        ) : null}
                        {billingStatus?.can_purchase_ai_credits ? (
                          <button type="button" className="secondary compact" onClick={() => startCheckout("ai_credits")} disabled={saving}>
                            {t("buyAiCredits")}
                          </button>
                        ) : null}
                      </div>
                    ) : null}
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

              {settingsTab === "tags" && canWriteWine ? (
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
                <form className="inline-form" onSubmit={createHousehold}>
                  <label>
                    <span>{t("createCellar")}</span>
                    <input
                      value={newHouseholdNameDraft}
                      disabled={saving}
                      onChange={(event) => setNewHouseholdNameDraft(event.target.value)}
                      placeholder={t("cellarName")}
                      required
                    />
                  </label>
                  <button type="submit" disabled={saving || !newHouseholdNameDraft.trim()}>
                    {saving ? t("saving") : t("createCellar")}
                  </button>
                </form>
                <p className="empty-state">{t("createCellarHelp")}</p>
                <div className="token-box">
                  <strong>{t("deleteCellar")}</strong>
                  <span>{t("deleteCellarHelp")}</span>
                  <label>
                    <span>{t("deleteCellarTypeName")}</span>
                    <input
                      value={deleteHouseholdConfirmDraft}
                      disabled={saving || householdMemberships.length <= 1 || session?.membership_role !== "owner"}
                      onChange={(event) => setDeleteHouseholdConfirmDraft(event.target.value)}
                      placeholder={session?.active_household_name || t("cellarName")}
                    />
                  </label>
                  <div className="inline-form">
                    <button
                      type="button"
                      className="danger"
                      disabled={
                        saving ||
                        householdMemberships.length <= 1 ||
                        session?.membership_role !== "owner" ||
                        deleteHouseholdConfirmDraft.trim() !== (session?.active_household_name || "").trim()
                      }
                      onClick={deleteActiveHousehold}
                    >
                      {t("deleteCellar")}
                    </button>
                  </div>
                </div>
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
                  <details className="collapsible-panel" open>
                    <summary>{t("redeemCodes")}</summary>
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
                  </details>
                </section>
              ) : null}

              {settingsTab === "users" && canAppAdmin ? (
                <section className="settings-card settings-card-wide">
                  <details className="collapsible-panel" open>
                    <summary>{t("settingsUsers")}</summary>
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
                              <span>{t("aiCreditBalance")}: {formatAiBudget(user.ai_credit_balance_usd || 0)}</span>
                              <div className="credit-adjust-row">
                                <label>
                                  <span>{t("targetAiCreditBalance")}</span>
                                  <input
                                    type="number"
                                    min="0"
                                    step="0.01"
                                    value={userAiBalanceDrafts[user.id] || ""}
                                    onChange={(event) => setUserAiBalanceDrafts((current) => ({ ...current, [user.id]: event.target.value }))}
                                  />
                                </label>
                                <label>
                                  <span>{t("aiCreditAdminNote")}</span>
                                  <input
                                    value={userAiNoteDrafts[user.id] || ""}
                                    onChange={(event) => setUserAiNoteDrafts((current) => ({ ...current, [user.id]: event.target.value }))}
                                    placeholder={t("aiCreditAdminNote")}
                                  />
                                </label>
                                <button type="button" className="secondary compact" disabled={saving || !(userAiBalanceDrafts[user.id] || "").trim()} onClick={() => updateUserAiCreditBalance(user)}>
                                  {t("saveAiCreditBalance")}
                                </button>
                              </div>
                              <small>{t("aiCreditAdminHelp")}</small>
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
                              <button type="button" className={user.can_use_label_recognition ? "compact" : "secondary compact"} disabled={saving} onClick={() => toggleLabelRecognition(user)}>
                                {user.can_use_label_recognition ? t("labelRecognitionEnabled") : t("labelRecognitionDisabled")}
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
                  </details>
                </section>
              ) : null}

              {settingsTab === "users" && canAppAdmin ? (
                <section className="settings-card settings-card-wide">
                  <div className="settings-card-heading">
                    <div>
                      <span>{t("labelRecognitionAccess")}</span>
                      <h3>{t("pendingCatalogEntries")}</h3>
                    </div>
                    <div className="member-actions">
                      <strong>{pendingCatalogEntries.length}</strong>
                      <button type="button" className="secondary compact" disabled={saving} onClick={() => loadPendingCatalogEntries(true).catch((nextError) => setError(nextError instanceof Error ? nextError.message : "Unable to load catalog entries"))}>
                        {t("loadingData")}
                      </button>
                    </div>
                  </div>
                  {pendingCatalogEntries.length ? (
                    <div className="member-list">
                      {pendingCatalogEntries.map((entry) => (
                        <div className="member-row" key={entry.id || `${entry.producer}-${entry.name}`}>
                          <div>
                            <strong>{[entry.producer, entry.name].filter(Boolean).join(" - ") || entry.name}</strong>
                            <span>{[entry.region, entry.appellation, entry.type].filter(Boolean).join(" - ") || t("noActionItems")}</span>
                            {entry.country || entry.grapes_text ? <span>{[entry.country, entry.grapes_text].filter(Boolean).join(" - ")}</span> : null}
                          </div>
                          <div className="member-actions">
                            <button type="button" className="compact" disabled={saving} onClick={() => approveCatalogEntry(entry)}>
                              {t("approveCatalogEntry")}
                            </button>
                            <button type="button" className="danger compact" disabled={saving} onClick={() => deleteCatalogEntry(entry)}>
                              {t("rejectCatalogEntry")}
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="empty-state">{t("noPendingCatalogEntries")}</p>
                  )}
                </section>
              ) : null}

              {settingsTab === "users" && canAppAdmin ? (
                <section className="settings-card settings-card-wide">
                  <div className="settings-card-heading">
                    <div>
                      <span>{t("labelRecognitionAccess")}</span>
                      <h3>{t("catalogAdminSearch")}</h3>
                      <small>{t("catalogAdminSearchHelp")}</small>
                    </div>
                  </div>
                  <form className="inline-row-form" onSubmit={(event) => { event.preventDefault(); searchCatalogAdminEntries().catch((nextError) => setError(nextError instanceof Error ? nextError.message : "Unable to search catalog")); }}>
                    <input value={catalogAdminQuery} onChange={(event) => setCatalogAdminQuery(event.target.value)} placeholder="Dogaia, 36 lune..." />
                    <button type="submit" className="secondary compact" disabled={saving || !catalogAdminQuery.trim()}>{t("search")}</button>
                  </form>
                  {catalogAdminResults.length ? (
                    <div className="member-list">
                      {catalogAdminResults.map((entry) => (
                        <div className="member-row" key={entry.id || `${entry.producer}-${entry.name}`}>
                          <div>
                            <strong>{[entry.producer, entry.name].filter(Boolean).join(" - ") || entry.name}</strong>
                            <span>{[entry.region, entry.appellation, entry.type].filter(Boolean).join(" - ") || t("noActionItems")}</span>
                            <span className={entry.is_active ? "status-pill configured" : "status-pill"}>{entry.is_active ? "active" : "pending"}</span>
                          </div>
                          <div className="member-actions">
                            {!entry.is_active ? (
                              <button type="button" className="compact" disabled={saving} onClick={() => approveCatalogEntry(entry)}>
                                {t("approveCatalogEntry")}
                              </button>
                            ) : null}
                            <button type="button" className="danger compact" disabled={saving} onClick={() => deleteCatalogEntry(entry)}>
                              {t("deleteCatalogEntry")}
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : catalogAdminQuery.trim() ? (
                    <p className="empty-state">{t("noCatalogAdminResults")}</p>
                  ) : null}
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
                  <div className="token-box">
                    <strong>{t("importLegacy")}</strong>
                    <span>{t("importSupports")}</span>
                    <small>{t("exportHistoryIncluded")}</small>
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
                    <span>Vinaris JSON</span>
                    <input type="file" accept="application/json,.json" onChange={importLegacyFile} disabled={saving} />
                  </label>
                  {saving && !importPreview && !importResult ? <LoadingState label={t("loadingData")} compact /> : null}
                  {importPreview ? (
                    <div className="token-box">
                      <strong>{t("importReady")}: {importFileName}</strong>
                      <span>{importPreview.format === "vinaris" ? "Vinaris export v2" : "Legacy WineCellar JSON"}</span>
                      {importPreview.included_blocks.length ? <span>{importPreview.included_blocks.join(", ")}</span> : null}
                      <span>{t("wines")}: {importPreview.wine_new} {t("newItems")}, {importPreview.wine_duplicates} {t("probableDuplicates")} {t("of")} {importPreview.wines_total}</span>
                      <span>{t("wishlist")}: {importPreview.wishlist_new} {t("newItems")}, {importPreview.wishlist_duplicates} {t("probableDuplicates")} {t("of")} {importPreview.wishlist_total}</span>
                      {importPreview.members_total || importPreview.invites_total || importPreview.share_offers_total || importPreview.user_tags_total || importPreview.ai_audit_total ? (
                        <small>
                          {[
                            importPreview.members_total ? `${t("members")}: ${importPreview.members_total}` : "",
                            importPreview.invites_total ? `${t("invites")}: ${importPreview.invites_total}` : "",
                            importPreview.share_offers_total ? `${t("exportIncludesShareOffers")}: ${importPreview.share_offers_total}` : "",
                            importPreview.user_tags_total ? `${t("tags")}: ${importPreview.user_tags_total}` : "",
                            importPreview.ai_audit_total ? `${t("aiAudit")}: ${importPreview.ai_audit_total}` : "",
                          ].filter(Boolean).join(" | ")}
                        </small>
                      ) : null}
                      {[...importPreview.sample_wine_duplicates, ...importPreview.sample_wishlist_duplicates].length ? (
                        <small>{[...importPreview.sample_wine_duplicates, ...importPreview.sample_wishlist_duplicates].join(", ")}</small>
                      ) : null}
                    </div>
                  ) : null}
                  {importPreview?.format === "vinaris" ? (
                    <div className="token-box">
                      <strong>{t("importSelection")}</strong>
                      <span>{t("importSelectionHelp")}</span>
                      <div className="export-options-grid">
                        {exportBlocks
                          .filter(({ key }) => importPreview.included_blocks.includes(key))
                          .map((block) => (
                            <label className="export-option" key={`import-${block.key}`}>
                              <input
                                type="checkbox"
                                checked={importSelection[block.key]}
                                onChange={() => setImportSelection((current) => ({ ...current, [block.key]: !current[block.key] }))}
                              />
                              <span>{block.label}</span>
                            </label>
                          ))}
                      </div>
                    </div>
                  ) : null}
                  <div className="inline-form">
                    <button type="button" disabled={saving || !importPayload} onClick={runLegacyImport}>
                      <ButtonBusyContent busy={saving && Boolean(importPayload)} idleLabel={t("importRun")} busyLabel={t("loadingData")} />
                    </button>
                  </div>
                  {importResult ? (
                    <div className="token-box">
                      <strong>{t("importSummary")}</strong>
                      {(importResult.wines_deleted || importResult.wishlist_deleted) ? <span>{t("emptyCellar")}: {importResult.wines_deleted} {t("wines").toLowerCase()}, {importResult.wishlist_deleted} {t("wishlist").toLowerCase()}</span> : null}
                      <span>{t("wines")}: +{importResult.wines_imported}, {t("updatedItems")} {importResult.wines_updated}, {t("skipped")} {importResult.wines_skipped}</span>
                      <span>{t("wishlist")}: +{importResult.wishlist_imported}, {t("updatedItems")} {importResult.wishlist_updated}, {t("skipped")} {importResult.wishlist_skipped}</span>
                      {(importResult.members_imported || importResult.members_updated || importResult.members_skipped) ? <span>{t("members")}: +{importResult.members_imported}, {t("updatedItems")} {importResult.members_updated}, {t("skipped")} {importResult.members_skipped}</span> : null}
                      {(importResult.invites_imported || importResult.invites_updated || importResult.invites_skipped) ? <span>{t("invites")}: +{importResult.invites_imported}, {t("updatedItems")} {importResult.invites_updated}, {t("skipped")} {importResult.invites_skipped}</span> : null}
                      {(importResult.share_offers_imported || importResult.share_offers_updated || importResult.share_offers_skipped) ? <span>{t("exportIncludesShareOffers")}: +{importResult.share_offers_imported}, {t("updatedItems")} {importResult.share_offers_updated}, {t("skipped")} {importResult.share_offers_skipped}</span> : null}
                      {(importResult.user_tags_imported || importResult.user_tags_updated || importResult.user_tags_skipped) ? <span>{t("tags")}: +{importResult.user_tags_imported}, {t("updatedItems")} {importResult.user_tags_updated}, {t("skipped")} {importResult.user_tags_skipped}</span> : null}
                      {(importResult.ai_audit_imported || importResult.ai_audit_updated || importResult.ai_audit_skipped) ? <span>{t("aiAudit")}: +{importResult.ai_audit_imported}, {t("updatedItems")} {importResult.ai_audit_updated}, {t("skipped")} {importResult.ai_audit_skipped}</span> : null}
                    </div>
                  ) : null}
                  <div className="token-box">
                    <strong>{t("exportData")}</strong>
                    <span>{t("exportFullCellarHelp")}</span>
                    <small>{t("exportHistoryIncluded")}</small>
                    <small>{t("exportSensitiveNote")}</small>
                  </div>
                  <div className="export-options-grid">
                    {exportBlocks.map((block) => (
                      <label className="export-option" key={block.key}>
                        <input
                          type="checkbox"
                          checked={exportSelection[block.key]}
                          onChange={() => toggleExportSelection(block.key)}
                        />
                        <span>{block.label}</span>
                      </label>
                    ))}
                  </div>
                  <div className="inline-form">
                    <button type="button" className="secondary" disabled={saving || !hasSelectedExportBlock} onClick={exportJson}>
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
                    <>
                      <div className="audit-toolbar">
                        <label>
                          <span>{t("showLatest")}</span>
                          <select value={aiAuditLimit} onChange={(event) => setAiAuditLimit(event.target.value)}>
                            <option value="10">10</option>
                            <option value="25">25</option>
                            <option value="50">50</option>
                            <option value="100">100</option>
                            <option value="0">{t("allTime")}</option>
                          </select>
                        </label>
                        <label>
                          <span>{t("auditDateFrom")}</span>
                          <input type="date" value={aiAuditDateFrom} onChange={(event) => setAiAuditDateFrom(event.target.value)} />
                        </label>
                        <label>
                          <span>{t("auditDateTo")}</span>
                          <input type="date" value={aiAuditDateTo} onChange={(event) => setAiAuditDateTo(event.target.value)} />
                        </label>
                        <button
                          type="button"
                          className="secondary compact"
                          onClick={() => {
                            setAiAuditLimit("10");
                            setAiAuditDateFrom("");
                            setAiAuditDateTo("");
                          }}
                        >
                          {t("auditResetFilters")}
                        </button>
                      </div>
                      <p className="empty-state">{filteredAiAudit.length} {t("auditResultsCount")}</p>
                      <div className="audit-list audit-list-scrollable">
                      {visibleAiAudit.map((entry) => (
                        <div className="audit-row" key={entry.id}>
                          <strong>{entry.feature.replace(/_/g, " ")} - {aiEntityName(entry)}</strong>
                          <span>{entry.model} - {formatDisplayDate(entry.created_at)} - {entry.total_tokens.toLocaleString()} {t("tokens")} - {formatUsd(entry.estimated_cost_usd)}</span>
                          <p>{entry.summary}</p>
                        </div>
                      ))}
                      </div>
                    </>
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
      {loading ? <GlobalLoadingOverlay label={t("loadingData")} /> : null}
      {showBackToTop ? (
        <button
          type="button"
          className="back-to-top-button"
          aria-label={t("backToTop")}
          title={t("backToTop")}
          onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
        >
          <span aria-hidden="true">↑</span>
        </button>
      ) : null}
      {marketViewContext ? <MarketValueModal context={marketViewContext} t={t} locale={locale} onClose={() => setMarketViewContext(null)} /> : null}
      {compareModalOpen && comparedWines.length ? (
        <CompareWinesModal
          wines={comparedWines}
          session={session}
          t={t}
          locale={locale}
          canGenerateAi={canGenerateAi}
          aiResult={compareAiResult}
          aiLoading={compareAiLoading}
          onRunAiCompare={generateCompareAi}
          onClose={() => {
            setCompareModalOpen(false);
            setCompareAiResult(null);
          }}
          onRemove={(wineId) => {
            setCompareWineIds((current) => current.filter((id) => id !== wineId));
            setCompareAiResult(null);
          }}
        />
      ) : null}
    </main>
  );
}
