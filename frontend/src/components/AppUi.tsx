import { useEffect, useId, useRef, useState } from "react";
import type { ReactNode } from "react";
import { AppIcon } from "./AppIcon";
import "./AiPackUpgradeNotice.css";
import "./AiGenerationOverlay.css";
import { AiGenerationVisual } from "./AiGenerationVisual";
import type { AppIconName } from "./AppIcon";
import { useHelp } from "../help/HelpContext";
import { displayValue } from "../i18n";
import type { TranslationKey } from "../i18n";
import type { AiOverlayProgress, Locale, TastingEnjoyment, Wine } from "../types";

export function WishlistVintageField({ value, onChange, disabled, locale, label, help }: {
  value: string;
  onChange: (value: string) => void;
  disabled: boolean;
  locale: Locale;
  label: string;
  help: string;
}) {
  const missing = !value.trim();
  return <div className="vintage-field">
    <label>
      <span>{label}</span>
      <input value={value} onChange={event => onChange(event.target.value)} disabled={disabled} autoComplete="off" aria-describedby={`wishlist-vintage-help${missing ? " wishlist-vintage-reminder" : ""}`} />
    </label>
    <div className="vintage-quick-choices" role="group" aria-label={help}>
      {(["NV", "MV"] as const).map(vintage => <button key={vintage} type="button" className={`secondary compact vintage-choice${value.trim().toUpperCase() === vintage ? " is-selected" : ""}`} aria-pressed={value.trim().toUpperCase() === vintage} disabled={disabled} onClick={() => onChange(vintage)}>{vintage}</button>)}
    </div>
    <small className="form-hint" id="wishlist-vintage-help">{help}</small>
    {missing ? <div className="wishlist-vintage-reminder" id="wishlist-vintage-reminder" role="status">
      <AppIcon name="calendar" size={18} aria-hidden="true" />
      <span>{locale === "it"
        ? "Se conosci l’annata, inseriscila: serve per cercare il profilo gustativo del vino. Se non la conosci, puoi salvare e aggiungerla in seguito."
        : "If you know the vintage, enter it: it is needed to look up the wine’s taste profile. If you don’t know it, you can save and add it later."}</span>
    </div> : null}
  </div>;
}

