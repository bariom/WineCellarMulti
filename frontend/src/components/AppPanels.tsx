import { Children, lazy, Suspense, useEffect, useRef, useState } from "react";
import type { CSSProperties, Dispatch, FormEvent, ReactNode, SetStateAction, UIEvent } from "react";
import { AppIcon } from "./AppIcon";
import { ButtonBusyContent, DetailField, LoadingState, RatingInput, StarRating, TastingEnjoymentBadge, TastingEnjoymentInput, WineStatusBadge } from "./AppUi";
import { clipUiText, consumeDraftFromTastingEntry, emptyConsumeWineDraft, formatAiBudget, formatDisplayDate, formatGrape, formatMoney, formatUsd, grapesSvgIcon, readableLegacyAiText, wineTone } from "./panelSupport";
import { displayValue, reasoningEffortTranslationKey } from "../i18n";
import type { TranslationKey } from "../i18n";
import type { AiAuditLog, AiUsageBucket, ConsumeWineDraft, ContactSupportDraft, Locale, MarketViewContext, Session, TastingArchiveApiItem, TastingArchiveEntry, UserAdminStats, Wine, WineAiFeature, WineCompareAiResult, WineDraft, WinePhotoSuggestion, WineSalesHistory, WishlistDraft, WishlistItem, WishlistPortfolioStrategy } from "../types";
import type { WineSaleDraft } from "../types";
import { formatBottleCount, formatPercentage, numberLocale, wineQuantityLabel } from "../domain/cellar";
import { rawNullableString, rawNumber, rawString } from "../services/offlineBackup";
import { api } from "../services/api";
import type { WineStockLot } from "../types";
import { WineLocationPicker, WineStorageSection, WineStrategySection } from "./StoragePanels";
import LocalizedDateInput from "./LocalizedDateInput";
const TimeSeriesChart = lazy(() => import("./TimeSeriesChart"));
const VineyardMap = lazy(() => import("../views/WineGeographyMap").then((module) => ({ default: module.VineyardMap })));

function ProgressiveBottlePhoto({ detailUrl, thumbnailUrl, alt }: { detailUrl: string; thumbnailUrl: string; alt: string }) {
  const [loadedDetailUrl, setLoadedDetailUrl] = useState("");
  const showsDetail = loadedDetailUrl === detailUrl || !thumbnailUrl || thumbnailUrl === detailUrl;
  const visibleUrl = showsDetail ? detailUrl : thumbnailUrl;

  useEffect(() => {
    setLoadedDetailUrl("");
    if (!detailUrl || !thumbnailUrl || thumbnailUrl === detailUrl) return;
    let active = true;
    const image = new Image();
    image.fetchPriority = "high";
    image.decoding = "async";
    image.onload = () => {
      const decoded = image.decode?.();
      if (decoded) {
        void decoded.catch(() => undefined).finally(() => {
          if (active) setLoadedDetailUrl(detailUrl);
        });
      } else if (active) {
        setLoadedDetailUrl(detailUrl);
      }
    };
    image.src = detailUrl;
    return () => {
      active = false;
    };
  }, [detailUrl, thumbnailUrl]);

  return <img src={visibleUrl} alt={alt} decoding="async" fetchPriority="high" onError={() => {
    if (visibleUrl !== detailUrl) setLoadedDetailUrl(detailUrl);
  }} />;
}

