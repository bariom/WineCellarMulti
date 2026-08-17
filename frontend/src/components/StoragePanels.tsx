import { useEffect, useId, useMemo, useRef, useState } from "react";
import type { FormEvent } from "react";

import { api } from "../services/api";
import type { CellarLocation, Locale, StorageAllocation, Wine } from "../types";

function positionLabel(allocation: StorageAllocation, locale: Locale) {
  if (!allocation.location_id) return locale === "it" ? "Da collocare" : "Unassigned";
  return allocation.bin_name ? `${allocation.location_name} · ${allocation.bin_name}` : allocation.location_name;
}

export function WineLocationPicker({ locale, locationId, binId, disabled, onChange }: {
  locale: Locale; locationId: string; binId: string; disabled?: boolean;
  onChange: (locationId: string, binId: string) => void;
}) {
  const [locations, setLocations] = useState<CellarLocation[]>([]);
  const [locationText, setLocationText] = useState("");
  const [binText, setBinText] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");
  const datalistId = useId().replace(/:/g, "");
  const normaliseName = (value: string) => value.trim().replace(/\s+/g, " ").toLocaleLowerCase();
  useEffect(() => {
    void api<CellarLocation[]>("/api/v1/storage/locations").then((items) => {
      setLocations(items);
      if (!locationId) {
        const defaultLocation = items.find((item) => item.is_default);
        if (defaultLocation) onChange(defaultLocation.id, "");
      }
    }).catch(() => setLocations([]));
  }, []);
  const location = locations.find((item) => item.id === locationId);
  const bins = location?.bins || [];
  useEffect(() => { setLocationText(location?.name || ""); }, [location?.name]);
  const bin = bins.find((item) => item.id === binId);
  useEffect(() => { setBinText(bin?.name || ""); }, [bin?.name]);
  const matchingLocation = locations.find((item) => normaliseName(item.name) === normaliseName(locationText));
  const matchingBin = bins.find((item) => normaliseName(item.name) === normaliseName(binText));
  const canCreateLocation = Boolean(locationText.trim() && !matchingLocation && !disabled);
  const canCreateBin = Boolean(locationId && binText.trim() && !matchingBin && !disabled);
  async function createLocation() {
    if (!canCreateLocation || creating) return;
    setCreating(true); setError("");
    try {
      const created = await api<CellarLocation>("/api/v1/storage/locations", {
        method: "POST",
        body: JSON.stringify({ name: locationText.trim(), is_default: locations.length === 0 }),
      });
      setLocations((current) => [...current, created]);
      setLocationText(created.name); setBinText(""); onChange(created.id, "");
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : (locale === "it" ? "Impossibile creare la location" : "Unable to create location"));
    } finally { setCreating(false); }
  }
  async function createBin() {
    if (!canCreateBin || creating) return;
    setCreating(true); setError("");
    try {
      const created = await api<CellarLocation["bins"][number]>(`/api/v1/storage/locations/${locationId}/bins`, {
        method: "POST", body: JSON.stringify({ name: binText.trim() }),
      });
      setLocations((current) => current.map((item) => item.id === locationId ? { ...item, bins: [...item.bins, created] } : item));
      setBinText(created.name); onChange(locationId, created.id);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : (locale === "it" ? "Impossibile creare la posizione" : "Unable to create bin"));
    } finally { setCreating(false); }
  }
  return <div className="form-row storage-picker">
    <label><span>Location</span><div className="storage-create-field"><input list={`${datalistId}-locations`} value={locationText} disabled={disabled} placeholder={locale === "it" ? "Cerca o scrivi una location" : "Search or enter a location"} onChange={(event) => { const value = event.target.value; const match = locations.find((item) => normaliseName(item.name) === normaliseName(value)); setLocationText(value); setBinText(""); onChange(match?.id || "", ""); }} /><datalist id={`${datalistId}-locations`}>{locations.map((item) => <option key={item.id} value={item.name} />)}</datalist>{canCreateLocation ? <button type="button" className="secondary compact" disabled={creating} onClick={() => void createLocation()}>{locale === "it" ? "Crea" : "Create"}</button> : null}</div></label>
    <label><span>{locale === "it" ? "Posizione" : "Bin"}</span><div className="storage-create-field"><input list={`${datalistId}-bins`} value={binText} disabled={disabled || !locationId} placeholder={locationId ? (locale === "it" ? "Cerca o scrivi una posizione" : "Search or enter a bin") : (locale === "it" ? "Scegli prima una location" : "Choose a location first")} onChange={(event) => { const value = event.target.value; const match = bins.find((item) => normaliseName(item.name) === normaliseName(value)); setBinText(value); onChange(locationId, match?.id || ""); }} /><datalist id={`${datalistId}-bins`}>{bins.map((item) => <option key={item.id} value={item.name} />)}</datalist>{canCreateBin ? <button type="button" className="secondary compact" disabled={creating} onClick={() => void createBin()}>{locale === "it" ? "Crea" : "Create"}</button> : null}</div></label>
    {error ? <p className="form-error storage-picker-error" role="alert">{error}</p> : null}
  </div>;
}

