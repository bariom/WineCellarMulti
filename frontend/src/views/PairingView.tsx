import { FormEvent } from "react";

type WineLike = {
  id: string;
  name: string;
  producer: string;
  current_value: string | null;
  price: string;
};

type PairingResult = {
  summary: string;
  model: string;
  cellar_matches: Array<{ wine_id: string; wine_name: string; producer: string; reason: string; serving_note: string }>;
  market_recommendations: Record<string, Array<{ name: string; producer: string; price_hint: string; reason: string }>>;
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
  pairingIgnorePreferences: boolean;
  pairingIncludeMarket: boolean;
  pairingLocalOrigin: string;
  pairingMarketOnly: boolean;
  pairingMaxPrice: string;
  pairingPreferLocal: boolean;
  pairingResult: PairingResult | null;
  saving: boolean;
  savedPairingPreferences: string;
  wines: WineLike[];
  formatAiBudget: (value: string | number) => string;
  onGeneratePairing: (event: FormEvent<HTMLFormElement>) => void;
  onOpenWine: (wine: any) => void;
  onSavePairingPreferences: () => void;
  setAiSettingsDraft: (value: any) => void;
  setPairingDish: (value: string) => void;
  setPairingIgnorePreferences: (value: boolean) => void;
  setPairingIncludeMarket: (value: boolean) => void;
  setPairingLocalOrigin: (value: string) => void;
  setPairingMarketOnly: (value: boolean) => void;
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
  pairingIgnorePreferences,
  pairingIncludeMarket,
  pairingLocalOrigin,
  pairingMarketOnly,
  pairingMaxPrice,
  pairingPreferLocal,
  pairingResult,
  saving,
  savedPairingPreferences,
  setAiSettingsDraft,
  setPairingDish,
  setPairingIgnorePreferences,
  setPairingIncludeMarket,
  setPairingLocalOrigin,
  setPairingMarketOnly,
  setPairingMaxPrice,
  setPairingPreferLocal,
  t,
  wines,
}: PairingViewProps) {
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
          <form className="pairing-form" onSubmit={onGeneratePairing}>
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
                disabled={!canWriteWine || saving || savedPairingPreferences === aiSettingsDraft.pairing_preferences}
                onClick={onSavePairingPreferences}
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
                        if (wine) onOpenWine(wine);
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
