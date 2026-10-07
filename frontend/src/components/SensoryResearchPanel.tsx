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
  const origins: Record<string, string> = it
    ? { corroborated: "Riscontri indipendenti", single_source: "Fonte singola", wine_style: "Stima dallo stile", similar_wines: "Stima da vini simili", ai_inference: "Inferenza del modello", unknown: "Non determinabile" }
    : { corroborated: "Independent corroboration", single_source: "Single source", wine_style: "Style estimate", similar_wines: "Similar wine estimate", ai_inference: "Model inference", unknown: "Undetermined" };
  const shortOrigins: Record<string, string> = it
    ? { corroborated: "Riscontri", single_source: "1 fonte", wine_style: "Stile", similar_wines: "Simili", ai_inference: "Inferenza", unknown: "" }
    : { corroborated: "Sources", single_source: "1 source", wine_style: "Style", similar_wines: "Similar", ai_inference: "Inference", unknown: "" };
  const issues: Record<string, string> = it
    ? { source_unreadable: "Fonte non leggibile dal server", missing_evidence: "Prove mancanti", conflicting_sources: "Fonti discordanti", reference_disagreement: "Riferimenti troppo discordanti", unverified_excerpt: "Citazione non verificabile sulla pagina della fonte", unsupported_intensity: "La descrizione non sostiene l'intensità", historical_or_distant_vintage: "Fonte storica o annata troppo distante" }
    : { source_unreadable: "Source could not be read by the server", missing_evidence: "Missing evidence", conflicting_sources: "Conflicting sources", reference_disagreement: "Reference wines disagree", unverified_excerpt: "Quotation could not be verified on the source page", unsupported_intensity: "Description does not support intensity", historical_or_distant_vintage: "Historical source or distant vintage" };
  const inferenceBases: Record<string, string> = it
    ? { verified_description: "Stima da descrizioni qualitative verificate; intensità inferita.", mixed_sources: "Stima con descrizioni verificate e informazioni non verificate.", unverified_source: "Stima con informazioni da fonti non verificate.", model_knowledge: "Stima da conoscenza generale del modello e ipotesi sullo stile." }
    : { verified_description: "Estimate from verified qualitative descriptions; intensity inferred.", mixed_sources: "Estimate using verified descriptions and unverified information.", unverified_source: "Estimate using information from unverified sources.", model_knowledge: "Estimate from general model knowledge and style assumptions." };
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
    <p>{it ? "Confronta schede del produttore e fonti esterne per tutti i vini della cantina, anche con profili manuali o validati. I valori precedenti servono al confronto e non guidano la ricerca dell'agente." : "Compare producer sheets and external sources for all cellar wines, including manual and validated profiles. Previous values are compared but do not guide the agent's research."}</p>
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
        <p className="muted">{it ? "Sono inclusi anche i profili manuali e validati. Il filtro non modifica i vini già selezionati." : "Manual and validated profiles are included. Filtering preserves your selected wines."}</p>
      </fieldset>}
      <button type="submit" className="secondary compact" disabled={busy || running || (manual && (!selectedIds.length || loadingCandidates || !!candidateError))}>{running ? (it ? "Ricerca in corso…" : "Researching…") : (it ? "Avvia ricerca autonoma" : "Start autonomous research")}</button>
    </form>
    <p className="muted">{it ? "Massimo 20 vini e 10 consultazioni web per vino, entro il budget. Dopo la verifica delle fonti, l'agente cerca alternative e completa le lacune con inferenze motivate e intervalli di incertezza. I profili validati e manuali restano conservati." : "Up to 20 wines and 10 web tool calls per wine, within budget. After source verification, the agent seeks alternatives and fills gaps with explained inferences and uncertainty ranges. Validated and manual profiles are preserved."}</p>
    {error && <p role="alert">{error}</p>}
    {run && <>
      <p role="status">{labels[run.status] || run.status} · {run.results.length}/{run.selected_wines} {it ? "vini valutati" : "wines reviewed"}{skipped > 0 ? ` · ${skipped} ${it ? (skipped === 1 ? "saltato" : "saltati") : "skipped"}` : ""} · ${run.cost_usd}</p>
      {run.selected_wines < run.max_wines && <p>{it ? `Selezionati ${run.selected_wines} vini da valutare, su un massimo di ${run.max_wines}. Ogni identità vino viene analizzata una sola volta.` : `Selected ${run.selected_wines} wines to review, with a maximum of ${run.max_wines}. Each wine identity is researched once.`}</p>}
      {run.issue && <p>{run.issue === "budget_limit" ? (it ? "Budget residuo insufficiente per un’altra ricerca." : "Remaining budget is insufficient for another search.") : (it ? "La ricerca si è interrotta. Le proposte già completate restano disponibili." : "Research stopped. Completed proposals remain available.")}</p>}
      <div className="sensory-research-results">{run.results.map(result => <article key={result.wine_id}>
        <h5>{result.name}</h5><p>{result.producer}</p>
        <p>{it ? "Annata richiesta" : "Requested vintage"}: {result.vintage.trim() || (it ? "Mancante nella scheda vino" : "Missing from wine details")}</p>
        <strong>{labels[result.status] || result.status}</strong>
        {result.coverage && Object.keys(result.coverage).length > 0 && <p className="sensory-research-coverage">{it ? "Completezza" : "Completeness"}: {result.coverage.available}/{result.coverage.total} · {result.coverage.exact_vintage} {it ? "tratti dell'annata" : "vintage traits"} · {result.coverage.corroborated} {it ? "con riscontri indipendenti" : "independently corroborated"} · {result.coverage.estimated} {it ? "stimati" : "estimated"} · {result.coverage.unknown} {it ? "non determinabili" : "undetermined"}</p>}
        {["4", "5", "6", "7"].includes(result.prompt_version) && <p>{it ? "Un profilo completo può contenere stime: completezza e affidabilità sono distinte. I punteggi descrivono il sostegno delle prove, non una probabilità misurata di correttezza." : "A complete profile may contain estimates: completeness and reliability are distinct. Scores describe evidence support, not measured accuracy."}</p>}
        {["6", "7"].includes(result.prompt_version) && <p>{it ? "Verifica documentale" : "Document verification"}: {Object.values(result.source_checks ?? {}).reduce((total, check) => total + check.matched_excerpts, 0)} {it ? "citazioni verificate" : "verified quotations"}{result.coverage?.qualitative != null ? ` · ${result.coverage.qualitative}/9 ${it ? "tratti con descrizioni qualitative" : "traits with qualitative descriptions"}` : ""}. {it ? "Le citazioni non misurano le intensità numeriche." : "Quotations do not measure numeric intensities."}</p>}
        {!!result.coverage?.inferred && <p>{it ? `${result.coverage.inferred} tratti sono inferenze del modello, senza intensità verificata. Il profilo è utilizzabile come stima del vino atteso e resta non validato.` : `${result.coverage.inferred} traits are model inferences without verified intensity. The profile can be used as an expected wine estimate and remains unvalidated.`}</p>}
        {Object.values(result.source_checks ?? {}).some(check => check.status !== "readable") && <p>{it ? "Alcune fonti non sono state leggibili dal server. La sintesi dell'agente può descriverle, ma non sono utilizzate come prove verificate." : "Some sources could not be read by the server. The agent's summary may describe them, but they are not used as verified evidence."}</p>}
        {result.prompt_version !== "6" && result.summary && <p>{result.summary}</p>}
        {result.prompt_version !== "6" && result.limitations && <p>{result.limitations}</p>}
        {(["6", "7"].includes(result.prompt_version) && (result.agent_summary || result.agent_limitations || (result.prompt_version === "6" && (result.summary || result.limitations)))) && <details>
          <summary>{it ? "Testo proposto dall'agente · non verificato" : "Agent draft text · unverified"}</summary>
          <p>{it ? "Le affermazioni di questo testo non confermano identità, annata o dati analitici: fanno fede le verifiche documentali e le citazioni controllate." : "Claims in this text do not confirm identity, vintage or analytical data: rely on documentary checks and verified quotations."}</p>
          <p>{result.agent_summary || result.summary}</p><p>{result.agent_limitations || result.limitations}</p>
        </details>}
        {result.issue === "missing_vintage" ? <p>{it ? "Ricerca non eseguita: inserisci l’annata nella scheda del vino e avvia una nuova ricerca." : "Research skipped: enter the vintage in wine details and start a new run."}</p> : <p>{result.vintage_confirmed ? (it ? "Annata con riscontro documentale verificato." : "Vintage has verified documentary support.") : ["6", "7"].includes(result.prompt_version) ? (it ? "Annata non verificata dalle fonti: le stime descrivono lo stile atteso, senza confermare le caratteristiche specifiche dell'annata." : "Vintage unverified by sources: estimates describe expected style without confirming vintage-specific characteristics.") : (it ? "Annata non verificata: proposta non applicabile." : "Vintage unverified: proposal cannot be applied.")}</p>}
        {result.identity_evidence && <details><summary>{it ? "Riscontro sull'identità del vino" : "Wine identity evidence"}</summary><blockquote>{result.identity_evidence.excerpt}</blockquote><a href={result.identity_evidence.source_url} target="_blank" rel="noopener noreferrer">{it ? "Verifica identità ↗" : "Verify identity ↗"}</a></details>}
        {result.identity_ambiguous && <p>{it ? "Identità del vino ambigua: profilo provvisorio, non applicabile finché la cuvée non è chiarita." : "Wine identity ambiguous: provisional profile cannot be applied until the cuvée is clarified."}</p>}
        {result.warnings?.some(warning => warning.startsWith("completion_")) && <p>{it ? "Il completamento non è riuscito o è stato fermato dal budget: resta disponibile la ricerca già effettuata." : "Completion failed or was stopped by the budget: the existing research remains available."}</p>}
        {(Object.keys(result.dimensions).length > 0 || Object.keys(result.baseline).length > 0 || Object.keys(result.complete_profile ?? {}).length > 0) && <details><summary>{it ? "Confronto e prove" : "Comparison and evidence"}</summary>
          <p>{it ? "Profilo precedente" : "Previous profile"}: {result.baseline_source || (it ? "origine non registrata" : "origin not recorded")} · {result.baseline_validated ? (it ? "validato" : "validated") : (it ? "non validato" : "unvalidated")}{result.baseline_confidence != null && ` · ${it ? "punteggio interno" : "internal score"}: ${Math.round(result.baseline_confidence * 100)}%`}</p>
          <p>{it ? "Gli scostamenti mostrano differenze, non errori accertati: nessuno dei due profili è un riferimento di accuratezza. Un trattino indica un valore non disponibile." : "Differences are not proven errors: neither profile is an accuracy reference. A dash means the value is unavailable."}</p>
          <table className="sensory-research-comparison"><caption>{it ? "Valori precedenti e proposta dell'agente (0–1)" : "Previous values and agent proposal (0–1)"}</caption><thead><tr><th scope="col">{it ? "Caratteristica" : "Trait"}</th><th scope="col">{it ? "Prima" : "Before"}</th><th scope="col">{it ? "Agente" : "Agent"}</th><th scope="col">{it ? "Scarto" : "Change"}</th></tr></thead><tbody>{Object.keys(traitsIt).map(key => {
            const before = result.baseline[key];
            const after = Object.keys(result.complete_profile ?? {}).length > 0 ? result.complete_profile?.[key]?.value : result.dimensions[key]?.value;
            const difference = before != null && after != null ? Math.round((after - before) * 100) / 100 : null;
            return <tr key={key}><th scope="row">{it ? traitsIt[key] : key.replace(/_/g, " ")}</th><td>{before != null ? before.toFixed(2) : "—"}</td><td>{after != null ? after.toFixed(2) : "—"}{result.complete_profile?.[key] && <small className="sensory-research-origin">{shortOrigins[result.complete_profile[key].origin]}</small>}</td><td>{difference != null ? `${difference > 0 ? "+" : ""}${difference.toFixed(2)}` : "—"}</td></tr>;
          })}</tbody></table>
          <p>{it ? "Valori stimati su scala 0–1. Sostegno delle intensità numeriche (non accuratezza misurata)" : "Estimated values on a 0–1 scale. Numeric intensity support (not measured accuracy)"}: {Math.round(result.confidence * 100)}%</p>
          <dl>{Object.entries(result.dimensions).map(([key, trait]) => <div key={key}><dt>{it ? traitsIt[key] || key : key.replace(/_/g, " ")}</dt><dd>{result.baseline[key] ?? "—"} → {trait.value} · {trait.basis === "documented" ? (it ? "Descritto dalla fonte" : "Described by source") : (it ? "Interpretazione" : "Inferred")}<blockquote>{trait.excerpt}</blockquote><a href={trait.source_url} target="_blank" rel="noopener noreferrer">{it ? "Verifica fonte ↗" : "Verify source ↗"}</a></dd></div>)}</dl>
          {result.comparisons?.map(comparison => <div key={comparison.dimension}>
            <strong>{it ? traitsIt[comparison.dimension] || comparison.dimension : comparison.dimension.replace(/_/g, " ")} · {comparison.agreement === "corroborated" ? (it ? "Fonti concordanti" : "Corroborated sources") : comparison.agreement === "conflicting" ? (it ? "Fonti discordanti" : "Conflicting sources") : (it ? "Prova singola" : "Single source")}</strong>
            <p>{it ? "Interpretazione proposta dall'agente" : "Interpretation proposed by the agent"}: {comparison.explanation}</p>
            {comparison.evidence.map(evidence => <div key={evidence.source_url}><blockquote>{evidence.excerpt}</blockquote><a href={evidence.source_url} target="_blank" rel="noopener noreferrer">{it ? "Confronta fonte ↗" : "Compare source ↗"}</a></div>)}
          </div>)}
          {result.aromas.length > 0 && <p>{it ? "Aromi descritti" : "Described aromas"}: {result.aromas.map(aroma => aroma.name).join(", ")}</p>}
          {result.complete_profile && <dl>{Object.entries(result.complete_profile).map(([key, dimension]) => <div key={key}>
            <dt>{it ? traitsIt[key] || key : key.replace(/_/g, " ")} · {origins[dimension.origin]}</dt>
            <dd>{dimension.value != null ? `${dimension.value.toFixed(2)} · ${dimension.origin === "ai_inference" ? (it ? "intensità non verificata" : "unverified intensity") : `${it ? "Sostegno delle prove" : "Evidence support"}: ${Math.round(dimension.confidence * 100)}%`}` : (issues[dimension.issue] || (it ? "Prove insufficienti" : "Insufficient evidence"))}
              {dimension.origin === "ai_inference" && <>
                <p>{dimension.inference_basis ? inferenceBases[dimension.inference_basis] : (it ? "La base dell'inferenza non è registrata separatamente in questo rapporto." : "The inference basis was not recorded separately in this report.")}</p>
                <details><summary>{it ? "Motivazione proposta dall'agente · non verificata" : "Agent rationale · unverified"}</summary><p>{dimension.rationale}</p></details>
                {dimension.lower != null && dimension.upper != null && <p>{it ? "Intervallo plausibile" : "Plausible range"}: {dimension.lower.toFixed(2)}–{dimension.upper.toFixed(2)} · {it ? "non è un intervallo statistico calibrato" : "not a calibrated statistical interval"}</p>}
                {dimension.issue && <p>{issues[dimension.issue] || dimension.issue}</p>}
              </>}
              {!!dimension.unverified_evidence?.length && <div className="sensory-research-unverified"><strong>{it ? "Informazioni non verificate: non sono prove" : "Unverified information: not evidence"}</strong>{dimension.unverified_evidence.map((evidence, index) => <div key={index}><blockquote>{evidence.excerpt}</blockquote><p>{evidence.publisher}</p><a href={evidence.source_url} target="_blank" rel="noopener noreferrer">{it ? "Apri fonte non verificata ↗" : "Open unverified source ↗"}</a></div>)}</div>}
              {dimension.references.map(reference => <div key={`${reference.producer}-${reference.name}-${reference.vintage}`}>
                <p>{reference.name} · {reference.producer} · {reference.vintage || (it ? "stile generale" : "general style")} · {reference.value.toFixed(2)}</p>
                {reference.identity_evidence && <a href={reference.identity_evidence.source_url} target="_blank" rel="noopener noreferrer">{it ? "Verifica identità del riferimento ↗" : "Verify reference identity ↗"}</a>}
                {!!reference.production_evidence?.length && <details><summary>{it ? "Confronto dello stile produttivo" : "Production style comparison"}</summary>{reference.production_evidence.map((proof, index) => <div key={index}><blockquote>{proof.excerpt}</blockquote><a href={proof.source_url} target="_blank" rel="noopener noreferrer">{it ? "Verifica fonte ↗" : "Verify source ↗"}</a></div>)}</details>}
              </div>)}
              {dimension.evidence.map((evidence, index) => <div key={`${evidence.source_url}-${index}`}><blockquote>{evidence.excerpt}</blockquote><p>{evidence.publisher} · {evidence.vintage || (it ? "senza annata" : "no vintage")}{evidence.published_year ? ` · ${evidence.published_year}` : ""}</p><a href={evidence.source_url} target="_blank" rel="noopener noreferrer">{it ? "Verifica riferimento ↗" : "Verify reference ↗"}</a></div>)}
            </dd>
          </div>)}</dl>}
          {!!result.warnings?.length && <p>{it ? "Alcuni valori sono stati scartati perché le citazioni, l'intensità, l'annata o l'accordo tra fonti non erano verificabili o sufficientemente sostenuti." : "Some values were rejected because quotations, intensity, vintage or source agreement could not be verified or sufficiently supported."}</p>}
        </details>}
        <ul>{result.sources.map(source => {
          const check = result.source_checks?.[source.url];
          const sourceStatus = check?.status === "cloudflare_challenge"
            ? (it ? "Verifica anti-bot richiesta (Cloudflare)" : "Anti-bot verification required (Cloudflare)")
            : (it ? "Fonte non leggibile" : "Source unreadable");
          return <li key={source.url}><a href={source.url} target="_blank" rel="noopener noreferrer">{source.title || source.url} ↗</a>{check && <span> · {check.status === "readable" ? (it ? `Fonte letta: ${check.matched_excerpts} citazioni verificate, ${check.unmatched_excerpts} non corrispondenti` : `Source read: ${check.matched_excerpts} verified quotations, ${check.unmatched_excerpts} unmatched`) : sourceStatus}{check.http_status && check.http_status !== 200 ? ` (HTTP ${check.http_status})` : ""}</span>}</li>;
        })}</ul>
        {(result.baseline_validated || result.baseline_source === "manual") && <p>{it ? "Ricerca di confronto: il profilo precedente manuale o validato resta conservato." : "Comparison research: the previous manual or validated profile is preserved."}</p>}
        {result.status === "ready" && !result.baseline_validated && result.baseline_source !== "manual" && <button type="button" className="secondary compact" disabled={busy || running} onClick={() => void apply(result.wine_id)}>{it ? "Usa questo profilo" : "Apply this profile"}</button>}
      </article>)}</div>
    </>}
  </section>;
}
