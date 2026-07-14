import { Children, useEffect, useRef, useState } from "react";
import type { CSSProperties, Dispatch, FormEvent, ReactNode, SetStateAction, UIEvent } from "react";
import { CircleMarker, MapContainer, TileLayer, Tooltip } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import { AppIcon } from "./AppIcon";
import { ButtonBusyContent, DetailField, LoadingState, RatingInput, StarRating, TastingEnjoymentBadge, TastingEnjoymentInput, WineStatusBadge } from "./AppUi";
import { clipUiText, consumeDraftFromTastingEntry, emptyConsumeWineDraft, formatAiBudget, formatDisplayDate, formatGrape, formatMoney, formatUsd, grapesSvgIcon, readableLegacyAiText, wineTone } from "./panelSupport";
import { displayValue } from "../i18n";
import type { TranslationKey } from "../i18n";
import type { AiAuditLog, AiUsageBucket, ConsumeWineDraft, ContactSupportDraft, Locale, MarketViewContext, Session, TastingArchiveApiItem, TastingArchiveEntry, UserAdminStats, Wine, WineAiFeature, WineCompareAiResult, WineDraft, WishlistDraft, WishlistItem, WishlistPortfolioStrategy } from "../types";
import { formatBottleCount, formatPercentage, numberLocale, recognitionSuggestionLabel, wineQuantityLabel } from "../domain/cellar";
import { rawNullableString, rawNumber, rawString } from "../services/offlineBackup";
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

