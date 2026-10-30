import { useEffect, useState, type FormEvent } from "react";
import { api } from "../services/api";
import type { DemoEvent, EventFeature, EventLanding, Locale } from "../types";
import "./AdminEventsPanel.css";

/*
 * Events: a QR code at a venue or tasting lets guests try chosen AI features
 * on Vinaris' credit, without an account, and keep what they did as one.
 */

const endpoint = "/api/v1/admin/events";

const FEATURES: Array<{ id: EventFeature; it: string; en: string }> = [
  { id: "restaurant_wine_list", it: "Carta dei vini al ristorante", en: "Restaurant wine list" },
  { id: "dish_pairing", it: "Abbinamento a un piatto", en: "Dish pairing" },
  { id: "bottle_photo", it: "Foto di una bottiglia", en: "Bottle photo" },
  { id: "assistant", it: "Assistente", en: "Assistant" },
  { id: "buying_advice", it: "Consigli d’acquisto", en: "Buying advice" },
  { id: "wine_pulse", it: "Wine Pulse (notizie dal mondo del vino)", en: "Wine Pulse (wine news)" },
];

type Draft = {
  name: string; place: string; locale: Locale; features: EventFeature[]; landing: EventLanding;
  credit_per_visitor_usd: string; budget_usd: string; max_visitors_per_day: string; session_hours: string;
  starts_at: string; ends_at: string; is_active: boolean;
};

const emptyDraft = (locale: Locale): Draft => ({
  name: "", place: "", locale, features: ["restaurant_wine_list"], landing: "pairing-restaurant",
  credit_per_visitor_usd: "0.50", budget_usd: "0", max_visitors_per_day: "200", session_hours: "6",
  starts_at: "", ends_at: "", is_active: true,
});

function localDateTime(value: string | null) {
  if (!value) return "";
  const date = new Date(value);
  date.setMinutes(date.getMinutes() - date.getTimezoneOffset());
  return date.toISOString().slice(0, 16);
}

function draftFrom(event: DemoEvent): Draft {
  return {
    name: event.name, place: event.place, locale: event.locale, features: event.features, landing: event.landing,
    credit_per_visitor_usd: event.credit_per_visitor_usd, budget_usd: event.budget_usd,
    max_visitors_per_day: String(event.max_visitors_per_day), session_hours: String(event.session_hours),
    starts_at: localDateTime(event.starts_at), ends_at: localDateTime(event.ends_at), is_active: event.is_active,
  };
}

