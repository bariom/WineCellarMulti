import type { Locale, OperationalMetricsHistory, OperationalMetricsOverview } from "../types";
import { LoadingState } from "./AppUi";
import "./OperationsPanel.css";

type OperationsPanelProps = {
  locale: Locale;
  overview: OperationalMetricsOverview | null;
  history: OperationalMetricsHistory | null;
  onRefresh: () => void;
};

export function OperationsPanel({ locale, overview, history, onRefresh }: OperationsPanelProps) {
  return (
    <section className="settings-card operations-card">
      <div className="settings-card-heading">
        <div>
          <span>{locale === "it" ? "Amministrazione applicazione" : "Application administration"}</span>
          <h3>{locale === "it" ? "Stato operativo" : "Operational status"}</h3>
        </div>
        <button type="button" className="secondary compact" onClick={onRefresh}>{locale === "it" ? "Aggiorna" : "Refresh"}</button>
      </div>
      <p className="settings-help-copy">
        {locale === "it" ? "Metriche aggregate riservate all'app-admin. L'aggiornamento avviene solo quando questa scheda è aperta." : "Aggregated metrics restricted to the app admin. Refreshing occurs only while this tab is open."}
      </p>
      {overview ? (
        <>
          <div className="operations-metrics-grid">
            <div><span>CPU</span><strong>{overview.system.host.cpu_percent.toFixed(1)}%</strong></div>
            <div><span>RAM</span><strong>{overview.system.host.memory.percent.toFixed(1)}%</strong></div>
            <div><span>{locale === "it" ? "Disco" : "Disk"}</span><strong>{overview.system.host.disk.percent.toFixed(1)}%</strong></div>
            <div><span>TCP</span><strong>{overview.system.network.tcp_established ?? "—"}</strong><small>{locale === "it" ? "stabilite" : "established"}</small></div>
            <div><span>Conntrack</span><strong>{overview.system.conntrack.count ?? "—"}{overview.system.conntrack.max ? ` / ${overview.system.conntrack.max}` : ""}</strong></div>
            <div><span>{locale === "it" ? "Latenza media" : "Average latency"}</span><strong>{overview.application.average_duration_ms === null ? "—" : `${overview.application.average_duration_ms.toFixed(0)} ms`}</strong></div>
          </div>
          <div className="operations-summary">
            <span>{locale === "it" ? "Richieste" : "Requests"} <strong>{overview.application.requests_total}</strong></span>
            <span>{locale === "it" ? "Errori 5xx" : "5xx errors"} <strong>{overview.application.errors_total}</strong></span>
            <span>{locale === "it" ? "Utenti" : "Users"} <strong>{overview.business.users_total}</strong></span>
            <span>{locale === "it" ? "Bottiglie" : "Bottles"} <strong>{overview.business.bottles_total}</strong></span>
          </div>
          <p className="operations-note">
            {locale === "it" ? `${history?.samples.length || 0} campioni nelle ultime 24 ore. ` : `${history?.samples.length || 0} samples in the last 24 hours. `}
            {overview.history_sampling}
          </p>
        </>
      ) : <LoadingState label={locale === "it" ? "Caricamento metriche…" : "Loading metrics…"} />}
    </section>
  );
}
