import { useEffect, useState } from "react";
import type { Locale, SensoryProfileBaseline, WineSensoryBatchPreview, WineSensoryProfile, WineSensoryProfileSummary } from "../types";
import { api } from "../services/api";

const dimensions = ["body", "acidity", "tannin", "sweetness", "aromatic_intensity", "fruit", "wood", "spice", "minerality"];
const emptyBaseline: Omit<SensoryProfileBaseline, "id"> = { entity_type: "grape", entity_key: "", dimensions: {}, confidence: 0.5, is_active: true };
type BatchResult = { processed: number; resolved: number; ai_generated: number; skipped: number };
type ApprovalResult = { approved: number };

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
  const [filter, setFilter] = useState({ source: "", validated: "", low_confidence: false, missing: false, wine_type: "", region: "", appellation: "", grape: "", producer: "" });
  const [busy, setBusy] = useState(false);
  const [rowFeedback, setRowFeedback] = useState<{ id: string; message: string; error: boolean } | null>(null);

  async function load() {
    const query = new URLSearchParams({ limit: "30" });
    for (const [key, value] of Object.entries(filter)) if (typeof value === "string" ? value.trim() : value) query.set(key, String(value).trim());
    const [nextSummary, nextProfiles, nextBaselines] = await Promise.all([api<WineSensoryProfileSummary>("/api/v1/taste-profile/admin/summary"), api<WineSensoryProfile[]>(`/api/v1/taste-profile/admin/profiles?${query}`), api<SensoryProfileBaseline[]>("/api/v1/taste-profile/admin/baselines")]);
    setSummary(nextSummary); setProfiles(nextProfiles); setBaselines(nextBaselines);
  }
  useEffect(() => { void load(); }, []);
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
  async function saveProfile() { if (!editing) return; setBusy(true); try { await api(`/api/v1/taste-profile/admin/profiles/${editing.identity_id}`, { method: "PUT", body: JSON.stringify({ dimensions: editing.dimensions, validated: editing.validated }) }); setEditing(null); await load(); } finally { setBusy(false); } }
  async function regenerate(profile: WineSensoryProfile) {
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
  async function saveBaseline() { const baseline = editingBaseline || baselineDraft; if (!baseline.entity_key.trim()) return; setBusy(true); try { await api(editingBaseline ? `/api/v1/taste-profile/admin/baselines/${editingBaseline.id}` : "/api/v1/taste-profile/admin/baselines", { method: editingBaseline ? "PUT" : "POST", body: JSON.stringify(baseline) }); setEditingBaseline(null); setBaselineDraft(emptyBaseline); await load(); } finally { setBusy(false); } }
  async function removeBaseline(baseline: SensoryProfileBaseline) { setBusy(true); try { await api(`/api/v1/taste-profile/admin/baselines/${baseline.id}`, { method: "DELETE" }); await load(); } finally { setBusy(false); } }

  const editor = editingBaseline || baselineDraft;
  const metric: Array<[string, number]> = summary ? [["profiles", summary.wines_with_profile], ["missing", summary.wines_without_profile], ["metadata", summary.inferred_from_metadata], ["AI", summary.generated_by_ai], ["validated", summary.manually_validated], ["low_confidence", summary.low_confidence]] : [];
  return <section className="settings-card settings-card-wide admin-sensory-profiles">
    <div className="settings-card-heading"><div><span>{italian ? "Dati condivisi" : "Shared data"}</span><h3>{italian ? "Profili sensoriali dei vini" : "Wine Sensory Profiles"}</h3></div><div className="member-actions"><button type="button" className="secondary compact" disabled={busy} onClick={() => void approvePendingProfiles()}>{italian ? "Approva tutti da validare" : "Approve all pending"}</button><button type="button" className="secondary compact" disabled={busy} onClick={() => void enrich()}>{busy ? (italian ? "Generazione in corso…" : "Generating…") : italian ? "Genera mancanti con AI" : "Generate missing with AI"}</button></div></div>
    <div className="detail-grid admin-sensory-summary">{metric.map(([key, value]) => <div className="detail-field" key={key}><span>{key === "AI" ? "AI" : label(key)}</span><strong>{value}</strong></div>)}</div>
    <div className="inline-form admin-sensory-filters"><label><span>{italian ? "Fonte" : "Source"}</span><select value={filter.source} onChange={(event) => setFilter({ ...filter, source: event.target.value })}><option value="">{italian ? "Tutte" : "All"}</option><option value="metadata">{italian ? "Metadati" : "Metadata"}</option><option value="hybrid">{label("hybrid")}</option><option value="ai">AI</option><option value="manual">{label("manual")}</option></select></label><label><span>{italian ? "Validazione" : "Validation"}</span><select value={filter.validated} onChange={(event) => setFilter({ ...filter, validated: event.target.value })}><option value="">{italian ? "Tutte" : "All"}</option><option value="true">{italian ? "Validati" : "Validated"}</option><option value="false">{italian ? "Non validati" : "Unvalidated"}</option></select></label><label className="admin-sensory-toggle"><input type="checkbox" checked={filter.low_confidence} onChange={(event) => setFilter({ ...filter, low_confidence: event.target.checked })} /><span>{italian ? "Bassa confidenza" : "Low confidence"}</span></label><label className="admin-sensory-toggle"><input type="checkbox" checked={filter.missing} onChange={(event) => setFilter({ ...filter, missing: event.target.checked })} /><span>{italian ? "Senza profilo" : "Missing profile"}</span></label>{([['wine_type', italian ? 'Tipologia' : 'Type'], ['region', italian ? 'Regione' : 'Region'], ['appellation', italian ? 'Denominazione' : 'Appellation'], ['grape', italian ? 'Uva' : 'Grape'], ['producer', italian ? 'Produttore' : 'Producer']] as const).map(([key, name]) => <label key={key}><span>{name}</span><input value={filter[key]} onChange={(event) => setFilter({ ...filter, [key]: event.target.value })} /></label>)}<button type="button" className="secondary compact" onClick={() => void load()}>{italian ? "Applica filtri" : "Apply filters"}</button></div>
    <section className="admin-sensory-batch" aria-labelledby="sensory-batch-title"><div><span>{italian ? "Generazione assistita" : "Assisted generation"}</span><h4 id="sensory-batch-title">{italian ? "Controlla prima la copertura" : "Check coverage first"}</h4><p id="sensory-batch-help">{italian ? "L’anteprima non modifica nulla: indica quali vini possono ricevere un profilo dai metadati già presenti." : "The preview changes nothing: it shows which wines can receive a profile from their current metadata."}</p></div><button type="button" className="secondary compact" disabled={busy || previewLoading} aria-describedby="sensory-batch-help" onClick={() => void previewBatch()}>{previewLoading ? (italian ? "Calcolo in corso…" : "Calculating…") : italian ? "Mostra anteprima" : "Show preview"}</button></section>
    {preview ? <div className="admin-sensory-feedback admin-sensory-feedback-preview" role="status" aria-live="polite"><strong>{italian ? "Esito dell’anteprima" : "Preview result"}</strong><div className="admin-sensory-feedback-values"><span><b>{preview.missing}</b>{italian ? " senza profilo" : " without a profile"}</span><span><b>{preview.deterministic}</b>{italian ? " generabili ora" : " can be generated now"}</span><span><b>{preview.requires_ai}</b>{italian ? " richiedono AI" : " require AI"}</span></div><p>{preview.missing ? (italian ? "Genera mancanti con AI completa i metadati quando necessario, poi calcola il profilo." : "Generate missing with AI completes metadata when needed, then calculates the profile.") : (italian ? "Non ci sono profili mancanti da generare." : "There are no missing profiles to generate.")}</p></div> : null}
    {batchResult ? <div className="admin-sensory-feedback admin-sensory-feedback-success" role="status" aria-live="polite"><strong>{italian ? "Generazione completata" : "Generation completed"}</strong><div className="admin-sensory-feedback-values"><span><b>{batchResult.processed}</b>{italian ? " esaminati" : " reviewed"}</span><span><b>{batchResult.resolved}</b>{italian ? " profili creati" : " profiles created"}</span><span><b>{batchResult.skipped}</b>{italian ? " saltati" : " skipped"}</span></div><p>{batchResult.processed === 50 ? (italian ? "Ogni esecuzione elabora al massimo 50 vini. Se restano profili mancanti, ripeti l’azione." : "Each run processes up to 50 wines. Repeat the action if profiles are still missing.") : (italian ? "I contatori in alto sono stati aggiornati." : "The counters above have been updated.")}</p></div> : null}
    {approvalResult ? <div className="admin-sensory-feedback admin-sensory-feedback-success" role="status" aria-live="polite"><strong>{italian ? "Approvazione completata" : "Approval completed"}</strong><p>{approvalResult.approved ? (italian ? `${approvalResult.approved} profili approvati.` : `${approvalResult.approved} profiles approved.`) : (italian ? "Non ci sono profili da approvare." : "There are no profiles to approve.")}</p></div> : null}
    {batchError ? <div className="admin-sensory-feedback admin-sensory-feedback-error" role="alert">{batchError}</div> : null}
    <details className="settings-help-panel admin-sensory-profile-list" open><summary>{italian ? "Profili vino" : "Wine profiles"} ({profiles.length})</summary><div className="member-list">{profiles.map((profile) => <div className="member-row" key={profile.identity_id}><div><strong>{[profile.producer, profile.name, profile.vintage].filter(Boolean).join(" · ")}</strong><span>{profile.source === "metadata" && italian ? "metadati" : label(profile.source)} · {Math.round(profile.confidence * 100)}% · {profile.validated ? (italian ? "validato" : "validated") : (italian ? "da validare" : "unvalidated")}</span></div><div className="member-actions"><button type="button" className="secondary compact" onClick={() => setEditing({ ...profile, dimensions: { ...profile.dimensions } })}>{italian ? "Modifica" : "Edit"}</button><button type="button" className="secondary compact" disabled={busy || profile.validated} title={italian ? "Completa i metadati mancanti con AI e genera il profilo" : "Complete missing metadata with AI and generate the profile"} onClick={() => void regenerate(profile)}>{italian ? "Genera profilo con AI" : "Generate profile with AI"}</button>{rowFeedback?.id === profile.identity_id ? <p role={rowFeedback.error ? "alert" : "status"}>{rowFeedback.message}</p> : null}</div></div>)}</div>
    {profiles.length === 0 ? <p className="empty-state">{italian ? "Nessun profilo corrisponde ai filtri selezionati." : "No profiles match the selected filters."}</p> : null}</details>
    {editing ? <div className="settings-help-panel"><strong>{editing.name}</strong><div className="detail-grid">{dimensions.map((dimension) => <label key={dimension}><span>{label(dimension)}</span><input type="number" min="0" max="1" step="0.05" value={editing.dimensions[dimension] ?? ""} onChange={(event) => setEditing(editDimension(dimension, event.target.value, editing))} /></label>)}</div><label className="admin-sensory-toggle"><input type="checkbox" checked={editing.validated} onChange={(event) => setEditing({ ...editing, validated: event.target.checked })} /><span>{italian ? "Validato" : "Validated"}</span></label><div className="form-actions"><button type="button" disabled={busy} onClick={() => void saveProfile()}>{italian ? "Salva" : "Save"}</button><button type="button" className="secondary" onClick={() => setEditing(null)}>{italian ? "Annulla" : "Cancel"}</button></div></div> : null}
    <details className="settings-help-panel"><summary>{italian ? "Baseline sensoriali" : "Sensory baselines"}</summary><div className="inline-form admin-sensory-baseline-form"><label><span>{italian ? "Tipo baseline" : "Baseline type"}</span><select value={editor.entity_type} onChange={(event) => editingBaseline ? setEditingBaseline({ ...editingBaseline, entity_type: event.target.value }) : setBaselineDraft({ ...baselineDraft, entity_type: event.target.value })}><option value="grape">{label("grape")}</option><option value="appellation">{label("appellation")}</option><option value="region">{label("region")}</option><option value="wine_type">{label("wine_type")}</option></select></label><label><span>{italian ? "Chiave" : "Key"}</span><input value={editor.entity_key} onChange={(event) => editingBaseline ? setEditingBaseline({ ...editingBaseline, entity_key: event.target.value }) : setBaselineDraft({ ...baselineDraft, entity_key: event.target.value })} /></label><label><span>{italian ? "Confidenza" : "Confidence"}</span><input type="number" min="0" max="1" step="0.05" value={editor.confidence} onChange={(event) => editingBaseline ? setEditingBaseline({ ...editingBaseline, confidence: Number(event.target.value) }) : setBaselineDraft({ ...baselineDraft, confidence: Number(event.target.value) })} /></label><button type="button" disabled={busy} onClick={() => void saveBaseline()}>{editingBaseline ? (italian ? "Salva baseline" : "Save baseline") : (italian ? "Aggiungi baseline" : "Add baseline")}</button></div><div className="detail-grid">{dimensions.map((dimension) => <label key={dimension}><span>{label(dimension)}</span><input type="number" min="0" max="1" step="0.05" value={editor.dimensions[dimension] ?? ""} onChange={(event) => editingBaseline ? setEditingBaseline(editDimension(dimension, event.target.value, editingBaseline)) : setBaselineDraft(editDimension(dimension, event.target.value, baselineDraft))} /></label>)}</div><div className="member-list">{baselines.map((baseline) => <div className="member-row" key={baseline.id}><div><strong>{label(baseline.entity_type)}: {baseline.entity_key}</strong><span>{Math.round(baseline.confidence * 100)}%</span></div><div className="member-actions"><button type="button" className="secondary compact" onClick={() => setEditingBaseline({ ...baseline, dimensions: { ...baseline.dimensions } })}>{italian ? "Modifica" : "Edit"}</button><button type="button" className="danger compact" disabled={busy} onClick={() => void removeBaseline(baseline)}>{italian ? "Elimina" : "Delete"}</button></div></div>)}</div></details>
  </section>;
}

export default AdminSensoryProfilesPanel;
