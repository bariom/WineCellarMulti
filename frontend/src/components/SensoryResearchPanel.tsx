import { useEffect, useState } from "react";
import type { Locale, SensoryResearchCandidate, SensoryResearchRun } from "../types";
import { api } from "../services/api";
import "./SensoryResearchPanel.css";

const traitsIt: Record<string, string> = { body: "Corpo", acidity: "Acidità", tannin: "Tannini", sweetness: "Dolcezza", aromatic_intensity: "Intensità aromatica", fruit: "Frutto", wood: "Legno", spice: "Spezie", minerality: "Mineralità" };

export function SensoryResearchPanel({ locale, onApplied }: { locale: Locale; onApplied: () => Promise<void> }) {
  const it = locale === "it";
  const [run, setRun] = useState<SensoryResearchRun | null>(null);
  const [limit, setLimit] = useState(10);
  const [budget, setBudget] = useState("1");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [selectionMode, setSelectionMode] = useState("automatic");
  const [candidates, setCandidates] = useState<SensoryResearchCandidate[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [search, setSearch] = useState("");
  const [loadingCandidates, setLoadingCandidates] = useState(false);
  const [candidateError, setCandidateError] = useState("");
  const manual = selectionMode === "manual";
  const visibleCandidates = candidates.filter(wine => `${wine.name} ${wine.producer} ${wine.vintage}`.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase()));
  const running = run?.status === "queued" || run?.status === "running";
  const skipped = run?.results.filter(result => result.status === "skipped").length ?? 0;
  const labels: Record<string, string> = it
    ? { queued: "In attesa", running: "Ricerca in corso", completed: "Ricerca completata", failed: "Ricerca interrotta", ready: "Proposta da verificare", incomplete: "Profilo incompleto", no_evidence: "Fonti insufficienti", skipped: "Saltato", applied: "Profilo utilizzato" }
    : { queued: "Queued", running: "Researching", completed: "Research completed", failed: "Research interrupted", ready: "Proposal to review", incomplete: "Incomplete profile", no_evidence: "Insufficient sources", skipped: "Skipped", applied: "Profile applied" };
  const reportError = (err: unknown) => setError(err instanceof Error ? err.message : (it ? "Ricerca non disponibile." : "Research unavailable."));

  useEffect(() => {
    const controller = new AbortController();
    api<SensoryResearchRun[]>("/api/v1/taste-profile/admin/research-runs", { signal: controller.signal })
      .then(runs => { if (!controller.signal.aborted) setRun(runs[0] ?? null); })
      .catch(err => { if (!controller.signal.aborted) reportError(err); });
    return () => controller.abort();
  }, []);

  useEffect(() => {
    if (!manual) return;
    const controller = new AbortController();
    setLoadingCandidates(true); setCandidateError("");
    api<SensoryResearchCandidate[]>("/api/v1/taste-profile/admin/research-runs/candidates", { signal: controller.signal })
      .then(wines => { if (!controller.signal.aborted) {
        setCandidates(wines);
        setSelectedIds(ids => ids.filter(id => wines.some(wine => wine.id === id && wine.vintage.trim())));
      } })
      .catch(err => { if (!controller.signal.aborted) setCandidateError(err instanceof Error ? err.message : (it ? "Elenco vini non disponibile." : "Wine list unavailable.")); })
      .finally(() => { if (!controller.signal.aborted) setLoadingCandidates(false); });
    return () => controller.abort();
  }, [manual]);

  useEffect(() => {
    if (!run || !running) return;
    const controller = new AbortController();
    const timer = window.setInterval(() => {
      api<SensoryResearchRun>(`/api/v1/taste-profile/admin/research-runs/${run.id}`, { signal: controller.signal })
        .then(next => { if (!controller.signal.aborted) { setRun(next); setError(""); } })
        .catch(err => { if (!controller.signal.aborted) reportError(err); });
    }, 3000);
    return () => { window.clearInterval(timer); controller.abort(); };
  }, [run?.id, running]);

  async function start() {
    if (manual && (!selectedIds.length || loadingCandidates || candidateError)) return;
    setBusy(true); setError("");
    try {
      setRun(await api<SensoryResearchRun>("/api/v1/taste-profile/admin/research-runs", { method: "POST", body: JSON.stringify({ max_wines: manual ? selectedIds.length : limit, budget_usd: budget, ...(manual ? { wine_ids: selectedIds } : {}) }) }));
    } catch (err) { reportError(err); }
    finally { setBusy(false); }
  }
  async function apply(wineId: string) {
    if (!run) return;
    setBusy(true); setError("");
    try {
      setRun(await api<SensoryResearchRun>(`/api/v1/taste-profile/admin/research-runs/${run.id}/wines/${wineId}/apply`, { method: "POST" }));
      await onApplied();
    } catch (err) { reportError(err); }
    finally { setBusy(false); }
  }

  return <section className="sensory-research" aria-labelledby="sensory-research-title">
    <h4 id="sensory-research-title">{it ? "Agente del profilo organolettico · Prototipo" : "Organoleptic profile agent · Prototype"}</h4>
    <p>{it ? "Confronta schede del produttore e descrizioni esterne indipendenti per verificare i profili automatici della cantina. Il profilo attuale è una stima non validata." : "Compare producer sheets and independent external tasting notes to verify automatic cellar profiles. The current profile is an unvalidated estimate."}</p>
    <form className="sensory-research-controls" onSubmit={event => { event.preventDefault(); void start(); }}>
      <label>{it ? "Vini da analizzare" : "Wines to research"}<select aria-label={it ? "Vini da analizzare" : "Wines to research"} value={selectionMode} disabled={running || busy} onChange={event => setSelectionMode(event.target.value)}><option value="automatic">{it ? "Selezione automatica" : "Automatic selection"}</option><option value="manual">{it ? "Scelgo io i vini" : "Choose wines myself"}</option></select></label>
      {!manual && <label>{it ? "Numero massimo di vini" : "Maximum number of wines"}<input type="number" min="1" max="20" required value={limit} disabled={running || busy} onChange={event => setLimit(Number(event.target.value))} /></label>}
      <label>{it ? "Budget AI (USD)" : "AI budget (USD)"}<input type="number" min="0.05" max="5" step="0.05" required value={budget} disabled={running || busy} onChange={event => setBudget(event.target.value)} /></label>
      {manual && <fieldset className="sensory-research-picker" disabled={running || busy}>
        <legend>{it ? "Scegli fino a 20 vini" : "Choose up to 20 wines"}</legend>
        <label>{it ? "Cerca nome, produttore o annata" : "Search name, producer or vintage"}<input type="search" value={search} onChange={event => setSearch(event.target.value)} /></label>
        <p>{selectedIds.length}/20 {it ? "vini selezionati" : "wines selected"}</p>
        {loadingCandidates ? <p>{it ? "Caricamento vini…" : "Loading wines…"}</p> : candidateError ? <p role="alert">{candidateError}</p> : <>
          <div className="sensory-research-wine-list">{visibleCandidates.map(wine => <label key={wine.id}>
            <input type="checkbox" checked={selectedIds.includes(wine.id)} disabled={!wine.vintage.trim() || (!selectedIds.includes(wine.id) && selectedIds.length >= 20)} onChange={event => setSelectedIds(ids => event.target.checked ? [...ids, wine.id] : ids.filter(id => id !== wine.id))} />
            <span><strong>{wine.name}</strong><small>{wine.producer} · {wine.vintage.trim() || (it ? "Annata mancante: completa la scheda" : "Missing vintage: complete wine details")}</small></span>
          </label>)}</div>
          {!visibleCandidates.length && <p>{it ? "Nessun vino disponibile per questa ricerca." : "No wines available for this search."}</p>}
        </>}
        <p className="muted">{it ? "I profili manuali e validati sono esclusi. Il filtro non modifica i vini già selezionati." : "Manual and validated profiles are excluded. Filtering preserves your selected wines."}</p>
      </fieldset>}
      <button type="submit" className="secondary compact" disabled={busy || running || (manual && (!selectedIds.length || loadingCandidates || !!candidateError))}>{running ? (it ? "Ricerca in corso…" : "Researching…") : (it ? "Avvia ricerca autonoma" : "Start autonomous research")}</button>
    </form>
    <p className="muted">{it ? "Massimo 20 vini e 6 consultazioni web per vino. Le ricerche continuano in background; i profili validati e le correzioni manuali sono protetti." : "Up to 20 wines and 6 web tool calls per wine. Research continues in the background; validated profiles and manual corrections are protected."}</p>
    {error && <p role="alert">{error}</p>}
    {run && <>
      <p role="status">{labels[run.status] || run.status} · {run.results.length}/{run.selected_wines} {it ? "vini valutati" : "wines reviewed"}{skipped > 0 ? ` · ${skipped} ${it ? (skipped === 1 ? "saltato" : "saltati") : "skipped"}` : ""} · ${run.cost_usd}</p>
      {run.selected_wines < run.max_wines && <p>{it ? `Selezionati ${run.selected_wines} vini da valutare, su un massimo di ${run.max_wines}. Sono esclusi i duplicati e i profili manuali o validati.` : `Selected ${run.selected_wines} wines to review, with a maximum of ${run.max_wines}. Duplicates and manual or validated profiles are excluded.`}</p>}
      {run.issue && <p>{run.issue === "budget_limit" ? (it ? "Budget residuo insufficiente per un’altra ricerca." : "Remaining budget is insufficient for another search.") : (it ? "La ricerca si è interrotta. Le proposte già completate restano disponibili." : "Research stopped. Completed proposals remain available.")}</p>}
      <div className="sensory-research-results">{run.results.map(result => <article key={result.wine_id}>
        <h5>{result.name}</h5><p>{result.producer}</p>
        <p>{it ? "Annata richiesta" : "Requested vintage"}: {result.vintage.trim() || (it ? "Mancante nella scheda vino" : "Missing from wine details")}</p>
        <strong>{labels[result.status] || result.status}</strong>
        {result.summary && <p>{result.summary}</p>}
        {result.limitations && <p>{result.limitations}</p>}
        {result.issue === "missing_vintage" ? <p>{it ? "Ricerca non eseguita: inserisci l’annata nella scheda del vino e avvia una nuova ricerca." : "Research skipped: enter the vintage in wine details and start a new run."}</p> : !result.vintage_confirmed && <p>{it ? "Annata non verificata: proposta non applicabile." : "Vintage unverified: proposal cannot be applied."}</p>}
        {Object.keys(result.dimensions).length > 0 && <details><summary>{it ? "Confronto e prove" : "Comparison and evidence"}</summary><p>{it ? "Valori stimati su scala 0–1. Copertura delle prove (non accuratezza misurata)" : "Estimated values on a 0–1 scale. Evidence coverage (not measured accuracy)"}: {Math.round(result.confidence * 100)}%</p>
          <dl>{Object.entries(result.dimensions).map(([key, trait]) => <div key={key}><dt>{it ? traitsIt[key] || key : key.replace(/_/g, " ")}</dt><dd>{result.baseline[key] ?? "—"} → {trait.value} · {trait.basis === "documented" ? (it ? "Descritto dalla fonte" : "Described by source") : (it ? "Interpretazione" : "Inferred")}<blockquote>{trait.excerpt}</blockquote><a href={trait.source_url} target="_blank" rel="noopener noreferrer">{it ? "Verifica fonte ↗" : "Verify source ↗"}</a></dd></div>)}</dl>
          {result.comparisons?.map(comparison => <div key={comparison.dimension}>
            <strong>{it ? traitsIt[comparison.dimension] || comparison.dimension : comparison.dimension.replace(/_/g, " ")} · {comparison.agreement === "corroborated" ? (it ? "Fonti concordanti" : "Corroborated sources") : comparison.agreement === "conflicting" ? (it ? "Fonti discordanti" : "Conflicting sources") : (it ? "Prova singola" : "Single source")}</strong>
            <p>{comparison.explanation}</p>
            {comparison.evidence.map(evidence => <div key={evidence.source_url}><blockquote>{evidence.excerpt}</blockquote><a href={evidence.source_url} target="_blank" rel="noopener noreferrer">{it ? "Confronta fonte ↗" : "Compare source ↗"}</a></div>)}
          </div>)}
          {result.aromas.length > 0 && <p>{it ? "Aromi descritti" : "Described aromas"}: {result.aromas.map(aroma => aroma.name).join(", ")}</p>}
        </details>}
        <ul>{result.sources.map(source => <li key={source.url}><a href={source.url} target="_blank" rel="noopener noreferrer">{source.title || source.url} ↗</a></li>)}</ul>
        {result.status === "ready" && <button type="button" className="secondary compact" disabled={busy || running} onClick={() => void apply(result.wine_id)}>{it ? "Usa questo profilo" : "Apply this profile"}</button>}
      </article>)}</div>
    </>}
  </section>;
}
