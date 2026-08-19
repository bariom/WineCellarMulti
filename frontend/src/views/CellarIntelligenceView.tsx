import { useEffect, useMemo, useState } from "react";

import type { CellarIntelligencePlan, CellarIntelligenceSnapshot, CellarIntelligenceWine, Locale, WineStrategyPurpose } from "../types";
import { api } from "../services/api";
import "./CellarIntelligenceView.css";

const PURPOSES: WineStrategyPurpose[] = ["drink", "maturation", "investment", "special_occasion", "undecided"];

export default function CellarIntelligenceView({
  locale,
  disabled,
  onOpenWine,
  onCellarChanged,
}: {
  locale: Locale;
  disabled: boolean;
  onOpenWine: (wineId: string) => void;
  onCellarChanged: () => Promise<void>;
}) {
  const it = locale === "it";
  const [snapshot, setSnapshot] = useState<CellarIntelligenceSnapshot | null>(null);
  const [plan, setPlan] = useState<CellarIntelligencePlan | null>(null);
  const [focus, setFocus] = useState<"balanced" | "drink" | "maturation" | "investment">("balanced");
  const [editing, setEditing] = useState<CellarIntelligenceWine | null>(null);
  const [quantities, setQuantities] = useState<Record<WineStrategyPurpose, number>>({ drink: 0, maturation: 0, investment: 0, special_occasion: 0, undecided: 0 });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [applyingRecommendation, setApplyingRecommendation] = useState("");
  const [appliedRecommendations, setAppliedRecommendations] = useState<Set<string>>(() => new Set());
  const [editingRecommendation, setEditingRecommendation] = useState("");
  const [pendingDrinkRecommendation, setPendingDrinkRecommendation] = useState<{
    key: string;
    recommendation: CellarIntelligencePlan["recommendations"][number];
    wine: CellarIntelligenceWine;
  } | null>(null);
  const [actionNotice, setActionNotice] = useState("");
  const [error, setError] = useState("");

  async function loadSnapshot(showLoading = true) {
    if (showLoading) setLoading(true);
    setError("");
    try {
      setSnapshot(await api<CellarIntelligenceSnapshot>("/api/v1/intelligence/cellar"));
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : String(requestError));
    } finally {
      if (showLoading) setLoading(false);
    }
  }

  useEffect(() => { void loadSnapshot(); }, []);

  const wineNames = useMemo(() => new Map(snapshot?.wines.map((wine) => [wine.wine_id, wine]) || []), [snapshot]);
  const drinkCandidates = snapshot?.wines.filter((wine) => wine.purposes.drink && ["ready", "peak", "late"].includes(wine.readiness)) || [];
  const decisionCandidates = snapshot?.wines.filter((wine) => wine.unallocated_quantity > 0) || [];

  function beginEdit(wine: CellarIntelligenceWine, recommendationKey = "") {
    setEditing(wine);
    setEditingRecommendation(recommendationKey);
    setQuantities({
      drink: wine.purposes.drink || 0,
      maturation: wine.purposes.maturation || 0,
      investment: wine.purposes.investment || 0,
      special_occasion: wine.purposes.special_occasion || 0,
      undecided: wine.purposes.undecided || 0,
    });
  }

  async function saveAllocations() {
    if (!editing) return;
    const total = PURPOSES.reduce((sum, purpose) => sum + quantities[purpose], 0);
    if (total > editing.quantity) {
      setError(it ? "Le quantità superano le bottiglie disponibili." : "Quantities exceed available bottles.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      await api(`/api/v1/intelligence/wines/${editing.wine_id}/allocations`, {
        method: "PUT",
        body: JSON.stringify({
          allocations: PURPOSES.filter((purpose) => quantities[purpose] > 0).map((purpose) => ({ purpose, quantity: quantities[purpose] })),
        }),
      });
      if (editingRecommendation) {
        setAppliedRecommendations((current) => new Set(current).add(editingRecommendation));
        setActionNotice(it ? "Azione applicata alla strategia della cantina." : "Action applied to the cellar strategy.");
      }
      setEditing(null);
      setEditingRecommendation("");
      if (!editingRecommendation) setPlan(null);
      await loadSnapshot(false);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : String(requestError));
    } finally {
      setSaving(false);
    }
  }

  async function generatePlan() {
    setGenerating(true);
    setError("");
    setActionNotice("");
    setAppliedRecommendations(new Set());
    try {
      setPlan(await api<CellarIntelligencePlan>("/api/v1/ai/cellar-intelligence", {
        method: "POST",
        body: JSON.stringify({ locale, focus }),
      }));
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : String(requestError));
    } finally {
      setGenerating(false);
    }
  }

  async function refreshRecommendationValue(
    recommendation: CellarIntelligencePlan["recommendations"][number],
    key: string,
  ) {
    setApplyingRecommendation(key);
    setError("");
    setActionNotice("");
    try {
      await api(`/api/v1/ai/wines/${recommendation.wine_id}/value`, {
        method: "POST",
        body: JSON.stringify({ locale, force_refresh: true }),
      });
      await Promise.all([loadSnapshot(false), onCellarChanged()]);
      setAppliedRecommendations((current) => new Set(current).add(key));
      setActionNotice(it ? "Valore attuale aggiornato." : "Current value updated.");
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : String(requestError));
    } finally {
      setApplyingRecommendation("");
    }
  }

  async function confirmDrinkRecommendation() {
    if (!pendingDrinkRecommendation) return;
    const { key, recommendation } = pendingDrinkRecommendation;
    setApplyingRecommendation(key);
    setError("");
    setActionNotice("");
    try {
      await api(`/api/v1/wines/${recommendation.wine_id}/consume`, {
        method: "POST",
        body: JSON.stringify({
          quantity: recommendation.quantity,
          note: it ? "Azione applicata da Intelligence" : "Action applied from Intelligence",
        }),
      });
      await Promise.all([loadSnapshot(false), onCellarChanged()]);
      setAppliedRecommendations((current) => new Set(current).add(key));
      setPendingDrinkRecommendation(null);
      setActionNotice(it
        ? `${recommendation.quantity} ${recommendation.quantity === 1 ? "bottiglia registrata come bevuta" : "bottiglie registrate come bevute"}.`
        : `${recommendation.quantity} ${recommendation.quantity === 1 ? "bottle" : "bottles"} recorded as consumed.`);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : String(requestError));
    } finally {
      setApplyingRecommendation("");
    }
  }

  const purposeLabel = (purpose: WineStrategyPurpose) => ({
    drink: it ? "Bere" : "Drink",
    maturation: it ? "Maturazione" : "Maturation",
    investment: it ? "Investimento" : "Investment",
    special_occasion: it ? "Occasione speciale" : "Special occasion",
    undecided: it ? "Da decidere" : "Undecided",
  })[purpose];

  const formatUnitValue = (totalValue: string, currency: string, quantity: number) => {
    const amount = Number(totalValue);
    if (!Number.isFinite(amount) || amount <= 0 || quantity <= 0) {
      return it ? "Non disponibile" : "Not available";
    }
    const unitValue = amount / quantity;
    try {
      return new Intl.NumberFormat(it ? "it-CH" : "en-CH", {
        style: "currency",
        currency: currency || "CHF",
      }).format(unitValue);
    } catch {
      return `${currency || "CHF"} ${unitValue.toFixed(2)}`;
    }
  };

  if (loading) return <section className="cellar-intelligence"><p>{it ? "Analisi della cantina…" : "Analysing cellar…"}</p></section>;

  return (
    <section className="cellar-intelligence">
      <header className="intelligence-heading">
        <div>
          <span className="intelligence-kicker">PRIVATE CELLAR INTELLIGENCE</span>
          <h1>{it ? "Piano cantina" : "Cellar plan"}</h1>
          <p>{it ? "Decidi la funzione delle bottiglie e trasforma la cantina in azioni concrete." : "Assign a purpose to your bottles and turn your cellar into concrete actions."}</p>
        </div>
        <div className="intelligence-plan-action">
          <label>{it ? "Priorità dell’analisi" : "Analysis focus"}
            <select value={focus} onChange={(event) => setFocus(event.target.value as typeof focus)}>
              <option value="balanced">{it ? "Equilibrata" : "Balanced"}</option>
              <option value="drink">{it ? "Cosa bere" : "What to drink"}</option>
              <option value="maturation">{it ? "Maturazione" : "Maturation"}</option>
              <option value="investment">{it ? "Investimento" : "Investment"}</option>
            </select>
          </label>
          <button type="button" disabled={disabled || generating || !snapshot?.bottle_count} onClick={generatePlan}>
            {generating ? (it ? "Analisi in corso…" : "Analysing…") : (it ? "Analizza la cantina con AI" : "Analyse cellar with AI")}
          </button>
        </div>
      </header>

      {error ? <div className="intelligence-error">{error}</div> : null}
      <div className="intelligence-kpis">
        <article><small>{it ? "Bottiglie con obiettivo" : "Bottles with purpose"}</small><strong>{snapshot?.allocation_coverage_pct || 0}%</strong><span>{snapshot?.allocated_bottle_count || 0} / {snapshot?.bottle_count || 0}</span></article>
        <article><small>{it ? "Da bere ora" : "Drink now"}</small><strong>{snapshot?.drink_now_count || 0}</strong><span>{it ? "nella finestra di beva" : "in drinking window"}</span></article>
        <article><small>{it ? "In maturazione" : "Maturing"}</small><strong>{snapshot?.maturation_count || 0}</strong><span>{it ? "bottiglie" : "bottles"}</span></article>
        <article><small>{it ? "Investimento" : "Investment"}</small><strong>{snapshot?.investment_count || 0}</strong><span>{it ? "da monitorare" : "to monitor"}</span></article>
        <article className={snapshot?.undecided_count ? "attention" : ""}><small>{it ? "Senza decisione" : "Needs decision"}</small><strong>{snapshot?.undecided_count || 0}</strong><span>{it ? "bottiglie" : "bottles"}</span></article>
      </div>

      {plan ? <article className="intelligence-ai-plan">
        <div><span className="intelligence-kicker">VINARIS AI</span><h2>{it ? "Piano d’azione" : "Action plan"}</h2></div>
        <p className="plan-overview">{plan.overview}</p>
        <p><strong>{it ? "Prima azione:" : "First action:"}</strong> {plan.immediate_action}</p>
        {plan.risk_note ? <p className="plan-risk">{plan.risk_note}</p> : null}
        {actionNotice ? <p className="intelligence-action-notice" role="status">{actionNotice}</p> : null}
        <div className="plan-recommendations">{plan.recommendations.map((item, index) => {
          const wine = wineNames.get(item.wine_id);
          const recommendationKey = `${item.wine_id}-${item.action}-${index}`;
          const applied = appliedRecommendations.has(recommendationKey);
          const busy = applyingRecommendation === recommendationKey;
          const actionLabel = ({
            drink: it ? "Bere ora" : "Drink now",
            hold: it ? "Mantenere" : "Hold",
            monitor: it ? "Monitorare" : "Monitor",
            decide: it ? "Decidere" : "Decide",
          })[item.action];
          return <article className={`plan-recommendation${applied ? " is-applied" : ""}`} key={recommendationKey}>
            <button type="button" className="plan-recommendation-main" onClick={() => onOpenWine(item.wine_id)}>
              <span className={`priority priority-${item.priority}`}>{item.priority}</span>
              <strong>{item.quantity}× {wine?.name || item.wine_id}</strong>
              <span>{item.reason}</span>
            </button>
            <footer>
              <span className={`plan-action plan-action-${item.action}`}>{actionLabel}</span>
              {applied ? <strong className="plan-action-applied">{it ? "Applicata" : "Applied"}</strong> : item.action === "drink" ? (
                <button type="button" disabled={disabled || !wine || Boolean(applyingRecommendation)} onClick={() => wine && setPendingDrinkRecommendation({ key: recommendationKey, recommendation: item, wine })}>
                  {busy ? (it ? "Applicazione…" : "Applying…") : (it ? "Registra bevuta" : "Record consumed")}
                </button>
              ) : item.action === "monitor" ? (
                <button type="button" disabled={disabled || Boolean(applyingRecommendation)} onClick={() => void refreshRecommendationValue(item, recommendationKey)}>
                  {busy ? (it ? "Aggiornamento…" : "Updating…") : (it ? "Aggiorna valore con AI" : "Update value with AI")}
                </button>
              ) : (
                <button type="button" disabled={!wine || Boolean(applyingRecommendation)} onClick={() => wine && beginEdit(wine, recommendationKey)}>
                  {item.action === "decide" ? (it ? "Definisci obiettivo" : "Set purpose") : (it ? "Rivedi maturazione" : "Review maturation")}
                </button>
              )}
            </footer>
          </article>;
        })}</div>
        <small>{plan.model} · ${Number(plan.estimated_cost_usd).toFixed(6)}</small>
      </article> : null}

      <div className="intelligence-columns">
        <article className="intelligence-list">
          <header><div><span className="intelligence-kicker">{it ? "PRIORITÀ" : "PRIORITY"}</span><h2>{it ? "Da bere ora" : "Drink now"}</h2></div><strong>{drinkCandidates.length}</strong></header>
          {drinkCandidates.length ? drinkCandidates.slice(0, 8).map((wine) => <div className="intelligence-wine-row" key={wine.wine_id}>
            <button type="button" className="wine-main" onClick={() => onOpenWine(wine.wine_id)}><strong>{wine.name} {wine.vintage}</strong><span>{wine.producer} · {wine.readiness === "peak" ? (it ? "al picco" : "at peak") : wine.readiness}</span></button>
            <button type="button" className="secondary" onClick={() => beginEdit(wine)}>{it ? "Obiettivi" : "Purposes"}</button>
          </div>) : <p className="intelligence-empty">{it ? "Assegna bottiglie all’obiettivo Bere per ricevere priorità attendibili." : "Assign bottles to Drink to receive reliable priorities."}</p>}
        </article>
        <article className="intelligence-list">
          <header><div><span className="intelligence-kicker">{it ? "DECISIONI" : "DECISIONS"}</span><h2>{it ? "Bottiglie da classificare" : "Bottles to classify"}</h2></div><strong>{decisionCandidates.length}</strong></header>
          {decisionCandidates.length ? decisionCandidates.slice(0, 8).map((wine) => <div className="intelligence-wine-row" key={wine.wine_id}>
            <button type="button" className="wine-main" onClick={() => onOpenWine(wine.wine_id)}>
              <strong>{wine.name} {wine.vintage}</strong>
              <span className="intelligence-wine-producer">{wine.producer || (it ? "Produttore non specificato" : "Producer not specified")}</span>
              <small>{wine.unallocated_quantity} {it ? "senza obiettivo su" : "without purpose of"} {wine.quantity}</small>
              <span className="intelligence-wine-values">
                <span>
                  <small>{it ? "Prezzo d'acquisto" : "Purchase price"}</small>
                  <strong>{formatUnitValue(wine.purchase_value, wine.currency, wine.quantity)}</strong>
                </span>
                <span>
                  <small>{it ? "Valore attuale" : "Current value"}</small>
                  <strong>{wine.signals.includes("market_value_missing") ? (it ? "Non disponibile" : "Not available") : formatUnitValue(wine.current_value, wine.currency, wine.quantity)}</strong>
                </span>
              </span>
            </button>
            <button type="button" onClick={() => beginEdit(wine)}>{it ? "Definisci" : "Define"}</button>
          </div>) : <p className="intelligence-empty">{it ? "Tutte le bottiglie hanno un obiettivo." : "Every bottle has a purpose."}</p>}
        </article>
      </div>

      {pendingDrinkRecommendation ? <div className="intelligence-modal-backdrop" role="presentation" onMouseDown={() => setPendingDrinkRecommendation(null)}>
        <section className="intelligence-modal intelligence-action-confirm" role="dialog" aria-modal="true" aria-labelledby="intelligence-consume-title" onMouseDown={(event) => event.stopPropagation()}>
          <header><div><span className="intelligence-kicker">{it ? "CONFERMA AZIONE" : "CONFIRM ACTION"}</span><h2 id="intelligence-consume-title">{it ? "Registrare il consumo?" : "Record consumption?"}</h2></div><button type="button" className="secondary" onClick={() => setPendingDrinkRecommendation(null)}>×</button></header>
          <p>{it
            ? `Verranno registrate come bevute ${pendingDrinkRecommendation.recommendation.quantity} bottiglie di ${pendingDrinkRecommendation.wine.name}. La giacenza e gli obiettivi saranno aggiornati.`
            : `${pendingDrinkRecommendation.recommendation.quantity} bottles of ${pendingDrinkRecommendation.wine.name} will be recorded as consumed. Stock and purposes will be updated.`}</p>
          <footer><button type="button" className="secondary" onClick={() => setPendingDrinkRecommendation(null)}>{it ? "Annulla" : "Cancel"}</button><button type="button" disabled={Boolean(applyingRecommendation)} onClick={() => void confirmDrinkRecommendation()}>{applyingRecommendation ? (it ? "Registrazione…" : "Recording…") : (it ? "Conferma consumo" : "Confirm consumption")}</button></footer>
        </section>
      </div> : null}

      {editing ? <div className="intelligence-modal-backdrop" role="presentation" onMouseDown={() => { setEditing(null); setEditingRecommendation(""); }}>
        <section className="intelligence-modal" role="dialog" aria-modal="true" onMouseDown={(event) => event.stopPropagation()}>
          <header><div><span className="intelligence-kicker">{it ? "OBIETTIVI BOTTIGLIE" : "BOTTLE PURPOSES"}</span><h2>{editing.name} {editing.vintage}</h2></div><button type="button" className="secondary" onClick={() => { setEditing(null); setEditingRecommendation(""); }}>×</button></header>
          <p>{it ? `Distribuisci fino a ${editing.quantity} bottiglie. Puoi lasciare una parte non assegnata.` : `Allocate up to ${editing.quantity} bottles. You may leave some unassigned.`}</p>
          <div className="purpose-grid">{PURPOSES.map((purpose) => <label key={purpose}><span>{purposeLabel(purpose)}</span><input type="number" min="0" max={editing.quantity} value={quantities[purpose]} onChange={(event) => setQuantities((current) => ({ ...current, [purpose]: Math.max(Number(event.target.value) || 0, 0) }))} /></label>)}</div>
          <div className="allocation-total"><span>{it ? "Assegnate" : "Allocated"}</span><strong>{PURPOSES.reduce((sum, purpose) => sum + quantities[purpose], 0)} / {editing.quantity}</strong></div>
          <footer><button type="button" className="secondary" onClick={() => { setEditing(null); setEditingRecommendation(""); }}>{it ? "Annulla" : "Cancel"}</button><button type="button" disabled={saving} onClick={saveAllocations}>{saving ? (it ? "Salvataggio…" : "Saving…") : (it ? "Salva obiettivi" : "Save purposes")}</button></footer>
        </section>
      </div> : null}
    </section>
  );
}
