import { useState, type ChangeEvent } from "react";
import { AppIcon } from "./AppIcon";
import { ButtonBusyContent } from "./AppUi";
import { runCatalogPhotoScan } from "../services/catalogPhotoScan";
import { usePhotoPreviews } from "../utils/photoPreview";
import type { CatalogPhotoBottle, CatalogPhotoScanResult, CatalogWine, Locale } from "../types";
import "./AdminCatalogPhotoEnrichment.css";

const MAX_PHOTOS = 3;
const PREVIEW_SIDE = 1600;

type Mode = "shelf" | "close";
type Props = { locale: Locale; disabled?: boolean };

const FIELD_LABELS: Record<string, [string, string]> = {
  producer: ["produttore", "producer"],
  region: ["regione", "region"],
  appellation: ["denominazione", "appellation"],
  type: ["tipo", "type"],
  country: ["paese", "country"],
  grapes_text: ["vitigni", "grapes"],
};

const TYPE_LABELS: Record<string, [string, string]> = {
  Red: ["Rosso", "Red"],
  White: ["Bianco", "White"],
  Rose: ["Rosato", "Rosé"],
  Sparkling: ["Spumante", "Sparkling"],
  Sweet: ["Dolce", "Sweet"],
  Fortified: ["Fortificato", "Fortified"],
};

const STATUS_LABELS: Record<CatalogPhotoBottle["status"], [string, string]> = {
  new: ["Nuovo", "New"],
  known: ["In catalogo", "In the catalog"],
  pending: ["Da approvare", "Awaiting approval"],
  uncertain: ["Da controllare", "Check"],
};

/** The part of the photo showing this bottle (or its label), as ratios of the photo. */
function cropOf(bottle: CatalogPhotoBottle, aspect: number) {
  const centerX = bottle.x + bottle.width / 2;
  if (bottle.bottle_bottom > bottle.bottle_top) {
    const top = Math.max(0, bottle.bottle_top - 0.02);
    const bottom = Math.min(1, bottle.bottle_bottom + 0.02);
    // A bottle is about a third as wide as it is tall; the photo's aspect turns that into ratios.
    const width = Math.min(1, Math.max(bottle.width * 1.5, ((bottom - top) * 0.42) / aspect));
    return { left: Math.min(Math.max(centerX - width / 2, 0), 1 - width), top, width, height: bottom - top };
  }
  const width = Math.min(1, bottle.width * 1.6);
  const height = Math.min(1, bottle.height * 1.6);
  const centerY = bottle.y + bottle.height / 2;
  return {
    left: Math.min(Math.max(centerX - width / 2, 0), 1 - width),
    top: Math.min(Math.max(centerY - height / 2, 0), 1 - height),
    width,
    height,
  };
}

function BottleCrop({ url, bottle, size }: { url: string; bottle: CatalogPhotoBottle; size?: [number, number] }) {
  if (!url || !size) return <span className="catalog-photo-crop is-empty" aria-hidden="true" />;
  const crop = cropOf(bottle, size[0] / size[1]);
  const ratio = (crop.width * size[0]) / Math.max(crop.height * size[1], 1);
  const position = (start: number, length: number) => (length >= 1 ? 0 : (start / (1 - length)) * 100);
  return (
    <span
      className="catalog-photo-crop"
      aria-hidden="true"
      style={{
        aspectRatio: String(Math.min(Math.max(ratio, 0.3), 1.4)),
        backgroundImage: `url("${url}")`,
        backgroundSize: `${100 / crop.width}% ${100 / crop.height}%`,
        backgroundPosition: `${position(crop.left, crop.width)}% ${position(crop.top, crop.height)}%`,
      }}
    />
  );
}

function wineTitle(item: Pick<CatalogWine, "producer" | "name">) {
  return [item.producer, item.name].filter(Boolean).join(" · ");
}

