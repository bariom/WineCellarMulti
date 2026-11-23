import { useCallback, useEffect, useRef, useState } from "react";
import { appActionSvgIcon } from "../../components/actionIcons";
import { ButtonBusyContent, LoadingState } from "../../components/AppUi";
import { extractApiErrorText, formatUserErrorMessage } from "../../services/api";
import type { FullBackupPreview, FullBackupRestoreResult, Locale } from "../../types";

/** Tables worth naming in a summary; every other table is added up as "other records". */
const TABLE_LABELS: ReadonlyArray<[string, string, string]> = [
  ["wines", "Vini", "Wines"],
  ["wine_tasting_entries", "Bevute e degustazioni", "Tastings"],
  ["external_wine_tastings", "Degustazioni di altri vini", "Tastings of other wines"],
  ["wine_stock_lots", "Lotti d'acquisto", "Purchase lots"],
  ["wine_sales", "Vendite", "Sales"],
  ["wishlist_items", "Vini in wishlist", "Wishlist wines"],
  ["wishlist_lists", "Liste wishlist", "Wishlists"],
  ["cellar_locations", "Posizioni in cantina", "Cellar locations"],
  ["wine_strategy_allocations", "Obiettivi dei vini", "Wine goals"],
  ["purchase_imports", "Documenti d'acquisto", "Purchase documents"],
  ["coownership_agreements", "Comproprietà", "Co-ownerships"],
  ["user_tags", "Tag", "Tags"],
  ["user_taste_profiles", "Profili gustativi", "Taste profiles"],
];
const NAMED_TABLES = new Set(TABLE_LABELS.map(([key]) => key));

/** Names for the records summed as "other records", shown on request. */
const OTHER_LABELS: Record<string, [string, string]> = {
  wine_stock_movements: ["Movimenti di magazzino", "Stock movements"],
  wine_value_history: ["Storico dei valori", "Value history"],
  ai_audit_log: ["Registro delle operazioni AI", "AI activity log"],
  wine_storage_allocations: ["Bottiglie per posizione", "Bottles per location"],
  wine_storage_movements: ["Spostamenti in cantina", "Moves in the cellar"],
  cellar_bins: ["Scomparti", "Bins"],
  merchants: ["Commercianti", "Merchants"],
  wine_share_offers: ["Offerte di condivisione", "Share offers"],
  purchase_document_wines: ["Vini collegati ai documenti", "Wines linked to documents"],
  coownership_participants: ["Partecipanti alle comproprietà", "Co-ownership participants"],
  coownership_payments: ["Pagamenti delle comproprietà", "Co-ownership payments"],
  user_wine_tags: ["Tag assegnati ai vini", "Tags on wines"],
  user_wine_ratings: ["Voti personali", "Personal ratings"],
  user_taste_profile_revisions: ["Versioni precedenti del profilo gustativo", "Earlier taste profiles"],
  user_taste_declarations: ["Preferenze dichiarate", "Stated preferences"],
  household_regional_gap_settings: ["Impostazioni delle regioni", "Region settings"],
  spreadsheet_import_maps: ["Mappature dei fogli Excel", "Spreadsheet mappings"],
};

/** The records summed as "other records", largest first, with readable names. */
function otherRows(counts: Record<string, number>, locale: Locale): SummaryRow[] {
  return Object.entries(counts)
    .filter(([key, value]) => !NAMED_TABLES.has(key) && (Number(value) || 0) > 0)
    .map(([key, value]) => {
      const labels = OTHER_LABELS[key];
      return { key, label: labels ? labels[locale === "it" ? 0 : 1] : key.replace(/_/g, " "), value: Number(value) || 0 };
    })
    .sort((left, right) => right.value - left.value);
}

