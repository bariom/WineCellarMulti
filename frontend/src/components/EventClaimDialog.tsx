import { useState, type FormEvent } from "react";
import { LEGAL_DOCUMENT_VERSION } from "../legal/legalDocuments";
import { api } from "../services/api";
import type { Locale, Session } from "../types";
import "./EventClaimDialog.css";

/**
 * "Keep tonight": an event guest turns the throw-away account into their own.
 * Nothing they did at the table is lost; the e-mail is confirmed afterwards.
 */
export default function EventClaimDialog({ locale, eventName, onClose, onClaimed }: {
  locale: Locale;
  eventName: string;
  onClose: () => void;
  onClaimed: (session: Session, email: string) => void;
}) {
  const it = locale === "it";
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [householdName, setHouseholdName] = useState(it ? "La mia cantina" : "My cellar");
  const [privacy, setPrivacy] = useState(false);
  const [terms, setTerms] = useState(false);
  const [photos, setPhotos] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const ready = displayName.trim() && email.trim() && password.length >= 8 && householdName.trim() && privacy && terms && photos;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!ready || saving) return;
    setSaving(true);
    setError("");
    try {
      const session = await api<Session>("/api/v1/events/claim", {
        method: "POST",
        body: JSON.stringify({
          email: email.trim(),
          display_name: displayName.trim(),
          password,
          household_name: householdName.trim(),
          locale,
          legal_document_version: LEGAL_DOCUMENT_VERSION,
          privacy_policy_accepted: true,
          terms_accepted: true,
          photo_usage_disclaimer_accepted: true,
        }),
      });
      onClaimed(session, email.trim());
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : (it ? "Impossibile creare l’account." : "Unable to create the account."));
    } finally {
      setSaving(false);
    }
  }

  return <div className="auth-modal-overlay" onClick={() => !saving && onClose()}>
    <section className="auth-modal-card event-claim-dialog" role="dialog" aria-modal="true" aria-labelledby="event-claim-title" onClick={(event) => event.stopPropagation()}>
      <div className="auth-modal-head">
        <div>
          <strong>{it ? `Ospite di ${eventName}` : `Guest at ${eventName}`}</strong>
          <h2 id="event-claim-title">{it ? "Tieni questa serata" : "Keep tonight"}</h2>
        </div>
        <button type="button" className="secondary compact" onClick={onClose} disabled={saving}>{it ? "Chiudi" : "Close"}</button>
      </div>
      <form className="auth-panel" onSubmit={submit}>
        <p className="event-claim-intro">{it
          ? "Quello che hai fatto stasera diventa il tuo account Vinaris: nulla ricomincia da zero. Ti mandiamo un’e-mail per confermare l’indirizzo."
          : "What you did tonight becomes your Vinaris account: nothing starts over. We will send an e-mail to confirm the address."}</p>
        <label><span>{it ? "Il tuo nome" : "Your name"}</span><input autoFocus value={displayName} onChange={(event) => setDisplayName(event.target.value)} autoComplete="name" required maxLength={120} /></label>
        <label><span>E-mail</span><input type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" required /></label>
        <label><span>Password</span><input type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="new-password" required minLength={8} maxLength={200} /><small>{it ? "Almeno 8 caratteri." : "At least 8 characters."}</small></label>
        <label><span>{it ? "Nome della tua cantina" : "Name of your cellar"}</span><input value={householdName} onChange={(event) => setHouseholdName(event.target.value)} required maxLength={160} /></label>
        <label className="event-claim-consent"><input type="checkbox" checked={privacy} onChange={(event) => setPrivacy(event.target.checked)} required /><span>{it ? "Ho letto e accetto l’" : "I have read and accept the "}<a href={`/privacy?lang=${locale}`} target="_blank" rel="noreferrer">{it ? "Informativa privacy" : "Privacy Policy"}</a></span></label>
        <label className="event-claim-consent"><input type="checkbox" checked={terms} onChange={(event) => setTerms(event.target.checked)} required /><span>{it ? "Ho letto e accetto le " : "I have read and accept the "}<a href={`/terms?lang=${locale}`} target="_blank" rel="noreferrer">{it ? "Condizioni d’uso" : "Terms of Service"}</a></span></label>
        <label className="event-claim-consent"><input type="checkbox" checked={photos} onChange={(event) => setPhotos(event.target.checked)} required /><span>{it ? "Le foto che carico mostrano solo bottiglie, etichette e carte dei vini." : "The photos I upload show only bottles, labels and wine lists."}</span></label>
        {error ? <p role="alert" className="event-claim-error">{error}</p> : null}
        <div className="form-actions">
          <button type="button" className="secondary" onClick={onClose} disabled={saving}>{it ? "Non ora" : "Not now"}</button>
          <button type="submit" disabled={!ready || saving}>{saving ? (it ? "Creazione…" : "Creating…") : (it ? "Crea il mio account" : "Create my account")}</button>
        </div>
      </form>
    </section>
  </div>;
}
