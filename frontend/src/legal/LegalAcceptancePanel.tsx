import { FormEvent, useState } from "react";
import { api } from "../services/api";
import type { Locale, Session } from "../types";
import { LEGAL_DOCUMENT_VERSION } from "./legalDocuments";

export type LegalAcceptancePayload = {
  privacy_policy_accepted: boolean;
  terms_accepted: boolean;
};

export default function LegalAcceptancePanel({
  locale,
  onAccepted,
  onLogout,
}: {
  locale: Locale;
  onAccepted: (session: Session) => Promise<void>;
  onLogout: () => Promise<void>;
}) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [acceptance, setAcceptance] = useState<LegalAcceptancePayload>({
    privacy_policy_accepted: false,
    terms_accepted: false,
  });

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!acceptance.privacy_policy_accepted || !acceptance.terms_accepted) return;
    setSaving(true);
    setError("");
    try {
      const session = await api<Session>("/api/v1/auth/legal-acceptance", {
        method: "POST",
        body: JSON.stringify({
          locale,
          legal_document_version: LEGAL_DOCUMENT_VERSION,
          ...acceptance,
        }),
      });
      await onAccepted(session);
    } catch (nextError) {
      setError(
        nextError instanceof Error
          ? nextError.message
          : locale === "it"
            ? "Impossibile registrare l'accettazione."
            : "Unable to record acceptance.",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="auth-panel legal-acceptance-panel">
      <form className="wine-form" onSubmit={submit}>
        <div className="auth-form-heading">
          <p className="eyebrow">{locale === "it" ? "Documenti aggiornati" : "Updated documents"}</p>
          <h2>{locale === "it" ? "Rivedi privacy e condizioni" : "Review privacy and terms"}</h2>
          <p>
            {locale === "it"
              ? "Per continuare, leggi e accetta la versione corrente dei documenti."
              : "To continue, read and accept the current document version."}
          </p>
          <span>{LEGAL_DOCUMENT_VERSION}</span>
        </div>
        <Consent
          checked={acceptance.privacy_policy_accepted}
          href={`/privacy?lang=${locale}`}
          label={locale === "it" ? "Informativa privacy" : "Privacy Policy"}
          prefix={locale === "it" ? "Ho letto e accetto l’" : "I have read and accept the "}
          onChange={(checked) => setAcceptance((current) => ({ ...current, privacy_policy_accepted: checked }))}
        />
        <Consent
          checked={acceptance.terms_accepted}
          href={`/terms?lang=${locale}`}
          label={locale === "it" ? "Condizioni d’uso" : "Terms of Service"}
          prefix={locale === "it" ? "Ho letto e accetto le " : "I have read and accept the "}
          onChange={(checked) => setAcceptance((current) => ({ ...current, terms_accepted: checked }))}
        />
        <button
          type="submit"
          disabled={saving || !acceptance.privacy_policy_accepted || !acceptance.terms_accepted}
        >
          {saving ? (locale === "it" ? "Attendi…" : "Working…") : locale === "it" ? "Accetta e continua" : "Accept and continue"}
        </button>
        <button type="button" className="secondary" onClick={() => void onLogout()}>
          {locale === "it" ? "Esci" : "Log out"}
        </button>
        {error ? <p className="error">{error}</p> : null}
      </form>
    </section>
  );
}

function Consent({
  checked,
  href,
  label,
  prefix,
  onChange,
}: {
  checked: boolean;
  href: string;
  label: string;
  prefix: string;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="photo-disclaimer-consent legal-consent">
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        required
      />
      <span>
        {prefix}
        <a href={href} target="_blank" rel="noreferrer">{label}</a>.
      </span>
    </label>
  );
}
