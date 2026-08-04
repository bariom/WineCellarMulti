import { useEffect, useRef, useState } from "react";
import uPlot from "uplot";
import "uplot/dist/uPlot.min.css";
import type { Locale, OperationalMetricsHistory, OperationalMetricsOverview, UserActivityLogEntry } from "../types";
import { LoadingState } from "./AppUi";
import { api } from "../services/api";
import "./OperationsPanel.css";
import { useChartReveal } from "./chartMotion";

type OperationsPanelProps = {
  locale: Locale;
  overview: OperationalMetricsOverview | null;
  history: OperationalMetricsHistory | null;
  activity: UserActivityLogEntry[];
  onRefresh: () => void | Promise<void>;
};

type ChartScale = { min: number; max: number; suffix: string };
type ChartLine = { label: string; color: string; values: Array<number | null>; suffix: string; axis?: "primary" | "secondary" };
type MonitorDeviceToken = { id: string; label: string; created_at: string; last_used_at: string | null; revoked_at: string | null };
type AiPricing = { price_book: Record<string, Record<string, string>>; custom_price_book_json: string; updated_at: string | null };

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

function OperationsChart({ title, lines, timestamps, locale, primaryScale, secondaryScale }: {
  title: string;
  lines: ChartLine[];
  timestamps: number[];
  locale: Locale;
  primaryScale: ChartScale;
  secondaryScale?: ChartScale;
}) {
  const chartHostRef = useRef<HTMLDivElement | null>(null);
  useChartReveal(chartHostRef);
  const hasData = lines.some((line) => line.values.some((value) => value !== null));

  useEffect(() => {
    const chartHost = chartHostRef.current;
    if (!chartHost || !hasData || !timestamps.length) return;

    const styles = getComputedStyle(chartHost);
    const textColor = styles.getPropertyValue("--text-muted").trim() || "#66716b";
    const gridColor = styles.getPropertyValue("--border").trim() || "#d9d5c8";
    const axisFont = "600 11px system-ui, -apple-system, sans-serif";
    const dateLocale = locale === "it" ? "it-CH" : "en-GB";
    const dateSpan = timestamps[timestamps.length - 1] - timestamps[0];
    const axisDateFormat = new Intl.DateTimeFormat(dateLocale, dateSpan > 172800
      ? { day: "2-digit", month: "short" }
      : { hour: "2-digit", minute: "2-digit" });
    const legendDateFormat = new Intl.DateTimeFormat(dateLocale, { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
    const axis = (scale: ChartScale, scaleKey: string, side: 1 | 3): uPlot.Axis => ({
      scale: scaleKey,
      side,
      size: side === 3 ? 54 : 66,
      gap: 8,
      stroke: textColor,
      font: axisFont,
      grid: { stroke: gridColor, width: 1 },
      ticks: { stroke: gridColor, width: 1, size: 5 },
      values: (_chart, values) => values.map((value) => formatScaleValue(value, scale)),
    });
    const data: uPlot.AlignedData = [timestamps, ...lines.map((line) => line.values)];
    const options: uPlot.Options = {
      width: Math.floor(chartHost.clientWidth) || 560,
      height: 210,
      padding: [10, 4, 0, 4],
      scales: {
        x: { time: true },
        primary: { auto: false, range: [primaryScale.min, primaryScale.max] },
        ...(secondaryScale ? { secondary: { auto: false, range: [secondaryScale.min, secondaryScale.max] as [number, number] } } : {}),
      },
      axes: [
        {
          stroke: textColor,
          font: axisFont,
          grid: { show: false },
          ticks: { stroke: gridColor, width: 1, size: 5 },
          gap: 8,
          size: 36,
          values: (_chart, values) => values.map((value) => axisDateFormat.format(new Date(value * 1000))),
        },
        axis(primaryScale, "primary", 3),
        ...(secondaryScale ? [axis(secondaryScale, "secondary", 1)] : []),
      ],
      series: [
        {
          label: locale === "it" ? "Ora" : "Time",
          value: (_chart, value) => value === null || value === undefined ? "—" : legendDateFormat.format(new Date(Number(value) * 1000)),
        },
        ...lines.map((line): uPlot.Series => ({
          label: line.label,
          scale: line.axis === "secondary" ? "secondary" : "primary",
          stroke: line.color,
          width: 2,
          spanGaps: false,
          points: { show: false },
          value: (_chart, value) => value === null || value === undefined ? "—" : `${Number(value).toFixed(1)}${line.suffix}`,
        })),
      ],
      legend: { show: true, live: true },
      cursor: {
        drag: { x: false, y: false, setScale: false },
        points: { size: 7 },
      },
    };
    const chart = new uPlot(options, data, chartHost);
    chart.setCursor({ left: chart.valToPos(timestamps[timestamps.length - 1], "x"), top: 0 });
    let resizeFrame = 0;
    const observer = new ResizeObserver(([entry]) => {
      const width = Math.floor(entry.contentRect.width);
      if (!width || width === chart.width) return;
      cancelAnimationFrame(resizeFrame);
      resizeFrame = requestAnimationFrame(() => chart.setSize({ width, height: 210 }));
    });
    observer.observe(chartHost);
    return () => {
      observer.disconnect();
      cancelAnimationFrame(resizeFrame);
      chart.destroy();
    };
  }, [hasData, lines, locale, primaryScale, secondaryScale, timestamps]);

  return (
    <section className="operations-chart-card">
      <div className="operations-chart-heading"><strong>{title}</strong><span>{locale === "it" ? "Storico" : "History"}</span></div>
      {hasData
        ? <div className="operations-chart" ref={chartHostRef} role="img" aria-label={title} />
        : <p className="operations-chart-empty">{locale === "it" ? "In attesa di campioni" : "Waiting for samples"}</p>}
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

function successRate(successes: number, total: number) {
  return total > 0 ? `${Math.round((successes / total) * 100)}%` : "—";
}

function activityLabel(action: string, locale: Locale) {
  const labels: Record<string, [string, string]> = {
    ai_generation: ["Generazione AI", "AI generation"],
    ai_wine_complete: ["Analisi AI completa", "Full AI analysis"],
    ai_wine_value: ["Stima valore AI", "AI value estimate"],
    ai_wine_grapes: ["Ricerca uve con AI", "AI grape research"],
    ai_wine_notes: ["Note di degustazione AI", "AI tasting notes"],
    ai_wine_drink_window: ["Finestra di beva AI", "AI drinking window"],
    ai_wine_scores: ["Ricerca punteggi AI", "AI score lookup"],
    ai_wine_comparison: ["Confronto vini con AI", "AI wine comparison"],
    ai_pairing: ["Abbinamento con AI", "AI pairing"],
    ai_buying_advice: ["Consiglio d’acquisto AI", "AI buying advice"],
    ai_label_enrichment: ["Lettura etichetta con AI", "AI label enrichment"],
    ai_wishlist_analysis: ["Analisi AI della wishlist", "AI wishlist analysis"],
    ai_regional_gap_analysis: ["Analisi AI della copertura regionale", "AI regional coverage analysis"],
    wine_created: ["Vino aggiunto", "Wine added"],
    wine_updated: ["Vino aggiornato", "Wine updated"],
    wine_deleted: ["Vino eliminato", "Wine deleted"],
    wine_consumed: ["Vino registrato come bevuto", "Wine recorded as consumed"],
    wine_photo_ai_cutout: ["Scontorno foto con AI", "AI photo cutout"],
    wine_photo_updated: ["Foto bottiglia aggiornata", "Bottle photo updated"],
    wine_photo_removed: ["Foto bottiglia rimossa", "Bottle photo removed"],
    wine_photo_reused: ["Foto bottiglia riutilizzata", "Bottle photo reused"],
    wine_label_recognition: ["Riconoscimento etichetta", "Label recognition"],
    wine_catalog_approved: ["Vino catalogo approvato", "Catalog wine approved"],
    wine_share_offer_created: ["Condivisione vino proposta", "Wine sharing offered"],
    wine_share_offer_accepted: ["Condivisione vino accettata", "Wine sharing accepted"],
    wine_share_offer_rejected: ["Condivisione vino rifiutata", "Wine sharing rejected"],
    wine_share_offer_revoked: ["Condivisione vino revocata", "Wine sharing revoked"],
    wine_share_offer_removed: ["Condivisione vino rimossa", "Wine sharing removed"],
    tasting_updated: ["Degustazione aggiornata", "Tasting updated"],
    tasting_deleted: ["Degustazione eliminata", "Tasting deleted"],
    wine_action: ["Azione su un vino", "Wine action"],
    wishlist_item_created: ["Vino aggiunto alla wishlist", "Wine added to wishlist"],
    wishlist_item_updated: ["Voce wishlist aggiornata", "Wishlist item updated"],
    wishlist_item_deleted: ["Voce wishlist eliminata", "Wishlist item deleted"],
    wishlist_item_converted: ["Wishlist convertita in vino", "Wishlist converted to wine"],
    wishlist_list_created: ["Lista wishlist creata", "Wishlist list created"],
    wishlist_list_updated: ["Lista wishlist aggiornata", "Wishlist list updated"],
    wishlist_list_deleted: ["Lista wishlist eliminata", "Wishlist list deleted"],
    wishlist_action: ["Azione sulla wishlist", "Wishlist action"],
    household_switched: ["Cambio cantina attiva", "Active cellar changed"],
    household_invite_sent: ["Invito cantina inviato", "Cellar invitation sent"],
    household_invite_accepted: ["Invito cantina accettato", "Cellar invitation accepted"],
    household_invite_revoked: ["Invito cantina revocato", "Cellar invitation revoked"],
    household_member_updated: ["Membro cantina aggiornato", "Cellar member updated"],
    household_member_removed: ["Membro cantina rimosso", "Cellar member removed"],
    household_action: ["Gestione cantina", "Cellar management"],
    account_preferences_updated: ["Preferenze account aggiornate", "Account preferences updated"],
    passkey_configured: ["Passkey configurata", "Passkey configured"],
    passkey_removed: ["Passkey rimossa", "Passkey removed"],
    account_action: ["Impostazioni account", "Account settings"],
    data_import: ["Importazione dati", "Data import"],
    coownership_action: ["Gestione comproprietà", "Co-ownership management"],
    tag_created: ["Tag creato", "Tag created"],
    tag_updated: ["Tag aggiornato", "Tag updated"],
    tag_deleted: ["Tag eliminato", "Tag deleted"],
    tag_action: ["Gestione tag", "Tag management"],
    notification_read: ["Notifica letta", "Notification read"],
    notification_archived: ["Notifica archiviata", "Notification archived"],
    notification_restored: ["Notifica ripristinata", "Notification restored"],
    notification_deleted: ["Notifica eliminata", "Notification deleted"],
    notification_action: ["Gestione notifiche", "Notification action"],
    billing_checkout_started: ["Checkout avviato", "Checkout started"],
    billing_portal_opened: ["Portale pagamenti aperto", "Billing portal opened"],
    billing_code_redeemed: ["Codice riscattato", "Code redeemed"],
    billing_action: ["Gestione abbonamento", "Billing action"],
    support_request_sent: ["Richiesta di assistenza inviata", "Support request sent"],
    app_action: ["Azione nell’app", "App action"],
  };
  return (labels[action] || labels.app_action)[locale === "it" ? 0 : 1];
}

export function OperationsPanel({ locale, overview, history, activity, onRefresh }: OperationsPanelProps) {
  const isItalian = locale === "it";
  const [selectedHours, setSelectedHours] = useState(1);
  const [selectedHistory, setSelectedHistory] = useState(history);
  const [monitorToken, setMonitorToken] = useState("");
  const [monitorTokenError, setMonitorTokenError] = useState("");
  const [monitorTokens, setMonitorTokens] = useState<MonitorDeviceToken[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [aiPricingDraft, setAiPricingDraft] = useState("");
  const [aiPricingUpdatedAt, setAiPricingUpdatedAt] = useState<string | null>(null);
  const [aiPricingBusy, setAiPricingBusy] = useState<"ask" | "save" | "" >("");
  const [aiPricingError, setAiPricingError] = useState("");

  useEffect(() => {
    if (selectedHours === 1) setSelectedHistory(history);
  }, [history, selectedHours]);

  async function refreshMonitorTokens() {
    try {
      setMonitorTokens(await api<MonitorDeviceToken[]>("/api/v1/admin/operations/device-tokens"));
    } catch {
      setMonitorTokenError(isItalian ? "Impossibile caricare i token Monitor." : "Unable to load Monitor tokens.");
    }
  }

  async function collectAndRefresh() {
    setRefreshing(true);
    try {
      await api<void>("/api/v1/admin/operations/collect-now", { method: "POST" });
      await onRefresh();
    } finally {
      setRefreshing(false);
    }
  }

  useEffect(() => { void refreshMonitorTokens(); }, []);

  async function loadAiPricing() {
    try {
      const pricing = await api<AiPricing>("/api/v1/admin/operations/ai-pricing");
      setAiPricingDraft(JSON.stringify(pricing.price_book, null, 2));
      setAiPricingUpdatedAt(pricing.updated_at);
    } catch {
      setAiPricingError(isItalian ? "Impossibile caricare il listino AI." : "Unable to load the AI price book.");
    }
  }

  useEffect(() => { void loadAiPricing(); }, []);

  async function askAiForPricing() {
    setAiPricingBusy("ask");
    try {
      const result = await api<{ price_book_json: string }>("/api/v1/admin/operations/ai-pricing/ask-ai", { method: "POST" });
      setAiPricingDraft(JSON.stringify(JSON.parse(result.price_book_json), null, 2));
      setAiPricingError("");
    } catch (error) {
      setAiPricingError(error instanceof Error ? error.message : (isItalian ? "Impossibile chiedere i prezzi all'AI." : "Unable to ask AI for prices."));
    } finally {
      setAiPricingBusy("");
    }
  }

  async function saveAiPricing() {
    setAiPricingBusy("save");
    try {
      const saved = await api<AiPricing>("/api/v1/admin/operations/ai-pricing", {
        method: "PUT",
        body: JSON.stringify({ price_book_json: aiPricingDraft }),
      });
      setAiPricingDraft(JSON.stringify(saved.price_book, null, 2));
      setAiPricingUpdatedAt(saved.updated_at);
      setAiPricingError("");
    } catch (error) {
      setAiPricingError(error instanceof Error ? error.message : (isItalian ? "Impossibile salvare il listino AI." : "Unable to save the AI price book."));
    } finally {
      setAiPricingBusy("");
    }
  }

  async function selectHours(hours: number) {
    setSelectedHours(hours);
    if (hours === 1) {
      setSelectedHistory(history);
      return;
    }
    setSelectedHistory(await api<OperationalMetricsHistory>(`/api/v1/admin/operations/history?hours=${hours}`));
  }

  async function createMonitorToken() {
    try {
      const created = await api<MonitorDeviceToken & { token: string }>("/api/v1/admin/operations/device-tokens?label=Vinaris%20Monitor", { method: "POST" });
      setMonitorToken(created.token);
      setMonitorTokens((tokens) => [created, ...tokens]);
      setMonitorTokenError("");
    } catch {
      setMonitorTokenError(isItalian ? "Impossibile creare il token Monitor." : "Unable to create the Monitor token.");
    }
  }

  async function revokeMonitorToken(deviceToken: MonitorDeviceToken) {
    const confirmed = window.confirm(isItalian ? `Revocare il token “${deviceToken.label}”? Il dispositivo perderà subito accesso a Monitor.` : `Revoke the “${deviceToken.label}” token? The device will lose Monitor access immediately.`);
    if (!confirmed) return;
    try {
      await api<void>(`/api/v1/admin/operations/device-tokens/${deviceToken.id}`, { method: "DELETE" });
      setMonitorTokens((tokens) => tokens.map((token) => token.id === deviceToken.id ? { ...token, revoked_at: new Date().toISOString() } : token));
      setMonitorTokenError("");
    } catch {
      setMonitorTokenError(isItalian ? "Impossibile revocare il token Monitor." : "Unable to revoke the Monitor token.");
    }
  }
  const conntrackPercent = overview?.system.conntrack.count !== null && overview?.system.conntrack.max
    ? (overview.system.conntrack.count / overview.system.conntrack.max) * 100
    : null;
  const interactiveP95 = overview?.application.interactive_p95_duration_ms ?? null;
  const interactiveP50 = overview?.application.interactive_p50_duration_ms ?? null;
  const interactiveWindowMinutes = Math.round((overview?.application.interactive_window_seconds || 900) / 60);
  const alerts = overview ? [
    ["CPU", overview.system.host.cpu_percent, "%"],
    ["RAM", overview.system.host.memory.percent, "%"],
    [isItalian ? "Disco" : "Disk", overview.system.host.disk.percent, "%"],
    ["Conntrack", conntrackPercent, "%"],
    [isItalian ? "P95 API interattive" : "Interactive API p95", interactiveP95, " ms"],
  ].flatMap(([label, rawValue, suffix]) => {
    const value = Number(rawValue);
    if (!Number.isFinite(value)) return [];
    const status = label === (isItalian ? "P95 API interattive" : "Interactive API p95") ? level(value, 750, 1500) : level(value, 80, 90);
    return status === "healthy" ? [] : [{ label, value, suffix, status }];
  }) : [];
  const samples = selectedHistory?.samples || [];
  const timestamps = samples.map((sample) => new Date(sample.collected_at).getTime() / 1000);
  const latestPersistedSample = samples[samples.length - 1];
  const stale = latestPersistedSample ? Date.now() - new Date(latestPersistedSample.collected_at).getTime() > 180000 : false;
  const hostScale: ChartScale = { min: 0, max: 100, suffix: "%" };
  const tcpScale = roundedScale(samples.map((sample) => sample.system.network.tcp_established), "");
  const latencyScale = roundedScale(samples.map((sample) => sample.application.interactive_p95_duration_ms ?? sample.application.average_duration_ms), " ms");

  return (
    <section className="settings-card operations-card">
      <div className="settings-card-heading">
        <div>
          <span>{isItalian ? "Amministrazione applicazione" : "Application administration"}</span>
          <h3>{isItalian ? "Stato operativo" : "Operational status"}</h3>
        </div>
        <button type="button" className="secondary compact" disabled={refreshing} onClick={() => void collectAndRefresh()}>
          {refreshing ? (isItalian ? "Raccolgo…" : "Collecting…") : (isItalian ? "Aggiorna" : "Refresh")}
        </button>
      </div>
      <p className="settings-help-copy">
        {isItalian ? "Metriche aggregate riservate all'app-admin. L'aggiornamento avviene solo quando questa scheda è aperta." : "Aggregated metrics restricted to the app admin. Refreshing occurs only while this tab is open."}
      </p>
      <section className="operations-monitor-token" aria-label="Vinaris Monitor">
        <div><strong>Vinaris Monitor</strong><small>{isItalian ? "Crea un token revocabile per l'app Android in sola lettura." : "Create a revocable read-only token for the Android app."}</small></div>
        <button type="button" className="secondary compact" onClick={() => void createMonitorToken()}>{isItalian ? "Crea token" : "Create token"}</button>
        {monitorToken ? <code>{monitorToken}</code> : null}
        {monitorToken ? <small className="operations-monitor-token-warning">{isItalian ? "Copialo ora: non sarà mostrato di nuovo." : "Copy it now: it will not be shown again."}</small> : null}
        {monitorTokenError ? <small className="operations-monitor-token-error">{monitorTokenError}</small> : null}
        {monitorTokens.length ? <div className="operations-monitor-token-list">
          <strong>{isItalian ? "Dispositivi autorizzati" : "Authorised devices"}</strong>
          {monitorTokens.map((deviceToken) => <div className={deviceToken.revoked_at ? "revoked" : ""} key={deviceToken.id}>
            <span><b>{deviceToken.label}</b><small>{deviceToken.revoked_at ? (isItalian ? "Revocato" : "Revoked") : (deviceToken.last_used_at ? `${isItalian ? "Ultimo utilizzo" : "Last used"}: ${new Date(deviceToken.last_used_at).toLocaleString(isItalian ? "it-CH" : "en-GB")}` : (isItalian ? "Mai utilizzato" : "Never used"))}</small></span>
            {!deviceToken.revoked_at ? <button type="button" className="secondary compact" onClick={() => void revokeMonitorToken(deviceToken)}>{isItalian ? "Revoca" : "Revoke"}</button> : null}
          </div>)}
        </div> : null}
      </section>
      <section className="operations-ai-pricing" aria-label={isItalian ? "Listino modelli AI" : "AI model price book"}>
        <div className="operations-ai-pricing-heading">
          <div>
            <strong>{isItalian ? "Listino modelli AI" : "AI model price book"}</strong>
            <small>{isItalian ? "USD per un milione di token, elaborazione standard. Verifica la proposta AI prima di salvarla." : "USD per one million tokens, standard processing. Review the AI proposal before saving."}</small>
          </div>
          <div>
            <button type="button" className="secondary compact" disabled={Boolean(aiPricingBusy)} onClick={() => void askAiForPricing()}>
              {aiPricingBusy === "ask" ? (isItalian ? "Consulto AI…" : "Asking AI…") : (isItalian ? "Chiedi all'AI" : "Ask AI")}
            </button>
            <button type="button" className="compact" disabled={Boolean(aiPricingBusy)} onClick={() => void saveAiPricing()}>
              {aiPricingBusy === "save" ? (isItalian ? "Salvo…" : "Saving…") : (isItalian ? "Salva listino" : "Save price book")}
            </button>
          </div>
        </div>
        <textarea value={aiPricingDraft} onChange={(event) => setAiPricingDraft(event.target.value)} spellCheck={false} aria-label={isItalian ? "JSON listino modelli AI" : "AI model price book JSON"} />
        {aiPricingUpdatedAt ? <small>{isItalian ? "Ultimo salvataggio" : "Last saved"}: {new Date(aiPricingUpdatedAt).toLocaleString(isItalian ? "it-CH" : "en-GB")}</small> : null}
        {aiPricingError ? <p role="alert">{aiPricingError}</p> : null}
      </section>
      {overview ? (
        <>
          <div className={`operations-health ${stale ? "warning" : alerts.some((alert) => alert.status === "critical") ? "critical" : alerts.length ? "warning" : "healthy"}`} role="status">
            <strong>{stale ? (isItalian ? "Dati non aggiornati" : "Stale data") : alerts.some((alert) => alert.status === "critical") ? (isItalian ? "Richiede attenzione" : "Needs attention") : alerts.length ? (isItalian ? "Da monitorare" : "Monitor") : (isItalian ? "Operativo" : "Healthy")}</strong>
            <span>{stale ? (isItalian ? "L'ultimo campione ha più di tre minuti." : "The latest sample is more than three minutes old.") : alerts.length ? alerts.map((alert) => `${alert.label} ${alert.value.toFixed(0)}${alert.suffix}`).join(" · ") : (isItalian ? "Nessuna soglia superata." : "No threshold exceeded.")}</span>
          </div>
          <section className="operations-section operations-host-section" aria-labelledby="operations-host-heading">
            <h4 id="operations-host-heading">{isItalian ? "Risorse host" : "Host resources"}</h4>
            <div className="operations-metrics-grid operations-host-metrics">
              <div className={level(overview.system.host.cpu_percent, 80, 90)}><span>CPU</span><strong>{overview.system.host.cpu_percent.toFixed(1)}%</strong></div>
              <div className={level(overview.system.host.memory.percent, 80, 90)}><span>RAM</span><strong>{overview.system.host.memory.percent.toFixed(1)}%</strong></div>
              <div className={level(overview.system.host.disk.percent, 80, 90)}><span>{isItalian ? "Disco" : "Disk"}</span><strong>{overview.system.host.disk.percent.toFixed(1)}%</strong></div>
            </div>
          </section>
          <div className="operations-history-controls" role="group" aria-label={isItalian ? "Intervallo storico" : "History range"}>
            {[1, 6, 24, 168].map((option) => <button type="button" key={option} className={selectedHours === option ? "" : "secondary"} onClick={() => void selectHours(option)}>{option === 168 ? (isItalian ? "7 giorni" : "7 days") : `${option}h`}</button>)}
          </div>
          <div className="operations-charts">
            <OperationsChart locale={locale} title={isItalian ? "Risorse host" : "Host resources"} timestamps={timestamps} lines={[
              { label: "CPU", color: "#598a62", values: samples.map((sample) => sample.system.host.cpu_percent), suffix: "%" },
              { label: "RAM", color: "#ad7c3c", values: samples.map((sample) => sample.system.host.memory.percent), suffix: "%" },
              { label: isItalian ? "Disco" : "Disk", color: "#4a7ca6", values: samples.map((sample) => sample.system.host.disk.percent), suffix: "%" },
            ]} primaryScale={hostScale} />
            <OperationsChart locale={locale} title={isItalian ? "Rete e reattivitÃ  API" : "Network and API responsiveness"} timestamps={timestamps} lines={[
              { label: "TCP", color: "#7b4b44", values: samples.map((sample) => sample.system.network.tcp_established), suffix: "" },
              { label: isItalian ? "P95 interattive" : "Interactive p95", color: "#755487", values: samples.map((sample) => sample.application.interactive_p95_duration_ms ?? sample.application.average_duration_ms), suffix: " ms", axis: "secondary" },
            ]} primaryScale={tcpScale} secondaryScale={latencyScale} />
          </div>
          <section className="operations-section operations-network-section" aria-labelledby="operations-network-heading">
            <h4 id="operations-network-heading">{isItalian ? "Stato rete e applicazione" : "Network and application status"}</h4>
            <div className="operations-metrics-grid operations-network-metrics">
              <div><span>TCP</span><strong>{overview.system.network.tcp_established ?? "—"}</strong><small>{isItalian ? "stabilite" : "established"}</small></div>
              <div className={conntrackPercent === null ? "" : level(conntrackPercent, 70, 85)}><span>Conntrack</span><strong>{overview.system.conntrack.count ?? "—"}{overview.system.conntrack.max ? ` / ${overview.system.conntrack.max}` : ""}</strong></div>
              <div className={interactiveP95 === null ? "" : level(interactiveP95, 750, 1500)}>
                <span>{isItalian ? `API interattive P95 · ${interactiveWindowMinutes} min` : `Interactive API p95 · ${interactiveWindowMinutes} min`}</span>
                <strong>{interactiveP95 === null ? "—" : `${interactiveP95.toFixed(0)} ms`}</strong>
                <small>{interactiveP50 === null ? (isItalian ? "In attesa di richieste recenti" : "Waiting for recent requests") : `${isItalian ? "Mediana" : "Median"} ${interactiveP50.toFixed(0)} ms · ${overview.application.interactive_requests_recent || 0} req.`}</small>
              </div>
            </div>
            <div className="operations-summary">
              <span>{isItalian ? "Richieste" : "Requests"} <strong>{overview.application.requests_total}</strong></span>
              <span>{isItalian ? "Errori 5xx" : "5xx errors"} <strong>{overview.application.errors_total}</strong></span>
              <span>{isItalian ? "Operazioni lunghe escluse" : "Long operations excluded"} <strong>{overview.application.slow_requests_recent || 0}</strong></span>
            </div>
            <p className="operations-metric-note">{isItalian ? "La reattività considera solo API normali degli ultimi 15 minuti; AI, import ed elaborazione foto sono escluse per non falsare l'esperienza percepita." : "Responsiveness includes only normal APIs from the last 15 minutes; AI, imports and photo processing are excluded so they do not distort perceived performance."}</p>
          </section>
          <section className="operations-section operations-business-section" aria-labelledby="operations-business-heading">
            <h4 id="operations-business-heading">{isItalian ? "Dati Vinaris" : "Vinaris data"}</h4>
            <div className="operations-business-grid">
              <div>
                <span>{isItalian ? "Utenti abilitati" : "Enabled users"}</span>
                <strong>{overview.business.users_enabled}</strong>
                <small>{overview.business.users_total} {isItalian ? "totali" : "total"}{overview.business.users_blocked ? ` · ${overview.business.users_blocked} ${isItalian ? "bloccati" : "blocked"}` : ""}</small>
              </div>
              <div>
                <span>{isItalian ? "Cantine" : "Cellars"}</span>
                <strong>{overview.business.households_total}</strong>
                <small>{overview.business.households_total ? (overview.business.users_enabled / overview.business.households_total).toFixed(1) : "—"} {isItalian ? "utenti per cantina" : "users per cellar"}</small>
              </div>
              <div>
                <span>{isItalian ? "Inventario" : "Inventory"}</span>
                <strong>{overview.business.bottles_total}</strong>
                <small>{overview.business.wines_total} {isItalian ? "vini distinti" : "distinct wines"}</small>
              </div>
              <div>
                <span>{isItalian ? "Bottiglie in cantina" : "Bottles in cellar"}</span>
                <strong>{overview.business.bottles_in_cellar}</strong>
                <small>{overview.business.bottles_total ? `${Math.round((overview.business.bottles_in_cellar / overview.business.bottles_total) * 100)}%` : "—"} {isItalian ? "dell'inventario" : "of inventory"}</small>
              </div>
              <div>
                <span>{isItalian ? "Da ritirare" : "To collect"}</span>
                <strong>{overview.business.bottles_to_collect}</strong>
                <small>{isItalian ? "bottiglie" : "bottles"}</small>
              </div>
              <div>
                <span>{isItalian ? "Consegne future" : "Future deliveries"}</span>
                <strong>{overview.business.bottles_in_future_deliveries}</strong>
                <small>{isItalian ? "bottiglie attese" : "expected bottles"}</small>
              </div>
              <div>
                <span>{isItalian ? "Degustazioni · 30 giorni" : "Tastings · 30 days"}</span>
                <strong>{overview.business.tastings_30d}</strong>
                <small>{overview.business.tastings_total} {isItalian ? "storiche" : "all time"}</small>
              </div>
              <div>
                <span>Wishlist</span>
                <strong>{overview.business.wishlist_items_total}</strong>
                <small>{isItalian ? "vini desiderati" : "desired wines"}</small>
              </div>
              <div>
                <span>{isItalian ? "Azioni AI · 30 giorni" : "AI actions · 30 days"}</span>
                <strong>{overview.business.ai_requests_30d}</strong>
                <small>{successRate(overview.business.ai_successes_30d, overview.business.ai_requests_30d)} {isItalian ? "riuscite" : "successful"}</small>
              </div>
              <div>
                <span>{isItalian ? "Ricerche vino per nome · 30 giorni" : "Wine name searches · 30 days"}</span>
                <strong>{overview.business.wine_name_searches_30d}</strong>
                <small>{usd(overview.business.wine_name_search_cost_30d_usd, locale)} {isItalian ? "costo applicazione" : "application cost"}</small>
              </div>
              <div>
                <span>{isItalian ? "Fotografie bottiglia" : "Bottle photographs"}</span>
                <strong>{overview.business.wine_photos_total}</strong>
                <small>{isItalian ? "attualmente archiviate" : "currently stored"}</small>
              </div>
              <div>
                <span>{isItalian ? "Etichette · 30 giorni" : "Labels · 30 days"}</span>
                <strong>{overview.business.label_recognitions_30d}</strong>
                <small>{successRate(overview.business.label_recognition_successes_30d, overview.business.label_recognitions_30d)} {isItalian ? "riconosciute" : "recognised"}</small>
              </div>
              <div>
                <span>{isItalian ? "Comproprietà attive" : "Active co-ownerships"}</span>
                <strong>{overview.business.coownership_active}</strong>
                <small>{overview.business.coownership_pending} {isItalian ? "in attesa" : "pending"}</small>
              </div>
              <div>
                <span>{isItalian ? "Densità cantina" : "Cellar density"}</span>
                <strong>{overview.business.households_total ? (overview.business.bottles_total / overview.business.households_total).toFixed(1) : "—"}</strong>
                <small>{isItalian ? "bottiglie per cantina" : "bottles per cellar"}</small>
              </div>
            </div>
          </section>
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
          <section className="operations-section operations-activity-section" aria-labelledby="operations-activity-heading">
            <div className="operations-activity-heading">
              <div>
                <h4 id="operations-activity-heading">{isItalian ? "Attività recente degli utenti" : "Recent user activity"}</h4>
                <p>{isItalian ? "Solo azioni che modificano dati e completate con successo." : "Successful actions that modify data only."}</p>
              </div>
              <span>{activity.length}</span>
            </div>
            {activity.length ? (
              <div className="operations-activity-list">
                {activity.map((entry) => (
                  <article key={entry.id}>
                    <div>
                      <strong>{entry.user_display_name || entry.user_email}</strong>
                      <span>{activityLabel(entry.action, locale)}</span>
                    </div>
                    <time dateTime={entry.created_at}>{new Intl.DateTimeFormat(isItalian ? "it-CH" : "en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(entry.created_at))}</time>
                  </article>
                ))}
              </div>
            ) : <p className="operations-activity-empty">{isItalian ? "Nessuna attività registrata per ora." : "No activity recorded yet."}</p>}
          </section>
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
