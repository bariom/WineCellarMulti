import { lazy, Suspense, useEffect, useState } from "react";
import type { Locale, OperationalMetricsOverview, UserActivityLogEntry } from "../types";
import { LoadingState } from "./AppUi";
import { api } from "../services/api";
import "./OperationsPanel.css";

type OperationsPanelProps = {
  locale: Locale;
  overview: OperationalMetricsOverview | null;
  activity: UserActivityLogEntry[];
  onRefresh: () => void | Promise<void>;
};

type MonitorDeviceToken = { id: string; label: string; created_at: string; last_used_at: string | null; revoked_at: string | null };
type AiPricing = { price_book: Record<string, Record<string, string>>; custom_price_book_json: string; updated_at: string | null };
type VineyardCandidate = {
  wine_id: string;
  name: string;
  producer: string;
  vintage: string;
  region: string;
  appellation: string;
  vineyard_name: string;
  locality: string;
  country: string;
  latitude: number | null;
  longitude: number | null;
  precision: string;
  source_url: string;
  source_title: string;
  notes: string;
};
type VineyardPrecisionCounts = { vineyard: number; manual: number; estate: number; locality: number; appellation: number };
type VineyardQueue = { total: number; located: number; precision_counts: VineyardPrecisionCounts; not_found: number; pending: number; filtered: number; limit: number; offset: number; candidates: VineyardCandidate[] };
type VineyardResearchResult = {
  status: "found" | "not_found";
  updated_wines: number;
  wine_id: string;
  vineyard_name: string;
  locality: string;
  country: string;
  latitude: number | null;
  longitude: number | null;
  precision: string;
  source_url: string;
  source_title: string;
  notes: string;
};
type VineyardFeedback = VineyardResearchResult & Pick<VineyardCandidate, "name" | "producer" | "vintage"> & { mode: "research" | "manual" };
const VineyardLocationEditor = lazy(() => import("./VineyardLocationEditor"));
const VINEYARD_PAGE_SIZE = 8;

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

