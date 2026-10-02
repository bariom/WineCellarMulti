import { useEffect, useId, useState } from "react";
import { createPortal } from "react-dom";
import type { FormEvent } from "react";
import type { Locale, Wine, WineStockLot } from "../types";
import { api } from "../services/api";
import { formatDisplayDate, formatMoney } from "./panelSupport";
import { WineLocationPicker } from "./StoragePanels";
import "./WineLotsSection.css";

export default function WineLotsSection({ wine, canWrite, saving, locale, onChanged, onRegistered, onBusyChange }: {
  wine: Wine; canWrite: boolean; saving: boolean; locale: Locale;
  onChanged: () => Promise<void> | void;
  onRegistered?: (quantity: number) => void;
  onBusyChange?: (busy: boolean) => void;
}) {
  const formId = `purchase-${useId().replace(/:/g, "")}`;
  const [lots, setLots] = useState<WineStockLot[]>([]);
  const [draft, setDraft] = useState({ quantity: "", unit_cost: "", acquired_on: new Date().toISOString().slice(0, 10), supplier: "", storage_location_id: "", storage_bin_id: "" });
  const [adding, setAdding] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const italian = locale === "it";
  const loadLots = async () => setLots(await api<WineStockLot[]>(`/api/v1/inventory/lots?wine_id=${wine.id}&include_empty=true`));
  useEffect(() => {
    let active = true;
    void api<WineStockLot[]>(`/api/v1/inventory/lots?wine_id=${wine.id}&include_empty=true`)
      .then(items => { if (active) setLots(items); })
      .catch(() => { if (active) setError(italian ? "Impossibile caricare i lotti. Riapri la scheda per riprovare." : "Unable to load lots. Reopen the detail to retry."); });
    return () => { active = false; };
  }, [wine.id]);
  const total = lots.reduce((sum, lot) => sum + Number(lot.total_remaining_cost), 0);
  const bottles = lots.reduce((sum, lot) => sum + lot.quantity_remaining, 0);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    event.stopPropagation();
    if (!canWrite || saving || loading) return;
    setLoading(true); setError(""); setMessage("");
    onBusyChange?.(true);
    let registered = false;
    try {
      const quantity = Number(draft.quantity);
      await api("/api/v1/inventory/movements", { method: "POST", body: JSON.stringify({ wine_id: wine.id, movement_type: "purchase", quantity, unit_cost: Number(draft.unit_cost), occurred_on: draft.acquired_on, supplier: draft.supplier, storage_location_id: draft.storage_location_id || null, storage_bin_id: draft.storage_bin_id || null }) });
      registered = true;
      onRegistered?.(quantity);
      setDraft(current => ({ ...current, quantity: "", unit_cost: "", supplier: "" }));
      setAdding(false);
      setMessage(italian ? "Acquisto registrato. Giacenza aggiornata." : "Purchase recorded. Stock updated.");
      await Promise.all([loadLots(), onChanged()]);
    } catch (nextError) {
      setError(registered
        ? (italian ? "L'acquisto è salvato, ma non è stato possibile aggiornare la vista. Riapri la scheda." : "The purchase is saved, but the view could not refresh. Reopen the detail.")
        : nextError instanceof Error ? nextError.message : (italian ? "Impossibile registrare l'acquisto." : "Unable to record the purchase."));
    } finally { setLoading(false); onBusyChange?.(false); }
  }
  return <section className="detail-section wine-lots-section" aria-label={italian ? "Lotti d'acquisto" : "Purchase lots"}>
    <div className="wine-lots-heading"><div><h3>{italian ? "Lotti d'acquisto" : "Purchase lots"}</h3><small>{lots.length} {italian ? (lots.length === 1 ? "lotto" : "lotti") : (lots.length === 1 ? "lot" : "lots")}</small></div>
      {canWrite ? <button type="button" className="secondary" disabled={saving || loading} aria-expanded={adding} aria-controls={`${formId}-fields`} onClick={() => { setAdding(!adding); setMessage(""); }}>{adding ? (italian ? "Annulla nuovo acquisto" : "Cancel new purchase") : (italian ? "Registra nuovo acquisto" : "Record new purchase")}</button> : null}
    </div>
    <p className="consume-help">{italian ? "Ogni acquisto conserva quantità, data e prezzo per bottiglia, anche per lo stesso vino." : "Each purchase keeps its quantity, date and price per bottle, even for the same wine."}</p>
    {lots.length ? <div className="lot-list">{lots.map(lot => <div className="detail-field" key={lot.id}><span>{formatDisplayDate(lot.acquired_on)}{lot.supplier ? ` · ${lot.supplier}` : ""}</span><strong>{lot.quantity_remaining}/{lot.quantity_received} {italian ? "bott." : "btl."} · {formatMoney(lot.unit_cost, lot.currency, locale)}</strong></div>)}</div> : !error ? <p className="empty-state">{italian ? "Nessun lotto registrato." : "No purchase lots recorded."}</p> : null}
    {bottles ? <p className="consume-help">{italian ? "Costo medio delle bottiglie in giacenza" : "Average cost of bottles in stock"}: <strong>{formatMoney(total / bottles, wine.currency, locale)}</strong></p> : null}
    {error ? <p className="form-error" role="alert">{error}</p> : null}
    {message ? <p role="status">{message}</p> : null}
    {canWrite && adding ? <fieldset className="wine-lots-fields" id={`${formId}-fields`} disabled={saving || loading}>
      <legend>{italian ? "Nuovo acquisto" : "New purchase"}</legend>
      <div className="detail-grid consume-grid">
        <label><span>{italian ? "Bottiglie acquistate" : "Bottles purchased"}</span><input form={formId} type="number" min="1" step="1" required value={draft.quantity} onChange={event => setDraft({ ...draft, quantity: event.target.value })} /></label>
        <label><span>{italian ? `Prezzo per bottiglia (${wine.currency})` : `Price per bottle (${wine.currency})`}</span><input form={formId} type="number" min="0" step="0.01" required value={draft.unit_cost} onChange={event => setDraft({ ...draft, unit_cost: event.target.value })} /></label>
        <label><span>{italian ? "Data acquisto" : "Purchase date"}</span><input form={formId} type="date" required value={draft.acquired_on} onChange={event => setDraft({ ...draft, acquired_on: event.target.value })} /></label>
        <label><span>{italian ? "Commerciante" : "Merchant"}</span><input form={formId} value={draft.supplier} onChange={event => setDraft({ ...draft, supplier: event.target.value })} /></label>
      </div>
      <WineLocationPicker formId={formId} locale={locale} locationId={draft.storage_location_id} binId={draft.storage_bin_id} disabled={saving || loading} onChange={(storage_location_id, storage_bin_id) => setDraft(current => ({ ...current, storage_location_id, storage_bin_id }))} />
      <p className="consume-help">{italian ? "Questo acquisto viene salvato subito e aumenta la giacenza." : "This purchase is saved immediately and increases stock."}{onRegistered ? (italian ? " Gli altri campi del vino restano da salvare." : " Other wine changes still need saving.") : ""}</p>
      <div className="wine-lots-actions"><button type="submit" form={formId}>{loading ? (italian ? "Registro…" : "Recording…") : (italian ? "Conferma acquisto" : "Confirm purchase")}</button></div>
    </fieldset> : null}
    {/* Separate native form keeps purchases independent even inside the wine editor. */}
    {createPortal(<form id={formId} onSubmit={submit} />, document.body)}
  </section>;
}