/** Photos as a person counts them; older servers only send the number of files. */
function photoRows(preview: FullBackupPreview, locale: Locale): SummaryRow[] {
  const it = locale === "it";
  const counts = preview.photo_counts;
  if (!counts) return [{ key: "files", label: it ? "Foto e documenti" : "Photos and documents", value: preview.file_count }];
  return [
    { key: "bottle_photos", label: it ? "Foto delle bottiglie" : "Bottle photos", value: counts.bottle_photos ?? 0 },
    { key: "memory_photos", label: it ? "Foto ricordo" : "Memory photos", value: counts.memory_photos ?? 0 },
  ].filter((row) => row.key === "bottle_photos" || row.value > 0);
}

type SummaryRow = { key: string; label: string; value: number };

/** The named tables with records (wines always), then the rest summed. */
function summaryRows(counts: Record<string, number>, locale: Locale): SummaryRow[] {
  const it = locale === "it";
  const rows: SummaryRow[] = TABLE_LABELS
    .filter(([key]) => key === "wines" || (counts[key] ?? 0) > 0)
    .map(([key, itLabel, enLabel]) => ({ key, label: it ? itLabel : enLabel, value: counts[key] ?? 0 }));
  const other = Object.entries(counts)
    .filter(([key]) => !NAMED_TABLES.has(key))
    .reduce((sum, [, value]) => sum + (Number(value) || 0), 0);
  if (other > 0) rows.push({ key: "other", label: it ? "Altri dati" : "Other records", value: other });
  return rows;
}

function formatNumber(value: number, locale: Locale) {
  return new Intl.NumberFormat(locale === "it" ? "it-IT" : "en-GB").format(value);
}

function formatSize(bytes: number, locale: Locale) {
  const mb = bytes / (1024 * 1024);
  const digits = mb >= 100 ? 0 : 1;
  return `${new Intl.NumberFormat(locale === "it" ? "it-IT" : "en-GB", { maximumFractionDigits: digits, minimumFractionDigits: digits }).format(Math.max(mb, 0.1))} MB`;
}

function formatExportedAt(value: string, locale: Locale) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString(locale === "it" ? "it-IT" : "en-GB", { dateStyle: "long", timeStyle: "short" });
}

/** The filename the server proposes, or a dated fallback. */
function filenameFromDisposition(header: string | null) {
  if (header) {
    const encoded = header.match(/filename\*\s*=\s*(?:UTF-8|utf-8)''([^;]+)/);
    if (encoded) {
      try {
        return decodeURIComponent(encoded[1].trim().replace(/^"|"$/g, ""));
      } catch {
        // Fall through to the plain filename.
      }
    }
    const plain = header.match(/filename\s*=\s*"?([^";]+)"?/);
    if (plain?.[1]?.trim()) return plain[1].trim();
  }
  return `vinaris-backup-${new Date().toISOString().slice(0, 10)}.zip`;
}

class BackupRequestError extends Error {
  constructor(message: string, public readonly status: number) {
    super(message);
  }
}

/** A readable message for a failed backup request, in the user's language. */
function backupErrorMessage(caught: unknown, locale: Locale, fallback: string) {
  const it = locale === "it";
  if (caught instanceof BackupRequestError) {
    if (caught.status === 413) return formatUserErrorMessage("Request Entity Too Large", locale);
    if (caught.status === 401) return it ? "La sessione è scaduta: accedi di nuovo e riprova." : "Your session has expired: sign in again and try again.";
    if (caught.status === 403) return it ? "Solo i proprietari e gli amministratori della cantina possono usare il backup completo." : "Only cellar owners and admins can use the complete backup.";
    return formatUserErrorMessage(caught.message, locale) || fallback;
  }
  if (caught instanceof TypeError) {
    return it
      ? "Connessione interrotta durante il trasferimento. Controlla la rete e riprova."
      : "The connection dropped during the transfer. Check your network and try again.";
  }
  return fallback;
}

async function failedResponse(response: Response): Promise<BackupRequestError> {
  let text = "";
  try {
    text = await response.text();
  } catch {
    // Keep the status alone.
  }
  return new BackupRequestError(extractApiErrorText(text) || `Request failed: ${response.status}`, response.status);
}

type UploadProgress = { sent: number; total: number };

