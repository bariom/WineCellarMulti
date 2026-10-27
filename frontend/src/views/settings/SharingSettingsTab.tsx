import { Suspense, type Dispatch, type FormEvent, type SetStateAction } from "react";
import { LoadingState } from "../../components/AppUi";
import { CoOwnershipAgreementLibrary } from "../../components/CoOwnershipPanels";
import { formatDisplayDate } from "../../components/panelSupport";
import { translate, type TranslationKey } from "../../i18n";
import type { CoOwnershipAgreement, HouseholdMembership, Invite, InviteDraft, Locale, Member, Session, WineShareOffer } from "../../types";

type SharingSettingsTabProps = {
  locale: Locale;
  session: Session | null;
  saving: boolean;
  canAdmin: boolean;
  householdNameDraft: string;
  setHouseholdNameDraft: (name: string) => void;
  updateHouseholdName: (event: FormEvent<HTMLFormElement>) => void;
  restaurantModeAvailable: boolean;
  updateHouseholdMode: (operatingMode: "private" | "restaurant") => Promise<void>;
  hasAnotherRestaurantCellar: boolean;
  createHousehold: (event: FormEvent<HTMLFormElement>) => void;
  newHouseholdNameDraft: string;
  setNewHouseholdNameDraft: (name: string) => void;
  deleteHouseholdConfirmDraft: string;
  setDeleteHouseholdConfirmDraft: (name: string) => void;
  householdMemberships: HouseholdMembership[];
  deleteActiveHousehold: () => void;
  members: Member[];
  updateMemberRole: (member: Member, role: string) => void;
  updateMemberVisibility: (member: Member, visibilityScope: "all" | "shared") => void;
  removeMember: (member: Member) => void;
  currentUserEmail: string | undefined;
  coOwnershipLibraryVisible: boolean;
  setCoOwnershipLibraryVisible: Dispatch<SetStateAction<boolean>>;
  myCoOwnershipAgreements: CoOwnershipAgreement[];
  coOwnershipAgreementFocusId: string | null;
  shareOffers: WineShareOffer[];
  decideShareOffer: (offer: WineShareOffer, decision: "accept" | "decline") => void;
  createInvite: (event: FormEvent<HTMLFormElement>) => void;
  inviteDraft: InviteDraft;
  setInviteDraft: (draft: InviteDraft) => void;
  inviteToken: string;
  generatedInviteLink: string;
  invites: Invite[];
  revokeInvite: (invite: Invite) => void;
  acceptInvite: (event: FormEvent<HTMLFormElement>) => void;
  acceptToken: string;
  receivedInvites: Invite[];
  respondToReceivedInvite: (invite: Invite, decision: "accept" | "decline") => void;
  setAcceptToken: (token: string) => void;
};