export function ValueHistoryChart({ wine, t }: { wine: Wine; t: (key: TranslationKey) => string }) {
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
  const chartPoints = entries.map((entry) => {
    const x = entries.length === 1 ? 50 : 8 + ((entry.dateMs - startDate) / dateSpan) * 84;
    const y = minValue === maxValue ? 50 : 82 - ((entry.numericValue - minValue) / valueSpan) * 64;
    return { entry, x, y };
  });
  const points = chartPoints.map((point) => `${point.x.toFixed(2)},${point.y.toFixed(2)}`).join(" ");
  const areaPoints = `8,82 ${points} 92,82`;
  const first = entries[0];
  const last = entries[entries.length - 1];
  const deltaValue = last.numericValue - first.numericValue;
  const deltaPercent = first.numericValue > 0 ? (deltaValue / first.numericValue) * 100 : 0;
  const deltaPositive = deltaValue >= 0;
  const sourceLabels: Record<string, string> = {
    ai: "AI",
    imported: "Import",
    manual: "Manual",
    shared: "Share",
  };

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
      <svg className="value-history-chart" viewBox="0 0 100 90" role="img" aria-label={t("valueEvolution")}>
        <defs>
          <linearGradient id={`valueLine-${wine.id}`} x1="8" y1="18" x2="92" y2="82" gradientUnits="userSpaceOnUse">
            <stop stopColor="var(--primary)" />
            <stop offset="1" stopColor="var(--accent)" />
          </linearGradient>
          <linearGradient id={`valueArea-${wine.id}`} x1="0" y1="18" x2="0" y2="82" gradientUnits="userSpaceOnUse">
            <stop stopColor="var(--primary)" stopOpacity="0.24" />
            <stop offset="1" stopColor="var(--accent)" stopOpacity="0.03" />
          </linearGradient>
        </defs>
        <line className="chart-grid-line" x1="8" y1="18" x2="92" y2="18" />
        <line className="chart-grid-line" x1="8" y1="50" x2="92" y2="50" />
        <line className="chart-axis-line" x1="8" y1="82" x2="92" y2="82" />
        <line className="chart-axis-line" x1="8" y1="18" x2="8" y2="82" />
        <polygon className="value-history-area" points={areaPoints} fill={`url(#valueArea-${wine.id})`} />
        <polyline className="value-history-line" points={points} stroke={`url(#valueLine-${wine.id})`} />
        {chartPoints.map(({ entry, x, y }, index) => (
          <g key={entry.id} className={index === chartPoints.length - 1 ? "value-history-point latest" : "value-history-point"}>
            <circle className="point-halo" cx={x} cy={y} r="4.6" />
            <circle className="point-core" cx={x} cy={y} r="2.2" />
          </g>
        ))}
      </svg>
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
    grapes_source_url: "",
    grapes_source_title: "",
    grapes_verified_at: null,
    scores: [],
    scores_not_applicable: false,
    tasting_history: [],
    value_history: [],
  };
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
  onToggleScoresAiExclusion,
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
  onToggleScoresAiExclusion: (excluded: boolean) => void;
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
  const detailValue = formatMoney(wine.current_value || wine.price, wine.currency, locale);

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
      <div className="detail-hero">
        <div className="detail-title">
          <div>
            <p className="eyebrow">{t("wineDetail")}</p>
            <h2><i className={`wine-dot tone-${wineTone(wine.type)}`} />{wine.name}</h2>
            {wine.rating ? <StarRating value={wine.rating} label={t("rating")} /> : null}
            <span>{[wine.producer, wine.vintage, wine.region, wine.appellation].filter(Boolean).join(" - ")}</span>
          </div>
          <strong>{detailValue}</strong>
        </div>

        <div className="detail-hero-metrics">
          <div className="detail-hero-metric">
            <span>{t("status")}</span>
            <strong><WineStatusBadge status={wine.status} locale={locale} /></strong>
          </div>
          <div className="detail-hero-metric">
            <span>{t("quantity")}</span>
            <strong>{wineQuantityLabel(wine, session, t("bottles").toLowerCase(), locale)}</strong>
          </div>
      </div>

      <div className="detail-preference-bar">
        <label className="detail-toggle-row">
          <input
            type="checkbox"
            checked={wine.scores_not_applicable}
            disabled={!canWrite || saving}
            onChange={(event) => onToggleScoresAiExclusion(event.target.checked)}
          />
          <span>{t("excludeFromAiScores")}</span>
        </label>
        {wine.scores_not_applicable ? <small>{t("excludedFromAiScores")}</small> : null}
      </div>

      {(wine.drink_from || wine.drink_to) ? (
          <div className="drink-window detail-hero-window">
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
      </div>

      <div className="detail-overview-block">
        <div className="detail-grid detail-facts-grid">
          <DetailField label={t("format")} value={displayValue(wine.format, locale, "format")} emptyLabel={t("notSpecified")} />
          <DetailField label={t("type")} value={displayValue(wine.type, locale, "type")} emptyLabel={t("notSpecified")} />
          <DetailField label={t("rating")} value={wine.rating ? `${wine.rating}/6` : ""} emptyLabel={t("notSpecified")} />
          <DetailField label={t("purchasePrice")} value={formatMoney(wine.price, wine.currency, locale)} emptyLabel={t("notSpecified")} />
          <DetailField label={t("merchant")} value={wine.merchant} emptyLabel={t("notSpecified")} />
          <DetailField label={t("delivery")} value={formatDisplayDate(wine.expected_delivery)} emptyLabel={t("notSpecified")} />
        </div>
      </div>

      <div className="detail-market-block">
        <ValueHistoryChart wine={wine} t={t} />
        {marketAuditEntry && hasMarketEvidence ? (
          <div className="market-view-bar">
            <button type="button" className="secondary compact" onClick={() => onOpenMarketView(marketAuditEntry)}>
              {t("viewMarketSources")}
            </button>
          </div>
        ) : null}
      </div>

      {(wine.scores.length || wine.grapes.length || wine.tags.length || ownershipRows(wine).length) ? (
        <div className="detail-technical-block">
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
        </div>
      ) : null}

      <div className="ai-actions detail-ai-actions">
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
        <button type="button" className="secondary compact" disabled={!canGenerate || Boolean(generating) || wine.scores_not_applicable} onClick={() => onGenerate("scores")}>
          <ButtonBusyContent busy={generating === "scores"} idleLabel={wine.scores.length ? t("findMoreScores") : t("scores")} busyLabel={t("generating")} />
        </button>
      </div>
      {generating ? <LoadingState label={t("generating")} compact /> : null}

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

type WineRegionLocation = { latitude: number; longitude: number };

const wineRegionLocations: Record<string, WineRegionLocation> = {
  bordeaux: { latitude: 44.84, longitude: -0.58 }, medoc: { latitude: 45.22, longitude: -0.78 }, margaux: { latitude: 45.04, longitude: -0.67 }, pauillac: { latitude: 45.2, longitude: -0.75 }, "saint-estephe": { latitude: 45.19, longitude: -0.77 }, "saint-estèphe": { latitude: 45.19, longitude: -0.77 }, "saint-emilion": { latitude: 44.89, longitude: -0.16 }, "saint-émilion": { latitude: 44.89, longitude: -0.16 }, pomerol: { latitude: 44.93, longitude: -0.2 }, graves: { latitude: 44.68, longitude: -0.5 }, sauternes: { latitude: 44.53, longitude: -0.34 },
  burgundy: { latitude: 47.05, longitude: 4.84 }, bourgogne: { latitude: 47.05, longitude: 4.84 }, chablis: { latitude: 47.81, longitude: 3.8 }, "cote d'or": { latitude: 47.18, longitude: 4.95 }, "côte d'or": { latitude: 47.18, longitude: 4.95 }, champagne: { latitude: 49.05, longitude: 3.96 }, rhone: { latitude: 44.5, longitude: 4.87 }, "rhône": { latitude: 44.5, longitude: 4.87 }, loire: { latitude: 47.39, longitude: 0.69 }, alsace: { latitude: 48.17, longitude: 7.3 }, provence: { latitude: 43.53, longitude: 6.3 }, languedoc: { latitude: 43.61, longitude: 3.88 }, roussillon: { latitude: 42.7, longitude: 2.9 }, jura: { latitude: 46.74, longitude: 5.91 },
  piemonte: { latitude: 44.7, longitude: 7.85 }, piedmont: { latitude: 44.7, longitude: 7.85 }, barolo: { latitude: 44.61, longitude: 7.94 }, barbaresco: { latitude: 44.72, longitude: 8.08 }, toscana: { latitude: 43.47, longitude: 11.26 }, tuscany: { latitude: 43.47, longitude: 11.26 }, chianti: { latitude: 43.58, longitude: 11.32 }, montalcino: { latitude: 43.06, longitude: 11.49 }, bolgheri: { latitude: 43.24, longitude: 10.6 }, veneto: { latitude: 45.44, longitude: 11.0 }, valpolicella: { latitude: 45.52, longitude: 10.95 }, friuli: { latitude: 46.12, longitude: 13.2 }, sicilia: { latitude: 37.6, longitude: 14.02 }, sicily: { latitude: 37.6, longitude: 14.02 }, sardegna: { latitude: 40.12, longitude: 9.01 }, puglia: { latitude: 40.79, longitude: 17.1 }, campania: { latitude: 40.84, longitude: 14.25 }, abruzzo: { latitude: 42.35, longitude: 13.4 }, trentino: { latitude: 46.07, longitude: 11.12 }, lombardia: { latitude: 45.47, longitude: 9.19 }, franciacorta: { latitude: 45.64, longitude: 10.05 },
  ticino: { latitude: 46.0, longitude: 8.95 }, vallese: { latitude: 46.23, longitude: 7.36 }, valais: { latitude: 46.23, longitude: 7.36 }, vaud: { latitude: 46.62, longitude: 6.53 }, ginevra: { latitude: 46.2, longitude: 6.15 }, geneva: { latitude: 46.2, longitude: 6.15 }, grigioni: { latitude: 46.8, longitude: 9.84 }, graubunden: { latitude: 46.8, longitude: 9.84 }, graubünden: { latitude: 46.8, longitude: 9.84 },
  rioja: { latitude: 42.46, longitude: -2.45 }, "ribera del duero": { latitude: 41.68, longitude: -3.69 }, priorat: { latitude: 41.16, longitude: 0.93 }, penedes: { latitude: 41.35, longitude: 1.7 }, penedès: { latitude: 41.35, longitude: 1.7 }, catalunya: { latitude: 41.65, longitude: 1.52 }, catalonia: { latitude: 41.65, longitude: 1.52 }, galicia: { latitude: 42.8, longitude: -8.0 }, "rias baixas": { latitude: 42.49, longitude: -8.7 }, "rías baixas": { latitude: 42.49, longitude: -8.7 }, jerez: { latitude: 36.68, longitude: -6.14 },
  douro: { latitude: 41.16, longitude: -7.73 }, porto: { latitude: 41.16, longitude: -7.73 }, alentejo: { latitude: 38.57, longitude: -7.91 }, dao: { latitude: 40.52, longitude: -7.87 }, "dão": { latitude: 40.52, longitude: -7.87 }, mosel: { latitude: 49.92, longitude: 6.96 }, pfalz: { latitude: 49.32, longitude: 8.12 }, rheingau: { latitude: 50.02, longitude: 8.04 }, baden: { latitude: 48.1, longitude: 7.85 }, burgenland: { latitude: 47.49, longitude: 16.57 }, wachau: { latitude: 48.36, longitude: 15.46 }, styria: { latitude: 47.15, longitude: 15.33 },
  "napa valley": { latitude: 38.5, longitude: -122.27 }, napa: { latitude: 38.5, longitude: -122.27 }, sonoma: { latitude: 38.29, longitude: -122.46 }, oregon: { latitude: 45.52, longitude: -123.08 }, washington: { latitude: 46.28, longitude: -119.29 }, mendocino: { latitude: 39.31, longitude: -123.41 }, california: { latitude: 36.78, longitude: -119.42 }, mendoza: { latitude: -33.04, longitude: -68.88 }, maipo: { latitude: -33.58, longitude: -70.62 }, colchagua: { latitude: -34.5, longitude: -71.28 },
  barossa: { latitude: -34.53, longitude: 138.96 }, "margaret river": { latitude: -33.95, longitude: 115.07 }, "yarra valley": { latitude: -37.67, longitude: 145.43 }, marlborough: { latitude: -41.51, longitude: 173.96 }, stellenbosch: { latitude: -33.93, longitude: 18.86 },
};

function normalizedMapRegion(value: string) {
  return value.trim().toLocaleLowerCase().replace(/\s+/g, " ");
}

function wineRegionLocation(wine: Wine) {
  const candidates = [wine.region, wine.appellation]
    .map(normalizedMapRegion)
    .filter(Boolean);
  return candidates.map((candidate) => {
    if (wineRegionLocations[candidate]) return wineRegionLocations[candidate];
    const matchingKey = Object.keys(wineRegionLocations)
      .sort((first, second) => second.length - first.length)
      .find((key) => candidate.includes(key));
    return matchingKey ? wineRegionLocations[matchingKey] : null;
  }).find(Boolean) || null;
}

export function WineGeographyMap({ wines, t }: { wines: Wine[]; t: (key: TranslationKey) => string }) {
  const markers = new Map<string, { label: string; location: WineRegionLocation; wines: number; bottles: number }>();
  wines.forEach((wine) => {
    const location = wineRegionLocation(wine);
    const label = wine.region.trim() || wine.appellation.trim();
    if (!location || !label) return;
    const key = `${label}:${location.latitude}:${location.longitude}`;
    const current = markers.get(key) || { label, location, wines: 0, bottles: 0 };
    current.wines += 1;
    current.bottles += Math.max(Number(wine.quantity || 0), 0);
    markers.set(key, current);
  });
  const points = [...markers.values()].sort((first, second) => second.bottles - first.bottles);

  if (!points.length) return <p className="empty-state">{t("geographicMapEmpty")}</p>;

  return (
    <div className="wine-geography-map" aria-label={t("geographicMap")}>
      <MapContainer center={[24, 8]} zoom={2} minZoom={2} maxZoom={12} scrollWheelZoom className="wine-geography-leaflet">
        <TileLayer
          attribution={'&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'}
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        {points.map((point) => (
          <CircleMarker
            key={`${point.label}:${point.location.latitude}:${point.location.longitude}`}
            center={[point.location.latitude, point.location.longitude]}
            radius={Math.min(22, 7 + Math.sqrt(Math.max(point.bottles, 1)) * 2.25)}
            pathOptions={{ color: "#fff7ef", weight: 2, fillColor: "#9b3123", fillOpacity: 0.84 }}
          >
            <Tooltip direction="top" offset={[0, -8]} opacity={0.96}>
              <strong>{point.label}</strong><br />
              {point.wines} {t("wines").toLowerCase()} · {point.bottles} {t("bottles").toLowerCase()}
            </Tooltip>
          </CircleMarker>
        ))}
      </MapContainer>
      <p>{t("geographicMapHelp")}</p>
    </div>
  );
}

export function DashboardCarousel({ label, children }: { label: string; children: ReactNode }) {
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
    <div className="dashboard-carousel-shell">
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
