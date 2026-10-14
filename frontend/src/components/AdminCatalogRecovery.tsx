import { useState } from "react";
import { api } from "../services/api";
import type { CatalogRecoveryResult, Locale } from "../types";
import "./AdminCatalogRecovery.css";

export default function AdminCatalogRecovery({ locale, disabled, onRecovered }: {
  locale: Locale; disabled: boolean; onRecovered: () => Promise<void>;
}) {
  const it = locale === "it";
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<CatalogRecoveryResult | null>(null);
  const [error, setError] = useState("");

  async function recover() {
    setBusy(true); setError(""); setResult(null);
    try {
      const next = await api<CatalogRecoveryResult>("/api/v1/wines/catalog/recover", { method: "POST" });
      setResult(next);
      try { await onRecovered(); }
      catch { setError(it ? "Recupero completato. Riapri il catalogo per aggiornare l’elenco." : "Recovery completed. Reopen the catalog to refresh the list."); }
    } catch (failure) { setError(failure instanceof Error ? failure.message : String(failure)); }
    finally { setBusy(false); }
  }

  return <section className="admin-catalog-recovery" aria-label={it ? "Recupero catalogo da tutte le cantine" : "Recover catalog from all cellars"}>
    <h4>{it ? "Recupera i vini di tutte le cantine" : "Recover wines from all cellars"}</h4>
    <p>{it ? "Funzione riservata agli amministratori: recupera le schede mancanti dai vini salvati o importati in tutte le cantine Vinaris, anche quelle di altri utenti." : "Administrators only: recover missing entries from wines saved or imported across all Vinaris cellars, including other users' cellars."}</p>
    <small>{it ? "Condivide solo i dati tecnici del vino. Le nuove schede restano da approvare prima di apparire nei suggerimenti." : "Only technical wine metadata is shared. New entries require approval before appearing in suggestions."}</small>
    <button type="button" className="secondary" disabled={disabled || busy} onClick={() => void recover()}>{busy ? (it ? "Recupero in corso…" : "Recovering…") : (it ? "Recupera schede da approvare" : "Recover entries for review")}</button>
    {result ? <p role="status">{it ? `Vini esaminati: ${result.scanned}. Nuove schede da approvare: ${result.created}. Già presenti: ${result.existing}. Dati insufficienti: ${result.skipped}.` : `Wines checked: ${result.scanned}. New entries for review: ${result.created}. Already present: ${result.existing}. Insufficient data: ${result.skipped}.`}</p> : null}
    {error ? <p role="alert">{error}</p> : null}
  </section>;
}
