import { useEffect, useMemo, useState } from "react";

import type { CellarIntelligencePlan, CellarIntelligenceSnapshot, CellarIntelligenceWine, Locale, WineStrategyPurpose } from "../types";
import { api } from "../services/api";
import "./CellarIntelligenceView.css";

const PURPOSES: WineStrategyPurpose[] = ["drink", "maturation", "investment", "special_occasion", "undecided"];
const PRIORITY_ORDER = { high: 0, medium: 1, low: 2 } as const;

function BottleThumbnail({ wine, prominent = false }: { wine: CellarIntelligenceWine; prominent?: boolean }) {
  return <span className={`intelligence-bottle-thumbnail${prominent ? " prominent" : ""}`} aria-hidden="true">
    {wine.photo_thumbnail_url ? <img src={wine.photo_thumbnail_url} alt="" loading="lazy" /> : <span className="intelligence-bottle-placeholder" />}
  </span>;
}

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
  const [selectedWineIds, setSelectedWineIds] = useState<Set<string>>(() => new Set());
  const [selectionQuery, setSelectionQuery] = useState("");
  const [selectionPurpose, setSelectionPurpose] = useState<WineStrategyPurpose | "all">("all");
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

  async function loadInitialData() {
    setLoading(true);
    setError("");
    try {
      const [nextSnapshot, savedPlan] = await Promise.all([
        api<CellarIntelligenceSnapshot>("/api/v1/intelligence/cellar"),
        api<CellarIntelligencePlan | null>("/api/v1/ai/cellar-intelligence/latest"),
      ]);
      setSnapshot(nextSnapshot);
      setPlan(savedPlan);
      setAppliedRecommendations(new Set(savedPlan?.applied_recommendation_keys || []));
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : String(requestError));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void loadInitialData(); }, []);

  const wineNames = useMemo(() => new Map(snapshot?.wines.map((wine) => [wine.wine_id, wine]) || []), [snapshot]);
  const drinkCandidates = snapshot?.wines.filter((wine) => wine.purposes.drink && ["ready", "peak", "late"].includes(wine.readiness)) || [];
  const decisionCandidates = snapshot?.wines.filter((wine) => wine.unallocated_quantity > 0) || [];
  const classifiedWines = useMemo(() => snapshot?.wines.filter((wine) => wine.allocated_quantity > 0) || [], [snapshot]);
  const visibleClassifiedWines = useMemo(() => {
    const query = selectionQuery.trim().toLocaleLowerCase(locale);
    return classifiedWines.filter((wine) => {
      const matchesPurpose = selectionPurpose === "all" || Boolean(wine.purposes[selectionPurpose]);
      const matchesQuery = !query || `${wine.name} ${wine.producer} ${wine.vintage} ${wine.region}`.toLocaleLowerCase(locale).includes(query);
      return matchesPurpose && matchesQuery;
    });
  }, [classifiedWines, locale, selectionPurpose, selectionQuery]);

  function beginEdit(
    wine: CellarIntelligenceWine,
    recommendationKey = "",
    recommendedPurpose: WineStrategyPurpose | null = null,
    recommendedQuantity = 0,
    allocateUnassigned = false,
  ) {
    setEditing(wine);
    setEditingRecommendation(recommendationKey);
    const nextQuantities: Record<WineStrategyPurpose, number> = {
      drink: wine.purposes.drink || 0,
      maturation: wine.purposes.maturation || 0,
      investment: wine.purposes.investment || 0,
      special_occasion: wine.purposes.special_occasion || 0,
      undecided: wine.purposes.undecided || 0,
    };
    if (recommendedPurpose && recommendedQuantity > 0) {
      if (allocateUnassigned) {
        nextQuantities[recommendedPurpose] += Math.min(recommendedQuantity, wine.unallocated_quantity);
        setQuantities(nextQuantities);
        return;
      }
      const sourcePurposes = PURPOSES
        .filter((purpose) => purpose !== recommendedPurpose)
        .sort((left, right) => nextQuantities[right] - nextQuantities[left]);
      let remaining = Math.min(recommendedQuantity, sourcePurposes.reduce((sum, purpose) => sum + nextQuantities[purpose], 0));
      for (const purpose of sourcePurposes) {
        const moved = Math.min(nextQuantities[purpose], remaining);
        nextQuantities[purpose] -= moved;
        nextQuantities[recommendedPurpose] += moved;
        remaining -= moved;
      }
    }
    setQuantities(nextQuantities);
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
        await saveAppliedRecommendation(editingRecommendation);
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

  async function generatePlan(wineIds: string[] = []) {
    setGenerating(true);
    setError("");
    setActionNotice("");
    setAppliedRecommendations(new Set());
    try {
      setPlan(await api<CellarIntelligencePlan>("/api/v1/ai/cellar-intelligence", {
        method: "POST",
        body: JSON.stringify({ locale, focus, wine_ids: wineIds }),
      }));
    } catch (requestError) {
      const message = requestError instanceof Error ? requestError.message : String(requestError);
      setError(message.includes("output limit")
        ? (it ? "Il piano AI richiede una risposta più lunga. Riprova tra poco." : "The AI plan needs a longer response. Please try again shortly.")
        : message);
    } finally {
      setGenerating(false);
    }
  }

  async function saveAppliedRecommendation(recommendationKey: string) {
    const appliedKeys = Array.from(new Set([...appliedRecommendations, recommendationKey]));
    setAppliedRecommendations(new Set(appliedKeys));
    try {
      setPlan(await api<CellarIntelligencePlan>("/api/v1/ai/cellar-intelligence/latest", {
        method: "PUT",
        body: JSON.stringify({ applied_recommendation_keys: appliedKeys }),
      }));
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : String(requestError));
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
      await saveAppliedRecommendation(key);
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
      await saveAppliedRecommendation(key);
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

  function toggleWineSelection(wineId: string) {
    setSelectedWineIds((current) => {
      const next = new Set(current);
      if (next.has(wineId)) next.delete(wineId);
      else next.add(wineId);
      return next;
    });
  }

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
          <button type="button" disabled={disabled || generating || !snapshot?.bottle_count} onClick={() => void generatePlan()}>
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
        <header className="plan-heading">
          <div><span className="intelligence-kicker">VINARIS AI</span><h2>{it ? "Piano d’azione" : "Action plan"}</h2></div>
          <span className="plan-action-count">{plan.recommendations.length} {it ? "azioni proposte" : "suggested actions"}</span>
        </header>
        <section className="plan-first-action">
          <span className="plan-step-number">1</span>
          <div><small>{it ? "DA FARE ADESSO" : "DO THIS NOW"}</small><strong>{plan.immediate_action}</strong></div>
        </section>
        <div className="plan-summary-grid">
          <section><small>{it ? "STRATEGIA" : "STRATEGY"}</small><p>{plan.overview}</p></section>
          <div className="plan-metrics">
            <span><strong>{plan.recommendations.filter((item) => item.priority === "high").length}</strong><small>{it ? "alta priorità" : "high priority"}</small></span>
            <span><strong>{plan.recommendations.reduce((total, item) => total + item.quantity, 0)}</strong><small>{it ? "bottiglie coinvolte" : "bottles involved"}</small></span>
          </div>
        </div>
        {plan.risk_note ? <aside className="plan-risk"><strong>{it ? "Da tenere presente" : "Keep in mind"}</strong><span>{plan.risk_note}</span></aside> : null}
        {actionNotice ? <p className="intelligence-action-notice" role="status">{actionNotice}</p> : null}
        <div className="plan-recommendations-heading"><div><small>{it ? "AZIONI SUI VINI" : "WINE ACTIONS"}</small><h3>{it ? "Procedi in questo ordine" : "Follow this order"}</h3></div><span>{it ? "Apri il vino o applica direttamente la proposta" : "Open the wine or apply the suggestion directly"}</span></div>
        <div className="plan-recommendations">{[...plan.recommendations].sort((left, right) => PRIORITY_ORDER[left.priority] - PRIORITY_ORDER[right.priority]).map((item, index) => {
          const wine = wineNames.get(item.wine_id);
          const recommendationKey = `${item.wine_id}-${item.action}-${index}`;
          const applied = appliedRecommendations.has(recommendationKey);
          const busy = applyingRecommendation === recommendationKey;
          const actionLabel = ({
            drink: it ? "Bere ora" : "Drink now",
            hold: it ? "Mantenere" : "Hold",
            monitor: it ? "Monitorare" : "Monitor",
            decide: it ? "Decidere" : "Decide",
            reclassify: it ? "Riclassificare" : "Reclassify",
          })[item.action];
          const proposedPurposeLabel = item.recommended_purpose ? purposeLabel(item.recommended_purpose) : "";
          const displayedActionLabel = (item.action === "decide" || item.action === "reclassify") && proposedPurposeLabel
            ? (it ? `${proposedPurposeLabel} consigliata` : `Suggested: ${proposedPurposeLabel}`)
            : actionLabel;
          return <article className={`plan-recommendation${applied ? " is-applied" : ""}`} key={recommendationKey}>
            <button type="button" className="plan-recommendation-main" onClick={() => onOpenWine(item.wine_id)}>
              <span className="plan-recommendation-top"><strong>{index + 1}</strong><span className={`priority priority-${item.priority}`}>{item.priority === "high" ? (it ? "Alta" : "High") : item.priority === "medium" ? (it ? "Media" : "Medium") : (it ? "Bassa" : "Low")}</span></span>
              <span className="plan-recommendation-wine">{wine ? <BottleThumbnail wine={wine} prominent /> : null}<span><strong>{wine?.name || item.wine_id}</strong><small>{item.quantity} {item.quantity === 1 ? (it ? "bottiglia" : "bottle") : (it ? "bottiglie" : "bottles")} · {displayedActionLabel}</small></span></span>
              <span>{item.reason}</span>
            </button>
            <footer>
              <span className={`plan-action plan-action-${item.action}`}>{displayedActionLabel}</span>
              {applied ? <strong className="plan-action-applied">{it ? "Applicata" : "Applied"}</strong> : item.action === "drink" ? (
                <button type="button" disabled={disabled || !wine || Boolean(applyingRecommendation)} onClick={() => wine && setPendingDrinkRecommendation({ key: recommendationKey, recommendation: item, wine })}>
                  {busy ? (it ? "Applicazione…" : "Applying…") : (it ? "Registra bevuta" : "Record consumed")}
                </button>
              ) : item.action === "monitor" ? (
                <button type="button" disabled={disabled || Boolean(applyingRecommendation)} onClick={() => void refreshRecommendationValue(item, recommendationKey)}>
                  {busy ? (it ? "Aggiornamento…" : "Updating…") : (it ? "Aggiorna valore con AI" : "Update value with AI")}
                </button>
              ) : (
                <button type="button" disabled={!wine || Boolean(applyingRecommendation)} onClick={() => wine && beginEdit(wine, recommendationKey, item.recommended_purpose, item.quantity, item.action === "decide")}>
                  {item.action === "decide" || item.action === "reclassify" ? (proposedPurposeLabel ? `${it ? "Imposta" : "Set"} ${proposedPurposeLabel}` : (it ? "Definisci obiettivo" : "Set purpose")) : (it ? "Rivedi maturazione" : "Review maturation")}
                </button>
              )}
            </footer>
          </article>;
        })}</div>
        <small>{plan.model} · ${Number(plan.estimated_cost_usd).toFixed(6)}</small>
      </article> : null}

      <details className="intelligence-selection">
        <summary>
          <div><span className="intelligence-kicker">{it ? "RICLASSIFICAZIONE" : "RECLASSIFICATION"}</span><h2>{it ? "Rivaluta vini classificati" : "Reassess classified wines"}</h2><p>{it ? "Seleziona un gruppo: l’AI confronterà maturazione, valore e obiettivo attuale." : "Select a group: AI will compare maturity, value, and current purpose."}</p></div>
          <span className="intelligence-selection-summary"><strong>{selectedWineIds.size} {it ? "selezionati" : "selected"}</strong><span aria-hidden="true">⌄</span></span>
        </summary>
        <div className="intelligence-selection-body">
          <div className="intelligence-selection-controls">
            <input type="search" value={selectionQuery} onChange={(event) => setSelectionQuery(event.target.value)} placeholder={it ? "Cerca vino, produttore o regione" : "Search wine, producer, or region"} />
            <select value={selectionPurpose} onChange={(event) => setSelectionPurpose(event.target.value as WineStrategyPurpose | "all")} aria-label={it ? "Filtra per obiettivo" : "Filter by purpose"}>
              <option value="all">{it ? "Tutti gli obiettivi" : "All purposes"}</option>
              {PURPOSES.map((purpose) => <option key={purpose} value={purpose}>{purposeLabel(purpose)}</option>)}
            </select>
            <button type="button" className="secondary" disabled={!visibleClassifiedWines.length} onClick={() => setSelectedWineIds((current) => new Set([...current, ...visibleClassifiedWines.map((wine) => wine.wine_id)]))}>{it ? "Seleziona visibili" : "Select visible"}</button>
            <button type="button" className="secondary" disabled={!selectedWineIds.size} onClick={() => setSelectedWineIds(new Set())}>{it ? "Azzera" : "Clear"}</button>
          </div>
          <div className="intelligence-selection-list">
            {visibleClassifiedWines.map((wine) => <label className={selectedWineIds.has(wine.wine_id) ? "is-selected" : ""} key={wine.wine_id}>
              <input type="checkbox" checked={selectedWineIds.has(wine.wine_id)} onChange={() => toggleWineSelection(wine.wine_id)} />
              <BottleThumbnail wine={wine} />
              <span><strong>{wine.name} {wine.vintage}</strong><small>{wine.producer || wine.region || (it ? "Dati essenziali" : "Essential data")}</small></span>
              <span className="intelligence-purpose-tags">{PURPOSES.filter((purpose) => wine.purposes[purpose]).map((purpose) => <small key={purpose}>{purposeLabel(purpose)} · {wine.purposes[purpose]}</small>)}</span>
              <span className="intelligence-selection-value"><small>{it ? "Valore attuale" : "Current value"}</small><strong>{wine.signals.includes("market_value_missing") ? (it ? "Non disponibile" : "Not available") : formatUnitValue(wine.current_value, wine.currency, wine.quantity)}</strong></span>
            </label>)}
            {!visibleClassifiedWines.length ? <p className="intelligence-empty">{it ? "Nessun vino classificato corrisponde ai filtri." : "No classified wines match these filters."}</p> : null}
          </div>
          <footer><small>{it ? "Le proposte non modificano la cantina finché non le confermi." : "Suggestions do not change the cellar until you confirm them."}</small><button type="button" disabled={disabled || generating || !selectedWineIds.size} onClick={() => void generatePlan([...selectedWineIds])}>{generating ? (it ? "Analisi in corso…" : "Analysing…") : `${it ? "Analizza selezione" : "Analyse selection"} (${selectedWineIds.size})`}</button></footer>
        </div>
      </details>

      <div className="intelligence-columns">
        <article className="intelligence-list">
          <header><div><span className="intelligence-kicker">{it ? "PRIORITÀ" : "PRIORITY"}</span><h2>{it ? "Da bere ora" : "Drink now"}</h2></div><strong>{drinkCandidates.length}</strong></header>
          {drinkCandidates.length ? drinkCandidates.slice(0, 8).map((wine) => <div className="intelligence-wine-row" key={wine.wine_id}>
            <BottleThumbnail wine={wine} />
            <button type="button" className="wine-main" onClick={() => onOpenWine(wine.wine_id)}><strong>{wine.name} {wine.vintage}</strong><span>{wine.producer} · {wine.readiness === "peak" ? (it ? "al picco" : "at peak") : wine.readiness}</span></button>
            <button type="button" className="secondary" onClick={() => beginEdit(wine)}>{it ? "Obiettivi" : "Purposes"}</button>
          </div>) : <p className="intelligence-empty">{it ? "Assegna bottiglie all’obiettivo Bere per ricevere priorità attendibili." : "Assign bottles to Drink to receive reliable priorities."}</p>}
        </article>
        <article className="intelligence-list">
          <header><div><span className="intelligence-kicker">{it ? "DECISIONI" : "DECISIONS"}</span><h2>{it ? "Bottiglie da classificare" : "Bottles to classify"}</h2></div><strong>{decisionCandidates.length}</strong></header>
          {decisionCandidates.length ? decisionCandidates.slice(0, 8).map((wine) => <div className="intelligence-wine-row" key={wine.wine_id}>
            <BottleThumbnail wine={wine} />
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
