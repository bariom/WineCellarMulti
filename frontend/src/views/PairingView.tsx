import { FormEvent, useEffect, useState } from "react";
import { FeatureIcon } from "../components/AppIcon";
import { EmptyState } from "../components/AppUi";
import { reasoningEffortTranslationKey } from "../i18n";

type WineLike = {
  id: string;
  name: string;
  producer: string;
  current_value: string | null;
  price: string;
  photo_thumbnail_url: string;
};

type PairingResult = {
  summary: string;
  model: string;
  reasoning_effort: string;
  cellar_matches: Array<{ wine_id: string; wine_name: string; producer: string; reason: string; serving_note: string }>;
  market_recommendations: Record<string, Array<{ name: string; producer: string; price_hint: string; reason: string }>>;
  dish_recommendations: Array<{ name: string; description: string; why_it_works: string; dietary_note: string }>;
  estimated_cost_usd: string;
};

type AiSettingsDraft = {
  pairing_preferences: string;
};

type PairingViewProps = {
  activePairingBudget: number;
  aiSettingsDraft: AiSettingsDraft;
  canGenerateAi: boolean;
  canWriteWine: boolean;
  generatingAi: string;
  hasPairingBudget: boolean;
  isMobileViewport: boolean;
  locale: "en" | "it";
  pairingBudgetPresets: number[];
  pairingBudgetSliderMax: number;
  pairingBudgetSliderValue: number;
  pairingDish: string;
  pairingTargetWine: WineLike | null;
  pairingIgnorePreferences: boolean;
  pairingIncludeMarket: boolean;
  pairingLocalOrigin: string;
  pairingMarketOnly: boolean;
  pairingOnlyIdealDrinkWindow: boolean;
  pairingMaxPrice: string;
  pairingPreferLocal: boolean;
  pairingResult: PairingResult | null;
  saving: boolean;
  savedPairingPreferences: string;
  wines: WineLike[];
  formatAiBudget: (value: string | number) => string;
  onGeneratePairing: (event: FormEvent<HTMLFormElement>, context?: [string | null, string, string]) => void;
  onOpenWine: (wine: any) => void;
  onSavePairingPreferences: () => void;
  setAiSettingsDraft: (value: any) => void;
  setPairingDish: (value: string) => void;
  setPairingTargetWine: (value: string | null) => void;
  setPairingIgnorePreferences: (value: boolean) => void;
  setPairingIncludeMarket: (value: boolean) => void;
  setPairingLocalOrigin: (value: string) => void;
  setPairingMarketOnly: (value: boolean) => void;
  setPairingOnlyIdealDrinkWindow: (value: boolean) => void;
  setPairingMaxPrice: (value: string) => void;
  setPairingPreferLocal: (value: boolean) => void;
  t: (key: any) => string;
};

function parsePriceHintAmount(value: string) {
  const match = value.replace("'", "").match(/(\d+(?:[.,]\d+)?)/);
  if (!match) return null;
  const parsed = Number(match[1].replace(",", "."));
  return Number.isFinite(parsed) ? parsed : null;
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
      <span>{busy ? busyLabel : idleLabel}</span>
    </span>
  );
}

function LoadingState({ label, compact = false }: { label: string; compact?: boolean }) {
  return (
    <div className={`loading-state${compact ? " compact" : ""}`} role="status" aria-live="polite">
      <span>{label}</span>
    </div>
  );
}

function SommelierAiIllustration() {
  return <img src="/images/sommelier_ai.png" alt="Sommelier AI" loading="lazy" />;
}

