import { useState } from "react";
import { ButtonBusyContent } from "./AppUi";
import { saveCatalogPhotoBottle } from "../services/catalogPhotoScan";
import type { CatalogPhotoBottle, CatalogPhotoSave, CatalogPhotoSaveResult, CatalogWine, Locale } from "../types";

export const TYPE_LABELS: Record<string, [string, string]> = {
  Red: ["Rosso", "Red"],
  White: ["Bianco", "White"],
  Rose: ["Rosato", "Rosé"],
  Sparkling: ["Spumante", "Sparkling"],
  Sweet: ["Dolce", "Sweet"],
  Fortified: ["Fortificato", "Fortified"],
};

const WINDOW_FIELDS = [
  ["drink_from", "Da", "From"],
  ["drink_peak_from", "Picco da", "Peak from"],
  ["drink_peak_to", "Picco fino a", "Peak until"],
  ["drink_to", "Fino a", "Until"],
] as const;

type WindowField = (typeof WINDOW_FIELDS)[number][0];
type Draft = Omit<CatalogPhotoSave, WindowField> & Record<WindowField, string>;

const NEW_ENTRY = "new";

/** The form starts from the catalog entry, completed by the research and then by the label. */
function initialDraft(bottle: CatalogPhotoBottle): Draft {
  const entry = bottle.entry;
  const details = bottle.details?.found ? bottle.details : null;
  const first = (...values: (string | undefined | null)[]) => values.find((value) => value && value.trim())?.trim() ?? "";
  const year = (value: number | null | undefined) => (value ? String(value) : "");
  return {
    entry_id: entry?.id ?? null,
    name: first(entry?.name, details?.name, bottle.name),
    producer: first(entry?.producer, details?.producer, bottle.producer),
    appellation: first(entry?.appellation, details?.appellation, bottle.appellation),
    region: first(entry?.region, details?.region, bottle.region),
    country: first(entry?.country, details?.country, bottle.country),
    type: first(entry?.type, details?.wine_type, bottle.wine_type),
    grapes_text: first(entry?.grapes_text, details?.grapes.join(", ")),
    description: details?.description ?? "",
    drink_from: year(details?.drink_from),
    drink_peak_from: year(details?.drink_peak_from),
    drink_peak_to: year(details?.drink_peak_to),
    drink_to: year(details?.drink_to),
    save_photo: bottle.photo.ok && !bottle.photo.has_library_photo,
    replace_photo: false,
  };
}

function wineTitle(item: Pick<CatalogWine, "producer" | "name">) {
  return [item.producer, item.name].filter(Boolean).join(" · ");
}

type Props = {
  locale: Locale;
  jobId: string;
  position: number;
  bottle: CatalogPhotoBottle;
  onSaved: (result: CatalogPhotoSaveResult) => void;
  onCancel: () => void;
};

