import { CSSProperties, ChangeEvent, Children, Dispatch, FormEvent, MouseEvent, ReactNode, SetStateAction, Suspense, UIEvent, lazy, useEffect, useRef, useState } from "react";
import { AppIcon, AppIconName } from "./components/AppIcon";
import { CoOwnershipPanel, CoOwnershipPublicPage } from "./components/CoOwnershipPanels";
import { DetailField, wineStatusTone, wineStatusIconName, WineStatusBadge, StarRating, LoadingSpinner, notificationBellIcon, settingsGearIcon, logoutIcon, LoadingState, EmptyState, GlobalLoadingOverlay, aiOverlayMessage, aiOverlayLabel, aiOverlayHint, wineProgressName, aiOverlayProgressText, AiGenerationOverlay, ButtonBusyContent, RatingInput, TastingEnjoymentInput, TastingEnjoymentBadge } from "./components/AppUi";
import { DrinkWindowMini, ValueHistoryChart, auditMarketSources, auditWebSearchSources, auditMarketNote, auditWishlistPortfolioStrategySource, auditWishlistPortfolioStrategy, averageMarketPrice, compareDrinkWindowLabel, compareScoresLabel, compareGrapesLabel, compareTagsLabel, CompareWinesModal, MarketValueModal, UserStatsModal, DetailNote, ownershipRows, hasSharedOwnership, TastingEntryEditor, TastingEntryMeta, TastingHistorySection, tastingArchiveSearchText, tastingArchiveItemToWine, WineDetail, WishlistDetail, WishlistPortfolioStrategyPanel, AiUsageRow, ContactSupportPanel, DashboardCarousel, WineGeographyMap } from "./components/AppPanels";
import { emptyConsumeWineDraft, consumeDraftFromTastingEntry, formatDisplayDate, formatGrape, formatUsd, formatAiBudget, formatMoney, clipUiText, readableLegacyAiText, wineTone, grapesSvgIcon } from "./components/panelSupport";
import type { Session, Wine, ConsumeWineDraft, CatalogWine, WineRecognitionResult, WineLabelEnrichment, WineDraft, WineTone, UserTag, Passkey, ImportMode, ImportPreview, ImportResult, WineShareOffer, WineShareOfferRecipient, CoOwnershipAgreement, TastingArchiveApiItem, TastingArchivePage, WishlistItem, WishlistList, WishlistDraft, HouseholdMembership, Member, InviteDraft, PendingUser, AppUser, UserAdminStats, RedeemCode, UserNotification, OperationalActionSnooze, OperationalActionSnoozes, BillingStatus, PaymentPlan, CheckoutSession, BillingPortalSession, RedeemCodeDraft, Invite, AiAuditLog, MarketViewContext, AiUsageBucket, AiUsage, AiSettings, AiSettingsDraft, PairingResult, BuyingAdviceResult, WineCompareAiResult, WishlistPortfolioStrategy, RegionalGapProfile, RegionalGapAiSuggestion, AuthDraft, ContactSupportDraft, ExportSelection, ImportSelection, SortMode, Locale, AiOverlayProgress, TastingEnjoyment, DashboardFocus, SettingsTab, ViewName, HistorySection, QuickWineFilter, MaturityPhase, MaturityFilter, RegionalGapTarget, RegionalGapTargetDraft, OperationalActionItem, WineAiFeature, ThemePreference, TastingArchiveEntry, ValueBreakdownItem, BreakdownMetric, WineCollectionFilters } from "./types";
import { displayValue, helpGuideContent, helpGuideContentV2, landingContent, reasoningEffortTranslationKey, themeOptions, translate } from "./i18n";
import type { TranslationKey } from "./i18n";
import { canonicalWineTypes, normalizeWineType } from "./domain/wineTypes";
import { uniqueSorted, numberLocale, wineGroupValue, isWishlistReadyToBuy, wineUnitValue, hasVintageForDrinkWindow, isFutureDeliveryWine, isToCollectWine, sumWineValue, currentUserSharePct, ownedBottleCount, wineQuantityLabel, ownershipStats, topWineValueGroups, topWineBottleGroups, topWineCountGroups, topProducerGroups, formatBottleCount, formatPercentage, formatRecognitionConfidence, recognitionSuggestionLabel, maturityBuckets, maturityPhaseForYear, isWineAtMaturityPeak, daysUntil, valueEstimateAgeDays, needsValueRefresh, wineSearchText, matchesQuickWineFilter, matchesWineCollectionFilters, compareWines, wishlistSearchText } from "./domain/cellar";
import { api, extractApiErrorText, formatUserErrorMessage, isConnectivityError } from "./services/api";
import { rawObject, rawArray, rawString, rawNumber, tastingEnjoymentValue, rawNullableString, offlineWine, offlineWishlistItem } from "./services/offlineBackup";
import { base64UrlToBuffer, bufferToBase64Url, prepareCreationOptions, prepareRequestOptions, credentialToJson } from "./services/passkeys";
import { wineToDraft, draftPayload, wishlistToDraft, wishlistPayload } from "./domain/drafts";
import { tokenFromUrl, stripeCheckoutResultFromUrl, emailVerificationResultFromUrl, emailVerificationTokenFromUrl, passwordResetTokenFromUrl, coOwnershipTokenFromUrl, STRIPE_CHECKOUT_PLAN_KEY, STRIPE_CHECKOUT_BALANCE_KEY, inviteLink } from "./utils/location";

type BreakdownDrilldown = {
  title: TranslationKey;
  dimension: "type" | "region";
  metric: BreakdownMetric;
  label: string;
} | null;

type AiModelAdviceRole = "economy" | "balanced" | "advanced";

type AiModelAdviceState = {
  featureLabel: string;
  currentModel: string;
  recommendedModel: string;
  selectedModel: string;
  role: AiModelAdviceRole;
  resolve: (model: string | null) => void;
};

function advisedModel(role: AiModelAdviceRole, modelOptions: string[], currentModel: string) {
  const roleHints: Record<AiModelAdviceRole, string[]> = {
    economy: ["luna", "5.4-mini", "5.4-nano"],
    balanced: ["terra", "gpt-5.4"],
    advanced: ["sol", "gpt-5.5"],
  };
  return roleHints[role]
    .map((hint) => modelOptions.find((model) => hint.startsWith("gpt-") ? model.toLowerCase() === hint : model.toLowerCase().includes(hint)))
    .find(Boolean) || currentModel;
}

const PairingView = lazy(() => import("./views/PairingView"));
const BuyingAdviceView = lazy(() => import("./views/BuyingAdviceView"));
const TastingArchiveSection = lazy(() => import("./views/TastingArchiveSection"));

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
  score_model: "gpt-5.4-mini",
  wishlist_model: "gpt-5.4",
  pairing_model: "gpt-5.4",
  model_advisor_enabled: false,
  pairing_preferences: "",
  pairing_candidate_limit: 25,
};

const emptyRedeemCodeDraft: RedeemCodeDraft = {
  label: "",
  duration_days: "30",
  max_redemptions: "1",
  email: "",
  expires_at: "",
};

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

const canonicalWishlistPriorities = ["High", "Medium", "Low"] as const;
const canonicalWishlistPurposes = ["Drink", "Cellar", "Invest", "Gift", "Compare"] as const;
const canonicalWishlistStatuses = ["Evaluate", "Monitor", "Buy", "GoodPrice", "Skipped"] as const;

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

function parseHelpBullet(value: string) {
  const marker = "[AI] ";
  if (value.startsWith(marker)) {
    return { isAi: true, text: value.slice(marker.length) };
  }
  return { isAi: false, text: value };
}