/** POST a form and report how much of the upload has left the device (fetch cannot). */
function postForm<T>(path: string, body: FormData, onProgress?: (progress: UploadProgress) => void, signal?: AbortSignal): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open("POST", path);
    request.withCredentials = true;
    request.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress?.({ sent: event.loaded, total: event.total });
    };
    request.onload = () => {
      if (request.status >= 200 && request.status < 300) {
        try {
          resolve(JSON.parse(request.responseText) as T);
        } catch {
          reject(new BackupRequestError("Invalid response", request.status));
        }
        return;
      }
      reject(new BackupRequestError(extractApiErrorText(request.responseText) || `Request failed: ${request.status}`, request.status));
    };
    // The same error a dropped fetch raises, so the message says the connection dropped.
    request.onerror = () => reject(new TypeError("Network error"));
    request.onabort = () => reject(new DOMException("Aborted", "AbortError"));
    signal?.addEventListener("abort", () => request.abort(), { once: true });
    // Start on the next tick: a request cancelled straight away (React's development
    // double mount) then never uploads the file at all.
    window.setTimeout(() => {
      if (signal?.aborted) {
        reject(new DOMException("Aborted", "AbortError"));
        return;
      }
      request.send(body);
    }, 0);
  });
}

function fileForm(file: File) {
  const body = new FormData();
  body.append("file", file, file.name);
  return body;
}

function tokenForm(token: string) {
  const body = new FormData();
  body.append("upload_token", token);
  return body;
}

const INCLUDED: ReadonlyArray<[string, string]> = [
  ["Vini e quantità", "Wines and stock"],
  ["Bevute e degustazioni", "Tastings"],
  ["Foto delle bottiglie", "Bottle photos"],
  ["Documenti d'acquisto", "Purchase documents"],
  ["Obiettivi e posizioni", "Goals and locations"],
  ["Profilo gustativo", "Taste profile"],
];

type DownloadProgress = { received: number; total: number | null };

