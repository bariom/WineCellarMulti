import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

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


function participantStatusSummary(agreement: CoOwnershipAgreement, status: "pending" | "declined", locale: Locale) {
  const participants = agreement.participants.filter((participant) => participant.status === status);
  if (!participants.length) return "";
  const names = participants.map((participant) => participant.name).join(", ");
  if (status === "declined") {
    return locale === "it"
      ? `${names} ${participants.length === 1 ? "ha rifiutato" : "hanno rifiutato"}`
      : `${names} ${participants.length === 1 ? "has" : "have"} declined`;
  }
  return locale === "it"
    ? `${names} ${participants.length === 1 ? "deve" : "devono"} ancora accettare`
    : `${names} ${participants.length === 1 ? "still needs" : "still need"} to accept`;
}


function agreementDocument(agreement: CoOwnershipAgreement, locale: Locale, printable = false) {
  const wine = agreement.wine_snapshot;
  const declinedSummary = participantStatusSummary(agreement, "declined", locale);
  const pendingSummary = participantStatusSummary(agreement, "pending", locale);
  return (
    <article className={`coownership-document${printable ? " coownership-printable" : ""}`}>
      <header>
        <p>{locale === "it" ? "Dichiarazione e accordo tra le parti" : "Declaration and agreement between the parties"}</p>
        <h2>{locale === "it" ? "Accordo di comproprietà dei vini" : "Wine co-ownership agreement"}</h2>
        <span>{locale === "it" ? "Versione" : "Version"} {agreement.version} · {statusLabel(agreement.status, locale)}</span>
      </header>
      <div className="detail-grid coownership-detail-grid">
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
        {declinedSummary ? (
          <div className="coownership-response-alert status-declined" role="status">
            <strong>{locale === "it" ? "Accordo rifiutato" : "Agreement declined"}</strong>
            <span>{declinedSummary}</span>
          </div>
        ) : null}
        {pendingSummary ? (
          <div className="coownership-response-alert status-pending" role="status">
            <strong>{locale === "it" ? "Risposte mancanti" : "Responses outstanding"}</strong>
            <span>{pendingSummary}</span>
          </div>
        ) : null}
        <div className="ownership-list">
          {agreement.participants.map((participant) => (
            <div className={`ownership-row participant-status-${participant.status}`} key={participant.id}>
              <span>{participant.name} · {participant.email}<small className={`coownership-status status-${participant.status}`}>{statusLabel(participant.status, locale)}</small></span>
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


type PaymentDraft = { amount: string; paid_on: string; note: string };

function todayValue() {
  return new Date().toISOString().slice(0, 10);
}


function PrintableAgreement({ agreement, locale }: { agreement: CoOwnershipAgreement; locale: Locale }) {
  return createPortal(
    <div className="coownership-print-root">{agreementDocument(agreement, locale, true)}</div>,
    document.body,
  );
}


export function CoOwnershipAgreementLibrary({ agreements, locale, focusAgreementId, currentUserEmail }: {
  agreements: CoOwnershipAgreement[];
  locale: Locale;
  focusAgreementId?: string | null;
  currentUserEmail: string | null;
}) {
  const [selectedAgreementId, setSelectedAgreementId] = useState<string | null>(agreements[0]?.id || null);
  const [printAgreementId, setPrintAgreementId] = useState<string | null>(null);
  const [respondedAgreement, setRespondedAgreement] = useState<CoOwnershipAgreement | null>(null);
  const [fullName, setFullName] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [responding, setResponding] = useState(false);
  const [responseError, setResponseError] = useState("");
  const listedAgreement = agreements.find((agreement) => agreement.id === selectedAgreementId) || agreements[0] || null;
  const selectedAgreement = respondedAgreement?.id === listedAgreement?.id ? respondedAgreement : listedAgreement;
  const respondingParticipant = selectedAgreement?.participants.find(
    (participant) => participant.email.toLowerCase() === currentUserEmail?.toLowerCase(),
  );

  useEffect(() => {
    if (!selectedAgreementId || !agreements.some((agreement) => agreement.id === selectedAgreementId)) {
      setSelectedAgreementId(agreements[0]?.id || null);
    }
  }, [agreements, selectedAgreementId]);

  useEffect(() => {
    if (focusAgreementId && agreements.some((agreement) => agreement.id === focusAgreementId)) {
      setSelectedAgreementId(focusAgreementId);
    }
  }, [agreements, focusAgreementId]);

  useEffect(() => {
    setFullName(respondingParticipant?.name || "");
    setConfirmed(false);
  }, [selectedAgreement?.id, respondingParticipant?.id]);

  function printAgreement() {
    if (!selectedAgreement) return;
    setPrintAgreementId(selectedAgreement.id);
    window.requestAnimationFrame(() => {
      window.print();
      setPrintAgreementId(null);
    });
  }

  async function respond(decision: "accepted" | "declined") {
    if (!selectedAgreement || !fullName.trim()) return;
    setResponding(true);
    setResponseError("");
    try {
      const response = await api<CoOwnershipAgreement>(`/api/v1/co-ownership-agreements/${selectedAgreement.id}/respond`, {
        method: "POST",
        body: JSON.stringify({ decision, full_name: fullName.trim() }),
      });
      setRespondedAgreement(response);
    } catch (nextError) {
      setResponseError(nextError instanceof Error ? nextError.message : "Unable to respond to agreement");
    } finally {
      setResponding(false);
    }
  }

  return (
    <section className="coownership-library">
      <div className="coownership-library-list" role="list" aria-label={locale === "it" ? "I miei accordi di comproprietà" : "My co-ownership agreements"}>
        {agreements.map((agreement) => {
          const wine = agreement.wine_snapshot;
          const wineLabel = [String(wine.name || ""), String(wine.vintage || "")].filter(Boolean).join(" ");
          const declinedSummary = participantStatusSummary(agreement, "declined", locale);
          const pendingSummary = participantStatusSummary(agreement, "pending", locale);
          const attentionStatus = declinedSummary ? "declined" : pendingSummary ? "pending" : null;
          const attentionSummary = declinedSummary || pendingSummary;
          return (
            <button
              className={`coownership-library-item${agreement.id === selectedAgreement?.id ? " active" : ""}${attentionStatus ? ` attention-${attentionStatus}` : ""}`}
              key={agreement.id}
              type="button"
              role="listitem"
              aria-pressed={agreement.id === selectedAgreement?.id}
              onClick={() => setSelectedAgreementId(agreement.id)}
            >
              <span className="coownership-library-copy">
                <strong>{wineLabel || (locale === "it" ? "Vino senza nome" : "Unnamed wine")}</strong>
                <small>{String(wine.producer || "-")} · {locale === "it" ? "Versione" : "Version"} {agreement.version}</small>
                {attentionStatus ? <b className={`coownership-response-summary status-${attentionStatus}`}>{attentionSummary}</b> : null}
              </span>
              <span className="coownership-library-state">
                <em className={`coownership-status status-${agreement.status}`}>{statusLabel(agreement.status, locale)}</em>
              </span>
            </button>
          );
        })}
      </div>
      {selectedAgreement ? (
        <div className="coownership-library-detail">
          {agreementDocument(selectedAgreement, locale)}
          {responseError ? <div className="error-banner"><span>{responseError}</span></div> : null}
          {selectedAgreement.status === "pending" && respondingParticipant?.status === "pending" ? (
            <section className="wine-form coownership-response no-print">
              <h3>{locale === "it" ? "La tua risposta" : "Your response"}</h3>
              <label><span>{locale === "it" ? "Conferma il tuo nome completo" : "Confirm your full name"}</span><input value={fullName} onChange={(event) => setFullName(event.target.value)} required /></label>
              <label className="detail-toggle-row"><input type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} /><span>{locale === "it" ? "Dichiaro di aver letto il documento e di esprimere la decisione indicata." : "I declare that I have read the document and express the decision selected below."}</span></label>
              <div className="inline-form"><button type="button" disabled={responding || !fullName.trim() || !confirmed} onClick={() => void respond("accepted")}>{locale === "it" ? "Accetta" : "Accept"}</button><button type="button" className="danger" disabled={responding || !fullName.trim() || !confirmed} onClick={() => void respond("declined")}>{locale === "it" ? "Rifiuta" : "Decline"}</button></div>
            </section>
          ) : null}
          <div className="inline-form no-print">
            <button type="button" className="secondary compact" onClick={printAgreement}>{locale === "it" ? "Stampa / salva PDF" : "Print / save PDF"}</button>
          </div>
        </div>
      ) : (
        <p className="empty-state">{locale === "it" ? "Non partecipi ancora ad alcun accordo di comproprietà." : "You are not part of any co-ownership agreement yet."}</p>
      )}
      {selectedAgreement && printAgreementId === selectedAgreement.id ? <PrintableAgreement agreement={selectedAgreement} locale={locale} /> : null}
    </section>
  );
}

function paymentMoney(value: string | null, currency: string, locale: Locale) {
  if (value === null) return "—";
  return `${currency} ${Number(value).toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function PaymentLedger({ agreement, locale, saving, onRecord, onVoid }: {
  agreement: CoOwnershipAgreement;
  locale: Locale;
  saving: boolean;
  onRecord?: (participantId: string, payload: { amount: number; paid_on: string; note: string }) => Promise<void>;
  onVoid?: (paymentId: string) => Promise<void>;
}) {
  const currency = String(agreement.wine_snapshot.currency || "CHF");
  const [drafts, setDrafts] = useState<Record<string, PaymentDraft>>({});
  const draftFor = (participantId: string): PaymentDraft => drafts[participantId] || { amount: "", paid_on: todayValue(), note: "" };

  function updateDraft(participantId: string, patch: Partial<PaymentDraft>) {
    setDrafts((current) => ({ ...current, [participantId]: { ...draftFor(participantId), ...patch } }));
  }

  async function submitPayment(event: FormEvent, participantId: string) {
    event.preventDefault();
    const draft = draftFor(participantId);
    const amount = Number(draft.amount);
    if (!onRecord || !Number.isFinite(amount) || amount <= 0 || !draft.paid_on) return;
    await onRecord(participantId, { amount, paid_on: draft.paid_on, note: draft.note.trim() });
    setDrafts((current) => ({ ...current, [participantId]: { amount: "", paid_on: todayValue(), note: "" } }));
  }

  return (
    <section className="coownership-payment-ledger no-print">
      <div className="coownership-ledger-heading">
        <div><span>{locale === "it" ? "Registro economico" : "Separate financial ledger"}</span><h3>{locale === "it" ? "Versamenti e rimborsi" : "Payments and reimbursements"}</h3></div>
        <small>{locale === "it" ? "Non modifica quote, accettazioni o documento firmato." : "Does not change shares, acceptances, or the signed document."}</small>
      </div>
      <div className="coownership-ledger-list">
        {agreement.participants.map((participant) => {
          const draft = draftFor(participant.id);
          const settled = participant.outstanding !== null && Number(participant.outstanding) <= 0;
          const open = participant.outstanding !== null && Number(participant.outstanding) > 0;
          return (
            <article className={`coownership-ledger-participant${open ? " open" : ""}${settled ? " settled" : ""}`} key={participant.id}>
              <header>
                <div><strong>{participant.name}</strong><span>{participant.email}</span></div>
                <span className={`coownership-balance-status${settled ? " settled" : ""}`}>
                  {participant.contribution === null ? (locale === "it" ? "Da definire" : "Not defined") : settled ? (locale === "it" ? "Saldato" : "Settled") : (locale === "it" ? "Aperto" : "Open")}
                </span>
              </header>
              <div className="coownership-ledger-totals">
                <div><span>{locale === "it" ? "Dovuto" : "Due"}</span><strong>{paymentMoney(participant.contribution, currency, locale)}</strong></div>
                <div><span>{locale === "it" ? "Versato" : "Paid"}</span><strong>{paymentMoney(participant.paid_total, currency, locale)}</strong></div>
                <div><span>{locale === "it" ? "Residuo" : "Outstanding"}</span><strong>{paymentMoney(participant.outstanding, currency, locale)}</strong></div>
              </div>
              {participant.payments.length ? (
                <div className="coownership-payment-list">
                  {participant.payments.map((payment) => (
                    <div className={`coownership-payment-row${payment.voided_at ? " voided" : ""}`} key={payment.id}>
                      <span><strong>{paymentMoney(payment.amount, payment.currency, locale)}</strong><small>{new Date(`${payment.paid_on}T00:00:00`).toLocaleDateString(locale)}{payment.note ? ` · ${payment.note}` : ""}</small></span>
                      {payment.voided_at ? <small>{locale === "it" ? "Annullato" : "Voided"}</small> : agreement.can_manage_payments && onVoid ? <button type="button" className="secondary compact" disabled={saving} onClick={() => onVoid(payment.id)}>{locale === "it" ? "Annulla" : "Void"}</button> : null}
                    </div>
                  ))}
                </div>
              ) : <p className="empty-state">{locale === "it" ? "Nessun versamento registrato." : "No payments recorded."}</p>}
              {agreement.can_manage_payments && onRecord ? (
                <form className="coownership-payment-form" onSubmit={(event) => submitPayment(event, participant.id)}>
                  <label><span>{locale === "it" ? "Importo" : "Amount"}</span><input required type="number" min="0.01" step="0.01" value={draft.amount} onChange={(event) => updateDraft(participant.id, { amount: event.target.value })} /></label>
                  <label><span>{locale === "it" ? "Data" : "Date"}</span><input required type="date" value={draft.paid_on} onChange={(event) => updateDraft(participant.id, { paid_on: event.target.value })} /></label>
                  <label><span>{locale === "it" ? "Nota" : "Note"}</span><input maxLength={500} value={draft.note} onChange={(event) => updateDraft(participant.id, { note: event.target.value })} placeholder={locale === "it" ? "Bonifico, contanti…" : "Transfer, cash…"} /></label>
                  <button type="submit" className="compact" disabled={saving || !draft.amount || Number(draft.amount) <= 0}>{locale === "it" ? "Registra" : "Record"}</button>
                </form>
              ) : null}
            </article>
          );
        })}
      </div>
    </section>
  );
}

export function CoOwnershipPanel({ wine, session, agreements, canWrite, saving, focusRequestId, onCreate, onCancel, onRecordPayment, onVoidPayment }: {
  wine: Wine;
  session: Session | null;
  agreements: CoOwnershipAgreement[];
  canWrite: boolean;
  saving: boolean;
  focusRequestId?: string;
  onCreate: (payload: Record<string, unknown>) => Promise<void>;
  onCancel: (agreement: CoOwnershipAgreement) => Promise<void>;
  onRecordPayment: (agreement: CoOwnershipAgreement, participantId: string, payload: { amount: number; paid_on: string; note: string }) => Promise<void>;
  onVoidPayment: (agreement: CoOwnershipAgreement, paymentId: string) => Promise<void>;
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
  const panelRef = useRef<HTMLDetailsElement>(null);

  useEffect(() => setParticipants(initialParticipants), [initialParticipants]);

  useEffect(() => {
    if (!focusRequestId || !panelRef.current) return;
    panelRef.current.open = true;
    const frame = window.requestAnimationFrame(() => {
      panelRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [focusRequestId]);

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
  const blockingAgreement = agreements.find((agreement) => agreement.status === "pending" || agreement.status === "invalidated" || agreement.status === "declined");
  const printableAgreement = agreements.find((agreement) => agreement.id === printAgreementId) || null;

  function printAgreement(agreementId: string) {
    setPrintAgreementId(agreementId);
    window.requestAnimationFrame(() => {
      window.print();
      setPrintAgreementId(null);
    });
  }

  return (
    <details ref={panelRef} className="wine-form share-panel collapsible-panel coownership-panel">
      <summary>{locale === "it" ? "Accordi di comproprietà" : "Co-ownership agreements"}</summary>
      {agreements.map((agreement) => (
        <div className="coownership-agreement-card" key={agreement.id}>
          {agreementDocument(agreement, locale)}
          <PaymentLedger
            agreement={agreement}
            locale={locale}
            saving={saving}
            onRecord={(participantId, payload) => onRecordPayment(agreement, participantId, payload)}
            onVoid={(paymentId) => onVoidPayment(agreement, paymentId)}
          />
          <div className="inline-form no-print">
            <button type="button" className="secondary compact" onClick={() => printAgreement(agreement.id)}>{locale === "it" ? "Stampa / salva PDF" : "Print / save PDF"}</button>
            {agreement.can_cancel ? <button type="button" className="danger compact" disabled={saving} onClick={() => onCancel(agreement)}>{locale === "it" ? "Cancella proposta rifiutata" : "Delete rejected proposal"}</button> : null}
          </div>
          {agreement.participants.some((item) => item.invite_url) ? (
            <details className="no-print">
              <summary>{locale === "it" ? "Link personali di invito" : "Personal invitation links"} · {locale === "it" ? "Stato" : "Status"}: {statusLabel(agreement.status, locale)}</summary>
              {agreement.participants.map((participant) => participant.invite_url ? (
                <div className="member-row" key={participant.id}>
                  <span>{participant.name} · {statusLabel(participant.status, locale)} · {participant.delivery_status}</span>
                  <button type="button" className="secondary compact" onClick={() => navigator.clipboard?.writeText(participant.invite_url || "")}>{locale === "it" ? "Copia link" : "Copy link"}</button>
                </div>
              ) : null)}
            </details>
          ) : null}
        </div>
      ))}
      {canWrite && !blockingAgreement ? (
        <details className="coownership-create-version no-print">
          <summary>{locale === "it" ? "Crea una nuova versione" : "Create a new version"}</summary>
          <form className="wine-form" onSubmit={submit}>
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
        </details>
      ) : blockingAgreement ? <p className="empty-state">{blockingAgreement.status === "invalidated" || blockingAgreement.status === "declined" ? (locale === "it" ? "Questa proposta è stata rifiutata. L'iniziatore può cancellarla prima di crearne una nuova versione." : "This proposal was rejected. Its initiator can delete it before a new version is created.") : (locale === "it" ? "È già presente una proposta in attesa di risposta." : "A proposal is already awaiting responses.")}</p> : null}
      {printableAgreement ? <PrintableAgreement agreement={printableAgreement} locale={locale} /> : null}
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
      {agreement ? <>{agreementDocument(agreement, locale)}<PaymentLedger agreement={agreement} locale={locale} saving={saving} /></> : !error ? <p>{locale === "it" ? "Caricamento accordo…" : "Loading agreement…"}</p> : null}
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
