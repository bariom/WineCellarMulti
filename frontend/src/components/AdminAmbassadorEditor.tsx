import { useEffect, useState } from "react";
import type { AppUser, Locale } from "../types";
import { AppIcon } from "./AppIcon";
import "./AdminAmbassadorEditor.css";

export type AmbassadorChange = { ambassador: { valid_until: string; ai_credit_target_usd: string } } | { revoke_ambassador: true };

function localDateTime(value: string | null | undefined) {
  if (!value) return "";
  const date = new Date(value);
  date.setMinutes(date.getMinutes() - date.getTimezoneOffset());
  return date.toISOString().slice(0, 16);
}

export default function AdminAmbassadorEditor({ user, locale, saving, onSave }: {
  user: AppUser; locale: Locale; saving: boolean; onSave: (change: AmbassadorChange) => Promise<void>;
}) {
  const it = locale === "it";
  const [until, setUntil] = useState(() => localDateTime(user.ambassador_until));
  const [credit, setCredit] = useState(user.ambassador_ai_credit_balance_usd || "0");
  useEffect(() => {
    setUntil(localDateTime(user.ambassador_until));
    setCredit(user.ambassador_ai_credit_balance_usd || "0");
  }, [user.id, user.ambassador_until, user.ambassador_ai_credit_balance_usd]);

  return <details className="admin-user-detail-accordion" open={Boolean(user.is_ambassador)}>
    <summary><span><AppIcon name="star" /><strong>Vinaris Ambassador</strong><small>{user.is_ambassador ? (it ? "Affiliazione attiva" : "Active affiliation") : (it ? "Accesso promozionale a tempo" : "Time-limited promotional access")}</small></span></summary>
    <form className="admin-user-access-editor ambassador-editor" onSubmit={event => {
      event.preventDefault();
      void onSave({ ambassador: { valid_until: new Date(until).toISOString(), ai_credit_target_usd: credit } });
    }}>
      <p>{it ? "Tutte le funzionalità utente, senza permessi amministrativi. Il credito omaggio scade con l’affiliazione; il credito acquistato resta disponibile." : "All user features, without administrative permissions. Promotional credit expires with the affiliation; purchased credit stays available."}</p>
      <label><span>{it ? "Scadenza affiliazione" : "Affiliation expiry"}</span><input type="datetime-local" required value={until} onChange={event => setUntil(event.target.value)} /></label>
      <label><span>{it ? "Saldo AI Ambassador da impostare (USD)" : "Target Ambassador AI balance (USD)"}</span><input type="number" required min="0" max="99999" step="0.000001" value={credit} onChange={event => setCredit(event.target.value)} /></label>
      <button type="submit" className="secondary compact" disabled={saving || !until || !credit}>{it ? "Salva affiliazione Ambassador" : "Save Ambassador affiliation"}</button>
      {user.ambassador_until ? <button type="button" className="secondary compact" disabled={saving} onClick={() => void onSave({ revoke_ambassador: true })}>{it ? "Revoca affiliazione" : "Revoke affiliation"}</button> : null}
    </form>
  </details>;
}