/** Settings → Data: download the whole cellar as one ZIP. */
export function FullBackupDownload({ locale, disabled, onBusyChange }: { locale: Locale; disabled: boolean; onBusyChange: (busy: boolean) => void }) {
  const it = locale === "it";
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<DownloadProgress | null>(null);
  const [error, setError] = useState("");
  const [done, setDone] = useState<{ name: string; size: number } | null>(null);

  useEffect(() => onBusyChange(busy), [busy, onBusyChange]);

  async function download() {
    setBusy(true);
    setError("");
    setDone(null);
    setProgress(null);
    try {
      const response = await fetch("/api/v1/backup/export", { credentials: "include" });
      if (!response.ok) throw await failedResponse(response);
      const name = filenameFromDisposition(response.headers.get("Content-Disposition"));
      const lengthHeader = Number(response.headers.get("Content-Length"));
      const total = Number.isFinite(lengthHeader) && lengthHeader > 0 ? lengthHeader : null;
      let blob: Blob;
      if (response.body && typeof response.body.getReader === "function") {
        // Read the stream ourselves so a large backup shows how far it has come.
        const reader = response.body.getReader();
        const chunks: Uint8Array[] = [];
        let received = 0;
        setProgress({ received: 0, total });
        for (;;) {
          const { done: finished, value } = await reader.read();
          if (finished) break;
          if (value) {
            chunks.push(value);
            received += value.byteLength;
            setProgress({ received, total });
          }
        }
        blob = new Blob(chunks as BlobPart[], { type: "application/zip" });
      } else {
        blob = await response.blob();
      }
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = name;
      link.rel = "noopener";
      document.body.appendChild(link);
      link.click();
      link.remove();
      // Some browsers read the blob after the click returns.
      window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
      setDone({ name, size: blob.size });
    } catch (caught) {
      setError(backupErrorMessage(caught, locale, it ? "Non è stato possibile preparare il backup. Riprova tra poco." : "The backup could not be prepared. Please try again shortly."));
    } finally {
      setBusy(false);
      setProgress(null);
    }
  }

  const percent = progress?.total ? Math.min(100, Math.round((progress.received / progress.total) * 100)) : null;
  const busyLabel = !progress || progress.received === 0
    ? (it ? "Preparo il backup…" : "Preparing the backup…")
    : percent !== null
      ? (it ? `Scarico il backup… ${percent}%` : `Downloading the backup… ${percent}%`)
      : (it ? `Scarico il backup… ${formatSize(progress.received, locale)}` : `Downloading the backup… ${formatSize(progress.received, locale)}`);

  return (
    <section className="settings-card full-backup-card" aria-labelledby="full-backup-title">
      <div className="settings-card-heading">
        <div>
          <span>{it ? "Sicurezza dei dati" : "Data safety"}</span>
          <h3 id="full-backup-title">{it ? "Backup completo" : "Complete backup"}</h3>
        </div>
      </div>
      <p className="full-backup-intro">
        {it
          ? "Scarica tutta la cantina in un file ZIP: vini, bevute, foto delle bottiglie, documenti d'acquisto, obiettivi e profilo gustativo. Conservalo in un posto sicuro: ti serve per ripristinare tutto."
          : "Download your whole cellar as one ZIP file: wines, tastings, bottle photos, purchase documents, goals and taste profile. Keep it somewhere safe: it is what you need to restore everything."}
      </p>
      <ul className="full-backup-included" aria-label={it ? "Cosa contiene" : "What it contains"}>
        {INCLUDED.map(([itLabel, enLabel]) => <li key={enLabel}>{it ? itLabel : enLabel}</li>)}
      </ul>
      <p className="full-backup-excluded">
        {it
          ? "Non contiene le chiavi API, l'account e l'abbonamento: restano legati al tuo profilo."
          : "API keys, your account and subscription are not included: they stay with your profile."}
      </p>
      <div className="full-backup-actions">
        <button type="button" className="full-backup-download" onClick={() => void download()} disabled={busy || disabled} aria-describedby="full-backup-status">
          <ButtonBusyContent busy={busy} idleLabel={it ? "Scarica backup completo" : "Download complete backup"} busyLabel={busyLabel} icon={appActionSvgIcon("export")} />
        </button>
        <p id="full-backup-status" className="full-backup-status" role="status" aria-live="polite">
          {busy ? (it ? "Con molte foto può volerci qualche minuto: tieni aperta questa pagina." : "With many photos this can take a few minutes: keep this page open.") : done
            ? (it ? `Backup scaricato: ${done.name} (${formatSize(done.size, locale)}).` : `Backup downloaded: ${done.name} (${formatSize(done.size, locale)}).`)
            : ""}
        </p>
      </div>
      {percent !== null ? (
        <div className="full-backup-progress" role="progressbar" aria-label={it ? "Avanzamento del download" : "Download progress"} aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent}>
          <span style={{ width: `${percent}%` }} />
        </div>
      ) : null}
      {error ? <p className="spreadsheet-wizard-error" role="alert">{error}</p> : null}
    </section>
  );
}

type RestoreProps = {
  locale: Locale;
  file: File;
  onClose: () => void;
  onRestored: () => Promise<unknown>;
  onBusyChange: (busy: boolean) => void;
  showEmptyCellar: () => void;
};