function isPreciseVineyardPrecision(precision: string) {
  return precision === "manual" || precision === "vineyard";
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

export function OperationsPanel({ locale, overview, activity, onRefresh }: OperationsPanelProps) {
  const isItalian = locale === "it";
  const [monitorToken, setMonitorToken] = useState("");
  const [monitorTokenError, setMonitorTokenError] = useState("");
  const [monitorTokens, setMonitorTokens] = useState<MonitorDeviceToken[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [aiPricingDraft, setAiPricingDraft] = useState("");
  const [aiPricingUpdatedAt, setAiPricingUpdatedAt] = useState<string | null>(null);
  const [aiPricingBusy, setAiPricingBusy] = useState<"refresh" | "save" | "" >("");
  const [aiPricingError, setAiPricingError] = useState("");
  const [vineyardQueue, setVineyardQueue] = useState<VineyardQueue | null>(null);
  const [vineyardBusy, setVineyardBusy] = useState("");
  const [vineyardProgress, setVineyardProgress] = useState("");
  const [vineyardError, setVineyardError] = useState("");
  const [vineyardSearchDraft, setVineyardSearchDraft] = useState("");
  const [vineyardQuery, setVineyardQuery] = useState("");
  const [vineyardPage, setVineyardPage] = useState(0);
  const [vineyardFeedback, setVineyardFeedback] = useState<VineyardFeedback | null>(null);

  async function refreshMonitorTokens() {
    try {
      setMonitorTokens(await api<MonitorDeviceToken[]>("/api/v1/admin/operations/device-tokens"));
    } catch {
      setMonitorTokenError(isItalian ? "Impossibile caricare i token Monitor." : "Unable to load Monitor tokens.");
    }
  }

  async function refreshOperations() {
    setRefreshing(true);
    try {
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

  async function loadVineyardQueue(page = vineyardPage, query = vineyardQuery) {
    try {
      const params = new URLSearchParams({
        limit: String(VINEYARD_PAGE_SIZE),
        offset: String(page * VINEYARD_PAGE_SIZE),
      });
      if (query) params.set("q", query);
      const queue = await api<VineyardQueue>(`/api/v1/admin/operations/vineyards?${params}`);
      if (page > 0 && queue.candidates.length === 0) {
        setVineyardPage(Math.max(Math.ceil(queue.filtered / VINEYARD_PAGE_SIZE) - 1, 0));
        return;
      }
      setVineyardQueue(queue);
      setVineyardError("");
    } catch (error) {
      setVineyardError(error instanceof Error ? error.message : (isItalian ? "Impossibile caricare la copertura dei vigneti." : "Unable to load vineyard coverage."));
    }
  }

  useEffect(() => { void loadVineyardQueue(vineyardPage, vineyardQuery); }, [vineyardPage, vineyardQuery]);

  async function researchVineyard(candidate: VineyardCandidate) {
    setVineyardBusy(candidate.wine_id);
    try {
      const result = await api<VineyardResearchResult>(`/api/v1/admin/operations/vineyards/${candidate.wine_id}/research?locale=${locale}`, { method: "POST" });
      setVineyardFeedback({ ...result, name: candidate.name, producer: candidate.producer, vintage: candidate.vintage, mode: "research" });
      await loadVineyardQueue();
    } catch (error) {
      setVineyardError(error instanceof Error ? error.message : (isItalian ? "Ricerca del vigneto non riuscita." : "Vineyard research failed."));
    } finally {
      setVineyardBusy("");
    }
  }

  function openManualVineyardLocation(candidate: VineyardCandidate) {
    setVineyardFeedback({
      ...candidate,
      status: candidate.latitude !== null && candidate.longitude !== null ? "found" : "not_found",
      updated_wines: 0,
      mode: "manual",
    });
  }

  async function saveManualVineyardLocation(latitude: number, longitude: number) {
    if (!vineyardFeedback) return;
    const saved = await api<VineyardResearchResult>(`/api/v1/admin/operations/vineyards/${vineyardFeedback.wine_id}/location`, {
      method: "PUT",
      body: JSON.stringify({ latitude, longitude }),
    });
    setVineyardFeedback((current) => current ? { ...current, ...saved } : current);
    await loadVineyardQueue();
  }

  async function researchAllVineyards() {
    if (!vineyardQueue?.pending) return;
    const confirmed = window.confirm(isItalian
      ? `Avviare fino a ${vineyardQueue.pending} ricerche AI? Il costo sarà sostenuto da Vinaris.`
      : `Run up to ${vineyardQueue.pending} AI searches? Vinaris will fund the cost.`);
    if (!confirmed) return;
    setVineyardBusy("all");
    setVineyardError("");
    const total = vineyardQueue.pending;
    let processed = 0;
    let stopped = false;
    while (!stopped) {
      let batch: VineyardQueue;
      try {
        batch = await api<VineyardQueue>("/api/v1/admin/operations/vineyards?limit=100&offset=0");
      } catch (error) {
        setVineyardError(error instanceof Error ? error.message : (isItalian ? "Impossibile aggiornare la coda dei vigneti." : "Unable to refresh the vineyard queue."));
        break;
      }
      if (!batch.candidates.length) break;
      for (const candidate of batch.candidates) {
        setVineyardProgress(`${processed + 1}/${total} · ${candidate.name}`);
        try {
          await api(`/api/v1/admin/operations/vineyards/${candidate.wine_id}/research?locale=${locale}`, { method: "POST" });
          processed += 1;
        } catch (error) {
          setVineyardError(error instanceof Error ? error.message : (isItalian ? `Ricerca interrotta su ${candidate.name}.` : `Research stopped on ${candidate.name}.`));
          stopped = true;
          break;
        }
      }
    }
    await loadVineyardQueue();
    setVineyardBusy("");
    setVineyardProgress("");
  }

  async function refreshOfficialPricing() {
    setAiPricingBusy("refresh");
    try {
      const result = await api<{ price_book_json: string }>("/api/v1/admin/operations/ai-pricing/refresh-official", { method: "POST" });
      setAiPricingDraft(JSON.stringify(JSON.parse(result.price_book_json), null, 2));
      setAiPricingError("");
    } catch (error) {
      setAiPricingError(error instanceof Error ? error.message : (isItalian ? "Impossibile aggiornare dal listino ufficiale." : "Unable to refresh from the official price list."));
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
  const vineyardPageCount = Math.max(Math.ceil((vineyardQueue?.filtered || 0) / VINEYARD_PAGE_SIZE), 1);
  const vineyardFirstResult = vineyardQueue?.filtered ? vineyardPage * VINEYARD_PAGE_SIZE + 1 : 0;
  const vineyardLastResult = vineyardQueue ? Math.min((vineyardPage + 1) * VINEYARD_PAGE_SIZE, vineyardQueue.filtered) : 0;

  return (
    <section className="settings-card operations-card">
      <div className="settings-card-heading">
        <div>
          <span>{isItalian ? "Amministrazione applicazione" : "Application administration"}</span>
          <h3>{isItalian ? "Operatività Vinaris" : "Vinaris operations"}</h3>
        </div>
        <button type="button" className="secondary compact" disabled={refreshing} onClick={() => void refreshOperations()}>
          {refreshing ? (isItalian ? "Raccolgo…" : "Collecting…") : (isItalian ? "Aggiorna" : "Refresh")}
        </button>
      </div>
      <p className="settings-help-copy">
        {isItalian ? "Strumenti amministrativi e dati aggregati riservati all'app-admin." : "Administrative tools and aggregate data restricted to the app admin."}
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
            <small>{isItalian ? "USD per un milione di token, elaborazione standard. I valori arrivano dal listino ufficiale e richiedono comunque il tuo salvataggio." : "USD per one million tokens, standard processing. Values come from the official price list and still require your save."}</small>
          </div>
          <div>
            <button type="button" className="secondary compact" disabled={Boolean(aiPricingBusy)} onClick={() => void refreshOfficialPricing()}>
              {aiPricingBusy === "refresh" ? (isItalian ? "Aggiorno…" : "Refreshing…") : (isItalian ? "Aggiorna dal listino ufficiale" : "Refresh from official price list")}
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
      <section className="operations-vineyards" aria-label={isItalian ? "Origine geografica dei vini" : "Wine geographic origin"}>
        <div className="operations-vineyards-heading">
          <div>
            <strong>{isItalian ? "Vigneti e luoghi di provenienza" : "Vineyards and places of origin"}</strong>
            <small>{isItalian ? "Ricerca amministrativa con AI e fonti web. Il costo è interamente a carico di Vinaris." : "Administrative AI and web research. The cost is entirely funded by Vinaris."}</small>
          </div>
          <button type="button" className="secondary compact" disabled={Boolean(vineyardBusy) || !vineyardQueue?.pending} onClick={() => void researchAllVineyards()}>
            {vineyardBusy === "all" ? (isItalian ? "Ricerca in corso…" : "Researching…") : (isItalian ? "Cerca tutti" : "Research all")}
          </button>
        </div>
        {vineyardQueue ? (
          <div className="operations-vineyards-metrics">
            <div className="operations-vineyards-summary">
              <span><strong>{vineyardQueue.located}</strong>{isItalian ? " localizzati" : " located"}</span>
              <span><strong>{vineyardQueue.pending}</strong>{isItalian ? " da ricercare" : " to research"}</span>
              <span><strong>{vineyardQueue.not_found}</strong>{isItalian ? " senza fonte affidabile" : " without reliable evidence"}</span>
            </div>
            <small>{isItalian ? "Precisione delle coordinate" : "Coordinate precision"}</small>
            <div className="operations-vineyards-summary precision">
              <span className="precise"><strong>{vineyardQueue.precision_counts.vineyard}</strong>{isItalian ? " vigneti precisi AI" : " precise AI vineyards"}</span>
              <span className="precise"><strong>{vineyardQueue.precision_counts.manual}</strong>{isItalian ? " punti precisi manuali" : " precise manual points"}</span>
              <span><strong>{vineyardQueue.precision_counts.estate}</strong>{isItalian ? " tenute" : " estates"}</span>
              <span><strong>{vineyardQueue.precision_counts.locality}</strong>{isItalian ? " località approssimative" : " approximate localities"}</span>
              <span><strong>{vineyardQueue.precision_counts.appellation}</strong>{isItalian ? " centri denominazione" : " appellation centres"}</span>
            </div>
          </div>
        ) : <LoadingState label={isItalian ? "Carico i vini" : "Loading wines"} compact />}
        <form className="operations-vineyards-search" onSubmit={(event) => { event.preventDefault(); setVineyardPage(0); setVineyardQuery(vineyardSearchDraft.trim()); }}>
          <input
            type="search"
            value={vineyardSearchDraft}
            onChange={(event) => setVineyardSearchDraft(event.target.value)}
            placeholder={isItalian ? "Cerca vino, produttore, annata o regione" : "Search wine, producer, vintage or region"}
            aria-label={isItalian ? "Cerca nella coda dei vigneti" : "Search the vineyard queue"}
          />
          <button type="submit" className="secondary compact">{isItalian ? "Cerca" : "Search"}</button>
          {vineyardQuery ? <button type="button" className="secondary compact" onClick={() => { setVineyardSearchDraft(""); setVineyardQuery(""); setVineyardPage(0); }}>{isItalian ? "Azzera" : "Clear"}</button> : null}
        </form>
        {vineyardProgress ? <p className="operations-vineyards-progress">{vineyardProgress}</p> : null}
        {vineyardQueue?.candidates.length ? (
          <div className="operations-vineyards-list">
            {vineyardQueue.candidates.map((candidate) => (
              <article key={candidate.wine_id}>
                <span>
                  <strong>{candidate.name} {candidate.vintage}</strong>
                  <small>{[candidate.producer, candidate.appellation || candidate.region].filter(Boolean).join(" · ")}</small>
                  {isPreciseVineyardPrecision(candidate.precision) ? <em className="operations-vineyard-precise">◎ {isItalian ? "Posizione precisa" : "Precise location"}</em> : null}
                </span>
                <div className="operations-vineyard-actions">
                  <button type="button" className="secondary compact" disabled={Boolean(vineyardBusy)} onClick={() => openManualVineyardLocation(candidate)}>
                    {candidate.latitude !== null && candidate.longitude !== null
                      ? (isItalian ? "Modifica punto" : "Edit point")
                      : (isItalian ? "Imposta punto" : "Set point")}
                  </button>
                  <button type="button" className="secondary compact" disabled={Boolean(vineyardBusy)} onClick={() => void researchVineyard(candidate)}>
                    {vineyardBusy === candidate.wine_id ? (isItalian ? "Cerco…" : "Searching…") : (isItalian ? "Cerca con AI" : "Research with AI")}
                  </button>
                </div>
              </article>
            ))}
          </div>
        ) : vineyardQueue ? <small>{vineyardQuery ? (isItalian ? "Nessun vino corrisponde alla ricerca." : "No wines match this search.") : (isItalian ? "Tutti i vini sono stati esaminati." : "All wines have been reviewed.")}</small> : null}
        {vineyardFeedback ? (
          <section className="operations-vineyard-feedback" aria-label={isItalian ? "Risultato della ricerca geografica" : "Geographic research result"}>
            <header>
              <div>
                <span>{vineyardFeedback.mode === "manual"
                  ? (isItalian ? "POSIZIONE MANUALE" : "MANUAL POSITION")
                  : (isItalian ? "RISULTATO RICERCA" : "RESEARCH RESULT")}</span>
                <strong>{vineyardFeedback.name}{vineyardFeedback.vintage ? ` · ${vineyardFeedback.vintage}` : ""}</strong>
                <small>{[vineyardFeedback.vineyard_name || vineyardFeedback.producer, vineyardFeedback.locality, vineyardFeedback.country].filter(Boolean).join(" · ")}</small>
              </div>
              <div>
                <span className={`status-pill ${vineyardFeedback.status === "found" ? "configured" : ""}`}>
                  {vineyardFeedback.status === "found"
                    ? (isPreciseVineyardPrecision(vineyardFeedback.precision)
                      ? (isItalian ? "Posizione precisa" : "Precise location")
                      : (isItalian ? "Punto trovato" : "Point found"))
                    : (isItalian ? "Da posizionare" : "Needs positioning")}
                </span>
                <button type="button" className="secondary compact" onClick={() => setVineyardFeedback(null)} aria-label={isItalian ? "Chiudi risultato" : "Close result"}>×</button>
              </div>
            </header>
            {vineyardFeedback.notes ? <p>{vineyardFeedback.notes}</p> : null}
            {vineyardFeedback.source_url ? (
              <a href={vineyardFeedback.source_url} target="_blank" rel="noreferrer">
                {isItalian ? "Fonte dell'origine" : "Origin source"}{vineyardFeedback.source_title ? `: ${vineyardFeedback.source_title}` : ""}
              </a>
            ) : null}
            <Suspense fallback={<LoadingState label={isItalian ? "Carico la mappa" : "Loading map"} compact />}>
              <VineyardLocationEditor
                locale={locale}
                label={vineyardFeedback.vineyard_name || vineyardFeedback.producer || vineyardFeedback.name}
                latitude={vineyardFeedback.latitude}
                longitude={vineyardFeedback.longitude}
                onSave={saveManualVineyardLocation}
              />
            </Suspense>
          </section>
        ) : null}
        {vineyardQueue && vineyardQueue.filtered > 0 ? (
          <nav className="operations-vineyards-pagination" aria-label={isItalian ? "Pagine della coda vigneti" : "Vineyard queue pages"}>
            <span>{vineyardFirstResult}–{vineyardLastResult} {isItalian ? "di" : "of"} {vineyardQueue.filtered}</span>
            <div>
              <button type="button" className="secondary compact" disabled={vineyardPage === 0 || Boolean(vineyardBusy)} onClick={() => setVineyardPage((page) => Math.max(page - 1, 0))}>{isItalian ? "Precedente" : "Previous"}</button>
              <strong>{vineyardPage + 1}/{vineyardPageCount}</strong>
              <button type="button" className="secondary compact" disabled={vineyardPage + 1 >= vineyardPageCount || Boolean(vineyardBusy)} onClick={() => setVineyardPage((page) => page + 1)}>{isItalian ? "Successiva" : "Next"}</button>
            </div>
          </nav>
        ) : null}
        {vineyardError ? <p role="alert">{vineyardError}</p> : null}
      </section>
      {overview ? (
        <>
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
        </>
      ) : <LoadingState label={isItalian ? "Caricamento dati…" : "Loading data…"} />}
    </section>
  );
}
