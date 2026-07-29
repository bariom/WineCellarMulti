import { useEffect, useMemo, useRef, useState } from "react";
import "uplot/dist/uPlot.min.css";
import type { OperationalMetricsHistory, OperationalMetricsOverview, UserActivityLogEntry } from "./types";
import "./monitor.css";

const TOKEN_STORAGE_KEY = "vinaris.monitor.device-token";

async function monitorApi<T>(path: string, token: string): Promise<T> {
  const response = await fetch(path, { headers: { Authorization: `Bearer ${token}` } });
  if (!response.ok) throw new Error(response.status === 401 ? "Token non valido o revocato." : "Impossibile aggiornare le metriche.");
  return response.json() as Promise<T>;
}

function value(nextValue: number | null | undefined, suffix = "") {
  return nextValue === null || nextValue === undefined ? "—" : `${nextValue.toFixed(0)}${suffix}`;
}

function activityLabel(action: string) {
  const labels: Record<string, string> = { ai_generation: "Generazione AI", ai_wine_complete: "Analisi AI completa", wine_created: "Vino aggiunto", wine_updated: "Vino aggiornato", wine_consumed: "Vino degustato", data_import: "Importazione dati", app_action: "Azione nell'app" };
  return labels[action] || labels.app_action;
}

function MonitorChart({ title, subtitle, color, points, formatter }: { title: string; subtitle: string; color: string; points: Array<{ timestamp: string; value: number | null }>; formatter: (value: number | null) => string }) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const [selected, setSelected] = useState<number | null>(null);
  const usable = points.filter((point) => point.value !== null && Number.isFinite(point.value));
  const active = points[selected ?? points.length - 1] || null;

  useEffect(() => {
    const host = hostRef.current;
    if (!host || !usable.length) return;
    let chart: { width: number; destroy: () => void; setSize: (size: { width: number; height: number }) => void; setCursor: (cursor: { left: number; top: number }) => void; valToPos: (value: number, scale: string) => number } | null = null;
    let resizeObserver: ResizeObserver | null = null;
    let cancelled = false;
    const timestamps = points.map((point) => new Date(point.timestamp).getTime() / 1000);
    const values = points.map((point) => point.value);
    void import("uplot").then(({ default: Uplot }) => {
      if (cancelled) return;
      const width = Math.max(280, Math.floor(host.clientWidth));
      const dateFormat = new Intl.DateTimeFormat("it-CH", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
      chart = new Uplot({
        width, height: 190, padding: [12, 8, 0, 8],
        scales: { x: { time: true }, y: { auto: true } },
        axes: [{ stroke: "#9da69b", grid: { show: false }, size: 30, values: (_chart, values) => values.map((item) => new Intl.DateTimeFormat("it-CH", { hour: "2-digit", minute: "2-digit" }).format(new Date(item * 1000))) }, { stroke: "#9da69b", grid: { stroke: "#3b423b", width: 1 }, size: 42, values: (_chart, values) => values.map((item) => formatter(item)) }],
        series: [{ label: "Ora", value: (_chart, item) => item === null ? "â€”" : dateFormat.format(new Date(Number(item) * 1000)) }, { label: title, stroke: color, width: 2.5, points: { show: false }, value: (_chart, item) => formatter(item === null ? null : Number(item)) }],
        cursor: { drag: { x: false, y: false, setScale: false }, points: { size: 8 } },
        hooks: { setCursor: [(instance) => { if (typeof instance.cursor.idx === "number") setSelected(instance.cursor.idx); }] },
      }, [timestamps, values], host);
      const lastIndex = timestamps.length - 1;
      chart.setCursor({ left: chart.valToPos(timestamps[lastIndex], "x"), top: 0 });
      resizeObserver = new ResizeObserver(([entry]) => {
        const nextWidth = Math.floor(entry.contentRect.width);
        if (nextWidth && chart && nextWidth !== chart.width) chart.setSize({ width: nextWidth, height: 190 });
      });
      resizeObserver.observe(host);
    });
    return () => { cancelled = true; resizeObserver?.disconnect(); chart?.destroy(); };
  }, [color, points, title, usable.length]);

  return <section className="monitor-card monitor-chart-card">
    <div className="monitor-section-head"><div><span>{subtitle}</span><strong>{title}</strong></div><b>{formatter(active?.value ?? null)}</b></div>
    {usable.length ? <><div className="monitor-uplot" ref={hostRef} aria-label={`${title}. Tocca il grafico per esplorare`} /><small>{active ? `${new Date(active.timestamp).toLocaleString("it-CH", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })} · scorri o tocca il grafico per esplorare` : ""}</small></> : <p className="monitor-empty">In attesa di campioni</p>}
  </section>;
}

