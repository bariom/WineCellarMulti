import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { BottlePhotoConfirmResult, BottlePhotoRow, Locale } from "../types";
import { api } from "../services/api";
import { runBottlePhotoScan } from "../services/bottlePhotoScan";
import { AppIcon } from "./AppIcon";
import { AiActivity } from "./AiActivity";
import { formatAiBudget } from "./panelSupport";
import "./BottlePhotoImport.css";

const MAX_PHOTOS = 3;

type ReviewRow = BottlePhotoRow & {
  key: string;
  vintageText: string;
  quantityText: string;
  priceText: string;
  addToExisting: boolean;
};

const THUMB_SIDE = 320;

/**
 * A small preview of a photo. A phone camera file (50 MP and more on recent
 * phones) shown as-is in a thumbnail makes mobile browsers drop and re-decode it
 * over and over, and the picture flickers; the original still goes to the AI.
 */
async function photoThumbnail(file: File): Promise<string> {
  if (typeof createImageBitmap !== "function") return URL.createObjectURL(file);
  try {
    const probe = await createImageBitmap(file, { imageOrientation: "from-image" });
    const scale = Math.min(1, THUMB_SIDE / Math.max(probe.width, probe.height));
    const width = Math.max(1, Math.round(probe.width * scale));
    const height = Math.max(1, Math.round(probe.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    canvas.getContext("2d")?.drawImage(probe, 0, 0, width, height);
    probe.close();
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.82));
    return blob ? URL.createObjectURL(blob) : URL.createObjectURL(file);
  } catch {
    return URL.createObjectURL(file);
  }
}

/** One light preview per photo, made once and kept while the photo stays in the list. */
function usePhotoThumbnails(photos: File[]) {
  const made = useRef(new Map<File, string>());
  const [urls, setUrls] = useState<Map<File, string>>(new Map());
  useEffect(() => {
    let cancelled = false;
    const cache = made.current;
    for (const [file, url] of cache) {
      if (!photos.includes(file)) { URL.revokeObjectURL(url); cache.delete(file); }
    }
    setUrls(new Map(cache));
    for (const file of photos) {
      if (cache.has(file)) continue;
      void photoThumbnail(file).then((url) => {
        if (cancelled || !photos.includes(file) || cache.has(file)) { URL.revokeObjectURL(url); return; }
        cache.set(file, url);
        setUrls(new Map(cache));
      });
    }
    return () => { cancelled = true; };
  }, [photos]);
  useEffect(() => () => { made.current.forEach((url) => URL.revokeObjectURL(url)); made.current.clear(); }, []);
  return urls;
}

/** The label of one wine, cut from the user's own photo for the review. */
function LabelThumb({ file, row }: { file: File | undefined; row: BottlePhotoRow }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    let cancelled = false;
    if (!file || !canvas.current || typeof createImageBitmap !== "function") return;
    void createImageBitmap(file, { imageOrientation: "from-image" }).then((bitmap) => {
      const target = canvas.current;
      if (cancelled || !target) return;
      const context = target.getContext("2d");
      if (!context) return;
      // A little more than the label, so the bottle is recognisable.
      const centerX = (row.x + row.width / 2) * bitmap.width;
      const centerY = (row.y + row.height / 2) * bitmap.height;
      const half = Math.max(row.width * bitmap.width, row.height * bitmap.height * 0.75) * 0.85;
      const width = half * 1.5;
      const height = half * 2;
      context.drawImage(bitmap, centerX - width / 2, centerY - height / 2, width, height, 0, 0, target.width, target.height);
      bitmap.close();
    }).catch(() => undefined);
    return () => { cancelled = true; };
  }, [file, row.x, row.y, row.width, row.height]);
  return <canvas ref={canvas} className="bottle-photo-thumb" width={72} height={96} aria-hidden="true" />;
}

