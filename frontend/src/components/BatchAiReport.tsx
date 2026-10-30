import type { CSSProperties } from "react";
import type { AiAuditLog, Locale, Wine, WineAiFeature } from "../types";
import { numberLocale } from "../domain/cellar";
import { formatMoney, formatUsd } from "./panelSupport";
import "./BatchAiReport.css";

export type BatchAiItem = {
  wine: Wine;
  status: "pending" | "running" | "done" | "no_result" | "failed";
  updated?: Wine;
  reason?: string;
  /** The audit entries this wine produced: its cost and, for the value, its sources. */
  entries: AiAuditLog[];
};

export type BatchAiRun = {
  feature: WineAiFeature;
  label: string;
  items: BatchAiItem[];
  finished: boolean;
  stopping: boolean;
};

/** Whether a wine's run left an audit entry with market sources to open. */
function hasMarketSources(item: BatchAiItem) {
  return item.entries.some((entry) => (entry.sources || []).some((source) => source?.kind === "market_source"));
}

function outcome(item: BatchAiItem, feature: WineAiFeature, locale: Locale, hideValue: boolean) {
  const it = locale === "it";
  const wine = item.updated;
  if (item.status === "failed") return item.reason || (it ? "Non completato" : "Not completed");
  if (item.status === "no_result") {
    return feature === "value"
      ? (it ? "Nessun prezzo verificato: escluso dalle prossime ricerche" : "No verified price: left out of future searches")
      : (it ? "Nessun dato utilizzabile" : "No usable data");
  }
  if (!wine) return "";
  const parts: string[] = [];
  if (!hideValue && (feature === "value" || feature === "all")) {
    const before = item.wine.current_value;
    const after = wine.current_value;
    if (after !== null && after !== undefined) {
      const price = Number(wine.price || 0);
      const delta = price > 0 ? ((Number(after) - price) / price) * 100 : null;
      parts.push(`${before !== null && before !== undefined && Number(before) !== Number(after) ? `${formatMoney(before, wine.currency, locale, 0, 2)} → ` : ""}${formatMoney(after, wine.currency, locale, 0, 2)}${delta !== null ? ` (${delta >= 0 ? "+" : ""}${delta.toLocaleString(numberLocale(locale), { minimumFractionDigits: 1, maximumFractionDigits: 1 })}% ${it ? "sul prezzo d'acquisto" : "on purchase price"})` : ""}`);
    }
  }
  if ((feature === "drink-window" || feature === "all") && wine.drink_from && wine.drink_to) {
    parts.push(`${it ? "Beva" : "Drink"} ${wine.drink_from}–${wine.drink_to}${wine.drink_peak_from && wine.drink_peak_to ? ` · ${it ? "apice" : "peak"} ${wine.drink_peak_from}–${wine.drink_peak_to}` : ""}`);
  }
  if ((feature === "grapes" || feature === "all") && wine.grapes.length) {
    parts.push(wine.grapes.map((grape) => {
      const from = String(grape.percentage_from || "");
      const to = String(grape.percentage_to || "");
      return from ? `${grape.name} ${from}${to && to !== from ? `–${to}` : ""}%` : grape.name;
    }).join(", "));
  }
  const scores = wine.scores.filter((score) => score.verification_status !== "unverified");
  if ((feature === "scores" || feature === "all") && scores.length) {
    parts.push(scores.slice(0, 3).map((score) => `${score.critic} ${score.score}`).join(" · ") + (scores.length > 3 ? ` +${scores.length - 3}` : ""));
  }
  if (feature === "notes" && wine.ai_notes.trim()) parts.push(wine.ai_notes.trim().slice(0, 140) + (wine.ai_notes.trim().length > 140 ? "…" : ""));
  return parts.join(" · ") || (it ? "Completato" : "Completed");
}

/**
 * The report of an AI run over several wines. It fills in while the run goes on,
 * so results can be read before the last wine is done, and can be folded into a
 * small progress chip to keep using the app.
 */
