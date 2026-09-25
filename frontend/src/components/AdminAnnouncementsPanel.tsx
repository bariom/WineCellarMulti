import { useEffect, useRef, useState } from "react";
import { api } from "../services/api";
import type { AdminAnnouncement, AnnouncementDestination, AnnouncementDraft, Locale } from "../types";
import "./AdminAnnouncementsPanel.css";

const endpoint = "/api/v1/admin/announcements";

export default function AdminAnnouncementsPanel({ locale }: { locale: Locale }) {
  const it = locale === "it";
  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");
  const [destination, setDestination] = useState<AnnouncementDestination>(null);
  const [history, setHistory] = useState<AdminAnnouncement[]>([]);
  const [count, setCount] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const sending = useRef(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [draft, setDraft] = useState<AnnouncementDraft | null>(null);
  const [attempted, setAttempted] = useState(false);

  async function load() {
    setLoading(true); setError("");
    try {
      const [audience, records] = await Promise.all([
        api<{ recipient_count: number }>(endpoint + "/audience"),
        api<AdminAnnouncement[]>(endpoint),
      ]);
      setCount(audience.recipient_count); setHistory(records);
    } catch (e) {
      setCount(null);
      setError(e instanceof Error ? e.message : (it ? "Caricamento non riuscito." : "Unable to load."));
    } finally { setLoading(false); }
  }
  useEffect(() => { void load(); }, []);

  async function preview() {
    if (sending.current) return;
    sending.current = true; setBusy(true); setError(""); setNotice("");
    try {
      const audience = await api<{ recipient_count: number }>(endpoint + "/audience");
      setCount(audience.recipient_count);
      if (!audience.recipient_count) throw new Error(it ? "Nessun destinatario disponibile." : "No eligible recipients.");
      setDraft({ id: crypto.randomUUID(), title: title.trim(), message: message.trim(), action_url: destination, confirm: true });
      setAttempted(false);
    } catch (e) { setError(e instanceof Error ? e.message : "Unable to prepare announcement."); }
    finally { sending.current = false; setBusy(false); }
  }

  async function send() {
    if (!draft || sending.current) return;
    sending.current = true; setBusy(true); setError(""); setAttempted(true);
    try {
      // Preserve this exact identifier/payload for retries after ambiguous network failures.
      const sent = await api<AdminAnnouncement>(endpoint, { method: "POST", body: JSON.stringify(draft) });
      setHistory(current => [sent, ...current.filter(row => row.id !== sent.id)].slice(0, 50));
      setNotice(it ? `Comunicazione inviata a ${sent.recipient_count} utenti.` : `Announcement sent to ${sent.recipient_count} users.`);
      setDraft(null); setTitle(""); setMessage(""); setDestination(null); setAttempted(false);
    } catch (e) {
      const detail = e instanceof Error ? e.message : "";
      setError((it ? "Invio non confermato. Riprova: lo stesso invio non verrà duplicato. " : "Send not confirmed. Retry: this send will not be duplicated. ") + detail);
    } finally { sending.current = false; setBusy(false); }
  }

  return <section className="settings-card admin-announcements" aria-labelledby="announcements-heading">
    <div className="settings-card-heading"><div>
      <span>{it ? "Amministrazione" : "Administration"}</span>
      <h3 id="announcements-heading">{it ? "Comunicazioni agli utenti" : "User announcements"}</h3>
    </div></div>
    <p>{it ? "Invia un annuncio nel centro notifiche di tutti gli utenti approvati e non bloccati con una cantina reale, inclusi gli account gratuiti. Nessuna email o push del browser." : "Send an in-app notification to all approved, unblocked users with a real cellar, including free accounts. No email or browser push."}</p>
    <p className="announcement-audience">{loading ? (it ? "Caricamento…" : "Loading…") : count === null ? "—" : (it ? `${count} destinatari attuali · una notifica per utente, anche con più cantine` : `${count} current recipients · one notification per user, even with multiple cellars`)}</p>
    {error && <div role="alert">{error}</div>}
    {notice && <p role="status">{notice}</p>}
    {count === null && !loading && <button type="button" className="secondary" onClick={() => void load()}>{it ? "Riprova caricamento" : "Retry loading"}</button>}
    <form onSubmit={event => { event.preventDefault(); void preview(); }}>
      <fieldset disabled={loading || busy || !!draft}>
        {!title && !message && <button type="button" className="secondary" onClick={() => {
          setTitle(it ? "Vinaris si rinnova" : "A fresh look for Vinaris");
          setMessage(it
            ? "La tua cantina ha una nuova veste: una Home ridisegnata, dashboard più coerenti e un’intestazione rinnovata nelle diverse sezioni.\n\nI tuoi vini e i tuoi dati restano invariati. Apri la Home e scopri il nuovo look di Vinaris."
            : "Your cellar has a fresh look: a redesigned Home, more consistent dashboards and a refreshed header across the app.\n\nYour wines and data remain unchanged. Open Home and discover the new Vinaris.");
          setDestination("/home");
        }}>{it ? "Prepara annuncio nuova grafica" : "Prepare redesign announcement"}</button>}
        <div className="announcement-field"><label htmlFor="announcement-title">{it ? "Titolo" : "Title"}</label><input id="announcement-title" value={title} maxLength={180} required onChange={event => setTitle(event.target.value)} /></div>
        <div className="announcement-field"><label htmlFor="announcement-message">{it ? "Messaggio" : "Message"}</label><textarea id="announcement-message" value={message} maxLength={4000} rows={6} required onChange={event => setMessage(event.target.value)} /></div>
        <small>{message.length}/4000 · {it ? "Testo semplice, senza HTML. Il testo viene inviato nella lingua in cui lo scrivi." : "Plain text, no HTML. The message is sent in the language you write it."}</small>
        <div className="announcement-field"><label htmlFor="announcement-destination">{it ? "Apri dall’annuncio" : "Open from announcement"}</label><select id="announcement-destination" value={destination || ""} onChange={event => setDestination((event.target.value || null) as AnnouncementDestination)}>
          <option value="">{it ? "Nessun collegamento" : "No link"}</option>
          <option value="/home">Home</option>
          <option value="/cellar">{it ? "Cantina" : "Cellar"}</option>
          <option value="/pulse">Wine Pulse</option>
        </select></div>
        <button type="submit" disabled={!title.trim() || !message.trim() || !count}>{it ? "Anteprima invio" : "Preview send"}</button>
      </fieldset>
    </form>
    {draft && <section className="announcement-preview" aria-label={it ? "Anteprima comunicazione" : "Announcement preview"}>
      <h4>{it ? "Anteprima" : "Preview"}</h4>
      <strong>{draft.title}</strong><p className="announcement-message">{draft.message}</p>
      {draft.action_url && <small>{it ? "Destinazione" : "Destination"}: {draft.action_url}</small>}
      <p>{it ? `Confermi l’invio a tutti gli utenti idonei (attualmente ${count})? L’annuncio sarà subito disponibile nella campanella e non potrà essere ritirato da qui.` : `Send to all eligible users (currently ${count})? The announcement will be available in their notification centre immediately and cannot be withdrawn here.`}</p>
      <div className="announcement-actions">
        <button type="button" className="secondary" disabled={busy || attempted} onClick={() => setDraft(null)}>{it ? "Modifica" : "Edit"}</button>
        <button type="button" disabled={busy} onClick={() => void send()}>{busy ? (it ? "Invio…" : "Sending…") : attempted ? (it ? "Riprova invio" : "Retry send") : (it ? "Conferma e invia a tutti" : "Confirm and send to everyone")}</button>
      </div>
    </section>}
    <section className="announcement-history" aria-label={it ? "Storico comunicazioni" : "Announcement history"}>
      <h4>{it ? "Ultimi 50 invii" : "Last 50 sends"}</h4>
      {!loading && !history.length && <p>{it ? "Nessuna comunicazione inviata." : "No announcements sent."}</p>}
      {history.map(row => <article key={row.id}>
        <strong>{row.title}</strong>
        <small>{new Date(row.created_at).toLocaleString(it ? "it-CH" : "en-GB")} · {row.recipient_count} {it ? "destinatari" : "recipients"}</small>
        <p className="announcement-message">{row.message}</p>
      </article>)}
    </section>
  </section>;
}