export default function BottlePhotoImport({ locale, canAnalyze, eventGuest = false, onActivate, onClose, onImported, onCompleteWithAi }: {
  locale: Locale;
  canAnalyze: boolean;
  /** An event guest: the bottles live on the event page until the visit ends, or for good with an account. */
  eventGuest?: boolean;
  onActivate: () => void;
  onClose: () => void;
  onImported: () => Promise<void>;
  /** Run the AI completion on the new wines the catalog did not know. */
  onCompleteWithAi: (wineIds: string[]) => void;
}) {
  const it = locale === "it";
  const dialog = useRef<HTMLDialogElement>(null);
  const camera = useRef<HTMLInputElement>(null);
  const gallery = useRef<HTMLInputElement>(null);
  const [photos, setPhotos] = useState<File[]>([]);
  const [step, setStep] = useState<"pick" | "reading" | "review" | "done">("pick");
  const [progress, setProgress] = useState("");
  const [rows, setRows] = useState<ReviewRow[]>([]);
  // What the last recognition cost, all its photos together.
  const [aiCost, setAiCost] = useState<{ usd: number; model: string } | null>(null);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState<(BottlePhotoConfirmResult & { aiWineIds: string[] }) | null>(null);
  const thumbnails = usePhotoThumbnails(photos);

  useEffect(() => {
    dialog.current?.showModal();
  }, []);

  function addPhotos(files: FileList | null) {
    if (!files) return;
    // Copy now: the input is emptied right after, and its FileList with it.
    const added = Array.from(files).filter((file) => file.type.startsWith("image/"));
    setError("");
    setPhotos((current) => [...current, ...added].slice(0, MAX_PHOTOS));
  }

  async function read() {
    if (!photos.length) return;
    setStep("reading");
    setError("");
    const formData = new FormData();
    photos.forEach((photo) => formData.append("images", photo));
    try {
      const result = await runBottlePhotoScan(formData, locale, setProgress);
      setAiCost({ usd: Number(result.estimated_cost_usd || 0), model: result.model });
      setRows(result.rows.map((row, index) => ({
        ...row,
        key: `${index}-${row.name}`,
        vintageText: row.vintage,
        quantityText: String(row.quantity),
        priceText: "",
        addToExisting: Boolean(row.existing_wine),
      })));
      setStep("review");
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : (it ? "Non è stato possibile leggere le foto." : "The photos could not be read."));
      setStep("pick");
    }
  }

  const update = (key: string, patch: Partial<ReviewRow>) => setRows((current) => current.map((row) => (row.key === key ? { ...row, ...patch } : row)));
  const quantity = (row: ReviewRow) => Math.max(Number.parseInt(row.quantityText, 10) || 0, 0);
  const valid = rows.filter((row) => row.name.trim() && quantity(row) > 0);
  const totalBottles = valid.reduce((sum, row) => sum + quantity(row), 0);

  async function confirm() {
    if (!valid.length || saving) return;
    setSaving(true);
    setError("");
    try {
      const result = await api<BottlePhotoConfirmResult>("/api/v1/bottle-photos/confirm", {
        method: "POST",
        body: JSON.stringify({
          locale,
          rows: valid.map((row) => ({
            name: row.name.trim(),
            producer: row.producer.trim(),
            vintage: row.vintageText.trim(),
            format: row.format,
            type: row.catalog?.type || row.style,
            region: row.catalog?.region || row.region,
            appellation: row.catalog?.appellation || "",
            quantity: quantity(row),
            price: row.priceText.trim() ? Number(row.priceText.replace(",", ".")) : null,
            existing_wine_id: row.addToExisting && row.existing_wine ? row.existing_wine.wine_id : null,
          })),
        }),
      });
      await onImported();
      const saved = valid.slice(0, result.saved_rows);
      // New wines the catalog did not know are the ones worth completing with AI.
      const newRows = saved.filter((row) => !(row.addToExisting && row.existing_wine));
      const aiWineIds = result.created_wine_ids.filter((_, index) => !newRows[index]?.catalog);
      if (result.limit_reached) {
        // Keep what is not saved yet, so nothing is sent twice.
        const savedKeys = new Set(saved.map((row) => row.key));
        setRows((current) => current.filter((row) => !savedKeys.has(row.key)));
        setError(it
          ? `Limite di etichette del piano gratuito raggiunto: ho aggiunto ${result.saved_rows} vini. Passa a Riserva per aggiungere gli altri.`
          : `Free plan label limit reached: ${result.saved_rows} wines were added. Upgrade to Riserva to add the others.`);
        setDone({ ...result, aiWineIds });
        return;
      }
      setDone({ ...result, aiWineIds });
      setStep("done");
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : (it ? "Non è stato possibile aggiungere i vini." : "The wines could not be added."));
    } finally {
      setSaving(false);
    }
  }

  return createPortal(
    <dialog ref={dialog} className="bottle-photo-import" aria-labelledby="bottle-photo-title" onCancel={(event) => { event.preventDefault(); if (step !== "reading" && !saving) onClose(); }}>
      <header className="bottle-photo-header">
        <div>
          <p>{it ? "Inserimento veloce" : "Quick add"}</p>
          <h2 id="bottle-photo-title">{it ? "Fotografa le tue bottiglie" : "Photograph your bottles"}</h2>
        </div>
        <button type="button" className="secondary compact" onClick={onClose} disabled={step === "reading" || saving}>{it ? "Chiudi" : "Close"}</button>
      </header>

      {step === "pick" || step === "reading" ? <section className="bottle-photo-pick">
        {step === "pick" ? <>
          <ul className="bottle-photo-tips">
            <li>{it ? "Metti le bottiglie in piedi, con le etichette verso di te." : "Stand the bottles up, labels facing you."}</li>
            <li>{it ? "Fino a 20 bottiglie per foto, con buona luce e senza riflessi." : "Up to 20 bottles per photo, in good light without glare."}</li>
            <li>{it ? "Più foto per gruppi diversi: non rifotografare le stesse bottiglie." : "Several photos for different groups: do not photograph the same bottles twice."}</li>
          </ul>
          {!canAnalyze ? <div className="bottle-photo-locked">
            <p>{it ? "Il riconoscimento usa il credito AI. Attiva un AI Pack o Vinaris Riserva per continuare." : "Recognition uses AI credit. Activate an AI Pack or Vinaris Riserva to continue."}</p>
            <button type="button" onClick={onActivate}>{it ? "Scopri le opzioni" : "See the options"}</button>
          </div> : <div className="bottle-photo-sources">
            <button type="button" onClick={() => camera.current?.click()} disabled={photos.length >= MAX_PHOTOS}><AppIcon name="camera" />{it ? "Scatta una foto" : "Take a photo"}</button>
            <button type="button" className="secondary" onClick={() => gallery.current?.click()} disabled={photos.length >= MAX_PHOTOS}>{it ? "Scegli dalla galleria" : "Choose from gallery"}</button>
            <input ref={camera} type="file" accept="image/*" capture="environment" hidden onChange={(event) => { addPhotos(event.target.files); event.target.value = ""; }} />
            <input ref={gallery} type="file" accept="image/*" multiple hidden onChange={(event) => { addPhotos(event.target.files); event.target.value = ""; }} />
          </div>}
        </> : null}
        {photos.length ? <ol className={`bottle-photo-previews${step === "reading" ? " is-reading" : ""}`} aria-label={it ? "Foto delle bottiglie" : "Bottle photos"}>
          {photos.map((photo, index) => <li key={`${photo.name}-${photo.lastModified}-${index}`}>
            {thumbnails.get(photo) ? <img src={thumbnails.get(photo)} alt={it ? `Foto ${index + 1}` : `Photo ${index + 1}`} decoding="async" /> : <span className="bottle-photo-preview-pending" role="img" aria-label={it ? `Foto ${index + 1}` : `Photo ${index + 1}`} />}
            {step === "pick" ? <button type="button" className="secondary compact" aria-label={it ? `Rimuovi foto ${index + 1}` : `Remove photo ${index + 1}`} onClick={() => setPhotos((current) => current.filter((_, position) => position !== index))}>×</button> : null}
          </li>)}
        </ol> : null}
        {step === "reading" ? <AiActivity locale={locale} label={progress || (it ? "Leggo le etichette…" : "Reading the labels…")} detail={it ? "Riconosco i vini e conto le bottiglie uguali." : "Recognising the wines and counting identical bottles."} /> : null}
        {error ? <p className="bottle-photo-error" role="alert">{error}</p> : null}
        {step === "pick" && canAnalyze ? <button type="button" className="bottle-photo-primary" onClick={() => void read()} disabled={!photos.length}>
          {it ? `Riconosci le bottiglie${photos.length > 1 ? ` (${photos.length} foto)` : ""}` : `Recognise the bottles${photos.length > 1 ? ` (${photos.length} photos)` : ""}`}
        </button> : null}
      </section> : null}

      {step === "review" ? <section className="bottle-photo-review">
        <p className="bottle-photo-summary">{rows.length
          ? (it ? `Ho trovato ${rows.length} ${rows.length === 1 ? "vino" : "vini"}. Controlla annata e numero di bottiglie, poi aggiungi.` : `I found ${rows.length} ${rows.length === 1 ? "wine" : "wines"}. Check vintage and bottle count, then add.`)
          : (it ? "Non ho riconosciuto etichette leggibili. Riprova con più luce, più vicino alle bottiglie." : "No legible label was recognised. Try again with more light, closer to the bottles.")}</p>
        {aiCost ? <p className="bottle-photo-ai-cost"><span>{it ? "Costo AI" : "AI cost"} {formatAiBudget(aiCost.usd)}</span><small>{aiCost.model}</small></p> : null}
        <ol className="bottle-photo-rows">
          {rows.map((row) => <li key={row.key} className={row.confidence === "low" ? "is-uncertain" : ""}>
            <LabelThumb file={photos[row.image_index]} row={row} />
            <div className="bottle-photo-fields">
              <label className="is-wide"><span>{it ? "Vino" : "Wine"}</span><input value={row.name} onChange={(event) => update(row.key, { name: event.target.value })} /></label>
              <label className="is-wide"><span>{it ? "Produttore" : "Producer"}</span><input value={row.producer} onChange={(event) => update(row.key, { producer: event.target.value })} /></label>
              <label><span>{it ? "Annata" : "Vintage"}</span><input inputMode="numeric" maxLength={4} value={row.vintageText} placeholder={it ? "NV" : "NV"} onChange={(event) => update(row.key, { vintageText: event.target.value })} /></label>
              <label><span>{it ? "Bottiglie" : "Bottles"}</span><span className="bottle-photo-stepper">
                <button type="button" className="secondary compact" aria-label={it ? "Una bottiglia in meno" : "One bottle less"} onClick={() => update(row.key, { quantityText: String(Math.max(quantity(row) - 1, 1)) })}>−</button>
                <input inputMode="numeric" value={row.quantityText} aria-label={it ? "Bottiglie" : "Bottles"} onChange={(event) => update(row.key, { quantityText: event.target.value.replace(/\D/g, "").slice(0, 4) })} />
                <button type="button" className="secondary compact" aria-label={it ? "Una bottiglia in più" : "One bottle more"} onClick={() => update(row.key, { quantityText: String(quantity(row) + 1) })}>+</button>
              </span></label>
              {eventGuest ? null : <label><span>{it ? "Prezzo (facoltativo)" : "Price (optional)"}</span><input inputMode="decimal" value={row.priceText} placeholder="CHF" onChange={(event) => update(row.key, { priceText: event.target.value })} /></label>}
            </div>
            <div className="bottle-photo-badges">
              {row.existing_wine ? <label className="bottle-photo-existing"><input type="checkbox" checked={row.addToExisting} onChange={(event) => update(row.key, { addToExisting: event.target.checked })} />
                <span>{it ? `Già in cantina (${row.existing_wine.quantity} bott.): aggiungi a questo vino` : `Already in the cellar (${row.existing_wine.quantity} btl.): add to this wine`}</span></label> : null}
              {row.catalog ? <span className="is-catalog">{it ? "Dal catalogo" : "From the catalog"}{[row.catalog.region, row.catalog.type].filter(Boolean).length ? ` · ${[row.catalog.region, row.catalog.type].filter(Boolean).join(" · ")}` : ""}</span> : null}
              {row.confidence === "low" ? <span className="is-uncertain">{it ? "Lettura incerta: controlla l'etichetta" : "Uncertain reading: check the label"}</span> : null}
              <button type="button" className="secondary compact bottle-photo-remove" onClick={() => setRows((current) => current.filter((item) => item.key !== row.key))}>{it ? "Togli" : "Remove"}</button>
            </div>
          </li>)}
        </ol>
        {error ? <p className="bottle-photo-error" role="alert">{error}</p> : null}
        <footer className="bottle-photo-footer">
          <button type="button" className="secondary" onClick={() => { setRows([]); setStep("pick"); }} disabled={saving}>{it ? "Altre foto" : "More photos"}</button>
          <button type="button" className="bottle-photo-primary" onClick={() => void confirm()} disabled={!valid.length || saving}>
            {saving ? (it ? "Aggiungo…" : "Adding…") : it
              ? `Aggiungi ${valid.length} ${valid.length === 1 ? "vino" : "vini"} · ${totalBottles} ${totalBottles === 1 ? "bottiglia" : "bottiglie"}`
              : `Add ${valid.length} ${valid.length === 1 ? "wine" : "wines"} · ${totalBottles} ${totalBottles === 1 ? "bottle" : "bottles"}`}
          </button>
        </footer>
      </section> : null}

      {step === "done" && done ? <section className="bottle-photo-done" role="status">
        <AppIcon name="status-delivered" variant="status" />
        <h3>{it ? `${done.bottles} ${done.bottles === 1 ? "bottiglia aggiunta" : "bottiglie aggiunte"}` : `${done.bottles} ${done.bottles === 1 ? "bottle added" : "bottles added"}`}</h3>
        <p>{it
          ? `${done.created_wine_ids.length} ${done.created_wine_ids.length === 1 ? "vino nuovo" : "vini nuovi"}${done.updated_wine_ids.length ? `, ${done.updated_wine_ids.length} ${done.updated_wine_ids.length === 1 ? "vino aggiornato" : "vini aggiornati"}` : ""}. I dati del catalogo sono già compilati.`
          : `${done.created_wine_ids.length} new ${done.created_wine_ids.length === 1 ? "wine" : "wines"}${done.updated_wine_ids.length ? `, ${done.updated_wine_ids.length} updated` : ""}. Catalog data is already filled in.`}</p>
        {eventGuest ? <p className="bottle-photo-guest-note">{it
          ? "Le trovi nella pagina Stasera. Restano fino alla fine della serata, poi vengono eliminate: crea il tuo account per tenerle nella tua cantina."
          : "They are on the Tonight page. They stay until the visit ends, then they are deleted: create your account to keep them in your cellar."}</p> : null}
        {aiCost ? <p className="bottle-photo-ai-cost"><span>{it ? "Costo AI del riconoscimento" : "Recognition AI cost"} {formatAiBudget(aiCost.usd)}</span><small>{aiCost.model}</small></p> : null}
        {done.aiWineIds.length ? <button type="button" onClick={() => { onCompleteWithAi(done.aiWineIds); onClose(); }}>
          <AppIcon name="glass-sparkle" variant="ai" />{it ? (done.aiWineIds.length === 1 ? "Completa con AI il vino non trovato nel catalogo" : `Completa con AI i ${done.aiWineIds.length} vini non trovati nel catalogo`) : (done.aiWineIds.length === 1 ? "Complete with AI the wine not in the catalog" : `Complete with AI the ${done.aiWineIds.length} wines not in the catalog`)}
        </button> : null}
        <div className="bottle-photo-footer">
          <button type="button" className="secondary" onClick={() => { setPhotos([]); setRows([]); setDone(null); setStep("pick"); }}>{it ? "Fotografa altre bottiglie" : "Photograph more bottles"}</button>
          <button type="button" onClick={onClose}>{eventGuest ? (it ? "Torna alla serata" : "Back to tonight") : (it ? "Vai alla cantina" : "Go to the cellar")}</button>
        </div>
      </section> : null}
    </dialog>,
    document.body,
  );
}