/** Review a wine read on a photo and save it to the shared catalog. */
export function AdminCatalogPhotoEditor({ locale, jobId, position, bottle, onSaved, onCancel }: Props) {
  const it = locale === "it";
  const [draft, setDraft] = useState<Draft>(() => initialDraft(bottle));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  // The cutout the library would receive, shown before saving.
  const [cutout, setCutout] = useState<"loading" | "ready" | "failed">("loading");
  const cutoutUrl = `/api/v1/catalog-photos/scans/${jobId}/bottles/${position}/cutout`;
  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => setDraft((current) => ({ ...current, [key]: value }));
  const id = (field: string) => `catalog-photo-${position}-${field}`;
  const details = bottle.details?.found ? bottle.details : null;
  const hasVintage = /^\d{4}$/.test(bottle.vintage);
  const years = WINDOW_FIELDS.map(([field]) => draft[field].trim());
  const windowStarted = years.some(Boolean);
  const windowValid = !windowStarted || (years.every((value) => /^\d{4}$/.test(value))
    && years.map(Number).every((value, index, all) => index === 0 ? value >= Number(bottle.vintage) : value >= all[index - 1]));
  const choices = bottle.status === "uncertain" || bottle.status === "new" ? bottle.candidates : [];

  const save = async () => {
    if (!draft.name.trim() || !windowValid || saving) return;
    setSaving(true);
    setError("");
    const year = (value: string) => (windowStarted && value.trim() ? Number(value) : null);
    try {
      onSaved(await saveCatalogPhotoBottle(jobId, position, {
        ...draft,
        drink_from: year(draft.drink_from),
        drink_peak_from: year(draft.drink_peak_from),
        drink_peak_to: year(draft.drink_peak_to),
        drink_to: year(draft.drink_to),
        replace_photo: draft.save_photo && draft.replace_photo,
      }));
    } catch (caught) {
      const status = (caught as { status?: number }).status;
      setError(status === 409
        ? (it ? "Nel catalogo ci sono più schede con questo nome: scegli quella da completare." : "Several catalog entries have this name: choose the one to complete.")
        : caught instanceof Error ? caught.message : String(caught));
    } finally {
      setSaving(false);
    }
  };

  const text = (field: "producer" | "name" | "appellation" | "region" | "country" | "grapes_text", label: string, wide = false) => (
    <div className={`catalog-photo-field${wide ? " is-wide" : ""}`}>
      <label htmlFor={id(field)}>{label}</label>
      <input id={id(field)} value={draft[field]} onChange={(event) => set(field, event.target.value)} maxLength={field === "grapes_text" ? 400 : 200} />
    </div>
  );

  return (
    <form className="catalog-photo-editor" onSubmit={(event) => { event.preventDefault(); void save(); }} aria-label={it ? "Scheda da salvare" : "Entry to save"}>
      {choices.length ? (
        <fieldset className="catalog-photo-targets">
          <legend>{it ? "Quale scheda?" : "Which entry?"}</legend>
          {choices.map((candidate) => (
            <label key={candidate.id}>
              <input type="radio" name={id("target")} checked={draft.entry_id === candidate.id} onChange={() => set("entry_id", candidate.id ?? null)} />
              <span>{it ? "Completa " : "Complete "}{wineTitle(candidate)}</span>
            </label>
          ))}
          <label>
            <input type="radio" name={id("target")} checked={!draft.entry_id} onChange={() => set("entry_id", null)} />
            <span>{it ? "Nuova scheda" : "New entry"}</span>
          </label>
        </fieldset>
      ) : bottle.entry ? (
        <p className="catalog-photo-target">{it ? "Completa la scheda: " : "Completes the entry: "}<strong>{wineTitle(bottle.entry)}</strong></p>
      ) : null}

      <div className="catalog-photo-fields">
        {text("producer", it ? "Produttore" : "Producer")}
        {text("name", it ? "Vino" : "Wine")}
        <div className="catalog-photo-field">
          <label htmlFor={id("type")}>{it ? "Tipo" : "Type"}</label>
          <select id={id("type")} value={draft.type} onChange={(event) => set("type", event.target.value)}>
            <option value="">{it ? "Non indicato" : "Not set"}</option>
            {Object.entries(TYPE_LABELS).map(([value, labels]) => <option key={value} value={value}>{labels[it ? 0 : 1]}</option>)}
          </select>
        </div>
        {text("appellation", it ? "Denominazione" : "Appellation")}
        {text("region", it ? "Regione" : "Region")}
        {text("country", it ? "Paese" : "Country")}
        {text("grapes_text", it ? "Vitigni (separati da virgola)" : "Grapes (comma separated)", true)}
        <div className="catalog-photo-field is-wide">
          <label htmlFor={id("description")}>{it ? "Descrizione" : "Description"}</label>
          <textarea id={id("description")} rows={4} maxLength={1500} value={draft.description} onChange={(event) => set("description", event.target.value)} />
        </div>
      </div>

      {hasVintage ? (
        <fieldset className="catalog-photo-window">
          <legend>{it ? `Finestra di beva dell'annata ${bottle.vintage}` : `Drinking window of the ${bottle.vintage} vintage`}</legend>
          <div>
            {WINDOW_FIELDS.map(([field, labelIt, labelEn]) => (
              <div key={field} className="catalog-photo-field">
                <label htmlFor={id(field)}>{it ? labelIt : labelEn}</label>
                <input id={id(field)} inputMode="numeric" pattern="[0-9]{4}" maxLength={4} value={draft[field]} onChange={(event) => set(field, event.target.value.replace(/\D/g, ""))} />
              </div>
            ))}
          </div>
          {details?.drink_notes ? <small>{details.drink_notes}</small> : null}
          {!windowValid ? (
            <small className="is-warning" role="alert">
              {it ? `Quattro anni in ordine, dal ${bottle.vintage} in poi, oppure lascia vuoto.` : `Four years in order, from ${bottle.vintage} on, or leave it empty.`}
            </small>
          ) : null}
        </fieldset>
      ) : null}

      {details?.sources.length ? (
        <div className="catalog-photo-sources">
          <span>{it ? "Fonti" : "Sources"}</span>
          <ul>
            {details.sources.map((source) => (
              <li key={source.url}><a href={source.url} target="_blank" rel="noreferrer noopener">{source.title || new URL(source.url).hostname}</a></li>
            ))}
          </ul>
        </div>
      ) : null}

      {bottle.photo.ok ? (
        <div className="catalog-photo-options">
          <div className="catalog-photo-cutout">
            <span className={`catalog-photo-cutout-frame is-${cutout}`}>
              {cutout !== "failed" ? (
                <img
                  src={cutoutUrl}
                  alt={it ? "Bottiglia scontornata" : "Cut-out bottle"}
                  onLoad={() => setCutout("ready")}
                  onError={() => { setCutout("failed"); set("save_photo", false); }}
                />
              ) : null}
            </span>
            <span className="catalog-photo-cutout-text">
              {cutout === "loading"
                ? (it ? "Scontorno la bottiglia… può richiedere fino a un minuto." : "Cutting out the bottle… this can take up to a minute.")
                : cutout === "ready"
                  ? (it ? "Così entrerebbe nell'archivio condiviso." : "This is how it would enter the shared library.")
                  : (it ? "Non è stato possibile scontornare la bottiglia da questa foto." : "The bottle could not be cut out of this photo.")}
            </span>
          </div>
          <label>
            <input type="checkbox" checked={draft.save_photo} disabled={cutout !== "ready"} onChange={(event) => set("save_photo", event.target.checked)} />
            <span>{it ? "Salva la foto della bottiglia nell'archivio condiviso" : "Save the bottle photo to the shared library"}</span>
          </label>
          {bottle.photo.has_library_photo && draft.save_photo ? (
            <label>
              <input type="checkbox" checked={draft.replace_photo} onChange={(event) => set("replace_photo", event.target.checked)} />
              <span>{it ? "Sostituisci la foto già presente" : "Replace the existing photo"}</span>
            </label>
          ) : null}
        </div>
      ) : null}

      {error ? <p className="catalog-photo-error" role="alert">{error}</p> : null}
      <div className="catalog-photo-editor-actions">
        <button type="submit" disabled={!draft.name.trim() || !windowValid || saving}>
          <ButtonBusyContent busy={saving} idleLabel={it ? "Salva nel catalogo" : "Save to the catalog"} busyLabel={it ? "Salvo…" : "Saving…"} />
        </button>
        <button type="button" className="secondary" onClick={onCancel} disabled={saving}>{it ? "Annulla" : "Cancel"}</button>
      </div>
    </form>
  );
}
