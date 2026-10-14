import { Suspense, lazy, type Dispatch, type FormEvent, type SetStateAction } from "react";
import type { TranslationKey } from "../i18n";
import type { AppUser, Locale, PendingUser, RedeemCode, RedeemCodeDraft } from "../types";
import { appUserActivityStatus, appUserEntitlementStatus, appUserInitials, appUserPlanLabel, appUserRoleLabel, appUserTierStatus } from "../domain/appUsers";
import type { AmbassadorChange } from "./AdminAmbassadorEditor";
import { AppIcon } from "./AppIcon";
import { formatAiBudget, formatDisplayDate } from "./panelSupport";

// Administration of redeem codes and app users. Loaded on demand because only
// app administrators open this settings tab.
const AdminAmbassadorEditor = lazy(() => import("./AdminAmbassadorEditor"));

type StatusFilter = "all" | "pending" | "active" | "inactive" | "blocked";
type Drafts = Record<string, string>;

export type AdminUsersWorkspaceProps = {
  t: (key: TranslationKey) => string;
  locale: Locale;
  saving: boolean;
  setError: (message: string) => void;
  redeemCodes: RedeemCode[];
  activeRedeemCodesCount: number;
  redeemCodeDraft: RedeemCodeDraft;
  setRedeemCodeDraft: (draft: RedeemCodeDraft) => void;
  generatedRedeemCode: string;
  createRedeemCode: (event: FormEvent) => void;
  deleteRedeemCode: (code: RedeemCode, force?: boolean) => void;
  loadBilling: (authenticated?: boolean, isAppAdmin?: boolean) => Promise<unknown>;
  appUsers: AppUser[];
  filteredAdminUsers: AppUser[];
  selectedAdminUser: AppUser | null;
  selectedAdminUserId: string | null;
  setSelectedAdminUserId: (id: string | null) => void;
  adminUserQuery: string;
  setAdminUserQuery: (query: string) => void;
  adminUserStatusFilter: StatusFilter;
  setAdminUserStatusFilter: (filter: StatusFilter) => void;
  userAiBalanceDrafts: Drafts;
  setUserAiBalanceDrafts: Dispatch<SetStateAction<Drafts>>;
  userAiNoteDrafts: Drafts;
  setUserAiNoteDrafts: Dispatch<SetStateAction<Drafts>>;
  userAccessDaysDrafts: Drafts;
  setUserAccessDaysDrafts: Dispatch<SetStateAction<Drafts>>;
  loadAppUsers: (isAppAdmin?: boolean) => Promise<unknown>;
  loadSingleAppUserStats: (user: AppUser) => Promise<unknown>;
  approveUser: (user: PendingUser) => void;
  rejectUser: (user: PendingUser) => void;
  deleteAppUser: (user: AppUser) => void;
  toggleAppAdmin: (user: AppUser) => void;
  toggleLabelRecognition: (user: AppUser) => void;
  toggleRestaurantModeAccess: (user: AppUser) => void;
  toggleWinePhotoAccess: (user: AppUser) => void;
  toggleUserBlocked: (user: AppUser) => void;
  updateUserAiCreditBalance: (user: AppUser) => void;
  updateUserAccessDays: (user: AppUser, clear?: boolean) => void;
  updateUserAmbassador: (user: AppUser, change: AmbassadorChange) => Promise<void>;
};

