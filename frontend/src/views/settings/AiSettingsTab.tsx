import { useState, type Dispatch, type FormEvent, type SetStateAction } from "react";
import { AiUsageRow } from "../../components/AppPanels";
import LocalizedDateInput from "../../components/LocalizedDateInput";
import { aiBudgetFillRatio, formatAiBudget, formatDisplayDate, formatUsd } from "../../components/panelSupport";
import { reasoningEffortTranslationKey, translate, type TranslationKey } from "../../i18n";
import type { AiAuditLog, AiSettings, AiSettingsDraft, AiUsage, Locale } from "../../types";

type AiSettingsTabProps = {
  locale: Locale;
  aiSettings: AiSettings | null;
  aiSettingsDraft: AiSettingsDraft;
  setAiSettingsDraft: Dispatch<SetStateAction<AiSettingsDraft>>;
  showAiBudgetPanel: boolean;
  canPurchaseAiCredits: boolean;
  onBuyAiCredits: () => void;
  saving: boolean;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  aiUsage: AiUsage | null;
  aiAudit: AiAuditLog[];
  aiEntityName: (entry: AiAuditLog) => string;
};

/** Settings → AI: the AI source and models, what AI has cost, and the log of AI calls. */
export default function AiSettingsTab({
  locale,
  aiSettings,
  aiSettingsDraft,
  setAiSettingsDraft,
  showAiBudgetPanel,
  canPurchaseAiCredits,
  onBuyAiCredits,
  saving,
  onSubmit,
  aiUsage,
  aiAudit,
  aiEntityName,
}: AiSettingsTabProps) {
  const t = (key: TranslationKey) => translate(locale, key);
  const [aiSettingsHelpOpen, setAiSettingsHelpOpen] = useState(false);
  const [aiModelsHelpOpen, setAiModelsHelpOpen] = useState(false);
  const [aiAuditLimit, setAiAuditLimit] = useState("10");
  const [aiAuditDateFrom, setAiAuditDateFrom] = useState("");
  const [aiAuditDateTo, setAiAuditDateTo] = useState("");
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
  const rolloutModelsEnabled = aiSettings?.model_options?.length
    ? aiSettings.model_options.every((model) => model.startsWith("gpt-6"))
    : false;
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

  return (
    <>
      <form className="settings-card settings-card-wide settings-ai-card" onSubmit={onSubmit}>
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
                <select value={aiSettingsDraft.provider_mode} onChange={(event) => setAiSettingsDraft({ ...aiSettingsDraft, provider_mode: event.target.value as AiSettingsDraft["provider_mode"] })} disabled={!aiSettings?.can_use_personal_openai_key}>
                  {aiSettings?.provider_options.includes("auto") ? <option value="auto">{t("aiProviderAuto")}</option> : null}
                  {aiSettings?.provider_options.includes("user_key") ? <option value="user_key">{t("aiProviderUserKey")}</option> : null}
                  <option value="credits">{t("aiProviderCredits")}</option>
                </select>
              </label>
              {aiSettings?.can_use_personal_openai_key ? <label>
                <span>OpenAI API key</span>
                <input
                  type="password"
                  value={aiSettingsDraft.openai_api_key}
                  onChange={(event) => setAiSettingsDraft({ ...aiSettingsDraft, openai_api_key: event.target.value })}
                  placeholder={aiSettings?.has_openai_api_key ? t("configured") : "sk-..."}
                />
              </label> : <p className="empty-state">{locale === "it" ? "Nel piano gratuito l'AI è disponibile esclusivamente tramite un AI Pack Vinaris." : "On the free tier, AI is available exclusively through a Vinaris AI Pack."}</p>}
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
              {canPurchaseAiCredits ? (
                <button type="button" className="secondary compact" onClick={onBuyAiCredits} disabled={saving}>
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
                  {rolloutModelsEnabled ? (
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
                <LocalizedDateInput value={aiAuditDateFrom} onChange={setAiAuditDateFrom} locale={locale} ariaLabel={t("auditDateFrom")} />
              </label>
              <label>
                <span>{t("auditDateTo")}</span>
                <LocalizedDateInput value={aiAuditDateTo} onChange={setAiAuditDateTo} locale={locale} ariaLabel={t("auditDateTo")} />
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
    </>
  );
}
