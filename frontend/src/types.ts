export type Session = {
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

export type Wine = {
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
  grapes_source_url: string;
  grapes_source_title: string;
  grapes_verified_at: string | null;
  scores: Array<{ critic: string; score: string; note: string }>;
  scores_not_applicable: boolean;
  tasting_history: Array<{
    id: string;
    consumed_at: string;
    note: string;
    rating: number;
    enjoyment: TastingEnjoyment;
    occasion: string;
    pairing: string;
    companions: string;
    created_at: string;
  }>;
  value_history: Array<{ id: string; value: string; currency: string; source: string; recorded_at: string }>;
};

export type ConsumeWineDraft = {
  consumed_at: string;
  note: string;
  tasting_rating: string;
  tasting_enjoyment: TastingEnjoyment;
  tasting_occasion: string;
  tasting_pairing: string;
  tasting_companions: string;
};

export type CatalogWine = {
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

export type WineRecognitionResult = {
  suggestions: Array<{ label: string; confidence: number | null; vintage: string; producer: string; region: string; appellation: string; type: string }>;
  matches: CatalogWine[];
  raw_best_label: string;
};

export type WineLabelEnrichment = {
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

export type WineDraft = {
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

export type WineTone = "red" | "white" | "sparkling" | "rose" | "sweet" | "other";

export type UserTag = {
  id: string;
  name: string;
  color: string;
};

export type Passkey = {
  id: string;
  name: string;
  created_at: string;
  last_used_at: string | null;
};

export type ImportMode = "add_all" | "skip_duplicates" | "update_existing" | "replace_all";

export type ImportPreview = {
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

export type ImportResult = {
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

export type WineShareOffer = {
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

export type TastingArchiveApiItem = {
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
  enjoyment: TastingEnjoyment;
  occasion: string;
  pairing: string;
  companions: string;
  created_at: string;
};

export type TastingArchivePage = {
  total: number;
  limit: number;
  offset: number;
  rated_count: number;
  notes_count: number;
  latest_consumed_at: string | null;
  items: TastingArchiveApiItem[];
};

export type WishlistItem = {
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

export type WishlistList = {
  id: string;
  household_id: string;
  name: string;
  description: string;
  item_count: number;
  portfolio_strategy: WishlistPortfolioStrategy | null;
};

export type CoOwnershipParticipant = {
  id: string;
  user_id: string | null;
  name: string;
  email: string;
  share_pct: string;
  contribution: string | null;
  status: string;
  invited_at: string | null;
  viewed_at: string | null;
  responded_at: string | null;
  acceptance_name: string;
  acceptance_method: string;
  delivery_channel: string;
  delivery_status: string;
  invite_url: string | null;
};

export type CoOwnershipAgreement = {
  id: string;
  wine_id: string;
  version: number;
  status: string;
  ownership_mode: "undivided" | "allocated";
  custody_location: string;
  terms: string;
  wine_snapshot: Record<string, string | number | null>;
  document_hash: string;
  created_at: string;
  finalized_at: string | null;
  responding_participant_id: string | null;
  participants: CoOwnershipParticipant[];
};

export type CoOwnershipParticipantDraft = {
  name: string;
  email: string;
  share_pct: string;
  contribution: string;
};

export type WishlistDraft = {
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

export type HouseholdMembership = {
  membership_id: string;
  household_id: string;
  household_name: string;
  role: string;
};

export type Member = {
  membership_id: string;
  user_id: string;
  email: string;
  display_name: string;
  role: string;
  visibility_scope: "all" | "shared";
};

export type InviteDraft = {
  email: string;
  role: string;
  visibility_scope: "all" | "shared";
};

export type PendingUser = {
  id: string;
  email: string;
  display_name: string;
};

export type AppUser = PendingUser & {
  is_approved: boolean;
  is_app_admin: boolean;
  is_blocked: boolean;
  can_use_label_recognition: boolean;
  ai_credit_balance_usd: string;
  approved_at: string | null;
  entitlement_valid_until: string | null;
  entitlement_days_remaining: number | null;
};

export type UserAdminStats = {
  id: string;
  email: string;
  display_name: string;
  is_approved: boolean;
  is_app_admin: boolean;
  is_blocked: boolean;
  households_total: number;
  cellar_wines_total: number;
  cellar_bottles_total: number;
  wines_created_total: number;
  ai_requests_total: number;
  last_sign_in_at: string | null;
  last_ai_request_at: string | null;
  last_activity_at: string | null;
};

export type RedeemCode = {
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

export type UserNotification = {
  id: string;
  kind: string;
  title: string;
  message: string;
  action_url: string | null;
  created_at: string;
  read_at: string | null;
};

export type OperationalActionSnooze = {
  signature: string;
  until: number;
};

export type OperationalActionSnoozes = Record<string, OperationalActionSnooze>;

export type BillingStatus = {
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

export type PaymentPlan = "monthly" | "annual" | "ai_credits";

export type CheckoutSession = {
  checkout_url: string;
  stripe_session_id: string;
  plan: PaymentPlan;
};

export type BillingPortalSession = {
  portal_url: string;
};

export type RedeemCodeDraft = {
  label: string;
  duration_days: string;
  max_redemptions: string;
  email: string;
  expires_at: string;
};

export type Invite = {
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

export type AiAuditLog = {
  id: string;
  entity_type: string;
  entity_id: string;
  feature: string;
  model: string;
  reasoning_effort: string;
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

export type MarketViewContext =
  | { kind: "wine"; wine: Wine; entry: AiAuditLog }
  | { kind: "wishlist"; item: WishlistItem; entry: AiAuditLog };

export type AiUsageBucket = {
  requests: number;
  input_tokens: number;
  cached_input_tokens: number;
  output_tokens: number;
  total_tokens: number;
  estimated_cost_usd: string;
};

export type AiUsage = {
  today: AiUsageBucket;
  current_month: AiUsageBucket;
  all_time: AiUsageBucket;
  currency: string;
  is_estimate: boolean;
};

export type AiSettings = {
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
  score_model: string;
  wishlist_model: string;
  pairing_model: string;
  model_advisor_enabled: boolean;
  pairing_preferences: string;
  pairing_candidate_limit: number;
  model_options: string[];
};

export type AiSettingsDraft = {
  openai_api_key: string;
  provider_mode: "auto" | "user_key" | "credits";
  ai_notes_model: string;
  drink_window_model: string;
  value_model: string;
  grape_model: string;
  score_model: string;
  wishlist_model: string;
  pairing_model: string;
  model_advisor_enabled: boolean;
  pairing_preferences: string;
  pairing_candidate_limit: number;
};

export type PairingResult = {
  summary: string;
  model: string;
  reasoning_effort: string;
  cellar_matches: Array<{ wine_id: string; wine_name: string; producer: string; reason: string; serving_note: string }>;
  market_recommendations: Record<string, Array<{ name: string; producer: string; price_hint: string; reason: string }>>;
  estimated_cost_usd: string;
};

export type BuyingAdviceResult = {
  summary: string;
  warning: string;
  model: string;
  reasoning_effort: string;
  recommendations: Array<{
    name: string;
    producer: string;
    vintage: string;
    merchant: string;
    merchant_type: "local_shop" | "online";
    price: string;
    currency: string;
    availability: string;
    delivery_estimate: string;
    source_url: string;
    reason: string;
    local: boolean;
    confidence: "high" | "medium" | "low";
  }>;
  estimated_cost_usd: string;
};

export type WineCompareAiResult = {
  model: string;
  reasoning_effort: string;
  style_profile: string;
  readiness: string;
  occasion: string;
  cellar_value: string;
  verdict: string;
  estimated_cost_usd: string;
};

export type WishlistPortfolioStrategy = {
  model: string;
  reasoning_effort: string;
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

export type RegionalGapProfile = "investment" | "readiness" | "daily" | "balanced";

export type RegionalGapAiSuggestion = {
  model: string;
  reasoning_effort: string;
  profile: RegionalGapProfile;
  rationale: string;
  targets: Array<{ region: string; target_pct: string | number }>;
  estimated_cost_usd: string;
};

export type AuthDraft = {
  email: string;
  display_name: string;
  household_name: string;
  password: string;
  password_confirm: string;
};

export type ContactSupportDraft = {
  email: string;
  subject: string;
  message: string;
};

export type ExportSelection = {
  wines: boolean;
  wishlist: boolean;
  members: boolean;
  invites: boolean;
  share_offers: boolean;
  user_tags: boolean;
  ai_audit: boolean;
};

export type ImportSelection = ExportSelection;

export type SortMode = "name" | "vintage" | "value" | "drink_window" | "priority";

export type Locale = "en" | "it";

export type AiOverlayProgress = {
  itemName?: string;
  current?: number;
  total?: number;
} | null;

export type TastingEnjoyment = "" | "positive" | "negative";

export type DashboardFocus = "collector" | "value" | "readiness" | "timeline" | "data";

export type SettingsTab = "profile" | "ai" | "tags" | "sharing" | "users" | "data";

export type ViewName = "home" | "cellar" | "history" | "wishlist" | "pairing" | "buying" | "help" | "settings";

export type HistorySection = "tastings" | "wines";

export type QuickWineFilter = "" | "mine" | "shared" | "drink_now" | "drink_soon" | "past_window" | "future_deliveries" | "to_collect" | "missing_data";

export type MaturityPhase = "early" | "drinkable" | "peak" | "past" | "unknown";

export type MaturityFilter = { year: number; tone: WineTone } | null;

export type RegionalGapTarget = { region: string; targetPct: number };

export type RegionalGapTargetDraft = { region: string; targetPct: string };

export type OperationalActionItem = {
  id: string;
  kind: string;
  title: string;
  detail: string;
  count: number;
  signature: string;
  onOpen: () => void;
};

export type WineAiFeature = "notes" | "drink-window" | "value" | "grapes" | "scores";

export type ThemePreference =
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
  | "ticino"
  | "atelier"
  | "midnight-ledger";

export type TastingArchiveEntry = {
  id: string;
  wine: Wine;
  consumed_at: string;
  note: string;
  rating: number;
  enjoyment: TastingEnjoyment;
  occasion: string;
  pairing: string;
  companions: string;
  created_at: string;
};

export type ValueBreakdownItem = { label: string; value: number };

export type BreakdownMetric = "value" | "bottles" | "wines";

export type WineCollectionFilters = {
  query: string;
  type: string;
  status: string;
  minPrice: number | null;
  maxPrice: number | null;
  ownership: string;
  quick: string;
  tags: string[];
  grapes: string[];
  currentYear: number;
  now: Date;
  session: Session | null;
};
