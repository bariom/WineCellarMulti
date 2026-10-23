import type { BottlePhotoScanStatus, Locale } from "../types";
import { api, ApiError } from "./api";

const POLL_INTERVAL_MS = 1500;
const MAX_WAIT_MS = 9 * 60 * 1000;

const wait = (ms: number) => new Promise((resolve) => window.setTimeout(resolve, ms));

/** Read photos of bottles in the background, reporting each poll until the rows are ready. */
export async function runBottlePhotoScan(
  formData: FormData,
  locale: Locale,
  onProgress: (text: string) => void,
  pollIntervalMs = POLL_INTERVAL_MS,
) {
  const it = locale === "it";
  onProgress(it ? "Carico le foto…" : "Uploading the photos…");
  let status = await api<BottlePhotoScanStatus>("/api/v1/bottle-photos/scans", { method: "POST", body: formData });
  const startedAt = Date.now();
  let failures = 0;
  while (status.status === "running") {
    onProgress(bottlePhotoProgressText(status, locale));
    if (Date.now() - startedAt > MAX_WAIT_MS) throw new Error(it ? "La lettura delle foto sta impiegando troppo. Riprova." : "Reading the photos is taking too long. Try again.");
    await wait(pollIntervalMs);
    try {
      status = await api<BottlePhotoScanStatus>(`/api/v1/bottle-photos/scans/${status.id}`);
      failures = 0;
    } catch (error) {
      if (error instanceof ApiError && error.status === 404) throw new Error(it ? "La lettura si è interrotta. Riprova." : "The reading was interrupted. Try again.");
      failures += 1;
      if (failures >= 5) throw error;
    }
  }
  if (status.status === "failed" || !status.result) {
    throw new Error(status.error || (it ? "Non è stato possibile leggere le foto." : "The photos could not be read."));
  }
  return status.result;
}

export function bottlePhotoProgressText(status: Pick<BottlePhotoScanStatus, "stage" | "photos_total" | "photos_done" | "wines_found">, locale: Locale) {
  const it = locale === "it";
  const wines = it
    ? `${status.wines_found} ${status.wines_found === 1 ? "vino" : "vini"}`
    : `${status.wines_found} ${status.wines_found === 1 ? "wine" : "wines"}`;
  if (status.stage === "matching") return it ? `${wines} trovati · li confronto con la tua cantina e il catalogo…` : `${wines} found · matching them with your cellar and the catalog…`;
  if (!status.photos_done) {
    return it
      ? `Leggo le etichette di ${status.photos_total === 1 ? "1 foto" : `${status.photos_total} foto`}…`
      : `Reading the labels in ${status.photos_total === 1 ? "1 photo" : `${status.photos_total} photos`}…`;
  }
  return it ? `Foto lette: ${status.photos_done} di ${status.photos_total} · ${wines}` : `Photos read: ${status.photos_done} of ${status.photos_total} · ${wines}`;
}