export function WineStorageSection({ wine, canWrite, locale, onChanged, focusRequestId = null }: {
  wine: Wine; canWrite: boolean; locale: Locale; onChanged: () => Promise<void> | void; focusRequestId?: number | null;
}) {
  const [allocations, setAllocations] = useState<StorageAllocation[]>(wine.storage_allocations || []);
  const [sourceId, setSourceId] = useState("");
  const [locationId, setLocationId] = useState("");
  const [binId, setBinId] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const sectionRef = useRef<HTMLDetailsElement>(null);
  const selectedSource = allocations.find((item) => item.id === sourceId);
  async function load() {
    const nextAllocations = await api<StorageAllocation[]>(`/api/v1/storage/allocations?wine_id=${wine.id}`);
    setAllocations(nextAllocations);
    setSourceId((current) => nextAllocations.some((item) => item.id === current) ? current : (nextAllocations[0]?.id || ""));
  }
  useEffect(() => { void load().catch(() => setAllocations(wine.storage_allocations || [])); }, [wine.id]);
  useEffect(() => {
    if (focusRequestId === null) return;
    const frame = window.requestAnimationFrame(() => sectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
    return () => window.cancelAnimationFrame(frame);
  }, [focusRequestId]);
  async function relocate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!sourceId || loading) return; setLoading(true); setError("");
    try {
      const next = await api<StorageAllocation[]>("/api/v1/storage/relocations", { method: "POST", body: JSON.stringify({ wine_id: wine.id, source_allocation_id: sourceId, quantity: Number(quantity), location_id: locationId || null, bin_id: binId || null }) });
      setAllocations(next); setSourceId(next[0]?.id || ""); setQuantity("1"); await onChanged();
    } catch (nextError) { setError(nextError instanceof Error ? nextError.message : (locale === "it" ? "Spostamento non riuscito" : "Unable to move bottles")); } finally { setLoading(false); }
  }
  return <details className="detail-section wine-storage-section" open ref={sectionRef}>
    <summary><span>{locale === "it" ? "Collocazione" : "Storage"}</span><strong>{allocations.length}</strong></summary>
    <div className="storage-allocation-list">{allocations.length ? allocations.map((allocation) => <div className="detail-field" key={allocation.id}><span>{positionLabel(allocation, locale)}</span><strong>{allocation.quantity} {locale === "it" ? "bott." : "btl."}</strong></div>) : <p className="empty-state">{locale === "it" ? "Nessuna bottiglia in giacenza." : "No bottles in stock."}</p>}</div>
    {error ? <p className="form-error" role="alert">{error}</p> : null}
    {canWrite && allocations.length ? <form className="consume-form storage-relocation-form" onSubmit={relocate}>
      <p className="consume-help">{locale === "it" ? "Sposta bottiglie senza modificare la giacenza totale." : "Move bottles without changing total stock."}</p>
      <div className="detail-grid consume-grid">
        <label><span>{locale === "it" ? "Da" : "From"}</span><select value={sourceId} onChange={(event) => { setSourceId(event.target.value); setQuantity("1"); }}>{allocations.map((allocation) => <option key={allocation.id} value={allocation.id}>{positionLabel(allocation, locale)} ({allocation.quantity})</option>)}</select></label>
        <label><span>{locale === "it" ? "Bottiglie" : "Bottles"}</span><input type="number" min="1" max={selectedSource?.quantity || 1} value={quantity} onChange={(event) => setQuantity(event.target.value)} required /></label>
        <WineLocationPicker locale={locale} locationId={locationId} binId={binId} onChange={(nextLocationId, nextBinId) => { setLocationId(nextLocationId); setBinId(nextBinId); }} />
      </div><div className="form-actions"><button type="submit" disabled={loading}>{loading ? (locale === "it" ? "Sposto…" : "Moving…") : (locale === "it" ? "Sposta" : "Move")}</button></div>
    </form> : null}
  </details>;
}

