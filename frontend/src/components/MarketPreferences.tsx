import { useId, useState } from "react";
import type { Locale, Session } from "../types";
import { api } from "../services/api";
import { valuationMarkets } from "../domain/valuationMarket";
import { translate } from "../i18n";

export function DailyBudgetSettings({ locale, value, onChange, saving, onSave }: {
  locale: Locale; value: string; onChange: (value: string) => void; saving: boolean; onSave: () => Promise<void>;
}) {
  return <div className="daily-budget-setting"><label>
    <span>{translate(locale, "dailyWineBudget")}</span>
    <div className="daily-budget-input"><span>CHF</span><input type="number" min="1" max="100000" step="1" inputMode="decimal" value={value} placeholder="40" onChange={event => onChange(event.target.value)} /></div>
    <small>{translate(locale, "dailyWineBudgetHelp")}</small>
  </label><button type="button" className="secondary" disabled={saving} onClick={() => void onSave()}>{translate(locale, saving ? "working" : "saveSettings")}</button></div>;
}

export default function MarketPreferences({ session, locale, disabled, onSave, onNotice, onError, onSetup, budget }: {
  session: Session; locale: Locale; disabled: boolean;
  onSave: (session: Session) => void; onNotice: (notice: string) => void; onError: (error: string) => void;
  onSetup?: () => void;
  budget?: { value: string; onChange: (value: string) => void; saving: boolean; onSave: () => Promise<void> };
}) {
  const [pending, setPending] = useState(false);
  const helpId = useId();
  const it = locale === "it";
  async function save(country: string) {
    if (disabled || pending || session.is_demo) return;
    setPending(true);
    onError("");
    try {
      const next = await api<Session>("/api/v1/auth/preferences", {
        method: "PATCH", body: JSON.stringify({ market_country: country }),
      });
      onSave(next);
      onNotice(it ? "Mercato di riferimento salvato." : "Reference market saved.");
    } catch (error) {
      onError(error instanceof Error ? error.message : (it ? "Salvataggio del mercato non riuscito." : "Could not save reference market."));
    } finally {
      setPending(false);
    }
  }
  return <><label>
    <span>{it ? "Mercato di riferimento" : "Reference market"}</span>
    <select aria-label={it ? "Mercato di riferimento" : "Reference market"} aria-describedby={helpId} value={session.market_country || ""} disabled={disabled || pending || session.is_demo} onChange={event => void save(event.target.value)}>
      <option value="">{it ? "Non specificato · ricerca internazionale" : "Not specified · international search"}</option>
      {valuationMarkets.map(([code, italian, english]) => <option key={code} value={code}>{it ? italian : english}</option>)}
    </select>
    <small id={helpId}>{it ? "Paese per le nuove ricerche di valore AI, anche in wishlist. La valuta del vino resta separata. Le stime già salvate mantengono il mercato originale." : "Country for new AI value searches, including wishlist. Wine currency is separate. Saved estimates keep their original market."}</small>
  </label>{onSetup && !session.is_demo ? <button type="button" className="secondary" disabled={disabled || pending} onClick={onSetup}>{session.onboarding_completed ? (it ? "Rivedi configurazione" : "Review setup") : (it ? "Completa configurazione" : "Complete setup")}</button> : null}{budget ? <DailyBudgetSettings locale={locale} {...budget} /> : null}</>;
}