/** Settings → Data → Restore a backup, for a complete-backup ZIP: summary first, then restore. */
export function FullBackupRestore({ locale, file, onClose, onRestored, onBusyChange, showEmptyCellar }: RestoreProps) {
  const it = locale === "it";
  const [busy, setBusy] = useState<"" | "preview" | "restore" | "check">("preview");
  const [preview, setPreview] = useState<FullBackupPreview | null>(null);
  const [result, setResult] = useState<FullBackupRestoreResult | null>(null);
  const [error, setError] = useState("");
  const [reloadFailed, setReloadFailed] = useState(false);
  const [upload, setUpload] = useState<UploadProgress | null>(null);
  const requestRef = useRef(0);
  const previewAbortRef = useRef<AbortController | null>(null);

  useEffect(() => onBusyChange(Boolean(busy)), [busy, onBusyChange]);
  useEffect(() => () => onBusyChange(false), [onBusyChange]);

  const runPreview = useCallback(async () => {
    const request = ++requestRef.current;
    previewAbortRef.current?.abort();
    const controller = new AbortController();
    previewAbortRef.current = controller;
    setBusy("preview");
    setError("");
    try {
      setUpload(null);
      const next = await postForm<FullBackupPreview>("/api/v1/backup/preview", fileForm(file), (progress) => {
        if (request === requestRef.current) setUpload(progress);
      }, controller.signal);
      if (request === requestRef.current) setPreview(next);
    } catch (caught) {
      if (request === requestRef.current) {
        setError(backupErrorMessage(caught, locale, it ? "Non è stato possibile leggere il backup. Controlla che sia un file ZIP scaricato da Vinaris." : "The backup could not be read. Check that it is a ZIP file downloaded from Vinaris."));
      }
    } finally {
      if (request === requestRef.current) {
        setBusy("");
        setUpload(null);
      }
    }
  }, [file, locale, it]);

  /** After emptying the cellar: ask the server, without uploading the backup again. */
  async function checkTarget() {
    setBusy("check");
    setError("");
    try {
      const response = await fetch("/api/v1/backup/target", { credentials: "include" });
      if (!response.ok) throw await failedResponse(response);
      const { target_empty } = (await response.json()) as { target_empty: boolean };
      setPreview((current) => (current ? {
        ...current,
        target_empty,
        // The "not empty" warning of the summary no longer applies.
        warnings: target_empty ? current.warnings.filter((warning) => !/non è vuota|not empty/i.test(warning)) : current.warnings,
      } : current));
    } catch (caught) {
      setError(backupErrorMessage(caught, locale, it ? "Non è stato possibile controllare la cantina. Riprova." : "The cellar could not be checked. Please try again."));
    } finally {
      setBusy("");
    }
  }

  useEffect(() => {
    void runPreview();
    return () => {
      // Closing the panel stops a summary upload still in flight; a restore is left to finish.
      requestRef.current += 1;
      previewAbortRef.current?.abort();
    };
  }, [runPreview]);

  async function restore() {
    const request = ++requestRef.current;
    setBusy("restore");
    setError("");
    try {
      let next: FullBackupRestoreResult;
      try {
        if (!preview?.upload_token) throw new BackupRequestError("No kept upload", 410);
        next = await postForm<FullBackupRestoreResult>("/api/v1/backup/restore", tokenForm(preview.upload_token));
      } catch (caught) {
        // The kept upload expired (30 minutes) or the server is older: send the file again.
        if (!(caught instanceof BackupRequestError && caught.status === 410)) throw caught;
        next = await postForm<FullBackupRestoreResult>("/api/v1/backup/restore", fileForm(file), (progress) => {
          if (request === requestRef.current) setUpload(progress);
        });
      }
      if (request !== requestRef.current) return;
      setResult(next);
      try {
        await onRestored();
      } catch {
        setReloadFailed(true);
      }
    } catch (caught) {
      if (request !== requestRef.current) return;
      if (caught instanceof BackupRequestError && caught.status === 409) {
        // Something was added since the summary: the cellar has to be emptied again.
        setPreview((current) => (current ? { ...current, target_empty: false } : current));
        setError(caught.message && !caught.message.startsWith("Request failed")
          ? caught.message
          : (it ? "La cantina non è vuota: svuotala prima di ripristinare il backup." : "The cellar is not empty: empty it before restoring the backup."));
      } else {
        setError(backupErrorMessage(caught, locale, it ? "Il ripristino non è riuscito. Riprova tra poco." : "The restore did not complete. Please try again shortly."));
      }
    } finally {
      if (request === requestRef.current) {
        setBusy("");
        setUpload(null);
      }
    }
  }

  const photos = preview ? photoRows(preview, locale) : [];
  // Photos sit with the named records; "other records" closes the list.
  const withPhotos = (rows: SummaryRow[]) => [...rows.filter((row) => row.key !== "other"), ...photos, ...rows.filter((row) => row.key === "other")];
  const previewRows = preview ? withPhotos(summaryRows(preview.counts, locale)) : [];
  const restoredRows = result ? withPhotos(summaryRows(result.restored, locale)) : [];
  const others = preview ? otherRows(result ? result.restored : preview.counts, locale) : [];
  const skippedTotal = result ? Object.values(result.skipped).reduce((sum, value) => sum + (Number(value) || 0), 0) : 0;
  const warnings = result ? result.warnings : preview?.warnings ?? [];

  return (
    <section className="spreadsheet-wizard full-backup-restore" aria-labelledby="full-backup-restore-title" aria-busy={Boolean(busy)}>
      <header className="spreadsheet-wizard-header">
        <div>
          <span className="data-import-source-tag">{file.name}</span>
          <h4 id="full-backup-restore-title">{it ? "Ripristina il backup completo" : "Restore the complete backup"}</h4>
        </div>
        <button type="button" className="secondary compact" onClick={onClose} disabled={busy === "restore"}>
          {result ? (it ? "Fine" : "Done") : (it ? "Chiudi" : "Close")}
        </button>
      </header>
      {error ? <p className="spreadsheet-wizard-error" role="alert">{error}</p> : null}
      {(busy === "preview" || busy === "restore") && upload && upload.sent < upload.total ? (
        <div className="full-backup-upload" role="status">
          <span>
            {it
              ? `Carico il backup… ${Math.round((upload.sent / upload.total) * 100)}% (${formatSize(upload.sent, locale)} di ${formatSize(upload.total, locale)})`
              : `Uploading the backup… ${Math.round((upload.sent / upload.total) * 100)}% (${formatSize(upload.sent, locale)} of ${formatSize(upload.total, locale)})`}
          </span>
          <div className="full-backup-progress" role="progressbar" aria-label={it ? "Avanzamento del caricamento" : "Upload progress"} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round((upload.sent / upload.total) * 100)}>
            <span style={{ width: `${(upload.sent / upload.total) * 100}%` }} />
          </div>
          <small>{it ? "Il tempo dipende dalla velocità della tua connessione in invio: tieni aperta questa pagina." : "The time depends on your connection's upload speed: keep this page open."}</small>
        </div>
      ) : busy === "preview" ? <LoadingState label={upload ? (it ? "Controllo il backup…" : "Checking the backup…") : (it ? "Carico il backup…" : "Uploading the backup…")} compact />
        : busy === "restore" ? <LoadingState label={it ? "Ripristino la cantina… può volerci qualche minuto." : "Restoring the cellar… this can take a few minutes."} compact />
          : busy === "check" ? <LoadingState label={it ? "Controllo la cantina…" : "Checking the cellar…"} compact /> : null}

      {result ? (
        <div className="spreadsheet-wizard-body">
          <p className="spreadsheet-wizard-note full-backup-success" role="status">
            {it ? "Ripristino completato: la cantina è tornata com'era nel backup." : "Restore complete: the cellar is back as it was in the backup."}
          </p>
          <dl className="spreadsheet-summary full-backup-counts" aria-label={it ? "Dati ripristinati" : "Restored records"}>
            {restoredRows.map((row) => (
              <div key={row.key}><dt>{row.label}</dt><dd>{formatNumber(row.value, locale)}</dd></div>
            ))}
          </dl>
          {others.length ? <OtherRecords rows={others} locale={locale} /> : null}
          {skippedTotal > 0 ? (
            <p className="spreadsheet-wizard-note">
              {skippedTotal === 1
                ? (it ? "1 elemento del file non è stato ripristinato." : "1 record in the file was not restored.")
                : (it ? `${formatNumber(skippedTotal, locale)} elementi del file non sono stati ripristinati.` : `${formatNumber(skippedTotal, locale)} records in the file were not restored.`)}
            </p>
          ) : null}
          {reloadFailed ? (
            <p className="spreadsheet-wizard-note is-warning">
              {it ? "Il backup è stato ripristinato ma la cantina non si è aggiornata: ricarica la pagina." : "The backup was restored but the cellar did not refresh: reload the page."}
            </p>
          ) : null}
        </div>
      ) : preview ? (
        <div className="spreadsheet-wizard-body">
          <dl className="full-backup-meta">
            <div><dt>{it ? "Cantina" : "Cellar"}</dt><dd>{preview.household_name || "—"}</dd></div>
            <div><dt>{it ? "Esportato il" : "Exported on"}</dt><dd>{formatExportedAt(preview.exported_at, locale)}</dd></div>
          </dl>
          <dl className="spreadsheet-summary full-backup-counts" aria-label={it ? "Contenuto del backup" : "Backup contents"}>
            {previewRows.map((row) => (
              <div key={row.key}><dt>{row.label}</dt><dd>{formatNumber(row.value, locale)}</dd></div>
            ))}
          </dl>
          {others.length ? <OtherRecords rows={others} locale={locale} /> : null}
          {preview.target_empty ? (
            <p className="spreadsheet-wizard-note">
              {it
                ? "Il ripristino ricrea questi dati nella cantina attiva, che è vuota. Chiavi API, account e abbonamento non cambiano."
                : "Restoring recreates these records in the active cellar, which is empty. API keys, account and subscription do not change."}
            </p>
          ) : (
            <div className="spreadsheet-wizard-note is-warning full-backup-not-empty" role="status">
              <strong>{it ? "Prima svuota la cantina" : "Empty the cellar first"}</strong>
              <span>
                {it
                  ? "Il backup completo si ripristina solo in una cantina vuota, per non mescolare i dati. Se ti serve quello che c'è ora, scarica prima un backup; poi usa “Svuota cantina” in fondo a questa pagina e controlla di nuovo."
                  : "A complete backup can only be restored into an empty cellar, so data never gets mixed. If you need what is there now, download a backup first; then use “Empty cellar” at the bottom of this page and check again."}
              </span>
              <div className="full-backup-inline-actions">
                <button type="button" className="secondary compact" onClick={showEmptyCellar} disabled={Boolean(busy)}>
                  {it ? "Vai a Svuota cantina" : "Go to Empty cellar"}
                </button>
                <button type="button" className="secondary compact" onClick={() => void checkTarget()} disabled={Boolean(busy)}>
                  {it ? "Controlla di nuovo" : "Check again"}
                </button>
              </div>
            </div>
          )}
          <div className="spreadsheet-wizard-actions">
            <button type="button" onClick={() => void restore()} disabled={Boolean(busy) || !preview.target_empty}>
              <ButtonBusyContent busy={busy === "restore"} idleLabel={it ? "Ripristina backup" : "Restore backup"} busyLabel={it ? "Ripristino…" : "Restoring…"} icon={appActionSvgIcon("import")} />
            </button>
          </div>
        </div>
      ) : !busy && error ? (
        <div className="spreadsheet-wizard-actions">
          <button type="button" className="secondary" onClick={() => void runPreview()}>
            {it ? "Riprova" : "Try again"}
          </button>
        </div>
      ) : null}
      {warnings.length ? (
        <ul className="full-backup-warnings" aria-label={it ? "Avvisi" : "Warnings"}>
          {warnings.map((warning) => <li key={warning}>{warning}</li>)}
        </ul>
      ) : null}
    </section>
  );
}

/** What "other records" holds, closed by default. */
function OtherRecords({ rows, locale }: { rows: SummaryRow[]; locale: Locale }) {
  const it = locale === "it";
  return (
    <details className="full-backup-other">
      <summary>{it ? "Cosa sono gli altri dati" : "What the other records are"}</summary>
      <dl>
        {rows.map((row) => (
          <div key={row.key}><dt>{row.label}</dt><dd>{formatNumber(row.value, locale)}</dd></div>
        ))}
      </dl>
    </details>
  );
}
