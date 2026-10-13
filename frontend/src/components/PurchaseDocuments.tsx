import { useEffect, useState } from "react";
import { api } from "../services/api";
import type { Locale, PurchaseDocument } from "../types";
import "./PurchaseDocuments.css";

export default function PurchaseDocuments({ wineId, locale, canWrite, refreshKey = "" }: {
  wineId?: string; locale: Locale; canWrite: boolean; refreshKey?: string;
}) {
  const it = locale === "it";
  const [documents, setDocuments] = useState<PurchaseDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true); setError(""); setDocuments([]);
    void api<PurchaseDocument[]>(`/api/v1/imports/purchases/documents${wineId ? `?wine_id=${encodeURIComponent(wineId)}` : ""}`, { signal: controller.signal })
      .then(items => { if (!controller.signal.aborted) setDocuments(items); })
      .catch(() => { if (!controller.signal.aborted) setError(it ? "Impossibile caricare i documenti." : "Unable to load documents."); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [wineId, refreshKey, retry, it]);
  async function remove(document: PurchaseDocument) {
    if (!window.confirm(it
      ? `Eliminare definitivamente “${document.filename}”? Il file non sarà più disponibile per nessuno dei ${document.wine_count} vini collegati. Vini e dati d’acquisto verranno mantenuti.`
      : `Permanently delete “${document.filename}”? The file will no longer be available to any of its ${document.wine_count} linked wines. Wines and purchase data will be kept.`)) return;
    setBusy(true); setError("");
    try {
      await api<void>(`/api/v1/imports/purchases/${document.id}/document`, { method: "DELETE" });
      setDocuments(current => current.filter(item => item.id !== document.id));
    } catch { setError(it ? "Il documento non è stato eliminato. Riprova." : "The document was not deleted. Please retry."); }
    finally { setBusy(false); }
  }
  return <section className="purchase-documents" aria-label={it ? "Documenti d’acquisto" : "Purchase documents"}>
    <h4>{it ? "Fatture e scontrini" : "Invoices and receipts"}</h4>
    <p>{it ? "Gli originali dei nuovi acquisti importati sono conservati qui. Eliminare un documento non modifica vini o lotti." : "Original documents from newly imported purchases are kept here. Deleting a document does not change wines or purchase lots."}</p>
    {loading ? <p role="status">{it ? "Caricamento documenti…" : "Loading documents…"}</p> : null}
    {error ? <p role="alert">{error} <button type="button" className="secondary" disabled={busy} onClick={() => setRetry(value => value + 1)}>{it ? "Riprova" : "Retry"}</button></p> : null}
    {!loading && !error && !documents.length ? <p>{it ? "Nessun documento archiviato. I file degli acquisti importati prima di questa funzione non sono disponibili." : "No archived documents. Files from purchases imported before this feature are not available."}</p> : null}
    {documents.map(document => <article key={document.id}>
      <div><strong>{document.filename}</strong><small>{[document.supplier, document.reference, `${Math.ceil(document.size / 1024)} KB`].filter(Boolean).join(" · ")}</small>
        <small>{document.wine_count ? (it ? `Collegato a ${document.wine_count} vini` : `Linked to ${document.wine_count} wines`) : document.status === "draft" ? (it ? "Importazione non ancora confermata" : "Import not yet confirmed") : (it ? "Nessun vino ancora collegato: puoi eliminare il documento." : "No wines remain linked: you can delete this document.")}</small>
      </div>
      <div className="purchase-document-actions">
        <a href={document.url} target="_blank" rel="noopener noreferrer">{it ? "Apri documento" : "Open document"}</a>
        <a href={`${document.url}?download=true`}>{it ? "Scarica" : "Download"}</a>
        {canWrite ? <button type="button" className="secondary" disabled={busy} onClick={() => void remove(document)}>{it ? "Elimina documento" : "Delete document"}</button> : null}
      </div>
    </article>)}
  </section>;
}
