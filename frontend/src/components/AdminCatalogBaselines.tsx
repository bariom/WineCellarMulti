import { useEffect, useState } from "react";
import { api } from "../services/api";
import type { Locale } from "../types";
import "./AdminCatalogRecovery.css";
import "./AdminCatalogCompletion.css";
import "./AdminCatalogBaselines.css";

type BaselineJob = {
  id: string;
  status: "running" | "done";
  stop_reason: "" | "finished" | "budget" | "cancelled" | "failed";
  total: number;
  done: number;
  created: number;
  unknown: number;
  failed: number;
  cost_usd: string | number;
  budget_usd: string | number;
  error: string;
};
type Missing = { entity_type: "appellation" | "grape"; label: string; wines: number };
type Proposal = { id: string; entity_type: string; entity_key: string; dimensions: Record<string, number>; confidence: number; wines: number };
type BaselineStatus = {
  entries: number;
  specific: number;
  generic: number;
  without: number;
  missing_count: number;
  missing: Missing[];
  proposal_count: number;
  proposals: Proposal[];
  job: BaselineJob | null;
};
type Recalculation = { checked: number; updated: number };

const URL = "/api/v1/catalog-baselines";
const usd = (value: string | number) => `$${Number(value || 0).toFixed(2)}`;
const DIMENSIONS: [string, string, string][] = [
  ["body", "Corpo", "Body"],
  ["acidity", "Acidità", "Acidity"],
  ["tannin", "Tannino", "Tannin"],
  ["sweetness", "Dolcezza", "Sweetness"],
  ["aromatic_intensity", "Aromi", "Aromas"],
  ["fruit", "Frutto", "Fruit"],
  ["wood", "Legno", "Oak"],
  ["spice", "Spezie", "Spice"],
  ["minerality", "Mineralità", "Minerality"],
];

