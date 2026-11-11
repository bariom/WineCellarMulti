import type { CatalogPhotoScanResult, CatalogPhotoScanStatus, Locale } from "../types";
import { api, ApiError } from "./api";

const POLL_INTERVAL_MS = 1500;
const MAX_WAIT_MS = 9 * 60 * 1000;
const MAX_POLL_FAILURES = 5;

const wait = (ms: number) => new Promise((resolve) => window.setTimeout(resolve, ms));

/** Start reading the labels of an admin's catalog photos and follow the job until it is done. */
export async function runCatalogPhotoScan(
  formData: FormData,
  locale: Locale,
  onProgress: (text: string) => void,
  pollIntervalMs = POLL_INTERVAL_MS,
): Promise<CatalogPhotoScanResult> {
  const it = locale === "it";
  onProgress(it ? "Carico le foto…" : "Uploading the photos…");
  let status = await api<CatalogPhotoScanStatus>("/api/v1/catalog-photos/scans", { method: "POST", body: formData });
  const startedAt = Date.now();
  let failures = 0;
  while (status.status === "running") {
    onProgress(catalogPhotoProgressText(status, locale));
    if (Date.now() - startedAt > MAX_WAIT_MS) {
      throw new Error(it ? "La lettura delle foto sta impiegando troppo. Riprova." : "Reading the photos is taking too long. Try again.");
    }
    await wait(pollIntervalMs);
    try {
      status = await api<CatalogPhotoScanStatus>(`/api/v1/catalog-photos/scans/${status.id}`);
      failures = 0;
    } catch (error) {
      if (error instanceof ApiError && error.status === 404) {
        throw new Error(it ? "La lettura si è interrotta. Riprova." : "The reading was interrupted. Try again.");
      }
      failures += 1;
      if (failures >= MAX_POLL_FAILURES) throw error;
    }
  }
  if (status.status === "failed" || !status.result) {
    throw new Error(status.error || (it ? "Non è stato possibile leggere le foto." : "The photos could not be read."));
  }
  return status.result;
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
  return it ? `Fatto · ${labels}` : `Done · ${labels}`;
}