/** Operations → catalogue: read the labels on shop or close-up photos and see what the catalog lacks. */
export default function AdminCatalogPhotoEnrichment({ locale, disabled = false }: Props) {
  const it = locale === "it";
  const pick = (pair: [string, string]) => pair[it ? 0 : 1];
  const [mode, setMode] = useState<Mode>("shelf");
  const [photos, setPhotos] = useState<File[]>([]);
  const previews = usePhotoPreviews(photos, PREVIEW_SIDE);
  const [sizes, setSizes] = useState<Record<string, [number, number]>>({});
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState("");
  const [error, setError] = useState("");
  const [result, setResult] = useState<CatalogPhotoScanResult | null>(null);

  const choosePhotos = (event: ChangeEvent<HTMLInputElement>) => {
    const chosen = Array.from(event.target.files ?? []).filter((file) => file.type.startsWith("image/"));
    event.target.value = "";
    if (!chosen.length) return;
    setPhotos((current) => [...current, ...chosen].slice(0, MAX_PHOTOS));
    setResult(null);
    setError("");
  };
  const removePhoto = (index: number) => {
    setPhotos((current) => current.filter((_, position) => position !== index));
    setResult(null);
  };
  const read = async () => {
    if (!photos.length || busy) return;
    const form = new FormData();
    form.append("mode", mode);
    for (const photo of photos) form.append("images", photo);
    setBusy(true);
    setError("");
    setResult(null);
    try {
      setResult(await runCatalogPhotoScan(form, locale, setProgress));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setBusy(false);
      setProgress("");
    }
  };

  const bottles = result?.bottles ?? [];
  const counts = {
    new: bottles.filter((bottle) => bottle.status === "new").length,
    incomplete: bottles.filter((bottle) => bottle.status === "known" && bottle.missing_fields.length).length,
    pending: bottles.filter((bottle) => bottle.status === "pending").length,
    uncertain: bottles.filter((bottle) => bottle.status === "uncertain").length,
    complete: bottles.filter((bottle) => bottle.status === "known" && !bottle.missing_fields.length).length,
  };
  const summary: [number, string, string][] = [
    [counts.new, it ? "nuovi" : "new", "new"],
    [counts.incomplete, it ? "da completare" : "to complete", "incomplete"],
    [counts.pending, it ? "da approvare" : "awaiting approval", "pending"],
    [counts.uncertain, it ? "da controllare" : "to check", "uncertain"],
    [counts.complete, it ? "già completi" : "already complete", "complete"],
  ];

  return (
    <section className="settings-card settings-card-wide catalog-photo" aria-labelledby="catalog-photo-title">
      <div className="settings-card-heading">
        <div>
          <span>{it ? "Catalogo condiviso" : "Shared catalog"}</span>
          <h3 id="catalog-photo-title">{it ? "Arricchisci da foto" : "Enrich from photos"}</h3>
          <small>
            {it
              ? "Fotografa uno scaffale o qualche bottiglia: Vinaris legge le etichette e ti mostra quali vini mancano nel catalogo e quali schede sono incomplete. La lettura usa la chiave di Vinaris, non i tuoi crediti."
              : "Photograph a shelf or a few bottles: Vinaris reads the labels and shows which wines the catalog lacks and which entries are incomplete. Reading uses the Vinaris key, not your credits."}
          </small>
        </div>
      </div>

      <div className="catalog-photo-modes" role="radiogroup" aria-label={it ? "Tipo di foto" : "Photo type"}>
        {(["shelf", "close"] as const).map((value) => (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={mode === value}
            className={mode === value ? "is-selected" : ""}
            onClick={() => { setMode(value); setResult(null); }}
            disabled={busy}
          >
            <strong>{value === "shelf" ? (it ? "Scaffale" : "Shelf") : (it ? "Bottiglie da vicino" : "Close-up bottles")}</strong>
            <span>
              {value === "shelf"
                ? (it ? "Molte etichette, lette a sezioni" : "Many labels, read in sections")
                : (it ? "Una o poche bottiglie: foto migliori" : "One or a few bottles: better photos")}
            </span>
          </button>
        ))}
      </div>

      <div className="catalog-photo-picker">
        {photos.map((photo, index) => (
          <figure key={index} className="catalog-photo-thumb">
            {previews[index] ? <img src={previews[index]} alt={photo.name} /> : <span className="catalog-photo-thumb-pending" />}
            <button type="button" className="secondary compact" onClick={() => removePhoto(index)} disabled={busy} aria-label={it ? `Togli ${photo.name}` : `Remove ${photo.name}`}>
              ×
            </button>
          </figure>
        ))}
        {photos.length < MAX_PHOTOS ? (
          <>
            <label className="catalog-photo-add">
              <AppIcon name="camera" variant="ai" size="1.6em" />
              <span>{photos.length ? (it ? "Scatta un'altra" : "Take another") : (it ? "Scatta" : "Take a photo")}</span>
              <small>{it ? "Fotocamera" : "Camera"}</small>
              <input type="file" accept="image/*" capture="environment" onChange={choosePhotos} disabled={busy || disabled} />
            </label>
            <label className="catalog-photo-add">
              <AppIcon name="import" size="1.6em" />
              <span>{it ? "Carica" : "Upload"}</span>
              <small>{it ? `Dalla galleria, fino a ${MAX_PHOTOS}` : `From the gallery, up to ${MAX_PHOTOS}`}</small>
              <input type="file" accept="image/*" multiple onChange={choosePhotos} disabled={busy || disabled} />
            </label>
          </>
        ) : null}
      </div>

      <div className="catalog-photo-actions">
        <button type="button" onClick={() => void read()} disabled={!photos.length || busy || disabled}>
          <ButtonBusyContent busy={busy} idleLabel={it ? "Leggi le etichette" : "Read the labels"} busyLabel={it ? "Leggo…" : "Reading…"} ai />
        </button>
        {progress ? <p className="catalog-photo-progress" role="status">{progress}</p> : null}
      </div>
      {error ? <p className="catalog-photo-error" role="alert">{error}</p> : null}

      {result ? (
        <div className="catalog-photo-result" aria-live="polite">
          {bottles.length ? (
            <>
              <ul className="catalog-photo-summary" aria-label={it ? "Riepilogo" : "Summary"}>
                {summary.filter(([count]) => count).map(([count, label, key]) => (
                  <li key={key} className={`is-${key}`}><strong>{count}</strong> {label}</li>
                ))}
              </ul>
              <ol className="catalog-photo-list">
                {bottles.map((bottle, index) => {
                  const url = previews[bottle.image_index] ?? "";
                  const complete = bottle.status === "known" && !bottle.missing_fields.length;
                  const statusKey = complete ? "complete" : bottle.status === "known" ? "incomplete" : bottle.status;
                  return (
                    <li key={index} className={`catalog-photo-item is-${statusKey}`}>
                      <BottleCrop url={url} bottle={bottle} size={sizes[url]} />
                      {url && !sizes[url] ? (
                        <img className="catalog-photo-probe" src={url} alt="" onLoad={(event) => {
                          const image = event.currentTarget;
                          setSizes((current) => ({ ...current, [url]: [image.naturalWidth, image.naturalHeight] }));
                        }} />
                      ) : null}
                      <div className="catalog-photo-item-body">
                        <span className={`catalog-photo-status is-${statusKey}`}>
                          {complete ? (it ? "Completo" : "Complete") : pick(STATUS_LABELS[bottle.status])}
                        </span>
                        <strong>{[wineTitle(bottle), bottle.vintage].filter(Boolean).join(" ")}</strong>
                        <span className="catalog-photo-meta">
                          {[TYPE_LABELS[bottle.wine_type] ? pick(TYPE_LABELS[bottle.wine_type]) : bottle.wine_type, bottle.appellation, bottle.region, bottle.country].filter(Boolean).join(" · ")
                            || (it ? "Solo il nome è leggibile" : "Only the name is legible")}
                        </span>
                        {bottle.status === "known" && bottle.missing_fields.length ? (
                          <span className="catalog-photo-note">
                            {it ? "Manca: " : "Missing: "}
                            {bottle.missing_fields.map((field) => pick(FIELD_LABELS[field] ?? [field, field])).join(", ")}
                          </span>
                        ) : null}
                        {bottle.status === "pending" && bottle.entry ? (
                          <span className="catalog-photo-note">{it ? "Scheda già proposta: " : "Entry already proposed: "}{wineTitle(bottle.entry)}</span>
                        ) : null}
                        {bottle.status === "uncertain" && bottle.candidates.length ? (
                          <span className="catalog-photo-note">{it ? "Forse: " : "Maybe: "}{bottle.candidates.map(wineTitle).join("; ")}</span>
                        ) : null}
                        {bottle.confidence === "low" ? (
                          <span className="catalog-photo-note is-warning">{it ? "Etichetta letta con poca sicurezza" : "Label read with low confidence"}</span>
                        ) : null}
                      </div>
                    </li>
                  );
                })}
              </ol>
            </>
          ) : (
            <p className="empty-state">
              {it
                ? "Nessuna etichetta leggibile. Avvicinati, scatta con più luce e tieni il telefono dritto."
                : "No legible labels. Move closer, shoot with more light and hold the phone straight."}
            </p>
          )}
          <p className="catalog-photo-footnote">
            {result.unread_sections
              ? (it ? `Parti della foto non lette: ${result.unread_sections}. ` : `Photo parts not read: ${result.unread_sections}. `)
              : ""}
            {it ? "Costo della lettura" : "Reading cost"}: ${Number(result.estimated_cost_usd).toFixed(3)}
          </p>
        </div>
      ) : null}
    </section>
  );
}
