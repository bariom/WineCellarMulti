import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { CatalogWine, ConsumeWineDraft, Locale, StandaloneWineTastingCreate, TastingWineIdentity, Wine, WineImageRecognitionCandidate, WineImageRecognitionResult, WishlistItem, WishlistList } from "../types";
import { api } from "../services/api";
import { translate } from "../i18n";
import { isWinePhysicallyInCellar } from "../domain/cellar";
import { TastingEnjoymentInput } from "./AppUi";
import { emptyConsumeWineDraft } from "./panelSupport";
import "./RecordTastingDialog.css";

const blankWine = (): TastingWineIdentity => ({ name: "", producer: "", vintage: "", format: "", type: "", region: "", appellation: "" });

export default function RecordTastingDialog({ locale, wines, canRecognize, onClose, onSaved, onWishlist }: {
  locale: Locale;
  wines: Wine[];
  canRecognize: boolean;
  onClose: () => void;
  onSaved: (wine?: Wine) => void;
  onWishlist: (wine: TastingWineIdentity) => void;
}) {
  const it = locale === "it";
  const t = (key: Parameters<typeof translate>[1]) => translate(locale, key);
  const dialog = useRef<HTMLDialogElement>(null);
  const photo = useRef<HTMLInputElement>(null);
  const [mode, setMode] = useState<"choice" | "cellar" | "external">("choice");
  const [identity, setIdentity] = useState<TastingWineIdentity>(blankWine);
  const [selected, setSelected] = useState<Wine | null>(null);
  const [draft, setDraft] = useState<ConsumeWineDraft>(() => {
    const now = new Date();
    return { ...emptyConsumeWineDraft(), consumed_at: `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}` };
  });
  const [query, setQuery] = useState("");
  const [catalog, setCatalog] = useState<CatalogWine[]>([]);
  const [wishlist, setWishlist] = useState<WishlistItem[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [searchError, setSearchError] = useState("");
  const [recognition, setRecognition] = useState<WineImageRecognitionResult | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    const element = dialog.current!;
    const trigger = document.activeElement as HTMLElement | null;
    element.showModal();
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { element.close(); document.body.style.overflow = previous; trigger?.focus(); };
  }, []);

  useEffect(() => {
    if (mode !== "external") return;
    const controller = new AbortController();
    void api<WishlistList[]>("/api/v1/wishlist/lists", { signal: controller.signal })
      .then(lists => Promise.all(lists.map(list => api<WishlistItem[]>(`/api/v1/wishlist?wishlist_list_id=${list.id}`, { signal: controller.signal }))))
      .then(items => setWishlist(items.flat()))
      .catch(() => { if (!controller.signal.aborted) setSearchError(it ? "Wishlist non disponibile. Puoi inserire il vino a mano." : "Wishlist unavailable. You can enter the wine manually."); });
    return () => controller.abort();
  }, [mode, it]);

  useEffect(() => {
    setCatalog([]);
    if (mode !== "external" || query.trim().length < 2) return;
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      void api<CatalogWine[]>(`/api/v1/wines/catalog?q=${encodeURIComponent(query.trim())}&limit=8`, { signal: controller.signal })
        .then(setCatalog)
        .catch(() => { if (!controller.signal.aborted) setSearchError(it ? "Ricerca non disponibile. Puoi inserire il vino a mano." : "Search unavailable. You can enter the wine manually."); });
    }, 250);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [query, mode, it]);

  function applyCandidate(candidate: WineImageRecognitionCandidate) {
    setIdentity({ ...blankWine(), name: [candidate.wine_name, candidate.cuvee].filter(Boolean).join(" "), producer: candidate.producer || candidate.estate, vintage: candidate.vintage, type: candidate.wine_type, region: candidate.region, appellation: candidate.appellation });
  }

  async function scan(file: File) {
    setBusy(true); setError(""); setRecognition(null);
    try {
      const data = new FormData();
      data.append("image", file); data.append("locale", locale);
      const result = await api<WineImageRecognitionResult>("/api/v1/wines/catalog/recognize-bottle", { method: "POST", body: data });
      setRecognition(result);
      if (result.status === "recognized" || result.status === "ambiguous") applyCandidate(result);
      else setError(it ? "Etichetta non riconosciuta. Riprova o inserisci il vino a mano." : "Label not recognized. Try again or enter the wine manually.");
    } catch (cause) { setError(cause instanceof Error ? cause.message : t("recognitionCouldNotIdentify")); }
    finally { setBusy(false); }
  }

  async function selectCellar(wine: Wine) {
    setBusy(true); setError("");
    try { setSelected(await api<Wine>(`/api/v1/wines/${wine.id}`)); }
    catch (cause) { setError(cause instanceof Error ? cause.message : t("unknownError")); }
    finally { setBusy(false); }
  }

  async function save() {
    if (busy || saved) return;
    setBusy(true); setError("");
    try {
      const payload = { ...draft, consumed_at: draft.consumed_at || undefined, tasting_rating: Number(draft.tasting_rating), storage_allocation_id: draft.storage_allocation_id || undefined };
      let updated: Wine | undefined;
      if (mode === "cellar" && selected) {
        updated = await api<Wine>(`/api/v1/wines/${selected.id}/consume`, { method: "POST", body: JSON.stringify(payload) });
      } else if (mode === "external") {
        const external: StandaloneWineTastingCreate = { ...identity, ...payload, name: identity.name.trim(), producer: identity.producer.trim(), vintage: identity.vintage.trim() };
        await api("/api/v1/wishlist/tastings", { method: "POST", body: JSON.stringify(external) });
      } else return;
      setSaved(true);
      onSaved(updated);
    } catch (cause) { setError(cause instanceof Error ? cause.message : (it ? "Impossibile salvare la bevuta." : "Unable to save tasting.")); }
    finally { setBusy(false); }
  }

  const matching = <T extends { name: string; producer: string; vintage?: string }>(items: T[]) => items.filter(item => `${item.name} ${item.producer} ${item.vintage || ""}`.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase())).slice(0, 8);
  function useWine(item: CatalogWine | WishlistItem | Wine) {
    setIdentity({ ...blankWine(), name: item.name, producer: item.producer, vintage: "vintage" in item ? item.vintage : "", format: item.format, type: item.type, region: item.region, appellation: item.appellation, ...("wishlist_list_id" in item ? { wishlist_item_id: item.id } : {}) });
    setQuery(""); setRecognition(null);
  }
  const title = it ? "Registra bevuta" : "Record a tasting";
  const identityField = (key: "name" | "producer" | "vintage", label: string, maxLength: number) => <label><span>{label}</span><input required={key === "name"} maxLength={maxLength} value={identity[key]} onChange={event => setIdentity(current => ({ ...current, [key]: event.target.value, wishlist_item_id: undefined }))} /></label>;

  return createPortal(<dialog ref={dialog} className="record-tasting-dialog" aria-labelledby="record-tasting-title" onCancel={event => { event.preventDefault(); if (!busy) onClose(); }}>
    <header><h2 id="record-tasting-title">{title}</h2><button type="button" className="secondary" aria-label={t("close")} disabled={busy} onClick={onClose}>×</button></header>
    {error ? <p role="alert" className="error">{error}</p> : null}
    {saved ? <section className="record-tasting-success">
      <h3>{it ? "Bevuta salvata nello Storico" : "Tasting saved in History"}</h3>
      <p>{selected ? (it ? "La quantità in cantina è stata aggiornata." : "Your cellar quantity has been updated.") : (it ? "Il tuo ricordo è al sicuro. Puoi completarlo nello Storico quando vuoi." : "Your memory is saved. You can add details in History any time.")}</p>
      {mode === "external" && !identity.wishlist_item_id ? <><p>{it ? "Vuoi ricordarti di acquistare questo vino?" : "Want to remember to buy this wine?"}</p><button type="button" onClick={() => onWishlist(identity)}>{it ? "Aggiungi alla wishlist" : "Add to wishlist"}</button></> : null}
      <button type="button" className="secondary" onClick={onClose}>{it ? "Fatto" : "Done"}</button>
    </section> : mode === "choice" ? <section className="record-tasting-choices">
      <h3>{it ? "Quale vino stai bevendo?" : "Which wine are you drinking?"}</h3>
      <button type="button" className="secondary" onClick={() => setMode("cellar")}><strong>{it ? "Dalla mia cantina" : "From my cellar"}</strong><span>{it ? "Seleziona un vino e scala una bottiglia." : "Select a wine and deduct one bottle."}</span></button>
      <button type="button" className="secondary" onClick={() => setMode("external")}><strong>{it ? "Un altro vino" : "Another wine"}</strong><span>{it ? "Al ristorante, da amici o a una degustazione. La tua cantina resta invariata." : "At a restaurant, with friends or at a tasting. Your cellar stays unchanged."}</span></button>
    </section> : <form onSubmit={event => { event.preventDefault(); void save(); }}>
      <fieldset disabled={busy}>
        <button type="button" className="secondary" onClick={() => { setMode("choice"); setSelected(null); setQuery(""); setError(""); }}>{it ? "← Cambia provenienza" : "← Change source"}</button>
        <h3>{mode === "external" ? (it ? "Un altro vino" : "Another wine") : (it ? "Dalla mia cantina" : "From my cellar")}</h3>
        {mode === "external" ? <>
          {canRecognize ? <><button type="button" onClick={() => photo.current?.click()}>{it ? "Fotografa l’etichetta" : "Photograph the label"}</button><input ref={photo} type="file" accept="image/*" capture="environment" hidden aria-label={it ? "Foto etichetta" : "Label photo"} onChange={event => { const file = event.target.files?.[0]; if (file) void scan(file); event.target.value = ""; }} /><small>{it ? "Riconoscimento AI: verifica i dati prima di salvare." : "AI recognition: check the details before saving."}</small></> : null}
          {recognition && (recognition.status === "recognized" || recognition.status === "ambiguous") ? <section className="record-tasting-results"><p>{it ? "Controlla e conferma i dati qui sotto." : "Check and confirm the details below."}</p>{recognition.alternative_candidates.map((candidate, index) => <button type="button" className="secondary" key={index} onClick={() => applyCandidate(candidate)}>{[candidate.producer, candidate.wine_name, candidate.vintage].filter(Boolean).join(" · ")}</button>)}</section> : null}
        </> : null}
        {!selected ? <>
          <label><span>{it ? "Cerca un vino" : "Search for a wine"}</span><input type="search" value={query} onChange={event => { setQuery(event.target.value); setSearchError(""); }} placeholder={it ? "Nome o produttore" : "Name or producer"} /></label>
          {searchError ? <small role="status">{searchError}</small> : null}
          <div className="record-tasting-results">
            {mode === "cellar" ? matching(wines.filter(wine => isWinePhysicallyInCellar(wine) && wine.quantity > 0)).map(wine => <button type="button" className="secondary" key={wine.id} onClick={() => void selectCellar(wine)}>{[wine.name, wine.producer, wine.vintage].filter(Boolean).join(" · ")} <small>{wine.quantity} {it ? "bottiglie" : "bottles"}</small></button>) : query.trim().length >= 2 ? <>
              {matching(wishlist).map(item => <button type="button" className="secondary" key={item.id} onClick={() => useWine(item)}>{[item.name, item.producer, item.vintage].filter(Boolean).join(" · ")} <small>Wishlist</small></button>)}
              {matching(wines).map(item => <button type="button" className="secondary" key={item.id} onClick={() => useWine(item)}>{[item.name, item.producer, item.vintage].filter(Boolean).join(" · ")} <small>{it ? "Già conosciuto" : "Known wine"}</small></button>)}
              {catalog.map((item, index) => <button type="button" className="secondary" key={item.id || index} onClick={() => useWine(item)}>{[item.name, item.producer].filter(Boolean).join(" · ")} <small>{it ? "Catalogo" : "Catalog"}</small></button>)}
            </> : null}
          </div>
          {mode === "cellar" && !matching(wines.filter(wine => isWinePhysicallyInCellar(wine) && wine.quantity > 0)).length ? <p>{it ? "Nessun vino disponibile in cantina. Puoi registrare un altro vino." : "No available cellar wines. You can record another wine."}</p> : null}
        </> : <section><strong>{[selected.name, selected.producer, selected.vintage].filter(Boolean).join(" · ")}</strong><p>{it ? "Verrà scalata una bottiglia dalla cantina." : "One bottle will be deducted from your cellar."}</p><button type="button" className="secondary" onClick={() => setSelected(null)}>{it ? "Cambia vino" : "Change wine"}</button></section>}
        {mode === "external" ? <section className="record-tasting-fields">
          <p>{it ? "Oppure inserisci i dati a mano. Basta il nome; puoi aggiungere produttore e annata se li conosci." : "Or enter details manually. Only the name is required; add producer and vintage if known."}</p>
          {identityField("name", it ? "Nome del vino" : "Wine name", 200)}
          {identityField("producer", it ? "Produttore" : "Producer", 200)}
          {identityField("vintage", it ? "Annata (se nota)" : "Vintage (if known)", 16)}
        </section> : null}
        {mode === "external" || selected ? <>
          <label><span>{it ? "Data" : "Date"}</span><input type="date" required value={draft.consumed_at} onChange={event => setDraft(current => ({ ...current, consumed_at: event.target.value }))} /></label>
          <label><span>{it ? "Ti è piaciuto?" : "Did you enjoy it?"}</span><TastingEnjoymentInput disabled={busy} value={draft.tasting_enjoyment} t={t} onChange={tasting_enjoyment => setDraft(current => ({ ...current, tasting_enjoyment }))} /></label>
          <label><span>{it ? "Voto (facoltativo)" : "Score (optional)"}</span><select value={draft.tasting_rating} onChange={event => setDraft(current => ({ ...current, tasting_rating: event.target.value }))}>{Array.from({ length: 7 }, (_, rating) => <option key={rating} value={rating}>{rating ? `${rating}/6` : "—"}</option>)}</select></label>
          <label><span>{it ? "Un ricordo di questo vino" : "A memory of this wine"}</span><textarea rows={2} maxLength={5000} value={draft.note} onChange={event => setDraft(current => ({ ...current, note: event.target.value }))} /></label>
          {(selected?.storage_allocations || []).length > 1 ? <label><span>{it ? "Preleva da" : "Take from"}</span><select required value={draft.storage_allocation_id} onChange={event => setDraft(current => ({ ...current, storage_allocation_id: event.target.value }))}><option value="">—</option>{selected?.storage_allocations?.map(allocation => <option key={allocation.id} value={allocation.id}>{allocation.location_name || (it ? "Da collocare" : "Unassigned")}{allocation.bin_name ? ` · ${allocation.bin_name}` : ""} ({allocation.quantity})</option>)}</select></label> : null}
          <details><summary>{it ? "Aggiungi dettagli" : "Add details"}</summary><div className="record-tasting-fields">{([['tasting_occasion', it ? 'Occasione' : 'Occasion', 200], ['tasting_pairing', it ? 'Abbinamento' : 'Pairing', 300], ['tasting_companions', it ? 'Con chi' : 'With', 300]] as const).map(([key, label, maxLength]) => <label key={key}><span>{label}</span><input maxLength={maxLength} value={draft[key]} onChange={event => setDraft(current => ({ ...current, [key]: event.target.value }))} /></label>)}</div></details>
          <button type="submit" disabled={mode === "external" && !identity.name.trim()}>{it ? "Salva bevuta" : "Save tasting"}</button>
        </> : null}
      </fieldset>
    </form>}
    {busy ? <p role="status">{it ? "Operazione in corso…" : "Working…"}</p> : null}
  </dialog>, document.body);
}