export default function AdminEventsPanel({ locale }: { locale: Locale }) {
  const it = locale === "it";
  const [events, setEvents] = useState<DemoEvent[]>([]);
  const [draft, setDraft] = useState<Draft>(() => emptyDraft(locale));
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  async function load() {
    try { setEvents(await api<DemoEvent[]>(endpoint)); } catch (cause) { setError(cause instanceof Error ? cause.message : (it ? "Eventi non disponibili." : "Events unavailable.")); }
  }
  useEffect(() => { void load(); }, []);

  function payload() {
    return {
      name: draft.name.trim(), place: draft.place.trim(), locale: draft.locale, features: draft.features, landing: draft.landing,
      credit_per_visitor_usd: draft.credit_per_visitor_usd, budget_usd: draft.budget_usd || "0",
      max_visitors_per_day: Number(draft.max_visitors_per_day), session_hours: Number(draft.session_hours),
      starts_at: draft.starts_at ? new Date(draft.starts_at).toISOString() : null,
      ends_at: draft.ends_at ? new Date(draft.ends_at).toISOString() : null,
      is_active: draft.is_active,
    };
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || !draft.features.length) return;
    setBusy(true); setError(""); setNotice("");
    try {
      const body = payload();
      if (editingId) {
        await api<DemoEvent>(`${endpoint}/${editingId}`, { method: "PATCH", body: JSON.stringify({ ...body, clear_dates: !body.starts_at && !body.ends_at }) });
      } else {
        await api<DemoEvent>(endpoint, { method: "POST", body: JSON.stringify(body) });
      }
      setNotice(editingId ? (it ? "Evento aggiornato." : "Event updated.") : (it ? "Evento creato: stampa il QR." : "Event created: print the QR code."));
      setFormOpen(false); setEditingId(null); setDraft(emptyDraft(locale));
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : (it ? "Salvataggio non riuscito." : "Save failed."));
    } finally { setBusy(false); }
  }

  async function patch(event: DemoEvent, changes: Record<string, unknown>) {
    setBusy(true); setError(""); setNotice("");
    try { await api<DemoEvent>(`${endpoint}/${event.id}`, { method: "PATCH", body: JSON.stringify(changes) }); await load(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : (it ? "Operazione non riuscita." : "Operation failed.")); }
    finally { setBusy(false); }
  }

  async function copy(text: string) {
    try { await navigator.clipboard.writeText(text); setNotice(it ? "Indirizzo copiato." : "Address copied."); } catch { setNotice(text); }
  }

  const money = (value: string) => `${Number(value).toLocaleString(it ? "it-CH" : "en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USD`;
  const when = (value: string | null) => value ? new Date(value).toLocaleString(it ? "it-CH" : "en-GB", { dateStyle: "medium", timeStyle: "short" }) : "—";

  return <section className="settings-card admin-events" aria-labelledby="admin-events-heading">
    <header className="admin-events-header">
      <div>
        <p className="eyebrow">{it ? "Promozione" : "Promotion"}</p>
        <h2 id="admin-events-heading">{it ? "Eventi con QR" : "QR events"}</h2>
        <p>{it
          ? "Un QR al tavolo o a una degustazione: l’ospite entra senza account, prova le funzioni AI scelte con il credito di Vinaris e può tenere quello che ha fatto come account suo."
          : "A QR code at the table or a tasting: the guest enters without an account, tries the chosen AI features on Vinaris’ credit and may keep what they did as their own account."}</p>
      </div>
      <button type="button" className="secondary" disabled={busy} onClick={() => { setEditingId(null); setDraft(emptyDraft(locale)); setFormOpen((open) => !open); }}>{formOpen && !editingId ? (it ? "Annulla" : "Cancel") : (it ? "Nuovo evento" : "New event")}</button>
    </header>
    {error ? <p role="alert">{error}</p> : null}
    {notice ? <p role="status">{notice}</p> : null}

    {formOpen ? <form className="admin-events-form" onSubmit={save}>
      <h3>{editingId ? (it ? "Modifica evento" : "Edit event") : (it ? "Nuovo evento" : "New event")}</h3>
      <div className="admin-events-grid">
        <label><span>{it ? "Nome (es. The Market)" : "Name (e.g. The Market)"}</span><input value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} required maxLength={120} /></label>
        <label><span>{it ? "Luogo (es. Lugano)" : "Place (e.g. Lugano)"}</span><input value={draft.place} onChange={(event) => setDraft({ ...draft, place: event.target.value })} maxLength={120} /></label>
        <label><span>{it ? "Lingua" : "Language"}</span><select value={draft.locale} onChange={(event) => setDraft({ ...draft, locale: event.target.value as Locale })}><option value="it">Italiano</option><option value="en">English</option></select></label>
      </div>
      <fieldset className="admin-events-features">
        <legend>{it ? "Funzioni AI offerte" : "AI features on offer"}</legend>
        {FEATURES.map((feature) => <label key={feature.id}><input type="checkbox" checked={draft.features.includes(feature.id)} onChange={(event) => setDraft({ ...draft, features: event.target.checked ? [...draft.features, feature.id] : draft.features.filter((id) => id !== feature.id) })} /><span>{feature[locale]}</span></label>)}
      </fieldset>
      <div className="admin-events-grid">
        <label><span>{it ? "Credito per ospite (USD)" : "Credit per guest (USD)"}</span><input type="number" min="0.01" max="50" step="0.01" value={draft.credit_per_visitor_usd} onChange={(event) => setDraft({ ...draft, credit_per_visitor_usd: event.target.value })} required /></label>
        <label><span>{it ? "Tetto dell’evento (USD, 0 = nessuno)" : "Event ceiling (USD, 0 = none)"}</span><input type="number" min="0" max="100000" step="0.01" value={draft.budget_usd} onChange={(event) => setDraft({ ...draft, budget_usd: event.target.value })} /></label>
        <label><span>{it ? "Ospiti al giorno (max)" : "Guests per day (max)"}</span><input type="number" min="1" max="10000" step="1" value={draft.max_visitors_per_day} onChange={(event) => setDraft({ ...draft, max_visitors_per_day: event.target.value })} required /></label>
        <label><span>{it ? "Durata della visita (ore)" : "Visit length (hours)"}</span><input type="number" min="1" max="72" step="1" value={draft.session_hours} onChange={(event) => setDraft({ ...draft, session_hours: event.target.value })} required /></label>
        <label><span>{it ? "Valido da (facoltativo)" : "Valid from (optional)"}</span><input type="datetime-local" value={draft.starts_at} onChange={(event) => setDraft({ ...draft, starts_at: event.target.value })} /></label>
        <label><span>{it ? "Valido fino a (facoltativo)" : "Valid until (optional)"}</span><input type="datetime-local" value={draft.ends_at} onChange={(event) => setDraft({ ...draft, ends_at: event.target.value })} /></label>
      </div>
      <label className="admin-events-check"><input type="checkbox" checked={draft.is_active} onChange={(event) => setDraft({ ...draft, is_active: event.target.checked })} /><span>{it ? "Attivo" : "Active"}</span></label>
      <div className="form-actions">
        <button type="button" className="secondary" disabled={busy} onClick={() => { setFormOpen(false); setEditingId(null); }}>{it ? "Annulla" : "Cancel"}</button>
        <button type="submit" disabled={busy || !draft.name.trim() || !draft.features.length}>{busy ? (it ? "Salvataggio…" : "Saving…") : (it ? "Salva evento" : "Save event")}</button>
      </div>
    </form> : null}

    {!events.length && !formOpen ? <p className="admin-events-empty">{it ? "Nessun evento ancora." : "No events yet."}</p> : null}
    <div className="admin-events-list">
      {events.map((event) => <article key={event.id} className={`admin-event${event.is_active ? "" : " is-paused"}`}>
        <div className="admin-event-qr"><img src={event.qr_url} alt={it ? `QR di ${event.name}` : `QR code for ${event.name}`} width="120" height="120" loading="lazy" /></div>
        <div className="admin-event-body">
          <h3>Vinaris at {event.name}{event.place ? ` · ${event.place}` : ""}{!event.is_active ? <em>{it ? "in pausa" : "paused"}</em> : null}</h3>
          <p className="admin-event-url"><code>{event.url}</code><button type="button" className="secondary compact" onClick={() => void copy(event.url)}>{it ? "Copia" : "Copy"}</button></p>
          <dl className="admin-event-stats">
            <div><dt>{it ? "Ospiti" : "Guests"}</dt><dd>{event.stats.visitor_count}</dd></div>
            <div><dt>{it ? "Ora in visita" : "Visiting now"}</dt><dd>{event.stats.active_visitors}</dd></div>
            <div><dt>{it ? "Account tenuti" : "Accounts kept"}</dt><dd>{event.stats.conversions}</dd></div>
            <div><dt>{it ? "Credito concesso" : "Credit granted"}</dt><dd>{money(event.stats.granted_usd)}</dd></div>
            <div><dt>{it ? "Spesa AI" : "AI spend"}</dt><dd>{money(event.stats.spent_usd)}</dd></div>
          </dl>
          <p className="admin-event-config">
            {event.features.map((id) => FEATURES.find((feature) => feature.id === id)?.[locale] ?? id).join(" · ")}
            {" — "}{money(event.credit_per_visitor_usd)}{it ? " per ospite" : " per guest"}{Number(event.budget_usd) > 0 ? `, ${it ? "tetto" : "ceiling"} ${money(event.budget_usd)}` : ""}
            {", "}{event.max_visitors_per_day}{it ? " ospiti/giorno, visita di " : " guests/day, "}{event.session_hours}h
            {event.starts_at || event.ends_at ? ` · ${when(event.starts_at)} → ${when(event.ends_at)}` : ""}
          </p>
          <div className="admin-event-actions">
            <a className="secondary compact" href={event.qr_url} download={`vinaris-${event.slug}.svg`}>{it ? "Scarica QR" : "Download QR"}</a>
            <button type="button" className="secondary compact" disabled={busy} onClick={() => { setEditingId(event.id); setDraft(draftFrom(event)); setFormOpen(true); window.scrollTo({ top: 0, behavior: "smooth" }); }}>{it ? "Modifica" : "Edit"}</button>
            <button type="button" className="secondary compact" disabled={busy} onClick={() => void patch(event, { is_active: !event.is_active })}>{event.is_active ? (it ? "Metti in pausa" : "Pause") : (it ? "Riattiva" : "Resume")}</button>
            <button type="button" className="secondary compact" disabled={busy} onClick={() => { if (window.confirm(it ? "Il QR stampato smette di funzionare. Continuare?" : "The printed QR code stops working. Continue?")) void patch(event, { rotate_slug: true }); }}>{it ? "Nuovo indirizzo" : "New address"}</button>
          </div>
        </div>
      </article>)}
    </div>
  </section>;
}