function aiBudgetFillRatio(balance: string | number, packSize: string | number) {
  const current = Number(balance || 0);
  const unit = Number(packSize || 0);
  if (!Number.isFinite(current) || !Number.isFinite(unit) || unit <= 0) return 0;
  return Math.max(0, Math.min(current / unit, 1));
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

const classicRegionalGapTargets: RegionalGapTarget[] = [
  { region: "Bordeaux", targetPct: 22 },
  { region: "Toscana", targetPct: 16 },
  { region: "Ticino", targetPct: 12 },
  { region: "Burgundy", targetPct: 14 },
  { region: "Champagne", targetPct: 12 },
  { region: "Piemonte", targetPct: 10 },
  { region: "Rhône", targetPct: 6 },
  { region: "Napa Valley", targetPct: 4 },
  { region: "Rioja", targetPct: 4 },
];

function normalizedRegionName(value: string) {
  return value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function regionalGapBucket(region: string) {
  const normalized = normalizedRegionName(region);
  if (!normalized) return "";
  if (normalized.includes("bordeaux")) return "Bordeaux";
  if (normalized.includes("toscana") || normalized.includes("tuscany")) return "Toscana";
  if (normalized.includes("ticino")) return "Ticino";
  if (normalized.includes("burgundy") || normalized.includes("bourgogne") || normalized.includes("borgogna")) return "Burgundy";
  if (normalized.includes("champagne")) return "Champagne";
  if (normalized.includes("piemonte") || normalized.includes("piedmont")) return "Piemonte";
  if (normalized.includes("rhone") || normalized.includes("rhône")) return "Rhône";
  if (normalized.includes("napa")) return "Napa Valley";
  if (normalized.includes("rioja")) return "Rioja";
  return region.trim();
}

function radarPoint(index: number, total: number, value: number, radius = 42, center = 50) {
  const angle = (Math.PI * 2 * index) / total - Math.PI / 2;
  const distance = radius * Math.max(Math.min(value, 100), 0) / 100;
  return `${center + Math.cos(angle) * distance},${center + Math.sin(angle) * distance}`;
}

function radarScaledPoint(index: number, total: number, value: number, maxValue: number, radius = 42, center = 50) {
  return radarPoint(index, total, maxValue > 0 ? (value / maxValue) * 100 : 0, radius, center);
}

function regionalTargetLabel(region: string, locale: Locale) {
  if (region === "Other") return displayValue("Other", locale, "type") || region;
  return region;
}

function normalizeRegionalTargets(targets: RegionalGapTarget[], fallbackTargets: RegionalGapTarget[] = classicRegionalGapTargets) {
  const sanitized = targets.map((target) => ({ region: target.region, targetPct: Math.max(Number(target.targetPct || 0), 0) }));
  const total = sanitized.reduce((sum, target) => sum + target.targetPct, 0);
  if (!Number.isFinite(total) || total <= 0) return [...fallbackTargets];
  return sanitized.map((target, index) => {
    const value = index === sanitized.length - 1
      ? 100 - sanitized.slice(0, -1).reduce((sum, item) => sum + Math.round((item.targetPct / total) * 1000) / 10, 0)
      : Math.round((target.targetPct / total) * 1000) / 10;
    return { region: target.region, targetPct: Math.max(Math.round(value * 10) / 10, 0) };
  });
}

function regionalTargetsForCellar(items: Wine[], storedTargets: RegionalGapTarget[] = []) {
  const byRegion = new Map<string, number>();
  for (const wine of items) {
    const region = regionalGapBucket(wine.region);
    if (!region) continue;
    byRegion.set(region, (byRegion.get(region) || 0) + wineUnitValue(wine) * Math.max(Number(wine.quantity || 0), 0));
  }
  const topCellarRegions = [...byRegion.entries()]
    .sort((first, second) => second[1] - first[1])
    .map(([region]) => region)
    .slice(0, 6);
  const regions = [
    ...new Set([
      ...classicRegionalGapTargets.map((target) => target.region),
    ...topCellarRegions,
    ...storedTargets.map((target) => target.region),
    ]),
  ].slice(0, 10);
  const baseTargets = regions.map((region) => ({
    region,
    targetPct:
      storedTargets.find((target) => target.region === region)?.targetPct ??
      classicRegionalGapTargets.find((target) => target.region === region)?.targetPct ??
      Math.max(6, Math.round(100 / Math.max(regions.length, 1))),
  }));
  return normalizeRegionalTargets(baseTargets, baseTargets);
}

function regionalGapStorageKey(householdId: string | null | undefined) {
  return `vinaris:regional-gap-targets:${householdId || "local"}`;
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

function collectorFocusSvgIcon(kind: "drink_now" | "past_window" | "future_deliveries" | "to_collect" | "missing_data" | "maturity" | "regions" | "producer") {
  if (kind === "drink_now") return dashboardStatSvgIcon("drink_now");
  if (kind === "past_window") return dashboardStatSvgIcon("past_window");
  if (kind === "future_deliveries") return dashboardStatSvgIcon("future_deliveries");
  if (kind === "to_collect") return dashboardStatSvgIcon("to_collect");
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

function appActionSvgIcon(kind: "compare" | "edit" | "import" | "export" | "delete") {
  if (kind === "edit") return wishlistActionSvgIcon("edit");
  if (kind === "delete") return wishlistActionSvgIcon("delete");
  if (kind === "compare") {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M8 5h8" />
        <path d="M8 19h8" />
        <path d="M6 8l-3 5h6l-3-5Z" />
        <path d="M18 8l-3 5h6l-3-5Z" />
        <path d="M12 5v14" />
      </svg>
    );
  }
  if (kind === "import") {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M12 3v12" />
        <path d="m7 10 5 5 5-5" />
        <path d="M5 21h14" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 21V9" />
      <path d="m7 14 5-5 5 5" />
      <path d="M5 3h14" />
    </svg>
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
  const [outgoingShareOffers, setOutgoingShareOffers] = useState<WineShareOffer[]>([]);
  const [shareOfferRecipients, setShareOfferRecipients] = useState<WineShareOfferRecipient[]>([]);
  const [passkeys, setPasskeys] = useState<Passkey[]>([]);
  const [householdMemberships, setHouseholdMemberships] = useState<HouseholdMembership[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [pendingUsers, setPendingUsers] = useState<PendingUser[]>([]);
  const [appUsers, setAppUsers] = useState<AppUser[]>([]);
  const [selectedAppUserStats, setSelectedAppUserStats] = useState<UserAdminStats | null>(null);
  const [userStatsModalOpen, setUserStatsModalOpen] = useState(false);
  const [userStatsLoading, setUserStatsLoading] = useState(false);
  const [userStatsModalTitle, setUserStatsModalTitle] = useState("");
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
  const [activeKeyPositionIndex, setActiveKeyPositionIndex] = useState(0);
  const keyPositionStripRef = useRef<HTMLDivElement | null>(null);
  const pendingKeyPositionIndexRef = useRef<number | null>(null);
  const [aiAudit, setAiAudit] = useState<AiAuditLog[]>([]);
  const [aiAuditLimit, setAiAuditLimit] = useState("10");
  const [aiAuditDateFrom, setAiAuditDateFrom] = useState("");
  const [aiAuditDateTo, setAiAuditDateTo] = useState("");
  const [aiUsage, setAiUsage] = useState<AiUsage | null>(null);
  const [aiSettings, setAiSettings] = useState<AiSettings | null>(null);
  const [aiSettingsDraft, setAiSettingsDraft] = useState<AiSettingsDraft>(emptyAiSettingsDraft);
  const [aiModelAdvice, setAiModelAdvice] = useState<AiModelAdviceState | null>(null);
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
  const [buyingPurpose, setBuyingPurpose] = useState<"drink_now" | "cellar" | "pairing">("drink_now");
  const [buyingPairingWith, setBuyingPairingWith] = useState("");
  const [buyingPreferences, setBuyingPreferences] = useState("");
  const [buyingNeededBy, setBuyingNeededBy] = useState<"today" | "tomorrow" | "can_wait">("today");
  const [buyingLocation, setBuyingLocation] = useState("");
  const [buyingMinPrice, setBuyingMinPrice] = useState("20");
  const [buyingMaxPrice, setBuyingMaxPrice] = useState("50");
  const [buyingAdviceResult, setBuyingAdviceResult] = useState<BuyingAdviceResult | null>(null);
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
  const [passwordResetToken, setPasswordResetToken] = useState("");
  const [coOwnershipToken, setCoOwnershipToken] = useState("");
  const [coOwnershipAgreements, setCoOwnershipAgreements] = useState<CoOwnershipAgreement[]>([]);
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
  const [aiSettingsHelpOpen, setAiSettingsHelpOpen] = useState(false);
  const [aiModelsHelpOpen, setAiModelsHelpOpen] = useState(false);
  const [importPayload, setImportPayload] = useState<Record<string, unknown> | null>(null);
  const [importFileName, setImportFileName] = useState("");
  const [importMode, setImportMode] = useState<ImportMode>("skip_duplicates");
  const [importPreview, setImportPreview] = useState<ImportPreview | null>(null);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [offlineMode, setOfflineMode] = useState(false);
  const [offlineFileName, setOfflineFileName] = useState("");
  const [authMode, setAuthMode] = useState<"login" | "register" | "forgot-password" | "reset-password">("login");
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
  const [wineDetailExpanded, setWineDetailExpanded] = useState(false);
  const [selectedWishlistId, setSelectedWishlistId] = useState<string | null>(null);
  const [selectedWishlistListId, setSelectedWishlistListId] = useState<string>("");
  const [pendingWineScrollId, setPendingWineScrollId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingWishlistId, setEditingWishlistId] = useState<string | null>(null);
  const [wineFormOpen, setWineFormOpen] = useState(false);
  const [wishlistFormOpen, setWishlistFormOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const filterPanelRef = useRef<HTMLDetailsElement>(null);
  const [typeFilter, setTypeFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [ownershipFilter, setOwnershipFilter] = useState("");
  const [quickWineFilter, setQuickWineFilter] = useState<QuickWineFilter>("");
  const [maturityFilter, setMaturityFilter] = useState<MaturityFilter>(null);
  const [regionalGapTargets, setRegionalGapTargets] = useState<RegionalGapTarget[]>(classicRegionalGapTargets);
  const [regionalGapTargetsOpen, setRegionalGapTargetsOpen] = useState(false);
  const [regionalGapDraft, setRegionalGapDraft] = useState<RegionalGapTargetDraft[]>(() => classicRegionalGapTargets.map((target) => ({ region: target.region, targetPct: String(target.targetPct) })));
  const [regionalGapProfile, setRegionalGapProfile] = useState<RegionalGapProfile>("balanced");
  const [regionalGapAiSuggestion, setRegionalGapAiSuggestion] = useState<RegionalGapAiSuggestion | null>(null);
  const [regionalGapFeedback, setRegionalGapFeedback] = useState("");
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
  const [aiOverlayProgress, setAiOverlayProgress] = useState<AiOverlayProgress>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const errorBannerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!notice) return;
    const timeout = window.setTimeout(() => setNotice(""), 5000);
    return () => window.clearTimeout(timeout);
  }, [notice]);
  const [locale, setLocale] = useState<Locale>(() => (navigator.language.toLowerCase().startsWith("it") ? "it" : "en"));
  const [themePreference, setThemePreference] = useState<ThemePreference>("system");
  const t = (key: TranslationKey) => translate(locale, key);
  const visibleError = formatUserErrorMessage(error, locale);
  const aiOverlayMode = generatingAi || (compareAiLoading ? "compare" : "");
  const [aiOverlayRenderMode, setAiOverlayRenderMode] = useState("");
  const [aiOverlayVisible, setAiOverlayVisible] = useState(false);
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

  useEffect(() => {
    if (aiOverlayMode) {
      setAiOverlayRenderMode(aiOverlayMode);
      setAiOverlayVisible(true);
      return;
    }
    if (!aiOverlayRenderMode) return;
    setAiOverlayVisible(false);
    const timeoutId = window.setTimeout(() => {
      setAiOverlayRenderMode("");
    }, 360);
    return () => window.clearTimeout(timeoutId);
  }, [aiOverlayMode, aiOverlayRenderMode]);

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
    const model = await requestAiModelAdvice(t("searchWineDataWithAi"), "economy", aiSettings?.grape_model || aiSettingsDraft.grape_model);
    if (!model) return catalogItem;
    setWineEnrichmentLoading(true);
    try {
      const enrichment = await api<WineLabelEnrichment>("/api/v1/ai/wine-label/enrich", {
        method: "POST",
        body: JSON.stringify({ label, locale, model }),
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

  async function enrichManualWineDraft(target: "wine" | "wishlist") {
    const targetDraft = target === "wine" ? draft : wishlistDraft;
    const label = targetDraft.name.trim();
    if (!label) return;
    const model = await requestAiModelAdvice(t("searchWineDataWithAi"), "economy", aiSettings?.grape_model || aiSettingsDraft.grape_model);
    if (!model) return;
    setWineEnrichmentLoading(true);
    try {
      const enrichment = await api<WineLabelEnrichment>("/api/v1/ai/wine-label/enrich", {
        method: "POST",
        body: JSON.stringify({ label, locale, source: "manual", model }),
      });
      const catalogItem: CatalogWine = {
        name: safeEnrichedWineName(label, enrichment.name),
        producer: enrichment.producer,
        region: enrichment.region,
        appellation: enrichment.appellation,
        type: normalizeWineType(enrichment.type),
        country: enrichment.country,
        grapes_text: enrichment.grapes_text,
        format: targetDraft.format || "Bottle (750ml)",
      };
      applyCatalogWineToDraft(catalogItem, target);
      if (enrichment.vintage) {
        if (target === "wine") {
          setDraft((current) => ({ ...current, vintage: current.vintage || enrichment.vintage }));
        } else {
          setWishlistDraft((current) => ({ ...current, vintage: current.vintage || enrichment.vintage }));
        }
      }
      if (target === "wine" && enrichment.grapes_text) {
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
      setSelectedAppUserStats(null);
      setUserStatsModalOpen(false);
      setUserStatsLoading(false);
      setUserStatsModalTitle("");
      setPendingUsers([]);
      setPendingCatalogEntries([]);
      setCatalogAdminResults([]);
      setUserAiBalanceDrafts({});
      setUserAiNoteDrafts({});
    }
  }

  async function loadSingleAppUserStats(user: AppUser, isAppAdmin = session?.is_app_admin) {
    if (isAppAdmin) {
      setUserStatsModalTitle(user.display_name || user.email);
      setSelectedAppUserStats(null);
      setUserStatsModalOpen(true);
      setUserStatsLoading(true);
      try {
        setSelectedAppUserStats(await api<UserAdminStats>(`/api/v1/auth/users/${user.id}/stats`));
      } finally {
        setUserStatsLoading(false);
      }
    } else {
      setSelectedAppUserStats(null);
      setUserStatsModalOpen(false);
      setUserStatsLoading(false);
      setUserStatsModalTitle("");
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

  async function loadAiSettings(role = session?.membership_role, syncDraft = true) {
    if (role === "owner" || role === "admin" || role === "member") {
      const nextSettings = await api<AiSettings>("/api/v1/ai/settings");
      setAiSettings(nextSettings);
      if (syncDraft) {
        setAiSettingsDraft({
          openai_api_key: "",
          provider_mode: nextSettings.provider_mode,
          ai_notes_model: nextSettings.ai_notes_model,
          drink_window_model: nextSettings.drink_window_model,
          value_model: nextSettings.value_model,
          grape_model: nextSettings.grape_model,
          score_model: nextSettings.score_model,
          wishlist_model: nextSettings.wishlist_model,
          pairing_model: nextSettings.pairing_model,
          model_advisor_enabled: nextSettings.model_advisor_enabled,
          pairing_preferences: nextSettings.pairing_preferences || "",
          pairing_candidate_limit: nextSettings.pairing_candidate_limit,
        });
      }
    } else {
      setAiSettings(null);
      if (syncDraft) setAiSettingsDraft(emptyAiSettingsDraft);
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
          setSelectedAppUserStats(null);
          setUserStatsModalOpen(false);
          setUserStatsLoading(false);
          setUserStatsModalTitle("");
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
        setSelectedAppUserStats(null);
        setUserStatsModalOpen(false);
        setUserStatsLoading(false);
        setUserStatsModalTitle("");
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
    const passwordResetToken = passwordResetTokenFromUrl();
    const coOwnershipToken = coOwnershipTokenFromUrl();
    if (emailVerificationToken) {
      setEmailVerificationToken(emailVerificationToken);
      setEmailVerificationConfirmed(false);
      setAuthMode("login");
      setAuthModalOpen(true);
      window.history.replaceState(null, "", window.location.pathname);
    }
    if (passwordResetToken) {
      setPasswordResetToken(passwordResetToken);
      setAuthMode("reset-password");
      setAuthModalOpen(true);
      window.history.replaceState(null, "", window.location.pathname);
    }
    if (coOwnershipToken) {
      setCoOwnershipToken(coOwnershipToken);
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
    if (!session?.authenticated) return;
    const timer = window.setInterval(() => {
      Promise.all([
        loadNotifications(true),
        loadBilling(true, session.is_app_admin),
        loadAiSettings(session.membership_role, false),
      ]).catch(() => undefined);
    }, 30000);
    return () => window.clearInterval(timer);
  }, [session?.authenticated, session?.is_app_admin, session?.membership_role]);

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
    if ((authMode === "register" || authMode === "reset-password") && authDraft.password !== authDraft.password_confirm) {
      setError(t("passwordMismatch"));
      setSaving(false);
      return;
    }
    try {
      if (authMode === "forgot-password") {
        await api<void>("/api/v1/auth/password-reset/request", {
          method: "POST",
          body: JSON.stringify({ email: authDraft.email }),
        });
        setNotice(t("passwordResetEmailSent"));
        setAuthMode("login");
        return;
      }
      if (authMode === "reset-password") {
        if (!passwordResetToken) throw new Error(t("passwordResetInvalid"));
        await api<void>("/api/v1/auth/password-reset/confirm", {
          method: "POST",
          body: JSON.stringify({ token: passwordResetToken, password: authDraft.password }),
        });
        setPasswordResetToken("");
        setAuthDraft(emptyAuthDraft);
        setAuthMode("login");
        setNotice(t("passwordResetSuccess"));
        return;
      }
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
    setSelectedAppUserStats(null);
    setUserStatsModalOpen(false);
    setUserStatsLoading(false);
    setUserStatsModalTitle("");
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
    if (notification.action_url?.includes("coownership_token=")) {
      const url = new URL(notification.action_url, window.location.origin);
      setCoOwnershipToken(url.searchParams.get("coownership_token") || "");
    } else if (notification.action_url?.includes("/settings/profile")) {
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

  async function loadShareOfferRecipients(wineId: string) {
    const recipients = await api<WineShareOfferRecipient[]>(`/api/v1/wines/${wineId}/share-offer-recipients`);
    setShareOfferRecipients(recipients);
    setShareDraft((current) => {
      const selected = recipients.find((recipient) => recipient.email === current.email) || recipients[0];
      return { ...current, email: selected?.email || "", share_pct: selected ? String(selected.share_pct) : "" };
    });
  }

  async function loadOutgoingShareOffers(wineId: string) {
    setOutgoingShareOffers(await api<WineShareOffer[]>(`/api/v1/wines/${wineId}/share-offers`));
  }

  async function loadCoOwnershipAgreements(wineId: string) {
    const next = await api<CoOwnershipAgreement[]>(`/api/v1/co-ownership-agreements/wines/${wineId}`);
    setCoOwnershipAgreements(next);
  }

  async function createCoOwnershipAgreement(wine: Wine, payload: Record<string, unknown>) {
    setSaving(true);
    setError("");
    try {
      await api<CoOwnershipAgreement>(`/api/v1/co-ownership-agreements/wines/${wine.id}`, {
        method: "POST",
        body: JSON.stringify(payload),
      });
      await loadCoOwnershipAgreements(wine.id);
      setNotice(locale === "it" ? "Accordo creato e inviti predisposti." : "Agreement created and invitations prepared.");
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Unable to create co-ownership agreement");
    } finally {
      setSaving(false);
    }
  }

  async function cancelCoOwnershipAgreement(wine: Wine, agreement: CoOwnershipAgreement) {
    setSaving(true);
    setError("");
    try {
      await api<void>(`/api/v1/co-ownership-agreements/wines/${wine.id}/${agreement.id}`, { method: "DELETE" });
      await loadCoOwnershipAgreements(wine.id);
      setNotice(locale === "it" ? "Proposta invalidata cancellata." : "Invalidated proposal deleted.");
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Unable to delete invalidated agreement");
    } finally {
      setSaving(false);
    }
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
      await Promise.all([loadShareOfferRecipients(wine.id), loadOutgoingShareOffers(wine.id)]);
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
        portfolio_strategy: item.portfolio_strategy && typeof item.portfolio_strategy === "object" && !Array.isArray(item.portfolio_strategy)
          ? rawObject(item.portfolio_strategy) as WishlistPortfolioStrategy
          : null,
      }));
      const derivedWishlistLists = nextWishlistLists.length
        ? nextWishlistLists
        : [{
            id: "offline-default",
            household_id: rawString(household.id, "offline"),
            name: "Wishlist",
            description: "",
            item_count: nextWishlist.length,
            portfolio_strategy: null,
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
        score_model: nextSettings.score_model,
        wishlist_model: nextSettings.wishlist_model,
        pairing_model: nextSettings.pairing_model,
        model_advisor_enabled: nextSettings.model_advisor_enabled,
        pairing_preferences: nextSettings.pairing_preferences || "",
        pairing_candidate_limit: nextSettings.pairing_candidate_limit,
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

  function requestAiModelAdvice(
    featureLabel: string,
    role: AiModelAdviceRole,
    currentModel: string,
  ): Promise<string | null> {
    if (!aiSettings?.model_advisor_enabled) return Promise.resolve(currentModel);
    const recommendedModel = advisedModel(role, aiSettings.model_options, currentModel);
    if (recommendedModel.trim().toLowerCase() === currentModel.trim().toLowerCase()) return Promise.resolve(currentModel);
    return new Promise((resolve) => {
      setAiModelAdvice({ featureLabel, currentModel, recommendedModel, selectedModel: currentModel, role, resolve });
    });
  }

  async function cancelWineShareOffer(wine: Wine, offer: WineShareOffer) {
    setSaving(true);
    setError("");
    try {
      await api<WineShareOffer>(`/api/v1/wines/share-offers/${offer.id}`, { method: "DELETE" });
      await Promise.all([loadShareOfferRecipients(wine.id), loadOutgoingShareOffers(wine.id)]);
      setNotice(locale === "it" ? "Invio di comproprietà annullato." : "Co-ownership send cancelled.");
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Unable to cancel share offer");
    } finally {
      setSaving(false);
    }
  }

  async function requestWineShareOfferRevocation(wine: Wine, offer: WineShareOffer) {
    setSaving(true);
    setError("");
    try {
      await api<WineShareOffer>(`/api/v1/wines/share-offers/${offer.id}/revoke`, { method: "POST" });
      await loadOutgoingShareOffers(wine.id);
      setNotice(locale === "it" ? "Richiesta di annullamento inviata al comproprietario." : "Removal request sent to the co-owner.");
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Unable to request share removal");
    } finally {
      setSaving(false);
    }
  }

  async function decideWineShareOfferRevocation(notification: UserNotification, decision: "approve" | "decline") {
    const match = notification.action_url?.match(/\/share-offer-revocation\/([^/?#]+)/);
    if (!match) return;
    setSaving(true);
    setError("");
    try {
      await api<WineShareOffer>(`/api/v1/wines/share-offers/${match[1]}/revocation/${decision}`, { method: "POST" });
      setUserNotifications((current) => current.filter((item) => item.id !== notification.id));
      await loadWines();
      setNotice(decision === "approve"
        ? (locale === "it" ? "Comproprietà rimossa dalla tua cantina." : "Co-ownership removed from your cellar.")
        : (locale === "it" ? "La comproprietà resta nella tua cantina." : "The co-ownership remains in your cellar."));
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Unable to decide share removal");
    } finally {
      setSaving(false);
    }
  }

  function closeAiModelAdvice(model: string | null) {
    aiModelAdvice?.resolve(model);
    setAiModelAdvice(null);
  }

  function wineFeatureModelAdvice(feature: WineAiFeature) {
    return {
      notes: { label: t("aiNotes"), role: "economy" as const, model: aiSettings?.ai_notes_model || aiSettingsDraft.ai_notes_model },
      "drink-window": { label: t("drinkWindow"), role: "balanced" as const, model: aiSettings?.drink_window_model || aiSettingsDraft.drink_window_model },
      value: { label: t("value"), role: "economy" as const, model: aiSettings?.value_model || aiSettingsDraft.value_model },
      grapes: { label: t("grapes"), role: "economy" as const, model: aiSettings?.grape_model || aiSettingsDraft.grape_model },
      scores: { label: t("scores"), role: "economy" as const, model: aiSettings?.score_model || aiSettingsDraft.score_model },
    }[feature];
  }

  async function generateWineAi(wine: Wine, feature: WineAiFeature, options?: { openMarketModal?: boolean }) {
    if (feature === "scores" && wine.scores_not_applicable) {
      setError(t("excludedFromAiScores"));
      return;
    }
    const featureAdvice = wineFeatureModelAdvice(feature);
    const model = await requestAiModelAdvice(featureAdvice.label, featureAdvice.role, featureAdvice.model);
    if (!model) return;
    const openMarketModal = options?.openMarketModal ?? true;
    setGeneratingAi(feature);
    setAiOverlayProgress({ itemName: wineProgressName(wine) });
    setError("");
    try {
      const updated = await api<Wine>(`/api/v1/ai/wines/${wine.id}/${feature}`, {
        method: "POST",
        body: JSON.stringify({ locale, model }),
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
      setAiOverlayProgress(null);
    }
  }

  async function setWineScoresAiExclusion(wine: Wine, excluded: boolean) {
    setSaving(true);
    setError("");
    try {
      const updated = await api<Wine>(`/api/v1/wines/${wine.id}`, {
        method: "PATCH",
        body: JSON.stringify({ scores_not_applicable: excluded }),
      });
      setWines((current) => current.map((item) => (item.id === updated.id ? updated : item)));
      setSelectedWineId(updated.id);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Unable to update wine");
    } finally {
      setSaving(false);
    }
  }

  async function generateCompareAi() {
    if (compareWineIds.length !== 2) {
      setError(t("aiCompareOnlyTwo"));
      return;
    }
    const model = await requestAiModelAdvice(t("compare"), "balanced", aiSettings?.pairing_model || aiSettingsDraft.pairing_model);
    if (!model) return;
    setCompareAiLoading(true);
    setError("");
    try {
      const result = await api<WineCompareAiResult>("/api/v1/ai/compare-wines", {
        method: "POST",
        body: JSON.stringify({ wine_ids: compareWineIds, locale, model }),
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
          tasting_enjoyment: payload.tasting_enjoyment,
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
          tasting_enjoyment: payload.tasting_enjoyment,
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
    const generationItems = feature === "scores" ? items.filter((wine) => !wine.scores_not_applicable) : items;
    if (!generationItems.length) return;
    const featureAdvice = wineFeatureModelAdvice(feature);
    const model = await requestAiModelAdvice(featureAdvice.label, featureAdvice.role, featureAdvice.model);
    if (!model) return;
    setGeneratingAi(`batch-${feature}`);
    setError("");
      try {
        for (const [index, wine] of generationItems.entries()) {
          setAiOverlayProgress({ itemName: wineProgressName(wine), current: index + 1, total: generationItems.length });
          const updated = await api<Wine>(`/api/v1/ai/wines/${wine.id}/${feature}`, {
          method: "POST",
          body: JSON.stringify({ locale, model }),
        });
        setWines((current) => current.map((item) => (item.id === updated.id ? updated : item)));
        setSelectedWineId(updated.id);
        }
        await Promise.all([loadAiAudit(), loadAiUsage()]);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Unable to generate AI content");
    } finally {
      setGeneratingAi("");
      setAiOverlayProgress(null);
    }
  }

  async function generateWishlistAi(item: WishlistItem, feature: "strategy" | "purpose" | "target-price") {
    const usesValueModel = feature === "target-price";
    const model = await requestAiModelAdvice(
      usesValueModel ? t("targetPrice") : t("wishlist"),
      "balanced",
      usesValueModel ? (aiSettings?.value_model || aiSettingsDraft.value_model) : (aiSettings?.wishlist_model || aiSettingsDraft.wishlist_model),
    );
    if (!model) return;
    setGeneratingAi(`wishlist-${feature}`);
    setError("");
    try {
      const updated = await api<WishlistItem>(`/api/v1/ai/wishlist/${item.id}/${feature}`, {
        method: "POST",
        body: JSON.stringify({ locale, model }),
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
    const model = await requestAiModelAdvice(t("wishlist"), "advanced", aiSettings?.wishlist_model || aiSettingsDraft.wishlist_model);
    if (!model) return;
    setGeneratingAi("wishlist-portfolio-strategy");
    setError("");
    try {
      const result = await api<WishlistPortfolioStrategy>("/api/v1/ai/wishlist/portfolio-strategy", {
        method: "POST",
        body: JSON.stringify({ locale, wishlist_list_id: selectedWishlistListId, model }),
      });
      setWishlistPortfolioStrategy(result);
      setWishlistLists((current) => current.map((item) => item.id === selectedWishlistListId ? { ...item, portfolio_strategy: result } : item));
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
    const model = await requestAiModelAdvice(t("pairing"), "balanced", aiSettings?.pairing_model || aiSettingsDraft.pairing_model);
    if (!model) return;
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
          model,
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

  async function generateBuyingAdvice(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!buyingLocation.trim()) {
      setError(locale === "it" ? "Inserisci la località in cui vuoi ricevere o ritirare il vino." : "Enter the location where you want to receive or collect the wine.");
      return;
    }
    if (buyingPurpose === "pairing" && !buyingPairingWith.trim()) {
      setError(locale === "it" ? "Indica il piatto per l'abbinamento." : "Enter the food to pair.");
      return;
    }
    const model = await requestAiModelAdvice(t("aiMagicLabelBuying"), "balanced", aiSettings?.pairing_model || aiSettingsDraft.pairing_model);
    if (!model) return;
    setGeneratingAi("buying-advice");
    setError("");
    try {
      const result = await api<BuyingAdviceResult>("/api/v1/ai/buying-advice", {
        method: "POST",
        body: JSON.stringify({
          purpose: buyingPurpose,
          pairing_with: buyingPairingWith.trim(),
          preferences: buyingPreferences.trim(),
          needed_by: buyingNeededBy,
          location: buyingLocation.trim(),
          min_price_chf: buyingMinPrice.trim() ? Number(buyingMinPrice.trim()) : null,
          max_price_chf: buyingMaxPrice.trim() ? Number(buyingMaxPrice.trim()) : null,
          locale,
          model,
        }),
      });
      setBuyingAdviceResult(result);
      await Promise.all([loadAiAudit(), loadAiUsage()]);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Unable to generate buying advice");
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
  const showManualWishlistAiSearch =
    activeView === "wishlist" &&
    wishlistFormOpen &&
    !editingWishlistId &&
    canGenerateAi &&
    wishlistDraft.name.trim().length >= 2 &&
    !matchingWineTemplate(wishlistDraft.name);
  const hasAiDraftChanges = Boolean(
    aiSettings &&
    (
      aiSettingsDraft.provider_mode !== aiSettings.provider_mode ||
      aiSettingsDraft.openai_api_key.trim() ||
      aiSettingsDraft.ai_notes_model !== aiSettings.ai_notes_model ||
      aiSettingsDraft.drink_window_model !== aiSettings.drink_window_model ||
      aiSettingsDraft.value_model !== aiSettings.value_model ||
      aiSettingsDraft.grape_model !== aiSettings.grape_model ||
      aiSettingsDraft.score_model !== aiSettings.score_model ||
      aiSettingsDraft.wishlist_model !== aiSettings.wishlist_model ||
      aiSettingsDraft.pairing_model !== aiSettings.pairing_model ||
      aiSettingsDraft.model_advisor_enabled !== aiSettings.model_advisor_enabled ||
      aiSettingsDraft.pairing_preferences !== aiSettings.pairing_preferences ||
      aiSettingsDraft.pairing_candidate_limit !== aiSettings.pairing_candidate_limit
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
  const shouldPrioritizeAuthAction = !authenticated && (Boolean(emailVerificationToken) || Boolean(passwordResetToken));
  const showInlineAuthError = Boolean(visibleError) && !authenticated && (isMobileViewport || authModalOpen);
  const showMobileAuthPanel =
    isMobileViewport &&
    !shouldPrioritizeAuthAction &&
    (authModalOpen || Boolean(acceptToken) || Boolean(emailVerificationToken) || Boolean(passwordResetToken) || emailVerificationConfirmed || canShowOfflineBackupPanel);
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
        <h2>{authMode === "register" ? t("createAccount") : authMode === "forgot-password" ? t("passwordResetTitle") : authMode === "reset-password" ? t("passwordResetNewPassword") : t("login")}</h2>
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
        {authMode !== "reset-password" ? (
          <label>
            <span>{t("email")}</span>
            <input type="email" value={authDraft.email} onChange={(event) => setAuthDraft({ ...authDraft, email: event.target.value })} required />
          </label>
        ) : null}
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
        {authMode !== "forgot-password" ? (
          <label>
            <span>{t("password")}</span>
            <input type="password" value={authDraft.password} onChange={(event) => setAuthDraft({ ...authDraft, password: event.target.value })} minLength={authMode === "login" ? 1 : 8} required />
          </label>
        ) : null}
        {authMode === "register" || authMode === "reset-password" ? (
          <label>
            <span>{t("confirmPassword")}</span>
            <input type="password" value={authDraft.password_confirm} onChange={(event) => setAuthDraft({ ...authDraft, password_confirm: event.target.value })} minLength={8} required />
          </label>
        ) : null}
        <button type="submit" disabled={saving}>{saving ? t("working") : authMode === "register" ? t("createAccount") : authMode === "forgot-password" ? t("sendPasswordReset") : authMode === "reset-password" ? t("saveNewPassword") : t("login")}</button>
        {authMode === "login" ? (
          <>
            <button type="button" className="secondary" disabled={saving} onClick={() => loginWithPasskey()}>{t("passkeyLogin")}</button>
            <button type="button" className="secondary" disabled={saving} onClick={() => setAuthMode("forgot-password")}>{t("forgotPassword")}</button>
          </>
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
      (entry) => {
        const strategySource = auditWishlistPortfolioStrategySource(entry);
        return (
          entry.entity_type === "household" &&
          entry.entity_id === session?.active_household_id &&
          entry.feature === "wishlist_portfolio_strategy" &&
          Boolean(selectedWishlistListId) &&
          rawString(strategySource?.wishlist_list_id) === selectedWishlistListId
        );
      },
    ) ||
    aiAudit.find(
      (entry) => {
        const strategySource = auditWishlistPortfolioStrategySource(entry);
        return (
          entry.entity_type === "household" &&
          entry.entity_id === session?.active_household_id &&
          entry.feature === "wishlist_portfolio_strategy" &&
          Boolean(selectedWishlistListId) &&
          Boolean(strategySource) &&
          !rawString(strategySource?.wishlist_list_id)
        );
      },
    ) || null;
  const visibleWishlistPortfolioStrategy =
    wishlistPortfolioStrategy || selectedWishlistList?.portfolio_strategy || (latestWishlistPortfolioAudit ? auditWishlistPortfolioStrategy(latestWishlistPortfolioAudit) : null);
  const previousWishlistListIdRef = useRef(selectedWishlistListId);
  useEffect(() => {
    if (previousWishlistListIdRef.current !== selectedWishlistListId) {
      previousWishlistListIdRef.current = selectedWishlistListId;
      setWishlistPortfolioStrategy(null);
      setWishlistPortfolioStrategyOpen(!visibleWishlistPortfolioStrategy);
      return;
    }
    if (!visibleWishlistPortfolioStrategy) {
      setWishlistPortfolioStrategyOpen(true);
    }
  }, [selectedWishlistListId, visibleWishlistPortfolioStrategy]);
  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(regionalGapStorageKey(session?.active_household_id));
      const parsed = stored ? JSON.parse(stored) as RegionalGapTarget[] : [];
      const nextTargets = regionalTargetsForCellar(cellarWines, parsed);
      setRegionalGapTargets(nextTargets);
      setRegionalGapDraft(nextTargets.map((target) => ({ region: target.region, targetPct: String(target.targetPct) })));
      if (!stored) {
        return;
      }
    } catch {
      const nextTargets = regionalTargetsForCellar(cellarWines);
      setRegionalGapTargets(nextTargets);
      setRegionalGapDraft(nextTargets.map((target) => ({ region: target.region, targetPct: String(target.targetPct) })));
    }
  }, [session?.active_household_id, wines]);
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
  const maturityHeatmapYears = Array.from({ length: 15 }, (_, index) => currentYear + index);
  const maturityHeatmapRows = wineToneOrder.map((tone) => ({
    tone,
    label: wineToneLabel(tone, locale),
    cells: maturityHeatmapYears.map((year) => {
      const items = cellarWines.filter((wine) => wineTone(wine.type) === tone && isWineAtMaturityPeak(wine, year));
      const bottles = items.reduce((sum, wine) => sum + Math.max(Number(wine.quantity || 0), 0), 0);
      const value = items.reduce((sum, wine) => sum + Number(wine.current_value || wine.price || 0) * Math.max(Number(wine.quantity || 0), 0), 0);
      return { year, items, count: items.length, bottles, value };
    }),
  })).filter((row) => row.cells.some((cell) => cell.count > 0));
  const maxMaturityHeatmapBottles = Math.max(...maturityHeatmapRows.flatMap((row) => row.cells.map((cell) => cell.bottles)), 1);
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
  const wineCollectionFilters: WineCollectionFilters = {
    query: normalizedQuery,
    type: typeFilter,
    status: statusFilter,
    minPrice: hasMinBottlePrice ? minBottlePrice : null,
    maxPrice: hasMaxBottlePrice ? maxBottlePrice : null,
    ownership: ownershipFilter,
    quick: quickWineFilter,
    tags: tagFilter,
    grapes: grapeFilter,
    currentYear,
    now,
    session,
  };
  const filteredWines = activeWineCollection
    .filter((wine) => matchesWineCollectionFilters(wine, wineCollectionFilters))
    .filter((wine) => {
      if (!maturityFilter || activeView !== "cellar") return true;
      return wineTone(wine.type) === maturityFilter.tone && isWineAtMaturityPeak(wine, maturityFilter.year);
    })
    .sort(compareWines(sortMode));
  const tastingFilterWineIds = new Set(
    activeWineCollection
      .filter((wine) => matchesWineCollectionFilters(wine, { ...wineCollectionFilters, query: "" }))
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
        enjoyment: entry.enjoyment,
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
      enjoyment: tastingEnjoymentValue(item.enjoyment),
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

  useEffect(() => {
    if (offlineMode || !session?.authenticated || !selectedWineId) {
      setCoOwnershipAgreements([]);
      return;
    }
    loadCoOwnershipAgreements(selectedWineId).catch(() => setCoOwnershipAgreements([]));
  }, [offlineMode, session?.authenticated, selectedWineId]);

  useEffect(() => {
    if (offlineMode || !session?.authenticated || !selectedWineId || !canWriteWine) {
      setShareOfferRecipients([]);
      setOutgoingShareOffers([]);
      return;
    }
    loadShareOfferRecipients(selectedWineId).catch(() => setShareOfferRecipients([]));
    loadOutgoingShareOffers(selectedWineId).catch(() => setOutgoingShareOffers([]));
  }, [offlineMode, session?.authenticated, selectedWineId, canWriteWine]);

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
    toCollect: cellarWines.filter(isToCollectWine).length,
    nextDelivery: cellarWines
      .map((wine) => (isFutureDeliveryWine(wine, now) ? { wine, days: daysUntil(wine.expected_delivery || "") } : null))
      .filter((item): item is { wine: Wine; days: number } => Boolean(item && item.days !== null && item.days >= 0))
      .sort((first, second) => first.days - second.days)[0],
    missingValue: cellarWines.filter((wine) => !wine.current_value).length,
    missingDrinkWindow: cellarWines.filter((wine) => hasVintageForDrinkWindow(wine) && (!wine.drink_from || !wine.drink_to)).length,
    missingGrapes: cellarWines.filter((wine) => wine.grapes.length === 0).length,
    missingScores: cellarWines.filter((wine) => wine.scores.length === 0 && !wine.scores_not_applicable).length,
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
  const winesByRegion = topWineCountGroups(cellarWines, "region");
  const cellarMissingDataCount = cellarStats.missingValue + cellarStats.missingDrinkWindow + cellarStats.missingGrapes + cellarStats.missingScores;
  const cellarDataCheckCount = Math.max(cellarWines.length * 4, 1);
  const cellarDataCompleteness = Math.round(Math.max(0, Math.min(100, ((cellarDataCheckCount - cellarMissingDataCount) / cellarDataCheckCount) * 100)));
  const cellarAiReadiness = cellarWines.length
    ? Math.round(Math.max(0, Math.min(100, (cellarStats.aiNotes / cellarWines.length) * 100)))
    : 0;
  const cellarActionItems = [
    { label: t("missingValue"), count: cellarStats.missingValue },
    { label: t("missingDrinkWindow"), count: cellarStats.missingDrinkWindow },
    { label: t("missingGrapes"), count: cellarStats.missingGrapes },
    { label: t("missingScores"), count: cellarStats.missingScores },
  ];
  const valueByTypeTotal = valueByType.reduce((sum, item) => sum + item.value, 0);
  const valueByRegionTotal = valueByRegion.reduce((sum, item) => sum + item.value, 0);
  const bottlesByTypeTotal = bottlesByType.reduce((sum, item) => sum + item.value, 0);
  const winesByRegionTotal = winesByRegion.reduce((sum, item) => sum + item.value, 0);
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
  const regionalGapTotalValue = Math.max(sumWineValue(cellarWines), 1);
  const regionalGapRows = regionalGapTargets.map((target) => {
    const value = sumWineValue(cellarWines.filter((wine) => regionalGapBucket(wine.region) === target.region));
    const currentPct = (value / regionalGapTotalValue) * 100;
    const targetValue = (regionalGapTotalValue * target.targetPct) / 100;
    return {
      ...target,
      value,
      currentPct,
      gapValue: Math.max(targetValue - value, 0),
      deltaPct: target.targetPct - currentPct,
    };
  });
  const regionalGapSuggestions = regionalGapRows
    .filter((row) => sumWineValue(cellarWines) > 0 && row.gapValue > 0 && row.region !== "Other")
    .sort((first, second) => second.deltaPct - first.deltaPct)
    .slice(0, 4);
  const regionalGapRadarMaxPct = Math.max(
    ...regionalGapRows.flatMap((row) => [row.currentPct, row.targetPct]),
    1,
  );
  const regionalGapRadarScaleMax = Math.max(10, Math.ceil(regionalGapRadarMaxPct / 5) * 5);
  const regionalGapCurrentPoints = regionalGapRows.map((row, index) => radarScaledPoint(index, regionalGapRows.length, row.currentPct, regionalGapRadarScaleMax)).join(" ");
  const regionalGapTargetPoints = regionalGapRows.map((row, index) => radarScaledPoint(index, regionalGapRows.length, row.targetPct, regionalGapRadarScaleMax)).join(" ");
  const regionalGapAxisPoints = regionalGapRows.map((row, index) => ({
    ...row,
    point: radarPoint(index, regionalGapRows.length, 105, 42, 50),
    linePoint: radarPoint(index, regionalGapRows.length, 100, 42, 50),
  }));
  const regionalGapDraftTotal = regionalGapDraft.reduce((sum, target) => sum + Number(target.targetPct || 0), 0);
  const regionalGapProfileLabels: Record<RegionalGapProfile, TranslationKey> = {
    investment: "regionalProfileInvestment",
    readiness: "regionalProfileReadiness",
    daily: "regionalProfileDaily",
    balanced: "regionalProfileBalanced",
  };
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
  const winesToCollect = cellarWines
    .filter(isToCollectWine)
    .sort((first, second) => (
      first.merchant.localeCompare(second.merchant) ||
      first.producer.localeCompare(second.producer) ||
      first.name.localeCompare(second.name) ||
      first.vintage.localeCompare(second.vintage)
    ))
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
    .filter((wine) => !wine.current_value || !wine.drink_from || !wine.drink_to || (wine.scores.length === 0 && !wine.scores_not_applicable) || wine.grapes.length === 0)
    .sort((first, second) => {
      const firstMissing = Number(!first.current_value) + Number(!first.drink_from || !first.drink_to) + Number(first.scores.length === 0 && !first.scores_not_applicable) + Number(first.grapes.length === 0);
      const secondMissing = Number(!second.current_value) + Number(!second.drink_from || !second.drink_to) + Number(second.scores.length === 0 && !second.scores_not_applicable) + Number(second.grapes.length === 0);
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
          enjoyment: tastingEnjoymentValue(item.enjoyment),
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
  const keyPositionCandidates = (() => {
    const positionValue = (wine: Wine) => wineUnitValue(wine) * wine.quantity;
    const ownedValue = (wine: Wine) => positionValue(wine) * (currentUserSharePct(wine, session) / 100);
    const priceIncreasePct = (wine: Wine) => {
      const purchasePrice = Number(wine.price || 0);
      const historicalValues = wine.value_history
        .map((entry) => Number(entry.value || 0))
        .filter((value) => Number.isFinite(value) && value > 0);
      const baseline = purchasePrice > 0 ? purchasePrice : historicalValues[0] || 0;
      const current = Number(wine.current_value || historicalValues[historicalValues.length - 1] || 0);
      if (!baseline || !current || current <= baseline) return null;
      return ((current - baseline) / baseline) * 100;
    };
    const ownWines = cellarWines.filter((wine) => currentUserSharePct(wine, session) >= 99.999);
    const sharedWines = cellarWines.filter((wine) => currentUserSharePct(wine, session) > 0 && currentUserSharePct(wine, session) < 99.999);
    const orderedByOwnedValue = [...cellarWines].sort((first, second) => ownedValue(second) - ownedValue(first));
    const orderedByPositionValue = [...cellarWines].sort((first, second) => positionValue(second) - positionValue(first));
    const orderedOwn = [...ownWines].sort((first, second) => ownedValue(second) - ownedValue(first));
    const orderedShared = [...sharedWines].sort((first, second) => ownedValue(second) - ownedValue(first));
    const largestPriceIncrease = cellarWines
      .map((wine) => ({ wine, increasePct: priceIncreasePct(wine) }))
      .filter((item): item is { wine: Wine; increasePct: number } => item.increasePct !== null)
      .sort((first, second) => second.increasePct - first.increasePct)[0];
    const selected: Wine[] = [];
    const add = (wine: Wine | undefined) => {
      if (wine && !selected.some((item) => item.id === wine.id)) selected.push(wine);
    };

    add(largestPriceIncrease?.wine);
    add(orderedByOwnedValue[0]);
    add(orderedByPositionValue[0]);
    add(orderedOwn[0]);
    add(orderedShared[0]);
    orderedByOwnedValue.forEach(add);

    return selected.slice(0, 4).map((wine) => {
      const sharePct = currentUserSharePct(wine, session);
      const totalValue = positionValue(wine);
      const drinkStart = wine.drink_from || wine.drink_peak_from || null;
      const drinkEnd = wine.drink_to || wine.drink_peak_to || null;
      const peakStart = wine.drink_peak_from || wine.drink_from || null;
      const peakEnd = wine.drink_peak_to || wine.drink_to || null;
      const maturitySpan = drinkStart && drinkEnd ? Math.max(drinkEnd - drinkStart, 1) : 0;
      const maturityProgress = drinkStart && drinkEnd
        ? Math.max(0, Math.min(100, ((currentYear - drinkStart) / maturitySpan) * 100))
        : 0;
      const maturityPeakLeft = drinkStart && drinkEnd && peakStart
        ? Math.max(0, Math.min(100, ((peakStart - drinkStart) / maturitySpan) * 100))
        : 0;
      const maturityPeakWidth = drinkStart && drinkEnd && peakStart && peakEnd
        ? Math.max(4, Math.min(100 - maturityPeakLeft, ((peakEnd - peakStart) / maturitySpan) * 100))
        : 0;
      const maturityLabel = drinkStart && drinkEnd ? `${drinkStart}-${drinkEnd}` : t("notSpecified");
      const hasMaturityWindow = Boolean(drinkStart && drinkEnd);
      return {
        wine,
        isLargestPriceIncrease: largestPriceIncrease?.wine.id === wine.id,
        highlight: largestPriceIncrease?.wine.id === wine.id ? t("largestPriceIncrease") : t("keyPosition"),
        priceIncreasePct: priceIncreasePct(wine),
        purchasePrice: Number(wine.price || 0),
        sharePct,
        ownedValue: totalValue * (sharePct / 100),
        totalValue,
        maturityProgress,
        maturityPeakLeft,
        maturityPeakWidth,
        maturityLabel,
        hasMaturityWindow,
        action: !wine.drink_from || !wine.drink_to
          ? t("completeData")
          : wine.drink_to < currentYear
            ? t("monitor")
            : wine.drink_from <= currentYear && wine.drink_to >= currentYear
              ? t("drinkNow")
              : t("hold"),
      };
    });
  })();
  const keyPositionIds = keyPositionCandidates.map(({ wine }) => wine.id).join("|");
  const activeKeyPosition = keyPositionCandidates[Math.min(activeKeyPositionIndex, Math.max(keyPositionCandidates.length - 1, 0))];
  const activeKeyPositionScope = activeKeyPosition
    ? activeKeyPosition.sharePct >= 99.999 ? t("myBottles") : t("sharedBottles")
    : "";

  useEffect(() => {
    pendingKeyPositionIndexRef.current = null;
    setActiveKeyPositionIndex(0);
    keyPositionStripRef.current?.scrollTo({ left: 0 });
  }, [keyPositionIds]);

  function keyPositionSlideWidth(container: HTMLDivElement) {
    const firstSlide = container.firstElementChild;
    if (firstSlide instanceof HTMLElement) {
      return firstSlide.getBoundingClientRect().width || container.clientWidth;
    }
    return container.clientWidth;
  }

  function updateActiveKeyPosition(event: UIEvent<HTMLDivElement>) {
    const container = event.currentTarget;
    const width = keyPositionSlideWidth(container);
    if (!width) return;
    const nextIndex = Math.round(container.scrollLeft / width);
    const boundedNextIndex = Math.max(0, Math.min(nextIndex, keyPositionCandidates.length - 1));
    const pendingIndex = pendingKeyPositionIndexRef.current;
    if (pendingIndex !== null) {
      if (boundedNextIndex === pendingIndex) pendingKeyPositionIndexRef.current = null;
      return;
    }
    setActiveKeyPositionIndex(boundedNextIndex);
  }

  function goToKeyPosition(index: number) {
    const container = keyPositionStripRef.current;
    if (!container) return;
    const nextIndex = Math.max(0, Math.min(index, keyPositionCandidates.length - 1));
    pendingKeyPositionIndexRef.current = nextIndex;
    container.scrollTo({ left: keyPositionSlideWidth(container) * nextIndex, behavior: "smooth" });
    setActiveKeyPositionIndex(nextIndex);
  }

  const allMissingValueWines = cellarWines.filter((wine) => !wine.current_value);
  const allValueRefreshWines = cellarWines.filter((wine) => needsValueRefresh(wine, valueRefreshDaysNumber, now));
  const allMissingDrinkWindowWines = cellarWines.filter((wine) => hasVintageForDrinkWindow(wine) && (!wine.drink_from || !wine.drink_to));
  const allMissingGrapesWines = cellarWines.filter((wine) => wine.grapes.length === 0);
  const allMissingScoresWines = cellarWines.filter((wine) => wine.scores.length === 0 && !wine.scores_not_applicable);
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
    cellarStats.toCollect ? {
      id: "to-collect",
      kind: "smart_to_collect",
      title: t("winesToCollect"),
      detail: winesToCollect[0] ? `${winesToCollect[0].name}${winesToCollect[0].merchant ? ` - ${winesToCollect[0].merchant}` : ""}` : t("openFilteredCellar"),
      count: cellarStats.toCollect,
      signature: `${cellarStats.toCollect}:${winesToCollect[0]?.id || winesToCollect[0]?.name || ""}:${winesToCollect[0]?.merchant || ""}`,
      onOpen: () => openOperationalCellarFilter("to_collect"),
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
  const activeRedeemCodesCount = redeemCodes.filter((code) => code.is_active).length;
  const approvedUsersCount = appUsers.filter((user) => user.is_approved).length;
  const adminUsersSorted = [...appUsers].sort((first, second) => {
    if (first.is_approved !== second.is_approved) return Number(first.is_approved) - Number(second.is_approved);
    if (first.is_blocked !== second.is_blocked) return Number(first.is_blocked) - Number(second.is_blocked);
    return (first.display_name || first.email).localeCompare(second.display_name || second.email);
  });
  const quickWineFilterLabels: Record<QuickWineFilter, string> = {
    "": t("totalValue"),
    mine: t("myBottles"),
    shared: t("sharedBottles"),
    drink_now: t("drinkNow"),
    drink_soon: t("drinkIn2Years"),
    past_window: t("pastWindow"),
    future_deliveries: t("futureDeliveries"),
    to_collect: t("winesToCollect"),
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
      if (current.length >= 2) {
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
    if (compareWineIds.length !== 2) {
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
      <details
        className="wine-form share-panel collapsible-panel"
        onToggle={(event) => {
          if ((event.currentTarget as HTMLDetailsElement).open) {
            Promise.all([loadShareOfferRecipients(wine.id), loadOutgoingShareOffers(wine.id)]).catch(() => undefined);
          }
        }}
      >
        <summary>{t("shareWine")}</summary>
        <p className="empty-state">{t("shareWineHelp")}</p>
        <button
          type="button"
          className="secondary compact share-offer-refresh"
          disabled={saving}
          onClick={() => Promise.all([loadShareOfferRecipients(wine.id), loadOutgoingShareOffers(wine.id)]).catch((nextError) => setError(nextError instanceof Error ? nextError.message : "Unable to refresh share recipients"))}
        >
          {locale === "it" ? "Aggiorna elenco" : "Refresh list"}
        </button>
        <label>
          <span>{t("email")}</span>
          <select
            value={shareDraft.email}
            onChange={(event) => {
              const recipient = shareOfferRecipients.find((item) => item.email === event.target.value);
              setShareDraft({ ...shareDraft, email: event.target.value, share_pct: recipient ? String(recipient.share_pct) : "" });
            }}
            disabled={!shareOfferRecipients.length}
          >
            <option value="">{locale === "it" ? "Scegli un comproprietario Vinaris" : "Choose a Vinaris co-owner"}</option>
            {shareOfferRecipients.map((recipient) => <option key={recipient.email} value={recipient.email}>{recipient.display_name} · {recipient.email} · {recipient.share_pct}%</option>)}
          </select>
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
        {!shareOfferRecipients.length ? <p className="empty-state">{locale === "it" ? "Non ci sono altri comproprietari Vinaris a cui inviare questo vino." : "There are no other eligible Vinaris co-owners for this wine."}</p> : null}
        <button type="button" disabled={saving || !shareDraft.email.trim()} onClick={() => createWineShareOffer(wine)}>
          {t("shareWine")}
        </button>
        {outgoingShareOffers.length ? (
          <div className="share-offer-pending-list">
            <strong>{locale === "it" ? "Invii in attesa" : "Pending sends"}</strong>
            {outgoingShareOffers.map((offer) => (
              <div className="share-offer-pending-row" key={offer.id}>
                <span>{offer.recipient_email} · {offer.share_pct}%{offer.status === "revocation_pending" ? ` · ${locale === "it" ? "in attesa di approvazione" : "awaiting approval"}` : ""}</span>
                {offer.status === "pending" ? (
                  <button type="button" className="secondary compact" disabled={saving} onClick={() => cancelWineShareOffer(wine, offer)}>
                    {locale === "it" ? "Annulla invio" : "Cancel send"}
                  </button>
                ) : offer.status === "accepted" ? (
                  <button type="button" className="secondary compact" disabled={saving} onClick={() => requestWineShareOfferRevocation(wine, offer)}>
                    {locale === "it" ? "Richiedi annullamento" : "Request removal"}
                  </button>
                ) : null}
              </div>
            ))}
          </div>
        ) : null}
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
    setMaturityFilter(null);
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
    setMaturityFilter(null);
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
    setMaturityFilter(null);
    setWineFormOpen(false);
    setWishlistFormOpen(false);
    setNotificationsOpen(false);
  }

  function applyMaturityHeatmapFilter(year: number, tone: WineTone) {
    setActiveView("cellar");
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
    setSortMode("drink_window");
    setMaturityFilter((current) => current?.year === year && current.tone === tone ? null : { year, tone });
    setOpenWineToneGroups((current) => ({ ...current, [tone]: true }));
    setWineFormOpen(false);
    setWishlistFormOpen(false);
    setNotificationsOpen(false);
  }

  function clearMaturityHeatmapFilter() {
    setMaturityFilter(null);
  }

  function saveRegionalGapTargets(nextDraft: RegionalGapTargetDraft[] = regionalGapDraft) {
    const nextTargets = normalizeRegionalTargets(nextDraft.map((target) => ({ region: target.region, targetPct: Number(target.targetPct || 0) })));
    setRegionalGapTargets(nextTargets);
    setRegionalGapDraft(nextTargets.map((target) => ({ region: target.region, targetPct: String(target.targetPct) })));
    window.localStorage.setItem(regionalGapStorageKey(session?.active_household_id), JSON.stringify(nextTargets));
    setRegionalGapAiSuggestion(null);
    setRegionalGapTargetsOpen(false);
    setRegionalGapFeedback(t("regionalTargetsSaved"));
  }

  function resetRegionalGapTargets() {
    const nextTargets = regionalTargetsForCellar(cellarWines);
    setRegionalGapTargets(nextTargets);
    setRegionalGapDraft(nextTargets.map((target) => ({ region: target.region, targetPct: String(target.targetPct) })));
    window.localStorage.removeItem(regionalGapStorageKey(session?.active_household_id));
    setRegionalGapAiSuggestion(null);
    setRegionalGapFeedback("");
  }

  async function generateRegionalGapTargets() {
    const model = await requestAiModelAdvice(t("regionalGapAnalysis"), "advanced", aiSettings?.wishlist_model || aiSettingsDraft.wishlist_model);
    if (!model) return;
    setGeneratingAi("regional-gap-targets");
    setError("");
    try {
      const result = await api<RegionalGapAiSuggestion>("/api/v1/ai/regional-gap-targets", {
        method: "POST",
        body: JSON.stringify({
          locale,
          profile: regionalGapProfile,
          current_allocation: regionalGapRows.map((row) => ({
            region: row.region,
            current_pct: Math.round(row.currentPct * 10) / 10,
            value_chf: Math.round(row.value * 100) / 100,
          })),
          model,
        }),
      });
      setRegionalGapAiSuggestion(result);
      await Promise.all([loadAiAudit(), loadAiUsage()]);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Unable to generate regional target");
    } finally {
      setGeneratingAi("");
    }
  }

  function applyRegionalGapAiSuggestion() {
    if (!regionalGapAiSuggestion) return;
    const nextDraft = regionalGapTargets.map((target) => {
      const suggestion = regionalGapAiSuggestion.targets.find((item) => item.region === target.region);
      return { region: target.region, targetPct: String(Number(suggestion?.target_pct ?? target.targetPct)) };
    });
    saveRegionalGapTargets(nextDraft);
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
    setMaturityFilter(null);
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
    setMaturityFilter(null);
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

  const activePairingBudget = Number(pairingMaxPrice || 0);
  const hasPairingBudget = Number.isFinite(activePairingBudget) && activePairingBudget > 0;
  const cellarBottleValues = wines
    .map((wine) => Number(wine.current_value || wine.price || 0))
    .filter((value) => Number.isFinite(value) && value > 0);
  const pairingBudgetSliderMax = Math.max(250, Math.ceil(Math.max(...cellarBottleValues, 250) / 50) * 50);
  const pairingBudgetSliderValue = hasPairingBudget ? Math.min(activePairingBudget, pairingBudgetSliderMax) : 0;
  const pairingBudgetPresets = [40, 80, 150].filter((value) => value < pairingBudgetSliderMax);

  function renderMaturityHeatmapCard() {
    return (
      <article className="dashboard-card wide-card maturity-heatmap-card">
        <div className="card-heading">
          <div>
            <span>{t("maturityMap")}</span>
            <h2><i className="dashboard-section-icon" aria-hidden="true">{collectorFocusSvgIcon("maturity")}</i>{t("drinkingWindow")}</h2>
          </div>
          {maturityFilter ? (
            <button type="button" className="secondary compact" onClick={clearMaturityHeatmapFilter}>
              {t("clearMaturityFilter")}
            </button>
          ) : null}
        </div>
        <p className="maturity-heatmap-help">{t("maturityHeatmapHelp")}</p>
        {maturityFilter ? (
          <div className="maturity-filter-pill">
            <span>{t("maturityFilter")}</span>
            <strong>{wineToneLabel(maturityFilter.tone, locale)} {maturityFilter.year}</strong>
          </div>
        ) : null}
        {maturityHeatmapRows.length ? (
          <div className="maturity-heatmap" style={{ "--maturity-year-count": maturityHeatmapYears.length } as CSSProperties}>
            <div className="maturity-heatmap-years" aria-hidden="true">
              <span />
              {maturityHeatmapYears.map((year) => <span key={year}>{year}</span>)}
            </div>
            {maturityHeatmapRows.map((row) => (
              <div className="maturity-heatmap-row" key={row.tone}>
                <span className={`maturity-heatmap-label tone-${row.tone}`}>
                  <i className={`wine-dot tone-${row.tone}`} />
                  {row.label}
                </span>
                {row.cells.map((cell) => {
                  const intensity = Math.max(cell.bottles / maxMaturityHeatmapBottles, cell.count ? 0.16 : 0);
                  const selected = maturityFilter?.year === cell.year && maturityFilter.tone === row.tone;
                  const label = `${row.label} ${cell.year}: ${formatBottleCount(cell.bottles, locale)} ${t("bottles").toLowerCase()}, ${cell.count} ${t("wines").toLowerCase()}`;
                  return (
                    <button
                      type="button"
                      className={`maturity-heatmap-cell tone-${row.tone}${selected ? " selected" : ""}`}
                      key={`${row.tone}-${cell.year}`}
                      style={{ "--heatmap-weight": `${Math.round(intensity * 58)}%` } as CSSProperties}
                      disabled={!cell.count}
                      title={`${label} - ${formatMoney(cell.value, "CHF", locale)}`}
                      aria-label={label}
                      onClick={() => applyMaturityHeatmapFilter(cell.year, row.tone)}
                    >
                      <span>{cell.bottles ? formatBottleCount(cell.bottles, locale) : ""}</span>
                    </button>
                  );
                })}
              </div>
            ))}
          </div>
        ) : (
          <p className="empty-state">{t("maturityHeatmapEmpty")}</p>
        )}
      </article>
    );
  }

  function renderRegionalGapCard() {
    return (
      <article className="dashboard-card wide-card regional-gap-card">
        <div className="card-heading">
          <div>
            <span>{t("regionalGapAnalysis")}</span>
            <h2><i className="dashboard-section-icon" aria-hidden="true">{collectorFocusSvgIcon("regions")}</i>{t("topRegions")}</h2>
          </div>
          <button type="button" className="secondary compact" onClick={() => { setRegionalGapFeedback(""); setRegionalGapTargetsOpen((current) => !current); }}>
            {t("editTargets")}
          </button>
        </div>
        <p className="regional-gap-help">{t("regionalGapHelp")}</p>
        {regionalGapFeedback ? <div className="regional-target-feedback" role="status">{regionalGapFeedback}</div> : null}
        {regionalGapTargetsOpen ? (
          <div className="regional-target-editor">
            <div className="regional-target-grid">
              {regionalGapDraft.map((target, index) => (
                <label key={target.region}>
                  <span>{target.region}</span>
                  <input
                    type="number"
                    min="0"
                    max="100"
                    step="0.1"
                    value={target.targetPct}
                    onChange={(event) => { setRegionalGapFeedback(""); setRegionalGapDraft((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, targetPct: event.target.value } : item)); }}
                  />
                </label>
              ))}
            </div>
            <div className={`regional-target-total${Math.abs(regionalGapDraftTotal - 100) <= 0.1 ? " valid" : ""}`}>
              <span>{t("targetTotal")}</span>
              <strong>{Math.round(regionalGapDraftTotal * 10) / 10}%</strong>
            </div>
            <div className="regional-target-actions">
              <button type="button" onClick={() => saveRegionalGapTargets()}>{t("saveTargets")}</button>
              <button type="button" className="secondary" onClick={resetRegionalGapTargets}>{t("resetTargets")}</button>
            </div>
            <div className="regional-ai-targets">
              <button type="button" className="regional-ai-submit" disabled={!canGenerateAi || generatingAi === "regional-gap-targets"} onClick={generateRegionalGapTargets}>
                <ButtonBusyContent busy={generatingAi === "regional-gap-targets"} idleLabel={t("suggestWithAi")} busyLabel={t("generating")} />
              </button>
              <div className="regional-profile-panel">
                <span>{t("aiTargetObjective")}</span>
                <div className="regional-profile-buttons" role="tablist" aria-label={t("aiTargetObjective")}>
                  {([
                    ["investment", "regionalProfileInvestment"],
                    ["readiness", "regionalProfileReadiness"],
                    ["daily", "regionalProfileDaily"],
                    ["balanced", "regionalProfileBalanced"],
                  ] as Array<[RegionalGapProfile, TranslationKey]>).map(([profile, labelKey]) => (
                    <button
                      type="button"
                      key={profile}
                      className={regionalGapProfile === profile ? "" : "secondary"}
                      onClick={() => setRegionalGapProfile(profile)}
                    >
                      {t(labelKey)}
                    </button>
                  ))}
                </div>
              </div>
              {regionalGapAiSuggestion ? (
                <div className="regional-ai-proposal">
                  <strong>{t("aiTargetProposal")}</strong>
                  <p>{regionalGapAiSuggestion.rationale}</p>
                  <div>
                    {regionalGapAiSuggestion.targets.map((target) => (
                      <span key={target.region}>{target.region} {Number(target.target_pct).toFixed(1)}%</span>
                    ))}
                  </div>
                  <div className="regional-ai-cost">
                    <strong>{t("aiRequestCost")}</strong>
                    <span>{formatAiBudget(regionalGapAiSuggestion.estimated_cost_usd)}</span>
                    <span>{regionalGapAiSuggestion.model} · {t("reasoningEffort")}: {t(reasoningEffortTranslationKey(regionalGapAiSuggestion.reasoning_effort))}</span>
                  </div>
                  <button type="button" onClick={applyRegionalGapAiSuggestion}>{t("applyAiTarget")}</button>
                </div>
              ) : null}
            </div>
          </div>
        ) : null}
        <div className="regional-gap-layout">
          <div className="regional-radar-wrap">
            <svg className="regional-radar" viewBox="0 0 100 100" role="img" aria-label={t("regionalGapAnalysis")}>
              {[25, 50, 75, 100].map((level) => (
                <polygon
                  className="regional-radar-ring"
                  key={level}
                  points={regionalGapRows.map((_, index) => radarScaledPoint(index, regionalGapRows.length, (regionalGapRadarScaleMax * level) / 100, regionalGapRadarScaleMax)).join(" ")}
                />
              ))}
              {[25, 50, 75, 100].map((level) => {
                const value = (regionalGapRadarScaleMax * level) / 100;
                const [x, y] = radarScaledPoint(1, regionalGapRows.length, value, regionalGapRadarScaleMax).split(",");
                const labelX = Math.min(Number(x) + 5.5, 92);
                return (
                  <g className="regional-radar-scale" key={`scale-${level}`}>
                    <line x1={x} y1={y} x2={labelX - 1.4} y2={y} />
                    <text x={labelX} y={y}>{Math.round(value * 10) / 10}%</text>
                  </g>
                );
              })}
              {regionalGapAxisPoints.map((axis) => (
                <line className="regional-radar-axis" key={axis.region} x1="50" y1="50" x2={axis.linePoint.split(",")[0]} y2={axis.linePoint.split(",")[1]} />
              ))}
              <polygon className="regional-radar-target" points={regionalGapTargetPoints} />
              <polygon className="regional-radar-current" points={regionalGapCurrentPoints} />
              {regionalGapAxisPoints.map((axis) => {
                const [x, y] = axis.point.split(",");
                return (
                  <text className="regional-radar-label" key={axis.region} x={x} y={y}>
                    {regionalTargetLabel(axis.region, locale)}
                  </text>
                );
              })}
            </svg>
            <div className="regional-radar-legend">
              <span><i className="regional-legend-current" />{t("currentPortfolio")}</span>
              <span><i className="regional-legend-target" />{t("targetPortfolio")} {t(regionalGapProfileLabels[regionalGapProfile]).toLowerCase()}</span>
            </div>
          </div>
          <details className="regional-gap-suggestions" open={!isMobileViewport}>
            <summary>{t("gapSuggestions")}</summary>
            {regionalGapSuggestions.length ? regionalGapSuggestions.map((row) => (
              <div className="regional-gap-row" key={row.region}>
                <div>
                  <span>{row.region}</span>
                  <small>{t("currentPortfolio")} {Math.round(row.currentPct)}% / {t("targetPortfolio")} {row.targetPct}%</small>
                </div>
                <strong><small>{t("missingValueGap")}</small>{formatMoney(row.gapValue, "CHF", locale)}</strong>
              </div>
            )) : <p className="empty-state">{t("balancedPortfolio")}</p>}
          </details>
        </div>
      </article>
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
  const gpt56ModelsEnabled = aiSettings?.model_options?.length
    ? aiSettings.model_options.every((model) => model.startsWith("gpt-5.6-"))
    : false;

  if (coOwnershipToken) {
    return <CoOwnershipPublicPage token={coOwnershipToken} locale={locale} onClose={() => setCoOwnershipToken("")} />;
  }

  function renderCoOwnershipSection(wine: Wine) {
    const owners = ownershipRows(wine);
    if (!owners.length && !coOwnershipAgreements.length && !canWriteWine) return null;
    return (
      <section className="coownership-workspace">
        <header className="coownership-workspace-header">
          <h3>{locale === "it" ? "Multiproprietà" : "Co-ownership"}</h3>
        </header>
        <div className="coownership-summary">
          {owners.length ? (
            <div className="ownership-list">
              {owners.map((owner, index) => (
                <div className="ownership-row" key={`${owner.email || owner.name}-${index}`}>
                  <span>{owner.name}{owner.email ? ` - ${owner.email}` : ""}</span>
                  <strong>{Number(owner.share_pct).toLocaleString(locale, { maximumFractionDigits: 6 })}%</strong>
                </div>
              ))}
            </div>
          ) : <p className="empty-state">{locale === "it" ? "Nessuna quota di multiproprietà configurata." : "No co-ownership shares are configured."}</p>}
        </div>
        {renderSharePanel(wine)}
        <CoOwnershipPanel
          wine={wine}
          session={session}
          agreements={coOwnershipAgreements}
          canWrite={canWriteWine && !offlineMode}
          saving={saving}
          onCreate={(payload) => createCoOwnershipAgreement(wine, payload)}
          onCancel={(agreement) => cancelCoOwnershipAgreement(wine, agreement)}
        />
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
                        {notification.kind === "share_revocation" ? (
                          <div className="member-actions">
                            <button type="button" className="compact" disabled={saving} onClick={() => decideWineShareOfferRevocation(notification, "approve")}>
                              {locale === "it" ? "Approva rimozione" : "Approve removal"}
                            </button>
                            <button type="button" className="secondary compact" disabled={saving} onClick={() => decideWineShareOfferRevocation(notification, "decline")}>
                              {locale === "it" ? "Mantieni" : "Keep"}
                            </button>
                          </div>
                        ) : (
                          <div className="member-actions">
                            <button type="button" className="compact" disabled={saving} onClick={() => openNotification(notification)}>
                              {notification.action_url ? t("open") : t("markRead")}
                            </button>
                            <button type="button" className="secondary compact" disabled={saving} onClick={() => markNotificationRead(notification)}>
                              {t("markRead")}
                            </button>
                          </div>
                        )}
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
                        {offer.message ? <span className="share-offer-message">{offer.message}</span> : null}
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
        <div className="invite-notice app-notice-toast" role="status" aria-live="polite">
          <span>{notice}</span>
          <button type="button" className="secondary compact app-notice-close" aria-label={t("close")} title={t("close")} onClick={() => setNotice("")}>
            ×
          </button>
        </div>
      ) : null}

      {!authenticated ? shouldPrioritizeAuthAction ? (
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
              {locale === "it" ? "L'app privata per gestire la tua cantina vini." : "A private app to manage your wine cellar."}
            </h2>
            <p>
              {locale === "it"
                ? "Tieni insieme bottiglie, valore, finestre di beva, consegne, wishlist e degustazioni."
                : "Keep bottles, value, drinking windows, deliveries, wishlist, and tastings together."}
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
              <a className="demo-link" href={`/videos/vinaris-demo-app-${locale}.mp4`} target="_blank" rel="noreferrer">
                {landing.demoDesktopCta}
              </a>
              <a className="demo-link demo-link-mobile" href={`/videos/vinaris-demo-app-${locale}-mobile.mp4`} target="_blank" rel="noreferrer">
                {landing.demoMobileCta}
              </a>
            </div>
            <p className="mobile-ai-credit-note">{landing.aiTrialNote}</p>
          </section>
          <section className="public-landing">
            <div className="public-hero">
              <div className="public-hero-copy">
                <p className="eyebrow">{locale === "it" ? "Collector edition" : "Collector edition"}</p>
                <h2>{landing.headline}</h2>
                <strong>{landing.subheadline}</strong>
                <p>{landing.description}</p>
                <div className="public-collector-strip" aria-label={locale === "it" ? "Indicatori collezionista" : "Collector signals"}>
                  <span>{locale === "it" ? "Inventario" : "Inventory"}</span>
                  <span>{locale === "it" ? "Valore" : "Value"}</span>
                  <span>{locale === "it" ? "Beva" : "Drink windows"}</span>
                  <span>{locale === "it" ? "Consegne" : "Deliveries"}</span>
                  <span>Wishlist</span>
                </div>
                <div className="public-proof-grid">
                  <article className="public-proof-tile">
                    <span>{locale === "it" ? "Inventario privato" : "Private inventory"}</span>
                    <strong>{locale === "it" ? "Bottiglie e quote" : "Bottles and shares"}</strong>
                  </article>
                  <article className="public-proof-tile">
                    <span>{locale === "it" ? "Decisioni di beva" : "Drinking decisions"}</span>
                    <strong>{locale === "it" ? "Apri o tieni" : "Open or hold"}</strong>
                  </article>
                  <article className="public-proof-tile">
                    <span>{locale === "it" ? "Memoria cantina" : "Cellar memory"}</span>
                    <strong>{locale === "it" ? "Note e storico" : "Notes and history"}</strong>
                  </article>
                </div>
                <div className="public-hero-actions">
                  <button type="button" onClick={() => openAuthPanel("register")}>
                    {landing.secondaryCta}
                  </button>
                  <button type="button" className="secondary" onClick={() => openAuthPanel("login")}>
                    {landing.primaryCta}
                  </button>
                  <a className="public-demo-link" href={`/videos/vinaris-demo-app-${locale}.mp4`} target="_blank" rel="noreferrer">
                    {landing.demoDesktopCta}
                  </a>
                  <a className="public-demo-link public-demo-link-mobile" href={`/videos/vinaris-demo-app-${locale}-mobile.mp4`} target="_blank" rel="noreferrer">
                    {landing.demoMobileCta}
                  </a>
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
                <div className="invite-notice promo-notice public-ai-credit-note">
                  <strong>AI</strong>
                  <span>{landing.aiTrialNote}</span>
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
        <section
          className={`workspace ${
            activeView === "settings"
              ? "settings-workspace"
              : activeView === "home" || activeView === "pairing" || activeView === "buying" || activeView === "help"
                ? "home-workspace"
                : "content-workspace"
          } ${activeView === "cellar" || activeView === "history" || activeView === "wishlist" ? "operational-workspace" : ""} ${wineDetailExpanded && isWineCollectionView && selectedVisibleWine ? "wine-detail-expanded" : ""}`}
        >
          {!needsRedeem ? (
          <div className="view-tabs">
            <button type="button" className={activeView === "home" ? "" : "secondary"} onClick={() => { setActiveView("home"); setWineFormOpen(false); setWishlistFormOpen(false); clearFilters("home"); }}>
              <AppIcon name="dashboard" variant="navigation" detailLevel="rich" />
              {t("home")}
            </button>
            <button type="button" className={activeView === "cellar" ? "" : "secondary"} onClick={() => { setActiveView("cellar"); setWishlistFormOpen(false); setWineFormOpen(false); setSelectedWineId(null); clearFilters("cellar"); }}>
              <AppIcon name="cellar" variant="navigation" detailLevel="rich" />
              {t("cellar")} ({cellarWines.length})
            </button>
            <button type="button" className={activeView === "history" ? "" : "secondary"} onClick={() => { setActiveView("history"); setWishlistFormOpen(false); setWineFormOpen(false); setSelectedWineId(null); clearFilters("history"); }}>
              <AppIcon name="calendar" variant="navigation" />
              {t("history")}
            </button>
            <button type="button" className={activeView === "wishlist" ? "" : "secondary"} onClick={() => { setActiveView("wishlist"); setWineFormOpen(false); clearFilters("wishlist"); }}>
              <AppIcon name="wishlist" variant="navigation" detailLevel="rich" />
              {t("wishlist")} ({totalWishlistItemCount})
            </button>
            <button type="button" className={activeView === "pairing" ? "" : "secondary"} onClick={() => { setActiveView("pairing"); setWineFormOpen(false); setWishlistFormOpen(false); clearFilters("pairing"); }}>
              <AppIcon name="glass-sparkle" variant="ai" detailLevel="rich" />
              {t("pairing")}
            </button>
            <button type="button" className={activeView === "help" ? "" : "secondary"} onClick={() => { setActiveView("help"); setWineFormOpen(false); setWishlistFormOpen(false); clearFilters("help"); }}>
              <AppIcon name="grapes" variant="premium" detailLevel="rich" />
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
                  {keyPositionCandidates.length ? (
                    <>
                      <div className="key-position-card-heading">
                        <div>
                          <span>{activeKeyPositionScope ? `${t("keyPositions")} - ${activeKeyPositionScope}` : t("keyPositions")}</span>
                          <strong>{keyPositionCandidates.length}</strong>
                        </div>
                      </div>
                      {keyPositionCandidates.length > 1 ? (
                        <div className="key-position-nav" aria-label={t("keyPositions")}>
                          <button
                            type="button"
                            aria-label={`${t("keyPosition")} ${Math.max(activeKeyPositionIndex, 1)}`}
                            disabled={activeKeyPositionIndex <= 0}
                            onClick={() => goToKeyPosition(activeKeyPositionIndex - 1)}
                          >
                            <AppIcon name="chevron-left" />
                          </button>
                          <button
                            type="button"
                            aria-label={`${t("keyPosition")} ${Math.min(activeKeyPositionIndex + 2, keyPositionCandidates.length)}`}
                            disabled={activeKeyPositionIndex >= keyPositionCandidates.length - 1}
                            onClick={() => goToKeyPosition(activeKeyPositionIndex + 1)}
                          >
                            <AppIcon name="chevron-right" />
                          </button>
                        </div>
                      ) : null}
                      <div
                        className="key-position-strip"
                        aria-label={t("keyPositions")}
                        onPointerDown={() => { pendingKeyPositionIndexRef.current = null; }}
                        onScroll={updateActiveKeyPosition}
                        onWheel={() => { pendingKeyPositionIndexRef.current = null; }}
                        ref={keyPositionStripRef}
                      >
                        {keyPositionCandidates.map(({ wine, highlight, isLargestPriceIncrease, priceIncreasePct, purchasePrice, sharePct, ownedValue, totalValue, action, maturityProgress, maturityPeakLeft, maturityPeakWidth, maturityLabel, hasMaturityWindow }) => (
                          <button type="button" className="key-position-button" key={wine.id} onClick={() => openWineFromDashboard(wine)}>
                            {wine.vintage ? <span className="key-position-yearmark" aria-hidden="true">{wine.vintage}</span> : null}
                            <div className="key-position-head">
                              <div>
                                <span>{highlight}</span>
                                <h2>{wine.name}</h2>
                                <p>{[wine.producer, wine.vintage].filter(Boolean).join(" - ")}</p>
                              </div>
                            </div>
                            <div className="key-position-metrics">
                              <div><span>{t("ownedValue")}</span><strong>{formatMoney(ownedValue, wine.currency, locale)}</strong></div>
                              <div><span>{t("totalValue")}</span><strong>{formatMoney(totalValue, wine.currency, locale)}</strong></div>
                              <div><span>{t("ownership")}</span><strong>{Math.round(sharePct)}%</strong></div>
                              <div><span>{isLargestPriceIncrease ? `${t("priceIncrease")} · ${t("purchasePrice")}` : t("action")}</span><strong>{isLargestPriceIncrease && priceIncreasePct !== null ? `+${formatPercentage(priceIncreasePct, locale, 1)} · ${purchasePrice > 0 ? formatMoney(purchasePrice, wine.currency, locale) : t("notSpecified")}` : action}</strong></div>
                            </div>
                            <div className="key-position-maturity">
                              <div>
                                <span>{t("maturityMap")}</span>
                                <strong>{maturityLabel}</strong>
                              </div>
                              <div className="key-position-maturity-track">
                                {maturityPeakWidth ? <span className="key-position-maturity-peak" style={{ left: `${maturityPeakLeft}%`, width: `${maturityPeakWidth}%` }} /> : null}
                                <span className="key-position-maturity-fill" style={{ width: `${maturityProgress}%` }} />
                                {hasMaturityWindow ? (
                                  <span
                                    className="key-position-maturity-current"
                                    style={{ left: `${maturityProgress}%` }}
                                    title={`${t("currentYear")}: ${currentYear}`}
                                    aria-hidden="true"
                                  />
                                ) : null}
                              </div>
                            </div>
                          </button>
                        ))}
                      </div>
                    </>
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

                <article className="dashboard-card operational-summary-card">
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

                <article className="dashboard-card operational-summary-card">
                  <button type="button" className="card-heading card-heading-button" onClick={() => openOperationalCellarFilter("to_collect")}>
                    <div>
                      <span>{t("upcomingDeliveries")}</span>
                      <h2><i className="dashboard-section-icon" aria-hidden="true">{collectorFocusSvgIcon("to_collect")}</i>{t("winesToCollect")}</h2>
                    </div>
                    <strong>{cellarStats.toCollect}</strong>
                  </button>
                  <div className="action-list">
                    {winesToCollect.length ? winesToCollect.map((wine) => (
                      <button type="button" className="action-row" key={wine.id} onClick={() => openWineFromDashboard(wine)}>
                        <span><i className={`wine-dot tone-${wineTone(wine.type)}`} />{wine.name}</span>
                        <strong>{wine.merchant || formatDisplayDate(wine.expected_delivery) || wine.status}</strong>
                      </button>
                    )) : <p className="empty-state">{t("noActionItems")}</p>}
                  </div>
                </article>

                <article className="dashboard-card operational-summary-card">
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
                        <strong>{!wine.current_value ? t("value") : !wine.drink_from || !wine.drink_to ? t("drinkWindow") : wine.scores.length === 0 && !wine.scores_not_applicable ? t("scores") : t("grapes")}</strong>
                      </button>
                    )) : <p className="empty-state">{t("noActionItems")}</p>}
                  </div>
                </article>

                {renderMaturityHeatmapCard()}

                <article className="dashboard-card wide-card geographic-map-card">
                  <div className="card-heading">
                    <div>
                      <span>{t("geographicMap")}</span>
                      <h2><i className="dashboard-section-icon" aria-hidden="true">{collectorFocusSvgIcon("regions")}</i>{t("wineOrigins")}</h2>
                    </div>
                  </div>
                  <WineGeographyMap wines={cellarWines} t={t} />
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
                  {renderRegionalGapCard()}
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
                  {renderMaturityHeatmapCard()}
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
                    <div className="action-list scrollable-action-list score-quality-list">
                      {missingScoresWines.length ? missingScoresWines.map((wine) => (
                        <div className="action-row data-quality-row score-quality-row" key={wine.id}>
                          <button type="button" className="row-open-action" onClick={() => openWineFromDashboard(wine)}>
                            <i className={`wine-dot tone-${wineTone(wine.type)}`} />
                            <span>{wine.name}</span>
                          </button>
                          <div className="row-action-buttons">
                            <button type="button" className="secondary compact" disabled={!canGenerateAi || Boolean(generatingAi)} onClick={() => generateWineAi(wine, "scores")}>
                              {generatingAi === "scores" && selectedWineId === wine.id ? t("generating") : t("scores")}
                            </button>
                            <button type="button" className="secondary compact" disabled={!canWriteWine || saving} onClick={() => setWineScoresAiExclusion(wine, true)}>
                              {t("noScoresNeeded")}
                            </button>
                          </div>
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
              <Suspense fallback={<LoadingState label={t("loadingData")} />}>
                <PairingView
                  activePairingBudget={activePairingBudget}
                  aiSettingsDraft={aiSettingsDraft}
                  canGenerateAi={canGenerateAi}
                  canWriteWine={canWriteWine}
                  formatAiBudget={formatAiBudget}
                  generatingAi={generatingAi}
                  hasPairingBudget={hasPairingBudget}
                  isMobileViewport={isMobileViewport}
                  locale={locale}
                  onGeneratePairing={generatePairing}
                  onOpenWine={openWineFromDashboard}
                  onSavePairingPreferences={savePairingPreferences}
                  pairingBudgetPresets={pairingBudgetPresets}
                  pairingBudgetSliderMax={pairingBudgetSliderMax}
                  pairingBudgetSliderValue={pairingBudgetSliderValue}
                  pairingDish={pairingDish}
                  pairingIgnorePreferences={pairingIgnorePreferences}
                  pairingIncludeMarket={pairingIncludeMarket}
                  pairingLocalOrigin={pairingLocalOrigin}
                  pairingMarketOnly={pairingMarketOnly}
                  pairingMaxPrice={pairingMaxPrice}
                  pairingPreferLocal={pairingPreferLocal}
                  pairingResult={pairingResult}
                  saving={saving}
                  savedPairingPreferences={aiSettings?.pairing_preferences || ""}
                  setAiSettingsDraft={setAiSettingsDraft}
                  setPairingDish={setPairingDish}
                  setPairingIgnorePreferences={setPairingIgnorePreferences}
                  setPairingIncludeMarket={setPairingIncludeMarket}
                  setPairingLocalOrigin={setPairingLocalOrigin}
                  setPairingMarketOnly={setPairingMarketOnly}
                  setPairingMaxPrice={setPairingMaxPrice}
                  setPairingPreferLocal={setPairingPreferLocal}
                  t={t}
                  wines={wines}
                />
              </Suspense>
            </section>
          ) : null}

          {activeView === "buying" ? (
            <section className="pairing-view buying-view">
              <Suspense fallback={<LoadingState label={t("loadingData")} />}>
                <BuyingAdviceView
                  canGenerateAi={canGenerateAi}
                  generatingAi={generatingAi}
                  locale={locale}
                  buyingPurpose={buyingPurpose}
                  buyingPairingWith={buyingPairingWith}
                  buyingPreferences={buyingPreferences}
                  buyingNeededBy={buyingNeededBy}
                  buyingLocation={buyingLocation}
                  buyingMinPrice={buyingMinPrice}
                  buyingMaxPrice={buyingMaxPrice}
                  buyingAdviceResult={buyingAdviceResult}
                  formatAiBudget={formatAiBudget}
                  onGenerateBuyingAdvice={generateBuyingAdvice}
                  setBuyingPurpose={setBuyingPurpose}
                  setBuyingPairingWith={setBuyingPairingWith}
                  setBuyingPreferences={setBuyingPreferences}
                  setBuyingNeededBy={setBuyingNeededBy}
                  setBuyingLocation={setBuyingLocation}
                  setBuyingMinPrice={setBuyingMinPrice}
                  setBuyingMaxPrice={setBuyingMaxPrice}
                  t={t}
                />
              </Suspense>
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
            {isWineCollectionView && selectedVisibleWine && !wineFormOpen ? (
              <div className="wine-side-panel-topbar">
                <button
                  type="button"
                  className="secondary compact detail-expand-button"
                  aria-label={wineDetailExpanded ? (locale === "it" ? "Riduci dettaglio vino" : "Reduce wine detail") : (locale === "it" ? "Espandi dettaglio vino" : "Expand wine detail")}
                  title={wineDetailExpanded ? (locale === "it" ? "Riduci dettaglio" : "Reduce detail") : (locale === "it" ? "Espandi dettaglio" : "Expand detail")}
                  onClick={() => setWineDetailExpanded((expanded) => !expanded)}
                >
                  <span aria-hidden="true">{wineDetailExpanded ? "⤡" : "⤢"}</span>
                </button>
              </div>
            ) : null}
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
                      {t("openCompare")} ({compareWineIds.length}/2)
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
                        <AppIcon name="camera" />
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
                    <button type="button" className="secondary compact" disabled={wineEnrichmentLoading} onClick={() => void enrichManualWineDraft("wine")}>
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
                        <AppIcon name="camera" />
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
                {showManualWishlistAiSearch ? (
                  <div className="manual-ai-search">
                    <button type="button" className="secondary compact" disabled={wineEnrichmentLoading} onClick={() => void enrichManualWineDraft("wishlist")}>
                      {wineEnrichmentLoading ? t("generating") : t("searchWineDataWithAi")}
                    </button>
                    <small className="form-hint">{t("searchWineDataWithAiHelp")}</small>
                  </div>
                ) : null}
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
                  onToggleScoresAiExclusion={(excluded) => setWineScoresAiExclusion(selectedVisibleWine, excluded)}
                  onConsume={(payload) => consumeWineBottle(selectedVisibleWine, payload)}
                  onUpdateTastingEntry={updateWineTastingEntry}
                  onDeleteTastingEntry={deleteWineTastingEntry}
                  marketAuditEntry={selectedWineMarketAudit}
                  onOpenMarketView={(entry) => setMarketViewContext({ kind: "wine", wine: selectedVisibleWine, entry })}
                  coOwnershipSection={renderCoOwnershipSection(selectedVisibleWine)}
                  t={t}
                  locale={locale}
                />
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
                <div className="empty-detail-image" aria-hidden="true">
                  <img src="/images/premium-cellar-empty.jpg" alt="" loading="lazy" />
                </div>
                <div className="empty-detail-copy">
                  <h2>{t("noItemSelected")}</h2>
                  <p>{t("selectItemHelp")}</p>
                </div>
              </div>
            )}
          </aside>
          ) : null}

          {isCollectionView ? (
          <section className="wine-list" aria-busy={loading}>
            {activeView === "cellar" ? (
            <details className="stats-panel-wrapper">
              <summary>
                {t("cellarStats")}
                {quickWineFilter ? <span>{quickWineFilterLabels[quickWineFilter]}</span> : null}
                {maturityFilter ? <span>{t("maturityFilter")}: {wineToneLabel(maturityFilter.tone, locale)} {maturityFilter.year}</span> : null}
              </summary>
              <section className="stats-panel cellar-stats-dashboard">
                <div className="cellar-kpi-grid">
                  <button type="button" className={`cellar-kpi-card cellar-kpi-card--value ${quickWineFilter === "" ? "active" : ""}`} onClick={() => applyQuickWineFilter("")}>
                    <i className="cellar-kpi-icon" aria-hidden="true">{dashboardStatSvgIcon("total")}</i>
                    <span className="cellar-kpi-copy">
                      <span>{t("totalValue")}</span>
                      <strong>{formatMoney(cellarStats.totalValue, "CHF", locale)}</strong>
                      <small>{formatBottleCount(cellarStats.bottles, locale)} {t("bottles").toLowerCase()}</small>
                    </span>
                  </button>
                  <button type="button" className={`cellar-kpi-card ${quickWineFilter === "mine" ? "active" : ""}`} onClick={() => applyQuickWineFilter("mine")}>
                    <i className="cellar-kpi-icon" aria-hidden="true">{dashboardStatSvgIcon("mine")}</i>
                    <span className="cellar-kpi-copy">
                      <span>{t("myBottles")}</span>
                      <strong>{formatBottleCount(cellarStats.myBottles, locale)}</strong>
                      <small>{formatMoney(cellarStats.myValue, "CHF", locale)}</small>
                    </span>
                  </button>
                  <button type="button" className={`cellar-kpi-card ${quickWineFilter === "shared" ? "active" : ""}`} onClick={() => applyQuickWineFilter("shared")}>
                    <i className="cellar-kpi-icon" aria-hidden="true">{dashboardStatSvgIcon("shared")}</i>
                    <span className="cellar-kpi-copy">
                      <span>{t("sharedBottles")}</span>
                      <strong>{formatBottleCount(cellarStats.sharedBottles, locale)}</strong>
                      <small>{formatMoney(cellarStats.sharedValue, "CHF", locale)}</small>
                    </span>
                  </button>
                  <button type="button" className={`cellar-kpi-card ${quickWineFilter === "drink_now" ? "active" : ""}`} onClick={() => applyQuickWineFilter("drink_now")}>
                    <i className="cellar-kpi-icon" aria-hidden="true">{dashboardStatSvgIcon("drink_now")}</i>
                    <span className="cellar-kpi-copy">
                      <span>{t("drinkNow")}</span>
                      <strong>{formatBottleCount(cellarStats.drinkNow, locale)}</strong>
                      <small>{t("drinkIn2Years")}: {formatBottleCount(cellarStats.drinkSoon, locale)}</small>
                    </span>
                  </button>
                  <button type="button" className={`cellar-kpi-card ${quickWineFilter === "future_deliveries" ? "active" : ""}`} onClick={() => applyQuickWineFilter("future_deliveries")}>
                    <i className="cellar-kpi-icon" aria-hidden="true">{dashboardStatSvgIcon("future_deliveries")}</i>
                    <span className="cellar-kpi-copy">
                      <span>{t("futureDeliveries")}</span>
                      <strong>{formatBottleCount(cellarStats.futureDeliveries, locale)}</strong>
                      {cellarStats.nextDelivery ? <small>{cellarStats.nextDelivery.wine.name}: {cellarStats.nextDelivery.days} days</small> : null}
                    </span>
                  </button>
                  <button type="button" className={`cellar-kpi-card ${quickWineFilter === "to_collect" ? "active" : ""}`} onClick={() => applyQuickWineFilter("to_collect")}>
                    <i className="cellar-kpi-icon" aria-hidden="true">{dashboardStatSvgIcon("to_collect")}</i>
                    <span className="cellar-kpi-copy">
                      <span>{t("winesToCollect")}</span>
                      <strong>{formatBottleCount(cellarStats.toCollect, locale)}</strong>
                      {winesToCollect[0] ? <small>{winesToCollect[0].name}{winesToCollect[0].merchant ? `: ${winesToCollect[0].merchant}` : ""}</small> : null}
                    </span>
                  </button>
                </div>

                <div className="cellar-stats-body">
                  <div className="cellar-distribution-grid">
                    {valueByType.length ? (
                      <article className="stacked-distribution-card">
                        <div className="stacked-card-heading">
                          <span>{t("distributionByValue")}</span>
                          <strong>{t("valueByType")}</strong>
                        </div>
                        <div className="stacked-progress-bar" aria-label={t("valueByType")}>
                          {valueByType.map((item, index) => {
                            const pct = valueByTypeTotal ? (item.value / valueByTypeTotal) * 100 : 0;
                            return (
                              <button
                                type="button"
                                key={item.label}
                                className="stacked-progress-segment"
                                style={{ flexBasis: `${pct}%`, backgroundColor: breakdownColor(item.label, index, "type") }}
                                title={`${displayValue(item.label, locale, "type")} ${formatPercentage(pct, locale, 1)}`}
                                onClick={() => openBreakdownDrilldown("valueByType", "type", "value", item.label)}
                              />
                            );
                          })}
                        </div>
                        <div className="stacked-legend">
                          {valueByType.map((item, index) => {
                            const pct = valueByTypeTotal ? (item.value / valueByTypeTotal) * 100 : 0;
                            return (
                              <button type="button" key={item.label} onClick={() => openBreakdownDrilldown("valueByType", "type", "value", item.label)}>
                                <i style={{ backgroundColor: breakdownColor(item.label, index, "type") }} />
                                <span>{displayValue(item.label, locale, "type")}</span>
                                <strong>{formatPercentage(pct, locale, 0)}</strong>
                                <small>{formatMoney(item.value, "CHF", locale)}</small>
                              </button>
                            );
                          })}
                        </div>
                      </article>
                    ) : null}
                    {isMobileViewport ? renderBreakdownDrilldown("valueByType") : null}

                    {valueByRegion.length ? (
                      <article className="stacked-distribution-card">
                        <div className="stacked-card-heading">
                          <span>{t("distributionByValue")}</span>
                          <strong>{t("topRegions")}</strong>
                        </div>
                        <div className="stacked-progress-bar" aria-label={t("topRegions")}>
                          {valueByRegion.map((item, index) => {
                            const pct = valueByRegionTotal ? (item.value / valueByRegionTotal) * 100 : 0;
                            return (
                              <button
                                type="button"
                                key={item.label}
                                className="stacked-progress-segment"
                                style={{ flexBasis: `${pct}%`, backgroundColor: breakdownColor(item.label, index, "region") }}
                                title={`${item.label} ${formatPercentage(pct, locale, 1)}`}
                                onClick={() => openBreakdownDrilldown("topRegions", "region", "value", item.label)}
                              />
                            );
                          })}
                        </div>
                        <div className="stacked-legend">
                          {valueByRegion.map((item, index) => {
                            const pct = valueByRegionTotal ? (item.value / valueByRegionTotal) * 100 : 0;
                            return (
                              <button type="button" key={item.label} onClick={() => openBreakdownDrilldown("topRegions", "region", "value", item.label)}>
                                <i style={{ backgroundColor: breakdownColor(item.label, index, "region") }} />
                                <span>{item.label}</span>
                                <strong>{formatPercentage(pct, locale, 0)}</strong>
                                <small>{formatMoney(item.value, "CHF", locale)}</small>
                              </button>
                            );
                          })}
                        </div>
                      </article>
                    ) : null}
                    {isMobileViewport ? renderBreakdownDrilldown("topRegions") : null}
                    {!isMobileViewport ? renderBreakdownDrilldown("valueByType") : null}
                    {!isMobileViewport ? renderBreakdownDrilldown("topRegions") : null}

                    {bottlesByType.length ? (
                      <article className="stacked-distribution-card">
                        <div className="stacked-card-heading">
                          <span>{t("distributionByStock")}</span>
                          <strong>{t("bottlesByType")}</strong>
                        </div>
                        <div className="stacked-progress-bar" aria-label={t("bottlesByType")}>
                          {bottlesByType.map((item, index) => {
                            const pct = bottlesByTypeTotal ? (item.value / bottlesByTypeTotal) * 100 : 0;
                            return (
                              <button
                                type="button"
                                key={item.label}
                                className="stacked-progress-segment"
                                style={{ flexBasis: `${pct}%`, backgroundColor: breakdownColor(item.label, index, "type") }}
                                title={`${displayValue(item.label, locale, "type")} ${formatPercentage(pct, locale, 1)}`}
                                onClick={() => openBreakdownDrilldown("bottlesByType", "type", "bottles", item.label)}
                              />
                            );
                          })}
                        </div>
                        <div className="stacked-legend">
                          {bottlesByType.map((item, index) => {
                            const pct = bottlesByTypeTotal ? (item.value / bottlesByTypeTotal) * 100 : 0;
                            return (
                              <button type="button" key={item.label} onClick={() => openBreakdownDrilldown("bottlesByType", "type", "bottles", item.label)}>
                                <i style={{ backgroundColor: breakdownColor(item.label, index, "type") }} />
                                <span>{displayValue(item.label, locale, "type")}</span>
                                <strong>{formatPercentage(pct, locale, 0)}</strong>
                                <small>{formatBottleCount(item.value, locale)}</small>
                              </button>
                            );
                          })}
                        </div>
                      </article>
                    ) : null}
                    {isMobileViewport ? renderBreakdownDrilldown("bottlesByType") : null}

                    {winesByRegion.length ? (
                      <article className="stacked-distribution-card">
                        <div className="stacked-card-heading">
                          <span>{t("distributionByStock")}</span>
                          <strong>{t("winesByRegion")}</strong>
                        </div>
                        <div className="stacked-progress-bar" aria-label={t("winesByRegion")}>
                          {winesByRegion.map((item, index) => {
                            const pct = winesByRegionTotal ? (item.value / winesByRegionTotal) * 100 : 0;
                            return (
                              <button
                                type="button"
                                key={item.label}
                                className="stacked-progress-segment"
                                style={{ flexBasis: `${pct}%`, backgroundColor: breakdownColor(item.label, index, "region") }}
                                title={`${item.label} ${formatPercentage(pct, locale, 1)}`}
                                onClick={() => openBreakdownDrilldown("winesByRegion", "region", "wines", item.label)}
                              />
                            );
                          })}
                        </div>
                        <div className="stacked-legend">
                          {winesByRegion.map((item, index) => {
                            const pct = winesByRegionTotal ? (item.value / winesByRegionTotal) * 100 : 0;
                            return (
                              <button type="button" key={item.label} onClick={() => openBreakdownDrilldown("winesByRegion", "region", "wines", item.label)}>
                                <i style={{ backgroundColor: breakdownColor(item.label, index, "region") }} />
                                <span>{item.label}</span>
                                <strong>{formatPercentage(pct, locale, 0)}</strong>
                                <small>{formatBottleCount(item.value, locale)}</small>
                              </button>
                            );
                          })}
                        </div>
                      </article>
                    ) : null}
                    {isMobileViewport ? renderBreakdownDrilldown("winesByRegion") : null}
                    {!isMobileViewport ? renderBreakdownDrilldown("bottlesByType") : null}
                    {!isMobileViewport ? renderBreakdownDrilldown("winesByRegion") : null}
                  </div>

                  <aside className="collection-state-card">
                    <div className="collection-state-heading">
                      <span>{t("recommendedActions")}</span>
                      <strong>{t("collectionStatus")}</strong>
                    </div>
                    <div
                      className="collection-gauge"
                      style={{ "--collection-completion": `${cellarDataCompleteness}%` } as CSSProperties}
                      aria-label={`${t("dataCompleteness")} ${formatPercentage(cellarDataCompleteness, locale)}`}
                    >
                      <div>
                        <strong>{formatPercentage(cellarDataCompleteness, locale)}</strong>
                        <span>{t("dataCompleteness")}</span>
                      </div>
                    </div>
                    <div className="collection-health-list">
                      <button type="button" onClick={() => applyQuickWineFilter("missing_data")} className={quickWineFilter === "missing_data" ? "active" : ""}>
                        <span>{t("missingDataToFix")}</span>
                        <strong>{formatBottleCount(cellarMissingDataCount, locale)}</strong>
                      </button>
                      <div>
                        <span>{t("aiReadiness")}</span>
                        <strong>{formatPercentage(cellarAiReadiness, locale)}</strong>
                      </div>
                      <div>
                        <span>{t("completeRecords")}</span>
                        <strong>{formatBottleCount(Math.max(cellarDataCheckCount - cellarMissingDataCount, 0), locale)} / {formatBottleCount(cellarDataCheckCount, locale)}</strong>
                      </div>
                    </div>
                    <div className="collection-action-list">
                      {cellarActionItems.map((item) => (
                        <button type="button" key={item.label} onClick={() => applyQuickWineFilter("missing_data")}>
                          <span>{item.label}</span>
                          <strong>{formatBottleCount(item.count, locale)}</strong>
                        </button>
                      ))}
                    </div>
                    <p>{t("aiReadinessHelp")}</p>
                  </aside>
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
            <details ref={filterPanelRef} className={`filter-panel ${activeView === "cellar" ? "cellar-filter-panel" : ""}`}>
              <summary>{t("search")} / {t("sort")}</summary>
              <label>
                <span>{t("search")}</span>
                <input
                  value={searchQuery}
                  onChange={(event) => setSearchQuery(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") filterPanelRef.current?.removeAttribute("open");
                  }}
                  placeholder={t("searchPlaceholder")}
                />
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
            {activeView === "cellar" && maturityFilter ? (
              <div className="active-maturity-filter">
                <span>{t("maturityFilter")}</span>
                <strong>{wineToneLabel(maturityFilter.tone, locale)} {maturityFilter.year}</strong>
                <button type="button" className="secondary compact" onClick={clearMaturityHeatmapFilter}>
                  {t("clearMaturityFilter")}
                </button>
              </div>
            ) : null}
            {isWineCollectionView && !(activeView === "history" && historySection === "tastings") && compareWineIds.length ? (
              <div className="compare-summary-bar">
                <div>
                  <strong>{t("compareSelection")}</strong>
                  <span>{compareWineIds.length}/2 {t("compareSelected").toLowerCase()}</span>
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
            {!loading && activeView === "cellar" && filteredWines.length === 0 ? <EmptyState title={t("noWineMatch")} icon="cellar" /> : null}
            {!loading && activeView === "history" && historySection === "wines" && filteredWines.length === 0 ? <EmptyState title={t("noHistoryMatch")} icon="calendar" /> : null}
            {!loading && !tastingArchiveLoading && activeView === "history" && historySection === "tastings" && visibleTastingEntries.length === 0 ? <EmptyState title={t("noTastingArchiveMatch")} icon="glass-sparkle" /> : null}
            {!loading && activeView === "wishlist" && filteredWishlist.length === 0 ? <EmptyState title={t("noWishlistMatch")} icon="wishlist" /> : null}
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
                <Suspense fallback={<LoadingState label={t("loadingData")} />}>
                  <TastingArchiveSection
                    canWrite={canWriteWine}
                    displayValue={displayValue}
                    entries={visibleTastingEntries}
                    saving={saving}
                    t={t}
                    locale={locale}
                    onOpenWine={openWineFromTastingArchive}
                    onUpdateEntry={updateWineTastingEntry}
                    onDeleteEntry={deleteWineTastingEntry}
                    wineTone={wineTone}
                  />
                </Suspense>
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
                    {maturityFilter && isWineAtMaturityPeak(wine, maturityFilter.year) ? (
                      <div className="row-meta-stack">
                        <div className="row-meta-group row-meta-group-secondary">
                          <span className="row-chip row-maturity-chip">{t("peakYear")} {maturityFilter.year}</span>
                        </div>
                      </div>
                    ) : null}
                  </div>
                  <DrinkWindowMini wine={wine} />
                  <div className="row-price-block" aria-label={`${t("currentPrice")}, ${t("positionTotal")}`}>
                    <div>
                      <span>{t("currentPrice")}</span>
                      <strong>{formatMoney(wine.current_value || wine.price, wine.currency, locale)}</strong>
                    </div>
                    <div>
                      <span>{t("positionTotal")}</span>
                      <strong>{formatMoney(wineUnitValue(wine) * Math.max(Number(wine.quantity || 0), 0), wine.currency, locale)}</strong>
                    </div>
                  </div>
                  <div className="row-actions">
                    <button type="button" className={compareWineIds.includes(wine.id) ? "" : "secondary"} onClick={(event) => { event.stopPropagation(); toggleCompareWine(wine); }}>
                      <span className="action-icon" aria-hidden="true">{appActionSvgIcon("compare")}</span>
                      <span className="action-label">{t("compare")}</span>
                    </button>
                    <button type="button" className="secondary" disabled={!canWriteWine} onClick={(event) => { event.stopPropagation(); startEditWine(wine); }}>
                      <span className="action-icon" aria-hidden="true">{appActionSvgIcon("edit")}</span>
                      <span className="action-label">{t("edit")}</span>
                    </button>
                  </div>
                </article>
                {selectedWineId === wine.id && !wineFormOpen ? (
                  <div className="mobile-inline-detail" role="dialog" aria-modal="true" aria-label={wine.name} onClick={() => setSelectedWineId(null)}>
                    <div className="mobile-detail-sheet" onClick={(event) => event.stopPropagation()}>
                      <div className="mobile-detail-sheet-head">
                        <div>
                          <strong>{wine.name}</strong>
                          <span>{[wine.producer, wine.vintage].filter(Boolean).join(" - ")}</span>
                        </div>
                        <button type="button" className="mobile-detail-close-button" aria-label={t("close")} title={t("close")} onClick={() => setSelectedWineId(null)}>
                          ×
                        </button>
                      </div>
                      <WineDetail
                        wine={wine}
                        session={session}
                        auditEntries={aiAudit.filter((entry) => entry.entity_type === "wine" && entry.entity_id === wine.id)}
                        canGenerate={canGenerateAi}
                        canWrite={canWriteWine}
                        saving={saving}
                        generating={generatingAi}
                        onGenerate={(feature) => generateWineAi(wine, feature)}
                        onToggleScoresAiExclusion={(excluded) => setWineScoresAiExclusion(wine, excluded)}
                        onConsume={(payload) => consumeWineBottle(wine, payload)}
                        onUpdateTastingEntry={updateWineTastingEntry}
                        onDeleteTastingEntry={deleteWineTastingEntry}
                        marketAuditEntry={aiAudit.find((entry) => entry.entity_type === "wine" && entry.entity_id === wine.id && entry.feature === "ai_value") || null}
                        onOpenMarketView={(entry) => setMarketViewContext({ kind: "wine", wine, entry })}
                        coOwnershipSection={renderCoOwnershipSection(wine)}
                        t={t}
                        locale={locale}
                      />
                    </div>
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
                  <div className="mobile-inline-detail" role="dialog" aria-modal="true" aria-label={item.name} onClick={() => setSelectedWishlistId(null)}>
                    <div className="mobile-detail-sheet" onClick={(event) => event.stopPropagation()}>
                      <div className="mobile-detail-sheet-head">
                        <div>
                          <strong>{item.name}</strong>
                          <span>{[item.producer, item.vintage].filter(Boolean).join(" - ")}</span>
                        </div>
                        <button type="button" className="mobile-detail-close-button" aria-label={t("close")} title={t("close")} onClick={() => setSelectedWishlistId(null)}>
                          ×
                        </button>
                      </div>
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
                <form className="settings-card settings-card-wide settings-ai-card" onSubmit={submitAiSettings}>
                  <div className="settings-card-heading">
                    <div>
                      <span>{t("aiSettings")}</span>
                      <h3>{t("aiSettingsTitle")}</h3>
                    </div>
                    <div className="heading-actions">
                      <strong className={(aiSettings?.has_openai_api_key || aiSettings?.can_use_app_credits) ? "status-pill configured" : "status-pill"}>
                        {aiStatusLabel}
                      </strong>
                      <button
                        type="button"
                        className="help-icon-button"
                        aria-expanded={aiSettingsHelpOpen}
                        aria-controls="ai-settings-help-panel"
                        aria-label={t("aiSettingsHelpTitle")}
                        onClick={() => setAiSettingsHelpOpen((current) => !current)}
                      >
                        ?
                      </button>
                    </div>
                  </div>
                  <div className="ai-settings-sections">
                    <section className="ai-settings-section">
                      <div className="ai-settings-section-heading">
                        <div>
                          <span>{t("aiConnection")}</span>
                          <strong>{t("aiConnectionTitle")}</strong>
                          <small>{t("aiConnectionHelp")}</small>
                        </div>
                      </div>
                      <div className="ai-settings-connection-grid">
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
                      </div>
                      {aiSettingsHelpOpen ? (
                        <div className="settings-help-panel ai-settings-help" id="ai-settings-help-panel">
                          <strong>{t("aiSettingsHelpTitle")}</strong>
                          <p>{t("aiSettingsHelpKey")}</p>
                          <ul>
                            <li>{t("aiSettingsHelpSecurity")}</li>
                            <li>{t("aiSettingsHelpCredits")}</li>
                            <li>{t("aiSettingsHelpFeatures")}</li>
                          </ul>
                        </div>
                      ) : null}
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
                    </section>

                    <section className="ai-settings-section">
                      <div className="ai-settings-section-heading">
                        <div>
                          <span>{t("pairing")}</span>
                          <strong>{t("aiPairingTitle")}</strong>
                          <small>{t("aiPairingHelp")}</small>
                        </div>
                      </div>
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
                      <label className="ai-pairing-limit">
                        <span>{t("pairingCandidateLimit")}</span>
                        <input
                          type="number"
                          min="5"
                          max="50"
                          step="1"
                          value={aiSettingsDraft.pairing_candidate_limit}
                          onChange={(event) => setAiSettingsDraft({ ...aiSettingsDraft, pairing_candidate_limit: Math.min(50, Math.max(5, Number(event.target.value) || 5)) })}
                        />
                        <small>{t("pairingCandidateLimitHelp")}</small>
                      </label>
                    </section>

                    <section className="ai-settings-section ai-models-section">
                      <div className="ai-settings-section-heading">
                        <div>
                          <span>{t("models")}</span>
                          <strong>{t("aiModelsTitle")}</strong>
                          <small>{t("aiModelsSectionHelp")}</small>
                        </div>
                        <button
                          type="button"
                          className="help-icon-button"
                          aria-expanded={aiModelsHelpOpen}
                          aria-controls="ai-models-help-panel"
                          aria-label={t("aiModelsHelpLabel")}
                          onClick={() => setAiModelsHelpOpen((current) => !current)}
                        >
                          ?
                        </button>
                      </div>
                      {aiModelsHelpOpen ? (
                        <div className="settings-help-panel ai-settings-help" id="ai-models-help-panel">
                          <strong>{t("aiModelsHelpTitle")}</strong>
                          <p>{t("aiModelsHelpIntro")}</p>
                          <ul>
                            {gpt56ModelsEnabled ? (
                              <>
                                <li>{t("aiModelsHelpLuna")}</li>
                                <li>{t("aiModelsHelpTerra")}</li>
                                <li>{t("aiModelsHelpSol")}</li>
                              </>
                            ) : (
                              <>
                                <li>{t("aiModelsHelpNano")}</li>
                                <li>{t("aiModelsHelpMini")}</li>
                                <li>{t("aiModelsHelpStandard")}</li>
                                <li>{t("aiModelsHelpPremium")}</li>
                              </>
                            )}
                          </ul>
                          <p className="ai-models-help-note">{t("aiModelsHelpUsageNote")}</p>
                        </div>
                      ) : null}
                      <label className="ai-model-advisor-setting">
                        <input
                          type="checkbox"
                          checked={aiSettingsDraft.model_advisor_enabled}
                          onChange={(event) => setAiSettingsDraft({ ...aiSettingsDraft, model_advisor_enabled: event.target.checked })}
                        />
                        <span>
                          <strong>{t("aiModelAdvisor")}</strong>
                          <small>{t("aiModelAdvisorHelp")}</small>
                        </span>
                      </label>
                      <div className="ai-model-group">
                        <strong>{t("aiModelsDataTitle")}</strong>
                        <small>{t("aiModelsDataHelp")}</small>
                        <div className="settings-model-grid">
                    <label>
                      <span>{t("aiNotes")}</span>
                      <select value={aiSettingsDraft.ai_notes_model} onChange={(event) => setAiSettingsDraft({ ...aiSettingsDraft, ai_notes_model: event.target.value })}>
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
                      <span>{t("scores")}</span>
                      <select value={aiSettingsDraft.score_model} onChange={(event) => setAiSettingsDraft({ ...aiSettingsDraft, score_model: event.target.value })}>
                        {(aiSettings?.model_options || []).map((model) => <option key={model} value={model}>{model}</option>)}
                      </select>
                    </label>
                        </div>
                      </div>
                      <div className="ai-model-group">
                        <strong>{t("aiModelsPlanningTitle")}</strong>
                        <small>{t("aiModelsPlanningHelp")}</small>
                        <div className="settings-model-grid">
                    <label>
                      <span>{t("drinkWindow")}</span>
                      <select value={aiSettingsDraft.drink_window_model} onChange={(event) => setAiSettingsDraft({ ...aiSettingsDraft, drink_window_model: event.target.value })}>
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
                      </div>
                    </section>
                  </div>
                  <button type="submit" disabled={saving}>{saving ? t("saving") : t("saveSettings")}</button>
                </form>
              ) : null}

              {settingsTab === "ai" && canWriteWine ? (
                <section className="settings-card settings-ai-card">
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
                <section className="settings-card settings-card-wide settings-admin-card">
                  <details className="collapsible-panel settings-admin-panel">
                    <summary className="settings-admin-summary">
                      <span>{t("redeemCodes")}</span>
                      <span className="settings-admin-summary-meta">
                        <span className="status-pill configured">{activeRedeemCodesCount} active</span>
                        <span className="status-pill">{redeemCodes.length} total</span>
                      </span>
                    </summary>
                    <div className="settings-card-heading">
                      <div>
                        <span>{t("billing")}</span>
                        <h3>{t("redeemCodes")}</h3>
                      </div>
                      <button type="button" className="secondary compact" disabled={saving} onClick={() => loadBilling(true, true).catch((nextError) => setError(nextError instanceof Error ? nextError.message : "Unable to load billing"))}>
                        {t("loadingData")}
                      </button>
                    </div>
                    <details className="settings-admin-subpanel" open={Boolean(generatedRedeemCode)}>
                      <summary>{t("redeemCodeCreatePanel")}</summary>
                      <form className="inline-form redeem-admin-form" onSubmit={createRedeemCode}>
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
                    </details>
                    <div className="settings-admin-subheading">
                      <strong>{t("redeemCodeListPanel")}</strong>
                      <span>{redeemCodes.length ? `${activeRedeemCodesCount}/${redeemCodes.length} active` : t("noActionItems")}</span>
                    </div>
                    {redeemCodes.length ? (
                      <div className="member-list settings-admin-list">
                        {redeemCodes.map((code) => (
                          <details className="settings-admin-row settings-admin-detail-row redeem-admin-card" key={code.id}>
                            <summary className="settings-admin-row-summary">
                              <div>
                                <strong>{code.label || code.code_prefix}</strong>
                                <span>{code.code || code.code_prefix}</span>
                              </div>
                              <div className="settings-admin-summary-meta">
                                <span className={code.is_active ? "status-pill configured" : "status-pill"}>{code.is_active ? "active" : "inactive"}</span>
                                <span className="status-pill">{code.duration_days}d</span>
                                <span className="status-pill">{code.redeemed_count}/{code.max_redemptions} {t("redeemed")}</span>
                              </div>
                            </summary>
                            <div className="settings-admin-row-body">
                              <div className="settings-admin-row-info">
                                {code.email ? <span>{code.email}</span> : null}
                                {code.expires_at ? <span>{t("expires")}: {formatDisplayDate(code.expires_at)}</span> : null}
                              </div>
                              <div className="member-actions settings-admin-actions">
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
                              </div>
                            </div>
                          </details>
                        ))}
                      </div>
                    ) : (
                      <p className="empty-state">{t("noActionItems")}</p>
                    )}
                  </details>
                </section>
              ) : null}

              {settingsTab === "users" && canAppAdmin ? (
                <section className="settings-card settings-card-wide settings-admin-card">
                  <details className="collapsible-panel settings-admin-panel" open={pendingUsers.length > 0}>
                    <summary className="settings-admin-summary">
                      <span>{t("settingsUsers")}</span>
                      <span className="settings-admin-summary-meta">
                        <span className="status-pill">{pendingUsers.length} {t("pendingApprovals")}</span>
                        <span className="status-pill configured">{approvedUsersCount} {t("approvedUsers")}</span>
                      </span>
                    </summary>
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
                    {adminUsersSorted.length ? (
                      <div className="member-list settings-admin-list">
                        {adminUsersSorted.map((user) => (
                          <details className="settings-admin-row settings-admin-detail-row user-admin-card" key={user.id} open={!user.is_approved}>
                            <summary className="settings-admin-row-summary">
                              <div>
                                <strong>{user.display_name}</strong>
                                <span>{user.email}</span>
                              </div>
                              <div className="settings-admin-summary-meta">
                                <span className={user.is_approved ? "status-pill configured" : "status-pill"}>{user.is_approved ? "approved" : "pending"}</span>
                                {user.is_blocked ? <span className="status-pill">{t("blocked")}</span> : null}
                                {user.is_app_admin ? <span className="status-pill">App admin</span> : null}
                                {user.can_use_label_recognition ? <span className="status-pill">{t("labelRecognitionEnabled")}</span> : null}
                                <span className="status-pill">{formatAiBudget(user.ai_credit_balance_usd || 0)}</span>
                                {user.entitlement_days_remaining !== null ? <span className="status-pill">{user.entitlement_days_remaining} {t("daysRemaining")}</span> : null}
                              </div>
                            </summary>
                            <div className="settings-admin-row-body">
                              <div className="settings-admin-row-info">
                                {!user.is_approved ? <span>{t("pendingApproval")}</span> : null}
                                <span>{t("aiCreditBalance")}: {formatAiBudget(user.ai_credit_balance_usd || 0)}</span>
                                {user.entitlement_days_remaining !== null ? <span>{user.entitlement_days_remaining} {t("daysRemaining")}</span> : null}
                              </div>
                              <div className="member-actions settings-admin-actions">
                                <button type="button" className="secondary compact" disabled={saving} onClick={() => loadSingleAppUserStats(user).catch((nextError) => setError(nextError instanceof Error ? nextError.message : "Unable to load user stats"))}>
                                  User stats
                                </button>
                                {!user.is_approved ? (
                                  <button type="button" className="compact" disabled={saving} onClick={() => approveUser(user)}>
                                    {t("accept")}
                                  </button>
                                ) : null}
                              </div>
                              <details className="user-admin-detail">
                                <summary>AI credit</summary>
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
                              </details>
                              <details className="user-admin-actions-detail">
                                <summary>More</summary>
                                <div className="user-admin-actions-menu">
                                  {!user.is_approved ? (
                                    <button type="button" className="danger compact" disabled={saving} onClick={() => rejectUser(user)}>
                                      {t("decline")}
                                    </button>
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
                              </details>
                            </div>
                          </details>
                        ))}
                      </div>
                    ) : (
                      <p className="empty-state">{t("noActionItems")}</p>
                    )}
                  </details>
                </section>
              ) : null}

              {settingsTab === "users" && canAppAdmin ? (
                <section className="settings-card settings-card-wide settings-admin-card">
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
                      <ButtonBusyContent busy={saving && Boolean(importPayload)} idleLabel={t("importRun")} busyLabel={t("loadingData")} icon={appActionSvgIcon("import")} />
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
                      <span className="action-icon" aria-hidden="true">{appActionSvgIcon("export")}</span>
                      <span className="action-label">{t("exportJson")}</span>
                    </button>
                  </div>
                  <div className="error-banner">
                    <strong>{t("emptyCellar")}</strong>
                    <span>{t("emptyCellarWarning")}</span>
                    <button type="button" className="danger compact" disabled={saving} onClick={emptyCellar}>
                      <span className="action-icon" aria-hidden="true">{appActionSvgIcon("delete")}</span>
                      <span className="action-label">{t("emptyCellar")}</span>
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
                          <span>{entry.model} · {t("reasoningEffort")}: {t(reasoningEffortTranslationKey(entry.reasoning_effort))} - {formatDisplayDate(entry.created_at)} - {entry.total_tokens.toLocaleString()} {t("tokens")} - {formatUsd(entry.estimated_cost_usd)}</span>
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
      {aiModelAdvice ? (
        <div className="auth-modal-overlay ai-model-advisor-overlay" onClick={() => closeAiModelAdvice(null)}>
          <section className="auth-modal-card ai-model-advisor-modal" role="dialog" aria-modal="true" aria-labelledby="ai-model-advisor-title" onClick={(event) => event.stopPropagation()}>
            <div className="auth-modal-head">
              <div>
                <span>{t("aiModelAdvisor")}</span>
                <h2 id="ai-model-advisor-title">{t("aiModelAdvisorTitle")}</h2>
              </div>
              <button type="button" className="secondary compact" onClick={() => closeAiModelAdvice(null)}>{t("cancel")}</button>
            </div>
            <p className="ai-model-advisor-intro">{t("aiModelAdvisorIntro")} <strong>{aiModelAdvice.featureLabel}</strong></p>
            <div className="ai-model-advisor-comparison">
              <button
                type="button"
                className={aiModelAdvice.selectedModel === aiModelAdvice.currentModel ? "selected" : ""}
                aria-pressed={aiModelAdvice.selectedModel === aiModelAdvice.currentModel}
                onClick={() => setAiModelAdvice((current) => current ? { ...current, selectedModel: current.currentModel } : current)}
              >
                <span>{t("aiModelCurrent")}</span>
                <strong>{aiModelAdvice.currentModel}</strong>
              </button>
              <button
                type="button"
                className={`recommended${aiModelAdvice.selectedModel === aiModelAdvice.recommendedModel ? " selected" : ""}`}
                aria-pressed={aiModelAdvice.selectedModel === aiModelAdvice.recommendedModel}
                onClick={() => setAiModelAdvice((current) => current ? { ...current, selectedModel: current.recommendedModel } : current)}
              >
                <span>{t("aiModelRecommended")}</span>
                <strong>{aiModelAdvice.recommendedModel}</strong>
              </button>
            </div>
            <p className="ai-model-advisor-reason">
              {t(aiModelAdvice.role === "economy" ? "aiModelAdvisorReasonEconomy" : aiModelAdvice.role === "balanced" ? "aiModelAdvisorReasonBalanced" : "aiModelAdvisorReasonAdvanced")}
            </p>
            <small className="ai-model-advisor-note">{t("aiModelAdvisorOneRequest")}</small>
            <div className="ai-model-advisor-actions">
              <button type="button" onClick={() => closeAiModelAdvice(aiModelAdvice.selectedModel)}>{t("continue")}</button>
            </div>
          </section>
        </div>
      ) : null}
      {loading ? <GlobalLoadingOverlay label={t("loadingData")} /> : null}
      {aiOverlayRenderMode ? <AiGenerationOverlay mode={aiOverlayVisible ? aiOverlayRenderMode : ""} t={t} locale={locale} progress={aiOverlayProgress} /> : null}
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
      {userStatsModalOpen ? (
        <UserStatsModal
          stats={selectedAppUserStats}
          loading={userStatsLoading}
          title={userStatsModalTitle}
          onClose={() => {
            setUserStatsModalOpen(false);
            setUserStatsLoading(false);
            setSelectedAppUserStats(null);
            setUserStatsModalTitle("");
          }}
        />
      ) : null}
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
