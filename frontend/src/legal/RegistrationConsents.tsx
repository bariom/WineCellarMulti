import type { AuthDraft, Locale } from "../types";

export default function RegistrationConsents({
  locale,
  draft,
  photoText,
  onChange,
}: {
  locale: Locale;
  draft: AuthDraft;
  photoText: string;
  onChange: (draft: AuthDraft) => void;
}) {
  return (
    <>
      <Consent
        checked={draft.privacy_policy_accepted}
        href={`/privacy?lang=${locale}`}
        prefix={locale === "it" ? "Ho letto e accetto l’" : "I have read and accept the "}
        label={locale === "it" ? "Informativa privacy" : "Privacy Policy"}
        onChange={(checked) => onChange({ ...draft, privacy_policy_accepted: checked })}
      />
      <Consent
        checked={draft.terms_accepted}
        href={`/terms?lang=${locale}`}
        prefix={locale === "it" ? "Ho letto e accetto le " : "I have read and accept the "}
        label={locale === "it" ? "Condizioni d’uso" : "Terms of Service"}
        onChange={(checked) => onChange({ ...draft, terms_accepted: checked })}
      />
      <label className="photo-disclaimer-consent">
        <input
          type="checkbox"
          checked={draft.photo_usage_disclaimer_accepted}
          onChange={(event) => onChange({ ...draft, photo_usage_disclaimer_accepted: event.target.checked })}
          required
        />
        <span>{photoText}</span>
      </label>
    </>
  );
}

function Consent({
  checked,
  href,
  prefix,
  label,
  onChange,
}: {
  checked: boolean;
  href: string;
  prefix: string;
  label: string;
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
      <span>{prefix}<a href={href} target="_blank" rel="noreferrer">{label}</a>.</span>
    </label>
  );
}
