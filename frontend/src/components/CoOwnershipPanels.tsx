import { FormEvent, useEffect, useMemo, useState } from "react";

import type { CoOwnershipAgreement, CoOwnershipParticipantDraft, Locale, Session, Wine } from "../types";
import { api } from "../services/api";


function statusLabel(status: string, locale: Locale) {
  const labels: Record<string, [string, string]> = {
    pending: ["Pending", "In attesa"],
    accepted: ["Accepted", "Accettato"],
    declined: ["Declined", "Rifiutato"],
    invalidated: ["Invalidated", "Invalidato"],
  };
  return labels[status]?.[locale === "it" ? 1 : 0] || status;
}


function agreementDocument(agreement: CoOwnershipAgreement, locale: Locale, printable = true) {
  const wine = agreement.wine_snapshot;
  return (
    <article className={`coownership-document${printable ? " coownership-printable" : ""}`}>
      <header>
        <p>{locale === "it" ? "Dichiarazione e accordo tra le parti" : "Declaration and agreement between the parties"}</p>
        <h2>{locale === "it" ? "Accordo di comproprietà dei vini" : "Wine co-ownership agreement"}</h2>
        <span>{locale === "it" ? "Versione" : "Version"} {agreement.version} · {statusLabel(agreement.status, locale)}</span>
      </header>
      <div className="detail-grid">
        <div><span>{locale === "it" ? "Vino" : "Wine"}</span><strong>{String(wine.name || "")} {String(wine.vintage || "")}</strong></div>
        <div><span>{locale === "it" ? "Produttore" : "Producer"}</span><strong>{String(wine.producer || "-")}</strong></div>
        <div><span>{locale === "it" ? "Quantità" : "Quantity"}</span><strong>{String(wine.quantity || 0)}</strong></div>
        <div><span>{locale === "it" ? "Formato" : "Format"}</span><strong>{String(wine.format || "-")}</strong></div>
        <div><span>{locale === "it" ? "Prezzo di acquisto" : "Purchase price"}</span><strong>{String(wine.currency || "")} {String(wine.purchase_price || "0")}</strong></div>
        <div><span>{locale === "it" ? "Tipo di proprietà" : "Ownership type"}</span><strong>{agreement.ownership_mode === "undivided" ? (locale === "it" ? "Quota indivisa sul lotto" : "Undivided share of the lot") : (locale === "it" ? "Bottiglie assegnate" : "Allocated bottles")}</strong></div>
      </div>
      {agreement.custody_location ? <p><strong>{locale === "it" ? "Custodia:" : "Custody:"}</strong> {agreement.custody_location}</p> : null}
      <section>
        <h3>{locale === "it" ? "Comproprietari" : "Co-owners"}</h3>
        <div className="ownership-list">
          {agreement.participants.map((participant) => (
            <div className="ownership-row" key={participant.id}>
              <span>{participant.name} · {participant.email}<small>{statusLabel(participant.status, locale)}</small></span>
              <strong>{Number(participant.share_pct).toLocaleString(locale, { maximumFractionDigits: 6 })}%{participant.contribution ? ` · ${String(wine.currency || "")} ${participant.contribution}` : ""}</strong>
            </div>
          ))}
        </div>
      </section>
      {agreement.terms ? <section><h3>{locale === "it" ? "Condizioni concordate" : "Agreed terms"}</h3><p className="coownership-terms">{agreement.terms}</p></section> : null}
      <footer>
        <small>{locale === "it" ? "Impronta del contenuto concordato" : "Agreed-content fingerprint"}: {agreement.document_hash}</small>
        <small>{locale === "it" ? "Generato sulla base delle dichiarazioni e delle accettazioni registrate dai partecipanti." : "Generated from the declarations and acceptances recorded for the participants."}</small>
      </footer>
    </article>
  );
}


