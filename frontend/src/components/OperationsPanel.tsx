import { useEffect, useState } from "react";
import type { Locale, OperationalMetricsHistory, OperationalMetricsOverview } from "../types";
import { LoadingState } from "./AppUi";
import { api } from "../services/api";
import "./OperationsPanel.css";

type OperationsPanelProps = {
  locale: Locale;
  overview: OperationalMetricsOverview | null;
  history: OperationalMetricsHistory | null;
  onRefresh: () => void;
};

type ChartLine = { label: string; color: string; values: Array<number | null>; suffix: string };

function linePath(values: Array<number | null>) {
  const valid = values.filter((value): value is number => value !== null && Number.isFinite(value));
  if (!valid.length) return "";
  const minimum = Math.min(...valid);
  const maximum = Math.max(...valid);
  const range = maximum - minimum || 1;
  return values.map((value, index) => {
    if (value === null || !Number.isFinite(value)) return null;
    const x = values.length === 1 ? 50 : (index / (values.length - 1)) * 100;
    const y = 92 - ((value - minimum) / range) * 84;
    return `${x.toFixed(2)},${y.toFixed(2)}`;
  }).filter(Boolean).join(" ");
}

function OperationsChart({ title, lines, locale }: { title: string; lines: ChartLine[]; locale: Locale }) {
  const hasData = lines.some((line) => line.values.some((value) => value !== null));
  return (
    <section className="operations-chart-card">
      <div className="operations-chart-heading"><strong>{title}</strong><span>{locale === "it" ? "Storico" : "History"}</span></div>
      {hasData ? (
        <svg className="operations-chart" viewBox="0 0 100 100" role="img" aria-label={title} preserveAspectRatio="none">
          {[16, 50, 84].map((y) => <line className="operations-chart-grid" key={y} x1="0" x2="100" y1={y} y2={y} />)}
          {lines.map((line) => <polyline key={line.label} points={linePath(line.values)} stroke={line.color} />)}
        </svg>
      ) : <p className="operations-chart-empty">{locale === "it" ? "In attesa di campioni" : "Waiting for samples"}</p>}
      <div className="operations-chart-legend">
        {lines.map((line) => {
          const last = [...line.values].reverse().find((value) => value !== null);
          return <span key={line.label}><i style={{ backgroundColor: line.color }} />{line.label} <strong>{last === undefined ? "—" : `${last.toFixed(1)}${line.suffix}`}</strong></span>;
        })}
      </div>
    </section>
  );
}

function level(value: number, warning: number, critical: number) {
  if (value >= critical) return "critical";
  if (value >= warning) return "warning";
  return "healthy";
}