export function MonitorApp() {
  const [token, setToken] = useState(() => window.localStorage.getItem(TOKEN_STORAGE_KEY) || "");
  const [draftToken, setDraftToken] = useState("");
  const [overview, setOverview] = useState<OperationalMetricsOverview | null>(null);
  const [history, setHistory] = useState<OperationalMetricsHistory | null>(null);
  const [activity, setActivity] = useState<UserActivityLogEntry[]>([]);
  const [hours, setHours] = useState(6);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function refresh(activeToken = token, activeHours = hours) {
    if (!activeToken) return;
    setLoading(true);
    try {
      const [nextOverview, nextHistory, nextActivity] = await Promise.all([
        monitorApi<OperationalMetricsOverview>("/api/v1/admin/operations/overview", activeToken),
        monitorApi<OperationalMetricsHistory>(`/api/v1/admin/operations/history?hours=${activeHours}`, activeToken),
        monitorApi<UserActivityLogEntry[]>("/api/v1/admin/operations/activity?limit=6", activeToken),
      ]);
      setOverview(nextOverview); setHistory(nextHistory); setActivity(nextActivity); setError("");
    } catch (nextError) { setError(nextError instanceof Error ? nextError.message : "Impossibile aggiornare le metriche."); }
    finally { setLoading(false); }
  }

  useEffect(() => { if (!token) return; void refresh(); const interval = window.setInterval(() => void refresh(), 60000); return () => window.clearInterval(interval); }, [token, hours]);
  function connect() { const nextToken = draftToken.trim(); if (!nextToken) return; window.localStorage.setItem(TOKEN_STORAGE_KEY, nextToken); setToken(nextToken); setDraftToken(""); }

  if (!token) return <main className="monitor-shell monitor-onboarding"><div className="monitor-brand"><span>V</span><strong>Vinaris Monitor</strong></div><section className="monitor-card"><p>ACCESSO AMMINISTRATORE</p><h1>La tua cantina, sotto controllo.</h1><span>Incolla il token dispositivo creato in Vinaris per consultare le metriche in sola lettura.</span><input value={draftToken} onChange={(event) => setDraftToken(event.target.value)} placeholder="Token Vinaris Monitor" autoCapitalize="none" autoCorrect="off" /><button type="button" onClick={connect}>Collega Monitor</button></section></main>;

  const app = overview?.application; const system = overview?.system; const business = overview?.business; const samples = history?.samples || [];
  const latencyPoints = useMemo(() => samples.map((sample) => ({ timestamp: sample.collected_at, value: sample.application.interactive_p95_duration_ms ?? sample.application.average_duration_ms })), [samples]);
  const cpuPoints = useMemo(() => samples.map((sample) => ({ timestamp: sample.collected_at, value: sample.system.host.cpu_percent })), [samples]);
  const memoryPoints = useMemo(() => samples.map((sample) => ({ timestamp: sample.collected_at, value: sample.system.host.memory.percent })), [samples]);

  return <main className="monitor-shell">
    <header className="monitor-header"><div className="monitor-brand"><span>V</span><strong>Vinaris Monitor</strong></div><button type="button" className="monitor-refresh" onClick={() => void refresh()} disabled={loading}>{loading ? "Aggiorno…" : "Aggiorna"}</button></header>
    {error ? <p className="monitor-error">{error}</p> : null}
    <section className="monitor-hero"><p>REATTIVITÀ API</p><strong>{value(app?.interactive_p95_duration_ms, " ms")}</strong><span>P95 API interattive · ultimi 15 minuti</span><small>{app?.interactive_p50_duration_ms !== null && app?.interactive_p50_duration_ms !== undefined ? `Mediana ${value(app.interactive_p50_duration_ms, " ms")} · ${app.interactive_requests_recent || 0} richieste` : "In attesa di traffico recente"}</small></section>
    <div className="monitor-status-row"><span className={app?.errors_total ? "alert" : "healthy"}>{app?.errors_total ? `${app.errors_total} errori 5xx` : "Nessun errore 5xx"}</span><span>{app?.slow_requests_recent ?? "—"} operazioni lente escluse</span></div>
    <div className="monitor-grid"><section className="monitor-card"><span>CPU</span><strong>{system ? value(system.host.cpu_percent, "%") : "—"}</strong></section><section className="monitor-card"><span>RAM</span><strong>{system ? value(system.host.memory.percent, "%") : "—"}</strong></section><section className="monitor-card"><span>DISCO</span><strong>{system ? value(system.host.disk.percent, "%") : "—"}</strong></section><section className="monitor-card"><span>TCP</span><strong>{system?.network.tcp_established ?? "—"}</strong></section></div>
    <div className="monitor-range">{[1, 6, 24, 168].map((option) => <button type="button" className={hours === option ? "active" : ""} onClick={() => setHours(option)} key={option}>{option === 168 ? "7g" : `${option}h`}</button>)}</div>
    <div className="monitor-charts"><MonitorChart title="Reattività API" subtitle="P95 INTERATTIVE" color="#e0b84f" points={latencyPoints} formatter={(nextValue) => value(nextValue, " ms")} /><MonitorChart title="CPU" subtitle="RISORSE HOST" color="#79bd83" points={cpuPoints} formatter={(nextValue) => value(nextValue, "%")} /><MonitorChart title="Memoria" subtitle="RISORSE HOST" color="#84aee3" points={memoryPoints} formatter={(nextValue) => value(nextValue, "%")} /></div>
    <section className="monitor-card monitor-kpi-section"><div className="monitor-section-head"><div><span>CANTINA</span><strong>Inventario e attività</strong></div><b>{business?.bottles_total ?? "—"}</b></div><div className="monitor-kpi-grid"><div><span>Vini</span><strong>{business?.wines_total ?? "—"}</strong></div><div><span>Degustazioni 30g</span><strong>{business?.tastings_30d ?? "—"}</strong></div><div><span>Da ritirare</span><strong>{business?.bottles_to_collect ?? "—"}</strong></div><div><span>Consegne</span><strong>{business?.bottles_in_future_deliveries ?? "—"}</strong></div></div></section>
    <section className="monitor-card monitor-kpi-section"><div className="monitor-section-head"><div><span>AI</span><strong>Uso e costi</strong></div><b>{overview?.openai.current_month_usd === null || overview?.openai.current_month_usd === undefined ? "—" : `$${overview.openai.current_month_usd.toFixed(2)}`}</b></div><div className="monitor-kpi-grid"><div><span>Azioni 30g</span><strong>{business?.ai_requests_30d ?? "—"}</strong></div><div><span>Successi</span><strong>{business?.ai_requests_30d ? `${Math.round(((business.ai_successes_30d || 0) / business.ai_requests_30d) * 100)}%` : "—"}</strong></div><div><span>Ricerche nome</span><strong>{business?.wine_name_searches_30d ?? "—"}</strong></div><div><span>Foto bottiglie</span><strong>{business?.wine_photos_total ?? "—"}</strong></div></div></section>
    <section className="monitor-card monitor-activity"><div className="monitor-section-head"><div><span>ATTIVITÀ</span><strong>Ultime azioni</strong></div></div>{activity.length ? activity.map((item) => <article key={item.id}><div><strong>{activityLabel(item.action)}</strong><small>{item.user_display_name}</small></div><time>{new Date(item.created_at).toLocaleString("it-CH", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}</time></article>) : <p className="monitor-empty">Nessuna attività recente</p>}</section>
    <button type="button" className="monitor-disconnect" onClick={() => { window.localStorage.removeItem(TOKEN_STORAGE_KEY); setToken(""); setOverview(null); }}>Disconnetti questo dispositivo</button>
  </main>;
}
