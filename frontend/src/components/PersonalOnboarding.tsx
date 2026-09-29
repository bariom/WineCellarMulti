import { useEffect, useRef, useState, type FormEvent } from "react";
import type { Locale, PrimaryDashboardFocus, Session } from "../types";
import { api } from "../services/api";
import { valuationMarkets } from "../domain/valuationMarket";
import "./PersonalOnboarding.css";

export default function PersonalOnboarding({ session, onComplete, onLater }: {
  session: Session; onComplete: (session: Session) => void; onLater: () => void;
}) {
  const [locale, setLocale] = useState<Locale>(session.locale || "it");
  const [market, setMarket] = useState(session.market_country || (session.onboarding_completed ? "" : "choose"));
  const [focus, setFocus] = useState<PrimaryDashboardFocus>(session.dashboard_focus || "collector");
  const [budget, setBudget] = useState(session.daily_wine_budget_chf || "");
  const [step, setStep] = useState(1);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const heading = useRef<HTMLHeadingElement>(null);
  const it = locale === "it";
  const restaurant = session.active_household_mode === "restaurant";
  useEffect(() => { heading.current?.focus(); }, [step]);
  const choices: Array<[PrimaryDashboardFocus, string, string]> = it ? [
    ["collector", "Focus collezionista", "Valore, maturità e bottiglie chiave della collezione."],
    ["daily", "Bere bene oggi", "Vini pronti e priorità per scegliere cosa aprire."],
    ["balanced", "Cantina equilibrata", "Stili, disponibilità e composizione della cantina."],
  ] : [
    ["collector", "Collector focus", "Collection value, maturity and key bottles."],
    ["daily", "Drink well today", "Ready wines and priorities for choosing what to open."],
    ["balanced", "Balanced cellar", "Styles, availability and cellar composition."],
  ];
  if (session.dashboard_focus === "personal") choices.push(["personal", it ? "La mia dashboard" : "My dashboard", it ? "Mantieni la tua dashboard personalizzata." : "Keep your personal dashboard."]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (pending) return;
    setError("");
    if (market === "choose") {
      setError(it ? "Scegli il tuo mercato oppure la ricerca internazionale." : "Choose your market or international search.");
      return;
    }
    if (step === 1) { setStep(2); return; }
    const amount = Number(budget.trim().replace(",", "."));
    if (!restaurant && budget.trim() && (!Number.isFinite(amount) || amount <= 0 || amount > 100000)) {
      setError(it ? "Inserisci un budget maggiore di zero, oppure lascia il campo vuoto." : "Enter a budget greater than zero or leave this field blank.");
      return;
    }
    setPending(true);
    try {
      const next = await api<Session>("/api/v1/auth/preferences", {
        method: "PATCH", body: JSON.stringify({
          locale, market_country: market, onboarding_completed: true,
          ...(!restaurant ? { dashboard_focus: focus, daily_wine_budget_chf: budget.trim() ? amount : null } : {}),
        }),
      });
      onComplete(next);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : (it ? "Salvataggio non riuscito. Riprova." : "Could not save. Please retry."));
    } finally { setPending(false); }
  }

  return <section className="personal-onboarding" aria-label={it ? "Configurazione iniziale" : "Initial setup"}>
    <header><p>Vinaris · {it ? "Il tuo spazio" : "Your space"}</p>
      <h2 ref={heading} tabIndex={-1}>{step === 1 ? (it ? "Partiamo da te." : "Let's start with you.") : (it ? "La cantina, a modo tuo." : "Your cellar, your way.")}</h2>
      <p>{it ? "Due passi per rendere Vinaris più utile. Potrai cambiare queste scelte nelle impostazioni." : "Two steps to make Vinaris more useful. You can change these choices in Settings."}</p>
      <ol aria-label={it ? "Avanzamento configurazione" : "Setup progress"}>
        <li aria-current={step === 1 ? "step" : undefined}>1 · {it ? "Lingua e mercato" : "Language and market"}</li>
        <li aria-current={step === 2 ? "step" : undefined}>2 · {it ? "La tua dashboard" : "Your dashboard"}</li>
      </ol>
    </header>
    <form onSubmit={event => void submit(event)}>
      {error ? <p role="alert">{error}</p> : null}
      <fieldset disabled={pending}>
        <legend>{step === 1 ? (it ? "Le tue preferenze" : "Your preferences") : (it ? "Come vuoi usare Vinaris?" : "How will you use Vinaris?")}</legend>
        {step === 1 ? <>
          <label><span>{it ? "Lingua" : "Language"}</span><select aria-label={it ? "Lingua" : "Language"} value={locale} onChange={event => setLocale(event.target.value as Locale)}><option value="it">Italiano</option><option value="en">English</option></select></label>
          <label><span>{it ? "Mercato di riferimento" : "Reference market"}</span><select aria-label={it ? "Mercato di riferimento" : "Reference market"} aria-describedby="onboarding-market-help" value={market} onChange={event => setMarket(event.target.value)}>
            <option value="choose" disabled>{it ? "Scegli il paese" : "Choose a country"}</option>
            {valuationMarkets.map(([code, italian, english]) => <option key={code} value={code}>{it ? italian : english}</option>)}
            <option value="">{it ? "Ricerca internazionale" : "International search"}</option>
          </select></label>
          <p id="onboarding-market-help" className="onboarding-help">{it ? "Le ricerche di valore AI privilegeranno i rivenditori di questo paese. La valuta del vino resta una scelta separata." : "AI value searches will prioritize retailers in this country. Wine currency remains a separate choice."}</p>
        </> : restaurant ? <p>{it ? "Lingua e mercato sono pronti. La dashboard ristorante seguirà la modalità della tua cantina." : "Language and market are ready. The restaurant dashboard follows your cellar mode."}</p> : <>
          <div className="onboarding-choices">{choices.map(([id, label, description]) => <label key={id} className={focus === id ? "selected" : ""}>
            <input type="radio" name="onboarding-dashboard" value={id} checked={focus === id} onChange={() => setFocus(id)} />
            <span><strong>{label}</strong><small>{description}</small></span>
          </label>)}</div>
          <label><span>{it ? "Budget vino quotidiano (CHF), facoltativo" : "Daily wine budget (CHF), optional"}</span><input type="text" inputMode="decimal" value={budget} onChange={event => setBudget(event.target.value)} aria-describedby="onboarding-budget-help" /></label>
          <p id="onboarding-budget-help" className="onboarding-help">{it ? "Prezzo massimo per bottiglia nelle proposte quotidiane. Lascia vuoto per non applicare un limite." : "Maximum bottle price in daily suggestions. Leave blank for no limit."}</p>
        </>}
      </fieldset>
      <footer>
        <button type="button" className="secondary" disabled={pending} onClick={onLater}>{it ? "Più tardi" : "Later"}</button>
        <div>{step === 2 ? <button type="button" className="secondary" disabled={pending} onClick={() => { setError(""); setStep(1); }}>{it ? "Indietro" : "Back"}</button> : null}
          <button type="submit" disabled={pending}>{pending ? (it ? "Salvataggio…" : "Saving…") : step === 1 ? (it ? "Continua" : "Continue") : (it ? "Salva e apri la cantina" : "Save and open cellar")}</button></div>
      </footer>
    </form>
  </section>;
}
