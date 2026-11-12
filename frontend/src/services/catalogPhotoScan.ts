import type {
  CatalogPhotoSave,
  CatalogPhotoSaveResult,
  CatalogPhotoScanResult,
  CatalogPhotoScanStatus,
  Locale,
} from "../types";
import { api, ApiError } from "./api";

const POLL_INTERVAL_MS = 1500;
const MAX_WAIT_MS = 9 * 60 * 1000;
const MAX_POLL_FAILURES = 5;

const wait = (ms: number) => new Promise((resolve) => window.setTimeout(resolve, ms));

/** Follow a catalog photo job until the reading or the research under way is over. */
async function followJob(
  started: CatalogPhotoScanStatus,
  locale: Locale,
  onProgress: (text: string) => void,
  pollIntervalMs: number,
): Promise<CatalogPhotoScanStatus> {
  const it = locale === "it";
  let status = started;
  const startedAt = Date.now();
  let failures = 0;
  while (status.status === "running") {
    onProgress(catalogPhotoProgressText(status, locale));
    if (Date.now() - startedAt > MAX_WAIT_MS) {
      throw new Error(it ? "L'operazione sta impiegando troppo. Riprova." : "This is taking too long. Try again.");
    }
    await wait(pollIntervalMs);
    try {
      status = await api<CatalogPhotoScanStatus>(`/api/v1/catalog-photos/scans/${status.id}`);
      failures = 0;
    } catch (error) {
      if (error instanceof ApiError && error.status === 404) {
        throw new Error(it ? "La lettura non è più disponibile. Ricarica le foto." : "The reading is no longer available. Upload the photos again.");
      }
      failures += 1;
      if (failures >= MAX_POLL_FAILURES) throw error;
    }
  }
  return status;
}

/** Start reading the labels of an admin's catalog photos and follow the job until it is done. */
export async function runCatalogPhotoScan(
  formData: FormData,
  locale: Locale,
  onProgress: (text: string) => void,
  pollIntervalMs = POLL_INTERVAL_MS,
): Promise<{ jobId: string; result: CatalogPhotoScanResult }> {
  const it = locale === "it";
  onProgress(it ? "Carico le foto…" : "Uploading the photos…");
  const started = await api<CatalogPhotoScanStatus>("/api/v1/catalog-photos/scans", { method: "POST", body: formData });
  const status = await followJob(started, locale, onProgress, pollIntervalMs);
  if (status.status === "failed" || !status.result) {
    throw new Error(status.error || (it ? "Non è stato possibile leggere le foto." : "The photos could not be read."));
  }
  return { jobId: status.id, result: status.result };
}

/** Research the base facts of the chosen bottles; error is set when some groups did not answer. */
export function runCatalogPhotoDetails(
  jobId: string,
  positions: number[],
  locale: Locale,
  onProgress: (text: string) => void,
  pollIntervalMs = POLL_INTERVAL_MS,
) {
  return runCatalogPhotoStep("details", jobId, positions, locale, onProgress, pollIntervalMs);
}

/** Research the chosen bottles and save, without photo, those that leave no doubt. */
export function runCatalogPhotoAutoSave(
  jobId: string,
  positions: number[],
  locale: Locale,
  onProgress: (text: string) => void,
  pollIntervalMs = POLL_INTERVAL_MS,
) {
  return runCatalogPhotoStep("auto-save", jobId, positions, locale, onProgress, pollIntervalMs);
}

async function runCatalogPhotoStep(
  step: "details" | "auto-save",
  jobId: string,
  positions: number[],
  locale: Locale,
  onProgress: (text: string) => void,
  pollIntervalMs: number,
): Promise<{ result: CatalogPhotoScanResult; error: string }> {
  const it = locale === "it";
  onProgress(it ? "Cerco i dati…" : "Researching…");
  const started = await api<CatalogPhotoScanStatus>(`/api/v1/catalog-photos/scans/${jobId}/${step}`, {
    method: "POST",
    body: JSON.stringify({ bottles: positions }),
  });
  const status = await followJob(started, locale, onProgress, pollIntervalMs);
  if (!status.result) throw new Error(status.error || (it ? "La ricerca non è riuscita." : "The research failed."));
  return {
    result: status.result,
    error: status.error ? (it ? "Per alcuni vini la ricerca non ha risposto. Puoi riprovare." : "The research did not answer for some wines. You can try again.") : "",
  };
}

export function saveCatalogPhotoBottle(jobId: string, position: number, payload: CatalogPhotoSave) {
  return api<CatalogPhotoSaveResult>(`/api/v1/catalog-photos/scans/${jobId}/bottles/${position}`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function catalogPhotoProgressText(
  status: Pick<CatalogPhotoScanStatus, "stage" | "sections_total" | "sections_done" | "bottles_found">,
  locale: Locale,
) {
  const it = locale === "it";
  const found = status.bottles_found;
  const labels = it ? `${found} ${found === 1 ? "etichetta letta" : "etichette lette"}` : `${found} ${found === 1 ? "label read" : "labels read"}`;
  if (status.stage === "reading") {
    if (!status.sections_done) return it ? "Leggo le etichette…" : "Reading the labels…";
    return it
      ? `Parti della foto lette: ${status.sections_done} di ${status.sections_total} · ${labels}`
      : `Photo parts read: ${status.sections_done} of ${status.sections_total} · ${labels}`;
  }
  if (status.stage === "matching") return it ? `${labels} · le cerco nel catalogo` : `${labels} · looking them up in the catalog`;
  if (status.stage === "researching") {
    if (status.sections_total <= 1) return it ? "Cerco i dati sul web…" : "Researching on the web…";
    return it
      ? `Cerco i dati sul web: gruppo ${Math.min(status.sections_done + 1, status.sections_total)} di ${status.sections_total}…`
      : `Researching on the web: group ${Math.min(status.sections_done + 1, status.sections_total)} of ${status.sections_total}…`;
  }
  if (status.stage === "saving") return it ? "Salvo nel catalogo i vini senza dubbi…" : "Saving the wines without doubts to the catalog…";
  return it ? `Fatto · ${labels}` : `Done · ${labels}`;
}
