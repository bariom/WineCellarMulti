import { useEffect, useState } from "react";
import type { Locale, SensoryRefinementRun, SensoryProfileBaseline, WineSensoryBatchPreview, WineSensoryProfile, WineSensoryProfileSummary } from "../types";
import { ApiError, api } from "../services/api";
import SensoryReferencesPanel from "./SensoryReferencesPanel";
import SensoryWineReview from "./SensoryWineReview";

const dimensions = ["body", "acidity", "tannin", "sweetness", "aromatic_intensity", "fruit", "wood", "spice", "minerality"];
const emptyBaseline: Omit<SensoryProfileBaseline, "id"> = { entity_type: "grape", entity_key: "", dimensions: {}, confidence: 0.5, is_active: true };
type BatchResult = { processed: number; resolved: number; ai_generated: number; skipped: number };
type ApprovalResult = { approved: number };
type MetadataEnrichmentResult = WineSensoryProfile & { metadata_updated: string[]; estimated_cost_usd: string };

export function AdminSensoryProfilesPanel({ locale }: { locale: Locale }) {
  const italian = locale === "it";
  const words: Record<string, string> = italian ? { profiles: "Con profilo", missing: "Senza profilo", metadata: "Da metadati", validated: "Validati manualmente", low_confidence: "Bassa confidenza", body: "Corpo", acidity: "Acidità", tannin: "Tannini", sweetness: "Dolcezza", aromatic_intensity: "Intensità aromatica", fruit: "Frutto", wood: "Legno", spice: "Spezie", minerality: "Mineralità", grape: "Uva", appellation: "Denominazione", region: "Regione", wine_type: "Tipologia", hybrid: "Ibrido", manual: "Manuale" } : {};
  const label = (key: string) => words[key] || key.replace(/_/g, " ");
  const [summary, setSummary] = useState<WineSensoryProfileSummary | null>(null);
  const [profiles, setProfiles] = useState<WineSensoryProfile[]>([]);
  const [baselines, setBaselines] = useState<SensoryProfileBaseline[]>([]);
  const [editing, setEditing] = useState<WineSensoryProfile | null>(null);
  const [baselineDraft, setBaselineDraft] = useState<Omit<SensoryProfileBaseline, "id">>(emptyBaseline);
  const [editingBaseline, setEditingBaseline] = useState<SensoryProfileBaseline | null>(null);
  const [preview, setPreview] = useState<WineSensoryBatchPreview | null>(null);
  const [batchResult, setBatchResult] = useState<BatchResult | null>(null);
  const [approvalResult, setApprovalResult] = useState<ApprovalResult | null>(null);
  const [batchError, setBatchError] = useState("");
  const [previewLoading, setPreviewLoading] = useState(false);
  const [filter, setFilter] = useState({ search: "", source: "", validated: "", low_confidence: false, missing: false, wine_type: "", region: "", appellation: "", grape: "", producer: "" });
  const [busy, setBusy] = useState(false);
  const [rowFeedback, setRowFeedback] = useState<{ id: string; message: string; error: boolean } | null>(null);

  const [refinementId, setRefinementId] = useState<string | null>(() => localStorage.getItem("sensory-refinement-id"));
  const [refinementMessage, setRefinementMessage] = useState("");
  function clearRefinement() { localStorage.removeItem("sensory-refinement-id"); setRefinementId(null); setRefinementMessage(""); }

  const [offset, setOffset] = useState(0);
  const [hasNext, setHasNext] = useState(false);
  const [loading, setLoading] = useState(false);

  async function load(nextOffset = offset) {
    setLoading(true);
    try {
    const query = new URLSearchParams({ limit: "31", offset: String(nextOffset) });
    for (const [key, value] of Object.entries(filter)) if (typeof value === "string" ? value.trim() : value) query.set(key, String(value).trim());
    const [nextSummary, nextProfiles, nextBaselines] = await Promise.all([api<WineSensoryProfileSummary>("/api/v1/taste-profile/admin/summary"), api<WineSensoryProfile[]>(`/api/v1/taste-profile/admin/profiles?${query}`), api<SensoryProfileBaseline[]>("/api/v1/taste-profile/admin/baselines")]);
    setSummary(nextSummary); setProfiles(nextProfiles.slice(0, 30)); setHasNext(nextProfiles.length > 30); setOffset(nextOffset); setBaselines(nextBaselines);
    } catch (error) { setBatchError(errorMessage(error, italian ? "Impossibile caricare i profili." : "Unable to load profiles.")); }
    finally { setLoading(false); }
  }
  useEffect(() => { void load(); }, []);
  useEffect(() => {
    if (!refinementId) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    setBusy(true);
    async function poll() {
      try {
        const run = await api<SensoryRefinementRun>(`/api/v1/taste-profile/admin/refinements/${refinementId}`);
        if (cancelled) return;
        if (run.status === "queued" || run.status === "running") {
          setRefinementMessage(italian ? `Analisi Astra in corso per ${run.name}. Puoi aggiornare la pagina: la ricerca continua.` : `Astra research is running for ${run.name}. You can refresh the page: research continues.`);
          timer = setTimeout(() => void poll(), 2000);
          return;
        }
        setBusy(false); setRefinementMessage("");
        if (run.status === "completed" && run.proposal) {
          setEditing({ ...run.proposal, name: run.name, producer: run.producer, vintage: run.vintage });
          setRowFeedback({ id: run.identity_id, message: `${italian ? "Approfondimento completato. Stime da verificare" : "Research completed. Estimates need review"} - ${run.proposal.model || "AI"} - $${run.proposal.estimated_cost_usd || "0"}`, error: false });
        } else {
          const messages: Record<string, string> = italian ? {
            no_usable_evidence: "Nessun riscontro utilizzabile trovato. Il profilo resta invariato.",
            profile_changed: "Il vino o il profilo sono cambiati durante la ricerca. Ripeti l'analisi.",
            interrupted: "La ricerca si e interrotta. Puoi avviarne una nuova.",
            session_expired: "La sessione non e piu autorizzata. Accedi di nuovo.",
            insufficient_credits: "Crediti insufficienti per completare l'analisi.",
          } : {};
          clearRefinement();
          setBatchError(messages[run.issue] || (italian ? "Analisi non completata. Il profilo resta invariato." : "Research failed. The profile is unchanged."));
        }
      } catch (error) {
        if (cancelled) return;
        if (error instanceof ApiError && error.status >= 400 && error.status < 500) {
          clearRefinement(); setBusy(false);
          setBatchError(errorMessage(error, italian ? "Analisi non recuperabile." : "Unable to retrieve research."));
        } else {
          setRefinementMessage(italian ? "Connessione interrotta: riconnessione all'analisi in corso, senza avviare una nuova ricerca." : "Connection interrupted: reconnecting to the current research without starting another search.");
          timer = setTimeout(() => void poll(), 5000);
        }
      }
    }
    void poll();
    return () => { cancelled = true; clearTimeout(timer); };
  }, [refinementId, italian]);
  const editDimension = <T extends { dimensions: Record<string, number | null> }>(dimension: string, value: string, target: T): T => ({ ...target, dimensions: { ...target.dimensions, [dimension]: value === "" ? null : Number(value) } });
  const errorMessage = (error: unknown, fallback: string) => error instanceof Error && error.message ? error.message : fallback;

  async function previewBatch() {
    setPreviewLoading(true); setBatchError(""); setBatchResult(null);
    try { setPreview(await api<WineSensoryBatchPreview>("/api/v1/taste-profile/admin/batch-preview", { method: "POST" })); }
    catch (error) { setPreview(null); setBatchError(errorMessage(error, italian ? "Impossibile calcolare l’anteprima." : "Unable to calculate the preview.")); }
    finally { setPreviewLoading(false); }
  }
  async function enrich() {
    setBusy(true); setBatchError(""); setPreview(null);
    try { const result = await api<BatchResult>("/api/v1/taste-profile/admin/enrich-missing", { method: "POST", body: JSON.stringify({ limit: 50, allow_ai: true }) }); setBatchResult(result); await load(); }
    catch (error) { setBatchResult(null); setBatchError(errorMessage(error, italian ? "Impossibile generare i profili." : "Unable to generate profiles.")); }
    finally { setBusy(false); }
  }
  async function approvePendingProfiles() {
    if (!window.confirm(italian ? "Vuoi approvare tutti i profili disponibili ancora da validare?" : "Approve every available profile that is still awaiting validation?")) return;
    setBusy(true); setBatchError(""); setBatchResult(null); setApprovalResult(null);
    try {
      setApprovalResult(await api<ApprovalResult>("/api/v1/taste-profile/admin/profiles/approve-pending", { method: "POST" }));
      await load();
    } catch (error) {
      setBatchError(errorMessage(error, italian ? "Impossibile approvare i profili." : "Unable to approve the profiles."));
    } finally { setBusy(false); }
  }
  async function saveProfile() {
    if (!editing) return;
    setBusy(true); setBatchError("");
    try {
      await api(`/api/v1/taste-profile/admin/profiles/${editing.identity_id}`, { method: "PUT", body: JSON.stringify({ dimensions: editing.dimensions, validated: editing.validated, expected_baseline_revision: editing.is_proposal ? editing.baseline_revision : undefined }) });
      setEditing(null); clearRefinement(); await load();
    } catch (error) { setBatchError(errorMessage(error, italian ? "Impossibile salvare il profilo." : "Unable to save profile.")); }
    finally { setBusy(false); }
  }
  async function regenerate(profile: WineSensoryProfile, advanced = false) {
    if (advanced) {
      setBusy(true); setBatchError(""); setEditing(null);
      setRefinementMessage(italian ? "Avvio dell'analisi Astra..." : "Starting Astra research...");
      try {
        const run = await api<SensoryRefinementRun>(`/api/v1/taste-profile/admin/profiles/${profile.identity_id}/refinements`, { method: "POST" });
        localStorage.setItem("sensory-refinement-id", run.id); setRefinementId(run.id);
      } catch (error) {
        setBusy(false); setRefinementMessage("");
        setBatchError(errorMessage(error, italian ? "Impossibile avviare l'analisi." : "Unable to start research."));
      }
      return;
    }
    setBusy(true); setBatchError(""); setBatchResult(null);
    setRowFeedback({ id: profile.identity_id, message: italian ? "Generazione assistita da AI in corso…" : "AI-assisted generation in progress…", error: false });
    try {
      const result = await api<WineSensoryProfile>(`/api/v1/taste-profile/admin/profiles/${profile.identity_id}/regenerate?allow_ai=true`, { method: "POST" });
      if (result.generation_status !== "available") throw new Error(italian ? "Nessun profilo generato. Riprova con AI." : "No profile generated. Retry with AI.");
      setRowFeedback({ id: profile.identity_id, message: italian ? "Profilo generato." : "Profile generated.", error: false });
      await load();
    } catch (error) {
      setRowFeedback({ id: profile.identity_id, message: errorMessage(error, italian ? "Impossibile generare il profilo con AI." : "Unable to generate the profile with AI."), error: true });
    } finally { setBusy(false); }
  }
  async function completeMetadata(profile: WineSensoryProfile) {
    setBusy(true); setBatchError(""); setBatchResult(null);
    setRowFeedback({ id: profile.identity_id, message: italian ? "Ricerca dei dati verificati in corso…" : "Searching verified wine data…", error: false });
    try {
      const result = await api<MetadataEnrichmentResult>(`/api/v1/taste-profile/admin/profiles/${profile.identity_id}/complete-metadata`, { method: "POST" });
      const fieldLabels: Record<string, string> = italian
        ? { type: "tipologia", region: "regione", appellation: "denominazione", grapes: "vitigni" }
        : { type: "type", region: "region", appellation: "appellation", grapes: "grapes" };
      const fields = result.metadata_updated.map((field) => fieldLabels[field] || field).join(", ");
      setRowFeedback({ id: profile.identity_id, message: `${italian ? "Dati completati" : "Data completed"}: ${fields}. ${italian ? "Profilo da validare." : "Profile requires validation."} ${italian ? "Costo AI" : "AI cost"}: $${result.estimated_cost_usd}`, error: false });
      await load();
    } catch (error) {
      setRowFeedback({ id: profile.identity_id, message: errorMessage(error, italian ? "Impossibile completare i dati con AI." : "Unable to complete data with AI."), error: true });
    } finally { setBusy(false); }
  }
  async function saveBaseline() { const baseline = editingBaseline || baselineDraft; if (!baseline.entity_key.trim()) return; setBusy(true); try { await api(editingBaseline ? `/api/v1/taste-profile/admin/baselines/${editingBaseline.id}` : "/api/v1/taste-profile/admin/baselines", { method: editingBaseline ? "PUT" : "POST", body: JSON.stringify(baseline) }); setEditingBaseline(null); setBaselineDraft(emptyBaseline); await load(); } finally { setBusy(false); } }
  async function removeBaseline(baseline: SensoryProfileBaseline) { setBusy(true); try { await api(`/api/v1/taste-profile/admin/baselines/${baseline.id}`, { method: "DELETE" }); await load(); } finally { setBusy(false); } }

  const editor = editingBaseline || baselineDraft;
  const metric: Array<[string, number]> = summary ? [["profiles", summary.wines_with_profile], ["missing", summary.wines_without_profile], ["metadata", summary.inferred_from_metadata], ["AI", summary.generated_by_ai], ["validated", summary.manually_validated], ["low_confidence", summary.low_confidence]] : [];
  return <section className="settings-card settings-card-wide admin-sensory-profiles">
    <div className="settings-card-heading"><div><span>{italian ? "Dati condivisi" : "Shared data"}</span><h3>{italian ? "Profili sensoriali dei vini" : "Wine Sensory Profiles"}</h3></div><div className="member-actions"><button type="button" className="secondary compact" disabled={busy} onClick={() => void approvePendingProfiles()}>{italian ? "Approva tutti da validare" : "Approve all pending"}</button><button type="button" className="secondary compact" disabled={busy} onClick={() => void enrich()}>{busy ? (italian ? "Generazione in corso…" : "Generating…") : italian ? "Genera mancanti con AI" : "Generate missing with AI"}</button></div></div>
    <div className="detail-grid admin-sensory-summary">{metric.map(([key, value]) => <div className="detail-field" key={key}><span>{key === "AI" ? "AI" : label(key)}</span><strong>{value}</strong></div>)}</div>
    <SensoryReferencesPanel locale={locale} />
    <p>{summary?.research_enabled ? (italian ? "Ricerca sensoriale sperimentale attiva tramite configurazione. Valuta le fonti prima di applicare una proposta." : "Experimental sensory research is enabled through configuration. Review sources before applying a proposal.") : italian ? "La generazione ordinaria usa le baseline di denominazione, uvaggio, tipologia e regione. Le nuove ricerche sensoriali a pagamento sono sospese: non hanno ancora dimostrato un miglioramento dei profili. Le analisi precedenti restano consultabili e i profili validati conservano la tua revisione." : "Standard generation uses appellation, grape blend, type and region baselines. New paid sensory research is suspended: it has not yet demonstrated better profiles. Previous research remains accessible and validated profiles retain your review."}</p>
    <div className="inline-form admin-sensory-filters"><label><span>{italian ? "Cerca vino, produttore o annata" : "Search wine, producer or vintage"}</span><input type="search" value={filter.search} onChange={(event) => setFilter({ ...filter, search: event.target.value })} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); void load(0); } }} /></label><label><span>{italian ? "Fonte" : "Source"}</span><select value={filter.source} onChange={(event) => setFilter({ ...filter, source: event.target.value })}><option value="">{italian ? "Tutte" : "All"}</option><option value="metadata">{italian ? "Metadati" : "Metadata"}</option><option value="hybrid">{label("hybrid")}</option><option value="ai">AI</option><option value="manual">{label("manual")}</option></select></label><label><span>{italian ? "Validazione" : "Validation"}</span><select value={filter.validated} onChange={(event) => setFilter({ ...filter, validated: event.target.value })}><option value="">{italian ? "Tutte" : "All"}</option><option value="true">{italian ? "Validati" : "Validated"}</option><option value="false">{italian ? "Non validati" : "Unvalidated"}</option></select></label><label className="admin-sensory-toggle"><input type="checkbox" checked={filter.low_confidence} onChange={(event) => setFilter({ ...filter, low_confidence: event.target.checked })} /><span>{italian ? "Bassa confidenza" : "Low confidence"}</span></label><label className="admin-sensory-toggle"><input type="checkbox" checked={filter.missing} onChange={(event) => setFilter({ ...filter, missing: event.target.checked })} /><span>{italian ? "Senza profilo" : "Missing profile"}</span></label>{([['wine_type', italian ? 'Tipologia' : 'Type'], ['region', italian ? 'Regione' : 'Region'], ['appellation', italian ? 'Denominazione' : 'Appellation'], ['grape', italian ? 'Uva' : 'Grape'], ['producer', italian ? 'Produttore' : 'Producer']] as const).map(([key, name]) => <label key={key}><span>{name}</span><input value={filter[key]} onChange={(event) => setFilter({ ...filter, [key]: event.target.value })} /></label>)}<button type="button" className="secondary compact" disabled={loading} onClick={() => void load(0)}>{italian ? "Applica filtri" : "Apply filters"}</button></div>
    <section className="admin-sensory-batch" aria-labelledby="sensory-batch-title"><div><span>{italian ? "Generazione assistita" : "Assisted generation"}</span><h4 id="sensory-batch-title">{italian ? "Controlla prima la copertura" : "Check coverage first"}</h4><p id="sensory-batch-help">{italian ? "L’anteprima non modifica nulla: indica quali vini possono ricevere un profilo dai metadati già presenti." : "The preview changes nothing: it shows which wines can receive a profile from their current metadata."}</p></div><button type="button" className="secondary compact" disabled={busy || previewLoading} aria-describedby="sensory-batch-help" onClick={() => void previewBatch()}>{previewLoading ? (italian ? "Calcolo in corso…" : "Calculating…") : italian ? "Mostra anteprima" : "Show preview"}</button></section>
    {preview ? <div className="admin-sensory-feedback admin-sensory-feedback-preview" role="status" aria-live="polite"><strong>{italian ? "Esito dell’anteprima" : "Preview result"}</strong><div className="admin-sensory-feedback-values"><span><b>{preview.missing}</b>{italian ? " senza profilo" : " without a profile"}</span><span><b>{preview.deterministic}</b>{italian ? " generabili ora" : " can be generated now"}</span><span><b>{preview.requires_ai}</b>{italian ? " richiedono AI" : " require AI"}</span></div><p>{preview.missing ? (italian ? "Genera mancanti con AI completa i metadati quando necessario, poi calcola il profilo." : "Generate missing with AI completes metadata when needed, then calculates the profile.") : (italian ? "Non ci sono profili mancanti da generare." : "There are no missing profiles to generate.")}</p></div> : null}
    {batchResult ? <div className="admin-sensory-feedback admin-sensory-feedback-success" role="status" aria-live="polite"><strong>{italian ? "Generazione completata" : "Generation completed"}</strong><div className="admin-sensory-feedback-values"><span><b>{batchResult.processed}</b>{italian ? " esaminati" : " reviewed"}</span><span><b>{batchResult.resolved}</b>{italian ? " profili creati" : " profiles created"}</span><span><b>{batchResult.skipped}</b>{italian ? " saltati" : " skipped"}</span></div><p>{batchResult.processed === 50 ? (italian ? "Ogni esecuzione elabora al massimo 50 vini. Se restano profili mancanti, ripeti l’azione." : "Each run processes up to 50 wines. Repeat the action if profiles are still missing.") : (italian ? "I contatori in alto sono stati aggiornati." : "The counters above have been updated.")}</p></div> : null}
    {approvalResult ? <div className="admin-sensory-feedback admin-sensory-feedback-success" role="status" aria-live="polite"><strong>{italian ? "Approvazione completata" : "Approval completed"}</strong><p>{approvalResult.approved ? (italian ? `${approvalResult.approved} profili approvati.` : `${approvalResult.approved} profiles approved.`) : (italian ? "Non ci sono profili da approvare." : "There are no profiles to approve.")}</p></div> : null}
    {refinementMessage ? <p role="status" aria-live="polite">{refinementMessage}</p> : null}
    {batchError ? <div className="admin-sensory-feedback admin-sensory-feedback-error" role="alert">{batchError}</div> : null}
    <details className="settings-help-panel admin-sensory-profile-list"><summary>{italian ? "Profili vino" : "Wine profiles"} ({profiles.length})</summary><div className="member-list">{profiles.map((profile) => <div className="member-row" key={profile.identity_id}><div><strong>{[profile.producer, profile.name, profile.vintage].filter(Boolean).join(" · ")}</strong><span>{profile.source === "metadata" && italian ? "metadati" : label(profile.source)} · {Math.round(profile.confidence * 100)}% · {profile.validated ? (italian ? "validato" : "validated") : (italian ? "da validare" : "unvalidated")}</span></div><div className="member-actions"><button type="button" className="secondary compact" disabled={busy} onClick={() => setEditing({ ...profile, dimensions: { ...profile.dimensions } })}>{italian ? "Modifica" : "Edit"}</button><button type="button" className="secondary compact" disabled={busy} title={italian ? "Cerca dati verificati mancanti e ricalcola il profilo; il risultato torna da validare." : "Find missing verified data and recalculate the profile; the result requires validation."} onClick={() => void completeMetadata(profile)}>{italian ? "Completa dati con AI" : "Complete data with AI"}</button><button type="button" className="secondary compact" disabled={busy || profile.validated} title={italian ? "Completa i metadati mancanti con AI e genera il profilo" : "Complete missing metadata with AI and generate the profile"} onClick={() => void regenerate(profile)}>{italian ? "Genera profilo con AI" : "Generate profile with AI"}</button>{summary?.research_enabled ? <button type="button" className="secondary compact" disabled={busy} onClick={() => void regenerate(profile, true)}>{italian ? "Approfondisci con Astra" : "Research with Astra"}</button> : null}{rowFeedback?.id === profile.identity_id ? <p role={rowFeedback.error ? "alert" : "status"}>{rowFeedback.message}</p> : null}</div><SensoryWineReview identityId={profile.identity_id} locale={locale} /></div>)}</div>
    <div className="member-actions" aria-label={italian ? "Pagine dei profili" : "Profile pages"}><button type="button" className="secondary compact" disabled={loading || busy || offset === 0} onClick={() => void load(Math.max(0, offset - 30))}>{italian ? "Precedenti" : "Previous"}</button><span>{italian ? "Pagina" : "Page"} {Math.floor(offset / 30) + 1}</span><button type="button" className="secondary compact" disabled={loading || busy || !hasNext} onClick={() => void load(offset + 30)}>{italian ? "Successivi" : "Next"}</button></div>{profiles.length === 0 ? <p className="empty-state">{italian ? "Nessun profilo corrisponde ai filtri selezionati." : "No profiles match the selected filters."}</p> : null}</details>
    {editing ? <div className="settings-help-panel"><strong>{editing.name}</strong>{editing.is_proposal ? <p role="status">{italian ? "Proposta di analisi: il profilo attuale resta invariato. Applica solo dopo aver esaminato il confronto e le fonti; i valori applicati saranno una revisione manuale." : "Research proposal: the current profile is unchanged. Apply only after reviewing the comparison and sources; applied values become a manual revision."}</p> : null}{Object.entries(editing.provenance ?? {}).filter(([, item]) => item.calculation_method === "contextual_research_v1").map(([key, item]) => <details key={key}><summary>{label(key)} · {italian ? "Stima da ricerca" : "Research estimate"}: {editing.is_proposal ? `${editing.baseline_dimensions?.[key]?.toFixed(2) ?? "-"} -> ` : ""}{item.value?.toFixed(2)} ({item.lower?.toFixed(2)}–{item.upper?.toFixed(2)})</summary><p>{italian ? "Intervallo interpretativo, non una misura di accuratezza." : "Interpretative range, not an accuracy measurement."}</p><p>{item.rationale}</p>{item.evidence?.map((proof, index) => <div key={index}><blockquote>{proof.excerpt}</blockquote><a href={proof.source_url} target="_blank" rel="noopener noreferrer">{proof.publisher} ↗</a></div>)}</details>)}<div className="detail-grid">{dimensions.map((dimension) => <label key={dimension}><span>{label(dimension)}</span><input type="number" min="0" max="1" step="0.05" value={editing.dimensions[dimension] ?? ""} onChange={(event) => setEditing(editDimension(dimension, event.target.value, editing))} /></label>)}</div><label className="admin-sensory-toggle"><input type="checkbox" checked={editing.validated} onChange={(event) => setEditing({ ...editing, validated: event.target.checked })} /><span>{italian ? "Validato" : "Validated"}</span></label><div className="form-actions"><button type="button" disabled={busy} onClick={() => void saveProfile()}>{editing.is_proposal ? (italian ? "Applica proposta" : "Apply proposal") : (italian ? "Salva" : "Save")}</button><button type="button" className="secondary" onClick={() => { setEditing(null); clearRefinement(); }}>{editing.is_proposal ? (italian ? "Scarta proposta" : "Discard proposal") : (italian ? "Annulla" : "Cancel")}</button></div></div> : null}
    <details className="settings-help-panel"><summary>{italian ? "Baseline sensoriali" : "Sensory baselines"}</summary><div className="inline-form admin-sensory-baseline-form"><label><span>{italian ? "Tipo baseline" : "Baseline type"}</span><select value={editor.entity_type} onChange={(event) => editingBaseline ? setEditingBaseline({ ...editingBaseline, entity_type: event.target.value }) : setBaselineDraft({ ...baselineDraft, entity_type: event.target.value })}><option value="grape">{label("grape")}</option><option value="appellation">{label("appellation")}</option><option value="region">{label("region")}</option><option value="wine_type">{label("wine_type")}</option></select></label><label><span>{italian ? "Chiave" : "Key"}</span><input value={editor.entity_key} onChange={(event) => editingBaseline ? setEditingBaseline({ ...editingBaseline, entity_key: event.target.value }) : setBaselineDraft({ ...baselineDraft, entity_key: event.target.value })} /></label><label><span>{italian ? "Confidenza" : "Confidence"}</span><input type="number" min="0" max="1" step="0.05" value={editor.confidence} onChange={(event) => editingBaseline ? setEditingBaseline({ ...editingBaseline, confidence: Number(event.target.value) }) : setBaselineDraft({ ...baselineDraft, confidence: Number(event.target.value) })} /></label><button type="button" disabled={busy} onClick={() => void saveBaseline()}>{editingBaseline ? (italian ? "Salva baseline" : "Save baseline") : (italian ? "Aggiungi baseline" : "Add baseline")}</button></div><div className="detail-grid">{dimensions.map((dimension) => <label key={dimension}><span>{label(dimension)}</span><input type="number" min="0" max="1" step="0.05" value={editor.dimensions[dimension] ?? ""} onChange={(event) => editingBaseline ? setEditingBaseline(editDimension(dimension, event.target.value, editingBaseline)) : setBaselineDraft(editDimension(dimension, event.target.value, baselineDraft))} /></label>)}</div><div className="member-list">{baselines.map((baseline) => <div className="member-row" key={baseline.id}><div><strong>{label(baseline.entity_type)}: {baseline.entity_key}</strong><span>{Math.round(baseline.confidence * 100)}%</span></div><div className="member-actions"><button type="button" className="secondary compact" onClick={() => setEditingBaseline({ ...baseline, dimensions: { ...baseline.dimensions } })}>{italian ? "Modifica" : "Edit"}</button><button type="button" className="danger compact" disabled={busy} onClick={() => void removeBaseline(baseline)}>{italian ? "Elimina" : "Delete"}</button></div></div>)}</div></details>
  </section>;
}

export default AdminSensoryProfilesPanel;
