import { useEffect, useState } from "react";
import type { Locale, SensoryProfileBaseline, WineSensoryBatchPreview, WineSensoryProfile, WineSensoryProfileSummary } from "../types";
import { api } from "../services/api";

const dimensions = ["body", "acidity", "tannin", "sweetness", "aromatic_intensity", "fruit", "wood", "spice", "minerality"];
const emptyBaseline: Omit<SensoryProfileBaseline, "id"> = { entity_type: "grape", entity_key: "", dimensions: {}, confidence: 0.5, is_active: true };

export function AdminSensoryProfilesPanel({ locale }: { locale: Locale }) {
  const italian = locale === "it";
  const [summary, setSummary] = useState<WineSensoryProfileSummary | null>(null);
  const [profiles, setProfiles] = useState<WineSensoryProfile[]>([]);
  const [baselines, setBaselines] = useState<SensoryProfileBaseline[]>([]);
  const [editing, setEditing] = useState<WineSensoryProfile | null>(null);
  const [baselineDraft, setBaselineDraft] = useState<Omit<SensoryProfileBaseline, "id">>(emptyBaseline);
  const [editingBaseline, setEditingBaseline] = useState<SensoryProfileBaseline | null>(null);
  const [preview, setPreview] = useState<WineSensoryBatchPreview | null>(null);
  const [filter, setFilter] = useState({ source: "", validated: "", low_confidence: false, missing: false, wine_type: "", region: "", appellation: "", grape: "", producer: "" });
  const [busy, setBusy] = useState(false);
  async function load() {
    const query = new URLSearchParams({ limit: "30" });
    for (const [key, value] of Object.entries(filter)) if (typeof value === "string" ? value.trim() : value) query.set(key, String(value).trim());
    const [nextSummary, nextProfiles, nextBaselines] = await Promise.all([
      api<WineSensoryProfileSummary>("/api/v1/taste-profile/admin/summary"),
      api<WineSensoryProfile[]>(`/api/v1/taste-profile/admin/profiles?${query}`),
      api<SensoryProfileBaseline[]>("/api/v1/taste-profile/admin/baselines"),
    ]);
    setSummary(nextSummary); setProfiles(nextProfiles); setBaselines(nextBaselines);
  }
  useEffect(() => { void load(); }, []);
  async function saveProfile() {
    if (!editing) return;
    setBusy(true);
    try { await api(`/api/v1/taste-profile/admin/profiles/${editing.identity_id}`, { method: "PUT", body: JSON.stringify({ dimensions: editing.dimensions, validated: editing.validated }) }); setEditing(null); await load(); } finally { setBusy(false); }
  }
  async function regenerate(profile: WineSensoryProfile) {
    setBusy(true);
    try { await api(`/api/v1/taste-profile/admin/profiles/${profile.identity_id}/regenerate`, { method: "POST" }); await load(); } finally { setBusy(false); }
  }
  async function enrich() {
    setBusy(true);
    try { await api("/api/v1/taste-profile/admin/enrich-missing", { method: "POST", body: JSON.stringify({ limit: 50, allow_ai: false }) }); await load(); } finally { setBusy(false); }
  }
  async function saveBaseline() {
    const baseline = editingBaseline || baselineDraft;
    if (!baseline.entity_key.trim()) return;
    setBusy(true);
    try {
      await api(editingBaseline ? `/api/v1/taste-profile/admin/baselines/${editingBaseline.id}` : "/api/v1/taste-profile/admin/baselines", { method: editingBaseline ? "PUT" : "POST", body: JSON.stringify(baseline) });
      setEditingBaseline(null); setBaselineDraft(emptyBaseline); await load();
    } finally { setBusy(false); }
  }
  async function removeBaseline(baseline: SensoryProfileBaseline) {
    setBusy(true);
    try { await api(`/api/v1/taste-profile/admin/baselines/${baseline.id}`, { method: "DELETE" }); await load(); } finally { setBusy(false); }
  }
  const baselineEditor = editingBaseline || baselineDraft;
  const editDimension = <T extends { dimensions: Record<string, number | null> }>(dimension: string, value: string, target: T): T => ({ ...target, dimensions: { ...target.dimensions, [dimension]: value === "" ? null : Number(value) } });

  return <section className="settings-card settings-card-wide">
    <div className="settings-card-heading"><div><span>{italian ? "Dati condivisi" : "Shared data"}</span><h3>{italian ? "Profili sensoriali dei vini" : "Wine Sensory Profiles"}</h3></div><button type="button" className="secondary compact" disabled={busy} onClick={() => void enrich()}>{italian ? "Genera profili mancanti" : "Generate missing profiles"}</button></div>
    {summary ? <div className="detail-grid">{[["profiles", summary.wines_with_profile], ["missing", summary.wines_without_profile], ["metadata", summary.inferred_from_metadata], ["AI", summary.generated_by_ai], ["validated", summary.manually_validated], ["low confidence", summary.low_confidence]].map(([label, value]) => <div className="detail-field" key={String(label)}><span>{label}</span><strong>{value}</strong></div>)}</div> : null}
    <div className="inline-form"><label><span>{italian ? "Fonte" : "Source"}</span><select value={filter.source} onChange={(event) => setFilter({ ...filter, source: event.target.value })}><option value="">{italian ? "Tutte" : "All"}</option><option value="metadata">metadata</option><option value="hybrid">hybrid</option><option value="ai">AI</option><option value="manual">manual</option></select></label><label><span>{italian ? "Validazione" : "Validation"}</span><select value={filter.validated} onChange={(event) => setFilter({ ...filter, validated: event.target.value })}><option value="">{italian ? "Tutte" : "All"}</option><option value="true">{italian ? "Validati" : "Validated"}</option><option value="false">{italian ? "Non validati" : "Unvalidated"}</option></select></label><label><input type="checkbox" checked={filter.low_confidence} onChange={(event) => setFilter({ ...filter, low_confidence: event.target.checked })} /> {italian ? "Bassa confidenza" : "Low confidence"}</label><label><input type="checkbox" checked={filter.missing} onChange={(event) => setFilter({ ...filter, missing: event.target.checked })} /> {italian ? "Senza profilo" : "Missing profile"}</label><label><span>Type</span><input value={filter.wine_type} onChange={(event) => setFilter({ ...filter, wine_type: event.target.value })} /></label><label><span>{italian ? "Regione" : "Region"}</span><input value={filter.region} onChange={(event) => setFilter({ ...filter, region: event.target.value })} /></label><label><span>Appellation</span><input value={filter.appellation} onChange={(event) => setFilter({ ...filter, appellation: event.target.value })} /></label><label><span>{italian ? "Uva" : "Grape"}</span><input value={filter.grape} onChange={(event) => setFilter({ ...filter, grape: event.target.value })} /></label><label><span>{italian ? "Produttore" : "Producer"}</span><input value={filter.producer} onChange={(event) => setFilter({ ...filter, producer: event.target.value })} /></label><button type="button" className="secondary compact" onClick={() => void load()}>{italian ? "Filtra" : "Filter"}</button></div>
    <div className="form-actions"><button type="button" className="secondary compact" onClick={() => void api<WineSensoryBatchPreview>("/api/v1/taste-profile/admin/batch-preview").then(setPreview)}>{italian ? "Anteprima batch" : "Batch preview"}</button></div>
    {preview ? <p className="empty-state">{preview.missing} {italian ? "mancanti;" : "missing;"} {preview.deterministic} {italian ? "risolvibili senza AI;" : "resolvable without AI;"} {preview.requires_ai} AI.</p> : null}
    <div className="member-list">{profiles.map((profile) => <div className="member-row" key={profile.identity_id}><div><strong>{[profile.producer, profile.name, profile.vintage].filter(Boolean).join(" · ")}</strong><span>{profile.source} · {Math.round(profile.confidence * 100)}% · {profile.validated ? (italian ? "validato" : "validated") : (italian ? "da validare" : "unvalidated")} · {new Date(profile.generated_at).toLocaleDateString(italian ? "it-IT" : "en-US")}</span></div><div className="member-actions"><button type="button" className="secondary compact" onClick={() => setEditing({ ...profile, dimensions: { ...profile.dimensions } })}>{italian ? "Modifica" : "Edit"}</button><button type="button" className="secondary compact" disabled={busy || profile.validated} onClick={() => void regenerate(profile)}>{italian ? "Reimposta inferito" : "Reset inferred"}</button></div></div>)}</div>
    {editing ? <div className="settings-help-panel"><strong>{editing.name}</strong><div className="detail-grid">{dimensions.map((dimension) => <label key={dimension}><span>{dimension.replace(/_/g, " ")}</span><input type="number" min="0" max="1" step="0.05" value={editing.dimensions[dimension] ?? ""} onChange={(event) => setEditing(editDimension(dimension, event.target.value, editing) as WineSensoryProfile)} /></label>)}</div><label><input type="checkbox" checked={editing.validated} onChange={(event) => setEditing({ ...editing, validated: event.target.checked })} /> {italian ? "Validato" : "Validated"}</label><div className="form-actions"><button type="button" disabled={busy} onClick={() => void saveProfile()}>{italian ? "Salva" : "Save"}</button><button type="button" className="secondary" onClick={() => setEditing(null)}>{italian ? "Annulla" : "Cancel"}</button></div></div> : null}
    <details className="settings-help-panel"><summary>{italian ? "Baseline sensoriali" : "Sensory baselines"}</summary><div className="inline-form"><label><span>Type</span><select value={baselineEditor.entity_type} onChange={(event) => editingBaseline ? setEditingBaseline({ ...editingBaseline, entity_type: event.target.value }) : setBaselineDraft({ ...baselineDraft, entity_type: event.target.value })}><option value="grape">grape</option><option value="appellation">appellation</option><option value="region">region</option><option value="wine_type">wine type</option></select></label><label><span>Key</span><input value={baselineEditor.entity_key} onChange={(event) => editingBaseline ? setEditingBaseline({ ...editingBaseline, entity_key: event.target.value }) : setBaselineDraft({ ...baselineDraft, entity_key: event.target.value })} /></label><label><span>{italian ? "Confidenza" : "Confidence"}</span><input type="number" min="0" max="1" step="0.05" value={baselineEditor.confidence} onChange={(event) => editingBaseline ? setEditingBaseline({ ...editingBaseline, confidence: Number(event.target.value) }) : setBaselineDraft({ ...baselineDraft, confidence: Number(event.target.value) })} /></label><button type="button" disabled={busy} onClick={() => void saveBaseline()}>{editingBaseline ? (italian ? "Salva baseline" : "Save baseline") : (italian ? "Aggiungi baseline" : "Add baseline")}</button></div><div className="detail-grid">{dimensions.map((dimension) => <label key={dimension}><span>{dimension.replace(/_/g, " ")}</span><input type="number" min="0" max="1" step="0.05" value={baselineEditor.dimensions[dimension] ?? ""} onChange={(event) => editingBaseline ? setEditingBaseline(editDimension(dimension, event.target.value, editingBaseline) as SensoryProfileBaseline) : setBaselineDraft(editDimension(dimension, event.target.value, baselineDraft))} /></label>)}</div><div className="member-list">{baselines.map((baseline) => <div className="member-row" key={baseline.id}><div><strong>{baseline.entity_type}: {baseline.entity_key}</strong><span>{Math.round(baseline.confidence * 100)}%</span></div><div className="member-actions"><button type="button" className="secondary compact" onClick={() => setEditingBaseline({ ...baseline, dimensions: { ...baseline.dimensions } })}>{italian ? "Modifica" : "Edit"}</button><button type="button" className="danger compact" disabled={busy} onClick={() => void removeBaseline(baseline)}>{italian ? "Elimina" : "Delete"}</button></div></div>)}</div></details>
  </section>;
}

export default AdminSensoryProfilesPanel;