/** Settings → Cellar and sharing: the cellar itself, its members, co-ownership, shared positions and invitations. */
export default function SharingSettingsTab({
  locale,
  session,
  saving,
  canAdmin,
  householdNameDraft,
  setHouseholdNameDraft,
  updateHouseholdName,
  restaurantModeAvailable,
  updateHouseholdMode,
  hasAnotherRestaurantCellar,
  createHousehold,
  newHouseholdNameDraft,
  setNewHouseholdNameDraft,
  deleteHouseholdConfirmDraft,
  setDeleteHouseholdConfirmDraft,
  householdMemberships,
  deleteActiveHousehold,
  members,
  updateMemberRole,
  updateMemberVisibility,
  removeMember,
  currentUserEmail,
  coOwnershipLibraryVisible,
  setCoOwnershipLibraryVisible,
  myCoOwnershipAgreements,
  coOwnershipAgreementFocusId,
  shareOffers,
  decideShareOffer,
  createInvite,
  inviteDraft,
  setInviteDraft,
  inviteToken,
  generatedInviteLink,
  invites,
  revokeInvite,
  acceptInvite,
  acceptToken,
  setAcceptToken,
  receivedInvites,
  respondToReceivedInvite,
}: SharingSettingsTabProps) {
  const t = (key: TranslationKey) => translate(locale, key);
  const it = locale === "it";
  const roleLabels: Record<string, string> = it
    ? { admin: "Amministratore", member: "Membro", viewer: "Sola lettura" }
    : { admin: "Admin", member: "Member", viewer: "Read only" };
  return (
    <>
      {receivedInvites.length ? (
        <section className="settings-card settings-card-wide received-invites-card" aria-labelledby="received-invites-title">
          <div className="settings-card-heading">
            <div>
              <span>{it ? "Inviti ricevuti" : "Invitations received"}</span>
              <h3 id="received-invites-title">{it ? "Ti hanno invitato in una cantina" : "You have been invited to a cellar"}</h3>
            </div>
          </div>
          <div className="invite-list">
            {receivedInvites.map((invite) => (
              <div className="invite-row" key={invite.id}>
                <div>
                  <strong>{invite.household_name || (it ? "Cantina condivisa" : "Shared cellar")}</strong>
                  <span>
                    {roleLabels[invite.role] || invite.role}
                    {invite.role !== "admin" ? ` · ${t(invite.visibility_scope === "all" ? "visibilityAll" : "visibilityShared")}` : ""}
                    {` · ${t("expires")} ${formatDisplayDate(invite.expires_at)}`}
                  </span>
                </div>
                <div className="member-actions">
                  <button type="button" className="compact" disabled={saving} onClick={() => respondToReceivedInvite(invite, "accept")}>
                    {t("accept")}
                  </button>
                  <button type="button" className="secondary compact" disabled={saving} onClick={() => respondToReceivedInvite(invite, "decline")}>
                    {t("decline")}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>
      ) : null}
      <details className="settings-card settings-card-wide cellar-settings-section">
        <summary>
          <span>{locale === "it" ? "Struttura" : "Structure"}</span>
          <strong>{locale === "it" ? "Gestione della cantina" : "Cellar management"}</strong>
          <small>{locale === "it" ? "Nome, creazione, eliminazione e accessi" : "Name, creation, deletion and access"}</small>
        </summary>
        <div className="cellar-settings-section-body">
        <form className="inline-form" onSubmit={updateHouseholdName}>
          <label>
            <span>{t("cellarName")}</span>
            <input
              value={householdNameDraft}
              disabled={!canAdmin || saving || session?.active_household_mode === "restaurant"}
              onChange={(event) => setHouseholdNameDraft(event.target.value)}
              required
            />
          </label>
          <button type="submit" disabled={!canAdmin || saving || !householdNameDraft.trim()}>
            {saving ? t("saving") : t("renameCellar")}
          </button>
        </form>
        {restaurantModeAvailable ? <div className="inline-form cellar-mode-setting">
          <label>
            <span>{locale === "it" ? "Tipo di gestione" : "Cellar operation"}</span>
            <select
              value={session?.active_household_mode || "private"}
              disabled={!canAdmin || saving}
              onChange={(event) => void updateHouseholdMode(event.target.value as "private" | "restaurant")}
            >
              <option value="private">{locale === "it" ? "Cantina privata" : "Private cellar"}</option>
              <option value="restaurant" disabled={session?.active_household_mode !== "restaurant" && hasAnotherRestaurantCellar}>{locale === "it" ? "Ristorante" : "Restaurant"}</option>
            </select>
          </label>
          <p className="empty-state">
            {locale === "it"
              ? session?.active_household_mode === "restaurant"
                ? "Una cantina ristorante resta ristorante e non può essere riconvertita in cantina privata."
                : hasAnotherRestaurantCellar
                ? "Hai già una cantina ristorante: ogni utente può usarne una sola."
                : "La modalità ristorante sostituisce la degustazione con la vendita e abilita ricavi e margine lordo. I dati esistenti non vengono rimossi."
              : session?.active_household_mode === "restaurant"
                ? "A restaurant cellar stays a restaurant cellar and cannot be converted back to private."
                : hasAnotherRestaurantCellar
                ? "You already have a restaurant cellar: each user can use only one."
                : "Restaurant mode replaces tasting with sales and enables revenue and gross-margin reporting. Existing data is preserved."}
          </p>
        </div> : null}
        {session?.is_free_tier ? <p className="empty-state">
          {locale === "it" ? "Il piano gratuito include una sola cantina." : "The free plan includes one cellar."}
        </p> : <form className="inline-form" onSubmit={createHousehold}>
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
        </form>}
        {!session?.is_free_tier ? <p className="empty-state">{t("createCellarHelp")}</p> : null}
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
        <details className="cellar-settings-subsection">
          <summary>
            <span>{locale === "it" ? "Accessi" : "Access"}</span>
            <strong>{locale === "it" ? "Membri e visibilità" : "Members and visibility"}</strong>
            <small>{members.length} {locale === "it" ? "membri nella cantina attiva" : "members in the active cellar"}</small>
          </summary>
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
        </details>
        </div>
      </details>
      <details className="settings-card settings-card-wide cellar-settings-section" open={coOwnershipLibraryVisible} onToggle={(event) => setCoOwnershipLibraryVisible((event.currentTarget as HTMLDetailsElement).open)}>
        <summary><span>{locale === "it" ? "Comproprietà" : "Co-ownership"}</span><strong>{locale === "it" ? "I miei accordi" : "My agreements"}</strong><small>{myCoOwnershipAgreements.length} {locale === "it" ? "accordi personali" : "personal agreements"}</small></summary>
        <div className="cellar-settings-section-body">
        <div className="settings-card-heading">
          <div>
            <span>{locale === "it" ? "Accordi" : "Agreements"}</span>
            <h3>{locale === "it" ? "I miei accordi di comproprietà" : "My co-ownership agreements"}</h3>
          </div>
        </div>
        <Suspense fallback={<LoadingState label={locale === "it" ? "Caricamento accordi…" : "Loading agreements…"} />}>
          <CoOwnershipAgreementLibrary
            agreements={myCoOwnershipAgreements}
            locale={locale}
            focusAgreementId={coOwnershipAgreementFocusId}
            currentUserEmail={session && session.user_email}
          />
        </Suspense>
        </div>
      </details>
      <details className="settings-card cellar-settings-section">
        <summary><span>{locale === "it" ? "Posizioni condivise" : "Shared positions"}</span><strong>{t("pendingShareOffers")}</strong><small>{shareOffers.length ? `${shareOffers.length} ${locale === "it" ? "richieste da valutare" : "requests to review"}` : (locale === "it" ? "Nessuna richiesta aperta" : "No open requests")}</small></summary>
        <div className="cellar-settings-section-body">
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
        </div>
      </details>
      {canAdmin ? (
        <details className="settings-card cellar-settings-section">
          <summary><span>{locale === "it" ? "Collaborazione" : "Collaboration"}</span><strong>{locale === "it" ? "Invita un membro" : "Invite a member"}</strong><small>{locale === "it" ? "Definisci ruolo e visibilità" : "Set role and visibility"}</small></summary>
          <div className="cellar-settings-section-body">
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
          </div>
        </details>
      ) : null}
      {canAdmin ? (
        <details className="settings-card cellar-settings-section">
          <summary><span>{locale === "it" ? "Collaborazione" : "Collaboration"}</span><strong>{locale === "it" ? "Inviti in attesa" : "Pending invites"}</strong><small>{invites.length ? `${invites.length} ${locale === "it" ? "inviti da seguire" : "invites to follow"}` : (locale === "it" ? "Nessun invito aperto" : "No open invites")}</small></summary>
          <div className="cellar-settings-section-body">
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
          </div>
        </details>
      ) : null}
      <details className="settings-card cellar-settings-section">
        <summary><span>{locale === "it" ? "Collaborazione" : "Collaboration"}</span><strong>{locale === "it" ? "Accetta un invito" : "Accept an invitation"}</strong><small>{locale === "it" ? "Usa un token ricevuto esternamente" : "Use an invitation token received externally"}</small></summary>
        <form className="cellar-settings-section-body" onSubmit={acceptInvite}>
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
      </details>
    </>
  );
}