export function DrinkWindowMini({ wine }: { wine: Wine }) {
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

export function ValueHistoryChart({ wine, t, locale }: { wine: Wine; t: (key: TranslationKey) => string; locale: Locale }) {
  const [purchaseLots, setPurchaseLots] = useState<WineStockLot[]>([]);
  useEffect(() => {
    let active = true;
    void api<WineStockLot[]>(`/api/v1/inventory/lots?wine_id=${wine.id}&include_empty=true`)
      .then((lots) => { if (active) setPurchaseLots(lots); })
      .catch(() => { if (active) setPurchaseLots([]); });
    return () => { active = false; };
  }, [wine.id]);
  const historyEntries = (wine.value_history || [])
    .filter((entry) => entry.value && entry.recorded_at)
    .map((entry) => ({ ...entry, numericValue: Number(entry.value), dateMs: new Date(entry.recorded_at).getTime() }))
    .filter((entry) => Number.isFinite(entry.numericValue) && Number.isFinite(entry.dateMs))
    .sort((first, second) => first.dateMs - second.dateMs);
  const purchasePrice = Number(wine.price || 0);
  const parsedOrderDate = wine.order_date
    ? new Date(`${wine.order_date.slice(0, 10)}T00:00:00`).getTime()
    : Number.NaN;
  const purchaseDateMs = Number.isFinite(parsedOrderDate)
    ? parsedOrderDate
    : historyEntries.length
      ? historyEntries[0].dateMs - 86_400_000
      : Date.now();
  const purchaseEntries = purchaseLots
    .filter((lot) => Number(lot.unit_cost) > 0 && lot.acquired_on)
    .map((lot) => ({
      id: `purchase-${lot.id}`,
      value: lot.unit_cost,
      currency: lot.currency || wine.currency,
      source: "purchase",
      recorded_at: `${lot.acquired_on}T12:00:00.000Z`,
      numericValue: Number(lot.unit_cost),
      dateMs: new Date(`${lot.acquired_on}T12:00:00`).getTime(),
    }))
    .filter((entry) => Number.isFinite(entry.numericValue) && Number.isFinite(entry.dateMs));
  const fallbackPurchaseEntry = Number.isFinite(purchasePrice) && purchasePrice > 0
    ? {
        id: `purchase-${wine.id}`,
        value: String(purchasePrice),
        currency: wine.currency,
        source: "purchase",
        recorded_at: new Date(purchaseDateMs).toISOString(),
        numericValue: purchasePrice,
        dateMs: purchaseDateMs,
      }
    : null;
  const entries = [...(purchaseEntries.length ? purchaseEntries : fallbackPurchaseEntry ? [fallbackPurchaseEntry] : []), ...historyEntries]
    .sort((first, second) => first.dateMs - second.dateMs || (first.source === "purchase" ? -1 : 1));

  if (entries.length === 0) return null;

  const values = entries.map((entry) => entry.numericValue);
  const minValue = Math.min(...values);
  const maxValue = Math.max(...values);
  const first = entries[0];
  const last = entries[entries.length - 1];
  const deltaValue = last.numericValue - first.numericValue;
  const deltaPercent = first.numericValue > 0 ? (deltaValue / first.numericValue) * 100 : 0;
  const deltaPositive = deltaValue >= 0;
  const sourceLabels: Record<string, string> = {
    ai: t("valueSourceAi"),
    imported: "Import",
    manual: t("valueSourceManual"),
    shared: "Share",
    purchase: t("purchasePrice"),
  };
  const hasAiEstimate = entries.some((entry) => entry.source === "ai");
  const hasManualCorrection = entries.some((entry) => entry.source === "manual");
  const hasPurchasePrice = entries.some((entry) => entry.source === "purchase");

  return (
    <div className="value-history-card">
      <div className="section-heading">
        <div>
          <h3>{t("valueEvolution")}</h3>
          <span>{entries.length} {t("records")}</span>
        </div>
        <strong className={deltaPositive ? "value-history-delta positive" : "value-history-delta negative"}>
          {deltaPositive ? "+" : ""}{deltaValue.toFixed(0)} ({deltaPositive ? "+" : ""}{deltaPercent.toFixed(1)}%)
        </strong>
      </div>
      <Suspense fallback={<div className="value-history-chart" aria-label={t("valueEvolution")} />}>
        <div className="value-history-chart">
          <TimeSeriesChart
            ariaLabel={t("valueEvolution")}
            locale={locale}
            currency={last.currency}
            points={entries.map((entry) => ({
              timestampMs: entry.dateMs,
              value: entry.numericValue,
              tone: entry.source === "ai" || entry.source === "manual" || entry.source === "imported" || entry.source === "shared" || entry.source === "purchase" ? entry.source : "default",
            }))}
          />
        </div>
      </Suspense>
      {hasAiEstimate || hasManualCorrection || hasPurchasePrice ? (
        <div className="value-history-legend" aria-label={t("valueEvolution")}>
          {hasPurchasePrice ? <span className="source-purchase"><i aria-hidden="true" />{t("purchasePrice")}</span> : null}
          {hasAiEstimate ? <span className="source-ai"><i aria-hidden="true" />{t("valueSourceAi")}</span> : null}
          {hasManualCorrection ? <span className="source-manual"><i aria-hidden="true" />{t("valueSourceManual")}</span> : null}
        </div>
      ) : null}
      <div className="value-history-meta">
        <span>{formatDisplayDate(first.recorded_at)}: {first.currency} {first.numericValue.toFixed(0)}</span>
        <strong>{last.currency} {last.numericValue.toFixed(0)}</strong>
        <span>{formatDisplayDate(last.recorded_at)} - {sourceLabels[last.source] || last.source}</span>
        <small>{first.currency} {minValue.toFixed(0)} - {first.currency} {maxValue.toFixed(0)}</small>
      </div>
    </div>
  );
}

export function auditMarketSources(entry: AiAuditLog) {
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

export function auditWebSearchSources(entry: AiAuditLog) {
  return (entry.sources || [])
    .filter((source) => source && typeof source === "object" && source.kind === "web_search_source")
    .map((source) => ({
      title: rawString(source.title),
      url: rawString(source.url),
    }))
    .filter((source) => source.url);
}

export function auditMarketNote(entry: AiAuditLog) {
  const noteEntry = (entry.sources || []).find((source) => source && typeof source === "object" && source.kind === "market_note");
  return noteEntry ? rawString(noteEntry.text) : "";
}

export function auditWishlistPortfolioStrategySource(entry: AiAuditLog) {
  return (entry.sources || []).find((source) => source && typeof source === "object" && source.kind === "wishlist_portfolio_strategy") || null;
}

export function auditWishlistPortfolioStrategy(entry: AiAuditLog): WishlistPortfolioStrategy | null {
  const strategyEntry = auditWishlistPortfolioStrategySource(entry);
  if (!strategyEntry) return null;
  return {
    model: entry.model,
    reasoning_effort: entry.reasoning_effort,
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

export function averageMarketPrice(sources: ReturnType<typeof auditMarketSources>) {
  if (!sources.length) return null;
  return sources.reduce((sum, source) => sum + source.price, 0) / sources.length;
}

export function compareDrinkWindowLabel(wine: Wine, t: (key: TranslationKey) => string) {
  if (!wine.drink_from && !wine.drink_to) return t("notSpecified");
  if (wine.drink_from && wine.drink_to) return `${wine.drink_from}-${wine.drink_to}`;
  if (wine.drink_from) return `${wine.drink_from}-...`;
  return `...-${wine.drink_to}`;
}

export function compareScoresLabel(wine: Wine, t: (key: TranslationKey) => string) {
  if (!wine.scores.length) return t("notSpecified");
  return wine.scores.slice(0, 2).map((score) => `${score.critic} ${score.score}`.trim()).join(" • ");
}

export function compareGrapesLabel(wine: Wine, t: (key: TranslationKey) => string) {
  if (!wine.grapes.length) return t("notSpecified");
  return wine.grapes.slice(0, 4).map((grape) => formatGrape(grape)).join(" • ");
}

export function compareTagsLabel(wine: Wine, t: (key: TranslationKey) => string) {
  if (!wine.tags.length) return t("notSpecified");
  return wine.tags.slice(0, 4).join(" • ");
}

export function CompareWinesModal({
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
              <span>{aiResult.model} · {t("reasoningEffort")}: {t(reasoningEffortTranslationKey(aiResult.reasoning_effort))}</span>
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

export function MarketValueModal({
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

export function UserStatsModal({
  stats,
  loading,
  title,
  onClose,
}: {
  stats: UserAdminStats | null;
  loading: boolean;
  title: string;
  onClose: () => void;
}) {
  return (
    <div className="market-modal-overlay" onClick={onClose}>
      <div className="market-modal-card user-stats-modal-card" onClick={(event) => event.stopPropagation()}>
        <div className="market-modal-head">
          <div>
            <h2>User stats</h2>
            <strong>{title || "User"}</strong>
            <span>{stats?.email || "Loading..."}</span>
          </div>
          <div className="member-actions">
            {stats ? (
              <button type="button" className="secondary compact" onClick={() => navigator.clipboard?.writeText(JSON.stringify(stats, null, 2))}>
                Copy JSON
              </button>
            ) : null}
            <button type="button" className="secondary compact" onClick={onClose}>
              Close
            </button>
          </div>
        </div>
        {loading ? <LoadingState label="Loading user stats" compact /> : null}
        {stats ? (
          <>
            <div className="row-meta">
              <span>{stats.is_approved ? "approved" : "pending"}</span>
              {stats.is_blocked ? <span>blocked</span> : null}
              {stats.is_app_admin ? <span>App admin</span> : null}
              <span>Households: {stats.households_total}</span>
              <span>Wines: {stats.cellar_wines_total}</span>
              <span>Bottles: {stats.cellar_bottles_total}</span>
              <span>AI: {stats.ai_requests_total}</span>
            </div>
            <pre className="user-stats-json-block">
              {JSON.stringify(stats, null, 2)}
            </pre>
          </>
        ) : null}
      </div>
    </div>
  );
}

export function DetailNote({ title, children }: { title: string; children: string }) {
  return (
    <article className="detail-note">
      <h3>{title}</h3>
      <p>{children}</p>
    </article>
  );
}

export function ownershipRows(wine: Wine) {
  if (wine.owners.length) return wine.owners;
  const share = Number(wine.owner_share_pct || 0);
  return share > 0 && share < 100 ? [{ name: "Owner", share_pct: share }] : [];
}

export function hasSharedOwnership(wine: Wine) {
  return wine.owners.length > 0 || Number(wine.owner_share_pct || 100) < 100;
}

export function TastingEntryEditor({
  draft,
  setDraft,
  saving,
  t,
  locale,
  onSave,
  onCancel,
  onDelete,
}: {
  draft: ConsumeWineDraft;
  setDraft: Dispatch<SetStateAction<ConsumeWineDraft>>;
  saving: boolean;
  t: (key: TranslationKey) => string;
  locale: Locale;
  onSave: () => Promise<void>;
  onCancel: () => void;
  onDelete: () => Promise<void>;
}) {
  return (
    <div className="tasting-entry-editor">
      <div className="detail-grid consume-grid">
        <label>
          <span>{t("tastingDate")}</span>
          <LocalizedDateInput value={draft.consumed_at} onChange={(consumed_at) => setDraft((current) => ({ ...current, consumed_at }))} locale={locale} disabled={saving} />
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
        <label className="tasting-enjoyment-field">
          <span>{t("tastingEnjoyment")}</span>
          <TastingEnjoymentInput
            value={draft.tasting_enjoyment}
            disabled={saving}
            t={t}
            onChange={(value) => setDraft((current) => ({ ...current, tasting_enjoyment: value }))}
          />
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

export function TastingEntryMeta({
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

export function TastingHistorySection({
  wine,
  entries,
  canWrite,
  saving,
  onUpdateEntry,
  onDeleteEntry,
  t,
  locale,
}: {
  wine: Wine;
  entries: Wine["tasting_history"];
  canWrite: boolean;
  saving: boolean;
  onUpdateEntry: (wine: Wine, entryId: string, payload: ConsumeWineDraft) => Promise<void>;
  onDeleteEntry: (wine: Wine, entryId: string) => Promise<void>;
  t: (key: TranslationKey) => string;
  locale: Locale;
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
                  {entry.score_value !== null && entry.score_value !== undefined && entry.score_scale
                    ? <span>{t("tastingRating")}: {entry.score_value}/{entry.score_scale}</span>
                    : entry.rating ? <span>{t("tastingRating")}: {entry.rating}/6</span> : null}
                  <TastingEnjoymentBadge value={entry.enjoyment} t={t} />
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
                  locale={locale}
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

export function tastingArchiveSearchText(entry: TastingArchiveEntry) {
  return [
    entry.note,
    entry.enjoyment,
    entry.occasion,
    entry.pairing,
    entry.companions,
  ]
    .join(" ")
    .toLowerCase();
}

export function tastingArchiveItemToWine(item: TastingArchiveApiItem): Wine {
  return {
    id: item.wine_id,
    details_loaded: false,
    shared_data_features: [],
    shared_data_updated_at: null,
    strategy_purposes: [],
    household_id: "",
    name: item.wine_name,
    producer: item.wine_producer,
    vintage: item.wine_vintage,
    quantity: 0,
    currency: "CHF",
    price: "0",
    sale_price: null,
    glass_price: null,
    pour_size_ml: 100,
    reorder_threshold: 2,
    reorder_enabled: true,
    commercial_status: "active",
    open_bottle_ml: 0,
    current_value: null,
    value_not_found: false,
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
    grapes_source_url: "",
    grapes_source_title: "",
    grapes_verified_at: null,
    grapes_not_applicable: false,
    scores: [],
    scores_not_applicable: false,
    vineyard_name: "",
    vineyard_locality: "",
    vineyard_country: "",
    vineyard_latitude: null,
    vineyard_longitude: null,
    vineyard_precision: "",
    vineyard_source_url: "",
    vineyard_source_title: "",
    vineyard_notes: "",
    vineyard_verified_at: null,
    vineyard_not_found: false,
    photo_thumbnail_url: "",
    photo_detail_url: "",
    tasting_history: [],
    value_history: [],
  };
}

function WineLotsSection({ wine, canWrite, saving, locale, onChanged }: { wine: Wine; canWrite: boolean; saving: boolean; locale: Locale; onChanged: () => Promise<void> | void }) {
  const [lots, setLots] = useState<WineStockLot[]>([]);
  const [draft, setDraft] = useState({ quantity: "", unit_cost: "", acquired_on: new Date().toISOString().slice(0, 10), supplier: "", storage_location_id: "", storage_bin_id: "" });
  const [loading, setLoading] = useState(false);
  const italian = locale === "it";
  const loadLots = async () => setLots(await api<WineStockLot[]>(`/api/v1/inventory/lots?wine_id=${wine.id}`));
  useEffect(() => {
    void loadLots().catch(() => setLots([]));
  }, [wine.id]);
  const total = lots.reduce((sum, lot) => sum + Number(lot.total_remaining_cost), 0);
  const bottles = lots.reduce((sum, lot) => sum + lot.quantity_remaining, 0);
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canWrite || loading) return;
    setLoading(true);
    try {
      await api("/api/v1/inventory/movements", { method: "POST", body: JSON.stringify({ wine_id: wine.id, movement_type: "purchase", quantity: Number(draft.quantity), unit_cost: Number(draft.unit_cost), occurred_on: draft.acquired_on, supplier: draft.supplier, storage_location_id: draft.storage_location_id || null, storage_bin_id: draft.storage_bin_id || null }) });
      setDraft((current) => ({ ...current, quantity: "", unit_cost: "", supplier: "" }));
      await Promise.all([loadLots(), onChanged()]);
    } finally { setLoading(false); }
  };
  return <details className="detail-section wine-lots-section">
    <summary><span>{italian ? "Lotti d'acquisto" : "Purchase lots"}</span><strong>{lots.length} {italian ? (lots.length === 1 ? "lotto" : "lotti") : (lots.length === 1 ? "lot" : "lots")}</strong></summary>
    <p className="consume-help">{italian ? `Costo medio residuo: ${formatMoney(bottles ? total / bottles : 0, wine.currency, locale)}. Le bevute scaricano prima i lotti più vecchi (FIFO).` : `Remaining average cost: ${formatMoney(bottles ? total / bottles : 0, wine.currency, locale)}. Consumption uses the oldest lots first (FIFO).`}</p>
    <div className="lot-list">{lots.map((lot) => <div className="detail-field" key={lot.id}><span>{formatDisplayDate(lot.acquired_on)}{lot.supplier ? ` · ${lot.supplier}` : ""}</span><strong>{lot.quantity_remaining}/{lot.quantity_received} · {formatMoney(lot.unit_cost, lot.currency, locale)}</strong></div>)}</div>
    {canWrite ? <form className="consume-form" onSubmit={submit}><div className="detail-grid consume-grid">
      <label><span>{italian ? "Bottiglie" : "Bottles"}</span><input type="number" min="1" required value={draft.quantity} onChange={(event) => setDraft({ ...draft, quantity: event.target.value })} /></label>
      <label><span>{italian ? "Costo unitario" : "Unit cost"}</span><input type="number" min="0" step="0.01" required value={draft.unit_cost} onChange={(event) => setDraft({ ...draft, unit_cost: event.target.value })} /></label>
      <label><span>{italian ? "Data acquisto" : "Purchase date"}</span><input type="date" required value={draft.acquired_on} onChange={(event) => setDraft({ ...draft, acquired_on: event.target.value })} /></label>
      <label><span>{italian ? "Commerciante" : "Merchant"}</span><input value={draft.supplier} onChange={(event) => setDraft({ ...draft, supplier: event.target.value })} /></label>
      <WineLocationPicker locale={locale} locationId={draft.storage_location_id} binId={draft.storage_bin_id} onChange={(storage_location_id, storage_bin_id) => setDraft((current) => ({ ...current, storage_location_id, storage_bin_id }))} />
    </div><div className="form-actions"><button type="submit" disabled={saving || loading}>{italian ? "Aggiungi lotto" : "Add lot"}</button></div></form> : null}
  </details>;
}

export function WineDetail({
  wine,
  session,
  auditEntries,
  canGenerate,
  canWrite,
  saving,
  generating,
  onGenerate,
  onOpenPairing,
  onToggleValueAiExclusion,
  onToggleGrapesAiExclusion,
  onToggleScoresAiExclusion,
  onUpdateRating,
  onConsume,
  onLotsChanged,
  restaurantMode = false,
  salesHistory = null,
  salesHistoryLoading = false,
  onSell,
  onUpdateCommercialStatus,
  onUpdateTastingEntry,
  onDeleteTastingEntry,
  marketAuditEntry,
  onOpenMarketView,
  coOwnershipSection,
  photoActions,
  photoSuggestion,
  onUseSuggestedPhoto,
  onDismissSuggestedPhoto,
  showBottlePhoto = false,
  focusStorageRequestId = null,
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
  onOpenPairing: () => void;
  onToggleValueAiExclusion: (excluded: boolean) => void;
  onToggleGrapesAiExclusion: (excluded: boolean) => void;
  onToggleScoresAiExclusion: (excluded: boolean) => void;
  onUpdateRating: (rating: string) => Promise<void>;
  onConsume: (payload: ConsumeWineDraft) => Promise<void>;
  onLotsChanged: () => Promise<void> | void;
  restaurantMode?: boolean;
  salesHistory?: WineSalesHistory | null;
  salesHistoryLoading?: boolean;
  onSell: (payload: WineSaleDraft) => Promise<void>;
  onUpdateCommercialStatus: (status: Wine["commercial_status"]) => Promise<void>;
  onUpdateTastingEntry: (wine: Wine, entryId: string, payload: ConsumeWineDraft) => Promise<void>;
  onDeleteTastingEntry: (wine: Wine, entryId: string) => Promise<void>;
  marketAuditEntry: AiAuditLog | null;
  onOpenMarketView: (entry: AiAuditLog) => void;
  coOwnershipSection?: ReactNode;
  photoActions?: ReactNode;
  photoSuggestion?: WinePhotoSuggestion | null;
  onUseSuggestedPhoto?: (sourceWineId: string) => void;
  onDismissSuggestedPhoto?: () => void;
  showBottlePhoto?: boolean;
  focusStorageRequestId?: number | null;
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
  const peakCenter = Math.min(Math.max(peakLeft + Math.min(peakWidth, peakRightBound) / 2, 0), 100);
  const arcHeightAt = (progress: number) => 122 - 88 * Math.sin((progress / 100) * Math.PI);
  const currentArcTop = arcHeightAt(currentYearLeft);
  const peakArcTop = arcHeightAt(peakCenter);
  const maturityPhaseLabel = currentYear < drinkStart
    ? t("youngWine")
    : currentYear > drinkEnd
      ? t("pastWindow")
      : currentYear >= peakStart && currentYear <= peakEnd
        ? t("idealWindow")
        : t("youngWine");
  const [consumeDraft, setConsumeDraft] = useState<ConsumeWineDraft>(emptyConsumeWineDraft);
  const [saleDraft, setSaleDraft] = useState<WineSaleDraft>({ sold_at: new Date().toISOString().slice(0, 10), quantity: "1", unit_sale_price: wine.sale_price || "", note: "", sale_kind: "bottle" });
  const [glassSaleDraft, setGlassSaleDraft] = useState<WineSaleDraft>({ sold_at: new Date().toISOString().slice(0, 10), quantity: "1", unit_sale_price: wine.glass_price || "", note: "", sale_kind: "glass" });
  const [aiToolsOpen, setAiToolsOpen] = useState(false);
  const [activeOperation, setActiveOperation] = useState<"consume" | "sale" | "glass" | null>(null);
  const [drinkNotesExpanded, setDrinkNotesExpanded] = useState(false);
  const [originMapOpenRequest, setOriginMapOpenRequest] = useState(0);
  const consumePanelRef = useRef<HTMLDetailsElement>(null);
  const salePanelRef = useRef<HTMLDetailsElement>(null);
  const glassSalePanelRef = useRef<HTMLDetailsElement>(null);
  const wineDetailRef = useRef<HTMLElement>(null);
  const hasMarketEvidence = marketAuditEntry ? auditMarketSources(marketAuditEntry).length > 0 || Boolean(auditMarketNote(marketAuditEntry)) : false;
  const detailValue = formatMoney(wine.current_value || wine.price, wine.currency, locale);
  const originPreview = (wine.vineyard_latitude !== null && wine.vineyard_longitude !== null) || wine.region || wine.appellation ? <button type="button" className="wine-origin-preview" onClick={() => setOriginMapOpenRequest((current) => current + 1)}>
    <span aria-hidden="true">⌖</span>
    <span>{locale === "it" ? "Origine" : "Origin"}</span>
  </button> : null;
  const photoOriginActions = photoActions || originPreview ? <div className="detail-photo-actions detail-photo-origin-actions">{photoActions}{originPreview}</div> : null;
  const sharedFeatureLabels: Record<Wine["shared_data_features"][number], string> = {
    notes: locale === "it" ? "note" : "notes",
    drink_window: locale === "it" ? "finestra di beva" : "drink window",
    value: locale === "it" ? "valore" : "value",
    grapes: locale === "it" ? "uvaggio" : "grapes",
    scores: locale === "it" ? "punteggi" : "scores",
  };
  const missingAiData = [
    !wine.ai_notes ? sharedFeatureLabels.notes : "",
    !(wine.drink_from && wine.drink_to) ? sharedFeatureLabels.drink_window : "",
    wine.current_value === null || wine.current_value === undefined || wine.current_value === "" ? sharedFeatureLabels.value : "",
    !wine.grapes_not_applicable && (!Array.isArray(wine.grapes) || !wine.grapes.length) ? sharedFeatureLabels.grapes : "",
    !wine.scores_not_applicable && (!Array.isArray(wine.scores) || !wine.scores.length) ? sharedFeatureLabels.scores : "",
  ].filter(Boolean);
  const commercialStatuses: Array<{ value: Wine["commercial_status"]; label: string }> = [
    { value: "active", label: locale === "it" ? "In carta" : "On the list" },
    { value: "clearing_out", label: locale === "it" ? "A esaurimento" : "Clearing out" },
    { value: "suspended", label: locale === "it" ? "Sospeso" : "Suspended" },
    { value: "off_list", label: locale === "it" ? "Fuori carta" : "Off list" },
  ];
  const commercialStatus = commercialStatuses.find((item) => item.value === wine.commercial_status) || commercialStatuses[0];
  const storageOptions = wine.storage_allocations || [];
  const storageOptionLabel = (allocation: (typeof storageOptions)[number]) => allocation.location_id
    ? `${allocation.location_name}${allocation.bin_name ? ` · ${allocation.bin_name}` : ""} (${allocation.quantity})`
    : `${locale === "it" ? "Da collocare" : "Unassigned"} (${allocation.quantity})`;

  useEffect(() => {
    setConsumeDraft(emptyConsumeWineDraft());
    setSaleDraft({ sold_at: new Date().toISOString().slice(0, 10), quantity: "1", unit_sale_price: wine.sale_price || "", note: "", sale_kind: "bottle" });
    setGlassSaleDraft({ sold_at: new Date().toISOString().slice(0, 10), quantity: "1", unit_sale_price: wine.glass_price || "", note: "", sale_kind: "glass" });
    setAiToolsOpen(false);
    setActiveOperation(null);
    setDrinkNotesExpanded(false);
    setOriginMapOpenRequest(0);
  }, [restaurantMode, wine.id]);

  async function submitConsume(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await onConsume(consumeDraft);
    setConsumeDraft(emptyConsumeWineDraft());
    setActiveOperation(null);
  }

  async function submitSale(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await onSell(saleDraft);
    setSaleDraft((current) => ({ ...current, quantity: "1", note: "" }));
    setActiveOperation(null);
  }

  async function submitGlassSale(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await onSell(glassSaleDraft);
    setGlassSaleDraft((current) => ({ ...current, quantity: "1", note: "" }));
    setActiveOperation(null);
  }

  function revealAction(operation: "consume" | "sale" | "glass", panel: { current: HTMLDetailsElement | null }) {
    setActiveOperation(operation);
    window.requestAnimationFrame(() => {
      panel.current?.setAttribute("open", "");
      panel.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const wineDetail = wineDetailRef.current;
      if (!wineDetail || !event.altKey || event.ctrlKey || event.metaKey || event.shiftKey || target?.closest("input, textarea, select, [contenteditable='true']")) return;

      const sections = Array.from(wineDetail.querySelectorAll<HTMLElement>("[data-wine-detail-section]"))
        .sort((left, right) => Number(left.dataset.wineDetailSection) - Number(right.dataset.wineDetailSection));
      const requestedNumber = Number(event.key);
      let targetSection = Number.isInteger(requestedNumber)
        ? sections.find((section) => Number(section.dataset.wineDetailSection) === requestedNumber)
        : undefined;
      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        const current = target?.closest<HTMLElement>("[data-wine-detail-section]");
        const currentIndex = current ? sections.indexOf(current) : -1;
        const nextIndex = event.key === "ArrowDown"
          ? Math.min(currentIndex + 1, sections.length - 1)
          : currentIndex < 0 ? sections.length - 1 : Math.max(currentIndex - 1, 0);
        targetSection = sections[nextIndex];
      }
      if (!targetSection) return;
      event.preventDefault();
      event.stopPropagation();
      if (targetSection instanceof HTMLDetailsElement) targetSection.open = true;
      window.requestAnimationFrame(() => {
        if (targetSection && wineDetail) {
          const detailRect = wineDetail.getBoundingClientRect();
          const sectionRect = targetSection.getBoundingClientRect();
          wineDetail.scrollTo({ top: wineDetail.scrollTop + sectionRect.top - detailRect.top - 12, behavior: "smooth" });
        }
        targetSection?.querySelector<HTMLElement>("summary")?.focus({ preventScroll: true });
      });
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [wine.id]);

  return (
    <section ref={wineDetailRef} className={`wine-detail tone-${wineTone(wine.type)}`} data-wine-detail-id={wine.id}>
      <div className="detail-hero">
        <div className="detail-title">
          {showBottlePhoto && wine.photo_detail_url ? (
            <div className="detail-bottle-photo">
              <ProgressiveBottlePhoto detailUrl={wine.photo_detail_url} thumbnailUrl={wine.photo_thumbnail_url} alt={`${wine.name} ${wine.vintage}`.trim()} />
            </div>
          ) : null}
          <div>
            <p className="eyebrow">{t("wineDetail")}</p>
            <h2 className={`detail-wine-name ${wine.name.length > 34 ? "detail-wine-name--long" : wine.name.length > 20 ? "detail-wine-name--medium" : "detail-wine-name--short"}`}>
              <i className={`wine-dot tone-${wineTone(wine.type)}`} />
              <span>{wine.name}</span>
            </h2>
            {!restaurantMode ? canWrite ? (
              <RatingInput
                value={String(wine.rating || 0)}
                disabled={saving}
                label={t("rating")}
                onChange={(rating) => { void onUpdateRating(rating); }}
              />
            ) : wine.rating ? <StarRating value={wine.rating} label={t("rating")} /> : null : null}
            <span>{[wine.producer, wine.vintage, wine.region, wine.appellation].filter(Boolean).join(" - ")}</span>
            {restaurantMode ? <div className="restaurant-detail-quick-actions">
              {canWrite ? <details className={`wine-commercial-status is-${commercialStatus.value}`}>
                <summary>{commercialStatus.label}</summary>
                <div role="menu" aria-label={locale === "it" ? "Stato in carta" : "Wine list status"}>
                  {commercialStatuses.map((status) => <button type="button" role="menuitemradio" aria-checked={status.value === wine.commercial_status} key={status.value} disabled={saving || status.value === wine.commercial_status} onClick={(event) => {
                    void onUpdateCommercialStatus(status.value);
                    event.currentTarget.closest("details")?.removeAttribute("open");
                  }}>{status.label}</button>)}
                </div>
              </details> : <span className={`wine-commercial-status wine-commercial-status--readonly is-${commercialStatus.value}`}>{commercialStatus.label}</span>}
              {photoOriginActions}
              <strong>{detailValue}</strong>
            </div> : null}
            {photoSuggestion ? <aside className="detail-photo-suggestion" aria-label={locale === "it" ? "Foto disponibile" : "Available photo"}>
              <img src={photoSuggestion.thumbnail_url} alt={locale === "it" ? `Foto proposta per ${wine.name}` : `Suggested photo for ${wine.name}`} />
              <div>
                <strong>{locale === "it" ? "Foto già disponibile" : "Photo already available"}</strong>
                <small>{locale === "it" ? "Trovata nella libreria Vinaris per questo vino." : "Found in the Vinaris library for this wine."}</small>
              </div>
              <div className="detail-photo-suggestion-actions">
                <button type="button" className="secondary compact" disabled={saving} onClick={onDismissSuggestedPhoto}>{locale === "it" ? "Non ora" : "Not now"}</button>
                <button type="button" className="compact" disabled={saving} onClick={() => onUseSuggestedPhoto?.(photoSuggestion.source_wine_id)}>{locale === "it" ? "Usa foto" : "Use photo"}</button>
              </div>
            </aside> : null}
          </div>
          {!restaurantMode ? <strong className="detail-current-value"><span>{t("currentValue")}</span>{detailValue}</strong> : null}
        </div>
        {!restaurantMode ? photoOriginActions : null}

        <Suspense fallback={<LoadingState label={locale === "it" ? "Carico la mappa" : "Loading map"} compact />}>
          <VineyardMap wine={wine} locale={locale} openRequestId={originMapOpenRequest} />
        </Suspense>

        <details className="wine-ai-tools" open={aiToolsOpen} onToggle={(event) => setAiToolsOpen(event.currentTarget.open)}>
          <summary>{restaurantMode ? (locale === "it" ? "Completa i dati del vino con l’AI" : "Complete wine data with AI") : (locale === "it" ? "Strumenti AI" : "AI tools")}</summary>
          {wine.shared_data_features.length ? (
            <div className="shared-wine-data-notice">
              <strong>{locale === "it" ? "Dati Vinaris riutilizzati gratuitamente" : "Vinaris data reused at no cost"}</strong>
              <span><b>{locale === "it" ? "Riutilizzati:" : "Reused:"}</b> {wine.shared_data_features.map((feature) => sharedFeatureLabels[feature]).join(" · ")}</span>
              {missingAiData.length ? <span><b>{locale === "it" ? "Ancora da verificare:" : "Still to verify:"}</b> {missingAiData.join(" · ")}</span> : null}
              <small>{locale === "it" ? "Vinaris condivide soltanto informazioni verificate; i dati manuali o privi di fonte non vengono copiati automaticamente." : "Vinaris only shares verified information; manual or unsourced data is not copied automatically."}</small>
            </div>
          ) : null}
          <div className="ai-actions detail-ai-actions">
            {canGenerate ? (
              <button type="button" className="secondary compact" disabled={Boolean(generating)} onClick={onOpenPairing}>
                <AppIcon name="glass-sparkle" variant="ai" />
                {t("pairing")}
              </button>
            ) : null}
            <button type="button" className="secondary compact wine-ai-all-button" disabled={!canGenerate || Boolean(generating)} onClick={() => onGenerate("all")}>
              <ButtonBusyContent busy={generating === "all"} idleLabel={t("runAllWineAi")} busyLabel={t("generating")} />
            </button>
            <small className="wine-ai-all-help">{t("runAllWineAiHelp")}</small>
            <button type="button" className="secondary compact" disabled={!canGenerate || Boolean(generating)} onClick={() => onGenerate("notes")}>
              <ButtonBusyContent busy={generating === "notes"} idleLabel={t("aiNotes")} busyLabel={t("generating")} />
            </button>
            <button type="button" className="secondary compact" disabled={!canGenerate || Boolean(generating)} onClick={() => onGenerate("drink-window")}>
              <ButtonBusyContent busy={generating === "drink-window"} idleLabel={t("drinkWindow")} busyLabel={t("generating")} />
            </button>
            <button type="button" className="secondary compact" disabled={!canGenerate || Boolean(generating) || wine.value_not_found} onClick={() => onGenerate("value")}>
              <ButtonBusyContent busy={generating === "value"} idleLabel={t("value")} busyLabel={t("generating")} />
            </button>
            <button type="button" className="secondary compact" disabled={!canGenerate || Boolean(generating) || wine.grapes_not_applicable} onClick={() => onGenerate("grapes")}>
              <ButtonBusyContent busy={generating === "grapes"} idleLabel={t("grapes")} busyLabel={t("generating")} />
            </button>
            <button type="button" className="secondary compact" disabled={!canGenerate || Boolean(generating) || wine.scores_not_applicable} onClick={() => onGenerate("scores")}>
              <ButtonBusyContent busy={generating === "scores"} idleLabel={wine.scores.length ? t("findMoreScores") : t("scores")} busyLabel={t("generating")} />
            </button>
          </div>
          {generating ? <LoadingState label={t("generating")} compact /> : null}
          <div className="detail-preference-bar detail-ai-preference-bar">
            <label className="detail-toggle-row">
              <input
                type="checkbox"
                checked={wine.value_not_found}
                disabled={!canWrite || saving}
                onChange={(event) => onToggleValueAiExclusion(event.target.checked)}
              />
              <span>{t("excludeFromAiValue")}</span>
            </label>
            <label className="detail-toggle-row">
              <input
                type="checkbox"
                checked={wine.grapes_not_applicable}
                disabled={!canWrite || saving}
                onChange={(event) => onToggleGrapesAiExclusion(event.target.checked)}
              />
              <span>{t("excludeFromAiGrapes")}</span>
            </label>
            <label className="detail-toggle-row">
              <input
                type="checkbox"
                checked={wine.scores_not_applicable}
                disabled={!canWrite || saving}
                onChange={(event) => onToggleScoresAiExclusion(event.target.checked)}
              />
              <span>{t("excludeFromAiScores")}</span>
            </label>
            {wine.value_not_found ? <small>{t("excludedFromAiValue")}</small> : null}
            {wine.grapes_not_applicable ? <small>{t("excludedFromAiGrapes")}</small> : null}
            {wine.scores_not_applicable ? <small>{t("excludedFromAiScores")}</small> : null}
          </div>
        </details>

        <div className="detail-hero-metrics">
          <div className="detail-hero-metric">
            <span>{t("status")}</span>
            <strong><WineStatusBadge status={wine.status} locale={locale} /></strong>
          </div>
          <div className="detail-hero-metric">
            <span>{t("quantity")}</span>
            <strong>{wineQuantityLabel(wine, session, t("bottles").toLowerCase(), locale, restaurantMode)}</strong>
          </div>
      </div>

      {restaurantMode ? <section className="restaurant-wine-sales-history" aria-busy={salesHistoryLoading}>
        <div className="restaurant-wine-sales-history-heading">
          <div>
            <p className="eyebrow">{locale === "it" ? "Andamento" : "Performance"}</p>
            <h3>{locale === "it" ? "Vendite del vino · ultimi 12 mesi" : "Wine sales · last 12 months"}</h3>
          </div>
          {salesHistory ? <strong>{formatMoney(salesHistory.revenue, salesHistory.currency, locale)}</strong> : null}
        </div>
        {salesHistoryLoading ? <LoadingState label={locale === "it" ? "Carico lo storico vendite" : "Loading sales history"} compact /> : salesHistory?.series.length ? <>
          <div className="restaurant-wine-sales-history-kpis">
            <span><b>{salesHistory.bottles}</b> {locale === "it" ? "bottiglie vendute" : "bottles sold"}</span>
            <span><b>{salesHistory.glasses}</b> {locale === "it" ? "calici serviti" : "glasses served"}</span>
            <span><b>{formatMoney(salesHistory.gross_margin, salesHistory.currency, locale)}</b> {locale === "it" ? "margine lordo" : "gross margin"}</span>
          </div>
          <Suspense fallback={<div className="restaurant-wine-sales-history-chart" />}>
            <div className="restaurant-wine-sales-history-chart">
              <TimeSeriesChart
                ariaLabel={locale === "it" ? "Evoluzione dei ricavi del vino" : "Wine revenue trend"}
                locale={locale}
                currency={salesHistory.currency}
                height={176}
                mobileHeight={150}
                points={salesHistory.series.map((point) => ({ timestampMs: new Date(`${point.date}T12:00:00`).getTime(), value: Number(point.revenue), tone: "manual" as const }))}
              />
            </div>
          </Suspense>
        </> : <p className="empty-state">{locale === "it" ? "Nessuna vendita registrata negli ultimi 12 mesi." : "No sales recorded in the last 12 months."}</p>}
      </section> : null}

      {(wine.drink_from || wine.drink_to) ? (
          <div className="drink-window detail-hero-window">
            <div className="section-heading">
              <h3>{t("drinkingWindow")}</h3>
              <span>{drinkStart}-{drinkEnd}</span>
            </div>
            <div
              className={`maturity-horizon${currentYearInWindow ? " is-active" : ""}`}
              role="img"
              aria-label={`${t("drinkingWindow")}: ${drinkStart}–${drinkEnd}. ${t("peakLabel")}: ${peakStart}–${peakEnd}. ${t("currentYear")}: ${currentYear}, ${maturityPhaseLabel}.`}
              style={{
                "--peak-left": `${peakLeft}%`,
                "--peak-width": `${Math.min(peakWidth, peakRightBound)}%`,
                "--current-left": `${currentYearLeft}%`,
                "--current-top": `${(currentArcTop / 170) * 100}%`,
                "--peak-center": `${peakCenter}%`,
                "--peak-top": `${(peakArcTop / 170) * 100}%`,
              } as CSSProperties}
            >
              <div className="maturity-horizon-status">
                <span>{maturityPhaseLabel}</span>
                <strong>{currentYear}</strong>
              </div>
              <div className="maturity-horizon-peak-zone" aria-hidden="true" />
              <svg className="maturity-horizon-curve" viewBox="0 0 520 170" preserveAspectRatio="none" aria-hidden="true">
                <defs>
                  <linearGradient id={`maturity-curve-${wine.id}`} x1="0" y1="0" x2="1" y2="0">
                    <stop offset="0%" stopColor="var(--drink-young)" />
                    <stop offset={`${peakLeft}%`} stopColor="var(--drink-young)" />
                    <stop offset={`${Math.min(peakLeft + Math.min(peakWidth, peakRightBound) / 2, 100)}%`} stopColor="var(--drink-ideal)" />
                    <stop offset={`${Math.min(peakLeft + Math.min(peakWidth, peakRightBound), 100)}%`} stopColor="var(--drink-ideal)" />
                    <stop offset="100%" stopColor="var(--drink-past)" />
                  </linearGradient>
                </defs>
                <path className="maturity-horizon-shadow" d="M18 122 C100 116 136 28 260 25 C384 28 420 116 502 122" />
                <path className="maturity-horizon-line" d="M18 122 C100 116 136 28 260 25 C384 28 420 116 502 122" stroke={`url(#maturity-curve-${wine.id})`} />
              </svg>
              <span className="maturity-horizon-peak" aria-hidden="true"><i /></span>
              <span className="maturity-horizon-current" aria-hidden="true"><i /></span>
              <div className="maturity-horizon-years" aria-hidden="true">
                <span>{drinkStart}</span>
                <span>{t("peakLabel")} {peakStart}-{peakEnd}</span>
                <span>{drinkEnd}</span>
              </div>
            </div>
            {wine.drink_window_notes ? <div className={`drink-window-copy${drinkNotesExpanded ? " is-expanded" : ""}`}>
              <p>{wine.drink_window_notes}</p>
              {wine.drink_window_notes.length > 180 ? <button type="button" className="secondary compact drink-window-copy-toggle" aria-expanded={drinkNotesExpanded} onClick={() => setDrinkNotesExpanded((current) => !current)}>
                {drinkNotesExpanded ? (locale === "it" ? "Mostra meno" : "Show less") : (locale === "it" ? "Mostra altro" : "Show more")}
              </button> : null}
            </div> : null}
          </div>
        ) : null}
      </div>

      {canWrite && wine.quantity > 0 ? <section className="wine-detail-quick-actions" aria-label={locale === "it" ? "Azioni sul vino" : "Wine actions"}>
        <div><span>{locale === "it" ? "Azioni rapide" : "Quick actions"}</span><strong>{locale === "it" ? "Cosa vuoi registrare?" : "What would you like to record?"}</strong></div>
        <div>
          {!restaurantMode ? <button type="button" onClick={() => revealAction("consume", consumePanelRef)}>{locale === "it" ? "Registra bevuta" : "Record tasting"}</button> : null}
          <button type="button" className={restaurantMode ? "" : "secondary"} onClick={() => revealAction("sale", salePanelRef)}>{locale === "it" ? "Registra vendita" : "Record sale"}</button>
          {restaurantMode ? <button type="button" className="secondary" onClick={() => revealAction("glass", glassSalePanelRef)}>{locale === "it" ? "Registra mescita" : "Record glasses"}</button> : null}
        </div>
      </section> : null}

      <details className="detail-overview-block wine-detail-view-section" data-wine-detail-section="01" tabIndex={-1}>
        <summary className="wine-detail-structured-summary">
          <div><span>01</span><strong>{locale === "it" ? "Identit\u00e0 e disponibilit\u00e0" : "Identity and availability"}</strong></div>
          <small>{locale === "it" ? "Formato, tipologia, acquisto e giacenza" : "Format, type, purchase and stock"}</small>
        </summary>
        {restaurantMode && canWrite ? <div className="restaurant-commercial-actions">
          {wine.commercial_status === "active" ? <button type="button" className="secondary compact" disabled={saving} onClick={() => void onUpdateCommercialStatus("clearing_out")}>{locale === "it" ? "Non riordinare più" : "Stop reordering"}</button> : null}
          {wine.commercial_status !== "active" ? <button type="button" className="secondary compact" disabled={saving} onClick={() => void onUpdateCommercialStatus("active")}>{locale === "it" ? "Riporta in carta" : "Return to list"}</button> : null}
        </div> : null}
        <div className="detail-grid detail-facts-grid">
          <DetailField label={t("format")} value={displayValue(wine.format, locale, "format")} emptyLabel={t("notSpecified")} />
          <DetailField label={t("type")} value={displayValue(wine.type, locale, "type")} emptyLabel={t("notSpecified")} />
          {!restaurantMode ? <DetailField label={t("rating")} value={wine.rating ? `${wine.rating}/6` : ""} emptyLabel={t("notSpecified")} /> : null}
          {restaurantMode ? <DetailField label={locale === "it" ? "Prezzo di vendita" : "Sale price"} value={wine.sale_price ? formatMoney(wine.sale_price, wine.currency, locale) : ""} emptyLabel={t("notSpecified")} /> : null}
          {restaurantMode ? <DetailField label={locale === "it" ? "Mescita" : "By the glass"} value={wine.glass_price ? `${formatMoney(wine.glass_price, wine.currency, locale)} · ${(wine.pour_size_ml / 100).toLocaleString(locale)} dl` : ""} emptyLabel={t("notSpecified")} /> : null}
          {restaurantMode ? <DetailField label={locale === "it" ? "Stato commerciale" : "Commercial status"} value={locale === "it" ? ({ active: "In carta", clearing_out: "A esaurimento", suspended: "Sospeso", off_list: "Fuori carta" }[wine.commercial_status] || "In carta") : ({ active: "On the list", clearing_out: "Clearing out", suspended: "Suspended", off_list: "Off list" }[wine.commercial_status] || "On the list")} emptyLabel={t("notSpecified")} /> : null}
          {restaurantMode ? <DetailField label={locale === "it" ? "Riordino" : "Reorder"} value={wine.reorder_enabled && wine.commercial_status === "active" ? `${locale === "it" ? "Attivo" : "Enabled"} · ${wine.reorder_threshold} ${locale === "it" ? "bottiglie" : "bottles"}` : (locale === "it" ? "Disattivato" : "Disabled")} emptyLabel={t("notSpecified")} /> : null}
          {restaurantMode && wine.open_bottle_ml > 0 ? <DetailField label={locale === "it" ? "Bottiglia aperta" : "Open bottle"} value={`${(wine.open_bottle_ml / 100).toLocaleString(locale)} dl`} emptyLabel={t("notSpecified")} /> : null}
          <DetailField label={t("delivery")} value={formatDisplayDate(wine.expected_delivery)} emptyLabel={t("notSpecified")} />
        </div>
      </details>

      <details className="detail-market-block wine-detail-view-section" data-wine-detail-section="02" tabIndex={-1}>
        <summary className="wine-detail-structured-summary">
          <div><span>02</span><strong>{locale === "it" ? "Prezzi e valore" : "Prices and value"}</strong></div>
          <small>{locale === "it" ? "Costo d'acquisto e andamento del valore" : "Purchase cost and value history"}</small>
        </summary>
        <div className="detail-grid detail-facts-grid">
          <DetailField label={t("purchasePrice")} value={formatMoney(wine.price, wine.currency, locale)} emptyLabel={t("notSpecified")} />
          <DetailField label={t("currentValue")} value={detailValue} emptyLabel={t("notSpecified")} />
          <DetailField label={t("merchant")} value={wine.merchant} emptyLabel={t("notSpecified")} />
        </div>
        <ValueHistoryChart wine={wine} t={t} locale={locale} />
        {marketAuditEntry && hasMarketEvidence ? (
          <div className="market-view-bar">
            <button type="button" className="secondary compact" onClick={() => onOpenMarketView(marketAuditEntry)}>
              {t("viewMarketSources")}
            </button>
          </div>
        ) : null}
      </details>

      {(wine.scores.length || wine.grapes.length || wine.tags.length) ? (
        <details className="detail-technical-block wine-detail-view-section" data-wine-detail-section="03" tabIndex={-1}>
          <summary className="wine-detail-structured-summary">
            <div><span>03</span><strong>{locale === "it" ? "Profilo e riconoscimenti" : "Profile and ratings"}</strong></div>
            <small>{locale === "it" ? "Uvaggi, punteggi e tag" : "Grapes, scores and tags"}</small>
          </summary>
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
              {wine.grapes_source_url ? (
                <small>
                  <a href={wine.grapes_source_url} target="_blank" rel="noreferrer">
                    {t("verifiedSource")}{wine.grapes_source_title ? `: ${wine.grapes_source_title}` : ""}
                  </a>
                  {wine.grapes_verified_at ? ` · ${formatDisplayDate(wine.grapes_verified_at)}` : ""}
                </small>
              ) : null}
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

        </details>
      ) : null}

      {!restaurantMode ? <WineStrategySection wine={wine} locale={locale} canWrite={canWrite} onChanged={onLotsChanged} /> : null}

      {canWrite && wine.quantity > 0 ? <section className="wine-detail-operations" hidden={!activeOperation}>
        {restaurantMode ? (<>
        <details className="detail-section consume-panel sale-panel" ref={salePanelRef} hidden={activeOperation !== "sale"}>
          <summary><span>{locale === "it" ? "Registra vendita" : "Record sale"}</span></summary>
          <p className="consume-help">{locale === "it" ? "Registra la vendita senza creare una degustazione. Il costo d’acquisto viene salvato come fotografia storica del margine." : "Record a sale without creating a tasting. Purchase cost is snapshotted for historical margin reporting."}</p>
          <form className="consume-form" onSubmit={submitSale}>
            <div className="detail-grid consume-grid">
              <label><span>{locale === "it" ? "Data vendita" : "Sale date"}</span><input type="date" value={saleDraft.sold_at} onChange={(event) => setSaleDraft({ ...saleDraft, sold_at: event.target.value })} disabled={saving} required /></label>
              <label><span>{locale === "it" ? "Bottiglie" : "Bottles"}</span><input type="number" min="1" max={wine.quantity} value={saleDraft.quantity} onChange={(event) => setSaleDraft({ ...saleDraft, quantity: event.target.value })} disabled={saving} required /></label>
              {storageOptions.length > 1 ? <label><span>{locale === "it" ? "Preleva da" : "Take from"}</span><select value={saleDraft.storage_allocation_id || ""} onChange={(event) => setSaleDraft({ ...saleDraft, storage_allocation_id: event.target.value })} required><option value="">—</option>{storageOptions.map((allocation) => <option key={allocation.id} value={allocation.id}>{storageOptionLabel(allocation)}</option>)}</select></label> : null}
              <label><span>{locale === "it" ? `Prezzo unitario (${wine.currency})` : `Unit price (${wine.currency})`}</span><input type="number" min="0" step="0.01" value={saleDraft.unit_sale_price} onChange={(event) => setSaleDraft({ ...saleDraft, unit_sale_price: event.target.value })} disabled={saving} required /></label>
            </div>
            <label><span>{locale === "it" ? "Nota vendita" : "Sale note"}</span><textarea rows={2} value={saleDraft.note} onChange={(event) => setSaleDraft({ ...saleDraft, note: event.target.value })} disabled={saving} /></label>
            <div className="form-actions"><button type="submit" disabled={saving || !saleDraft.unit_sale_price}><ButtonBusyContent busy={saving} idleLabel={locale === "it" ? "Registra vendita" : "Record sale"} busyLabel={t("working")} /></button></div>
          </form>
        </details>
        <details className="detail-section consume-panel sale-panel glass-sale-panel" ref={glassSalePanelRef} hidden={activeOperation !== "glass"}>
          <summary>
            <span>{locale === "it" ? "Mescita al bicchiere" : "Wine by the glass"}</span>
            <small>{(wine.pour_size_ml / 100).toLocaleString(locale)} dl</small>
          </summary>
          <p className="consume-help">
            {wine.open_bottle_ml > 0
              ? (locale === "it" ? `Bottiglia aperta: ${(wine.open_bottle_ml / 100).toLocaleString(locale)} dl disponibili.` : `Open bottle: ${(wine.open_bottle_ml / 100).toLocaleString(locale)} dl available.`)
              : (locale === "it" ? "La prima mescita apre automaticamente una bottiglia e ne traccia il residuo." : "The first pour automatically opens a bottle and tracks the remaining volume.")}
          </p>
          <form className="consume-form" onSubmit={submitGlassSale}>
            <div className="detail-grid consume-grid">
              <label><span>{locale === "it" ? "Data vendita" : "Sale date"}</span><input type="date" value={glassSaleDraft.sold_at} onChange={(event) => setGlassSaleDraft({ ...glassSaleDraft, sold_at: event.target.value })} disabled={saving} required /></label>
              <label><span>{locale === "it" ? "Calici" : "Glasses"}</span><input type="number" min="1" value={glassSaleDraft.quantity} onChange={(event) => setGlassSaleDraft({ ...glassSaleDraft, quantity: event.target.value })} disabled={saving} required /></label>
              {storageOptions.length > 1 && !wine.open_bottle_ml ? <label><span>{locale === "it" ? "Apri da" : "Open from"}</span><select value={glassSaleDraft.storage_allocation_id || ""} onChange={(event) => setGlassSaleDraft({ ...glassSaleDraft, storage_allocation_id: event.target.value })} required><option value="">—</option>{storageOptions.map((allocation) => <option key={allocation.id} value={allocation.id}>{storageOptionLabel(allocation)}</option>)}</select></label> : null}
              <label><span>{locale === "it" ? `Prezzo per calice (${wine.currency})` : `Price per glass (${wine.currency})`}</span><input type="number" min="0" step="0.01" value={glassSaleDraft.unit_sale_price} onChange={(event) => setGlassSaleDraft({ ...glassSaleDraft, unit_sale_price: event.target.value })} disabled={saving} required /></label>
            </div>
            <label><span>{locale === "it" ? "Nota vendita" : "Sale note"}</span><textarea rows={2} value={glassSaleDraft.note} onChange={(event) => setGlassSaleDraft({ ...glassSaleDraft, note: event.target.value })} disabled={saving} /></label>
            <div className="form-actions"><button type="submit" disabled={saving || !glassSaleDraft.unit_sale_price}><ButtonBusyContent busy={saving} idleLabel={locale === "it" ? "Registra mescita" : "Record glasses"} busyLabel={t("working")} /></button></div>
          </form>
        </details>
      </>) : (
        <details className="detail-section consume-panel" ref={consumePanelRef} hidden={activeOperation !== "consume"}>
          <summary>
            <span>{locale === "it" ? "Registra bevuta" : "Record tasting"}</span>
          </summary>
          <p className="consume-help">{t("consumeBottleHelp")}</p>
          <form className="consume-form" onSubmit={submitConsume}>
            <div className="detail-grid consume-grid">
              <label>
                <span>{t("tastingDate")}</span>
                <LocalizedDateInput value={consumeDraft.consumed_at} onChange={(consumed_at) => setConsumeDraft({ ...consumeDraft, consumed_at })} locale={locale} disabled={saving} />
              </label>
              {storageOptions.length > 1 ? <label><span>{locale === "it" ? "Preleva da" : "Take from"}</span><select value={consumeDraft.storage_allocation_id || ""} onChange={(event) => setConsumeDraft({ ...consumeDraft, storage_allocation_id: event.target.value })} required><option value="">—</option>{storageOptions.map((allocation) => <option key={allocation.id} value={allocation.id}>{storageOptionLabel(allocation)}</option>)}</select></label> : null}
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
              <label className="tasting-enjoyment-field">
                <span>{t("tastingEnjoyment")}</span>
                <TastingEnjoymentInput
                  value={consumeDraft.tasting_enjoyment}
                  disabled={saving}
                  t={t}
                  onChange={(value) => setConsumeDraft({ ...consumeDraft, tasting_enjoyment: value })}
                />
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
      )}

      {!restaurantMode ? (
        <details className="detail-section consume-panel sale-panel" ref={salePanelRef} hidden={activeOperation !== "sale"}>
          <summary><span>{locale === "it" ? "Registra vendita" : "Record sale"}</span></summary>
          <p className="consume-help">{locale === "it" ? "Registra una o più bottiglie vendute. La quantità iniziale è 1 e non può superare la giacenza disponibile." : "Record one or more sold bottles. Quantity starts at 1 and cannot exceed available stock."}</p>
          <form className="consume-form" onSubmit={submitSale}>
            <div className="detail-grid consume-grid">
              <label><span>{locale === "it" ? "Data vendita" : "Sale date"}</span><input type="date" value={saleDraft.sold_at} onChange={(event) => setSaleDraft({ ...saleDraft, sold_at: event.target.value })} disabled={saving} required /></label>
              <label><span>{locale === "it" ? "Bottiglie vendute" : "Bottles sold"}</span><input type="number" min="1" max={wine.quantity} value={saleDraft.quantity} onChange={(event) => setSaleDraft({ ...saleDraft, quantity: event.target.value })} disabled={saving} required /></label>
              {storageOptions.length > 1 ? <label><span>{locale === "it" ? "Preleva da" : "Take from"}</span><select value={saleDraft.storage_allocation_id || ""} onChange={(event) => setSaleDraft({ ...saleDraft, storage_allocation_id: event.target.value })} required><option value="">—</option>{storageOptions.map((allocation) => <option key={allocation.id} value={allocation.id}>{storageOptionLabel(allocation)}</option>)}</select></label> : null}
              <label><span>{locale === "it" ? `Prezzo unitario (${wine.currency})` : `Unit price (${wine.currency})`}</span><input type="number" min="0" step="0.01" value={saleDraft.unit_sale_price} onChange={(event) => setSaleDraft({ ...saleDraft, unit_sale_price: event.target.value })} disabled={saving} required /></label>
            </div>
            <label><span>{locale === "it" ? "Nota vendita" : "Sale note"}</span><textarea rows={2} value={saleDraft.note} onChange={(event) => setSaleDraft({ ...saleDraft, note: event.target.value })} disabled={saving} /></label>
            <div className="form-actions"><button type="submit" disabled={saving || !saleDraft.unit_sale_price}><ButtonBusyContent busy={saving} idleLabel={locale === "it" ? "Registra vendita" : "Record sale"} busyLabel={t("working")} /></button></div>
          </form>
        </details>
      ) : null}
      </section> : null}

      <details className="detail-section wine-detail-group wine-detail-group--stock" data-wine-detail-section="05" tabIndex={-1}>
        <summary className="wine-detail-structured-summary"><div><span>05</span><strong>{locale === "it" ? "Giacenza e acquisti" : "Stock and purchases"}</strong></div><small>{locale === "it" ? "Posizione, lotti e costi" : "Location, lots and costs"}</small></summary>
        <WineStorageSection wine={wine} canWrite={canWrite} locale={locale} onChanged={onLotsChanged} focusRequestId={focusStorageRequestId} />
        {!restaurantMode ? <WineLotsSection wine={wine} canWrite={canWrite} saving={saving} locale={locale} onChanged={onLotsChanged} /> : null}
      </details>

      {(wine.ai_notes || wine.ai_value_notes || wine.notes || coOwnershipSection || (!restaurantMode && wine.tasting_history?.length)) ? <details className="detail-section wine-detail-group wine-detail-group--history" data-wine-detail-section="06" tabIndex={-1}>
        <summary className="wine-detail-structured-summary"><div><span>06</span><strong>{locale === "it" ? "Note e storia" : "Notes and history"}</strong></div><small>{locale === "it" ? "Degustazioni, appunti e propriet\u00e0" : "Tastings, notes and ownership"}</small></summary>
        {wine.ai_notes || wine.ai_value_notes || wine.notes ? <div className="notes-grid">
          {wine.notes ? <DetailNote title={t("notes")}>{wine.notes}</DetailNote> : null}
          {wine.ai_notes ? <DetailNote title={t("aiNotes")}>{wine.ai_notes}</DetailNote> : null}
          {wine.ai_value_notes ? <DetailNote title={t("value")}>{wine.ai_value_notes}</DetailNote> : null}
        </div> : null}

        {coOwnershipSection}

        {!restaurantMode ? <TastingHistorySection
        wine={wine}
        entries={wine.tasting_history || []}
        canWrite={canWrite}
        saving={saving}
        onUpdateEntry={onUpdateTastingEntry}
        onDeleteEntry={onDeleteTastingEntry}
        t={t}
        locale={locale}
        /> : null}
      </details> : null}

      <details className="detail-section ai-audit-detail" data-wine-detail-section="07" tabIndex={-1}>
        <summary className="wine-detail-structured-summary">
          <div><span>07</span><strong>{t("aiAudit")}</strong></div>
          <strong>{auditEntries.length}</strong>
        </summary>
        {auditEntries.length ? (
          <div className="audit-list">
            {auditEntries.map((entry) => (
              <div className="audit-row" key={entry.id}>
                <strong>{entry.feature.replace(/_/g, " ")}</strong>
                <span>{entry.model} · {t("reasoningEffort")}: {t(reasoningEffortTranslationKey(entry.reasoning_effort))} - {formatDisplayDate(entry.created_at)} - {entry.total_tokens.toLocaleString()} {t("tokens")} - {formatUsd(entry.estimated_cost_usd)}</span>
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

export function WishlistDetail({
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
  const offerPrice = item.offer_price ? formatMoney(item.offer_price, item.currency, locale) : "";
  const investmentAmount = item.investment_amount ? formatMoney(item.investment_amount, item.currency, locale) : "";
  const hasMarketEvidence = marketAuditEntry ? auditMarketSources(marketAuditEntry).length > 0 || Boolean(auditMarketNote(marketAuditEntry)) : false;
  const latestStrategyAudit = auditEntries
    .filter((entry) => entry.feature === "wishlist_strategy")
    .sort((first, second) => second.created_at.localeCompare(first.created_at))[0];
  const latestPurposeAudit = auditEntries
    .filter((entry) => entry.feature === "wishlist_purpose")
    .sort((first, second) => second.created_at.localeCompare(first.created_at))[0];
  const strategyGeneratedAt = item.ai_strategy_generated_at || latestStrategyAudit?.created_at || "";
  const purposeGeneratedAt = item.ai_purpose_generated_at || latestPurposeAudit?.created_at || "";
  const strategyLabel = marketAuditEntry ? (locale === "it" ? "Valutazione offerta AI" : "AI offer evaluation") : t("aiStrategy");
  const strategyTitle = strategyGeneratedAt ? `${strategyLabel} - ${t("generatedAt")} ${formatDisplayDate(strategyGeneratedAt)}` : strategyLabel;
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
          <span>{offerPrice ? (locale === "it" ? "PREZZO OFFERTO" : "OFFER PRICE") : (locale === "it" ? "PREZZO MASSIMO" : "MAXIMUM PRICE")}</span>
          <strong className="wishlist-price">{offerPrice || formatMoney(item.target_price, item.currency, locale)}</strong>
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
          <ButtonBusyContent busy={generating === "target-price"} idleLabel={locale === "it" ? "Analizza offerta" : "Analyse offer"} busyLabel={t("generating")} />
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
        <DetailField label={locale === "it" ? "Prezzo offerto" : "Offer price"} value={offerPrice} emptyLabel={t("notSpecified")} />
        <DetailField label={locale === "it" ? "Prezzo massimo" : "Maximum price"} value={formatMoney(item.target_price, item.currency, locale)} emptyLabel={t("notSpecified")} />
        <DetailField label={locale === "it" ? "Capitale da investire" : "Investment budget"} value={investmentAmount} emptyLabel={t("notSpecified")} />
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
                <span>{entry.model} · {t("reasoningEffort")}: {t(reasoningEffortTranslationKey(entry.reasoning_effort))} - {formatDisplayDate(entry.created_at)} - {entry.total_tokens.toLocaleString()} {t("tokens")} - {formatUsd(entry.estimated_cost_usd)}</span>
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

export function WishlistPortfolioStrategyPanel({
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
            <h2>{t("wishlistPortfolioStrategy")}</h2>
            {strategy ? (
              <span className={`wishlist-strategy-status${strategy.stale ? " is-stale" : ""}`}>
                {strategy.stale ? `${t("wishlistStrategyOutdated")} · ${generatedAtLabel}` : generatedAtLabel}
              </span>
            ) : <span>{t("wishlistPortfolioStrategyHelp")}</span>}
            {strategy && !open ? (
              <div className="wishlist-strategy-preview">
                <div className="wishlist-strategy-preview-meta">
                  <strong>{strategy.item_count}</strong>
                  <span>{t("records")}</span>
                  <strong>{formatAiBudget(strategy.estimated_cost_usd)}</strong>
                  <span>{strategy.model} · {t("reasoningEffort")}: {t(reasoningEffortTranslationKey(strategy.reasoning_effort))}</span>
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
            <span>{strategy.model} · {t("reasoningEffort")}: {t(reasoningEffortTranslationKey(strategy.reasoning_effort))}</span>
            {generatedAtLabel ? <span>{generatedAtLabel}</span> : null}
          </div>
        </>
      ) : (
        <p className="empty-state">{t("noWishlistPortfolioStrategy")}</p>
      )}
    </details>
  );
}

export function AiUsageRow({ label, bucket }: { label: string; bucket: AiUsageBucket }) {
  return (
    <div className="usage-row">
      <strong>{label}</strong>
      <span>{bucket.requests} req</span>
      <span>{bucket.total_tokens.toLocaleString()} tokens</span>
      <span>{formatUsd(bucket.estimated_cost_usd)}</span>
    </div>
  );
}

export function ContactSupportPanel({
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

export function DashboardCarousel({
  label,
  children,
  className,
}: {
  label: string;
  children: ReactNode;
  className?: string;
}) {
  const cards = Children.toArray(children);
  const [activeIndex, setActiveIndex] = useState(0);
  const carouselRef = useRef<HTMLElement | null>(null);

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

  function goToCard(index: number) {
    const container = carouselRef.current;
    const item = container?.children[index] as HTMLElement | undefined;
    if (!container || !item) return;
    container.scrollTo({ left: item.offsetLeft, behavior: "smooth" });
    setActiveIndex(index);
  }

  return (
    <div className={["dashboard-carousel-shell", className].filter(Boolean).join(" ")}>
      <section className="dashboard-grid" aria-label={label} onScroll={updateActiveIndex} ref={carouselRef}>
        {children}
      </section>
      {cards.length > 1 ? (
        <div className="dashboard-dots" aria-label={label}>
          {cards.map((_, index) => (
            <button
              type="button"
              className={index === activeIndex ? "active" : ""}
              key={index}
              aria-label={`${label} ${index + 1}`}
              aria-current={index === activeIndex ? "true" : undefined}
              onClick={() => goToCard(index)}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}
