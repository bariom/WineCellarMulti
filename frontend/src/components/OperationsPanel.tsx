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

type ChartScale = { min: number; max: number; suffix: string };
type ChartLine = { label: string; color: string; values: Array<number | null>; suffix: string; axis?: "primary" | "secondary" };

const chartBounds = { left: 14, right: 106, top: 12, bottom: 88 };

function linePath(values: Array<number | null>, scale: ChartScale) {
  if (!values.some((value) => value !== null && Number.isFinite(value))) return "";
  const range = scale.max - scale.min || 1;
  return values.map((value, index) => {
    if (value === null || !Number.isFinite(value)) return null;
    const x = values.length === 1
      ? (chartBounds.left + chartBounds.right) / 2
      : chartBounds.left + (index / (values.length - 1)) * (chartBounds.right - chartBounds.left);
    const y = Math.max(chartBounds.top, Math.min(chartBounds.bottom, chartBounds.bottom - ((value - scale.min) / range) * (chartBounds.bottom - chartBounds.top)));
    return `${x.toFixed(2)},${y.toFixed(2)}`;
  }).filter(Boolean).join(" ");
}

function roundedScale(values: Array<number | null>, suffix: string): ChartScale {
  const maximum = Math.max(...values.filter((value): value is number => value !== null && Number.isFinite(value)), 0);
  if (maximum <= 1) return { min: 0, max: 1, suffix };
  const magnitude = 10 ** Math.floor(Math.log10(maximum));
  const factor = [1, 2, 5, 10].find((candidate) => maximum <= candidate * magnitude) || 10;
  return { min: 0, max: factor * magnitude, suffix };
}

function formatScaleValue(value: number, scale: ChartScale) {
  return `${value < 10 && value % 1 ? value.toFixed(1) : value.toFixed(0)}${scale.suffix}`;
}

function ScaleLabels({ scale, side }: { scale: ChartScale; side: "left" | "right" }) {
  return <>{[chartBounds.top, 50, chartBounds.bottom].map((y, index) => {
    const value = scale.max - ((scale.max - scale.min) * index) / 2;
    return <text key={y} className="operations-chart-scale-label" x={side === "left" ? 1 : 119} y={y} textAnchor={side === "left" ? "start" : "end"} dominantBaseline="middle">{formatScaleValue(value, scale)}</text>;
  })}</>;
}

function OperationsChart({ title, lines, locale, primaryScale, secondaryScale }: {
  title: string;
  lines: ChartLine[];
  locale: Locale;
  primaryScale: ChartScale;
  secondaryScale?: ChartScale;
}) {
  const hasData = lines.some((line) => line.values.some((value) => value !== null));
  return (
    <section className="operations-chart-card">
      <div className="operations-chart-heading"><strong>{title}</strong><span>{locale === "it" ? "Storico" : "History"}</span></div>
      {hasData ? (
        <svg className="operations-chart" viewBox="0 0 120 100" role="img" aria-label={title} preserveAspectRatio="none">
          {[chartBounds.top, 50, chartBounds.bottom].map((y) => <line className="operations-chart-grid" key={y} x1={chartBounds.left} x2={chartBounds.right} y1={y} y2={y} />)}
          <ScaleLabels scale={primaryScale} side="left" />
          {secondaryScale ? <ScaleLabels scale={secondaryScale} side="right" /> : null}
          {lines.map((line) => <polyline key={line.label} points={linePath(line.values, line.axis === "secondary" && secondaryScale ? secondaryScale : primaryScale)} stroke={line.color} />)}
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

function usd(value: number, locale: Locale) {
  return new Intl.NumberFormat(locale === "it" ? "it-CH" : "en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  }).format(value);
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
  const hostScale: ChartScale = { min: 0, max: 100, suffix: "%" };
  const tcpScale = roundedScale(samples.map((sample) => sample.system.network.tcp_established), "");
  const latencyScale = roundedScale(samples.map((sample) => sample.application.average_duration_ms), " ms");

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
          <section className="operations-openai-cost" aria-label={isItalian ? "Costi OpenAI" : "OpenAI costs"}>
            <div>
              <span>{isItalian ? "Costi OpenAI" : "OpenAI costs"}</span>
              <strong>{overview.openai.available && overview.openai.current_month_usd !== null ? usd(overview.openai.current_month_usd, locale) : "—"}</strong>
              <small>{isItalian ? "Mese in corso · dati aggregati del portale OpenAI" : "Current month · aggregate data from the OpenAI portal"}</small>
            </div>
            {overview.openai.available && overview.openai.previous_period_usd !== null ? (
              <div className="operations-openai-comparison">
                <span>{isItalian ? "Periodo precedente" : "Previous period"}</span>
                <strong>{usd(overview.openai.previous_period_usd, locale)}</strong>
                {overview.openai.change_percent !== null && <small className={overview.openai.change_percent > 0 ? "warning" : "healthy"}>{overview.openai.change_percent > 0 ? "+" : ""}{overview.openai.change_percent.toFixed(0)}%</small>}
              </div>
            ) : <p>{isItalian ? "Configura OPENAI_ADMIN_KEY sul server per visualizzare i costi." : "Configure OPENAI_ADMIN_KEY on the server to view costs."}</p>}
          </section>
          <div className="operations-history-controls" role="group" aria-label={isItalian ? "Intervallo storico" : "History range"}>
            {[1, 24, 168].map((option) => <button type="button" key={option} className={selectedHours === option ? "" : "secondary"} onClick={() => void selectHours(option)}>{option === 168 ? (isItalian ? "7 giorni" : "7 days") : `${option}h`}</button>)}
          </div>
          <div className="operations-charts">
            <OperationsChart locale={locale} title={isItalian ? "Risorse host" : "Host resources"} lines={[
              { label: "CPU", color: "#598a62", values: samples.map((sample) => sample.system.host.cpu_percent), suffix: "%" },
              { label: "RAM", color: "#ad7c3c", values: samples.map((sample) => sample.system.host.memory.percent), suffix: "%" },
              { label: isItalian ? "Disco" : "Disk", color: "#4a7ca6", values: samples.map((sample) => sample.system.host.disk.percent), suffix: "%" },
            ]} primaryScale={hostScale} />
            <OperationsChart locale={locale} title={isItalian ? "Rete e latenza" : "Network and latency"} lines={[
              { label: "TCP", color: "#7b4b44", values: samples.map((sample) => sample.system.network.tcp_established), suffix: "" },
              { label: isItalian ? "Latenza" : "Latency", color: "#755487", values: samples.map((sample) => sample.application.average_duration_ms), suffix: " ms", axis: "secondary" },
            ]} primaryScale={tcpScale} secondaryScale={latencyScale} />
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