export default function BatchAiReport({ run, locale, hideValue = false, minimized, onMinimize, onRestore, onClose, onStop, onDetails }: {
  run: BatchAiRun;
  locale: Locale;
  /** An event guest: at a venue the market price would reveal the markup. */
  hideValue?: boolean;
  minimized: boolean;
  onMinimize: () => void;
  onRestore: () => void;
  onClose: () => void;
  onStop: () => void;
  onDetails: (item: BatchAiItem) => void;
}) {
  const it = locale === "it";
  const total = run.items.length;
  const settled = run.items.filter((item) => item.status !== "pending" && item.status !== "running");
  const succeeded = run.items.filter((item) => item.status === "done").length;
  const noResults = run.items.filter((item) => item.status === "no_result").length;
  const failures = run.items.filter((item) => item.status === "failed").length;
  const cost = run.items.reduce((sum, item) => sum + item.entries.reduce((entrySum, entry) => entrySum + Number(entry.estimated_cost_usd || 0), 0), 0);
  // A few wines run side by side: name the one when alone, count them otherwise.
  const runningItems = run.items.filter((item) => item.status === "running");
  const current = runningItems.length === 1 ? runningItems[0] : null;
  const percent = total ? Math.round((settled.length / total) * 100) : 0;
  const stopped = run.finished && settled.length < total;

  if (minimized) {
    return <button type="button" className={`batch-ai-chip${run.finished ? " is-finished" : ""}`} onClick={onRestore} aria-label={it ? `Mostra il resoconto: ${run.label}, ${settled.length} di ${total}` : `Show the report: ${run.label}, ${settled.length} of ${total}`}>
      <span className="batch-ai-chip-ring" style={{ "--batch-progress": `${percent}%` } as CSSProperties} aria-hidden="true" />
      <span><strong>{run.label}</strong><small>{run.finished ? (it ? "Completato" : "Finished") : `${settled.length}/${total}`}</small></span>
    </button>;
  }

  return <div className="auth-modal-overlay batch-ai-report-overlay" onClick={run.finished ? onClose : onMinimize}>
    <section className="auth-modal-card batch-ai-report" role="dialog" aria-modal="true" aria-labelledby="batch-ai-report-title" onClick={(event) => event.stopPropagation()}>
      <header className="auth-modal-head">
        <div>
          <span>{run.finished ? (stopped ? (it ? "Arricchimento AI interrotto" : "AI enrichment stopped") : (it ? "Arricchimento AI completato" : "AI enrichment completed")) : (it ? "Arricchimento AI in corso" : "AI enrichment in progress")}</span>
          <h2 id="batch-ai-report-title">{run.label}</h2>
        </div>
        {run.finished
          ? <button type="button" className="secondary compact" onClick={onClose}>{it ? "Chiudi" : "Close"}</button>
          : <button type="button" className="secondary compact" onClick={onMinimize}>{it ? "Riduci" : "Minimise"}</button>}
      </header>

      <div className="batch-ai-report-progress" role="status" aria-live="polite">
        <div className="batch-ai-report-bar" aria-hidden="true"><span style={{ width: `${percent}%` }} /></div>
        <p>
          <strong>{settled.length}/{total}</strong>
          {current ? <span>{it ? "Sto elaborando" : "Working on"} <b>{current.wine.name}</b>{current.wine.vintage ? ` ${current.wine.vintage}` : ""}</span> : null}
          {runningItems.length > 1 ? <span>{it ? `Sto elaborando ${runningItems.length} vini insieme` : `Working on ${runningItems.length} wines at once`}</span> : null}
          {run.stopping && !run.finished ? <span>{runningItems.length > 1 ? (it ? "Mi fermo dopo i vini in corso…" : "Stopping after the wines in progress…") : (it ? "Mi fermo dopo questo vino…" : "Stopping after this wine…")}</span> : null}
        </p>
      </div>

      <dl className="batch-ai-report-stats">
        <div><dt>{it ? "Completati" : "Completed"}</dt><dd>{succeeded}</dd></div>
        <div className={noResults ? "has-no-results" : ""}><dt>{it ? "Senza risultato utile" : "No useful result"}</dt><dd>{noResults}</dd></div>
        <div className={failures ? "has-failures" : ""}><dt>{it ? "Non completati" : "Not completed"}</dt><dd>{failures}</dd></div>
        <div><dt>{it ? "Costo AI" : "AI cost"}</dt><dd>{formatUsd(cost)}</dd></div>
      </dl>

      <ol className="batch-ai-report-rows">
        {run.items.map((item) => {
          return <li key={item.wine.id} className={`is-${item.status}`}>
            <span className="batch-ai-report-state" aria-hidden="true" />
            <div>
              <strong>{item.wine.name}{item.wine.vintage ? <small> {item.wine.vintage}</small> : null}</strong>
              <span>{item.status === "pending" ? (it ? "In attesa" : "Waiting") : item.status === "running" ? (it ? "In corso…" : "In progress…") : outcome(item, run.feature, locale, hideValue)}</span>
            </div>
            {!hideValue && hasMarketSources(item) ? <button type="button" className="secondary compact" onClick={() => onDetails(item)}>{it ? "Dettagli" : "Details"}</button> : null}
          </li>;
        })}
      </ol>

      <footer className="batch-ai-report-footer">
        {!run.finished ? <button type="button" className="secondary" onClick={onStop} disabled={run.stopping}>{it ? "Interrompi" : "Stop"}</button> : null}
        {run.finished ? <button type="button" onClick={onClose}>{it ? "Fatto" : "Done"}</button> : <button type="button" onClick={onMinimize}>{it ? "Continua a usare Vinaris" : "Keep using Vinaris"}</button>}
      </footer>
    </section>
  </div>;
}