export function CoOwnershipPanel({ wine, session, agreements, canWrite, saving, onCreate, onCancel }: {
  wine: Wine;
  session: Session | null;
  agreements: CoOwnershipAgreement[];
  canWrite: boolean;
  saving: boolean;
  onCreate: (payload: Record<string, unknown>) => Promise<void>;
  onCancel: (agreement: CoOwnershipAgreement) => Promise<void>;
}) {
  const locale = session?.locale || "it";
  const initialParticipants = useMemo<CoOwnershipParticipantDraft[]>(() => {
    const rows = wine.owners.map((owner) => ({ name: owner.name, email: owner.email || "", share_pct: String(owner.share_pct), contribution: "" }));
    if (!rows.some((item) => item.email.toLowerCase() === session?.user_email?.toLowerCase()) && session?.user_email) {
      rows.unshift({ name: session.user_display_name || session.user_email, email: session.user_email, share_pct: rows.length ? "" : "100", contribution: "" });
    }
    return rows.length ? rows : [{ name: "", email: "", share_pct: "100", contribution: "" }];
  }, [wine.id, wine.owners, session?.user_email, session?.user_display_name]);
  const [participants, setParticipants] = useState(initialParticipants);
  const [ownershipMode, setOwnershipMode] = useState<"undivided" | "allocated">("undivided");
  const [custodyLocation, setCustodyLocation] = useState("");
  const [terms, setTerms] = useState("");
  const [emailRegisteredUsers, setEmailRegisteredUsers] = useState(true);
  const [printAgreementId, setPrintAgreementId] = useState<string | null>(null);

  useEffect(() => setParticipants(initialParticipants), [initialParticipants]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    await onCreate({
      ownership_mode: ownershipMode,
      custody_location: custodyLocation,
      terms,
      email_registered_users: emailRegisteredUsers,
      participants: participants.map((item) => ({ ...item, share_pct: Number(item.share_pct), contribution: item.contribution ? Number(item.contribution) : null })),
    });
  }

  const total = participants.reduce((sum, item) => sum + Number(item.share_pct || 0), 0);
  const blockingAgreement = agreements.find((agreement) => agreement.status === "pending" || agreement.status === "invalidated");

  function printAgreement(agreementId: string) {
    setPrintAgreementId(agreementId);
    window.requestAnimationFrame(() => {
      window.print();
      setPrintAgreementId(null);
    });
  }

  return (
    <details className="detail-section coownership-panel" open={agreements.length > 0}>
      <summary>{locale === "it" ? "Accordi di comproprietà" : "Co-ownership agreements"}</summary>
      {agreements.map((agreement) => (
        <div className="coownership-agreement-card" key={agreement.id}>
          {agreementDocument(agreement, locale, printAgreementId === agreement.id)}
          <div className="inline-form no-print">
            <button type="button" className="secondary compact" onClick={() => printAgreement(agreement.id)}>{locale === "it" ? "Stampa / salva PDF" : "Print / save PDF"}</button>
            {agreement.can_cancel ? <button type="button" className="danger compact" disabled={saving} onClick={() => onCancel(agreement)}>{locale === "it" ? "Cancella proposta invalidata" : "Delete invalidated proposal"}</button> : null}
          </div>
          {agreement.participants.some((item) => item.invite_url) ? (
            <details className="no-print">
              <summary>{locale === "it" ? "Link personali di invito" : "Personal invitation links"}</summary>
              {agreement.participants.map((participant) => participant.invite_url ? (
                <div className="member-row" key={participant.id}>
                  <span>{participant.name} · {participant.delivery_status}</span>
                  <button type="button" className="secondary compact" onClick={() => navigator.clipboard?.writeText(participant.invite_url || "")}>{locale === "it" ? "Copia link" : "Copy link"}</button>
                </div>
              ) : null)}
            </details>
          ) : null}
        </div>
      ))}
      {canWrite && !blockingAgreement ? (
        <form className="wine-form no-print" onSubmit={submit}>
          <h3>{locale === "it" ? "Crea una nuova versione" : "Create a new version"}</h3>
          <p className="coownership-form-help">{locale === "it" ? "Definisci quote, custodia e regole condivise per questa posizione." : "Define the shares, custody, and shared rules for this position."}</p>
          <label><span>{locale === "it" ? "Tipo di comproprietà" : "Ownership type"}</span><select value={ownershipMode} onChange={(event) => setOwnershipMode(event.target.value as "undivided" | "allocated")}><option value="undivided">{locale === "it" ? "Quota indivisa sul lotto" : "Undivided lot share"}</option><option value="allocated">{locale === "it" ? "Bottiglie assegnate" : "Allocated bottles"}</option></select></label>
          <label><span>{locale === "it" ? "Luogo di custodia" : "Custody location"}</span><input value={custodyLocation} onChange={(event) => setCustodyLocation(event.target.value)} /></label>
          <label><span>{locale === "it" ? "Condizioni" : "Terms"}</span><textarea rows={5} value={terms} onChange={(event) => setTerms(event.target.value)} placeholder={locale === "it" ? "Regole per apertura, vendita, spostamento, spese e uscita dalla comproprietà." : "Rules for opening, selling, moving, expenses, and leaving the co-ownership."} /></label>
          <div className="ownership-editor">
            <strong>{locale === "it" ? "Partecipanti" : "Participants"} · {total.toLocaleString(locale, { maximumFractionDigits: 6 })}%</strong>
            {participants.map((participant, index) => (
              <div className="coownership-participant-editor" key={index}>
                <div className="coownership-participant-heading">
                  <strong>{locale === "it" ? `Partecipante ${index + 1}` : `Participant ${index + 1}`}</strong>
                  <button type="button" className="danger compact" disabled={participants.length <= 2} onClick={() => setParticipants(participants.filter((_, itemIndex) => itemIndex !== index))}>{locale === "it" ? "Rimuovi" : "Remove"}</button>
                </div>
                <div className="ownership-edit-row">
                  <label><span>{locale === "it" ? "Nome" : "Name"}</span><input required value={participant.name} onChange={(event) => setParticipants(participants.map((item, itemIndex) => itemIndex === index ? { ...item, name: event.target.value } : item))} /></label>
                  <label><span>Email</span><input required type="email" value={participant.email} onChange={(event) => setParticipants(participants.map((item, itemIndex) => itemIndex === index ? { ...item, email: event.target.value } : item))} /></label>
                  <label><span>{locale === "it" ? "Quota (%)" : "Share (%)"}</span><input required type="number" min="0.000001" max="100" step="0.000001" value={participant.share_pct} onChange={(event) => setParticipants(participants.map((item, itemIndex) => itemIndex === index ? { ...item, share_pct: event.target.value } : item))} /></label>
                  <label><span>{locale === "it" ? "Contributo" : "Contribution"}</span><input type="number" min="0" step="0.01" value={participant.contribution} onChange={(event) => setParticipants(participants.map((item, itemIndex) => itemIndex === index ? { ...item, contribution: event.target.value } : item))} /></label>
                </div>
              </div>
            ))}
            <button type="button" className="secondary compact" onClick={() => setParticipants([...participants, { name: "", email: "", share_pct: "", contribution: "" }])}>+ {locale === "it" ? "Partecipante" : "Participant"}</button>
          </div>
          <label className="detail-toggle-row"><input type="checkbox" checked={emailRegisteredUsers} onChange={(event) => setEmailRegisteredUsers(event.target.checked)} /><span>{locale === "it" ? "Invia email anche agli utenti Vinaris (riceveranno comunque una notifica)" : "Email Vinaris users too (they always receive an in-app notification)"}</span></label>
          <button type="submit" disabled={saving || participants.length < 2 || Math.abs(total - 100) > 0.000001}>{saving ? "…" : locale === "it" ? "Crea e invia accordo" : "Create and send agreement"}</button>
        </form>
      ) : blockingAgreement ? <p className="empty-state">{blockingAgreement.status === "invalidated" ? (locale === "it" ? "Questa proposta è stata invalidata da un rifiuto. L'iniziatore deve cancellarla prima di crearne una nuova versione." : "This proposal was invalidated by a rejection. Its initiator must delete it before a new version can be created.") : (locale === "it" ? "È già presente una proposta in attesa di risposta." : "A proposal is already awaiting responses.")}</p> : null}
    </details>
  );
}


