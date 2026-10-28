import { lazy, Suspense, useEffect, useRef, type Dispatch, type FormEvent, type ReactNode, type SetStateAction } from "react";
import { aiBudgetFillRatio, formatAiBudget, formatDisplayDate } from "../../components/panelSupport";
import { themeOptions, translate, type TranslationKey } from "../../i18n";
import { openCookieConsentSettings } from "../../services/cookieConsent";
import type { BillingStatus, Locale, Passkey, PaymentPlan, PrimaryDashboardFocus, RedeemCode, Session, ThemePreference } from "../../types";

const MarketPreferences = lazy(() => import("../../components/MarketPreferences"));

type ProfileSettingsTabProps = {
  locale: Locale;
  session: Session | null;
  setSession: Dispatch<SetStateAction<Session | null>>;
  saving: boolean;
  offlineMode: boolean;
  setNotice: (notice: string) => void;
  setError: (error: string) => void;
  changeLocale: (nextLocale: Locale) => Promise<void>;
  themePreference: ThemePreference;
  changeTheme: (nextTheme: ThemePreference) => Promise<void>;
  tabletDevice: boolean;
  tabletDesktopMode: boolean;
  chooseTabletLayout: (desktop: boolean) => void;
  primaryDashboardFocus: PrimaryDashboardFocus;
  changePrimaryDashboardFocus: (nextFocus: PrimaryDashboardFocus) => Promise<void>;
  setOnboardingMode: (mode: string) => void;
  dailyWineBudgetDraft: string;
  setDailyWineBudgetDraft: (value: string) => void;
  saveDailyWineBudget: () => Promise<void>;
  /** Scroll to the subscription and focus it once, then report it done. */
  subscriptionFocusPending: boolean;
  onSubscriptionFocused: () => void;
  billingStatus: BillingStatus | null;
  showAiBudgetPanel: boolean;
  startCheckout: (plan: PaymentPlan) => void;
  startBillingPortal: () => void;
  trialRedeemCodes: RedeemCode[];
  standardRedeemCodes: RedeemCode[];
  renderRedeemCodeRow: (code: RedeemCode, highlighted?: boolean) => ReactNode;
  redeemInput: string;
  setRedeemInput: (code: string) => void;
  redeemCode: (event: FormEvent) => void;
  freeTierLabelCount: number;
  freeTierLabelLimit: number;
  freeTierAtLabelLimit: boolean;
  passkeys: Passkey[];
  passkeyName: string;
  setPasskeyName: (name: string) => void;
  passkeyHelpOpen: boolean;
  setPasskeyHelpOpen: Dispatch<SetStateAction<boolean>>;
  registerPasskey: () => void;
  deletePasskey: (passkey: Passkey) => void;
  accountDeletionEmail: string;
  setAccountDeletionEmail: (email: string) => void;
  accountDeletionPassword: string;
  setAccountDeletionPassword: (password: string) => void;
  deleteOwnAccount: () => void;
};