/** App administrators: see what the catalog's taste profiles rest on and widen the baselines. */
export default function AdminCatalogBaselines({ locale, disabled }: { locale: Locale; disabled: boolean }) {
  const it = locale === "it";
  const [status, setStatus] = useState<BaselineStatus | null>(null);
  const [limit, setLimit] = useState("60");
  const [budget, setBudget] = useState("5");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [recalculated, setRecalculated] = useState<Recalculation | null>(null);
  const running = status?.job?.status === "running";

  useEffect(() => {
    let active = true;
    api<BaselineStatus>(URL).then((next) => { if (active) setStatus(next); }).catch(() => undefined);
    return () => { active = false; };
  }, []);
  useEffect(() => {
    if (!running) return;
    const timer = window.setInterval(() => {
      api<BaselineStatus>(URL).then(setStatus).catch(() => undefined);
    }, 3000);
    return () => window.clearInterval(timer);
  }, [running]);

  async function send(path: string, body?: unknown) {
    setBusy(true); setError("");
    try { setStatus(await api<BaselineStatus>(path, { method: "POST", body: body ? JSON.stringify(body) : undefined })); }
    catch (failure) { setError(failure instanceof Error ? failure.message : String(failure)); }
    finally { setBusy(false); }
  }
  function start() {
    const count = Math.round(Number(limit));
    const cap = Number(budget);
    if (!(count >= 1 && count <= 300) || !(cap > 0 && cap <= 100)) {
      setError(it ? "Indica da 1 a 300 riferimenti e un tetto di spesa fino a 100 USD." : "Enter 1 to 300 baselines and a spending cap up to 100 USD.");
      return;
    }
    const message = it
      ? `Chiedere all’AI il profilo tipico di al massimo ${count} denominazioni e vitigni? Il lotto si ferma prima di superare ${usd(cap)}; il costo è a carico della chiave AI dell’applicazione.`
      : `Ask AI for the typical profile of up to ${count} appellations and grapes? The batch stops before exceeding ${usd(cap)}; the application's AI key pays for it.`;
    if (!window.confirm(message)) return;
    void send(URL, { limit: count, budget_usd: cap });
  }
  function approveAll() {
    if (!status?.proposals.length) return;
    const message = it
      ? `Attivare ${status.proposals.length} riferimenti proposti dall’AI? Da subito contribuiscono ai profili gustativi dei vini.`
      : `Activate ${status.proposals.length} baselines proposed by AI? They contribute to the wines' taste profiles right away.`;
    if (window.confirm(message)) void send(`${URL}/approve`, { ids: status.proposals.map((item) => item.id) });
  }
  async function recalculate() {
    const message = it
      ? "Ricalcolare i profili stimati con i riferimenti attivi? È gratuito. I profili convalidati, manuali o generati dall’AI non cambiano."
      : "Recompute the estimated profiles from the active baselines? It is free. Validated, manual and AI-generated profiles do not change.";
    if (!window.confirm(message)) return;
    setBusy(true); setError("");
    try { setRecalculated(await api<Recalculation>(`${URL}/recalculate`, { method: "POST" })); }
    catch (failure) { setError(failure instanceof Error ? failure.message : String(failure)); }
    finally { setBusy(false); }
  }

  const job = status?.job ?? null;
  const share = (value: number) => (status?.entries ? `${Math.round((value / status.entries) * 100)}%` : "0%");
  const kind = (value: string) => value === "grape" ? (it ? "vitigno" : "grape") : (it ? "denominazione" : "appellation");
  const wines = (value: number) => it ? `${value} ${value === 1 ? "vino" : "vini"}` : `${value} ${value === 1 ? "wine" : "wines"}`;
  const stopLabel = job ? ({
    "": "",
    finished: it ? "Lotto completato." : "Batch finished.",
    budget: it ? "Lotto fermato al tetto di spesa." : "Batch stopped at the spending cap.",
    cancelled: it ? "Lotto interrotto." : "Batch stopped.",
    failed: it ? "Lotto interrotto per errori ripetuti." : "Batch stopped after repeated errors.",
  })[job.stop_reason] : "";

  return <section className="admin-catalog-recovery admin-catalog-completion admin-catalog-baselines" aria-label={it ? "Profili gustativi del catalogo" : "Catalog taste profiles"}>
    <h4>{it ? "Profili gustativi per i vini del catalogo" : "Taste profiles for the catalog's wines"}</h4>
    <p>{it
      ? "Il profilo di un vino nasce dai riferimenti della sua denominazione e dei suoi vitigni e vale per tutte le annate. Senza un riferimento resta il profilo generico del tipo di vino."
      : "A wine's profile comes from the baselines of its appellation and grapes and holds for every vintage. Without a baseline only the generic profile of the wine type is left."}</p>
    {status ? <div className="admin-catalog-baselines-coverage">
      <div className="admin-catalog-baselines-bar" role="img" aria-label={it ? `Copertura: ${share(status.specific)} delle schede con profilo specifico` : `Coverage: ${share(status.specific)} of entries with a specific profile`}>
        <span className="specific" style={{ flexGrow: status.specific }} />
        <span className="generic" style={{ flexGrow: status.generic }} />
        <span className="without" style={{ flexGrow: status.without }} />
      </div>
      <ul>
        <li><i className="specific" /><strong>{status.specific}</strong> {it ? "con profilo da denominazione o vitigni" : "profiled from appellation or grapes"}</li>
        <li><i className="generic" /><strong>{status.generic}</strong> {it ? "solo dal tipo di vino" : "from the wine type only"}</li>
        <li><i className="without" /><strong>{status.without}</strong> {it ? "senza profilo" : "without a profile"}</li>
      </ul>
    </div> : null}
    {status?.missing_count ? <details className="admin-catalog-baselines-missing">
      <summary><strong>{status.missing_count}</strong> {it ? "denominazioni e vitigni senza riferimento" : "appellations and grapes without a baseline"}</summary>
      <ul>{status.missing.map((item) => <li key={`${item.entity_type}:${item.label}`}><span>{item.label}</span><small>{kind(item.entity_type)} · {wines(item.wines)}</small></li>)}</ul>
      {status.missing_count > status.missing.length ? <small>{it ? `e altri ${status.missing_count - status.missing.length}, meno usati.` : `and ${status.missing_count - status.missing.length} more, less used.`}</small> : null}
    </details> : status ? <p className="admin-catalog-baselines-none">{it ? "Ogni denominazione e vitigno del catalogo ha un riferimento o una proposta." : "Every appellation and grape of the catalog has a baseline or a proposal."}</p> : null}
    {!running ? <div className="admin-catalog-completion-form">
      <label>{it ? "Riferimenti per lotto" : "Baselines per batch"}<input type="number" inputMode="numeric" min={1} max={300} value={limit} onChange={(event) => setLimit(event.target.value)} /></label>
      <label>{it ? "Tetto di spesa (USD)" : "Spending cap (USD)"}<input type="number" inputMode="decimal" min={1} max={100} step="1" value={budget} onChange={(event) => setBudget(event.target.value)} /></label>
      <button type="button" className="secondary" disabled={disabled || busy || !status?.missing_count} onClick={start}>{it ? "Proponi i riferimenti con AI" : "Propose baselines with AI"}</button>
    </div> : null}
    {job ? <div className="admin-catalog-completion-job" role="status">
      {running ? <progress max={job.total} value={job.done} aria-label={it ? "Avanzamento del lotto" : "Batch progress"} /> : null}
      <p>{running ? (it ? "Ricerca in corso: " : "Researching: ") : `${stopLabel} `}
        {it
          ? `${job.done} di ${job.total} esaminati · ${job.created} proposti · ${job.unknown} non riconosciuti${job.failed ? ` · ${job.failed} non riusciti` : ""} · costo ${usd(job.cost_usd)} su ${usd(job.budget_usd)}.`
          : `${job.done} of ${job.total} checked · ${job.created} proposed · ${job.unknown} not recognised${job.failed ? ` · ${job.failed} failed` : ""} · cost ${usd(job.cost_usd)} of ${usd(job.budget_usd)}.`}</p>
      {running ? <button type="button" className="secondary compact" disabled={busy} onClick={() => void send(`${URL}/cancel`)}>{it ? "Interrompi" : "Stop"}</button> : null}
      {job.error ? <p role="alert">{job.error}</p> : null}
    </div> : null}
    {status?.proposal_count ? <div className="admin-catalog-baselines-proposals">
      <div className="admin-catalog-baselines-proposals-head">
        <strong>{status.proposal_count} {it ? "riferimenti proposti da attivare" : "proposed baselines to activate"}</strong>
        <button type="button" className="secondary compact" disabled={disabled || busy} onClick={approveAll}>{it ? `Attiva tutti (${status.proposals.length})` : `Activate all (${status.proposals.length})`}</button>
      </div>
      <p>{it ? "Sono stime dell’AI, da 0 a 100, con un peso inferiore ai riferimenti redazionali. Finché non le attivi non cambiano alcun profilo." : "These are AI estimates, 0 to 100, weighing less than the editorial baselines. Until activated they change no profile."}</p>
      <ul>{status.proposals.map((item) => <li key={item.id}>
        <div className="admin-catalog-baselines-proposal-head">
          <div><strong>{item.entity_key}</strong><small>{kind(item.entity_type)} · {wines(item.wines)}</small></div>
          <div className="admin-catalog-baselines-proposal-actions">
            <button type="button" className="secondary compact" disabled={disabled || busy} aria-label={`${it ? "Attiva" : "Activate"} ${item.entity_key}`} onClick={() => void send(`${URL}/approve`, { ids: [item.id] })}>{it ? "Attiva" : "Activate"}</button>
            <button type="button" className="secondary compact" disabled={disabled || busy} aria-label={`${it ? "Scarta" : "Discard"} ${item.entity_key}`} onClick={() => void send(`${URL}/discard`, { ids: [item.id] })}>{it ? "Scarta" : "Discard"}</button>
          </div>
        </div>
        <dl>{DIMENSIONS.map(([key, italian, english]) => {
          const value = Math.round((item.dimensions[key] ?? 0) * 100);
          return <div key={key}><dt>{it ? italian : english}</dt><dd><span style={{ width: `${value}%` }} /><b>{value}</b></dd></div>;
        })}</dl>
      </li>)}</ul>
    </div> : null}
    <div className="admin-catalog-baselines-recalculate">
      <p>{it ? "Dopo aver attivato nuovi riferimenti o completato le schede, aggiorna i profili stimati già esistenti." : "After activating baselines or completing entries, refresh the estimated profiles that already exist."}</p>
      <button type="button" className="secondary" disabled={disabled || busy || running} onClick={() => void recalculate()}>{it ? "Ricalcola i profili stimati" : "Recompute estimated profiles"}</button>
      {recalculated ? <p role="status">{it
        ? `${recalculated.updated} profili aggiornati su ${recalculated.checked} stimati.`
        : `${recalculated.updated} profiles updated out of ${recalculated.checked} estimated.`}</p> : null}
    </div>
    {error ? <p role="alert">{error}</p> : null}
  </section>;
}
