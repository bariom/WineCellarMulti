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
  requires_legal_acceptance?: boolean;
  legal_document_version?: string;
  locale: Locale;
  theme_preference: ThemePreference;
  dashboard_focus: PrimaryDashboardFocus;
  daily_wine_budget_chf: string | null;
  can_use_label_recognition: boolean;
  can_manage_wine_photos: boolean;
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
  value_not_found: boolean;
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
  grapes_not_applicable: boolean;
  scores: Array<{ critic: string; score: string; note: string }>;
  scores_not_applicable: boolean;
  photo_thumbnail_url: string;
  photo_detail_url: string;
  created_at?: string;
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

export type TastingArchiveProfile = {
  wine_type: string;
  currency: string;
  count: number;
  purchase_total: number;
  comparable_purchase_total: number;
  market_value_total: number;
  comparable_count: number;
};

export type TastingArchivePage = {
  total: number;
  limit: number;
  offset: number;
  rated_count: number;
  notes_count: number;
  latest_consumed_at: string | null;
  profile: TastingArchiveProfile[];
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
  offer_price: string | null;
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

export type WineShareOfferRecipient = {
  email: string;
  display_name: string;
  share_pct: string;
};

export type CoOwnershipPayment = {
  id: string;
  participant_id: string;
  amount: string;
  currency: string;
  paid_on: string;
  note: string;
  created_at: string;
  voided_at: string | null;
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
  paid_total: string;
  outstanding: string | null;
  payments: CoOwnershipPayment[];
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
  can_cancel: boolean;
  can_manage_payments: boolean;
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
  offer_price: string;
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
  can_manage_wine_photos: boolean;
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
  archived_at?: string | null;
};

export type NotificationCenterCategory = "action" | "update" | "system";

export type NotificationCenterItem = UserNotification & {
  source: "notification" | "household_invite" | "share_offer";
  category: NotificationCenterCategory;
  state: "unread" | "read" | "pending" | "archived";
  action_kind: "open" | "accept_invite" | "decide_share_offer" | "decide_share_revocation";
  resource_id: string | null;
  actor_label: string | null;
  metadata: Record<string, string | number | boolean | null>;
};

export type NotificationCenterResponse = {
  items: NotificationCenterItem[];
  counts: {
    total: number;
    unread: number;
    actionable: number;
    attention: number;
    actions: number;
    updates: number;
    system: number;
  };
  offset: number;
  next_offset: number | null;
  has_more: boolean;
};

export type OperationalActionSnooze = {
  signature: string;
  until: number;
};

export type OperationalActionSnoozes = Record<string, OperationalActionSnooze>;

export type OperationalActionSnoozeRecord = {
  action_id: string;
  signature: string;
  until: string;
};

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
  can_use_included_wine_search: boolean;
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
  generated_at?: string;
};

export type RegionalGapSettings = {
  targets: RegionalGapTarget[];
  last_ai_suggestion: RegionalGapAiSuggestion | null;
  profile_targets: Partial<Record<RegionalGapProfile, RegionalGapTarget[]>>;
  ai_suggestions: RegionalGapAiSuggestion[];
  updated_at: string | null;
};

export type AuthDraft = {
  email: string;
  display_name: string;
  household_name: string;
  password: string;
  password_confirm: string;
  privacy_policy_accepted: boolean;
  terms_accepted: boolean;
  photo_usage_disclaimer_accepted: boolean;
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

export type PrimaryDashboardFocus = "collector" | "daily" | "balanced";

export type DashboardFocus =
  | PrimaryDashboardFocus
  | "value"
  | "readiness"
  | "timeline"
  | "data";

export type SettingsTab = "profile" | "ai" | "tags" | "sharing" | "users" | "photos" | "operations" | "data";

export type UserActivityLogEntry = {
  id: string;
  action: string;
  created_at: string;
  user_display_name: string;
  user_email: string;
};

export type OperationalMetricsOverview = {
  collected_at: string;
  system: {
    host: { cpu_percent: number; memory: { percent: number }; disk: { percent: number } };
    network: { tcp_established: number | null; tcp_time_wait: number | null; tcp_total: number | null };
    conntrack: { count: number | null; max: number | null };
  };
  application: {
    requests_total: number;
    errors_total: number;
    average_duration_ms: number | null;
    interactive_window_seconds?: number;
    interactive_requests_recent?: number;
    interactive_p50_duration_ms?: number | null;
    interactive_p95_duration_ms?: number | null;
    slow_requests_recent?: number;
    uptime_seconds: number;
  };
  business: {
    users_total: number;
    users_approved: number;
    users_blocked: number;
    users_enabled: number;
    households_total: number;
    wines_total: number;
    bottles_total: number;
    bottles_in_cellar: number;
    bottles_to_collect: number;
    bottles_in_future_deliveries: number;
    tastings_total: number;
    tastings_30d: number;
    wishlist_items_total: number;
    ai_requests_30d: number;
    ai_successes_30d: number;
    wine_name_searches_30d: number;
    wine_name_search_cost_30d_usd: number;
    wine_photos_total: number;
    label_recognitions_30d: number;
    label_recognition_successes_30d: number;
    coownership_active: number;
    coownership_pending: number;
  };
  openai: {
    available: boolean;
    current_month_usd: number | null;
    previous_period_usd: number | null;
    change_percent: number | null;
    period_start: string | null;
    collected_at: string | null;
  };
  history_retention_days: number;
};

export type OperationalMetricsHistory = {
  hours: number;
  samples: Array<Pick<OperationalMetricsOverview, "collected_at" | "system" | "application" | "business">>;
};

export type WinePhotoSuggestion = {
  source_wine_id: string;
  thumbnail_url: string;
  detail_url: string;
};

export type WineImageRecognitionCandidate = {
  producer: string;
  estate: string;
  wine_name: string;
  cuvee: string;
  vintage: string;
  appellation: string;
  region: string;
  country: string;
};

export type WineImageRecognitionResult = WineImageRecognitionCandidate & {
  recognition_id: string;
  status: "recognized" | "ambiguous" | "not_recognized" | "invalid_image" | "error";
  label_text: string[];
  alternative_candidates: WineImageRecognitionCandidate[];
  needs_user_confirmation: boolean;
  recognition_notes: string[];
  provider: "luna";
  matches: CatalogWine[];
};

export type WinePhotoSuggestions = WinePhotoSuggestion[];

export type OperationalWinePhoto = {
  wine_id: string;
  name: string;
  producer: string;
  vintage: string;
  household_name: string;
  thumbnail_url: string;
  detail_url: string;
};

export type OperationalWinePhotos = {
  total: number;
  items: OperationalWinePhoto[];
};

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

export type WineAiFeature = "all" | "notes" | "drink-window" | "value" | "grapes" | "scores";

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
  region: string;
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
