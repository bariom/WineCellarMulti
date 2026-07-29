import { useEffect, useState } from "react";
import type { OperationalMetricsHistory, OperationalMetricsOverview } from "./types";
import "./monitor.css";

const TOKEN_STORAGE_KEY = "vinaris.monitor.device-token";

async function monitorApi<T>(path: string, token: string): Promise<T> {
  const response = await fetch(path, { headers: { Authorization: `Bearer ${token}` } });
  if (!response.ok) throw new Error(response.status === 401 ? "Token non valido o revocato." : "Impossibile aggiornare le metriche.");
  return response.json() as Promise<T>;
}

function value(value: number | null | undefined, suffix = "") {
  return value === null || value === undefined ? "—" : `${value.toFixed(0)}${suffix}`;
}

export function MonitorApp() {
  const [token, setToken] = useState(() => window.localStorage.getItem(TOKEN_STORAGE_KEY) || "");
  const [draftToken, setDraftToken] = useState("");
  const [overview, setOverview] = useState<OperationalMetricsOverview | null>(null);
  const [history, setHistory] = useState<OperationalMetricsHistory | null>(null);
  const [hours, setHours] = useState(6);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function refresh(activeToken = token, activeHours = hours) {
    if (!activeToken) return;
    setLoading(true);
    try {
      const [nextOverview, nextHistory] = await Promise.all([
        monitorApi<OperationalMetricsOverview>("/api/v1/admin/operations/overview", activeToken),
        monitorApi<OperationalMetricsHistory>(`/api/v1/admin/operations/history?hours=${activeHours}`, activeToken),
      ]);
      setOverview(nextOverview);
      setHistory(nextHistory);
      setError("");
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Impossibile aggiornare le metriche.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!token) return;
    void refresh();
    const interval = window.setInterval(() => void refresh(), 60000);
    return () => window.clearInterval(interval);
  }, [token, hours]);

  function connect() {
    const nextToken = draftToken.trim();
    if (!nextToken) return;
    window.localStorage.setItem(TOKEN_STORAGE_KEY, nextToken);
    setToken(nextToken);
    setDraftToken("");
  }

  if (!token) {
    return <main className="monitor-shell monitor-onboarding">
      <div className="monitor-brand"><span>V</span><strong>Vinaris Monitor</strong></div>
      <section className="monitor-card">
        <p>ACCESSO AMMINISTRATORE</p>
        <h1>La tua cantina, sotto controllo.</h1>
        <span>Incolla il token dispositivo creato in Vinaris per consultare le metriche in sola lettura.</span>
        <input value={draftToken} onChange={(event) => setDraftToken(event.target.value)} placeholder="Token Vinaris Monitor" autoCapitalize="none" autoCorrect="off" />
        <button type="button" onClick={connect}>Collega Monitor</button>
      </section>
    </main>;
  }

  const application = overview?.application;
  const system = overview?.system;
  const samples = history?.samples || [];
  const latest = samples[samples.length - 1]?.application;
  const p95 = application?.interactive_p95_duration_ms;

  return <main className="monitor-shell">
    <header className="monitor-header">
      <div className="monitor-brand"><span>V</span><strong>Vinaris Monitor</strong></div>
      <button type="button" className="monitor-refresh" onClick={() => void refresh()} disabled={loading}>{loading ? "…" : "Aggiorna"}</button>
    </header>
    {error ? <p className="monitor-error">{error}</p> : null}
    <section className="monitor-hero">
      <p>REATTIVITÀ API</p>
      <strong>{value(p95, " ms")}</strong>
      <span>P95 API interattive · ultimi 15 minuti</span>
      <small>{application?.interactive_p50_duration_ms !== null && application?.interactive_p50_duration_ms !== undefined ? `Mediana ${value(application.interactive_p50_duration_ms, " ms")} · ${application.interactive_requests_recent || 0} richieste` : "In attesa di traffico recente"}</small>
    </section>
    <div className="monitor-grid">
      <section className="monitor-card"><span>CPU</span><strong>{system ? value(system.host.cpu_percent, "%") : "—"}</strong></section>
      <section className="monitor-card"><span>RAM</span><strong>{system ? value(system.host.memory.percent, "%") : "—"}</strong></section>
      <section className="monitor-card"><span>DISCO</span><strong>{system ? value(system.host.disk.percent, "%") : "—"}</strong></section>
      <section className="monitor-card"><span>TCP</span><strong>{system?.network.tcp_established ?? "—"}</strong></section>
    </div>
    <section className="monitor-card monitor-history">
      <div className="monitor-section-head"><div><span>ANDAMENTO</span><strong>Reattività API</strong></div><small>{latest?.interactive_p95_duration_ms ? `${value(latest.interactive_p95_duration_ms, " ms")} ultimo` : "—"}</small></div>
      <div className="monitor-range">{[1, 6, 24, 168].map((option) => <button type="button" className={hours === option ? "active" : ""} onClick={() => setHours(option)} key={option}>{option === 168 ? "7g" : `${option}h`}</button>)}</div>
      <div className="monitor-sparkline" aria-label="Storico reattività API">
        {samples.map((sample) => {
          const metric = sample.application.interactive_p95_duration_ms ?? sample.application.average_duration_ms;
          return <i key={sample.collected_at} style={{ height: `${Math.max(5, Math.min(100, ((metric || 0) / 1500) * 100))}%` }} title={`${value(metric, " ms")} · ${new Date(sample.collected_at).toLocaleString("it-CH")}`} />;
        })}
      </div>
      <small>AI, import ed elaborazione foto sono esclusi da questa misura.</small>
    </section>
    <section className="monitor-card monitor-summary">
      <span>OPERAZIONI LUNGHE ESCLUSE</span><strong>{application?.slow_requests_recent ?? "—"}</strong>
      <small>Richieste totali dall’avvio: {application?.requests_total ?? "—"} · Errori 5xx: {application?.errors_total ?? "—"}</small>
    </section>
    <button type="button" className="monitor-disconnect" onClick={() => { window.localStorage.removeItem(TOKEN_STORAGE_KEY); setToken(""); setOverview(null); }}>Disconnetti questo dispositivo</button>
  </main>;
}
