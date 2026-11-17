import { useEffect, useState } from "react";
import { api } from "../services/api";
import type { Locale } from "../types";
import "./AdminCatalogRecovery.css";
import "./AdminCatalogCompletion.css";

type CompletionJob = {
  id: string;
  status: "running" | "done";
  stop_reason: "" | "finished" | "budget" | "cancelled" | "failed";
  total: number;
  done: number;
  completed: number;
  not_found: number;
  failed: number;
  cost_usd: string | number;
  budget_usd: string | number;
  error: string;
};
type CompletionStatus = { incomplete_count: number; not_found_count: number; job: CompletionJob | null };

const URL = "/api/v1/catalog-completion";
const usd = (value: string | number) => `$${Number(value || 0).toFixed(2)}`;

/** App administrators: research the grapes and country the catalog entries lack, within a cap. */
export default function AdminCatalogCompletion({ locale, disabled }: { locale: Locale; disabled: boolean }) {
  const it = locale === "it";
  const [status, setStatus] = useState<CompletionStatus | null>(null);
  const [limit, setLimit] = useState("100");
  const [budget, setBudget] = useState("25");
  const [retry, setRetry] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const running = status?.job?.status === "running";

  useEffect(() => {
    let active = true;
    api<CompletionStatus>(URL).then((next) => { if (active) setStatus(next); }).catch(() => undefined);
    return () => { active = false; };
  }, []);
  useEffect(() => {
    if (!running) return;
    const timer = window.setInterval(() => {
      api<CompletionStatus>(URL).then(setStatus).catch(() => undefined);
    }, 3000);
    return () => window.clearInterval(timer);
  }, [running]);

  async function send(path: string, body?: unknown) {
    setBusy(true); setError("");
    try { setStatus(await api<CompletionStatus>(path, { method: "POST", body: body ? JSON.stringify(body) : undefined })); }
    catch (failure) { setError(failure instanceof Error ? failure.message : String(failure)); }
    finally { setBusy(false); }
  }
  function start() {
    const count = Math.round(Number(limit));
    const cap = Number(budget);
    if (!(count >= 1 && count <= 2000) || !(cap > 0 && cap <= 100)) {
      setError(it ? "Indica da 1 a 2000 schede e un tetto di spesa fino a 100 USD." : "Enter 1 to 2000 entries and a spending cap up to 100 USD.");
      return;
    }
    const message = it
      ? `Cercare sul web i dati mancanti di al massimo ${count} schede? Il lotto si ferma prima di superare ${usd(cap)}; il costo è a carico della chiave AI dell’applicazione.`
      : `Research the missing facts of up to ${count} entries on the web? The batch stops before exceeding ${usd(cap)}; the application's AI key pays for it.`;
    if (!window.confirm(message)) return;
    void send(URL, { limit: count, budget_usd: cap, retry_not_found: retry });
  }

  const job = status?.job ?? null;
  const available = status ? status.incomplete_count + (retry ? status.not_found_count : 0) : 0;
  const stopLabel = job ? ({
    "": "",
    finished: it ? "Lotto completato." : "Batch finished.",
    budget: it ? "Lotto fermato al tetto di spesa." : "Batch stopped at the spending cap.",
    cancelled: it ? "Lotto interrotto." : "Batch stopped.",
    failed: it ? "Lotto interrotto per errori ripetuti." : "Batch stopped after repeated errors.",
  })[job.stop_reason] : "";

  return <section className="admin-catalog-recovery admin-catalog-completion" aria-label={it ? "Completa le schede del catalogo" : "Complete the catalog entries"}>
    <h4>{it ? "Completa le schede senza vitigni o paese" : "Complete entries without grapes or country"}</h4>
    <p>{it
      ? "L’AI cerca sul sito del produttore o su un’altra pagina affidabile vitigni, paese, denominazione e una breve descrizione. Riempie solo i campi vuoti delle schede già approvate e conserva le fonti."
      : "AI looks up grapes, country, appellation and a short description on the producer's site or another reliable page. It only fills the empty fields of approved entries and keeps the sources."}</p>
    {status ? <p className="admin-catalog-completion-count">
      <strong>{status.incomplete_count}</strong> {it ? "schede da completare" : "entries to complete"}
      {status.not_found_count ? <> · {status.not_found_count} {it ? "già cercate senza esito" : "already researched in vain"}</> : null}
    </p> : null}
    {!running ? <div className="admin-catalog-completion-form">
      <label>{it ? "Schede per lotto" : "Entries per batch"}<input type="number" inputMode="numeric" min={1} max={2000} value={limit} onChange={(event) => setLimit(event.target.value)} /></label>
      <label>{it ? "Tetto di spesa (USD)" : "Spending cap (USD)"}<input type="number" inputMode="decimal" min={1} max={100} step="1" value={budget} onChange={(event) => setBudget(event.target.value)} /></label>
      {status?.not_found_count ? <label className="admin-catalog-completion-retry"><input type="checkbox" checked={retry} onChange={(event) => setRetry(event.target.checked)} />{it ? "Riprova anche quelle senza esito" : "Also retry those not found"}</label> : null}
      <button type="button" className="secondary" disabled={disabled || busy || !available} onClick={start}>{it ? "Completa con AI" : "Complete with AI"}</button>
    </div> : null}
    {job ? <div className="admin-catalog-completion-job" role="status">
      {running ? <progress max={job.total} value={job.done} aria-label={it ? "Avanzamento del lotto" : "Batch progress"} /> : null}
      <p>{running ? (it ? "Ricerca in corso: " : "Researching: ") : `${stopLabel} `}
        {it
          ? `${job.done} di ${job.total} schede esaminate · ${job.completed} completate · ${job.not_found} senza esito${job.failed ? ` · ${job.failed} non riuscite` : ""} · costo ${usd(job.cost_usd)} su ${usd(job.budget_usd)}.`
          : `${job.done} of ${job.total} entries checked · ${job.completed} completed · ${job.not_found} not found${job.failed ? ` · ${job.failed} failed` : ""} · cost ${usd(job.cost_usd)} of ${usd(job.budget_usd)}.`}</p>
      {running ? <button type="button" className="secondary compact" disabled={busy} onClick={() => void send(`${URL}/cancel`)}>{it ? "Interrompi" : "Stop"}</button> : null}
      {job.error ? <p role="alert">{job.error}</p> : null}
    </div> : null}
    {error ? <p role="alert">{error}</p> : null}
  </section>;
}