/** Settings → Profile: language and look, market preferences, subscription, passkeys and the account itself. */
export default function ProfileSettingsTab({
  locale,
  session,
  setSession,
  saving,
  offlineMode,
  setNotice,
  setError,
  changeLocale,
  themePreference,
  changeTheme,
  tabletDevice,
  tabletDesktopMode,
  chooseTabletLayout,
  primaryDashboardFocus,
  changePrimaryDashboardFocus,
  setOnboardingMode,
  dailyWineBudgetDraft,
  setDailyWineBudgetDraft,
  saveDailyWineBudget,
  subscriptionFocusPending,
  onSubscriptionFocused,
  billingStatus,
  showAiBudgetPanel,
  startCheckout,
  startBillingPortal,
  trialRedeemCodes,
  standardRedeemCodes,
  renderRedeemCodeRow,
  redeemInput,
  setRedeemInput,
  redeemCode,
  freeTierLabelCount,
  freeTierLabelLimit,
  freeTierAtLabelLimit,
  passkeys,
  passkeyName,
  setPasskeyName,
  passkeyHelpOpen,
  setPasskeyHelpOpen,
  registerPasskey,
  deletePasskey,
  accountDeletionEmail,
  setAccountDeletionEmail,
  accountDeletionPassword,
  setAccountDeletionPassword,
  deleteOwnAccount,
}: ProfileSettingsTabProps) {
  const t = (key: TranslationKey) => translate(locale, key);
  const subscriptionSectionRef = useRef<HTMLElement>(null);
  // Stops the post-scroll realignment; kept outside the focus effect so that
  // consuming the focus request does not cancel it.
  const stopSettlingRef = useRef<(() => void) | null>(null);
  useEffect(() => () => stopSettlingRef.current?.(), []);
  useEffect(() => {
    if (!subscriptionFocusPending) return;
    const frame = window.requestAnimationFrame(() => {
      const section = subscriptionSectionRef.current;
      section?.scrollIntoView({ behavior: "instant", block: "start" });
      section?.querySelector<HTMLElement>("h3")?.focus({ preventScroll: true });
      onSubscriptionFocused();
      if (!section || typeof ResizeObserver === "undefined") return;
      stopSettlingRef.current?.();
      // Panels above may still be loading: keep the section aligned while the
      // page settles, until the user scrolls or one second has passed.
      const settle = new ResizeObserver(() => section.scrollIntoView({ behavior: "instant", block: "start" }));
      const stop = () => {
        settle.disconnect();
        window.clearTimeout(timer);
        window.removeEventListener("wheel", stop);
        window.removeEventListener("touchstart", stop);
        window.removeEventListener("keydown", stop);
        if (stopSettlingRef.current === stop) stopSettlingRef.current = null;
      };
      const timer = window.setTimeout(stop, 1000);
      settle.observe(document.body);
      window.addEventListener("wheel", stop, { passive: true });
      window.addEventListener("touchstart", stop, { passive: true });
      window.addEventListener("keydown", stop);
      stopSettlingRef.current = stop;
    });
    return () => window.cancelAnimationFrame(frame);
  }, [subscriptionFocusPending, onSubscriptionFocused]);
  return (
    <>
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
          {tabletDevice ? <label className="tablet-layout-setting">
            <span>{locale === "it" ? "Visualizzazione su tablet" : "Tablet display"}</span>
            <select value={tabletDesktopMode ? "desktop" : "tablet"} onChange={(event) => chooseTabletLayout(event.target.value === "desktop")}>
              <option value="tablet">{locale === "it" ? "Modalità tablet" : "Tablet mode"}</option>
              <option value="desktop">{locale === "it" ? "Modalità desktop" : "Desktop mode"}</option>
            </select>
            <small>{locale === "it" ? "Usa l’interfaccia desktop su questo tablet. Puoi tornare qui per ripristinare la modalità tablet." : "Use the desktop interface on this tablet. Return here to switch back to tablet mode."}</small>
          </label> : null}
          <label className="dashboard-focus-setting">
            <span>{t("primaryDashboardFocus")}</span>
            <select
              value={primaryDashboardFocus}
              onChange={(event) =>
                void changePrimaryDashboardFocus(
                  event.target.value as PrimaryDashboardFocus,
                )}
            >
              <option value="collector">{t("collectorFocus")}</option>
              <option value="daily">{t("dailyFocus")}</option>
              <option value="balanced">{t("balancedFocus")}</option>
              <option value="personal">{locale === "it" ? "La mia dashboard" : "My dashboard"}</option>
            </select>
            <small>{t("primaryDashboardFocusHelp")}</small>
          </label>
          {session ? <Suspense fallback={null}><MarketPreferences session={session} locale={locale} disabled={saving || offlineMode} onSave={setSession} onNotice={setNotice} onError={setError} onSetup={() => setOnboardingMode("open")} budget={{ value: dailyWineBudgetDraft, onChange: setDailyWineBudgetDraft, saving, onSave: saveDailyWineBudget }} /></Suspense> : null}
        </div>
      </section>
      <section className="settings-card settings-card-compact">
        <div className="settings-card-heading">
          <div>
            <span>{locale === "it" ? "Privacy" : "Privacy"}</span>
            <h3>{locale === "it" ? "Preferenze cookie" : "Cookie preferences"}</h3>
          </div>
        </div>
        <p className="settings-card-intro">
          {locale === "it"
            ? "Modifica il consenso per Google Ads e la misurazione delle conversioni."
            : "Change your consent for Google Ads and conversion measurement."}
        </p>
        <div className="form-actions">
          <button type="button" className="secondary" onClick={openCookieConsentSettings}>
            {locale === "it" ? "Gestisci preferenze cookie" : "Manage cookie preferences"}
          </button>
        </div>
      </section>
      <section ref={subscriptionSectionRef} className="settings-card settings-card-compact settings-subscription-card" aria-labelledby="subscription-settings-title">
        <div className="settings-card-heading">
          <div>
            <span>{t("billing")}</span>
            <h3 id="subscription-settings-title" tabIndex={-1}>{locale === "it" ? "Abbonamento e AI Pack" : "Subscription and AI Pack"}</h3>
          </div>
          {billingStatus?.valid_until ? <strong>{formatDisplayDate(billingStatus.valid_until)}</strong> : null}
        </div>
        {session?.is_ambassador ? <div className="invite-notice" role="status">
          <strong>Vinaris Ambassador</strong>
          <p>{locale === "it" ? "Accesso completo alle funzionalità utente fino al" : "Full access to user features until"} {formatDisplayDate(session.ambassador_until || "")}. {locale === "it" ? "Credito AI omaggio residuo:" : "Remaining promotional AI credit:"} {formatAiBudget(billingStatus?.ambassador_ai_credit_balance_usd || 0)} USD.</p>
          <p>{locale === "it" ? "Il credito omaggio scade con l’affiliazione. Il credito acquistato resta disponibile." : "Promotional credit expires with the affiliation. Purchased credit stays available."}</p>
        </div> : null}
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
          <p className="empty-state">{t("membershipValidity")}: {locale === "it" ? "fino al" : "until"} {formatDisplayDate(billingStatus.valid_until)}</p>
        ) : freeTierAtLabelLimit ? (
          <aside className="free-tier-limit-notice" role="status">
            <strong>{locale === "it" ? "Hai raggiunto il limite del piano gratuito" : "You reached the free-plan limit"}</strong>
            <span>{locale === "it" ? `Hai ${freeTierLabelCount} di ${freeTierLabelLimit} etichette attive. Acquista un abbonamento per aggiungerne altre.` : `You have ${freeTierLabelCount} of ${freeTierLabelLimit} active labels. Purchase a subscription to add more.`}</span>
          </aside>
        ) : session?.is_free_tier ? (
          <p className="empty-state">
            {locale === "it"
              ? `Piano gratuito: ${freeTierLabelCount} di ${freeTierLabelLimit} etichette attive. Le funzioni Premium, inclusi Ricordi e Polaroid, richiedono un abbonamento. Nel piano gratuito le funzioni AI richiedono un AI Pack.`
              : `Free tier: ${freeTierLabelCount} of ${freeTierLabelLimit} active labels. Premium features, including Memories and Polaroids, require a subscription. AI features on the free plan require an AI Pack.`}
          </p>
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
      <section className="settings-card settings-card-wide account-danger-zone">
        <div className="settings-card-heading">
          <div>
            <span>{t("dangerZone")}</span>
            <h3>{t("deleteAccount")}</h3>
          </div>
        </div>
        <p>{t("deleteAccountHelp")}</p>
        <div className="account-deletion-preserved">
          <strong>{t("deleteAccountPreservedTitle")}</strong>
          <span>{t("deleteAccountPreservedHelp")}</span>
        </div>
        <div className="inline-form account-deletion-form">
          <label>
            <span>{t("confirmEmail")}: {session?.user_email}</span>
            <input
              type="email"
              autoComplete="off"
              value={accountDeletionEmail}
              onChange={(event) => setAccountDeletionEmail(event.target.value)}
            />
          </label>
          <label>
            <span>{t("currentPassword")}</span>
            <input
              type="password"
              autoComplete="current-password"
              value={accountDeletionPassword}
              onChange={(event) => setAccountDeletionPassword(event.target.value)}
            />
          </label>
          <button
            type="button"
            className="danger"
            disabled={
              saving
              || !accountDeletionPassword
              || accountDeletionEmail.trim().toLowerCase()
                !== (session?.user_email || "").toLowerCase()
            }
            onClick={() => void deleteOwnAccount()}
          >
            {t("deleteAccountPermanently")}
          </button>
        </div>
      </section>
    </>
  );
}
