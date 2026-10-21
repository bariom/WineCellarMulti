import type { Locale, WineShelfScanResult, WineShelfScanStatus } from "../types";
import { api, ApiError } from "./api";

const POLL_INTERVAL_MS = 1500;
const MAX_WAIT_MS = 9 * 60 * 1000;
const MAX_POLL_FAILURES = 5;

const wait = (ms: number) => new Promise((resolve) => window.setTimeout(resolve, ms));

/**
 * Start a shelf analysis and follow it until the result is ready. The server reads
 * the photo in sections in the background, so a crowded shelf never hits the
 * gateway timeout and every poll reports how far it got.
 */
export async function runWineShelfScan(
  formData: FormData,
  locale: Locale,
  onProgress: (text: string) => void,
  pollIntervalMs = POLL_INTERVAL_MS,
): Promise<WineShelfScanResult> {
  onProgress(locale === "it" ? "Carico le foto dello scaffale…" : "Uploading the shelf photos…");
  let status = await api<WineShelfScanStatus>("/api/v1/ai/wine-shop/shelf-scans", { method: "POST", body: formData });
  const startedAt = Date.now();
  let failures = 0;
  while (status.status === "running") {
    onProgress(wineShelfProgressText(status, locale));
    if (Date.now() - startedAt > MAX_WAIT_MS) {
      throw new Error(locale === "it" ? "L'analisi dello scaffale sta impiegando troppo. Riprova." : "The shelf analysis is taking too long. Try again.");
    }
    await wait(pollIntervalMs);
    try {
      status = await api<WineShelfScanStatus>(`/api/v1/ai/wine-shop/shelf-scans/${status.id}`);
      failures = 0;
    } catch (error) {
      // A restarted server forgets the job; a brief network drop is worth retrying.
      if (error instanceof ApiError && error.status === 404) {
        throw new Error(locale === "it" ? "L'analisi si è interrotta. Riprova." : "The analysis was interrupted. Try again.");
      }
      failures += 1;
      if (failures >= MAX_POLL_FAILURES) throw error;
    }
  }
  if (status.status === "failed" || !status.result) {
    throw new Error(status.error || (locale === "it" ? "Non è stato possibile analizzare lo scaffale." : "The shelf could not be analysed."));
  }
  onProgress(wineShelfProgressText(status, locale));
  return status.result;
}

export function wineShelfProgressText(status: Pick<WineShelfScanStatus, "stage" | "sections_total" | "sections_done" | "bottles_found">, locale: Locale) {
  const it = locale === "it";
  const found = status.bottles_found;
  const wines = it ? `${found} ${found === 1 ? "vino riconosciuto" : "vini riconosciuti"}` : `${found} ${found === 1 ? "wine recognised" : "wines recognised"}`;
  if (status.stage === "reading") {
    if (!status.sections_done) {
      return it
        ? `Leggo le etichette: ${status.sections_total} ${status.sections_total === 1 ? "sezione" : "sezioni"} dello scaffale in parallelo…`
        : `Reading the labels: ${status.sections_total} shelf ${status.sections_total === 1 ? "section" : "sections"} in parallel…`;
    }
    return it
      ? `Sezioni lette: ${status.sections_done} di ${status.sections_total} · ${wines}`
      : `Sections read: ${status.sections_done} of ${status.sections_total} · ${wines}`;
  }
  if (status.stage === "ranking") {
    return it ? `${wines} · scelgo i migliori per te` : `${wines} · choosing the best for you`;
  }
  return it ? `Fatto · ${wines}` : `Done · ${wines}`;
}
