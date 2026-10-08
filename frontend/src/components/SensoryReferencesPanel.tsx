import { useState } from "react";
import type { Locale, SensoryReferencePreview } from "../types";
import { api } from "../services/api";
import "./SensoryReferencesPanel.css";

const dimensionNames: Record<string, string> = { body: "Corpo", acidity: "Acidità", tannin: "Tannini", sweetness: "Dolcezza", aromatic_intensity: "Intensità aromatica", fruit: "Frutto", wood: "Legno", spice: "Spezie", minerality: "Mineralità" };

export default function SensoryReferencesPanel({ locale }: { locale: Locale }) {
  const it = locale === "it";
  const [preview, setPreview] = useState<SensoryReferencePreview | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  async function load(save = false) {
    setBusy(true); setMessage("");
    try {
      const result = await api<SensoryReferencePreview>("/api/v1/taste-profile/admin/references", save ? { method: "POST", body: JSON.stringify({ revision: preview?.revision, ids: selected }) } : undefined);
      setPreview(result); setSelected([]);
      if (save) setMessage(it ? "Dossier importati nel catalogo centrale. I profili restano da rivalidare." : "Dossiers imported into the central catalog. Profiles still need evidence review.");
    } catch {
      setMessage(it ? "Operazione non completata. Ricarica l’anteprima: il catalogo potrebbe essere cambiato." : "Operation not completed. Reload the preview: the catalog may have changed.");
    } finally { setBusy(false); }
  }
  const statuses: Record<string, string> = it ? { new: "Nuova identità", matched: "Identità presente", imported: "Dossier importato", conflict: "Conflitto: revisione necessaria" } : { new: "New identity", matched: "Existing identity", imported: "Dossier imported", conflict: "Conflict: review required" };
  return <section className="sensory-references" aria-label={it ? "Riferimenti documentati" : "Documented references"}>
    <h4>{it ? "Riferimenti documentati e rivalidazione" : "Documented references and review"}</h4>
    <p>{it ? "Le approvazioni precedenti non certificano l’affidabilità. Tutti i profili richiedono una revisione delle prove. Questo primo lotto conserva dati analitici e osservazioni del produttore, senza inventare intensità numeriche." : "Previous approvals do not certify reliability. All profiles require evidence review. This first batch retains analytical data and producer observations without inventing numerical intensities."}</p>
    <button type="button" className="secondary" disabled={busy} onClick={() => void load()}>{busy ? (it ? "Attendere…" : "Loading…") : it ? "Carica riferimenti e confronto" : "Load references and comparison"}</button>
    {message && <p role="status">{message}</p>}
    {preview && <>
      <p>{it ? `${preview.profiles_to_review} profili da rivalidare, di cui ${preview.previously_approved_profiles} approvati in precedenza. L’importazione non modifica valori o approvazioni storiche.` : `${preview.profiles_to_review} profiles need review, including ${preview.previously_approved_profiles} previously approved. Import preserves existing values and historical approvals.`}</p>
      <p>{it ? "Le sintesi documentali del lotto sono in italiano. Nessuna chiamata AI a pagamento." : "The batch's documentary summaries are in Italian. No paid AI calls."}</p>
      {preview.rows.map(row => <article key={row.dossier.id} className="sensory-reference-card">
        <h5>{row.dossier.producer} · {row.dossier.name} · {row.dossier.vintage}</h5>
        <p>{row.dossier.country} · {statuses[row.status]}</p>
        {row.conflicts?.map(conflict => <p key={conflict}>{conflict}</p>)}
        {(row.status === "new" || row.status === "matched") && <label className="sensory-reference-select"><input type="checkbox" disabled={busy} checked={selected.includes(row.dossier.id)} onChange={e => setSelected(e.target.checked ? [...selected, row.dossier.id] : selected.filter(id => id !== row.dossier.id))} />{it ? "Importa dossier" : "Import dossier"}: {row.dossier.name}</label>}
        <details><summary>{it ? "Dati, fonti e confronto" : "Data, sources and comparison"}</summary>
          <p><a href={row.dossier.source_url} target="_blank" rel="noopener noreferrer">{it ? "Fonte del produttore" : "Producer source"}</a> · {it ? "Consultata" : "Checked"} {row.dossier.checked_on}</p>
          <h6>{it ? "Dati analitici e di produzione dichiarati" : "Reported analytical and production data"}</h6>
          <dl>{Object.entries(row.dossier.analytical).map(([key, value]) => <div key={key}><dt>{key}</dt><dd>{value}</dd></div>)}</dl>
          <h6>{it ? "Confronto qualitativo — intensità ancora da rivalidare" : "Qualitative comparison — intensities still need review"}</h6>
          {Object.entries(dimensionNames).map(([key, label]) => <div className="sensory-reference-trait" key={key}>
            <strong>{it ? label : key.replace(/_/g, " ")}</strong>
            <p>{it ? "Valore attuale" : "Current value"}: {row.existing_dimensions[key] ?? "—"}{row.previously_approved ? (it ? " · Approvazione precedente; revisione documentale richiesta" : " · Previously approved; documentary review required") : ""}</p>
            <p>{row.dossier.observations[key] || (it ? "Nessuna osservazione documentata per questa caratteristica." : "No documented observation for this trait.")}</p>
          </div>)}
          <h6>{it ? "Limiti delle prove" : "Evidence limitations"}</h6>
          <ul>{row.dossier.limitations.map(item => <li key={item}>{item}</li>)}</ul>
          <p>{row.dossier.reuse}</p>
        </details>
      </article>)}
      <button type="button" disabled={busy || !selected.length} onClick={() => void load(true)}>{it ? `Importa selezionati (${selected.length})` : `Import selected (${selected.length})`}</button>
      <details><summary>{it ? "Esclusioni e verifiche pendenti" : "Exclusions and pending checks"}</summary><ul>{preview.excluded.map(item => <li key={item}>{item}</li>)}</ul></details>
    </>}
  </section>;
}