export function AiPackUpgradeNotice({ locale, onPurchase, compact = false, onDismiss }: { locale: Locale; onPurchase: () => void; compact?: boolean; onDismiss?: () => void }) {
  const italian = locale === "it";
  return <aside className={`ai-pack-upgrade-notice${compact ? " compact ai-pack-enhancement" : ""}`} role="status" aria-label="AI Pack">
    {compact ? <div className="ai-pack-upgrade-emblem" aria-hidden="true"><AppIcon name="assistant" size={26} /></div> : null}
    <div>
      <span>AI PACK</span>
      <strong>{italian ? (compact ? "Potenzia questa area con l’AI" : "Sblocca questa funzione AI") : (compact ? "Enhance this area with AI" : "Unlock this AI feature")}</strong>
      <p>{italian ? (compact ? "Analisi, valori e suggerimenti AI sono disponibili con un AI Pack Vinaris." : "Con il piano gratuito le analisi AI usano un AI Pack Vinaris. Acquistalo una volta e usa il credito quando ti serve.") : (compact ? "AI analysis, valuations, and suggestions are available with a Vinaris AI Pack." : "On the free tier, AI analyses use a Vinaris AI Pack. Buy once and use the credit when you need it.")}</p>
    </div>
    <div className="ai-pack-upgrade-actions"><button type="button" className={compact ? "ai-pack-explore" : ""} onClick={onPurchase}>{italian ? (compact ? "Scopri AI Pack" : "Acquista AI Pack") : (compact ? "Explore AI Pack" : "Buy AI Pack")}{compact ? <AppIcon name="chevron-right" size={18} /> : null}</button>{onDismiss ? <button type="button" className="ai-pack-upgrade-dismiss" onClick={onDismiss} aria-label={italian ? "Nascondi promemoria AI Pack per sette giorni" : "Hide AI Pack reminder for seven days"}>×</button> : null}</div>
  </aside>;
}
export function DetailField({
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

export function wineStatusTone(status: string) {
  const normalized = status.trim().toLowerCase();
  if (normalized.includes("deliver") || normalized.includes("consegn") || normalized === "in_cellar" || normalized === "in cellar" || normalized === "in cantina") return "delivered";
  if (normalized.includes("collect") || normalized.includes("pickup") || normalized.includes("ritir")) return "pickup";
  if (normalized.includes("shipp") || normalized.includes("spedit")) return "shipped";
  if (normalized.includes("order") || normalized.includes("ordin")) return "ordered";
  return "neutral";
}

export function wineStatusIconName(tone: string): AppIconName {
  const icons: Record<string, AppIconName> = {
    pickup: "status-pickup",
    delivered: "status-delivered",
    shipped: "status-shipped",
    ordered: "status-ordered",
    neutral: "bottle",
  };
  return icons[tone] || "bottle";
}

export function WineStatusBadge({ status, locale, compact = false }: { status: string; locale: Locale; compact?: boolean }) {
  const tone = wineStatusTone(status);
  return (
    <span className={`wine-status-badge wine-status-${tone}${compact ? " compact" : ""}`}>
      <i aria-hidden="true"><AppIcon name={wineStatusIconName(tone)} /></i>
      <strong>{displayValue(status, locale, "status") || status}</strong>
    </span>
  );
}

export function StarRating({ value, label }: { value: number; label: string }) {
  const rating = Math.min(Math.max(Number(value || 0), 0), 6);
  return (
    <span className="star-rating" aria-label={`${label}: ${rating}/6`}>
      {Array.from({ length: 6 }, (_, index) => (
        <span key={index} className={index + 1 <= rating ? "filled" : index < rating ? "half-filled" : ""} aria-hidden="true">★</span>
      ))}
    </span>
  );
}

export function LoadingSpinner({ size = "md" }: { size?: "sm" | "md" }) {
  return (
    <span className={`loading-spinner loading-spinner-${size}`} aria-hidden="true">
      <span />
      <span />
      <span />
    </span>
  );
}

export function notificationBellIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M7 9a5 5 0 1 1 10 0c0 5 2 6 2 6H5s2-1 2-6" />
      <path d="M10 19a2.4 2.4 0 0 0 4 0" />
    </svg>
  );
}

export function settingsGearIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 15.2a3.2 3.2 0 1 0 0-6.4 3.2 3.2 0 0 0 0 6.4Z" />
      <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 0 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 0 1-4 0v-.1a1.7 1.7 0 0 0-1-1.5 1.7 1.7 0 0 0-1.9.3l-.1.1A2 2 0 0 1 4.2 17l.1-.1a1.7 1.7 0 0 0 .3-1.9 1.7 1.7 0 0 0-1.5-1H3a2 2 0 0 1 0-4h.1a1.7 1.7 0 0 0 1.5-1 1.7 1.7 0 0 0-.3-1.9l-.1-.1A2 2 0 0 1 7 4.2l.1.1a1.7 1.7 0 0 0 1.9.3 1.7 1.7 0 0 0 1-1.5V3a2 2 0 0 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.9-.3l.1-.1A2 2 0 0 1 19.8 7l-.1.1a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 1.5 1h.1a2 2 0 0 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z" />
    </svg>
  );
}

export function logoutIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M10 17l5-5-5-5" />
      <path d="M15 12H3" />
      <path d="M21 19V5a2 2 0 0 0-2-2h-5" />
      <path d="M14 21h5a2 2 0 0 0 2-2" />
    </svg>
  );
}

export function LoadingState({ label, compact = false, variant = "inline" }: { label: string; compact?: boolean; variant?: "inline" | "list" | "panel" }) {
  if (variant !== "inline") {
    return (
      <div className={`loading-state loading-state-skeleton loading-state-${variant}${compact ? " compact" : ""}`} role="status" aria-live="polite" aria-label={label}>
        {Array.from({ length: variant === "list" ? 3 : 1 }, (_, index) => (
          <div className="loading-skeleton-card" key={index} aria-hidden="true">
            <i />
            <div><span /><span /><span /></div>
            <strong />
          </div>
        ))}
        <span className="loading-state-label">{label}</span>
      </div>
    );
  }
  return (
    <div className={`loading-state${compact ? " compact" : ""}`} role="status" aria-live="polite">
      <LoadingSpinner size={compact ? "sm" : "md"} />
      <span>{label}</span>
    </div>
  );
}

