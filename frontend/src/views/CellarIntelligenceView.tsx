import { useEffect, useMemo, useState } from "react";

import { AiGenerationOverlay } from "../components/AppUi";
import { translate } from "../i18n";
import type { CellarIntelligencePlan, CellarIntelligencePreferences, CellarIntelligenceSnapshot, CellarIntelligenceWine, Locale, WineStrategyPurpose } from "../types";
import { api } from "../services/api";
import "./CellarIntelligenceView.css";

const PURPOSES: WineStrategyPurpose[] = ["drink", "maturation", "investment", "special_occasion", "undecided"];
const PRIORITY_ORDER = { high: 0, medium: 1, low: 2 } as const;
const WINE_ID_PATTERN = /\b[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}\b/gi;
const DEFAULT_PREFERENCES: CellarIntelligencePreferences = { annual_drink_target: 24, protected_capital_pct: 50, special_occasion_target: 6, next_special_occasion_date: null, planning_horizon_years: 5, refresh_interval_days: 30 };

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
  const [planHistory, setPlanHistory] = useState<CellarIntelligencePlan[]>([]);
  const [focus, setFocus] = useState<"balanced" | "drink" | "maturation" | "investment">("balanced");
  const [selectedWineIds, setSelectedWineIds] = useState<Set<string>>(() => new Set());
  const [selectionQuery, setSelectionQuery] = useState("");
  const [selectionPurpose, setSelectionPurpose] = useState<WineStrategyPurpose | "all">("all");
  const [selectionProducer, setSelectionProducer] = useState("all");
  const [selectionRegion, setSelectionRegion] = useState("all");
  const [selectionType, setSelectionType] = useState("all");
  const [groupPurpose, setGroupPurpose] = useState<WineStrategyPurpose>("maturation");
  const [groupSourcePurpose, setGroupSourcePurpose] = useState<WineStrategyPurpose>("maturation");
  const [preferences, setPreferences] = useState<CellarIntelligencePreferences>(DEFAULT_PREFERENCES);
  const [savingPreferences, setSavingPreferences] = useState(false);
  const [applyingGroup, setApplyingGroup] = useState<"assign" | "move" | "">("");
  const [editing, setEditing] = useState<CellarIntelligenceWine | null>(null);
  const [quantities, setQuantities] = useState<Record<WineStrategyPurpose, number>>({ drink: 0, maturation: 0, investment: 0, special_occasion: 0, undecided: 0 });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [generationScope, setGenerationScope] = useState<"cellar" | "selection">("cellar");
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
  const [helpOpen, setHelpOpen] = useState(false);
  const [simulation, setSimulation] = useState<{
    recommendation: CellarIntelligencePlan["recommendations"][number];
    wine: CellarIntelligenceWine;
  } | null>(null);

  async function loadSnapshot(showLoading = true) {
    if (showLoading) setLoading(true);
    setError("");
    try {
      const nextSnapshot = await api<CellarIntelligenceSnapshot>("/api/v1/intelligence/cellar");
      setSnapshot(nextSnapshot);
      setPreferences(nextSnapshot.preferences || DEFAULT_PREFERENCES);
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
      const [nextSnapshot, savedPlan, savedPlans] = await Promise.all([
        api<CellarIntelligenceSnapshot>("/api/v1/intelligence/cellar"),
        api<CellarIntelligencePlan | null>("/api/v1/ai/cellar-intelligence/latest"),
        api<CellarIntelligencePlan[]>("/api/v1/ai/cellar-intelligence/history?limit=5"),
      ]);
      setSnapshot(nextSnapshot);
      setPlan(savedPlan);
      setPlanHistory(savedPlans);
      setPreferences(nextSnapshot.preferences || DEFAULT_PREFERENCES);
      setAppliedRecommendations(new Set(savedPlan?.applied_recommendation_keys || []));
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : String(requestError));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void loadInitialData(); }, []);
  useEffect(() => {
    if (!helpOpen) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setHelpOpen(false);
    };
    document.addEventListener("keydown", closeOnEscape);
    return () => document.removeEventListener("keydown", closeOnEscape);
  }, [helpOpen]);

  const wineNames = useMemo(() => new Map(snapshot?.wines.map((wine) => [wine.wine_id, wine]) || []), [snapshot]);
  const displayPlanText = (value: string) => value.replace(WINE_ID_PATTERN, (wineId) => {
    const wine = wineNames.get(wineId);
    return wine ? [wine.name, wine.vintage].filter(Boolean).join(" ") : (it ? "questo vino" : "this wine");
  });
  const drinkCandidates = snapshot?.wines.filter((wine) => wine.purposes.drink && ["ready", "peak", "late"].includes(wine.readiness)) || [];
  const decisionCandidates = snapshot?.wines.filter((wine) => wine.unallocated_quantity > 0) || [];
  const selectableWines = useMemo(() => snapshot?.wines || [], [snapshot]);
  const producerOptions = useMemo(() => [...new Set(selectableWines.map((wine) => wine.producer).filter(Boolean))].sort(), [selectableWines]);
  const regionOptions = useMemo(() => [...new Set(selectableWines.map((wine) => wine.region).filter(Boolean))].sort(), [selectableWines]);
  const typeOptions = useMemo(() => [...new Set(selectableWines.map((wine) => wine.type).filter(Boolean))].sort(), [selectableWines]);
  const visibleClassifiedWines = useMemo(() => {
    const query = selectionQuery.trim().toLocaleLowerCase(locale);
    return selectableWines.filter((wine) => {
      const matchesPurpose = selectionPurpose === "all" || Boolean(wine.purposes[selectionPurpose]);
      const matchesProducer = selectionProducer === "all" || wine.producer === selectionProducer;
      const matchesRegion = selectionRegion === "all" || wine.region === selectionRegion;
      const matchesType = selectionType === "all" || wine.type === selectionType;
      const matchesQuery = !query || `${wine.name} ${wine.producer} ${wine.vintage} ${wine.region}`.toLocaleLowerCase(locale).includes(query);
      return matchesPurpose && matchesProducer && matchesRegion && matchesType && matchesQuery;
    });
  }, [locale, selectableWines, selectionProducer, selectionPurpose, selectionQuery, selectionRegion, selectionType]);
  const previousPlan = plan ? planHistory.find((item) => item.generated_at !== plan.generated_at) || null : null;
  const planComparison = useMemo(() => {
    if (!plan || !previousPlan) return null;
    const signature = (item: CellarIntelligencePlan["recommendations"][number]) => `${item.action}:${item.recommended_purpose || ""}:${item.quantity}`;
    const current = new Map(plan.recommendations.map((item) => [item.wine_id, signature(item)]));
    const previous = new Map(previousPlan.recommendations.map((item) => [item.wine_id, signature(item)]));
    return {
      added: [...current.keys()].filter((wineId) => !previous.has(wineId)).length,
      changed: [...current].filter(([wineId, value]) => previous.has(wineId) && previous.get(wineId) !== value).length,
      resolved: [...previous.keys()].filter((wineId) => !current.has(wineId)).length,
    };
  }, [plan, previousPlan]);
  const focusDescription = {
    balanced: it ? "Bilancia consumo, maturazione, capitale e occasioni." : "Balance drinking, maturation, capital and occasions.",
    drink: it ? "Metti in evidenza cosa aprire e cosa rischia di superare il momento migliore." : "Prioritise what to open and what risks passing its best moment.",
    maturation: it ? "Proteggi le bottiglie che meritano attesa e individua quelle da ricontrollare." : "Protect bottles worth holding and identify those to review.",
    investment: it ? "Concentrati su valore, capitale esposto e dati di mercato da aggiornare." : "Focus on value, exposed capital and market data to refresh.",
  }[focus];
  const formatAiCost = (value: string) => new Intl.NumberFormat(it ? "it-CH" : "en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 4,
  }).format(Number(value));

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
    setGenerationScope(wineIds.length ? "selection" : "cellar");
    setError("");
    setActionNotice("");
    setAppliedRecommendations(new Set());
    try {
      const nextPlan = await api<CellarIntelligencePlan>("/api/v1/ai/cellar-intelligence", {
        method: "POST",
        body: JSON.stringify({ locale, focus, wine_ids: wineIds }),
      });
      setPlan(nextPlan);
      setPlanHistory((current) => [nextPlan, ...current.filter((item) => item.generated_at !== nextPlan.generated_at)].slice(0, 5));
    } catch (requestError) {
      const message = requestError instanceof Error ? requestError.message : String(requestError);
      setError(message.includes("output limit")
        ? (it ? "Il piano AI richiede una risposta più lunga. Riprova tra poco." : "The AI plan needs a longer response. Please try again shortly.")
        : message);
    } finally {
      setGenerating(false);
      setGenerationScope("cellar");
    }
  }

  async function savePreferences() {
    setSavingPreferences(true);
    setError("");
    setActionNotice("");
    try {
      const saved = await api<CellarIntelligencePreferences>("/api/v1/intelligence/preferences", {
        method: "PUT",
        body: JSON.stringify(preferences),
      });
      setPreferences(saved);
      await loadSnapshot(false);
      if (plan) setPlan({ ...plan, stale: true, stale_reasons: [...new Set([...plan.stale_reasons, "cellar_data_changed"])] });
      setActionNotice(it ? "Obiettivi personali salvati. Il prossimo piano li userà nell’analisi." : "Personal goals saved. The next plan will use them in its analysis.");
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : String(requestError));
    } finally {
      setSavingPreferences(false);
    }
  }

  async function assignSelectedGroup() {
    if (!selectedWineIds.size) return;
    setApplyingGroup("assign");
    setError("");
    setActionNotice("");
    try {
      const result = await api<{ changed_wines: number; assigned_bottles: number }>("/api/v1/intelligence/allocations/bulk", {
        method: "PUT",
        body: JSON.stringify({ wine_ids: [...selectedWineIds], purpose: groupPurpose }),
      });
      await Promise.all([loadSnapshot(false), onCellarChanged()]);
      setSelectedWineIds(new Set());
      if (plan) setPlan({ ...plan, stale: true, stale_reasons: [...new Set([...plan.stale_reasons, "cellar_data_changed"])] });
      setActionNotice(it ? `${result.assigned_bottles} bottiglie di ${result.changed_wines} vini assegnate a ${purposeLabel(groupPurpose)}.` : `${result.assigned_bottles} bottles across ${result.changed_wines} wines assigned to ${purposeLabel(groupPurpose)}.`);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : String(requestError));
    } finally {
      setApplyingGroup("");
    }
  }

  async function reassignSelectedGroup() {
    if (!selectedWineIds.size || groupSourcePurpose === groupPurpose) return;
    setApplyingGroup("move");
    setError("");
    setActionNotice("");
    try {
      const result = await api<{ changed_wines: number; assigned_bottles: number }>("/api/v1/intelligence/allocations/bulk/reassign", {
        method: "PUT",
        body: JSON.stringify({ wine_ids: [...selectedWineIds], from_purpose: groupSourcePurpose, purpose: groupPurpose }),
      });
      await Promise.all([loadSnapshot(false), onCellarChanged()]);
      setSelectedWineIds(new Set());
      if (plan) setPlan({ ...plan, stale: true, stale_reasons: [...new Set([...plan.stale_reasons, "cellar_data_changed"])] });
      setActionNotice(it ? `${result.assigned_bottles} bottiglie di ${result.changed_wines} vini spostate da ${purposeLabel(groupSourcePurpose)} a ${purposeLabel(groupPurpose)}.` : `${result.assigned_bottles} bottles across ${result.changed_wines} wines moved from ${purposeLabel(groupSourcePurpose)} to ${purposeLabel(groupPurpose)}.`);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : String(requestError));
    } finally {
      setApplyingGroup("");
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
  const missingInputLabel = (input: string) => ({
    producer: it ? "produttore" : "producer",
    vintage: it ? "annata" : "vintage",
    drink_window: it ? "finestra di beva" : "drinking window",
    current_value: it ? "valore attuale" : "current value",
    purchase_price: it ? "prezzo d’acquisto" : "purchase price",
  } as Record<string, string>)[input] || input;

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
  const simulationValues = simulation ? (() => {
    const totalValue = Number(simulation.wine.current_value) || 0;
    const unitValue = simulation.wine.quantity ? totalValue / simulation.wine.quantity : 0;
    const consumed = Math.min(simulation.recommendation.quantity, simulation.wine.quantity);
    const horizonYear = new Date().getFullYear() + preferences.planning_horizon_years;
    const peakEnd = simulation.wine.drink_peak_to;
    const windowEnd = simulation.wine.drink_to;
    const yearsPastPeak = peakEnd ? Math.max(horizonYear - peakEnd, 0) : null;
    const yearsPastWindow = windowEnd ? Math.max(horizonYear - windowEnd, 0) : null;
    const qualityRiskPct = yearsPastPeak === null && yearsPastWindow === null
      ? null
      : yearsPastWindow && yearsPastWindow > 0
        ? Math.min(100, 70 + yearsPastWindow * 15)
        : Math.min(80, (yearsPastPeak || 0) * 20);
    const qualityRiskLabel = qualityRiskPct === null
      ? (it ? "Non stimabile" : "Not assessable")
      : qualityRiskPct === 0
        ? (it ? "Basso" : "Low")
        : qualityRiskPct <= 20
          ? (it ? "Moderato" : "Moderate")
          : qualityRiskPct <= 60
            ? (it ? "Elevato" : "High")
            : (it ? "Molto elevato" : "Very high");
    return {
      stockAfterDrink: simulation.wine.quantity - consumed,
      valueAfterDrink: Math.max(totalValue - unitValue * consumed, 0),
      valueConsumed: unitValue * consumed,
      totalValue,
      horizonYear,
      peakEnd,
      qualityRiskPct,
      qualityRiskLabel,
      potentialLoss: qualityRiskPct === null || totalValue <= 0 ? null : totalValue * qualityRiskPct / 100,
    };
  })() : null;

  if (loading) return <section className="cellar-intelligence"><p>{it ? "Analisi della cantina…" : "Analysing cellar…"}</p></section>;

  return (
    <section className="cellar-intelligence">
      <header className="intelligence-heading">
        <div>
          <span className="intelligence-kicker">PRIVATE CELLAR INTELLIGENCE</span>
          <div className="intelligence-title-row">
            <h1>{it ? "Piano cantina" : "Cellar plan"}</h1>
            <button type="button" className="secondary intelligence-help-button" onClick={() => setHelpOpen(true)} aria-label={it ? "Come usare Intelligence" : "How to use Intelligence"}>?</button>
          </div>
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
          <small className="intelligence-focus-description">{focusDescription}</small>
          <button type="button" disabled={disabled || generating || !snapshot?.bottle_count} onClick={() => void generatePlan()}>
            {generating ? (it ? "Analisi in corso…" : "Analysing…") : (it ? "Crea piano AI" : "Create AI plan")}
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

      {!plan ? <section className="intelligence-ai-opportunity" aria-labelledby="intelligence-ai-opportunity-title">
        <div>
          <span className="intelligence-kicker">VINARIS AI</span>
          <h2 id="intelligence-ai-opportunity-title">{it ? "Trasforma i segnali della cantina in un ordine d’azione" : "Turn cellar signals into an order of action"}</h2>
          <p>{it ? "Il piano AI incrocia maturità, valore, obiettivi e qualità dei dati. Propone azioni concrete, ma non modifica mai la cantina senza la tua conferma." : "The AI plan combines maturity, value, goals and data quality. It proposes concrete actions, but never changes your cellar without your confirmation."}</p>
        </div>
        <ul>
          <li><strong>{snapshot?.drink_now_count || 0}</strong><span>{it ? "bottiglie nella finestra di beva" : "bottles in their drinking window"}</span></li>
          <li><strong>{snapshot?.undecided_count || 0}</strong><span>{it ? "bottiglie ancora da decidere" : "bottles still needing a decision"}</span></li>
          <li><strong>{snapshot?.wine_count || 0}</strong><span>{it ? "vini letti nel contesto" : "wines considered in context"}</span></li>
        </ul>
      </section> : null}

      <details className="intelligence-preferences">
        <summary><div><span className="intelligence-kicker">{it ? "OBIETTIVI PERSONALI" : "PERSONAL GOALS"}</span><h2>{it ? "Imposta la strategia della cantina" : "Set your cellar strategy"}</h2></div><span>{it ? "Consumo, capitale e orizzonte" : "Drinking, capital and horizon"}</span></summary>
        <div className="intelligence-preferences-body">
          <label><span>{it ? "Bottiglie da bere all’anno" : "Bottles to drink per year"}</span><input type="number" min="0" max="10000" value={preferences.annual_drink_target} onChange={(event) => setPreferences((current) => ({ ...current, annual_drink_target: Math.max(0, Number(event.target.value) || 0) }))} /></label>
          <label><span>{it ? "Capitale da proteggere" : "Capital to protect"}</span><span className="intelligence-input-suffix"><input type="number" min="0" max="100" value={preferences.protected_capital_pct} onChange={(event) => setPreferences((current) => ({ ...current, protected_capital_pct: Math.min(100, Math.max(0, Number(event.target.value) || 0)) }))} /><b>%</b></span></label>
          <label><span>{it ? "Bottiglie per occasioni speciali" : "Special-occasion bottles"}</span><input type="number" min="0" max="10000" value={preferences.special_occasion_target} onChange={(event) => setPreferences((current) => ({ ...current, special_occasion_target: Math.max(0, Number(event.target.value) || 0) }))} /></label>
          <label><span>{it ? "Prossima occasione" : "Next special occasion"}</span><input type="date" value={preferences.next_special_occasion_date || ""} onChange={(event) => setPreferences((current) => ({ ...current, next_special_occasion_date: event.target.value || null }))} /></label>
          <label><span>{it ? "Orizzonte di pianificazione" : "Planning horizon"}</span><span className="intelligence-input-suffix"><input type="number" min="1" max="20" value={preferences.planning_horizon_years} onChange={(event) => setPreferences((current) => ({ ...current, planning_horizon_years: Math.min(20, Math.max(1, Number(event.target.value) || 1)) }))} /><b>{it ? "anni" : "years"}</b></span></label>
          <label><span>{it ? "Ricontrolla il piano ogni" : "Review plan every"}</span><span className="intelligence-input-suffix"><input type="number" min="1" max="365" value={preferences.refresh_interval_days} onChange={(event) => setPreferences((current) => ({ ...current, refresh_interval_days: Math.min(365, Math.max(1, Number(event.target.value) || 1)) }))} /><b>{it ? "giorni" : "days"}</b></span></label>
          <button type="button" disabled={disabled || savingPreferences} onClick={() => void savePreferences()}>{savingPreferences ? (it ? "Salvataggio…" : "Saving…") : (it ? "Salva obiettivi" : "Save goals")}</button>
        </div>
      </details>

      {plan ? <article className="intelligence-ai-plan">
        <header className="plan-heading">
          <div><span className="intelligence-kicker">VINARIS AI</span><h2>{it ? "Piano d’azione" : "Action plan"}</h2></div>
          <span className="plan-action-count">{plan.recommendations.length} {it ? "azioni proposte" : "suggested actions"}</span>
        </header>
        {plan.stale ? <div className="intelligence-plan-stale"><div><strong>{it ? "Il piano riflette dati precedenti" : "This plan reflects previous data"}</strong><span>{plan.stale_reasons.includes("cellar_data_changed") ? (it ? "Hai applicato o modificato dati della cantina. Puoi continuare con le azioni visibili oppure ricalcolare ora le priorità." : "You applied advice or changed cellar data. You can continue with visible actions or recalculate priorities now.") : (it ? "È trascorso l’intervallo di revisione scelto: ricalcola le priorità quando vuoi una nuova lettura della cantina." : "Your selected review interval has elapsed: recalculate priorities when you want a fresh cellar assessment.")}</span></div><button type="button" disabled={disabled || generating} onClick={() => void generatePlan()}>{it ? "Ricalcola priorità" : "Recalculate priorities"}</button></div> : null}
        <section className="plan-first-action">
          <span className="plan-step-number">1</span>
          <div><small>{it ? "DA FARE ADESSO" : "DO THIS NOW"}</small><strong>{displayPlanText(plan.immediate_action)}</strong></div>
        </section>
        <div className="plan-summary-grid">
          <section><small>{it ? "STRATEGIA" : "STRATEGY"}</small><p>{displayPlanText(plan.overview)}</p></section>
          <div className="plan-metrics">
            <span><strong>{plan.recommendations.filter((item) => item.priority === "high").length}</strong><small>{it ? "alta priorità" : "high priority"}</small></span>
            <span><strong>{plan.recommendations.reduce((total, item) => total + item.quantity, 0)}</strong><small>{it ? "bottiglie coinvolte" : "bottles involved"}</small></span>
          </div>
        </div>
        {planComparison ? <section className="intelligence-plan-comparison"><div><span className="intelligence-kicker">{it ? "DAL PIANO PRECEDENTE" : "SINCE PREVIOUS PLAN"}</span><strong>{new Date(previousPlan!.generated_at).toLocaleDateString(locale)}</strong></div><span><b>{planComparison.added}</b>{it ? "nuove" : "new"}</span><span><b>{planComparison.changed}</b>{it ? "cambiate" : "changed"}</span><span><b>{planComparison.resolved}</b>{it ? "risolte" : "resolved"}</span></section> : null}
        {plan.risk_note ? <aside className="plan-risk"><strong>{it ? "Da tenere presente" : "Keep in mind"}</strong><span>{displayPlanText(plan.risk_note)}</span></aside> : null}
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
              <span className="plan-recommendation-top"><strong>{index + 1}</strong><span className="plan-recommendation-badges"><span className={`confidence confidence-${item.confidence}`}>{it ? "Affidabilità" : "Confidence"} {item.data_quality_score}%</span><span className={`priority priority-${item.priority}`}>{item.priority === "high" ? (it ? "Alta" : "High") : item.priority === "medium" ? (it ? "Media" : "Medium") : (it ? "Bassa" : "Low")}</span></span></span>
              <span className="plan-recommendation-wine">{wine ? <BottleThumbnail wine={wine} prominent /> : null}<span><strong>{wine?.name || item.wine_id}</strong><small>{item.quantity} {item.quantity === 1 ? (it ? "bottiglia" : "bottle") : (it ? "bottiglie" : "bottles")} · {displayedActionLabel}</small></span></span>
              <span>{displayPlanText(item.reason)}</span>
              {item.missing_inputs.length ? <small className="plan-missing-inputs">{it ? "Dati da completare" : "Missing data"}: {item.missing_inputs.map(missingInputLabel).join(", ")}</small> : null}
            </button>
            <footer>
              <span className={`plan-action plan-action-${item.action}`}>{displayedActionLabel}</span>
              <div className="plan-recommendation-buttons"><button type="button" className="secondary" disabled={!wine} onClick={() => wine && setSimulation({ recommendation: item, wine })}>{it ? "Simula" : "Simulate"}</button>{applied ? <strong className="plan-action-applied">{it ? "Applicata" : "Applied"}</strong> : item.action === "drink" ? (
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
              )}</div>
            </footer>
          </article>;
        })}</div>
        <footer className="intelligence-plan-meta">
          <span>{it ? `Generato il ${new Date(plan.generated_at).toLocaleDateString(locale, { day: "2-digit", month: "short", year: "numeric" })}` : `Generated ${new Date(plan.generated_at).toLocaleDateString(locale, { day: "2-digit", month: "short", year: "numeric" })}`}</span>
          <span>{plan.model}</span>
          <span>{it ? `Costo AI stimato: ${formatAiCost(plan.estimated_cost_usd)}` : `Estimated AI cost: ${formatAiCost(plan.estimated_cost_usd)}`}</span>
        </footer>
      </article> : null}

      <details className="intelligence-selection">
        <summary>
          <div><span className="intelligence-kicker">{it ? "AZIONI DI GRUPPO" : "GROUP ACTIONS"}</span><h2>{it ? "Seleziona e gestisci più vini" : "Select and manage multiple wines"}</h2><p>{it ? "Filtra per produttore, regione, tipologia o obiettivo; poi analizza, assegna le bottiglie libere o sposta un obiettivo esistente." : "Filter by producer, region, type or purpose; then analyse, assign unallocated bottles, or move an existing purpose."}</p></div>
          <span className="intelligence-selection-summary"><strong>{selectedWineIds.size} {it ? "selezionati" : "selected"}</strong><span aria-hidden="true">⌄</span></span>
        </summary>
        <div className="intelligence-selection-body">
          <div className="intelligence-selection-controls">
            <input type="search" value={selectionQuery} onChange={(event) => setSelectionQuery(event.target.value)} placeholder={it ? "Cerca vino, produttore o regione" : "Search wine, producer, or region"} />
            <select value={selectionPurpose} onChange={(event) => { const purpose = event.target.value as WineStrategyPurpose | "all"; setSelectionPurpose(purpose); if (purpose !== "all") setGroupSourcePurpose(purpose); }} aria-label={it ? "Filtra per obiettivo" : "Filter by purpose"}>
              <option value="all">{it ? "Tutti gli obiettivi" : "All purposes"}</option>
              {PURPOSES.map((purpose) => <option key={purpose} value={purpose}>{purposeLabel(purpose)}</option>)}
            </select>
            <select value={selectionProducer} onChange={(event) => setSelectionProducer(event.target.value)} aria-label={it ? "Filtra per produttore" : "Filter by producer"}><option value="all">{it ? "Tutti i produttori" : "All producers"}</option>{producerOptions.map((producer) => <option key={producer} value={producer}>{producer}</option>)}</select>
            <select value={selectionRegion} onChange={(event) => setSelectionRegion(event.target.value)} aria-label={it ? "Filtra per regione" : "Filter by region"}><option value="all">{it ? "Tutte le regioni" : "All regions"}</option>{regionOptions.map((region) => <option key={region} value={region}>{region}</option>)}</select>
            <select value={selectionType} onChange={(event) => setSelectionType(event.target.value)} aria-label={it ? "Filtra per tipologia" : "Filter by type"}><option value="all">{it ? "Tutte le tipologie" : "All types"}</option>{typeOptions.map((type) => <option key={type} value={type}>{type}</option>)}</select>
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
            {!visibleClassifiedWines.length ? <p className="intelligence-empty">{it ? "Nessun vino corrisponde ai filtri." : "No wines match these filters."}</p> : null}
          </div>
          <footer><small>{it ? "Assegna libere aggiunge solo bottiglie senza obiettivo. Per spostare bottiglie già classificate scegli l’obiettivo di partenza e quello nuovo." : "Assign unallocated only adds bottles without a purpose. To move classified bottles, choose their current and new purpose."}</small><div className="intelligence-group-actions"><select value={groupPurpose} onChange={(event) => setGroupPurpose(event.target.value as WineStrategyPurpose)} aria-label={it ? "Nuovo obiettivo" : "New purpose"}>{PURPOSES.map((purpose) => <option key={purpose} value={purpose}>{purposeLabel(purpose)}</option>)}</select><button type="button" className="secondary" disabled={disabled || Boolean(applyingGroup) || !selectedWineIds.size} onClick={() => void assignSelectedGroup()}>{applyingGroup === "assign" ? (it ? "Assegnazione…" : "Assigning…") : (it ? "Assegna bottiglie libere" : "Assign unallocated")}</button><select value={groupSourcePurpose} onChange={(event) => setGroupSourcePurpose(event.target.value as WineStrategyPurpose)} aria-label={it ? "Obiettivo da spostare" : "Purpose to move"}>{PURPOSES.map((purpose) => <option key={purpose} value={purpose}>{purposeLabel(purpose)}</option>)}</select><button type="button" className="secondary" disabled={disabled || Boolean(applyingGroup) || !selectedWineIds.size || groupSourcePurpose === groupPurpose} onClick={() => void reassignSelectedGroup()}>{applyingGroup === "move" ? (it ? "Spostamento…" : "Moving…") : (it ? "Sposta bottiglie assegnate" : "Move assigned bottles")}</button><button type="button" disabled={disabled || generating || !selectedWineIds.size} onClick={() => void generatePlan([...selectedWineIds])}>{generating ? (it ? "Analisi in corso…" : "Analysing…") : `${it ? "Analizza selezione" : "Analyse selection"} (${selectedWineIds.size})`}</button></div></footer>
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

      {simulation && simulationValues ? <div className="intelligence-modal-backdrop" role="presentation" onMouseDown={() => setSimulation(null)}>
        <section className="intelligence-modal intelligence-simulation" role="dialog" aria-modal="true" aria-labelledby="intelligence-simulation-title" onMouseDown={(event) => event.stopPropagation()}>
          <header><div><span className="intelligence-kicker">{it ? "SIMULAZIONE" : "SIMULATION"}</span><h2 id="intelligence-simulation-title">{simulation.wine.name} {simulation.wine.vintage}</h2></div><button type="button" className="secondary" onClick={() => setSimulation(null)} aria-label={it ? "Chiudi" : "Close"}>×</button></header>
          <p>{it ? "Confronto prudenziale tra consumo e attesa. Nessuna modifica viene salvata." : "Prudential comparison between drinking and waiting. No changes are saved."}</p>
          <div className="intelligence-simulation-grid">
            <article><span>{it ? "BERE ORA" : "DRINK NOW"}</span><strong>{simulation.recommendation.quantity} {it ? "bottiglie" : "bottles"}</strong><small>{it ? "Giacenza residua" : "Remaining stock"}: {simulationValues.stockAfterDrink}</small><small>{it ? "Valore utilizzato oggi" : "Value enjoyed today"}: {formatUnitValue(String(simulationValues.valueConsumed), simulation.wine.currency, 1)}</small></article>
            <article><span>{it ? "ATTENDERE" : "WAIT"}</span><strong>{simulation.wine.quantity} {it ? "bottiglie" : "bottles"}</strong><small>{it ? "Orizzonte osservato" : "Observed horizon"}: {simulationValues.horizonYear}{simulationValues.peakEnd ? ` · ${it ? "fine picco" : "peak end"} ${simulationValues.peakEnd}` : ""}</small><small>{simulationValues.qualityRiskPct === null ? (it ? "Rischio qualità: finestra incompleta" : "Quality risk: incomplete window") : `${it ? "Rischio qualità" : "Quality risk"}: ${simulationValues.qualityRiskLabel} (${simulationValues.qualityRiskPct}%)`}</small><small>{simulationValues.potentialLoss === null ? (it ? "Perdita potenziale: valore non disponibile" : "Potential loss: value unavailable") : `${it ? "Perdita potenziale prudenziale" : "Prudential potential loss"}: ${formatUnitValue(String(simulationValues.potentialLoss), simulation.wine.currency, 1)}`}</small></article>
            <article className="recommended"><span>{it ? "PROPOSTA INTELLIGENCE" : "INTELLIGENCE PROPOSAL"}</span><strong>{simulation.recommendation.recommended_purpose ? purposeLabel(simulation.recommendation.recommended_purpose) : ({ drink: it ? "Bere" : "Drink", hold: it ? "Mantenere" : "Hold", monitor: it ? "Monitorare" : "Monitor", decide: it ? "Decidere" : "Decide", reclassify: it ? "Riclassificare" : "Reclassify" }[simulation.recommendation.action])}</strong><small>{simulation.recommendation.quantity} {it ? "bottiglie coinvolte" : "bottles involved"}</small><small>{displayPlanText(simulation.recommendation.reason)}</small></article>
          </div>
          <aside>{it ? "La simulazione non presume rivalutazioni: usa il valore attuale registrato come base per rendere visibile il capitale esposto all’attesa." : "The simulation does not assume appreciation: it uses the recorded current value to make capital exposed to waiting visible."}</aside>
          <aside>{it ? "La perdita potenziale non è una previsione di mercato: è una stima prudenziale del valore esposto al deterioramento. Parte dalla fine del picco (+20% per anno, fino all’80%) e aumenta oltre la fine della finestra (+15% per anno, fino al 100%)." : "Potential loss is not a market forecast: it is a prudential estimate of value exposed to deterioration. It starts at peak end (+20% per year, up to 80%) and increases beyond drinking-window end (+15% per year, up to 100%)."}</aside>
          <footer><button type="button" onClick={() => setSimulation(null)}>{it ? "Chiudi simulazione" : "Close simulation"}</button></footer>
        </section>
      </div> : null}

      {helpOpen ? <div className="intelligence-help-backdrop" role="presentation" onMouseDown={() => setHelpOpen(false)}>
        <section className="intelligence-help" role="dialog" aria-modal="true" aria-labelledby="intelligence-help-title" onMouseDown={(event) => event.stopPropagation()}>
          <header>
            <div><span className="intelligence-kicker">{it ? "GUIDA RAPIDA" : "QUICK GUIDE"}</span><h2 id="intelligence-help-title">{it ? "Come usare Intelligence" : "How to use Intelligence"}</h2></div>
            <button type="button" className="secondary compact" onClick={() => setHelpOpen(false)} aria-label={it ? "Chiudi" : "Close"}>×</button>
          </header>
          <p className="intelligence-help-intro">{it ? "Intelligence combina i tuoi obiettivi personali con finestra di beva, maturità, valore e qualità dei dati per proporti azioni sulla cantina reale." : "Intelligence combines your personal goals with drinking windows, maturity, value and data quality to suggest actions for your actual cellar."}</p>
          <div className="intelligence-help-modes">
            <article><strong>{it ? "Equilibrata" : "Balanced"}</strong><span>{it ? "Crea un piano generale e mette in ordine le priorità della cantina." : "Creates an overall plan and orders your cellar priorities."}</span></article>
            <article><strong>{it ? "Cosa bere" : "What to drink"}</strong><span>{it ? "Privilegia le bottiglie pronte, al picco o vicine alla fine della finestra." : "Prioritises bottles that are ready, at peak or near the end of their window."}</span></article>
            <article><strong>{it ? "Maturazione" : "Maturation"}</strong><span>{it ? "Individua i vini da attendere e quelli da riclassificare." : "Finds wines to hold and bottles whose purpose should be reassessed."}</span></article>
            <article><strong>{it ? "Investimento" : "Investment"}</strong><span>{it ? "Evidenzia i vini da monitorare usando valore e maturità, senza promettere rendimenti." : "Highlights wines to monitor using value and maturity, without promising returns."}</span></article>
          </div>
          <ol className="intelligence-help-steps">
            <li><strong>{it ? "Definisci gli obiettivi" : "Set bottle purposes"}</strong><span>{it ? "Distribuisci le bottiglie tra Bere, Maturazione, Investimento, Occasione speciale o Da decidere." : "Allocate bottles to Drink, Maturation, Investment, Special occasion or Undecided."}</span></li>
            <li><strong>{it ? "Scegli l’ampiezza" : "Choose the scope"}</strong><span>{it ? "Analizza tutta la cantina oppure seleziona solo alcuni vini da rivalutare." : "Analyse the whole cellar or select only the wines you want to reassess."}</span></li>
            <li><strong>{it ? "Controlla e applica" : "Review and apply"}</strong><span>{it ? "Apri il vino per verificare i dati o usa il pulsante dell’azione proposta." : "Open the wine to verify its data or use the proposed action button."}</span></li>
            <li><strong>{it ? "Simula il rischio di attesa" : "Simulate waiting risk"}</strong><span>{it ? "Confronta il consumo con il rischio qualità e il valore potenzialmente esposto oltre il picco. Non è una previsione di mercato." : "Compare drinking with quality risk and value potentially exposed beyond peak. It is not a market forecast."}</span></li>
          </ol>
          <aside>{it ? "L’affidabilità indica quanto sono completi i dati usati. Le proposte non modificano la cantina finché non le confermi. Le analisi AI possono consumare credito; il costo è mostrato nel piano." : "Confidence reflects how complete the underlying data is. Suggestions do not change the cellar until you confirm them. AI analyses may use credit; the cost is shown in the plan."}</aside>
        </section>
      </div> : null}

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
      {generating ? <AiGenerationOverlay mode={generationScope === "selection" ? "cellar-intelligence-selection" : "cellar-intelligence"} t={(key) => translate(locale, key)} locale={locale} progress={null} /> : null}
    </section>
  );
}