export function OperationsPanel({ locale, overview, history, onRefresh }: OperationsPanelProps) {
  const isItalian = locale === "it";
  const [selectedHours, setSelectedHours] = useState(24);
  const [selectedHistory, setSelectedHistory] = useState(history);

  useEffect(() => {
    if (selectedHours === 24) setSelectedHistory(history);
  }, [history, selectedHours]);

  async function selectHours(hours: number) {
    setSelectedHours(hours);
    if (hours === 24) {
      setSelectedHistory(history);
      return;
    }
    setSelectedHistory(await api<OperationalMetricsHistory>(`/api/v1/admin/operations/history?hours=${hours}`));
  }
  const conntrackPercent = overview?.system.conntrack.count !== null && overview?.system.conntrack.max
    ? (overview.system.conntrack.count / overview.system.conntrack.max) * 100
    : null;
  const alerts = overview ? [
    ["CPU", overview.system.host.cpu_percent, "%"],
    ["RAM", overview.system.host.memory.percent, "%"],
    [isItalian ? "Disco" : "Disk", overview.system.host.disk.percent, "%"],
    ["Conntrack", conntrackPercent, "%"],
    [isItalian ? "Latenza" : "Latency", overview.application.average_duration_ms, " ms"],
  ].flatMap(([label, rawValue, suffix]) => {
    const value = Number(rawValue);
    if (!Number.isFinite(value)) return [];
    const status = label === (isItalian ? "Latenza" : "Latency") ? level(value, 750, 1500) : level(value, 80, 90);
    return status === "healthy" ? [] : [{ label, value, suffix, status }];
  }) : [];
  const samples = selectedHistory?.samples || [];
  const latestPersistedSample = samples[samples.length - 1];
  const stale = latestPersistedSample ? Date.now() - new Date(latestPersistedSample.collected_at).getTime() > 180000 : false;

  return (
    <section className="settings-card operations-card">
      <div className="settings-card-heading">
        <div>
          <span>{isItalian ? "Amministrazione applicazione" : "Application administration"}</span>
          <h3>{isItalian ? "Stato operativo" : "Operational status"}</h3>
        </div>
        <button type="button" className="secondary compact" onClick={onRefresh}>{isItalian ? "Aggiorna" : "Refresh"}</button>
      </div>
      <p className="settings-help-copy">
        {isItalian ? "Metriche aggregate riservate all'app-admin. L'aggiornamento avviene solo quando questa scheda è aperta." : "Aggregated metrics restricted to the app admin. Refreshing occurs only while this tab is open."}
      </p>
      {overview ? (
        <>
          <div className={`operations-health ${stale ? "warning" : alerts.some((alert) => alert.status === "critical") ? "critical" : alerts.length ? "warning" : "healthy"}`} role="status">
            <strong>{stale ? (isItalian ? "Dati non aggiornati" : "Stale data") : alerts.some((alert) => alert.status === "critical") ? (isItalian ? "Richiede attenzione" : "Needs attention") : alerts.length ? (isItalian ? "Da monitorare" : "Monitor") : (isItalian ? "Operativo" : "Healthy")}</strong>
            <span>{stale ? (isItalian ? "L'ultimo campione ha più di tre minuti." : "The latest sample is more than three minutes old.") : alerts.length ? alerts.map((alert) => `${alert.label} ${alert.value.toFixed(0)}${alert.suffix}`).join(" · ") : (isItalian ? "Nessuna soglia superata." : "No threshold exceeded.")}</span>
          </div>
          <div className="operations-metrics-grid">
            <div className={level(overview.system.host.cpu_percent, 80, 90)}><span>CPU</span><strong>{overview.system.host.cpu_percent.toFixed(1)}%</strong></div>
            <div className={level(overview.system.host.memory.percent, 80, 90)}><span>RAM</span><strong>{overview.system.host.memory.percent.toFixed(1)}%</strong></div>
            <div className={level(overview.system.host.disk.percent, 80, 90)}><span>{isItalian ? "Disco" : "Disk"}</span><strong>{overview.system.host.disk.percent.toFixed(1)}%</strong></div>
            <div><span>TCP</span><strong>{overview.system.network.tcp_established ?? "—"}</strong><small>{isItalian ? "stabilite" : "established"}</small></div>
            <div className={conntrackPercent === null ? "" : level(conntrackPercent, 70, 85)}><span>Conntrack</span><strong>{overview.system.conntrack.count ?? "—"}{overview.system.conntrack.max ? ` / ${overview.system.conntrack.max}` : ""}</strong></div>
            <div className={overview.application.average_duration_ms === null ? "" : level(overview.application.average_duration_ms, 750, 1500)}><span>{isItalian ? "Latenza media" : "Average latency"}</span><strong>{overview.application.average_duration_ms === null ? "—" : `${overview.application.average_duration_ms.toFixed(0)} ms`}</strong></div>
          </div>
          <div className="operations-summary">
            <span>{isItalian ? "Richieste" : "Requests"} <strong>{overview.application.requests_total}</strong></span>
            <span>{isItalian ? "Errori 5xx" : "5xx errors"} <strong>{overview.application.errors_total}</strong></span>
            <span>{isItalian ? "Utenti" : "Users"} <strong>{overview.business.users_total}</strong></span>
            <span>{isItalian ? "Bottiglie" : "Bottles"} <strong>{overview.business.bottles_total}</strong></span>
          </div>
          <div className="operations-history-controls" role="group" aria-label={isItalian ? "Intervallo storico" : "History range"}>
            {[1, 24, 168].map((option) => <button type="button" key={option} className={selectedHours === option ? "" : "secondary"} onClick={() => void selectHours(option)}>{option === 168 ? (isItalian ? "7 giorni" : "7 days") : `${option}h`}</button>)}
          </div>
          <div className="operations-charts">
            <OperationsChart locale={locale} title={isItalian ? "Risorse host" : "Host resources"} lines={[
              { label: "CPU", color: "#598a62", values: samples.map((sample) => sample.system.host.cpu_percent), suffix: "%" },
              { label: "RAM", color: "#ad7c3c", values: samples.map((sample) => sample.system.host.memory.percent), suffix: "%" },
              { label: isItalian ? "Disco" : "Disk", color: "#4a7ca6", values: samples.map((sample) => sample.system.host.disk.percent), suffix: "%" },
            ]} />
            <OperationsChart locale={locale} title={isItalian ? "Rete e latenza" : "Network and latency"} lines={[
              { label: "TCP", color: "#7b4b44", values: samples.map((sample) => sample.system.network.tcp_established), suffix: "" },
              { label: isItalian ? "Latenza" : "Latency", color: "#755487", values: samples.map((sample) => sample.application.average_duration_ms), suffix: " ms" },
            ]} />
          </div>
          <p className="operations-note">
            {isItalian ? `${samples.length} campioni nell'intervallo selezionato. ` : `${samples.length} samples in the selected range. `}
            {isItalian
              ? `I campioni restano disponibili per ${overview.history_retention_days} giorni.`
              : `Samples are retained for ${overview.history_retention_days} days.`}
          </p>
        </>
      ) : <LoadingState label={isItalian ? "Caricamento metriche…" : "Loading metrics…"} />}
    </section>
  );
}
