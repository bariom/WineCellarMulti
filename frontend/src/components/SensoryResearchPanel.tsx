import { useEffect, useState } from "react";
import type { Locale, SensoryResearchRun } from "../types";
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
    setBusy(true); setError("");
    try {
      setRun(await api<SensoryResearchRun>("/api/v1/taste-profile/admin/research-runs", { method: "POST", body: JSON.stringify({ max_wines: limit, budget_usd: budget }) }));
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
    <p>{it ? "Ricerca descrizioni e schede tecniche per i vini della cantina attiva con profili mancanti o deboli. Confronta le proposte con le fonti prima di utilizzarle." : "Research tasting notes and technical sheets for missing or weak profiles in the active cellar. Compare proposals with sources before applying them."}</p>
    <form className="sensory-research-controls" onSubmit={event => { event.preventDefault(); void start(); }}>
      <label>{it ? "Numero massimo di vini" : "Maximum number of wines"}<input type="number" min="1" max="20" required value={limit} disabled={running || busy} onChange={event => setLimit(Number(event.target.value))} /></label>
      <label>{it ? "Budget AI (USD)" : "AI budget (USD)"}<input type="number" min="0.05" max="5" step="0.05" required value={budget} disabled={running || busy} onChange={event => setBudget(event.target.value)} /></label>
      <button type="submit" className="secondary compact" disabled={busy || running}>{running ? (it ? "Ricerca in corso…" : "Researching…") : (it ? "Avvia ricerca autonoma" : "Start autonomous research")}</button>
    </form>
    <p className="muted">{it ? "Massimo 20 vini e 3 consultazioni web per vino. Le ricerche continuano in background; i profili validati e le correzioni manuali sono protetti." : "Up to 20 wines and 3 web tool calls per wine. Research continues in the background; validated profiles and manual corrections are protected."}</p>
    {error && <p role="alert">{error}</p>}
    {run && <>
      <p role="status">{labels[run.status] || run.status} · {run.results.length}/{run.selected_wines} {it ? "vini valutati" : "wines reviewed"}{skipped > 0 ? ` · ${skipped} ${it ? (skipped === 1 ? "saltato" : "saltati") : "skipped"}` : ""} · ${run.cost_usd}</p>
      {run.selected_wines < run.max_wines && <p>{it ? `Selezionati ${run.selected_wines} vini da valutare, su un massimo di ${run.max_wines}. Sono esclusi i duplicati e i profili già sufficienti, manuali o validati.` : `Selected ${run.selected_wines} wines to review, with a maximum of ${run.max_wines}. Duplicates and sufficient, manual or validated profiles are excluded.`}</p>}
      {run.issue && <p>{run.issue === "budget_limit" ? (it ? "Budget residuo insufficiente per un’altra ricerca." : "Remaining budget is insufficient for another search.") : (it ? "La ricerca si è interrotta. Le proposte già completate restano disponibili." : "Research stopped. Completed proposals remain available.")}</p>}
      <div className="sensory-research-results">{run.results.map(result => <article key={result.wine_id}>
        <h5>{result.name}</h5><p>{result.producer}</p>
        <p>{it ? "Annata richiesta" : "Requested vintage"}: {result.vintage.trim() || (it ? "Mancante nella scheda vino" : "Missing from wine details")}</p>
        <strong>{labels[result.status] || result.status}</strong>
        {result.summary && <p>{result.summary}</p>}
        {result.limitations && <p>{result.limitations}</p>}
        {result.issue === "missing_vintage" ? <p>{it ? "Ricerca non eseguita: inserisci l’annata nella scheda del vino e avvia una nuova ricerca." : "Research skipped: enter the vintage in wine details and start a new run."}</p> : !result.vintage_confirmed && <p>{it ? "Annata non verificata: proposta non applicabile." : "Vintage unverified: proposal cannot be applied."}</p>}
        {Object.keys(result.dimensions).length > 0 && <details><summary>{it ? "Confronto e prove" : "Comparison and evidence"}</summary><p>{it ? "Valori stimati su scala 0–1. Attendibilità" : "Estimated values on a 0–1 scale. Confidence"}: {Math.round(result.confidence * 100)}%</p>
          <dl>{Object.entries(result.dimensions).map(([key, trait]) => <div key={key}><dt>{it ? traitsIt[key] || key : key.replace(/_/g, " ")}</dt><dd>{result.baseline[key] ?? "—"} → {trait.value} · {trait.basis === "documented" ? (it ? "Descritto dalla fonte" : "Described by source") : (it ? "Interpretazione" : "Inferred")}<blockquote>{trait.excerpt}</blockquote><a href={trait.source_url} target="_blank" rel="noopener noreferrer">{it ? "Verifica fonte ↗" : "Verify source ↗"}</a></dd></div>)}</dl>
          {result.aromas.length > 0 && <p>{it ? "Aromi descritti" : "Described aromas"}: {result.aromas.map(aroma => aroma.name).join(", ")}</p>}
        </details>}
        <ul>{result.sources.map(source => <li key={source.url}><a href={source.url} target="_blank" rel="noopener noreferrer">{source.title || source.url} ↗</a></li>)}</ul>
        {result.status === "ready" && <button type="button" className="secondary compact" disabled={busy || running} onClick={() => void apply(result.wine_id)}>{it ? "Usa questo profilo" : "Apply this profile"}</button>}
      </article>)}</div>
    </>}
  </section>;
}