export function CellarStorageManager({ locale, canWrite }: { locale: Locale; canWrite: boolean }) {
  const [locations, setLocations] = useState<CellarLocation[]>([]);
  const [locationName, setLocationName] = useState("");
  const [binNames, setBinNames] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const total = useMemo(() => locations.reduce((sum, item) => sum + item.bottle_count, 0), [locations]);
  const load = async () => setLocations(await api<CellarLocation[]>("/api/v1/storage/locations"));
  useEffect(() => { void load(); }, []);
  const reportError = (nextError: unknown) => setError(nextError instanceof Error ? nextError.message : (locale === "it" ? "Operazione non riuscita" : "Operation failed"));
  async function createLocation(event: FormEvent<HTMLFormElement>) { event.preventDefault(); if (!locationName.trim()) return; setLoading(true); setError(""); try { await api("/api/v1/storage/locations", { method: "POST", body: JSON.stringify({ name: locationName.trim(), is_default: locations.length === 0 }) }); setLocationName(""); await load(); } catch (nextError) { reportError(nextError); } finally { setLoading(false); } }
  async function createBin(locationId: string) { const name = (binNames[locationId] || "").trim(); if (!name) return; setLoading(true); setError(""); try { await api(`/api/v1/storage/locations/${locationId}/bins`, { method: "POST", body: JSON.stringify({ name }) }); setBinNames((current) => ({ ...current, [locationId]: "" })); await load(); } catch (nextError) { reportError(nextError); } finally { setLoading(false); } }
  async function rename(kind: "locations" | "bins", id: string, currentName: string) { const name = window.prompt(locale === "it" ? "Nuovo nome" : "New name", currentName)?.trim(); if (!name || name === currentName) return; try { setError(""); await api(`/api/v1/storage/${kind}/${id}`, { method: "PATCH", body: JSON.stringify({ name }) }); await load(); } catch (nextError) { reportError(nextError); } }
  async function remove(kind: "locations" | "bins", id: string) { if (!window.confirm(locale === "it" ? "Eliminare questa posizione vuota?" : "Delete this empty position?")) return; try { setError(""); await api(`/api/v1/storage/${kind}/${id}`, { method: "DELETE" }); await load(); } catch (nextError) { reportError(nextError); } }
  async function makeDefault(id: string) { try { setError(""); await api(`/api/v1/storage/locations/${id}`, { method: "PATCH", body: JSON.stringify({ is_default: true }) }); await load(); } catch (nextError) { reportError(nextError); } }
  return <section className="settings-card settings-card-wide storage-manager">
    <div className="settings-card-heading"><div><span>{locale === "it" ? "Organizzazione" : "Organisation"}</span><h3>{locale === "it" ? "Location e posizioni" : "Location & Bin"}</h3></div><strong>{total} {locale === "it" ? "bottiglie collocate" : "bottles placed"}</strong></div>
    <p className="settings-card-intro">{locale === "it" ? "La location è il luogo fisico; la posizione identifica ripiano, fila, colonna o cassa al suo interno." : "A location is the physical place; a bin identifies a shelf, row, column or case inside it."}</p>
    {error ? <p className="form-error" role="alert">{error}</p> : null}
    {canWrite ? <form className="inline-row-form" onSubmit={createLocation}><input value={locationName} maxLength={80} onChange={(event) => setLocationName(event.target.value)} placeholder={locale === "it" ? "Es. Frigo vini" : "E.g. Wine fridge"} /><button type="submit" disabled={loading || !locationName.trim()}>{locale === "it" ? "Crea location" : "Create location"}</button></form> : null}
    <div className="storage-location-list">{locations.map((location) => <details key={location.id} open><summary><strong>{location.name}</strong><span>{location.bottle_count} {locale === "it" ? "bott." : "btl."}{location.is_default ? ` · ${locale === "it" ? "predefinita" : "default"}` : ""}</span></summary>
      <div className="storage-admin-actions">{canWrite ? <>{!location.is_default ? <button type="button" className="secondary compact" onClick={() => void makeDefault(location.id)}>{locale === "it" ? "Predefinita" : "Make default"}</button> : null}<button type="button" className="secondary compact" onClick={() => void rename("locations", location.id, location.name)}>{locale === "it" ? "Rinomina" : "Rename"}</button><button type="button" className="danger compact" disabled={location.bottle_count > 0} onClick={() => void remove("locations", location.id)}>{locale === "it" ? "Elimina" : "Delete"}</button></> : null}</div>
      {location.bins.map((bin) => <div className="tag-admin-row" key={bin.id}><span>{bin.name}</span><small>{bin.bottle_count} {locale === "it" ? "bott." : "btl."}</small>{canWrite ? <><button type="button" className="secondary compact" onClick={() => void rename("bins", bin.id, bin.name)}>{locale === "it" ? "Rinomina" : "Rename"}</button><button type="button" className="danger compact" disabled={bin.bottle_count > 0} onClick={() => void remove("bins", bin.id)}>{locale === "it" ? "Elimina" : "Delete"}</button></> : null}</div>)}
      {canWrite ? <div className="inline-row-form"><input value={binNames[location.id] || ""} maxLength={80} onChange={(event) => setBinNames((current) => ({ ...current, [location.id]: event.target.value }))} placeholder={locale === "it" ? "Es. Ripiano 03" : "E.g. Shelf 03"} /><button type="button" disabled={loading || !(binNames[location.id] || "").trim()} onClick={() => void createBin(location.id)}>{locale === "it" ? "Aggiungi posizione" : "Add bin"}</button></div> : null}</details>)}
      {!locations.length ? <p className="empty-state">{locale === "it" ? "Crea la prima location per iniziare a collocare le bottiglie." : "Create your first location to start placing bottles."}</p> : null}</div>
  </section>;
}