export default function AdminUsersWorkspace(props: AdminUsersWorkspaceProps) {
  const {
    activeRedeemCodesCount, adminUserQuery, adminUserStatusFilter, appUsers, filteredAdminUsers, generatedRedeemCode, locale, redeemCodeDraft, redeemCodes, saving, selectedAdminUser, selectedAdminUserId, userAccessDaysDrafts, userAiBalanceDrafts, userAiNoteDrafts, t, setError, setAdminUserQuery, setAdminUserStatusFilter, setRedeemCodeDraft, setSelectedAdminUserId, setUserAccessDaysDrafts, setUserAiBalanceDrafts, setUserAiNoteDrafts, approveUser, createRedeemCode, deleteAppUser, deleteRedeemCode, loadAppUsers, loadBilling, loadSingleAppUserStats, rejectUser, toggleAppAdmin, toggleLabelRecognition, toggleRestaurantModeAccess, toggleUserBlocked, toggleWinePhotoAccess, updateUserAccessDays, updateUserAiCreditBalance, updateUserAmbassador,
  } = props;
  return (
    <>
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
                <section className="admin-users-workspace settings-card-wide" aria-label={t("settingsUsers")}>
                  <header className="admin-users-heading">
                    <div>
                      <span>{locale === "it" ? "AMMINISTRAZIONE" : "ADMINISTRATION"}</span>
                      <h2>{t("settingsUsers")} <small>{appUsers.length} {locale === "it" ? "utenti" : "users"}</small></h2>
                    </div>
                    <button type="button" className="secondary compact" disabled={saving} onClick={() => loadAppUsers(true).catch((nextError) => setError(nextError instanceof Error ? nextError.message : "Unable to load users"))}>
                      {locale === "it" ? "Aggiorna" : "Refresh"}
                    </button>
                  </header>

                  <div className="admin-users-toolbar">
                    <label className="admin-users-search">
                      <AppIcon name="search" />
                      <input
                        value={adminUserQuery}
                        onChange={(event) => setAdminUserQuery(event.target.value)}
                        placeholder={locale === "it" ? "Cerca per nome, email o ruolo..." : "Search by name, email or role..."}
                      />
                    </label>
                    <details className="admin-users-filter">
                      <summary><AppIcon name="filter" /> {locale === "it" ? "Filtri" : "Filters"}{adminUserStatusFilter !== "all" ? <i aria-hidden="true" /> : null}</summary>
                      <div>
                        {(["all", "pending", "active", "inactive", "blocked"] as const).map((status) => (
                          <button type="button" key={status} className={adminUserStatusFilter === status ? "active" : ""} onClick={() => setAdminUserStatusFilter(status)}>
                            {status === "all" ? (locale === "it" ? "Tutti" : "All")
                              : status === "pending" ? (locale === "it" ? "Da approvare" : "Pending")
                                : status === "active" ? (locale === "it" ? "Attivi" : "Active")
                                  : status === "inactive" ? (locale === "it" ? "Inattivi" : "Inactive")
                                    : t("blocked")}
                          </button>
                        ))}
                      </div>
                    </details>
                  </div>

                  <div className={`admin-users-layout${selectedAdminUserId ? " detail-open" : ""}`}>
                    <div className="admin-users-list" role="list">
                      {filteredAdminUsers.length ? filteredAdminUsers.map((user, index) => {
                        const tierStatus = appUserTierStatus(user, locale);
                        const activityStatus = appUserActivityStatus(user, locale);
                        const selected = selectedAdminUser?.id === user.id;
                        return (
                          <button
                            type="button"
                            role="listitem"
                            className={`admin-user-row${selected ? " selected" : ""}`}
                            key={user.id}
                            onClick={() => setSelectedAdminUserId(user.id)}
                          >
                            <span className={`admin-user-avatar tone-${index % 4}`}>{appUserInitials(user)}</span>
                            <span className="admin-user-identity">
                              <span className="admin-user-name-line">
                                <strong>{user.display_name || user.email}</strong>
                                <small>{appUserRoleLabel(user, locale)}</small>
                              </span>
                              <span className="admin-user-email">{user.email}</span>
                              <span className="admin-user-feature-pills">
                                <i className={tierStatus.configured ? "configured" : ""}>{tierStatus.label}</i>
                                {user.can_use_label_recognition ? <i>{t("labelRecognitionEnabled")}</i> : null}
                                {user.can_manage_wine_photos ? <i>{locale === "it" ? "Foto abilitate" : "Photos enabled"}</i> : null}
                                {user.can_use_restaurant_mode ? <i>{locale === "it" ? "Ristorante" : "Restaurant"}</i> : null}
                              </span>
                            </span>
                            <span className="admin-user-row-status">
                              <strong>{formatAiBudget(user.ai_credit_balance_usd || 0)}</strong>
                              <i style={activityStatus.style}>{activityStatus.label}</i>
                              {!user.is_approved ? <em>{locale === "it" ? "Da approvare" : "Pending"}</em> : null}
                              {user.is_blocked ? <em>{t("blocked")}</em> : null}
                            </span>
                            <span className="admin-user-row-chevron" aria-hidden="true">›</span>
                          </button>
                        );
                      }) : <p className="empty-state">{locale === "it" ? "Nessun utente corrisponde ai filtri." : "No users match these filters."}</p>}
                    </div>

                    {selectedAdminUser ? (() => {
                      const user = selectedAdminUser;
                      const activityStatus = appUserActivityStatus(user, locale);
                      const entitlementStatus = appUserEntitlementStatus(user, locale);
                      return (
                        <aside className="admin-user-detail" aria-label={`${locale === "it" ? "Dettaglio" : "Details"} ${user.display_name || user.email}`}>
                          <button type="button" className="admin-user-detail-close" aria-label={locale === "it" ? "Chiudi dettaglio" : "Close details"} onClick={() => setSelectedAdminUserId(null)}>×</button>
                          <div className="admin-user-detail-identity">
                            <span className="admin-user-avatar large">{appUserInitials(user)}</span>
                            <div>
                              <h3>{user.display_name || user.email}</h3>
                              <strong>{appUserRoleLabel(user, locale)}</strong>
                              <span>{user.email}</span>
                              <i className={user.is_approved ? "approved" : "pending"}>{user.is_approved ? "approved" : (locale === "it" ? "in attesa" : "pending")}</i>
                            </div>
                          </div>

                          <section className="admin-user-detail-section">
                            <h4>{locale === "it" ? "Stato e attività" : "Status and activity"}</h4>
                            <dl>
                              <div><dt>{locale === "it" ? "Stato account" : "Account status"}</dt><dd className={user.is_blocked ? "danger" : "success"}>{user.is_blocked ? t("blocked") : (locale === "it" ? "Attivo" : "Active")}</dd></div>
                              <div><dt>{locale === "it" ? "Ultima attività" : "Last activity"}</dt><dd style={activityStatus.style}>{activityStatus.label}</dd></div>
                              <div><dt>{locale === "it" ? "Data attività" : "Activity date"}</dt><dd>{user.last_activity_at ? formatDisplayDate(user.last_activity_at) : "—"}</dd></div>
                              <div><dt>{locale === "it" ? "Accesso residuo" : "Access remaining"}</dt><dd>{entitlementStatus?.label || (locale === "it" ? "Piano gratuito" : "Free plan")}</dd></div>
                            </dl>
                          </section>

                          <section className="admin-user-detail-section">
                            <h4>{locale === "it" ? "Piano e funzionalità" : "Plan and features"}</h4>
                            <dl>
                              <div><dt>{locale === "it" ? "Piano" : "Plan"}</dt><dd>{appUserPlanLabel(user, locale)}</dd></div>
                              <div><dt>{locale === "it" ? "Riconoscimento etichette" : "Label recognition"}</dt><dd className={(user.can_use_label_recognition || user.is_ambassador) ? "success" : "muted"}>{(user.can_use_label_recognition || user.is_ambassador) ? (locale === "it" ? "Attivo" : "Active") : (locale === "it" ? "Disattivo" : "Disabled")}</dd></div>
                              <div><dt>{locale === "it" ? "Caricamento foto" : "Photo uploads"}</dt><dd className={(user.can_manage_wine_photos || user.is_ambassador) ? "success" : "muted"}>{(user.can_manage_wine_photos || user.is_ambassador) ? (locale === "it" ? "Abilitato" : "Enabled") : (locale === "it" ? "Disabilitato" : "Disabled")}</dd></div>
                              <div><dt>{locale === "it" ? "Modalità ristorante" : "Restaurant mode"}</dt><dd className={(user.can_use_restaurant_mode || user.is_ambassador) ? "success" : "muted"}>{(user.can_use_restaurant_mode || user.is_ambassador) ? (locale === "it" ? "Abilitata" : "Enabled") : (locale === "it" ? "Disabilitata" : "Disabled")}</dd></div>
                            </dl>
                          </section>

                          {!user.is_app_admin && !user.has_demo_access && user.is_approved ? <Suspense fallback={null}><AdminAmbassadorEditor key={user.id} user={user} locale={locale} saving={saving} onSave={change => updateUserAmbassador(user, change)} /></Suspense> : null}

                          <details className="admin-user-detail-accordion" open>
                            <summary><span><AppIcon name="star" /><strong>AI Credit</strong><small>{locale === "it" ? "Gestisci il credito AI dell'utente" : "Manage this user's AI credit"}</small></span></summary>
                            <div className="admin-user-credit-editor">
                              <div className="admin-user-credit-balance"><span>{locale === "it" ? "Credito AI ordinario" : "Standard AI credit"}</span><strong>{formatAiBudget(user.standard_ai_credit_balance_usd ?? user.ai_credit_balance_usd ?? 0)}</strong></div>
                              <label><span>{t("targetAiCreditBalance")}</span><input type="number" min="0" step="0.01" value={userAiBalanceDrafts[user.id] || ""} onChange={(event) => setUserAiBalanceDrafts((current) => ({ ...current, [user.id]: event.target.value }))} /></label>
                              <label><span>{t("aiCreditAdminNote")}</span><input value={userAiNoteDrafts[user.id] || ""} onChange={(event) => setUserAiNoteDrafts((current) => ({ ...current, [user.id]: event.target.value }))} placeholder={t("aiCreditAdminNote")} /></label>
                              <button type="button" className="secondary compact" disabled={saving || !(userAiBalanceDrafts[user.id] || "").trim()} onClick={() => updateUserAiCreditBalance(user)}>{t("saveAiCreditBalance")}</button>
                            </div>
                          </details>

                          {!user.is_app_admin && !user.has_demo_access ? <details className="admin-user-detail-accordion">
                            <summary><span><AppIcon name="settings" /><strong>{locale === "it" ? "Accesso app" : "App access"}</strong><small>{locale === "it" ? "Gestisci accesso e giorni residui" : "Manage access and remaining days"}</small></span></summary>
                            <div className="admin-user-access-editor">
                              <label><span>{locale === "it" ? "Giorni residui" : "Days remaining"}</span><input type="number" min="0" max="3650" step="1" value={userAccessDaysDrafts[user.id] || ""} onChange={(event) => setUserAccessDaysDrafts((current) => ({ ...current, [user.id]: event.target.value }))} /></label>
                              <button type="button" className="secondary compact" disabled={saving || !(userAccessDaysDrafts[user.id] || "").trim()} onClick={() => updateUserAccessDays(user)}>{locale === "it" ? "Imposta accesso" : "Set access"}</button>
                              {user.access_override_until ? <button type="button" className="secondary compact" disabled={saving} onClick={() => updateUserAccessDays(user, true)}>{locale === "it" ? "Ripristina automatico" : "Restore automatic"}</button> : null}
                            </div>
                          </details> : null}

                          <details className="admin-user-detail-accordion">
                            <summary><span><AppIcon name="settings" /><strong>{locale === "it" ? "Permessi e altre azioni" : "Permissions and other actions"}</strong><small>{locale === "it" ? "Ruolo e funzionalità amministrative" : "Role and administrative features"}</small></span></summary>
                            <div className="admin-user-permission-actions">
                              <button type="button" className={user.is_app_admin ? "compact" : "secondary compact"} disabled={saving} onClick={() => toggleAppAdmin(user)}>{user.is_app_admin ? "App admin" : "Make app admin"}</button>
                              <button type="button" className={user.can_use_label_recognition ? "compact" : "secondary compact"} disabled={saving} onClick={() => toggleLabelRecognition(user)}>{user.can_use_label_recognition ? t("labelRecognitionEnabled") : t("labelRecognitionDisabled")}</button>
                              <button type="button" className={user.can_use_restaurant_mode ? "compact" : "secondary compact"} disabled={saving || user.is_app_admin} onClick={() => toggleRestaurantModeAccess(user)}>{user.can_use_restaurant_mode ? (locale === "it" ? "Disabilita ristorante" : "Disable restaurant") : (locale === "it" ? "Abilita ristorante" : "Enable restaurant")}</button>
                              <button type="button" className={user.can_manage_wine_photos ? "compact" : "secondary compact"} disabled={saving || user.is_app_admin} onClick={() => toggleWinePhotoAccess(user)}>{user.can_manage_wine_photos ? (locale === "it" ? "Disabilita foto" : "Disable photos") : (locale === "it" ? "Abilita foto" : "Enable photos")}</button>
                            </div>
                          </details>

                          <div className="admin-user-detail-actions">
                            <button type="button" className="secondary compact" disabled={saving} onClick={() => loadSingleAppUserStats(user).catch((nextError) => setError(nextError instanceof Error ? nextError.message : "Unable to load user stats"))}>{locale === "it" ? "Visualizza statistiche" : "View statistics"}</button>
                            {!user.is_approved ? <button type="button" className="compact" disabled={saving} onClick={() => approveUser(user)}>{t("accept")}</button> : null}
                            {!user.is_approved ? <button type="button" className="secondary compact" disabled={saving} onClick={() => rejectUser(user)}>{t("decline")}</button> : null}
                            {user.is_approved ? <button type="button" className="secondary compact" disabled={saving} onClick={() => toggleUserBlocked(user)}>{user.is_blocked ? t("unblockAccess") : t("blockAccess")}</button> : null}
                            <button type="button" className="danger compact admin-user-delete" disabled={saving} onClick={() => deleteAppUser(user)}>{t("delete")}</button>
                          </div>
                        </aside>
                      );
                    })() : null}
                  </div>
                </section>
    </>
  );
}