export function EmptyState({
  title,
  icon = "bottle",
  compact = false,
  children,
  actions,
  helpSlug,
}: {
  title: string;
  icon?: AppIconName;
  compact?: boolean;
  children?: ReactNode;
  actions?: ReactNode;
  helpSlug?: string;
}) {
  const help = useHelp();
  return (
    <div className={`empty-state-panel${compact ? " compact" : ""}`} role="status">
      <i aria-hidden="true"><AppIcon name={icon} variant="premium" tone="accent" detailLevel="rich" /></i>
      <div>
        <strong>{title}</strong>
        {children ? <span className="empty-state-description">{children}</span> : null}
        {actions || (helpSlug && help) ? (
          <div className="empty-state-actions">
            {actions}
            {helpSlug && help ? <button type="button" className="secondary compact empty-state-help" onClick={() => help.openHelp(helpSlug)}>?</button> : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}

export function GlobalLoadingOverlay({ label }: { label: string }) {
  return (
    <div className="global-loading-overlay" role="status" aria-live="polite" aria-busy="true">
      <div className="global-loading-card">
        <div className="global-loading-heading">
          <LoadingSpinner size="md" />
          <div><strong>{label}</strong><span>Vinaris</span></div>
        </div>
        <div className="global-loading-skeleton" aria-hidden="true">
          <i />
          <div><span /><span /><span /></div>
          <div><span /><span /></div>
        </div>
      </div>
    </div>
  );
}

export function aiOverlayMessage(mode: string, t: (key: TranslationKey) => string) {
  if (mode.startsWith("batch-")) return t("aiMagicBatch");
  switch (mode) {
    case "all":
      return t("aiMagicAll");
    case "value":
      return t("aiMagicValue");
    case "drink-window":
      return t("aiMagicDrinkWindow");
    case "grapes":
      return t("aiMagicGrapes");
    case "scores":
      return t("aiMagicScores");
    case "wishlist-strategy":
      return t("aiMagicWishlistStrategy");
    case "wishlist-purpose":
      return t("aiMagicWishlistPurpose");
    case "wishlist-target-price":
      return t("aiMagicWishlistTargetPrice");
    case "wishlist-portfolio-strategy":
      return t("aiMagicPortfolio");
    case "pairing":
      return t("aiMagicPairing");
    case "buying-advice":
      return t("aiMagicBuying");
    case "compare":
      return t("aiMagicCompare");
    case "cellar-intelligence":
      return t("aiMagicCellarIntelligence");
    case "cellar-intelligence-selection":
      return t("aiMagicCellarIntelligenceSelection");
    default:
      return t("aiMagicHint");
  }
}

export function aiOverlayLabel(mode: string, t: (key: TranslationKey) => string) {
  if (mode.startsWith("batch-")) return t("aiMagicLabelBatch");
  switch (mode) {
    case "all":
      return t("aiMagicLabelAll");
    case "value":
      return t("aiMagicLabelValue");
    case "drink-window":
      return t("aiMagicLabelDrinkWindow");
    case "grapes":
      return t("aiMagicLabelGrapes");
    case "scores":
      return t("aiMagicLabelScores");
    case "wishlist-strategy":
      return t("aiMagicLabelWishlistStrategy");
    case "wishlist-purpose":
      return t("aiMagicLabelWishlistPurpose");
    case "wishlist-target-price":
      return t("aiMagicLabelWishlistTargetPrice");
    case "wishlist-portfolio-strategy":
      return t("aiMagicLabelPortfolio");
    case "pairing":
      return t("aiMagicLabelPairing");
    case "buying-advice":
      return t("aiMagicLabelBuying");
    case "compare":
      return t("aiMagicLabelCompare");
    case "cellar-intelligence":
      return t("aiMagicLabelCellarIntelligence");
    case "cellar-intelligence-selection":
      return t("aiMagicLabelCellarIntelligenceSelection");
    default:
      return "Vinaris AI";
  }
}

export function aiOverlayHint(mode: string, t: (key: TranslationKey) => string) {
  return mode === "buying-advice" ? t("aiMagicBuyingHint") : t("aiMagicHint");
}

export function wineProgressName(wine: Pick<Wine, "name" | "vintage">) {
  return [wine.name, wine.vintage].map((part) => part.trim()).filter(Boolean).join(" ");
}

export function aiOverlayProgressText(progress: AiOverlayProgress, locale: Locale) {
  if (!progress?.itemName) return "";
  if (progress.current && progress.total) {
    const count = locale === "it" ? `Vino ${progress.current} di ${progress.total}` : `Wine ${progress.current} of ${progress.total}`;
    return `${count} · ${progress.itemName}`;
  }
  return locale === "it" ? `Vino · ${progress.itemName}` : `Wine · ${progress.itemName}`;
}

export function AiGenerationOverlay({
  mode,
  t,
  locale,
  progress,
}: {
  mode: string;
  t: (key: TranslationKey) => string;
  locale: Locale;
  progress: AiOverlayProgress;
}) {
  const progressText = aiOverlayProgressText(progress, locale);
  return (
    <div className={`ai-generation-overlay${mode ? " is-visible" : " is-leaving"}`} role="status" aria-live="polite" aria-busy="true">
      <div className="ai-generation-brand" aria-hidden="true"><span>VINARIS</span><span>WINE INTELLIGENCE</span></div>
      <AiGenerationVisual />
      <div className="ai-generation-copy">
        <span className="ai-generation-label">{aiOverlayLabel(mode, t)}</span>
        <strong>{t("aiMagicTitle")}</strong>
        <p>{aiOverlayMessage(mode, t)}</p>
        {progressText ? <span className="ai-generation-progress">{progressText}</span> : null}
        <span className="ai-generation-hint">{aiOverlayHint(mode, t)}</span>
      </div>
    </div>
  );
}

export function ButtonBusyContent({
  busy,
  idleLabel,
  busyLabel,
  icon,
}: {
  busy: boolean;
  idleLabel: string;
  busyLabel: string;
  icon?: ReactNode;
}) {
  return (
    <span className={`button-busy-label${busy ? " is-busy" : ""}`}>
      {busy ? <LoadingSpinner size="sm" /> : icon ? <span className="action-icon" aria-hidden="true">{icon}</span> : null}
      <span>{busy ? busyLabel : idleLabel}</span>
    </span>
  );
}

export function RatingInput({
  value,
  disabled,
  label,
  hint,
  onChange,
}: {
  value: string;
  disabled: boolean;
  label: string;
  hint?: string;
  onChange: (value: string) => void;
}) {
  const rating = Math.min(Math.max(Number(value || 0), 0), 6);
  // A tap sets a whole point; holding a star sets the half point below it.
  const holdTimer = useRef<number | undefined>(undefined);
  const holdOrigin = useRef<{ x: number; y: number } | null>(null);
  // The click that follows a completed hold must not also set a whole point. Touch
  // adjustment can retarget it to a neighbouring star, so it is ignored whatever its
  // target; the next gesture (pointerdown or key) clears the flag.
  const suppressClick = useRef(false);
  const [holdingStar, setHoldingStar] = useState<number | null>(null);
  const hintId = useId();
  useEffect(() => () => window.clearTimeout(holdTimer.current), []);
  const select = (score: number) => onChange(String(rating === score ? 0 : score));
  const cancelHold = () => {
    window.clearTimeout(holdTimer.current);
    holdOrigin.current = null;
    setHoldingStar(null);
  };
  const startHold = (star: number, x: number, y: number) => {
    cancelHold();
    suppressClick.current = false;
    holdOrigin.current = { x, y };
    setHoldingStar(star);
    holdTimer.current = window.setTimeout(() => {
      suppressClick.current = true;
      setHoldingStar(null);
      select(star - 0.5);
    }, RATING_HOLD_MS);
  };
  const step = (delta: number) => onChange(String(Math.min(Math.max(rating + delta, 0), 6)));
  return (
    <>
    <div className="rating-input" role="group" aria-label={`${label}: ${rating}/6`} aria-describedby={hint && !disabled ? hintId : undefined} title={hint}>
      {[1, 2, 3, 4, 5, 6].map((star) => (
        <button
          type="button"
          key={star}
          className={[star <= rating ? "filled" : star - 0.5 === rating ? "half-filled" : "", holdingStar === star ? "is-holding" : ""].filter(Boolean).join(" ") || undefined}
          disabled={disabled}
          aria-label={`${label}: ${star}/6`}
          aria-pressed={rating === star || rating === star - 0.5 ? (rating === star ? true : "mixed") : false}
          onPointerDown={(event) => { if (event.button === 0) startHold(star, event.clientX, event.clientY); }}
          onPointerMove={(event) => {
            // A resting finger drifts a few pixels; only a real move abandons the hold.
            const origin = holdOrigin.current;
            if (origin && Math.hypot(event.clientX - origin.x, event.clientY - origin.y) > RATING_HOLD_SLOP_PX) cancelHold();
          }}
          onPointerUp={cancelHold}
          onPointerLeave={(event) => { if (event.pointerType === "mouse") cancelHold(); }}
          onPointerCancel={cancelHold}
          onContextMenu={(event) => event.preventDefault()}
          onKeyDown={(event) => {
            suppressClick.current = false;
            if (event.key === "ArrowRight" || event.key === "ArrowUp") { event.preventDefault(); step(0.5); }
            if (event.key === "ArrowLeft" || event.key === "ArrowDown") { event.preventDefault(); step(-0.5); }
          }}
          onClick={() => {
            if (suppressClick.current) { suppressClick.current = false; return; }
            select(star);
          }}
        >
          <span aria-hidden="true">★</span>
        </button>
      ))}
      <button type="button" className="secondary compact clear-rating" disabled={disabled || rating === 0} onClick={() => onChange("0")}>
        0
      </button>
    </div>
    {/* Touch screens have no tooltip: show the hold gesture in text there. */}
    {hint && !disabled ? <small id={hintId} className="rating-input-hint">{hint}</small> : null}
    </>
  );
}

const RATING_HOLD_MS = 450;

/** Scores on the 0-6 scale in half-point steps; 0 means unrated. */
export const RATING_HALF_STEPS = Array.from({ length: 13 }, (_, index) => index / 2);
const RATING_HOLD_SLOP_PX = 10;

export function TastingEnjoymentInput({
  value,
  disabled,
  t,
  onChange,
}: {
  value: TastingEnjoyment;
  disabled: boolean;
  t: (key: TranslationKey) => string;
  onChange: (value: TastingEnjoyment) => void;
}) {
  const options: Array<{ value: Exclude<TastingEnjoyment, "">; label: TranslationKey; icon: AppIconName }> = [
    { value: "positive", label: "tastingEnjoymentPositive", icon: "sentiment-positive" },
    { value: "negative", label: "tastingEnjoymentNegative", icon: "sentiment-negative" },
  ];
  return (
    <div className="tasting-enjoyment-input" role="radiogroup" aria-label={t("tastingEnjoyment")}>
      {options.map((option) => (
        <button
          type="button"
          key={option.value}
          className={value === option.value ? `selected ${option.value}` : option.value}
          disabled={disabled}
          aria-checked={value === option.value}
          role="radio"
          onClick={() => onChange(value === option.value ? "" : option.value)}
        >
          <span aria-hidden="true"><AppIcon name={option.icon} /></span>
          {t(option.label)}
        </button>
      ))}
    </div>
  );
}

export function TastingEnjoymentBadge({ value, t }: { value: TastingEnjoyment; t: (key: TranslationKey) => string }) {
  if (!value) return null;
  const positive = value === "positive";
  const iconStyle = {
    display: "inline-grid",
    placeItems: "center",
    width: "1.7em",
    height: "1.7em",
    borderRadius: "50%",
    color: positive ? "var(--drink-ideal)" : "var(--drink-past)",
    background: positive
      ? "color-mix(in srgb, var(--drink-ideal) 22%, var(--surface))"
      : "color-mix(in srgb, var(--drink-past) 22%, var(--surface))",
  };
  return (
    <span className={`tasting-enjoyment-badge ${positive ? "positive" : "negative"}`} aria-label={t(positive ? "tastingEnjoymentPositive" : "tastingEnjoymentNegative")} title={t(positive ? "tastingEnjoymentPositive" : "tastingEnjoymentNegative")}>
      <span aria-hidden="true" style={iconStyle}><AppIcon name={positive ? "sentiment-positive" : "sentiment-negative"} /></span>
    </span>
  );
}