export function CoOwnershipPublicPage({ token, locale, onClose }: { token: string; locale: Locale; onClose: () => void }) {
  const [agreement, setAgreement] = useState<CoOwnershipAgreement | null>(null);
  const [fullName, setFullName] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [confirmed, setConfirmed] = useState(false);

  useEffect(() => {
    api<CoOwnershipAgreement>(`/api/v1/co-ownership-agreements/public/${encodeURIComponent(token)}`)
      .then((value) => {
        setAgreement(value);
        const participant = value.participants.find((item) => item.id === value.responding_participant_id);
        setFullName(participant?.name || "");
      })
      .catch((nextError) => setError(nextError instanceof Error ? nextError.message : "Unable to load agreement"));
  }, [token]);

  async function respond(decision: "accepted" | "declined") {
    if (!fullName.trim()) return;
    setSaving(true);
    setError("");
    try {
      setAgreement(await api<CoOwnershipAgreement>(`/api/v1/co-ownership-agreements/public/${encodeURIComponent(token)}/respond`, { method: "POST", body: JSON.stringify({ decision, full_name: fullName.trim() }) }));
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Unable to respond");
    } finally {
      setSaving(false);
    }
  }

  const participant = agreement?.participants.find((item) => item.id === agreement.responding_participant_id);
  return (
    <main className="coownership-public-page">
      <div className="coownership-public-actions no-print"><button type="button" className="secondary" onClick={onClose}>{locale === "it" ? "Torna a Vinaris" : "Back to Vinaris"}</button>{agreement ? <button type="button" className="secondary" onClick={() => window.print()}>{locale === "it" ? "Stampa / salva PDF" : "Print / save PDF"}</button> : null}</div>
      {error ? <div className="error-banner"><span>{error}</span></div> : null}
      {agreement ? agreementDocument(agreement, locale) : !error ? <p>{locale === "it" ? "Caricamento accordo…" : "Loading agreement…"}</p> : null}
      {agreement && participant?.status === "pending" ? (
        <section className="wine-form coownership-response no-print">
          <h3>{locale === "it" ? "La tua risposta" : "Your response"}</h3>
          <label><span>{locale === "it" ? "Conferma il tuo nome completo" : "Confirm your full name"}</span><input value={fullName} onChange={(event) => setFullName(event.target.value)} required /></label>
          <label className="detail-toggle-row"><input type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} /><span>{locale === "it" ? "Dichiaro di aver letto il documento e di esprimere la decisione indicata." : "I declare that I have read the document and express the decision selected below."}</span></label>
          <div className="inline-form"><button type="button" disabled={saving || !fullName.trim() || !confirmed} onClick={() => respond("accepted")}>{locale === "it" ? "Accetta" : "Accept"}</button><button type="button" className="danger" disabled={saving || !fullName.trim() || !confirmed} onClick={() => respond("declined")}>{locale === "it" ? "Rifiuta" : "Decline"}</button></div>
        </section>
      ) : agreement && participant ? <div className="invite-notice no-print"><strong>{locale === "it" ? "Risposta registrata" : "Response recorded"}</strong><span>{statusLabel(participant.status, locale)}</span></div> : null}
    </main>
  );
}
