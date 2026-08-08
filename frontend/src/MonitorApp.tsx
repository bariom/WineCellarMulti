import { useEffect, useMemo, useRef, useState } from "react";
import "uplot/dist/uPlot.min.css";
import { activityLabel } from "./domain/activity";
import type {
  DemoActivitySummary,
  OperationalMetricsHistory,
  OperationalMetricsOverview,
  UserActivityLogEntry,
} from "./types";
import "./monitor.css";

const TOKEN_STORAGE_KEY = "vinaris.monitor.device-token";
const STALE_AFTER_MS = 12 * 60 * 1000;

async function monitorApi<T>(path: string, token: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, ...init?.headers },
  });
  if (!response.ok) {
    if (response.status === 401) throw new Error("Token non valido o revocato.");
    if (response.status === 403) throw new Error("Questo dispositivo non è più autorizzato.");
    throw new Error("Impossibile aggiornare il monitor.");
  }
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

function value(nextValue: number | null | undefined, suffix = "") {
  return nextValue === null || nextValue === undefined ? "—" : `${nextValue.toFixed(0)}${suffix}`;
}

function dateTime(timestamp: string | null | undefined) {
  if (!timestamp) return "Mai";
  return new Date(timestamp).toLocaleString("it-CH", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function winePulseStatus(status: string | null | undefined) {
  const labels: Record<string, string> = {
    completed: "Aggiornato",
    completed_with_errors: "Aggiornato con errori",
    failed: "Raccolta non riuscita",
    running: "Raccolta in corso",
    not_started: "In attesa della prima raccolta",
  };
  return labels[status || ""] || "Stato non disponibile";
}

function uptime(seconds: number | null | undefined) {
  if (seconds === null || seconds === undefined) return "—";
  const days = Math.floor(seconds / 86_400);
  const hours = Math.floor((seconds % 86_400) / 3_600);
  return days ? `${days}g ${hours}h` : `${hours}h`;
}

function usd(amount: number | null | undefined) {
  return amount === null || amount === undefined ? "—" : `$${amount.toFixed(2)}`;
}

function MonitorChart({
  title,
  subtitle,
  color,
  points,
  formatter,
}: {
  title: string;
  subtitle: string;
  color: string;
  points: Array<{ timestamp: string; value: number | null }>;
  formatter: (value: number | null) => string;
}) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const [selected, setSelected] = useState<number | null>(null);
  const usable = points.filter((point) => point.value !== null && Number.isFinite(point.value));
  const active = points[selected ?? points.length - 1] || null;

  useEffect(() => {
    const host = hostRef.current;
    if (!host || !usable.length) return;
    let chart: {
      width: number;
      destroy: () => void;
      setSize: (size: { width: number; height: number }) => void;
      setCursor: (cursor: { left: number; top: number }) => void;
      valToPos: (value: number, scale: string) => number;
    } | null = null;
    let resizeObserver: ResizeObserver | null = null;
    let cancelled = false;
    const timestamps = points.map((point) => new Date(point.timestamp).getTime() / 1000);
    const values = points.map((point) => point.value);

    void import("uplot").then(({ default: Uplot }) => {
      if (cancelled) return;
      const width = Math.max(280, Math.floor(host.clientWidth));
      const dateFormat = new Intl.DateTimeFormat("it-CH", {
        day: "2-digit",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
      });
      chart = new Uplot(
        {
          width,
          height: 190,
          padding: [12, 8, 0, 8],
          scales: { x: { time: true }, y: { auto: true } },
          axes: [
            {
              stroke: "#9da69b",
              grid: { show: false },
              size: 30,
              values: (_chart, ticks) =>
                ticks.map((item) =>
                  new Intl.DateTimeFormat("it-CH", {
                    hour: "2-digit",
                    minute: "2-digit",
                  }).format(new Date(item * 1000)),
                ),
            },
            {
              stroke: "#9da69b",
              grid: { stroke: "#3b423b", width: 1 },
              size: 42,
              values: (_chart, ticks) => ticks.map((item) => formatter(item)),
            },
          ],
          series: [
            {
              label: "Ora",
              value: (_chart, item) => (item === null ? "—" : dateFormat.format(new Date(Number(item) * 1000))),
            },
            {
              label: title,
              stroke: color,
              width: 2.5,
              points: { show: false },
              value: (_chart, item) => formatter(item === null ? null : Number(item)),
            },
          ],
          cursor: { drag: { x: false, y: false, setScale: false }, points: { size: 8 } },
          hooks: {
            setCursor: [
              (instance) => {
                if (typeof instance.cursor.idx === "number") setSelected(instance.cursor.idx);
              },
            ],
          },
        },
        [timestamps, values],
        host,
      );
      const lastIndex = timestamps.length - 1;
      chart.setCursor({ left: chart.valToPos(timestamps[lastIndex], "x"), top: 0 });
      resizeObserver = new ResizeObserver(([entry]) => {
        const nextWidth = Math.floor(entry.contentRect.width);
        if (nextWidth && chart && nextWidth !== chart.width) {
          chart.setSize({ width: nextWidth, height: 190 });
        }
      });
      resizeObserver.observe(host);
    });

    return () => {
      cancelled = true;
      resizeObserver?.disconnect();
      chart?.destroy();
    };
  }, [color, formatter, points, title, usable.length]);

  return (
    <section className="monitor-card monitor-chart-card">
      <div className="monitor-section-head">
        <div><span>{subtitle}</span><strong>{title}</strong></div>
        <b>{formatter(active?.value ?? null)}</b>
      </div>
      {usable.length ? (
        <>
          <div className="monitor-uplot" ref={hostRef} aria-label={`${title}. Tocca il grafico per esplorare`} />
          <small>{active ? `${dateTime(active.timestamp)} · tocca il grafico per esplorare` : ""}</small>
        </>
      ) : <p className="monitor-empty">In attesa di campioni</p>}
    </section>
  );
}

export function MonitorApp() {
  const [token, setToken] = useState(() => window.localStorage.getItem(TOKEN_STORAGE_KEY) || "");
  const [draftToken, setDraftToken] = useState("");
  const [overview, setOverview] = useState<OperationalMetricsOverview | null>(null);
  const [history, setHistory] = useState<OperationalMetricsHistory | null>(null);
  const [activity, setActivity] = useState<UserActivityLogEntry[]>([]);
  const [demoActivity, setDemoActivity] = useState<DemoActivitySummary | null>(null);
  const [hours, setHours] = useState(6);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [activityExpanded, setActivityExpanded] = useState(false);
  const [shareFeedback, setShareFeedback] = useState("");

  const samples = history?.samples || [];
  const latencyPoints = useMemo(
    () => samples.map((sample) => ({
      timestamp: sample.collected_at,
      value: sample.application.interactive_p95_duration_ms ?? sample.application.average_duration_ms,
    })),
    [samples],
  );
  const cpuPoints = useMemo(
    () => samples.map((sample) => ({ timestamp: sample.collected_at, value: sample.system.host.cpu_percent })),
    [samples],
  );
  const memoryPoints = useMemo(
    () => samples.map((sample) => ({ timestamp: sample.collected_at, value: sample.system.host.memory.percent })),
    [samples],
  );

  async function refresh(activeToken = token, activeHours = hours, collect = false) {
    if (!activeToken) return;
    setLoading(true);
    try {
      if (collect) {
        await monitorApi<void>("/api/v1/admin/operations/collect-now", activeToken, { method: "POST" });
      }
      const [nextOverview, nextHistory, nextActivity, nextDemoActivity] = await Promise.all([
        monitorApi<OperationalMetricsOverview>("/api/v1/admin/operations/overview", activeToken),
        monitorApi<OperationalMetricsHistory>(`/api/v1/admin/operations/history?hours=${activeHours}`, activeToken),
        monitorApi<UserActivityLogEntry[]>("/api/v1/admin/operations/activity?limit=16", activeToken),
        monitorApi<DemoActivitySummary>("/api/v1/admin/operations/demo-activity", activeToken),
      ]);
      setOverview(nextOverview);
      setHistory(nextHistory);
      setActivity(nextActivity);
      setDemoActivity(nextDemoActivity);
      setError("");
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Impossibile aggiornare il monitor.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!token) return;
    void refresh();
    const interval = window.setInterval(() => void refresh(), 60_000);
    const onVisibility = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [token, hours]);

  function connect() {
    const nextToken = draftToken.trim();
    if (!nextToken) return;
    window.localStorage.setItem(TOKEN_STORAGE_KEY, nextToken);
    setToken(nextToken);
    setDraftToken("");
  }

  function disconnect() {
    window.localStorage.removeItem(TOKEN_STORAGE_KEY);
    setToken("");
    setOverview(null);
    setHistory(null);
    setActivity([]);
  }

  async function shareStatus() {
    if (!overview) return;
    const app = overview.application;
    const system = overview.system;
    const business = overview.business;
    const alerts = overview.active_alerts;
    const pendingUsers = Math.max(business.users_total - business.users_approved, 0);
    const winePulse = business.wine_pulse;
    const snapshot = [
      `Vinaris Monitor · ${alerts.length ? "attenzione richiesta" : "operativo"}`,
      `Rilevazione: ${dateTime(overview.collected_at)}`,
      `API P95: ${value(app.interactive_p95_duration_ms, " ms")} · errori 5xx: ${app.errors_total}`,
      `CPU ${value(system.host.cpu_percent, "%")} · RAM ${value(system.host.memory.percent, "%")} · disco ${value(system.host.disk.percent, "%")}`,
      `Utenti: ${business.users_enabled} attivi · ${pendingUsers} da approvare · ${business.users_blocked} bloccati`,
      `AI mese corrente: ${usd(overview.openai.current_month_usd)} · ${business.ai_requests_30d} azioni negli ultimi 30g`,
      `Wine Pulse: ${winePulseStatus(winePulse.last_status)} · ${winePulse.published} notizie pubblicate · fonti sane ${winePulse.healthy_sources}/${winePulse.active_sources}`,
      alerts.length
        ? `Allerte: ${alerts.map((alert) => `${alert.label} ${alert.value.toFixed(0)}${alert.suffix}`).join(", ")}`
        : "Allerte: nessuna",
    ].join("\n");

    try {
      if (navigator.share) {
        await navigator.share({ title: "Vinaris Monitor", text: snapshot });
        setShareFeedback("Stato condiviso");
      } else {
        await navigator.clipboard.writeText(snapshot);
        setShareFeedback("Diagnostica copiata");
      }
      window.setTimeout(() => setShareFeedback(""), 2400);
    } catch (shareError) {
      if (shareError instanceof DOMException && shareError.name === "AbortError") return;
      setShareFeedback("Condivisione non disponibile");
    }
  }

  if (!token) {
    return (
      <main className="monitor-shell monitor-onboarding">
        <div className="monitor-brand"><span>V</span><strong>Vinaris Monitor</strong></div>
        <section className="monitor-card">
          <p>ACCESSO AMMINISTRATORE</p>
          <h1>Vinaris, sotto controllo.</h1>
          <span>Incolla il token dispositivo creato in Vinaris. Il monitor resta in sola lettura.</span>
          <input
            value={draftToken}
            onChange={(event) => setDraftToken(event.target.value)}
            onKeyDown={(event) => { if (event.key === "Enter") connect(); }}
            placeholder="Token Vinaris Monitor"
            autoCapitalize="none"
            autoCorrect="off"
          />
          <button type="button" onClick={connect}>Collega Monitor</button>
        </section>
      </main>
    );
  }

  const app = overview?.application;
  const system = overview?.system;
  const business = overview?.business;
  const alerts = overview?.active_alerts || [];
  const hasCriticalAlert = alerts.some((alert) => alert.severity === "critical");
  const sampleIsStale = overview
    ? Date.now() - new Date(overview.collected_at).getTime() > STALE_AFTER_MS
    : false;
  const winePulse = business?.wine_pulse;
  const winePulseIsStale = Boolean(
    winePulse?.enabled
    && (!winePulse.last_completed_at || Date.now() - new Date(winePulse.last_completed_at).getTime() > 10 * 60 * 60 * 1000),
  );
  const winePulseFailed = winePulse?.enabled && winePulse.last_status === "failed";
  const winePulseNeedsAttention = Boolean(
    winePulse?.enabled
    && (winePulseFailed || winePulseIsStale || winePulse.failed_sources > 0 || winePulse.last_status === "completed_with_errors"),
  );
  const healthTone = hasCriticalAlert || winePulseFailed ? "critical" : alerts.length || sampleIsStale || winePulseNeedsAttention ? "warning" : "healthy";
  const healthLabel = hasCriticalAlert || winePulseFailed
    ? "Intervento richiesto"
    : alerts.length || winePulseNeedsAttention
      ? "Da controllare"
      : sampleIsStale
        ? "Dati non recenti"
        : "Operativo";
  const pendingUsers = business ? Math.max(business.users_total - business.users_approved, 0) : null;
  const aiSuccessRate = business?.ai_requests_30d
    ? Math.round(((business.ai_successes_30d || 0) / business.ai_requests_30d) * 100)
    : null;
  const visibleActivity = activityExpanded ? activity : activity.slice(0, 6);

  return (
    <main className="monitor-shell">
      <header className="monitor-header">
        <div className="monitor-brand"><span>V</span><strong>Vinaris Monitor</strong></div>
        <button
          type="button"
          className="monitor-refresh"
          onClick={() => void refresh(token, hours, true)}
          disabled={loading}
        >
          {loading ? "Raccolgo…" : "Aggiorna"}
        </button>
      </header>

      {error ? <p className="monitor-error">{error}</p> : null}

      <section className={`monitor-hero ${healthTone}`}>
        <div className="monitor-health-row">
          <div><p>STATO OPERATIVO</p><strong>{healthLabel}</strong></div>
          <span className="monitor-health-dot" aria-hidden="true" />
        </div>
        <div className="monitor-hero-metrics">
          <span><small>P95 API</small><b>{value(app?.interactive_p95_duration_ms, " ms")}</b></span>
          <span><small>ULTIMA LETTURA</small><b>{dateTime(overview?.collected_at)}</b></span>
        </div>
        <small>
          {app?.interactive_p50_duration_ms !== null && app?.interactive_p50_duration_ms !== undefined
            ? `Mediana ${value(app.interactive_p50_duration_ms, " ms")} · ${app.interactive_requests_recent || 0} richieste recenti`
            : "In attesa di traffico recente"}
        </small>
      </section>

      <div className="monitor-status-row">
        <span className={app?.errors_total ? "alert" : "healthy"}>
          {app?.errors_total ? `${app.errors_total} errori 5xx dall'avvio` : "Nessun errore 5xx"}
        </span>
        <span>Uptime {uptime(app?.uptime_seconds)}</span>
        <span>{app?.slow_requests_recent ?? "—"} operazioni lente escluse</span>
      </div>

      {alerts.length ? (
        <section className="monitor-card monitor-alerts">
          <div className="monitor-section-head">
            <div><span>ALLERTE ATTIVE</span><strong>Richiedono attenzione</strong></div>
            <b>{alerts.length}</b>
          </div>
          {alerts.map((alert) => (
            <article className={alert.severity} key={alert.metric}>
              <span><i aria-hidden="true" /><strong>{alert.label}</strong><small>Da {dateTime(alert.opened_at)}</small></span>
              <b>{alert.value.toFixed(0)}{alert.suffix}</b>
            </article>
          ))}
        </section>
      ) : null}

      <div className="monitor-action-row">
        <button type="button" onClick={() => void shareStatus()} disabled={!overview}>Condividi stato</button>
        {shareFeedback ? <span role="status">{shareFeedback}</span> : null}
      </div>

      <div className="monitor-grid">
        <section className="monitor-card"><span>CPU</span><strong>{system ? value(system.host.cpu_percent, "%") : "—"}</strong></section>
        <section className="monitor-card"><span>RAM</span><strong>{system ? value(system.host.memory.percent, "%") : "—"}</strong></section>
        <section className="monitor-card"><span>DISCO</span><strong>{system ? value(system.host.disk.percent, "%") : "—"}</strong></section>
        <section className="monitor-card"><span>TCP</span><strong>{system?.network.tcp_established ?? "—"}</strong></section>
      </div>

      <div className="monitor-range" aria-label="Intervallo dei grafici">
        {[1, 6, 24, 168].map((option) => (
          <button
            type="button"
            className={hours === option ? "active" : ""}
            onClick={() => setHours(option)}
            key={option}
          >
            {option === 168 ? "7g" : `${option}h`}
          </button>
        ))}
      </div>

      <div className="monitor-charts">
        <MonitorChart title="Reattività API" subtitle="P95 INTERATTIVE" color="#d6b35d" points={latencyPoints} formatter={(nextValue) => value(nextValue, " ms")} />
        <MonitorChart title="CPU" subtitle="RISORSE HOST" color="#79bd83" points={cpuPoints} formatter={(nextValue) => value(nextValue, "%")} />
        <MonitorChart title="Memoria" subtitle="RISORSE HOST" color="#84aee3" points={memoryPoints} formatter={(nextValue) => value(nextValue, "%")} />
      </div>

      <section className="monitor-card monitor-kpi-section">
        <div className="monitor-section-head"><div><span>ACCESSI</span><strong>Utenti e cantine</strong></div><b>{business?.users_enabled ?? "—"}</b></div>
        <div className="monitor-kpi-grid">
          <div><span>Utenti attivi</span><strong>{business?.users_enabled ?? "—"}</strong></div>
          <div className={pendingUsers ? "attention" : ""}><span>Da approvare</span><strong>{pendingUsers ?? "—"}</strong></div>
          <div className={business?.users_blocked ? "attention" : ""}><span>Bloccati</span><strong>{business?.users_blocked ?? "—"}</strong></div>
          <div><span>Cantine</span><strong>{business?.households_total ?? "—"}</strong></div>
        </div>
      </section>

      <section className="monitor-card monitor-kpi-section">
        <div className="monitor-section-head"><div><span>CANTINA</span><strong>Inventario e attività</strong></div><b>{business?.bottles_total ?? "—"}</b></div>
        <div className="monitor-kpi-grid">
          <div><span>Vini</span><strong>{business?.wines_total ?? "—"}</strong></div>
          <div><span>Degustazioni 30g</span><strong>{business?.tastings_30d ?? "—"}</strong></div>
          <div><span>Da ritirare</span><strong>{business?.bottles_to_collect ?? "—"}</strong></div>
          <div><span>Consegne future</span><strong>{business?.bottles_in_future_deliveries ?? "—"}</strong></div>
        </div>
      </section>

      <section className="monitor-card monitor-kpi-section">
        <div className="monitor-section-head">
          <div><span>AI</span><strong>Uso e costi</strong></div>
          <b>{usd(overview?.openai.current_month_usd)}</b>
        </div>
        {overview?.openai.change_percent !== null && overview?.openai.change_percent !== undefined ? (
          <p className={`monitor-trend ${overview.openai.change_percent > 0 ? "up" : "down"}`}>
            {overview.openai.change_percent > 0 ? "+" : ""}{overview.openai.change_percent.toFixed(0)}% rispetto al periodo precedente equivalente
          </p>
        ) : null}
        <div className="monitor-kpi-grid">
          <div><span>Azioni 30g</span><strong>{business?.ai_requests_30d ?? "—"}</strong></div>
          <div><span>Successi</span><strong>{aiSuccessRate === null ? "—" : `${aiSuccessRate}%`}</strong></div>
          <div><span>Ricerca nomi</span><strong>{usd(business?.wine_name_search_cost_30d_usd)}</strong></div>
          <div><span>Foto bottiglie</span><strong>{business?.wine_photos_total ?? "—"}</strong></div>
        </div>
      </section>

      <section className={`monitor-card monitor-kpi-section${winePulseNeedsAttention ? " monitor-pulse-attention" : ""}`}>
        <div className="monitor-section-head">
          <div><span>WINE PULSE</span><strong>Rassegna editoriale</strong></div>
          <b>{winePulse?.enabled ? winePulseStatus(winePulse.last_status) : "Disattivato"}</b>
        </div>
        <div className="monitor-kpi-grid">
          <div><span>Notizie pubblicate</span><strong>{winePulse?.published ?? "—"}</strong></div>
          <div className={winePulse?.failed_sources ? "attention" : ""}><span>Fonti sane</span><strong>{winePulse ? `${winePulse.healthy_sources}/${winePulse.active_sources}` : "—"}</strong></div>
          <div className={winePulseIsStale ? "attention" : ""}><span>Ultima raccolta</span><strong>{dateTime(winePulse?.last_completed_at)}</strong></div>
          <div className={winePulse?.last_run.ai_errors ? "attention" : ""}><span>Valutati dall'AI</span><strong>{winePulse?.last_run.ai_processed ?? "—"}</strong></div>
        </div>
        {winePulse?.enabled ? (
          <p className="monitor-pulse-note">
            {winePulseNeedsAttention
              ? winePulse.last_error || (winePulseIsStale ? "La raccolta non risulta aggiornata nelle ultime dieci ore." : "Controlla le fonti o l'ultima raccolta.")
              : `${winePulse.last_run.new} nuove voci rilevate · ${winePulse.last_run.published} selezionate nell'ultima raccolta.`}
          </p>
        ) : null}
      </section>

      <section className="monitor-card monitor-kpi-section">
        <div className="monitor-section-head"><div><span>CANTINA DEMO</span><strong>Visite alla demo</strong></div><b>{demoActivity?.total_visits ?? "—"}</b></div>
        <div className="monitor-kpi-grid monitor-kpi-grid-three">
          <div><span>Ultime 24 ore</span><strong>{demoActivity?.visits_24h ?? "—"}</strong></div>
          <div><span>Ultimi 7 giorni</span><strong>{demoActivity?.visits_7d ?? "—"}</strong></div>
          <div><span>Ultima visita</span><strong>{dateTime(demoActivity?.last_visit_at)}</strong></div>
        </div>
      </section>

      <section className="monitor-card monitor-activity">
        <div className="monitor-section-head"><div><span>ATTIVITÀ</span><strong>Ultime azioni</strong></div><b>{activity.length}</b></div>
        {visibleActivity.length ? visibleActivity.map((item) => (
          <article key={item.id}>
            <div><strong>{activityLabel(item.action, "it")}</strong><small>{item.user_display_name} · {item.user_email}</small></div>
            <time>{dateTime(item.created_at)}</time>
          </article>
        )) : <p className="monitor-empty">Nessuna attività recente</p>}
        {activity.length > 6 ? (
          <button type="button" className="monitor-text-button" onClick={() => setActivityExpanded((current) => !current)}>
            {activityExpanded ? "Mostra meno" : `Mostra altre ${activity.length - 6}`}
          </button>
        ) : null}
      </section>

      <button type="button" className="monitor-disconnect" onClick={disconnect}>Disconnetti questo dispositivo</button>
    </main>
  );
}