export default function PairingView({
  activePairingBudget,
  aiSettingsDraft,
  canGenerateAi,
  canWriteWine,
  formatAiBudget,
  generatingAi,
  hasPairingBudget,
  isMobileViewport,
  locale,
  onGeneratePairing,
  onOpenWine,
  onSavePairingPreferences,
  pairingBudgetPresets,
  pairingBudgetSliderMax,
  pairingBudgetSliderValue,
  pairingDish,
  pairingTargetWine,
  pairingIgnorePreferences,
  pairingIncludeMarket,
  pairingLocalOrigin,
  pairingMarketOnly,
  pairingOnlyIdealDrinkWindow,
  pairingMaxPrice,
  pairingPreferLocal,
  pairingResult,
  saving,
  savedPairingPreferences,
  setAiSettingsDraft,
  setPairingDish,
  setPairingTargetWine,
  setPairingIgnorePreferences,
  setPairingIncludeMarket,
  setPairingLocalOrigin,
  setPairingMarketOnly,
  setPairingOnlyIdealDrinkWindow,
  setPairingMaxPrice,
  setPairingPreferLocal,
  t,
  wines,
}: PairingViewProps) {
  const [pairingDietaryPreferences, setPairingDietaryPreferences] = useState("");
  const [pairingAllergies, setPairingAllergies] = useState("");
  const [pairingSetupOpen, setPairingSetupOpen] = useState(true);
  const isWineFirstPairing = Boolean(pairingTargetWine);
  const pairingCopy = locale === "it"
    ? {
        forWine: "Piatti per questo vino", changeMode: "Scegli un piatto invece", setup: "Preferenze e vincoli", preferences: "Preferenze alimentari", preferencesPlaceholder: "Es. vegetariano, pescetariano, gradisco il piccante",
        allergies: "Allergie o ingredienti da evitare", allergiesPlaceholder: "Es. frutta a guscio, crostacei, lattosio", allergiesHelp: "Indica allergie o restrizioni per escluderle dai suggerimenti.", dishes: "Piatti suggeriti",
      }
    : {
        forWine: "Dishes for this wine", changeMode: "Choose a dish instead", setup: "Preferences and restrictions", preferences: "Food preferences", preferencesPlaceholder: "E.g. vegetarian, pescatarian, spicy food welcome",
        allergies: "Allergies or ingredients to avoid", allergiesPlaceholder: "E.g. nuts, shellfish, lactose", allergiesHelp: "Tell us any allergies or restrictions so they can be excluded from the suggestions.", dishes: "Suggested dishes",
      };
  useEffect(() => {
    if (isWineFirstPairing && pairingResult?.dish_recommendations.length) setPairingSetupOpen(false);
  }, [isWineFirstPairing, pairingResult?.dish_recommendations.length]);
  const pairingPreviewLimit = 3;
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
  const pairingResultCount = isWineFirstPairing ? (pairingResult?.dish_recommendations.length || 0) : pairingPreviewItems.length;
  function selectPairingContext(marketOnly: boolean) {
    setPairingMarketOnly(marketOnly);
    if (!marketOnly) {
      setPairingPreferLocal(false);
      setPairingLocalOrigin("");
    }
  }
  const pairingDishSummary = pairingResult?.dish_recommendations.length
    ? pairingResult.dish_recommendations.map((dish) => dish.name).join(" · ")
    : "";

  return (
    <section className="pairing-card">
      <div className="card-heading pairing-page-heading">
        <div className="pairing-page-title">
          <span className="pairing-page-icon"><FeatureIcon name="glass-sparkle" variant="ai" tone="accent" /></span>
          <div>
            <span>{t("pairing")}</span>
            <h2>{t("pairingSubmit")}</h2>
          </div>
        </div>
        {pairingResult?.estimated_cost_usd ? (
          <small className="pairing-request-cost">
            {t("aiRequestCost")}: {formatAiBudget(pairingResult.estimated_cost_usd)}
            <br />{pairingResult.model} · {t("reasoningEffort")}: {t(reasoningEffortTranslationKey(pairingResult.reasoning_effort))}
          </small>
        ) : null}
      </div>
      <div className="pairing-layout">
        <div className="pairing-main">
          <form className="pairing-form" onSubmit={(event) => onGeneratePairing(event, [pairingTargetWine?.id || null, pairingDietaryPreferences, pairingAllergies])}>
            {isWineFirstPairing ? (
              <div className="pairing-match" style={{ gridTemplateColumns: pairingTargetWine?.photo_thumbnail_url ? "58px minmax(0, 1fr) auto" : "minmax(0, 1fr) auto", alignItems: "center" }}>
                {pairingTargetWine?.photo_thumbnail_url ? <img src={pairingTargetWine.photo_thumbnail_url} alt="" loading="lazy" style={{ width: "58px", maxHeight: "86px", objectFit: "contain", justifySelf: "center" }} /> : null}
                <div style={{ display: "grid", gap: 3, minWidth: 0 }}>
                  <span>{pairingCopy.forWine}</span>
                  <strong>{pairingTargetWine?.name}</strong>
                  {pairingTargetWine?.producer ? <small>{pairingTargetWine.producer}</small> : null}
                </div>
                <button type="button" className="secondary compact" onClick={() => setPairingTargetWine(null)} disabled={generatingAi === "pairing"}>{pairingCopy.changeMode}</button>
              </div>
            ) : (
              <label className="pairing-dish-field">
                <strong className="pairing-step-title"><span>1</span>{locale === "it" ? "Cosa vuoi abbinare?" : "What would you like to pair?"}</strong>
                <span>{t("pairingDish")}</span>
                <div className="pairing-textarea-shell">
                  <textarea maxLength={150} value={pairingDish} onChange={(event) => setPairingDish(event.target.value)} placeholder={t("pairingPlaceholder")} rows={3} disabled={!canGenerateAi || generatingAi === "pairing"} />
                  <small>{pairingDish.length}/150</small>
                </div>
              </label>
            )}
            {isWineFirstPairing ? (
              <details className="pairing-preferences-field" open={pairingSetupOpen} onToggle={(event) => setPairingSetupOpen(event.currentTarget.open)} style={{ display: "grid", gap: 12 }}>
                <summary>{pairingCopy.setup}</summary>
                <label>
                  <span>{pairingCopy.preferences}</span>
                  <textarea value={pairingDietaryPreferences} onChange={(event) => setPairingDietaryPreferences(event.target.value)} placeholder={pairingCopy.preferencesPlaceholder} rows={2} disabled={!canGenerateAi || generatingAi === "pairing"} />
                </label>
                <label>
                  <span>{pairingCopy.allergies}</span>
                  <textarea value={pairingAllergies} onChange={(event) => setPairingAllergies(event.target.value)} placeholder={pairingCopy.allergiesPlaceholder} rows={2} disabled={!canGenerateAi || generatingAi === "pairing"} />
                  <small>{pairingCopy.allergiesHelp}</small>
                </label>
                <label>
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
                  <button type="button" className="secondary compact" disabled={!canWriteWine || saving || savedPairingPreferences === aiSettingsDraft.pairing_preferences} onClick={onSavePairingPreferences}>
                    {t("savePairingPreferences")}
                  </button>
                </div>
              </details>
            ) : null}
            {!isWineFirstPairing ? <div className="pairing-budget-context-grid">
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
            <div className="pairing-context-control">
              <span>{locale === "it" ? "Contesto" : "Context"}</span>
              <small>{locale === "it" ? "Dove vuoi bere o scegliere il vino?" : "Where will you drink or choose the wine?"}</small>
              <div className="pairing-context-options">
                <button type="button" className={!pairingMarketOnly ? "selected" : ""} aria-pressed={!pairingMarketOnly} onClick={() => selectPairingContext(false)} disabled={!canGenerateAi || generatingAi === "pairing"}>
                  <span aria-hidden="true">⌂</span>{locale === "it" ? "A casa" : "At home"}
                </button>
                <button type="button" className={pairingMarketOnly ? "selected" : ""} aria-pressed={pairingMarketOnly} onClick={() => selectPairingContext(true)} disabled={!canGenerateAi || generatingAi === "pairing"}>
                  <span aria-hidden="true">♨</span>{locale === "it" ? "Ristorante" : "Restaurant"}
                </button>
              </div>
            </div>
            </div> : null}
            {!isWineFirstPairing ? <label className="pairing-preferences-field pairing-preferences-panel">
              <strong className="pairing-step-title"><span>2</span>{locale === "it" ? "Le tue preferenze" : "Your preferences"}</strong>
              <span>{t("pairingPreferences")}</span>
              <div className="pairing-textarea-shell">
                <textarea
                  maxLength={200}
                  value={aiSettingsDraft.pairing_preferences}
                  onChange={(event) => setAiSettingsDraft({ ...aiSettingsDraft, pairing_preferences: event.target.value })}
                  placeholder={t("pairingPreferencesPlaceholder")}
                  rows={4}
                  disabled={!canWriteWine || saving}
                />
                <small>{aiSettingsDraft.pairing_preferences.length}/200</small>
              </div>
              <small>{t("pairingPreferencesHelp")}</small>
            </label> : null}
            {!isWineFirstPairing ? <div className="pairing-preferences-actions">
              <button
                type="button"
                className="secondary compact"
                disabled={!canWriteWine || saving || savedPairingPreferences === aiSettingsDraft.pairing_preferences}
                onClick={onSavePairingPreferences}
              >
                {t("savePairingPreferences")}
              </button>
            </div> : null}
            {!isWineFirstPairing ? <label className="pairing-option">
              <input type="checkbox" checked={pairingIgnorePreferences} onChange={(event) => setPairingIgnorePreferences(event.target.checked)} disabled={!canGenerateAi || generatingAi === "pairing"} />
              <span>{t("pairingIgnorePreferences")}</span>
            </label> : null}
            {!isWineFirstPairing ? <label className="pairing-option">
              <input type="checkbox" checked={pairingOnlyIdealDrinkWindow} onChange={(event) => setPairingOnlyIdealDrinkWindow(event.target.checked)} disabled={!canGenerateAi || pairingMarketOnly || generatingAi === "pairing"} />
              <span>{t("pairingOnlyIdealDrinkWindow")}</span>
            </label> : null}
            {!isWineFirstPairing ? <label className="pairing-option">
              <input type="checkbox" checked={pairingIncludeMarket} onChange={(event) => setPairingIncludeMarket(event.target.checked)} disabled={!canGenerateAi || pairingMarketOnly || generatingAi === "pairing"} />
              <span>{t("pairingIncludeMarket")}</span>
            </label> : null}
            {!isWineFirstPairing && pairingMarketOnly ? (
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
            <button type="submit" className="pairing-submit-button" disabled={!canGenerateAi || generatingAi === "pairing"}>
              <ButtonBusyContent busy={generatingAi === "pairing"} idleLabel={t("pairingSubmit")} busyLabel={t("generating")} />
            </button>
            {generatingAi === "pairing" ? <LoadingState label={t("generating")} compact /> : null}
            {!canGenerateAi ? <EmptyState title={t("noApiKey")} icon="glass-sparkle" compact /> : null}
          </form>
          {pairingResult && (!isWineFirstPairing || pairingResult.dish_recommendations.length) ? (
            <div className="pairing-result">
              {pairingResult.summary ? <p className="pairing-summary">{pairingResult.summary}</p> : null}
              {isWineFirstPairing && pairingResult.dish_recommendations.length ? (
                <section>
                  <h3>{pairingCopy.dishes}</h3>
                  <div className="pairing-match-list">
                    {pairingResult.dish_recommendations.map((dish, index) => (
                      <article className="pairing-match" key={`${dish.name}-${index}`}>
                        <strong>{dish.name}</strong>
                        {dish.description ? <span>{dish.description}</span> : null}
                        {dish.why_it_works ? <span><b>{t("pairingWhy")}:</b> {dish.why_it_works}</span> : null}
                        {dish.dietary_note ? <small>{dish.dietary_note}</small> : null}
                      </article>
                    ))}
                  </div>
                </section>
              ) : !isWineFirstPairing && pairingResult.cellar_matches.length ? (
                <section>
                  <h3>{t("pairingCellarMatches")}</h3>
                  <div className="pairing-match-list">
                    {pairingResult.cellar_matches.map((match) => {
                      const wine = wines.find((item) => item.id === match.wine_id);
                      const photoUrl = wine?.photo_thumbnail_url;
                      return (
                      <button type="button" className="pairing-match" key={match.wine_id} style={photoUrl ? { gridTemplateColumns: "58px minmax(0, 1fr)", columnGap: "10px", alignItems: "center" } : undefined} onClick={() => {
                        const wine = wines.find((item) => item.id === match.wine_id);
                        if (wine) onOpenWine(wine);
                      }}>
                        {photoUrl ? <img src={photoUrl} alt="" loading="lazy" style={{ width: "58px", maxHeight: "108px", objectFit: "contain", justifySelf: "center", filter: "drop-shadow(0 2px 6px color-mix(in srgb, var(--accent) 34%, transparent))" }} /> : null}
                        <div style={{ display: "grid", gap: "5px", minWidth: 0 }}>
                          <strong>{match.wine_name}</strong>
                          <span>{match.producer}</span>
                          {(() => {
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
                        </div>
                      </button>
                      );
                    })}
                  </div>
                </section>
              ) : !isWineFirstPairing ? <p className="pairing-summary">{t("pairingNoCellarMatch")}</p> : null}
              {!isWineFirstPairing && Object.values(pairingResult.market_recommendations).some((items) => items.length > 0) ? (
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
              {pairingResult.model ? <p className="pairing-model-used">{t("pairingModelUsed")}: {pairingResult.model} · {t("reasoningEffort")}: {t(reasoningEffortTranslationKey(pairingResult.reasoning_effort))}</p> : null}
            </div>
          ) : null}
        </div>
        <aside className="pairing-sidekick" aria-hidden={isMobileViewport}>
          <div className="pairing-sidekick-card">
            <div className="pairing-sidekick-heading">
              <span className="pairing-ai-label"><FeatureIcon name="glass-sparkle" variant="ai" tone="ai" />{locale === "it" ? "Sommelier AI" : "AI Sommelier"}</span>
              <strong>{locale === "it" ? "Il tuo sommelier AI integrato" : "Your integrated AI sommelier"}</strong>
            </div>
            <div className="pairing-sidekick-illustration">
              <SommelierAiIllustration />
            </div>
            <p className="pairing-sidekick-description">
              {locale === "it"
                ? "Ricevi suggerimenti su misura in base ai vini della tua cantina, alle tue preferenze e al piatto che vuoi abbinare."
                : "Receive tailored suggestions based on your cellar, your preferences, and the dish you want to pair."}
            </p>
          </div>
          <div className="pairing-sidekick-card">
            <div className="pairing-sidekick-heading">
              <span>{locale === "it" ? "Proposte consigliate" : "Suggested matches"}</span>
              <strong>{isWineFirstPairing && pairingDishSummary ? pairingDishSummary : (pairingResultCount ? `${pairingResultCount}` : (locale === "it" ? "In attesa di una richiesta" : "Waiting for a request"))}</strong>
            </div>
            {!isWineFirstPairing && pairingPreviewItems.length ? (
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
                {isWineFirstPairing
                  ? (locale === "it" ? "Indica preferenze o allergie e ricevi piatti studiati per questa bottiglia." : "Add preferences or allergies to receive dishes tailored to this bottle.")
                  : (locale === "it" ? "Inserisci un piatto e un eventuale budget per ricevere suggerimenti contestualizzati dalla tua cantina." : "Enter a dish and an optional budget to receive contextual suggestions from your cellar.")}
              </p>
            )}
            {!pairingResultCount ? <div className="pairing-empty-bottles" aria-hidden="true"><i /><i /><i /><i /></div> : null}
          </div>
        </aside>
      </div>
    </section>
  );
}
