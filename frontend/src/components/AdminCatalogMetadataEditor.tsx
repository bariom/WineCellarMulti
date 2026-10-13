import { useEffect, useId, useState } from "react";
import type { CatalogWine, CatalogWineMetadataUpdate, Locale } from "../types";
import { api } from "../services/api";
import { canonicalWineTypes, normalizeWineType } from "../domain/wineTypes";
import "./AdminCatalogMetadataEditor.css";

function metadata(entry: CatalogWine): CatalogWineMetadataUpdate {
  return { type: normalizeWineType(entry.type), region: entry.region, appellation: entry.appellation,
    country: entry.country || "", format: entry.format, grapes_text: entry.grapes_text || "" };
}

export default function AdminCatalogMetadataEditor({ entry, locale, disabled, onSaved }: {
  entry: CatalogWine; locale: Locale; disabled: boolean; onSaved: (entry: CatalogWine) => void;
}) {
  const it = locale === "it";
  const fieldId = useId();
  const [draft, setDraft] = useState(() => metadata(entry));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  useEffect(() => { setDraft(metadata(entry)); }, [entry]);
  function update(field: keyof CatalogWineMetadataUpdate, value: string) {
    setDraft(current => ({ ...current, [field]: value })); setSaved(false);
  }
  const typeLabels: Record<string, string> = it ? { Red: "Rosso", White: "Bianco", Rose: "Rosato", Sparkling: "Spumante", Sweet: "Dolce", Fortified: "Fortificato", Other: "Altro" } : {};
  return <details className="admin-catalog-metadata">
    <summary>{it ? "Modifica dati condivisi" : "Edit shared metadata"}</summary>
    <form aria-label={`${it ? "Dati condivisi" : "Shared metadata"}: ${entry.name}`} onSubmit={async event => {
      event.preventDefault();
      if (!entry.id || saving || disabled) return;
      setSaving(true); setError(""); setSaved(false);
      try {
        const result = await api<CatalogWine>(`/api/v1/wines/catalog/${entry.id}/metadata`, { method: "PUT", body: JSON.stringify(draft) });
        onSaved(result); setSaved(true);
      } catch (reason) { setError(reason instanceof Error ? reason.message : (it ? "Impossibile salvare i dati." : "Unable to save metadata.")); }
      finally { setSaving(false); }
    }}>
      <p>{it ? "Completa i dati del catalogo validi per tutte le annate. Le schede approvate forniscono i metadati per generare i profili sensoriali." : "Complete catalog metadata that applies to every vintage. Approved entries provide metadata for sensory profile generation."}</p>
      <div className="admin-catalog-metadata-fields">
        <label><span id={`${fieldId}-type`}>{it ? "Tipologia" : "Wine type"}</span><select aria-labelledby={`${fieldId}-type`} value={draft.type} disabled={saving || disabled} onChange={event => update("type", event.target.value)}>
          <option value="">{it ? "Non specificata" : "Not specified"}</option>
          {canonicalWineTypes.map(type => <option key={type} value={type}>{typeLabels[type] || type}</option>)}
        </select></label>
        {(["region", "appellation", "country", "format"] as const).map(field => <label key={field}><span>{{ region: it ? "Regione" : "Region", appellation: it ? "Denominazione" : "Appellation", country: it ? "Paese" : "Country", format: it ? "Formato" : "Bottle format" }[field]}</span><input value={draft[field]} maxLength={field === "format" ? 80 : 120} disabled={saving || disabled} onChange={event => update(field, event.target.value)} /></label>)}
        <label className="admin-catalog-grapes"><span id={`${fieldId}-grapes`}>{it ? "Vitigni" : "Grapes"}</span><textarea aria-labelledby={`${fieldId}-grapes`} aria-describedby={`${fieldId}-grapes-help`} rows={2} maxLength={2000} value={draft.grapes_text} disabled={saving || disabled} onChange={event => update("grapes_text", event.target.value)} /><small id={`${fieldId}-grapes-help`}>{it ? "Separa i nomi con una virgola, ad esempio: Nebbiolo, Barbera." : "Separate names with commas, for example: Nebbiolo, Barbera."}</small></label>
      </div>
      {error ? <p className="error" role="alert">{error}</p> : null}
      {saved ? <p role="status">{it ? "Dati condivisi salvati. Ora puoi generare il profilo dalla gestione dei profili sensoriali." : "Shared metadata saved. You can now generate the profile in sensory profile management."}</p> : null}
      <button type="submit" className="compact" disabled={saving || disabled}>{saving ? (it ? "Salvataggio…" : "Saving…") : (it ? "Salva dati condivisi" : "Save shared metadata")}</button>
    </form>
  </details>;
}
