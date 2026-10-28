import { CellarEmptyImage } from "./components/CellarEmptyImage";
import { tastingRequest } from "./domain/tasting";
import { CSSProperties, ChangeEvent, ComponentProps, FormEvent, KeyboardEvent as ReactKeyboardEvent, MouseEvent, Suspense, UIEvent, lazy, useCallback, useEffect, useId, useRef, useState } from "react";
import { createPortal, flushSync } from "react-dom";
import { AppIcon, AppIconName } from "./components/AppIcon";
import PremiumMemoriesNotice from "./components/PremiumMemoriesNotice";
import LocalizedDateInput from "./components/LocalizedDateInput";
import type { AmbassadorChange } from "./components/AdminAmbassadorEditor";
import { KeyPositionBottleVisual, KeyPositionCircularKpi, KeyPositionTrendKpi } from "./components/KeyPositionCardParts";
import "./components/BottlePhotoCapture.css";
import { AiActivity } from "./components/AiActivity";
import { WishlistVintageField, WineStatusBadge, StarRating, notificationBellIcon, settingsGearIcon, logoutIcon, LoadingState, EmptyState, GlobalLoadingOverlay, wineProgressName, AiGenerationOverlay, AiPackUpgradeNotice, ButtonBusyContent, RatingInput } from "./components/AppUi";
import { DrinkWindowMini, auditMarketSources, auditWishlistPortfolioStrategySource, auditWishlistPortfolioStrategy, CompareWinesModal, MarketValueModal, UserStatsModal, ownershipRows, hasSharedOwnership, tastingArchiveSearchText, tastingArchiveItemToWine, WineDetail, WishlistDetail, WishlistPortfolioStrategyPanel, ContactSupportPanel, DashboardCarousel, TasteHearts } from "./components/AppPanels";
import { appActionSvgIcon, wishlistActionSvgIcon } from "./components/actionIcons";
import { formatDisplayDate, formatAiBudget, formatMoney, readableLegacyAiText, wineTone, wineTypeForTone, grapesSvgIcon } from "./components/panelSupport";
import type { Session, Wine, WinePhotoSuggestion, ConsumeWineDraft, CatalogWine, WineLabelEnrichment, WineDraft, WineTone, UserTag, Passkey, ImportMode, ImportPreview, ImportResult, WineShareOffer, WineShareOfferRecipient, CoOwnershipAgreement, TastingArchivePage, WishlistItem, WishlistList, WishlistDraft, HouseholdMembership, Member, InviteDraft, PendingUser, AppUser, UserAdminStats, RedeemCode, UserNotification, NotificationCenterCategory, NotificationCenterItem, NotificationCenterResponse, OperationalActionSnoozeRecord, OperationalActionSnoozes, BillingStatus, PaymentPlan, CheckoutSession, BillingPortalSession, RedeemCodeDraft, Invite, AiAuditLog, MarketViewContext, AiUsage, AiSettings, AiSettingsDraft, PairingResult, RestaurantWineListScanResult, RestaurantWineListQuestionPayload, RestaurantWineListQuestionResult, WineShelfScanResult, BuyingAdviceResult, WineCompareAiResult, WishlistPortfolioStrategy, RegionalGapProfile, RegionalGapAiSuggestion, RegionalGapSettings, AuthDraft, ContactSupportDraft, ExportSelection, ImportSelection, SortMode, Locale, AiOverlayProgress, DashboardFocus, PrimaryDashboardFocus, SettingsTab, ViewName, HistorySection, QuickWineFilter, MaturityFilter, RegionalGapTarget, RegionalGapTargetDraft, OperationalActionItem, WineAiFeature, ThemePreference, TastingArchiveEntry, TastingReflectionResult, BreakdownMetric, WineCollectionFilters, OperationalMetricsOverview, UserActivityLogEntry, WineSalesHistory, CellarCommandPurchaseDraft, WineStrategyPurpose } from "./types";
import { displayValue, reasoningEffortTranslationKey, translate } from "./i18n";
import type { TranslationKey } from "./i18n";
import type { WineImageRecognitionCandidate, WineImageRecognitionConfirmationResult, WineImageRecognitionResult } from "./types";
import type { WineSaleDraft } from "./types";
import { canonicalWineTypes, normalizeWineType } from "./domain/wineTypes";
import { initializeTabletLayout, isTabletDevice, saveTabletLayout } from "./domain/tabletLayout";
import { localizedNotification } from "./domain/notifications";
import { uniqueSorted, numberLocale, wineGroupValue, isWishlistReadyToBuy, wineUnitValue, hasVintageForDrinkWindow, isFutureDeliveryWine, isMissedDeliveryWine, isToCollectWine, sumWineValue, currentUserSharePct, ownedBottleCount, wineQuantityLabel, ownershipStats, topWineValueGroups, topWineBottleGroups, topWineCountGroups, topProducerGroups, formatBottleCount, formatPercentage, maturityBuckets, isWineAtMaturityPeak, isWineInExplicitIdealWindow, daysUntil, needsValueRefresh, wineSearchText, matchesWineCollectionFilters, compareWines, wishlistSearchText, isWineReadyToPrioritize, isWinePhysicallyInCellar, isWineWindowToMonitor, isWineIdealSoon, wineIdealWindowStart, winePriorityDrinkEnd } from "./domain/cellar";
import { api, extractApiErrorText, formatUserErrorMessage, isConnectivityError } from "./services/api";
import { runWineShelfScan } from "./services/wineShelfScan";
import type { BatchAiItem, BatchAiRun } from "./components/BatchAiReport";
import type { SommelierDestination } from "./views/SommelierHubView";
import type { FeatureId } from "./components/FeatureSuggestions";
import { primeSpeech, setFrenchNames } from "./utils/speech";
import { isFrenchWine } from "./utils/pronunciation";
import { rawObject, rawArray, rawString, tastingEnjoymentValue, offlineWine, offlineWishlistItem } from "./services/offlineBackup";
import { prepareCreationOptions, prepareRequestOptions, credentialToJson } from "./services/passkeys";
import { wineToDraft, draftPayload, wishlistToDraft, wishlistPayload } from "./domain/drafts";
import { tokenFromUrl, stripeCheckoutResultFromUrl, emailVerificationResultFromUrl, emailVerificationTokenFromUrl, passwordResetTokenFromUrl, coOwnershipTokenFromUrl, STRIPE_CHECKOUT_PLAN_KEY, STRIPE_CHECKOUT_BALANCE_KEY, inviteLink } from "./utils/location";
import { CellarStorageManager, WineLocationPicker, WineStrategySection } from "./components/StoragePanels";
import type { HelpRole } from "./help/types";
import { HelpContext } from "./help/HelpContext";
import type { PreparedBottlePhoto } from "./components/BottlePhotoCapture";
import type { WishlistLiveTasteScan } from "./components/WishlistLiveTasteScanner";
import { useChartReveal } from "./components/chartMotion";
import { PortfolioValueSparkline, dashboardStatSvgIcon } from "./components/dashboardGraphics";
import { CollectorReadyWines } from "./components/CollectorReadyWines";
import { CollectorCardGroup } from "./components/CollectorCardGroup";
import { CollectorAtlas } from "./components/CollectorAtlas";
import { CollectorDashboard } from "./components/CollectorDashboard";
import { CollectorQuadrante } from "./components/CollectorQuadrante";
import { CellarHomeHero, CellarHomeStats, type CellarHomeHeroStat } from "./components/CellarHomeHero";
import { CellarShowcase } from "./components/CellarShowcase";
import { appUserRoleLabel } from "./domain/appUsers";
import { CellarHomeBackdrop, resetHomeBackdropSession, sessionBackdropSrc } from "./components/CellarHomeBackdrop";
import { RiservaBanner } from "./components/RiservaBanner";
import { featuredExplanation, featuredHighlight } from "./components/FeaturedWineDetails";
import type { PersonalDashboardWidget } from "./types";
import { featuredValue } from "./domain/featuredValue";
import { selectFeaturedWines } from "./domain/featuredSelection";
import { CollectorOverview } from "./components/CollectorOverview";
import { LEGAL_DOCUMENT_VERSION } from "./legal/legalDocuments";
import { reportGoogleAdsCheckoutConversion } from "./services/googleAds";
import "./styles.css";
import "./components/CollectorOverview.css";
import "./components/CollectorEditorial.css";
import "./components/DashboardEditorial.css";
import "./components/CellarHome.css";
import "./components/CellarCompactHeader.css";
import "./components/CellarHeaderTheme.css";
import "./components/CellarDesktopNavigation.css";
import "./components/WineDetailRefined.css";
import "./components/HomeRefined.css";
import "./components/LabelsRefined.css";
import "./components/ButtonsRefined.css";
import "./components/CellarRefined.css";
import "./components/MotionRefined.css";
import "./components/TypographyRefined.css";
import "./components/SurfacesRefined.css";
import { installPointerLight } from "./components/pointerLight";
import { CollectorMaturity } from "./components/CollectorMaturity";

/** Whether the active theme's surface is dark; drives `data-theme-tone` for CSS and the wine tint. */
function surfaceIsDark() {
  const surface = getComputedStyle(document.documentElement).getPropertyValue("--surface").trim();
  const match = /^#([0-9a-f]{6})$/i.exec(surface);
  if (!match) return false;
  const value = parseInt(match[1], 16);
  return (0.2126 * ((value >> 16) & 255) + 0.7152 * ((value >> 8) & 255) + 0.0722 * (value & 255)) / 255 < 0.5;
}

installPointerLight();

/** A short pulse when stock really changed; silent where unsupported. */
function stockChangedHaptic() {
  if (typeof navigator !== "undefined" && typeof navigator.vibrate === "function") navigator.vibrate(8);
}

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

/** The audit entry with the market sources, as the single-wine report opens it. */
function batchValueEntry(item: BatchAiItem) {
  return item.entries.find((entry) => ["ai_value", "wine_full_enrichment", "shared_value", "shared_full_enrichment"].includes(entry.feature) && (entry.sources || []).some((source) => source?.kind === "market_source"));
}

function hasUsefulBatchAiResult(feature: WineAiFeature, wine: Wine) {
  if (feature === "value") return wine.current_value !== null && !wine.value_not_found;
  if (feature === "grapes") return wine.grapes.length > 0 && !wine.grapes_not_applicable;
  if (feature === "drink-window") return Boolean(wine.drink_from && wine.drink_to);
  if (feature === "scores") return wine.scores.length > 0;
  if (feature === "notes") return Boolean(wine.ai_notes.trim());
  return Boolean(wine.current_value && wine.drink_from && wine.drink_to && wine.grapes.length);
}

function advisedModel(role: AiModelAdviceRole, modelOptions: string[], currentModel: string) {
  const roleHints: Record<AiModelAdviceRole, string[]> = {
    economy: ["luna", "5.4-mini", "5.4-nano"],
    balanced: ["gpt-6.1-sol", "terra", "gpt-5.4"],
    advanced: ["astra", "sol", "gpt-5.5"],
  };
  return roleHints[role]
    .map((hint) => modelOptions.find((model) => hint.startsWith("gpt-") ? model.toLowerCase() === hint : model.toLowerCase().includes(hint)))
    .find(Boolean) || currentModel;
}

// "Il quadrante" collector home is on trial; add ?classic to the URL for the previous layout.
const CollectorHome = typeof window !== "undefined" && new URLSearchParams(window.location.search).has("classic") ? CollectorDashboard : CollectorQuadrante;
const PairingView = lazy(() => import("./views/PairingView"));
const AdminUsersWorkspace = lazy(() => import("./components/AdminUsersWorkspace"));
const WishlistOverview = lazy(() => import("./components/WishlistOverview"));
const WineLotsSection = lazy(() => import("./components/WineLotsSection"));
const AiSettingsTab = lazy(() => import("./views/settings/AiSettingsTab"));
const ValueDashboard = lazy(() => import("./views/home/ValueDashboard"));
const DashboardHero = lazy(() => import("./views/home/DashboardHero"));
const DailySommelierBubble = lazy(() => import("./views/home/DailySommelierBubble"));
const ProfileSettingsTab = lazy(() => import("./views/settings/ProfileSettingsTab"));
const SharingSettingsTab = lazy(() => import("./views/settings/SharingSettingsTab"));
const DataSettingsTab = lazy(() => import("./views/settings/DataSettingsTab"));
const AdminCatalogPanel = lazy(() => import("./views/settings/AdminCatalogPanel"));
const PersonalOnboarding = lazy(() => import("./components/PersonalOnboarding"));
const WinePulseView = lazy(() => import("./views/WinePulseView"));
const WinePulsePreview = lazy(() => import("./views/WinePulseView").then(module => ({ default: module.WinePulsePreview })));
const CellarAssistantView = lazy(() => import("./views/CellarAssistantView"));
const RecordTastingDialog = lazy(() => import("./components/RecordTastingDialog"));
const PurchaseImportDialog = lazy(() => import("./components/PurchaseImportDialog"));
const BottlePhotoImport = lazy(() => import("./components/BottlePhotoImport"));
const AddWineChooser = lazy(() => import("./components/AddWineChooser"));
const AppNewsPanel = lazy(() => import("./components/AppNewsPanel"));
const BatchAiReport = lazy(() => import("./components/BatchAiReport"));
const SommelierHubView = lazy(() => import("./views/SommelierHubView"));
const FeatureSuggestions = lazy(() => import("./components/FeatureSuggestions"));
const WishlistLiveTasteScanner = lazy(() => import("./components/WishlistLiveTasteScanner"));
const CellarIntelligenceView = lazy(() => import("./views/CellarIntelligenceView"));
const AI_PACK_ENHANCEMENT_DISMISS_KEY = "vinaris.ai-pack-enhancement-dismissed-until";
const AI_PACK_ENHANCEMENT_REMINDER_MS = 7 * 24 * 60 * 60 * 1000;
const PublicLanding = lazy(() => import("./views/PublicLanding"));
const QuickTastingRating = lazy(() => import("./components/QuickTastingRating"));
const DailyDrinkBoard = lazy(() => import("./components/DailyDrinkBoard"));
const DataQualityBoard = lazy(() => import("./components/DataQualityBoard"));
const DeliveryTimelineCard = lazy(() => import("./components/DeliveryTimelineCard"));
const MaturityPanorama = lazy(() => import("./components/MaturityPanorama").then((module) => ({ default: module.MaturityPanorama })));
const BottlePhotoCapture = lazy(() => import("./components/BottlePhotoCapture"));
const BuyingAdviceView = lazy(() => import("./views/BuyingAdviceView"));
const MemoryBookButton = lazy(() => import("./views/MemoryBookButton"));
const MemoryBook = lazy(() => import("./views/MemoryBook"));
const HomeAssistantAsk = lazy(() => import("./components/HomeAssistantAsk"));
const MemoriesWidget = lazy(() => import("./components/MemoriesWidget"));
const PolaroidsWidget = lazy(() => import("./components/PolaroidsWidget"));
const TastingArchiveSection = lazy(() => import("./views/TastingArchiveSection"));
const WineGeographyMap = lazy(() => import("./views/WineGeographyMap"));
const PersonalDashboard = lazy(() => import("./components/PersonalDashboard").then(module => ({ default: module.PersonalDashboard })));
const DashboardSummaryWidget = lazy(() => import("./components/DashboardSummaryWidget"));
const HelpView = lazy(() => import("./views/HelpView"));
const TimeSeriesChart = lazy(() => import("./components/TimeSeriesChart"));
const OperationsPanel = lazy(() => import("./components/OperationsPanel").then((module) => ({ default: module.OperationsPanel })));
const RestaurantDashboard = lazy(() => import("./views/RestaurantDashboard"));
const AdminPhotosPanel = lazy(() => import("./components/AdminPhotosPanel").then((module) => ({ default: module.AdminPhotosPanel })));
const TasteProfilePanel = lazy(() => import("./components/TasteProfilePanel"));
const AdminSensoryProfilesPanel = lazy(() => import("./components/AdminSensoryProfilesPanel"));
const AdminAnnouncementsPanel = lazy(() => import("./components/AdminAnnouncementsPanel"));
const CoOwnershipPanel = lazy(() => import("./components/CoOwnershipPanels").then((module) => ({ default: module.CoOwnershipPanel })));
const CoOwnershipPublicPage = lazy(() => import("./components/CoOwnershipPanels").then((module) => ({ default: module.CoOwnershipPublicPage })));
const LegalAcceptancePanel = lazy(() => import("./legal/LegalAcceptancePanel"));
const RegistrationConsents = lazy(() => import("./legal/RegistrationConsents"));
const DRINK_NOW_SLIDESHOW_LIMIT = 10;

function helpSlugFromLocation() {
  const match = window.location.pathname.match(/^\/help(?:\/([^/]+))?\/?$/);
  return match ? decodeURIComponent(match[1] || "") || null : null;
}

function DashboardBottleSlideshow({
  wines,
  canShowPhotos,
  onOpen,
  meta,
  variant = "default",
  autoAdvanceMs = 5000,
  budgetMeta,
  label,
  previousLabel,
  nextLabel,
  pauseLabel,
  playLabel,
}: {
  wines: Wine[];
  canShowPhotos: boolean;
  onOpen: (wine: Wine) => void;
  meta: (wine: Wine) => string;
  variant?: "default" | "daily";
  autoAdvanceMs?: number;
  budgetMeta?: (wine: Wine) => { label: string; overBudget: boolean };
  label: string;
  previousLabel: string;
  nextLabel: string;
  pauseLabel: string;
  playLabel: string;
}) {
  const [activeIndex, setActiveIndex] = useState(0);
  const [userPaused, setUserPaused] = useState(false);
  const [interactionPaused, setInteractionPaused] = useState(false);
  const [reduceMotion, setReduceMotion] = useState(() => window.matchMedia?.("(prefers-reduced-motion: reduce)").matches || false);
  const hasMultiple = wines.length > 1;

  useEffect(() => {
    setActiveIndex((current) => Math.min(current, Math.max(wines.length - 1, 0)));
  }, [wines.length]);

  useEffect(() => {
    const media = window.matchMedia?.("(prefers-reduced-motion: reduce)");
    if (!media) return undefined;
    const updatePreference = () => setReduceMotion(media.matches);
    media.addEventListener("change", updatePreference);
    return () => media.removeEventListener("change", updatePreference);
  }, []);

  useEffect(() => {
    if (!hasMultiple || userPaused || interactionPaused || reduceMotion) return undefined;
    const timer = window.setInterval(() => {
      setActiveIndex((current) => (current + 1) % wines.length);
    }, autoAdvanceMs);
    return () => window.clearInterval(timer);
  }, [autoAdvanceMs, hasMultiple, interactionPaused, reduceMotion, userPaused, wines.length]);

  const goTo = (nextIndex: number) => {
    setActiveIndex((nextIndex + wines.length) % wines.length);
  };

  return (
    <div
      className={`dashboard-bottle-slideshow${variant === "daily" ? " daily-tone-slideshow" : ""}`}
      aria-label={label}
      onMouseEnter={() => setInteractionPaused(true)}
      onMouseLeave={() => setInteractionPaused(false)}
      onFocusCapture={() => setInteractionPaused(true)}
      onBlurCapture={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setInteractionPaused(false);
      }}
      onPointerDown={() => setInteractionPaused(true)}
      onPointerUp={() => setInteractionPaused(false)}
    >
      <div className="dashboard-bottle-viewport">
        <div className={`dashboard-bottle-track${reduceMotion ? " reduce-motion" : ""}`}>
          {wines.map((wine, index) => (
            <button
              type="button"
              className={`dashboard-bottle-tile${variant === "daily" ? " daily-tone-slide" : ""}`}
              aria-hidden={index !== activeIndex}
              tabIndex={index === activeIndex ? 0 : -1}
              key={wine.id}
              style={{ transform: `translate3d(0, ${(index - activeIndex) * 106}%, 0)` }}
              onClick={() => onOpen(wine)}
            >
              <KeyPositionBottleVisual photoUrl={canShowPhotos ? wine.photo_thumbnail_url || wine.photo_detail_url : ""} detailUrl={canShowPhotos ? wine.photo_detail_url : undefined} sizes="110px" tone={wineTone(wine.type)} />
              {variant === "daily" ? (
                <span className="daily-slide-copy">
                  <span className="daily-slide-topline">
                    <span className="daily-pick-window">
                      <AppIcon name="calendar" variant="feature" tone="muted" size="0.9rem" />
                      {wineIdealWindowStart(wine)}–{winePriorityDrinkEnd(wine)}
                    </span>
                    {budgetMeta ? (
                      <span className={`daily-slide-budget${budgetMeta(wine).overBudget ? " is-premium" : ""}`}>
                        {budgetMeta(wine).label}
                      </span>
                    ) : null}
                  </span>
                  <strong>{wine.name}</strong>
                  <span>{[wine.producer, wine.vintage].filter(Boolean).join(" · ")}</span>
                  <small>{meta(wine)}</small>
                </span>
              ) : (
                <span className="dashboard-bottle-copy">
                  <strong>{wine.name}</strong>
                  <span>{[wine.producer, wine.vintage].filter(Boolean).join(" · ")}</span>
                  <small>{meta(wine)}</small>
                </span>
              )}
            </button>
          ))}
        </div>
      </div>
      {hasMultiple ? (
        <div className="dashboard-bottle-controls">
          <button type="button" className="secondary" aria-label={previousLabel} onClick={() => goTo(activeIndex - 1)}><AppIcon name="chevron-left" /></button>
          <span aria-live="polite">{activeIndex + 1} / {wines.length}</span>
          <button type="button" className="secondary dashboard-slideshow-pause" aria-label={userPaused ? playLabel : pauseLabel} onClick={() => setUserPaused((current) => !current)}>
            {userPaused ? "▶" : "Ⅱ"}
          </button>
          <button type="button" className="secondary" aria-label={nextLabel} onClick={() => goTo(activeIndex + 1)}><AppIcon name="chevron-right" /></button>
        </div>
      ) : null}
    </div>
  );
}

function DashboardBottleList({
  wines,
  canShowPhotos,
  onOpen,
  meta,
  label,
}: {
  wines: Wine[];
  canShowPhotos: boolean;
  onOpen: (wine: Wine) => void;
  meta: (wine: Wine) => string;
  label: string;
}) {
  return (
    <div className="dashboard-bottle-list" role="list" aria-label={label}>
      {wines.map((wine) => (
        <button type="button" className="dashboard-bottle-tile" role="listitem" key={wine.id} onClick={() => onOpen(wine)}>
          <KeyPositionBottleVisual photoUrl={canShowPhotos ? wine.photo_thumbnail_url || wine.photo_detail_url : ""} detailUrl={canShowPhotos ? wine.photo_detail_url : undefined} sizes="110px" tone={wineTone(wine.type)} />
          <span className="dashboard-bottle-copy">
            <strong>{wine.name}</strong>
            <span>{[wine.producer, wine.vintage].filter(Boolean).join(" · ")}</span>
            <small>{meta(wine)}</small>
          </span>
        </button>
      ))}
    </div>
  );
}

function DeferredWineGeographyMap({ wines, t, onSelectRegion, locale }: { wines: Wine[]; t: (key: TranslationKey) => string; onSelectRegion: (region: string) => void; locale: Locale }) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [shouldLoad, setShouldLoad] = useState(false);

  useEffect(() => {
    if (shouldLoad) return;
    const container = containerRef.current;
    if (!container || !("IntersectionObserver" in window)) {
      setShouldLoad(true);
      return;
    }
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return;
        setShouldLoad(true);
        observer.disconnect();
      },
      { rootMargin: "400px 0px" },
    );
    observer.observe(container);
    return () => observer.disconnect();
  }, [shouldLoad]);

  return (
    <div ref={containerRef} className="deferred-map-placeholder">
      {shouldLoad ? (
        <Suspense fallback={<LoadingState label={t("loadingData")} />}>
          <WineGeographyMap wines={wines} t={t} onSelectRegion={onSelectRegion} locale={locale} />
        </Suspense>
      ) : (
        <LoadingState label={t("loadingData")} />
      )}
    </div>
  );
}

const TASTING_ARCHIVE_PAGE_SIZE = 50;
const WINE_TONE_PAGE_SIZE = 40;
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
  ai_notes_model: "gpt-6-luna",
  drink_window_model: "gpt-6.1-sol",
  value_model: "gpt-6-luna",
  grape_model: "gpt-6-luna",
  score_model: "gpt-6-luna",
  wishlist_model: "gpt-6.1-sol",
  pairing_model: "gpt-6-luna",
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
  sales: true,
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
    sales: enabled.has("sales"),
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
  sale_price: "",
  glass_price: "",
  pour_size_ml: "100",
  reorder_threshold: "2",
  reorder_enabled: true,
  commercial_status: "active",
  current_value: "",
  status: "Ordered",
  format: "",
  type: "",
  region: "",
  wine_zone: "",
  vineyard_locality: "",
  appellation: "",
  merchant: "",
  initial_stock_reference: "",
  storage_location_id: "",
  storage_bin_id: "",
  order_date: "",
  expected_delivery: "",
  owner_share_pct: "100",
  drink_from: "",
  drink_peak_from: "",
  drink_peak_to: "",
  drink_to: "",
  drink_window_notes: "",
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
  privacy_policy_accepted: false,
  terms_accepted: false,
  photo_usage_disclaimer_accepted: false,
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
  offer_price: "",
  investment_amount: "",
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
const dailyWineToneOrder: WineTone[] = ["sparkling", "white", "rose", "red", "sweet", "other"];

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

function strategyPurposeLabel(purpose: WineStrategyPurpose, locale: Locale) {
  const labels = locale === "it"
    ? { drink: "Da bere", maturation: "Da affinare", investment: "Investimento", special_occasion: "Occasione speciale", undecided: "Da decidere" }
    : { drink: "Drink", maturation: "Maturation", investment: "Investment", special_occasion: "Special occasion", undecided: "Undecided" };
  return labels[purpose];
}

function strategyPurposeBottleCount(wine: Wine, purpose: WineStrategyPurpose) {
  const quantities = wine.strategy_purpose_quantities || {};
  if (Object.keys(quantities).length) return Math.max(0, Number(quantities[purpose] || 0));
  return wine.strategy_purposes.includes(purpose) ? wine.quantity : 0;
}

function dailyEligibleBottleCount(wine: Wine, session: Session | null) {
  const allocated = (Object.keys(wine.strategy_purpose_quantities || {}).length
    ? Object.values(wine.strategy_purpose_quantities || {}).reduce((total, quantity) => total + Math.max(0, Number(quantity || 0)), 0)
    : wine.strategy_purposes.length ? wine.quantity : 0);
  const drinkOrUnallocated = strategyPurposeBottleCount(wine, "drink") + Math.max(wine.quantity - allocated, 0);
  return Math.min(ownedBottleCount(wine, session), drinkOrUnallocated);
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
  { region: "Other", targetPct: 0 },
];

function normalizedRegionName(value: string) {
  return value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function regionalGapBucket(region: string, trackedTargets: RegionalGapTarget[] = []) {
  const normalized = normalizedRegionName(region);
  if (!normalized) return "";
  const explicitTarget = trackedTargets.find((target) => normalizedRegionName(target.region) === normalized);
  if (explicitTarget) return explicitTarget.region;
  if (normalized.includes("bordeaux")) return "Bordeaux";
  if (normalized.includes("toscana") || normalized.includes("tuscany")) return "Toscana";
  if (normalized.includes("ticino")) return "Ticino";
  if (normalized.includes("burgundy") || normalized.includes("bourgogne") || normalized.includes("borgogna")) return "Burgundy";
  if (normalized.includes("champagne")) return "Champagne";
  if (normalized.includes("piemonte") || normalized.includes("piedmont")) return "Piemonte";
  if (normalized.includes("rhone") || normalized.includes("rhône")) return "Rhône";
  if (normalized.includes("napa")) return "Napa Valley";
  if (normalized.includes("rioja")) return "Rioja";
  return "Other";
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
  if (region === "Other") return translate(locale, "regionalOtherOrigins");
  return region;
}

function withOtherRegionalTarget(targets: RegionalGapTarget[]) {
  return targets.some((target) => target.region === "Other")
    ? targets
    : [...targets, { region: "Other", targetPct: 0 }];
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
  const trackedTargets = [...classicRegionalGapTargets, ...storedTargets];
  for (const wine of items) {
    const region = regionalGapBucket(wine.region, trackedTargets);
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

function regionalGapAiSuggestionStorageKey(householdId: string | null | undefined) {
  return `vinaris:regional-gap-ai-suggestion:${householdId || "local"}`;
}

function readRegionalGapTargets(householdId: string | null | undefined): RegionalGapTarget[] {
  try {
    return JSON.parse(window.localStorage.getItem(regionalGapStorageKey(householdId)) || "[]") as RegionalGapTarget[];
  } catch {
    return [];
  }
}

function clearOperationalActionSnooze(actionKey: string) {
  const snoozes = readOperationalActionSnoozes();
  if (!(actionKey in snoozes)) return;
  delete snoozes[actionKey];
  writeOperationalActionSnoozes(snoozes);
}

function readRegionalGapSuggestion(householdId: string | null | undefined): RegionalGapAiSuggestion | null {
  try {
    const value = JSON.parse(window.localStorage.getItem(regionalGapAiSuggestionStorageKey(householdId)) || "null") as RegionalGapAiSuggestion | null;
    return value?.rationale && Array.isArray(value.targets) ? value : null;
  } catch {
    return null;
  }
}

function regionalGapAiCommentary(suggestion: RegionalGapAiSuggestion, locale: Locale) {
  const rationale = suggestion.rationale.trim();
  if (rationale) return rationale;
  return locale === "it"
    ? "L'AI ha generato i target regionali visualizzati. Verifica la proposta prima di adottarla."
    : "AI generated the regional targets shown here. Review the proposal before adopting it.";
}

// The floating sommelier offers itself at most once a week, and keeps quiet for a
// month once closed: the Sommelier AI tab and the row chips are always there.
const CELLAR_SOMMELIER_NEXT_PROMPT_KEY = "vinaris:cellar-sommelier-next-prompt";
const CELLAR_SOMMELIER_PROMPT_INTERVAL_MS = 7 * 86_400_000;
const CELLAR_SOMMELIER_DISMISS_INTERVAL_MS = 30 * 86_400_000;

function canShowAutomaticCellarSommelierPrompt() {
  try {
    return Date.now() >= Number(window.localStorage.getItem(CELLAR_SOMMELIER_NEXT_PROMPT_KEY) || 0);
  } catch {
    return false;
  }
}

function hasShownAutomaticCellarSommelierPrompt() {
  return !canShowAutomaticCellarSommelierPrompt();
}

function postponeCellarSommelierPrompt(intervalMs: number) {
  try {
    window.localStorage.setItem(CELLAR_SOMMELIER_NEXT_PROMPT_KEY, String(Date.now() + intervalMs));
  } catch {
    // The in-memory guard still prevents duplicates while this page remains open.
  }
}

function markAutomaticCellarSommelierPromptShown() {
  postponeCellarSommelierPrompt(CELLAR_SOMMELIER_PROMPT_INTERVAL_MS);
}

const LazyCellarDonutAnalytics = lazy(() => import("./components/CellarAnalyticsCharts").then((module) => ({ default: module.CellarDonutAnalytics })));
const LazyCellarBarAnalytics = lazy(() => import("./components/CellarAnalyticsCharts").then((module) => ({ default: module.CellarBarAnalytics })));
const LazyWineValueConstellation = lazy(() => import("./components/CellarAnalyticsCharts").then((module) => ({ default: module.WineValueConstellation })));

function CellarDonutAnalytics(props: ComponentProps<typeof LazyCellarDonutAnalytics>) {
  return <Suspense fallback={null}><LazyCellarDonutAnalytics {...props} /></Suspense>;
}

function CellarBarAnalytics(props: ComponentProps<typeof LazyCellarBarAnalytics>) {
  return <Suspense fallback={null}><LazyCellarBarAnalytics {...props} /></Suspense>;
}

function WineValueConstellation(props: ComponentProps<typeof LazyWineValueConstellation>) {
  return <Suspense fallback={null}><LazyWineValueConstellation {...props} /></Suspense>;
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

function notificationSvgIcon(kind: string) {
  if (kind === "smart_drink_now" || kind === "smart_rate_tastings") return dashboardStatSvgIcon("drink_now");
  if (kind === "smart_past_window") return dashboardStatSvgIcon("past_window");
  if (kind === "smart_future_deliveries" || kind === "smart_missed_deliveries") return dashboardStatSvgIcon("future_deliveries");
  if (kind === "smart_to_collect") return dashboardStatSvgIcon("to_collect");
  if (kind === "smart_entitlement_expiring") return dashboardStatSvgIcon("missing_data");
  if (kind === "pending_users") return dashboardStatSvgIcon("shared");
  if (kind === "invite") return dashboardStatSvgIcon("shared");
  if (kind === "share_offer") return dashboardStatSvgIcon("shared");
  if (kind === "coownership_agreement" || kind === "coownership_payment") return dashboardStatSvgIcon("shared");
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M6 10a6 6 0 1 1 12 0c0 4-6 10-6 10S6 14 6 10Z" />
      <circle cx="12" cy="10" r="2.5" />
    </svg>
  );
}

export function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [wines, setWines] = useState<Wine[]>([]);
  const [merchants, setMerchants] = useState<Array<{ id: string; name: string }>>([]);
  const wineMerchantOptionsId = useId();
  const [portfolioValueHistory, setPortfolioValueHistory] = useState<Array<{ recorded_at: string; value: string }>>([]);
  const [wineCatalog, setWineCatalog] = useState<CatalogWine[]>([]);
  const [wineImageRecognitionResult, setWineImageRecognitionResult] = useState<WineImageRecognitionResult | null>(null);
  const [selectedWineImageCandidate, setSelectedWineImageCandidate] = useState<WineImageRecognitionCandidate | null>(null);
  const [wineRecognitionTarget, setWineRecognitionTarget] = useState<"wine" | "wishlist">("wine");
  const [wineRecognitionLoading, setWineRecognitionLoading] = useState(false);
  const [wineEnrichmentLoading, setWineEnrichmentLoading] = useState(false);
  const wineCreationAiActionRef = useRef<{ kind: "full"; model: string } | null>(null);
  const wishlistNameInputRef = useRef<HTMLInputElement | null>(null);
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
  const [adminUserQuery, setAdminUserQuery] = useState("");
  const [adminUserStatusFilter, setAdminUserStatusFilter] = useState<"all" | "pending" | "active" | "inactive" | "blocked">("all");
  const [selectedAdminUserId, setSelectedAdminUserId] = useState<string | null>(null);
  const [selectedAppUserStats, setSelectedAppUserStats] = useState<UserAdminStats | null>(null);
  const [userStatsModalOpen, setUserStatsModalOpen] = useState(false);
  const [userStatsLoading, setUserStatsLoading] = useState(false);
  const [userStatsModalTitle, setUserStatsModalTitle] = useState("");
  const [pendingCatalogEntries, setPendingCatalogEntries] = useState<CatalogWine[]>([]);
  const [catalogAdminQuery, setCatalogAdminQuery] = useState("");
  const [catalogAdminResults, setCatalogAdminResults] = useState<CatalogWine[]>([]);
  const [redeemCodes, setRedeemCodes] = useState<RedeemCode[]>([]);
  const [billingStatus, setBillingStatus] = useState<BillingStatus | null>(null);
  const [operationsOverview, setOperationsOverview] = useState<OperationalMetricsOverview | null>(null);
  const [userActivity, setUserActivity] = useState<UserActivityLogEntry[]>([]);
  const [invites, setInvites] = useState<Invite[]>([]);
  const [receivedInvites, setReceivedInvites] = useState<Invite[]>([]);
  const [notificationCenter, setNotificationCenter] = useState<NotificationCenterResponse>({
    items: [],
    counts: { total: 0, unread: 0, actionable: 0, attention: 0, actions: 0, updates: 0, system: 0 },
    offset: 0,
    next_offset: null,
    has_more: false,
  });
  const observedNotificationKindsRef = useRef(new Set<string>());
  const observedNotificationScopeRef = useRef<string | null>(null);
  const notificationRequestIdRef = useRef(0);
  const [notificationActiveCounts, setNotificationActiveCounts] = useState<NotificationCenterResponse["counts"]>({ total: 0, unread: 0, actionable: 0, attention: 0, actions: 0, updates: 0, system: 0 });
  const [notificationTab, setNotificationTab] = useState<"all" | NotificationCenterCategory>("all");
  const [notificationView, setNotificationView] = useState<"active" | "archived">("active");
  const [notificationStateFilter, setNotificationStateFilter] = useState<"all" | "unread">("all");
  const [myCoOwnershipAgreements, setMyCoOwnershipAgreements] = useState<CoOwnershipAgreement[]>([]);
  const [coOwnershipAgreementFocusId, setCoOwnershipAgreementFocusId] = useState<string | null>(null);
  const [coOwnershipLibraryVisible, setCoOwnershipLibraryVisible] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [operationalActionSnoozes, setOperationalActionSnoozes] = useState<OperationalActionSnoozes>(() => readOperationalActionSnoozes());
  const [activeKeyPositionIndex, setActiveKeyPositionIndex] = useState(0);
  const keyPositionStripRef = useRef<HTMLDivElement | null>(null);
  const wineEditorScrollRef = useRef<HTMLDivElement | null>(null);
  const pendingKeyPositionIndexRef = useRef<number | null>(null);
  const regionalGapChartRef = useRef<HTMLDivElement | null>(null);
  const [aiAudit, setAiAudit] = useState<AiAuditLog[]>([]);
  const [aiPackEnhancementDismissed, setAiPackEnhancementDismissed] = useState(() => Number(window.localStorage.getItem(AI_PACK_ENHANCEMENT_DISMISS_KEY) || 0) > Date.now());
  const [batchAiRun, setBatchAiRun] = useState<BatchAiRun | null>(null);
  const [batchAiMinimized, setBatchAiMinimized] = useState(false);
  const batchAiStopRef = useRef(false);
  const [aiUsage, setAiUsage] = useState<AiUsage | null>(null);
  const [aiSettings, setAiSettings] = useState<AiSettings | null>(null);
  const [aiSettingsDraft, setAiSettingsDraft] = useState<AiSettingsDraft>(emptyAiSettingsDraft);
  const [aiModelAdvice, setAiModelAdvice] = useState<AiModelAdviceState | null>(null);
  const [draft, setDraft] = useState<WineDraft>(emptyDraft);
  const [openWineEditorSections, setOpenWineEditorSections] = useState<{
    value?: boolean;
    profile?: boolean;
    strategy?: boolean;
    stock?: boolean;
    history?: boolean;
    audit?: boolean;
  }>({});
  const [wineEditorStrategySummary, setWineEditorStrategySummary] = useState<{ wineId: string; allocated: number } | null>(null);
  const [wishlistDraft, setWishlistDraft] = useState<WishlistDraft>(emptyWishlistDraft);
  const [authDraft, setAuthDraft] = useState<AuthDraft>(emptyAuthDraft);
  const [contactSupportDraft, setContactSupportDraft] = useState<ContactSupportDraft>(emptyContactSupportDraft);
  const [inviteDraft, setInviteDraft] = useState<InviteDraft>(emptyInviteDraft);
  const [pairingDish, setPairingDish] = useState("");
  const [pairingTargetWineId, setPairingTargetWineId] = useState<string | null>(null);
  // The Sommelier's budget, remembered on this device; the assistant's pairings use it too.
  const [pairingMaxPrice, setPairingMaxPriceState] = useState(() => {
    try { return window.localStorage.getItem("vinaris.pairing.max-price") || ""; } catch { return ""; }
  });
  const setPairingMaxPrice = (value: string) => {
    setPairingMaxPriceState(value);
    try { window.localStorage.setItem("vinaris.pairing.max-price", value); } catch { /* kept for this visit */ }
  };
  const [pairingIncludeMarket, setPairingIncludeMarket] = useState(false);
  const [pairingMarketOnly, setPairingMarketOnly] = useState(false);
  const [pairingOnlyIdealDrinkWindow, setPairingOnlyIdealDrinkWindow] = useState(true);
  const [pairingIgnorePreferences, setPairingIgnorePreferences] = useState(false);
  const [pairingPreferLocal, setPairingPreferLocal] = useState(false);
  const [pairingLocalOrigin, setPairingLocalOrigin] = useState("");
  const [pairingResult, setPairingResult] = useState<PairingResult | null>(null);
  const [buyingPurpose, setBuyingPurpose] = useState<"drink_now" | "cellar" | "pairing">("drink_now");
  const [buyingPairingWith, setBuyingPairingWith] = useState("");
  const [buyingPreferences, setBuyingPreferences] = useState("");
  const [buyingWineType, setBuyingWineType] = useState("");
  const [buyingRegion, setBuyingRegion] = useState("");
  const [buyingUseTasteProfile, setBuyingUseTasteProfile] = useState(true);
  const [buyingCheckAvailability, setBuyingCheckAvailability] = useState(false);
  const [buyingNeededBy, setBuyingNeededBy] = useState<"today" | "tomorrow" | "can_wait">("today");
  const [buyingLocation, setBuyingLocation] = useState("");
  const [buyingMinPrice, setBuyingMinPrice] = useState("20");
  const [buyingMaxPrice, setBuyingMaxPrice] = useState("50");
  const [buyingAdviceResult, setBuyingAdviceResult] = useState<BuyingAdviceResult | null>(null);
  const [historySection, setHistorySection] = useState<HistorySection>("tastings");
  const [recordTastingOpen, setRecordTastingOpen] = useState(false);
  // "Momenti" opens from the menus on any page, not only from the home and history.
  const [memoryBookOpen, setMemoryBookOpen] = useState(false);
  // A question asked from the home ask bar, handed to the assistant view.
  const [assistantQuestion, setAssistantQuestion] = useState<{ id: number; text: string } | null>(null);
  const [assistantVoiceStart, setAssistantVoiceStart] = useState<number | null>(null);
  // A pairing the assistant got from the Sommelier AI, opened in the pairing view.
  const [pairingFromAssistant, setPairingFromAssistant] = useState(false);
  // The voice reads the French names of this cellar as an Italian speaker would say them.
  useEffect(() => {
    setFrenchNames(wines.filter(isFrenchWine).flatMap((wine) => [wine.name, wine.producer, wine.appellation]));
  }, [wines]);
  // Where a pairing visit starts when it comes from the Sommelier AI page.
  const [pairingStartPlace, setPairingStartPlace] = useState<"choose" | "home" | "restaurant">("choose");
  const [tastingOrigin, setTastingOrigin] = useState<"" | "cellar" | "external">("");
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
  const [registrationEmail, setRegistrationEmail] = useState("");
  const [resendVerificationEmail, setResendVerificationEmail] = useState("");
  const [passwordResetToken, setPasswordResetToken] = useState("");
  const [coOwnershipToken, setCoOwnershipToken] = useState("");
  const [coOwnershipAgreements, setCoOwnershipAgreements] = useState<CoOwnershipAgreement[]>([]);
  const [coOwnershipFocusRequest, setCoOwnershipFocusRequest] = useState<{ wineId: string; requestId: string } | null>(null);
  const [inviteToken, setInviteToken] = useState("");
  const [generatedInviteLink, setGeneratedInviteLink] = useState("");
  const [redeemCodeDraft, setRedeemCodeDraft] = useState<RedeemCodeDraft>(emptyRedeemCodeDraft);
  const [redeemInput, setRedeemInput] = useState("");
  const [generatedRedeemCode, setGeneratedRedeemCode] = useState("");
  const [exportSelection, setExportSelection] = useState<ExportSelection>(defaultExportSelection);
  const [importSelection, setImportSelection] = useState<ImportSelection>(importSelectionFromBlocks(["wines", "wishlist"]));
  const [householdNameDraft, setHouseholdNameDraft] = useState("");
  const [restaurantSettingsDraft, setRestaurantSettingsDraft] = useState({ defaultPourDl: "1", serviceLossMl: "50", reorderThreshold: "2" });
  const [restaurantDashboardVersion, setRestaurantDashboardVersion] = useState(0);
  const [wineSalesHistory, setWineSalesHistory] = useState<WineSalesHistory | null>(null);
  const [wineSalesHistoryLoading, setWineSalesHistoryLoading] = useState(false);
  const [newHouseholdNameDraft, setNewHouseholdNameDraft] = useState("");
  const [deleteHouseholdConfirmDraft, setDeleteHouseholdConfirmDraft] = useState("");
  const [userAiBalanceDrafts, setUserAiBalanceDrafts] = useState<Record<string, string>>({});
  const [userAiNoteDrafts, setUserAiNoteDrafts] = useState<Record<string, string>>({});
  const [userAccessDaysDrafts, setUserAccessDaysDrafts] = useState<Record<string, string>>({});
  const [shareDraft, setShareDraft] = useState({ email: "", share_pct: "50", message: "" });
  const [passkeyName, setPasskeyName] = useState("Vinaris");
  const [passkeyHelpOpen, setPasskeyHelpOpen] = useState(false);
  const [accountDeletionEmail, setAccountDeletionEmail] = useState("");
  const [accountDeletionPassword, setAccountDeletionPassword] = useState("");
  const [importPayload, setImportPayload] = useState<Record<string, unknown> | null>(null);
  const [cellarTrackerCsvText, setCellarTrackerCsvText] = useState("");
  const [importSource, setImportSource] = useState<"vinaris" | "cellartracker">("vinaris");
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
  const [wishlistUseTasteProfile, setWishlistUseTasteProfile] = useState(true);
  const [compareAiLoading, setCompareAiLoading] = useState(false);
  const [showBackToTop, setShowBackToTop] = useState(false);
  const backToTopVisibleRef = useRef(false);
  const [isOnline, setIsOnline] = useState(() => navigator.onLine);
  const [showOfflineBackupPanel, setShowOfflineBackupPanel] = useState(() => !navigator.onLine);
  const [wineGroupingMode, setWineGroupingMode] = useState<"color" | "region">(() =>
    window.sessionStorage.getItem("vinaris-wine-grouping") === "region" ? "region" : "color",
  );
  const [wineGroupSelection, setWineGroupSelection] = useState("all");
  const [openWineToneGroups, setOpenWineToneGroups] = useState<Record<string, boolean>>({
    red: false,
    white: false,
    sparkling: false,
    rose: false,
    sweet: false,
    other: false,
    unspecified: true,
  });
  const [wineToneRenderLimits, setWineToneRenderLimits] = useState<Record<string, number>>({
    red: WINE_TONE_PAGE_SIZE,
    white: WINE_TONE_PAGE_SIZE,
    sparkling: WINE_TONE_PAGE_SIZE,
    rose: WINE_TONE_PAGE_SIZE,
    sweet: WINE_TONE_PAGE_SIZE,
    other: WINE_TONE_PAGE_SIZE,
  });
  const [isMobileViewport, setIsMobileViewport] = useState(() => window.innerWidth <= 1099);
  const [tabletDevice] = useState(isTabletDevice);
  const [tabletDesktopMode, setTabletDesktopMode] = useState(initializeTabletLayout);
  const chooseTabletLayout = (desktop: boolean) => {
    saveTabletLayout(desktop);
    setTabletDesktopMode(desktop);
  };
  const [mobileAccountMenuOpen, setMobileAccountMenuOpen] = useState(false);
  const [mobileNavigationOpen, setMobileNavigationOpen] = useState(false);
  const mobileMenuButtonRef = useRef<HTMLButtonElement>(null);
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false);
  const mobileAccountMenuRef = useRef<HTMLDivElement | null>(null);
  const [activeView, setActiveView] = useState<ViewName>("home");
  // The dashboard can mount after the initial application render or after a
  // view change. Observe the radar again in both cases.
  useChartReveal(regionalGapChartRef, `${activeView}:${session?.active_household_id || ""}:${wines.length}`);
  const [helpSlug, setHelpSlug] = useState<string | null>(() => helpSlugFromLocation());
  const helpReturnViewRef = useRef<ViewName>("home");
  const settingsReturnViewRef = useRef<ViewName>("home");
  const [dashboardFocus, setDashboardFocus] = useState<DashboardFocus>("collector");
  const [dashboardCarouselInitialIndex, setDashboardCarouselInitialIndex] = useState(0);
  const [cellarSommelierVisible, setCellarSommelierVisible] = useState(false);
  const [cellarSommelierOpen, setCellarSommelierOpen] = useState(false);
  const [cellarSommelierHighlightedWineId, setCellarSommelierHighlightedWineId] = useState<string | null>(null);
  const cellarSommelierPromptedWineIdsRef = useRef(new Set<string>());
  const automaticCellarSommelierPromptShownRef = useRef(false);
  const [primaryDashboardFocus, setPrimaryDashboardFocus] =
    useState<PrimaryDashboardFocus>("collector");
  const [dailyWineBudgetDraft, setDailyWineBudgetDraft] = useState("");
  const [breakdownDrilldown, setBreakdownDrilldown] = useState<BreakdownDrilldown>(null);
  const [settingsTab, setSettingsTab] = useState<SettingsTab>("profile");
  const [subscriptionFocusPending, setSubscriptionFocusPending] = useState(false);
  const [onboardingMode, setOnboardingMode] = useState("auto");
  const [selectedWineId, setSelectedWineId] = useState<string | null>(null);
  const [wineStorageFocus, setWineStorageFocus] = useState<{ wineId: string; requestId: number } | null>(null);
  const [wineDetailExpanded, setWineDetailExpanded] = useState(false);
  const [wineEditorExpanded, setWineEditorExpanded] = useState(false);
  const [purchaseImportOpen, setPurchaseImportOpen] = useState(false);
  const [addWineChooserOpen, setAddWineChooserOpen] = useState(false);
  const [bottlePhotoImportOpen, setBottlePhotoImportOpen] = useState(false);
  // The button that opened the "+" sheet, where focus returns from what it opens.
  const addTriggerRef = useRef<HTMLElement | null>(null);
  const [newsOpen, setNewsOpen] = useState(false);
  const [newsFocusToken, setNewsFocusToken] = useState(0);
  const [newsUnread, setNewsUnread] = useState(false);
  const [buyingStartPlace, setBuyingStartPlace] = useState<"advice" | "shelf">("advice");
  const openNews = useCallback((open: boolean, userInitiated = false) => {
    setNewsOpen(open);
    if (open && userInitiated) setNewsFocusToken((token) => token + 1);
  }, []);
  const [pairingWineDetailId, setPairingWineDetailId] = useState<string | null>(null);
  const [selectedWishlistId, setSelectedWishlistId] = useState<string | null>(null);
  const [wishlistConversionItem, setWishlistConversionItem] = useState<WishlistItem | null>(null);
  const [wishlistConversionQuantity, setWishlistConversionQuantity] = useState("1");
  const [selectedWishlistListId, setSelectedWishlistListId] = useState<string>("");
  const [pendingWineScrollId, setPendingWineScrollId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingWishlistId, setEditingWishlistId] = useState<string | null>(null);
  const [wineFormOpen, setWineFormOpen] = useState(false);
  const [pendingBottlePhoto, setPendingBottlePhoto] = useState<PreparedBottlePhoto | null>(null);
  const [winePhotoSuggestions, setWinePhotoSuggestions] = useState<WinePhotoSuggestion[]>([]);
  const [winePhotoSuggestionIndex, setWinePhotoSuggestionIndex] = useState(0);
  const [selectedSuggestedPhotoId, setSelectedSuggestedPhotoId] = useState<string | null>(null);
  const [detailWinePhotoSuggestion, setDetailWinePhotoSuggestion] = useState<WinePhotoSuggestion | null>(null);
  const [detailWinePhotoSuggestionWineId, setDetailWinePhotoSuggestionWineId] = useState<string | null>(null);
  const [wishlistFormOpen, setWishlistFormOpen] = useState(false);
  const [wishlistEntryIntent, setWishlistEntryIntent] = useState<"save" | "offer">("save");
  const [searchQuery, setSearchQuery] = useState("");
  const [regionFilter, setRegionFilter] = useState("");
  const filterPanelRef = useRef<HTMLDetailsElement>(null);
  const wineCategoryRailRef = useRef<HTMLDivElement>(null);
  const wineCategoryDragRef = useRef({ pointerId: -1, startX: 0, startScrollLeft: 0, moved: false });
  const mobileWineDetailHistoryActiveRef = useRef(false);

  useEffect(() => {
    if (helpSlug !== null || window.location.pathname === "/help") setActiveView("help");
    const onPopState = () => {
      if (mobileWineDetailHistoryActiveRef.current) {
        mobileWineDetailHistoryActiveRef.current = false;
        setSelectedWineId(null);
        return;
      }
      const slug = helpSlugFromLocation();
      if (slug !== null || window.location.pathname === "/help") {
        setHelpSlug(slug);
        setActiveView("help");
      } else if (activeView === "help") {
        setHelpSlug(null);
        setActiveView(helpReturnViewRef.current);
      }
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, [activeView]);

  useEffect(() => {
    if (activeView !== "settings") settingsReturnViewRef.current = activeView;
  }, [activeView]);

  useEffect(() => {
    if (!mobileAccountMenuOpen) return;
    const closeMenu = (event: KeyboardEvent | PointerEvent) => {
      if (event instanceof KeyboardEvent) {
        if (event.key === "Escape") setMobileAccountMenuOpen(false);
        return;
      }
      if (!mobileAccountMenuRef.current?.contains(event.target as Node)) setMobileAccountMenuOpen(false);
    };
    window.addEventListener("keydown", closeMenu);
    window.addEventListener("pointerdown", closeMenu);
    return () => {
      window.removeEventListener("keydown", closeMenu);
      window.removeEventListener("pointerdown", closeMenu);
    };
  }, [mobileAccountMenuOpen]);

  useEffect(() => {
    if (!isMobileViewport) setMobileAccountMenuOpen(false);
  }, [isMobileViewport]);

  useEffect(() => {
    if (!wineDetailExpanded && !wineEditorExpanded && !pairingWineDetailId) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setWineDetailExpanded(false);
      setWineEditorExpanded(false);
      setPairingWineDetailId(null);
      if (activeView === "pairing" || (activeView === "history" && historySection === "tastings")) setSelectedWineId(null);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [wineDetailExpanded, wineEditorExpanded, pairingWineDetailId, activeView, historySection]);

  useEffect(() => {
    if (!wineFormOpen) setWineEditorExpanded(false);
  }, [wineFormOpen]);

  useEffect(() => {
    if (settingsTab !== "operations" || !session?.is_app_admin) return;
    const refreshWhenVisible = () => {
      if (!document.hidden) void loadOperationsMetrics().catch(() => undefined);
    };
    const interval = window.setInterval(refreshWhenVisible, 60000);
    document.addEventListener("visibilitychange", refreshWhenVisible);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", refreshWhenVisible);
    };
  }, [settingsTab, session?.is_app_admin]);

  const [typeFilter, setTypeFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [storageFilter, setStorageFilter] = useState("");
  const [strategyPurposeFilter, setStrategyPurposeFilter] = useState<WineStrategyPurpose | "">("");
  const [ownershipFilter, setOwnershipFilter] = useState("");
  const [quickWineFilter, setQuickWineFilter] = useState<QuickWineFilter>("");
  const [maturityFilter, setMaturityFilter] = useState<MaturityFilter>(null);
  const [maturityMobilePanel, setMaturityMobilePanel] = useState<"map" | "risk">("map");
  const [regionalGapTargets, setRegionalGapTargets] = useState<RegionalGapTarget[]>(classicRegionalGapTargets);
  const [regionalGapTargetsOpen, setRegionalGapTargetsOpen] = useState(false);
  const [regionalGapDraft, setRegionalGapDraft] = useState<RegionalGapTargetDraft[]>(() => classicRegionalGapTargets.map((target) => ({ region: target.region, targetPct: String(target.targetPct) })));
  const [regionalGapProfile, setRegionalGapProfile] = useState<RegionalGapProfile>("balanced");
  const [regionalGapProfileTargets, setRegionalGapProfileTargets] = useState<Partial<Record<RegionalGapProfile, RegionalGapTarget[]>>>({});
  const [regionalGapAiSuggestions, setRegionalGapAiSuggestions] = useState<RegionalGapAiSuggestion[]>([]);
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
  const regionalGapProposalRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!notice) return;
    const timeout = window.setTimeout(() => setNotice(""), 5000);
    return () => window.clearTimeout(timeout);
  }, [notice]);

  useEffect(() => {
    if (!regionalGapAiSuggestion || !regionalGapTargetsOpen) return;
    const frame = window.requestAnimationFrame(() => {
      regionalGapProposalRef.current?.focus({ preventScroll: true });
      regionalGapProposalRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [regionalGapAiSuggestion, regionalGapTargetsOpen]);
  const [locale, setLocale] = useState<Locale>(() => {
    const requestedLocale = new URLSearchParams(window.location.search).get("lang");
    if (requestedLocale === "it" || requestedLocale === "en") return requestedLocale;
    return navigator.language.toLowerCase().startsWith("it") ? "it" : "en";
  });
  const demoCtaLabel = locale === "it" ? "Esplora la cantina demo" : "Explore the demo cellar";
  const [themePreference, setThemePreference] = useState<ThemePreference>("system");
  const t = (key: TranslationKey) => translate(locale, key);
  const visibleError = formatUserErrorMessage(error, locale);
  const isFreeTierLimitError = error.toLowerCase().includes("free tier label limit exceeded");
  const freeTierLimitErrorMessage = locale === "it"
    ? "Hai raggiunto il limite di 15 etichette attive del piano gratuito. Acquista un abbonamento per aggiungerne altre."
    : "You reached the free plan's 15 active-label limit. Purchase a subscription to add more.";
  // A batch shows its own live report instead of covering the app.
  const aiOverlayMode = (generatingAi.startsWith("batch-") ? "" : generatingAi) || (compareAiLoading ? "compare" : "");
  const [aiOverlayRenderMode, setAiOverlayRenderMode] = useState("");
  const [aiOverlayVisible, setAiOverlayVisible] = useState(false);
  const exportBlocks = [
    { key: "wines", label: t("exportIncludesWines") },
    { key: "sales", label: t("exportIncludesSales") },
    { key: "wishlist", label: t("exportIncludesWishlist") },
    { key: "members", label: t("exportIncludesMembers") },
    { key: "invites", label: t("exportIncludesInvites") },
    { key: "share_offers", label: t("exportIncludesShareOffers") },
    { key: "user_tags", label: t("exportIncludesTags") },
    { key: "ai_audit", label: t("exportIncludesAiAudit") },
  ] as const;
  const hasSelectedExportBlock = exportBlocks.some(({ key }) => exportSelection[key]);
  const wineTemplateSuggestions = [...wines, ...wineCatalog]
    .filter((wine, index, items) => {
      const identity = [wine.name, wine.producer, wine.region].map((value) => value.trim().toLowerCase()).join("|");
      return wine.name.trim() && items.findIndex((item) => (
        [item.name, item.producer, item.region].map((value) => value.trim().toLowerCase()).join("|") === identity
      )) === index;
    })
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
    }, 220);
    return () => window.clearTimeout(timeoutId);
  }, [aiOverlayMode, aiOverlayRenderMode]);

  function wineDraftWithTemplate(baseDraft: WineDraft, template: Wine | CatalogWine): WineDraft {
    return {
      ...baseDraft,
      producer: template.producer || baseDraft.producer,
      region: template.region || baseDraft.region,
      wine_zone: template.wine_zone || baseDraft.wine_zone,
      vineyard_locality: ("vineyard_locality" in template ? template.vineyard_locality : "locality" in template ? template.locality : "") || baseDraft.vineyard_locality,
      appellation: template.appellation || baseDraft.appellation,
      format: template.format || baseDraft.format,
      type: normalizeWineType(template.type || baseDraft.type),
      currency: "currency" in template ? template.currency || baseDraft.currency : baseDraft.currency,
      current_value: "current_value" in template && template.current_value ? String(template.current_value) : baseDraft.current_value,
      owner_share_pct: "owner_share_pct" in template ? String(template.owner_share_pct || baseDraft.owner_share_pct) : baseDraft.owner_share_pct,
    };
  }

  function updateWineDraftName(name: string) {
    setDraft({ ...draft, name });
  }

  function updateWishlistDraftName(name: string) {
    setWishlistDraft({ ...wishlistDraft, name });
  }

  function selectWineTemplate(template: Wine | CatalogWine, target: "wine" | "wishlist") {
    if (target === "wine") {
      setDraft((current) => wineDraftWithTemplate({ ...current, name: template.name }, template));
      return;
    }
    setWishlistDraft((current) => ({
      ...current,
      name: template.name,
      producer: template.producer || current.producer,
      region: template.region || current.region,
      appellation: template.appellation || current.appellation,
      format: template.format || current.format,
      type: normalizeWineType(template.type || current.type),
      currency: "currency" in template ? template.currency || current.currency : current.currency,
    }));
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
      wine_zone: item.wine_zone || current.wine_zone,
      vineyard_locality: item.locality || current.vineyard_locality,
      appellation: item.appellation || current.appellation,
      format: item.format || current.format,
      type: normalizeWineType(item.type || current.type),
      grapes: current.grapes.length || !item.grapes_text ? current.grapes : grapesFromText(item.grapes_text),
    }));
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
    setWineImageRecognitionResult(null);
    setSelectedWineImageCandidate(null);
    setWineEnrichmentLoading(false);
  }

  async function enrichManualWineDraft(target: "wine" | "wishlist", source: "manual" | "photo" = "manual") {
    const targetDraft = target === "wine" ? draft : wishlistDraft;
    const label = [targetDraft.producer, targetDraft.name, targetDraft.vintage, targetDraft.appellation]
      .map((value) => value.trim())
      .filter(Boolean)
      .join(" ");
    if (!label) return false;
    const model = await requestAiModelAdvice(t("searchWineDataWithAi"), "economy", aiSettings?.grape_model || aiSettingsDraft.grape_model);
    if (!model) return false;
    setWineEnrichmentLoading(true);
    try {
      const enrichment = await api<WineLabelEnrichment>("/api/v1/ai/wine-label/enrich", {
        method: "POST",
        body: JSON.stringify({
          label,
          locale,
          source,
          model,
          ...(source === "photo" ? {
            confirmed_name: targetDraft.name.trim(),
            confirmed_producer: targetDraft.producer.trim(),
            confirmed_vintage: targetDraft.vintage.trim(),
            confirmed_appellation: targetDraft.appellation.trim(),
          } : {}),
        }),
      });
      const catalogItem: CatalogWine = {
        name: source === "photo" ? targetDraft.name || enrichment.name : safeEnrichedWineName(label, enrichment.name),
        producer: source === "photo" ? targetDraft.producer || enrichment.producer : enrichment.producer,
        region: source === "photo" ? targetDraft.region || enrichment.region : enrichment.region,
        appellation: source === "photo" ? targetDraft.appellation || enrichment.appellation : enrichment.appellation,
        type: normalizeWineType(source === "photo" ? targetDraft.type || enrichment.type : enrichment.type),
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
      await Promise.all([loadAiAudit(), loadAiSettings(), loadAiUsage(), loadBilling()]);
      return true;
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Unable to search wine data with AI");
      return false;
    } finally {
      setWineEnrichmentLoading(false);
    }
  }

  function wineImageCandidateName(candidate: WineImageRecognitionCandidate) {
    const cuveeAlreadyIncluded = candidate.wine_name.toLocaleLowerCase().includes(candidate.cuvee.toLocaleLowerCase());
    return [candidate.wine_name, cuveeAlreadyIncluded ? "" : candidate.cuvee]
      .filter(Boolean)
      .join(" ") || candidate.appellation;
  }

  function applyWineImageCandidate(candidate: WineImageRecognitionCandidate, target: "wine" | "wishlist" = "wine") {
    const name = wineImageCandidateName(candidate);
    setSelectedWineImageCandidate(candidate);
    if (target === "wine") {
      setDraft((current) => ({
        ...current,
        name: name || current.name,
        producer: candidate.producer || candidate.estate || current.producer,
        vintage: candidate.vintage || current.vintage,
        appellation: candidate.appellation || current.appellation,
        region: candidate.region || current.region,
        type: normalizeWineType(candidate.wine_type || current.type),
        format: current.format || "Bottle (750ml)",
      }));
    } else {
      setWishlistDraft((current) => ({
        ...current,
        name: name || current.name,
        producer: candidate.producer || candidate.estate || current.producer,
        vintage: candidate.vintage || current.vintage,
        appellation: candidate.appellation || current.appellation,
        region: candidate.region || current.region,
        type: normalizeWineType(candidate.wine_type || current.type),
        format: current.format || "Bottle (750ml)",
      }));
    }
  }

  async function recognizeBottleImage(source: Blob, target: "wine" | "wishlist" = "wine", applyRecognizedCandidate = true): Promise<WineImageRecognitionResult | null> {
    if (wineRecognitionLoading) return null;
    const formData = new FormData();
    const extension = source.type === "image/png" ? "png" : source.type === "image/webp" ? "webp" : "jpg";
    formData.append("image", source, `wine-bottle.${extension}`);
    formData.append("locale", locale);
    formData.append("known_text", (target === "wine" ? draft.name : wishlistDraft.name).trim());
    setWineRecognitionLoading(true);
    setWineRecognitionTarget(target);
    setWineImageRecognitionResult(null);
    try {
      const result = await api<WineImageRecognitionResult>("/api/v1/wines/catalog/recognize-bottle", {
        method: "POST",
        body: formData,
      });
      setWineImageRecognitionResult(result);
      if (applyRecognizedCandidate && (result.status === "recognized" || result.status === "ambiguous")) {
        applyWineImageCandidate(result, target);
      }
      await Promise.all([loadAiAudit(), loadAiSettings(), loadAiUsage(), loadBilling()]).catch(() => undefined);
      return result;
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : t("recognitionCouldNotIdentify"));
      return null;
    } finally {
      setWineRecognitionLoading(false);
    }
  }

  function wineRecognitionCandidateFromDraft(target: "wine" | "wishlist"): WineImageRecognitionCandidate {
    const targetDraft = target === "wine" ? draft : wishlistDraft;
    return {
      producer: targetDraft.producer.trim(),
      estate: "",
      wine_name: targetDraft.name.trim(),
      cuvee: "",
      vintage: targetDraft.vintage.trim(),
      appellation: targetDraft.appellation.trim(),
      region: targetDraft.region.trim(),
      country: selectedWineImageCandidate?.country || wineImageRecognitionResult?.country || "",
      wine_type: normalizeWineType(targetDraft.type),
    };
  }

  function wineRecognitionCandidateWasCorrected(
    original: WineImageRecognitionCandidate | null,
    confirmed: WineImageRecognitionCandidate,
  ) {
    if (!original) return false;
    const normalize = (value: string) => value.trim().toLocaleLowerCase();
    return normalize(confirmed.wine_name) !== normalize(wineImageCandidateName(original))
      || normalize(confirmed.producer) !== normalize(original.producer || original.estate)
      || normalize(confirmed.vintage) !== normalize(original.vintage)
      || normalize(confirmed.appellation) !== normalize(original.appellation);
  }

  async function registerConfirmedWineRecognition(
    recognitionId: string,
    candidate: WineImageRecognitionCandidate,
    corrected: boolean,
  ) {
    const result = await api<WineImageRecognitionConfirmationResult>("/api/v1/wines/catalog/recognition/confirm", {
      method: "POST",
      body: JSON.stringify({ recognition_id: recognitionId, corrected, candidate }),
    });
    const catalogMessage = result.catalog_status === "pending"
      ? (locale === "it" ? "Vino inviato al catalogo centrale per la validazione." : "Wine submitted to the central catalog for validation.")
      : result.catalog_status === "existing"
        ? (locale === "it" ? "Vino collegato al catalogo centrale." : "Wine linked to the central catalog.")
        : (locale === "it" ? "Riconoscimento confermato." : "Recognition confirmed.");
    const sensoryMessage = result.sensory_profile_status === "available"
      ? (locale === "it" ? "Firma sensoriale ricavata dai dati disponibili, senza un’ulteriore chiamata AI." : "Sensory signature derived from available data, without an additional AI request.")
      : result.sensory_profile_status === "pending"
        ? (locale === "it" ? "Profilo sensoriale inserito nella coda di completamento." : "Sensory profile added to the completion queue.")
        : "";
    setNotice([catalogMessage, sensoryMessage].filter(Boolean).join(" "));
    if (session?.is_app_admin && result.catalog_status === "pending") {
      await loadPendingCatalogEntries(true);
    }
    return result;
  }

  async function analyseWishlistLiveTaste(source: Blob): Promise<WishlistLiveTasteScan> {
    const recognition = await recognizeBottleImage(source, "wishlist", false);
    if (!recognition) throw new Error(t("recognitionCouldNotIdentify"));
    const name = wineImageCandidateName(recognition);
    let match = null;
    let matchFailed = false;
    if ((recognition.status === "recognized" || recognition.status === "ambiguous") && name) {
      const catalogMatch = recognition.matches[0];
      match = await api<import("./types").TasteMatch>("/api/v1/wishlist/taste-match-preview", {
        method: "POST",
        body: JSON.stringify({
          name,
          producer: recognition.producer || recognition.estate || catalogMatch?.producer || "",
          vintage: recognition.vintage || "",
          type: recognition.wine_type || catalogMatch?.type || "",
          region: recognition.region || catalogMatch?.region || "",
          appellation: recognition.appellation || catalogMatch?.appellation || "",
        }),
      }).catch(() => { matchFailed = true; return null; });
    }
    return { recognition, match, matchFailed };
  }

  function confirmWishlistLiveTaste(candidate: WineImageRecognitionCandidate) {
    applyWineImageCandidate(candidate, "wishlist");
    window.requestAnimationFrame(() => {
      wishlistNameInputRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    });
  }

  async function startFullEnrichmentFromRecognition(event: MouseEvent<HTMLButtonElement>) {
    if (wineEnrichmentLoading || wineRecognitionLoading || saving) return;
    const form = event.currentTarget.form;
    if (!form?.reportValidity()) return;
    const model = await requestAiModelAdvice(t("runAllWineAi"), "economy", aiSettings?.value_model || aiSettingsDraft.value_model);
    if (!model) return;
    wineCreationAiActionRef.current = { kind: "full", model };
    const progress = { itemName: [draft.name, draft.vintage].map((part) => part.trim()).filter(Boolean).join(" ") };
    flushSync(() => {
      setGeneratingAi("all");
      setAiOverlayRenderMode("all");
      setAiOverlayVisible(true);
      setAiOverlayProgress(progress);
    });
    await new Promise<void>((resolve) => window.requestAnimationFrame(() => resolve()));
    if (!form.isConnected) {
      wineCreationAiActionRef.current = null;
      setGeneratingAi("");
      setAiOverlayProgress(null);
      return;
    }
    form.requestSubmit();
  }

  function handleWineRecognitionInput(event: ChangeEvent<HTMLInputElement>, target: "wine" | "wishlist") {
    const file = event.target.files?.[0];
    if (file) void recognizeBottleImage(file, target);
    event.currentTarget.value = "";
  }

  function applySessionPreferences(nextSession: Session, includeDashboardFocus = false) {
    setLocale(nextSession.locale || "it");
    setThemePreference(nextSession.is_demo ? "atelier" : (nextSession.theme_preference || "system"));
    setDailyWineBudgetDraft(nextSession.daily_wine_budget_chf || "");
    if (includeDashboardFocus) {
      const nextFocus = nextSession.dashboard_focus || "collector";
      setPrimaryDashboardFocus(nextFocus);
      setDashboardFocus(nextFocus);
    }
  }

  useEffect(() => {
    if (!visibleError) return;
    errorBannerRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [visibleError]);

  useEffect(() => {
    if (!session?.authenticated) return;
    const query = (
      activeView === "wishlist" && wishlistFormOpen
        ? wishlistDraft.name
        : wineFormOpen
          ? draft.name
          : ""
    ).trim();
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
  }, [activeView, draft.name, wishlistDraft.name, wineFormOpen, wishlistFormOpen, session?.authenticated]);

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

  async function changePrimaryDashboardFocus(nextFocus: PrimaryDashboardFocus) {
    const previousFocus = primaryDashboardFocus;
    setPrimaryDashboardFocus(nextFocus);
    setDashboardFocus(nextFocus);
    if (!session?.authenticated || offlineMode) return;
    if (session.is_demo) {
      setSession(current => current?.is_demo ? { ...current, dashboard_focus: nextFocus } : current);
      return;
    }
    try {
      const nextSession = await api<Session>("/api/v1/auth/preferences", {
        method: "PATCH",
        body: JSON.stringify({ dashboard_focus: nextFocus }),
      });
      setSession(nextSession);
      setPrimaryDashboardFocus(nextSession.dashboard_focus || nextFocus);
    } catch (nextError) {
      setPrimaryDashboardFocus(previousFocus);
      setDashboardFocus(previousFocus);
      setError(nextError instanceof Error ? nextError.message : t("dashboardFocusSaveError"));
    }
  }

  async function savePersonalDashboard(widgets: PersonalDashboardWidget[]) {
    if (session?.is_demo) {
      setSession(current => current?.is_demo ? { ...current, personal_dashboard_widgets: widgets } : current);
      return;
    }
    const nextSession = await api<Session>("/api/v1/auth/preferences", {
      method: "PATCH",
      body: JSON.stringify({ personal_dashboard_widgets: widgets }),
    });
    setSession(nextSession);
  }

  async function saveDailyWineBudget() {
    const normalizedBudget = dailyWineBudgetDraft.trim().replace(",", ".");
    const parsedBudget = Number(normalizedBudget);
    if (normalizedBudget && (!Number.isFinite(parsedBudget) || parsedBudget <= 0 || parsedBudget > 100000)) {
      setError(t("dailyWineBudgetInvalid"));
      return;
    }
    if (!session?.authenticated || offlineMode) return;
    setSaving(true);
    setError("");
    try {
      const nextSession = await api<Session>("/api/v1/auth/preferences", {
        method: "PATCH",
        body: JSON.stringify({
          daily_wine_budget_chf: normalizedBudget ? parsedBudget : null,
        }),
      });
      setSession(nextSession);
      applySessionPreferences(nextSession);
      setNotice(t("dailyWineBudgetSaved"));
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : t("dailyWineBudgetSaveError"));
    } finally {
      setSaving(false);
    }
  }

  async function loadSession() {
    const nextSession = await api<Session>("/api/v1/session");
    setSession(nextSession);
    if (nextSession.authenticated) {
      applySessionPreferences(nextSession, true);
    }
    setHouseholdNameDraft(nextSession.active_household_name || "");
    return nextSession;
  }

  async function loadWines() {
    const nextWines = await api<Wine[]>("/api/v1/wines");
    setWines(nextWines);
    setSelectedWineId((currentId) => (currentId && nextWines.some((wine) => wine.id === currentId) ? currentId : null));
  }

  async function loadMerchants() {
    setMerchants(await api<Array<{ id: string; name: string }>>("/api/v1/merchants"));
  }

  async function loadPortfolioValueHistory() {
    setPortfolioValueHistory(await api<Array<{ recorded_at: string; value: string }>>("/api/v1/wines/value-history/portfolio"));
  }

  async function loadTastingArchive(offset = tastingArchiveOffset) {
    if (offlineMode || !session?.authenticated) {
      setTastingArchivePage(null);
      return;
    }
    setTastingArchiveLoading(true);
    try {
      const query = new URLSearchParams();
      if (tastingOrigin) query.set("origin", tastingOrigin);
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

  async function loadHouseholdMemberships() {
    setHouseholdMemberships(await api<HouseholdMembership[]>("/api/v1/household/memberships"));
  }

  async function loadAppUsers(isAppAdmin = session?.is_app_admin) {
    if (isAppAdmin) {
      const [nextUsers, nextPendingUsers] = await Promise.all([
        api<AppUser[]>("/api/v1/auth/users"),
        api<PendingUser[]>("/api/v1/auth/pending-users"),
      ]);
      const mergedUsers: AppUser[] = [
        ...nextUsers,
        ...nextPendingUsers
          .filter((pendingUser) => !nextUsers.some((user) => user.id === pendingUser.id))
          .map((pendingUser) => ({
            ...pendingUser,
            is_approved: false,
            is_app_admin: false,
            is_blocked: false,
            can_use_restaurant_mode: false,
            can_use_label_recognition: false,
            can_manage_wine_photos: false,
            has_demo_access: false,
            has_active_subscription: false,
            subscription_plan: null,
            subscription_cancel_at_period_end: false,
            access_override_until: null,
            ai_credit_balance_usd: "0.000000",
            approved_at: null,
            entitlement_valid_until: null,
            entitlement_days_remaining: null,
            last_activity_at: null,
            last_activity_days_ago: null,
          })),
      ].sort((first, second) => Number(first.is_approved) - Number(second.is_approved) || first.email.localeCompare(second.email));
      setAppUsers(mergedUsers);
      setPendingUsers(mergedUsers.filter((user) => !user.is_approved));
      setUserAiBalanceDrafts(Object.fromEntries(mergedUsers.map((user) => [user.id, String(Number(user.standard_ai_credit_balance_usd ?? user.ai_credit_balance_usd ?? 0).toFixed(2))])));
      setUserAiNoteDrafts((current) => Object.fromEntries(mergedUsers.map((user) => [user.id, current[user.id] || ""])));
      setUserAccessDaysDrafts((current) => Object.fromEntries(mergedUsers.map((user) => [
        user.id,
        current[user.id] ?? (user.entitlement_days_remaining === null ? "" : String(user.entitlement_days_remaining)),
      ])));
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
    if (mode === "register") {
      setRegistrationEmail("");
      setEmailVerificationConfirmed(false);
    }
    setAuthModalOpen(true);
    if (!isMobileViewport) {
      return;
    }
    window.requestAnimationFrame(() => {
      window.scrollTo({ top: 0, behavior: "smooth" });
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
          email: contactSupportDraft.email.trim(),
          subject: contactSupportDraft.subject.trim(),
          message: contactSupportDraft.message.trim(),
        }),
      });
      setContactSupportDraft(emptyContactSupportDraft);
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

  async function loadNotifications(
    authenticated = session?.authenticated,
    options: {
      category?: "all" | NotificationCenterCategory;
      view?: "active" | "archived";
      itemState?: "all" | "unread";
      offset?: number;
      append?: boolean;
    } = {},
  ) {
    if (authenticated) {
      const requestId = notificationRequestIdRef.current + 1;
      notificationRequestIdRef.current = requestId;
      const notificationScope = session?.user_email || "";
      if (observedNotificationScopeRef.current !== notificationScope) {
        observedNotificationScopeRef.current = notificationScope;
        observedNotificationKindsRef.current.clear();
      }
      const selectedCategory = options.category ?? notificationTab;
      const category = selectedCategory === "all" ? undefined : selectedCategory;
      const view = options.view ?? notificationView;
      const itemState = options.itemState ?? notificationStateFilter;
      const offset = options.offset ?? 0;
      const query = new URLSearchParams({
        view,
        item_state: itemState,
        offset: String(offset),
        limit: "20",
      });
      if (category) query.set("category", category);
      const center = await api<NotificationCenterResponse>(`/api/v1/notifications/center?${query}`);
      if (requestId !== notificationRequestIdRef.current) return;
      const items = center.items.map((item) => item.kind === "smart_to_collect"
        ? { ...item, category: "action" as const }
        : item);
      if (view === "active") items.forEach((item) => observedNotificationKindsRef.current.add(item.kind));
      const legacyReclassified = center.items.filter((item) => item.kind === "smart_to_collect" && item.category !== "action").length;
      const counts = {
        ...center.counts,
        attention: center.counts.attention ?? center.counts.total,
        actions: center.counts.actions + legacyReclassified,
        system: Math.max(center.counts.system - legacyReclassified, 0),
      };
      setNotificationCenter((current) => ({
        items: options.append
          ? [...current.items, ...items.filter((item) => !current.items.some((currentItem) => currentItem.id === item.id))]
          : items,
        counts,
        offset: center.offset ?? offset,
        next_offset: center.next_offset ?? null,
        has_more: center.has_more ?? false,
      }));
      if (view === "active" && itemState === "all") setNotificationActiveCounts(counts);
    } else {
      notificationRequestIdRef.current += 1;
      observedNotificationScopeRef.current = null;
      observedNotificationKindsRef.current.clear();
      setNotificationCenter({
        items: [],
        counts: { total: 0, unread: 0, actionable: 0, attention: 0, actions: 0, updates: 0, system: 0 },
        offset: 0,
        next_offset: null,
        has_more: false,
      });
      setNotificationActiveCounts({ total: 0, unread: 0, actionable: 0, attention: 0, actions: 0, updates: 0, system: 0 });
    }
  }

  async function loadOperationsMetrics() {
    const [overview, activity] = await Promise.all([
      api<OperationalMetricsOverview>("/api/v1/admin/operations/overview"),
      api<UserActivityLogEntry[]>("/api/v1/admin/operations/activity"),
    ]);
    setOperationsOverview(overview);
    setUserActivity(activity);
  }

  async function loadMyCoOwnershipAgreements(authenticated = session?.authenticated) {
    if (!authenticated || offlineMode) {
      setMyCoOwnershipAgreements([]);
      return;
    }
    setMyCoOwnershipAgreements(await api<CoOwnershipAgreement[]>("/api/v1/co-ownership-agreements/mine"));
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

  async function loadRegionalGapSettings(nextSession: Session) {
    const settings = await api<RegionalGapSettings>("/api/v1/household/regional-gap-settings");
    if (settings.targets.length) {
      const targets = normalizeRegionalTargets(settings.targets);
      const profileTargets = Object.fromEntries(
        Object.entries(settings.profile_targets || {}).map(([profile, profileTargetList]) => [
          profile,
          normalizeRegionalTargets(profileTargetList, targets),
        ]),
      ) as Partial<Record<RegionalGapProfile, RegionalGapTarget[]>>;
      const suggestionHistory = settings.ai_suggestions?.length
        ? settings.ai_suggestions
        : settings.last_ai_suggestion ? [settings.last_ai_suggestion] : [];
      const latestSuggestion = suggestionHistory[0] || settings.last_ai_suggestion;
      if (settings.last_ai_suggestion && !profileTargets[settings.last_ai_suggestion.profile]) {
        profileTargets[settings.last_ai_suggestion.profile] = normalizeRegionalTargets(
          settings.last_ai_suggestion.targets.map((target) => ({ region: target.region, targetPct: Number(target.target_pct) })),
          targets,
        );
      }
      setRegionalGapTargets(targets);
      setRegionalGapDraft(targets.map((target) => ({ region: target.region, targetPct: String(target.targetPct) })));
      setRegionalGapProfileTargets(profileTargets);
      setRegionalGapAiSuggestions(suggestionHistory);
      setRegionalGapAiSuggestion(latestSuggestion || null);
      if (latestSuggestion?.profile) setRegionalGapProfile(latestSuggestion.profile);
      return;
    }
    const targets = readRegionalGapTargets(nextSession.active_household_id);
    const suggestion = readRegionalGapSuggestion(nextSession.active_household_id);
    if (!targets.length && !suggestion) return;
    const normalized = normalizeRegionalTargets(targets);
    await api<RegionalGapSettings>("/api/v1/household/regional-gap-settings", { method: "PUT", body: JSON.stringify({ targets: normalized, last_ai_suggestion: suggestion }) });
    window.localStorage.removeItem(regionalGapStorageKey(nextSession.active_household_id));
    window.localStorage.removeItem(regionalGapAiSuggestionStorageKey(nextSession.active_household_id));
    setRegionalGapTargets(normalized);
    setRegionalGapDraft(normalized.map((target) => ({ region: target.region, targetPct: String(target.targetPct) })));
    setRegionalGapAiSuggestion(suggestion);
  }

  async function loadOperationalActionSnoozes(nextSession: Session) {
    const scope = `${nextSession.user_email || "anonymous"}:${nextSession.active_household_id || "offline"}`;
    const localSnoozes = Object.entries(readOperationalActionSnoozes())
      .flatMap(([key, snooze]) => (
        key.startsWith(`${scope}:`) && snooze.until > Date.now()
          ? [{ action_id: key.slice(scope.length + 1), signature: snooze.signature, until: new Date(snooze.until).toISOString() }]
          : []
      ));
    const remoteSnoozes = await api<OperationalActionSnoozeRecord[]>("/api/v1/household/operational-action-snoozes");
    const remoteActionIds = new Set(remoteSnoozes.map((snooze) => snooze.action_id));
    const missingSnoozes = localSnoozes.filter((snooze) => !remoteActionIds.has(snooze.action_id));
    if (missingSnoozes.length) {
      await Promise.all(missingSnoozes.map((snooze) => (
        api<OperationalActionSnoozeRecord>("/api/v1/household/operational-action-snoozes", {
          method: "POST",
          body: JSON.stringify(snooze),
        })
      )));
    }
    const persistedSnoozes = [...remoteSnoozes, ...missingSnoozes];
    const nextSnoozes = Object.fromEntries(persistedSnoozes.map((snooze) => [
      `${scope}:${snooze.action_id}`,
      { signature: snooze.signature, until: new Date(snooze.until).getTime() },
    ])) as OperationalActionSnoozes;
    setOperationalActionSnoozes(nextSnoozes);
    for (const snooze of localSnoozes) clearOperationalActionSnooze(`${scope}:${snooze.action_id}`);
  }

  async function loadAuthenticatedSessionData(nextSession: Session) {
    const [nextLists] = await Promise.all([
      loadWishlistLists(),
      loadWines(),
      loadMerchants(),
      loadPortfolioValueHistory(),
      loadNotifications(nextSession.authenticated),
      nextSession.is_app_admin
        ? loadPendingCatalogEntries(true)
        : Promise.resolve(),
      loadBilling(nextSession.authenticated, nextSession.is_app_admin),
      loadHouseholdMemberships(),
      loadMyCoOwnershipAgreements(nextSession.authenticated),
      loadRegionalGapSettings(nextSession),
      loadOperationalActionSnoozes(nextSession),
    ]);
    const activeWishlistListId = selectedWishlistListId && nextLists.some((item) => item.id === selectedWishlistListId)
      ? selectedWishlistListId
      : nextLists[0]?.id || "";

    window.setTimeout(() => {
      void Promise.allSettled([
        loadWishlist(activeWishlistListId),
        loadShareOffers(nextSession.authenticated),
        loadReceivedInvites(nextSession.authenticated),
        loadTags(nextSession.membership_role),
        loadAiSettings(nextSession.membership_role),
        loadTastingArchiveOverview(nextSession.authenticated),
      ]);
    }, 300);
  }

  function loadSettingsTabData(tab: SettingsTab) {
    if (!session?.authenticated || offlineMode) return;
    const reportError = (nextError: unknown) => setError(nextError instanceof Error ? nextError.message : "Unable to load settings data");
    if (tab === "profile") {
      void Promise.all([loadPasskeys(true), loadBilling(true, session.is_app_admin)]).catch(reportError);
    } else if (tab === "ai") {
      void Promise.all([loadAiAudit(session.membership_role), loadAiUsage(session.membership_role), loadAiSettings(session.membership_role)]).catch(reportError);
    } else if (tab === "restaurant") {
      void loadHouseholdMemberships().catch(reportError);
    } else if (tab === "tags") {
      void loadTags(session.membership_role).catch(reportError);
    } else if (tab === "sharing") {
      void Promise.all([loadHouseholdData(session.membership_role), loadShareOffers(true), loadReceivedInvites(true), loadMyCoOwnershipAgreements()]).catch(reportError);
    } else if (tab === "users" && session.is_app_admin) {
      void Promise.all([loadAppUsers(true), loadBilling(true, true)]).catch(reportError);
    } else if (tab === "operations" && session.is_app_admin) {
      void Promise.all([loadOperationsMetrics(), loadPendingCatalogEntries(true)]).catch(reportError);
    }
  }

  async function loadData() {
    if (offlineMode) return;
    setLoading(true);
    setError("");
    try {
      const nextSession = await loadSession();
      if (nextSession.authenticated) {
        if (nextSession.requires_legal_acceptance) {
          setWines([]);
          setMerchants([]);
          setWineCatalog([]);
          setWishlist([]);
          setWishlistLists([]);
          setShareOffers([]);
          setReceivedInvites([]);
          setNotificationCenter({ items: [], counts: { total: 0, unread: 0, actionable: 0, attention: 0, actions: 0, updates: 0, system: 0 }, offset: 0, next_offset: null, has_more: false });
          setNotificationActiveCounts({ total: 0, unread: 0, actionable: 0, attention: 0, actions: 0, updates: 0, system: 0 });
        } else {
          await loadAuthenticatedSessionData(nextSession);
        }
      } else {
        setWines([]);
        setMerchants([]);
        setWineCatalog([]);
        setWishlist([]);
        setWishlistLists([]);
        setShareOffers([]);
        setReceivedInvites([]);
        setNotificationCenter({ items: [], counts: { total: 0, unread: 0, actionable: 0, attention: 0, actions: 0, updates: 0, system: 0 }, offset: 0, next_offset: null, has_more: false });
        setNotificationActiveCounts({ total: 0, unread: 0, actionable: 0, attention: 0, actions: 0, updates: 0, system: 0 });
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
      if (nextSession.authenticated && !nextSession.requires_legal_acceptance) {
        const nextStatus = await api<BillingStatus>("/api/v1/billing/status");
        setBillingStatus(nextStatus);
        const nextAiBalance = Number(nextStatus.ai_credit_balance_usd || 0);
        const checkoutApplied =
          pendingPlan === "ai_credits"
            ? nextAiBalance > previousAiBalance
            : (nextStatus.available_redeem_codes.length > 0 || nextStatus.has_active_entitlement);
        if (checkoutApplied) {
          if (pendingPlan) reportGoogleAdsCheckoutConversion(pendingPlan);
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
    loader.catch((nextError) => {
      const nextMessage = nextError instanceof Error ? nextError.message : "Unable to load data";
      if (isConnectivityError(nextMessage)) {
        setShowOfflineBackupPanel(true);
      }
      setError(nextMessage);
    });
  }, []);

  useEffect(() => {
    if (!session?.authenticated) return;
    let notificationRefreshInFlight = false;
    let accountRefreshInFlight = false;
    const refreshNotifications = () => {
      if (document.hidden || notificationRefreshInFlight) return;
      notificationRefreshInFlight = true;
      Promise.all([
        notificationsOpen && notificationCenter.items.length > 20
          ? Promise.resolve()
          : loadNotifications(true),
        session.is_app_admin
          ? loadPendingCatalogEntries(true)
          : Promise.resolve(),
      ]).catch(() => undefined).finally(() => {
        notificationRefreshInFlight = false;
      });
    };
    const refreshAccountData = () => {
      if (document.hidden || accountRefreshInFlight) return;
      accountRefreshInFlight = true;
      Promise.all([
        loadReceivedInvites(true),
        loadShareOffers(true),
        loadMyCoOwnershipAgreements(true),
        loadBilling(true, session.is_app_admin),
        loadAiSettings(session.membership_role, false),
      ]).catch(() => undefined).finally(() => {
        accountRefreshInFlight = false;
      });
    };
    const notificationTimer = window.setInterval(refreshNotifications, 30000);
    const accountTimer = window.setInterval(refreshAccountData, 120000);
    return () => {
      window.clearInterval(notificationTimer);
      window.clearInterval(accountTimer);
    };
  }, [session?.authenticated, session?.is_app_admin, session?.membership_role, notificationTab, notificationView, notificationStateFilter, notificationsOpen, notificationCenter.items.length]);

  useEffect(() => {
    const darkQuery = window.matchMedia("(prefers-color-scheme: dark)");
    const applyTheme = () => {
      const resolvedTheme = themePreference === "system" ? (darkQuery.matches ? "dark" : "light") : themePreference;
      const root = document.documentElement;
      const commit = () => {
        root.dataset.theme = resolvedTheme;
        root.dataset.themePreference = themePreference;
        root.dataset.themeTone = surfaceIsDark() ? "dark" : "light";
      };
      // A real switch between two themes cross-fades; the first paint does not.
      const switching = Boolean(root.dataset.theme) && root.dataset.theme !== resolvedTheme;
      if (switching && typeof document.startViewTransition === "function" && !window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
        document.startViewTransition(commit);
      } else {
        commit();
      }
    };
    applyTheme();
    darkQuery.addEventListener("change", applyTheme);
    return () => darkQuery.removeEventListener("change", applyTheme);
  }, [themePreference]);

  useEffect(() => {
    const mediaQuery = window.matchMedia("(max-width: 1099px)");
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
    let frame = 0;
    const syncScrollState = () => {
      if (frame) return;
      frame = window.requestAnimationFrame(() => {
        frame = 0;
        const nextVisible = window.scrollY > 520;
        if (nextVisible === backToTopVisibleRef.current) return;
        backToTopVisibleRef.current = nextVisible;
        setShowBackToTop(nextVisible);
      });
    };
    syncScrollState();
    window.addEventListener("scroll", syncScrollState, { passive: true });
    return () => {
      window.removeEventListener("scroll", syncScrollState);
      if (frame) window.cancelAnimationFrame(frame);
    };
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
          ? {
              email: authDraft.email,
              display_name: authDraft.display_name,
              household_name: authDraft.household_name.trim() || "Main Cellar",
              password: authDraft.password,
              locale,
              legal_document_version: LEGAL_DOCUMENT_VERSION,
              privacy_policy_accepted: authDraft.privacy_policy_accepted,
              terms_accepted: authDraft.terms_accepted,
              photo_usage_disclaimer_accepted: authDraft.photo_usage_disclaimer_accepted,
            }
          : { email: authDraft.email, password: authDraft.password };
      const nextSession = await api<Session>(path, { method: "POST", body: JSON.stringify(payload) });
      setSession(nextSession);
      if (authMode === "register") {
        setEmailVerificationConfirmed(false);
        setRegistrationEmail(authDraft.email.trim());
        setResendVerificationEmail(authDraft.email.trim());
      }
      if (nextSession.authenticated) {
        applySessionPreferences(nextSession, true);
      }
      setShowOfflineBackupPanel(false);
      setAuthDraft(emptyAuthDraft);
      if (nextSession.authenticated && !nextSession.requires_legal_acceptance) {
        setLoading(true);
        try {
          await loadAuthenticatedSessionData(nextSession);
        } finally {
          setLoading(false);
        }
      }
    } catch (nextError) {
      const nextMessage = nextError instanceof Error ? nextError.message : "Unable to authenticate";
      const normalizedAuthError = nextMessage.toLowerCase();
      if (
        normalizedAuthError.includes("email verification required")
        || (authMode === "register" && normalizedAuthError.includes("email already registered"))
      ) {
        setResendVerificationEmail(authDraft.email.trim());
        if (authMode === "register") setAuthMode("login");
      }
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
      setNotice("");
      setAuthMode("login");
      setAuthModalOpen(true);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Unable to confirm email");
    } finally {
      setSaving(false);
    }
  }

  async function resendEmailVerification() {
    const email = resendVerificationEmail.trim();
    if (!email) return;
    setSaving(true);
    setError("");
    setNotice("");
    try {
      await api<void>("/api/v1/auth/verify-email/resend", {
        method: "POST",
        body: JSON.stringify({ email }),
      });
      setNotice(locale === "it" ? "Se l'account richiede la conferma, abbiamo inviato un nuovo link." : "If this account requires confirmation, we sent a new link.");
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Unable to resend verification email");
    } finally {
      setSaving(false);
    }
  }

  function focusLoginAfterVerification() {
    setAuthMode("login");
    window.requestAnimationFrame(() => {
      document.getElementById("auth-login-email")?.focus();
    });
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
      applySessionPreferences(nextSession, true);
      setAuthDraft(emptyAuthDraft);
      setShowOfflineBackupPanel(false);
      if (!nextSession.requires_legal_acceptance) {
        setLoading(true);
        try {
          await loadAuthenticatedSessionData(nextSession);
        } finally {
          setLoading(false);
        }
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

  async function enterDemo() {
    setSaving(true);
    setError("");
    try {
      const nextSession = await api<Session>(`/api/v1/auth/demo?locale=${locale}`, { method: "POST" });
      setSession(nextSession);
      applySessionPreferences(nextSession, true);
      setAuthModalOpen(false);
      setShowOfflineBackupPanel(false);
      setLoading(true);
      try {
        await loadAuthenticatedSessionData(nextSession);
      } finally {
        setLoading(false);
      }
      setActiveView("home");
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : (locale === "it" ? "Cantina demo non disponibile" : "Demo cellar unavailable"));
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

  async function deleteOwnAccount() {
    const currentEmail = session?.user_email || "";
    if (
      accountDeletionEmail.trim().toLowerCase() !== currentEmail.toLowerCase()
      || !accountDeletionPassword
    ) return;
    if (!window.confirm(t("deleteAccountFinalConfirmation"))) return;

    setSaving(true);
    setError("");
    try {
      await api<void>("/api/v1/auth/account", {
        method: "DELETE",
        body: JSON.stringify({
          confirmation_email: accountDeletionEmail.trim(),
          password: accountDeletionPassword,
        }),
      });
      window.location.assign("/");
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : t("deleteAccountError"));
      setAccountDeletionPassword("");
    } finally {
      setSaving(false);
    }
  }

  async function logout() {
    setOnboardingMode("auto");
    setError("");
    if (!offlineMode) {
      await api<void>("/api/v1/auth/logout", { method: "POST" });
    }
    setOfflineMode(false);
    resetHomeBackdropSession();
    setOfflineFileName("");
    setSession({
      authenticated: false,
      user_display_name: null,
      user_email: null,
      active_household_id: null,
      active_household_name: null,
      active_household_mode: "private",
      restaurant_mode_available: false,
      membership_role: null,
      is_app_admin: false,
      is_demo: false,
      pending_approval: false,
      pending_email_verification: false,
      locale: navigator.language.toLowerCase().startsWith("it") ? "it" : "en",
      theme_preference: "system",
      dashboard_focus: "collector",
      daily_wine_budget_chf: null,
      can_use_label_recognition: false,
      can_manage_wine_photos: false,
      cellar_ai_assistant_available: false,
      has_active_entitlement: false,
      entitlement_valid_until: null,
      entitlement_days_remaining: null,
    });
    setLocale(navigator.language.toLowerCase().startsWith("it") ? "it" : "en");
    setThemePreference("system");
    setPrimaryDashboardFocus("collector");
    setDashboardFocus("collector");
    setWines([]);
    setWineCatalog([]);
    setWishlist([]);
    setShareOffers([]);
    setReceivedInvites([]);
    setNotificationCenter({ items: [], counts: { total: 0, unread: 0, actionable: 0, attention: 0, actions: 0, updates: 0, system: 0 }, offset: 0, next_offset: null, has_more: false });
    setNotificationActiveCounts({ total: 0, unread: 0, actionable: 0, attention: 0, actions: 0, updates: 0, system: 0 });
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
              active_household_mode: updatedMembership.operating_mode,
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

  async function respondToReceivedInvite(invite: Invite, decision: "accept" | "decline") {
    setSaving(true);
    setError("");
    try {
      await api<void>(`/api/v1/household/invites/${invite.id}/${decision}`, { method: "POST" });
      setReceivedInvites((current) => current.filter((item) => item.id !== invite.id));
      const cellar = invite.household_name || (locale === "it" ? "la cantina" : "the cellar");
      setNotice(decision === "accept"
        ? (locale === "it" ? `Ora fai parte di ${cellar}: la trovi tra le tue cantine.` : `You are now part of ${cellar}: find it among your cellars.`)
        : (locale === "it" ? `Invito a ${cellar} rifiutato.` : `Invitation to ${cellar} declined.`));
      if (decision === "accept") await loadData();
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Unable to answer the invitation");
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

  async function toggleRestaurantModeAccess(user: AppUser) {
    setSaving(true);
    setError("");
    try {
      await api<AppUser>(`/api/v1/auth/users/${user.id}`, {
        method: "PATCH",
        body: JSON.stringify({ can_use_restaurant_mode: !user.can_use_restaurant_mode }),
      });
      await loadAppUsers();
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Unable to update restaurant access");
    } finally {
      setSaving(false);
    }
  }

  async function toggleWinePhotoAccess(user: AppUser) {
    setSaving(true);
    setError("");
    try {
      await api<AppUser>(`/api/v1/auth/users/${user.id}`, {
        method: "PATCH",
        body: JSON.stringify({ can_manage_wine_photos: !user.can_manage_wine_photos }),
      });
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

  async function updateUserAmbassador(user: AppUser, change: AmbassadorChange) {
    setSaving(true);
    setError("");
    try {
      await api<AppUser>(`/api/v1/auth/users/${user.id}`, { method: "PATCH", body: JSON.stringify(change) });
      await loadAppUsers();
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Unable to update Ambassador affiliation");
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

  function catalogMetadataSaved(entry: CatalogWine) {
    setCatalogAdminResults(current => current.map(item => item.id === entry.id ? entry : item));
    setPendingCatalogEntries(current => current.map(item => item.id === entry.id ? entry : item));
    setWineCatalog(current => current.map(item => item.id === entry.id ? entry : item));
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
      if (!notification.read_at) {
        setNotificationActiveCounts((current) => ({
          ...current,
          unread: Math.max(current.unread - 1, 0),
        }));
      }
      await loadNotifications(true);
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
    } else if (notification.action_url?.includes("/settings/sharing")) {
      setActiveView("settings");
      setSettingsTab("sharing");
      loadSettingsTabData("sharing");
    } else if (notification.action_url?.includes("/settings/users")) {
      setActiveView("settings");
      setSettingsTab("users");
      loadSettingsTabData("users");
    } else if (notification.action_url?.includes("focus=timeline")) {
      setActiveView("home");
      setDashboardFocus("timeline");
    } else if (notification.action_url?.includes("/home")) {
      setActiveView("home");
    } else if (notification.action_url?.includes("/pulse")) {
      setActiveView("pulse");
    } else if (notification.action_url?.includes("/cellar")) {
      const url = new URL(notification.action_url, window.location.origin);
      const wineId = url.searchParams.get("wine_id");
      if (wineId) {
        const targetWine = wines.find((wine) => wine.id === wineId) || await loadWineDetail(wineId);
        setCoOwnershipFocusRequest({ wineId, requestId: notification.id });
        openWineInView(targetWine, "cellar");
      } else {
        setActiveView("cellar");
      }
    } else if (notification.action_url?.includes("/wishlist")) {
      setActiveView("wishlist");
    } else if (notification.action_url?.includes("/history")) {
      if (notification.action_url.includes("section=tastings")) setHistorySection("tastings");
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

  async function recordCoOwnershipPayment(
    wine: Wine,
    agreement: CoOwnershipAgreement,
    participantId: string,
    payload: { amount: number; paid_on: string; note: string },
  ) {
    setSaving(true);
    setError("");
    try {
      await api(`/api/v1/co-ownership-agreements/${agreement.id}/participants/${participantId}/payments`, {
        method: "POST",
        body: JSON.stringify(payload),
      });
      await loadCoOwnershipAgreements(wine.id);
      setNotice(locale === "it" ? "Rimborso registrato." : "Reimbursement recorded.");
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Unable to record reimbursement");
      throw nextError;
    } finally {
      setSaving(false);
    }
  }

  async function voidCoOwnershipPayment(
    wine: Wine,
    agreement: CoOwnershipAgreement,
    paymentId: string,
  ) {
    setSaving(true);
    setError("");
    try {
      await api(`/api/v1/co-ownership-agreements/${agreement.id}/payments/${paymentId}`, { method: "DELETE" });
      await loadCoOwnershipAgreements(wine.id);
      setNotice(locale === "it" ? "Registrazione annullata." : "Payment record voided.");
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Unable to void reimbursement");
      throw nextError;
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
      await Promise.all([loadWines(), loadNotifications(true)]);
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
        active_household_mode: rawString(household.operating_mode) === "restaurant" ? "restaurant" : "private",
        restaurant_mode_available: false,
        membership_role: "offline",
        is_app_admin: false,
        is_demo: false,
        pending_approval: false,
        pending_email_verification: false,
        locale,
        theme_preference: themePreference,
        dashboard_focus: primaryDashboardFocus,
        daily_wine_budget_chf: dailyWineBudgetDraft.trim() || null,
        can_use_label_recognition: false,
        can_manage_wine_photos: false,
        cellar_ai_assistant_available: false,
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
      setNotificationCenter({ items: [], counts: { total: 0, unread: 0, actionable: 0, attention: 0, actions: 0, updates: 0, system: 0 }, offset: 0, next_offset: null, has_more: false });
      setNotificationActiveCounts({ total: 0, unread: 0, actionable: 0, attention: 0, actions: 0, updates: 0, system: 0 });
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

  async function acceptNotificationInvite(item: NotificationCenterItem) {
    if (!item.resource_id) return;
    setSaving(true);
    setError("");
    try {
      await api<Member>(`/api/v1/household/invites/${item.resource_id}/accept`, { method: "POST" });
      setNotificationsOpen(false);
      await loadData();
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Unable to accept invite");
    } finally {
      setSaving(false);
    }
  }

  async function markAllNotificationsRead() {
    setError("");
    try {
      await api<void>("/api/v1/notifications/read-all", { method: "POST" });
      setNotificationActiveCounts((current) => ({ ...current, unread: 0 }));
      await loadNotifications(true);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Unable to update notifications");
    }
  }

  async function archiveNotification(item: NotificationCenterItem) {
    if (item.source !== "notification") return;
    setError("");
    try {
      await api<void>(`/api/v1/notifications/${item.id}/archive`, { method: "POST" });
      await loadNotifications(true);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Unable to archive notification");
    }
  }

  async function restoreNotification(item: NotificationCenterItem) {
    if (item.source !== "notification") return;
    setError("");
    try {
      await api<void>(`/api/v1/notifications/${item.id}/restore`, { method: "POST" });
      await loadNotifications(true);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Unable to restore notification");
    }
  }

  async function deleteNotification(item: NotificationCenterItem) {
    if (item.source !== "notification") return;
    const confirmed = window.confirm(locale === "it"
      ? "Eliminare definitivamente questa notifica? Non potrà essere recuperata."
      : "Permanently delete this notification? It cannot be recovered.");
    if (!confirmed) return;
    setSaving(true);
    setError("");
    try {
      await api<void>(`/api/v1/notifications/${item.id}`, { method: "DELETE" });
      await loadNotifications(true);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Unable to delete notification");
    } finally {
      setSaving(false);
    }
  }

  function selectNotificationTab(category: "all" | NotificationCenterCategory) {
    setNotificationTab(category);
    void loadNotifications(true, { category, offset: 0 });
  }

  function selectNotificationView(view: "active" | "archived") {
    setNotificationView(view);
    const itemState = view === "archived" ? "all" : notificationStateFilter;
    if (view === "archived") setNotificationStateFilter("all");
    void loadNotifications(true, { view, itemState, offset: 0 });
  }

  function selectNotificationStateFilter(itemState: "all" | "unread") {
    setNotificationStateFilter(itemState);
    void loadNotifications(true, { itemState, offset: 0 });
  }

  function loadMoreNotifications() {
    if (notificationCenter.next_offset === null) return;
    void loadNotifications(true, { offset: notificationCenter.next_offset, append: true });
  }

  async function decideNotificationShareOffer(item: NotificationCenterItem, decision: "accept" | "decline") {
    if (!item.resource_id) return;
    setSaving(true);
    setError("");
    try {
      await api<Wine | WineShareOffer>(`/api/v1/wines/share-offers/${item.resource_id}/${decision}`, { method: "POST" });
      await Promise.all([loadWines(), loadShareOffers(true), loadNotifications(true)]);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Unable to update share offer");
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
    const optionalYear = (value: string) => {
      const year = Number(value);
      return value.trim() && Number.isInteger(year) ? year : null;
    };
    const drinkFrom = optionalYear(draft.drink_from);
    const drinkTo = optionalYear(draft.drink_to);
    const drinkPeakFrom = optionalYear(draft.drink_peak_from) ?? drinkFrom;
    const drinkPeakTo = optionalYear(draft.drink_peak_to) ?? drinkTo;
    if ((drinkFrom === null) !== (drinkTo === null)) {
      setError(locale === "it" ? "Per impostare la finestra di beva, indica sia l'anno iniziale sia quello finale." : "Set both the start and end years for the drinking window.");
      wineCreationAiActionRef.current = null;
      setGeneratingAi("");
      setAiOverlayProgress(null);
      return;
    }
    if (drinkFrom !== null && drinkTo !== null && !(drinkFrom <= drinkPeakFrom! && drinkPeakFrom! <= drinkPeakTo! && drinkPeakTo! <= drinkTo)) {
      setError(locale === "it" ? "Il picco deve rientrare nella finestra di beva." : "The peak period must fall within the drinking window.");
      wineCreationAiActionRef.current = null;
      setGeneratingAi("");
      setAiOverlayProgress(null);
      return;
    }
    setSaving(true);
    setError("");
    let createdWineIdForFull: string | null = null;
    const recognitionContribution = !editingId && wineRecognitionTarget === "wine" && wineImageRecognitionResult
      ? {
          recognitionId: wineImageRecognitionResult.recognition_id,
          candidate: wineRecognitionCandidateFromDraft("wine"),
          original: selectedWineImageCandidate || wineImageRecognitionResult,
        }
      : null;
    try {
      const payload = draftPayload(draft);
      if (editingId) {
        const { storage_allocations, ...updatePayload } = payload;
        void storage_allocations;
        await api<Wine>(`/api/v1/wines/${editingId}`, { method: "PATCH", body: JSON.stringify(updatePayload) });
      } else {
        const created = await api<Wine>("/api/v1/wines", { method: "POST", body: JSON.stringify(payload) });
        if (recognitionContribution) {
          try {
            await registerConfirmedWineRecognition(
              recognitionContribution.recognitionId,
              recognitionContribution.candidate,
              wineRecognitionCandidateWasCorrected(
                recognitionContribution.original,
                recognitionContribution.candidate,
              ),
            );
          } catch {
            // Catalog contribution must never block creation of the private cellar record.
          }
        }
        if (pendingBottlePhoto) {
          const formData = new FormData();
          formData.append("thumbnail_image", pendingBottlePhoto.thumbnail, "bottle-thumbnail.png");
          formData.append("detail_image", pendingBottlePhoto.detail, "bottle-detail.png");
          try {
            await api<Wine>(`/api/v1/wines/${created.id}/photo`, { method: "PUT", body: formData });
          } catch {
            setError(locale === "it"
              ? "Il vino è stato creato, ma la foto non è stata salvata. Puoi aggiungerla dal dettaglio."
              : "The wine was created, but its photo was not saved. You can add it from the detail view.");
          }
        } else if (selectedSuggestedPhotoId) {
          try {
            await api<Wine>(`/api/v1/wines/${created.id}/photo/reuse/${selectedSuggestedPhotoId}`, { method: "POST" });
          } catch {
            setError(locale === "it"
              ? "Il vino è stato creato, ma la foto proposta non è più disponibile. Puoi aggiungerne una dal dettaglio."
              : "The wine was created, but the suggested photo is no longer available. You can add one from the detail view.");
          }
        }
        const creationAiAction = wineCreationAiActionRef.current;
        wineCreationAiActionRef.current = null;
        if (creationAiAction?.kind === "full") {
          try {
            await api<Wine>(`/api/v1/ai/wines/${created.id}/all`, {
              method: "POST",
              body: JSON.stringify({ locale, model: creationAiAction.model, force_refresh: false }),
            });
            createdWineIdForFull = created.id;
          } catch (nextError) {
            setError(nextError instanceof Error ? nextError.message : "Unable to run full wine enrichment");
          }
        }
      }
      setDraft(emptyDraft);
      setPendingBottlePhoto(null);
      setWinePhotoSuggestions([]);
      setWinePhotoSuggestionIndex(0);
      setSelectedSuggestedPhotoId(null);
      setEditingId(null);
      setSelectedWineId(createdWineIdForFull);
      setWineFormOpen(false);
      if (recognitionContribution) clearWineRecognitionState();
      await Promise.all([loadWines(), loadMerchants()]);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Unable to save wine");
    } finally {
      setSaving(false);
      setGeneratingAi("");
      setAiOverlayProgress(null);
    }
  }

  async function submitWishlist(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!wishlistDraft.name.trim()) return;
    setSaving(true);
    setError("");
    const recognitionContribution = !editingWishlistId && wineRecognitionTarget === "wishlist" && wineImageRecognitionResult
      ? {
          recognitionId: wineImageRecognitionResult.recognition_id,
          candidate: wineRecognitionCandidateFromDraft("wishlist"),
          original: selectedWineImageCandidate || wineImageRecognitionResult,
        }
      : null;
    try {
      const payload = wishlistPayload(wishlistDraft);
      if (editingWishlistId) {
        await api<WishlistItem>(`/api/v1/wishlist/${editingWishlistId}`, { method: "PATCH", body: JSON.stringify(payload) });
      } else {
        await api<WishlistItem>("/api/v1/wishlist", { method: "POST", body: JSON.stringify(payload) });
      }
      if (recognitionContribution) {
        try {
          await registerConfirmedWineRecognition(
            recognitionContribution.recognitionId,
            recognitionContribution.candidate,
            wineRecognitionCandidateWasCorrected(
              recognitionContribution.original,
              recognitionContribution.candidate,
            ),
          );
        } catch {
          // Catalog contribution must never block creation of the private wishlist item.
        }
      }
      setWishlistPortfolioStrategy(null);
      setWishlistDraft({ ...emptyWishlistDraft, wishlist_list_id: selectedWishlistListId });
      setEditingWishlistId(null);
      setWishlistFormOpen(false);
      if (recognitionContribution) clearWineRecognitionState();
      await Promise.all([loadWishlist(), loadWishlistLists(), loadMerchants()]);
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
      setCellarTrackerCsvText("");
      setImportSource("vinaris");
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
    if (!importPayload && !cellarTrackerCsvText) return;
    if (importMode === "replace_all") {
      const firstConfirm = window.confirm("Questa operazione cancella prima tutti i vini e la wishlist della cantina attiva. Continuare?");
      if (!firstConfirm) return;
      const secondConfirm = window.confirm("Conferma definitiva: sostituire completamente la cantina con il JSON selezionato?");
      if (!secondConfirm) return;
    }
    setSaving(true);
    setError("");
    try {
      const endpoint = importSource === "cellartracker" ? "/api/v1/imports/cellartracker" : "/api/v1/imports/json";
      const body = importSource === "cellartracker"
        ? { csv_base64: cellarTrackerCsvText }
        : { ...importPayload, import_blocks: exportBlocks.filter(({ key }) => importSelection[key]).map(({ key }) => key) };
      const result = await api<ImportResult>(`${endpoint}?mode=${importMode}`, {
        method: "POST",
        body: JSON.stringify(body),
      });
      setImportResult(result);
      setImportPreview(null);
      setImportPayload(null);
      setCellarTrackerCsvText("");
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
    const secondConfirm = window.confirm("Conferma definitiva: svuotare la cantina? L'operazione non è reversibile senza backup/export.");
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
      const attachedDocuments = await api<Array<{ id: string; filename: string }>>(`/api/v1/imports/purchases/documents?wine_id=${encodeURIComponent(wine.id)}`).catch(() => []);
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
      if (attachedDocuments.length) {
        try {
          const unlinked = await api<Array<{ id: string; filename: string }>>("/api/v1/imports/purchases/documents?unlinked_only=true");
          for (const document of unlinked.filter(item => attachedDocuments.some(previous => previous.id === item.id))) {
            if (window.confirm(locale === "it"
              ? `Il vino è stato eliminato. “${document.filename}” non è più collegato ad alcun vino. Vuoi eliminare definitivamente anche il documento? Se lo conservi, rimane nell’archivio documenti degli acquisti.`
              : `The wine was deleted. “${document.filename}” is no longer linked to any wine. Permanently delete the document too? If kept, it remains in the purchase document archive.`)) {
              await api<void>(`/api/v1/imports/purchases/${document.id}/document?only_unlinked=true`, { method: "DELETE" });
            }
          }
        } catch {
          setError(locale === "it" ? "Il vino è stato eliminato. Non è stato possibile completare la gestione dei documenti: controlla l’archivio documenti degli acquisti." : "The wine was deleted. Document cleanup could not be completed: check the purchase document archive.");
        }
      }
    } finally {
      setSaving(false);
    }
  }

  async function deleteWishlistItem(item: WishlistItem) {
    if (!window.confirm(`Delete ${item.name} from wishlist?`)) return;
    setError("");
    await api<void>(`/api/v1/wishlist/${item.id}`, { method: "DELETE" });
    setWishlistPortfolioStrategy(null);
    if (editingWishlistId === item.id) {
      setEditingWishlistId(null);
      setWishlistDraft({ ...emptyWishlistDraft, wishlist_list_id: selectedWishlistListId });
      setWishlistFormOpen(false);
    }
    await Promise.all([loadWishlist(), loadWishlistLists()]);
  }

  function startWishlistConversion(item: WishlistItem) {
    setWishlistConversionItem(item);
    setWishlistConversionQuantity("1");
  }

  async function convertWishlistItem(item: WishlistItem, quantity: number) {
    setSaving(true);
    setError("");
    try {
      await api<{ wine_id: string }>(`/api/v1/wishlist/${item.id}/convert`, { method: "POST", body: JSON.stringify({ quantity }) });
      setWishlistPortfolioStrategy(null);
      setWishlistFormOpen(false);
      setEditingWishlistId(null);
      setWishlistConversionItem(null);
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
      await api<void>(`/api/v1/notifications/${notification.id}/archive`, { method: "POST" });
      await Promise.all([loadWines(), loadNotifications(true)]);
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
      all: { label: t("runAllWineAi"), role: "economy" as const, model: aiSettings?.value_model || aiSettingsDraft.value_model },
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
    const forceRefresh = feature === "notes"
      ? Boolean(wine.ai_notes)
      : feature === "drink-window"
        ? Boolean(wine.drink_from || wine.drink_peak_from || wine.drink_peak_to || wine.drink_to)
        : feature === "value"
          ? wine.current_value !== null
          : feature === "grapes"
            ? wine.grapes.length > 0
            : feature === "scores"
              ? wine.scores.length > 0
              : false;
    setGeneratingAi(feature);
    setAiOverlayProgress({ itemName: wineProgressName(wine) });
    setError("");
    try {
      const updated = await api<Wine>(`/api/v1/ai/wines/${wine.id}/${feature}`, {
        method: "POST",
        body: JSON.stringify({ locale, model, force_refresh: forceRefresh }),
      });
      setWines((current) => current.map((item) => (item.id === updated.id ? updated : item)));
      setSelectedWineId(updated.id);
      const [nextAudit] = await Promise.all([loadAiAudit(), loadAiUsage()]);
      if (feature === "scores") {
        const previous = new Set(wine.scores.filter(score => score.verification_status !== "unverified").map(score => `${score.critic}|${score.score}`));
        const found = updated.scores.filter(score => score.verification_status !== "unverified" && !previous.has(`${score.critic}|${score.score}`)).length;
        setNotice(found ? (locale === "it" ? `${found} nuovi punteggi con fonte trovati.` : `${found} new sourced scores found.`) : (locale === "it" ? "Nessun nuovo punteggio verificato trovato per questo vino e questa annata. Le stime non vengono aggiunte." : "No new verified scores found for this wine and vintage. Estimates are not added."));
      }
      if (feature === "value" && openMarketModal) {
        const marketEntry = nextAudit.find((entry) => entry.entity_type === "wine" && entry.entity_id === updated.id && ["ai_value", "wine_full_enrichment", "shared_value", "shared_full_enrichment"].includes(entry.feature));
        if (marketEntry && auditMarketSources(marketEntry).length) {
          setMarketViewContext({ kind: "wine", wine: updated, entry: marketEntry });
        }
      }
    } catch (nextError) {
      const message = nextError instanceof Error ? extractApiErrorText(nextError.message) : "";
      if (feature === "value" && message.toLowerCase().includes("no verified live market price sources found")) {
        setWines((current) => current.map((item) => (item.id === wine.id ? { ...item, value_not_found: true } : item)));
      }
      setError(message || "Unable to generate AI content");
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
          ...tastingRequest(payload),
          storage_allocation_id: payload.storage_allocation_id || undefined,
        }),
      });
      setWines((current) => current.map((item) => (item.id === updated.id ? updated : item)));
      setSelectedWineId(updated.id);
      stockChangedHaptic();
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

  async function updateHouseholdMode(operatingMode: "private" | "restaurant") {
    setSaving(true);
    setError("");
    try {
      const updatedMembership = await api<HouseholdMembership>("/api/v1/household", {
        method: "PATCH",
        body: JSON.stringify({ operating_mode: operatingMode }),
      });
      setHouseholdMemberships((current) => current.map((membership) =>
        membership.household_id === updatedMembership.household_id ? updatedMembership : membership,
      ));
      setSession((current) => current ? { ...current, active_household_mode: updatedMembership.operating_mode } : current);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Unable to update cellar mode");
    } finally {
      setSaving(false);
    }
  }

  async function updateWineCommercialStatus(wine: Wine, commercialStatus: Wine["commercial_status"]) {
    setSaving(true);
    setError("");
    try {
      const updated = await api<Wine>(`/api/v1/wines/${wine.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          commercial_status: commercialStatus,
          reorder_enabled: commercialStatus === "active",
        }),
      });
      setWines((current) => current.map((item) => item.id === updated.id ? updated : item));
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : (locale === "it" ? "Impossibile aggiornare lo stato commerciale" : "Unable to update commercial status"));
    } finally {
      setSaving(false);
    }
  }

  async function updateRestaurantSettings(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const defaultPourSizeMl = Math.round(Number(restaurantSettingsDraft.defaultPourDl) * 100);
    const serviceLossMl = Math.round(Number(restaurantSettingsDraft.serviceLossMl));
    const reorderThreshold = Math.round(Number(restaurantSettingsDraft.reorderThreshold));
    if (!Number.isFinite(defaultPourSizeMl) || !Number.isFinite(serviceLossMl) || !Number.isFinite(reorderThreshold)) return;
    setSaving(true);
    setError("");
    try {
      const updatedMembership = await api<HouseholdMembership>("/api/v1/household", {
        method: "PATCH",
        body: JSON.stringify({
          restaurant_default_pour_size_ml: defaultPourSizeMl,
          restaurant_service_loss_ml: serviceLossMl,
          restaurant_default_reorder_threshold: reorderThreshold,
        }),
      });
      setHouseholdMemberships((current) => current.map((membership) =>
        membership.household_id === updatedMembership.household_id ? updatedMembership : membership,
      ));
      setRestaurantSettingsDraft({
        defaultPourDl: String(updatedMembership.restaurant_default_pour_size_ml / 100),
        serviceLossMl: String(updatedMembership.restaurant_service_loss_ml),
        reorderThreshold: String(updatedMembership.restaurant_default_reorder_threshold),
      });
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Unable to update restaurant settings");
    } finally {
      setSaving(false);
    }
  }

  async function sellWineBottles(wine: Wine, payload: WineSaleDraft) {
    setSaving(true);
    setError("");
    try {
      await api("/api/v1/sales", {
        method: "POST",
        body: JSON.stringify({
          wine_id: wine.id,
          sold_at: payload.sold_at || undefined,
          quantity: Number(payload.quantity || 1),
          unit_sale_price: payload.unit_sale_price ? Number(payload.unit_sale_price) : undefined,
          sale_kind: payload.sale_kind,
          note: payload.note.trim(),
          storage_allocation_id: payload.storage_allocation_id || undefined,
        }),
      });
      stockChangedHaptic();
      await loadWines();
      setRestaurantDashboardVersion((current) => current + 1);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Unable to register sale");
      throw nextError;
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
          ...tastingRequest(payload),
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
    if (!items.length || generatingAi.startsWith("batch-")) return;
    const generationItems = feature === "scores" ? items.filter((wine) => !wine.scores_not_applicable) : items;
    if (!generationItems.length) return;
    const featureAdvice = wineFeatureModelAdvice(feature);
    const model = await requestAiModelAdvice(featureAdvice.label, featureAdvice.role, featureAdvice.model);
    if (!model) return;
    setGeneratingAi(`batch-${feature}`);
    setError("");
    batchAiStopRef.current = false;
    setBatchAiMinimized(false);
    setBatchAiRun({ feature, label: featureAdvice.label, items: generationItems.map((wine) => ({ wine, status: "pending", entries: [] })), finished: false, stopping: false });
    const updateItem = (wineId: string, patch: Partial<BatchAiItem>) => setBatchAiRun((current) => current && {
      ...current,
      items: current.items.map((item) => (item.wine.id === wineId ? { ...item, ...patch } : item)),
    });
    // Audit entries already there before the run; each wine's new ones are its cost and sources.
    const seenAudit = new Set((await loadAiAudit().catch(() => [] as AiAuditLog[])).map((entry) => entry.id));
    try {
      for (const wine of generationItems) {
        if (batchAiStopRef.current) break;
        updateItem(wine.id, { status: "running" });
        let patch: Partial<BatchAiItem>;
        try {
          const updated = await api<Wine>(`/api/v1/ai/wines/${wine.id}/${feature}`, {
            method: "POST",
            body: JSON.stringify({ locale, model }),
          });
          setWines((current) => current.map((item) => (item.id === updated.id ? updated : item)));
          patch = { status: hasUsefulBatchAiResult(feature, updated) ? "done" : "no_result", updated };
        } catch (nextError) {
          const message = nextError instanceof Error ? extractApiErrorText(nextError.message) : "";
          if (feature === "value" && message.toLowerCase().includes("no verified live market price sources found")) {
            setWines((current) => current.map((item) => (item.id === wine.id ? { ...item, value_not_found: true } : item)));
            patch = { status: "no_result" };
          } else {
            patch = { status: "failed", reason: message || t("unknownError") };
          }
        }
        const audit = await loadAiAudit().catch(() => [] as AiAuditLog[]);
        const entries = audit.filter((entry) => !seenAudit.has(entry.id) && entry.entity_id === wine.id);
        audit.forEach((entry) => seenAudit.add(entry.id));
        updateItem(wine.id, { ...patch, entries });
      }
      await loadAiUsage().catch(() => undefined);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Unable to generate AI content");
    } finally {
      setBatchAiRun((current) => current && { ...current, finished: true, stopping: false });
      setGeneratingAi("");
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
      setWishlistLists((current) => current.map((wishlistList) => (
        wishlistList.id === updated.wishlist_list_id && wishlistList.portfolio_strategy
          ? { ...wishlistList, portfolio_strategy: { ...wishlistList.portfolio_strategy, stale: true } }
          : wishlistList
      )));
      setWishlistPortfolioStrategy((current) => (
        current?.wishlist_list_id === updated.wishlist_list_id ? { ...current, stale: true } : current
      ));
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
        body: JSON.stringify({ locale, wishlist_list_id: selectedWishlistListId, model, use_taste_profile: wishlistUseTasteProfile }),
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

  async function generatePairing(event: FormEvent<HTMLFormElement>, pairingContext?: [string | null, string, string]) {
    event.preventDefault();
    if (!pairingContext?.[0] && !pairingDish.trim()) {
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
          target_wine_id: pairingContext?.[0] || null,
          dietary_preferences: pairingContext?.[1]?.trim() || "",
          allergies: pairingContext?.[2]?.trim() || "",
          max_price_chf: pairingMaxPrice.trim() ? Number(pairingMaxPrice.trim()) : null,
          include_market: pairingIncludeMarket,
          market_only: pairingMarketOnly,
          only_ideal_drink_window: pairingOnlyIdealDrinkWindow,
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

  async function generateTastingReflection(entry: { id: string; wine: { id: string } }, personalFeedback: string) {
    const model = await requestAiModelAdvice(
      locale === "it" ? "Riflessione del sommelier" : "Sommelier reflection",
      "economy",
      aiSettings?.pairing_model || aiSettingsDraft.pairing_model,
    );
    if (!model) return;
    setGeneratingAi("tasting-reflection");
    setError("");
    try {
      await api<TastingReflectionResult>("/api/v1/ai/tasting-reflection", {
        method: "POST",
        body: JSON.stringify({
          wine_id: entry.wine.id,
          tasting_id: entry.id,
          personal_feedback: personalFeedback.trim(),
          locale,
          model,
        }),
      });
      await Promise.all([
        loadTastingArchiveOverview(),
        !offlineMode && activeView === "history" && historySection === "tastings"
          ? loadTastingArchive(tastingArchiveOffset)
          : Promise.resolve(),
        loadAiAudit(),
        loadAiUsage(),
      ]);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Unable to generate sommelier reflection");
    } finally {
      setGeneratingAi("");
    }
  }

  async function updateUserAccessDays(user: AppUser, clear = false) {
    const targetValue = (userAccessDaysDrafts[user.id] || "").trim();
    if (!clear && !targetValue) return;
    setSaving(true);
    setError("");
    try {
      await api<AppUser>(`/api/v1/auth/users/${user.id}`, {
        method: "PATCH",
        body: JSON.stringify(clear ? { clear_access_override: true } : { access_override_days: Number(targetValue) }),
      });
      await loadAppUsers();
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Unable to update access");
    } finally {
      setSaving(false);
    }
  }

  async function generateBuyingAdvice(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (buyingCheckAvailability && !buyingLocation.trim()) {
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
          wine_type: buyingWineType.trim(),
          region: buyingRegion.trim(),
          use_taste_profile: buyingUseTasteProfile,
          check_availability: buyingCheckAvailability,
          needed_by: buyingNeededBy,
          location: buyingCheckAvailability ? buyingLocation.trim() : "",
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

  async function updateTastingArchiveEntry(
    entry: Pick<TastingArchiveEntry, "id" | "source"> & { wine: Pick<Wine, "id"> },
    payload: ConsumeWineDraft,
  ) {
    if (entry.source !== "external_tasting") {
      return updateWineTastingEntry(entry.wine as Wine, entry.id, payload);
    }
    setSaving(true);
    setError("");
    try {
      await api(`/api/v1/wishlist/tastings/${entry.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          ...tastingRequest(payload),
          wine: payload.wine,
        }),
      });
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

  async function deleteTastingArchiveEntry(
    entry: Pick<TastingArchiveEntry, "id" | "source"> & { wine: Pick<Wine, "id"> },
  ) {
    if (entry.source !== "external_tasting") {
      return deleteWineTastingEntry(entry.wine as Wine, entry.id);
    }
    setSaving(true);
    setError("");
    try {
      await api(`/api/v1/wishlist/tastings/${entry.id}`, { method: "DELETE" });
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

  async function recordWishlistTasting(item: WishlistItem, payload: ConsumeWineDraft) {
    setSaving(true);
    setError("");
    try {
      await api(`/api/v1/wishlist/${item.id}/tastings`, {
        method: "POST",
        body: JSON.stringify({
          ...tastingRequest(payload),
        }),
      });
      await loadTastingArchiveOverview();
      await loadWishlist(selectedWishlistListId);
      if (!offlineMode && activeView === "history" && historySection === "tastings") {
        await loadTastingArchive(tastingArchiveOffset);
      }
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Unable to register tasting");
      throw nextError;
    } finally {
      setSaving(false);
    }
  }

  async function scanRestaurantWineList(formData: FormData): Promise<RestaurantWineListScanResult> {
    setGeneratingAi("restaurant-wine-list");
    setError("");
    try {
      formData.set("locale", locale);
      const result = await api<RestaurantWineListScanResult>("/api/v1/ai/restaurant-wine-list/scan", {
        method: "POST",
        body: formData,
      });
      await Promise.all([loadAiAudit(), loadAiUsage()]);
      return result;
    } catch (nextError) {
      const message = nextError instanceof Error ? nextError.message : "Unable to scan restaurant wine list";
      setError(message);
      throw nextError;
    } finally {
      setGeneratingAi("");
    }
  }

  async function askRestaurantWineList(payload: RestaurantWineListQuestionPayload): Promise<RestaurantWineListQuestionResult> {
    setGeneratingAi("restaurant-wine-list-question");
    try {
      const result = await api<RestaurantWineListQuestionResult>("/api/v1/ai/restaurant-wine-list/ask", {
        method: "POST",
        body: JSON.stringify({ ...payload, locale }),
      });
      await Promise.all([loadAiAudit(), loadAiUsage()]);
      return result;
    } finally {
      setGeneratingAi("");
    }
  }

  async function scanWineShelf(formData: FormData): Promise<WineShelfScanResult> {
    setGeneratingAi("wine-shelf");
    try {
      formData.set("locale", locale);
      const result = await runWineShelfScan(formData, locale, (text) => setAiOverlayProgress({ text }));
      await Promise.all([loadAiAudit(), loadAiUsage()]);
      return result;
    } finally {
      setAiOverlayProgress(null);
      setGeneratingAi("");
    }
  }

  async function addBuyingAdviceRecommendationToWishlist(
    recommendation: BuyingAdviceResult["recommendations"][number] & { type?: string; region?: string; origin?: "shelf" },
    listId = "",
  ) {
    const parsedPrice = Number(recommendation.price.trim().replace(",", "."));
    const price = Number.isFinite(parsedPrice) && parsedPrice >= 0 ? parsedPrice : 0;
    const destinationListId = listId || selectedWishlistListId || wishlistLists[0]?.id || "";
    const fromShelf = recommendation.origin === "shelf";
    setSaving(true);
    setError("");
    try {
      await api<WishlistItem>("/api/v1/wishlist", {
        method: "POST",
        body: JSON.stringify({
          ...(destinationListId ? { wishlist_list_id: destinationListId } : {}),
          name: recommendation.name.trim(),
          producer: recommendation.producer.trim(),
          vintage: recommendation.vintage.trim(),
          // A shelf bottle brings its own type and region; advice uses the search criteria.
          type: (fromShelf ? recommendation.type || "" : buyingWineType).trim(),
          region: (fromShelf ? recommendation.region || "" : buyingRegion).trim(),
          target_price: price,
          offer_price: price || null,
          currency: recommendation.currency.trim().toUpperCase() || "CHF",
          merchant: recommendation.merchant.trim(),
          priority: recommendation.confidence === "high" ? "High" : recommendation.confidence === "low" ? "Low" : "Medium",
          purpose: !fromShelf && buyingPurpose === "cellar" ? "Cellar" : "Drink",
          status: "Evaluate",
          notes: recommendation.reason.trim(),
          ai_context_note: fromShelf ? "Scaffale AI in enoteca." : `Sommelier acquisti. Fonte: ${recommendation.source_url}`,
        }),
      });
      setWishlistPortfolioStrategy(null);
      await Promise.all([loadWishlist(destinationListId), loadWishlistLists()]);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Unable to save wishlist item");
      throw nextError;
    } finally {
      setSaving(false);
    }
  }

  const authenticated = Boolean(session?.authenticated);
  const activeMembership =
    householdMemberships.find((membership) => membership.household_id === session?.active_household_id) ||
    householdMemberships.find((membership) => membership.household_name === session?.active_household_name);
  const canAdmin = !offlineMode && (session?.membership_role === "owner" || session?.membership_role === "admin");
  const canAppAdmin = !offlineMode && Boolean(session?.is_app_admin);
  const canWriteWine = !offlineMode && (canAdmin || session?.membership_role === "member");
  const restaurantModeAvailable = Boolean(session?.restaurant_mode_available || session?.is_app_admin);
  const isRestaurant = restaurantModeAvailable && session?.active_household_mode === "restaurant";
  const aiNavigationActive = ["sommelier", "intelligence", "assistant", "pairing", "buying"].includes(activeView);
  const activeTier = session?.is_demo
    ? {
        name: locale === "it" ? "Demo" : "Demo",
        description: locale === "it" ? "Cantina dimostrativa in sola lettura." : "Read-only demonstration cellar.",
      }
    : session?.is_ambassador
      ? {
          name: "Vinaris Ambassador",
          description: locale === "it" ? "Accesso completo e credito AI omaggio fino alla scadenza dell'affiliazione." : "Full access and promotional AI credit until affiliation expiry.",
        }
    : session?.active_household_mode === "restaurant"
      ? {
          name: locale === "it" ? "Carta" : "Wine list",
          description: locale === "it" ? "Piano ristorante: carta dei vini, vendite e gestione del magazzino." : "Restaurant plan: wine list, sales and inventory management.",
        }
      : session?.has_active_entitlement
        ? {
            name: locale === "it" ? "Riserva" : "Reserve",
            description: locale === "it" ? "Collezione senza limiti, AI Pack o chiave OpenAI personale." : "Unlimited collection, AI Pack or personal OpenAI key.",
          }
        : {
            name: locale === "it" ? "Degustazione" : "Tasting",
            description: locale === "it" ? `Piano gratuito: fino a ${session?.free_tier_label_limit || 15} etichette attive. Le funzioni AI richiedono un AI Pack.` : `Free plan: up to ${session?.free_tier_label_limit || 15} active labels. AI requires an AI Pack.`,
          };
  const hasAnotherRestaurantCellar = householdMemberships.some((membership) =>
    membership.household_id !== session?.active_household_id && membership.operating_mode === "restaurant",
  );
  const restaurantDefaultPourMl = Math.max(Math.round(Number(restaurantSettingsDraft.defaultPourDl || 0) * 100), 1);
  const restaurantServiceLossMl = Math.max(Math.round(Number(restaurantSettingsDraft.serviceLossMl || 0)), 0);
  const restaurantStandardYieldMl = Math.max(750 - restaurantServiceLossMl, 0);
  const restaurantStandardGlassCount = Math.floor(restaurantStandardYieldMl / restaurantDefaultPourMl);
  const restaurantStandardRemainderMl = restaurantStandardYieldMl % restaurantDefaultPourMl;
  const canAccessWinePhotos = !offlineMode && Boolean(session?.authenticated);
  const canManageWinePhotos = canWriteWine && Boolean(session?.is_app_admin || session?.can_manage_wine_photos);
  const canReuseWinePhotos = canWriteWine && canAccessWinePhotos;
  const canUseLabelRecognition = canWriteWine && Boolean(session?.can_use_label_recognition);
  const canAccessCellarAssistant = !offlineMode && Boolean(session?.cellar_ai_assistant_available);

  useEffect(() => {
    if (activeView === "assistant" && session?.authenticated && !canAccessCellarAssistant) {
      setActiveView("home");
    }
  }, [activeView, canAccessCellarAssistant, session?.authenticated]);

  useEffect(() => {
    if (isRestaurant && activeView === "history") {
      setActiveView("home");
    }
  }, [activeView, isRestaurant]);

  useEffect(() => {
    if (offlineMode || !session?.authenticated || !isRestaurant || !selectedWineId) {
      setWineSalesHistory(null);
      setWineSalesHistoryLoading(false);
      return;
    }
    let active = true;
    setWineSalesHistory(null);
    setWineSalesHistoryLoading(true);
    api<WineSalesHistory>(`/api/v1/sales/wine/${selectedWineId}/history`)
      .then((history) => {
        if (active) setWineSalesHistory(history);
      })
      .catch((nextError) => {
        if (active) setError(nextError instanceof Error ? nextError.message : "Unable to load wine sales history");
      })
      .finally(() => {
        if (active) setWineSalesHistoryLoading(false);
      });
    return () => { active = false; };
  }, [isRestaurant, offlineMode, restaurantDashboardVersion, selectedWineId, session?.authenticated]);

  useEffect(() => {
    setWinePhotoSuggestions([]);
    setWinePhotoSuggestionIndex(0);
    setSelectedSuggestedPhotoId(null);
    const name = draft.name.trim();
    const producer = draft.producer.trim();
    if (!wineFormOpen || !canReuseWinePhotos || pendingBottlePhoto || name.length < 2 || !producer) return;

    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      const query = new URLSearchParams({ name, producer });
      api<WinePhotoSuggestion[]>(`/api/v1/wines/photo/suggestions?${query.toString()}`, { signal: controller.signal })
        .then((suggestions) => {
          setWinePhotoSuggestions(suggestions);
          setWinePhotoSuggestionIndex(0);
        })
        .catch(() => {
          if (!controller.signal.aborted) {
            setWinePhotoSuggestions([]);
            setWinePhotoSuggestionIndex(0);
          }
        });
    }, 350);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [canReuseWinePhotos, draft.name, draft.producer, editingId, pendingBottlePhoto, wineFormOpen]);

  const winePhotoSuggestion = winePhotoSuggestions[winePhotoSuggestionIndex] || null;

  async function reuseWinePhoto(wineId: string, sourceWineId: string) {
    setSaving(true);
    setError("");
    try {
      const updated = await api<Wine>(`/api/v1/wines/${wineId}/photo/reuse/${sourceWineId}`, { method: "POST" });
      setWines((current) => current.map((wine) => wine.id === updated.id ? updated : wine));
      setSelectedWineId(updated.id);
      setDetailWinePhotoSuggestion(null);
      setDetailWinePhotoSuggestionWineId(null);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Unable to reuse bottle photo");
    } finally {
      setSaving(false);
    }
  }

  async function reuseSuggestedWinePhoto(sourceWineId: string) {
    if (!editingId) {
      setPendingBottlePhoto(null);
      setSelectedSuggestedPhotoId((current) => current === sourceWineId ? null : sourceWineId);
      return;
    }
    await reuseWinePhoto(editingId, sourceWineId);
  }

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
  const canRecognizeBottlePhoto = canUseLabelRecognition && canGenerateAi;
  const showAiPackUpgrade = Boolean(session?.is_free_tier && !canGenerateAi && billingStatus?.can_purchase_ai_credits);
  const showAiPackEnhancement = showAiPackUpgrade && !aiPackEnhancementDismissed;
  const aiPackUpgradeNotice = showAiPackUpgrade ? <AiPackUpgradeNotice locale={locale} onPurchase={() => void startCheckout("ai_credits")} /> : null;
  const aiPackEnhancementHint = showAiPackEnhancement ? <AiPackUpgradeNotice locale={locale} compact onPurchase={openSubscriptionSettings} onDismiss={() => { window.localStorage.setItem(AI_PACK_ENHANCEMENT_DISMISS_KEY, String(Date.now() + AI_PACK_ENHANCEMENT_REMINDER_MS)); setAiPackEnhancementDismissed(true); }} /> : null;
  const canUseIncludedWineSearch = canWriteWine && Boolean(aiSettings?.can_use_included_wine_search);
  // Older API responses may omit purchase-specific flags during a rolling update.
  const canAnalyzePurchase = canWriteWine && Boolean(session?.is_app_admin || (
    aiSettings?.can_use_purchase_import ?? (canUseIncludedWineSearch || aiSettings?.can_use_app_credits)
  ));
  const purchaseImportIncluded = Boolean(session?.is_app_admin || (
    aiSettings?.purchase_import_included ?? session?.has_active_entitlement
  ));
  const canAccessMemories = Boolean(session?.is_app_admin || (
    !session?.is_demo && session?.has_active_entitlement
  ));
  useEffect(() => {
    // Only the visit that comes from the assistant skips "Dove sei?".
    if (activeView !== "pairing") {
      setPairingFromAssistant(false);
      setPairingStartPlace("choose");
    }
    // Likewise only the visit from the updates opens straight on the shelf scanner.
    if (activeView !== "buying") setBuyingStartPlace("advice");
  }, [activeView]);

  /** Each update in the news panel leads to its feature. */
  function openNewsFeature(id: string) {
    if (id === "bottle-photo") {
      leaveHelpFor("cellar");
      if (canWriteWine) setBottlePhotoImportOpen(true);
    } else if (id === "shelf-scan") {
      setBuyingStartPlace("shelf");
      leaveHelpFor("buying");
    } else if (id === "purchase-scan") {
      leaveHelpFor("cellar");
      if (canWriteWine) setPurchaseImportOpen(true);
    } else if (id === "photo-memories") {
      openMemoryBook();
    } else if (id === "personal-dashboard") {
      leaveHelpFor("home");
      setDashboardFocus("personal");
    }
  }

  function openMemoryBook() {
    if (canAccessMemories) setMemoryBookOpen(true);
    else openSubscriptionSettings();
  }

  function openSubscriptionSettings() {
    setActiveView("settings"); setSettingsTab("profile"); loadSettingsTabData("profile");
    // Wait for the lazy profile fields above billing to occupy their space.
    void Promise.all([import("./views/settings/ProfileSettingsTab"), import("./components/MarketPreferences")]).then(() => setSubscriptionFocusPending(true))
      .catch((nextError) => setError(nextError instanceof Error ? nextError.message : "Unable to load subscription settings"));
  }
  const helpRole: HelpRole = session?.membership_role === "owner" || session?.membership_role === "admin" || session?.membership_role === "member" || session?.membership_role === "viewer"
    ? session.membership_role
    : "viewer";
  const contextualHelpArticle = selectedWineId
    ? "wine-detail"
    : ({ home: "dashboard", cellar: "cellar-filters", history: "consumption", wishlist: "wishlist", assistant: "consumption", pairing: "pairing", sommelier: "pairing", pulse: "wine-pulse", buying: "buying-advice", settings: "roles-cellars" } as Partial<Record<ViewName, string>>)[activeView] || "onboarding";

  function updateHelpLocation(slug: string | null, replace = false) {
    const path = slug ? `/help/${encodeURIComponent(slug)}` : "/help";
    window.history[replace ? "replaceState" : "pushState"]({}, "", `${path}${window.location.search}`);
  }

  function openHelp(slug: string | null = null) {
    if (activeView !== "help") helpReturnViewRef.current = activeView;
    setHelpSlug(slug);
    setActiveView("help");
    updateHelpLocation(slug);
  }

  function closeHelp() {
    leaveHelpFor(helpReturnViewRef.current);
  }

  function leaveHelpFor(view: ViewName) {
    setHelpSlug(null);
    if (window.location.pathname === "/help" || window.location.pathname.startsWith("/help/")) {
      window.history.pushState({}, "", `/${window.location.search}`);
    }
    setActiveView(view);
  }

  function changeHelpArticle(slug: string | null) {
    setHelpSlug(slug);
    updateHelpLocation(slug);
  }

  async function setWineValueAiExclusion(wine: Wine, excluded: boolean) {
    setSaving(true);
    setError("");
    try {
      const updated = await api<Wine>(`/api/v1/wines/${wine.id}`, {
        method: "PATCH",
        body: JSON.stringify({ value_not_found: excluded }),
      });
      setWines((current) => current.map((item) => (item.id === updated.id ? updated : item)));
      setSelectedWineId(updated.id);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Unable to update wine");
    } finally {
      setSaving(false);
    }
  }

  async function setWineGrapesAiExclusion(wine: Wine, excluded: boolean) {
    setSaving(true);
    setError("");
    try {
      const updated = await api<Wine>(`/api/v1/wines/${wine.id}`, {
        method: "PATCH",
        body: JSON.stringify({ grapes_not_applicable: excluded }),
      });
      setWines((current) => current.map((item) => (item.id === updated.id ? updated : item)));
      setSelectedWineId(updated.id);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Unable to update wine");
    } finally {
      setSaving(false);
    }
  }
  function matchingTemplateSuggestions(query: string) {
    const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
    if (!words.length) return [];
    return wineTemplateSuggestions.filter((wine) => {
      const searchable = [wine.name, wine.producer, wine.region, wine.appellation]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return words.every((word) => searchable.includes(word));
    }).slice(0, 6);
  }
  const wineDraftTemplateSuggestions =
    wineFormOpen && !editingId && draft.name.trim().length >= 2 && !draft.producer.trim()
      ? matchingTemplateSuggestions(draft.name)
      : [];
  const wishlistDraftTemplateSuggestions =
    wishlistFormOpen && wishlistDraft.name.trim().length >= 2
      ? matchingTemplateSuggestions(wishlistDraft.name)
      : [];
  const showManualWineAiSearch =
    (activeView === "cellar" || activeView === "history") &&
    wineFormOpen &&
    !editingId &&
    canUseIncludedWineSearch &&
    draft.name.trim().length >= 2;
  const showManualWishlistAiSearch =
    activeView === "wishlist" &&
    wishlistFormOpen &&
    canUseIncludedWineSearch &&
    wishlistDraft.name.trim().length >= 2 &&
    !(wineRecognitionTarget === "wishlist" && wineImageRecognitionResult?.status === "recognized");
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
  const normalizedAuthError = error.toLowerCase();
  const canRecoverExistingAccount =
    normalizedAuthError.includes("email verification required")
    || normalizedAuthError.includes("email already registered");
  const shouldPrioritizeAuthAction = !authenticated && (Boolean(emailVerificationToken) || Boolean(passwordResetToken));
  const showInlineAuthError = Boolean(visibleError) && !authenticated && (isMobileViewport || authModalOpen);
  const showMobileAuthPanel =
    isMobileViewport &&
    !shouldPrioritizeAuthAction &&
    (authModalOpen || Boolean(acceptToken) || Boolean(emailVerificationToken) || Boolean(passwordResetToken) || emailVerificationConfirmed || canShowOfflineBackupPanel);
  const onboardingStep = emailVerificationToken || session?.pending_email_verification
    ? 2
    : emailVerificationConfirmed
      ? 3
      : 1;
  const onboardingProgress = (activeStep: 1 | 2 | 3, emailComplete = false) => (
    <ol className="onboarding-progress" aria-label="Onboarding">
      <li className={activeStep > 1 ? "complete" : activeStep === 1 ? "active" : ""}>
        <span>1</span><small>{t("onboardingAccountStep")}</small>
      </li>
      <li className={emailComplete || activeStep > 2 ? "complete" : activeStep === 2 ? "active" : ""}>
        <span>2</span><small>{t("onboardingEmailStep")}</small>
      </li>
      <li className={activeStep === 3 ? "active" : ""}>
        <span>3</span><small>{t("onboardingAccessStep")}</small>
      </li>
    </ol>
  );
  const renderRedeemCodeRow = (code: RedeemCode, highlighted = false) => {
    const paymentActivationRequired = code.kind !== "trial" && code.label.startsWith("Stripe ") && !billingStatus?.has_active_entitlement;
    const isHighlighted = highlighted || paymentActivationRequired;
    const activationTitle = locale === "it" ? "Attiva il tuo abbonamento" : "Activate your subscription";
    const activationHelp = locale === "it"
      ? "Il pagamento è completato. Riscatta ora il codice per sbloccare l’accesso."
      : "Your payment is complete. Redeem this code now to unlock access.";
    const redeemAction = paymentActivationRequired ? (locale === "it" ? "Riscatta ora" : "Redeem now") : t("redeem");
    return (
    <div className={isHighlighted ? "trial-redeem-card" : "member-row"} key={code.id}>
      <div>
        {isHighlighted ? <span className="trial-redeem-kicker">{paymentActivationRequired ? (locale === "it" ? "Pagamento ricevuto · attivazione richiesta" : "Payment received · activation required") : t("useTrialRedeemCodeNow")}</span> : null}
        <strong>{paymentActivationRequired ? activationTitle : code.kind === "trial" ? t("trialRedeemCode") : t("paidRedeemCode")}</strong>
        <span>{paymentActivationRequired ? `${activationHelp} ${code.duration_days}d.` : highlighted ? `${t("trialRedeemCodeHelp")} ${t("trialRedeemCodeDuration")}: ${code.duration_days}d.` : `${code.label} - ${code.duration_days}d`}</span>
        {isHighlighted ? (
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
          {redeemAction}
        </button>
      </div>
    </div>
    );
  };
  const offlineBackupPanel = canShowOfflineBackupPanel ? (
    <section className="wine-form">
      <h2>{t("offlineBackup")}</h2>
      <p className="empty-state">{t("offlineBackupHelp")}</p>
      <label>
        <span>{t("loadBackup")}</span>
        <input type="file" accept="application/json,.json" onChange={loadOfflineBackup} disabled={saving} />
      </label>
    </section>
  ) : null;
  const publicAuthPanel = (
    <section className="auth-panel" id="auth-panel">
      {(authMode === "register" || onboardingStep === 2 || emailVerificationConfirmed) && authMode !== "forgot-password" && authMode !== "reset-password"
        ? onboardingProgress(onboardingStep, emailVerificationConfirmed)
        : null}
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
      {offlineBackupPanel}
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
          <label className="email-verification-resend">{locale === "it" ? "Link scaduto? Inserisci la tua email" : "Link expired? Enter your email"}<input type="email" autoComplete="email" value={resendVerificationEmail} onChange={(event) => setResendVerificationEmail(event.target.value)} placeholder={registrationEmail || "name@example.com"} /></label>
          <button type="button" className="secondary" onClick={() => void resendEmailVerification()} disabled={saving || !resendVerificationEmail.trim()}>{saving ? t("working") : (locale === "it" ? "Reinvia email di conferma" : "Resend confirmation email")}</button>
        </div>
      ) : null}
      {emailVerificationConfirmed ? (
        <div className="invite-notice email-verification-success-notice" role="status">
          <span className="auth-status-kicker">{t("onboardingAccessStep")}</span>
          <strong>{t("emailVerificationSuccessTitle")}</strong>
          <span>{t("emailVerificationSuccessHelp")}</span>
          <button type="button" onClick={focusLoginAfterVerification}>{t("signInNow")}</button>
        </div>
      ) : null}
      {session?.pending_email_verification ? (
        <div className="invite-notice email-verification-notice" role="status">
          <span className="auth-status-kicker">{t("onboardingEmailStep")}</span>
          <strong>{t("pendingEmailVerification")}</strong>
          {registrationEmail ? <b className="verification-email-address">{registrationEmail}</b> : null}
          <span>{t("pendingEmailVerificationHelp")}</span>
          <ol className="verification-next-steps">
            <li>{t("verificationCheckInbox")}</li>
            <li>{t("verificationOpenLink")}</li>
            <li>{t("verificationReturnToLogin")}</li>
          </ol>
          <label className="email-verification-resend">{locale === "it" ? "Indirizzo email" : "Email address"}<input type="email" autoComplete="email" value={resendVerificationEmail} onChange={(event) => setResendVerificationEmail(event.target.value)} placeholder={registrationEmail || "name@example.com"} required /></label>
          <button type="button" className="secondary" onClick={() => void resendEmailVerification()} disabled={saving || !resendVerificationEmail.trim()}>{saving ? t("working") : (locale === "it" ? "Reinvia email di conferma" : "Resend confirmation email")}</button>
        </div>
      ) : null}
      {canRecoverExistingAccount ? (
        <div className="invite-notice email-verification-notice" role="status">
          <strong>{normalizedAuthError.includes("email verification required")
            ? (locale === "it" ? "Conferma la tua email" : "Confirm your email")
            : (locale === "it" ? "Questo account esiste già" : "This account already exists")}</strong>
          <span>{locale === "it"
            ? "Accedi con la tua password. Se non hai ancora confermato l’indirizzo email, richiedi un nuovo link qui sotto."
            : "Sign in with your password. If you have not confirmed your email yet, request a new link below."}</span>
          <label className="email-verification-resend">{locale === "it" ? "Indirizzo email" : "Email address"}<input type="email" autoComplete="email" value={resendVerificationEmail} onChange={(event) => setResendVerificationEmail(event.target.value)} placeholder="name@example.com" required /></label>
          <div className="form-actions">
            <button type="button" className="secondary" onClick={() => void resendEmailVerification()} disabled={saving || !resendVerificationEmail.trim()}>{saving ? t("working") : (locale === "it" ? "Reinvia link di conferma" : "Resend confirmation link")}</button>
            <button type="button" className="secondary" onClick={() => setAuthMode("forgot-password")} disabled={saving}>{t("forgotPassword")}</button>
          </div>
        </div>
      ) : null}
      {!emailVerificationToken && !session?.pending_email_verification ? <>
        <div className="auth-tabs">
          <button type="button" className={authMode === "login" ? "" : "secondary"} onClick={() => setAuthMode("login")}>{t("login")}</button>
          <button type="button" className={authMode === "register" ? "" : "secondary"} onClick={() => setAuthMode("register")}>{t("register")}</button>
        </div>
        <form className={`wine-form${authMode === "register" ? " registration-form" : ""}`} onSubmit={submitAuth}>
        <div className="auth-form-heading">
          <h2>{authMode === "register" ? t("createAccount") : authMode === "forgot-password" ? t("passwordResetTitle") : authMode === "reset-password" ? t("passwordResetNewPassword") : t("login")}</h2>
        </div>
        {authMode === "register" ? (
          <div className="registration-email-guide">
            <strong>{t("registrationEmailGuideTitle")}</strong>
            <span>{t("registrationEmailGuideHelp")}</span>
          </div>
        ) : null}
        {session?.pending_approval ? (
          <div className="invite-notice">
            <strong>{t("pendingApproval")}</strong>
            <span>{t("pendingApprovalHelp")}</span>
          </div>
        ) : null}
        {authMode === "register" ? (
          <label>
            <span>{t("name")}</span>
            <input autoComplete="name" value={authDraft.display_name} onChange={(event) => setAuthDraft({ ...authDraft, display_name: event.target.value })} required />
          </label>
        ) : null}
        {authMode !== "reset-password" ? (
          <label>
            <span>{t("email")}</span>
            <input id={authMode === "login" ? "auth-login-email" : undefined} type="email" inputMode="email" autoComplete="email" value={authDraft.email} onChange={(event) => setAuthDraft({ ...authDraft, email: event.target.value })} placeholder="nome@esempio.com" required />
          </label>
        ) : null}
        {authMode === "register" ? (
          <details className="registration-cellar-name">
            <summary>{locale === "it" ? "Personalizza il nome della cantina" : "Personalise your cellar name"}</summary>
            <p>{locale === "it" ? "Puoi iniziare con il nome proposto e cambiarlo più avanti nelle impostazioni." : "Start with the suggested name and change it later in settings."}</p>
            <label>
              <span>{t("cellarName")}</span>
              <input autoComplete="organization" value={authDraft.household_name} onChange={(event) => setAuthDraft({ ...authDraft, household_name: event.target.value })} onBlur={() => { if (!authDraft.household_name.trim()) setAuthDraft((draft) => ({ ...draft, household_name: "Main Cellar" })); }} />
            </label>
          </details>
        ) : null}
        {authMode !== "forgot-password" ? (
          <label>
            <span>{t("password")}</span>
            <input type="password" autoComplete={authMode === "login" ? "current-password" : "new-password"} value={authDraft.password} onChange={(event) => setAuthDraft({ ...authDraft, password: event.target.value })} minLength={authMode === "login" ? 1 : 8} required />
          </label>
        ) : null}
        {authMode === "register" || authMode === "reset-password" ? (
          <label>
            <span>{t("confirmPassword")}</span>
            <input type="password" autoComplete="new-password" value={authDraft.password_confirm} onChange={(event) => setAuthDraft({ ...authDraft, password_confirm: event.target.value })} minLength={8} required />
          </label>
        ) : null}
        {authMode === "register" ? (
          <Suspense fallback={null}>
            <RegistrationConsents
              locale={locale}
              draft={authDraft}
              photoText={t("photoUsageDisclaimerConsent")}
              onChange={setAuthDraft}
            />
          </Suspense>
        ) : null}
        <button
          type="submit"
          disabled={saving || (
            authMode === "register"
            && (
              !authDraft.privacy_policy_accepted
              || !authDraft.terms_accepted
              || !authDraft.photo_usage_disclaimer_accepted
            )
          )}
        >
          {saving ? t("working") : authMode === "register" ? t("createAccount") : authMode === "forgot-password" ? t("sendPasswordReset") : authMode === "reset-password" ? t("saveNewPassword") : t("login")}
        </button>
        {authMode === "login" ? (
          <>
            <button type="button" className="secondary" disabled={saving} onClick={() => void enterDemo()}>{demoCtaLabel}</button>
            <button type="button" className="secondary" disabled={saving} onClick={() => loginWithPasskey()}>{t("passkeyLogin")}</button>
            <button type="button" className="secondary" disabled={saving} onClick={() => setAuthMode("forgot-password")}>{t("forgotPassword")}</button>
          </>
        ) : null}
        </form>
        <nav className="legal-links">
          <a href={`/privacy?lang=${locale}`}>Privacy</a>
          <a href={`/terms?lang=${locale}`}>{locale === "it" ? "Condizioni d’uso" : "Terms"}</a>
        </nav>
      </> : null}
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
  const selectedWine = wines.find((wine) => wine.id === selectedWineId) || null;
  const selectedWishlistItem = wishlist.find((item) => item.id === selectedWishlistId) || null;
  const selectedWishlistList = wishlistLists.find((item) => item.id === selectedWishlistListId) || null;
  const totalWishlistItemCount = wishlistLists.reduce((sum, item) => sum + item.item_count, 0);
  const normalizedQuery = searchQuery.trim().toLowerCase();
  const cellarWines = wines.filter((wine) => wine.quantity > 0);
  const freeTierLabelCount = new Set(
    cellarWines.map((wine) => [wine.producer, wine.name, wine.vintage]
      .map((part) => String(part || "").trim().toLowerCase()).join("\u0000")),
  ).size;
  const freeTierLabelLimit = session?.free_tier_label_limit || 15;
  const freeTierAtLabelLimit = Boolean(
    session?.is_free_tier && freeTierLabelLimit > 0 && freeTierLabelCount >= freeTierLabelLimit,
  );
  const historyWines = wines.filter((wine) => wine.quantity <= 0);
  // Vendite and Momenti are Diario tabs without a wine list.
  const historyWithoutList = historySection === "sales" || historySection === "moments";
  const isWineCollectionView = activeView === "cellar" || (activeView === "history" && !historyWithoutList);
  const isCollectionView = isWineCollectionView || activeView === "wishlist";

  useEffect(() => {
    setDetailWinePhotoSuggestion(null);
    setDetailWinePhotoSuggestionWineId(null);
    if (
      !selectedWine ||
      !isWineCollectionView ||
      offlineMode ||
      wineFormOpen ||
      !canReuseWinePhotos ||
      selectedWine.photo_thumbnail_url ||
      selectedWine.photo_detail_url ||
      selectedWine.name.trim().length < 2 ||
      !selectedWine.producer.trim()
    ) return;

    let active = true;
    const controller = new AbortController();
    const wineId = selectedWine.id;
    const query = new URLSearchParams({ name: selectedWine.name.trim(), producer: selectedWine.producer.trim() });
    const timer = window.setTimeout(() => {
      api<WinePhotoSuggestion[]>(`/api/v1/wines/photo/suggestions?${query.toString()}`, { signal: controller.signal })
        .then((suggestions) => {
          const suggestion = suggestions[0] || null;
          if (active && suggestion) {
            setDetailWinePhotoSuggestion(suggestion);
            setDetailWinePhotoSuggestionWineId(wineId);
          }
        })
        .catch(() => { /* A failed photo lookup must not block the wine detail. */ });
    }, 0);
    return () => {
      active = false;
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [canReuseWinePhotos, isWineCollectionView, offlineMode, wineFormOpen, selectedWine?.id, selectedWine?.name, selectedWine?.producer, selectedWine?.photo_thumbnail_url, selectedWine?.photo_detail_url]);

  useEffect(() => {
    if (!wineFormOpen || !isWineCollectionView) return;
    const sectionKeys = ["identity", "value", "profile", "strategy", "stock", "history", "audit"] as const;
    type SectionKey = typeof sectionKeys[number];
    const moveToSection = (key: SectionKey) => {
      if (key !== "identity") setOpenWineEditorSections({ [key]: true });
      window.requestAnimationFrame(() => {
        const section = wineEditorScrollRef.current?.querySelector<HTMLElement>(`[data-wine-editor-section="${key}"]`);
        if (!section) return;
        section.scrollIntoView({ behavior: "smooth", block: "start" });
        const focusTarget = section.querySelector<HTMLElement>(".wine-editor-disclosure-toggle") || section;
        focusTarget.focus({ preventScroll: true });
      });
    };
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (!event.altKey || event.ctrlKey || event.metaKey || event.shiftKey || target?.closest("input, textarea, select, [contenteditable='true']")) return;
      const directIndex = Number(event.key) - 1;
      let targetIndex = Number.isInteger(directIndex) && directIndex >= 0 && directIndex < sectionKeys.length
        ? directIndex
        : -1;
      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        const activeSection = document.activeElement?.closest<HTMLElement>("[data-wine-editor-section]");
        const currentIndex = sectionKeys.indexOf((activeSection?.dataset.wineEditorSection || "") as SectionKey);
        targetIndex = event.key === "ArrowDown"
          ? Math.min(Math.max(currentIndex + 1, 0), sectionKeys.length - 1)
          : currentIndex < 0 ? sectionKeys.length - 1 : Math.max(currentIndex - 1, 0);
      }
      if (targetIndex < 0) return;
      event.preventDefault();
      moveToSection(sectionKeys[targetIndex]);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isWineCollectionView, wineFormOpen]);
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
  const pairingWineDetail = pairingWineDetailId ? wines.find((wine) => wine.id === pairingWineDetailId) || null : null;
  const wineDetailModalWine = pairingWineDetail || (wineDetailExpanded ? selectedVisibleWine : null);
  const comparedWines = compareWineIds
    .map((wineId) => wines.find((wine) => wine.id === wineId) || null)
    .filter((wine): wine is Wine => Boolean(wine));
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
      setWishlistPortfolioStrategyOpen(false);
      return;
    }
  }, [selectedWishlistListId, visibleWishlistPortfolioStrategy]);
  const wineTypeOptions = uniqueSorted(activeWineCollection.map((wine) => normalizeWineType(wine.type)));
  const wishlistTypeOptions = uniqueSorted(wishlist.map((item) => normalizeWineType(item.type)));
  const wineStatusOptions = uniqueSorted(activeWineCollection.map((wine) => wine.status));
  const storageFilterOptions = Array.from(new Map(activeWineCollection.flatMap((wine) => (wine.storage_allocations || []).map((allocation) => {
    const value = allocation.location_id ? `${allocation.location_id}:${allocation.bin_id || ""}` : "unassigned";
    const label = allocation.location_id ? `${allocation.location_name}${allocation.bin_name ? ` · ${allocation.bin_name}` : ""}` : (locale === "it" ? "Da collocare" : "Unassigned");
    return [value, label] as const;
  })))).map(([value, label]) => ({ value, label })).sort((a, b) => a.label.localeCompare(b.label));
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
      const items = cellarWines.filter((wine) => wineTone(wine.type) === tone && isWineInExplicitIdealWindow(wine, year));
      const bottles = items.reduce((sum, wine) => sum + Math.max(Number(wine.quantity || 0), 0), 0);
      const value = items.reduce((sum, wine) => sum + Number(wine.current_value || wine.price || 0) * Math.max(Number(wine.quantity || 0), 0), 0);
      return { year, items, count: items.length, bottles, value };
    }),
  })).filter((row) => row.cells.some((cell) => cell.count > 0));
  const maxMaturityHeatmapBottles = Math.max(...maturityHeatmapRows.flatMap((row) => row.cells.map((cell) => cell.bottles)), 1);
  const maturityPanoramaYears = Array.from({ length: 13 }, (_, index) => currentYear - 2 + index);
  const maturityPanoramaWines = cellarWines.filter((wine) => Boolean(wine.drink_from && wine.drink_to));
  const maturityPanoramaPoints = maturityPanoramaYears.map((year) => {
    const phases = { past: 0, peak: 0, ready: 0, approaching: 0, young: 0 };
    maturityPanoramaWines.forEach((wine) => {
      const bottles = Math.max(Number(wine.quantity || 0), 0);
      const drinkStart = wine.drink_from || 0;
      const drinkEnd = wine.drink_to || drinkStart;
      const peakStart = wine.drink_peak_from || drinkStart;
      const peakEnd = wine.drink_peak_to || drinkEnd;
      if (year < drinkStart) phases.young += bottles;
      else if (year < peakStart) phases.approaching += bottles;
      else if (year <= peakEnd) phases.peak += bottles;
      else if (year <= drinkEnd) phases.ready += bottles;
      else phases.past += bottles;
    });
    return { year, ...phases };
  });
  const maturityPanoramaCurrent = maturityPanoramaPoints.find((point) => point.year === currentYear) || maturityPanoramaPoints[0];
  const maturityPanoramaSummary = {
    mapped: maturityPanoramaWines.reduce((sum, wine) => sum + Math.max(Number(wine.quantity || 0), 0), 0),
    readyNow: (maturityPanoramaCurrent?.ready || 0) + (maturityPanoramaCurrent?.peak || 0),
    peakSoon: maturityPanoramaWines.filter((wine) => {
      const peakStart = wine.drink_peak_from || wine.drink_from || 0;
      return peakStart > currentYear && peakStart <= currentYear + 2;
    }).reduce((sum, wine) => sum + Math.max(Number(wine.quantity || 0), 0), 0),
    waiting: (maturityPanoramaCurrent?.young || 0) + (maturityPanoramaCurrent?.approaching || 0),
    past: maturityPanoramaCurrent?.past || 0,
  };
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
    region: regionFilter,
    type: typeFilter,
    status: statusFilter,
    storage: storageFilter,
    strategyPurpose: strategyPurposeFilter,
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
      return wineTone(wine.type) === maturityFilter.tone && isWineInExplicitIdealWindow(wine, maturityFilter.year);
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
        score_value: entry.score_value,
        score_scale: entry.score_scale,
        enjoyment: entry.enjoyment,
        occasion: entry.occasion,
        pairing: entry.pairing,
        companions: entry.companions,
        memory_photo_url: entry.memory_photo_url,
        memory_photo_location: entry.memory_photo_location,
        source: entry.source,
        source_text: entry.source_text,
        sommelier_feedback: entry.sommelier_feedback,
        sommelier_pairing_score: entry.sommelier_pairing_score,
        sommelier_pairing_advice: entry.sommelier_pairing_advice,
        sommelier_feedback_cost_usd: entry.sommelier_feedback_cost_usd,
        sommelier_feedback_at: entry.sommelier_feedback_at,
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
      score_value: item.score_value,
      score_scale: item.score_scale,
      enjoyment: tastingEnjoymentValue(item.enjoyment),
      occasion: item.occasion,
      pairing: item.pairing,
      companions: item.companions,
      memory_photo_url: item.memory_photo_url,
      memory_photo_location: item.memory_photo_location,
      source: item.source,
      source_text: item.source_text,
      sommelier_feedback: item.sommelier_feedback,
      sommelier_pairing_score: item.sommelier_pairing_score,
      sommelier_pairing_advice: item.sommelier_pairing_advice,
      sommelier_feedback_cost_usd: item.sommelier_feedback_cost_usd,
      sommelier_feedback_at: item.sommelier_feedback_at,
      created_at: item.created_at,
    };
  });
  const visibleTastingEntries = usingPagedTastingArchive ? pagedTastingEntries : filteredTastingEntries;
  const tastingArchiveTotalCount = usingPagedTastingArchive ? tastingArchivePage?.total || 0 : historyTastingEntries.length;
  const archivedWinesByColor = activeView === "history" && historySection === "wines" && wineGroupingMode === "color";
  const unspecifiedArchiveWines = archivedWinesByColor ? filteredWines.filter((wine) => !normalizeWineType(wine.type)) : [];
  const groupedFilteredWines = wineGroupingMode === "color"
    ? [...wineToneOrder
      .map((tone) => {
        const items = filteredWines.filter((wine) => wineTone(wine.type) === tone && (!archivedWinesByColor || tone !== "other" || Boolean(normalizeWineType(wine.type))));
        return {
          key: tone,
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
      .filter((group) => group.items.length > 0),
      ...(unspecifiedArchiveWines.length ? [{
        key: "unspecified",
        tone: "other" as WineTone,
        label: locale === "it" ? "Colore non specificato" : "Unspecified wine color",
        items: unspecifiedArchiveWines,
        wineCount: unspecifiedArchiveWines.length,
        bottleCount: unspecifiedArchiveWines.reduce((sum, wine) => sum + Math.max(wine.tasting_history.length, 1), 0),
      }] : [])]
    : Array.from(
      filteredWines.reduce((groups, wine) => {
        const label = wine.region?.trim() || (locale === "it" ? "Regione non specificata" : "Region not specified");
        const key = `region:${label.toLocaleLowerCase(locale)}`;
        const current = groups.get(key);
        if (current) current.items.push(wine);
        else groups.set(key, { key, tone: wineTone(wine.type), label, items: [wine] });
        return groups;
      }, new Map<string, { key: string; tone: WineTone; label: string; items: Wine[] }>()),
    )
      .map(([, group]) => ({
        ...group,
        wineCount: group.items.length,
        bottleCount: group.items.reduce(
          (sum, wine) => sum + (activeView === "history" ? Math.max(wine.tasting_history.length, 1) : Number(wine.quantity || 0)),
          0,
        ),
      }))
      .sort((first, second) => first.label.localeCompare(second.label, locale));
  const visibleWineGroups = activeView === "cellar" && wineGroupSelection === "all"
    ? [{
        key: `all:${wineGroupingMode}`,
        tone: "other" as WineTone,
        label: locale === "it" ? "Tutti" : "All",
        items: filteredWines,
        wineCount: filteredWines.length,
        bottleCount: filteredWines.reduce(
          (sum, wine) => sum + Number(wine.quantity || 0),
          0,
        ),
      }]
    : activeView === "cellar"
      ? groupedFilteredWines.filter((group) => group.key === wineGroupSelection)
      : groupedFilteredWines;
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
  const filteredWineBottleCount = filteredWines.reduce((sum, wine) => sum + Math.max(Number(wine.quantity || 0), 0), 0);

  useEffect(() => {
    window.sessionStorage.setItem("vinaris-wine-grouping", wineGroupingMode);
    setWineGroupSelection("all");
  }, [wineGroupingMode]);

  useEffect(() => {
    const rail = wineCategoryRailRef.current;
    if (!rail || activeView !== "cellar") return;
    const handleWheel = (event: WheelEvent) => {
      if (rail.scrollWidth <= rail.clientWidth) return;
      const delta = Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY;
      const canScroll = delta > 0
        ? rail.scrollLeft + rail.clientWidth < rail.scrollWidth - 1
        : rail.scrollLeft > 0;
      if (!canScroll) return;
      event.preventDefault();
      rail.scrollBy({ left: delta, behavior: "auto" });
    };
    rail.addEventListener("wheel", handleWheel, { passive: false });
    return () => rail.removeEventListener("wheel", handleWheel);
  }, [activeView, wineGroupingMode]);

  useEffect(() => {
    if (wineGroupSelection === "all" || groupedFilteredWines.some((group) => group.key === wineGroupSelection)) return;
    setWineGroupSelection("all");
  }, [groupedFilteredWines, wineGroupSelection]);

  useEffect(() => {
    setWineToneRenderLimits({
      red: WINE_TONE_PAGE_SIZE,
      white: WINE_TONE_PAGE_SIZE,
      sparkling: WINE_TONE_PAGE_SIZE,
      rose: WINE_TONE_PAGE_SIZE,
      sweet: WINE_TONE_PAGE_SIZE,
      other: WINE_TONE_PAGE_SIZE,
    });
  }, [activeView, historySection, searchQuery, typeFilter, statusFilter, ownershipFilter, quickWineFilter, maturityFilter, tagFilter, grapeFilter, sortMode, wineGroupingMode]);

  useEffect(() => {
    if (!selectedWineId || !isWineCollectionView) return;
    const selectedIndex = filteredWines.findIndex((wine) => wine.id === selectedWineId);
    if (selectedIndex < 0) return;
    const selectedGroup = visibleWineGroups.find((group) => group.items.some((wine) => wine.id === selectedWineId));
    const groupIndex = selectedGroup?.items.findIndex((wine) => wine.id === selectedWineId) ?? -1;
    if (!selectedGroup || groupIndex < 0) return;
    setWineToneRenderLimits((current) => (current[selectedGroup.key] || WINE_TONE_PAGE_SIZE) > groupIndex
      ? current
      : { ...current, [selectedGroup.key]: Math.ceil((groupIndex + 1) / WINE_TONE_PAGE_SIZE) * WINE_TONE_PAGE_SIZE });
  }, [filteredWines, isWineCollectionView, selectedWineId, visibleWineGroups]);

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
      // The selected row can sit beyond the first page of a colour group. Wait
      // for that group to render, then keep the card clear of the sticky tools.
      window.requestAnimationFrame(() => {
        target.scrollIntoView({ behavior: "smooth", block: "center" });
        setPendingWineScrollId(null);
      });
    }, 120);

    return () => window.clearTimeout(timer);
  }, [activeView, filteredWines, pendingWineScrollId, wineToneRenderLimits]);

  useEffect(() => {
    if (!selectedWineId || !isWineCollectionView) return;
    const selectedWine = filteredWines.find((wine) => wine.id === selectedWineId);
    if (!selectedWine) return;
    const selectedGroup = groupedFilteredWines.find((group) => group.items.some((wine) => wine.id === selectedWine.id));
    if (!selectedGroup) return;
    setOpenWineToneGroups((current) => (current[selectedGroup.key] ? current : { ...current, [selectedGroup.key]: true }));
  }, [selectedWineId, isWineCollectionView, wines, groupedFilteredWines]);

  useEffect(() => {
    if (!selectedWineId || !isWineCollectionView) return;
    const frame = window.requestAnimationFrame(() => {
      const detail = [...document.querySelectorAll<HTMLElement>(`[data-wine-detail-id="${selectedWineId}"]`)]
        .find((candidate) => candidate.getClientRects().length > 0);
      detail?.scrollTo({ top: 0 });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [isWineCollectionView, selectedWineId]);

  useEffect(() => {
    setWishlistPortfolioStrategy(null);
    setRecordTastingOpen(false);
    setTastingOrigin("");
  }, [session?.active_household_id]);

  useEffect(() => {
    if (offlineMode || activeView !== "history" || historySection !== "tastings") return;
    setTastingArchiveOffset(0);
  }, [offlineMode, activeView, historySection, searchQuery, typeFilter, statusFilter, tastingOrigin, session?.active_household_id]);

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
    if (offlineMode || !session?.authenticated) {
      setTastingArchivePage(null);
      return;
    }
    if (activeView !== "history" || historySection !== "tastings") return;
    loadTastingArchive(tastingArchiveOffset).catch((nextError) => {
      setError(nextError instanceof Error ? nextError.message : "Unable to load tasting archive");
    });
  }, [offlineMode, session?.authenticated, session?.active_household_id, activeView, historySection, searchQuery, typeFilter, statusFilter, tastingOrigin, tastingArchiveOffset]);

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
    setShareOfferRecipients([]);
    setOutgoingShareOffers([]);
    setShareDraft({ email: "", share_pct: "50", message: "" });
  }, [selectedWineId]);

  const cellarOwnership = ownershipStats(cellarWines, session);
  const parsedValueRefreshDays = Number(valueRefreshDays);
  const valueRefreshDaysNumber = Number.isFinite(parsedValueRefreshDays) ? Math.max(parsedValueRefreshDays, 0) : 0;
  const sharedBottles = Math.max(cellarOwnership.totalBottles - cellarOwnership.myBottles, 0);
  const sharedValue = Math.max(cellarOwnership.totalValue - cellarOwnership.myValue, 0);
  const readyInCellarWines = cellarWines.filter(
    (wine) => ownedBottleCount(wine, session) > 0
      && isWinePhysicallyInCellar(wine)
      && isWineReadyToPrioritize(wine, currentYear),
  );
  const dailyReadyInCellarWines = readyInCellarWines.filter(
    (wine) => dailyEligibleBottleCount(wine, session) > 0,
  );
  const readyInCellarWineCount = dailyReadyInCellarWines.length;
  const readyInCellarBottleCount = dailyReadyInCellarWines.reduce(
    (total, wine) => total + dailyEligibleBottleCount(wine, session),
    0,
  );
  const monitoringWines = cellarWines
    .filter((wine) => isWinePhysicallyInCellar(wine) && isWineWindowToMonitor(wine, currentYear))
    .sort((first, second) => (first.drink_to || 9999) - (second.drink_to || 9999));
  const drinkSoonWines = cellarWines
    .filter((wine) => isWineIdealSoon(wine, currentYear))
    .sort((first, second) => (wineIdealWindowStart(first) || 9999) - (wineIdealWindowStart(second) || 9999));
  const monitoringLabel = locale === "it" ? "Da monitorare" : "To review";
  const monitoringCaption = locale === "it" ? "A fine finestra o oltre" : "At or past their window";
  const cellarStats = {
    bottles: cellarOwnership.totalBottles,
    totalValue: cellarOwnership.totalValue,
    myBottles: cellarOwnership.myBottles,
    myValue: cellarOwnership.myValue,
    sharedBottles,
    sharedValue,
    drinkNowBottles: readyInCellarBottleCount,
    drinkSoon: drinkSoonWines.length,
    pastWindow: cellarWines.filter((wine) => wine.drink_to && wine.drink_to < currentYear).length,
    futureDeliveries: cellarWines.filter((wine) => isFutureDeliveryWine(wine, now)).length,
    toCollect: cellarWines.filter(isToCollectWine).length,
    nextDelivery: cellarWines
      .map((wine) => (isFutureDeliveryWine(wine, now) ? { wine, days: daysUntil(wine.expected_delivery || "") } : null))
      .filter((item): item is { wine: Wine; days: number } => Boolean(item && item.days !== null && item.days >= 0))
      .sort((first, second) => first.days - second.days)[0],
    missingValue: cellarWines.filter((wine) => !wine.current_value && !wine.value_not_found).length,
    missingDrinkWindow: cellarWines.filter((wine) => hasVintageForDrinkWindow(wine) && (!wine.drink_from || !wine.drink_to)).length,
    missingGrapes: cellarWines.filter((wine) => wine.grapes.length === 0 && !wine.grapes_not_applicable).length,
    missingScores: cellarWines.filter((wine) => wine.scores.length === 0 && !wine.scores_not_applicable).length,
    missingCellarPurpose: cellarWines.filter((wine) => !(wine.strategy_purposes || []).length).length,
    aiNotes: cellarWines.filter((wine) => wine.ai_notes || wine.ai_value_notes).length,
  };
  const portfolioValuePoints = portfolioValueHistory
    .map((point) => ({
      ...point,
      timestampMs: new Date(point.recorded_at).getTime(),
      numericValue: Number(point.value),
    }))
    .filter((point) => Number.isFinite(point.timestampMs) && Number.isFinite(point.numericValue))
    .sort((first, second) => first.timestampMs - second.timestampMs);
  const paidValueWines = cellarWines.filter((wine) => Number(wine.price || 0) > 0 && wine.quantity > 0);
  const paidBottleCount = paidValueWines.reduce((total, wine) => total + wine.quantity, 0);
  const purchaseValue = paidValueWines.reduce(
    (total, wine) => total + Number(wine.price || 0) * wine.quantity,
    0,
  );
  const currentPaidValue = paidValueWines.reduce(
    (total, wine) => total + wineUnitValue(wine) * wine.quantity,
    0,
  );
  const purchaseValueDelta = purchaseValue > 0 ? currentPaidValue - purchaseValue : null;
  const purchaseValueDeltaPct = purchaseValueDelta !== null && purchaseValue > 0
    ? (purchaseValueDelta / purchaseValue) * 100
    : null;
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
  const valueByCanonicalType = canonicalWineTypes
    .map((type) => {
      const typeWines = cellarWines.filter((wine) => normalizeWineType(wine.type) === type);
      return {
        label: type,
        value: sumWineValue(typeWines),
        bottles: typeWines.reduce((total, wine) => total + wine.quantity, 0),
      };
    })
    .filter((item) => item.value > 0);
  const valueByRegion = topWineValueGroups(cellarWines, "region", 8);
  const bottlesByType = topWineBottleGroups(cellarWines, "type");
  const winesByRegion = topWineCountGroups(cellarWines, "region");
  const cellarMissingDataCount = cellarStats.missingValue + cellarStats.missingDrinkWindow + cellarStats.missingGrapes + cellarStats.missingScores + cellarStats.missingCellarPurpose;
  const cellarDataCheckCount = Math.max(cellarWines.length * 5, 1);
  const cellarDataCompleteness = Math.round(Math.max(0, Math.min(100, ((cellarDataCheckCount - cellarMissingDataCount) / cellarDataCheckCount) * 100)));
  const cellarAiReadiness = cellarWines.length
    ? Math.round(Math.max(0, Math.min(100, (cellarStats.aiNotes / cellarWines.length) * 100)))
    : 0;
  const cellarActionItems = [
    { label: t("missingValue"), count: cellarStats.missingValue },
    { label: t("missingDrinkWindow"), count: cellarStats.missingDrinkWindow },
    { label: t("missingGrapes"), count: cellarStats.missingGrapes },
    { label: t("missingScores"), count: cellarStats.missingScores },
    { label: t("missingCellarPurpose"), count: cellarStats.missingCellarPurpose },
  ];
  const breakdownWines = breakdownDrilldown
    ? cellarWines.filter((wine) => wineGroupValue(wine, breakdownDrilldown.dimension) === breakdownDrilldown.label)
    : [];
  const breakdownTotalValue = sumWineValue(breakdownWines);
  const breakdownBottleCount = breakdownWines.reduce((sum, wine) => sum + wine.quantity, 0);
  const breakdownTopWines = [...breakdownWines]
    .sort((first, second) => (wineUnitValue(second) * second.quantity) - (wineUnitValue(first) * first.quantity))
    .slice(0, 5);
  const breakdownTopProducers = topProducerGroups(breakdownWines).slice(0, 4);
  const valueByProducer = topProducerGroups(cellarWines, 8);
  const regionalGapTotalValue = Math.max(sumWineValue(cellarWines), 1);
  const regionalGapHasProfileTarget = Boolean(regionalGapProfileTargets[regionalGapProfile]?.length);
  const regionalGapSelectedTargets = regionalGapHasProfileTarget
    ? regionalGapProfileTargets[regionalGapProfile]!
    : regionalGapTargets;
  const regionalGapCoverageTargets = withOtherRegionalTarget(regionalGapSelectedTargets);
  const regionalGapActiveSuggestion = regionalGapAiSuggestions.find((suggestion) => suggestion.profile === regionalGapProfile) || null;
  const regionalGapRows = regionalGapCoverageTargets.map((target) => {
    const value = sumWineValue(cellarWines.filter((wine) => regionalGapBucket(wine.region, regionalGapCoverageTargets) === target.region));
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
  const regionalGapActionRows = [...regionalGapRows]
    .filter((row) => row.region !== "Other")
    .sort((first, second) => Math.abs(second.deltaPct) - Math.abs(first.deltaPct))
    .slice(0, 4);
  const regionalGapRadarMaxPct = Math.max(
    ...regionalGapRows.flatMap((row) => regionalGapHasProfileTarget ? [row.currentPct, row.targetPct] : [row.currentPct]),
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
  const drinkNowCandidates = [...dailyReadyInCellarWines]
    .sort((first, second) => (
      Number(strategyPurposeBottleCount(second, "drink") > 0) - Number(strategyPurposeBottleCount(first, "drink") > 0)
      || (winePriorityDrinkEnd(first) || Number.MAX_SAFE_INTEGER) - (winePriorityDrinkEnd(second) || Number.MAX_SAFE_INTEGER)
      || (wineIdealWindowStart(first) || Number.MAX_SAFE_INTEGER) - (wineIdealWindowStart(second) || Number.MAX_SAFE_INTEGER)
    ));
  const drinkNowWines = drinkNowCandidates.slice(0, DRINK_NOW_SLIDESHOW_LIMIT);
  const recentCellarWines = [...cellarWines]
    .sort((first, second) => {
      const firstCreatedAt = Date.parse(first.created_at || first.order_date || "") || 0;
      const secondCreatedAt = Date.parse(second.created_at || second.order_date || "") || 0;
      const firstOrderDate = Date.parse(first.order_date || "") || 0;
      const secondOrderDate = Date.parse(second.order_date || "") || 0;
      return secondCreatedAt - firstCreatedAt || secondOrderDate - firstOrderDate || first.name.localeCompare(second.name);
    })
    .slice(0, 5);
  const drinkNowTotalValue = drinkNowCandidates.reduce(
    (total, wine) => total + wineUnitValue(wine) * dailyEligibleBottleCount(wine, session),
    0,
  );
  const nearestDrinkNowEnd = drinkNowCandidates.reduce<number | null>((nearest, wine) => {
    const end = winePriorityDrinkEnd(wine);
    return end && (nearest === null || end < nearest) ? end : nearest;
  }, null);
  const priorityDrinkSoonWines = cellarWines
    .filter((wine) => isWineIdealSoon(wine, currentYear))
    .sort((first, second) => (wineIdealWindowStart(first) || Number.MAX_SAFE_INTEGER) - (wineIdealWindowStart(second) || Number.MAX_SAFE_INTEGER) || wineUnitValue(second) - wineUnitValue(first))
    .slice(0, 2);
  const atRiskWines = cellarWines
    .filter((wine) => wine.drink_to && wine.drink_to < currentYear)
    .sort((first, second) => (first.drink_to || 9999) - (second.drink_to || 9999))
    .slice(0, 5);
  const upcomingDeliveries = cellarWines
    .map((wine) => (isFutureDeliveryWine(wine, now) ? { wine, days: daysUntil(wine.expected_delivery || "") } : null))
    .filter((item): item is { wine: Wine; days: number } => Boolean(item && item.days !== null && item.days >= 0))
    .sort((first, second) => first.days - second.days)
    .slice(0, 10);
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
  const todayUtcMs = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  const missedDeliveryItems = cellarWines
    .filter((wine) => isMissedDeliveryWine(wine, now))
    .map((wine) => {
      const [year, month, day] = (wine.expected_delivery || "").slice(0, 10).split("-").map(Number);
      return { wine, daysLate: Math.round((todayUtcMs - Date.UTC(year, month - 1, day)) / 86400000) };
    })
    .sort((first, second) => second.daysLate - first.daysLate);
  const firstDeliveryTimelineItem = deliveryTimelineItems[0] || null;
  const deliveryHorizonStats = {
    next30: deliveryTimelineItems.filter((item) => item.days <= 30).length,
    next90: deliveryTimelineItems.filter((item) => item.days <= 90).length,
    next365: deliveryTimelineItems.filter((item) => item.days <= 365).length,
    beyond365: deliveryTimelineItems.filter((item) => item.days > 365).length,
    total: deliveryTimelineItems.length,
  };
  const incompleteWines = cellarWines
    .filter((wine) => !wine.current_value || !wine.drink_from || !wine.drink_to || (wine.scores.length === 0 && !wine.scores_not_applicable) || (wine.grapes.length === 0 && !wine.grapes_not_applicable) || !(wine.strategy_purposes || []).length)
    .sort((first, second) => {
      const firstMissing = Number(!first.current_value) + Number(!first.drink_from || !first.drink_to) + Number(first.scores.length === 0 && !first.scores_not_applicable) + Number(first.grapes.length === 0 && !first.grapes_not_applicable) + Number(!(first.strategy_purposes || []).length);
      const secondMissing = Number(!second.current_value) + Number(!second.drink_from || !second.drink_to) + Number(second.scores.length === 0 && !second.scores_not_applicable) + Number(second.grapes.length === 0 && !second.grapes_not_applicable) + Number(!(second.strategy_purposes || []).length);
      return secondMissing - firstMissing;
    })
    .slice(0, 5);
  const incompleteCellarWineCount = cellarWines.filter(
    (wine) => !wine.current_value || !wine.drink_from || !wine.drink_to
      || (wine.scores.length === 0 && !wine.scores_not_applicable)
      || (wine.grapes.length === 0 && !wine.grapes_not_applicable)
      || !(wine.strategy_purposes || []).length,
  ).length;
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
          memory_photo_url: item.memory_photo_url,
          memory_photo_location: item.memory_photo_location,
          sommelier_feedback: item.sommelier_feedback,
          sommelier_pairing_score: item.sommelier_pairing_score,
          sommelier_pairing_advice: item.sommelier_pairing_advice,
          sommelier_feedback_cost_usd: item.sommelier_feedback_cost_usd,
          sommelier_feedback_at: item.sommelier_feedback_at,
          created_at: item.created_at,
        };
      });
  const recentlyConsumedWineIds = new Set(
    latestConsumedEntries.slice(0, 8).map((entry) => entry.wine.id),
  );
  const dailyWineBudgetChf = Number(session?.daily_wine_budget_chf || 0);
  const hasDailyWineBudget = Number.isFinite(dailyWineBudgetChf) && dailyWineBudgetChf > 0;
  const rankedDailyTonightWines = [...drinkNowCandidates]
    .sort((first, second) => {
      const firstRecentlyConsumed = recentlyConsumedWineIds.has(first.id) ? 1 : 0;
      const secondRecentlyConsumed = recentlyConsumedWineIds.has(second.id) ? 1 : 0;
      return (
        firstRecentlyConsumed - secondRecentlyConsumed
        || (winePriorityDrinkEnd(first) || 9999) - (winePriorityDrinkEnd(second) || 9999)
        || wineUnitValue(first) - wineUnitValue(second)
        || first.name.localeCompare(second.name)
      );
    });
  const dailyTonightGroups = dailyWineToneOrder.map((tone) => {
    const toneCandidates = rankedDailyTonightWines
      .filter((candidate) => wineTone(candidate.type) === tone);
    const winesForTone = (
      hasDailyWineBudget
        ? toneCandidates.filter((wine) => wineUnitValue(wine) <= dailyWineBudgetChf)
        : toneCandidates
    ).slice(0, 3);
    return {
      tone,
      label: wineToneLabel(tone, locale),
      wines: winesForTone,
    };
  });
  const dailyPremiumWines = hasDailyWineBudget
    ? rankedDailyTonightWines
        .filter((wine) => wineUnitValue(wine) > dailyWineBudgetChf)
        .slice(0, 8)
    : [];
  // This is deliberately deterministic: it reuses the cellar data already in
  // memory and never turns a dashboard visit into an AI request.
  const dailySommelierWines = rankedDailyTonightWines.slice(0, 3);
  const dailySommelierCountLabel = dailySommelierWines.length === 1
    ? t("dailySommelierCandidateOne")
    : t("dailySommelierCandidates");
  const cellarSommelierEligibleWines = wines
    .filter((wine) => isWinePhysicallyInCellar(wine) && Math.max(Number(wine.quantity || 0), 0) > 0)
    .filter((wine) => {
      const windowEnd = winePriorityDrinkEnd(wine);
      return Boolean(windowEnd && (isWineReadyToPrioritize(wine, currentYear) || windowEnd < currentYear));
    })
    .sort((first, second) => {
      const firstReadiness = isWineAtMaturityPeak(first, currentYear) ? 0 : isWineReadyToPrioritize(first, currentYear) ? 1 : 2;
      const secondReadiness = isWineAtMaturityPeak(second, currentYear) ? 0 : isWineReadyToPrioritize(second, currentYear) ? 1 : 2;
      return firstReadiness - secondReadiness || (winePriorityDrinkEnd(first) || 9999) - (winePriorityDrinkEnd(second) || 9999);
    });
  const cellarSommelierSelectionLimit = Math.min(5, Math.max(1, Math.ceil(
    wines.filter((wine) => isWinePhysicallyInCellar(wine) && Math.max(Number(wine.quantity || 0), 0) > 0).length * 0.05,
  )));
  const cellarSommelierSoonWines = wines
    .filter((wine) => isWinePhysicallyInCellar(wine) && Math.max(Number(wine.quantity || 0), 0) > 0)
    .filter((wine) => !cellarSommelierEligibleWines.some((candidate) => candidate.id === wine.id) && isWineIdealSoon(wine, currentYear))
    .sort((first, second) => (wineIdealWindowStart(first) || 9999) - (wineIdealWindowStart(second) || 9999))
    .slice(0, 2);
  // Wines ready now come first; wines whose ideal window is about to open only
  // fill the slots that ready wines leave free, never displacing them.
  const cellarSommelierReadyPicks = cellarSommelierEligibleWines.slice(0, cellarSommelierSelectionLimit);
  const cellarSommelierSelectedWines = [
    ...cellarSommelierReadyPicks,
    ...cellarSommelierSoonWines.slice(0, Math.max(cellarSommelierSelectionLimit - cellarSommelierReadyPicks.length, 0)),
  ];
  const cellarSommelierHighlightedWine = cellarSommelierHighlightedWineId
    ? cellarSommelierSelectedWines.find((wine) => wine.id === cellarSommelierHighlightedWineId)
    : null;
  const cellarSommelierWines = activeView === "cellar"
    ? (cellarSommelierHighlightedWine ? [cellarSommelierHighlightedWine] : cellarSommelierSelectedWines.slice(0, 3))
    : dailySommelierWines;
  const cellarSommelierContext = activeView === "cellar"
    ? t("dailySommelierCellarIntro")
    : t("dailySommelierIntro");
  const isSommelierSpotlightWine = (wine: Wine) => {
    return !isRestaurant && cellarSommelierSelectedWines.some((candidate) => candidate.id === wine.id);
  };

  useEffect(() => {
    if (!activeMembership) return;
    setRestaurantSettingsDraft({
      defaultPourDl: String((activeMembership.restaurant_default_pour_size_ml || 100) / 100),
      serviceLossMl: String(activeMembership.restaurant_service_loss_ml ?? 50),
      reorderThreshold: String(activeMembership.restaurant_default_reorder_threshold ?? 2),
    });
  }, [activeMembership?.household_id, activeMembership?.restaurant_default_pour_size_ml, activeMembership?.restaurant_service_loss_ml, activeMembership?.restaurant_default_reorder_threshold]);

  useEffect(() => {
    if (isRestaurant || !(["home", "cellar"] as ViewName[]).includes(activeView) || !cellarSommelierWines.length) return;
    if (automaticCellarSommelierPromptShownRef.current || hasShownAutomaticCellarSommelierPrompt() || !canShowAutomaticCellarSommelierPrompt()) return;
    const visitKey = `vinaris-cellar-sommelier-${activeView}`;
    if (window.sessionStorage.getItem(visitKey)) return;
    window.sessionStorage.setItem(visitKey, "seen");
    const timer = window.setTimeout(() => {
      if (automaticCellarSommelierPromptShownRef.current || hasShownAutomaticCellarSommelierPrompt()) return;
      automaticCellarSommelierPromptShownRef.current = true;
      markAutomaticCellarSommelierPromptShown();
      setCellarSommelierVisible(true);
      setCellarSommelierOpen(false);
    }, 18_000 + Math.round(Math.random() * 27_000));
    return () => window.clearTimeout(timer);
  }, [activeView, cellarSommelierWines.length, cellarSommelierWines[0]?.id, isRestaurant]);

  useEffect(() => {
    if (isRestaurant || activeView !== "cellar") return;
    if (automaticCellarSommelierPromptShownRef.current || hasShownAutomaticCellarSommelierPrompt() || !canShowAutomaticCellarSommelierPrompt()) return;
    const rows = Array.from(document.querySelectorAll<HTMLElement>("[data-sommelier-wine-id]"));
    if (!rows.length) return;
    const observer = new IntersectionObserver((entries) => {
      const entry = entries.find((candidate) => candidate.isIntersecting && !cellarSommelierPromptedWineIdsRef.current.has(candidate.target.getAttribute("data-sommelier-wine-id") || ""));
      const wineId = entry?.target.getAttribute("data-sommelier-wine-id");
      if (!wineId || !entry) return;
      cellarSommelierPromptedWineIdsRef.current.add(wineId);
      observer.unobserve(entry.target);
      window.setTimeout(() => {
        if (automaticCellarSommelierPromptShownRef.current || hasShownAutomaticCellarSommelierPrompt()) return;
        automaticCellarSommelierPromptShownRef.current = true;
        markAutomaticCellarSommelierPromptShown();
        setCellarSommelierHighlightedWineId(wineId);
        setCellarSommelierVisible(true);
        setCellarSommelierOpen(false);
      }, 18_000 + Math.round(Math.random() * 27_000));
    }, { threshold: 0.72 });
    rows.forEach((row) => observer.observe(row));
    return () => observer.disconnect();
  }, [activeView, filteredWines, isRestaurant]);
  // Year beside a sommelier suggestion, phrased like the cellar row's maturity line.
  const sommelierWindowLabel = (wine: Wine) => {
    const idealStart = wine.drink_peak_from || wine.drink_from;
    const idealEnd = wine.drink_peak_to || wine.drink_to;
    const it = locale === "it";
    if (idealStart && currentYear < idealStart) return it ? `dal ${idealStart}` : `from ${idealStart}`;
    if (idealEnd && currentYear <= idealEnd) return it ? `fino al ${idealEnd}` : `until ${idealEnd}`;
    if (wine.drink_to && currentYear <= wine.drink_to) return it ? `entro il ${wine.drink_to}` : `by ${wine.drink_to}`;
    return wine.drink_to ? String(wine.drink_to) : "—";
  };
  const dailyRecommendationReason = (wine: Wine) => {
    const windowEnd = winePriorityDrinkEnd(wine);
    if (windowEnd && windowEnd < currentYear) return t("dailyReasonPastWindow");
    if (windowEnd && windowEnd <= currentYear + 2) return t("dailyReasonShortWindow");
    if (isWineIdealSoon(wine, currentYear)) return t("dailyReasonSoon");
    if (
      wine.drink_peak_from
      && wine.drink_peak_to
      && wine.drink_peak_from <= currentYear
      && wine.drink_peak_to >= currentYear
    ) return t("dailyReasonAtPeak");
    return t("dailyReasonRotation");
  };
  const balancedAvailableWines = cellarWines.filter(
    (wine) => isWinePhysicallyInCellar(wine) && ownedBottleCount(wine, session) > 0,
  );
  const balancedAvailableBottleCount = balancedAvailableWines.reduce(
    (total, wine) => total + ownedBottleCount(wine, session),
    0,
  );
  const balancedMaturityBuckets = maturityBuckets(balancedAvailableWines, currentYear, locale);
  const balancedToneRows = wineToneOrder
    .map((tone) => ({
      tone,
      label: wineToneLabel(tone, locale),
      bottles: balancedAvailableWines
        .filter((wine) => wineTone(wine.type) === tone)
        .reduce((total, wine) => total + ownedBottleCount(wine, session), 0),
    }))
    .sort((first, second) => first.bottles - second.bottles);
  const balancedCoreToneRows = (["red", "white", "sparkling", "rose"] as WineTone[])
    .map((tone) => balancedToneRows.find((row) => row.tone === tone))
    .filter((row): row is (typeof balancedToneRows)[number] => Boolean(row));
  const balancedCoreBottleCount = balancedCoreToneRows.reduce((total, row) => total + row.bottles, 0);
  const balancedCoreStyleCoverage = balancedCoreToneRows.filter((row) => row.bottles > 0).length;
  const balancedStyleConcentration = balancedCoreBottleCount
    ? balancedCoreToneRows.reduce((total, row) => total + (row.bottles / balancedCoreBottleCount) ** 2, 0)
    : 1;
  const balancedStyleScore = balancedCoreBottleCount
    ? Math.round(Math.max(0, Math.min(100, ((1 - balancedStyleConcentration) / 0.75) * 100)))
    : 0;
  const balancedLeadingTone = balancedCoreBottleCount
    ? [...balancedCoreToneRows].sort((first, second) => second.bottles - first.bottles)[0]
    : undefined;
  const balancedLeadingTonePct = balancedLeadingTone && balancedCoreBottleCount
    ? Math.round((balancedLeadingTone.bottles / balancedCoreBottleCount) * 100)
    : 0;
  const cellarHeroBottleCount = cellarWines.reduce((sum, wine) => sum + Math.max(Number(wine.quantity || 0), 0), 0);
  // Hero figures complement each view's own KPI cards instead of repeating them;
  // the collector and insight views keep the plain bottle/wine line.
  const homeHeroStats: CellarHomeHeroStat[] | undefined = dashboardFocus === "balanced" ? [
      { value: formatBottleCount(cellarWines.length, locale), label: locale === "it" ? "vini" : "wines" },
      { value: `${balancedCoreStyleCoverage}/4`, label: locale === "it" ? "stili coperti" : "styles covered" },
      { value: formatPercentage(balancedLeadingTonePct, locale), label: (balancedLeadingTone?.label || (locale === "it" ? "stile prevalente" : "leading style")).toLowerCase() },
    ]
    : dashboardFocus === "daily" ? [
      { value: formatBottleCount(cellarWines.length, locale), label: locale === "it" ? "vini" : "wines" },
      { value: formatBottleCount(monitoringWines.length, locale), label: locale === "it" ? "da monitorare" : "to review" },
    ]
    : dashboardFocus === "personal" ? [
      { value: formatBottleCount(cellarHeroBottleCount, locale), label: locale === "it" ? "bottiglie" : "bottles" },
      { value: formatBottleCount(cellarWines.length, locale), label: locale === "it" ? "vini" : "wines" },
      { value: formatBottleCount(readyInCellarWineCount, locale), label: locale === "it" ? "pronti da bere" : "ready to drink" },
    ]
    : undefined;
  const balancedReadyPct = balancedAvailableBottleCount
    ? Math.round((readyInCellarBottleCount / balancedAvailableBottleCount) * 100)
    : 0;
  if (offlineMode) {
    tastingStats.latest = latestConsumedEntries[0]?.consumed_at || "";
  }
  const topValueWines = [...cellarWines]
    .sort((first, second) => wineUnitValue(second) - wineUnitValue(first))
    .slice(0, 5);
  const keyPositionCandidates = (() => {
    const positionValue = (wine: Wine) => wineUnitValue(wine) * wine.quantity;
    const ownedValue = (wine: Wine) => positionValue(wine) * (currentUserSharePct(wine, session) / 100);
    const trendDateFormatter = new Intl.DateTimeFormat(numberLocale(locale), { month: "short", year: "numeric" });
    const priceIncreasePct = (wine: Wine) => {
      return featuredValue(wine).changePct;
    };
    const selected = selectFeaturedWines({
      wines: cellarWines,
      today: now,
      positionValue,
      ownedValue,
      sharePct: (wine) => currentUserSharePct(wine, session),
      increasePct: priceIncreasePct,
    });

    return selected.map(({ wine, reason }) => {
      const sharePct = currentUserSharePct(wine, session);
      const totalValue = positionValue(wine);
      const purchasePrice = Number(wine.price || 0);
      const historicalPoints = wine.value_history
        .filter((entry) => entry.currency === wine.currency)
        .map((entry) => {
          const timestamp = new Date(entry.recorded_at).getTime();
          return {
            value: Number(entry.value || 0),
            timestamp,
            label: Number.isFinite(timestamp) ? trendDateFormatter.format(new Date(timestamp)) : "",
          };
        })
        .filter((entry) => Number.isFinite(entry.value) && entry.value > 0 && Number.isFinite(entry.timestamp))
        .sort((first, second) => first.timestamp - second.timestamp);
      const currentValue = Number(wine.current_value || historicalPoints[historicalPoints.length - 1]?.value || 0);
      const parsedOrderDate = wine.order_date ? new Date(`${wine.order_date.slice(0, 10)}T00:00:00`).getTime() : Number.NaN;
      const purchaseTimestamp = parsedOrderDate;
      const historySincePurchase = historicalPoints.filter((point) => point.timestamp > purchaseTimestamp);
      const trendPoints = purchasePrice > 0 && currentValue > 0 && Number.isFinite(purchaseTimestamp)
        ? [{ value: purchasePrice, timestamp: purchaseTimestamp, label: t("purchasePrice") }, ...historySincePurchase]
        : historicalPoints;
      const latestTrendPoint = trendPoints[trendPoints.length - 1];
      const estimatedAt = wine.ai_value_estimated_at ? new Date(wine.ai_value_estimated_at).getTime() : Number.NaN;
      if (currentValue > 0 && Number.isFinite(estimatedAt) && (!latestTrendPoint || estimatedAt > latestTrendPoint.timestamp)) {
        trendPoints.push({ value: currentValue, timestamp: estimatedAt, label: formatDisplayDate(wine.ai_value_estimated_at!) });
      }
      const trendStart = trendPoints[0];
      const trendEnd = trendPoints[trendPoints.length - 1];
      const trendChangePct = trendStart && trendEnd && trendStart.value > 0
        ? (trendEnd.value - trendStart.value) / trendStart.value * 100
        : null;
      const trendChangeValue = trendStart && trendEnd ? trendEnd.value - trendStart.value : null;
      const drinkStart = wine.drink_from || wine.drink_peak_from || null;
      const drinkEnd = wine.drink_to || wine.drink_peak_to || null;
      const maturityStart = Math.min(Number(wine.vintage) || drinkStart || currentYear, drinkStart || currentYear);
      const maturityEnd = Math.max(drinkEnd || currentYear, currentYear);
      const maturitySpan = Math.max(maturityEnd - maturityStart, 1);
      const maturityProgress = drinkStart && drinkEnd
        ? Math.max(0, Math.min(100, ((currentYear - maturityStart) / maturitySpan) * 100))
        : 0;
      const maturityPeakLeft = drinkStart && drinkEnd
        ? Math.max(0, Math.min(100, ((drinkStart - maturityStart) / maturitySpan) * 100))
        : 0;
      const maturityPeakWidth = drinkStart && drinkEnd
        ? Math.max(4, Math.min(100 - maturityPeakLeft, ((drinkEnd - drinkStart) / maturitySpan) * 100))
        : 0;
      const hasMaturityWindow = Boolean(drinkStart && drinkEnd);
      return {
        wine,
        isLargestPriceIncrease: reason === "increase",
        reason,
        highlight: reason === "increase" ? t("largestPriceIncrease") : featuredHighlight(reason, locale) || t("keyPosition"),
        sharePct,
        ownedValue: totalValue * (sharePct / 100),
        totalValue,
        maturityProgress,
        maturityPeakLeft,
        maturityPeakWidth,
        maturityStart: hasMaturityWindow ? maturityStart : null,
        maturityEnd: hasMaturityWindow ? maturityEnd : null,
        trendPoints: wine.details_loaded === false ? [] : trendPoints,
        trendChangePct,
        trendChangeValue,
        trendRange: trendPoints.length >= 2 && trendStart && trendEnd ? `${trendStart.label}–${trendEnd.label}` : null,
        hasMaturityWindow,
      };
    });
  })();
  const keyPositionIds = keyPositionCandidates.map(({ wine }) => wine.id).join("|");
  const activeKeyPosition = keyPositionCandidates[Math.min(activeKeyPositionIndex, Math.max(keyPositionCandidates.length - 1, 0))];
  const featuredWineId = activeKeyPosition?.wine.id;
  const featuredNeedsDetail = activeKeyPosition?.wine.details_loaded === false;
  useEffect(() => {
    if (activeView !== "home" || !featuredWineId || !featuredNeedsDetail || offlineMode || !session?.authenticated) return;
    let cancelled = false;
    api<Wine>(`/api/v1/wines/${featuredWineId}`).then((detail) => {
      if (cancelled) return;
      setWines(current => current.map(wine => wine.id === detail.id && wine.details_loaded === false ? detail : wine));
    }).catch(() => {
      // Keep the purchase/current-value comparison if history cannot be loaded.
    });
    return () => { cancelled = true; };
  }, [activeView, featuredWineId, featuredNeedsDetail, offlineMode, session?.authenticated, session?.active_household_id]);
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

  const allMissingValueWines = cellarWines.filter((wine) => !wine.current_value && !wine.value_not_found);
  const allValueRefreshWines = cellarWines.filter((wine) => !wine.value_not_found && needsValueRefresh(wine, valueRefreshDaysNumber, now));
  const allMissingDrinkWindowWines = cellarWines.filter((wine) => hasVintageForDrinkWindow(wine) && (!wine.drink_from || !wine.drink_to));
  const allMissingGrapesWines = cellarWines.filter((wine) => wine.grapes.length === 0 && !wine.grapes_not_applicable);
  const allMissingScoresWines = cellarWines.filter((wine) => wine.scores.length === 0 && !wine.scores_not_applicable);
  const allMissingCellarPurposeWines = cellarWines.filter((wine) => !(wine.strategy_purposes || []).length);
  const missingValueWines = allMissingValueWines.slice(0, 8);
  const valueRefreshWines = allValueRefreshWines.slice(0, 8);
  const missingDrinkWindowWines = allMissingDrinkWindowWines.slice(0, 8);
  const missingGrapesWines = allMissingGrapesWines.slice(0, 8);
  const missingScoresWines = allMissingScoresWines.slice(0, 8);
  const incompleteWineCount = new Set([
    ...allMissingValueWines,
    ...allMissingDrinkWindowWines,
    ...allMissingGrapesWines,
    ...allMissingScoresWines,
    ...allMissingCellarPurposeWines,
  ].map((wine) => wine.id)).size;
  const maxRegionValue = Math.max(...valueByRegion.map((item) => item.value), 1);
  const maxProducerValue = Math.max(...valueByProducer.map((item) => item.value), 1);
  const dashboardFocusLabels: Record<DashboardFocus, string> = {
    personal: locale === "it" ? "La mia dashboard" : "My dashboard",
    collector: t("collectorFocus"),
    daily: t("dailyFocus"),
    balanced: t("balancedFocus"),
    value: t("valueFocus"),
    readiness: t("drinkingWindow"),
    timeline: t("timeline"),
    data: t("dataFocus"),
    taste: locale === "it" ? "Il mio gusto" : "My Taste",
  };
  const dashboardFocusIcons: Record<DashboardFocus, AppIconName> = {
    personal: "dashboard-cards",
    collector: "cellar",
    daily: "glass-sparkle",
    balanced: "dashboard",
    value: "chart",
    readiness: "glass-sparkle",
    timeline: "calendar",
    data: "settings",
    taste: "grapes",
  };
  const dashboardInsightFocuses: DashboardFocus[] = ["value", "readiness", "timeline", "data", "taste"];
  const isDashboardInsightFocus = dashboardInsightFocuses.includes(dashboardFocus);
  const settingsTabLabels: Record<SettingsTab, string> = {
    profile: t("settingsProfile"),
    ai: t("settingsAi"),
    restaurant: locale === "it" ? "Ristorante" : "Restaurant",
    storage: locale === "it" ? "Collocazione" : "Storage",
    tags: t("settingsTags"),
    sharing: t("settingsSharing"),
    users: t("settingsUsers"),
    announcements: locale === "it" ? "Comunicazioni" : "Announcements",
    photos: locale === "it" ? "Fotografie" : "Photographs",
    operations: locale === "it" ? "Operatività" : "Operations",
    data: t("settingsData"),
  };
  const settingsTabs = (Object.keys(settingsTabLabels) as SettingsTab[]).filter(
    (tab) => (tab !== "restaurant" || isRestaurant) && (tab !== "users" || canAppAdmin) && (tab !== "announcements" || (canAppAdmin && !session?.is_demo)) && (tab !== "photos" || canAppAdmin) && (tab !== "operations" || canAppAdmin) && (tab !== "tags" || canWriteWine),
  );
  const operationalActionScope = `${session?.user_email || "anonymous"}:${session?.active_household_id || "offline"}`;
  const pendingCoOwnershipAgreements = myCoOwnershipAgreements.filter((agreement) => agreement.status === "pending");
  const outstandingCoOwnershipShares = myCoOwnershipAgreements
    .filter((agreement) => !["invalidated", "declined"].includes(agreement.status))
    .flatMap((agreement) => agreement.participants
      .filter((participant) => participant.outstanding !== null && Number(participant.outstanding) > 0)
      .map((participant) => ({ agreement, participant })));
  const openCoOwnershipAgreements = (agreementId: string) => {
    setCoOwnershipAgreementFocusId(agreementId);
    setCoOwnershipLibraryVisible(true);
    setActiveView("settings");
    setSettingsTab("sharing");
    setNotificationsOpen(false);
    loadSettingsTabData("sharing");
  };
  const operationalActionCandidates: OperationalActionItem[] = [
    missedDeliveryItems.length ? {
      id: "missed-deliveries",
      kind: "smart_missed_deliveries",
      title: t("missedDeliveries"),
      detail: `${missedDeliveryItems[0].wine.name}${missedDeliveryItems[0].wine.merchant ? ` - ${missedDeliveryItems[0].wine.merchant}` : ""} · ${locale === "it" ? `${missedDeliveryItems[0].daysLate} g di ritardo` : `${missedDeliveryItems[0].daysLate}d late`}`,
      count: missedDeliveryItems.length,
      signature: missedDeliveryItems.map(({ wine }) => `${wine.id}:${wine.expected_delivery || ""}`).join("|"),
      onOpen: () => {
        setActiveView("home");
        setDashboardFocus("timeline");
        setNotificationsOpen(false);
      },
    } : null,
    pendingCoOwnershipAgreements.length ? {
      id: "coownership-pending",
      kind: "coownership_agreement",
      title: t("pendingCoOwnershipAgreements"),
      detail: pendingCoOwnershipAgreements[0]
        ? `${String(pendingCoOwnershipAgreements[0].wine_snapshot.name || "")} ${String(pendingCoOwnershipAgreements[0].wine_snapshot.vintage || "")}`.trim()
        : t("openFilteredCellar"),
      count: pendingCoOwnershipAgreements.length,
      signature: pendingCoOwnershipAgreements.map((agreement) => `${agreement.id}:${agreement.status}`).join("|"),
      onOpen: () => openCoOwnershipAgreements(pendingCoOwnershipAgreements[0].id),
    } : null,
    outstandingCoOwnershipShares.length ? {
      id: "coownership-outstanding",
      kind: "coownership_payment",
      title: t("unpaidCoOwnershipShares"),
      detail: outstandingCoOwnershipShares[0]
        ? `${String(outstandingCoOwnershipShares[0].agreement.wine_snapshot.name || "")} · ${outstandingCoOwnershipShares[0].participant.name}`
        : t("openFilteredCellar"),
      count: outstandingCoOwnershipShares.length,
      signature: outstandingCoOwnershipShares.map(({ agreement, participant }) => `${agreement.id}:${participant.id}:${participant.outstanding}`).join("|"),
      onOpen: () => openCoOwnershipAgreements(outstandingCoOwnershipShares[0].agreement.id),
    } : null,
    cellarStats.pastWindow ? {
      id: "past-window",
      kind: "smart_past_window",
      title: t("pastWindow"),
      detail: atRiskWines[0] ? `${atRiskWines[0].name}${atRiskWines[0].drink_to ? ` - ${atRiskWines[0].drink_to}` : ""}` : t("openFilteredCellar"),
      count: cellarStats.pastWindow,
      signature: `${cellarStats.pastWindow}:${atRiskWines[0]?.id || atRiskWines[0]?.name || ""}:${atRiskWines[0]?.drink_to || ""}`,
      onOpen: () => openOperationalCellarFilter("past_window"),
    } : null,
    readyInCellarWineCount ? {
      id: "drink-now",
      kind: "smart_drink_now",
      title: t("drinkNow"),
      detail: drinkNowWines[0] ? drinkNowWines[0].name : t("openFilteredCellar"),
      count: readyInCellarWineCount,
      signature: `${readyInCellarWineCount}:${drinkNowWines[0]?.id || drinkNowWines[0]?.name || ""}:${drinkNowWines[0]?.drink_from || ""}:${drinkNowWines[0]?.drink_to || ""}`,
      onOpen: () => openOperationalCellarFilter("drink_now"),
    } : null,
    // Only deliveries due within 30 days are worth a reminder, as for the server notification.
    deliveryHorizonStats.next30 ? {
      id: "future-deliveries",
      kind: "smart_future_deliveries",
      title: t("futureDeliveries"),
      detail: upcomingDeliveries[0] ? `${upcomingDeliveries[0].wine.name} - ${upcomingDeliveries[0].days} ${locale === "it" ? "g" : "d"}` : t("deliveryTimeline"),
      count: deliveryHorizonStats.next30,
      signature: `${deliveryHorizonStats.next30}:${upcomingDeliveries[0]?.wine.id || upcomingDeliveries[0]?.wine.name || ""}:${upcomingDeliveries[0]?.wine.expected_delivery || ""}`,
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
      detail: valueRefreshWines[0] ? [valueRefreshWines[0].name, valueRefreshWines[0].vintage, valueRefreshWines[0].producer].filter(Boolean).join(" · ") : t("openFilteredCellar"),
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
      detail: missingValueWines[0] ? [missingValueWines[0].name, missingValueWines[0].vintage, missingValueWines[0].producer].filter(Boolean).join(" · ") : t("openFilteredCellar"),
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
  const centerKinds = new Set([...observedNotificationKindsRef.current, ...notificationCenter.items.map((item) => item.kind)]);
  const operationalCenterKindById: Record<string, string> = {
    "coownership-pending": "coownership_agreement",
    "past-window": "smart_past_window",
    "drink-now": "smart_drink_now",
    "future-deliveries": "smart_future_deliveries",
    "missed-deliveries": "smart_missed_deliveries",
    "to-collect": "smart_to_collect",
  };
  const showLiveOperationalItems = notificationView === "active" && notificationStateFilter === "all";
  const supplementalOperationalItems = (showLiveOperationalItems ? operationalActionItems : []).filter((item) => {
    const matchingKind = operationalCenterKindById[item.id];
    return !matchingKind || !centerKinds.has(matchingKind);
  });
  const operationalActionItemsByCategory = {
    action: supplementalOperationalItems.filter((item) => item.id.startsWith("coownership-") || item.id === "to-collect" || item.id === "missed-deliveries"),
    system: supplementalOperationalItems.filter((item) => !item.id.startsWith("coownership-") && item.id !== "to-collect" && item.id !== "missed-deliveries"),
  };
  const supersededAdminNotificationIds = new Set(
    canAppAdmin && pendingUsers.length
      ? notificationCenter.items
        .filter((item) => item.kind === "new_user_registration")
        .map((item) => item.id)
      : [],
  );
  const visibleCenterItems = notificationCenter.items.filter((item) => !supersededAdminNotificationIds.has(item.id));
  const showLiveAdminItems = notificationView === "active";
  const adminActionCount = canAppAdmin && showLiveAdminItems ? pendingUsers.length + pendingCatalogEntries.length : 0;
  const displayedCenterCounts = notificationView === "active" && notificationStateFilter === "all"
    ? notificationActiveCounts
    : notificationCenter.counts;
  const notificationCategoryCounts = {
    action: displayedCenterCounts.actions - supersededAdminNotificationIds.size + operationalActionItemsByCategory.action.length + adminActionCount,
    update: displayedCenterCounts.updates,
    system: displayedCenterCounts.system + operationalActionItemsByCategory.system.length,
  };
  const allNotificationTabCount = notificationCategoryCounts.action + notificationCategoryCounts.update + notificationCategoryCounts.system;
  const notificationCount = notificationActiveCounts.unread
    + supplementalOperationalItems.length
    + (canAppAdmin ? pendingCatalogEntries.length : 0);
  const activeNotificationItems = notificationTab === "all"
    ? visibleCenterItems
    : visibleCenterItems.filter((item) => item.category === notificationTab);
  const activeOperationalItems = notificationTab === "action"
    ? operationalActionItemsByCategory.action
    : notificationTab === "system"
      ? operationalActionItemsByCategory.system
      : notificationTab === "all"
        ? [...operationalActionItemsByCategory.action, ...operationalActionItemsByCategory.system]
        : [];
  const showAdminActionItems = notificationTab === "all" || notificationTab === "action";
  const activeRedeemCodesCount = redeemCodes.filter((code) => code.is_active).length;
  const adminUsersSorted = [...appUsers].sort((first, second) => {
    if (first.is_approved !== second.is_approved) return Number(first.is_approved) - Number(second.is_approved);
    if (first.is_blocked !== second.is_blocked) return Number(first.is_blocked) - Number(second.is_blocked);
    return (first.display_name || first.email).localeCompare(second.display_name || second.email);
  });
  const normalizedAdminUserQuery = adminUserQuery.trim().toLocaleLowerCase(locale);
  const filteredAdminUsers = adminUsersSorted.filter((user) => {
    const matchesQuery = !normalizedAdminUserQuery || `${user.display_name} ${user.email} ${appUserRoleLabel(user, locale)}`.toLocaleLowerCase(locale).includes(normalizedAdminUserQuery);
    if (!matchesQuery) return false;
    if (adminUserStatusFilter === "pending") return !user.is_approved;
    if (adminUserStatusFilter === "blocked") return user.is_blocked;
    if (adminUserStatusFilter === "active") return user.is_approved && !user.is_blocked && user.last_activity_days_ago !== null && user.last_activity_days_ago <= 30;
    if (adminUserStatusFilter === "inactive") return user.last_activity_days_ago === null || user.last_activity_days_ago > 30;
    return true;
  });
  const selectedAdminUser = appUsers.find((user) => user.id === selectedAdminUserId) || filteredAdminUsers[0] || null;
  const quickWineFilterLabels: Record<QuickWineFilter, string> = {
    "": t("totalValue"),
    mine: t("myBottles"),
    shared: t("sharedBottles"),
    in_cellar: displayValue("in_cellar", locale, "status"),
    drink_now: t("drinkNow"),
    drink_soon: t("drinkIn2Years"),
    past_window: t("pastWindow"),
    future_deliveries: t("futureDeliveries"),
    to_collect: t("winesToCollect"),
    missing_data: t("dataQuality"),
    low_stock: locale === "it" ? "Da ordinare" : "To reorder",
    missing_sale_price: locale === "it" ? "Prezzo di vendita mancante" : "Missing sale price",
  };
  const activeCollectionFilterChips: Array<{ key: string; label: string; onRemove: () => void }> = [
    ...(searchQuery.trim() ? [{ key: "query", label: `“${searchQuery.trim()}”`, onRemove: () => setSearchQuery("") }] : []),
    ...(regionFilter ? [{ key: "region", label: `${locale === "it" ? "Regione" : "Region"}: ${regionFilter}`, onRemove: () => setRegionFilter("") }] : []),
    ...(typeFilter ? [{ key: "type", label: displayValue(typeFilter, locale, "type"), onRemove: () => setTypeFilter("") }] : []),
    ...(statusFilter ? [{ key: "status", label: displayValue(statusFilter, locale, "status"), onRemove: () => setStatusFilter("") }] : []),
    ...(storageFilter ? [{ key: "storage", label: storageFilterOptions.find((item) => item.value === storageFilter)?.label || storageFilter, onRemove: () => setStorageFilter("") }] : []),
    ...(strategyPurposeFilter ? [{ key: "strategy-purpose", label: `${locale === "it" ? "Obiettivo" : "Purpose"}: ${strategyPurposeLabel(strategyPurposeFilter, locale)}`, onRemove: () => setStrategyPurposeFilter("") }] : []),
    ...(ownershipFilter ? [{ key: "ownership", label: ownershipFilter === "mine" ? t("myBottles") : t("sharedBottles"), onRemove: () => setOwnershipFilter("") }] : []),
    ...(quickWineFilter ? [{ key: "quick", label: quickWineFilterLabels[quickWineFilter], onRemove: () => setQuickWineFilter("") }] : []),
    ...(maturityFilter ? [{ key: "maturity", label: `${wineToneLabel(maturityFilter.tone, locale)} ${maturityFilter.year}`, onRemove: () => setMaturityFilter(null) }] : []),
    ...(hasMinBottlePrice || hasMaxBottlePrice ? [{
      key: "price",
      label: `CHF ${hasMinBottlePrice ? minBottlePrice : bottlePriceRangeMin}–${hasMaxBottlePrice ? maxBottlePrice : bottlePriceRangeMax}`,
      onRemove: () => { setMinBottlePriceFilter(""); setMaxBottlePriceFilter(""); },
    }] : []),
    ...(tagFilter.length ? [{ key: "tags", label: `${t("tag")}: ${tagFilter.length}`, onRemove: () => setTagFilter([]) }] : []),
    ...(grapeFilter.length ? [{ key: "grapes", label: `${t("grapes")}: ${grapeFilter.length}`, onRemove: () => setGrapeFilter([]) }] : []),
  ];

  function startAddWine() {
    clearWineRecognitionState();
    setWineRecognitionTarget("wine");
    setDraft({
      ...emptyDraft,
      pour_size_ml: isRestaurant ? String(activeMembership?.restaurant_default_pour_size_ml || 100) : emptyDraft.pour_size_ml,
      reorder_threshold: isRestaurant ? String(activeMembership?.restaurant_default_reorder_threshold ?? 2) : emptyDraft.reorder_threshold,
    });
    setOpenWineEditorSections({});
    setPendingBottlePhoto(null);
    setWinePhotoSuggestions([]);
    setWinePhotoSuggestionIndex(0);
    setSelectedSuggestedPhotoId(null);
    setEditingId(null);
    setWineFormOpen(true);
  }

  function startAddWineFromAnywhere() {
    chooseAddWine();
  }

  /** The "+" sheet with everything to add; offline only the wine form works. */
  function chooseAddWine() {
    if (offlineMode) {
      startDetailedWine();
      return;
    }
    addTriggerRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setAddWineChooserOpen(true);
  }

  /** The full wine form, which lives in the cellar view. */
  function startDetailedWine() {
    leaveHelpFor("cellar");
    setWishlistFormOpen(false);
    setSelectedWineId(null);
    clearFilters("cellar");
    startAddWine();
  }

  /** Switch to a main view, closing what belongs to the previous one. */
  function openView(view: ViewName) {
    leaveHelpFor(view);
    setWineFormOpen(false);
    setWishlistFormOpen(false);
    setSelectedWineId(null);
    clearFilters(view);
  }

  /** Arrow down from a search field moves into its feature shortcuts, if any. */
  function focusFeatureSuggestion(event: ReactKeyboardEvent<HTMLInputElement>) {
    if (event.key !== "ArrowDown") return;
    const first = event.currentTarget.form?.querySelector<HTMLButtonElement>(".feature-suggestions button");
    if (!first) return;
    event.preventDefault();
    first.focus();
  }

  /** Features the search can open for this user: same rules as their usual entries. */
  function featureAvailable(id: FeatureId) {
    if (["add-quick", "add-receipt", "tasting"].includes(id)) return canWriteWine && !offlineMode;
    if (["add-detailed", "wishlist-add"].includes(id)) return canWriteWine;
    if (id === "assistant") return !isRestaurant && canAccessCellarAssistant;
    if (["strategy", "moments", "tastings", "archived"].includes(id)) return !isRestaurant && (id !== "moments" || !offlineMode);
    if (["news", "pulse"].includes(id)) return !offlineMode;
    if (["value", "readiness", "timeline", "data-quality", "taste", "personal-dashboard"].includes(id)) return !isRestaurant;
    if (["tags", "settings-ai"].includes(id)) return canWriteWine;
    return true;
  }

  /** Open a feature picked from the search, leaving the search empty behind it. */
  function openFeature(id: FeatureId) {
    setSearchQuery("");
    setMobileSearchOpen(false);
    const settings = (tab: SettingsTab) => { setActiveView("settings"); setSettingsTab(tab); loadSettingsTabData(tab); };
    const home = (focus: DashboardFocus) => { openView("home"); setDashboardFocus(focus); };
    const diary = (section: HistorySection) => { openView("history"); setHistorySection(section); };
    switch (id) {
      case "add-quick": setBottlePhotoImportOpen(true); break;
      case "add-detailed": startDetailedWine(); break;
      case "add-receipt": setPurchaseImportOpen(true); break;
      case "tasting": setRecordTastingOpen(true); break;
      case "wishlist-add": openView("wishlist"); startAddWishlistItem(); break;
      case "assistant": openSommelierFeature("assistant"); break;
      case "pairing-home": case "pairing-restaurant": case "shelf": case "buying": case "strategy": openSommelierFeature(id); break;
      case "moments": diary("moments"); break;
      case "tastings": diary("tastings"); break;
      case "archived": diary("wines"); break;
      case "sales": diary("sales"); break;
      case "pulse": openView("pulse"); break;
      case "value": home("value"); break;
      case "readiness": home("readiness"); break;
      case "timeline": home("timeline"); break;
      case "data-quality": home("data"); break;
      case "taste": home("taste"); break;
      case "personal-dashboard": home("personal"); break;
      case "subscription": openSubscriptionSettings(); break;
      case "settings-ai": settings("ai"); break;
      case "storage": settings("storage"); break;
      case "tags": settings("tags"); break;
      case "cellars": settings("sharing"); break;
      case "data": settings("data"); break;
      case "help": openHelp(); break;
      case "news": openNews(true, true); break;
    }
  }

  /** The Sommelier AI page leads to each AI feature, already on the right path. */
  function openSommelierFeature(destination: SommelierDestination) {
    if (destination === "assistant") openView("assistant");
    else if (destination === "strategy") openView("intelligence");
    else if (destination === "shelf" || destination === "buying") {
      setBuyingStartPlace(destination === "shelf" ? "shelf" : "advice");
      openView("buying");
    } else {
      setPairingTargetWineId(null);
      setPairingStartPlace(destination === "pairing-restaurant" ? "restaurant" : "home");
      openView("pairing");
    }
  }

  function prepareAssistantPurchaseDraft(purchase: CellarCommandPurchaseDraft) {
    clearWineRecognitionState();
    setWineRecognitionTarget("wine");
    setDraft({
      ...emptyDraft,
      name: purchase.name,
      producer: purchase.producer,
      vintage: purchase.vintage,
      quantity: String(purchase.quantity || 1),
      currency: purchase.currency || emptyDraft.currency,
      price: purchase.price === null ? emptyDraft.price : String(purchase.price),
      format: purchase.format,
      type: normalizeWineType(purchase.type),
      region: purchase.region,
      appellation: purchase.appellation,
      merchant: purchase.merchant,
      order_date: purchase.order_date,
      status: purchase.status,
      grapes: purchase.grapes_text ? grapesFromText(purchase.grapes_text) : [],
      pour_size_ml: isRestaurant ? String(activeMembership?.restaurant_default_pour_size_ml || 100) : emptyDraft.pour_size_ml,
      reorder_threshold: isRestaurant ? String(activeMembership?.restaurant_default_reorder_threshold ?? 2) : emptyDraft.reorder_threshold,
    });
    setOpenWineEditorSections({});
    setPendingBottlePhoto(null);
    setWinePhotoSuggestions([]);
    setWinePhotoSuggestionIndex(0);
    setSelectedSuggestedPhotoId(null);
    setEditingId(null);
    setSelectedWineId(null);
    setWishlistFormOpen(false);
    setActiveView("cellar");
    setWineFormOpen(true);
  }

  function startAddWishlistItem() {
    setWishlistEntryIntent("save");
    clearWineRecognitionState();
    setWineRecognitionTarget("wishlist");
    setWineFormOpen(false);
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
    setWineEditorExpanded(false);
    setSelectedWineId(wine.id);
    setEditingId(wine.id);
    setDraft(wineToDraft(wine));
    setOpenWineEditorSections({});
    setWineEditorStrategySummary(null);
    setPendingBottlePhoto(null);
    setWinePhotoSuggestions([]);
    setWinePhotoSuggestionIndex(0);
    setSelectedSuggestedPhotoId(null);
    setWineFormOpen(true);
  }

  function startEditWishlistItem(item: WishlistItem) {
    clearWineRecognitionState();
    setSelectedWishlistId(item.id);
    setEditingWishlistId(item.id);
    setWishlistDraft(wishlistToDraft(item));
    setWineFormOpen(false);
    setWishlistFormOpen(true);
  }

  function isInteractiveRowClick(event: MouseEvent<HTMLElement>) {
    return Boolean((event.target as HTMLElement).closest("button, input, select, textarea, label, a, summary"));
  }

  function toggleSelectedWine(wine: Wine) {
    setWineStorageFocus(null);
    const tone = wineTone(wine.type);
    if (selectedWineId === wine.id) {
      closeMobileWineDetail();
      return;
    }
    setOpenWineToneGroups((groups) => ({ ...groups, [tone]: true }));
    setSelectedWineId(wine.id);
    if (isMobileViewport) {
      if (mobileWineDetailHistoryActiveRef.current) {
        window.history.replaceState({ ...window.history.state, vinarisMobileWineDetail: wine.id }, "", window.location.href);
      } else {
        window.history.pushState({ ...window.history.state, vinarisMobileWineDetail: wine.id }, "", window.location.href);
        mobileWineDetailHistoryActiveRef.current = true;
      }
    }
  }

  async function importCellarTrackerFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setSaving(true);
    setError("");
    try {
      const bytes = await file.arrayBuffer();
      const byteValues = new Uint8Array(bytes);
      let binary = "";
      for (let start = 0; start < byteValues.length; start += 0x8000) {
        binary += String.fromCharCode(...byteValues.subarray(start, start + 0x8000));
      }
      // Preserve the original bytes: CellarTracker exports are often Windows-1252.
      const csvBase64 = btoa(binary);
      const preview = await api<ImportPreview>("/api/v1/imports/cellartracker/preview", {
        method: "POST", body: JSON.stringify({ csv_base64: csvBase64 }),
      });
      setImportPayload(null);
      setCellarTrackerCsvText(csvBase64);
      setImportSource("cellartracker");
      setImportFileName(file.name);
      setImportPreview(preview);
      setImportSelection(importSelectionFromBlocks(preview.included_blocks));
      setImportResult(null);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Unable to import CellarTracker CSV");
    } finally {
      setSaving(false);
      event.target.value = "";
    }
  }

  function openWineStoragePanel(wine: Wine) {
    setOpenWineToneGroups((groups) => ({ ...groups, [wineTone(wine.type)]: true }));
    setSelectedWineId(wine.id);
    setWineStorageFocus((current) => ({ wineId: wine.id, requestId: (current?.requestId || 0) + 1 }));
    if (isMobileViewport) {
      if (mobileWineDetailHistoryActiveRef.current) {
        window.history.replaceState({ ...window.history.state, vinarisMobileWineDetail: wine.id }, "", window.location.href);
      } else {
        window.history.pushState({ ...window.history.state, vinarisMobileWineDetail: wine.id }, "", window.location.href);
        mobileWineDetailHistoryActiveRef.current = true;
      }
    }
  }

  function openCellarSommelierForWine(wine: Wine) {
    cellarSommelierPromptedWineIdsRef.current.add(wine.id);
    setCellarSommelierHighlightedWineId(wine.id);
    setCellarSommelierVisible(true);
    setCellarSommelierOpen(true);
  }

  function openWineSalePanel(wine: Wine) {
    setSelectedWineId(wine.id);
    if (isMobileViewport && !mobileWineDetailHistoryActiveRef.current) {
      window.history.pushState({ ...window.history.state, vinarisMobileWineDetail: wine.id }, "", window.location.href);
      mobileWineDetailHistoryActiveRef.current = true;
    }
    window.requestAnimationFrame(() => window.requestAnimationFrame(() => {
      const detail = [...document.querySelectorAll<HTMLElement>(`[data-wine-detail-id="${wine.id}"]`)]
        .find((candidate) => candidate.getClientRects().length > 0);
      const panel = detail?.querySelector<HTMLDetailsElement>(".sale-panel");
      if (!panel) return;
      panel.open = true;
      panel.scrollIntoView({ behavior: "smooth", block: "center" });
    }));
  }

  function revealLatestWineEditorField() {
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        const container = wineEditorScrollRef.current;
        container?.scrollTo({ top: container.scrollHeight, behavior: "smooth" });
      });
    });
  }

  function closeMobileWineDetail() {
    if (mobileWineDetailHistoryActiveRef.current) {
      window.history.back();
      return;
    }
    setSelectedWineId(null);
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
    setWineEditorExpanded(false);
    setEditingId(null);
    setDraft(emptyDraft);
    setPendingBottlePhoto(null);
    setWinePhotoSuggestions([]);
    setWinePhotoSuggestionIndex(0);
    setSelectedSuggestedPhotoId(null);
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
    setRegionFilter("");
    setTypeFilter("");
    setStatusFilter("");
    setStorageFilter("");
    setStrategyPurposeFilter("");
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

  function openCellarForRegion(region: string) {
    const normalizedRegion = region.trim();
    if (!normalizedRegion) return;
    setActiveView("cellar");
    setSearchQuery("");
    setRegionFilter(normalizedRegion);
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
    setSortMode("name");
    setSelectedWineId(null);
    setWineFormOpen(false);
    setWishlistFormOpen(false);
    setNotificationsOpen(false);
    filterPanelRef.current?.removeAttribute("open");
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

  function selectRegionalGapProfile(profile: RegionalGapProfile) {
    setRegionalGapProfile(profile);
    const targets = regionalGapProfileTargets[profile]?.length ? regionalGapProfileTargets[profile]! : regionalGapTargets;
    setRegionalGapDraft(targets.map((target) => ({ region: target.region, targetPct: String(target.targetPct) })));
    setRegionalGapAiSuggestion(regionalGapAiSuggestions.find((suggestion) => suggestion.profile === profile) || null);
    setRegionalGapFeedback("");
  }

  function persistRegionalGapSettings(
    targets: RegionalGapTarget[],
    profileTargets: Partial<Record<RegionalGapProfile, RegionalGapTarget[]>>,
    suggestions: RegionalGapAiSuggestion[],
  ) {
    const lastSuggestion = suggestions[0] || null;
    return api<RegionalGapSettings>("/api/v1/household/regional-gap-settings", {
      method: "PUT",
      body: JSON.stringify({
        targets,
        last_ai_suggestion: lastSuggestion,
        profile_targets: profileTargets,
        ai_suggestions: suggestions.slice(0, 24),
      }),
    });
  }

  function saveRegionalGapTargets(nextDraft: RegionalGapTargetDraft[] = regionalGapDraft) {
    const nextTargets = normalizeRegionalTargets(nextDraft.map((target) => ({ region: target.region, targetPct: Number(target.targetPct || 0) })));
    const nextProfileTargets = { ...regionalGapProfileTargets, [regionalGapProfile]: nextTargets };
    setRegionalGapTargets(nextTargets);
    setRegionalGapDraft(nextTargets.map((target) => ({ region: target.region, targetPct: String(target.targetPct) })));
    setRegionalGapProfileTargets(nextProfileTargets);
    void persistRegionalGapSettings(nextTargets, nextProfileTargets, regionalGapAiSuggestions);
    setRegionalGapTargetsOpen(false);
    setRegionalGapFeedback(t("regionalTargetsSaved"));
  }

  function resetRegionalGapTargets() {
    const nextTargets = regionalTargetsForCellar(cellarWines);
    const nextProfileTargets = { ...regionalGapProfileTargets, [regionalGapProfile]: nextTargets };
    setRegionalGapTargets(nextTargets);
    setRegionalGapDraft(nextTargets.map((target) => ({ region: target.region, targetPct: String(target.targetPct) })));
    setRegionalGapProfileTargets(nextProfileTargets);
    void persistRegionalGapSettings(nextTargets, nextProfileTargets, regionalGapAiSuggestions);
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
      const generatedSuggestion = { ...result, generated_at: new Date().toISOString() };
      const generatedTargets = normalizeRegionalTargets(
        generatedSuggestion.targets.map((target) => ({ region: target.region, targetPct: Number(target.target_pct) })),
        regionalGapTargets,
      );
      const nextProfileTargets = { ...regionalGapProfileTargets, [regionalGapProfile]: generatedTargets };
      const nextSuggestions = [generatedSuggestion, ...regionalGapAiSuggestions].slice(0, 24);
      setRegionalGapProfileTargets(nextProfileTargets);
      setRegionalGapAiSuggestions(nextSuggestions);
      setRegionalGapAiSuggestion(generatedSuggestion);
      setRegionalGapTargetsOpen(true);
      await persistRegionalGapSettings(regionalGapTargets, nextProfileTargets, nextSuggestions);
      await Promise.all([loadAiAudit(), loadAiUsage()]);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Unable to generate regional target");
    } finally {
      setGeneratingAi("");
    }
  }

  function applyRegionalGapAiSuggestion() {
    if (!regionalGapAiSuggestion) return;
    const nextDraft = regionalGapSelectedTargets.map((target) => {
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
    void api<OperationalActionSnoozeRecord>("/api/v1/household/operational-action-snoozes", {
      method: "POST",
      body: JSON.stringify({
        action_id: item.id,
        signature: item.signature,
        until: new Date(snoozeUntil).toISOString(),
      }),
    })
      .then(() => clearOperationalActionSnooze(actionKey))
      .catch(() => {
        // The local entry remains as a temporary offline fallback and is retried at the next login.
      });
  }

  function toggleSettingsView() {
    const nextView: ViewName = activeView === "settings"
      ? settingsReturnViewRef.current
      : "settings";
    leaveHelpFor(nextView);
    if (nextView === "settings") loadSettingsTabData(settingsTab);
    setWineFormOpen(false);
    setWishlistFormOpen(false);
    clearFilters(nextView);
  }

  function openBreakdownDrilldown(title: TranslationKey, dimension: "type" | "region", metric: BreakdownMetric, label: string) {
    setBreakdownDrilldown({ title, dimension, metric, label });
  }

  // The dashboard has no drilldown panel: its "Open in cellar" passes the slice directly.
  function openBreakdownInCellar(drilldown: BreakdownDrilldown = breakdownDrilldown) {
    if (!drilldown) return;
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
    setSortMode(drilldown.metric === "value" ? "value" : "name");
    setTypeFilter(drilldown.dimension === "type" ? drilldown.label : "");
    if (drilldown.dimension === "region") {
      setSearchQuery(drilldown.label === "Unknown region" ? "" : drilldown.label);
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
        <button type="button" onClick={() => openBreakdownInCellar()}>
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
    setWineStorageFocus(null);
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

  function openDishPairingForWine(wine?: Wine) {
    if (!wine) return;
    setPairingTargetWineId(wine.id);
    setPairingMarketOnly(false);
    setPairingPreferLocal(false);
    setPairingLocalOrigin("");
    setActiveView("pairing");
  }

  async function updateWineRating(wine: Wine, rating: string) {
    setSaving(true);
    setError("");
    try {
      const updated = await api<Wine>(`/api/v1/wines/${wine.id}`, {
        method: "PATCH",
        body: JSON.stringify({ rating: Number(rating || 0) }),
      });
      setWines((current) => current.map((item) => (item.id === updated.id ? updated : item)));
      setSelectedWineId(updated.id);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Unable to update wine rating");
    } finally {
      setSaving(false);
    }
  }

  function openWineFromPairing(wine: Wine) {
    setSelectedWineId(wine.id);
    setPairingWineDetailId(wine.id);
  }

  function openWineFromTastingArchive(wineId: string) {
    const wine = wines.find((item) => item.id === wineId);
    if (!wine) return;
    setSelectedWineId(wine.id);
    setWineDetailExpanded(true);
  }

  function openQuickWineSearch(nextQuery: string) {
    setActiveView("cellar");
    setHistorySection("wines");
    setSearchQuery(nextQuery);
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
    setSortMode("name");
    setSelectedWineId(null);
    setWineFormOpen(false);
    setWishlistFormOpen(false);
  }

  function toggleWineDetailFocus() {
    setWineDetailExpanded((expanded) => !expanded);
  }

  function closeWineDetailModal() {
    setWineDetailExpanded(false);
    setPairingWineDetailId(null);
    if (activeView === "pairing" || (activeView === "history" && historySection === "tastings")) setSelectedWineId(null);
  }

  const activePairingBudget = Number(pairingMaxPrice || 0);
  const hasPairingBudget = Number.isFinite(activePairingBudget) && activePairingBudget > 0;
  const cellarBottleValues = wines
    .map((wine) => Number(wine.current_value || wine.price || 0))
    .filter((value) => Number.isFinite(value) && value > 0);
  const pairingBudgetSliderMax = Math.max(250, Math.ceil(Math.max(...cellarBottleValues, 250) / 50) * 50);
  const pairingBudgetSliderValue = hasPairingBudget ? Math.min(activePairingBudget, pairingBudgetSliderMax) : 0;
  const pairingBudgetPresets = [40, 80, 150].filter((value) => value < pairingBudgetSliderMax);

  function renderReadyWidget() {
    return (<article className="dashboard-card priority-card">
                  <div className="card-heading">
                    <div>
                      <span>{t("priorityActions")}</span>
                      <h2><i className="dashboard-section-icon" aria-hidden="true">{collectorFocusSvgIcon("drink_now")}</i>{t("drinkNow")}</h2>
                    </div>
                    <strong>{formatBottleCount(cellarStats.drinkNowBottles, locale)} {locale === "it" ? "bott." : "btl."}</strong>
                  </div>
                  <div className="priority-summary" aria-label={t("drinkNow")}>
                    <div>
                      <span>{t("currentValue")}</span>
                      <strong>{formatMoney(drinkNowTotalValue, "CHF", locale)}</strong>
                    </div>
                    <div>
                      <span>{t("drinkWindow")}</span>
                      <strong>{nearestDrinkNowEnd || "—"}</strong>
                    </div>
                    <button type="button" onClick={() => openOperationalCellarFilter("drink_soon")}>
                      <span>{t("drinkIn2Years")}</span>
                      <strong>{cellarStats.drinkSoon} {t("wines").toLowerCase()}</strong>
                    </button>
                  </div>
                  {drinkNowWines.length ? (
                    <CollectorReadyWines wines={drinkNowWines} locale={locale} canShowPhotos={canAccessWinePhotos} onOpen={openWineFromDashboard}>
                    <DashboardBottleSlideshow
                      wines={drinkNowWines}
                      canShowPhotos={canAccessWinePhotos}
                      onOpen={openWineFromDashboard}
                      label={t("drinkNow")}
                      meta={(wine) => `${wineIdealWindowStart(wine)}–${winePriorityDrinkEnd(wine)}`}
                      previousLabel={locale === "it" ? "Bottiglia precedente" : "Previous bottle"}
                      nextLabel={locale === "it" ? "Bottiglia successiva" : "Next bottle"}
                      pauseLabel={locale === "it" ? "Pausa slideshow" : "Pause slideshow"}
                      playLabel={locale === "it" ? "Avvia slideshow" : "Play slideshow"}
                    />
                    </CollectorReadyWines>
                  ) : <p className="empty-state">{t("noActionItems")}</p>}
                  {priorityDrinkSoonWines.length ? (
                    <div className="priority-next-window">
                      <div className="priority-next-heading">
                        <span>{t("drinkIn2Years")}</span>
                        <button type="button" onClick={() => openOperationalCellarFilter("drink_soon")}>{t("openFilteredCellar")}</button>
                      </div>
                      <div className="action-list priority-next-list">
                        {priorityDrinkSoonWines.map((wine) => (
                          <button type="button" className="action-row" key={wine.id} onClick={() => openWineFromDashboard(wine)}>
                            <span><i className={`wine-dot tone-${wineTone(wine.type)}`} />{wine.name}</span>
                            <strong>{wineIdealWindowStart(wine)}-{wine.drink_peak_to || winePriorityDrinkEnd(wine)}</strong>
                          </button>
                        ))}
                      </div>
                    </div>
                  ) : null}
                </article>);
  }

  function renderRecentWidget() {
    return (<article className="dashboard-card recent-wines-card">
                  <div className="card-heading">
                    <div>
                      <span>{locale === "it" ? "Nuovi ingressi" : "New entries"}</span>
                      <h2><i className="dashboard-section-icon" aria-hidden="true"><AppIcon name="bottle" /></i>{locale === "it" ? "Ultimi vini aggiunti" : "Recently added wines"}</h2>
                    </div>
                    <strong>{recentCellarWines.length}</strong>
                  </div>
                  <p className="dashboard-photo-card-help">
                    {locale === "it" ? "Le aggiunte più recenti alla tua cantina." : "The latest additions to your cellar."}
                  </p>
                  {recentCellarWines.length ? (
                    <DashboardBottleList
                      wines={recentCellarWines}
                      canShowPhotos={canAccessWinePhotos}
                      onOpen={openWineFromDashboard}
                      label={locale === "it" ? "Ultimi vini aggiunti" : "Recently added wines"}
                      meta={(wine) => wine.created_at ? formatDisplayDate(wine.created_at) : `${formatBottleCount(wine.quantity, locale)} ${t("bottles").toLowerCase()}`}
                    />
                  ) : <p className="empty-state">{t("noActionItems")}</p>}
                </article>);
  }

  function renderRegionsWidget() {
    return (<article className="dashboard-card wide-card geographic-map-card">
                  <div className="card-heading">
                    <div>
                      <span>{t("geographicMap")}</span>
                      <h2><i className="dashboard-section-icon" aria-hidden="true">{collectorFocusSvgIcon("regions")}</i>{t("wineOrigins")}</h2>
                    </div>
                  </div>
                  <DeferredWineGeographyMap wines={cellarWines} t={t} onSelectRegion={openCellarForRegion} locale={locale} />
                </article>);
  }

  function renderDeliveriesWidget() {
    return (<article className="dashboard-card priority-card">
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
                      {missedDeliveryItems.length ? <div className="timeline-kpi-missed"><span>{t("missedDeliveries")}</span><strong>{missedDeliveryItems.length}</strong></div> : null}
                    </div>
                  </article>);
  }

  function renderTopValueWidget() {
    return (<article className="dashboard-card wide-card top-value-showcase">
                    <div className="card-heading">
                      <div>
                        <span>{t("valueFocus")}</span>
                        <h2>{locale === "it" ? "Le 5 bottiglie più preziose" : "The 5 most valuable bottles"}</h2>
                      </div>
                      <strong>{formatMoney(topValueWines.reduce((total, wine) => total + wineUnitValue(wine), 0), "CHF", locale)}</strong>
                    </div>
                    <p className="top-value-showcase-intro">
                      {locale === "it" ? "I pezzi che definiscono il vertice economico della tua cantina." : "The bottles that define the financial peak of your cellar."}
                    </p>
                    <div className="top-value-showcase-grid">
                      {topValueWines.map((wine, index) => (
                        <button type="button" className={`top-value-showcase-item tone-${wineTone(wine.type)}`} key={wine.id} onClick={() => openWineFromDashboard(wine)}>
                          <span className="top-value-showcase-rank">{String(index + 1).padStart(2, "0")}</span>
                          <span className="top-value-showcase-photo" aria-hidden="true">
                            <KeyPositionBottleVisual photoUrl={canAccessWinePhotos ? wine.photo_thumbnail_url || wine.photo_detail_url : ""} detailUrl={canAccessWinePhotos ? wine.photo_detail_url : undefined} sizes="110px" tone={wineTone(wine.type)} />
                          </span>
                          <span className="top-value-showcase-copy">
                            <strong>{wine.name}</strong>
                            <small>{[wine.producer, wine.vintage].filter(Boolean).join(" · ") || displayValue(wine.type, locale, "type")}</small>
                            <em>{[wine.region, wine.appellation].filter(Boolean).join(" · ")}</em>
                          </span>
                          <span className="top-value-showcase-value">
                            <strong>{formatMoney(wineUnitValue(wine), wine.currency, locale)}</strong>
                            <small>{formatBottleCount(wine.quantity, locale)} {t("bottles").toLowerCase()} · {formatMoney(wineUnitValue(wine) * wine.quantity, wine.currency, locale)}</small>
                          </span>
                        </button>
                      ))}
                    </div>
                  {!topValueWines.length && <p className="empty-state">{t("noActionItems")}</p>}
                  </article>);
  }

  function renderValueTypeWidget() {
    return (<article className="dashboard-card wide-card wine-value-constellation-card">
                      <div className="card-heading">
                        <div>
                          <span>{locale === "it" ? "Composizione del portafoglio" : "Portfolio composition"}</span>
                          <h2>{locale === "it" ? "Valore per tipologia" : "Value by type"}</h2>
                        </div>
                        <strong>{formatMoney(valueByCanonicalType.reduce((total, item) => total + item.value, 0), "CHF", locale)}</strong>
                      </div>
                      <p className="dashboard-card-intro">{locale === "it" ? "Esplora la costellazione: ogni fascia rappresenta il peso economico di una tipologia nella tua cantina." : "Explore the constellation: each band represents a wine type's economic weight in your cellar."}</p>
                      <WineValueConstellation
                        items={valueByCanonicalType}
                        locale={locale}
                        onOpen={(item) => openBreakdownInCellar({ title: "valueByType", dimension: "type", metric: "value", label: item.label })}
                      />
                    {!valueByCanonicalType.length && <p className="empty-state">{t("noActionItems")}</p>}
                  </article>);
  }

  function renderValueRegionWidget() {
    return (<article className="dashboard-card wide-card">
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
                  {!valueByRegion.length && <p className="empty-state">{t("noActionItems")}</p>}
                  </article>);
  }

  function renderValueProducerWidget() {
    return (<article className="dashboard-card">
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
                  {!valueByProducer.length && <p className="empty-state">{t("noActionItems")}</p>}
                  </article>);
  }

  function renderStyleBalanceWidget() {
    // Largest styles first, so the proportion bar and the list read in the same order.
    const toneRowsByStock = [...balancedToneRows].sort((first, second) => second.bottles - first.bottles);
    const stockedToneRows = toneRowsByStock.filter((row) => row.bottles > 0);
    return (<article className="dashboard-card wide-card balance-overview-card">
                    <div className="card-heading">
                      <div>
                        <span>{t("balancedOverviewEyebrow")}</span>
                        <h2>{t("balancedOverviewTitle")}</h2>
                      </div>
                      <strong>{formatBottleCount(balancedAvailableBottleCount, locale)}</strong>
                    </div>
                    {stockedToneRows.length ? (
                      <div
                        className="balance-mix"
                        role="img"
                        aria-label={`${t("balancedOverviewTitle")}: ${stockedToneRows.map((row) => `${row.label} ${formatBottleCount(row.bottles, locale)}`).join(", ")}`}
                      >
                        {stockedToneRows.map((row) => <span key={row.tone} className={`tone-${row.tone}`} style={{ flexGrow: row.bottles }} />)}
                      </div>
                    ) : null}
                    <div className="balance-indicator-grid">
                      <div className="balance-indicator balance-indicator-score">
                        <span>{t("balanceStyleIndex")}</span>
                        <strong>{balancedStyleScore}<small>/100</small></strong>
                        <p>{t("balanceStyleIndexHelp")}</p>
                      </div>
                      <div className="balance-indicator">
                        <span>{t("balanceStyleCoverage")}</span>
                        <strong>{balancedCoreStyleCoverage}<small>/4</small></strong>
                        <p>{t("balanceStyleCoverageHelp")}</p>
                      </div>
                      <button
                        type="button"
                        className="balance-indicator"
                        onClick={() => openOperationalCellarFilter("drink_now")}
                      >
                        <span>{t("balanceReadyRotation")}</span>
                        <strong>{formatBottleCount(readyInCellarBottleCount, locale)}</strong>
                        <p>{formatPercentage(balancedReadyPct, locale)} {t("balanceOfAvailable")}</p>
                      </button>
                      <div className="balance-indicator">
                        <span>{t("balanceMainConcentration")}</span>
                        <strong>{formatPercentage(balancedLeadingTonePct, locale)}</strong>
                        <p>{balancedLeadingTone?.label || t("balanceNoData")}</p>
                      </div>
                    </div>
                    <div className="balance-tone-grid">
                      {toneRowsByStock.map((row) => (
                        <button
                          type="button"
                          key={row.tone}
                          className={row.bottles ? undefined : "is-empty"}
                          onClick={() => {
                            clearFilters("cellar");
                            setTypeFilter(wineTypeForTone(row.tone));
                            setQuickWineFilter("in_cellar");
                            setActiveView("cellar");
                          }}
                        >
                          <i className={`wine-dot tone-${row.tone}`} />
                          <span>{row.label}</span>
                          <strong>{formatBottleCount(row.bottles, locale)}</strong>
                        </button>
                      ))}
                    </div>
                  </article>);
  }

  function renderPastWindowWidget() {
    return (<article className="dashboard-card daily-expired-card">
                    <div className="card-heading">
                      <div>
                        <span>{t("dailyDrinkSoon")}</span>
                        <h2>{t("pastWindow")}</h2>
                      </div>
                      <strong>{cellarStats.pastWindow}</strong>
                    </div>
                    <div className="action-list">
                      {atRiskWines.length ? atRiskWines.map((wine) => (
                        <button
                          type="button"
                          className="action-row"
                          key={wine.id}
                          onClick={() => openWineFromDashboard(wine)}
                        >
                          <span>
                            <i className={`wine-dot tone-${wineTone(wine.type)}`} />
                            {wine.name}
                          </span>
                          <strong>{wine.drink_to}</strong>
                        </button>
                      )) : <p className="empty-state">{t("noActionItems")}</p>}
                    </div>
                    <button
                      type="button"
                      className="secondary"
                      onClick={() => openOperationalCellarFilter("past_window")}
                      disabled={!cellarStats.pastWindow}
                    >
                      {t("openFilteredCellar")}
                    </button>
                  </article>);
  }

  function renderToCollectWidget() {
    return (<article className="dashboard-card operational-summary-card">
                  <button type="button" className="card-heading card-heading-button" onClick={() => openOperationalCellarFilter("to_collect")}>
                    <div>
                      <span>{t("upcomingDeliveries")}</span>
                      <h2><i className="dashboard-section-icon" aria-hidden="true">{collectorFocusSvgIcon("to_collect")}</i>{t("winesToCollect")}</h2>
                    </div>
                    <strong>{cellarStats.toCollect} {t("wines").toLowerCase()}</strong>
                  </button>
                  <div className="action-list">
                    {winesToCollect.length ? winesToCollect.map((wine) => (
                      <button type="button" className="action-row" key={wine.id} onClick={() => openWineFromDashboard(wine)}>
                        <span><i className={`wine-dot tone-${wineTone(wine.type)}`} />{wine.name}</span>
                        <strong>{wine.merchant || formatDisplayDate(wine.expected_delivery) || wine.status}</strong>
                      </button>
                    )) : <p className="empty-state">{t("noActionItems")}</p>}
                  </div>
                </article>);
  }

  function renderPersonalWidget(widget: PersonalDashboardWidget, preview = false) {
    if ((widget.id === "polaroids" || widget.id === "memories") && !canAccessMemories) return <PremiumMemoriesNotice locale={locale} polaroids={widget.id === "polaroids"} onActivate={openSubscriptionSettings} />;
    if (widget.id === "polaroids") return <Suspense fallback={<LoadingState label={t("loadingData")} compact />}><PolaroidsWidget locale={locale} preview={preview} offline={offlineMode} /></Suspense>;
    if (widget.id === "memories") return <Suspense fallback={<LoadingState label={t("loadingData")} compact />}><MemoriesWidget locale={locale} preview={preview} offline={offlineMode} /></Suspense>;
    return <Suspense fallback={<LoadingState label={t("loadingData")} compact />}><DashboardSummaryWidget
      widget={widget} locale={locale} wines={wines} wishlist={wishlist} featured={keyPositionCandidates}
      canShowPhotos={canAccessWinePhotos} onOpen={wine => { if (!preview) openWineFromDashboard(wine); }} onRegion={region => { if (!preview) openCellarForRegion(region); }}
      onPairing={wine => { if (!preview) openDishPairingForWine(wine); }}
      onNavigate={destination => {
        if (preview) return;
        if (["collector", "daily", "balanced", "value", "readiness", "timeline", "taste", "data"].includes(destination)) {
          setActiveView("home"); setDashboardFocus(destination as DashboardFocus);
        } else if (destination === "history") {
          setHistorySection("tastings"); setActiveView("history");
        } else if (destination === "intelligence") {
          setActiveView("intelligence");
        } else if (destination === "cellar_to_collect") {
          openOperationalCellarFilter("to_collect");
        } else {
          setSearchQuery(""); setActiveView(destination as "wishlist" | "pulse");
        }
        window.scrollTo({ top: 0, behavior: "auto" });
      }}
    /></Suspense>;
  }

  function renderMaturityHeatmapCard(fullWidth = false) {
    return (
      <article className={`dashboard-card wide-card maturity-heatmap-card maturity-mobile-panel-${maturityMobilePanel}${fullWidth ? " maturity-heatmap-card-full" : ""}`}>
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
        <div className="maturity-mobile-panel-switcher" role="tablist" aria-label={t("drinkingWindow")}>
          <button
            type="button"
            role="tab"
            aria-selected={maturityMobilePanel === "map"}
            className={maturityMobilePanel === "map" ? "active" : "secondary"}
            onClick={() => setMaturityMobilePanel("map")}
          >
            {locale === "it" ? "Mappa maturità" : "Maturity map"}
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={maturityMobilePanel === "risk"}
            className={maturityMobilePanel === "risk" ? "active" : "secondary"}
            onClick={() => setMaturityMobilePanel("risk")}
          >
            {locale === "it" ? "Rischio capitale" : "Capital risk"}
          </button>
        </div>
        <Suspense fallback={<LoadingState label={t("loadingData")} />}>
          <MaturityPanorama
            points={maturityPanoramaPoints}
            currentYear={currentYear}
            summary={maturityPanoramaSummary}
            riskWines={cellarWines}
            riskYears={maturityHeatmapYears}
            t={t}
            locale={locale}
          />
        </Suspense>
        {maturityFilter ? (
          <div className="maturity-filter-pill">
            <span>{t("maturityFilter")}</span>
            <strong>{wineToneLabel(maturityFilter.tone, locale)} {maturityFilter.year}</strong>
          </div>
        ) : null}
        {maturityHeatmapRows.length || cellarWines.length ? (
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

  function renderRegionalGapCard(compact = false) {
    return (
      <article className={`dashboard-card wide-card regional-gap-card${compact ? " regional-gap-card-compact" : ""}`}>
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
        <div className="regional-profile-switcher" role="tablist" aria-label={t("regionalProfileCompare")}>
          {([
            ["investment", "regionalProfileInvestment"],
            ["balanced", "regionalProfileBalanced"],
            ["readiness", "regionalProfileReadiness"],
            ["daily", "regionalProfileDaily"],
          ] as Array<[RegionalGapProfile, TranslationKey]>).map(([profile, labelKey]) => (
            <button
              type="button"
              role="tab"
              aria-selected={regionalGapProfile === profile}
              key={profile}
              className={regionalGapProfile === profile ? "active" : "secondary"}
              onClick={() => selectRegionalGapProfile(profile)}
            >
              <i className={regionalGapProfileTargets[profile]?.length ? "ready" : ""} />
              {t(labelKey)}
            </button>
          ))}
        </div>
        <select className="regional-profile-mobile-select" value={regionalGapProfile} onChange={(event) => selectRegionalGapProfile(event.target.value as RegionalGapProfile)} aria-label={t("regionalProfileCompare")}>
          {([
            ["investment", "regionalProfileInvestment"],
            ["balanced", "regionalProfileBalanced"],
            ["readiness", "regionalProfileReadiness"],
            ["daily", "regionalProfileDaily"],
          ] as Array<[RegionalGapProfile, TranslationKey]>).map(([profile, labelKey]) => <option key={profile} value={profile}>{t(labelKey)}</option>)}
        </select>
        <div className={`regional-profile-status${regionalGapActiveSuggestion ? " generated" : ""}`}>
          {regionalGapActiveSuggestion ? t("regionalProfileGenerated") : t("regionalProfileNotGenerated")}
          {!regionalGapHasProfileTarget ? (
            <button type="button" className="secondary compact" disabled={!canGenerateAi || generatingAi === "regional-gap-targets"} onClick={generateRegionalGapTargets}>{t("suggestWithAi")}</button>
          ) : null}
        </div>
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
                <ButtonBusyContent busy={generatingAi === "regional-gap-targets"} idleLabel={t("suggestWithAi")} busyLabel={t("generating")} ai />
              </button>
              {regionalGapActiveSuggestion ? (
                <div className="regional-ai-proposal" ref={regionalGapProposalRef} tabIndex={-1}>
                  <strong>{t("aiTargetProposal")}</strong>
                  <p>{regionalGapAiCommentary(regionalGapActiveSuggestion, locale)}</p>
                  <div>
                    {regionalGapActiveSuggestion.targets.map((target) => (
                      <span key={target.region}>{target.region} {Number(target.target_pct).toFixed(1)}%</span>
                    ))}
                  </div>
                  <div className="regional-ai-cost">
                    <strong>{t("aiRequestCost")}</strong>
                    <span>{formatAiBudget(regionalGapActiveSuggestion.estimated_cost_usd)}</span>
                    <span>{regionalGapActiveSuggestion.model} · {t("reasoningEffort")}: {t(reasoningEffortTranslationKey(regionalGapActiveSuggestion.reasoning_effort))}</span>
                  </div>
                  <button type="button" onClick={applyRegionalGapAiSuggestion}>{t("applyAiTarget")}</button>
                </div>
              ) : null}
            </div>
          </div>
        ) : null}
        <div className="regional-gap-layout">
          <div className="regional-radar-wrap" ref={regionalGapChartRef}>
            <svg className="regional-radar" viewBox="0 0 100 100" role="img" aria-label={t("regionalGapAnalysis")}>
              {[25, 50, 75, 100].map((level) => (
                <polygon
                  className="regional-radar-ring"
                  key={level}
                  points={regionalGapRows.map((_, index) => radarScaledPoint(index, regionalGapRows.length, (regionalGapRadarScaleMax * level) / 100, regionalGapRadarScaleMax)).join(" ")}
                />
              ))}
              {regionalGapRows.length <= 8 ? [25, 50, 75, 100].map((level) => {
                const value = (regionalGapRadarScaleMax * level) / 100;
                const [x, y] = radarScaledPoint(1, regionalGapRows.length, value, regionalGapRadarScaleMax).split(",");
                const labelX = Math.min(Number(x) + 5.5, 92);
                return (
                  <g className="regional-radar-scale" key={`scale-${level}`}>
                    <line x1={x} y1={y} x2={labelX - 1.4} y2={y} />
                  <text x={labelX} y={y}>{Math.round(value * 10) / 10}%</text>
                </g>
                );
              }) : null}
              {regionalGapAxisPoints.map((axis) => (
                <line className="regional-radar-axis" key={axis.region} x1="50" y1="50" x2={axis.linePoint.split(",")[0]} y2={axis.linePoint.split(",")[1]} />
              ))}
              {regionalGapHasProfileTarget ? <polygon className="regional-radar-target" key={`target-${regionalGapProfile}-${regionalGapActiveSuggestion?.generated_at || "manual"}`} points={regionalGapTargetPoints} /> : null}
              <polygon className="regional-radar-current" key={`current-${regionalGapProfile}`} points={regionalGapCurrentPoints} />
              {regionalGapRows.map((row, index) => {
                const [x, y] = radarScaledPoint(index, regionalGapRows.length, row.currentPct, regionalGapRadarScaleMax).split(",");
                const detail = `${regionalTargetLabel(row.region, locale)}: ${t("currentPortfolio")} ${row.currentPct.toFixed(1)}%${regionalGapHasProfileTarget ? `, ${t("targetPortfolio")} ${row.targetPct.toFixed(1)}%` : ""}`;
                return <circle className="regional-radar-node" key={`node-${row.region}`} cx={x} cy={y} r="1.45" tabIndex={0} role="img" aria-label={detail}><title>{detail}</title></circle>;
              })}
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
              {regionalGapHasProfileTarget ? <span><i className="regional-legend-target" />{t("targetPortfolio")} {t(regionalGapProfileLabels[regionalGapProfile]).toLowerCase()}</span> : null}
            </div>
          </div>
          <details className="regional-gap-suggestions" open={compact ? undefined : !isMobileViewport}>
            <summary>{regionalGapActiveSuggestion ? t("regionalAiActions") : t("gapSuggestions")}</summary>
            {!regionalGapHasProfileTarget ? (
              <p className="regional-gap-help">{t("regionalProfileNotGenerated")}</p>
            ) : regionalGapActionRows.length ? regionalGapActionRows.map((row) => {
              const action = row.deltaPct > 1 ? t("regionalIncreaseExposure") : row.deltaPct < -1 ? t("regionalReduceExposure") : t("regionalMaintainExposure");
              const amount = Math.abs((regionalGapTotalValue * row.deltaPct) / 100);
              return (
              <div className="regional-gap-row" key={row.region}>
                <div>
                  <span>{action} · {row.region}</span>
                  <small>{t("currentPortfolio")} {Math.round(row.currentPct)}% / {t("targetPortfolio")} {row.targetPct}%</small>
                </div>
                <strong><small>{Math.abs(row.deltaPct).toFixed(1)}%</small>{formatMoney(amount, "CHF", locale)}</strong>
              </div>
              );
            }) : <p className="empty-state">{t("balancedPortfolio")}</p>}
            {regionalGapActiveSuggestion ? (
              <details className="regional-gap-suggestions">
                <summary>{t("regionalAiRationale")}</summary>
                <p className="regional-gap-help">{regionalGapAiCommentary(regionalGapActiveSuggestion, locale)}</p>
              </details>
            ) : null}
            {regionalGapAiSuggestions.length > 1 ? (
              <details className="regional-gap-suggestions">
                <summary>{t("regionalAiHistory")} ({regionalGapAiSuggestions.length - 1})</summary>
                {regionalGapAiSuggestions.filter((suggestion) => suggestion !== regionalGapActiveSuggestion).map((suggestion, index) => (
                  <button type="button" className="regional-history-row" key={`${suggestion.profile}-${suggestion.generated_at || index}`} onClick={() => selectRegionalGapProfile(suggestion.profile)}>
                    <span>{t(regionalGapProfileLabels[suggestion.profile])}</span>
                    <small>{suggestion.generated_at ? new Intl.DateTimeFormat(numberLocale(locale), { dateStyle: "medium" }).format(new Date(suggestion.generated_at)) : suggestion.model}</small>
                  </button>
                ))}
              </details>
            ) : null}
          </details>
        </div>
      </article>
    );
  }

  const publicBrandLockup = (
    <div className="public-brand-lockup">
      <img className="public-brand-mark" src="/icons/icon-192.png" alt="Vinaris" width="48" height="48" fetchPriority="high" />
      <div className="public-brand-copy">
        <strong>Vinaris</strong>
        <span>{locale === "it" ? "Private cellar intelligence" : "Private cellar intelligence"}</span>
      </div>
    </div>
  );

  if (coOwnershipToken) {
    return (
      <Suspense fallback={<LoadingState label={t("loadingData")} />}>
        <CoOwnershipPublicPage token={coOwnershipToken} locale={locale} onClose={() => setCoOwnershipToken("")} />
      </Suspense>
    );
  }

  function renderCoOwnershipSection(wine: Wine) {
    const owners = ownershipRows(wine);
    if (!owners.length && !coOwnershipAgreements.length) return null;
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
        <Suspense fallback={<LoadingState label={t("loadingData")} />}>
          <CoOwnershipPanel
            wine={wine}
            session={session}
            agreements={coOwnershipAgreements}
            canWrite={canWriteWine && !offlineMode}
            saving={saving}
            focusRequestId={coOwnershipFocusRequest?.wineId === wine.id ? coOwnershipFocusRequest.requestId : ""}
            onCreate={(payload) => createCoOwnershipAgreement(wine, payload)}
            onCancel={(agreement) => cancelCoOwnershipAgreement(wine, agreement)}
            onRecordPayment={(agreement, participantId, payload) => recordCoOwnershipPayment(wine, agreement, participantId, payload)}
            onVoidPayment={(agreement, paymentId) => voidCoOwnershipPayment(wine, agreement, paymentId)}
          />
        </Suspense>
      </section>
    );
  }

  function renderWineRowChips(wine: Wine) {
    return (<>
        {wine.storage_allocations?.length ? <button
          type="button"
          className="row-chip wine-storage-chip"
          onClick={(event) => {
            event.stopPropagation();
            openWineStoragePanel(wine);
          }}
        >
          <AppIcon name="location" variant="action" size="0.85rem" />
          {wine.storage_allocations[0].location_id
            ? `${wine.storage_allocations[0].location_name}${wine.storage_allocations[0].bin_name ? ` · ${wine.storage_allocations[0].bin_name}` : ""}`
            : (locale === "it" ? "Da collocare" : "Unassigned")}
          {wine.storage_allocations.length > 1 ? ` +${wine.storage_allocations.length - 1}` : ""}
        </button> : null}
        {activeView === "cellar" && isSommelierSpotlightWine(wine) ? (
          <button
            type="button"
            className="row-chip row-sommelier-notice"
            title={t("dailySommelierTitle")}
            onClick={(event) => {
              event.stopPropagation();
              openCellarSommelierForWine(wine);
            }}
            onPointerUp={(event) => {
              if (event.pointerType !== "touch") return;
              event.preventDefault();
              event.stopPropagation();
              openCellarSommelierForWine(wine);
            }}
          >
            <AppIcon name="glass-sparkle" variant="ai" tone="accent" size="0.9rem" />
            {t("dailySommelierAvailable")}
          </button>
        ) : null}
    </>);
  }

  function renderWineDetail(wine: Wine) {
    return (
      <WineDetail
        wine={wine}
        session={session}
        auditEntries={aiAudit.filter((entry) => entry.entity_type === "wine" && entry.entity_id === wine.id)}
        canGenerate={canGenerateAi}
        canWrite={canWriteWine}
        saving={saving}
        generating={generatingAi}
        onGenerate={(feature) => generateWineAi(wine, feature)}
        onOpenPairing={() => openDishPairingForWine(wine)}
        onToggleValueAiExclusion={(excluded) => setWineValueAiExclusion(wine, excluded)}
        onToggleGrapesAiExclusion={(excluded) => setWineGrapesAiExclusion(wine, excluded)}
        onToggleScoresAiExclusion={(excluded) => setWineScoresAiExclusion(wine, excluded)}
        onUpdateRating={(rating) => updateWineRating(wine, rating)}
        onConsume={(payload) => consumeWineBottle(wine, payload)}
        onLotsChanged={loadWines}
        restaurantMode={isRestaurant}
        salesHistory={wineSalesHistory?.wine_id === wine.id ? wineSalesHistory : null}
        salesHistoryLoading={wineSalesHistoryLoading}
        onSell={(payload) => sellWineBottles(wine, payload)}
        onUpdateCommercialStatus={(status) => updateWineCommercialStatus(wine, status)}
        onUpdateTastingEntry={updateWineTastingEntry}
        onDeleteTastingEntry={deleteWineTastingEntry}
        marketAuditEntry={aiAudit.find((entry) => entry.entity_type === "wine" && entry.entity_id === wine.id && ["ai_value", "wine_full_enrichment", "shared_value", "shared_full_enrichment"].includes(entry.feature)) || null}
        onOpenMarketView={(entry) => setMarketViewContext({ kind: "wine", wine, entry })}
        coOwnershipSection={renderCoOwnershipSection(wine)}
        photoActions={canManageWinePhotos ? (
          <Suspense fallback={null}>
            <BottlePhotoCapture
              wine={wine}
              canWrite={canWriteWine}
              locale={locale}
              onSaved={(updated) => setWines((current) => current.map((item) => item.id === updated.id ? updated : item))}
              onError={(message) => setError(formatUserErrorMessage(message, locale))}
            />
          </Suspense>
        ) : null}
        photoSuggestion={detailWinePhotoSuggestionWineId === wine.id ? detailWinePhotoSuggestion : null}
        onUseSuggestedPhoto={(sourceWineId) => void reuseWinePhoto(wine.id, sourceWineId)}
        onDismissSuggestedPhoto={() => {
          setDetailWinePhotoSuggestion(null);
          setDetailWinePhotoSuggestionWineId(null);
        }}
        showBottlePhoto={canAccessWinePhotos}
        focusStorageRequestId={wineStorageFocus?.wineId === wine.id ? wineStorageFocus.requestId : null}
        t={t}
        locale={locale}
      />
    );
  }

  function renderCellarSommelierLayer() {
    if (isRestaurant || !cellarSommelierVisible || !cellarSommelierWines.length || activeView !== "cellar") return null;
    // The cellar list adds wines whose peak is still ahead: name them as such
    // instead of calling every suggestion "to open now".
    const soonCount = cellarSommelierWines.filter((wine) => cellarSommelierSoonWines.some((soon) => soon.id === wine.id)).length;
    const countLabel = soonCount === 0
      ? (cellarSommelierWines.length === 1 ? t("dailySommelierCandidateOne") : t("dailySommelierCandidates"))
      : soonCount === cellarSommelierWines.length
        ? (cellarSommelierWines.length === 1 ? t("dailySommelierSoonOne") : t("dailySommelierSoonMany"))
        : t("dailySommelierMixed");
    return createPortal(
      <aside
        aria-label={t("dailySommelierTitle")}
        style={{
          position: "fixed",
          right: isMobileViewport ? 12 : 24,
          top: isMobileViewport ? "max(108px, calc(env(safe-area-inset-top, 0px) + 96px))" : undefined,
          bottom: isMobileViewport ? "auto" : 24,
          zIndex: 180,
          width: "min(360px, calc(100vw - 24px))",
          maxHeight: isMobileViewport ? "calc(100dvh - 120px)" : "calc(100dvh - 24px)",
        }}
      >
        <section
          style={{
            overflowY: isMobileViewport ? "auto" : "hidden",
            maxHeight: isMobileViewport ? "calc(100dvh - 120px)" : "calc(100dvh - 24px)",
            border: "1px solid var(--border)",
            borderRadius: 20,
            background: "color-mix(in srgb, var(--surface-raised) 86%, transparent)",
            backdropFilter: "blur(14px) saturate(1.08)",
            boxShadow: "0 16px 36px color-mix(in srgb, var(--collector-depth) 40%, transparent)",
          }}
        >
          <header style={{ display: "grid", gridTemplateColumns: "58px minmax(0, 1fr) auto", alignItems: "center", gap: 10, padding: "10px 10px 10px 12px", background: "color-mix(in srgb, var(--surface-muted) 80%, transparent)" }}>
            <img
              src="/images/sommelier_ai.png"
              alt=""
              style={{ width: 58, height: 58, objectFit: "cover", objectPosition: "center 18%", borderRadius: "50%", border: "1px solid var(--border)" }}
            />
            <button
              type="button"
              aria-expanded={cellarSommelierOpen}
              onClick={() => setCellarSommelierOpen((current) => !current)}
              style={{ minWidth: 0, padding: 0, border: 0, color: "var(--text)", textAlign: "left", background: "transparent", boxShadow: "none" }}
            >
              <span style={{ display: "grid", gap: 3 }}>
                <small style={{ color: "var(--accent)", fontWeight: 800 }}>{t("dailySommelierTitle")}</small>
                <strong>{cellarSommelierWines.length} {countLabel}</strong>
              </span>
            </button>
            <button
              type="button"
              aria-label={t("close")}
              title={t("close")}
              onClick={() => { setCellarSommelierVisible(false); postponeCellarSommelierPrompt(CELLAR_SOMMELIER_DISMISS_INTERVAL_MS); }}
              style={{ display: "grid", placeItems: "center", width: 30, height: 30, padding: 0, border: "1px solid var(--border)", borderRadius: "50%", color: "var(--text-muted)", background: "var(--surface-raised)", boxShadow: "none", fontSize: "1.15rem" }}
            >
              ×
            </button>
          </header>
          {cellarSommelierOpen ? (
            <div style={{ display: "grid", gap: 10, padding: 14 }}>
              <p style={{ margin: 0, color: "var(--text-muted)", lineHeight: 1.45 }}>{cellarSommelierContext}</p>
              <div style={{ display: "grid", gap: 7 }}>
                {cellarSommelierWines.map((wine) => (
                  <button
                    type="button"
                    key={wine.id}
                    onClick={() => openWineFromDashboard(wine)}
                    style={{ display: "grid", gridTemplateColumns: "auto minmax(0, 1fr) auto", alignItems: "center", gap: 8, width: "100%", padding: "9px 10px", border: "1px solid var(--border)", borderRadius: 11, color: "var(--text)", textAlign: "left", background: "var(--surface-muted)", boxShadow: "none" }}
                  >
                    <i className={`wine-dot tone-${wineTone(wine.type)}`} />
                    <span style={{ display: "grid", gap: 2, minWidth: 0 }}>
                      <strong style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{wine.name}</strong>
                      <small style={{ color: "var(--text-muted)", lineHeight: 1.3 }}>{dailyRecommendationReason(wine)}</small>
                    </span>
                    <b style={{ whiteSpace: "nowrap" }}>{sommelierWindowLabel(wine)}</b>
                  </button>
                ))}
              </div>
              {canGenerateAi ? (
                <button
                  type="button"
                  className="secondary"
                  style={{ width: "100%" }}
                  onClick={() => openDishPairingForWine(cellarSommelierWines[0])}
                >
                  {t("dailySommelierPairing")}
                </button>
              ) : null}
            </div>
          ) : null}
        </section>
      </aside>,
      document.body,
    );
  }

  return (
    <HelpContext.Provider value={{ openHelp }}>
    <main className={`app-shell${authenticated ? " authenticated-app-shell" : ""}${isCollectionView ? " collection-workspace-shell" : ""}${activeView === "home" && !isRestaurant ? " home-mobile-experience" : ""}${authenticated && activeView === "home" && !isRestaurant ? " cellar-home-edition" : ""}`}>
      {authenticated || shouldPrioritizeAuthAction ? (
      <header className={`topbar${authenticated && !isRestaurant && activeView !== "home" ? " cellar-compact-header" : ""}`} style={!authenticated && isMobileViewport ? { display: "grid", gridTemplateColumns: "minmax(0, 1fr)", alignItems: "stretch", gap: "12px" } : authenticated && !isRestaurant && activeView !== "home" ? { "--session-backdrop": `url("${sessionBackdropSrc()}")` } as CSSProperties : undefined}>
        {authenticated && activeView === "home" && !isRestaurant ? <CellarHomeBackdrop /> : null}
        <div className="topbar-brand">
          {authenticated ? (
            <>
              <img className="topbar-brand-mark" src="/icons/icon-192.png" alt="Vinaris" width="56" height="56" fetchPriority="high" />
              <div>
                <div className="brand-eyebrow-row">
                  <p className="eyebrow">Vinaris</p>
                  <span className="tier-badge-wrap">
                    <span className="tier-badge" tabIndex={0} aria-describedby="active-tier-description">{activeTier.name}</span>
                    <span className="tier-tooltip" id="active-tier-description" role="tooltip">{activeTier.description}</span>
                  </span>
                </div>
                <h1>{session?.active_household_name || "Vinaris"}</h1>
              </div>
            </>
          ) : (
            publicBrandLockup
          )}
        </div>
        {authenticated && activeView !== "settings" ? (
          <form
            className="desktop-topbar-search"
            role="search"
            onSubmit={(event) => {
              event.preventDefault();
              openQuickWineSearch(searchQuery);
            }}
          >
            <AppIcon name="search" variant="action" tone="muted" size="0.95rem" />
            <input
              value={searchQuery}
              onChange={(event) => openQuickWineSearch(event.target.value)}
              onKeyDown={focusFeatureSuggestion}
              placeholder={t("searchPlaceholder")}
              aria-label={t("search")}
            />
            {searchQuery ? (
              <button
                type="button"
                className="view-tabs-quick-search-clear"
                onClick={() => openQuickWineSearch("")}
                aria-label={t("clearFilters")}
                title={t("clearFilters")}
              >
                ×
              </button>
            ) : null}
            {searchQuery ? <Suspense fallback={null}><FeatureSuggestions query={searchQuery} locale={locale} available={featureAvailable} onOpen={openFeature} /></Suspense> : null}
          </form>
        ) : null}
        {authenticated ? (
          <div
            ref={mobileAccountMenuRef}
            className={`session-pill${session?.is_demo ? " demo-session-pill" : ""}`}
            style={session?.is_demo && isMobileViewport ? {
              display: "flex",
              alignItems: "center",
              justifyContent: "flex-end",
              flexWrap: "wrap",
              gap: "6px",
              width: "100%",
              maxWidth: "none",
              boxSizing: "border-box",
            } : undefined}
          >
            {!session?.is_demo ? <strong>{session?.user_display_name || session?.user_email}</strong> : null}
            {activeView === "home" && !isRestaurant ? <button type="button" className="cellar-home-search" aria-label={t("search")} aria-expanded={mobileSearchOpen} aria-controls="mobile-topbar-search" onClick={() => setMobileSearchOpen(open => !open)}><AppIcon name="search" detailLevel="compact" /></button> : null}
            {householdMemberships.length > 1 ? (
              <label className="household-switch" title={locale === "it" ? "Cambia cantina" : "Switch cellar"}>
                <AppIcon name="cellar" variant="action" tone="muted" size="0.95rem" />
                <select
                  aria-label={locale === "it" ? "Cambia cantina" : "Switch cellar"}
                  value={activeMembership?.household_id || ""}
                  onChange={(event) => switchHousehold(event.target.value).catch((nextError) => setError(nextError instanceof Error ? nextError.message : "Unable to switch household"))}
                >
                  {householdMemberships.map((membership) => (
                    <option key={membership.membership_id} value={membership.household_id}>
                      {membership.household_name}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
            {!session?.is_demo ? <span>{session?.membership_role}</span> : null}
            {session?.is_demo ? <span className="status-pill">{locale === "it" ? "Demo · sola lettura" : "Demo · read-only"}</span> : null}
            {offlineMode ? <span>{t("offlineMode")}: {offlineFileName}</span> : null}
            {!offlineMode && !session?.is_demo ? <div className="notification-wrap">
              <button
                type="button"
                className="secondary compact notification-button"
                aria-label={t("notifications")}
                title={t("notifications")}
                onClick={() => {
                  if (!notificationsOpen) {
                    setNotificationTab("all");
                    setNotificationView("active");
                    setNotificationStateFilter("all");
                    void Promise.allSettled([
                      loadNotifications(true, { category: "all", view: "active", itemState: "all", offset: 0 }),
                      loadReceivedInvites(true),
                      loadShareOffers(true),
                      loadMyCoOwnershipAgreements(true),
                    ]);
                  }
                  setNotificationsOpen((open) => !open);
                }}
              >
                <span className="notification-button-icon" aria-hidden="true">{notificationBellIcon()}</span>
                {notificationCount ? <strong>{notificationCount}</strong> : null}
              </button>
              {notificationsOpen ? createPortal(
                <>
                  <button
                    type="button"
                    className="notification-backdrop"
                    aria-label={t("cancel")}
                    onClick={() => setNotificationsOpen(false)}
                  />
                  <div className="notification-panel" role="dialog" aria-modal="true" aria-label={t("notifications")} onClick={(event) => event.stopPropagation()}>
                    <div className="notification-heading">
                      <div>
                        <strong>{locale === "it" ? "Centro di controllo" : "Control center"}</strong>
                        <span>{locale === "it" ? "Notifiche e promemoria operativi" : "Notifications and operational reminders"}</span>
                      </div>
                      <div className="notification-heading-actions">
                        <span className="notification-unread-count" aria-label={locale === "it" ? `${notificationCount} elementi da controllare` : `${notificationCount} items to review`}>
                          {notificationCount} <small>{locale === "it" ? "da controllare" : "to review"}</small>
                        </span>
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
                    <div className="notification-control-bar">
                      <div className="notification-view-switch" role="group" aria-label={locale === "it" ? "Vista notifiche" : "Notification view"}>
                        <button type="button" className={notificationView === "active" ? "active" : "secondary"} onClick={() => selectNotificationView("active")}>
                          {locale === "it" ? "Attive" : "Active"}
                        </button>
                        <button type="button" className={notificationView === "archived" ? "active" : "secondary"} onClick={() => selectNotificationView("archived")}>
                          {locale === "it" ? "Archivio" : "Archive"}
                        </button>
                      </div>
                      {notificationView === "active" ? (
                        <>
                          <label className="notification-state-filter">
                            <span className="sr-only">{locale === "it" ? "Filtra per stato" : "Filter by state"}</span>
                            <select value={notificationStateFilter} onChange={(event) => selectNotificationStateFilter(event.target.value as "all" | "unread")}>
                              <option value="all">{locale === "it" ? "Tutte" : "All"}</option>
                              <option value="unread">{locale === "it" ? "Nuove" : "Unread"}</option>
                            </select>
                          </label>
                          {notificationActiveCounts.unread ? (
                            <button type="button" className="secondary compact notification-read-all" onClick={() => void markAllNotificationsRead()}>
                              {locale === "it" ? "Segna tutte lette" : "Mark all read"}
                            </button>
                          ) : null}
                        </>
                      ) : null}
                    </div>
                    <div className="notification-tabs" role="tablist" aria-label={t("notifications")}>
                      {(["all", "action", "update", "system"] as const).map((category) => {
                        const label = category === "all"
                          ? (locale === "it" ? "Tutte" : "All")
                          : category === "action"
                          ? (locale === "it" ? "Da fare" : "To do")
                          : category === "update"
                            ? (locale === "it" ? "Aggiornamenti" : "Updates")
                            : (locale === "it" ? "Sistema" : "System");
                        return (
                          <button
                            type="button"
                            role="tab"
                            aria-selected={notificationTab === category}
                            className={notificationTab === category ? "active" : "secondary"}
                            key={category}
                            onClick={() => selectNotificationTab(category)}
                          >
                            <span>{label}</span>
                            <b>{category === "all" ? allNotificationTabCount : notificationCategoryCounts[category]}</b>
                          </button>
                        );
                      })}
                    </div>
                    <div className="notification-feed" role="tabpanel">
                    {activeNotificationItems.length ? (
                      <section
                        className="notification-feed-section notification-feed-section-events"
                        aria-label={notificationView === "archived" ? (locale === "it" ? "Notifiche archiviate" : "Archived notifications") : t("notifications")}
                      >
                        <div className="notification-feed-section-heading">
                          <div>
                            <strong>{notificationView === "archived" ? (locale === "it" ? "Notifiche archiviate" : "Archived notifications") : t("notifications")}</strong>
                            <span>{notificationView === "archived"
                              ? (locale === "it" ? "Puoi ripristinarle o eliminarle definitivamente." : "You can restore or permanently delete them.")
                              : (locale === "it" ? "Messaggi ed eventi: puoi segnarli come letti o archiviarli." : "Messages and events: mark them as read or archive them.")}</span>
                          </div>
                          <b>{activeNotificationItems.length}</b>
                        </div>
                    {activeNotificationItems.map((item) => {
                      const notificationCopy = localizedNotification(item, locale);
                      return (
                      <div className={`notification-item notification-item-${item.state}`} key={item.id}>
                        <div className="notification-item-meta">
                          <span>{item.state === "pending"
                            ? (locale === "it" ? "In attesa" : "Pending")
                            : item.state === "archived"
                              ? (locale === "it" ? "Archiviata" : "Archived")
                              : item.state === "read"
                                ? (locale === "it" ? "Letta" : "Read")
                                : (locale === "it" ? "Nuova" : "New")}</span>
                          <time dateTime={item.created_at}>{formatDisplayDate(item.created_at)}</time>
                        </div>
                        <strong className="notification-title"><i className="notification-icon" aria-hidden="true">{notificationSvgIcon(item.kind)}</i>{notificationCopy.title}</strong>
                        <span style={item.kind === "admin_announcement" ? { whiteSpace: "pre-wrap", overflowWrap: "anywhere" } : undefined}>{notificationCopy.message}</span>
                        {item.metadata.message ? <span className="share-offer-message">{String(item.metadata.message)}</span> : null}
                        {item.kind === "smart_rate_tastings" && notificationView !== "archived" && !offlineMode ? (
                          <Suspense fallback={null}>
                            <QuickTastingRating
                              locale={locale}
                              onRated={(updated) => setWines((current) => current.map((wine) => (wine.id === updated.id ? updated : wine)))}
                              onAllRated={() => void markNotificationRead(item)}
                            />
                          </Suspense>
                        ) : null}
                        {notificationView === "archived" ? (
                          <div className="member-actions">
                            {item.action_url ? <button type="button" className="compact" disabled={saving} onClick={() => openNotification(item)}>{t("open")}</button> : null}
                            <button type="button" className="secondary compact" disabled={saving} onClick={() => restoreNotification(item)}>
                              {locale === "it" ? "Ripristina" : "Restore"}
                            </button>
                            <button type="button" className="danger compact" disabled={saving} onClick={() => deleteNotification(item)}>
                              {locale === "it" ? "Elimina" : "Delete"}
                            </button>
                          </div>
                        ) : item.action_kind === "accept_invite" ? (
                          <div className="member-actions">
                            <button type="button" className="compact" disabled={saving} onClick={() => acceptNotificationInvite(item)}>{t("accept")}</button>
                          </div>
                        ) : item.action_kind === "decide_share_offer" ? (
                          <div className="member-actions">
                            <button type="button" className="compact" disabled={saving} onClick={() => decideNotificationShareOffer(item, "accept")}>{t("accept")}</button>
                            <button type="button" className="secondary compact" disabled={saving} onClick={() => decideNotificationShareOffer(item, "decline")}>{t("decline")}</button>
                          </div>
                        ) : item.action_kind === "decide_share_revocation" ? (
                          <div className="member-actions">
                            <button type="button" className="compact" disabled={saving} onClick={() => decideWineShareOfferRevocation(item, "approve")}>
                              {locale === "it" ? "Approva rimozione" : "Approve removal"}
                            </button>
                            <button type="button" className="secondary compact" disabled={saving} onClick={() => decideWineShareOfferRevocation(item, "decline")}>
                              {locale === "it" ? "Mantieni" : "Keep"}
                            </button>
                          </div>
                        ) : (
                          <div className="member-actions">
                            {item.action_url ? (
                              <button type="button" className="compact" disabled={saving} onClick={() => openNotification(item)}>
                                {t("open")}
                              </button>
                            ) : null}
                            {item.state === "unread" ? (
                              <button type="button" className={item.action_url ? "secondary compact" : "compact"} disabled={saving} onClick={() => markNotificationRead(item)}>
                                {t("markRead")}
                              </button>
                            ) : null}
                            {item.source === "notification" ? (
                              <>
                                <button type="button" className="secondary compact" disabled={saving} onClick={() => archiveNotification(item)}>
                                  {locale === "it" ? "Archivia" : "Archive"}
                                </button>
                              </>
                            ) : null}
                          </div>
                        )}
                      </div>
                      );
                    })}
                    {notificationCenter.has_more ? (
                      <button type="button" className="secondary notification-load-more" onClick={loadMoreNotifications}>
                        {locale === "it" ? "Carica altre" : "Load more"}
                      </button>
                    ) : null}
                      </section>
                    ) : null}
                    {activeOperationalItems.length || (showAdminActionItems && showLiveAdminItems && canAppAdmin && (pendingUsers.length || pendingCatalogEntries.length)) ? (
                      <section
                        className="notification-feed-section notification-feed-section-reminders"
                        aria-label={locale === "it" ? "Promemoria operativi" : "Operational reminders"}
                      >
                        <div className="notification-feed-section-heading">
                          <div>
                            <strong>{locale === "it" ? "Promemoria operativi" : "Operational reminders"}</strong>
                            <span>{locale === "it"
                              ? "Derivano dallo stato della cantina: scompaiono quando risolti oppure puoi rimandarli di 14 giorni."
                              : "Based on your cellar status: they disappear when resolved, or you can postpone them for 14 days."}</span>
                          </div>
                          <b>{activeOperationalItems.length + (showAdminActionItems && showLiveAdminItems && canAppAdmin ? pendingUsers.length + pendingCatalogEntries.length : 0)}</b>
                        </div>
                    {activeOperationalItems.map((item) => (
                      <div className="notification-item operational-action-item" key={`operational:${item.id}`}>
                        <div className="operational-action-meta">
                          <span>{locale === "it" ? "Promemoria" : "Reminder"}</span>
                          <small>{locale === "it" ? "Non è una notifica da archiviare" : "Not an archivable notification"}</small>
                        </div>
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
                    ))}
                    {showAdminActionItems && showLiveAdminItems && canAppAdmin && pendingUsers.length ? (
                      <button type="button" className="notification-item" onClick={() => { setActiveView("settings"); setSettingsTab("users"); setNotificationsOpen(false); }}>
                        <strong className="notification-title"><i className="notification-icon" aria-hidden="true">{notificationSvgIcon("pending_users")}</i>{pendingUsers.length} {t("pendingUsers")}</strong>
                        <span>{t("reviewUsers")}</span>
                      </button>
                    ) : null}
                    {showAdminActionItems && showLiveAdminItems && canAppAdmin && pendingCatalogEntries.length ? (
                      <button type="button" className="notification-item" onClick={() => { setActiveView("settings"); setSettingsTab("operations"); loadSettingsTabData("operations"); setNotificationsOpen(false); }}>
                        <strong className="notification-title"><i className="notification-icon" aria-hidden="true">{notificationSvgIcon("ai_audit")}</i>{pendingCatalogEntries.length} {t("pendingCatalogEntries")}</strong>
                        <span>{t("approveCatalogEntry")}</span>
                      </button>
                    ) : null}
                      </section>
                    ) : null}
                    {!activeNotificationItems.length && !activeOperationalItems.length && !(showAdminActionItems && adminActionCount) ? (
                      <p className="empty-state">{locale === "it" ? "Nessuna attività in questa sezione" : "No activity in this section"}</p>
                    ) : null}
                    </div>
                  </div>
                </>,
                document.body,
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
            <button
              type="button"
              className={`secondary compact topbar-icon-button mobile-account-menu-toggle${mobileAccountMenuOpen ? " active" : ""}${newsUnread && !offlineMode ? " has-news" : ""}`}
              aria-label={locale === "it" ? "Apri menu account" : "Open account menu"}
              aria-expanded={mobileAccountMenuOpen}
              aria-controls="mobile-account-menu"
              onClick={() => setMobileAccountMenuOpen((open) => !open)}
            >
              <AppIcon name="menu" variant="action" detailLevel="compact" />
            </button>
            {mobileAccountMenuOpen ? (
              <div id="mobile-account-menu" className="mobile-account-menu" role="menu" aria-label={locale === "it" ? "Menu account" : "Account menu"}>
                <button type="button" role="menuitem" onClick={() => { setMobileAccountMenuOpen(false); toggleSettingsView(); }}>
                  <AppIcon name="settings" variant="action" detailLevel="compact" />
                  {t("settings")}
                </button>
                <button type="button" role="menuitem" onClick={() => { setMobileAccountMenuOpen(false); openHelp(); }}>
                  <AppIcon name="grapes" variant="premium" detailLevel="compact" />
                  {t("help")}
                </button>
                {!offlineMode ? <button type="button" role="menuitem" className={newsUnread ? "has-news" : undefined} onClick={() => { setMobileAccountMenuOpen(false); openNews(true, true); }}>
                  <AppIcon name="glass-sparkle" variant="premium" detailLevel="compact" />
                  {locale === "it" ? "Novità" : "What’s new"}
                </button> : null}
                <button type="button" role="menuitem" className="mobile-account-menu-logout" onClick={() => { setMobileAccountMenuOpen(false); void logout().catch((nextError) => setError(nextError instanceof Error ? nextError.message : "Unable to logout")); }}>
                  <AppIcon name="logout" variant="action" detailLevel="compact" />
                  {t("logout")}
                </button>
              </div>
            ) : null}
          </div>
        ) : (
          <div className="session-pill public-session-pill" style={isMobileViewport ? { display: "flex", flexWrap: "wrap", gap: "8px", width: "100%", maxWidth: "none", boxSizing: "border-box" } : undefined}>
            <label className="language-switch public-language-switch" style={isMobileViewport ? { flex: "1 1 140px", minWidth: 0 } : undefined}>
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
        {authenticated && activeView !== "settings" && mobileSearchOpen ? (
          <form
            id="mobile-topbar-search"
            className="mobile-topbar-search"
            role="search"
            onSubmit={(event) => {
              event.preventDefault();
              openQuickWineSearch(searchQuery);
            }}
          >
            <AppIcon name="search" variant="action" tone="muted" size="0.9rem" />
            <input
              autoFocus={isMobileViewport}
              value={searchQuery}
              onChange={(event) => openQuickWineSearch(event.target.value)}
              onKeyDown={(event) => {
                focusFeatureSuggestion(event);
                if (event.key !== "Escape") return;
                openQuickWineSearch("");
                setMobileSearchOpen(false);
              }}
              placeholder={t("searchPlaceholder")}
              aria-label={t("search")}
            />
            <button type="button" onClick={() => { openQuickWineSearch(""); setMobileSearchOpen(false); }} aria-label={locale === "it" ? "Chiudi ricerca" : "Close search"}>×</button>
            {searchQuery ? <Suspense fallback={null}><FeatureSuggestions query={searchQuery} locale={locale} available={featureAvailable} onOpen={openFeature} /></Suspense> : null}
          </form>
        ) : null}
        {authenticated && activeView === "home" && !isRestaurant ? <CellarHomeHero wines={cellarWines} locale={locale} stats={homeHeroStats} /> : null}
        {authenticated && activeView === "home" && !isRestaurant && canAccessCellarAssistant && session?.cellar_ai_assistant_subscribed ? <Suspense fallback={null}><HomeAssistantAsk locale={locale} onAsk={(text) => {
          setAssistantQuestion({ id: Date.now(), text });
          leaveHelpFor("assistant"); setWineFormOpen(false); setWishlistFormOpen(false); setSelectedWineId(null); clearFilters("assistant");
        }} onVoice={() => {
          // Inside the tap: lets the phone speak the answers of the voice conversation.
          primeSpeech();
          setAssistantVoiceStart(Date.now());
          leaveHelpFor("assistant"); setWineFormOpen(false); setWishlistFormOpen(false); setSelectedWineId(null); clearFilters("assistant");
        }} /></Suspense> : null}
      </header>
      ) : null}

      {(visibleError || isFreeTierLimitError) && !showInlineAuthError ? (
        <div ref={errorBannerRef} className="error-banner app-error-banner" role="alert" aria-live="assertive">
          <div className="app-error-copy">
            <strong>{isFreeTierLimitError ? (locale === "it" ? "Limite del piano gratuito raggiunto" : "Free-plan limit reached") : locale === "it" ? "Attenzione" : "Attention"}</strong>
            <p className="app-error-detail">{visibleError || (isFreeTierLimitError ? freeTierLimitErrorMessage : error)}</p>
          </div>
          {isFreeTierLimitError ? (
            <button
              type="button"
              className="compact"
              onClick={() => {
                setError("");
                setActiveView("settings");
                setSettingsTab("profile");
                loadSettingsTabData("profile");
              }}
            >
              {locale === "it" ? "Vedi abbonamenti" : "View subscriptions"}
            </button>
          ) : null}
          <button type="button" className="secondary compact app-error-close" onClick={() => setError("")}>
            {t("close")}
          </button>
        </div>
      ) : null}

      {notice ? (
        <div className="invite-notice app-notice-toast" role="status" aria-live="polite">
          <svg className="app-notice-check" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="11" /><path pathLength={1} d="M7 12.5l3.2 3.2L17 9" /></svg>
          <span>{notice}</span>
          <button type="button" className="secondary compact app-notice-close" aria-label={t("close")} title={t("close")} onClick={() => setNotice("")}>
            ×
          </button>
        </div>
      ) : null}

      {!authenticated ? (shouldPrioritizeAuthAction || (isMobileViewport && showMobileAuthPanel)) ? (
        publicAuthPanel
      ) : (
        <>
          <Suspense fallback={<LoadingState label={t("loadingData")} />}>
            <PublicLanding
              locale={locale}
              onLocaleChange={(nextLocale) => void changeLocale(nextLocale)}
              onRegister={() => openAuthPanel("register")}
              onLogin={() => openAuthPanel("login")}
              onDemo={() => void enterDemo()}
              demoLoading={saving}
            />
          </Suspense>

        {!isMobileViewport && (authModalOpen || showOfflineBackupPanel) ? (
          <div className="auth-modal-overlay" onClick={() => {
            setAuthModalOpen(false);
            setShowOfflineBackupPanel(false);
          }}>
            <div className="auth-modal-card" onClick={(event) => event.stopPropagation()}>
              <div className="auth-modal-head">
                <strong>{showOfflineBackupPanel && !authModalOpen ? t("offlineBackup") : authMode === "register" ? t("createAccount") : t("login")}</strong>
                <button type="button" className="secondary compact" onClick={() => {
                  setAuthModalOpen(false);
                  setShowOfflineBackupPanel(false);
                }}>
                  {t("cancel")}
                </button>
              </div>
              {publicAuthPanel}
            </div>
          </div>
        ) : null}
        </>
      ) : session?.requires_legal_acceptance ? (
        <Suspense fallback={<LoadingState label={t("loadingData")} />}>
          <LegalAcceptancePanel
            locale={locale}
            onAccepted={async (nextSession) => {
              setSession(nextSession);
              await loadAuthenticatedSessionData(nextSession);
            }}
            onLogout={logout}
          />
        </Suspense>
      ) : session && !session.is_demo && !offlineMode && (onboardingMode === "open" || (!session.onboarding_completed && onboardingMode === "auto")) ? (
        <Suspense fallback={<LoadingState label={t("loadingData")} />}><PersonalOnboarding session={session} onLater={() => setOnboardingMode("later")} onComplete={next => { setSession(next); applySessionPreferences(next, true); setOnboardingMode("later"); setActiveView("home"); }} /></Suspense>
      ) : (
        <section
          className={`workspace ${
            activeView === "settings"
              ? "settings-workspace"
              : activeView === "home" || (activeView === "history" && historyWithoutList) || activeView === "sommelier" || activeView === "intelligence" || activeView === "assistant" || activeView === "pairing" || activeView === "pulse" || activeView === "buying" || activeView === "help"
                ? "home-workspace"
                : "content-workspace"
          } ${activeView === "cellar" || activeView === "history" || activeView === "wishlist" ? "operational-workspace" : ""} ${activeView === "cellar" ? "cellar-workspace" : ""} ${activeView === "history" ? "history-workspace" : ""} ${wineDetailExpanded && isWineCollectionView && selectedVisibleWine ? "wine-detail-expanded" : ""}`}
        >
          {activeView !== "settings" ? (
          <div className="view-tabs">
            <div className="view-tabs-navigation">
            <button type="button" className={`view-tab${activeView === "home" ? "" : " secondary"}`} onClick={() => { leaveHelpFor("home"); setWineFormOpen(false); setWishlistFormOpen(false); clearFilters("home"); }}>
              <AppIcon name="dashboard" variant="navigation" detailLevel="rich" />
              {t("home")}
            </button>
            <button type="button" className={`view-tab${activeView === "cellar" ? "" : " secondary"}`} onClick={() => { leaveHelpFor("cellar"); setWishlistFormOpen(false); setWineFormOpen(false); setSelectedWineId(null); clearFilters("cellar"); }}>
              <AppIcon name="cellar" variant="navigation" detailLevel="rich" />
              {t("cellar")}<small className="view-tab-count"><span className="sr-only"> (</span>{cellarWines.length}<span className="sr-only">)</span></small>
            </button>
            <button type="button" className={`view-tab${activeView === "wishlist" ? "" : " secondary"}`} onClick={() => { leaveHelpFor("wishlist"); setWineFormOpen(false); clearFilters("wishlist"); }}>
              <AppIcon name="wishlist" variant="navigation" detailLevel="rich" />
              {t("wishlist")}<small className="view-tab-count"><span className="sr-only"> (</span>{totalWishlistItemCount}<span className="sr-only">)</span></small>
            </button>
            {!isRestaurant ? <button type="button" className={`view-tab${activeView === "history" ? "" : " secondary"}`} onClick={() => { leaveHelpFor("history"); setWishlistFormOpen(false); setWineFormOpen(false); setSelectedWineId(null); clearFilters("history"); }}>
              <AppIcon name="calendar" variant="navigation" />
              {t("history")}
            </button> : null}
            <button type="button" className={`view-tab${aiNavigationActive ? "" : " secondary"}`} onClick={() => openView("sommelier")}>
              <AppIcon name="glass-sparkle" variant="ai" detailLevel="rich" />
              Sommelier AI
            </button>
            <button type="button" className={`view-tab${activeView === "pulse" ? "" : " secondary"}`} onClick={() => { leaveHelpFor("pulse"); setWineFormOpen(false); setWishlistFormOpen(false); clearFilters("pulse"); }}>
              <AppIcon name="pulse" variant="premium" detailLevel="rich" />
              Wine Pulse
            </button>
            {canWriteWine ? <button type="button" className="secondary view-tabs-add" aria-haspopup="dialog" onClick={startAddWineFromAnywhere}>
              <span aria-hidden="true">+</span>{locale === "it" ? "Aggiungi" : "Add"}
            </button> : null}
            <button type="button" className={`secondary compact help-context-trigger${activeView === "help" ? " is-active" : ""}`} title={locale === "it" ? "Guida, a partire da questa pagina" : "Guide, starting from this page"} onClick={() => openHelp(contextualHelpArticle)}><span aria-hidden="true">?</span>{t("help")}</button>
            </div>
            <div className="view-tabs-quick-actions">
            <form
              className="view-tabs-quick-search"
              role="search"
              onSubmit={(event) => {
                event.preventDefault();
                openQuickWineSearch(searchQuery);
              }}
            >
              <AppIcon name="search" variant="action" tone="muted" size="0.95rem" />
              <input
                value={searchQuery}
                onChange={(event) => openQuickWineSearch(event.target.value)}
                placeholder={t("searchPlaceholder")}
                aria-label={t("search")}
              />
              {searchQuery ? (
                <button
                  type="button"
                  className="view-tabs-quick-search-clear"
                  onClick={() => openQuickWineSearch("")}
                  aria-label={t("clearFilters")}
                  title={t("clearFilters")}
                >
                  ×
                </button>
              ) : null}
            </form>
            </div>
          </div>
          ) : null}
          {activeView !== "settings" ? (
            <>
              {mobileNavigationOpen ? <div className="mobile-navigation-sheet" role="dialog" aria-label={locale === "it" ? "Menu di navigazione" : "Navigation menu"}>
                {[
                  { key: "wishlist", icon: "wishlist" as const, label: t("wishlist"), description: locale === "it" ? "I vini da comprare, con il prezzo che vuoi pagare" : "Wines to buy, at the price you want to pay", open: () => openView("wishlist") },
                  ...(!isRestaurant ? [{ key: "history", icon: "calendar" as const, label: t("history"), description: locale === "it" ? "Bevute, Momenti e vini finiti" : "Tastings, Moments and finished wines", open: () => openView("history") }] : []),
                  ...(!isRestaurant && !offlineMode ? [{ key: "moments", icon: "camera" as const, label: locale === "it" ? "Momenti" : "Moments", description: locale === "it" ? "I ricordi delle tue bevute, in polaroid" : "Memories of your tastings, as polaroids", open: () => { openView("history"); setHistorySection("moments"); } }] : []),
                  { key: "pulse", icon: "pulse" as const, label: "Wine Pulse", description: locale === "it" ? "Le notizie dal mondo del vino" : "News from the wine world", open: () => openView("pulse") },
                  { key: "search", icon: "search" as const, label: t("search"), description: locale === "it" ? "Un vino della tua cantina" : "A wine in your cellar", open: () => setMobileSearchOpen(true) },
                  { key: "help", icon: "grapes" as const, label: t("help"), description: locale === "it" ? "Come funziona ogni pagina" : "How each page works", open: () => openHelp() },
                  { key: "settings", icon: "settings" as const, label: t("settings"), description: locale === "it" ? "Profilo, abbonamento, AI, cantine e dati" : "Profile, plan, AI, cellars and data", open: () => toggleSettingsView() },
                ].map((item) => <button key={item.key} type="button" aria-label={item.label} aria-describedby={`mobile-menu-${item.key}`} onClick={() => { setMobileNavigationOpen(false); item.open(); }}>
                  <AppIcon name={item.icon} variant="navigation" detailLevel="rich" />
                  <span className="mobile-navigation-item"><strong>{item.label}</strong><small id={`mobile-menu-${item.key}`}>{item.description}</small></span>
                </button>)}
                {tabletDevice && !tabletDesktopMode ? <button type="button" onClick={() => { setMobileNavigationOpen(false); chooseTabletLayout(true); }}><AppIcon name="dashboard-cards" variant="navigation" detailLevel="rich" />{locale === "it" ? "Richiedi modalità desktop" : "Request desktop mode"}</button> : null}
              </div> : null}
              <nav className="mobile-bottom-navigation" aria-label={locale === "it" ? "Navigazione principale" : "Main navigation"}>
                <button type="button" className={activeView === "home" ? "active" : ""} onClick={() => { setMobileNavigationOpen(false); leaveHelpFor("home"); setWineFormOpen(false); setWishlistFormOpen(false); clearFilters("home"); }}><AppIcon name="dashboard" variant="navigation" detailLevel="rich" /><span>{t("home")}</span></button>
                <button type="button" className={activeView === "cellar" ? "active" : ""} onClick={() => { setMobileNavigationOpen(false); leaveHelpFor("cellar"); setWishlistFormOpen(false); setWineFormOpen(false); setSelectedWineId(null); clearFilters("cellar"); }}><AppIcon name="cellar" variant="navigation" detailLevel="rich" /><span>{t("cellar")}</span></button>
                {canWriteWine ? <button type="button" className="mobile-bottom-navigation-add" aria-haspopup="dialog" aria-label={locale === "it" ? "Aggiungi" : "Add"} onClick={() => { setMobileNavigationOpen(false); startAddWineFromAnywhere(); }}><span>+</span></button> : <span aria-hidden="true" />}
                <button type="button" className={aiNavigationActive ? "active" : ""} onClick={() => { setMobileNavigationOpen(false); openView("sommelier"); }}><AppIcon name="glass-sparkle" variant="ai" detailLevel="rich" /><span>{t("pairingMenuShort")}</span></button>
                <button ref={mobileMenuButtonRef} type="button" className={mobileNavigationOpen ? "active" : ""} aria-expanded={mobileNavigationOpen} onClick={() => setMobileNavigationOpen((open) => !open)}><AppIcon name="settings" variant="action" detailLevel="rich" /><span>{locale === "it" ? "Menu" : "Menu"}</span></button>
              </nav>
            </>
          ) : null}
          {!offlineMode ? <Suspense fallback={null}><AppNewsPanel locale={locale} open={newsOpen} focusToken={newsFocusToken} onOpenChange={openNews} onAction={openNewsFeature} onUnreadChange={setNewsUnread} /></Suspense> : null}
          {addWineChooserOpen && canWriteWine ? <Suspense fallback={null}><AddWineChooser
            locale={locale}
            onClose={() => setAddWineChooserOpen(false)}
            onQuick={() => { setAddWineChooserOpen(false); setBottlePhotoImportOpen(true); }}
            onDetailed={() => { setAddWineChooserOpen(false); startDetailedWine(); }}
            onTasting={!offlineMode ? () => {
              setAddWineChooserOpen(false);
              // Once the sheet is gone, so the tasting dialog returns focus to the "+".
              window.setTimeout(() => {
                addTriggerRef.current?.focus();
                setRecordTastingOpen(true);
              }, 0);
            } : undefined}
            onWishlist={() => { setAddWineChooserOpen(false); openView("wishlist"); startAddWishlistItem(); }}
            onReceipt={() => { setAddWineChooserOpen(false); setPurchaseImportOpen(true); }}
          /></Suspense> : null}
          {bottlePhotoImportOpen && canWriteWine ? <Suspense fallback={<LoadingState label={t("loadingData")} />}><BottlePhotoImport
            key={session?.active_household_id}
            locale={locale}
            canAnalyze={canGenerateAi}
            onActivate={() => { setBottlePhotoImportOpen(false); openSubscriptionSettings(); }}
            onClose={() => setBottlePhotoImportOpen(false)}
            onImported={async () => { await Promise.all([loadWines(), loadAiSettings(), loadBilling()]); }}
            onCompleteWithAi={(wineIds) => {
              void api<Wine[]>("/api/v1/wines").then((nextWines) => {
                setWines(nextWines);
                return generateMissingWineAi("all", nextWines.filter((wine) => wineIds.includes(wine.id)));
              });
            }}
          /></Suspense> : null}
          {purchaseImportOpen && canWriteWine ? <Suspense fallback={<LoadingState label={t("loadingData")} />}><PurchaseImportDialog locale={locale} canAnalyze={canAnalyzePurchase} included={purchaseImportIncluded} isAdmin={Boolean(session?.is_app_admin)} onActivate={() => { setPurchaseImportOpen(false); setWineFormOpen(false); openSubscriptionSettings(); }} onAnalyzed={async () => { await Promise.all([loadAiSettings(), loadBilling()]); }} onClose={() => setPurchaseImportOpen(false)} onImported={async () => { await loadWines(); await loadMerchants(); setWineFormOpen(false); }} /></Suspense> : null}
          {memoryBookOpen ? <Suspense fallback={<LoadingState label={t("loadingData")} />}><MemoryBook key={session?.active_household_id} locale={locale} onClose={() => setMemoryBookOpen(false)} /></Suspense> : null}
          {recordTastingOpen && canWriteWine && !offlineMode ? <Suspense fallback={<LoadingState label={t("loadingData")} />}><RecordTastingDialog
            key={session?.active_household_id}
            locale={locale}
            wines={wines}
            canRecognize={canRecognizeBottlePhoto}
            onClose={() => setRecordTastingOpen(false)}
            onSaved={(updated) => {
              if (updated) setWines(current => current.map(wine => wine.id === updated.id ? updated : wine));
              void Promise.all([loadTastingArchiveOverview(), ...(activeView === "history" ? [loadTastingArchive(0)] : [])]).catch(() => setError(locale === "it" ? "Bevuta salvata. Riapri il Diario per aggiornare l’elenco." : "Tasting saved. Reopen your Journal to refresh the list."));
            }}
            onWishlist={(identity) => {
              setRecordTastingOpen(false);
              startAddWishlistItem();
              setWishlistDraft(current => ({ ...current, ...identity }));
              setActiveView("wishlist");
            }}
          /></Suspense> : null}
          {activeView === "home" && isRestaurant ? (
            <Suspense fallback={<LoadingState label={t("loadingData")} />}>
              <RestaurantDashboard
                locale={locale}
                wines={wines}
                onOpenIncompleteWines={() => openOperationalCellarFilter("missing_data")}
                onOpenLowStockWines={() => openOperationalCellarFilter("low_stock")}
                onOpenMissingSalePriceWines={() => openOperationalCellarFilter("missing_sale_price")}
                refreshKey={restaurantDashboardVersion}
                onOpenWine={(wineId) => {
                  const wine = wines.find((item) => item.id === wineId);
                  if (wine) openWineFromDashboard(wine);
                }}
                onChanged={async () => { await loadWines(); setRestaurantDashboardVersion((current) => current + 1); }}
              />
            </Suspense>
          ) : null}
          {activeView === "home" && !isRestaurant ? (
            <section className={`home-dashboard home-dashboard-editorial${dashboardFocus !== "collector" ? " home-dashboard-secondary" : ""}`}>
              <section className="dashboard-focus-navigation" aria-label={t("primaryDashboardFocus")}>
                <div className="dashboard-focus-lead">
                  <AppIcon name="dashboard-cards" variant="feature" tone="accent" size="1.15rem" />
                  <strong>{t("dashboardStartHere")}</strong>
                </div>
                <div className="focus-switcher focus-switcher-primary" role="tablist" aria-label={t("primaryDashboardFocus")}>
                  {(["collector", "daily", "balanced", "personal"] as PrimaryDashboardFocus[]).map((focus) => (
                    <button
                      type="button"
                      role="tab"
                      aria-selected={dashboardFocus === focus}
                      className={dashboardFocus === focus ? "" : "secondary"}
                      key={focus}
                      onClick={() => setDashboardFocus(focus)}
                    >
                      <AppIcon
                        name={dashboardFocusIcons[focus]}
                        variant="feature"
                        tone={dashboardFocus === focus ? "accent" : "muted"}
                        size="1.05rem"
                      />
                      <span className="focus-switcher-label">{dashboardFocusLabels[focus]}</span>
                      {primaryDashboardFocus === focus ? <i className="focus-default-marker" role="img" aria-label={t("defaultFocus")} title={t("defaultFocus")}>★</i> : null}
                    </button>
                  ))}
                </div>
                <details className="dashboard-analysis-switcher">
                  <summary>
                    <AppIcon name="chart" variant="feature" tone="muted" size="1.05rem" />
                    <span>{t("dashboardInsights")}</span>
                    {isDashboardInsightFocus ? (
                      <small>{dashboardFocusLabels[dashboardFocus]}</small>
                    ) : null}
                  </summary>
                  <div className="focus-switcher" role="tablist" aria-label={t("dashboardInsights")}>
                    {dashboardInsightFocuses.map((focus) => (
                      <button
                        type="button"
                        role="tab"
                        aria-selected={dashboardFocus === focus}
                        className={dashboardFocus === focus ? "" : "secondary"}
                        key={focus}
                        onClick={(event) => {
                          setDashboardFocus(focus);
                          event.currentTarget.closest("details")?.removeAttribute("open");
                        }}
                      >
                        <AppIcon
                          name={dashboardFocusIcons[focus]}
                          variant="feature"
                          tone={dashboardFocus === focus ? "accent" : "muted"}
                          size="1rem"
                        />
                        <span className="focus-switcher-label">{dashboardFocusLabels[focus]}</span>
                      </button>
                    ))}
                  </div>
                </details>
              </section>
              {dashboardFocus === "daily" && !offlineMode ? <Suspense fallback={null}><MemoryBookButton key={session?.active_household_id} locale={locale} home canAccess={canAccessMemories} onActivate={openSubscriptionSettings} onRecord={canWriteWine ? () => setRecordTastingOpen(true) : undefined} /></Suspense> : null}
              {dashboardFocus === "collector" ? <CellarHomeStats wines={cellarWines} readyCount={readyInCellarWineCount} monitoringCount={monitoringWines.length} locale={locale} onNavigate={(focus, initialIndex = 0) => { setDashboardCarouselInitialIndex(initialIndex); setDashboardFocus(focus); }} /> : null}
              {aiPackEnhancementHint}

              {!isRestaurant && cellarSommelierVisible ? (
                <Suspense fallback={null}>
                  <DailySommelierBubble
                    locale={locale}
                    isMobileViewport={isMobileViewport}
                    cellarSommelierOpen={cellarSommelierOpen}
                    setCellarSommelierOpen={setCellarSommelierOpen}
                    onDismiss={() => { setCellarSommelierVisible(false); postponeCellarSommelierPrompt(CELLAR_SOMMELIER_DISMISS_INTERVAL_MS); }}
                    dailySommelierWines={dailySommelierWines}
                    dailySommelierCountLabel={dailySommelierCountLabel}
                    dailyRecommendationReason={dailyRecommendationReason}
                    sommelierWindowLabel={sommelierWindowLabel}
                    openWineFromDashboard={openWineFromDashboard}
                    canGenerateAi={canGenerateAi}
                    openDishPairingForWine={openDishPairingForWine}
                  />
                </Suspense>
              ) : null}

              {dashboardFocus !== "taste" && dashboardFocus !== "collector" && dashboardFocus !== "personal" ? (
                <Suspense fallback={null}>
                  <DashboardHero
                    locale={locale}
                    dashboardFocus={dashboardFocus}
                    dashboardFocusLabels={dashboardFocusLabels}
                    cellarStats={cellarStats}
                    readyInCellarWineCount={readyInCellarWineCount}
                    nearestDrinkNowEnd={nearestDrinkNowEnd}
                    cellarDataCompleteness={cellarDataCompleteness}
                    purchaseValueDelta={purchaseValueDelta}
                    purchaseValueDeltaPct={purchaseValueDeltaPct}
                    monitoringLabel={monitoringLabel}
                    monitoringCaption={monitoringCaption}
                    monitoringWines={monitoringWines}
                    deliveryHorizonStats={deliveryHorizonStats}
                    firstDeliveryTimelineItem={firstDeliveryTimelineItem}
                    incompleteWineCount={incompleteWineCount}
                    cellarMissingDataCount={cellarMissingDataCount}
                    portfolioValueHistory={portfolioValueHistory}
                  />
                </Suspense>
              ) : null}

              {dashboardFocus === "personal" ? <Suspense fallback={<LoadingState label={t("loadingData")} />}><PersonalDashboard
                key={`${session?.user_email}:${session?.active_household_id}`}
                locale={locale}
                widgets={session?.personal_dashboard_widgets}
                readOnly={offlineMode}
                isDemo={Boolean(session?.is_demo)}
                isDefault={primaryDashboardFocus === "personal"}
                onSave={savePersonalDashboard}
                onMakeDefault={() => changePrimaryDashboardFocus("personal")}
                renderWidget={renderPersonalWidget}
              /></Suspense> : null}
              {dashboardFocus === "daily" ? (
                <Suspense fallback={<LoadingState label={t("loadingData")} />}>
                  <DailyDrinkBoard
                    locale={locale}
                    t={t}
                    groups={dailyTonightGroups}
                    ranking={rankedDailyTonightWines}
                    premiumWines={dailyPremiumWines}
                    budgetChf={hasDailyWineBudget ? dailyWineBudgetChf : null}
                    canShowPhotos={canAccessWinePhotos}
                    reason={dailyRecommendationReason}
                    windowLabel={sommelierWindowLabel}
                    price={(wine) => wineUnitValue(wine) > 0 ? formatMoney(wineUnitValue(wine), "CHF", locale) : ""}
                    onOpenWine={openWineFromDashboard}
                    onPairWine={(wine) => openDishPairingForWine(wine)}
                    onOpenPairing={() => {
                      setActiveView("pairing");
                      setWineFormOpen(false);
                      setWishlistFormOpen(false);
                    }}
                  >
                    {renderPastWindowWidget()}
                    {renderMaturityHeatmapCard()}
                  </DailyDrinkBoard>
                </Suspense>
              ) : null}

              {dashboardFocus === "balanced" ? (
                <DashboardCarousel locale={locale} label={t("balancedFocus")} className="balanced-dashboard-carousel">
                  {renderStyleBalanceWidget()}

                  <article className="dashboard-card">
                    <div className="card-heading">
                      <div>
                        <span>{t("maturityBalance")}</span>
                        <h2>{t("drinkingWindow")}</h2>
                      </div>
                    </div>
                    <div className="bar-list">
                      {balancedMaturityBuckets.map((bucket) => (
                        <div className="bar-row" key={bucket.key}>
                          <div>
                            <span>{bucket.label}</span>
                            <strong>{bucket.value}</strong>
                          </div>
                          <div className="bar-track">
                            <span style={{ width: `${bucket.pct}%` }} />
                          </div>
                        </div>
                      ))}
                    </div>
                  </article>

                  <article className="dashboard-card">
                    <div className="card-heading">
                      <div>
                        <span>{t("lowestAvailability")}</span>
                        <h2>{t("balancePriorities")}</h2>
                      </div>
                    </div>
                    <div className="action-list">
                      {balancedToneRows.slice(0, 4).map((row) => (
                        <div className="action-row" key={row.tone}>
                          <span>
                            <i className={`wine-dot tone-${row.tone}`} />
                            {row.label}
                          </span>
                          <strong>{formatBottleCount(row.bottles, locale)}</strong>
                        </div>
                      ))}
                    </div>
                  </article>

                  {renderRegionalGapCard(true)}
                  {renderMaturityHeatmapCard()}

                  <article className="dashboard-card balance-data-quality-card">
                    <div className="card-heading">
                      <div>
                        <span>{t("incompleteData")}</span>
                        <h2>{t("dataQuality")}</h2>
                      </div>
                      <strong>{cellarDataCompleteness}%</strong>
                    </div>
                    <p className="dashboard-card-intro">{t("balancedDataHelp")}</p>
                    <button
                      type="button"
                      className="secondary"
                      onClick={() => setDashboardFocus("data")}
                    >
                      {locale === "it" ? "Completa i dati" : "Complete the data"}
                    </button>
                  </article>
                </DashboardCarousel>
              ) : null}

              {dashboardFocus === "collector" ? (
              <CollectorHome now={now} wines={cellarWines} featured={keyPositionCandidates} ready={drinkNowWines} recent={recentCellarWines} locale={locale} canShowPhotos={canAccessWinePhotos} onOpen={openWineFromDashboard}
                showRiserva={!offlineMode && !session?.is_demo && !session?.has_active_entitlement && !session?.is_app_admin}
                onExploreRiserva={() => { setActiveView("settings"); setSettingsTab("profile"); loadSettingsTabData("profile"); }}>
                <CollectorCardGroup className="collector-wine-stage" locale={locale} label={locale === "it" ? "I vini della tua collezione" : "Wines in your collection"}>
                <article className="dashboard-card key-position-card">
                  {keyPositionCandidates.length ? (
                    <>
                      <div className="key-position-card-heading">
                        <div>
                          <span>{locale === "it" ? "In primo piano" : "Highlights"}{activeKeyPositionScope ? ` · ${activeKeyPositionScope}` : ""}</span>
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
                        {keyPositionCandidates.map((item) => {
                          const { wine, highlight, totalValue, trendPoints, trendChangePct, trendChangeValue, trendRange } = item;
                          return (
                          <button type="button" className="key-position-button" key={wine.id} onClick={() => openWineFromDashboard(wine)}>
                            {wine.vintage ? <span className="key-position-yearmark" aria-hidden="true">{wine.vintage}</span> : null}
                            <KeyPositionBottleVisual photoUrl={canAccessWinePhotos ? wine.photo_thumbnail_url || wine.photo_detail_url : ""} detailUrl={canAccessWinePhotos ? wine.photo_detail_url : undefined} sizes="(max-width: 1200px) 320px, 480px" tone={wineTone(wine.type)} />
                            <div className="key-position-head">
                              <div>
                                <span>{highlight}</span>
                                <h2 className="collector-feature-title">{wine.name}</h2>
                                <p className="collector-feature-producer">{wine.producer}</p>
                                <p className="collector-feature-origin">{[wine.appellation || wine.region, wine.vintage].filter(Boolean).join(" · ")}</p>
                              </div>
                            </div>
                            <div className={`key-position-metrics${trendPoints.length >= 2 ? " has-value-trend" : ""}`}>
                              <KeyPositionCircularKpi label={t("totalValue")} value={formatMoney(totalValue, wine.currency, locale)} />
                              <KeyPositionCircularKpi label={t("bottles")} value={formatBottleCount(wine.quantity, locale)} tone="count" />
                              {trendPoints.length < 2 && Number(wine.price) > 0 && Number(wine.current_value) > 0 ? <KeyPositionCircularKpi label={locale === "it" ? "Acquisto → valore attuale / bott." : "Purchase → current value / btl."} value={`${formatMoney(Number(wine.price), wine.currency, locale)} → ${formatMoney(Number(wine.current_value), wine.currency, locale)}`} /> : null}
                              {trendPoints.length >= 2 ? (
                                <KeyPositionTrendKpi
                                  label={t("valueEvolution")}
                                  points={trendPoints}
                                  changeLabel={trendChangePct !== null
                                    ? `${trendChangePct > 0 ? "+" : ""}${formatPercentage(trendChangePct, locale, 1)}`
                                    : trendChangeValue === null ? null : `${trendChangeValue > 0 ? "+" : ""}${formatMoney(trendChangeValue, wine.currency, locale)}`}
                                  rangeLabel={trendRange}
                                  unavailableLabel={t("notSpecified")}
                                />
                              ) : null}
                              {trendPoints.length >= 2 && Number(wine.price) > 0 ? <p className="collector-purchase-note">{locale === "it" ? "Acquisto / bottiglia" : "Purchase / bottle"}: {formatMoney(Number(wine.price), wine.currency, locale)}{wine.order_date ? ` · ${formatDisplayDate(wine.order_date)}` : ""}</p> : null}
                            </div>
                            <CollectorMaturity wine={wine} locale={locale} currentYear={currentYear} />
                            <span className="collector-desktop-insight">
                              <AppIcon name="star" detailLevel="compact" />
                              <span>{featuredExplanation(item, locale)}</span>
                              <span className="collector-desktop-explore">{locale === "it" ? "Esplora il vino" : "Explore this wine"} <span aria-hidden="true">→</span></span>
                            </span>
                          </button>
                        ); })}
                      </div>
                    </>
                  ) : (
                    <div className="empty-state">{t("noActionItems")}</div>
                  )}
                </article>


                {!offlineMode && !session?.is_demo && !session?.has_active_entitlement && !session?.is_app_admin ? <div className="collector-desktop-riserva"><RiservaBanner locale={locale} onExplore={() => { setActiveView("settings"); setSettingsTab("profile"); loadSettingsTabData("profile"); }} /></div> : null}
                {renderRecentWidget()}

                {renderReadyWidget()}

                </CollectorCardGroup>
                {canAccessWinePhotos && !isRestaurant ? <CellarShowcase wines={cellarWines} locale={locale} onOpenWine={openWineFromDashboard} /> : null}
                <CollectorOverview key={`${session?.user_email}:${session?.active_household_id}`} wines={cellarWines} locale={locale} now={now} onOpen={openWineFromDashboard} />
                <CollectorAtlas locale={locale} origins={<>
                {renderRegionsWidget()}


                </>} maturity={renderMaturityHeatmapCard()} value={<div className="collector-atlas-values">
                <article className="dashboard-card collector-ranking-card">
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

                <article className="dashboard-card collector-ranking-card">
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

                </div>} />
                <details className="collector-explore"><summary>{locale === "it" ? "Altri dettagli: scadenze, consegne e qualità dei dati" : "More details: deadlines, deliveries and data quality"}</summary><section className="dashboard-grid">
                <article className="dashboard-card">
                  <div className="card-heading">
                    <div>
                      <span>{t("atRiskWines")}</span>
                      <h2><i className="dashboard-section-icon" aria-hidden="true">{collectorFocusSvgIcon("past_window")}</i>{t("pastWindow")}</h2>
                    </div>
                    <strong>{cellarStats.pastWindow} {t("wines").toLowerCase()}</strong>
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
                    <strong>{cellarStats.futureDeliveries} {t("wines").toLowerCase()}</strong>
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

                {renderToCollectWidget()}

                <article className="dashboard-card">
                  <div className="card-heading">
                    <div>
                      <span>{t("incompleteData")}</span>
                      <h2><i className="dashboard-section-icon" aria-hidden="true">{collectorFocusSvgIcon("missing_data")}</i>{t("dataQuality")}</h2>
                    </div>
                      <strong>{incompleteCellarWineCount} {t("wines").toLowerCase()}</strong>
                  </div>
                  <div className="action-list">
                    {incompleteWines.length ? incompleteWines.map((wine) => (
                      <button type="button" className="action-row" key={wine.id} onClick={() => openWineFromDashboard(wine)}>
                        <span><i className={`wine-dot tone-${wineTone(wine.type)}`} />{wine.name}</span>
                        <strong>{!wine.current_value ? t("value") : !wine.drink_from || !wine.drink_to ? t("drinkWindow") : wine.scores.length === 0 && !wine.scores_not_applicable ? t("scores") : wine.grapes.length === 0 && !wine.grapes_not_applicable ? t("grapes") : t("missingCellarPurpose")}</strong>
                      </button>
                    )) : <p className="empty-state">{t("noActionItems")}</p>}
                  </div>
                </article>

                {renderRegionalGapCard(true)}

              </section></details></CollectorHome>
              ) : null}

              {dashboardFocus === "value" ? (
                <Suspense fallback={null}>
                  <ValueDashboard
                    locale={locale}
                    cellarStats={cellarStats}
                    purchaseValueDelta={purchaseValueDelta}
                    purchaseValueDeltaPct={purchaseValueDeltaPct}
                    paidBottleCount={paidBottleCount}
                    portfolioValuePoints={portfolioValuePoints}
                    applyQuickWineFilter={applyQuickWineFilter}
                    valueByCanonicalType={valueByCanonicalType}
                    renderValueTypeWidget={renderValueTypeWidget}
                    renderTopValueWidget={renderTopValueWidget}
                    renderValueRegionWidget={renderValueRegionWidget}
                    renderValueProducerWidget={renderValueProducerWidget}
                    topValueWines={topValueWines}
                    missingValueWines={missingValueWines}
                    openWineFromDashboard={openWineFromDashboard}
                  />
                </Suspense>
              ) : null}

              {dashboardFocus === "readiness" ? (
                <DashboardCarousel locale={locale} label={t("drinkingWindow")} className="readiness-dashboard-carousel" initialIndex={dashboardCarouselInitialIndex}>
                  <article className="dashboard-card priority-card">
                    <div className="card-heading">
                      <div>
                        <span>{locale === "it" ? "Vini disponibili in cantina" : "Available wines in your cellar"}</span>
                        <h2>{t("readyToDrink")}</h2>
                      </div>
                      <strong>{readyInCellarWineCount}</strong>
                    </div>
                    <div className="action-list scrollable-action-list" tabIndex={0} role="region" aria-label={t("readyToDrink")}>
                      {drinkNowCandidates.length ? drinkNowCandidates.map((wine) => (
                        <button type="button" className="action-row" key={wine.id} onClick={() => openWineFromDashboard(wine)}>
                          <span><i className={`wine-dot tone-${wineTone(wine.type)}`} />{wine.name}</span>
                          <strong>{wineIdealWindowStart(wine)}–{winePriorityDrinkEnd(wine)}</strong>
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
                    <div className="action-list scrollable-action-list" tabIndex={0} role="region" aria-label={t("drinkingWindow")}>
                      {drinkSoonWines.length ? drinkSoonWines.map((wine) => (
                        <button type="button" className="action-row" key={wine.id} onClick={() => openWineFromDashboard(wine)}>
                          <span><i className={`wine-dot tone-${wineTone(wine.type)}`} />{wine.name}</span>
                          <strong>{wineIdealWindowStart(wine)}</strong>
                        </button>
                      )) : <p className="empty-state">{t("noActionItems")}</p>}
                    </div>
                  </article>
                  <article className="dashboard-card monitoring-card">
                    <div className="card-heading">
                      <div>
                        <span>{monitoringCaption}</span>
                        <h2>{monitoringLabel}</h2>
                      </div>
                      <strong>{monitoringWines.length}</strong>
                    </div>
                    <div className="action-list scrollable-action-list" tabIndex={0} role="region" aria-label={monitoringLabel}>
                      {monitoringWines.length ? monitoringWines.map((wine) => (
                        <button type="button" className="action-row" key={wine.id} onClick={() => openWineFromDashboard(wine)}>
                          <span><i className={`wine-dot tone-${wineTone(wine.type)}`} />{wine.name}</span>
                          <strong>{wine.drink_to === currentYear
                            ? (locale === "it" ? `In chiusura · ${wine.drink_to}` : `Closing · ${wine.drink_to}`)
                            : (locale === "it" ? `Superata · ${wine.drink_to}` : `Past · ${wine.drink_to}`)}</strong>
                        </button>
                      )) : <p className="empty-state">{t("noActionItems")}</p>}
                    </div>
                  </article>
                  {renderMaturityHeatmapCard(true)}
                </DashboardCarousel>
              ) : null}

              {dashboardFocus === "timeline" ? (
                <DashboardCarousel locale={locale} label={t("deliveryTimeline")} className="timeline-dashboard-carousel">
                  {renderDeliveriesWidget()}

                  <Suspense fallback={<article className="dashboard-card wide-card timeline-card"><div className="loading-state compact" role="status"><span>{t("loadingData")}</span></div></article>}>
                    <DeliveryTimelineCard locale={locale} t={t} timelineItems={deliveryTimelineItems} missedItems={missedDeliveryItems} onOpenWine={openWineFromDashboard} />
                  </Suspense>
                </DashboardCarousel>
              ) : null}

              {dashboardFocus === "data" ? (
                <Suspense fallback={<LoadingState label={t("loadingData")} />}>
                  <DataQualityBoard
                    locale={locale}
                    t={t}
                    wines={cellarWines}
                    valueRefreshWines={allValueRefreshWines}
                    missingValueCount={allMissingValueWines.length}
                    missingDrinkWindowWines={allMissingDrinkWindowWines}
                    missingGrapesWines={allMissingGrapesWines}
                    missingScoresWines={allMissingScoresWines}
                    missingPurposeWines={allMissingCellarPurposeWines}
                    incompleteWineCount={incompleteWineCount}
                    valueRefreshDays={valueRefreshDays}
                    onValueRefreshDaysChange={setValueRefreshDays}
                    canGenerateAi={canGenerateAi}
                    canWriteWine={canWriteWine}
                    saving={saving}
                    generatingAi={generatingAi}
                    selectedWineId={selectedWineId}
                    onGenerateAll={(feature, items) => void generateMissingWineAi(feature, items)}
                    onGenerateOne={(wine, feature) => void generateWineAi(wine, feature)}
                    onExcludeScores={(wine) => void setWineScoresAiExclusion(wine, true)}
                    onOpenWine={openWineFromDashboard}
                    onOpenIncomplete={() => openOperationalCellarFilter("missing_data")}
                  />
                </Suspense>
              ) : null}
              {dashboardFocus === "taste" ? (
                <DashboardCarousel locale={locale} label={locale === "it" ? "Il mio gusto" : "My Taste"} className="taste-dashboard-carousel">
                  <Suspense fallback={<LoadingState label={locale === "it" ? "Caricamento gusto…" : "Loading taste…"} />}>
                    <TasteProfilePanel locale={locale} variant="insight" wines={wines} isAppAdmin={Boolean(session?.is_app_admin)} onOpenWine={openWineFromDashboard} ownerName={session?.user_display_name} />
                  </Suspense>
                </DashboardCarousel>
              ) : null}
              {dashboardFocus !== "personal" ? <Suspense fallback={<LoadingState label={t("loadingData")} compact />}>
                <WinePulsePreview locale={locale} onOpen={() => setActiveView("pulse")} />
              </Suspense> : null}
            </section>
          ) : null}

          {activeView === "pulse" ? <Suspense fallback={<LoadingState label={t("loadingData")} />}><WinePulseView locale={locale} /></Suspense> : null}

          {activeView === "intelligence" && !isRestaurant ? (
            <><>{aiPackUpgradeNotice}</><Suspense fallback={<LoadingState label={t("loadingData")} />}><CellarIntelligenceView
                locale={locale}
                knownWines={wines}
                disabled={!canGenerateAi || !canWriteWine}
                onOpenWine={(wineId) => {
                  const wine = wines.find((item) => item.id === wineId);
                  if (wine) openWineFromDashboard(wine);
                }}
                onCellarChanged={loadWines}
              /></Suspense></>
          ) : null}

          {activeView === "assistant" && canAccessCellarAssistant ? (
            !session?.cellar_ai_assistant_subscribed ? (
              <section className="buying-advice-card wine-shelf-locked cellar-assistant-locked" aria-labelledby="cellar-assistant-locked-title">
                <span className="buying-place-premium"><AppIcon name="star" size="0.9rem" /> Vinaris Riserva</span>
                <h3 id="cellar-assistant-locked-title">{locale === "it" ? "Assistente Cantina AI" : "AI Cellar Assistant"}</h3>
                <p>{locale === "it"
                  ? "Chiedi qualsiasi cosa sulla tua cantina, anche a voce: cosa è al picco, quanto hai speso, cosa hai bevuto e con chi. E racconta cosa hai bevuto o acquistato: l'assistente prepara l'aggiornamento."
                  : "Ask anything about your cellar, even by voice: what is at its peak, how much you spent, what you drank and with whom. And tell it what you drank or bought: the assistant prepares the update."}</p>
                <p>{locale === "it" ? "L'assistente è riservato agli abbonati Vinaris Riserva e usa il tuo credito AI." : "The assistant is reserved for Vinaris Riserva subscribers and uses your AI credit."}</p>
                <button type="button" onClick={() => { setActiveView("settings"); setSettingsTab("profile"); loadSettingsTabData("profile"); }}>{locale === "it" ? "Scopri Riserva" : "Explore Reserve"} <span aria-hidden="true">→</span></button>
              </section>
            ) : <>{aiPackUpgradeNotice}<Suspense fallback={<LoadingState label={t("loadingData")} />}><CellarAssistantView
              locale={locale}
              disabled={!canGenerateAi || !canWriteWine}
              canRecognize={canRecognizeBottlePhoto}
              onPreparePurchase={prepareAssistantPurchaseDraft}
              onOpenWishlist={() => setActiveView("wishlist")}
              initialQuestion={assistantQuestion}
              startVoice={assistantVoiceStart}
              conversationKey={`vinaris.assistant.conversation:${session?.user_email || ""}:${session?.active_household_id || ""}`}
              onOpenWine={(wineId) => {
                const wine = wines.find((item) => item.id === wineId);
                if (wine) openWineFromDashboard(wine);
              }}
              pairingMaxPrice={pairingMaxPrice}
              onOpenPairing={(dish, result) => {
                setPairingTargetWineId(null);
                setPairingMarketOnly(false);
                setPairingDish(dish);
                setPairingResult(result);
                setPairingFromAssistant(true);
                leaveHelpFor("pairing"); setWineFormOpen(false); setWishlistFormOpen(false); clearFilters("pairing");
              }}
              onCellarChanged={async () => {
                await Promise.all([loadWines(), loadWishlist(), loadWishlistLists()]);
                if (!offlineMode && historySection === "tastings") await loadTastingArchive(0);
              }}
            /></Suspense></>
          ) : null}

          {activeView === "sommelier" ? <Suspense fallback={<LoadingState label={t("loadingData")} />}><SommelierHubView
            locale={locale}
            showAssistant={!isRestaurant && canAccessCellarAssistant}
            assistantLocked={!session?.cellar_ai_assistant_subscribed}
            showStrategy={!isRestaurant}
            shelfLocked={!session?.wine_shelf_scan_available}
            onOpen={openSommelierFeature}
          /></Suspense> : null}

          {activeView === "pairing" ? (
            <section className="pairing-view">
              {aiPackUpgradeNotice}
              <Suspense fallback={<LoadingState label={t("loadingData")} />}>
                <PairingView
                  key={pairingStartPlace}
                  startPlace={pairingStartPlace}
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
                  onOpenWine={openWineFromPairing}
                  onScanRestaurantWineList={scanRestaurantWineList}
                  onAskRestaurantWineList={askRestaurantWineList}
                  onSavePairingPreferences={savePairingPreferences}
                  pairingBudgetPresets={pairingBudgetPresets}
                  pairingBudgetSliderMax={pairingBudgetSliderMax}
                  pairingBudgetSliderValue={pairingBudgetSliderValue}
                  pairingDish={pairingDish}
                  pairingTargetWine={pairingTargetWineId ? wines.find((wine) => wine.id === pairingTargetWineId) || null : null}
                  pairingIgnorePreferences={pairingIgnorePreferences}
                  pairingIncludeMarket={pairingIncludeMarket}
                  pairingLocalOrigin={pairingLocalOrigin}
                  pairingMarketOnly={pairingMarketOnly}
                  pairingOnlyIdealDrinkWindow={pairingOnlyIdealDrinkWindow}
                  pairingMaxPrice={pairingMaxPrice}
                  pairingPreferLocal={pairingPreferLocal}
                  pairingResult={pairingResult}
                  startAtHome={pairingFromAssistant}
                  saving={saving}
                  savedPairingPreferences={aiSettings?.pairing_preferences || ""}
                  setAiSettingsDraft={setAiSettingsDraft}
                  setPairingDish={setPairingDish}
                  setPairingTargetWine={setPairingTargetWineId}
                  setPairingIgnorePreferences={setPairingIgnorePreferences}
                  setPairingIncludeMarket={setPairingIncludeMarket}
                  setPairingLocalOrigin={setPairingLocalOrigin}
                  setPairingMarketOnly={setPairingMarketOnly}
                  setPairingOnlyIdealDrinkWindow={setPairingOnlyIdealDrinkWindow}
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
              {aiPackUpgradeNotice}
              <Suspense fallback={<LoadingState label={t("loadingData")} />}>
                <BuyingAdviceView
                  key={buyingStartPlace}
                  initialPlace={buyingStartPlace}
                  canGenerateAi={canGenerateAi}
                  canWriteWishlist={canWriteWine}
                  generatingAi={generatingAi}
                  locale={locale}
                  buyingPurpose={buyingPurpose}
                  buyingPairingWith={buyingPairingWith}
                  buyingPreferences={buyingPreferences}
                  buyingWineType={buyingWineType}
                  buyingRegion={buyingRegion}
                  buyingUseTasteProfile={buyingUseTasteProfile}
                  buyingCheckAvailability={buyingCheckAvailability}
                  buyingNeededBy={buyingNeededBy}
                  buyingLocation={buyingLocation}
                  buyingMinPrice={buyingMinPrice}
                  buyingMaxPrice={buyingMaxPrice}
                  buyingAdviceResult={buyingAdviceResult}
                  formatAiBudget={formatAiBudget}
                  onGenerateBuyingAdvice={generateBuyingAdvice}
                  onAddRecommendationToWishlist={addBuyingAdviceRecommendationToWishlist}
                  wishlistLists={wishlistLists}
                  defaultWishlistListId={selectedWishlistListId}
                  onScanWineShelf={scanWineShelf}
                  onAskWineShelf={askRestaurantWineList}
                  shelfScanAvailable={Boolean(session?.wine_shelf_scan_available)}
                  onExploreRiserva={() => { setActiveView("settings"); setSettingsTab("profile"); loadSettingsTabData("profile"); }}
                  setBuyingPurpose={setBuyingPurpose}
                  setBuyingPairingWith={setBuyingPairingWith}
                  setBuyingPreferences={setBuyingPreferences}
                  setBuyingWineType={setBuyingWineType}
                  setBuyingRegion={setBuyingRegion}
                  setBuyingUseTasteProfile={setBuyingUseTasteProfile}
                  setBuyingCheckAvailability={setBuyingCheckAvailability}
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
            <Suspense fallback={<LoadingState label={t("loadingData")} />}>
              <HelpView
                locale={locale}
                role={helpRole}
                aiAvailable={canGenerateAi}
                initialSlug={helpSlug}
                onArticleChange={changeHelpArticle}
                onClose={closeHelp}
              />
            </Suspense>
          ) : null}

          {isCollectionView ? (
          <aside className="wine-side-panel">
            {showAiPackEnhancement && (activeView === "cellar" || activeView === "wishlist") ? aiPackEnhancementHint : null}
            {isWineCollectionView ? (
              (activeView === "cellar" && !wineFormOpen) || (selectedVisibleWine && !wineFormOpen) || compareWineIds.length > 0 ? (
              <div className="side-panel-actions">
                <div className="side-panel-action-buttons">
                  {activeView === "cellar" && !wineFormOpen ? (
                    <button type="button" className="side-panel-add-button mobile-redundant-add-wine" onClick={chooseAddWine} disabled={!canWriteWine}>
                      {t("addWine")}
                    </button>
                  ) : null}
                  {selectedVisibleWine && !wineFormOpen ? (
                  <button
                    type="button"
                    className="secondary side-panel-icon-button detail-expand-button"
                    aria-label={wineDetailExpanded ? (locale === "it" ? "Riduci dettaglio vino" : "Reduce wine detail") : (locale === "it" ? "Espandi dettaglio vino" : "Expand wine detail")}
                    title={wineDetailExpanded ? (locale === "it" ? "Riduci dettaglio" : "Reduce detail") : (locale === "it" ? "Espandi dettaglio" : "Expand detail")}
                    onClick={toggleWineDetailFocus}
                  >
                    <span aria-hidden="true">{wineDetailExpanded ? "↙" : "↗"}</span>
                  </button>
                  ) : null}
                  {selectedVisibleWine && !wineFormOpen ? (
                  <>
                    <button type="button" className="secondary side-panel-icon-button" onClick={() => startEditWine(selectedVisibleWine)} disabled={!canWriteWine} aria-label={t("editSelected")} title={t("editSelected")}>
                      <AppIcon name="edit" />
                    </button>
                  </>
                  ) : null}
                  {compareWineIds.length ? (
                  <>
                    <button type="button" className="secondary side-panel-icon-button" onClick={openCompareModal} aria-label={`${t("openCompare")} (${compareWineIds.length}/2)`} title={`${t("openCompare")} (${compareWineIds.length}/2)`}>
                      <span className="action-icon" aria-hidden="true">{appActionSvgIcon("compare")}</span>
                    </button>
                  </>
                  ) : null}
                </div>
              </div>
              ) : null
            ) : (
              <div className="side-panel-actions">
                <div className="side-panel-action-buttons">
                  <button type="button" className="side-panel-add-button" onClick={startAddWishlistItem} disabled={!canWriteWine}>
                    {t("addWishlist")}
                  </button>
                  {selectedWishlistItem && !wishlistFormOpen ? (
                  <>
                    <button type="button" className="secondary" onClick={() => startEditWishlistItem(selectedWishlistItem)} disabled={!canWriteWine}>
                      {t("editSelected")}
                    </button>
                    <button type="button" onClick={() => startWishlistConversion(selectedWishlistItem)} disabled={!canWriteWine || saving}>
                      {t("convert")}
                    </button>
                  </>
                  ) : null}
                </div>
              </div>
            )}
            {isWineCollectionView && wineFormOpen ? (
              <form className={`wine-form wine-editor-form ${editingId ? "is-editing" : "is-creating"} ${wineEditorExpanded ? "is-expanded" : ""} ${Object.values(openWineEditorSections).some(Boolean) ? "has-expanded-section" : ""}`} onSubmit={submitWine}>
                <div className="wine-editor-scroll" ref={wineEditorScrollRef}>
                <header className="wine-editor-heading">
                  <div>
                    <span>{locale === "it" ? "Scheda cantina" : "Cellar record"}</span>
                    <h2>{editingId ? t("editWine") : t("addWine")}</h2>
                    <p>{locale === "it" ? "Parti dai dati essenziali; potrai completare le informazioni avanzate quando vuoi." : "Start with the essentials; advanced information can be completed at any time."}</p>
                  </div>
                  {editingId ? (
                    <button
                      type="button"
                      className="secondary compact detail-expand-button"
                      aria-label={wineEditorExpanded ? (locale === "it" ? "Riduci modifica vino" : "Reduce wine editor") : (locale === "it" ? "Espandi modifica vino" : "Expand wine editor")}
                      title={wineEditorExpanded ? (locale === "it" ? "Riduci modifica" : "Reduce editor") : (locale === "it" ? "Espandi modifica" : "Expand editor")}
                      onClick={() => setWineEditorExpanded((expanded) => !expanded)}
                    >
                      <span aria-hidden="true">{wineEditorExpanded ? "↙" : "↗"}</span>
                    </button>
                  ) : null}
                  <i aria-hidden="true"><AppIcon name="bottle" variant="premium" tone="accent" /></i>
                </header>
                {!canWriteWine ? <p className="empty-state">{t("viewerReadOnly")}</p> : null}
                {!editingId && canWriteWine ? <button type="button" className="secondary purchase-import-entry" onClick={() => setPurchaseImportOpen(true)}>{locale === "it" ? "Aggiungi un acquisto da ricevuta o fattura" : "Add a purchase from receipt or invoice"}</button> : null}
                <section className="wine-editor-assist-grid" aria-label={locale === "it" ? "Assistenti di compilazione" : "Editing assistants"}>
                {!editingId && canUseLabelRecognition && wineRecognitionTarget === "wine" && (wineRecognitionLoading || wineImageRecognitionResult) ? (
                  <div className="recognition-box">
                    <span className="recognition-box-title">{wineRecognitionLoading ? t("recognitionInProgress") : t("recognizedWineProposal")}</span>
                    {wineRecognitionLoading ? <AiActivity compact locale={locale} label={t("recognitionInProgress")} /> : null}
                    {wineImageRecognitionResult ? (
                      <div className="recognition-results">
                        <small className="recognition-ai-cost">{t("aiRequestCost")}: {formatAiBudget(wineImageRecognitionResult.estimated_cost_usd)}</small>
                        {wineImageRecognitionResult.status === "recognized" || wineImageRecognitionResult.status === "ambiguous" ? (
                          <>
                            <strong>{[wineImageRecognitionResult.producer || wineImageRecognitionResult.estate, wineImageRecognitionResult.wine_name, wineImageRecognitionResult.cuvee].filter(Boolean).join(" · ")}</strong>
                            {wineImageRecognitionResult.status === "ambiguous" ? <span>{t("recognitionChooseCandidate")}</span> : null}
                            {wineImageRecognitionResult.alternative_candidates.map((candidate, index) => (
                              <button key={`${candidate.producer}-${candidate.wine_name}-${candidate.vintage}-${index}`} type="button" className="secondary compact" onClick={() => applyWineImageCandidate(candidate)}>
                                {[candidate.producer || candidate.estate, candidate.wine_name, candidate.cuvee || (!candidate.wine_name ? candidate.appellation : ""), candidate.vintage].filter(Boolean).join(" · ")}
                              </button>
                            ))}
                            <label className="recognition-vintage-field">
                              <span>{t("vintage")}</span>
                              <input
                                value={draft.vintage}
                                onChange={(event) => setDraft((current) => ({ ...current, vintage: event.target.value }))}
                                inputMode="text"
                                autoComplete="off"
                                disabled={!canWriteWine || wineEnrichmentLoading}
                              />
                              <small>{t("recognitionVintageHelp")}</small>
                            </label>
                            <div className="vintage-quick-choices" role="group" aria-label={t("vintageHelp")}>
                              {(["NV", "MV"] as const).map((value) => <button key={value} type="button" className={`secondary compact vintage-choice${draft.vintage.trim().toUpperCase() === value ? " is-selected" : ""}`} aria-pressed={draft.vintage.trim().toUpperCase() === value} disabled={!canWriteWine || wineEnrichmentLoading} onClick={() => setDraft((current) => ({ ...current, vintage: value }))}>{value}</button>)}
                            </div>
                            <div className="recognition-enrichment-intro">
                              <strong>{t("recognitionEnrichmentChoiceTitle")}</strong>
                              <span>{t("recognitionEnrichmentChoiceHelp")}</span>
                            </div>
                            <div className="recognition-enrichment-actions">
                              <div className="recognition-enrichment-choice is-full">
                                <button type="button" className="compact" aria-describedby="recognition-full-help" disabled={wineEnrichmentLoading || wineRecognitionLoading || saving} onClick={(event) => void startFullEnrichmentFromRecognition(event)}>
                                  {t("recognitionFullEnrichment")}
                                </button>
                                <small id="recognition-full-help">{t("recognitionFullEnrichmentHelp")}</small>
                              </div>
                            </div>
                            <details className="recognition-enrichment-help">
                              <summary>{t("recognitionEnrichmentHelpTitle")}</summary>
                              <small>{t("recognitionEnrichmentCostHelp")}</small>
                            </details>
                          </>
                        ) : <span>{t("recognitionCouldNotIdentify")}</span>}
                      </div>
                    ) : null}
                  </div>
                ) : null}
                {canReuseWinePhotos ? (
                  <div className={`bottle-photo-form-card${canManageWinePhotos ? "" : " reuse-only"}${winePhotoSuggestion ? " has-suggestion" : ""}`}>
                    <div>
                      <strong>{locale === "it" ? "Foto della bottiglia" : "Bottle photo"}</strong>
                      <small>
                        {canManageWinePhotos ? (editingId
                          ? (selectedWine?.photo_detail_url
                            ? (locale === "it" ? "Sostituisci o elimina la foto associata a questo vino." : "Replace or remove the photo associated with this wine.")
                            : (locale === "it" ? "Aggiungi una foto prodotto a questo vino." : "Add a product photo to this wine."))
                          : pendingBottlePhoto
                          ? (locale === "it" ? "Foto pronta: sarà salvata insieme al vino." : "Photo ready: it will be saved with the wine.")
                          : (locale === "it" ? "Scatta la foto prodotto con sagoma e sfondo trasparente." : "Take the guided product photo with a transparent background."))
                          : (locale === "it" ? "Se disponibile, puoi associare una foto già presente nell'archivio." : "When available, you can associate a photo already in the library.")}
                      </small>
                      {!editingId && !canRecognizeBottlePhoto ? (
                        <small className="form-hint">{t("bottlePhotoWithoutAiHelp")}</small>
                      ) : null}
                    </div>
                    {canManageWinePhotos ? <Suspense fallback={<LoadingState label={t("loadingData")} compact />}>
                      <BottlePhotoCapture
                        wine={editingId ? selectedWine || undefined : undefined}
                        draftName={draft.name}
                        prepared={!editingId && Boolean(pendingBottlePhoto || selectedSuggestedPhotoId)}
                        canWrite={canWriteWine}
                        locale={locale}
                        buttonLabel={!editingId && canRecognizeBottlePhoto ? t("addWineFromPhoto") : undefined}
                        onPrepared={editingId ? undefined : (photo) => {
                          setSelectedSuggestedPhotoId(null);
                          setPendingBottlePhoto(photo);
                          if (canRecognizeBottlePhoto && photo.recognitionSource) {
                            void recognizeBottleImage(photo.recognitionSource);
                          }
                        }}
                        onSaved={(updated) => setWines((current) => current.map((item) => item.id === updated.id ? updated : item))}
                        onError={(message) => setError(formatUserErrorMessage(message, locale))}
                      />
                    </Suspense> : null}
                    {winePhotoSuggestion ? (
                      <div className={`wine-photo-suggestion${selectedSuggestedPhotoId === winePhotoSuggestion.source_wine_id ? " selected" : ""}`}>
                        <img src={winePhotoSuggestion.thumbnail_url} alt={locale === "it" ? `Foto proposta per ${draft.name}` : `Suggested photo for ${draft.name}`} />
                        <div>
                          <strong>{locale === "it" ? "Foto già disponibile" : "Photo already available"}</strong>
                          <small>
                            {locale === "it"
                              ? "Trovata per lo stesso vino in un'altra cantina, indipendentemente dall'annata."
                              : "Found for the same wine in another cellar, regardless of vintage."}
                          </small>
                          {winePhotoSuggestions.length > 1 ? (
                            <div className="wine-photo-suggestion-navigation">
                              <button type="button" className="secondary compact" onClick={() => setWinePhotoSuggestionIndex((current) => (current - 1 + winePhotoSuggestions.length) % winePhotoSuggestions.length)}>
                                {locale === "it" ? "Precedente" : "Previous"}
                              </button>
                              <small>{winePhotoSuggestionIndex + 1} / {winePhotoSuggestions.length}</small>
                              <button type="button" className="secondary compact" onClick={() => setWinePhotoSuggestionIndex((current) => (current + 1) % winePhotoSuggestions.length)}>
                                {locale === "it" ? "Successiva" : "Next"}
                              </button>
                            </div>
                          ) : null}
                          <button
                            type="button"
                            className={selectedSuggestedPhotoId === winePhotoSuggestion.source_wine_id ? "compact" : "secondary compact"}
                            disabled={saving}
                            onClick={() => void reuseSuggestedWinePhoto(winePhotoSuggestion.source_wine_id)}
                          >
                            {editingId
                              ? (locale === "it" ? "Usa questa foto" : "Use this photo")
                              : selectedSuggestedPhotoId === winePhotoSuggestion.source_wine_id
                              ? (locale === "it" ? "Foto selezionata" : "Photo selected")
                              : (locale === "it" ? "Usa questa foto" : "Use this photo")}
                          </button>
                        </div>
                      </div>
                    ) : null}
                  </div>
                ) : null}
                </section>
                <section className="wine-editor-section wine-editor-essential wine-editor-section--identity" data-wine-editor-section="identity" tabIndex={-1}>
                  <div className="wine-editor-section-heading">
                    <div><span>01</span><strong>{locale === "it" ? "Identità e disponibilità" : "Identity and availability"}</strong></div>
                    <small>{locale === "it" ? "Formato, tipologia, acquisto e giacenza" : "Format, type, purchase and stock"}</small>
                  </div>
                <label>
                  <span>{t("name")}</span>
                  <input value={draft.name} onChange={(event) => updateWineDraftName(event.target.value)} required disabled={!canWriteWine} autoComplete="off" />
                </label>
                {wineDraftTemplateSuggestions.length ? (
                  <div className="catalog-template-choices" aria-label={locale === "it" ? "Vini trovati nel catalogo" : "Wines found in the catalog"}>
                    <small>{locale === "it" ? "Vini trovati — seleziona quello corretto per compilare i dati" : "Wines found — select the correct one to fill in the details"}</small>
                    <div>
                      {wineDraftTemplateSuggestions.map((wine) => (
                        <button
                          key={wine.id || `${wine.producer}-${wine.name}-${wine.region}`}
                          type="button"
                          className="catalog-template-choice"
                          onClick={() => selectWineTemplate(wine, "wine")}
                        >
                          <strong>{wine.name}</strong>
                          <span>{[wine.producer, wine.region].filter(Boolean).join(" · ")}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                ) : null}
                {showManualWineAiSearch ? (
                  <div className="manual-ai-search">
                    <button type="button" className="secondary compact" disabled={wineEnrichmentLoading} onClick={() => void enrichManualWineDraft("wine")}>
                      <ButtonBusyContent busy={wineEnrichmentLoading} idleLabel={t("searchWineDataWithAi")} busyLabel={t("generating")} ai />
                    </button>
                    {wineEnrichmentLoading ? <AiActivity compact locale={locale} label={t("aiWineSearchWaiting")} /> : null}
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
                  <label><span>{locale === "it" ? "Zona vitivinicola" : "Wine-growing area"}</span><input maxLength={120} value={draft.wine_zone} onChange={event => setDraft({ ...draft, wine_zone: event.target.value })} disabled={!canWriteWine} /></label>
                  <label><span>{locale === "it" ? "Località / Comune" : "Locality / Municipality"}</span><input maxLength={240} value={draft.vineyard_locality} onChange={event => setDraft({ ...draft, vineyard_locality: event.target.value })} disabled={!canWriteWine} /></label>
                </div>
                  <div className="form-row vintage-companion-row">
                    <div className="vintage-field">
                      <label>
                        <span>{t("vintage")}</span>
                        <input value={draft.vintage} onChange={(event) => setDraft({ ...draft, vintage: event.target.value })} disabled={!canWriteWine} autoComplete="off" />
                      </label>
                      <div className="vintage-quick-choices" role="group" aria-label={t("vintageHelp")}>
                        {(["NV", "MV"] as const).map((value) => <button key={value} type="button" className={`secondary compact vintage-choice${draft.vintage.trim().toUpperCase() === value ? " is-selected" : ""}`} aria-pressed={draft.vintage.trim().toUpperCase() === value} disabled={!canWriteWine} onClick={() => setDraft({ ...draft, vintage: value })}>{value}</button>)}
                      </div>
                      <small className="form-hint">{t("vintageHelp")}</small>
                    </div>
                    <label>
                      <span>{t("quantity")}</span>
                      <input type="number" min="0" value={draft.quantity} onChange={(event) => setDraft({ ...draft, quantity: event.target.value })} disabled={!canWriteWine} />
                  </label>
                </div>
                <label>
                  <span>{t("rating")}</span>
                  <RatingInput value={draft.rating} disabled={!canWriteWine} label={t("rating")} hint={locale === "it" ? "Tieni premuta una stella per il mezzo punto" : "Hold a star for a half point"} onChange={(value) => setDraft({ ...draft, rating: value })} />
                </label>
                <div className="drink-window-editor">
                  <div className="drink-window-editor-heading">
                    <div>
                      <span>{locale === "it" ? "Finestra di beva" : "Drinking window"}</span>
                      <small>{locale === "it" ? "Impostazione manuale" : "Manual setting"}</small>
                    </div>
                    <small>{locale === "it" ? "Il picco è facoltativo" : "Peak is optional"}</small>
                  </div>
                  <div className="drink-window-editor-grid">
                    <label>
                      <span>{locale === "it" ? "Da" : "From"}</span>
                      <input type="number" min="1900" max="2200" step="1" inputMode="numeric" value={draft.drink_from} onChange={(event) => setDraft({ ...draft, drink_from: event.target.value })} disabled={!canWriteWine} placeholder="2028" />
                    </label>
                    <label>
                      <span>{locale === "it" ? "Picco da" : "Peak from"}</span>
                      <input type="number" min="1900" max="2200" step="1" inputMode="numeric" value={draft.drink_peak_from} onChange={(event) => setDraft({ ...draft, drink_peak_from: event.target.value })} disabled={!canWriteWine} placeholder="2030" />
                    </label>
                    <label>
                      <span>{locale === "it" ? "Picco fino a" : "Peak to"}</span>
                      <input type="number" min="1900" max="2200" step="1" inputMode="numeric" value={draft.drink_peak_to} onChange={(event) => setDraft({ ...draft, drink_peak_to: event.target.value })} disabled={!canWriteWine} placeholder="2034" />
                    </label>
                    <label>
                      <span>{locale === "it" ? "Fino a" : "To"}</span>
                      <input type="number" min="1900" max="2200" step="1" inputMode="numeric" value={draft.drink_to} onChange={(event) => setDraft({ ...draft, drink_to: event.target.value })} disabled={!canWriteWine} placeholder="2037" />
                    </label>
                  </div>
                  <label>
                    <span>{locale === "it" ? "Nota sulla finestra" : "Window note"}</span>
                    <input value={draft.drink_window_notes} onChange={(event) => setDraft({ ...draft, drink_window_notes: event.target.value })} disabled={!canWriteWine} placeholder={locale === "it" ? "Es. conservazione in cantina ideale" : "E.g. ideally cellar-stored"} />
                  </label>
                  <small className="form-hint">{locale === "it" ? "Lascia vuoto il picco per usare l'intera finestra come periodo ideale. Per rimuovere la finestra, svuota gli anni e salva." : "Leave the peak empty to use the entire window as the ideal period. Clear the years and save to remove it."}</small>
                </div>
                </section>
                <section className={`wine-editor-section wine-editor-section--stock wine-editor-disclosure ${openWineEditorSections.stock ? "is-open" : ""}`} data-wine-editor-section="stock">
                  <button type="button" className="wine-editor-disclosure-toggle" aria-keyshortcuts="Alt+5" aria-expanded={Boolean(openWineEditorSections.stock)} onClick={() => setOpenWineEditorSections((current) => current.stock ? {} : { stock: true })}>
                    <div><span>05</span><strong>{locale === "it" ? "Giacenza e acquisti" : "Stock and purchases"}</strong></div>
                    <small>{locale === "it" ? "Posizione, lotti e costi" : "Location, lots and costs"}</small>
                  </button>
                  {openWineEditorSections.stock ? <div className="wine-editor-section-body is-visible">
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
                    <LocalizedDateInput value={draft.order_date} onChange={(order_date) => setDraft({ ...draft, order_date })} locale={locale} disabled={!canWriteWine} ariaLabel={t("orderDate")} />
                  </label>
                  <label>
                    <span>{t("delivery")}</span>
                    <LocalizedDateInput value={draft.expected_delivery} onChange={(expected_delivery) => setDraft({ ...draft, expected_delivery })} locale={locale} disabled={!canWriteWine} ariaLabel={t("delivery")} />
                  </label>
                </div>
                {isRestaurant ? <div className="restaurant-commercial-settings">
                  <label>
                    <span>{locale === "it" ? "Stato in carta" : "Wine list status"}</span>
                    <select value={draft.commercial_status} onChange={(event) => {
                      const commercialStatus = event.target.value as WineDraft["commercial_status"];
                      setDraft({ ...draft, commercial_status: commercialStatus, reorder_enabled: commercialStatus === "active" ? draft.reorder_enabled : false });
                    }} disabled={!canWriteWine}>
                      <option value="active">{locale === "it" ? "In carta" : "On the list"}</option>
                      <option value="clearing_out">{locale === "it" ? "A esaurimento" : "Clearing out"}</option>
                      <option value="suspended">{locale === "it" ? "Sospeso" : "Suspended"}</option>
                      <option value="off_list">{locale === "it" ? "Fuori carta" : "Off list"}</option>
                    </select>
                    <small>{locale === "it" ? "Definisce la presenza del vino nella carta del ristorante." : "Controls whether this wine appears on the restaurant list."}</small>
                  </label>
                  <label>
                    <span>{locale === "it" ? "Soglia di riordino" : "Reorder threshold"}</span>
                    <input type="number" min="0" max="10000" step="1" value={draft.reorder_threshold} onChange={(event) => setDraft({ ...draft, reorder_threshold: event.target.value })} disabled={!canWriteWine} />
                    <small>{locale === "it" ? "Entra in “Da ordinare” a questa giacenza. Predefinita: 2." : "Listed under Reorder at this stock level. Default: 2."}</small>
                  </label>
                  <label className="restaurant-reorder-toggle">
                    <input type="checkbox" checked={draft.reorder_enabled} onChange={(event) => setDraft({ ...draft, reorder_enabled: event.target.checked })} disabled={!canWriteWine || draft.commercial_status !== "active"} />
                    <span>{locale === "it" ? "Includi nei vini da riordinare" : "Include in wines to reorder"}</span>
                  </label>
                </div> : null}
                {isRestaurant && !editingId ? <div className="form-row vintage-companion-row">
                  <label>
                    <span>{locale === "it" ? "Riferimento acquisto" : "Purchase reference"}</span>
                    <input value={draft.initial_stock_reference} maxLength={160} onChange={(event) => setDraft({ ...draft, initial_stock_reference: event.target.value })} disabled={!canWriteWine} placeholder={locale === "it" ? "Fattura, ordine…" : "Invoice, order…"} />
                  </label>
                </div> : null}
                {editingId && wines.find(wine => wine.id === editingId) ? <Suspense fallback={<LoadingState label={t("loadingData")} compact />}>
                  <WineLotsSection
                    wine={wines.find(wine => wine.id === editingId)!}
                    canWrite={canWriteWine}
                    saving={saving}
                    locale={locale}
                    onRegistered={quantity => setDraft(current => ({ ...current, quantity: String((wines.find(wine => wine.id === editingId)?.quantity || 0) + quantity) }))}
                    onBusyChange={setSaving}
                    onChanged={loadWines}
                  />
                </Suspense> : null}
                {!editingId ? <>
                  <WineLocationPicker
                    locale={locale}
                    locationId={draft.storage_location_id}
                    binId={draft.storage_bin_id}
                    disabled={!canWriteWine}
                    onChange={(locationId, binId) => setDraft({ ...draft, storage_location_id: locationId, storage_bin_id: binId })}
                  />
                  <small className="form-hint">{locale === "it" ? "Tutte le bottiglie iniziali saranno collocate qui; potrai dividerle dalla scheda del vino." : "All initial bottles will be placed here; you can split them from the wine detail."}</small>
                </> : null}
                  </div> : null}
                </section>
                <section className={`wine-editor-section wine-editor-section--value wine-editor-disclosure ${openWineEditorSections.value ? "is-open" : ""}`} data-wine-editor-section="value">
                  <button type="button" className="wine-editor-disclosure-toggle" aria-keyshortcuts="Alt+2" aria-expanded={Boolean(openWineEditorSections.value)} onClick={() => setOpenWineEditorSections((current) => current.value ? {} : { value: true })}>
                    <div><span>02</span><strong>{locale === "it" ? "Prezzi e valore" : "Prices and value"}</strong></div>
                    <small>{locale === "it" ? "Costo d'acquisto e andamento del valore" : "Purchase cost and value history"}</small>
                  </button>
                  {openWineEditorSections.value ? <div className="wine-editor-section-body is-visible">
                    <div className="form-row">
                      <label>
                        <span>{t("currency")}</span>
                        <input value={draft.currency} onChange={(event) => setDraft({ ...draft, currency: event.target.value })} disabled={!canWriteWine} />
                      </label>
                      <label>
                        <span>{t("merchant")}</span>
                        <input
                          value={draft.merchant}
                          list={wineMerchantOptionsId}
                          autoComplete="organization"
                          onChange={(event) => setDraft({ ...draft, merchant: event.target.value })}
                          disabled={!canWriteWine}
                        />
                        <datalist id={wineMerchantOptionsId}>
                          {merchants.map((merchant) => <option key={merchant.id} value={merchant.name} />)}
                        </datalist>
                        <small className="form-hint">{locale === "it" ? "Inizia a scrivere per scegliere un commerciante già registrato." : "Start typing to select a registered merchant."}</small>
                      </label>
                      <label>
                        <span>{t("purchasePrice")}</span>
                        <input type="number" min="0" step="0.01" value={draft.price} onChange={(event) => setDraft({ ...draft, price: event.target.value })} disabled={!canWriteWine} />
                        <small className="form-hint">{locale === "it" ? "Se il vino è un regalo, inserisci 0.01: la variazione di valore sarà mostrata in CHF, non in percentuale." : "If the wine was a gift, enter 0.01: value change will be shown in currency, not as a percentage."}</small>
                      </label>
                      <label>
                        <span>{t("currentValue")}</span>
                        <input type="number" min="0" step="0.01" value={draft.current_value} onChange={(event) => setDraft({ ...draft, current_value: event.target.value })} disabled={!canWriteWine} />
                      </label>
                      {isRestaurant ? <label>
                        <span>{locale === "it" ? "Prezzo di vendita" : "Sale price"}</span>
                        <input type="number" min="0" step="0.01" value={draft.sale_price} onChange={(event) => setDraft({ ...draft, sale_price: event.target.value })} disabled={!canWriteWine} />
                      </label> : null}
                    </div>
                    {isRestaurant ? <div className="form-row restaurant-glass-settings">
                      <label>
                        <span>{locale === "it" ? "Prezzo al bicchiere" : "Price per glass"}</span>
                        <input type="number" min="0" step="0.01" value={draft.glass_price} onChange={(event) => setDraft({ ...draft, glass_price: event.target.value })} disabled={!canWriteWine} />
                      </label>
                      <label>
                        <span>{locale === "it" ? "Misura mescita (dl)" : "Pour size (dl)"}</span>
                        <input type="number" min="0.25" max="5" step="0.05" value={draft.pour_size_ml === "" ? "" : String(Number(draft.pour_size_ml) / 100)} onChange={(event) => setDraft({ ...draft, pour_size_ml: event.target.value === "" ? "" : String(Math.round(Number(event.target.value) * 100)) })} disabled={!canWriteWine} />
                        <small>{locale === "it" ? "Dose predefinita: 1 dl." : "Default pour: 1 dl."}</small>
                      </label>
                    </div> : null}
                  </div> : null}
                </section>
                <section className={`wine-editor-section wine-editor-section--profile wine-editor-disclosure ${openWineEditorSections.profile ? "is-open" : ""}`} data-wine-editor-section="profile">
                  <button type="button" className="wine-editor-disclosure-toggle" aria-keyshortcuts="Alt+3" aria-expanded={Boolean(openWineEditorSections.profile)} onClick={() => setOpenWineEditorSections((current) => current.profile ? {} : { profile: true })}>
                    <div><span>03</span><strong>{locale === "it" ? "Profilo e riconoscimenti" : "Profile and ratings"}</strong></div>
                    <small>{locale === "it" ? "Uvaggi, punteggi e tag" : "Grapes, scores and tags"}</small>
                  </button>
                  {openWineEditorSections.profile ? <div className="wine-editor-section-body is-visible">
                <div className="ownership-editor">
                  <div className="section-heading">
                    <h3><i className="dashboard-section-icon" aria-hidden="true">{grapesSvgIcon()}</i>{t("grapes")}</h3>
                    <button
                      type="button"
                      className="secondary compact"
                      disabled={!canWriteWine}
                      onClick={() => {
                        setDraft({ ...draft, grapes: [...draft.grapes, { name: "", percentage_from: "", percentage_to: "" }] });
                        revealLatestWineEditorField();
                      }}
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
                      onClick={() => {
                        setDraft({ ...draft, scores: [...draft.scores, { critic: "", score: "", note: "" }] });
                        revealLatestWineEditorField();
                      }}
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
                  </div> : null}
                </section>
                <section className={`wine-editor-section wine-editor-section--strategy wine-editor-disclosure ${openWineEditorSections.strategy ? "is-open" : ""}`} data-wine-editor-section="strategy">
                  <button type="button" className="wine-editor-disclosure-toggle" aria-keyshortcuts="Alt+4" aria-expanded={Boolean(openWineEditorSections.strategy)} onClick={() => setOpenWineEditorSections((current) => current.strategy ? {} : { strategy: true })}>
                    <div><span>04</span><strong>{locale === "it" ? "Obiettivo in cantina" : "Cellar purpose"}</strong></div>
                    <small>{selectedWine ? `${wineEditorStrategySummary?.wineId === selectedWine.id ? wineEditorStrategySummary.allocated : "–"} / ${selectedWine.quantity}` : "0 / 0"}</small>
                  </button>
                  <div className={`wine-editor-section-body ${openWineEditorSections.strategy ? "is-visible" : "is-preloaded"}`}>
                    {openWineEditorSections.strategy && editingId && selectedWine ? (
                      <WineStrategySection
                        wine={selectedWine}
                        locale={locale}
                        canWrite={canWriteWine}
                        onChanged={loadWines}
                        onAllocatedChange={(allocated) => setWineEditorStrategySummary({ wineId: selectedWine.id, allocated })}
                        embedded
                      />
                    ) : (
                      <p className="empty-state">{locale === "it" ? "Potrai assegnare gli obiettivi dopo aver creato il vino." : "You can assign cellar purposes after creating the wine."}</p>
                    )}
                  </div>
                </section>
                <section className={`wine-editor-section wine-editor-section--history wine-editor-disclosure ${openWineEditorSections.history ? "is-open" : ""}`} data-wine-editor-section="history">
                  <button type="button" className="wine-editor-disclosure-toggle" aria-keyshortcuts="Alt+6" aria-expanded={Boolean(openWineEditorSections.history)} onClick={() => setOpenWineEditorSections((current) => current.history ? {} : { history: true })}>
                    <div><span>06</span><strong>{locale === "it" ? "Note e storia" : "Notes and history"}</strong></div>
                    <small>{locale === "it" ? "Degustazioni, appunti e proprietà" : "Tastings, notes and ownership"}</small>
                  </button>
                  {openWineEditorSections.history ? <div className="wine-editor-section-body is-visible">
                    <label>
                      <span>{t("notes")}</span>
                      <textarea value={draft.notes} onChange={(event) => setDraft({ ...draft, notes: event.target.value })} rows={3} disabled={!canWriteWine} />
                    </label>
                    <div className="ownership-editor">
                      <div className="section-heading">
                        <h3>{t("multiOwnership")}</h3>
                        <button type="button" className="secondary compact" disabled={!canWriteWine} onClick={() => {
                          setDraft({ ...draft, owners: [...draft.owners, { name: "", email: "", share_pct: "" }] });
                          revealLatestWineEditorField();
                        }}>+</button>
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
                          <button type="button" className="danger compact" disabled={!canWriteWine} onClick={() => setDraft({ ...draft, owners: draft.owners.filter((_, itemIndex) => itemIndex !== index) })}>{t("delete")}</button>
                        </div>
                      ))}
                    </div>
                  </div> : null}
                </section>
                <section className={`wine-editor-section wine-editor-section--audit wine-editor-disclosure ${openWineEditorSections.audit ? "is-open" : ""}`} data-wine-editor-section="audit">
                  <button type="button" className="wine-editor-disclosure-toggle" aria-keyshortcuts="Alt+7" aria-expanded={Boolean(openWineEditorSections.audit)} onClick={() => setOpenWineEditorSections((current) => current.audit ? {} : { audit: true })}>
                    <div><span>07</span><strong>{t("aiAudit")}</strong></div>
                    <small>{selectedWine ? aiAudit.filter((entry) => entry.entity_type === "wine" && entry.entity_id === selectedWine.id).length : 0}</small>
                  </button>
                  {openWineEditorSections.audit ? <div className="wine-editor-section-body is-visible">
                    {selectedWine && aiAudit.some((entry) => entry.entity_type === "wine" && entry.entity_id === selectedWine.id) ? (
                      <div className="audit-list">
                        {aiAudit.filter((entry) => entry.entity_type === "wine" && entry.entity_id === selectedWine.id).map((entry) => (
                          <div className="audit-row" key={entry.id}>
                            <strong>{entry.feature.replace(/_/g, " ")}</strong>
                            <span>{entry.model} · {formatDisplayDate(entry.created_at)}</span>
                            <p>{entry.summary}</p>
                          </div>
                        ))}
                      </div>
                    ) : <p className="empty-state">{t("noAiAudit")}</p>}
                  </div> : null}
                </section>
                </div>
                <div className={`form-actions wine-editor-actions ${editingId ? "is-editing" : "is-creating"}`}>
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
              <form className="wine-form wishlist-editor-form" onSubmit={submitWishlist}>
                <h2>{editingWishlistId ? t("editWishlist") : t("addWishlist")}</h2>
                {!editingWishlistId ? <p className="wishlist-editor-help">{wishlistEntryIntent === "offer"
                  ? (locale === "it" ? "Inserisci il vino, l’annata e il prezzo offerto. Salva, poi apri il vino e scegli “Analizza offerta” per confrontare il prezzo con il mercato." : "Enter the wine, vintage and offer price. Save, then open the wine and choose “Analyse offer” to compare its price with the market.")
                  : (locale === "it" ? "Salva un vino da ricordare o provare, anche senza un’offerta. Potrai registrare un assaggio, valutarne l’acquisto o aggiungerlo alla cantina in seguito." : "Save a wine to remember or try, even without an offer. You can record a tasting, evaluate a purchase or add it to your cellar later.")}</p> : null}
                <div className="form-actions wishlist-editor-actions">
                  <button type="submit" disabled={saving || !canWriteWine}>{saving ? t("saving") : editingWishlistId ? t("saveChanges") : t("createWishlist")}</button>
                  <button type="button" className="secondary" onClick={closeWishlistForm}>
                    {t("cancel")}
                  </button>
                </div>
                {!editingWishlistId && canUseLabelRecognition ? (
                  <div className="recognition-box">
                    <span className="recognition-box-title">{wineRecognitionLoading && wineRecognitionTarget === "wishlist" ? t("recognizingWine") : t("recognizeWine")}</span>
                    <span className="recognition-beta-note">{t("recognitionBetaNotice")}</span>
                    {wineRecognitionLoading && wineRecognitionTarget === "wishlist" ? <AiActivity compact locale={locale} label={t("recognizingWine")} /> : null}
                    <div className="recognition-actions">
                      <label className="recognition-upload-button secondary compact">
                        <span>{t("choosePhotoFile")}</span>
                        <input type="file" accept="image/*" disabled={!canUseLabelRecognition || wineRecognitionLoading} onChange={(event) => handleWineRecognitionInput(event, "wishlist")} />
                      </label>
                      <Suspense fallback={<LoadingState label={t("loadingData")} compact />}>
                        <WishlistLiveTasteScanner
                          disabled={!canUseLabelRecognition || wineRecognitionLoading}
                          locale={locale}
                          onAnalyse={analyseWishlistLiveTaste}
                          onConfirm={confirmWishlistLiveTaste}
                        />
                      </Suspense>
                    </div>
                    {wineImageRecognitionResult && wineRecognitionTarget === "wishlist" ? (
                      <div className="recognition-results">
                        <strong>{t("recognitionSuggestions")}</strong>
                        <small className="recognition-ai-cost">{t("aiRequestCost")}: {formatAiBudget(wineImageRecognitionResult.estimated_cost_usd)}</small>
                        {wineImageRecognitionResult.status === "recognized" || wineImageRecognitionResult.status === "ambiguous" ? (
                          <>
                            <button type="button" className="secondary compact" onClick={() => applyWineImageCandidate(wineImageRecognitionResult, "wishlist")}>
                              {[wineImageRecognitionResult.producer || wineImageRecognitionResult.estate, wineImageCandidateName(wineImageRecognitionResult), wineImageRecognitionResult.vintage].filter(Boolean).join(" · ")}
                            </button>
                            {wineImageRecognitionResult.alternative_candidates.map((candidate, index) => (
                              <button key={`${candidate.producer}-${candidate.wine_name}-${candidate.vintage}-${index}`} type="button" className="secondary compact" onClick={() => applyWineImageCandidate(candidate, "wishlist")}>
                                {[candidate.producer || candidate.estate, wineImageCandidateName(candidate), candidate.vintage].filter(Boolean).join(" · ")}
                              </button>
                            ))}
                          </>
                        ) : <span>{t("recognitionCouldNotIdentify")}</span>}
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
                  <input ref={wishlistNameInputRef} value={wishlistDraft.name} onChange={(event) => updateWishlistDraftName(event.target.value)} required disabled={!canWriteWine} autoComplete="off" />
                </label>
                {wishlistDraftTemplateSuggestions.length ? (
                  <div className="catalog-template-choices" aria-label={locale === "it" ? "Vini trovati nel catalogo" : "Wines found in the catalog"}>
                    <small>{locale === "it" ? "Vini trovati — seleziona quello corretto per compilare i dati" : "Wines found — select the correct one to fill in the details"}</small>
                    <div>
                      {wishlistDraftTemplateSuggestions.map((wine) => (
                        <button
                          key={wine.id || `${wine.producer}-${wine.name}-${wine.region}`}
                          type="button"
                          className="catalog-template-choice"
                          onClick={() => selectWineTemplate(wine, "wishlist")}
                        >
                          <strong>{wine.name}</strong>
                          <span>{[wine.producer, wine.region].filter(Boolean).join(" · ")}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                ) : null}
                {showManualWishlistAiSearch ? (
                  <div className="manual-ai-search">
                    <button type="button" className="secondary compact" disabled={wineEnrichmentLoading} onClick={() => void enrichManualWineDraft("wishlist")}>
                      <ButtonBusyContent busy={wineEnrichmentLoading} idleLabel={t("searchWineDataWithAi")} busyLabel={t("generating")} ai />
                    </button>
                    {wineEnrichmentLoading ? <AiActivity compact locale={locale} label={t("aiWineSearchWaiting")} /> : null}
                    <small className="form-hint">{t("searchWineDataWithAiHelp")}</small>
                  </div>
                ) : null}
                <label>
                  <span>{t("producer")}</span>
                  <input value={wishlistDraft.producer} onChange={(event) => setWishlistDraft({ ...wishlistDraft, producer: event.target.value })} disabled={!canWriteWine} />
                </label>
                <div className="form-row wishlist-offer-row">
                  <WishlistVintageField value={wishlistDraft.vintage} onChange={vintage => setWishlistDraft({ ...wishlistDraft, vintage })} disabled={!canWriteWine} locale={locale} label={t("vintage")} help={t("vintageHelp")} />
                  <div className="wishlist-offer-price-fields">
                    <label>
                      <span>{locale === "it" ? "Prezzo" : "Price"}</span>
                      <input type="number" min="0" step="0.01" value={wishlistDraft.offer_price} onChange={(event) => setWishlistDraft({ ...wishlistDraft, offer_price: event.target.value })} disabled={!canWriteWine} />
                    </label>
                    <label>
                      <span>{t("currency")}</span>
                      <input list="wishlist-currency-options" value={wishlistDraft.currency} maxLength={3} onChange={(event) => setWishlistDraft({ ...wishlistDraft, currency: event.target.value.toUpperCase() })} disabled={!canWriteWine} autoComplete="off" />
                      <datalist id="wishlist-currency-options">
                        {["CHF", "EUR", "USD", "GBP"].map((currency) => <option key={currency} value={currency}>{currency}</option>)}
                      </datalist>
                    </label>
                  </div>
                </div>
                <div className="form-row">
                  <label>
                    <span>{locale === "it" ? "Prezzo massimo" : "Maximum price"}</span>
                    <input type="number" min="0" step="0.01" value={wishlistDraft.target_price} onChange={(event) => setWishlistDraft({ ...wishlistDraft, target_price: event.target.value })} disabled={!canWriteWine} />
                  </label>
                  <label>
                    <span>{locale === "it" ? "Capitale da investire" : "Investment budget"}</span>
                    <input type="number" min="0" step="0.01" value={wishlistDraft.investment_amount} onChange={(event) => setWishlistDraft({ ...wishlistDraft, investment_amount: event.target.value })} disabled={!canWriteWine} />
                    <small className="form-hint">{locale === "it" ? "Budget totale previsto per questa voce. Facoltativo." : "Total budget planned for this item. Optional."}</small>
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
                <div className="form-row wishlist-merchant-row">
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
              </form>
            ) : isWineCollectionView && selectedVisibleWine ? (
              renderWineDetail(selectedVisibleWine)
            ) : activeView === "wishlist" && selectedWishlistItem ? (
                <WishlistDetail
                  item={selectedWishlistItem}
                  auditEntries={aiAudit.filter((entry) => entry.entity_type === "wishlist" && entry.entity_id === selectedWishlistItem.id)}
                  canGenerate={canGenerateAi}
                  generating={generatingAi.startsWith("wishlist-") ? generatingAi.replace("wishlist-", "") : ""}
                  onGenerate={(feature) => generateWishlistAi(selectedWishlistItem, feature)}
                  canWrite={canWriteWine}
                  saving={saving}
                  onRecordTasting={(payload) => recordWishlistTasting(selectedWishlistItem, payload)}
                  marketAuditEntry={selectedWishlistMarketAudit}
                  onOpenMarketView={(entry) => setMarketViewContext({ kind: "wishlist", item: selectedWishlistItem, entry })}
                  t={t}
                  locale={locale}
                />
            ) : activeView === "wishlist" ? (visibleWishlistPortfolioStrategy || wishlistPortfolioStrategyOpen ? (
                <WishlistPortfolioStrategyPanel
                  strategy={visibleWishlistPortfolioStrategy}
                  canGenerate={canGenerateAi && wishlist.length > 0}
                  generating={generatingAi === "wishlist-portfolio-strategy"}
                  onGenerate={generateWishlistPortfolioStrategy}
                  open={wishlistPortfolioStrategyOpen}
                  onToggle={setWishlistPortfolioStrategyOpen}
                  useTasteProfile={wishlistUseTasteProfile}
                  onUseTasteProfileChange={setWishlistUseTasteProfile}
                  t={t}
                />
            ) : null) : (
              <div className="wine-detail empty-detail">
                <CellarEmptyImage />
                <div className="empty-detail-copy">
                  <h2>{t("noItemSelected")}</h2>
                  <p>{t("selectItemHelp")}</p>
                </div>
                {activeView === "cellar" ? (
                  <div className="empty-detail-kpis">
                    <article><AppIcon name="bottle" variant="premium" tone="accent" /><strong>{formatBottleCount(cellarStats.bottles, locale)}</strong><span>{locale === "it" ? "Bottiglie totali" : "Total bottles"}</span></article>
                    <article><AppIcon name="dashboard-cards" variant="premium" tone="accent" /><strong>{formatBottleCount(activeWineCollection.length, locale)}</strong><span>{locale === "it" ? "Vini diversi" : "Distinct wines"}</span></article>
                    <article><AppIcon name="chart" variant="premium" tone="accent" /><strong>{formatMoney(cellarStats.totalValue, "CHF", locale)}</strong><span>{t("totalValue")}</span></article>
                  </div>
                ) : null}
              </div>
            )}
          </aside>
          ) : null}

          {/* The Diario keeps its tabs on Vendite and Momenti too, which list no wines. */}
          {isCollectionView || activeView === "history" ? (
          <section className="wine-list" aria-busy={loading}>
            {activeView === "cellar" ? (
            <details className="stats-panel-wrapper">
              <summary className="cellar-stats-summary">
                <AppIcon name="chart" />
                <strong>{t("cellarStats")}</strong>
                {quickWineFilter ? <span>{quickWineFilterLabels[quickWineFilter]}</span> : null}
                {maturityFilter ? <span>{t("maturityFilter")}: {wineToneLabel(maturityFilter.tone, locale)} {maturityFilter.year}</span> : null}
              </summary>
              <section className="stats-panel cellar-stats-dashboard">
                <header className="cellar-stats-page-heading">
                  <div>
                    <span>{locale === "it" ? "Private cellar intelligence" : "Private cellar intelligence"}</span>
                    <h2>{t("cellarStats")}</h2>
                    <p>{locale === "it" ? "Panoramica completa della tua collezione" : "A complete overview of your collection"}</p>
                  </div>
                </header>
                <div className="cellar-kpi-grid">
                  <button type="button" className={`cellar-kpi-card cellar-kpi-card--value ${quickWineFilter === "" ? "active" : ""}`} onClick={() => applyQuickWineFilter("")}>
                    <i className="cellar-kpi-icon" aria-hidden="true">{dashboardStatSvgIcon("total")}</i>
                    <span className="cellar-kpi-copy">
                      <span>{t("totalValue")}</span>
                      <strong>{formatMoney(cellarStats.totalValue, "CHF", locale)}</strong>
                      <span className="cellar-kpi-value-footer">
                        <small>{formatBottleCount(cellarStats.bottles, locale)} {t("bottles").toLowerCase()}</small>
                        <PortfolioValueSparkline points={portfolioValueHistory} label={t("valueEvolution")} />
                      </span>
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
                      <strong>{formatBottleCount(readyInCellarWineCount, locale)}</strong>
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

                <div className="cellar-analytics-grid">
                  {valueByType.length ? (
                    <CellarDonutAnalytics
                      eyebrow={t("distributionByValue")}
                      title={t("valueByType")}
                      items={valueByType}
                      locale={locale}
                      metric="value"
                      onSelect={(item) => openBreakdownDrilldown("valueByType", "type", "value", item.label)}
                    />
                  ) : null}
                  {valueByRegion.length ? (
                    <CellarBarAnalytics
                      eyebrow={t("distributionByValue")}
                      title={t("topRegions")}
                      items={valueByRegion}
                      locale={locale}
                      metric="value"
                      onSelect={(item) => openBreakdownDrilldown("topRegions", "region", "value", item.label)}
                    />
                  ) : null}

                  <article className="cellar-analytics-card collection-state-card collection-state-card--analytics">
                    <div className="collection-state-heading">
                      <span>{t("recommendedActions")}</span>
                      <strong>{t("collectionStatus")}</strong>
                    </div>
                    <div className="collection-state-layout">
                      <div
                        className="collection-gauge"
                        style={{ "--collection-completion": `${cellarDataCompleteness}%` } as CSSProperties}
                        aria-label={`${t("dataCompleteness")} ${formatPercentage(cellarDataCompleteness, locale)}`}
                      >
                        <div><strong>{formatPercentage(cellarDataCompleteness, locale)}</strong><span>{t("dataCompleteness")}</span></div>
                      </div>
                      <div className="collection-health-list collection-health-list--compact">
                        <button type="button" onClick={() => applyQuickWineFilter("missing_data")} className={cellarMissingDataCount ? "needs-attention" : "is-complete"}>
                          <span>{t("missingDataToFix")}</span><strong>{formatBottleCount(cellarMissingDataCount, locale)}</strong>
                        </button>
                        <div className={cellarAiReadiness < 100 ? "needs-attention" : "is-complete"}>
                          <span>{t("aiReadiness")}</span><strong>{formatPercentage(cellarAiReadiness, locale)}</strong>
                        </div>
                        <div className="is-complete">
                          <span>{t("completeRecords")}</span><strong>{formatBottleCount(Math.max(cellarDataCheckCount - cellarMissingDataCount, 0), locale)} / {formatBottleCount(cellarDataCheckCount, locale)}</strong>
                        </div>
                        {cellarActionItems.map((item) => (
                          <button type="button" key={item.label} className={item.count ? "needs-attention" : "is-complete"} onClick={() => applyQuickWineFilter("missing_data")}>
                            <span>{item.label}</span><strong>{formatBottleCount(item.count, locale)}</strong>
                          </button>
                        ))}
                      </div>
                    </div>
                  </article>

                  {bottlesByType.length ? (
                    <CellarDonutAnalytics
                      eyebrow={t("distributionByStock")}
                      title={t("bottlesByType")}
                      items={bottlesByType}
                      locale={locale}
                      metric="bottles"
                      onSelect={(item) => openBreakdownDrilldown("bottlesByType", "type", "bottles", item.label)}
                    />
                  ) : null}
                  {winesByRegion.length ? (
                    <CellarBarAnalytics
                      eyebrow={t("distributionByStock")}
                      title={t("winesByRegion")}
                      items={winesByRegion}
                      locale={locale}
                      metric="wines"
                      onSelect={(item) => openBreakdownDrilldown("winesByRegion", "region", "wines", item.label)}
                    />
                  ) : null}
                  {portfolioValuePoints.length >= 2 ? (
                    <article className="cellar-analytics-card cellar-value-trend-card">
                      <div className="cellar-analytics-heading">
                        <span>{locale === "it" ? "Trend valore cantina" : "Cellar value trend"}</span>
                        <h3>{t("valueEvolution")}</h3>
                      </div>
                      <Suspense fallback={<div className="portfolio-value-chart-loading" aria-label={t("valueEvolution")} />}>
                        <div className="cellar-stats-value-chart">
                          <TimeSeriesChart
                            ariaLabel={t("valueEvolution")}
                            locale={locale}
                            currency="CHF"
                            height={230}
                            mobileHeight={220}
                            points={portfolioValuePoints.map((point) => ({ timestampMs: point.timestampMs, value: point.numericValue }))}
                          />
                        </div>
                      </Suspense>
                    </article>
                  ) : null}
                </div>
                <div className="cellar-analytics-drilldowns">
                  {renderBreakdownDrilldown("valueByType")}
                  {renderBreakdownDrilldown("topRegions")}
                  {renderBreakdownDrilldown("bottlesByType")}
                  {renderBreakdownDrilldown("winesByRegion")}
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
                <AppIcon name="tasting" />
                {t("historyTastings")}
              </button>
              {!offlineMode ? <button
                type="button"
                role="tab"
                aria-selected={historySection === "moments"}
                className={historySection === "moments" ? "" : "secondary"}
                onClick={() => setHistorySection("moments")}
              >
                <AppIcon name="camera" />
                {locale === "it" ? "Momenti" : "Moments"}
              </button> : null}
              <button
                type="button"
                role="tab"
                aria-selected={historySection === "wines"}
                className={historySection === "wines" ? "" : "secondary"}
                onClick={() => setHistorySection("wines")}
              >
                <AppIcon name="archive" />
                {t("historyArchivedWines")}
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={historySection === "sales"}
                className={historySection === "sales" ? "" : "secondary"}
                onClick={() => setHistorySection("sales")}
              >
                <AppIcon name="sales" />
                {locale === "it" ? "Vendite" : "Sales"}
              </button>
            </div>
            {historySection === "tastings" && !offlineMode ? <label className="record-tasting-origin"><span>{locale === "it" ? "Provenienza della bevuta" : "Tasting origin"}</span><select value={tastingOrigin} onChange={event => { setTastingOrigin(event.target.value as "" | "cellar" | "external"); setTastingArchiveOffset(0); }}><option value="">{locale === "it" ? "Tutte le bevute" : "All tastings"}</option><option value="cellar">{locale === "it" ? "Dalla cantina" : "From the cellar"}</option><option value="external">{locale === "it" ? "Extra cantina" : "Outside the cellar"}</option></select></label> : null}
            {historySection === "moments" ? (
              <div className="diary-moments">
                <Suspense fallback={null}><MemoryBookButton key={session?.active_household_id} locale={locale} home canAccess={canAccessMemories} onActivate={openSubscriptionSettings} onRecord={canWriteWine ? () => setRecordTastingOpen(true) : undefined} /></Suspense>
                {canAccessMemories ? <Suspense fallback={null}><PolaroidsWidget locale={locale} /></Suspense> : null}
              </div>
            ) : historySection === "sales" ? (
              <Suspense fallback={<LoadingState label={t("loadingData")} />}>
                <RestaurantDashboard
                  locale={locale}
                  mode={isRestaurant ? "restaurant" : "private"}
                  wines={wines}
                  onOpenIncompleteWines={() => openOperationalCellarFilter("missing_data")}
                  onOpenLowStockWines={() => openOperationalCellarFilter("low_stock")}
                  onOpenMissingSalePriceWines={() => openOperationalCellarFilter("missing_sale_price")}
                  refreshKey={restaurantDashboardVersion}
                  onOpenWine={(wineId) => {
                    const wine = wines.find((item) => item.id === wineId);
                    if (wine) openWineFromDashboard(wine);
                  }}
                  onChanged={async () => { await loadWines(); setRestaurantDashboardVersion((current) => current + 1); }}
                />
              </Suspense>
            ) : <details className="stats-panel-wrapper" open>
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
            </details>}
            </>
            ) : (
            <>
              <Suspense fallback={<LoadingState label={t("loadingData")} compact />}>
                <WishlistOverview locale={locale} lists={wishlistLists} selectedId={selectedWishlistListId}
                  onSelect={setSelectedWishlistListId} canWrite={canWriteWine} canAdmin={canAdmin} saving={saving}
                  count={wishlistStats.count} targetValue={formatMoney(wishlistStats.targetValue, "CHF", locale)}
                  highPriority={wishlistStats.highPriority} readyToBuy={wishlistStats.readyToBuy}
                  onCreate={createWishlistList} onRename={renameWishlistList} onDelete={deleteWishlistList}
                  onSaveWine={startAddWishlistItem} onOffer={() => { startAddWishlistItem(); setWishlistEntryIntent("offer"); }}
                  onStrategy={() => {
                    setSelectedWishlistId(null);
                    setWishlistFormOpen(false);
                    setWishlistPortfolioStrategyOpen(true);
                    requestAnimationFrame(() => {
                      const panel = Array.from(document.querySelectorAll<HTMLElement>(".wishlist-portfolio-panel")).find(element => element.getBoundingClientRect().width > 0);
                      panel?.scrollIntoView({ behavior: "smooth", block: "start" });
                      panel?.querySelector<HTMLElement>("summary")?.focus({ preventScroll: true });
                    });
                  }} t={t} />
              </Suspense>
              {isMobileViewport && !selectedWishlistItem && (visibleWishlistPortfolioStrategy || wishlistPortfolioStrategyOpen) ? (
                <WishlistPortfolioStrategyPanel
                  strategy={visibleWishlistPortfolioStrategy}
                  canGenerate={canGenerateAi && wishlist.length > 0}
                  generating={generatingAi === "wishlist-portfolio-strategy"}
                  onGenerate={generateWishlistPortfolioStrategy}
                  open={wishlistPortfolioStrategyOpen}
                  onToggle={setWishlistPortfolioStrategyOpen}
                  useTasteProfile={wishlistUseTasteProfile}
                  onUseTasteProfileChange={setWishlistUseTasteProfile}
                  t={t}
                />
              ) : null}
            </>
            )}
            {!(activeView === "history" && historyWithoutList) ? <div className={`collection-filter-dock${activeView === "cellar" ? " collection-filter-dock--cellar" : ""}`}>
            <details id={activeView === "cellar" ? "cellar-advanced-filters" : undefined} ref={filterPanelRef} className={`filter-panel ${activeView === "cellar" ? "cellar-filter-panel" : ""}`}>
              <summary>
                {activeView === "cellar" ? (
                  <>
                    <span className="cellar-filter-summary-main">
                      <AppIcon name="filter" />
                      <strong>
                        <span className="cellar-filter-label-desktop">{t("search")} / {t("sort")}</span>
                        <span className="cellar-filter-label-mobile">{locale === "it" ? "Ricerca e filtri" : "Search and filters"}</span>
                      </strong>
                      <small>{activeCollectionFilterChips.length ? `${activeCollectionFilterChips.length} ${locale === "it" ? "attivi" : "active"}` : (locale === "it" ? "Tutti i vini" : "All wines")}</small>
                    </span>
                    <span className="cellar-filter-sort-summary"><AppIcon name="sort" /> {t(sortMode === "name" ? "name" : sortMode === "vintage" ? "vintage" : sortMode === "value" ? "value" : "drinkWindow")}</span>
                  </>
                ) : <>{t("search")} / {t("sort")}</>}
              </summary>
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
                {activeView === "cellar" ? <label>
                  <span>{locale === "it" ? "Collocazione" : "Storage"}</span>
                  <select value={storageFilter} onChange={(event) => setStorageFilter(event.target.value)}>
                    <option value="">{locale === "it" ? "Tutte le posizioni" : "All positions"}</option>
                    {storageFilterOptions.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
                  </select>
                </label> : null}
                {activeView === "cellar" ? <label>
                  <span>{locale === "it" ? "Obiettivo cantina" : "Cellar purpose"}</span>
                  <select value={strategyPurposeFilter} onChange={(event) => setStrategyPurposeFilter(event.target.value as WineStrategyPurpose | "")}>
                    <option value="">{locale === "it" ? "Tutti gli obiettivi" : "All purposes"}</option>
                    {(["drink", "maturation", "investment", "special_occasion", "undecided"] as WineStrategyPurpose[]).map((purpose) => <option key={purpose} value={purpose}>{strategyPurposeLabel(purpose, locale)}</option>)}
                  </select>
                </label> : null}
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
            {activeView === "cellar" && activeCollectionFilterChips.length ? (
              <div className="active-cellar-filters" aria-label={locale === "it" ? "Filtri attivi" : "Active filters"}>
                <div className="active-cellar-filter-scroll">
                  {activeCollectionFilterChips.map((chip) => (
                    <button type="button" key={chip.key} onClick={chip.onRemove} title={locale === "it" ? `Rimuovi ${chip.label}` : `Remove ${chip.label}`}>
                      <span>{chip.label}</span><i aria-hidden="true">×</i>
                    </button>
                  ))}
                </div>
                <button type="button" className="clear-active-cellar-filters" onClick={() => clearFilters(activeView)}>{t("clearFilters")}</button>
              </div>
            ) : null}
            </div> : null}
            {!(activeView === "history" && historyWithoutList) ? <div className={`list-header${activeView === "cellar" ? " cellar-list-header" : ""}`}>
              <h2>
                {activeView === "wishlist"
                  ? t("wishlist")
                  : activeView === "history"
                    ? historySection === "tastings"
                      ? t("historyTastings")
                      : t("historyArchivedWines")
                    : activeView === "cellar"
                      ? t("cellar")
                      : t("wines")}
              </h2>
              <span>
                {activeView === "cellar" && maturityFilter
                  ? <>{formatBottleCount(visibleCount, locale)} {t("winesLabel")} · {formatBottleCount(filteredWineBottleCount, locale)} {t("bottles").toLowerCase()}</>
                  : activeView === "cellar" && visibleCount === activeWineCollection.length
                    ? <>{formatBottleCount(visibleCount, locale)} {visibleCount === 1 ? (locale === "it" ? "vino" : "wine") : t("winesLabel")} · {formatBottleCount(filteredWineBottleCount, locale)} {t("bottles").toLowerCase()}</>
                  : <>{visibleCount} / {
                  activeView === "history" && historySection === "tastings"
                    ? tastingArchiveTotalCount
                    : isWineCollectionView
                      ? activeWineCollection.length
                      : wishlist.length
                  } {t("records")}</>}
              </span>
              {activeView === "cellar" ? (
                <button
                  type="button"
                  className="mobile-cellar-filter-trigger"
                  aria-controls="cellar-advanced-filters"
                  onClick={() => {
                    const panel = filterPanelRef.current;
                    if (!panel) return;
                    if (panel.hasAttribute("open")) panel.removeAttribute("open");
                    else panel.setAttribute("open", "");
                  }}
                >
                  <AppIcon name="filter" />
                  <span className="cellar-filter-trigger-label-short">{locale === "it" ? "Filtri" : "Filters"}</span>
                  <span className="cellar-filter-trigger-label-wide">{locale === "it" ? "Ricerca e filtri" : "Search and filters"}</span>
                  {activeCollectionFilterChips.length ? <small>{activeCollectionFilterChips.length}</small> : null}
                </button>
              ) : null}
              {activeView === "cellar" ? (
                <button type="button" className="desktop-cellar-add-button" onClick={chooseAddWine} disabled={!canWriteWine}>
                  {t("addWine")}<span aria-hidden="true">+</span>
                </button>
              ) : null}
            </div> : null}
            {activeView === "history" && historySection === "wines" ? <p className="archive-wines-explainer">{locale === "it"
              ? "Qui trovi le schede dei vini con giacenza zero. Una bevuta può riferirsi a un vino ancora in cantina o a una degustazione extra cantina. I vini archiviati senza colore sono nel gruppo «Colore non specificato»."
              : "This view contains wine records with zero bottles in stock. A tasting may refer to wine still in your cellar or to one tasted outside it. Archived wines without a color appear under “Unspecified wine color”."}</p> : null}
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
            {loading || tastingArchiveLoading ? <LoadingState label={t("loadingData")} variant="list" /> : null}
            {!loading && activeView === "cellar" && filteredWines.length === 0 ? (
              <EmptyState
                title={t("noWineMatch")}
                icon="cellar"
                helpSlug="cellar-filters"
                actions={activeCollectionFilterChips.length
                  ? <button type="button" onClick={() => clearFilters("cellar")}>{t("clearFilters")}</button>
                  : canWriteWine ? <button type="button" onClick={chooseAddWine}>{t("addWine")}</button> : null}
              >
                {activeCollectionFilterChips.length
                  ? (locale === "it" ? "Modifica o azzera i filtri per ampliare i risultati." : "Adjust or clear filters to broaden the results.")
                  : (locale === "it" ? "Inizia aggiungendo la prima bottiglia alla tua cantina." : "Start by adding the first bottle to your cellar.")}
              </EmptyState>
            ) : null}
            {!loading && activeView === "history" && historySection === "wines" && filteredWines.length === 0 ? (
              <EmptyState title={t("noHistoryMatch")} icon="calendar" helpSlug="consumption" actions={activeCollectionFilterChips.length ? <button type="button" onClick={() => clearFilters("history")}>{t("clearFilters")}</button> : null}>
                {locale === "it" ? "Le degustazioni archiviate compariranno qui quando saranno disponibili." : "Archived tastings will appear here when available."}
              </EmptyState>
            ) : null}
            {!loading && !tastingArchiveLoading && activeView === "history" && historySection === "tastings" && visibleTastingEntries.length === 0 ? (
              <EmptyState title={t("noTastingArchiveMatch")} icon="glass-sparkle" helpSlug="consumption" actions={activeCollectionFilterChips.length ? <button type="button" onClick={() => clearFilters("history")}>{t("clearFilters")}</button> : null}>
                {locale === "it" ? "Registra una degustazione dal dettaglio vino per costruire il tuo archivio." : "Record a tasting from wine details to build your archive."}
              </EmptyState>
            ) : null}
            {!loading && activeView === "wishlist" && filteredWishlist.length === 0 ? (
              <EmptyState title={t("noWishlistMatch")} icon="wishlist" helpSlug="wishlist" actions={activeCollectionFilterChips.length ? <button type="button" onClick={() => clearFilters("wishlist")}>{t("clearFilters")}</button> : canWriteWine ? <button type="button" onClick={startAddWishlistItem}>{t("addWishlist")}</button> : null}>
                {locale === "it" ? "Salva qui i vini da valutare o acquistare in futuro." : "Save wines here to evaluate or purchase later."}
              </EmptyState>
            ) : null}
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
                    canGenerateAi={canGenerateAi}
                    canWrite={canWriteWine}
                    canOpenWine={(wineId) => wines.some((wine) => wine.id === wineId)}
                    displayValue={displayValue}
                    entries={visibleTastingEntries}
                    formatAiBudget={formatAiBudget}
                    saving={saving}
                    t={t}
                    locale={locale}
                    onOpenWine={openWineFromTastingArchive}
                    onGenerateReflection={generateTastingReflection}
                    onUpdateEntry={updateTastingArchiveEntry}
                    onDeleteEntry={deleteTastingArchiveEntry}
                    wineTone={wineTone}
                  />
                </Suspense>
                {isMobileViewport && selectedVisibleWine && !wineFormOpen && !wineDetailExpanded ? (
                  <div className="mobile-inline-detail" role="dialog" aria-modal="true" aria-label={selectedVisibleWine.name} onClick={closeMobileWineDetail}>
                    <div className="mobile-detail-sheet" onClick={(event) => event.stopPropagation()}>
                      <div className="mobile-detail-sheet-head">
                        <div>
                          <strong>{selectedVisibleWine.name}</strong>
                          <span>{[selectedVisibleWine.producer, selectedVisibleWine.vintage].filter(Boolean).join(" - ")}</span>
                        </div>
                        <button type="button" className="mobile-detail-close-button" aria-label={t("close")} title={t("close")} onClick={closeMobileWineDetail}>
                          ×
                        </button>
                      </div>
                      {renderWineDetail(selectedVisibleWine)}
                    </div>
                  </div>
                ) : null}
              </>
            ) : null}
            {isWineCollectionView && !(activeView === "history" && historySection === "tastings") && groupedFilteredWines.length ? (
              <div className="wine-tone-groups">
                <div className={`list-header list-header-inline wine-grouping-header${activeView === "cellar" ? " cellar-wine-grouping-header" : ""}`}>
                  <strong>{activeView === "cellar"
                    ? (locale === "it" ? "Raggruppati per" : "Grouped by")
                    : wineGroupingMode === "color"
                      ? t("groupedByColor")
                      : (locale === "it" ? "Raggruppati per regione" : "Grouped by region")}</strong>
                  <div className="wine-grouping-switch" role="group" aria-label={locale === "it" ? "Raggruppamento vini" : "Wine grouping"}>
                    <button type="button" className={wineGroupingMode === "color" ? "active" : ""} aria-pressed={wineGroupingMode === "color"} onClick={() => setWineGroupingMode("color")}>
                      {locale === "it" ? "Colore" : "Color"}
                    </button>
                    <button type="button" className={wineGroupingMode === "region" ? "active" : ""} aria-pressed={wineGroupingMode === "region"} onClick={() => setWineGroupingMode("region")}>
                      {locale === "it" ? "Regione" : "Region"}
                    </button>
                  </div>
                </div>
                {activeView === "cellar" ? <div
                  ref={wineCategoryRailRef}
                  className="wine-category-rail"
                  role="tablist"
                  aria-label={wineGroupingMode === "color" ? t("groupedByColor") : (locale === "it" ? "Regioni" : "Regions")}
                  onPointerDown={(event) => {
                    if (event.button !== 0) return;
                    const rail = event.currentTarget;
                    const drag = wineCategoryDragRef.current;
                    drag.pointerId = event.pointerId;
                    drag.startX = event.clientX;
                    drag.startScrollLeft = rail.scrollLeft;
                    drag.moved = false;
                  }}
                  onPointerMove={(event) => {
                    const drag = wineCategoryDragRef.current;
                    if (drag.pointerId !== event.pointerId) return;
                    const distance = event.clientX - drag.startX;
                    if (Math.abs(distance) < 4 && !drag.moved) return;
                    drag.moved = true;
                    if (!event.currentTarget.hasPointerCapture(event.pointerId)) {
                      event.currentTarget.setPointerCapture(event.pointerId);
                    }
                    event.preventDefault();
                    event.currentTarget.classList.add("is-dragging");
                    event.currentTarget.scrollLeft = drag.startScrollLeft - distance;
                  }}
                  onPointerUp={(event) => {
                    const drag = wineCategoryDragRef.current;
                    if (drag.pointerId !== event.pointerId) return;
                    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
                    event.currentTarget.classList.remove("is-dragging");
                    drag.pointerId = -1;
                  }}
                  onPointerCancel={(event) => {
                    const drag = wineCategoryDragRef.current;
                    if (drag.pointerId !== event.pointerId) return;
                    event.currentTarget.classList.remove("is-dragging");
                    drag.pointerId = -1;
                    drag.moved = false;
                  }}
                  onClickCapture={(event) => {
                    const drag = wineCategoryDragRef.current;
                    if (!drag.moved) return;
                    event.preventDefault();
                    event.stopPropagation();
                    drag.moved = false;
                  }}
                >
                  <button type="button" role="tab" className={wineGroupSelection === "all" ? "active" : ""} aria-selected={wineGroupSelection === "all"} onClick={() => setWineGroupSelection("all")}>
                    <span className="wine-category-name">{locale === "it" ? "Tutti" : "All"}</span>
                    <small>{formatBottleCount(filteredWines.length, locale)}</small>
                  </button>
                  {groupedFilteredWines.map((group) => (
                    <button type="button" role="tab" key={group.key} className={wineGroupSelection === group.key ? "active" : ""} aria-selected={wineGroupSelection === group.key} onClick={() => setWineGroupSelection(group.key)}>
                      <i className={`wine-dot tone-${group.tone}`} aria-hidden="true" />
                      <span>
                        <span className="wine-category-name">{group.label}</span>
                        <small>{formatBottleCount(group.wineCount, locale)} {t("winesLabel")} · {formatBottleCount(group.bottleCount, locale)} {t("bottles").toLowerCase()}</small>
                      </span>
                    </button>
                  ))}
                </div> : null}
                {visibleWineGroups.map((group) => (
                  <section
                    className={activeView === "cellar"
                      ? "wine-tone-group wine-category-results open"
                      : `wine-tone-group${wineGroupingMode === "color" ? ` tone-${group.tone}` : " wine-region-group"}${openWineToneGroups[group.key] ? " open" : ""}`}
                    key={group.key}
                  >
                    <button
                      type="button"
                      className="wine-tone-group-toggle"
                      aria-expanded={Boolean(openWineToneGroups[group.key])}
                      onClick={() => setOpenWineToneGroups((current) => ({ ...current, [group.key]: !current[group.key] }))}
                    >
                      <span className={wineGroupingMode === "color" ? `wine-tone-pill tone-${group.tone}` : "wine-tone-pill wine-region-pill"}>{group.label}</span>
                      <span className="wine-tone-group-summary">
                        {formatBottleCount(group.wineCount, locale)} {group.wineCount === 1 ? (locale === "it" ? "vino" : "wine") : t("winesLabel")}{activeView === "history" ? null : <> • {formatBottleCount(group.bottleCount, locale)} {t("bottles").toLowerCase()}</>}
                      </span>
                      <span className="wine-tone-group-chevron" aria-hidden="true">›</span>
                    </button>
                    {activeView === "cellar" || openWineToneGroups[group.key] ? group.items.slice(0, wineToneRenderLimits[group.key] || WINE_TONE_PAGE_SIZE).map((wine) => (
              <div
                className="list-item-block"
                key={wine.id}
                data-wine-row-id={wine.id}
                data-sommelier-wine-id={activeView === "cellar" && isSommelierSpotlightWine(wine) ? wine.id : undefined}
              >
                <article className={`${selectedWineId === wine.id ? "wine-row selected" : "wine-row"}${isMobileViewport ? " wine-row--mobile" : ""}${activeView === "cellar" || (canAccessWinePhotos && wine.photo_thumbnail_url) ? " has-bottle-photo" : ""}${activeView === "cellar" && !(canAccessWinePhotos && wine.photo_thumbnail_url) ? " has-bottle-placeholder" : ""} tone-${wineTone(wine.type)}`} onClick={(event) => { if (!isInteractiveRowClick(event)) toggleSelectedWine(wine); }}>
                  {canAccessWinePhotos && wine.photo_thumbnail_url ? (
                    <img className="wine-row-bottle-photo" src={wine.photo_thumbnail_url} alt="" loading="lazy" />
                  ) : activeView === "cellar" ? (
                    <div className="wine-row-bottle-photo wine-row-bottle-placeholder">
                      <KeyPositionBottleVisual photoUrl="" tone={wineTone(wine.type)} />
                    </div>
                  ) : null}
                  <div className="wine-row-main">
                    <h3>
                      <i className={`wine-dot tone-${wineTone(wine.type)}`} />
                      <span className="wine-title-row">
                        <span className="wine-title">{wine.name}</span>
                        {wine.vintage ? <span className="vintage-label vintage-label--small"><span>{wine.vintage}</span></span> : null}
                      </span>
                    </h3>
                    <p className="row-primary">
                      <span className="wine-producer">{wine.producer || t("noProducer")}</span>
                      <span className="wine-quantity">{wineQuantityLabel(wine, session, t("bottles").toLowerCase(), locale, isRestaurant)}</span>
                      {activeView === "history" ? null : <WineStatusBadge status={wine.status} locale={locale} compact />}
                      {activeView === "cellar" ? null : renderWineRowChips(wine)}
                    </p>
                    <p className="row-secondary">
                      {(activeView === "cellar"
                        // The glass and dot already show the type; the standard bottle needs no mention.
                        ? [wine.format && wine.format !== "750ml" ? displayValue(wine.format, locale, "format") : "", wine.region, wine.appellation]
                        : [displayValue(wine.format, locale, "format"), displayValue(wine.type, locale, "type"), wine.region, wine.appellation])
                        .filter(Boolean)
                        .map((value, index) => <span key={`${value}-${index}`}>{value}</span>)}
                    </p>
                    {wine.rating || wine.tags.length || wine.scores.length ? (
                      <div className="row-meta-stack">
                        {wine.rating || wine.tags.length ? (
                          <div className="row-meta-group row-meta-group-primary">
                            {wine.rating ? <span className="row-chip row-rating-chip"><StarRating value={wine.rating} label={t("rating")} /></span> : null}
                            <TasteHearts wineId={wine.id} locale={locale} compact className="row-chip row-taste-chip" />
                            {wine.tags.slice(0, 3).map((tag) => <span className="row-chip row-tag-chip" key={tag} style={tagColorStyle(tag, userTags)}>{tag}</span>)}
                          </div>
                        ) : null}
                        {wine.scores.length ? (
                          <div className="row-meta-group row-meta-group-secondary">
                            {wine.scores.filter(score => score.verification_status !== "unverified").slice(0, 3).map((score) => <span className="row-chip row-score-chip" key={`${score.critic}-${score.score}`}>{score.critic} {score.score}</span>)}
                          </div>
                        ) : null}
                      </div>
                    ) : null}
                    {!wine.rating && !wine.tags.length ? <TasteHearts wineId={wine.id} locale={locale} compact className="row-chip row-taste-chip" /> : null}
                    {activeView === "cellar" && (wine.storage_allocations?.length || isSommelierSpotlightWine(wine)) ? (
                      // Interactive chips sit at the end so a tap on the middle of the row opens the wine.
                      <p className="row-chips">{renderWineRowChips(wine)}</p>
                    ) : null}
                    {maturityFilter && isWineInExplicitIdealWindow(wine, maturityFilter.year) ? (
                      <div className="row-meta-stack">
                        <div className="row-meta-group row-meta-group-secondary">
                          <span className="row-chip row-maturity-chip">{t("peakYear")} {maturityFilter.year}</span>
                        </div>
                      </div>
                    ) : null}
                  </div>
                  <DrinkWindowMini wine={wine} locale={locale} />
                  <div className="row-price-block" aria-label={isRestaurant
                    ? `${locale === "it" ? "Prezzo di vendita" : "Sale price"}, ${locale === "it" ? "Valore a listino" : "List value"}`
                    : `${locale === "it" ? "Per bottiglia" : "Per bottle"}, ${locale === "it" ? "Totale" : "Total"}`}>
                    <div>
                      <span>{isRestaurant ? (locale === "it" ? "Prezzo di vendita" : "Sale price") : (locale === "it" ? "Per bottiglia" : "Per bottle")}</span>
                      <strong>{isRestaurant
                        ? wine.sale_price ? formatMoney(wine.sale_price, wine.currency, locale) : t("notSpecified")
                        : formatMoney(wine.current_value || wine.price, wine.currency, locale)}</strong>
                    </div>
                    <div>
                      <span>{isRestaurant ? (locale === "it" ? "Valore a listino" : "List value") : (locale === "it" ? "Totale" : "Total")}</span>
                      <strong>{isRestaurant
                        ? wine.sale_price
                          ? formatMoney(Number(wine.sale_price) * Math.max(Number(wine.quantity || 0), 0), wine.currency, locale)
                          : t("notSpecified")
                        : formatMoney(wineUnitValue(wine) * Math.max(Number(wine.quantity || 0), 0), wine.currency, locale)}</strong>
                    </div>
                  </div>
                  <div className="row-actions">
                    {canGenerateAi ? (
                      <button type="button" className="secondary" onClick={(event) => { event.stopPropagation(); openDishPairingForWine(wine); }}>
                        <AppIcon name="glass-sparkle" variant="ai" />
                        <span className="action-label">{t("pairing")}</span>
                      </button>
                    ) : null}
                    {isRestaurant ? <button type="button" className="secondary" disabled={!canWriteWine || wine.quantity <= 0} onClick={(event) => { event.stopPropagation(); openWineSalePanel(wine); }}>
                      <span className="action-icon" aria-hidden="true">−1</span>
                      <span className="action-label">{locale === "it" ? "Venduta" : "Sold"}</span>
                    </button> : <button type="button" className={compareWineIds.includes(wine.id) ? "" : "secondary"} onClick={(event) => { event.stopPropagation(); toggleCompareWine(wine); }}>
                      <span className="action-icon" aria-hidden="true">{appActionSvgIcon("compare")}</span>
                      <span className="action-label">{t("compare")}</span>
                    </button>}
                    <button type="button" className="secondary" disabled={!canWriteWine} onClick={(event) => { event.stopPropagation(); startEditWine(wine); }}>
                      <span className="action-icon" aria-hidden="true">{appActionSvgIcon("edit")}</span>
                      <span className="action-label">{t("edit")}</span>
                    </button>
                  </div>
                </article>
                {selectedWineId === wine.id && !wineFormOpen ? (
                  <div className="mobile-inline-detail" role="dialog" aria-modal="true" aria-label={wine.name} onClick={closeMobileWineDetail}>
                    <div className="mobile-detail-sheet" onClick={(event) => event.stopPropagation()}>
                      <div className="mobile-detail-sheet-head">
                        <div>
                          <strong>{wine.name}</strong>
                          <span>{[wine.producer, wine.vintage].filter(Boolean).join(" - ")}</span>
                        </div>
                        <button type="button" className="mobile-detail-close-button" aria-label={t("close")} title={t("close")} onClick={closeMobileWineDetail}>
                          ×
                        </button>
                      </div>
                      {renderWineDetail(wine)}
                      <nav className="mobile-wine-actions" aria-label={locale === "it" ? "Azioni vino" : "Wine actions"}>
                        {canGenerateAi ? (
                          <button type="button" className="secondary" onClick={() => openDishPairingForWine(wine)}>
                            <AppIcon name="glass-sparkle" variant="ai" />
                            <span>{t("pairing")}</span>
                          </button>
                        ) : null}
                        {!isRestaurant ? <button type="button" className={compareWineIds.includes(wine.id) ? "" : "secondary"} aria-pressed={compareWineIds.includes(wine.id)} onClick={() => toggleCompareWine(wine)}>
                          <span className="action-icon" aria-hidden="true">{appActionSvgIcon("compare")}</span>
                          <span>{t("compare")}</span>
                        </button> : null}
                        <button type="button" className="secondary" disabled={!canWriteWine} onClick={() => startEditWine(wine)}>
                          <AppIcon name="edit" />
                          <span>{t("edit")}</span>
                        </button>
                      </nav>
                    </div>
                  </div>
                ) : null}
              </div>
                    )) : null}
                    {(activeView === "cellar" || openWineToneGroups[group.key]) && group.items.length > (wineToneRenderLimits[group.key] || WINE_TONE_PAGE_SIZE) ? (
                      <button
                        type="button"
                        className="secondary wine-tone-load-more"
                        onClick={() => setWineToneRenderLimits((current) => ({
                          ...current,
                          [group.key]: (current[group.key] || WINE_TONE_PAGE_SIZE) + WINE_TONE_PAGE_SIZE,
                        }))}
                      >
                        {locale === "it"
                          ? `Mostra altri ${Math.min(WINE_TONE_PAGE_SIZE, group.items.length - (wineToneRenderLimits[group.key] || WINE_TONE_PAGE_SIZE))} vini`
                          : `Show ${Math.min(WINE_TONE_PAGE_SIZE, group.items.length - (wineToneRenderLimits[group.key] || WINE_TONE_PAGE_SIZE))} more wines`}
                      </button>
                    ) : null}
                  </section>
                ))}
              </div>
            ) : null}
            {activeView === "wishlist" ? filteredWishlist.map((item) => {
              const targetPriceValue = formatMoney(item.target_price, item.currency, locale);
              const offerPriceValue = item.offer_price ? formatMoney(item.offer_price, item.currency, locale) : "";
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
                    {offerPriceValue ? (
                      <div className="wishlist-target-price">
                        <span>{locale === "it" ? "Prezzo offerto" : "Offer price"}</span>
                        <strong className="wishlist-price">{offerPriceValue}</strong>
                      </div>
                    ) : null}
                    <div className="wishlist-target-price">
                      <span>{locale === "it" ? "Prezzo massimo" : "Maximum price"}</span>
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
                    <button type="button" className="wishlist-action-button" disabled={!canWriteWine || saving} onClick={(event) => { event.stopPropagation(); startWishlistConversion(item); }} aria-label={t("convert")} title={t("convert")}>
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
                        canWrite={canWriteWine}
                        saving={saving}
                        onRecordTasting={(payload) => recordWishlistTasting(item, payload)}
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
              <div>
                <p className="eyebrow">{t("settings")}</p>
                <h2>{t("personalSettings")}</h2>
              </div>
              <button type="button" className="secondary settings-exit-button" onClick={toggleSettingsView}>
                <AppIcon name="chevron-left" variant="navigation" />
                {t("backToApp")}
              </button>
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
                    loadSettingsTabData(tab);
                  }}
                >
                  {settingsTabLabels[tab]}
                </button>
              ))}
            </div>

            <div className="settings-grid">
              {settingsTab === "restaurant" && isRestaurant ? (
                <section className="settings-card settings-card-wide restaurant-service-settings">
                  <div className="settings-card-heading">
                    <div>
                      <span>{locale === "it" ? "Servizio al calice" : "Wine by the glass"}</span>
                      <h3>{locale === "it" ? "Resa commerciale" : "Commercial yield"}</h3>
                    </div>
                    <AppIcon name="glass-sparkle" variant="feature" tone="accent" size="1.5rem" />
                  </div>
                  <p className="settings-card-intro">
                    {locale === "it"
                      ? "Definisci la mescita iniziale dei nuovi vini e lo sfrido medio per assaggi, fondo bottiglia e servizio."
                      : "Set the initial pour for new wines and the average service loss from tasting, sediment and service."}
                  </p>
                  <form className="restaurant-yield-form" onSubmit={updateRestaurantSettings}>
                    <div className="form-row restaurant-settings-fields">
                      <label>
                        <span>{locale === "it" ? "Mescita standard (dl)" : "Default pour (dl)"}</span>
                        <input
                          type="number"
                          min="0.25"
                          max="5"
                          step="0.05"
                          value={restaurantSettingsDraft.defaultPourDl}
                          disabled={!canAdmin || saving}
                          onChange={(event) => setRestaurantSettingsDraft((current) => ({ ...current, defaultPourDl: event.target.value }))}
                        />
                        <small>{locale === "it" ? "Applicata ai nuovi vini; resta modificabile nella singola scheda." : "Applied to new wines; it can still be changed on each wine."}</small>
                      </label>
                      <label>
                        <span>{locale === "it" ? "Sfrido per bottiglia standard (ml)" : "Loss per standard bottle (ml)"}</span>
                        <input
                          type="number"
                          min="0"
                          max="250"
                          step="5"
                          value={restaurantSettingsDraft.serviceLossMl}
                          disabled={!canAdmin || saving}
                          onChange={(event) => setRestaurantSettingsDraft((current) => ({ ...current, serviceLossMl: event.target.value }))}
                        />
                        <small>{locale === "it" ? "Sugli altri formati viene proporzionato automaticamente." : "It is scaled automatically for other bottle formats."}</small>
                      </label>
                      <label>
                        <span>{locale === "it" ? "Soglia di riordino predefinita" : "Default reorder threshold"}</span>
                        <input
                          type="number"
                          min="0"
                          max="10000"
                          step="1"
                          value={restaurantSettingsDraft.reorderThreshold}
                          disabled={!canAdmin || saving}
                          onChange={(event) => setRestaurantSettingsDraft((current) => ({ ...current, reorderThreshold: event.target.value }))}
                        />
                        <small>{locale === "it" ? "Applicata ai nuovi vini; resta modificabile nella singola scheda." : "Applied to new wines; it can still be changed on each wine."}</small>
                      </label>
                    </div>
                    <aside className="restaurant-yield-preview" aria-live="polite">
                      <span>{locale === "it" ? "Bottiglia standard · 750 ml" : "Standard bottle · 750 ml"}</span>
                      <strong>
                        {restaurantStandardGlassCount} {locale === "it"
                          ? restaurantStandardGlassCount === 1 ? "calice" : "calici"
                          : restaurantStandardGlassCount === 1 ? "glass" : "glasses"}
                      </strong>
                      <small>
                        {locale === "it"
                          ? `${restaurantStandardYieldMl} ml vendibili a ${(restaurantDefaultPourMl / 100).toLocaleString(locale)} dl${restaurantStandardRemainderMl ? ` · residuo ${restaurantStandardRemainderMl} ml` : " · resa esatta"}`
                          : `${restaurantStandardYieldMl} ml saleable at ${(restaurantDefaultPourMl / 100).toLocaleString(locale)} dl${restaurantStandardRemainderMl ? ` · ${restaurantStandardRemainderMl} ml remainder` : " · exact yield"}`}
                      </small>
                    </aside>
                    <div className="form-actions">
                      <button type="submit" disabled={!canAdmin || saving || restaurantStandardGlassCount < 1}>
                        {saving ? t("saving") : t("saveSettings")}
                      </button>
                    </div>
                  </form>
                  {!canAdmin ? <p className="empty-state">{t("viewerReadOnly")}</p> : null}
                </section>
              ) : null}

              {settingsTab === "profile" ? (
                <Suspense fallback={null}>
                  <ProfileSettingsTab
                    locale={locale}
                    session={session}
                    setSession={setSession}
                    saving={saving}
                    offlineMode={offlineMode}
                    setNotice={setNotice}
                    setError={setError}
                    changeLocale={changeLocale}
                    themePreference={themePreference}
                    changeTheme={changeTheme}
                    tabletDevice={tabletDevice}
                    tabletDesktopMode={tabletDesktopMode}
                    chooseTabletLayout={chooseTabletLayout}
                    primaryDashboardFocus={primaryDashboardFocus}
                    changePrimaryDashboardFocus={changePrimaryDashboardFocus}
                    setOnboardingMode={setOnboardingMode}
                    dailyWineBudgetDraft={dailyWineBudgetDraft}
                    setDailyWineBudgetDraft={setDailyWineBudgetDraft}
                    saveDailyWineBudget={saveDailyWineBudget}
                    subscriptionFocusPending={subscriptionFocusPending}
                    onSubscriptionFocused={() => setSubscriptionFocusPending(false)}
                    billingStatus={billingStatus}
                    showAiBudgetPanel={showAiBudgetPanel}
                    startCheckout={startCheckout}
                    startBillingPortal={startBillingPortal}
                    trialRedeemCodes={trialRedeemCodes}
                    standardRedeemCodes={standardRedeemCodes}
                    renderRedeemCodeRow={renderRedeemCodeRow}
                    redeemInput={redeemInput}
                    setRedeemInput={setRedeemInput}
                    redeemCode={redeemCode}
                    freeTierLabelCount={freeTierLabelCount}
                    freeTierLabelLimit={freeTierLabelLimit}
                    freeTierAtLabelLimit={freeTierAtLabelLimit}
                    passkeys={passkeys}
                    passkeyName={passkeyName}
                    setPasskeyName={setPasskeyName}
                    passkeyHelpOpen={passkeyHelpOpen}
                    setPasskeyHelpOpen={setPasskeyHelpOpen}
                    registerPasskey={registerPasskey}
                    deletePasskey={deletePasskey}
                    accountDeletionEmail={accountDeletionEmail}
                    setAccountDeletionEmail={setAccountDeletionEmail}
                    accountDeletionPassword={accountDeletionPassword}
                    setAccountDeletionPassword={setAccountDeletionPassword}
                    deleteOwnAccount={deleteOwnAccount}
                  />
                </Suspense>
              ) : null}

              {settingsTab === "ai" && canWriteWine ? (
                <Suspense fallback={null}>
                  <AiSettingsTab
                    locale={locale}
                    aiSettings={aiSettings}
                    aiSettingsDraft={aiSettingsDraft}
                    setAiSettingsDraft={setAiSettingsDraft}
                    showAiBudgetPanel={showAiBudgetPanel}
                    canPurchaseAiCredits={Boolean(billingStatus?.can_purchase_ai_credits)}
                    onBuyAiCredits={() => startCheckout("ai_credits")}
                    saving={saving}
                    onSubmit={submitAiSettings}
                    aiUsage={aiUsage}
                    aiAudit={aiAudit}
                    aiEntityName={aiEntityName}
                  />
                </Suspense>
              ) : null}

              {settingsTab === "storage" ? (
                <CellarStorageManager locale={locale} canWrite={canWriteWine} />
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
                <Suspense fallback={null}>
                  <SharingSettingsTab
                    locale={locale}
                    session={session}
                    saving={saving}
                    canAdmin={canAdmin}
                    householdNameDraft={householdNameDraft}
                    setHouseholdNameDraft={setHouseholdNameDraft}
                    updateHouseholdName={updateHouseholdName}
                    restaurantModeAvailable={restaurantModeAvailable}
                    updateHouseholdMode={updateHouseholdMode}
                    hasAnotherRestaurantCellar={hasAnotherRestaurantCellar}
                    createHousehold={createHousehold}
                    newHouseholdNameDraft={newHouseholdNameDraft}
                    setNewHouseholdNameDraft={setNewHouseholdNameDraft}
                    deleteHouseholdConfirmDraft={deleteHouseholdConfirmDraft}
                    setDeleteHouseholdConfirmDraft={setDeleteHouseholdConfirmDraft}
                    householdMemberships={householdMemberships}
                    deleteActiveHousehold={deleteActiveHousehold}
                    members={members}
                    updateMemberRole={updateMemberRole}
                    updateMemberVisibility={updateMemberVisibility}
                    removeMember={removeMember}
                    currentUserEmail={currentUserEmail}
                    coOwnershipLibraryVisible={coOwnershipLibraryVisible}
                    setCoOwnershipLibraryVisible={setCoOwnershipLibraryVisible}
                    myCoOwnershipAgreements={myCoOwnershipAgreements}
                    coOwnershipAgreementFocusId={coOwnershipAgreementFocusId}
                    shareOffers={shareOffers}
                    decideShareOffer={decideShareOffer}
                    createInvite={createInvite}
                    inviteDraft={inviteDraft}
                    setInviteDraft={setInviteDraft}
                    inviteToken={inviteToken}
                    generatedInviteLink={generatedInviteLink}
                    invites={invites}
                    revokeInvite={revokeInvite}
                    acceptInvite={acceptInvite}
                    acceptToken={acceptToken}
                    setAcceptToken={setAcceptToken}
                    receivedInvites={receivedInvites}
                    respondToReceivedInvite={respondToReceivedInvite}
                  />
                </Suspense>
              ) : null}

              {settingsTab === "users" && canAppAdmin ? (
                <Suspense fallback={<LoadingState label={t("loadingData")} compact />}>
                  <AdminUsersWorkspace
                    activeRedeemCodesCount={activeRedeemCodesCount}
                    adminUserQuery={adminUserQuery}
                    adminUserStatusFilter={adminUserStatusFilter}
                    appUsers={appUsers}
                    filteredAdminUsers={filteredAdminUsers}
                    generatedRedeemCode={generatedRedeemCode}
                    locale={locale}
                    redeemCodeDraft={redeemCodeDraft}
                    redeemCodes={redeemCodes}
                    saving={saving}
                    selectedAdminUser={selectedAdminUser}
                    selectedAdminUserId={selectedAdminUserId}
                    userAccessDaysDrafts={userAccessDaysDrafts}
                    userAiBalanceDrafts={userAiBalanceDrafts}
                    userAiNoteDrafts={userAiNoteDrafts}
                    t={t}
                    setError={setError}
                    setAdminUserQuery={setAdminUserQuery}
                    setAdminUserStatusFilter={setAdminUserStatusFilter}
                    setRedeemCodeDraft={setRedeemCodeDraft}
                    setSelectedAdminUserId={setSelectedAdminUserId}
                    setUserAccessDaysDrafts={setUserAccessDaysDrafts}
                    setUserAiBalanceDrafts={setUserAiBalanceDrafts}
                    setUserAiNoteDrafts={setUserAiNoteDrafts}
                    approveUser={approveUser}
                    createRedeemCode={createRedeemCode}
                    deleteAppUser={deleteAppUser}
                    deleteRedeemCode={deleteRedeemCode}
                    loadAppUsers={loadAppUsers}
                    loadBilling={loadBilling}
                    loadSingleAppUserStats={loadSingleAppUserStats}
                    rejectUser={rejectUser}
                    toggleAppAdmin={toggleAppAdmin}
                    toggleLabelRecognition={toggleLabelRecognition}
                    toggleRestaurantModeAccess={toggleRestaurantModeAccess}
                    toggleUserBlocked={toggleUserBlocked}
                    toggleWinePhotoAccess={toggleWinePhotoAccess}
                    updateUserAccessDays={updateUserAccessDays}
                    updateUserAiCreditBalance={updateUserAiCreditBalance}
                    updateUserAmbassador={updateUserAmbassador}
                  />
                </Suspense>
              ) : null}

              {settingsTab === "operations" && canAppAdmin ? (
                <>
                  <Suspense fallback={<LoadingState label={locale === "it" ? "Caricamento operatività…" : "Loading operations…"} />}>
                    <OperationsPanel locale={locale} overview={operationsOverview} activity={userActivity} onRefresh={loadOperationsMetrics} sensoryProfiles={<AdminSensoryProfilesPanel locale={locale} />} catalogPendingCount={pendingCatalogEntries.length} catalogManagement={
                      <AdminCatalogPanel
                        locale={locale}
                        saving={saving}
                        canWriteWine={canWriteWine}
                        pendingEntries={pendingCatalogEntries}
                        onReloadPending={() => loadPendingCatalogEntries(true).catch((nextError) => setError(nextError instanceof Error ? nextError.message : "Unable to load catalog entries"))}
                        onRecovered={async () => { await Promise.all([loadPendingCatalogEntries(), searchCatalogAdminEntries()]); }}
                        query={catalogAdminQuery}
                        onQueryChange={setCatalogAdminQuery}
                        onSearch={() => { searchCatalogAdminEntries().catch((nextError) => setError(nextError instanceof Error ? nextError.message : "Unable to search catalog")); }}
                        results={catalogAdminResults}
                        onApprove={approveCatalogEntry}
                        onDelete={deleteCatalogEntry}
                        onMetadataSaved={catalogMetadataSaved}
                      />
                    } />
                  </Suspense>
                </>
              ) : null}

              {settingsTab === "photos" && canAppAdmin ? (
                <Suspense fallback={<LoadingState label={locale === "it" ? "Caricamento fotografie…" : "Loading photographs…"} />}>
                  <AdminPhotosPanel locale={locale} />
                </Suspense>
              ) : null}

              {settingsTab === "announcements" && canAppAdmin && !session?.is_demo ? (
                <Suspense fallback={<LoadingState label={locale === "it" ? "Caricamento comunicazioni…" : "Loading announcements…"} />}>
                  <AdminAnnouncementsPanel locale={locale} />
                </Suspense>
              ) : null}

              {settingsTab === "data" && canAdmin ? (
                <Suspense fallback={null}>
                  <DataSettingsTab
                    locale={locale}
                    session={session}
                    saving={saving}
                    importCellarTrackerFile={importCellarTrackerFile}
                    importLegacyFile={importLegacyFile}
                    importMode={importMode}
                    setImportMode={setImportMode}
                    importPreview={importPreview}
                    importFileName={importFileName}
                    importResult={importResult}
                    exportBlocks={exportBlocks}
                    importSelection={importSelection}
                    setImportSelection={setImportSelection}
                    importPayload={importPayload}
                    cellarTrackerCsvText={cellarTrackerCsvText}
                    runLegacyImport={runLegacyImport}
                    exportSelection={exportSelection}
                    toggleExportSelection={toggleExportSelection}
                    hasSelectedExportBlock={hasSelectedExportBlock}
                    exportJson={exportJson}
                    emptyCellar={emptyCellar}
                  />
                </Suspense>
              ) : null}

            </div>
          </section>
          ) : null}
        </section>
      )}
      {renderCellarSommelierLayer()}
      {wishlistConversionItem ? (
        <div className="auth-modal-overlay" onClick={() => !saving && setWishlistConversionItem(null)}>
          <section className="auth-modal-card" role="dialog" aria-modal="true" aria-labelledby="wishlist-conversion-title" onClick={(event) => event.stopPropagation()}>
            <div className="auth-modal-head">
              <div>
                <strong>{locale === "it" ? "Aggiungi alla cantina" : "Add to cellar"}</strong>
                <h2 id="wishlist-conversion-title">{wishlistConversionItem.name}</h2>
              </div>
              <button type="button" className="secondary compact" onClick={() => setWishlistConversionItem(null)} disabled={saving}>{t("cancel")}</button>
            </div>
            <form className="auth-panel" onSubmit={(event) => {
              event.preventDefault();
              const quantity = Number(wishlistConversionQuantity);
              if (Number.isInteger(quantity) && quantity > 0) void convertWishlistItem(wishlistConversionItem, quantity);
            }}>
              <p className="empty-state">{locale === "it" ? "Indica quante bottiglie acquistate vuoi aggiungere alla cantina." : "Choose how many purchased bottles to add to the cellar."}</p>
              <label>
                <span>{t("quantity")}</span>
                <input autoFocus type="number" min="1" step="1" inputMode="numeric" value={wishlistConversionQuantity} onChange={(event) => setWishlistConversionQuantity(event.target.value)} required />
              </label>
              <div className="form-actions">
                <button type="button" className="secondary" onClick={() => setWishlistConversionItem(null)} disabled={saving}>{t("cancel")}</button>
                <button type="submit" disabled={saving || !Number.isInteger(Number(wishlistConversionQuantity)) || Number(wishlistConversionQuantity) < 1}>{saving ? t("saving") : (locale === "it" ? "Aggiungi in cantina" : "Add to cellar")}</button>
              </div>
            </form>
          </section>
        </div>
      ) : null}
      {wineDetailModalWine ? (
        <div
          className="wine-detail-modal-layer"
          role="presentation"
          onClick={(event) => {
            if (event.target === event.currentTarget) closeWineDetailModal();
          }}
        >
          <section className="wine-detail-modal" role="dialog" aria-modal="true" aria-labelledby="wine-detail-modal-title">
            <header className="wine-detail-modal-header">
              <div>
                <span>{t("wineDetail")}</span>
                <h2 id="wine-detail-modal-title">{wineDetailModalWine.name}{wineDetailModalWine.vintage ? ` · ${wineDetailModalWine.vintage}` : ""}</h2>
              </div>
              <button
                type="button"
                className="secondary compact wine-detail-modal-close"
                onClick={closeWineDetailModal}
                aria-label={t("close")}
                title={t("close")}
              >
                <span aria-hidden="true">×</span>
              </button>
            </header>
            <div className="wine-detail-modal-content">
              {renderWineDetail(wineDetailModalWine)}
            </div>
          </section>
        </div>
      ) : null}
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
      {batchAiRun ? <Suspense fallback={null}><BatchAiReport
        run={batchAiRun}
        locale={locale}
        minimized={batchAiMinimized}
        onMinimize={() => setBatchAiMinimized(true)}
        onRestore={() => setBatchAiMinimized(false)}
        onClose={() => { setBatchAiRun(null); setBatchAiMinimized(false); }}
        onStop={() => { batchAiStopRef.current = true; setBatchAiRun((current) => current && { ...current, stopping: true }); }}
        onDetails={(item) => {
          const entry = batchValueEntry(item);
          if (entry) setMarketViewContext({ kind: "wine", wine: item.updated || item.wine, entry });
        }}
      /></Suspense> : null}
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
    </HelpContext.Provider>
  );
}
